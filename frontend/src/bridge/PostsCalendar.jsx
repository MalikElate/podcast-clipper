import { useMemo, useState } from "react";
import { Icon } from "./Icons.jsx";
import { Alert, useProjectResource } from "./ui.jsx";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function zonedParts(value, timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
}

function dateKey(value, timeZone) {
  const { year, month, day } = zonedParts(value, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function eventTime(value, timeZone) {
  return new Intl.DateTimeFormat(undefined, { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function monthLabel(year, month) {
  return new Intl.DateTimeFormat(undefined, { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function moveMonth(current, amount) {
  const date = new Date(Date.UTC(current.year, current.month - 1 + amount, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function calendarDateLabel(year, month, day) {
  return new Intl.DateTimeFormat(undefined, { timeZone: "UTC", dateStyle: "long" }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default function PostsCalendar({ project, onCreate }) {
  const { data, error, loading } = useProjectResource(project.id, "/posts", { posts: [] }, { interval: 15000 });
  const today = zonedParts(Date.now(), project.timeZone);
  const [visibleMonth, setVisibleMonth] = useState({ year: today.year, month: today.month });
  const events = useMemo(() => {
    const grouped = new Map();
    data.posts.forEach(post => post.deliveries.forEach(delivery => {
      const at = delivery.status === "published" ? delivery.publishedAt : delivery.dueAt;
      if (!at) return;
      const key = dateKey(at, project.timeZone);
      const item = { id: delivery.id, at, status: delivery.status, platform: delivery.platform, title: post.title || post.caption || post.media[0]?.filename || "Media post" };
      grouped.set(key, [...(grouped.get(key) || []), item]);
    }));
    grouped.forEach(items => items.sort((a, b) => a.at - b.at));
    return grouped;
  }, [data.posts, project.timeZone]);
  const days = new Date(Date.UTC(visibleMonth.year, visibleMonth.month, 0)).getUTCDate();
  const leading = (new Date(Date.UTC(visibleMonth.year, visibleMonth.month - 1, 1)).getUTCDay() + 6) % 7;
  const cells = [...Array(leading).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  return <>
    <div className="bridge-intro-row"><p>See every scheduled and published delivery in one monthly view.</p><button className="bridge-button" onClick={() => onCreate("")}><Icon name="plus" size={17}/> Create post</button></div>
    <Alert message={error}/>
    <div className="bridge-calendar-toolbar"><div><button className="bridge-icon-button" aria-label="Previous month" onClick={() => setVisibleMonth(current => moveMonth(current, -1))}><Icon name="chevronLeft" size={18}/></button><button className="bridge-icon-button" aria-label="Next month" onClick={() => setVisibleMonth(current => moveMonth(current, 1))}><Icon name="chevronRight" size={18}/></button><button className="bridge-button secondary small" onClick={() => setVisibleMonth({ year: today.year, month: today.month })}>Today</button></div><h2>{monthLabel(visibleMonth.year, visibleMonth.month)}</h2><span className="bridge-small">{loading ? "Loading posts…" : `${data.posts.length} ${data.posts.length === 1 ? "post" : "posts"}`}</span></div>
    <div className="bridge-calendar bridge-panel" role="grid" aria-label={`${monthLabel(visibleMonth.year, visibleMonth.month)} post calendar`}>
      {weekdays.map(day => <div className="bridge-calendar-weekday" role="columnheader" key={day}>{day}</div>)}
      {cells.map((day, index) => {
        if (!day) return <div className="bridge-calendar-day outside" role="gridcell" key={`blank-${index}`}/>;
        const key = `${visibleMonth.year}-${String(visibleMonth.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const items = events.get(key) || [], isToday = key === dateKey(Date.now(), project.timeZone), canCreate = key >= dateKey(Date.now(), project.timeZone);
        const content = <><span className="bridge-calendar-day-head"><span className="bridge-calendar-date">{day}</span>{canCreate && <span className="bridge-calendar-add" aria-hidden="true"><Icon name="plus" size={14}/></span>}</span><span className="bridge-calendar-events">{items.slice(0, 3).map(item => <span className={`bridge-calendar-event ${item.status}`} title={`${item.title} · ${eventTime(item.at, project.timeZone)}`} key={item.id}><span>{eventTime(item.at, project.timeZone)}</span><strong>{item.title}</strong></span>)}{items.length > 3 && <span className="bridge-calendar-more">+{items.length - 3} more</span>}</span></>;
        return canCreate ? <button type="button" className={`bridge-calendar-day create ${isToday ? "today" : ""}`} role="gridcell" aria-label={`Create post for ${calendarDateLabel(visibleMonth.year, visibleMonth.month, day)}`} onClick={() => onCreate(key)} key={key}>{content}</button> : <div className="bridge-calendar-day past" role="gridcell" key={key}>{content}</div>;
      })}
    </div>
  </>;
}
