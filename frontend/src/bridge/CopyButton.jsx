import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icons.jsx";

export default function CopyButton({ value, children = "Copy", className = "bridge-button secondary", iconSize = 16, align = "start" }) {
  const [status, setStatus] = useState("");
  const mounted = useRef(true);
  const feedbackId = useId();
  const message = status === "copied" ? "Copied to clipboard." : status === "failed" ? "Couldn’t copy. Select the text and copy it manually." : "";

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setStatus(""), status === "failed" ? 6000 : 3000);
    return () => clearTimeout(timer);
  }, [message, status]);

  async function copy() {
    setStatus("copying");
    try {
      await navigator.clipboard.writeText(value);
      if (mounted.current) setStatus("copied");
    } catch {
      if (mounted.current) setStatus("failed");
    }
  }

  return <span className={`bridge-copy ${align === "end" ? "align-end" : ""}`}>
    <button type="button" className={className} onClick={copy} disabled={status === "copying"} aria-describedby={message ? feedbackId : undefined}><Icon name="copy" size={iconSize}/>{children}</button>
    {message && <span id={feedbackId} className={`bridge-copy-toast ${status === "failed" ? "is-error" : ""}`} role={status === "failed" ? "alert" : "status"}>{message}</span>}
  </span>;
}
