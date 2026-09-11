import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  FaFacebook,
  FaGoogle,
  FaInstagram,
  FaLinkedin,
  FaPinterestP,
  FaThreads,
  FaTiktok,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6";
import { SiBluesky } from "react-icons/si";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";

export const number = value => Number.isFinite(value) ? new Intl.NumberFormat(undefined, { notation: value >= 100000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value) : "—";
export const dateTime = (value, timeZone) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value)) : "—";
export const statusLabel = value => (value || "unknown").replaceAll("_", " ");
export function Badge({ status, children }) { return <span className={`bridge-badge ${status || ""}`}>{children || statusLabel(status)}</span>; }
export function PlatformIcon({ platform, size = 22 }) {
  const icons = {
    bluesky: SiBluesky,
    facebook: FaFacebook,
    google_business: FaGoogle,
    instagram: FaInstagram,
    linkedin: FaLinkedin,
    pinterest: FaPinterestP,
    threads: FaThreads,
    tiktok: FaTiktok,
    x: FaXTwitter,
    youtube: FaYoutube,
  };
  const PlatformLogo = icons[platform];
  if (!PlatformLogo) return <span className="bridge-platform-icon bridge-platform-icon-fallback" style={{ width: size, height: size }} aria-hidden="true" />;
  if (platform === "instagram") {
    return <span className="bridge-platform-icon bridge-platform-icon-instagram" style={{ width: size, height: size }} aria-hidden="true"><PlatformLogo /></span>;
  }
  return <PlatformLogo className={`bridge-platform-icon bridge-platform-icon-${platform}`} size={size} aria-hidden="true" focusable="false" />;
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
