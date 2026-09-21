import { useEffect, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Badge, Check, dateTime, Field, Modal, PlatformIcon } from "./ui.jsx";

import { sortPlatforms } from "./platforms.js";
import { ConnectionPrivacyModal } from "./ConnectionPrivacy.jsx";

export default function Accounts({ project, accounts, catalog, config, onChanged, connectionId, clearConnection }) {
  const [disclosure, setDisclosure] = useState(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(""), [bluesky, setBluesky] = useState(false), [handle, setHandle] = useState(""), [pending, setPending] = useState(null), [selected, setSelected] = useState([]), [disconnect, setDisconnect] = useState(null), [details, setDetails] = useState(null);
  useEffect(() => {
    if (!connectionId) return;
    const controller = new AbortController();
    api.project(project.id, `/connections/${connectionId}`, { signal: controller.signal }).then(data => { setPending(data); setSelected(data.candidates.length === 1 ? [data.candidates[0].remoteId] : []); }).catch(error => { if (error.name !== "AbortError") setError(error.message); });
    return () => controller.abort();
  }, [connectionId, project.id]);
  async function beginConnection(platform) {
    if (platform === "bluesky") { setBluesky(true); return; }
    if (!catalog.find(item => item.id === platform)?.privacyDisclosure) { await connect(platform); return; }
    setBusy(platform); setError("");
    try { const result = await api.request(`/privacy/connections/${platform}`); setDisclosure(result.disclosure); }
    catch (error) { setError(error.message); } finally { setBusy(""); }
  }
  async function connect(platform, consent) {
    setBusy(platform); setError("");
    try { const result = await api.project(project.id, `/accounts/connect/${platform}`, { method: "POST", body: { ...(platform === "bluesky" ? { handle } : {}), ...(consent ? { consent } : {}) } }); window.location.assign(result.url); }
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
  const connected = accounts.filter(account => !["disconnected", "deleting"].includes(account.status));
  const platforms = sortPlatforms(catalog);
  return <><div className="bridge-intro-row"><p>Connect the profiles, pages, and channels for <strong>{project.name}</strong>. Each account publishes independently.</p><Badge status="connected">{connected.length} connected</Badge></div><Alert message={error}/>
    <div className="bridge-connections-board" aria-label="Social connection board">{platforms.map(platform => {
      const platformAccounts = connected.filter(account => account.platform === platform.id);
      const comingSoon = !platform.configured;
      const unavailable = comingSoon || !config.connectionsReady;
      return <section className="bridge-connection-column" style={{ "--platform-color": platform.color }} key={platform.id}><header className="bridge-connection-column-header"><span className="bridge-social-icon"><PlatformIcon platform={platform.id} size={26}/></span><div><h2>{platform.name}</h2><span>{platform.accountType}</span></div><strong>{platformAccounts.length}</strong></header><div className="bridge-connection-column-body">{platformAccounts.map(account => <article className="bridge-connection-card" key={account.id}><div className="bridge-connection-card-heading">{account.avatar ? <img src={account.avatar} alt=""/> : <span className="bridge-account-avatar">{account.label.slice(0, 1).toUpperCase()}</span>}<div><strong>{account.label}</strong><span>{account.status === "connected" ? "Connected" : "Reconnect required"}</span></div><span className={`bridge-connection-state ${account.status}`}/></div><div className="bridge-connection-card-actions">{account.status === "connected" && <button className="bridge-text-button" onClick={() => allowance(account)} disabled={Boolean(busy)}><Icon name="refresh" size={14}/> Refresh</button>}{account.status === "reconnect_required" && <button className="bridge-text-button reconnect" onClick={() => beginConnection(account.platform)} disabled={Boolean(busy)}>Reconnect</button>}<button className="bridge-icon-button" disabled={Boolean(busy)} onClick={() => setDisconnect(account)} aria-label={`Disconnect ${account.label}`}><Icon name="close" size={15}/></button></div></article>)}{!platformAccounts.length && <div className="bridge-connection-empty"><span className="bridge-social-icon"><PlatformIcon platform={platform.id} size={22}/></span><p>No {platform.accountType.toLowerCase()} connected</p></div>}</div><div className="bridge-connection-column-footer"><div className="bridge-format-list">{platform.formats.map(format => <span key={format}>{format}</span>)}</div><button className="bridge-button secondary" disabled={Boolean(busy) || unavailable || config.localPreview} onClick={() => beginConnection(platform.id)}><Icon name="plus" size={16}/>{busy === platform.id ? "Connecting…" : comingSoon ? "Coming soon" : !config.connectionsReady ? "Connections unavailable" : `Connect ${platform.name}`}</button></div></section>;
    })}</div>
    {disclosure && <ConnectionPrivacyModal key={disclosure.platform} disclosure={disclosure} busy={Boolean(busy)} error={error} onClose={() => { setDisclosure(null); setError(""); }} onContinue={consent => connect(disclosure.platform, consent)}/>}
    {bluesky && <Modal title="Connect Bluesky" onClose={() => setBluesky(false)} busy={Boolean(busy)}><p>Enter your handle. Bluesky will ask you to authorize Meadow.</p><Alert message={error}/><form onSubmit={event => { event.preventDefault(); connect("bluesky"); }}><Field label="Bluesky handle"><input required value={handle} onChange={event => setHandle(event.target.value.replace(/^@/, ""))} placeholder="name.bsky.social" autoComplete="off"/></Field><button className="bridge-button" disabled={Boolean(busy)}>{busy ? "Connecting…" : "Continue to Bluesky"}<Icon name="arrow" size={17}/></button></form></Modal>}
    {pending && <Modal title="Choose accounts for this project" onClose={() => { setPending(null); clearConnection(); }} busy={Boolean(busy)}><p>Authorized accounts are ready to add to {project.name}.</p><Alert message={error}/><div className="bridge-candidate-list">{pending.candidates.map(candidate => <Check key={candidate.remoteId} checked={selected.includes(candidate.remoteId)} onChange={event => setSelected(current => event.target.checked ? [...current, candidate.remoteId] : current.filter(id => id !== candidate.remoteId))}>{candidate.label}</Check>)}</div><button className="bridge-button" disabled={!selected.length || Boolean(busy)} onClick={attach}>{busy ? "Adding…" : `Add ${selected.length || "selected"} accounts`}</button></Modal>}
    {disconnect && <Modal title="Disconnect account" onClose={() => setDisconnect(null)} busy={Boolean(busy)}><p>Remove {disconnect.label}? Meadow will stop new deliveries and delete this connection’s stored credentials, profile, delivery history, and metrics. This also removes matching connections in your other Meadow workspaces. Your original media, captions, and posts for other destinations stay in Meadow.</p><p>Posts already published remain on the social platform. A request already sent may still finish.</p>{["youtube", "google_business"].includes(disconnect.platform) && <p>Google removes the whole authorization, which may affect other channels or Google connections. You can manage access in <a href="https://security.google.com/settings/security/permissions" target="_blank" rel="noreferrer">Google settings</a>.</p>}{disconnect.platform === "pinterest" && <p>Also remove Meadow from <a href="https://www.pinterest.com/settings/security" target="_blank" rel="noreferrer">Pinterest’s app settings</a> to revoke the authorization at Pinterest.</p>}<Alert message={error}/><div className="bridge-modal-actions"><button className="bridge-button secondary" onClick={() => setDisconnect(null)}>Keep connected</button><button className="bridge-button danger" disabled={Boolean(busy)} onClick={remove}>Disconnect</button></div></Modal>}
    {details && <Modal title={`${details.label} · posting allowance`} onClose={() => setDetails(null)}><div className="bridge-allowance-summary"><strong>{details.options.remaining ?? "—"}</strong><span>{details.options.limit ? `of ${details.options.limit} posts available` : "Exact allowance not reported"}</span></div><p>{details.options.note}</p>{details.options.resetAt && <p>Resets {dateTime(details.options.resetAt, project.timeZone)}</p>}{details.blockedUntil > Date.now() && <p>Meadow will check again at {dateTime(details.blockedUntil, project.timeZone)}.</p>}</Modal>}
  </>;
}
