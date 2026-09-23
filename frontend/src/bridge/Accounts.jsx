import { useEffect, useRef, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Badge, Check, dateTime, Field, Modal, PlatformIcon } from "./ui.jsx";

import { sortPlatforms } from "./platforms.js";
import { ConnectionPrivacyModal } from "./ConnectionPrivacy.jsx";
import { createAccountOperations } from "./accountOperations.js";

export default function Accounts(props) {
  return <ProjectAccounts key={props.project.id} {...props}/>;
}

function ProjectAccounts({ project, accounts, catalog, config, onChanged, onRemovalChange, connectionId, clearConnection }) {
  const [disclosure, setDisclosure] = useState(null);
  const [error, setError] = useState(""), [connecting, setConnecting] = useState(""), [attaching, setAttaching] = useState(false), [attachError, setAttachError] = useState("");
  const [bluesky, setBluesky] = useState(false), [handle, setHandle] = useState(""), [pending, setPending] = useState(null), [selected, setSelected] = useState([]), [disconnect, setDisconnect] = useState(null), [details, setDetails] = useState(null);
  const [accountActions, setAccountActions] = useState({}), [removedIds, setRemovedIds] = useState(() => new Set());
  const operations = useRef(null), detailRequest = useRef(null), callbacks = useRef(null);
  callbacks.current = { onChanged, onRemovalChange, clearConnection, connectionId };
  useEffect(() => {
    const scope = createAccountOperations();
    operations.current = scope;
    return () => scope.dispose();
  }, []);
  useEffect(() => {
    setPending(null); setSelected([]); setAttachError("");
    if (!connectionId) return;
    const controller = new AbortController(), scope = operations.current, token = scope.start("candidates");
    api.project(project.id, `/connections/${connectionId}`, { signal: controller.signal }).then(data => {
      if (!scope.current(token) || controller.signal.aborted) return;
      setPending(data); setSelected(data.candidates.length === 1 ? [data.candidates[0].remoteId] : []);
    }).catch(error => { if (scope.current(token) && error.name !== "AbortError") setError(error.message); }).finally(() => scope.finish(token));
    return () => { controller.abort(); scope.finish(token); };
  }, [connectionId, project.id]);
  useEffect(() => {
    // Hold accepted deletions out of stale list responses until the server has
    // acknowledged them, then allow a subsequently reconnected account back in.
    setRemovedIds(current => {
      const next = new Set([...current].filter(id => accounts.some(account => account.id === id && !["disconnected", "deleting"].includes(account.status))));
      return next.size === current.size ? current : next;
    });
  }, [accounts, removedIds]);
  function closeDetails() { detailRequest.current = null; setDetails(null); }
  function setAccountAction(id, action) {
    setAccountActions(current => {
      const next = { ...current };
      if (action) next[id] = action; else delete next[id];
      return next;
    });
  }
  async function beginConnection(platform) {
    if (connecting) return;
    closeDetails(); setError("");
    if (platform === "bluesky") { setBluesky(true); return; }
    if (!catalog.find(item => item.id === platform)?.privacyDisclosure) { await connect(platform); return; }
    const scope = operations.current, token = scope.start("connect");
    if (!token) return;
    setConnecting(platform);
    try { const result = await api.request(`/privacy/connections/${platform}`); if (scope.current(token)) setDisclosure(result.disclosure); }
    catch (error) { if (scope.current(token)) setError(error.message); }
    finally { if (scope.finish(token)) setConnecting(""); }
  }
  async function connect(platform, consent) {
    const scope = operations.current, token = scope.start("connect");
    if (!token) return;
    setConnecting(platform); setError("");
    try {
      const result = await api.project(project.id, `/accounts/connect/${platform}`, { method: "POST", body: { ...(platform === "bluesky" ? { handle } : {}), ...(consent ? { consent } : {}) } });
      if (scope.current(token)) window.location.assign(result.url);
    } catch (error) { if (scope.finish(token)) { setError(error.message); setConnecting(""); } }
  }
  async function attach() {
    if (!connectionId || !selected.length) return;
    const scope = operations.current, token = scope.start("attach"), id = connectionId;
    if (!token) return;
    setAttaching(true); setAttachError(""); closeDetails();
    try {
      await api.project(project.id, `/connections/${id}`, { method: "POST", body: { selectedIds: selected } });
      callbacks.current.onChanged();
      if (!scope.current(token)) return;
      if (callbacks.current.connectionId === id) { setPending(null); callbacks.current.clearConnection(); }
    } catch (error) { if (scope.current(token) && callbacks.current.connectionId === id) setAttachError(error.message); }
    finally { if (scope.finish(token)) setAttaching(false); }
  }
  async function remove() {
    const account = disconnect;
    if (!account) return;
    const scope = operations.current, token = scope.start(`account:${account.id}`);
    if (!token) return;
    setDisconnect(null); closeDetails();
    setAccountAction(account.id, { kind: "remove", account, pending: true });
    callbacks.current.onRemovalChange?.(account.id, true);
    try {
      await api.project(project.id, `/accounts/${account.id}`, { method: "DELETE" });
      callbacks.current.onChanged();
      if (!scope.current(token)) return;
      setRemovedIds(current => new Set([...current, account.id]));
      setAccountAction(account.id, null);
    } catch (error) {
      callbacks.current.onRemovalChange?.(account.id, false);
      if (scope.current(token)) setAccountAction(account.id, { kind: "remove", account, pending: false, error: `Could not disconnect ${account.label}: ${error.message}` });
    } finally { scope.finish(token); }
  }
  async function allowance(account) {
    const scope = operations.current, token = scope.start(`account:${account.id}`);
    if (!token) return;
    detailRequest.current = token; setDetails(null);
    setAccountAction(account.id, { kind: "refresh", account, pending: true });
    try {
      const { options } = await api.project(project.id, `/accounts/${account.id}/options?refresh=1`);
      callbacks.current.onChanged();
      if (!scope.current(token)) return;
      if (detailRequest.current === token) setDetails({ ...account, options });
      setAccountAction(account.id, null);
    } catch (error) {
      if (scope.current(token)) setAccountAction(account.id, { kind: "refresh", account, pending: false, error: `Could not refresh ${account.label}: ${error.message}` });
    } finally { scope.finish(token); }
  }
  const connected = accounts.filter(account => !["disconnected", "deleting"].includes(account.status) && !removedIds.has(account.id) && !(accountActions[account.id]?.kind === "remove" && accountActions[account.id]?.pending));
  const displayed = [...connected];
  for (const action of Object.values(accountActions)) if (action.kind === "remove" && action.pending && !displayed.some(account => account.id === action.account.id)) displayed.push(action.account);
  const platforms = sortPlatforms(catalog);
  return <><div className="bridge-intro-row"><p>Connect the profiles, pages, and channels for <strong>{project.name}</strong>. Each account publishes independently.</p><Badge status="connected">{connected.length} connected</Badge></div><Alert message={error}/>
    <div className="bridge-connections-board" aria-label="Social connection board">{platforms.map(platform => {
      const platformAccounts = displayed.filter(account => account.platform === platform.id);
      const unconfigured = !platform.configured;
      const unavailable = unconfigured || !config.connectionsReady;
      return <section className="bridge-connection-column" style={{ "--platform-color": platform.color }} key={platform.id}><header className="bridge-connection-column-header"><span className="bridge-social-icon"><PlatformIcon platform={platform.id} size={26}/></span><div><h2>{platform.name}</h2><span>{platform.accountType}</span></div><strong>{connected.filter(account => account.platform === platform.id).length}</strong></header><div className="bridge-connection-column-body">{platformAccounts.map(account => {
        const action = accountActions[account.id], accountBusy = Boolean(action?.pending), removing = accountBusy && action.kind === "remove";
        return <article className="bridge-connection-card" key={account.id} aria-busy={accountBusy}><div className="bridge-connection-card-heading">{account.avatar ? <img src={account.avatar} alt=""/> : <span className="bridge-account-avatar">{account.label.slice(0, 1).toUpperCase()}</span>}<div><strong>{account.label}</strong><span role={removing ? "status" : undefined}>{removing ? "Disconnecting…" : account.status === "connected" ? "Connected" : "Reconnect required"}</span></div><span className={`bridge-connection-state ${removing ? "deleting" : account.status}`}/></div><div className="bridge-connection-card-actions">{account.status === "connected" && <button className="bridge-text-button" onClick={() => allowance(account)} disabled={accountBusy}><Icon name="refresh" size={14}/>{accountBusy && action.kind === "refresh" ? " Refreshing…" : " Refresh"}</button>}{account.status === "reconnect_required" && <button className="bridge-text-button reconnect" onClick={() => beginConnection(account.platform)} disabled={accountBusy || Boolean(connecting)}>Reconnect</button>}<button className="bridge-icon-button" disabled={accountBusy} onClick={() => { closeDetails(); setDisconnect(account); }} aria-label={`Disconnect ${account.label}`}><Icon name="close" size={15}/></button></div><Alert message={action?.error}/></article>;
      })}{!platformAccounts.length && <div className="bridge-connection-empty"><span className="bridge-social-icon"><PlatformIcon platform={platform.id} size={22}/></span><p>No {platform.accountType.toLowerCase()} connected</p></div>}</div><div className="bridge-connection-column-footer"><div className="bridge-format-list">{platform.formats.map(format => <span key={format}>{format}</span>)}</div><button className="bridge-button secondary" disabled={Boolean(connecting) || unavailable || config.localPreview} onClick={() => beginConnection(platform.id)}><Icon name="plus" size={16}/>{connecting === platform.id ? "Connecting…" : unconfigured ? "Coming soon" : !config.connectionsReady ? "Connections unavailable" : `Connect ${platform.name}`}</button></div></section>;
    })}</div>
    {disclosure && <ConnectionPrivacyModal key={disclosure.platform} disclosure={disclosure} busy={Boolean(connecting)} error={error} onClose={() => { setDisclosure(null); setError(""); }} onContinue={consent => connect(disclosure.platform, consent)}/>}
    {bluesky && <Modal title="Connect Bluesky" onClose={() => setBluesky(false)} busy={Boolean(connecting)}><p>Enter your handle. Bluesky will ask you to authorize Meadow.</p><Alert message={error}/><form onSubmit={event => { event.preventDefault(); connect("bluesky"); }}><Field label="Bluesky handle"><input required value={handle} onChange={event => setHandle(event.target.value.replace(/^@/, ""))} placeholder="name.bsky.social" autoComplete="off" disabled={Boolean(connecting)}/></Field><button className="bridge-button" disabled={Boolean(connecting)}>{connecting ? "Connecting…" : "Continue to Bluesky"}<Icon name="arrow" size={17}/></button></form></Modal>}
    {pending && <Modal title="Choose accounts for this project" onClose={() => { setPending(null); clearConnection(); }} busy={attaching}><p>Authorized accounts are ready to add to {project.name}.</p><Alert message={attachError}/><div className="bridge-candidate-list">{pending.candidates.map(candidate => <Check key={candidate.remoteId} checked={selected.includes(candidate.remoteId)} disabled={attaching} onChange={event => setSelected(current => event.target.checked ? [...current, candidate.remoteId] : current.filter(id => id !== candidate.remoteId))}>{candidate.label}</Check>)}</div><button className="bridge-button" disabled={!selected.length || attaching} onClick={attach}>{attaching ? "Adding…" : `Add ${selected.length || "selected"} accounts`}</button></Modal>}
    {disconnect && <Modal title="Disconnect account" onClose={() => setDisconnect(null)}><p>Remove {disconnect.label}? Meadow will stop new deliveries and delete this connection’s stored credentials, profile, delivery history, and metrics. This also removes matching connections in your other Meadow workspaces. Your original media, captions, and posts for other destinations stay in Meadow.</p><p>Posts already published remain on the social platform. A request already sent may still finish.</p>{["youtube", "google_business"].includes(disconnect.platform) && <p>Google removes the whole authorization, which may affect other channels or Google connections. You can manage access in <a href="https://security.google.com/settings/security/permissions" target="_blank" rel="noreferrer">Google settings</a>.</p>}{disconnect.platform === "pinterest" && <p>Also remove Meadow from <a href="https://www.pinterest.com/settings/security" target="_blank" rel="noreferrer">Pinterest’s app settings</a> to revoke the authorization at Pinterest.</p>}{disconnect.platform === "telegram" && <p>Also remove Meadow Publisher from the channel’s administrators or the group’s members to end its access in Telegram.</p>}<div className="bridge-modal-actions"><button className="bridge-button secondary" onClick={() => setDisconnect(null)}>Keep connected</button><button className="bridge-button danger" disabled={Boolean(accountActions[disconnect.id]?.pending)} onClick={remove}>Disconnect</button></div></Modal>}
    {details && <Modal title={`${details.label} · posting allowance`} onClose={closeDetails}><div className="bridge-allowance-summary"><strong>{details.options.remaining ?? "—"}</strong><span>{details.options.limit ? `of ${details.options.limit} posts available` : "Exact allowance not reported"}</span></div><p>{details.options.note}</p>{details.options.resetAt && <p>Resets {dateTime(details.options.resetAt, project.timeZone)}</p>}{details.blockedUntil > Date.now() && <p>Meadow will check again at {dateTime(details.blockedUntil, project.timeZone)}.</p>}</Modal>}
  </>;
}
