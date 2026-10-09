import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "../../frontend/node_modules/vite/dist/node/index.js";
import { buildConfig, root, unpacked } from "./build-config.mjs";

const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
await build(buildConfig());
await fs.copyFile(path.join(root, "manifest.json"), path.join(unpacked, "manifest.json"));
await fs.copyFile(path.join(root, "src/background.js"), path.join(unpacked, "background.js"));
await fs.mkdir(path.join(unpacked, "icons"), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const source = size === 128 ? path.join(root, "assets/icon-128.png") : path.join(root, "../frontend/public/favicon-flower-v2-" + size + ".png");
  await fs.copyFile(source, path.join(unpacked, "icons", size + ".png"));
}
const zip = path.join(root, "dist", "findmeadow-chrome-" + manifest.version + ".zip");
// Only build output goes into the ZIP, never environment files or the profile.
execFileSync("python3", ["-c", "import sys,zipfile,pathlib\nroot=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_DEFLATED) as z:\n for p in sorted(root.rglob('*')):\n  if p.is_file():\n   name=p.relative_to(root).as_posix(); info=zipfile.ZipInfo(name,(2026,1,1,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED; info.external_attr=0o644 << 16; z.writestr(info,p.read_bytes())", unpacked, zip], { stdio: "inherit" });
console.log("Unpacked extension: " + unpacked + "\nChrome Web Store ZIP: " + zip);
