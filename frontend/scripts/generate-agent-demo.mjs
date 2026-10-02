import { mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const width = 1200;
const height = 900;
const fps = 24;
const duration = 7;
const totalFrames = fps * duration;
const framesDir = join(tmpdir(), "meadow-agent-demo-frames");
const outputBase = new URL("../public/marketing/meadow-agent-demo-v1", import.meta.url).pathname;
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

const thumb = (x, y, w, h, radius, video = false) => `
  <g>${rect(x, y, w, h, "url(#media)", radius)}
  <circle cx="${x + w * .72}" cy="${y + h * .3}" r="${Math.min(w, h) * .12}" fill="#ffe7a8" opacity=".9"/>
  <path d="M${x} ${y + h * .78} Q${x + w * .3} ${y + h * .5} ${x + w * .55} ${y + h * .72} T${x + w} ${y + h * .62} V${y + h - radius} Q${x + w} ${y + h} ${x + w - radius} ${y + h} H${x + radius} Q${x} ${y + h} ${x} ${y + h - radius}Z" fill="#4f9a62" opacity=".85"/>
  ${video ? `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="15" fill="#ffffffd9"/><path d="M${x + w / 2 - 5} ${y + h / 2 - 8} l13 8 -13 8z" fill="#26344a"/>` : ""}</g>`;

const PLATFORMS = [
  { name: "Instagram", handle: "@meadowstudio", color: "#e64b75", mark: "I", shape: "square" },
  { name: "TikTok", handle: "@meadowstudio", color: "#202124", mark: "T", shape: "tall", video: true },
  { name: "YouTube", handle: "Meadow Studio", color: "#ff0033", mark: "▶", shape: "tall", video: true },
  { name: "LinkedIn", handle: "Meadow Studio", color: "#2674b8", mark: "in", shape: "wide" },
  { name: "Facebook", handle: "Meadow Studio", color: "#1877f2", mark: "f", shape: "wide" },
  { name: "X", handle: "@meadowstudio", color: "#111418", mark: "X", shape: "wide" },
];

const prompt = "Post our launch clip to every channel.";
const chat = { x: 36, y: 36, w: 540, h: 828 };
const typedAt = [.3, 1.15];
const sentAt = 1.35;
const createCall = { y: 256, start: 1.9, done: 2.45 };
const publishCall = { y: 346, start: 2.65 };
const launchAt = index => 2.8 + index * .12;
const postedAt = index => 3.7 + index * .16;
const allPostedAt = postedAt(PLATFORMS.length - 1) + .25;
const replyAt = allPostedAt + .2;

const tileW = 260;
const tileH = 232;
const tileX = index => 612 + (index % 2) * (tileW + 24);
const tileY = index => 110 + Math.floor(index / 2) * (tileH + 20);

function spinner(x, y, time, color = "#3f68df") {
  return `<circle cx="${x}" cy="${y}" r="8" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="32 18" transform="rotate(${(time * 420) % 360} ${x} ${y})"/>`;
}

function doneMark(x, y, amount = 1) {
  return `<g opacity="${amount}"><circle cx="${x}" cy="${y}" r="10" fill="#62c57d"/><path d="m${x - 4.5} ${y} 3 3 6.5-6.5" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

function agentAvatar(x, y, size = 36) {
  const s = size / 36;
  return `${rect(x, y, size, size, "#eaf1e1", 11 * s)}
    <g transform="translate(${x + 6 * s} ${y + 6 * s}) scale(${s})" fill="none" stroke="#52793f" stroke-width="1.8" stroke-linecap="round">
      <rect x="4" y="8" width="16" height="13" rx="5"/><path d="M12 3v5M9 17h6"/><circle cx="9" cy="13" r=".8" fill="#52793f"/><circle cx="15" cy="13" r=".8" fill="#52793f"/>
    </g>`;
}

function toolCall(time, call, name, detail, doneAt) {
  const appear = progress(time, call.start, call.start + .3);
  if (appear <= 0) return "";
  const x = chat.x + 70;
  const w = chat.w - 94;
  const done = progress(time, doneAt, doneAt + .2);
  return `<g opacity="${appear}" transform="translate(0 ${lerp(10, 0, appear)})">
    ${rect(x, call.y, w, 72, "#ffffff", 14, `stroke="${done > .5 ? "#9fd9ae" : "#dfe5d9"}" stroke-width="${done > .5 ? 1.6 : 1}"`)}
    ${rect(x + 16, call.y + 16, 40, 40, "#202124", 10)}<clipPath id="tool-${name}"><rect x="${x + 16}" y="${call.y + 16}" width="40" height="40" rx="10"/></clipPath><g clip-path="url(#tool-${name})">${flower(x + 36, call.y + 33, .42)}</g>
    ${text(x + 70, call.y + 32, name, 15, 760, "#26344a")}
    ${text(x + 70, call.y + 53, detail, 12, 520, "#7d8998")}
    ${done > 0 ? doneMark(x + w - 28, call.y + 36, done) : spinner(x + w - 28, call.y + 36, time)}
  </g>`;
}

function chatPanel(time) {
  const { x, y, w, h } = chat;
  const typed = progress(time, ...typedAt);
  const sent = time >= sentAt;
  const draft = sent ? "" : prompt.slice(0, Math.floor(prompt.length * typed));
  const bubble = progress(time, sentAt, sentAt + .25);
  const bubbleW = prompt.length * 8.6 + 36;
  const thinking = time >= sentAt + .15 && time < createCall.start;
  const intro = progress(time, sentAt + .35, sentAt + .6);
  const reply = progress(time, replyAt, replyAt + .35);
  const dots = [0, 1, 2].map(index => `<circle cx="${x + 90 + index * 14}" cy="${y + 196}" r="4" fill="#9aa69a" opacity="${.35 + .65 * Math.abs(Math.sin(time * 5 - index * .7))}"/>`).join("");
  return `
    ${rect(x, y, w, h, "#fcfdf9", 22, 'stroke="#dfe5d9" stroke-width="1" filter="url(#soft)"')}
    <path d="M${x} ${y + 72} H${x + w}" stroke="#e6eadf"/>
    ${agentAvatar(x + 22, y + 18)}
    ${text(x + 70, y + 36, "AI agent", 16, 760, "#26372e")}
    <circle cx="${x + 74}" cy="${y + 52}" r="3.5" fill="#63a66c"/>${text(x + 84, y + 56, "Meadow MCP connected", 11, 560, "#6a7867")}

    ${bubble > 0 ? `<g opacity="${bubble}" transform="translate(0 ${lerp(12, 0, bubble)})">${rect(x + w - 24 - bubbleW, y + 100, bubbleW, 48, "#eaf0e2", 16)}${text(x + w - 24 - bubbleW + 18, y + 130, prompt, 15, 600, "#33432f")}</g>` : ""}

    ${time >= sentAt + .15 ? agentAvatar(x + 22, y + 172, 30) : ""}
    ${thinking && intro <= 0 ? dots : ""}
    ${intro > 0 ? `<g opacity="${intro}">${text(x + 70, y + 192, "On it. Creating the post in Meadow for 6 channels.", 15, 560, "#33432f")}</g>` : ""}

    ${toolCall(time, createCall, "meadow.create_post", "Launch clip · captions tailored per platform", createCall.done)}
    ${toolCall(time, publishCall, "meadow.publish_post", `Instagram, TikTok, YouTube, LinkedIn, Facebook, X`, allPostedAt)}

    ${reply > 0 ? `<g opacity="${reply}" transform="translate(0 ${lerp(12, 0, reply)})">
      ${rect(x + 70, y + 440, w - 94, 78, "#173d2a", 16)}
      <circle cx="${x + 104}" cy="${y + 479}" r="15" fill="#70d18a"/>${check(x + 94, y + 469, "#173d2a")}
      ${text(x + 132, y + 474, "Live on 6 platforms.", 17, 760, "#ffffff")}
      ${text(x + 132, y + 496, "Posted from one message. No tabs, no copy-paste.", 12, 500, "#c9e7d2")}
    </g>` : ""}

    ${rect(x + 20, y + h - 70, w - 40, 50, "#ffffff", 16, 'stroke="#e1e7db" stroke-width="1"')}
    ${draft ? text(x + 40, y + h - 39, draft, 15, 560, "#26344a") : text(x + 40, y + h - 39, "Ask your agent…", 15, 500, "#9aa4a0")}
    ${!sent && typed > 0 && typed < 1 ? rect(x + 40 + draft.length * 8.6 + 2, y + h - 55, 2, 21, "#3f68df") : ""}
    <circle cx="${x + w - 45}" cy="${y + h - 45}" r="15" fill="${typed >= 1 && !sent ? "#3f68df" : "#dfe5d9"}"/>
    <path d="M${x + w - 45} ${y + h - 38} v-14 m-6 6 6-6 6 6" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

function tile(time, platform, index) {
  const appear = progress(time, 0, .5);
  const x = tileX(index);
  const y = tileY(index);
  const incoming = progress(time, launchAt(index) + .3, launchAt(index) + .55);
  const posted = progress(time, postedAt(index), postedAt(index) + .25);
  const pop = progress(time, postedAt(index), postedAt(index) + .12) * fade(time, postedAt(index) + .12, postedAt(index) + .35);
  const media = platform.shape === "tall" ? [x + 20, y + 62, 84, 150] : platform.shape === "square" ? [x + 20, y + 62, 124, 124] : [x + 20, y + 62, tileW - 40, 104];
  const copyX = platform.shape === "wide" ? x + 20 : media[0] + media[2] + 16;
  const copyY = platform.shape === "wide" ? y + 186 : y + 80;
  const copyW = tileW - (copyX - x) - 20;
  const content = incoming > 0 ? `<g opacity="${incoming}">
      ${thumb(...media, 10, platform.video)}
      ${platform.shape === "wide"
        ? `${rect(copyX, copyY, 170, 8, "#e3e8ee", 4)}${rect(copyX, copyY + 16, 110, 8, "#eef1f5", 4)}`
        : `${rect(copyX, copyY, copyW, 8, "#e3e8ee", 4)}${rect(copyX, copyY + 16, copyW * .7, 8, "#eef1f5", 4)}${rect(copyX, copyY + 32, copyW * .85, 8, "#eef1f5", 4)}`}
    </g>` : `${rect(x + 20, y + 62, tileW - 40, 150, "#f3f5f7", 10, 'stroke="#e3e8ee" stroke-dasharray="5 6"')}`;
  const status = posted > 0
    ? `<g opacity="${posted}">${rect(-78, -14, 78, 28, "#eaf7ed", 14)}${text(-34, 5, "Posted", 11, 760, "#3f8f57", "middle")}<circle cx="-64" cy="0" r="7" fill="#62c57d"/><path d="m-67.5 0 2.5 2.5 5-5" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`
    : incoming > 0
      ? `${rect(-92, -14, 92, 28, "#f3f5f7", 14)}${text(-46, 5, "Publishing…", 10, 700, "#7d8998", "middle")}`
      : `${rect(-60, -14, 60, 28, "#f3f5f7", 14)}${text(-30, 5, "Idle", 10, 700, "#a3adb8", "middle")}`;
  return `<g opacity="${appear}">
    ${rect(x, y, tileW, tileH, "#ffffff", 18, `stroke="${posted > .5 ? "#9fd9ae" : "#dce2e8"}" stroke-width="${posted > .5 ? 1.8 : 1}" filter="url(#soft)"`)}
    <circle cx="${x + 34}" cy="${y + 32}" r="15" fill="${platform.color}"/>${text(x + 34, y + 37, platform.mark, 13, 820, "#ffffff", "middle")}
    ${text(x + 58, y + 29, platform.name, 14, 760)}${text(x + 58, y + 45, platform.handle, 10, 520, "#7d8998")}
    ${content}
    <g transform="translate(${x + tileW - 18} ${y + 32}) scale(${1 + pop * .18})">${status}</g>
  </g>`;
}

// Ghost copies of the post that fly from the agent's publish call into each platform tile.
function flyers(time) {
  return PLATFORMS.map((platform, index) => {
    const amount = easeInOut((time - launchAt(index)) / .5);
    if (amount <= 0 || amount >= 1) return "";
    const fromX = chat.x + chat.w - 40;
    const fromY = publishCall.y + 36;
    const toX = tileX(index) + tileW / 2;
    const toY = tileY(index) + 120;
    const cx = lerp(fromX, toX, amount);
    const cy = lerp(fromY, toY, amount) + Math.sin(amount * Math.PI) * -50;
    const opacity = amount < .85 ? 1 : (1 - amount) / .15;
    return `<g opacity="${opacity}">
      <path d="M${fromX} ${fromY} Q${(fromX + toX) / 2} ${Math.min(fromY, toY) - 40} ${cx} ${cy}" fill="none" stroke="${platform.color}" stroke-width="2" stroke-dasharray="4 6" opacity=".35"/>
      ${rect(cx - 30, cy - 22, 60, 44, "#ffffff", 9, `stroke="${platform.color}" stroke-width="2" filter="url(#soft)"`)}
      ${thumb(cx - 24, cy - 16, 22, 32, 4)}
      ${rect(cx + 2, cy - 10, 22, 5, "#dfe4ea", 2.5)}${rect(cx + 2, cy, 16, 5, "#eef1f5", 2.5)}
    </g>`;
  }).join("");
}

function frame(time) {
  const overall = time > duration - .3 ? fade(time, duration - .3, duration) : progress(time, 0, .2);
  const counter = PLATFORMS.filter((_, index) => time >= postedAt(index) + .1).length;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="media" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bfe0ff"/><stop offset="1" stop-color="#d9f0d2"/></linearGradient>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#17233a" flood-opacity=".08"/></filter>
    </defs>
    ${rect(0, 0, width, height, "#f5f7f2")}
    <g opacity="${overall}">
      ${flower(630, 42, .5)}${text(656, 62, "meadow.", 22, 760, "#202124")}
      ${text(1156, 62, `${counter}/6 posted`, 14, 700, counter === 6 ? "#3f8f57" : "#7d8998", "end")}
      ${chatPanel(time)}
      ${PLATFORMS.map((platform, index) => tile(time, platform, index)).join("")}
      ${flyers(time)}
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
await sharp(join(framesDir, "frame-0132.png")).webp({ quality: 82 }).toFile(`${outputBase}.webp`);

rmSync(framesDir, { recursive: true, force: true });
console.log(`Generated ${outputBase}.{mp4,webm,webp}`);
