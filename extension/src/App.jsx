import { useEffect, useRef, useState } from "react";
import Composer from "../../frontend/src/bridge/Composer.jsx";
import { Alert, Badge, PlatformBadge } from "../../frontend/src/bridge/ui.jsx";
import { api, MAX_UPLOAD_BYTES } from "./api.js";
import { auth } from "./auth.js";
import "../../frontend/src/bridge/bridge.css";
import "./app.css";

const APP_ORIGIN = "https://app.findmeadow.com";
const DISCLOSURE_KEY = "meadowCrosspostDisclosure";
const messageOf = error => error?.message || "Meadow could not complete this request. Please try again.";
const currentTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export const websiteUrl = (path, projectId = "") => {
  const url = new URL(path, APP_ORIGIN);
  if (url.origin !== APP_ORIGIN || !(url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/"))) throw new Error("Invalid Meadow page.");
  if (projectId) url.searchParams.set("project", projectId);
  return url.href;
};

export async function loadWorkspaces(client, signal) {
  const [config, result] = await Promise.all([client.request("/config", { signal }), client.getProjects(signal)]);
  signal?.throwIfAborted();
  return { config, projects: result.projects || [] };
}

export async function loadProjectResources(client, projectId, signal) {
  const [accounts, media] = await Promise.all([
    client.project(projectId, "/accounts", { signal }), client.project(projectId, "/media", { signal }),
  ]);
  signal?.throwIfAborted();
  return { projectId, accounts: accounts.accounts || [], media: media.media || [] };
}

export async function uploadFiles(client, projectId, files, maxUploadBytes, { signal, onProgress = () => {} } = {}) {
  const uploaded = [], failures = [];
  for (const [index, file] of files.entries()) {
    const progress = event => onProgress({ ...event, filename: file.name, fileIndex: index + 1, fileCount: files.length });
    try {
      signal?.throwIfAborted();
      if (file.size > maxUploadBytes) throw new Error(`exceeds ${Math.round(maxUploadBytes / 1024 ** 2)} MB`);
      const result = await client.uploadMedia(projectId, file, { signal, onProgress: progress });
      uploaded.push(result.media);
    } catch (error) {
      failures.push(`${file.name}: ${error.name === "AbortError" ? "Upload cancelled. Select the file again when you are ready." : messageOf(error)}`);
      if (signal?.aborted || error.status === 401) break;
    }
  }
  if (failures.length) onProgress({ stage: signal?.aborted ? "cancelled" : "failed", error: failures.slice(0, 5).join(" · ") });
  return { uploaded, error: failures.slice(0, 5).join(" · ") };
}

export function mergeSubmissionStatuses(accepted, latest) {
  const byId = new Map(latest.map(post => [post.id, post]));
  return accepted.map(post => byId.get(post.id) || post);
}

export const pollDelay = (pending, retryAfterMs) => Math.max(5000, Number(retryAfterMs) || Number(pending?.interval) * 1000 || 5000);
export const uploadLimit = config => Math.min(Number(config?.maxUploadBytes) > 0 ? config.maxUploadBytes : MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES);
export const canCompose = ({ connection, acknowledged, workspace, projectId, resources, resourcesLoading, resourcesError }) => Boolean(
  connection.status === "connected" && acknowledged && workspace.keyId === connection.keyId && resources.keyId === connection.keyId
  && workspace.projects.some(project => project.id === projectId) && resources.projectId === projectId
  && !workspace.loading && !workspace.error && !resourcesLoading && !resourcesError,
);

export function ConnectionPanel({ pending, connecting, error, acknowledged, disclosureAccepted = false, onAcknowledge, onConnect, onCancel, preserving = false, alreadyConnected = false }) {
  return <section className="bridge-panel crosspost-connect" aria-labelledby="connection-heading">
    <h2 id="connection-heading">{preserving ? "Reconnect to Meadow" : "Connect Meadow"}</h2>
    <p>{preserving ? "Your unsent post is kept in this tab. Reconnect to continue." : "Use your Meadow workspaces and connected social accounts here."}</p>
    <div className="crosspost-disclosure"><p>Connecting creates a dedicated key with full access to your Meadow workspaces. The key stays in this Chrome profile until you disconnect. Disconnecting removes the local key; it does not revoke it in Meadow. You can revoke it in <a href={websiteUrl("/dashboard/api-keys")} target="_blank" rel="noreferrer">Meadow API keys</a>.</p>{!acknowledged && <><p>Files you select are uploaded to Meadow. Your caption and account settings are sent when you save a draft or publish. Clicking Publish starts delivery to the accounts you select. This extension does not read webpages or browsing history.</p><label className="bridge-check"><input type="checkbox" checked={disclosureAccepted} onChange={event => onAcknowledge(event.target.checked)}/><span>I understand how my content and connection are used.</span></label></>}</div>
    {pending ? <div className="crosspost-approval"><p>Sign in and approve the connection in Meadow, then return to this tab.</p><span>Connection code <strong>{pending.userCode}</strong></span><a className="bridge-button" href={pending.verificationUrlComplete} target="_blank" rel="noreferrer">Approve in Meadow</a><p role="status">Waiting for your approval…</p><button type="button" className="bridge-text-button" onClick={onCancel}>Cancel connection</button></div> : <button type="button" className="bridge-button" disabled={connecting || !acknowledged && !disclosureAccepted} onClick={onConnect}>{connecting ? "Connecting…" : alreadyConnected ? "Continue" : "Connect Meadow"}</button>}
    <Alert message={error}/><a href="https://findmeadow.com/privacy/#privacy-chrome-extension" target="_blank" rel="noreferrer" className="crosspost-privacy">Privacy policy</a>
  </section>;
}

export function SubmissionStatus({ posts, catalog, onRefresh, refreshing, error, projectId }) {
  if (!posts.length) return null;
  return <section className="bridge-panel crosspost-results" aria-labelledby="delivery-heading">
    <div className="crosspost-section-heading"><h2 id="delivery-heading">Latest submission</h2><button type="button" className="bridge-button secondary small" onClick={onRefresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh status"}</button></div>
    <p>Meadow accepted these posts for delivery. A queued post has not been published yet.</p>
    {posts.map(post => <div className="crosspost-result" key={post.id}><p className="crosspost-result-caption">{post.caption || post.title || "Media post"}</p>{(post.deliveries || []).length ? <ul>{post.deliveries.map(delivery => <li key={delivery.id}><PlatformBadge platform={delivery.platform} catalog={catalog}/><span>{delivery.accountName || catalog.find(item => item.id === delivery.platform)?.name || delivery.platform}</span><Badge status={delivery.status}/>{delivery.platform === "tiktok" && delivery.status === "awaiting_publish" && <small>Open the inbox notification in TikTok to finish publishing.</small>}{delivery.error && <small className="crosspost-delivery-error">{typeof delivery.error === "string" ? delivery.error : delivery.error.message}</small>}</li>)}</ul> : <p>Delivery status is not available yet.</p>}</div>)}
    <Alert message={error}/><a href={websiteUrl("/dashboard/posts", projectId)} target="_blank" rel="noreferrer">View delivery details in Meadow</a>
  </section>;
}

export default function App() {
  const [connection, setConnection] = useState({ status: "checking" }), [acknowledged, setAcknowledged] = useState(false), [disclosureAccepted, setDisclosureAccepted] = useState(false), [ackLoaded, setAckLoaded] = useState(false);
  const [connecting, setConnecting] = useState(false), [authError, setAuthError] = useState("");
  const [workspace, setWorkspace] = useState({ projects: [], config: null, loading: false, error: "" }), [projectId, setProjectId] = useState("");
  const [resources, setResources] = useState({ projectId: "", accounts: [], media: [] }), [resourcesLoading, setResourcesLoading] = useState(false), [resourcesError, setResourcesError] = useState("");
  const [refresh, setRefresh] = useState(0), [composerVersion, setComposerVersion] = useState(0), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [uploadError, setUploadError] = useState("");
  const [accepted, setAccepted] = useState({ projectId: "", posts: [] }), [statusRefresh, setStatusRefresh] = useState(0), [statusLoading, setStatusLoading] = useState(false), [statusError, setStatusError] = useState("");
  const alive = useRef(true), authController = useRef(null), selectedProject = useRef(projectId);
  selectedProject.current = projectId;
  const connected = connection.status === "connected";

  useEffect(() => {
    alive.current = true;
    const unsubscribe = auth.subscribe(status => { if (alive.current) setConnection(status); });
    auth.status().then(status => { if (alive.current) setConnection(status); }).catch(error => { if (alive.current) { setAuthError(messageOf(error)); setConnection({ status: "disconnected" }); } });
    chrome.storage.local.get(DISCLOSURE_KEY).then(result => { if (alive.current) { setAcknowledged(result[DISCLOSURE_KEY] === true); setAckLoaded(true); } }).catch(error => { if (alive.current) { setAckLoaded(true); setAuthError(messageOf(error)); } });
    return () => { alive.current = false; unsubscribe(); authController.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!connection.pending || connected) return;
    const controller = new AbortController(); let timer;
    async function poll() {
      try {
        const result = await auth.poll({ signal: controller.signal });
        if (controller.signal.aborted) return;
        if (result.status === "approved") { setConnection(await auth.status()); setAuthError(""); }
        else timer = setTimeout(poll, pollDelay(connection.pending, result.retryAfterMs));
      } catch (error) {
        if (!controller.signal.aborted) {
          setAuthError(messageOf(error));
          if (Date.now() < connection.pending.expiresAt && (["network_error", "request_timeout"].includes(error.code) || error.status === 429 || error.status >= 500)) timer = setTimeout(poll, pollDelay(connection.pending, error.retryAfterMs));
        }
      }
    }
    timer = setTimeout(poll, pollDelay(connection.pending));
    return () => { controller.abort(); clearTimeout(timer); };
  }, [connection.pending?.userCode, connected]);

  useEffect(() => {
    if (!connected || !ackLoaded || !acknowledged) return;
    const controller = new AbortController();
    setWorkspace(current => ({ ...current, loading: true, error: "" }));
    loadWorkspaces(api, controller.signal).then(result => {
      if (!controller.signal.aborted) {
        setWorkspace({ ...result, keyId: connection.keyId, loading: false, error: "" });
        setProjectId(current => current || result.projects[0]?.id || "");
      }
    }).catch(error => { if (!controller.signal.aborted) setWorkspace(current => ({ ...current, loading: false, error: messageOf(error) })); });
    return () => controller.abort();
  }, [connected, connection.keyId, ackLoaded, acknowledged, refresh]);

  const project = workspace.projects.find(item => item.id === projectId);
  useEffect(() => {
    if (!connected || !acknowledged || workspace.loading || workspace.keyId !== connection.keyId || !project) return;
    const controller = new AbortController();
    setResourcesLoading(true); setResourcesError("");
    loadProjectResources(api, project.id, controller.signal).then(result => { if (!controller.signal.aborted) { setResources({ ...result, keyId: connection.keyId }); setResourcesLoading(false); } }).catch(error => { if (!controller.signal.aborted) { setResourcesError(messageOf(error)); setResourcesLoading(false); } });
    return () => controller.abort();
  }, [connected, connection.keyId, acknowledged, project?.id, workspace.loading, workspace.keyId, refresh]);

  useEffect(() => {
    if (!connected || !acknowledged || workspace.keyId !== connection.keyId || !project || !accepted.posts.length || accepted.projectId !== projectId) return;
    const controller = new AbortController(); let fetching = false;
    async function updateStatus() {
      if (fetching || controller.signal.aborted || document.hidden) return;
      fetching = true; setStatusLoading(true);
      try {
        const result = await api.project(accepted.projectId, "/posts", { signal: controller.signal });
        if (!controller.signal.aborted) { setAccepted(current => ({ ...current, posts: mergeSubmissionStatuses(current.posts, result.posts || []) })); setStatusError(""); }
      } catch (error) { if (!controller.signal.aborted) setStatusError(`Could not refresh delivery status. ${messageOf(error)}`); }
      finally { fetching = false; if (!controller.signal.aborted) setStatusLoading(false); }
    }
    updateStatus(); const timer = setInterval(updateStatus, 15000);
    window.addEventListener("focus", updateStatus);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", updateStatus); };
  }, [connected, connection.keyId, acknowledged, workspace.keyId, project?.id, accepted.projectId, accepted.posts.map(post => post.id).join(","), projectId, statusRefresh]);

  async function connect() {
    if (!acknowledged && !disclosureAccepted) return;
    const controller = new AbortController(); authController.current?.abort(); authController.current = controller;
    setConnecting(true); setAuthError("");
    try {
      await chrome.storage.local.set({ [DISCLOSURE_KEY]: true });
      if (alive.current) setAcknowledged(true);
      if (connected) return;
      const pending = await auth.start({ signal: controller.signal });
      if (alive.current && !controller.signal.aborted) setConnection({ status: "disconnected", pending });
    } catch (error) { if (alive.current && !controller.signal.aborted) setAuthError(messageOf(error)); }
    finally { if (alive.current && !controller.signal.aborted) setConnecting(false); }
  }

  async function disconnect() {
    if (busy || dirty && !window.confirm("Disconnect from Meadow and discard the unsent post in this tab?")) return;
    authController.current?.abort();
    try {
      await auth.disconnect();
      setWorkspace({ projects: [], config: null, loading: false, error: "" }); setProjectId(""); setResources({ projectId: "", accounts: [], media: [] }); setAccepted({ projectId: "", posts: [] }); setAuthError(""); setNotice(""); setDirty(false); setComposerVersion(value => value + 1);
    } catch (error) { setAuthError(messageOf(error)); }
  }

  async function cancelConnection() {
    authController.current?.abort();
    try { await auth.disconnect(); setConnecting(false); setAuthError(""); }
    catch (error) { setAuthError(messageOf(error)); }
  }

  function chooseWorkspace(id) {
    if (busy || id === projectId || dirty && !window.confirm("Switch workspaces and discard the unsent post in this tab?")) return;
    setProjectId(id); setResources({ projectId: "", accounts: [], media: [] }); setAccepted({ projectId: "", posts: [] }); setNotice(""); setUploadError(""); setComposerVersion(value => value + 1); setDirty(false);
  }

  async function upload(files, onProgress, { signal } = {}) {
    const uploadProjectId = projectId;
    setUploadError("");
    const result = await uploadFiles(api, uploadProjectId, files, uploadLimit(workspace.config), { signal, onProgress });
    if (alive.current && selectedProject.current === uploadProjectId) {
      setResources(current => current.projectId === uploadProjectId ? { ...current, media: [...result.uploaded, ...current.media.filter(item => !result.uploaded.some(uploaded => uploaded.id === item.id))] } : current);
      setUploadError(result.error);
    }
    return result.uploaded;
  }

  const ready = canCompose({ connection, acknowledged, workspace, projectId, resources, resourcesLoading, resourcesError });
  const composerProject = project || (projectId && { id: projectId, name: "Workspace", timeZone: currentTimeZone() });
  const showComposer = Boolean(composerProject && workspace.config && resources.projectId === projectId);
  return <div className="bridge crosspost-app"><header className="crosspost-header"><div><a className="crosspost-wordmark" href={APP_ORIGIN} target="_blank" rel="noreferrer"><img src="./icons/32.png" alt=""/><span className="crosspost-wordmark-name">meadow<span>.</span></span></a><h1>Cross-post</h1><p>One post, the accounts you choose.</p></div>{connected && <button type="button" className="bridge-button secondary" onClick={disconnect} disabled={busy}>Disconnect Meadow</button>}</header><main className="crosspost-content">
    {connection.status === "checking" || !ackLoaded ? <p role="status">Loading Meadow connection…</p> : (!connected || !acknowledged) && <ConnectionPanel pending={connection.pending} connecting={connecting} error={authError} acknowledged={acknowledged} disclosureAccepted={disclosureAccepted} onAcknowledge={setDisclosureAccepted} onConnect={connect} onCancel={cancelConnection} preserving={showComposer} alreadyConnected={connected}/>}
    {connected && acknowledged && <div className="crosspost-workspace-bar"><label htmlFor="workspace-select">Workspace<select id="workspace-select" value={projectId} onChange={event => chooseWorkspace(event.target.value)} disabled={busy || workspace.loading}>{!project && <option value={projectId}>{projectId ? "Workspace unavailable" : "Choose a workspace"}</option>}{workspace.projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="bridge-inline-actions"><button type="button" className="bridge-button secondary" onClick={() => setRefresh(value => value + 1)} disabled={busy || workspace.loading || resourcesLoading}>Reload accounts</button><a className="bridge-button secondary" href={websiteUrl("/dashboard/connections", projectId)} target="_blank" rel="noreferrer">Connect social accounts</a></div></div>}
    <Alert message={workspace.error || resourcesError || uploadError}/><Alert message={notice} success/>
    {ready && <p className="crosspost-upload-limit">Files up to {Math.round(uploadLimit(workspace.config) / 1024 ** 2)} MiB can be uploaded here. Use Meadow for larger files.</p>}
    {connected && acknowledged && (workspace.loading || resourcesLoading) && <p className="crosspost-loading" role="status">Loading your workspace…</p>}
    {connected && acknowledged && !workspace.loading && !workspace.error && !workspace.projects.length && <section className="bridge-panel"><h2>Create a workspace in Meadow</h2><p>Your workspaces will appear here after you create one.</p><a className="bridge-button" href={websiteUrl("/dashboard")} target="_blank" rel="noreferrer">Open Meadow</a></section>}
    {connected && acknowledged && projectId && !workspace.loading && workspace.projects.length > 0 && !project && <p role="alert">This workspace is not available to the connected Meadow account. Reconnect your original account or choose another workspace.</p>}
    {showComposer && <fieldset className="crosspost-composer" disabled={!ready}><Composer key={`${projectId}:${composerVersion}`} project={{ ...composerProject, timeZone: composerProject.timeZone || currentTimeZone() }} accounts={resources.accounts} accountsReady={!resourcesLoading && !resourcesError} media={resources.media} catalog={workspace.config.platforms || []} config={workspace.config} onDirtyChange={setDirty} onBusyChange={setBusy} onAccounts={() => window.open(websiteUrl("/dashboard/connections", projectId), "_blank", "noopener,noreferrer")} onUpload={upload} onDiscard={() => { setComposerVersion(value => value + 1); setNotice(""); }} onDraftSaved={() => { setComposerVersion(value => value + 1); setNotice("Draft saved in Meadow."); }} onSubmitted={result => { setAccepted({ projectId, posts: result.posts || [] }); setStatusError(""); setNotice("Accepted for delivery. Check each account’s status below."); setComposerVersion(value => value + 1); }}/></fieldset>}
    {accepted.projectId === projectId && <SubmissionStatus posts={accepted.posts} catalog={workspace.config?.platforms || []} projectId={projectId} refreshing={statusLoading || !connected} error={statusError} onRefresh={() => setStatusRefresh(value => value + 1)}/>}
  </main></div>;
}
