import { useEffect, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Empty, Field, Modal } from "./ui.jsx";

const when = (value, timeZone) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value)) : "Never";

export default function ApiKeys({ timeZone = "UTC" }) {
  const [keys, setKeys] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false), [name, setName] = useState(""), [created, setCreated] = useState(null), [removing, setRemoving] = useState(null), [busy, setBusy] = useState(false);
  async function load(signal) { setLoading(true); try { const result = await api.request("/api-keys", { signal }); setKeys(result.apiKeys); setError(""); } catch (error) { if (error.name !== "AbortError") setError(error.message); } finally { if (!signal?.aborted) setLoading(false); } }
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, []);
  async function create(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await api.request("/api-keys", { method: "POST", body: { name } }); setKeys(current => [result.apiKey, ...current]); setCreating(false); setName(""); setCreated(result); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError("");
    try { await api.request(`/api-keys/${encodeURIComponent(removing.id)}`, { method: "DELETE" }); setKeys(current => current.filter(item => item.id !== removing.id)); setRemoving(null); setNotice("API key revoked."); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  async function copy(value) { try { await navigator.clipboard.writeText(value); setNotice("Copied to clipboard."); } catch { setNotice("Select the key and copy it manually."); } }
  return <>
    <div className="bridge-intro-row"><p>Create keys for Meadow REST API and CLI clients. Every key has the same access as your workspace account.</p><button className="bridge-button" onClick={() => { setError(""); setCreating(true); }}><Icon name="plus" size={17}/> Create API key</button></div>
    <Alert message={error}/><Alert message={notice} success/>
    <section className="bridge-panel bridge-agent-panel"><div className="bridge-settings-card-heading"><span className="bridge-settings-icon"><Icon name="robot"/></span><div><h2>Connected agents</h2><p>Agent OAuth connections will appear here separately from API keys.</p></div></div><p className="bridge-small">Nothing connected yet. API keys below can be used with your own CLI or server automation.</p></section>
    <section className="bridge-panel bridge-api-panel"><div className="bridge-section-label"><div><h2>API keys</h2><p className="bridge-small">Keys are shown once when created and stored as secure hashes.</p></div><span>{keys.length} of 20 keys</span></div>{!keys.length ? <Empty icon="key" title={loading ? "Loading API keys…" : "No API keys yet"} action={!loading && <button className="bridge-button secondary" onClick={() => setCreating(true)}>Create your first key</button>}>{loading ? "Retrieving your workspace keys." : "Create a key when an integration needs direct API access."}</Empty> : <div className="bridge-table-scroll"><table className="bridge-table bridge-api-table"><thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th><span className="bridge-visually-hidden">Actions</span></th></tr></thead><tbody>{keys.map(item => <tr key={item.id}><td><span className="bridge-api-name"><Icon name="key" size={15}/>{item.name}</span></td><td><code>{item.keyHint}</code></td><td>{when(item.createdAt, timeZone)}</td><td>{when(item.lastUsedAt, timeZone)}</td><td><button className="bridge-icon-button" aria-label={`Revoke ${item.name}`} onClick={() => setRemoving(item)}><Icon name="trash" size={16}/></button></td></tr>)}</tbody></table></div>}</section>
    <section className="bridge-panel bridge-agent-guide"><div className="bridge-settings-card-heading"><span className="bridge-settings-icon"><Icon name="terminal"/></span><div><h2>Connect an AI agent</h2><p>Give an agent access through a private API key and the Meadow API endpoint.</p></div></div><ol><li>Create a key and copy it before closing the dialog.</li><li>Store it in the agent’s secret manager as <code>MEADOW_API_KEY</code>.</li><li>Send it with every request as <code>Authorization: Bearer …</code>.</li></ol></section>
    {creating && <Modal title="Create an API key" onClose={() => setCreating(false)} busy={busy}><p>Name the client or automation that will use this key.</p><Alert message={error}/><form onSubmit={create}><Field label="Key name" hint="You can revoke this key at any time."><input autoFocus required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Publishing CLI"/></Field><div className="bridge-modal-actions"><button type="button" className="bridge-button secondary" onClick={() => setCreating(false)}>Cancel</button><button className="bridge-button" disabled={busy}>{busy ? "Creating…" : "Create key"}</button></div></form></Modal>}
    {created && <Modal title="Copy your API key" onClose={() => setCreated(null)}><p>This is the only time the full key will be shown. Store it somewhere secure.</p><div className="bridge-secret-row"><input readOnly value={created.key} onFocus={event => event.target.select()}/><button className="bridge-button secondary" onClick={() => copy(created.key)}><Icon name="copy" size={16}/> Copy</button></div><div className="bridge-modal-actions"><button className="bridge-button" onClick={() => setCreated(null)}>Done</button></div></Modal>}
    {removing && <Modal title="Revoke this API key" onClose={() => setRemoving(null)} busy={busy}><p><strong>{removing.name}</strong> will immediately stop authenticating requests.</p><Alert message={error}/><div className="bridge-modal-actions"><button className="bridge-button secondary" onClick={() => setRemoving(null)}>Keep key</button><button className="bridge-button danger" disabled={busy} onClick={remove}>{busy ? "Revoking…" : "Revoke key"}</button></div></Modal>}
  </>;
}
