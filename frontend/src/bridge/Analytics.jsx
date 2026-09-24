import { useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Badge, dateTime, Empty, number, PlatformBadge, useProjectResource } from "./ui.jsx";

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
  const notes = [...new Set([account.demoMetricsNote, ...deliveries.map(delivery => delivery.metricsNote)].filter(Boolean))];
  const errors = [...new Set(deliveries.map(delivery => delivery.metricsError).filter(Boolean))];
  const perVideo = account.platform === "youtube";
  const hasMetrics = metrics.some(metric => Number.isFinite(account.totals.values?.[metric]));
  return <article className={`bridge-account-analytics ${selected ? "selected" : ""}`} aria-label={accountLabel(account, catalog)}>
    <div className="bridge-account-analytics-heading"><AccountIdentity account={account} catalog={catalog}/><label className="bridge-account-compare"><input type="checkbox" aria-label={`Compare ${accountLabel(account, catalog)}`} checked={selected} disabled={compareDisabled || perVideo} onChange={event => onCompare(event.target.checked)}/><span>Compare</span></label></div>
    <div className="bridge-account-analytics-status"><span>{deliveries.length} published {deliveries.length === 1 ? "post" : "posts"}</span>{account.status !== "connected" && <Badge status={account.status}/>}</div>
    {perVideo ? <div className="bridge-account-metric-notice"><Icon name="analytics" size={24}/><strong>Metrics available per video</strong><p>Open this account’s published videos to see their individual views and interactions.</p></div> : <dl className="bridge-account-metrics">{metrics.map(metric => <div key={metric}><dt>{labels[metric]}</dt><dd><MetricValue totals={account.totals} metric={metric}/></dd></div>)}</dl>}
    {!deliveries.length && !account.demoMetrics ? <p className="bridge-account-metric-note">No posts published through Meadow yet.</p> : !deliveries.length && account.demoMetrics ? null : !perVideo && !hasMetrics && <p className="bridge-account-metric-note">Metrics are not available yet. Refresh to check what this platform reports.</p>}
    {notes.map(note => <p className="bridge-account-metric-note" key={note}>{note}</p>)}
    {errors.length > 0 && <details className="bridge-account-metric-errors"><summary>Some post metrics could not be refreshed</summary>{errors.map(error => <p className="bridge-validation-error" key={error}>{error}</p>)}</details>}
    <div className="bridge-account-analytics-footer"><small>{updatedAt ? `${account.demoMetrics ? "Latest profile snapshot" : "Latest post update"}: ${dateTime(updatedAt, timeZone)}` : "No metrics received yet"}</small><button className="bridge-text-button" type="button" onClick={onOpen} disabled={!deliveries.length}>{perVideo ? "View video analytics" : "View posts"}<Icon name="arrow" size={16}/></button></div>
  </article>;
}

export default function Analytics({ project, catalog }) {
  const { data, setData, loading, error: loadError } = useProjectResource(project.id, "/analytics", { posts: [], accounts: [], totals: { values: {}, coverage: {} }, publishedCount: 0 });
  const { data: accountData } = useProjectResource(project.id, "/accounts", { accounts: [] });
  const accounts = data.accounts.map(account => ({ ...account, label: accountData.accounts.find(item => item.id === account.id)?.label || account.label }));
  const deliveryIdentity = delivery => ({ ...delivery, accountName: accounts.find(account => account.id === delivery.accountId)?.label || delivery.accountName });
  const [mode, setMode] = useState("accounts"), [accountId, setAccountId] = useState(""), [postId, setPostId] = useState(""), [metric, setMetric] = useState("engagement"), [compare, setCompare] = useState([]), [period, setPeriod] = useState("30"), [grain, setGrain] = useState("day"), [query, setQuery] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const account = accounts.find(item => item.id === accountId), post = data.posts.find(item => item.id === postId);
  const accountRows = accounts.map(item => {
    const deliveries = item.posts.map(post => post.delivery).filter(delivery => delivery && published(delivery));
    const history = aggregateDeliveryHistory(deliveries, { deriveEngagement: item.platform !== "youtube" });
    if (!history.length && item.demoMetrics && item.demoMetricsUpdatedAt) history.push({ at: item.demoMetricsUpdatedAt, values: sumMetrics(item.demoMetrics) });
    return { ...item, title: accountLabel(item, catalog), count: deliveries.length, deliveries, history, lastUpdated: Math.max(item.demoMetricsUpdatedAt || 0, ...deliveries.map(delivery => delivery.metricsUpdatedAt || 0)), comparisonDisabled: item.platform === "youtube" };
  });
  const allPostRows = (account ? account.posts.filter(item => item.delivery && published(item.delivery)).map(item => ({ ...item, title: item.title || "Media post", count: 1, deliveries: [deliveryIdentity(item.delivery)], history: aggregateDeliveryHistory([item.delivery], { deriveEngagement: account.platform !== "youtube" }) })) : data.posts.filter(item => item.deliveries.some(published)).map(item => {
    const deliveries = item.deliveries.map(deliveryIdentity).filter(published);
    return { ...item, deliveries, title: item.title || item.caption || "Media post", count: deliveries.length, history: aggregateDeliveryHistory(deliveries, { excludeYoutube: true }) };
  })).sort((a, b) => (b.totals.values[metric] ?? -1) - (a.totals.values[metric] ?? -1));
  const rows = mode === "accounts" ? accountRows.sort((a, b) => (b.totals.values[metric] ?? -1) - (a.totals.values[metric] ?? -1)) : allPostRows;
  const totals = mode === "post" ? post?.totals : account && mode === "posts" ? account.totals : data.totals;
  const scopeLabel = mode === "post" ? "Selected post · All its accounts" : account && mode === "posts" ? accountLabel(account, catalog) : "All accounts combined";
  const postRows = post?.deliveries.filter(published).map(delivery => {
    const identified = deliveryIdentity(delivery), values = delivery.platform === "youtube" ? { ...delivery.metrics, engagement: null } : sumMetrics(delivery.metrics || {});
    return { ...identified, values, title: accountLabel(identified, catalog), history: deliverySnapshots(delivery) };
  }).sort((a, b) => (b.values[metric] ?? -1) - (a.values[metric] ?? -1)) || [];
  const selectableRows = mode === "post" ? postRows.map(row => ({ ...row, label: row.title })) : rows.map(row => ({ ...row, label: row.title, values: row.totals.values }));
  const comparisonRows = selectableRows.filter(row => compare.includes(row.id));
  const searchedRows = (mode === "post" ? postRows : rows).filter(row => (row.title || "").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  async function refresh() {
    setBusy(true); setError("");
    try { setData(await api.project(project.id, "/analytics/refresh", { method: "POST", body: { ...(accountId ? { accountId } : {}), ...(mode === "post" && postId ? { postId } : {}) } })); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  function setScope(nextMode, nextAccount = "", nextPost = "") { setMode(nextMode); setAccountId(nextAccount); setPostId(nextPost); setCompare([]); setQuery(""); }
  function toggleComparison(id, checked) { setCompare(current => checked ? current.includes(id) || current.length >= 5 ? current : [...current, id] : current.filter(item => item !== id)); }
  const countLabel = mode === "posts" ? "posts" : "accounts";
  return <>
    <div className="bridge-intro-row"><p>Track results over time, then select platforms or posts to compare them on one graph.</p></div><Alert message={error || loadError}/>
    <div className="bridge-library-toolbar"><div className="bridge-filter-tabs"><button className={mode === "accounts" ? "active" : ""} onClick={() => setScope("accounts")}>Account performance</button><button className={mode === "posts" ? "active" : ""} onClick={() => setScope("posts")}>Post performance</button><button className={mode === "post" ? "active" : ""} onClick={() => setScope("post", "", postId || data.posts.find(item => item.deliveries.some(published))?.id || "")}>Same post, different accounts</button></div></div>
    <div className="bridge-analytics-scope"><strong>{scopeLabel}</strong><span>Posts published through Meadow</span></div>
    {account?.platform === "youtube" && mode === "posts" ? <p className="bridge-small">YouTube metrics are shown per video below. Account totals are not combined.</p> : <div className="bridge-stat-grid">{["engagement", "views", "impressions", "clicks"].map(key => <div className="bridge-stat" key={key}><span>{labels[key]}</span><strong><MetricValue totals={totals || { values: {} }} metric={key}/></strong><small>{key === "engagement" ? "Reported likes + comments + shares + saves" : "Current reported total"}</small></div>)}</div>}
    <div className="bridge-analytics-filters">{mode === "posts" && <label>Account<select value={accountId} onChange={event => { setAccountId(event.target.value); setCompare([]); }}><option value="">All accounts combined</option>{accounts.map(item => <option key={item.id} value={item.id}>{accountLabel(item, catalog)}</option>)}</select></label>}{mode === "post" && <label>Post<select value={postId} onChange={event => { setPostId(event.target.value); setCompare([]); }}><option value="">Choose a published post</option>{data.posts.filter(item => item.deliveries.some(published)).map(item => <option key={item.id} value={item.id}>{(item.title || item.caption || "Media post").slice(0, 100)}</option>)}</select></label>}<label>Metric<select value={metric} onChange={event => setMetric(event.target.value)}>{metrics.map(key => <option value={key} key={key}>{labels[key]}</option>)}</select></label></div>
    <div className="bridge-panel bridge-analytics-main">
      <div className="bridge-section-label"><div><h2>{mode === "accounts" ? "Compare social accounts" : mode === "post" ? "Compare this post by destination" : account ? `Compare posts · ${account.label}` : "Compare posts across all accounts"}</h2><p className="bridge-small">Select up to five rows below. The graph and legend update immediately.</p></div><div className="bridge-analytics-board-actions"><Badge>{(mode === "post" ? postRows : rows).length} {countLabel}</Badge><button type="button" className="bridge-button secondary small" disabled={busy || !data.publishedCount} aria-busy={busy} onClick={refresh}><Icon name="refresh" size={16}/>{busy ? "Refreshing…" : "Refresh analytics"}</button></div></div>
      {(mode !== "post" || postRows.length) && <section className="bridge-performance-chart"><div className="bridge-chart-heading"><div><h3>{labels[metric]} over time</h3><p>Daily snapshots are recorded when Meadow refreshes available platform metrics.</p></div><div className="bridge-chart-controls"><label>Range<select value={period} onChange={event => setPeriod(event.target.value)}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All available</option></select></label><div className="bridge-segmented bridge-chart-grain" aria-label="Chart interval">{[["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"]].map(([value, label]) => <button type="button" className={grain === value ? "active" : ""} aria-pressed={grain === value} onClick={() => setGrain(value)} key={value}>{label}</button>)}</div></div></div><ComparisonChart rows={comparisonRows} metric={metric} grain={grain} period={period} timeZone={project.timeZone}/></section>}
      {mode === "post" && !postRows.length ? <Empty icon="analytics" title="Choose a published post">Compare the same content across its destinations once it has been published.</Empty> : (mode === "post" ? postRows : rows).length ? <>
        <div className="bridge-analytics-table-tools"><input className="bridge-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${countLabel}…`} aria-label={`Search ${countLabel}`}/><span>{compare.length ? `${compare.length} selected` : "Select rows to plot"}</span>{compare.length > 0 && <button className="bridge-text-button" onClick={() => setCompare([])}>Clear selection</button>}</div>
        <div className="bridge-table-scroll"><table className="bridge-table bridge-analytics-table"><thead><tr><th><span className="bridge-visually-hidden">Compare</span></th><th>{mode === "accounts" ? "Account" : mode === "post" ? "Account" : "Post / accounts"}</th><th>{mode === "accounts" || mode === "post" ? "Posts" : "Accounts"}</th>{metrics.map(key => <th key={key}><button className={metric === key ? "active" : ""} onClick={() => setMetric(key)}>{labels[key]}{metric === key ? " ↓" : ""}</button></th>)}<th>Last updated</th></tr></thead><tbody>{searchedRows.map((row, index) => {
          const disabled = Boolean(row.comparisonDisabled) || !compare.includes(row.id) && compare.length >= 5;
          const rowTotals = mode === "post" ? { values: row.values } : row.totals;
          const lastUpdated = mode === "post" ? row.metricsUpdatedAt : row.lastUpdated ?? Math.max(0, ...row.deliveries.map(delivery => delivery.metricsUpdatedAt || 0));
          return <tr className={compare.includes(row.id) ? "selected" : ""} key={row.id}><td><input type="checkbox" aria-label={`Compare ${row.title}`} title={row.comparisonDisabled ? "YouTube account metrics are available per video." : undefined} checked={compare.includes(row.id)} disabled={disabled} onChange={event => toggleComparison(row.id, event.target.checked)}/></td><td>{mode === "accounts" || mode === "post" ? <>{mode === "accounts" ? <button className="bridge-table-name" type="button" onClick={() => setScope("posts", row.id)}><AccountIdentity account={row} catalog={catalog}/></button> : <AccountIdentity account={row} catalog={catalog}/>} {row.metricsNote && <p className="bridge-analytics-table-note">{row.metricsNote}</p>}{row.metricsError && <p className="bridge-analytics-table-note bridge-validation-error">{row.metricsError}</p>}</> : <><button className="bridge-table-title" onClick={() => setScope("post", "", row.id)}><span className="bridge-rank">{index + 1}</span><span>{row.title.slice(0, 90)}</span></button><div className="bridge-analytics-post-accounts">{row.deliveries.filter(published).map(delivery => <span key={delivery.id}><PlatformBadge platform={delivery.platform} catalog={catalog}/>{accountLabel(delivery, catalog)}</span>)}</div>{row.delivery?.metricsNote && <p className="bridge-analytics-table-note">{row.delivery.metricsNote}</p>}{row.delivery?.metricsError && <p className="bridge-analytics-table-note bridge-validation-error">{row.delivery.metricsError}</p>}</>}</td><td>{mode === "post" ? 1 : row.count}</td><MetricCells totals={rowTotals}/><td>{dateTime(lastUpdated, project.timeZone)}</td></tr>;
        })}{mode === "post" && <tr className="bridge-total-row"><td/><td>Combined total (excludes YouTube)</td><td>{postRows.length}</td><MetricCells totals={post.totals}/><td/></tr>}</tbody></table></div>
      </> : <Empty icon="analytics" title={loading ? "Loading analytics…" : mode === "accounts" ? "Connect a social account" : "Your results start with a post"}>{mode === "accounts" ? "Your connected accounts and their reported post metrics will appear here." : "Once your content is published, you’ll be able to compare its performance here."}</Empty>}
    </div>
  </>;
}
