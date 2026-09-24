import { mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const width = 1200;
const height = 900;
const fps = 24;
const duration = 6;
const totalFrames = fps * duration;
const framesDir = join(tmpdir(), "meadow-crosspost-demo-frames");
const outputBase = new URL("../public/marketing/meadow-crosspost-demo-v1", import.meta.url).pathname;
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const ease = value => {
  const x = clamp(value);
  return 1 - (1 - x) ** 3;
};
const easeInOut = value => {
  const x = clamp(value);
  return x < .5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
};
const lerp = (a, b, amount) => a + (b - a) * amount;
const progress = (time, start, end) => ease((time - start) / (end - start));
const fade = (time, start, end) => 1 - progress(time, start, end);
const esc = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const text = (x, y, value, size = 18, weight = 500, fill = "#26344a", anchor = "start") =>
  `<text x="${x}" y="${y}" font-family="Inter,Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(value)}</text>`;
const rect = (x, y, w, h, fill, radius = 0, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" ${extra}/>`;

function flower(x, y, scale = 1) {
  const petals = Array.from({ length: 10 }, (_, index) => {
    const angle = (index / 10) * Math.PI * 2;
    const px = x + Math.cos(angle) * 14 * scale;
    const py = y + Math.sin(angle) * 14 * scale;
    return `<ellipse cx="${px}" cy="${py}" rx="3.8" ry="8" fill="${index % 2 ? "#ff9d4d" : "#f6c445"}" transform="rotate(${index * 36 + 90} ${px} ${py})"/>`;
  }).join("");
  return `${petals}<circle cx="${x}" cy="${y}" r="5" fill="#6caf5b"/><path d="M${x} ${y + 17} C${x - 5} ${y + 30},${x + 8} ${y + 39},${x + 2} ${y + 53}" fill="none" stroke="#69a757" stroke-width="3" stroke-linecap="round"/>`;
}

const check = (x, y, color) => `<path d="m${x + 2} ${y + 10} 6 6 11-13" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;

function sidebar() {
  const items = [
    ["Create", "+"], ["Calendar", "□"], ["Posts", "≡"], ["Scheduled", "◷"], ["Drafts", "◇"], ["Connections", "∞"],
  ];
  return `
    ${rect(0, 0, 206, height, "#202124")}
    ${flower(37, 34, .58)}
    ${text(64, 47, "meadow.", 23, 760, "#ffffff")}
    ${items.map(([label, mark], index) => {
      const y = 126 + index * 58;
      const active = label === "Create";
      return `${active ? rect(18, y - 30, 170, 44, "#34373b", 12) : ""}${text(42, y, mark, 21, 500, active ? "#7bd694" : "#9da3aa")}${text(73, y, label, 15, active ? 700 : 520, active ? "#ffffff" : "#c7cbd0")}`;
    }).join("")}
    ${rect(20, 822, 166, 52, "#292b2f", 13)}
    <circle cx="47" cy="848" r="14" fill="#dce8ff"/>${text(47, 854, "M", 14, 800, "#3f64b6", "middle")}
    ${text(70, 845, "Meadow Studio", 12, 700, "#ffffff")}${text(70, 861, "Workspace", 10, 500, "#989ea6")}
  `;
}

const thumb = (x, y, w, h, radius, video = false) => `
  <g>${rect(x, y, w, h, "url(#media)", radius)}
  <circle cx="${x + w * .72}" cy="${y + h * .3}" r="${Math.min(w, h) * .12}" fill="#ffe7a8" opacity=".9"/>
  <path d="M${x} ${y + h * .78} Q${x + w * .3} ${y + h * .5} ${x + w * .55} ${y + h * .72} T${x + w} ${y + h * .62} V${y + h - radius} Q${x + w} ${y + h} ${x + w - radius} ${y + h} H${x + radius} Q${x} ${y + h} ${x} ${y + h - radius}Z" fill="#4f9a62" opacity=".85"/>
  ${video ? `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="15" fill="#ffffffd9"/><path d="M${x + w / 2 - 5} ${y + h / 2 - 8} l13 8 -13 8z" fill="#26344a"/>` : ""}</g>`;

const caption = "Launch week starts now. One post, every channel.";

const composer = { x: 246, y: 88, w: 914, h: 214 };
const button = { x: 964, y: 238, w: 172, h: 44 };

function composerCard(time) {
  const typed = progress(time, .3, 1.15);
  const visible = caption.slice(0, Math.floor(caption.length * typed));
  const pressed = progress(time, 1.5, 1.58) * fade(time, 1.58, 1.72);
  const sent = time >= 1.6;
  const done = time >= postedAt(PLATFORMS.length - 1) + .25;
  const { x, y, w, h } = composer;
  return `
    ${rect(x, y, w, h, "#ffffff", 20, 'stroke="#dce2e8" stroke-width="1" filter="url(#soft)"')}
    ${thumb(x + 24, y + 24, 150, 166, 14)}
    ${text(x + 198, y + 48, "New post", 12, 760, "#6f7c8d")}
    ${text(x + 198, y + 84, visible, 19, 650, "#26344a")}
    ${typed < 1 ? rect(x + 198 + visible.length * 9.6, y + 67, 2, 22, "#3f68df") : ""}
    ${text(x + 198, y + 124, "Destinations", 11, 700, "#8a94a0")}
    ${PLATFORMS.map((platform, index) => `<circle cx="${x + 212 + index * 34}" cy="${y + 150}" r="13" fill="${platform.color}"/>${text(x + 212 + index * 34, y + 155, platform.mark, 12, 820, "#ffffff", "middle")}`).join("")}
    <g transform="translate(${button.x + button.w / 2} ${button.y + button.h / 2}) scale(${1 - pressed * .05}) translate(${-(button.x + button.w / 2)} ${-(button.y + button.h / 2)})">
      ${rect(button.x, button.y, button.w, button.h, sent ? "#62c57d" : "#3f68df", 13)}
      ${text(button.x + button.w / 2, button.y + 28, done ? "All posted ✓" : sent ? "Posting…" : "Post everywhere", 14, 740, sent ? "#173c25" : "#ffffff", "middle")}
    </g>
  `;
}

const PLATFORMS = [
  { name: "Instagram", handle: "@meadowstudio", color: "#e64b75", mark: "I", shape: "square" },
  { name: "TikTok", handle: "@meadowstudio", color: "#202124", mark: "T", shape: "tall", video: true },
  { name: "LinkedIn", handle: "Meadow Studio", color: "#2674b8", mark: "in", shape: "wide" },
  { name: "YouTube", handle: "Meadow Studio", color: "#ff0033", mark: "▶", shape: "tall", video: true },
  { name: "Facebook", handle: "Meadow Studio", color: "#1877f2", mark: "f", shape: "wide" },
  { name: "X", handle: "@meadowstudio", color: "#111418", mark: "X", shape: "wide" },
];

const tileW = 290;
const tileH = 232;
const tileGap = 22;
const tileX = index => 246 + (index % 3) * (tileW + tileGap);
const tileY = index => 350 + Math.floor(index / 3) * (tileH + 22);
const launchAt = index => 1.7 + index * .12;
const postedAt = index => 2.75 + index * .16;

function tile(time, platform, index) {
  const appear = progress(time, launchAt(index) + .25, launchAt(index) + .6);
  if (appear <= 0) return "";
  const x = tileX(index);
  const y = tileY(index);
  const posted = progress(time, postedAt(index), postedAt(index) + .25);
  const pop = progress(time, postedAt(index), postedAt(index) + .12) * fade(time, postedAt(index) + .12, postedAt(index) + .35);
  const media = platform.shape === "tall" ? [x + 20, y + 62, 84, 150] : platform.shape === "square" ? [x + 20, y + 62, 124, 124] : [x + 20, y + 62, 250, 104];
  const copyX = platform.shape === "wide" ? x + 20 : media[0] + media[2] + 16;
  const copyY = platform.shape === "wide" ? y + 186 : y + 80;
  return `<g opacity="${appear}" transform="translate(0 ${lerp(14, 0, appear)})">
    ${rect(x, y, tileW, tileH, "#ffffff", 18, `stroke="${posted > .5 ? "#9fd9ae" : "#dce2e8"}" stroke-width="${posted > .5 ? 1.8 : 1}" filter="url(#soft)"`)}
    <circle cx="${x + 34}" cy="${y + 32}" r="15" fill="${platform.color}"/>${text(x + 34, y + 37, platform.mark, 13, 820, "#ffffff", "middle")}
    ${text(x + 58, y + 29, platform.name, 14, 760)}${text(x + 58, y + 45, platform.handle, 10, 520, "#7d8998")}
    ${thumb(...media, 10, platform.video)}
    ${platform.shape === "wide"
      ? `${rect(copyX, copyY, 190, 8, "#e3e8ee", 4)}${rect(copyX, copyY + 16, 120, 8, "#eef1f5", 4)}`
      : `${rect(copyX, copyY, tileW - (copyX - x) - 20, 8, "#e3e8ee", 4)}${rect(copyX, copyY + 16, (tileW - (copyX - x) - 20) * .7, 8, "#eef1f5", 4)}${rect(copyX, copyY + 32, (tileW - (copyX - x) - 20) * .85, 8, "#eef1f5", 4)}`}
    <g transform="translate(${x + tileW - 22} ${y + 32}) scale(${1 + pop * .18})">
      ${posted > 0
        ? `<g opacity="${posted}">${rect(-78, -14, 78, 28, "#eaf7ed", 14)}${text(-34, 5, "Posted", 11, 760, "#3f8f57", "middle")}<circle cx="-64" cy="0" r="7" fill="#62c57d"/><path d="m-67.5 0 2.5 2.5 5-5" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`
        : `${rect(-92, -14, 92, 28, "#f3f5f7", 14)}${text(-46, 5, "Publishing…", 10, 700, "#7d8998", "middle")}`}
    </g>
  </g>`;
}

// Ghost copies of the post that fly from the composer into each platform tile.
function flyers(time) {
  return PLATFORMS.map((platform, index) => {
    const start = launchAt(index);
    const amount = easeInOut((time - start) / .45);
    if (amount <= 0 || amount >= 1) return "";
    const fromX = button.x + button.w / 2;
    const fromY = button.y + button.h / 2;
    const toX = tileX(index) + tileW / 2;
    const toY = tileY(index) + 60;
    const arc = Math.sin(amount * Math.PI) * -40;
    const cx = lerp(fromX, toX, amount);
    const cy = lerp(fromY, toY, amount) + arc;
    const opacity = amount < .85 ? 1 : (1 - amount) / .15;
    return `<g opacity="${opacity}">
      <path d="M${fromX} ${fromY} Q${(fromX + toX) / 2} ${Math.min(fromY, toY) - 30} ${cx} ${cy}" fill="none" stroke="${platform.color}" stroke-width="2" stroke-dasharray="4 6" opacity=".35"/>
      ${rect(cx - 30, cy - 22, 60, 44, "#ffffff", 9, `stroke="${platform.color}" stroke-width="2" filter="url(#soft)"`)}
      ${thumb(cx - 24, cy - 16, 22, 32, 4)}
      ${rect(cx + 2, cy - 10, 22, 5, "#dfe4ea", 2.5)}${rect(cx + 2, cy, 16, 5, "#eef1f5", 2.5)}
    </g>`;
  }).join("");
}

function toast(time) {
  const show = progress(time, 3.75, 4.05) * fade(time, 5.45, 5.75);
  if (show <= 0) return "";
  return `<g opacity="${show}" transform="translate(0 ${lerp(16, 0, show)})">${rect(806, 22, 344, 58, "#173d2a", 15, 'filter="url(#shadow)"')}<circle cx="838" cy="51" r="14" fill="#70d18a"/>${check(828, 41, "#173d2a")}${text(864, 47, "Posted to 6 platforms", 14, 760, "#ffffff")}${text(864, 66, "One post · every channel · done.", 10, 500, "#c9e7d2")}</g>`;
}

function cursorPosition(time) {
  const stops = [
    [0, 1100, 820], [.5, 1100, 820], [1.4, 1050, 262], [1.9, 1050, 262], [3.2, 1150, 324], [6, 1150, 324],
  ];
  for (let index = 1; index < stops.length; index += 1) {
    if (time <= stops[index][0]) {
      const previous = stops[index - 1];
      const next = stops[index];
      const amount = progress(time, previous[0], next[0]);
      return [lerp(previous[1], next[1], amount), lerp(previous[2], next[2], amount)];
    }
  }
  return stops.at(-1).slice(1);
}

function cursor(time) {
  const [x, y] = cursorPosition(time);
  const click = progress(time, 1.5, 1.61) * fade(time, 1.61, 1.78);
  return `${click > 0 ? `<circle cx="${x}" cy="${y}" r="${20 + click * 13}" fill="none" stroke="#5e7ee0" stroke-width="4" opacity="${click}"/>` : ""}<path d="M${x} ${y} l2 27 7-7 7 16 8-4-8-16 11-1z" fill="#ffffff" stroke="#202b3b" stroke-width="2.5" stroke-linejoin="round" filter="url(#cursorShadow)"/>`;
}

function frame(time) {
  const overall = time > 5.7 ? fade(time, 5.7, 6) : progress(time, 0, .2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="media" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bfe0ff"/><stop offset="1" stop-color="#d9f0d2"/></linearGradient>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#17233a" flood-opacity=".08"/></filter>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#17233a" flood-opacity=".2"/></filter>
      <filter id="cursorShadow" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#17233a" flood-opacity=".28"/></filter>
    </defs>
    ${rect(0, 0, width, height, "#f5f7f2")}
    <g opacity="${overall}">
      ${sidebar()}
      ${text(246, 52, "Cross-platform post", 26, 760)}
      ${composerCard(time)}
      ${PLATFORMS.map((platform, index) => tile(time, platform, index)).join("")}
      ${flyers(time)}
      ${toast(time)}
      ${cursor(time)}
    </g>
  </svg>`;
}

for (let index = 0; index < totalFrames; index += 1) {
  const filename = join(framesDir, `frame-${String(index).padStart(4, "0")}.png`);
  await sharp(Buffer.from(frame(index / fps))).png({ compressionLevel: 6 }).toFile(filename);
}

function run(args) {
  const result = spawnSync(ffmpeg, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(framesDir, "frame-%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", `${outputBase}.mp4`]);
run(["-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(framesDir, "frame-%04d.png"), "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "31", "-row-mt", "1", `${outputBase}.webm`]);
await sharp(join(framesDir, "frame-0108.png")).webp({ quality: 82 }).toFile(`${outputBase}.webp`);

rmSync(framesDir, { recursive: true, force: true });
console.log(`Generated ${outputBase}.{mp4,webm,webp}`);
