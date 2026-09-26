import { useEffect, useId, useRef, useState } from 'react';

export function Field({ label, hint, children, ...props }) {
  const id = useId();
  return <div className="ft-field"><label htmlFor={id}>{label}</label>{children ? children(id) : <input id={id} {...props} />}{hint && <small>{hint}</small>}</div>;
}

export function CopyButton({ text, label = 'Copy', disabled = false }) {
  const [message, setMessage] = useState('');
  useEffect(() => { setMessage(''); }, [text]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3000); return () => clearTimeout(timer); }, [message]);
  return <span className="ft-copy"><button type="button" className="ft-button secondary" disabled={disabled || !text} onClick={async () => {
    try { await navigator.clipboard.writeText(text); setMessage('Copied'); }
    catch { setMessage('Select the text and copy it manually.'); }
  }}>{label}</button><small role="status">{message}</small></span>;
}

export function useLocalImage() {
  const [image, setImage] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const currentUrl = useRef(null);
  useEffect(() => () => { sequence.current++; if (currentUrl.current) URL.revokeObjectURL(currentUrl.current); }, []);
  async function load(file) {
    const request = ++sequence.current;
    setImage(null); setError(''); setLoading(false);
    if (currentUrl.current) { URL.revokeObjectURL(currentUrl.current); currentUrl.current = null; }
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPG, PNG, or WebP image.'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('Choose an image smaller than 20 MB.'); return; }
    setLoading(true);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url; await img.decode();
      if (request !== sequence.current) { URL.revokeObjectURL(url); return; }
      if (!img.naturalWidth || img.naturalWidth * img.naturalHeight > 40_000_000) throw new Error('Choose an image with no more than 40 megapixels.');
      currentUrl.current = url;
      setImage({ element: img, url, width: img.naturalWidth, height: img.naturalHeight, name: file.name });
    } catch (error) {
      URL.revokeObjectURL(url);
      if (request === sequence.current) setError(error.message.includes('megapixels') ? error.message : 'This image could not be read. Try another JPG, PNG, or WebP file.');
    } finally { if (request === sequence.current) setLoading(false); }
  }
  return { image, error, loading, load };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function requestTool(action, payload) {
  const response = await fetch(`/api/free-tools/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(22_000) });
  let data;
  try { data = await response.json(); } catch { throw new Error('The tool is temporarily unavailable. Please try again.'); }
  if (!response.ok) throw new Error(data.error || 'The request could not finish. Please try again.');
  return data;
}
