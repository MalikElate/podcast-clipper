import { useEffect, useRef, useState } from 'react';
import { CopyButton, downloadBlob, Field, useLocalImage } from './freeToolUi.jsx';
import { drawContained, wrapCanvasText } from './mediaProcessing.js';
import './mediaTools.css';

export default function PostPreview() {
  const [platform, setPlatform] = useState('Instagram'), [name, setName] = useState('Your brand'), [handle, setHandle] = useState('yourbrand');
  const [caption, setCaption] = useState('A new week, a fresh idea. What are you creating today?'), [error, setError] = useState(''), [message, setMessage] = useState('');
  const { image, loading, error: imageError, load } = useLocalImage(), canvas = useRef(null), revision = useRef(0);
  useEffect(() => {
    revision.current++; setError(''); setMessage('');
    const element = canvas.current, context = element.getContext('2d');
    context.font = '32px system-ui';
    const lines = wrapCanvasText(context, caption, 952), lineHeight = 46;
    const textHeight = Math.max(80, lines.length * lineHeight + 48), imageHeight = image ? 1080 : 0;
    const height = 290 + textHeight + imageHeight + 130;
    if (height > 16000) { element.width = 1080; element.height = 1; setError('This preview has too many line breaks. Remove some blank lines before exporting.'); return; }
    element.width = 1080; element.height = height;
    context.fillStyle = '#fffefa'; context.fillRect(0, 0, 1080, height);
    context.fillStyle = '#385447'; context.font = '600 28px system-ui'; context.fillText(`${platform} · Preview only`, 64, 65);
    context.strokeStyle = '#dce2d8'; context.beginPath(); context.moveTo(0, 102); context.lineTo(1080, 102); context.stroke();
    const compact = platform === 'X';
    context.fillStyle = '#e4edda'; context.beginPath(); context.arc(110, 180, 46, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#233b31'; context.textAlign = 'center'; context.font = '600 36px system-ui'; context.fillText(Array.from(name.trim())[0]?.toUpperCase() || 'Y', 110, 193); context.textAlign = 'left';
    const headerLine = (value, y, font, color) => {
      context.font = font; context.fillStyle = color;
      const pieces = wrapCanvasText(context, value, 830); context.fillText(pieces[0] + (pieces.length > 1 ? '…' : ''), 180, y);
    };
    headerLine(name.trim() || 'Your brand', 170, '600 34px system-ui', '#233b31');
    headerLine(`@${handle.trim().replace(/^@+/, '') || 'yourbrand'}`, 216, '28px system-ui', '#637269');
    const imageFirst = platform === 'Instagram';
    const textTop = 290 + (imageFirst ? imageHeight : 0);
    if (image) {
      const imageTop = imageFirst ? 290 : 290 + textHeight;
      context.save(); context.translate(compact ? 64 : 0, imageTop);
      context.fillStyle = '#edf0e8'; context.fillRect(0, 0, compact ? 952 : 1080, 1080);
      drawContained(context, image.element, compact ? 952 : 1080, 1080); context.restore();
    }
    context.font = '32px system-ui'; context.fillStyle = '#233b31';
    lines.forEach((line, index) => context.fillText(line, 64, textTop + 42 + index * lineHeight));
    const footerTop = height - 100;
    context.strokeStyle = '#dce2d8'; context.beginPath(); context.moveTo(64, footerTop); context.lineTo(1016, footerTop); context.stroke();
    context.font = '24px system-ui'; context.fillStyle = '#637269'; context.fillText('Draft for review · Illustrative layout · Not a live post', 64, footerTop + 57);
  }, [platform, name, handle, caption, image]);
  function download() {
    const current = revision.current;
    canvas.current.toBlob(blob => {
      if (current !== revision.current) return;
      if (!blob) { setError('The PNG could not be created. Try a smaller image or caption.'); return; }
      downloadBlob(blob, `meadow-${platform.toLowerCase()}-post-preview.png`); setMessage('PNG downloaded.');
    }, 'image/png');
  }
  return <div className="ft-workbench"><div className="ft-controls">
    <Field label="Platform layout">{id => <select id={id} value={platform} onChange={event => setPlatform(event.target.value)}>{['Instagram', 'Facebook', 'LinkedIn', 'X'].map(value => <option key={value}>{value}</option>)}</select>}</Field>
    <Field label="Display name" value={name} maxLength={80} onChange={event => setName(event.target.value)} />
    <Field label="Handle" value={handle} maxLength={80} onChange={event => setHandle(event.target.value)} />
    <Field label="Caption">{id => <textarea id={id} value={caption} maxLength={3000} rows="7" onChange={event => setCaption(event.target.value)} />}</Field>
    <Field label="Image (optional)" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void load(event.target.files[0])} hint="Up to 20 MB and 40 megapixels. Files stay on your device." />
    {loading && <p role="status">Reading image…</p>}{image && <button className="ft-button secondary" onClick={() => void load(null)}>Remove image</button>}
    <button className="ft-button" disabled={loading || Boolean(error || imageError)} onClick={download}>Download PNG preview</button><CopyButton text={caption} label="Copy caption" />
    {(error || imageError) && <p role="alert" className="ft-error">{error || imageError}</p>}<p role="status" className="ft-hint">{message}</p>
    <p className="ft-hint">Draft layout for reviewing text and imagery. App fonts, spacing, crops and controls can differ. No likes, views or account data are fetched.</p>
  </div><div className="ft-result"><h2>Your post preview</h2><canvas ref={canvas} className="ft-post-preview" aria-label={`${platform} post mockup, marked Preview only`} /><p className="ft-hint">Instagram places the image first; Facebook and LinkedIn place the caption first. X uses an inset image. Every exported mockup is marked Preview only.</p></div></div>;
}
