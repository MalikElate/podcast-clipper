import { useEffect, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Badge, Check, dateTime, Empty, Field, Modal, PlatformBadge } from "./ui.jsx";

export default function Accounts({ project, accounts, catalog, config, onChanged, connectionId, clearConnection }) {
  const [error, setError] = useState(""), [busy, setBusy] = useState(""), [bluesky, setBluesky] = useState(false), [handle, setHandle] = useState(""), [pending, setPending] = useState(null), [selected, setSelected] = useState([]), [disconnect, setDisconnect] = useState(null), [details, setDetails] = useState(null);
  useEffect(() => {
    if (!connectionId) return;
    const controller = new AbortController();
    api.project(project.id, `/connections/${connectionId}`, { signal: controller.signal }).then(data => { setPending(data); setSelected(data.candidates.length === 1 ? [data.candidates[0].remoteId] : []); }).catch(error => { if (error.name !== "AbortError") setError(error.message); });
    return () => controller.abort();
  }, [connectionId, project.id]);
  async function connect(platform) {
    setBusy(platform); setError("");
    try { const result = await api.project(project.id, `/accounts/connect/${platform}`, { method: "POST", body: platform === "bluesky" ? { handle } : {} }); window.location.assign(result.url); }
    catch (error) { setError(error.message); setBusy(""); }
  }
  async function attach() {
    setBusy("attach"); setError("");
    try { await api.project(project.id, `/connections/${connectionId}`, { method: "POST", body: { selectedIds: selected } }); setPending(null); clearConnection(); onChanged(); }
    catch (error) { setError(error.message); } finally { setBusy(""); }
  }
  async function remove() {
    setBusy(disconnect.id); setError("");
    try { await api.project(project.id, `/accounts/${disconnect.id}`, { method: "DELETE" }); setDisconnect(null); onChanged(); }
    catch (error) { setError(error.message); } finally { setBusy(""); }
  }
  async function allowance(account) {
    setBusy(account.id); setError("");
    try { const { options } = await api.project(project.id, `/accounts/${account.id}/options?refresh=1`); setDetails({ ...account, options }); onChanged(); }
    catch (error) { setError(error.message); } finally { setBusy(""); }
  }
  const connected = accounts.filter(account => account.status !== "disconnected");
  return <><div className="bridge-intro-row"><p>Connect the profiles, pages, and channels for <strong>{project.name}</strong>. Each account publishes independently.</p><Badge status="connected">{connected.length} connected</Badge></div><Alert message={error}/>
    <div className="bridge-account-grid">{catalog.map(platform => <article className="bridge-panel bridge-platform-card" key={platform.id}><div className="bridge-section-label"><PlatformBadge platform={platform.id} catalog={catalog} size="large"/><span>{accounts.filter(account => account.platform === platform.id && account.status === "connected").length || ""}</span></div><h2>{platform.name}</h2><p>{platform.accountType}</p><div className="bridge-format-list">{platform.formats.map(format => <span key={format}>{format}</span>)}</div><button className="bridge-button secondary" disabled={Boolean(busy) || !platform.configured || !config.connectionsReady || config.localPreview} onClick={() => platform.id === "bluesky" ? setBluesky(true) : connect(platform.id)}><Icon name="plus" size={16}/>{busy === platform.id ? "Connecting…" : !platform.configured || !config.connectionsReady ? "Not available yet" : "Connect account"}</button></article>)}</div>
    <div className="bridge-section-heading"><h2>Your connected accounts</h2><span>{project.name}</span></div>
    {!connected.length ? <div className="bridge-panel"><Empty icon="accounts" title="All your channels, one place">Connect your first account above. Accounts from other projects stay separate.</Empty></div> : <div className="bridge-panel bridge-account-list">{connected.map(account => <div key={account.id} className="bridge-account-row"><PlatformBadge platform={account.platform} catalog={catalog}/><div className="bridge-grow"><strong>{account.label}</strong><span>{catalog.find(item => item.id === account.platform)?.name}</span></div><Badge status={account.status}/><div className="bridge-inline-actions">{account.status === "connected" && <button className="bridge-button secondary small" onClick={() => allowance(account)} disabled={Boolean(busy)}>Allowance</button>}{account.status === "reconnect_required" && <button className="bridge-button small" onClick={() => account.platform === "bluesky" ? setBluesky(true) : connect(account.platform)} disabled={Boolean(busy)}>Reconnect</button>}<button className="bridge-icon-button" disabled={Boolean(busy)} onClick={() => setDisconnect(account)} aria-label={`Disconnect ${account.label}`}><Icon name="trash" size={18}/></button></div></div>)}</div>}
    {bluesky && <Modal title="Connect Bluesky" onClose={() => setBluesky(false)} busy={Boolean(busy)}><p>Enter your handle. Bluesky will ask you to authorize Bridge.</p><Alert message={error}/><form onSubmit={event => { event.preventDefault(); connect("bluesky"); }}><Field label="Bluesky handle"><input required value={handle} onChange={event => setHandle(event.target.value.replace(/^@/, ""))} placeholder="name.bsky.social" autoComplete="off"/></Field><button className="bridge-button" disabled={Boolean(busy)}>{busy ? "Connecting…" : "Continue to Bluesky"}<Icon name="arrow" size={17}/></button></form></Modal>}
    {pending && <Modal title="Choose accounts for this project" onClose={() => { setPending(null); clearConnection(); }} busy={Boolean(busy)}><p>Authorized accounts are ready to add to {project.name}.</p><Alert message={error}/><div className="bridge-candidate-list">{pending.candidates.map(candidate => <Check key={candidate.remoteId} checked={selected.includes(candidate.remoteId)} onChange={event => setSelected(current => event.target.checked ? [...current, candidate.remoteId] : current.filter(id => id !== candidate.remoteId))}>{candidate.label}</Check>)}</div><button className="bridge-button" disabled={!selected.length || Boolean(busy)} onClick={attach}>{busy ? "Adding…" : `Add ${selected.length || "selected"} accounts`}</button></Modal>}
    {disconnect && <Modal title="Disconnect account" onClose={() => setDisconnect(null)} busy={Boolean(busy)}><p>Disconnect {disconnect.label} from this project? Its pending deliveries will wait until the account is reconnected. Published history remains available.</p><Alert message={error}/><div className="bridge-modal-actions"><button className="bridge-button secondary" onClick={() => setDisconnect(null)}>Keep connected</button><button className="bridge-button danger" disabled={Boolean(busy)} onClick={remove}>Disconnect</button></div></Modal>}
    {details && <Modal title={`${details.label} · posting allowance`} onClose={() => setDetails(null)}><div className="bridge-allowance-summary"><strong>{details.options.remaining ?? "—"}</strong><span>{details.options.limit ? `of ${details.options.limit} posts available` : "Exact allowance not reported"}</span></div><p>{details.options.note}</p>{details.options.resetAt && <p>Resets {dateTime(details.options.resetAt, project.timeZone)}</p>}{details.blockedUntil > Date.now() && <p>Bridge will check again at {dateTime(details.blockedUntil, project.timeZone)}.</p>}</Modal>}
  </>;
}
