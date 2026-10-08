import { useEffect, useState } from "react";
import { SiClaude, SiCursor, SiGooglegemini } from "react-icons/si";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { AGENT_CLIENTS, agentInstructions, agentSetupPrompt } from "./agentSetup.js";
import { Alert } from "./ui.jsx";

export default function AgentSetup({ onCopy }) {
  const [client, setClient] = useState("claude"), [configuration, setConfiguration] = useState(null), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api.request("/agent-setup", { signal: controller.signal }).then(setConfiguration).catch(error => { if (error.name !== "AbortError") setError(error.message); });
    return () => controller.abort();
  }, []);
  const selected = AGENT_CLIENTS.find(item => item.id === client), guide = agentInstructions(client, configuration || {});
  const logos = { claude: SiClaude, cursor: SiCursor, gemini: SiGooglegemini };
  return <section className="bridge-panel bridge-agent-guide">
    <h2>Connect an AI agent</h2>
    <p>Connect your preferred agent to read your workspace, check analytics, upload media, and draft, schedule or publish posts.</p>
    {configuration && <div className="bridge-agent-prompt">
      <h3>Copy a setup prompt</h3>
      <p>Paste it into any agent that can make web requests, including remote and cloud agents. The agent shows you a code, you approve it in Meadow, and it gets its own API key for MCP and the REST API. No key to copy.</p>
      <button type="button" className="bridge-button" onClick={() => onCopy(agentSetupPrompt(configuration))}><Icon name="copy" size={16}/> Copy setup prompt</button>
    </div>}
    <h3 className="bridge-agent-manual">Or set up a specific app</h3>
    <div className="bridge-agent-tabs" role="tablist" aria-label="Agent setup">
      {AGENT_CLIENTS.map(item => { const Logo = logos[item.id]; return <button key={item.id} type="button" role="tab" id={`agent-tab-${item.id}`} aria-selected={client === item.id} aria-controls="agent-setup-panel" tabIndex={client === item.id ? 0 : -1} onClick={() => setClient(item.id)} onKeyDown={event => { const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0; if (!offset && !["Home", "End"].includes(event.key)) return; event.preventDefault(); const index = event.key === "Home" ? 0 : event.key === "End" ? AGENT_CLIENTS.length - 1 : (AGENT_CLIENTS.findIndex(agent => agent.id === client) + offset + AGENT_CLIENTS.length) % AGENT_CLIENTS.length; setClient(AGENT_CLIENTS[index].id); document.getElementById(`agent-tab-${AGENT_CLIENTS[index].id}`)?.focus(); }}>{Logo && <Logo size={17} aria-hidden="true"/>}{item.name}</button>; })}
    </div>
    <div id="agent-setup-panel" role="tabpanel" aria-labelledby={`agent-tab-${client}`} tabIndex={0}>
      <Alert message={error}/>
      {!configuration ? <p className="bridge-small">{error ? "Setup details could not be loaded. Refresh this page to try again." : "Loading connection details…"}</p> : <>
        <h3>{guide.title}</h3><p>{guide.text}</p>
        <div className="bridge-agent-code"><pre><code>{guide.code}</code></pre><button type="button" className="bridge-button secondary small" onClick={() => onCopy(guide.code)}><Icon name="copy" size={15}/> Copy</button></div>
        <p className="bridge-small">{guide.note}</p>
        {selected.docs && <a className="bridge-agent-docs" href={selected.docs} target="_blank" rel="noreferrer">{selected.name} setup guide <Icon name="external" size={14}/></a>}
      </>}
    </div>
    <p className="bridge-small bridge-agent-permissions">MCP provides 13 tools for workspace information, drafts, media uploads and publishing. An API key gives an agent your full access; OAuth sign-in asks you to approve uploading and publishing separately.</p>
  </section>;
}
