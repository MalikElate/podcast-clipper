import { useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Badge, dateTime, Empty, number, PlatformBadge, useProjectResource } from "./ui.jsx";

const metrics = ["engagement", "views", "impressions", "likes", "comments", "shares", "saves", "clicks"];
const labels = { engagement: "Engagement", views: "Views", impressions: "Impressions", likes: "Likes", comments: "Comments", shares: "Shares", saves: "Saves", clicks: "Clicks" };
const platformName = (platform, catalog) => catalog.find(item => item.id === platform)?.name || platform;
const accountLabel = (account, catalog) => `${platformName(account.platform, catalog)} · ${account.label || account.accountName}`;
const published = delivery => delivery.status === "published";
const sumMetrics = values => {
  const interactions = ["likes", "comments", "shares", "saves"].map(key => values?.[key]).filter(Number.isFinite);
  return { ...values, engagement: interactions.length ? interactions.reduce((a, b) => a + b, 0) : null };
};
function MetricValue({ totals, metric }) {
  const coverage = totals.coverage?.[metric];
  return <span title={coverage ? `${coverage.available} of ${coverage.total} published posts report this metric` : undefined}>{number(totals.values?.[metric])}{coverage?.available > 0 && coverage.available < coverage.total && <sup>*</sup>}</span>;
}
function MetricCells({ totals }) { return metrics.map(metric => <td key={metric}><MetricValue totals={totals} metric={metric}/></td>); }
function AccountIdentity({ account, catalog }) {
  return <span className="bridge-analytics-identity"><PlatformBadge platform={account.platform} catalog={catalog}/><span><strong>{account.label || account.accountName}</strong><small>{platformName(account.platform, catalog)}</small></span></span>;
}
function ComparisonChart({ rows, metric }) {
  const max = Math.max(1, ...rows.map(row => Number(row.values?.[metric]) || 0));
  return <div className="bridge-comparison-chart" aria-label={`${labels[metric]} comparison`}>{rows.map((row, index) => <div className="bridge-chart-row" key={row.id}><span title={row.label}>{row.label}</span><div className="bridge-bar-track"><span style={{ width: `${Math.max(0, (row.values?.[metric] || 0) / max * 100)}%`, background: ["#7395ff", "#73c6b5", "#b394ec", "#d5b975"][index % 4] }}/></div><strong>{number(row.values?.[metric])}</strong></div>)}</div>;
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
  // Pinterest profile names are read live and must not be stored with analytics.
  const { data: accountData } = useProjectResource(project.id, "/accounts", { accounts: [] });
  const accounts = data.accounts.map(account => ({ ...account, label: accountData.accounts.find(item => item.id === account.id)?.label || account.label }));
  const deliveryIdentity = delivery => ({ ...delivery, accountName: accounts.find(account => account.id === delivery.accountId)?.label || delivery.accountName });
  const [mode, setMode] = useState("accounts"), [accountId, setAccountId] = useState(""), [postId, setPostId] = useState(""), [metric, setMetric] = useState("engagement"), [compare, setCompare] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const account = accounts.find(item => item.id === accountId), post = data.posts.find(item => item.id === postId);
  const rows = (mode === "accounts" ? accounts.map(item => ({ ...item, title: accountLabel(item, catalog) })) : account ? account.posts.filter(item => item.delivery && published(item.delivery)).map(item => ({ ...item, count: 1, deliveries: [deliveryIdentity(item.delivery)] })) : data.posts.filter(item => item.deliveries.some(published)).map(item => ({ ...item, deliveries: item.deliveries.map(deliveryIdentity), title: item.title || item.caption || "Media post", count: item.deliveries.filter(published).length }))).sort((a, b) => (b.totals.values[metric] ?? -1) - (a.totals.values[metric] ?? -1));
  const comparisonRows = rows.filter(row => compare.includes(row.id)).map(row => ({ id: row.id, label: row.title, values: row.totals.values }));
  const totals = mode === "post" ? post?.totals : account && mode === "posts" ? account.totals : data.totals;
  const scopeLabel = mode === "post" ? "Selected post · All its accounts" : account && mode === "posts" ? accountLabel(account, catalog) : "All accounts combined";
  const postRows = post?.deliveries.filter(published).map(delivery => ({ ...deliveryIdentity(delivery), values: delivery.platform === "youtube" ? { ...delivery.metrics, engagement: null } : sumMetrics(delivery.metrics || {}) })).sort((a, b) => (b.values[metric] ?? -1) - (a.values[metric] ?? -1)) || [];
  async function refresh() {
    setBusy(true); setError("");
    try { setData(await api.project(project.id, "/analytics/refresh", { method: "POST", body: { ...(accountId ? { accountId } : {}), ...(mode === "post" && postId ? { postId } : {}) } })); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  function setScope(nextMode, nextAccount = "", nextPost = "") { setMode(nextMode); setAccountId(nextAccount); setPostId(nextPost); setCompare([]); }
  function toggleComparison(id, checked) { setCompare(current => checked ? [...current, id] : current.filter(item => item !== id)); }
  return <>
    <div className="bridge-intro-row"><p>See how each social account is performing.</p></div><Alert message={error || loadError}/>
    <div className="bridge-library-toolbar"><div className="bridge-filter-tabs"><button className={mode === "accounts" ? "active" : ""} onClick={() => setScope("accounts")}>Account performance</button><button className={mode === "posts" ? "active" : ""} onClick={() => setScope("posts")}>Post performance</button><button className={mode === "post" ? "active" : ""} onClick={() => setScope("post", "", postId || data.posts.find(item => item.deliveries.some(published))?.id || "")}>Same post, different accounts</button></div></div>
    <div className="bridge-analytics-scope"><strong>{scopeLabel}</strong><span>Posts published through Meadow</span></div>
    {account?.platform === "youtube" && mode === "posts" ? <p className="bridge-small">YouTube metrics are shown per video below. Account totals are not combined.</p> : <div className="bridge-stat-grid">{["engagement", "views", "impressions", "clicks"].map(key => <div className="bridge-stat" key={key}><span>{labels[key]}</span><strong><MetricValue totals={totals || { values: {} }} metric={key}/></strong><small>{key === "engagement" ? "Reported likes + comments + shares + saves" : "Reported post metrics"}</small></div>)}</div>}
    <div className="bridge-analytics-filters">{mode === "posts" && <label>Account<select value={accountId} onChange={event => { setAccountId(event.target.value); setCompare([]); }}><option value="">All accounts combined</option>{accounts.map(item => <option key={item.id} value={item.id}>{accountLabel(item, catalog)}</option>)}</select></label>}{mode === "post" && <label>Post<select value={postId} onChange={event => setPostId(event.target.value)}><option value="">Choose a published post</option>{data.posts.filter(item => item.deliveries.some(published)).map(item => <option key={item.id} value={item.id}>{(item.title || item.caption || "Media post").slice(0, 100)}</option>)}</select></label>}<label>Rank by<select value={metric} onChange={event => setMetric(event.target.value)}>{metrics.map(metric => <option value={metric} key={metric}>{labels[metric]}</option>)}</select></label></div>
    <div className="bridge-panel bridge-analytics-main">
      <div className="bridge-section-label"><div><h2>{mode === "accounts" ? "Your social accounts" : mode === "post" ? "One post. Every destination." : account ? `Top posts · ${account.label}` : "Top posts across all accounts"}</h2><p className="bridge-small">{mode === "post" ? "Each row shows this post’s performance on one account." : `Sorted by ${labels[metric].toLowerCase()}. Select up to five ${mode === "accounts" ? "accounts" : "posts"} to compare.`}</p></div><div className="bridge-analytics-board-actions"><Badge>{mode === "post" ? postRows.length : rows.length} {mode === "posts" ? "posts" : "accounts"}</Badge><button type="button" className="bridge-button secondary small" disabled={busy || !data.publishedCount} aria-busy={busy} onClick={refresh}><Icon name="refresh" size={16}/>{busy ? "Refreshing…" : "Refresh analytics"}</button></div></div>
      {mode === "post" ? postRows.length ? <>
        <ComparisonChart rows={postRows.map(row => ({ id: row.id, label: accountLabel(row, catalog), values: row.values }))} metric={metric}/>
        <div className="bridge-table-scroll"><table className="bridge-table"><thead><tr><th>Account</th>{metrics.map(metric => <th key={metric}>{labels[metric]}</th>)}<th>Last updated</th></tr></thead><tbody>{postRows.map(row => <tr key={row.id}><td><AccountIdentity account={row} catalog={catalog}/>{row.metricsNote && <p className="bridge-analytics-table-note">{row.metricsNote}</p>}{row.metricsError && <p className="bridge-analytics-table-note bridge-validation-error">{row.metricsError}</p>}</td><MetricCells totals={{ values: row.values }}/><td>{dateTime(row.metricsUpdatedAt, project.timeZone)}</td></tr>)}<tr className="bridge-total-row"><td>Combined total (excludes YouTube)</td><MetricCells totals={post.totals}/><td/></tr></tbody></table></div>
      </> : <Empty icon="analytics" title="Choose a published post">Compare the same content across its destinations once it has been published.</Empty> : rows.length ? <>
        {comparisonRows.length > 0 && <div className="bridge-comparison"><div className="bridge-section-label"><strong>Selected {mode === "accounts" ? "accounts" : "posts"}</strong><button className="bridge-text-button" onClick={() => setCompare([])}>Clear comparison</button></div><ComparisonChart rows={comparisonRows} metric={metric}/></div>}
        {mode === "accounts" ? <div className="bridge-account-analytics-grid">{rows.map(row => <AccountAnalyticsCard key={row.id} account={row} catalog={catalog} timeZone={project.timeZone} selected={compare.includes(row.id)} compareDisabled={!compare.includes(row.id) && compare.length >= 5} onCompare={checked => toggleComparison(row.id, checked)} onOpen={() => setScope("posts", row.id)}/>)}</div> : <div className="bridge-table-scroll"><table className="bridge-table"><thead><tr><th>Compare</th><th>Post / accounts</th><th>Accounts</th>{metrics.map(key => <th key={key}><button className={metric === key ? "active" : ""} onClick={() => setMetric(key)}>{labels[key]}{metric === key ? " ↓" : ""}</button></th>)}<th>Last updated</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id}><td><input type="checkbox" aria-label={`Compare ${row.title}`} checked={compare.includes(row.id)} disabled={!compare.includes(row.id) && compare.length >= 5} onChange={event => toggleComparison(row.id, event.target.checked)}/></td><td><button className="bridge-table-title" onClick={() => setScope("post", "", row.id)}><span className="bridge-rank">{index + 1}</span><span>{row.title.slice(0, 90)}</span></button><div className="bridge-analytics-post-accounts">{row.deliveries.filter(published).map(delivery => <span key={delivery.id}><PlatformBadge platform={delivery.platform} catalog={catalog}/>{accountLabel(delivery, catalog)}</span>)}</div>{row.delivery?.metricsNote && <p className="bridge-analytics-table-note">{row.delivery.metricsNote}</p>}{row.delivery?.metricsError && <p className="bridge-analytics-table-note bridge-validation-error">{row.delivery.metricsError}</p>}</td><td>{row.count}</td><MetricCells totals={row.totals}/><td>{dateTime(Math.max(0, ...row.deliveries.filter(published).map(delivery => delivery.metricsUpdatedAt || 0)), project.timeZone)}</td></tr>)}</tbody></table></div>}
      </> : <Empty icon="analytics" title={loading ? "Loading analytics…" : mode === "accounts" ? "Connect a social account" : "Your results start with a post"}>{mode === "accounts" ? "Your connected accounts and their reported post metrics will appear here." : "Once your content is published, you’ll be able to compare its performance here."}</Empty>}
    </div>
    <div className="bridge-analytics-notes"><p>{data.engagementDefinition || "Engagement = likes + comments + shares + saves, where reported. Views are separate."}</p><p>— means unavailable or not yet reported. * marks a partial total. Reporting availability and timing vary by platform; refreshes may take a moment. These totals do not deduplicate people across accounts.</p></div>
  </>;
}
