import { useState } from "react";
import { Icon } from "./Icons.jsx";
import { Alert, Check, Modal } from "./ui.jsx";

const privacySections = { pinterest: "pinterest", youtube: "youtube", google_business: "google-business-profile", tiktok: "tiktok" };

export function ConnectionPrivacyModal({ disclosure, busy, error, onClose, onContinue }) {
  const [accepted, setAccepted] = useState(false);
  const section = privacySections[disclosure.platform];
  const privacyUrl = section ? `/privacy/#privacy-${section}` : "/privacy/";
  return <Modal title={`Connect ${disclosure.name}`} onClose={onClose} busy={busy} className="bridge-connection-privacy-modal">
    <div className="bridge-connection-privacy-scroll">
      <div className="bridge-connection-summary">
        <p>{disclosure.connectionSummary}</p>
        <h3>Requirement</h3>
        <div className="bridge-connection-requirement"><Icon name="warning" size={18}/><p>{disclosure.requirement}</p></div>
        <p className="bridge-connection-revoke">{disclosure.revokeSummary}</p>
        <a className="bridge-privacy-page-link" href={privacyUrl} target="_blank" rel="noreferrer" aria-label={`View Meadow’s privacy policy for ${disclosure.name}`}>View privacy policy</a>
      </div>
    </div>
    <div className="bridge-connection-privacy-consent">
      <Alert message={error}/>
      <Check checked={accepted} onChange={event => setAccepted(event.target.checked)}>{disclosure.shortAgreement}</Check>
      <div className="bridge-modal-actions"><button className="bridge-button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="bridge-button" disabled={!accepted || busy} onClick={() => onContinue({ accepted: true, platform: disclosure.platform, version: disclosure.version })}>{busy ? "Connecting…" : "Connect"}</button></div>
    </div>
  </Modal>;
}
