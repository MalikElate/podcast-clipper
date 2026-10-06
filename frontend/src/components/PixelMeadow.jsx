import { useEffect, useRef } from "react";

// Dot-matrix sky over a meadow, drawn behind the lower half of the homepage demo.
// Every color comes from Meadow's palette or its flower mark, so the art reads
// as the brand.
const CELL = 6;
const DOT = 4;
// Center each dot in its cell so it lines up with the hero's CSS dot grid.
const INSET = (CELL - DOT) / 2;
const INK = "#233247";
const STEM = "#0f622b";
const LEAF = "#36745b";
const GRASS = "#72c991";
const SAGE = "#a5b697";
const MIST = "#cbd8bd";
const CREAM = "#fcfdf8";
const PETAL = "#fdbe01";
const BLOOM = "#fb614e";
const SKY_HIGH = "#c8d5ff";
const SKY = "#dceef6";
const SKY_LOW = "#e8eeff";

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

function skyColor(x, row, rows) {
  const horizon = row / rows;
  const cloud = noise2(x / 24, row / 7, 61) * 0.7 + noise2(x / 8, row / 3, 62) * 0.3;
  if (cloud > 0.74 - horizon * 0.1) return CREAM;
  const speck = hash(x, row, 63);
  if (speck < 0.05) return CREAM;
  // Mottled blue that lightens toward the horizon.
  const tone = noise2(x / 6, row / 6, 64) * 0.5 + speck * 0.5 - horizon * 0.3;
  if (tone > 0.45) return SKY_HIGH;
  if (tone > 0.25) return SKY;
  return SKY_LOW;
}

function fieldColor(x, row) {
  if (hash(x, row, 21) < 0.06) return PETAL;
  const tone = noise2(x / 5, row / 2, 22);
  if (tone < 0.4) return SAGE;
  if (tone < 0.62) return MIST;
  return GRASS;
}

function grassColor(x, row, depth) {
  if (depth < 1) return hash(x, row, 5) < 0.75 ? GRASS : PETAL;
  const speck = hash(x, row, 7);
  if (speck < 0.06) return PETAL;
  if (speck < 0.085) return BLOOM;
  if (speck < 0.1) return CREAM;
  const shade = noise2(x / 9, row / 4, 3) * 0.6 + noise2(x / 3, row / 2, 4) * 0.4 - Math.min(depth / 40, 0.5) * 0.6;
  if (shade < 0.1) return INK;
  if (shade < 0.28) return STEM;
  if (shade < 0.44) return LEAF;
  return GRASS;
}

function set(grid, row, column, color) {
  if (row >= 0 && row < grid.length && column >= 0 && column < grid[row].length) grid[row][column] = color;
}

function paint(columns, rows) {
  const grid = Array.from({ length: rows }, () => new Array(columns));
  // Anchor the pattern at the center so resizing reveals more meadow at the edges.
  const center = Math.floor(columns / 2);
  // The grass fills the lower half, rising a little above the demo's bottom edge.
  const base = Math.max(8, Math.round(rows * 0.5));
  const tallestStem = Math.min(8, Math.floor(columns / 12));
  const ground = [];
  for (let column = 0; column < columns; column += 1) {
    const x = column - center;
    const front = Math.round(base + (noise1(x / 55, 71) - 0.5) * 8 + (noise1(x / 13, 72) - 0.5) * 2);
    const back = front + 2 + Math.round(noise1(x / 30, 73) * 3);
    ground.push(front);
    for (let row = 0; row < rows; row += 1) {
      const height = rows - row;
      grid[row][column] = height <= front ? grassColor(x, row, front - height)
        : height <= back ? fieldColor(x, row)
        : skyColor(x, row, rows);
    }
  }

  // Blades and flowers rise above the grass line.
  let lastFlower = -Infinity;
  for (let column = 0; column < columns; column += 1) {
    const x = column - center;
    const top = rows - ground[column] - 1;
    const blade = hash(x, 0, 81);
    if (blade < 0.4) {
      set(grid, top, column, blade < 0.2 ? GRASS : LEAF);
      if (blade < 0.12) set(grid, top - 1, column, GRASS);
    }
    const bloom = hash(x, 0, 83);
    if (bloom < 0.15 && column - lastFlower >= 4) {
      lastFlower = column;
      const stem = 2 + Math.floor(hash(x, 1, 84) * tallestStem);
      for (let step = 0; step < stem; step += 1) set(grid, top - step, column, STEM);
      const head = top - stem - 1;
      const coral = hash(x, 2, 85) < 0.3;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) set(grid, head + dy, column + dx, coral ? BLOOM : PETAL);
      }
      set(grid, head, column, coral ? PETAL : BLOOM);
    } else if (bloom > 0.95) {
      // A small daisy on a short stem.
      set(grid, top, column, STEM);
      set(grid, top - 1, column, CREAM);
    }
  }
  return grid;
}

function draw(canvas) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  // Integer pixel ratios scale a 1x canvas exactly (image-rendering: pixelated).
  const deviceRatio = window.devicePixelRatio || 1;
  const ratio = Number.isInteger(deviceRatio) ? 1 : Math.min(deviceRatio, 3);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const columns = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const cells = new Map();
  paint(columns, rows).forEach((line, row) => line.forEach((color, column) => {
    if (!cells.has(color)) cells.set(color, []);
    cells.get(color).push(column, row);
  }));
  for (const [color, points] of cells) {
    context.fillStyle = color;
    for (let index = 0; index < points.length; index += 2) {
      context.fillRect(points[index] * CELL + INSET, points[index + 1] * CELL + INSET, DOT, DOT);
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
