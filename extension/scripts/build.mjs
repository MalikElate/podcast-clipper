import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
const dist = path.join(root, "dist");
const unpacked = path.join(dist, "findmeadow");
await fs.mkdir(unpacked, { recursive: true });
await fs.cp(path.join(root, "src"), unpacked, { recursive: true });
await fs.copyFile(path.join(root, "manifest.json"), path.join(unpacked, "manifest.json"));
await fs.mkdir(path.join(unpacked, "icons"), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const source = size === 128 ? path.join(root, "assets", "icon-128.png") : path.join(root, "..", "frontend", "public", `favicon-flower-v2-${size}.png`);
  await fs.copyFile(source, path.join(unpacked, "icons", `${size}.png`));
}
const files = ["manifest.json", "background.js", "capture.js", "popup.html", "popup.js", "popup.css", ...[16, 32, 48, 128].map(size => `icons/${size}.png`)];
const zip = path.join(dist, `findmeadow-chrome-${manifest.version}.zip`);
execFileSync("python3", ["-c", "import json,sys,zipfile,pathlib\nroot=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_DEFLATED) as z:\n for name in json.loads(sys.argv[3]):\n  info=zipfile.ZipInfo(name, (2026,1,1,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED; info.external_attr=0o644 << 16; z.writestr(info,(root/name).read_bytes())", unpacked, zip, JSON.stringify(files)], { stdio: "inherit" });
console.log(`Unpacked extension: ${unpacked}\nChrome Web Store ZIP: ${zip}`);
