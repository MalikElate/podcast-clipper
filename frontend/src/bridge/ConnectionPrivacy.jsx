import { useEffect, useState } from "react";
import { api } from "./BridgeApi.js";
import { Alert, Check, Modal, PlatformIcon } from "./ui.jsx";

export function ConnectionPrivacyContent({ disclosure }) {
  return <div className="bridge-connection-privacy-content">
    <p>{disclosure.introduction}</p>
    <h3>Data Meadow accesses and why</h3>
    <dl>{disclosure.data.map(item => <div key={item.name}><dt>{item.name}</dt><dd>{item.detail}</dd></div>)}</dl>
    <h3>How the data is used and shared</h3><p>{disclosure.sharing}</p>
    <h3>How long it is kept</h3><p>{disclosure.retention}</p>
    <h3>Your control</h3><p>{disclosure.platformNote}</p><p>{disclosure.removal}</p>
  </div>;
}

export function ConnectionPrivacyModal({ disclosure, busy, error, onClose, onContinue, onOpenSettings }) {
  const [accepted, setAccepted] = useState(false);
  return <Modal title={`Before you connect ${disclosure.name}`} onClose={onClose} busy={busy} wide>
    <ConnectionPrivacyContent disclosure={disclosure}/>
    <div className="bridge-connection-privacy-consent">
      <p className="bridge-small">Full policies are available in Settings → Privacy &amp; Account.</p>
      {onOpenSettings && <button className="bridge-text-button" disabled={busy} onClick={onOpenSettings}>Review full policies in Settings</button>}
      <Alert message={error}/>
      <Check checked={accepted} onChange={event => setAccepted(event.target.checked)}>{disclosure.agreement}</Check>
      <div className="bridge-modal-actions"><button className="bridge-button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="bridge-button" disabled={!accepted || busy} onClick={() => onContinue({ accepted: true, platform: disclosure.platform, version: disclosure.version })}>{busy ? "Connecting…" : `Agree and continue to ${disclosure.name}`}</button></div>
    </div>
  </Modal>;
}

export function ConnectionPrivacySettings() {
  const [disclosures, setDisclosures] = useState([]), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api.request("/privacy/connections", { signal: controller.signal }).then(data => setDisclosures(data.disclosures)).catch(error => { if (error.name !== "AbortError") setError(error.message); });
    return () => controller.abort();
  }, []);
  return <div className="bridge-connection-privacy-settings"><h3>Connected platform privacy</h3><p>Review the data notice for each platform. You will be asked to agree when you connect or reconnect an account.</p><Alert message={error}/>{disclosures.map(disclosure => <details key={disclosure.platform}><summary><PlatformIcon platform={disclosure.platform} size={20}/><span>{disclosure.name}</span></summary><ConnectionPrivacyContent disclosure={disclosure}/><nav className="bridge-privacy-links" aria-label={`${disclosure.name} policies and access`}>{disclosure.policies.map(policy => <a key={policy.url} href={policy.url} target="_blank" rel="noreferrer">{policy.label}</a>)}</nav></details>)}</div>;
}
