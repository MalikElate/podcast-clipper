import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./Icons.jsx";

export default function CopyButton({ value, children = "Copy", className = "bridge-button secondary", iconSize = 16, align = "start" }) {
  const [status, setStatus] = useState("");
  const [below, setBelow] = useState(false);
  const button = useRef(null), mounted = useRef(true);
  const feedbackId = useId();
  const message = status === "copied" ? "Copied to clipboard." : status === "failed" ? "Couldn’t copy. Select the text and copy it manually." : "";

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setStatus(""), status === "failed" ? 6000 : 3000);
    return () => clearTimeout(timer);
  }, [message, status]);
  useLayoutEffect(() => {
    if (message) setBelow(button.current.getBoundingClientRect().top < 96);
  }, [message]);

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
    <button ref={button} type="button" className={className} onClick={copy} disabled={status === "copying"} aria-describedby={message ? feedbackId : undefined}><Icon name="copy" size={iconSize}/>{children}</button>
    {message && <span id={feedbackId} className={`bridge-copy-toast ${below ? "is-below" : ""} ${status === "failed" ? "is-error" : ""}`} role={status === "failed" ? "alert" : "status"}>{message}</span>}
  </span>;
}
