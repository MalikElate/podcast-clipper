import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import Auth from "../components/Auth.jsx";
import { firebaseConfigured } from "../firebase.js";
import { api, localPreview } from "./BridgeApi.js";
import { Icon, BridgeMark } from "./Icons.jsx";
import { Alert, Field, Modal, TimezoneField, useProjectResource } from "./ui.jsx";
import Composer from "./Composer.jsx";
import Accounts from "./Accounts.jsx";
import MediaLibrary from "./MediaLibrary.jsx";
import ClippingStudio from "./ClippingStudio.jsx";
import PostsQueue from "./PostsQueue.jsx";
import Analytics from "./Analytics.jsx";
import "./bridge.css";

export const modules = [
  { id: "compose", name: "Create post", icon: "compose" },
  { id: "posts", name: "Posts & queue", icon: "queue" },
  { id: "media", name: "Media library", icon: "media" },
  { id: "clips", name: "Clipping studio", icon: "clips" },
  { id: "analytics", name: "Analytics", icon: "analytics" },
  { id: "accounts", name: "Social accounts", icon: "accounts" },
];
export default function BridgeApp() {
  const { user, signOut } = useAuth();
  if (user === undefined && !localPreview) return <div className="bridge-loading">Loading Bridge…</div>;
  if (!user && !localPreview) return <div className="bridge-signin"><div className="bridge-signin-brand"><BridgeMark/><span>bridge</span></div>{firebaseConfigured ? <Auth onBack={() => {}}/> : <div className="bridge-panel"><h1>Your content, connected.</h1><p>Sign-in is being configured. Please check back shortly.</p></div>}</div>;
  return <Workspace key={user?.uid || "preview"} user={user} signOut={signOut}/>;
}
function Workspace({ user, signOut }) {
  const initial = useRef(new URLSearchParams(window.location.search));
  const [view, setView] = useState(modules.some(item => item.id === initial.current.get("view")) ? initial.current.get("view") : "compose");
  const [projects, setProjects] = useState([]), [projectId, setProjectId] = useState(""), [config, setConfig] = useState(null), [projectForm, setProjectForm] = useState(null), [error, setError] = useState(initial.current.get("connectionError") || ""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [menuOpen, setMenuOpen] = useState(false), [connectionId, setConnectionId] = useState(initial.current.get("connection") || ""), [seed, setSeed] = useState(null), [seedVersion, setSeedVersion] = useState(0);
  const project = projects.find(item => item.id === projectId);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.getProjects(controller.signal), api.request("/config", { signal: controller.signal })]).then(([data, configuration]) => { setProjects(data.projects); setConfig(configuration); setProjectId(data.projects.find(item => item.id === initial.current.get("project"))?.id || data.projects[0]?.id || ""); }).catch(error => { if (error.name !== "AbortError") setError(error.message); });
    window.history.replaceState({}, "", window.location.pathname);
    return () => controller.abort();
  }, []);
  function navigate(next) { setView(next); setMenuOpen(false); setError(""); setNotice(""); }
  function compose(media) { setSeed(media); setSeedVersion(value => value + 1); navigate("compose"); }
  async function saveProject(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try { const result = projectForm.id ? await api.updateProject(projectForm.id, projectForm) : await api.createProject(projectForm); setProjects(current => projectForm.id ? current.map(item => item.id === result.project.id ? result.project : item) : [...current, result.project]); setProjectId(result.project.id); setProjectForm(null); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <div className="bridge">
    {menuOpen && <button className="bridge-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation"/>}
    <aside className={`bridge-sidebar ${menuOpen ? "is-open" : ""}`}>
      <a className="bridge-logo" href="#" onClick={event => { event.preventDefault(); navigate("compose"); }}><BridgeMark/><span>bridge<span className="bridge-logo-dot">.</span></span></a>
      <div className="bridge-project-picker"><label htmlFor="project-select">PROJECT</label><div className="bridge-project-select"><span className="bridge-project-avatar">{(project?.name || "B").slice(0, 1).toUpperCase()}</span><select id="project-select" value={projectId} onChange={event => { setProjectId(event.target.value); setSeed(null); setError(""); setNotice(""); setConnectionId(""); }}><option value="" disabled>Choose a project</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="bridge-project-actions"><button className="bridge-text-button" onClick={() => setProjectForm({ name: "", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}><Icon name="plus" size={15}/> New project</button>{project && <button className="bridge-text-button" onClick={() => setProjectForm({ id: project.id, name: project.name, timeZone: project.timeZone })} aria-label="Project settings"><Icon name="compose" size={14}/></button>}</div></div>
      <nav aria-label="Main navigation">{modules.filter(item => item.id !== "clips" || config?.features?.clipping !== false).map(item => <button key={item.id} className={`bridge-nav-item ${view === item.id ? "active" : ""}`} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined}><Icon name={item.icon}/><span>{item.name}</span>{view === item.id && <span className="bridge-nav-dot"/>}</button>)}</nav>
      <div className="bridge-sidebar-footer"><span className="bridge-person-avatar">{(user?.email || "Preview").slice(0, 1).toUpperCase()}</span><div><strong>{user?.displayName || "Your workspace"}</strong><span>{user?.email || "Local preview"}</span></div>{!localPreview && <button className="bridge-icon-button" onClick={() => signOut().catch(error => setError(error.message))} aria-label="Sign out"><Icon name="external" size={17}/></button>}</div>
    </aside>
    <main className="bridge-main"><header className="bridge-topbar"><button className="bridge-icon-button bridge-menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Icon name="menu"/></button><div className="bridge-breadcrumb">{project?.name || "Workspace"}<span>/</span><strong>{modules.find(item => item.id === view)?.name}</strong></div><span className="bridge-topbar-note"><span/> {localPreview ? "Local preview" : "Your content workspace"}</span></header>
      {localPreview && <div className="bridge-preview-note">Local preview · Changes are saved on this computer. Live publishing is disabled.</div>}
      <div className="bridge-content"><Alert message={error}/><Alert message={notice} success/><div className="bridge-page-heading"><div><span className="bridge-eyebrow">{view === "clips" ? "CREATE" : view === "analytics" ? "UNDERSTAND" : "PUBLISH"}</span><h1>{modules.find(item => item.id === view)?.name}</h1></div>{project && <span className="bridge-timezone"><Icon name="clock" size={16}/>{project.timeZone}</span>}</div>
        {!config ? <div className="bridge-panel bridge-empty"><p>{error ? "Bridge could not load. Check your connection and refresh this page." : "Loading your workspace…"}</p></div> : !project ? <div className="bridge-onboarding bridge-panel"><div className="bridge-empty-icon"><BridgeMark/></div><h2>Start with a project</h2><p>Keep a brand or client’s accounts, content, and results together.</p><button className="bridge-button" onClick={() => setProjectForm({ name: "", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}><Icon name="plus" size={17}/> Create project</button></div> : <ProjectWorkspace key={project.id} project={project} config={config} view={view} navigate={navigate} compose={compose} seed={seed} seedVersion={seedVersion} clearSeed={() => setSeed(null)} connectionId={connectionId} clearConnection={() => setConnectionId("")} notify={setNotice}/>}
      </div>
    </main>
    {projectForm && <Modal title={projectForm.id ? "Project settings" : "Create a project"} onClose={() => setProjectForm(null)} busy={busy}><p>Keep this project’s accounts, content, and results together.</p><Alert message={error}/><form onSubmit={saveProject}><Field label="Project name"><input required maxLength={80} value={projectForm.name} onChange={event => setProjectForm(current => ({ ...current, name: event.target.value }))} placeholder="e.g. My podcast"/></Field><TimezoneField value={projectForm.timeZone} onChange={timeZone => setProjectForm(current => ({ ...current, timeZone }))}/><button className="bridge-button" disabled={busy}>{busy ? "Saving…" : projectForm.id ? "Save project" : "Create project"}<Icon name="arrow" size={16}/></button></form></Modal>}
  </div>;
}
function ProjectWorkspace({ project, config, view, navigate, compose, seed, seedVersion, clearSeed, connectionId, clearConnection, notify }) {
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
    {view === "compose" && <Composer key={seedVersion} {...common} seed={seed} onClearSeed={clearSeed} onAccounts={() => navigate("accounts")} onUpload={upload} onSubmitted={result => { navigate("posts"); notify(`${result.posts.length} ${result.posts.length === 1 ? "post" : "posts"} added to your publishing queue.`); }}/>}
    {view === "accounts" && <Accounts {...common} connectionId={connectionId} clearConnection={clearConnection} onChanged={accountResource.reload}/>}
    {view === "media" && <MediaLibrary {...common} onUpload={upload} onChanged={mediaResource.reload} onCompose={compose}/>}
    {view === "clips" && <ClippingStudio {...common} onChanged={mediaResource.reload} onCompose={compose}/>}
    {view === "posts" && <PostsQueue {...common} onCreate={() => navigate("compose")}/>}
    {view === "analytics" && <Analytics {...common}/>}
  </>;
}
