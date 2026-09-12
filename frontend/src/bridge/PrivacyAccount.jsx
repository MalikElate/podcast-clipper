import { useEffect, useState } from "react";
import { api } from "./BridgeApi.js";
import { Alert, Check, Field, Modal } from "./ui.jsx";
import { MEADOW_LOGO_URL } from "../components/BrandLogo.jsx";

export function PolicyLinks() {
  return <nav className="bridge-privacy-links" aria-label="Privacy and terms"><a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a><a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a><a href="mailto:hello@findmeadow.com">Privacy support</a></nav>;
}

const receiptKey = "meadow.deletion-receipt";
export function readDeletionReceipt() {
  try { const value = JSON.parse(sessionStorage.getItem(receiptKey)); return value?.reference && ["pending", "complete"].includes(value.status) ? value : null; } catch { return null; }
}
function saveDeletionReceipt(deletion) {
  try { sessionStorage.setItem(receiptKey, JSON.stringify({ reference: deletion.reference, status: deletion.status, requestedAt: deletion.requestedAt })); } catch { /* The receipt is still visible if browser storage is disabled. */ }
}
export function DeletionReceipt({ deletion, signOut }) {
  const [current, setCurrent] = useState(deletion);
  useEffect(() => {
    if (current.status === "complete") return;
    let stopped = false, timer;
    const refresh = async () => {
      try {
        const result = await api.request("/privacy");
        if (!stopped && result.deletion?.reference === deletion.reference) { setCurrent(result.deletion); saveDeletionReceipt(result.deletion); }
      } catch { clearInterval(timer); }
    };
    timer = setInterval(refresh, 15000);
    refresh();
    return () => { stopped = true; clearInterval(timer); };
  }, [current.status, deletion.reference]);
  async function leave() { try { sessionStorage.removeItem(receiptKey); await signOut(); } finally { window.location.assign("/"); } }
  return <div className="bridge-privacy-gate"><section className="bridge-panel bridge-privacy-consent"><h1>{current.status === "complete" ? "Account deletion completed" : "Account deletion requested"}</h1><p>Your workspace is closed and scheduled publishing has stopped. A request already sent to a social platform may still finish.</p><p>{current.status === "complete" ? "Your Meadow workspace data has been removed and your account is closed." : "Meadow is removing your workspace data and requesting cleanup from the connected services. Contact us if you need help with the request."}</p><p className="bridge-small">Deletion reference: <strong>{current.reference}</strong></p><p>Posts already on social platforms remain there. Payment records required for accounting may remain with Stripe.</p><PolicyLinks/><button className="bridge-button secondary" onClick={leave}>Return to Meadow</button></section></div>;
}

export function PrivacyGate({ children, signOut }) {
  const [status, setStatus] = useState(null), [accepted, setAccepted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api.request("/privacy", { signal: controller.signal }).then(setStatus).catch(error => { if (error.name !== "AbortError") setError(error.message); });
    const onDeletion = event => setStatus(event.detail);
    window.addEventListener("meadow:account-deletion", onDeletion);
    return () => { controller.abort(); window.removeEventListener("meadow:account-deletion", onDeletion); };
  }, []);
  async function agree() {
    setBusy(true); setError("");
    try { setStatus(await api.request("/privacy/consent", { method: "POST", body: { accepted: true, version: status.version } })); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  if (status?.deletion) return <div className="bridge" data-theme="light"><DeletionReceipt deletion={status.deletion} signOut={signOut}/></div>;
  if (status?.accepted) return children;
  return <div className="bridge" data-theme="light"><main className="bridge-privacy-gate"><section className="bridge-panel bridge-privacy-consent"><img src={MEADOW_LOGO_URL} alt="Meadow" width="42" height="42"/><h1>{status ? "Your privacy, your choices" : "Loading your workspace…"}</h1><Alert message={error}/>{status ? <><p>Before using Meadow, review how we handle your account, media, and connected social accounts. These terms also apply to publishing requested through your API keys.</p><PolicyLinks/><p>Meadow uses YouTube API Services. If you use YouTube features, you also agree to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>. Read the <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.</p><Check checked={accepted} onChange={event => setAccepted(event.target.checked)}>I have read and agree to Meadow’s Privacy Policy and Terms of Service, including the YouTube terms when using YouTube features.</Check><button className="bridge-button" disabled={!accepted || busy} onClick={agree}>{busy ? "Saving…" : "Agree and continue"}</button><p className="bridge-small">Policy version {status.version}. Your queued posts stay paused until you agree.</p><PrivacyAccount compact/></> : error && <button className="bridge-button secondary" onClick={() => window.location.reload()}>Try again</button>}</section></main></div>;
}

export default function PrivacyAccount({ compact = false }) {
  const [confirm, setConfirm] = useState(false), [text, setText] = useState(""), [acknowledged, setAcknowledged] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function remove(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api.request("/privacy/account", { method: "DELETE", body: { confirmation: text } });
      saveDeletionReceipt(result.deletion);
      window.dispatchEvent(new CustomEvent("meadow:account-deletion", { detail: result }));
    } catch (error) { setError(error.message); setBusy(false); }
  }
  return <><section className={compact ? "bridge-privacy-decline" : "bridge-panel bridge-settings-card bridge-privacy-card"}>{!compact && <><h2>Privacy &amp; Account</h2><p>Review how Meadow handles your data, remove a social connection, or permanently delete your Meadow account.</p><PolicyLinks/><p>Remove an individual social account from Connections to delete its stored credentials, profile, delivery history, and metrics. Your original media and content stay in your workspace.</p><p className="bridge-small">Product analytics tracking is currently disabled. Social performance metrics are fetched only for your connected accounts.</p></>}<button className={compact ? "bridge-text-button" : "bridge-button danger"} onClick={() => { setConfirm(true); setText(""); setAcknowledged(false); setError(""); }}>{compact ? "Delete my account instead" : "Delete account"}</button></section>{confirm && <Modal title="Permanently delete your Meadow account?" onClose={() => setConfirm(false)} busy={busy}><div className="bridge-privacy-explanation"><p>This closes every workspace on your account, cancels your Meadow subscription, revokes API keys, and removes your uploaded media, drafts, schedules, connections, and analytics.</p><p>A post already sent to a platform may still finish. Published posts remain on the social platforms. Google authorization removal may also affect other channels or Google connections using the same authorization.</p><p>Deletion starts immediately and normally finishes within seven days. If a service needs manual follow-up, contact <a href="mailto:hello@findmeadow.com">hello@findmeadow.com</a> with your deletion reference. Stripe may retain required payment records.</p></div><Alert message={error}/><form onSubmit={remove}><Check checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}>I understand that this permanently removes all my Meadow workspaces and cancels my subscription.</Check><Field label="Type DELETE to confirm"><input autoComplete="off" value={text} onChange={event => setText(event.target.value)} placeholder="DELETE" required/></Field><div className="bridge-modal-actions"><button type="button" className="bridge-button secondary" disabled={busy} onClick={() => setConfirm(false)}>Keep my account</button><button className="bridge-button danger" disabled={busy || text !== "DELETE" || !acknowledged}>{busy ? "Requesting deletion…" : "Permanently delete account"}</button></div></form></Modal>}</>;
}
