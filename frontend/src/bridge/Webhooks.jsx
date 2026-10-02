import { useEffect, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Field, Modal } from "./ui.jsx";

export default function Webhooks({ timeZone, onCopy }) {
  const [webhook, setWebhook] = useState(null), [url, setUrl] = useState(""), [ready, setReady] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [secret, setSecret] = useState(""), [confirm, setConfirm] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api.request("/webhooks", { signal: controller.signal }).then(result => { setWebhook(result.webhook); setUrl(result.webhook?.url || ""); setReady(result.ready); }).catch(error => { if (error.name !== "AbortError") setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function action(type, event) {
    event?.preventDefault(); setBusy(type); setError(""); setNotice("");
    try {
      const result = await api.request(type === "save" || type === "remove" ? "/webhooks" : `/webhooks/${type}`, { method: type === "remove" ? "DELETE" : "POST", body: type === "save" ? { url: url.trim() } : {} });
      setWebhook(result.webhook || null); setConfirm("");
      if (type === "remove") setUrl("");
      if (type === "save") setUrl(result.webhook.url);
      if (result.secret) setSecret(result.secret);
      if (type === "test" && result.webhook?.lastDelivery?.status !== "delivered") setError("Test delivery failed. Meadow will retry it automatically.");
      else setNotice(type === "test" ? "Test webhook delivered." : type === "remove" ? "Webhook removed." : type === "rotate-secret" ? "Signing secret rotated. Update your receiver with the new secret." : "Webhook saved.");
    } catch (error) { setError(error.message); } finally { setBusy(""); }
  }
  const delivery = webhook?.lastDelivery;
  return <section className="bridge-panel bridge-webhook-panel">
    <h2>Webhooks</h2>
    <p>Get notified when a post finishes for each account (<code>post.completed</code>) or an account needs reconnecting (<code>connection.needs_reconnect</code>). Meadow sends a signed POST to your URL.</p>
    <Alert message={error}/><Alert message={notice} success/>
    <form className="bridge-webhook-form" onSubmit={event => action("save", event)}>
      <Field label="Webhook URL" hint="Use a public HTTPS endpoint on port 443."><input type="url" required maxLength={2048} placeholder="https://your-server.com/webhook" value={url} onChange={event => setUrl(event.target.value)} disabled={loading || Boolean(busy) || !ready}/></Field>
      <button className="bridge-button" disabled={loading || Boolean(busy) || !ready || !url.trim() || url.trim() === webhook?.url}>{busy === "save" ? "Saving…" : "Save"}</button>
    </form>
    {loading && <p className="bridge-small">Loading webhook settings…</p>}
    {!loading && !ready && !error && <p className="bridge-small">Webhook signing must be configured by your server administrator.</p>}
    {webhook && <>
      <div className="bridge-inline-actions"><button className="bridge-button secondary small" disabled={Boolean(busy)} onClick={() => action("test")}>{busy === "test" ? "Sending…" : "Send test"}</button><button className="bridge-button secondary small" disabled={Boolean(busy)} onClick={() => setConfirm("rotate-secret")}>Rotate signing secret</button><button className="bridge-button secondary small" disabled={Boolean(busy)} onClick={() => setConfirm("remove")}>Remove webhook</button></div>
      {delivery && <div className="bridge-webhook-status"><strong>Last delivery: {delivery.status === "pending" ? "retrying" : delivery.status}</strong><span>{delivery.type} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(delivery.at))}</span>{delivery.error && <p>{delivery.error}</p>}</div>}
    </>}
    <details className="bridge-webhook-details"><summary>Signature verification and delivery</summary><p>Verify <code>X-Meadow-Signature</code>, which contains <code>t=TIMESTAMP,v1=SIGNATURE</code>. Compute HMAC-SHA256 with your signing secret over <code>TIMESTAMP.RAW_BODY</code> and compare signatures securely. Reject timestamps older than five minutes.</p><p>Return a 2xx response within ten seconds. Failed requests retry up to five total attempts. Deduplicate by the event <code>id</code> or <code>X-Meadow-Event-Id</code>. The signature is refreshed for each attempt.</p><p><code>post.completed</code> includes the post, delivery, account, and project IDs, platform, status, <code>external_ref</code>, and URL. Outcomes include published, failed, needs_review, and awaiting_publish (TikTok inbox delivery).</p></details>
    {secret && <Modal title="Copy your webhook signing secret" onClose={() => setSecret("")}><p>This secret is shown once. Store it securely on your webhook receiver to verify Meadow events.</p><div className="bridge-secret-row"><input aria-label="Webhook signing secret" readOnly value={secret} onFocus={event => event.target.select()}/><button className="bridge-button secondary" onClick={() => onCopy(secret)}><Icon name="copy" size={16}/> Copy</button></div><div className="bridge-modal-actions"><button className="bridge-button" onClick={() => setSecret("")}>Done</button></div></Modal>}
    {confirm && <Modal title={confirm === "remove" ? "Remove this webhook?" : "Rotate the signing secret?"} onClose={() => setConfirm("")} busy={Boolean(busy)}><p>{confirm === "remove" ? "Meadow will stop sending events to this URL. Pending deliveries will be removed." : "Update your receiver with the new secret after rotating. Pending deliveries signed with the old secret will be removed."}</p><Alert message={error}/><div className="bridge-modal-actions"><button className="bridge-button secondary" onClick={() => setConfirm("")}>Cancel</button><button className="bridge-button" disabled={Boolean(busy)} onClick={() => action(confirm)}>{busy ? "Updating…" : confirm === "remove" ? "Remove webhook" : "Rotate secret"}</button></div></Modal>}
  </section>;
}
