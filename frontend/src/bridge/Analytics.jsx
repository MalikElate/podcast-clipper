import { useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Badge, dateTime, Empty, number, PlatformBadge, PlatformIcon, Modal, useProjectResource } from "./ui.jsx";

import { buildAnalyticsOverview, summarizeAnalytics } from "./analyticsOverview.js";
import PublicationChart from "./PublicationChart.jsx";
import "./analytics.css";

const DAY = 86400000;
const metrics = ["engagement", "views", "impressions", "likes", "comments", "shares", "saves", "clicks"];
const labels = { engagement: "Engagement", views: "Views", impressions: "Impressions", likes: "Likes", comments: "Comments", shares: "Shares", saves: "Saves", clicks: "Clicks" };
const chartColors = ["#5f86f7", "#16a6a1", "#e15188", "#9b6de3", "#e2a93b"];
const platformName = (platform, catalog) => catalog.find(item => item.id === platform)?.name || platform;
const accountLabel = (account, catalog) => `${platformName(account.platform, catalog)} · ${account.label || account.accountName}`;
const published = delivery => delivery.status === "published";
const sumMetrics = values => {
  const interactions = ["likes", "comments", "shares", "saves"].map(key => values?.[key]).filter(Number.isFinite);
  return { ...values, engagement: interactions.length ? interactions.reduce((a, b) => a + b, 0) : null };
};
const aggregateValues = (rows, deriveEngagement = true) => {
  const values = Object.fromEntries(metrics.filter(metric => metric !== "engagement").map(metric => {
    const available = rows.map(row => row?.[metric]).filter(Number.isFinite);
    return [metric, available.length ? available.reduce((sum, value) => sum + value, 0) : null];
  }));
  return deriveEngagement ? sumMetrics(values) : { ...values, engagement: null };
};
const deliverySnapshots = delivery => {
  const deriveEngagement = delivery.platform !== "youtube";
  const snapshots = Array.isArray(delivery.metricsHistory) ? [...delivery.metricsHistory] : [];
  if (delivery.metrics && delivery.metricsUpdatedAt) snapshots.push({ at: delivery.metricsUpdatedAt, values: delivery.metrics });
  const byTime = new Map();
  for (const snapshot of snapshots) {
    const at = Number(snapshot?.at);
    if (Number.isFinite(at) && snapshot?.values) byTime.set(at, { at, values: deriveEngagement ? sumMetrics(snapshot.values) : { ...snapshot.values, engagement: null } });
  }
  return [...byTime.values()].sort((a, b) => a.at - b.at);
};

export function aggregateDeliveryHistory(deliveries, { excludeYoutube = false, deriveEngagement = true } = {}) {
  const histories = deliveries.filter(delivery => !excludeYoutube || delivery.platform !== "youtube").map(deliverySnapshots).filter(history => history.length);
  const times = [...new Set(histories.flatMap(history => history.map(snapshot => snapshot.at)))].sort((a, b) => a - b);
  return times.map(at => ({ at, values: aggregateValues(histories.map(history => history.findLast(snapshot => snapshot.at <= at)?.values).filter(Boolean), deriveEngagement) }));
}

const bucketStart = (at, grain) => {
  const date = new Date(at);
  if (grain === "month") return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  if (grain === "week") return midnight - ((date.getUTCDay() + 6) % 7) * DAY;
  return midnight;
};
const nextBucket = (at, grain) => grain === "month" ? Date.UTC(new Date(at).getUTCFullYear(), new Date(at).getUTCMonth() + 1, 1) : at + (grain === "week" ? 7 : 1) * DAY;

export function buildComparisonSeries(rows, metric, grain = "day", period = "30", now = Date.now()) {
  const histories = rows.map((row, index) => {
    const values = new Map();
    for (const snapshot of row.history || []) if (Number.isFinite(snapshot.values?.[metric])) values.set(bucketStart(snapshot.at, grain), snapshot.values[metric]);
    return { id: row.id, label: row.label, color: chartColors[index % chartColors.length], values };
  });
  const recorded = histories.flatMap(series => [...series.values.keys()]);
  if (!recorded.length) return { buckets: [], series: histories.map(series => ({ ...series, points: [] })) };
  const end = bucketStart(now, grain);
  const requestedStart = period === "all" ? Math.min(...recorded) : bucketStart(now - (Number(period) - 1) * DAY, grain);
  const start = Math.min(requestedStart, end), buckets = [];
  for (let cursor = start; cursor <= end && buckets.length < 366; cursor = nextBucket(cursor, grain)) buckets.push(cursor);
  return { buckets, series: histories.map(series => {
    let current = [...series.values].filter(([at]) => at < start).at(-1)?.[1];
    return { ...series, points: buckets.map(at => {
      if (series.values.has(at)) current = series.values.get(at);
      return { at, value: Number.isFinite(current) ? current : null };
    }) };
  }) };
}

function MetricValue({ totals, metric }) {
  const coverage = totals.coverage?.[metric];
  return <span title={coverage ? `${coverage.available} of ${coverage.total} published posts report this metric` : undefined}>{number(totals.values?.[metric])}{coverage?.available > 0 && coverage.available < coverage.total && <sup>*</sup>}</span>;
}
function MetricCells({ totals }) { return metrics.map(metric => <td key={metric}><MetricValue totals={totals} metric={metric}/></td>); }
function AccountIdentity({ account, catalog }) {
  return <span className="bridge-analytics-identity"><PlatformBadge platform={account.platform} catalog={catalog}/><span><strong>{account.label || account.accountName}</strong><small>{platformName(account.platform, catalog)}</small></span></span>;
}
function chartNumber(value) { return new Intl.NumberFormat(undefined, { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value); }
function bucketLabel(at, grain, timeZone, long = false) {
  return new Intl.DateTimeFormat(undefined, grain === "month" ? { month: long ? "long" : "short", year: "numeric", timeZone } : { month: "short", day: "numeric", ...(long ? { year: "numeric" } : {}), timeZone }).format(at);
}

export function ComparisonChart({ rows, metric, grain, period, timeZone }) {
  const [hovered, setHovered] = useState(null);
  const historyNow = Math.max(Date.now(), ...rows.flatMap(row => (row.history || []).map(point => point.at)));
  const chart = buildComparisonSeries(rows, metric, grain, period, historyNow);
  const values = chart.series.flatMap(series => series.points.map(point => point.value)).filter(Number.isFinite);
  if (!rows.length) return <div className="bridge-chart-empty"><Icon name="analytics" size={25}/><strong>Select platforms or posts to compare</strong><p>Use the checkboxes in the table below. You can plot up to five lines at once.</p></div>;
  if (!values.length) return <div className="bridge-chart-empty"><Icon name="analytics" size={25}/><strong>No {labels[metric].toLowerCase()} history yet</strong><p>Refresh analytics to start collecting daily comparison points for the selected rows.</p></div>;
  const width = 940, height = 320, left = 58, right = 18, top = 18, bottom = 43, plotWidth = width - left - right, plotHeight = height - top - bottom;
  const maxValue = Math.max(1, ...values), tickMax = maxValue * 1.08;
  const x = index => left + (chart.buckets.length === 1 ? plotWidth / 2 : index / (chart.buckets.length - 1) * plotWidth);
  const y = value => top + plotHeight - value / tickMax * plotHeight;
  const labelEvery = Math.max(1, Math.ceil(chart.buckets.length / 7));
  const tooltip = hovered === null ? null : chart.series.map(series => ({ ...series, point: series.points[hovered] })).filter(item => Number.isFinite(item.point?.value));
  return <div className="bridge-comparison-chart" aria-label={`${labels[metric]} over time comparison`}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${labels[metric]} history for ${rows.map(row => row.label).join(", ")}`} onPointerLeave={() => setHovered(null)}>
      {[0, .25, .5, .75, 1].map(portion => <g key={portion}><line className="bridge-chart-grid" x1={left} x2={width - right} y1={top + plotHeight * portion} y2={top + plotHeight * portion}/><text className="bridge-chart-axis" x={left - 10} y={top + plotHeight * portion + 4} textAnchor="end">{chartNumber(tickMax * (1 - portion))}</text></g>)}
      {chart.buckets.map((at, index) => (index % labelEvery === 0 || index === chart.buckets.length - 1) && <text className="bridge-chart-axis" key={at} x={x(index)} y={height - 12} textAnchor="middle">{bucketLabel(at, grain, timeZone)}</text>)}
      {chart.series.map(series => {
        const points = series.points.map((point, index) => Number.isFinite(point.value) ? `${x(index)},${y(point.value)}` : null).filter(Boolean);
        return <g key={series.id}>{points.length > 1 && <polyline points={points.join(" ")} fill="none" stroke={series.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>}{series.points.map((point, index) => Number.isFinite(point.value) && <circle key={point.at} cx={x(index)} cy={y(point.value)} r={hovered === index ? 5 : 3} fill={series.color} stroke="var(--b-panel)" strokeWidth="2"/>)}</g>;
      })}
      {hovered !== null && <line className="bridge-chart-cursor" x1={x(hovered)} x2={x(hovered)} y1={top} y2={top + plotHeight}/>}
      {chart.buckets.map((at, index) => <rect key={at} x={x(index) - Math.max(4, plotWidth / Math.max(1, chart.buckets.length) / 2)} y={top} width={Math.max(8, plotWidth / Math.max(1, chart.buckets.length))} height={plotHeight} fill="transparent" onPointerEnter={() => setHovered(index)}/>)}
    </svg>
    {tooltip?.length > 0 && <div className="bridge-chart-tooltip" style={{ left: `${Math.min(84, Math.max(3, x(hovered) / width * 100))}%` }}><strong>{bucketLabel(chart.buckets[hovered], grain, timeZone, true)}</strong>{tooltip.map(item => <span key={item.id}><i style={{ background: item.color }}/><em>{item.label}</em><b>{number(item.point.value)}</b></span>)}</div>}
    <div className="bridge-chart-legend">{chart.series.map(series => <span key={series.id}><i style={{ background: series.color }}/><span title={series.label}>{series.label}</span><strong>{number(rows.find(row => row.id === series.id)?.values?.[metric])}</strong></span>)}</div>
  </div>;
}

export function AccountAnalyticsCard({ account, catalog = [], timeZone, selected, onCompare, compareDisabled, onOpen }) {
  const deliveries = account.posts.map(post => post.delivery).filter(delivery => delivery && published(delivery));
  const updatedAt = Math.max(account.demoMetricsUpdatedAt || 0, ...deliveries.map(delivery => delivery.metricsUpdatedAt || 0));
  const notes = [...new Set([account.metricsNote, account.demoMetricsNote, ...deliveries.map(delivery => delivery.metricsNote)].filter(Boolean))];
  const errors = [...new Set([account.metricsError, ...deliveries.map(delivery => delivery.metricsError)].filter(Boolean))];
  const perVideo = account.platform === "youtube";
  const hasMetrics = metrics.some(metric => Number.isFinite(account.totals.values?.[metric]));
  return <article className={`bridge-account-analytics ${selected ? "selected" : ""}`} aria-label={accountLabel(account, catalog)}>
    <div className="bridge-account-analytics-heading"><AccountIdentity account={account} catalog={catalog}/><label className="bridge-account-compare"><input type="checkbox" aria-label={`Compare ${accountLabel(account, catalog)}`} checked={selected} disabled={compareDisabled || perVideo} onChange={event => onCompare(event.target.checked)}/><span>Compare</span></label></div>
    <div className="bridge-account-analytics-status"><span>{deliveries.length} published {deliveries.length === 1 ? "post" : "posts"}</span>{account.status !== "connected" && <Badge status={account.status}/>}</div>
    {perVideo ? <div className="bridge-account-metric-notice"><Icon name="analytics" size={24}/><strong>Metrics available per video</strong><p>Open this account’s published videos to see their individual views and interactions.</p></div> : <dl className="bridge-account-metrics">{metrics.map(metric => <div key={metric}><dt>{labels[metric]}</dt><dd><MetricValue totals={account.totals} metric={metric}/></dd></div>)}</dl>}
    {!deliveries.length && !account.demoMetrics && account.analyticsSource !== "zernio" ? <p className="bridge-account-metric-note">No posts published through Meadow yet.</p> : !deliveries.length && account.demoMetrics ? null : !perVideo && !hasMetrics && <p className="bridge-account-metric-note">Metrics are not available yet. Refresh to check what this platform reports.</p>}
    {notes.map(note => <p className="bridge-account-metric-note" key={note}>{note}</p>)}
    {errors.length > 0 && <details className="bridge-account-metric-errors"><summary>Some post metrics could not be refreshed</summary>{errors.map(error => <p className="bridge-validation-error" key={error}>{error}</p>)}</details>}
    <div className="bridge-account-analytics-footer"><small>{updatedAt ? `${account.demoMetrics ? "Latest profile snapshot" : "Latest post update"}: ${dateTime(updatedAt, timeZone)}` : "No metrics received yet"}</small><button className="bridge-text-button" type="button" onClick={onOpen} disabled={!deliveries.length}>{perVideo ? "View video analytics" : "View posts"}<Icon name="arrow" size={16}/></button></div>
  </article>;
}

export function analyticsAccountRow(item, catalog = []) {
  const deliveries = item.posts.map(post => post.delivery).filter(delivery => delivery && published(delivery));
  const history = aggregateDeliveryHistory(deliveries, { deriveEngagement: item.platform !== "youtube" });
  if (!history.length && item.demoMetrics && item.demoMetricsUpdatedAt) history.push({ at: item.demoMetricsUpdatedAt, values: sumMetrics(item.demoMetrics) });
  return { ...item, title: accountLabel(item, catalog), count: deliveries.length, deliveries, history,
    metricsNote: [...new Set([item.metricsNote, item.demoMetricsNote, ...deliveries.map(delivery => delivery.metricsNote)].filter(Boolean))].join(" "),
    metricsError: [...new Set([item.metricsError, ...deliveries.map(delivery => delivery.metricsError)].filter(Boolean))].join(" "),
    lastUpdated: Math.max(item.demoMetricsUpdatedAt || 0, ...deliveries.map(delivery => delivery.metricsUpdatedAt || 0)), comparisonDisabled: item.platform === "youtube" };
}

const overviewLabels = { views: "Views", likes: "Likes", comments: "Comments", averageViews: "Avg views / post", engagementRate: "Engagement rate" };
const overviewNumber = (value, metric) => !Number.isFinite(value) ? "—" : metric === "engagementRate" ? `${value.toFixed(2)}%` : new Intl.NumberFormat(undefined, { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: metric === "averageViews" ? 0 : 1 }).format(value);
function MetricIcon({ metric }) {
  const shapes = {
    views: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    likes: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>,
    comments: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.8-5.5a8.5 8.5 0 1 1 16.2-4Z"/>,
    averageViews: <path d="m3 17 6-6 4 4 8-10M15 5h6v6"/>,
    engagementRate: <><path d="m5 19 14-14"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></>,
  };
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[metric]}</svg>;
}

export default function Analytics({ project, catalog }) {
  const { data, setData, loading, error: loadError } = useProjectResource(project.id, "/analytics", { posts: [], accounts: [], totals: { values: {}, coverage: {} }, publishedCount: 0 });
  const { data: accountData } = useProjectResource(project.id, "/accounts", { accounts: [] });
  const accounts = data.accounts.map(account => ({ ...account, label: accountData.accounts.find(item => item.id === account.id)?.label || account.label }));
  const [mode, setMode] = useState("overview"), [platform, setPlatform] = useState("all"), [accountId, setAccountId] = useState(""), [period, setPeriod] = useState("30"), [metric, setMetric] = useState("views"), [grain, setGrain] = useState("day"), [comparisonMetric, setComparisonMetric] = useState("views"), [query, setQuery] = useState(""), [sort, setSort] = useState("views"), [compare, setCompare] = useState([]), [openedId, setOpenedId] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const overview = buildAnalyticsOverview(data, { platform, accountId, period, timeZone: project.timeZone });
  const platforms = [...new Set(accounts.map(account => account.platform))].sort((a, b) => {
    const order = ["tiktok", "youtube", "instagram", "facebook"];
    return (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b));
  });
  const availableAccounts = accounts.filter(account => platform === "all" || account.platform === platform);
  const opened = overview.posts.find(post => post.id === openedId);
  const rawPostTotals = post => post.deliveries.length === 1 && post.deliveries[0].platform === "youtube" ? { values: { ...post.deliveries[0].metrics, engagement: null }, coverage: {} } : post.totals;
  const postRows = overview.posts.filter(post => `${post.title || post.caption || "Media post"} ${post.deliveries.map(delivery => accounts.find(account => account.id === delivery.accountId)?.label || delivery.accountName).join(" ")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => sort === "publishedAt" ? (b.publishedAt || 0) - (a.publishedAt || 0) : (rawPostTotals(b).values[sort] ?? -1) - (rawPostTotals(a).values[sort] ?? -1));
  const comparisonRows = overview.posts.filter(post => compare.includes(post.id)).map(post => ({ id: post.id, label: post.title || post.caption || "Media post", values: post.totals.values, history: aggregateDeliveryHistory(post.deliveries, { excludeYoutube: true }) }));
  const statusRows = availableAccounts.map(account => analyticsAccountRow(account, catalog)).filter(account => account.metricsError || account.metricsNote);
  function choosePlatform(value) { setPlatform(value); setAccountId(""); setCompare([]); setOpenedId(""); setQuery(""); if (value === "youtube") setMode("posts"); }
  async function refresh(post) {
    setBusy(true); setError("");
    try {
      const scope = post?.source === "connected_account" ? { accountId: post.deliveries[0].accountId } : post ? { postId: post.id } : accountId ? { accountId } : {};
      setData(await api.project(project.id, "/analytics/refresh", { method: "POST", body: scope }));
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  function toggleComparison(id, checked) { setCompare(current => checked ? current.includes(id) || current.length >= 5 ? current : [...current, id] : current.filter(item => item !== id)); }
  const canSync = data.publishedCount || accounts.some(account => account.status === "connected" && account.analyticsSource === "zernio");
  const hasYoutube = availableAccounts.some(account => account.platform === "youtube");
  return <div className="bridge-analytics-dashboard">
    <Alert message={error || loadError}/>
    <div className="bridge-analytics-tabs" role="tablist" aria-label="Analytics views">{[["overview", "Overview"], ["posts", "Posts"]].map(([value, label]) => <button key={value} type="button" role="tab" id={`analytics-${value}-tab`} aria-controls="analytics-content" aria-selected={mode === value} className={mode === value ? "active" : ""} onClick={() => { setMode(value); if (value === "overview") setAccountId(""); }}>{label}</button>)}</div>
    <div className="bridge-analytics-toolbar">
      <div className="bridge-analytics-platform-filter" aria-label="Filter by platform"><button type="button" className={platform === "all" ? "active" : ""} aria-pressed={platform === "all"} onClick={() => choosePlatform("all")}>All</button>{platforms.map(value => <button key={value} type="button" className={platform === value ? "active" : ""} aria-pressed={platform === value} onClick={() => choosePlatform(value)}><PlatformIcon platform={value} size={14}/>{platformName(value, catalog)}</button>)}</div>
      <select className="bridge-analytics-period" aria-label="Analytics date range" value={period} onChange={event => { setPeriod(event.target.value); setCompare([]); setOpenedId(""); }}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All available</option></select>
      <div className="bridge-analytics-sync"><small aria-live="polite">{busy ? "Syncing analytics…" : overview.lastUpdated ? `Synced ${dateTime(overview.lastUpdated, project.timeZone)}` : "No metrics synced yet"}</small><button type="button" disabled={busy || !canSync} aria-busy={busy} onClick={() => refresh()}><Icon name="refresh" size={17}/>{busy ? "Syncing…" : "Sync"}</button></div>
    </div>
    <div id="analytics-content" role="tabpanel" aria-labelledby={`analytics-${mode}-tab`}>
    {mode === "overview" ? <>
      <p className="bridge-analytics-period-caption">Lifetime totals for the {overview.totals.count} {overview.totals.count === 1 ? "post" : "posts"} published {period === "all" ? "across all available dates" : "in this period"}{period !== "all" && Number(period) <= 30 && overview.previous.length > 0 ? `, compared with the previous ${period} days` : ""}.</p>
      <div className="bridge-analytics-summary">{Object.keys(overviewLabels).map(key => <article className="bridge-analytics-stat" key={key}><div><span><MetricIcon metric={key}/>{overviewLabels[key]}</span>{Number.isFinite(overview.changes[key]) && <small className={overview.changes[key] >= 0 ? "positive" : "negative"} title={`Change versus posts published in the previous ${period} days`}>{overview.changes[key] >= 0 ? "+" : ""}{Math.round(overview.changes[key])}%</small>}</div><strong>{overviewNumber(overview.totals.values[key], key)}</strong></article>)}</div>
      <section className="bridge-panel bridge-analytics-platforms"><h2>Views by platform</h2>{platforms.filter(value => platform === "all" || value === platform).map(value => {
        const records = overview.current.filter(record => record.delivery.platform === value), totals = summarizeAnalytics(records), views = totals.values.views;
        const share = overview.totals.values.views > 0 && Number.isFinite(views) ? views / overview.totals.values.views * 100 : null;
        return <div className="bridge-analytics-platform-row" key={value}><button type="button" onClick={() => choosePlatform(value)}><PlatformIcon platform={value} size={17}/>{platformName(value, catalog)}</button>{value === "youtube" ? <button type="button" className="bridge-analytics-video-link" onClick={() => choosePlatform("youtube")}>View per-video metrics <Icon name="arrow" size={14}/></button> : <><div className="bridge-analytics-bar" aria-label={Number.isFinite(share) ? `${Math.round(share)}% of reported views` : "Views unavailable"}><span style={{ width: `${share || 0}%` }}/></div><strong>{overviewNumber(views, "views")}</strong><small>{share === null ? "—" : `${Math.round(share)}%`}</small></>}<small className="bridge-analytics-post-count">{records.length} {records.length === 1 ? "post" : "posts"}</small></div>;
      })}{!platforms.length && <p className="bridge-small">Connect a social account to see platform performance.</p>}</section>
      <section className="bridge-panel bridge-analytics-publication"><div className="bridge-analytics-chart-heading"><div><h2>{labels[metric]} by publish date</h2><p>Lifetime {metric} of posts published each {grain === "week" ? "week" : "day"}. This view fills in as syncs run.</p></div><div className="bridge-analytics-chart-switches"><div className="bridge-analytics-toggle" aria-label="Chart metric">{["views", "likes", "comments"].map(value => <button key={value} type="button" className={metric === value ? "active" : ""} aria-pressed={metric === value} onClick={() => setMetric(value)}>{labels[value]}</button>)}</div><div className="bridge-analytics-toggle" aria-label="Chart interval">{[["day", "Daily"], ["week", "Weekly"]].map(([value, label]) => <button key={value} type="button" className={grain === value ? "active" : ""} aria-pressed={grain === value} onClick={() => setGrain(value)}>{label}</button>)}</div></div></div><PublicationChart overview={overview} metric={metric} grain={grain}/></section>
      <p className="bridge-analytics-definition">Average views uses posts with reported views. Engagement rate is reported likes, comments, shares and saves divided by views on posts that report both.</p>
    </> : <section className="bridge-panel bridge-analytics-post-board">
      <div className="bridge-analytics-post-tools"><input type="search" className="bridge-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search posts…" aria-label="Search analytics posts"/><select aria-label="Filter analytics by account" value={accountId} onChange={event => { setAccountId(event.target.value); setCompare([]); setOpenedId(""); }}><option value="">All accounts</option>{availableAccounts.map(account => <option key={account.id} value={account.id}>{accountLabel(account, catalog)}</option>)}</select><span>{postRows.length} {postRows.length === 1 ? "post" : "posts"}</span></div>
      {compare.length > 0 && <section className="bridge-performance-chart"><div className="bridge-chart-heading"><div><h3>Compare selected posts</h3><p>Metrics recorded when Meadow syncs available platform data.</p></div><div className="bridge-analytics-comparison-actions"><select aria-label="Compare posts metric" value={comparisonMetric} onChange={event => setComparisonMetric(event.target.value)}>{metrics.map(key => <option key={key} value={key}>{labels[key]}</option>)}</select><button type="button" className="bridge-text-button" onClick={() => setCompare([])}>Clear selection</button></div></div><ComparisonChart rows={comparisonRows} metric={comparisonMetric} grain={grain} period={period} timeZone={project.timeZone}/></section>}
      {postRows.length ? <div className="bridge-table-scroll"><table className="bridge-table bridge-analytics-post-table"><thead><tr><th><span className="bridge-visually-hidden">Compare</span></th><th>Post</th><th><button className={sort === "publishedAt" ? "active" : ""} onClick={() => setSort("publishedAt")}>Published{sort === "publishedAt" ? " ↓" : ""}</button></th>{["views", "likes", "comments", "shares", "impressions"].map(key => <th key={key}><button className={sort === key ? "active" : ""} onClick={() => setSort(key)}>{labels[key]}{sort === key ? " ↓" : ""}</button></th>)}</tr></thead><tbody>{postRows.map(post => <tr key={post.id} className={compare.includes(post.id) ? "selected" : ""}><td><input type="checkbox" aria-label={`Compare ${post.title || post.caption || "Media post"}`} checked={compare.includes(post.id)} disabled={post.deliveries.every(delivery => delivery.platform === "youtube") || !compare.includes(post.id) && compare.length >= 5} onChange={event => toggleComparison(post.id, event.target.checked)}/></td><td><button type="button" className="bridge-table-title" onClick={() => setOpenedId(post.id)}>{(post.title || post.caption || "Media post").slice(0, 110)}</button><div className="bridge-analytics-post-accounts">{post.deliveries.map(delivery => <span key={delivery.id}><PlatformIcon platform={delivery.platform} size={15}/>{accounts.find(account => account.id === delivery.accountId)?.label || delivery.accountName}</span>)}</div>{post.deliveries.map(delivery => delivery.metricsError || delivery.metricsNote ? <p className={`bridge-analytics-table-note ${delivery.metricsError ? "bridge-validation-error" : ""}`} key={delivery.id}>{delivery.metricsError || delivery.metricsNote}</p> : null)}</td><td>{dateTime(post.publishedAt, project.timeZone)}</td>{["views", "likes", "comments", "shares", "impressions"].map(key => <td key={key}><MetricValue totals={rawPostTotals(post)} metric={key}/></td>)}</tr>)}</tbody></table></div> : <Empty icon="analytics" title={loading ? "Loading analytics…" : "No published posts in this period"}>Choose another platform or date range, or sync to load connected-account posts.</Empty>}
    </section>}
    </div>
    <p className="bridge-analytics-source">{data.sourceLabel || "Posts published through Meadow"}. {hasYoutube && "YouTube metrics are shown per video and excluded from combined totals."} {overview.unknownDates > 0 && `${overview.unknownDates} posts have no publish date and appear under All available.`} {Object.values(overview.totals.coverage).some(coverage => coverage.available > 0 && coverage.available < coverage.total) && "Some posts do not report every metric; totals use available readings."}</p>
    {statusRows.length > 0 && <details className="bridge-panel bridge-analytics-status" open={statusRows.some(account => account.metricsError) ? true : undefined}><summary>Account sync status</summary>{statusRows.map(account => <div key={account.id}><AccountIdentity account={account} catalog={catalog}/>{account.metricsError && <p className="bridge-validation-error">{account.metricsError}</p>}{account.metricsNote && <p>{account.metricsNote}</p>}</div>)}</details>}
    {opened && <Modal title="Post analytics" className="wide bridge-analytics-detail" onClose={() => setOpenedId("")}><p>{opened.title || opened.caption || "Media post"}</p><small>Published {dateTime(opened.publishedAt, project.timeZone)}</small><div className="bridge-table-scroll"><table className="bridge-table"><thead><tr><th>Account</th>{metrics.filter(key => key !== "engagement").map(key => <th key={key}>{labels[key]}</th>)}</tr></thead><tbody>{opened.deliveries.map(delivery => <tr key={delivery.id}><td><AccountIdentity account={{ ...delivery, label: accounts.find(account => account.id === delivery.accountId)?.label }} catalog={catalog}/>{delivery.url && <a href={delivery.url} target="_blank" rel="noreferrer">View post <Icon name="external" size={13}/></a>}{delivery.metricsNote && <p className="bridge-analytics-table-note">{delivery.metricsNote}</p>}{delivery.metricsError && <p className="bridge-validation-error">{delivery.metricsError}</p>}</td>{metrics.filter(key => key !== "engagement").map(key => <td key={key}>{number(delivery.metrics?.[key])}</td>)}</tr>)}</tbody></table></div><div className="bridge-modal-actions"><button type="button" className="bridge-button secondary" disabled={busy} onClick={() => refresh(opened)}><Icon name="refresh" size={16}/>{busy ? "Syncing…" : "Sync this post"}</button><button type="button" className="bridge-button" onClick={() => setOpenedId("")}>Done</button></div></Modal>}
  </div>;
}
