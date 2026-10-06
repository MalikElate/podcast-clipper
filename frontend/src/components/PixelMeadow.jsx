import { useEffect, useRef } from "react";

// Dot-matrix meadow behind the homepage demo. Every color comes from Meadow's
// palette or its flower mark, so the art reads as part of the brand.
const CELL = 6;
const DOT = 4;
const INK = "#233247";
const STEM = "#0f622b";
const LEAF = "#36745b";
const GRASS = "#72c991";
const SAGE = "#a5b697";
const MIST = "#cbd8bd";
const CREAM = "#fcfdf8";
const PETAL = "#fdbe01";
const BLOOM = "#fb614e";

function hash(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = t => t * t * (3 - 2 * t);

function noise1(x, seed) {
  const i = Math.floor(x);
  const t = smooth(x - i);
  return hash(i, 0, seed) * (1 - t) + hash(i + 1, 0, seed) * t;
}

function noise2(x, y, seed) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const tx = smooth(x - i);
  const ty = smooth(y - j);
  const top = hash(i, j, seed) * (1 - tx) + hash(i + 1, j, seed) * tx;
  const bottom = hash(i, j + 1, seed) * (1 - tx) + hash(i + 1, j + 1, seed) * tx;
  return top * (1 - ty) + bottom * ty;
}

function ridge(x, seed) {
  return noise1(x / 46, seed) * 0.55 + noise1(x / 17, seed + 1) * 0.3 + noise1(x / 6, seed + 2) * 0.15;
}

function texture(x, y, seed) {
  return noise2(x / 9, y / 6, seed) * 0.6 + noise2(x / 3.5, y / 2.5, seed + 1) * 0.4;
}

function cellColor(x, row, rows, center) {
  const height = rows - row;
  const front = rows * (0.2 + 0.62 * ridge(x, 11));
  const back = rows * (0.5 + 0.42 * ridge(x + 300, 23));
  // Low mist gathers toward the edges, leaving the middle of the field clear.
  const edge = Math.min(Math.abs(x) / Math.max(center, 1), 1);
  if (edge > 0.45 && height < rows * 0.3 && noise2(x / 16, row / 5, 41) > 0.86 - (edge - 0.45) * 0.45) return CREAM;
  if (height <= front) {
    const depth = front - height;
    if (depth < 1.5) return hash(x, row, 5) < 0.5 ? GRASS : PETAL;
    const speck = hash(x, row, 7);
    if (speck < 0.035) return PETAL;
    if (speck < 0.06) return BLOOM;
    const shade = texture(x, row, 3) - Math.min(depth / rows, 0.5) * 0.35;
    if (shade < 0.3) return INK;
    if (shade < 0.4) return STEM;
    if (shade < 0.52) return LEAF;
    if (shade < 0.66) return GRASS;
    return hash(x, row, 9) < 0.6 ? PETAL : BLOOM;
  }
  if (height <= back) {
    const speck = hash(x, row, 13);
    if (speck < 0.04) return GRASS;
    return texture(x, row, 17) < 0.5 ? SAGE : MIST;
  }
  return null;
}

function draw(canvas) {
  const { width, height } = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const columns = Math.ceil(width / CELL);
  const rows = Math.floor(height / CELL);
  const offsetY = height - rows * CELL;
  // Anchor the pattern at the center so resizing reveals more meadow at the edges.
  const center = Math.floor(columns / 2);
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const color = cellColor(column - center, row, rows, center);
      if (!color) continue;
      context.fillStyle = color;
      context.fillRect(column * CELL, offsetY + row * CELL, DOT, DOT);
    }
  }
}

export default function PixelMeadow({ className = "" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    let size = "";
    const observer = new ResizeObserver(([entry]) => {
      const next = `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`;
      if (next === size) return;
      size = next;
      draw(canvas);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  return <canvas ref={canvasRef} className={`pixel-meadow ${className}`.trim()} aria-hidden="true" />;
}
