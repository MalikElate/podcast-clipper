import { useEffect, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Field, TimezoneField } from "./ui.jsx";
import PrivacyAccount from "./PrivacyAccount.jsx";

export default function ConfigurationSettings({ user, project, config, onProjectUpdated, onSignOut, signingOut }) {
  const [form, setForm] = useState(project ? { name: project.name, timeZone: project.timeZone } : null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => setForm(project ? { name: project.name, timeZone: project.timeZone } : null), [project?.id, project?.name, project?.timeZone]);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { const { project: updated } = await api.updateProject(project.id, form); onProjectUpdated(updated); setNotice("Project settings saved."); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <>
    <div className="bridge-intro-row"><p>Manage your workspace identity, project defaults, and publishing environment.</p></div>
    <Alert message={error}/><Alert message={notice} success/>
    <div className="bridge-settings-grid">
      <section className="bridge-panel bridge-settings-card"><div className="bridge-settings-card-heading"><span className="bridge-settings-icon"><Icon name="profile"/></span><div><h2>Workspace profile</h2><p>The account currently signed in to Meadow.</p></div></div><div className="bridge-settings-readonly"><span className="bridge-person-avatar">{(user?.email || "D").slice(0, 1).toUpperCase()}</span><div><strong>{user?.email || "Dashboard"}</strong></div></div>{!config.localPreview && <button type="button" className="bridge-button secondary bridge-settings-signout" onClick={onSignOut} disabled={signingOut}><Icon name="logout" size={17}/>{signingOut ? "Signing out…" : "Sign out"}</button>}</section>
      <section className="bridge-panel bridge-settings-card"><div className="bridge-settings-card-heading"><span className="bridge-settings-icon"><Icon name="settings"/></span><div><h2>Project settings</h2><p>Used for schedules, calendars, and published timestamps.</p></div></div>{form ? <form onSubmit={save}><Field label="Project name"><input required maxLength={80} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))}/></Field><TimezoneField value={form.timeZone} onChange={timeZone => setForm(current => ({ ...current, timeZone }))}/><button className="bridge-button" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button></form> : <p>Create a project to configure its publishing defaults.</p>}</section>
      <section className="bridge-panel bridge-settings-card bridge-settings-status"><div className="bridge-settings-card-heading"><span className="bridge-settings-icon"><Icon name="check"/></span><div><h2>Service status</h2><p>Configuration reported by this Meadow server.</p></div></div><div className="bridge-status-list"><Status label="Media storage" ready={config.mediaReady}/><Status label="Social connections" ready={config.connectionsReady}/><Status label="Publishing worker" ready={config.features?.publishing}/><Status label="Analytics" ready={config.features?.analytics}/></div></section>
    </div>
    <PrivacyAccount/>
  </>;
}

function Status({ label, ready }) { return <div><span>{label}</span><span className={`bridge-status-pill ${ready ? "ready" : "waiting"}`}>{ready ? "Ready" : "Setup needed"}</span></div>; }
