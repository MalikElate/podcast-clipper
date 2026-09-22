import { mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const width = 1200;
const height = 900;
const fps = 24;
const duration = 11;
const totalFrames = fps * duration;
const framesDir = join(tmpdir(), "meadow-scheduling-demo-frames");
const outputBase = new URL("../public/marketing/meadow-scheduling-demo-v1", import.meta.url).pathname;
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const ease = value => {
  const x = clamp(value);
  return 1 - (1 - x) ** 3;
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

function icon(name, x, y, color = "currentColor") {
  const paths = {
    calendar: `<rect x="${x}" y="${y + 3}" width="20" height="18" rx="4" fill="none" stroke="${color}" stroke-width="2"/><path d="M${x + 5} ${y}v6M${x + 15} ${y}v6M${x} ${y + 9}h20" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`,
    plus: `<path d="M${x + 10} ${y + 2}v16M${x + 2} ${y + 10}h16" fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/>`,
    check: `<path d="m${x + 2} ${y + 10} 6 6 11-13" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    arrow: `<path d="M${x + 1} ${y + 10}h17m-6-6 6 6-6 6" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  };
  return paths[name] || "";
}

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
      const active = label === "Calendar";
      return `${active ? rect(18, y - 30, 170, 44, "#34373b", 12) : ""}${text(42, y, mark, 21, 500, active ? "#7bd694" : "#9da3aa")}${text(73, y, label, 15, active ? 700 : 520, active ? "#ffffff" : "#c7cbd0")}`;
    }).join("")}
    ${rect(20, 822, 166, 52, "#292b2f", 13)}
    <circle cx="47" cy="848" r="14" fill="#dce8ff"/>${text(47, 854, "M", 14, 800, "#3f64b6", "middle")}
    ${text(70, 845, "Meadow Studio", 12, 700, "#ffffff")}${text(70, 861, "Workspace", 10, 500, "#989ea6")}
  `;
}

const calendarEvents = [
  { col: 1, row: 1, label: "Launch teaser", time: "09:00", color: "#5f79e5" },
  { col: 3, row: 1, label: "Product tips", time: "12:30", color: "#dc7a9e" },
  { col: 5, row: 2, label: "Behind scenes", time: "16:00", color: "#7c62d5" },
  { col: 2, row: 3, label: "Creator story", time: "11:00", color: "#5aa68c" },
];

function calendarView(time, scheduled = false) {
  const x = 246;
  const y = 224;
  const cellW = 128;
  const cellH = 106;
  const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const days = Array.from({ length: 35 }, (_, index) => index + 1);
  const eventRows = calendarEvents.concat(scheduled ? [{ col: 3, row: 3, label: "Studio launch", time: "09:30", color: "#4cad70" }] : []);
  return `
    ${text(246, 104, "Publishing calendar", 32, 760)}
    ${text(246, 138, "See every scheduled and published delivery in one monthly view.", 15, 450, "#6f7c8d")}
    ${rect(960, 90, 190, 48, "#3f68df", 13)}${icon("plus", 981, 103, "#ffffff")}${text(1015, 121, "Create post", 14, 720, "#ffffff")}
    ${rect(246, 167, 906, 604, "#ffffff", 20, 'stroke="#dce2e8" stroke-width="1"')}
    ${text(277, 207, "‹", 28, 500, "#536175")}${text(322, 207, "›", 28, 500, "#536175")}
    ${rect(356, 180, 70, 34, "#f3f5f7", 10)}${text(391, 202, "Today", 12, 650, "#425168", "middle")}
    ${text(699, 207, "September 2026", 19, 720, "#26344a", "middle")}${text(1117, 205, scheduled ? "5 posts" : "4 posts", 12, 620, "#778393", "end")}
    ${weekdays.map((day, index) => `${rect(x + index * cellW, y, cellW, 36, "#f6f8fa")}${text(x + index * cellW + 12, y + 23, day, 10, 750, "#7f8a98")}`).join("")}
    ${days.map((day, index) => {
      const col = index % 7;
      const row = Math.floor(index / 7);
      const cx = x + col * cellW;
      const cy = y + 36 + row * cellH;
      const selected = day === 24 && time > 1.45 && time < 2.75;
      return `${rect(cx, cy, cellW, cellH, selected ? "#eef8f0" : "#ffffff", 0, 'stroke="#e5e9ed" stroke-width=".6"')}${selected ? rect(cx + 8, cy + 7, 30, 30, "#62c57d", 15) : ""}${text(cx + 23, cy + 28, day, 12, selected ? 800 : 600, selected ? "#ffffff" : "#738091", "middle")}`;
    }).join("")}
    ${eventRows.map(event => {
      const dayIndex = event.row * 7 + event.col;
      const ex = x + event.col * cellW + 8;
      const ey = y + 36 + event.row * cellH + 43;
      return `${rect(ex, ey, cellW - 16, 34, `${event.color}18`, 7)}${rect(ex, ey, 4, 34, event.color, 2)}${text(ex + 11, ey + 14, event.time, 9, 650, event.color)}${text(ex + 11, ey + 28, event.label, 10, 700, "#324158")}`;
    }).join("")}
  `;
}

function platformChip(x, y, label, color, selected = true) {
  return `${rect(x, y, 174, 51, selected ? "#f6f8fb" : "#ffffff", 13, `stroke="${selected ? color : "#dfe4e8"}" stroke-width="${selected ? 1.7 : 1}"`)}<circle cx="${x + 25}" cy="${y + 25}" r="13" fill="${color}"/>${text(x + 25, y + 30, label[0], 12, 820, "#ffffff", "middle")}${text(x + 48, y + 24, label, 12, 720)}${text(x + 48, y + 39, selected ? "Selected" : "Select", 9, 550, selected ? "#4f9b68" : "#8a94a0")}${selected ? `<circle cx="${x + 154}" cy="${y + 25}" r="9" fill="#64c47d"/>${icon("check", x + 148, y + 18, "#ffffff")}` : ""}`;
}

function composerView(time) {
  const entered = progress(time, 2.85, 4.05);
  const caption = "Launch week starts now. Meet the tools that keep every channel moving.";
  const visibleCaption = caption.slice(0, Math.floor(caption.length * entered));
  const scheduled = time >= 4.18;
  const ready = time >= 5.35;
  const reviewPulse = progress(time, 6.0, 6.25) * fade(time, 6.25, 6.55);
  return `
    ${text(246, 101, "Create post", 30, 760)}${text(246, 134, "Prepare one post for every selected destination.", 15, 450, "#6f7c8d")}
    ${rect(246, 166, 906, 552, "#ffffff", 20, 'stroke="#dce2e8" stroke-width="1"')}
    ${text(278, 207, "Post details", 16, 760)}${text(278, 238, "Caption", 11, 700, "#657286")}
    ${rect(278, 251, 842, 108, "#f8f9fa", 12, 'stroke="#dce2e8" stroke-width="1"')}
    ${text(298, 284, visibleCaption.slice(0, 58), 14, 520, "#39485d")}
    ${visibleCaption.length > 58 ? text(298, 309, visibleCaption.slice(58), 14, 520, "#39485d") : ""}
    ${entered < 1 ? `<rect x="${298 + Math.min(720, visibleCaption.length * 7.2)}" y="270" width="2" height="20" fill="#3f68df"/>` : ""}
    ${text(278, 397, "Destinations", 11, 700, "#657286")}
    ${platformChip(278, 412, "Instagram", "#e64b75")}${platformChip(466, 412, "TikTok", "#202124")}${platformChip(654, 412, "LinkedIn", "#2674b8")}
    ${text(278, 505, "Schedule for later", 15, 740)}${text(278, 527, scheduled ? "Choose the date and time for every selected account." : "Posts publish when you confirm.", 11, 500, "#7a8797")}
    ${rect(1035, 491, 54, 30, scheduled ? "#62c57d" : "#d9dee3", 15)}<circle cx="${scheduled ? 1073 : 1051}" cy="506" r="12" fill="#ffffff"/>
    ${scheduled ? `${text(278, 565, "DATE", 9, 780, "#85909d")}${text(534, 565, "TIME", 9, 780, "#85909d")}${rect(278, 577, 232, 52, "#f8f9fa", 11, 'stroke="#dce2e8" stroke-width="1"')}${icon("calendar", 296, 590, "#68778b")}${text(332, 609, ready ? "Sep 24, 2026" : "Choose date", 13, 650, ready ? "#314158" : "#8c96a2")}${rect(534, 577, 190, 52, "#f8f9fa", 11, 'stroke="#dce2e8" stroke-width="1"')}${text(560, 609, ready ? "09:30 AM" : "Choose time", 13, 650, ready ? "#314158" : "#8c96a2")}${text(748, 607, "Africa/Douala", 11, 560, "#758294")}` : ""}
    ${rect(246, 746, 906, 92, "#ffffff", 0, 'stroke="#e1e5e9" stroke-width="1"')}
    ${text(278, 786, "1 post in this draft", 13, 730)}${text(278, 808, scheduled ? "3 destinations publish at the scheduled time" : "Select a schedule to continue", 10, 500, "#7d8998")}
    ${rect(935, 768, 185, 48, ready ? "#3f68df" : "#aeb9d8", 13)}${text(1011, 798, "Review schedule", 13, 720, "#ffffff", "middle")}${icon("arrow", 1082, 781, "#ffffff")}
    ${reviewPulse > 0 ? `<circle cx="1028" cy="792" r="${28 + reviewPulse * 15}" fill="none" stroke="#6f8ff0" stroke-width="4" opacity="${reviewPulse}"/>` : ""}
  `;
}

function reviewModal(time) {
  const show = progress(time, 6.4, 6.75) * fade(time, 8.0, 8.28);
  if (show <= 0) return "";
  const pulse = progress(time, 7.45, 7.7) * fade(time, 7.7, 7.96);
  const rows = [
    ["Instagram", "@meadowstudio", "#e64b75"],
    ["TikTok", "@meadowstudio", "#202124"],
    ["LinkedIn", "Meadow Studio", "#2674b8"],
  ];
  return `<g opacity="${show}">
    ${rect(206, 0, 994, 900, "#1f293788")}
    ${rect(344, 118, 714, 646, "#ffffff", 22, 'filter="url(#shadow)"')}
    ${text(382, 169, "Review schedule", 25, 760)}${text(382, 199, "Times are shown in Africa/Douala.", 12, 500, "#778394")}
    ${rect(382, 226, 638, 83, "#f4f8ff", 13)}${text(406, 257, "POST 1", 9, 790, "#5475cf")}${text(406, 284, "Launch week starts now", 16, 720)}
    ${rows.map(([platform, account, color], index) => {
      const y = 335 + index * 88;
      return `${rect(382, y, 638, 72, "#ffffff", 12, 'stroke="#e1e6eb" stroke-width="1"')}<circle cx="408" cy="${y + 36}" r="14" fill="${color}"/>${text(408, y + 41, platform[0], 12, 820, "#ffffff", "middle")}${text(436, y + 31, account, 13, 720)}${text(436, y + 51, "Sep 24, 2026 · 09:30 AM", 10, 520, "#778394")}${rect(901, y + 23, 87, 28, "#eaf7ed", 14)}${text(944, y + 42, "Ready", 10, 740, "#4c9a63", "middle")}`;
    }).join("")}
    ${rect(784, 685, 236, 50, "#62c57d", 14)}${text(885, 716, "Schedule 3 posts", 13, 760, "#173c25", "middle")}${icon("check", 977, 700, "#173c25")}
    ${pulse > 0 ? `<circle cx="900" cy="710" r="${34 + pulse * 18}" fill="none" stroke="#8ad79d" stroke-width="5" opacity="${pulse}"/>` : ""}
  </g>`;
}

function toast(time) {
  const show = progress(time, 8.3, 8.65) * fade(time, 10.35, 10.8);
  if (show <= 0) return "";
  return `<g opacity="${show}" transform="translate(0 ${lerp(16, 0, show)})">${rect(756, 96, 392, 67, "#173d2a", 15, 'filter="url(#shadow)"')}<circle cx="791" cy="129" r="15" fill="#70d18a"/>${icon("check", 781, 119, "#173d2a")}${text(819, 124, "3 posts scheduled", 14, 760, "#ffffff")}${text(819, 144, "Studio launch was added to Sep 24.", 10, 500, "#c9e7d2")}</g>`;
}

function cursorPosition(time) {
  const stops = [
    [0, 1080, 810], [1.05, 1080, 810], [1.75, 697, 632], [2.15, 697, 632],
    [3.0, 388, 284], [4.1, 1061, 506], [4.35, 1061, 506], [5.1, 391, 602],
    [5.6, 621, 602], [6.0, 1028, 792], [6.35, 1028, 792], [7.4, 900, 710],
    [7.85, 900, 710], [8.4, 875, 456], [11, 1080, 810],
  ];
  for (let index = 1; index < stops.length; index += 1) {
    if (time <= stops[index][0]) {
      const previous = stops[index - 1];
      const next = stops[index];
      const amount = progress(time, previous[0], next[0]);
      return [lerp(previous[1], next[1], amount), lerp(previous[2], next[2], amount)];
    }
  }
  return [1080, 810];
}

function cursor(time) {
  const [x, y] = cursorPosition(time);
  const clickTimes = [2.08, 4.25, 5.18, 5.68, 6.2, 7.72];
  const click = Math.max(...clickTimes.map(at => progress(time, at, at + .11) * fade(time, at + .11, at + .28)));
  return `${click > 0 ? `<circle cx="${x}" cy="${y}" r="${20 + click * 13}" fill="none" stroke="#5e7ee0" stroke-width="4" opacity="${click}"/>` : ""}<path d="M${x} ${y} l2 27 7-7 7 16 8-4-8-16 11-1z" fill="#ffffff" stroke="#202b3b" stroke-width="2.5" stroke-linejoin="round" filter="url(#cursorShadow)"/>`;
}

function frame(time) {
  const composer = progress(time, 2.12, 2.58) * fade(time, 8.12, 8.52);
  const overall = time > 10.65 ? fade(time, 10.65, 11) : progress(time, 0, .25);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#17233a" flood-opacity=".2"/></filter>
      <filter id="cursorShadow" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#17233a" flood-opacity=".28"/></filter>
    </defs>
    ${rect(0, 0, width, height, "#f5f7f2")}
    <g opacity="${overall}">
      ${sidebar()}
      <g opacity="${1 - composer}">${calendarView(time, time >= 8.25)}${toast(time)}</g>
      <g opacity="${composer}" transform="translate(${(1 - composer) * 90} 0)">${composerView(time)}</g>
      ${reviewModal(time)}
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

run(["-y", "-framerate", String(fps), "-i", join(framesDir, "frame-%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", `${outputBase}.mp4`]);
run(["-y", "-framerate", String(fps), "-i", join(framesDir, "frame-%04d.png"), "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "31", "-row-mt", "1", `${outputBase}.webm`]);
await sharp(join(framesDir, "frame-0224.png")).webp({ quality: 82 }).toFile(`${outputBase}.webp`);

rmSync(framesDir, { recursive: true, force: true });
console.log(`Generated ${outputBase}.{mp4,webm,webp}`);
