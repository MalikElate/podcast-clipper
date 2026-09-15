import { useEffect, useState } from "react";
import { api } from "./BridgeApi.js";
import { Alert, Check, Field, Modal } from "./ui.jsx";
import { marketingHref } from "../siteUrls.js";

export function PolicyLinks() {
  return <a className="bridge-privacy-page-link" href={marketingHref("/privacy/")} target="_blank" rel="noreferrer">View Meadow’s privacy policy</a>;
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
  async function leave() { try { sessionStorage.removeItem(receiptKey); await signOut(); } finally { window.location.assign(marketingHref("/")); } }
  return <div className="bridge-privacy-gate"><section className="bridge-panel bridge-privacy-consent"><h1>{current.status === "complete" ? "Account deletion completed" : "Account deletion requested"}</h1><p>Your workspace is closed and scheduled publishing has stopped. A request already sent to a social platform may still finish.</p><p>{current.status === "complete" ? "Your Meadow workspace data has been removed and your account is closed." : "Meadow is removing your workspace data and requesting cleanup from the connected services. Contact us if you need help with the request."}</p><p className="bridge-small">Deletion reference: <strong>{current.reference}</strong></p><p>Posts already on social platforms remain there. Payment records required for accounting may remain with Stripe.</p><p>For help with this request, contact hello@findmeadow.com.</p><button className="bridge-button secondary" onClick={leave}>Return to Meadow</button></section></div>;
}

export default function PrivacyAccount() {
  const [confirm, setConfirm] = useState(false), [text, setText] = useState(""), [acknowledged, setAcknowledged] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function remove(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api.request("/privacy/account", { method: "DELETE", body: { confirmation: text } });
      saveDeletionReceipt(result.deletion);
      window.dispatchEvent(new CustomEvent("meadow:account-deletion", { detail: result }));
    } catch (error) { setError(error.message); setBusy(false); }
  }
  return <><section className="bridge-panel bridge-settings-card bridge-privacy-card"><h2>Privacy &amp; Account</h2><p>Review how Meadow handles your data, remove a social connection, or permanently delete your Meadow account.</p><PolicyLinks/><p>Remove an individual social account from Connections to delete its stored credentials, profile, delivery history, and metrics. Your original media and content stay in your workspace.</p><p className="bridge-small">Product analytics tracking is currently disabled. Social performance metrics are fetched only for your connected accounts.</p><button className="bridge-button danger" onClick={() => { setConfirm(true); setText(""); setAcknowledged(false); setError(""); }}>Delete account</button></section>{confirm && <Modal title="Permanently delete your Meadow account?" onClose={() => setConfirm(false)} busy={busy}><div className="bridge-privacy-explanation"><p>This closes every workspace on your account, cancels your Meadow subscription, revokes API keys, and removes your uploaded media, drafts, schedules, connections, and analytics.</p><p>A post already sent to a platform may still finish. Published posts remain on the social platforms. Google authorization removal may also affect other channels or Google connections using the same authorization.</p><p>Deletion starts immediately and normally finishes within seven days. If a service needs manual follow-up, contact <a href="mailto:hello@findmeadow.com">hello@findmeadow.com</a> with your deletion reference. Stripe may retain required payment records.</p></div><Alert message={error}/><form onSubmit={remove}><Check checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}>I understand that this permanently removes all my Meadow workspaces and cancels my subscription.</Check><Field label="Type DELETE to confirm"><input autoComplete="off" value={text} onChange={event => setText(event.target.value)} placeholder="DELETE" required/></Field><div className="bridge-modal-actions"><button type="button" className="bridge-button secondary" disabled={busy} onClick={() => setConfirm(false)}>Keep my account</button><button className="bridge-button danger" disabled={busy || text !== "DELETE" || !acknowledged}>{busy ? "Requesting deletion…" : "Permanently delete account"}</button></div></form></Modal>}</>;
}
