import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import Auth from "../components/Auth.jsx";
import { firebaseConfigured } from "../firebase.js";
import { api, localPreview } from "./BridgeApi.js";
import { Icon, BridgeMark } from "./Icons.jsx";
import { Alert, Field, Modal, TimezoneField, useProjectResource } from "./ui.jsx";
import Composer from "./Composer.jsx";
import Accounts from "./Accounts.jsx";
import ClippingStudio from "./ClippingStudio.jsx";
import ClippingStudioComingSoon from "./ClippingStudioComingSoon.jsx";
import PostsQueue from "./PostsQueue.jsx";
import PostsCalendar from "./PostsCalendar.jsx";
import Analytics from "./Analytics.jsx";
import ConfigurationSettings from "./ConfigurationSettings.jsx";
import ApiKeys from "./ApiKeys.jsx";
import Billing from "./Billing.jsx";
import Affiliate from "./Affiliate.jsx";
import "./bridge.css";

export const modules = [
  { id: "compose", name: "Create post", icon: "compose" },
  { id: "clips", name: "Clipping studio", icon: "clips" },
  { id: "accounts", name: "Connections", icon: "accounts" },
];

export const postModules = [
  { id: "calendar", name: "Calendar", icon: "calendar" },
  { id: "posts", name: "All", title: "All posts", icon: "all" },
  { id: "scheduled", name: "Scheduled", title: "Scheduled posts", icon: "scheduled" },
  { id: "posted", name: "Posted", title: "Posted", icon: "posted" },
  { id: "drafts", name: "Drafts", title: "Drafts", icon: "drafts" },
  { id: "failed", name: "Failed", title: "Failed posts", icon: "failed" },
  { id: "analytics", name: "Analytics", icon: "analytics" },
];

export const configurationModules = [
  { id: "settings", name: "Settings", icon: "settings" },
  { id: "api-keys", name: "API Keys", title: "Agents & API keys", icon: "key" },
  { id: "billing", name: "Billing", title: "Billing & plans", icon: "billing" },
  { id: "affiliate", name: "Affiliate program", icon: "affiliate" },
];

const allModules = [...modules, ...postModules, ...configurationModules];
const postViewIds = new Set(postModules.map(item => item.id));
const configurationViewIds = new Set(configurationModules.map(item => item.id));
const SHOW_WORKSPACE_CONTROLS = false;
const SHOW_CLIPPING_STUDIO = false;
const AFFILIATE_ATTRIBUTION_KEY = "bridge-affiliate-attribution";

function savedAttribution() {
  try {
    const value = JSON.parse(localStorage.getItem(AFFILIATE_ATTRIBUTION_KEY));
    if (value?.code && value?.expiresAt > Date.now()) return value;
    localStorage.removeItem(AFFILIATE_ATTRIBUTION_KEY);
  } catch {}
  return null;
}

export default function BridgeApp() {
  const { user, signOut } = useAuth();
  const initialReferralCode = useRef(new URLSearchParams(window.location.search).get("ref"));
  const [attribution, setAttribution] = useState(savedAttribution);
  useEffect(() => {
    const code = initialReferralCode.current;
    if (!code || attribution) return;
    api.trackAffiliate(code).then(value => {
      try { localStorage.setItem(AFFILIATE_ATTRIBUTION_KEY, JSON.stringify(value)); } catch {}
      setAttribution(value);
    }).catch(() => {});
  }, [attribution]);
  useEffect(() => {
    if ((!user && !localPreview) || !attribution) return;
    api.claimAffiliate(attribution).then(() => {
      try { localStorage.removeItem(AFFILIATE_ATTRIBUTION_KEY); } catch {}
      setAttribution(null);
    }).catch(error => {
      if ([404, 410].includes(error.status)) {
        try { localStorage.removeItem(AFFILIATE_ATTRIBUTION_KEY); } catch {}
        setAttribution(null);
      }
    });
  }, [user, attribution]);
  if (user === undefined && !localPreview) return <div className="bridge bridge-loading" data-theme="light">Loading Meadow…</div>;
  if (!user && !localPreview) return <div className="bridge bridge-signin" data-theme="light"><div className="bridge-signin-brand"><BridgeMark/><span>meadow</span></div>{firebaseConfigured ? <Auth onBack={() => {}}/> : <div className="bridge-panel"><h1>Your content, connected.</h1><p>Sign-in is being configured. Please check back shortly.</p></div>}</div>;
  return <Workspace key={user?.uid || "preview"} user={user} signOut={signOut}/>;
}
function Workspace({ user, signOut }) {
  const initial = useRef(new URLSearchParams(window.location.search));
  const [view, setView] = useState(allModules.some(item => item.id === initial.current.get("view")) ? initial.current.get("view") : "compose");
  const [projects, setProjects] = useState([]), [projectId, setProjectId] = useState(""), [config, setConfig] = useState(null), [projectForm, setProjectForm] = useState(null), [error, setError] = useState(initial.current.get("connectionError") || ""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [menuOpen, setMenuOpen] = useState(false), [connectionId, setConnectionId] = useState(initial.current.get("connection") || ""), [seed, setSeed] = useState(null), [scheduledDate, setScheduledDate] = useState(""), [seedVersion, setSeedVersion] = useState(0);
  const [postsOpen, setPostsOpen] = useState(!configurationViewIds.has(initial.current.get("view")));
  const [configurationOpen, setConfigurationOpen] = useState(configurationViewIds.has(initial.current.get("view")));
  const project = projects.find(item => item.id === projectId);
  const activeModule = allModules.find(item => item.id === view);
  const isPostView = postViewIds.has(view);
  const isConfigurationView = configurationViewIds.has(view);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.getProjects(controller.signal), api.request("/config", { signal: controller.signal })]).then(([data, configuration]) => { setProjects(data.projects); setConfig(configuration); setProjectId(data.projects.find(item => item.id === initial.current.get("project"))?.id || data.projects[0]?.id || ""); }).catch(error => { if (error.name !== "AbortError") setError(error.message); });
    window.history.replaceState({}, "", window.location.pathname);
    return () => controller.abort();
  }, []);
  function navigate(next) { setView(next); if (postViewIds.has(next)) { setPostsOpen(true); setConfigurationOpen(false); } if (configurationViewIds.has(next)) { setConfigurationOpen(true); setPostsOpen(false); } setMenuOpen(false); setError(""); setNotice(""); }
  function compose(media = [], date = "") { setSeed(media); setScheduledDate(date); setSeedVersion(value => value + 1); navigate("compose"); }
  async function saveProject(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try { const result = projectForm.id ? await api.updateProject(projectForm.id, projectForm) : await api.createProject(projectForm); setProjects(current => projectForm.id ? current.map(item => item.id === result.project.id ? result.project : item) : [...current, result.project]); setProjectId(result.project.id); setProjectForm(null); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <div className="bridge" data-theme="light">
    {menuOpen && <button className="bridge-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation"/>}
    <aside className={`bridge-sidebar ${menuOpen ? "is-open" : ""}`}>
      <a className="bridge-logo" href="#" onClick={event => { event.preventDefault(); navigate("compose"); }}><BridgeMark/><span>meadow<span className="bridge-logo-dot">.</span></span></a>
      {SHOW_WORKSPACE_CONTROLS && <div className="bridge-project-picker"><label htmlFor="project-select">WORKSPACE</label><div className="bridge-project-select"><span className="bridge-project-avatar">{(project?.name || "B").slice(0, 1).toUpperCase()}</span><select id="project-select" value={projectId} onChange={event => { setProjectId(event.target.value); setSeed(null); setError(""); setNotice(""); setConnectionId(""); }}><option value="" disabled>Choose a workspace</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="bridge-project-actions"><button className="bridge-text-button" onClick={() => setProjectForm({ name: "", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}><Icon name="plus" size={15}/> New workspace</button>{project && <button className="bridge-text-button" onClick={() => setProjectForm({ id: project.id, name: project.name, timeZone: project.timeZone })} aria-label="Workspace settings"><Icon name="compose" size={14}/></button>}</div></div>}
      <nav aria-label="Main navigation">
        <button className={`bridge-nav-item ${view === "compose" ? "active" : ""}`} onClick={() => navigate("compose")} aria-current={view === "compose" ? "page" : undefined}><Icon name="compose"/><span>Create post</span></button>
        <div className={`bridge-nav-group ${isPostView ? "active" : ""}`}>
          <button className="bridge-nav-parent" onClick={() => setPostsOpen(open => { if (!open) setConfigurationOpen(false); return !open; })} aria-expanded={postsOpen}><span>Posts</span><Icon name={postsOpen ? "up" : "chevron"} size={15}/></button>
          {postsOpen && <div className="bridge-nav-sub">{postModules.map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined}><Icon name={item.icon} size={18}/><span>{item.name}</span></button>)}</div>}
        </div>
        {modules.filter(item => item.id !== "compose").map(item => <button key={item.id} className={`bridge-nav-item ${view === item.id ? "active" : ""}`} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined}><Icon name={item.icon}/><span>{item.name}</span></button>)}
        <div className={`bridge-nav-group ${isConfigurationView ? "active" : ""}`}>
          <button className="bridge-nav-parent" onClick={() => setConfigurationOpen(open => { if (!open) setPostsOpen(false); return !open; })} aria-expanded={configurationOpen}><span>Configuration</span><Icon name={configurationOpen ? "up" : "chevron"} size={15}/></button>
          {configurationOpen && <div className="bridge-nav-sub">{configurationModules.map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined}><Icon name={item.icon} size={18}/><span>{item.name}</span></button>)}</div>}
        </div>
      </nav>
      <div className="bridge-sidebar-footer"><span className="bridge-person-avatar">{(user?.email || "Dashboard").slice(0, 1).toUpperCase()}</span><div><strong>Dashboard</strong>{user?.email && <span>{user.email}</span>}</div>{!localPreview && <button className="bridge-icon-button" onClick={() => signOut().catch(error => setError(error.message))} aria-label="Sign out"><Icon name="external" size={17}/></button>}</div>
    </aside>
    <main className="bridge-main"><header className="bridge-topbar"><button className="bridge-icon-button bridge-menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Icon name="menu"/></button></header>
      <div className="bridge-content"><Alert message={error}/><Alert message={notice} success/><div className="bridge-page-heading"><h1>{activeModule?.title || activeModule?.name}</h1></div>
        {!config ? <div className="bridge-panel bridge-empty"><p>{error ? "Meadow could not load. Check your connection and refresh this page." : "Loading Meadow…"}</p></div> : isConfigurationView ? <ConfigurationWorkspace user={user} project={project} config={config} view={view} onProjectUpdated={updated => setProjects(current => current.map(item => item.id === updated.id ? updated : item))}/> : !project ? SHOW_WORKSPACE_CONTROLS ? <div className="bridge-onboarding bridge-panel"><div className="bridge-empty-icon"><BridgeMark/></div><h2>Start with a workspace</h2><p>Keep a brand or client’s accounts, content, and results together.</p><button className="bridge-button" onClick={() => setProjectForm({ name: "", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}><Icon name="plus" size={17}/> Create workspace</button></div> : <div className="bridge-panel bridge-empty"><div className="bridge-empty-icon"><BridgeMark/></div><h2>Meadow is getting ready</h2><p>Your publishing account is not available yet.</p></div> : <ProjectWorkspace key={project.id} project={project} config={config} view={view} navigate={navigate} compose={compose} seed={seed} scheduledDate={scheduledDate} seedVersion={seedVersion} clearSeed={() => { setSeed(null); setScheduledDate(""); }} connectionId={connectionId} clearConnection={() => setConnectionId("")} notify={setNotice}/>}
      </div>
    </main>
    {SHOW_WORKSPACE_CONTROLS && projectForm && <Modal title={projectForm.id ? "Workspace settings" : "Create a workspace"} onClose={() => setProjectForm(null)} busy={busy}><p>Keep this workspace’s accounts, content, and results together.</p><Alert message={error}/><form onSubmit={saveProject}><Field label="Workspace name"><input required maxLength={80} value={projectForm.name} onChange={event => setProjectForm(current => ({ ...current, name: event.target.value }))} placeholder="e.g. My podcast"/></Field><TimezoneField value={projectForm.timeZone} onChange={timeZone => setProjectForm(current => ({ ...current, timeZone }))}/><button className="bridge-button" disabled={busy}>{busy ? "Saving…" : projectForm.id ? "Save workspace" : "Create workspace"}<Icon name="arrow" size={16}/></button></form></Modal>}
  </div>;
}
function ConfigurationWorkspace({ user, project, config, view, onProjectUpdated }) {
  return <>
    {view === "settings" && <ConfigurationSettings user={user} project={project} config={config} onProjectUpdated={onProjectUpdated}/>}
    {view === "api-keys" && <ApiKeys timeZone={project?.timeZone}/>}
    {view === "billing" && <Billing localPreview={config.localPreview}/>}
    {view === "affiliate" && <Affiliate user={user}/>}
  </>;
}
function ProjectWorkspace({ project, config, view, navigate, compose, seed, scheduledDate, seedVersion, clearSeed, connectionId, clearConnection, notify }) {
  const accountResource = useProjectResource(project.id, "/accounts", { accounts: [] });
  const mediaResource = useProjectResource(project.id, "/media", { media: [] });
  const catalog = config.platforms || [];
  const media = [...new Map([...mediaResource.data.media, ...(seed || [])].map(item => [item.id, item])).values()];
  const [uploadError, setUploadError] = useState("");
  async function upload(files, onProgress = () => {}) {
    const uploaded = [], failures = []; setUploadError("");
    for (const [index, file] of files.slice(0, 100).entries()) {
      onProgress(`Uploading ${index + 1} of ${Math.min(files.length, 100)}…`);
      try { if (file.size > config.maxUploadBytes) throw new Error(`exceeds ${Math.round(config.maxUploadBytes / 1024 ** 2)} MB`); const form = new FormData(); form.append("file", file); const data = await api.project(project.id, "/media", { method: "POST", body: form }); uploaded.push(data.media); }
      catch (error) { failures.push(`${file.name}: ${error.message}`); }
    }
    mediaResource.setData(current => ({ media: [...uploaded, ...current.media.filter(item => !uploaded.some(newItem => newItem.id === item.id))] }));
    if (failures.length) setUploadError(failures.slice(0, 5).join(" · "));
    if (uploaded.length) notify(`${uploaded.length} ${uploaded.length === 1 ? "file" : "files"} added to ${project.name}.`);
    return uploaded;
  }
  const common = { project, config, catalog, media, accounts: accountResource.data.accounts };
  return <><Alert message={accountResource.error || mediaResource.error || uploadError}/>
    {view === "compose" && <Composer key={seedVersion} {...common} seed={seed} scheduledDate={scheduledDate} onClearSeed={clearSeed} onAccounts={() => navigate("accounts")} onUpload={upload} onSubmitted={result => { navigate("posts"); notify(`${result.posts.length} ${result.posts.length === 1 ? "post" : "posts"} added to your publishing queue.`); }}/>}
    {view === "accounts" && <Accounts {...common} connectionId={connectionId} clearConnection={clearConnection} onChanged={accountResource.reload}/>}
    {view === "clips" && (SHOW_CLIPPING_STUDIO ? <ClippingStudio {...common} onChanged={mediaResource.reload} onCompose={compose}/> : <ClippingStudioComingSoon/>)}
    {view === "calendar" && <PostsCalendar {...common} onCreate={date => compose([], date)}/>}
    {["posts", "scheduled", "posted", "drafts", "failed"].includes(view) && <PostsQueue {...common} section={view} onCreate={() => navigate("compose")} onUpload={upload}/>}
    {view === "analytics" && <Analytics {...common}/>}
  </>;
}
