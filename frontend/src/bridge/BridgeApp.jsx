import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import Auth from "../components/Auth.jsx";
import { MEADOW_LOGO_URL } from "../components/BrandLogo.jsx";
import { api, localPreview } from "./BridgeApi.js";
import { Icon, BridgeMark } from "./Icons.jsx";
import { Alert, useProjectResource } from "./ui.jsx";
import Composer from "./Composer.jsx";
import Accounts from "./Accounts.jsx";
import ClippingStudioComingSoon from "./ClippingStudioComingSoon.jsx";
import PostsQueue from "./PostsQueue.jsx";
import PostsCalendar from "./PostsCalendar.jsx";
import Analytics from "./Analytics.jsx";
import ConfigurationSettings from "./ConfigurationSettings.jsx";
import ApiKeys from "./ApiKeys.jsx";
import Billing from "./Billing.jsx";
import { DeletionReceipt, readDeletionReceipt } from "./PrivacyAccount.jsx";
import { dashboardPath, dashboardView } from "./dashboardRoutes.js";
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
];

const allModules = [...modules, ...postModules, ...configurationModules];
const postViewIds = new Set(postModules.map(item => item.id));
const configurationViewIds = new Set(configurationModules.map(item => item.id));
export default function BridgeApp() {
  const { user, signOut } = useAuth();
  const [deletion, setDeletion] = useState(readDeletionReceipt);
  useEffect(() => {
    const onDeletion = event => setDeletion(event.detail.deletion);
    window.addEventListener("meadow:account-deletion", onDeletion);
    return () => window.removeEventListener("meadow:account-deletion", onDeletion);
  }, []);
  if (deletion) return <div className="bridge" data-theme="light"><DeletionReceipt deletion={deletion} signOut={signOut}/></div>;
  if (!user && !localPreview) return <div className="bridge-signin"><div className="bridge-signin-brand"><img src={MEADOW_LOGO_URL} alt="" width="38" height="38"/><span>meadow</span></div><Auth /></div>;
  return <Workspace key={user?.id || "preview"} user={user} signOut={signOut}/>;
}
function Workspace({ user, signOut }) {
  const initial = useRef({ params: new URLSearchParams(window.location.search), view: dashboardView(window.location.pathname, window.location.search) });
  const [view, setView] = useState(initial.current.view);
  const [projects, setProjects] = useState([]), [projectId, setProjectId] = useState(""), [config, setConfig] = useState(null), [error, setError] = useState(initial.current.params.get("connectionError") || ""), [notice, setNotice] = useState(""), [menuOpen, setMenuOpen] = useState(false), [connectionId, setConnectionId] = useState(initial.current.params.get("connection") || ""), [scheduledDate, setScheduledDate] = useState(""), [draftVersion, setDraftVersion] = useState(0);
  const [postsOpen, setPostsOpen] = useState(postViewIds.has(initial.current.view));
  const [configurationOpen, setConfigurationOpen] = useState(configurationViewIds.has(initial.current.view));
  const [signingOut, setSigningOut] = useState(false);
  // Schedules, calendars, and timestamps follow the device's current time zone, not the one saved at sign-up.
  const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const savedProject = projects.find(item => item.id === projectId);
  const project = savedProject && { ...savedProject, timeZone: deviceTimeZone };
  const activeModule = allModules.find(item => item.id === view);
  const isPostView = postViewIds.has(view);
  const isConfigurationView = configurationViewIds.has(view);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.getProjects(controller.signal), api.request("/config", { signal: controller.signal })]).then(async ([data, configuration]) => {
      let availableProjects = data.projects;
      if (!availableProjects.length) {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const { project: defaultProject } = await api.ensureDefaultProject({ name: "Meadow", timeZone }, controller.signal);
        availableProjects = [defaultProject];
      }
      if (controller.signal.aborted) return;
      setProjects(availableProjects); setConfig(configuration); setProjectId(availableProjects.find(item => item.id === initial.current.params.get("project"))?.id || availableProjects[0]?.id || "");
    }).catch(error => { if (error.name !== "AbortError") setError(error.message); });
    window.history.replaceState({}, "", dashboardPath(initial.current.view));
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const onPopState = () => {
      const next = dashboardView(window.location.pathname, window.location.search);
      setView(next);
      setPostsOpen(postViewIds.has(next));
      setConfigurationOpen(configurationViewIds.has(next));
      setMenuOpen(false);
      setError("");
      setNotice("");
      if (window.location.pathname !== dashboardPath(next) || window.location.search) window.history.replaceState({}, "", dashboardPath(next));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => { document.title = `${activeModule?.title || activeModule?.name || "Dashboard"} · Meadow`; }, [activeModule]);
  function selectView(next) { setView(next); if (postViewIds.has(next)) { setPostsOpen(true); setConfigurationOpen(false); } else if (configurationViewIds.has(next)) { setConfigurationOpen(true); setPostsOpen(false); } else { setPostsOpen(false); setConfigurationOpen(false); } setMenuOpen(false); setError(""); setNotice(""); }
  function navigate(next) { selectView(next); const path = dashboardPath(next); if (window.location.pathname !== path || window.location.search) window.history.pushState({}, "", path); }
  function follow(event, next) { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(next); }
  function compose(date = "") { setScheduledDate(date); setDraftVersion(value => value + 1); navigate("compose"); }
  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true); setError(""); setNotice("");
    try { await signOut(); }
    catch (error) { setError(error.message || "Could not sign out. Please try again."); setSigningOut(false); setMenuOpen(false); }
  }
  return <div className="bridge" data-theme="light">
    {menuOpen && <button className="bridge-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation"/>}
    <aside className={`bridge-sidebar ${menuOpen ? "is-open" : ""}`}>
      <a className="bridge-logo" href={dashboardPath("compose")} onClick={event => follow(event, "compose")}><img className="bridge-logo-image" src={MEADOW_LOGO_URL} alt="" width="31" height="31"/><span>meadow<span className="bridge-logo-dot">.</span></span></a>
      <nav aria-label="Main navigation">
        <a className={`bridge-nav-item ${view === "compose" ? "active" : ""}`} href={dashboardPath("compose")} onClick={event => follow(event, "compose")} aria-current={view === "compose" ? "page" : undefined}><Icon name="compose"/><span>Create post</span></a>
        <div className={`bridge-nav-group ${isPostView ? "active" : ""}`}>
          <button className="bridge-nav-parent" onClick={() => setPostsOpen(open => { if (!open) setConfigurationOpen(false); return !open; })} aria-expanded={postsOpen}><span>Posts</span><Icon name={postsOpen ? "up" : "chevron"} size={15}/></button>
          {postsOpen && <div className="bridge-nav-sub">{postModules.map(item => <a key={item.id} className={view === item.id ? "active" : ""} href={dashboardPath(item.id)} onClick={event => follow(event, item.id)} aria-current={view === item.id ? "page" : undefined}><Icon name={item.icon} size={18}/><span>{item.name}</span></a>)}</div>}
        </div>
        {modules.filter(item => item.id !== "compose").map(item => <a key={item.id} className={`bridge-nav-item ${view === item.id ? "active" : ""}`} href={dashboardPath(item.id)} onClick={event => follow(event, item.id)} aria-current={view === item.id ? "page" : undefined}><Icon name={item.icon}/><span>{item.name}</span></a>)}
        <div className={`bridge-nav-group ${isConfigurationView ? "active" : ""}`}>
          <button className="bridge-nav-parent" onClick={() => setConfigurationOpen(open => { if (!open) setPostsOpen(false); return !open; })} aria-expanded={configurationOpen}><span>Configuration</span><Icon name={configurationOpen ? "up" : "chevron"} size={15}/></button>
          {configurationOpen && <div className="bridge-nav-sub">{configurationModules.map(item => <a key={item.id} className={view === item.id ? "active" : ""} href={dashboardPath(item.id)} onClick={event => follow(event, item.id)} aria-current={view === item.id ? "page" : undefined}><Icon name={item.icon} size={18}/><span>{item.name}</span></a>)}</div>}
        </div>
      </nav>
      <div className="bridge-sidebar-footer">
        <div className="bridge-sidebar-person"><span className="bridge-person-avatar">{(user?.email || "Dashboard").slice(0, 1).toUpperCase()}</span><div className="bridge-sidebar-person-text"><strong>Dashboard</strong>{user?.email && <span>{user.email}</span>}</div></div>
        {!localPreview && <button type="button" className="bridge-button secondary" onClick={handleSignOut} disabled={signingOut}><Icon name="logout" size={17}/>{signingOut ? "Signing out…" : "Sign out"}</button>}
      </div>
    </aside>
    <main className="bridge-main"><header className="bridge-topbar"><button className="bridge-icon-button bridge-menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Icon name="menu"/></button></header>
      <div className="bridge-content"><Alert message={error}/><Alert message={notice} success/><div className="bridge-page-heading"><h1>{activeModule?.title || activeModule?.name}</h1></div>
        {!config ? <div className="bridge-panel bridge-empty"><p>{error ? "Meadow could not load. Check your connection and refresh this page." : ""}</p></div> : isConfigurationView ? <ConfigurationWorkspace user={user} project={project} config={config} view={view} onSignOut={handleSignOut} signingOut={signingOut} onProjectUpdated={updated => setProjects(current => current.map(item => item.id === updated.id ? updated : item))}/> : !project ? <div className="bridge-panel bridge-empty"><div className="bridge-empty-icon"><BridgeMark/></div><h2>Meadow is getting ready</h2><p>Your publishing account is not available yet.</p></div> : <ProjectWorkspace key={project.id} project={project} config={config} view={view} navigate={navigate} compose={compose} scheduledDate={scheduledDate} clearScheduledDate={() => setScheduledDate("")} draftVersion={draftVersion} connectionId={connectionId} clearConnection={() => setConnectionId("")} notify={setNotice}/>}
      </div>
    </main>
  </div>;
}
function ConfigurationWorkspace({ user, project, config, view, onProjectUpdated, onSignOut, signingOut }) {
  return <>
    {view === "settings" && <ConfigurationSettings user={user} project={project} config={config} onProjectUpdated={onProjectUpdated} onSignOut={onSignOut} signingOut={signingOut}/>}
    {view === "api-keys" && <ApiKeys timeZone={project?.timeZone}/>}
    {view === "billing" && <Billing localPreview={config.localPreview}/>}
  </>;
}
function ProjectWorkspace({ project, config, view, navigate, compose, scheduledDate, clearScheduledDate, draftVersion, connectionId, clearConnection, notify }) {
  const accountResource = useProjectResource(project.id, "/accounts", { accounts: [] });
  const mediaResource = useProjectResource(project.id, "/media", { media: [] });
  const catalog = config.platforms || [];
  const media = mediaResource.data.media;
  const [uploadError, setUploadError] = useState("");
  async function upload(files, onProgress = () => {}) {
    const uploaded = [], failures = []; setUploadError("");
    for (const [index, file] of files.slice(0, 100).entries()) {
      const progress = event => onProgress({ ...event, filename: file.name, fileIndex: index + 1, fileCount: Math.min(files.length, 100) });
      try { if (file.size > config.maxUploadBytes) throw new Error(`exceeds ${Math.round(config.maxUploadBytes / 1024 ** 2)} MB`); const data = await api.uploadMedia(project.id, file, { onProgress: progress }); uploaded.push(data.media); }
      catch (error) { failures.push(`${file.name}: ${error.message}`); }
    }
    mediaResource.setData(current => ({ media: [...uploaded, ...current.media.filter(item => !uploaded.some(newItem => newItem.id === item.id))] }));
    if (failures.length) setUploadError(failures.slice(0, 5).join(" · "));
    if (uploaded.length) notify(`${uploaded.length} ${uploaded.length === 1 ? "file" : "files"} added to ${project.name}.`);
    return uploaded;
  }
  const common = { project, config, catalog, media, accounts: accountResource.data.accounts };
  return <><Alert message={accountResource.error || mediaResource.error || uploadError}/>
    {view === "compose" && <Composer key={draftVersion} {...common} scheduledDate={scheduledDate} onDraftStarted={clearScheduledDate} onAccounts={() => navigate("accounts")} onUpload={upload} onSubmitted={result => { navigate("posts"); notify(`${result.posts.length} ${result.posts.length === 1 ? "post" : "posts"} added to your publishing queue.`); }}/>}
    {view === "accounts" && <Accounts {...common} connectionId={connectionId} clearConnection={clearConnection} onChanged={accountResource.reload}/>}
    {view === "clips" && <ClippingStudioComingSoon/>}
    {view === "calendar" && <PostsCalendar {...common} onCreate={compose}/>}
    {["posts", "scheduled", "posted", "drafts", "failed"].includes(view) && <PostsQueue {...common} section={view} onCreate={() => navigate("compose")} onUpload={upload}/>}
    {view === "analytics" && <Analytics {...common}/>}
  </>;
}
