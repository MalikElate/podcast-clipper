import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";

export const number = value => Number.isFinite(value) ? new Intl.NumberFormat(undefined, { notation: value >= 100000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value) : "—";
export const dateTime = (value, timeZone) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value)) : "—";
export const statusLabel = value => (value || "unknown").replaceAll("_", " ");
export function Badge({ status, children }) { return <span className={`bridge-badge ${status || ""}`}>{children || statusLabel(status)}</span>; }
export function PlatformIcon({ platform, size = 22 }) {
  const paths = {
    bluesky: <path fill="currentColor" stroke="none" d="M12 10.8C10.9 8.7 7.9 4.8 5.2 2.8 2.6.9 1.6 1.2 1 1.5.3 1.8.2 3.2.2 4c0 .8.4 6.6.7 7.6 1 3.4 4.4 4.5 7.4 4-.5.1-1 .2-1.5.4-3.7.7-4.4 3.3-2.5 5.9 3.5 3.6 4.8-.8 5.2-2.2.4 1.4 1.4 5.8 5 2.2 1.9-1.9 1.3-5.2-2.5-5.9-.5-.1-1-.2-1.5-.4 3 .5 6.4-.6 7.4-4 .3-1 .7-6.8.7-7.6 0-.8-.1-2.2-.8-2.5-.7-.3-1.7-.6-4.3 1.3-2.7 2-5.7 5.9-6.8 8Z"/>,
    facebook: <path fill="currentColor" stroke="none" d="M13.7 22v-8h2.8l.4-3.2h-3.2V8.7c0-.9.3-1.6 1.7-1.6H17V4.2c-.5-.1-1.4-.2-2.5-.2-2.5 0-4.2 1.5-4.2 4.4v2.4H7.5V14h2.8v8h3.4Z"/>,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.1"/><circle cx="17.4" cy="6.7" r=".8" fill="currentColor" stroke="none"/></>,
    linkedin: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7.5 10v7M7.5 7v.01M11.5 17v-4c0-1.8 1-3 2.7-3 1.6 0 2.3 1.1 2.3 3v4M11.5 10v7"/></>,
    pinterest: <path fill="currentColor" stroke="none" d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.424 7.618 11.174-.105-.949-.199-2.403.042-3.441.219-.937 1.406-5.965 1.406-5.965s-.359-.72-.359-1.783c0-1.669.968-2.915 2.172-2.915 1.024 0 1.518.769 1.518 1.69 0 1.029-.655 2.57-.993 3.995-.283 1.194.599 2.169 1.777 2.169 2.132 0 3.77-2.249 3.77-5.495 0-2.872-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.208 0 1.031.397 2.137.893 2.739.099.12.112.225.085.347-.091.375-.293 1.199-.334 1.363-.053.225-.174.271-.402.165-1.495-.695-2.429-2.878-2.429-4.633 0-3.773 2.741-7.24 7.902-7.24 4.15 0 7.374 2.956 7.374 6.908 0 4.121-2.599 7.441-6.203 7.441-1.211 0-2.349-.629-2.738-1.378 0 0-.599 2.282-.744 2.84-.282 1.084-1.044 2.443-1.555 3.272 1.171.361 2.413.557 3.703.557 6.621 0 11.988-5.367 11.988-11.987C24.005 5.367 18.638.001 12.017.001Z"/>,
    threads: <path d="M8.1 8.6c.7-1.2 2-1.9 3.8-1.9 3.2 0 5.1 2.1 5.1 5.4 0 3.7-2 6.1-5.2 6.1-2.6 0-4.4-1.4-4.4-3.5 0-2 1.7-3.4 4.3-3.4 4.1 0 6.9 1.8 7.7 4.5M12 3.3c-5.2 0-8.7 3.6-8.7 8.9 0 5.1 3.5 8.5 8.7 8.5"/>,
    tiktok: <path d="M14 3v11.3a4.7 4.7 0 1 1-4-4.6M14 3c.5 3 2.2 4.7 5 5"/>,
    x: <path fill="currentColor" stroke="none" d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.598-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932Zm-1.293 19.492h2.039L6.486 3.24H4.298l13.31 17.405Z"/>,
    youtube: <><rect x="2.5" y="5" width="19" height="14" rx="4"/><path fill="currentColor" stroke="none" d="m10 9 6 3-6 3V9Z"/></>,
    google_business: <><path d="M4 10v10h16V10M8 20v-6h8v6M3 10h18l-2-6H5l-2 6Z"/><path d="M3 10c0 1.4 1.1 2.5 2.5 2.5S8 11.4 8 10c0 1.4 1.1 2.5 2.5 2.5S13 11.4 13 10c0 1.4 1.1 2.5 2.5 2.5S18 11.4 18 10c0 1.4 1.1 2.5 2.5 2.5S23 11.4 23 10"/></>,
  };
  return <svg className={`bridge-platform-icon bridge-platform-icon-${platform}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[platform] || <circle cx="12" cy="12" r="9"/>}</svg>;
}
export function PlatformBadge({ platform, catalog = [], size = "" }) { const info = catalog.find(item => item.id === platform); return <span className={`bridge-platform-badge ${size}`} style={{ "--platform-color": info?.color || "#8eabef" }} title={info?.name || platform}><PlatformIcon platform={platform} size={size === "large" ? 25 : 20}/></span>; }
export function Empty({ icon = "media", title, children, action }) { return <div className="bridge-empty"><div className="bridge-empty-icon"><Icon name={icon} size={29}/></div><h2>{title}</h2><p>{children}</p>{action}</div>; }
export function Alert({ message, success = false }) { return message ? <div className={`bridge-alert ${success ? "success" : ""}`} role={success ? "status" : "alert"}>{message}</div> : null; }
export function Field({ label, children, hint }) { return <label className="bridge-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Check({ children, ...props }) { return <label className="bridge-check"><input type="checkbox" {...props}/><span>{children}</span></label>; }
export function Modal({ title, children, onClose, wide = false, busy = false }) {
  const ref = useRef(null), id = useId(), controls = useRef({ onClose, busy });
  controls.current = { onClose, busy };
  useEffect(() => {
    const previous = document.activeElement, dialog = ref.current;
    const candidates = () => [...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(item => item.getClientRects().length);
    (candidates()[0] || dialog).focus();
    const keydown = event => {
      if (event.key === "Escape" && !controls.current.busy) controls.current.onClose();
      if (event.key !== "Tab") return;
      const items = candidates(), first = items[0], last = items.at(-1);
      if (!items.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener("keydown", keydown);
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { dialog.removeEventListener("keydown", keydown); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <div className="bridge-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}><section ref={ref} tabIndex={-1} className={`bridge-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={id}><button className="bridge-modal-close bridge-icon-button" onClick={onClose} disabled={busy} aria-label="Close dialog"><Icon name="close"/></button><h2 id={id}>{title}</h2>{children}</section></div>;
}
export function useProjectResource(projectId, endpoint, initial, { interval = 0, revision = 0 } = {}) {
  const [data, setData] = useState(initial), [error, setError] = useState(""), [loading, setLoading] = useState(true), [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController(); let fetching = false;
    setLoading(true); setError("");
    async function fetchData() {
      if (fetching || controller.signal.aborted) return;
      fetching = true;
      try { const result = await api.project(projectId, endpoint, { signal: controller.signal }); if (!controller.signal.aborted) { setData(result); setError(""); } }
      catch (error) { if (error.name !== "AbortError") setError(error.message); }
      finally { fetching = false; if (!controller.signal.aborted) setLoading(false); }
    }
    fetchData(); const timer = interval ? setInterval(() => { if (!document.hidden) fetchData(); }, interval) : null;
    return () => { controller.abort(); clearInterval(timer); };
  }, [projectId, endpoint, interval, revision, version]);
  return { data, setData, error, loading, reload };
}
export function MediaThumb({ media, playable = false }) {
  if (media.kind === "video" && playable) return <video src={media.url} poster={media.thumbnailUrl} controls preload="metadata"/>;
  return media.thumbnailUrl || media.kind === "image" ? <img src={media.thumbnailUrl || media.url} alt={media.filename} loading="lazy"/> : <div className="bridge-document-thumb"><Icon name="media" size={32}/><span>{media.filename.split(".").at(-1).toUpperCase()}</span></div>;
}
export function TimezoneField({ value, onChange }) {
  const id = useId(), zones = Intl.supportedValuesOf?.("timeZone") || ["UTC", "Africa/Douala", "America/New_York", "Europe/London", "Asia/Tokyo"];
  return <Field label="Timezone"><input list={id} value={value} onChange={event => onChange(event.target.value)} required placeholder="e.g. Europe/London"/><datalist id={id}><option value="UTC"/>{zones.map(zone => <option key={zone} value={zone}/>)}</datalist></Field>;
}
