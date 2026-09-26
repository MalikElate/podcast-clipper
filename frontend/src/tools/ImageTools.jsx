import { useEffect, useRef, useState } from 'react';
import { cropRectangle, sliceRectangles } from '../../../shared/freeTools.js';
import { CROP_PRESETS } from './freeToolsCatalog.js';
import { downloadBlob, Field, useLocalImage } from './freeToolUi.jsx';

export default function ImageTools({ mode }) {
  const isCrop = mode === 'crop', isGrid = mode === 'grid';
  const { image, error: imageError, loading, load } = useLocalImage();
  const [presetId, setPresetId] = useState(CROP_PRESETS[0].id);
  const [customWidth, setCustomWidth] = useState(1080), [customHeight, setCustomHeight] = useState(1080);
  const [rows, setRows] = useState(3), [slides, setSlides] = useState(3), [tileHeight, setTileHeight] = useState(1080);
  const [zoom, setZoom] = useState(1), [x, setX] = useState(50), [y, setY] = useState(50);
  const [format, setFormat] = useState('image/jpeg'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const canvas = useRef(null);
  useEffect(() => { const requested = new URLSearchParams(window.location.search).get('preset'); if (CROP_PRESETS.some(p => p.id === requested)) setPresetId(requested); }, []);
  const preset = CROP_PRESETS.find(p => p.id === presetId);
  const width = isCrop ? (preset?.width ?? Number(customWidth)) : 1080;
  const height = isCrop ? (preset?.height ?? Number(customHeight)) : tileHeight;
  const dimensionsValid = [width, height].every(n => Number.isInteger(n) && n >= 100 && n <= 4096);
  const columns = isCrop ? 1 : isGrid ? 3 : slides;
  const rowCount = isGrid ? rows : 1;
  const crop = image && dimensionsValid ? cropRectangle(image.width, image.height, width * columns, height * rowCount, zoom, x, y) : null;
  const rects = crop ? sliceRectangles(crop, columns, rowCount) : [];
  const total = columns * rowCount;
  const number = i => isGrid ? total - i : i + 1;
  const extension = format === 'image/png' ? 'png' : 'jpg';
  const filename = i => `meadow-${mode}-${String(number(i)).padStart(2, '0')}.${extension}`;

  useEffect(() => {
    if (!canvas.current || !image || !crop) return;
    const el = canvas.current;
    const scale = Math.min(900 / (width * columns), 650 / (height * rowCount), 1);
    el.width = Math.round(width * columns * scale); el.height = Math.round(height * rowCount * scale);
    const ctx = el.getContext('2d');
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.drawImage(image.element, crop.x, crop.y, crop.width, crop.height, 0, 0, el.width, el.height);
  }, [image, width, height, columns, rowCount, zoom, x, y]);

  async function makeBlob(index) {
    const rect = rects[index];
    const output = document.createElement('canvas'); output.width = width; output.height = height;
    const ctx = output.getContext('2d');
    if (format === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
    ctx.drawImage(image.element, rect.x, rect.y, rect.width, rect.height, 0, 0, width, height);
    const blob = await new Promise(resolve => output.toBlob(resolve, format, .94));
    output.width = 0; output.height = 0;
    if (!blob) throw new Error('Could not export this image. Try a smaller size or JPG.');
    return blob;
  }
  async function download(index) {
    setBusy(true); setError('');
    try {
      if (index !== undefined) downloadBlob(await makeBlob(index), filename(index));
      else {
        const { zipSync } = await import('fflate');
        const files = {};
        for (let i = 0; i < total; i++) files[filename(i)] = new Uint8Array(await (await makeBlob(i)).arrayBuffer());
        downloadBlob(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), `meadow-instagram-${mode}.zip`);
      }
    } catch (error) { setError(error.message || 'The download failed. Please try again.'); }
    finally { setBusy(false); }
  }

  return <div className="ft-workbench ft-image-workbench">
    <fieldset className="ft-controls" disabled={busy}>
      <Field label="Choose an image" hint="JPG, PNG, or WebP · up to 20 MB · processed on your device">{id => <input id={id} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { load(e.target.files?.[0]); setZoom(1); setX(50); setY(50); setError(''); }} />}</Field>
      {isCrop ? <>
        <Field label="Canvas size">{id => <select id={id} value={presetId} onChange={e => setPresetId(e.target.value)}>{CROP_PRESETS.map(p => <option value={p.id} key={p.id}>{p.label} ({p.width} × {p.height})</option>)}<option value="custom">Custom size</option></select>}</Field>
        {presetId === 'custom' && <div className="ft-two-fields"><Field label="Width (px)" type="number" min="100" max="4096" step="1" value={customWidth} onChange={e => setCustomWidth(e.target.value)} /><Field label="Height (px)" type="number" min="100" max="4096" step="1" value={customHeight} onChange={e => setCustomHeight(e.target.value)} /></div>}
      </> : <>
        <Field label={isGrid ? 'Grid layout' : 'Number of slides'}>{id => <select id={id} value={isGrid ? rows : slides} onChange={e => isGrid ? setRows(Number(e.target.value)) : setSlides(Number(e.target.value))}>{(isGrid ? [1,2,3,4] : [2,3,4,5,6,7,8,9,10]).map(n => <option value={n} key={n}>{isGrid ? `3 columns × ${n} ${n === 1 ? 'row' : 'rows'} (${n * 3} posts)` : `${n} slides`}</option>)}</select>}</Field>
        <Field label="Tile shape">{id => <select id={id} value={tileHeight} onChange={e => setTileHeight(Number(e.target.value))}><option value={1080}>Square · 1080 × 1080</option><option value={1350}>Portrait · 1080 × 1350</option><option value={1440}>Tall portrait · 1080 × 1440</option></select>}</Field>
      </>}
      <Field label={`Zoom · ${Number(zoom).toFixed(1)}×`}>{id => <input id={id} type="range" min="1" max="3" step=".05" value={zoom} disabled={!image} onChange={e => setZoom(Number(e.target.value))} />}</Field>
      <Field label="Horizontal position">{id => <input id={id} type="range" min="0" max="100" value={x} disabled={!image} onChange={e => setX(Number(e.target.value))} />}</Field>
      <Field label="Vertical position">{id => <input id={id} type="range" min="0" max="100" value={y} disabled={!image} onChange={e => setY(Number(e.target.value))} />}</Field>
      <Field label="Download format">{id => <select id={id} value={format} onChange={e => setFormat(e.target.value)}><option value="image/jpeg">JPG · smaller file</option><option value="image/png">PNG · keep transparency</option></select>}</Field>
      <button className="ft-button" type="button" disabled={!image || !dimensionsValid || busy} onClick={() => download(isCrop ? 0 : undefined)}>{busy ? 'Preparing download…' : isCrop ? 'Download image' : `Download ${total} images as ZIP`}</button>
      {(imageError || error || !dimensionsValid) && <p role="alert" className="ft-error">{imageError || error || 'Enter whole-number dimensions from 100 to 4096 pixels.'}</p>}
    </fieldset>
    <div className="ft-preview-area">
      <div className="ft-panel-heading"><h2>{isCrop ? 'Crop preview' : isGrid ? 'Profile grid preview' : 'Carousel preview'}</h2><span>{dimensionsValid ? `${width} × ${height} px${isCrop ? '' : ' each'}` : 'Custom dimensions'}</span></div>
      {image && crop ? <>
        <div className="ft-canvas-wrap"><canvas ref={canvas} aria-label="Image crop preview" /><div className="ft-grid-overlay" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gridTemplateRows: `repeat(${rowCount}, 1fr)` }}>{!isCrop && rects.map((_, i) => <span key={i}><b>{number(i)}</b></span>)}</div></div>
        <p className="ft-hint">{image.width} × {image.height} original{crop.width / columns < width || crop.height / rowCount < height ? ' · This crop enlarges your image and may look softer.' : ''}</p>
        {!isCrop && <><p className="ft-hint">{isGrid ? 'Numbers show posting order. Start with 01 at the bottom right. Instagram profile previews may crop each tile.' : 'Upload the numbered slides from left to right as a single carousel.'}</p><div className="ft-tile-downloads">{rects.map((_, i) => <button key={i} type="button" disabled={busy} onClick={() => download(i)}>Download {String(number(i)).padStart(2,'0')}</button>)}</div></>}
      </> : <div className="ft-image-empty"><svg viewBox="0 0 160 120" aria-hidden="true"><rect x="15" y="10" width="130" height="100" rx="8"/><circle cx="110" cy="38" r="12"/><path d="m15 90 40-45 38 40 20-23 32 38"/></svg><p role="status">{loading ? 'Reading your image…' : 'Choose an image to start framing.'}</p></div>}
      <p className="ft-hint">No upload. No watermark. Your file stays on this device.</p>
    </div>
  </div>;
}
