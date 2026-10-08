import { useEffect, useState } from "react";
import { api } from "./BridgeApi.js";
import { dashboardPath } from "./dashboardRoutes.js";
import { Icon } from "./Icons.jsx";
import { Alert, Field } from "./ui.jsx";

const ago = value => {
  const minutes = Math.max(0, Math.round((Date.now() - value) / 60000));
  return minutes < 1 ? "just now" : `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
};

/** Approval page for an agent's device-style sign-in. */
export default function ConnectAgent() {
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get("code") || "");
  const [request, setRequest] = useState(null), [decision, setDecision] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);

  async function lookup(value, signal) {
    setBusy(true); setError(""); setRequest(null);
    try { setRequest(await api.request(`/agent-logins/${encodeURIComponent(value.trim())}`, { signal })); }
    catch (error) { if (error.name !== "AbortError") setError(error.message); }
    finally { if (!signal?.aborted) setBusy(false); }
  }
  useEffect(() => {
    if (!code) return;
    const controller = new AbortController();
    lookup(code, controller.signal);
    return () => controller.abort();
  }, []); // Only the code from the link is looked up automatically.

  async function decide(action) {
    setBusy(true); setError("");
    try { await api.request(`/agent-logins/${encodeURIComponent(code.trim())}/${action}`, { method: "POST", body: {} }); setDecision(action); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  if (decision === "approve") return <section className="bridge-panel bridge-connect-agent">
    <h2><Icon name="check" size={20}/> {request.agentName} is connected</h2>
    <p>Go back to your agent. It will finish setting up within a few seconds and confirm which Meadow workspace it reached.</p>
    <p className="bridge-small">The agent has its own API key named “{request.agentName}”. Revoke it in <a href={dashboardPath("api-keys")}>API keys</a> at any time.</p>
  </section>;
  if (decision === "deny") return <section className="bridge-panel bridge-connect-agent">
    <h2>Request declined</h2>
    <p>{request.agentName} did not get access to Meadow. If you didn’t start this request, nothing else is needed.</p>
  </section>;

  return <section className="bridge-panel bridge-connect-agent">
    <Alert message={error}/>
    {!request ? <form onSubmit={event => { event.preventDefault(); lookup(code); }}>
      <p>Enter the code your AI agent showed you.</p>
      <Field label="Code"><input autoFocus required value={code} onChange={event => setCode(event.target.value)} placeholder="ABCD-EFGH" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20}/></Field>
      <div className="bridge-modal-actions"><button className="bridge-button" disabled={busy || !code.trim()}>{busy ? "Checking…" : "Continue"}</button></div>
    </form> : <>
      <h2>Allow “{request.agentName}” to use Meadow?</h2>
      <p>Code <strong><code>{code.trim().toUpperCase()}</code></strong> · requested {ago(request.createdAt)}</p>
      <p>This agent will get an API key with your full Meadow access: it can read your workspace, upload media, and draft, schedule or publish posts on your connected accounts.</p>
      <Alert message="Only approve if you just started this from your own agent and the code matches what it shows. Never approve a code someone sent you."/>
      <div className="bridge-modal-actions">
        <button type="button" className="bridge-button secondary" disabled={busy} onClick={() => decide("deny")}>Deny</button>
        <button type="button" className="bridge-button" disabled={busy} onClick={() => decide("approve")}>{busy ? "Working…" : "Approve"}</button>
      </div>
    </>}
  </section>;
}
