import { useId, useState } from "react";
import { Icon } from "./Icons.jsx";
import { number } from "./ui.jsx";
import { buildPublishDateSeries } from "./analyticsOverview.js";

const label = at => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(at);
const compact = value => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);

export default function PublicationChart({ overview, metric, grain }) {
  const [hovered, setHovered] = useState(null);
  const gradientId = useId();
  const points = buildPublishDateSeries(overview, metric, grain);
  const measured = overview.current.filter(record => record.delivery.platform !== "youtube" && record.day !== null).some(record => Number.isFinite(record.delivery.metrics?.[metric]));
  if (!measured) return <div className="bridge-chart-empty"><Icon name="analytics" size={25}/><strong>No {metric} available for this period</strong><p>Sync analytics or choose another platform or date range.</p></div>;
  const width = 1000, height = 310, left = 52, right = 14, top = 18, bottom = 44, plotWidth = width - left - right, plotHeight = height - top - bottom;
  const max = Math.max(1, ...points.map(point => point.value || 0)) * 1.1;
  const maxCount = Math.max(1, ...points.map(point => point.count));
  const x = index => left + (index + .5) / points.length * plotWidth;
  const y = value => top + plotHeight - value / max * plotHeight;
  const barWidth = Math.min(22, plotWidth / points.length * .4);
  const every = Math.max(1, Math.ceil(points.length / 12));
  const segments = [];
  for (const [index, point] of points.entries()) {
    if (point.value === null) { if (segments.at(-1)?.length) segments.push([]); }
    else { if (!segments.length) segments.push([]); segments.at(-1).push([x(index), y(point.value)]); }
  }
  const active = points[hovered];
  return <div className="bridge-publish-chart">
    <div className="bridge-publish-chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Lifetime ${metric} of posts grouped by ${grain === "week" ? "publish week" : "publish date"}. Grey bars show posts published.`}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--b-blue)" stopOpacity=".2"/><stop offset="1" stopColor="var(--b-blue)" stopOpacity=".01"/></linearGradient></defs>
      {[0, .25, .5, .75, 1].map(portion => <g key={portion}><line className="bridge-chart-grid" x1={left} x2={width - right} y1={top + plotHeight * portion} y2={top + plotHeight * portion}/><text className="bridge-chart-axis" x={left - 10} y={top + plotHeight * portion + 4} textAnchor="end">{compact(max * (1 - portion))}</text></g>)}
      {points.map((point, index) => <g key={point.at}><rect className="bridge-publish-count" x={x(index) - barWidth / 2} y={top + plotHeight - point.count / maxCount * 72} width={barWidth} height={point.count / maxCount * 72} rx="3"/>{(index % every === 0 || index === points.length - 1) && <text className="bridge-chart-axis" x={x(index)} y={height - 17} textAnchor="middle">{label(point.at)}</text>}</g>)}
      {segments.filter(segment => segment.length).map((segment, index) => <g key={index}><polygon points={`${segment[0][0]},${top + plotHeight} ${segment.map(point => point.join(",")).join(" ")} ${segment.at(-1)[0]},${top + plotHeight}`} fill={`url(#${gradientId})`}/><polyline points={segment.map(point => point.join(",")).join(" ")} fill="none" stroke="var(--b-blue)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round"/>{segment.length === 1 && <circle cx={segment[0][0]} cy={segment[0][1]} r="3" fill="var(--b-blue)"/>}</g>)}
      {active && <line className="bridge-chart-cursor" x1={x(hovered)} x2={x(hovered)} y1={top} y2={top + plotHeight}/>}
      {points.map((point, index) => <rect key={point.at} x={x(index) - plotWidth / points.length / 2} y={top} width={plotWidth / points.length} height={plotHeight} fill="transparent" tabIndex="0" role="button" aria-label={`${label(point.at)}: ${number(point.value)} ${metric}, ${point.count} posts published`} onPointerEnter={() => setHovered(index)} onPointerLeave={() => setHovered(null)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)}/>)}
    </svg></div>
    {active && <div className="bridge-chart-tooltip bridge-publish-tooltip"><strong>{label(active.at)}{grain === "week" ? " · Week starting" : ""}</strong><span>{number(active.value)} {metric}</span><span>{active.count} {active.count === 1 ? "post" : "posts"} published</span>{active.available < active.count && <small>Some posts have no reported {metric}.</small>}</div>}
    <p className="bridge-publish-chart-note">Grey bars: posts published. Line: their current lifetime {metric}.{overview.start === null && overview.current.some(record => record.day !== null && record.day < overview.end - 366 * 86400000) && " Chart shows the most recent year; totals include all available posts."}</p>
  </div>;
}
