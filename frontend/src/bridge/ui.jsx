import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  FaFacebook,
  FaGoogle,
  FaInstagram,
  FaLinkedin,
  FaPinterest,
  FaPinterestP,
  FaSnapchat,
  FaTelegram,
  FaThreads,
  FaTiktok,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6";
import { SiBluesky } from "react-icons/si";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { PLATFORM_COLORS } from "./platforms.js";
import "./social-icons.css";

const TIKTOK_PATH = "M448,209.91a210.06,210.06,0,0,1-122.77-39.25V349.38A162.55,162.55,0,1,1,185,188.31V278.2a74.62,74.62,0,1,0,52.23,71.18V0l88,0a121.18,121.18,0,0,0,1.86,22.17h0A122.18,122.18,0,0,0,381,102.39a121.43,121.43,0,0,0,67,20.14Z";

export const number = value => Number.isFinite(value) ? new Intl.NumberFormat(undefined, { notation: value >= 100000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value) : "—";
export const dateTime = (value, timeZone) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value)) : "—";
export const statusLabel = value => (value || "unknown").replaceAll("_", " ");
export function Badge({ status, children }) { return <span className={`bridge-badge ${status || ""}`}>{children || statusLabel(status)}</span>; }
export function PlatformIcon({ platform, size = 22, variant = "default" }) {
  const gradientId = useId();
  const isHero = variant === "hero";
  const heroColors = { x: "#666666", linkedin: "#60a8ce", facebook: "#6bb0fa", tiktok: "#595959", youtube: "#ff6164", bluesky: "#68a9ff", threads: "#595959", pinterest: "#d7606b" };
  const icons = {
    bluesky: SiBluesky,
    facebook: FaFacebook,
    google_business: FaGoogle,
    instagram: FaInstagram,
    linkedin: FaLinkedin,
    pinterest: isHero ? FaPinterest : FaPinterestP,
    snapchat: FaSnapchat,
    telegram: FaTelegram,
    threads: FaThreads,
    tiktok: FaTiktok,
    x: FaXTwitter,
    youtube: FaYoutube,
  };
  const PlatformLogo = icons[platform];
  if (!PlatformLogo) return <span className="bridge-platform-icon bridge-platform-icon-fallback" style={{ width: size, height: size }} aria-hidden="true" />;
  let logo;
  if (isHero && platform === "x") {
    logo = <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="5" fill="currentColor"/>
      <FaXTwitter x="5" y="5" size={22} fill="white"/>
    </svg>;
  } else if (isHero && platform === "tiktok") {
    logo = <FaTiktok aria-hidden="true" focusable="false"/>;
  } else if (isHero && platform === "google_business") {
    logo = <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M2 12h28v18H2z" fill="#8bb2ff"/>
      <path d="M16 12h14v18H16z" fill="#80a5f2"/>
      <path d="M3 2h7L8 14a4 4 0 0 1-8-1Z" fill="#7996d9"/>
      <path d="M10 2h6v11a4 4 0 0 1-8 1Z" fill="#a2b9f5"/>
      <path d="M16 2h6l2 12a4 4 0 0 1-8-1Z" fill="#7996d9"/>
      <path d="M22 2h7l3 11a4 4 0 0 1-8 1Z" fill="#929ddd"/>
      <FaGoogle x="18" y="20" size={9} fill="white"/>
    </svg>;
  } else if (platform === "instagram") {
    logo = <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs><linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0"><stop stopColor="#ffcf58"/><stop offset=".35" stopColor="#f77737"/><stop offset=".65" stopColor="#e1306c"/><stop offset="1" stopColor="#833ab4"/></linearGradient></defs>
      <rect width="24" height="24" rx="6" fill={`url(#${gradientId})`}/>
      <rect x="4.5" y="4.5" width="15" height="15" rx="4.5" fill="none" stroke="white" strokeWidth="1.8"/>
      <circle cx="12" cy="12" r="3.6" fill="none" stroke="white" strokeWidth="1.8"/><circle cx="17" cy="7" r="1.1" fill="white"/>
    </svg>;
  } else if (platform === "tiktok") {
    logo = <svg viewBox="-48 -32 544 576" aria-hidden="true" focusable="false">
      <path d={TIKTOK_PATH} fill="#25f4ee" transform="translate(-20 -16)"/>
      <path d={TIKTOK_PATH} fill="#fe2c55" transform="translate(20 16)"/>
      <path d={TIKTOK_PATH} fill="#111111"/>
    </svg>;
  } else if (platform === "google_business") {
    logo = <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#4285f4" d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24v7.42h11a9.4 9.4 0 0 1-4.08 6.17v5h6.61c3.87-3.56 6.08-8.8 6.08-14.67Z"/>
      <path fill="#34a853" d="M24 44c5.51 0 10.13-1.83 13.51-4.96l-6.61-5c-1.84 1.23-4.19 1.98-6.9 1.98-5.32 0-9.83-3.59-11.45-8.42H5.72v5.16A20 20 0 0 0 24 44Z"/>
      <path fill="#fbbc05" d="M12.55 27.6A12 12 0 0 1 12 24c0-1.25.2-2.46.55-3.6v-5.16H5.72A20 20 0 0 0 4 24c0 3.22.78 6.28 1.72 8.76Z"/>
      <path fill="#ea4335" d="M24 11.98c3 0 5.68 1.03 7.8 3.04l5.85-5.85C34.12 5.88 29.51 4 24 4A20 20 0 0 0 5.72 15.24l6.83 5.16C14.17 15.57 18.68 11.98 24 11.98Z"/>
    </svg>;
  } else {
    logo = <PlatformLogo aria-hidden="true" focusable="false"/>;
  }
  const pixelSize = isHero ? size : Math.round(size * 1.04);
  return <span className="social-brand-icon" data-platform={platform} style={{ width: pixelSize, height: pixelSize, color: (isHero && heroColors[platform]) || PLATFORM_COLORS[platform], opacity: isHero && platform === "instagram" ? .72 : undefined }} aria-hidden="true">{logo}</span>;
}
export function PlatformBadge({ platform, catalog = [], size = "" }) { const info = catalog.find(item => item.id === platform); return <span className={`bridge-platform-badge ${size}`} style={{ "--platform-color": info?.color || "#8eabef" }} title={info?.name || platform}><PlatformIcon platform={platform} size={size === "large" ? 25 : 20}/></span>; }
export function Empty({ icon = "media", title, children, action }) { return <div className="bridge-empty"><div className="bridge-empty-icon"><Icon name={icon} size={29}/></div><h2>{title}</h2><p>{children}</p>{action}</div>; }
export function Alert({ message, success = false }) { return message ? <div className={`bridge-alert ${success ? "success" : ""}`} role={success ? "status" : "alert"}>{message}</div> : null; }
export function Field({ label, children, hint }) { return <label className="bridge-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Check({ children, ...props }) { return <label className="bridge-check"><input type="checkbox" {...props}/><span>{children}</span></label>; }
export function Modal({ title, children, onClose, wide = false, busy = false, className = "" }) {
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
  return <div className="bridge-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}><section ref={ref} tabIndex={-1} className={`bridge-modal ${wide ? "wide" : ""} ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={id}><button className="bridge-modal-close bridge-icon-button" onClick={onClose} disabled={busy} aria-label="Close dialog"><Icon name="close"/></button><h2 id={id}>{title}</h2>{children}</section></div>;
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
