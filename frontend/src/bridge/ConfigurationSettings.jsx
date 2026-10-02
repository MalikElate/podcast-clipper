import { Icon } from "./Icons.jsx";
import { Field } from "./ui.jsx";
import PrivacyAccount from "./PrivacyAccount.jsx";

export default function ConfigurationSettings({ user, project, config, onSignOut, signingOut }) {
  const timeZone = project?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return <>
    <div className="bridge-intro-row"><p>Manage your workspace profile, time zone, and account preferences.</p></div>
    <section className="bridge-panel bridge-settings-card bridge-settings-profile">
      <div className="bridge-settings-card-heading"><span className="bridge-settings-icon"><Icon name="profile"/></span><div><h2>Workspace profile</h2><p>The account currently signed in to Meadow.</p></div></div>
      <div className="bridge-settings-readonly"><span className="bridge-person-avatar">{(user?.email || "D").slice(0, 1).toUpperCase()}</span><div><strong>{user?.email || "Dashboard"}</strong></div></div>
      <Field label="Time zone" hint="Meadow uses your device's current time zone, so schedules follow you when you travel."><input value={timeZone} readOnly disabled/></Field>
      {!config.localPreview && <button type="button" className="bridge-button secondary bridge-settings-signout" onClick={onSignOut} disabled={signingOut}><Icon name="logout" size={17}/>{signingOut ? "Signing out…" : "Sign out"}</button>}
    </section>
    <PrivacyAccount/>
  </>;
}
