import fs from "node:fs";
import path from "node:path";
import { invariant } from "../core/errors.js";

export class LocalMediaStorage {
  constructor(root) { this.root = path.resolve(root); fs.mkdirSync(this.root, { recursive: true, mode: 0o700 }); }
  path(key) {
    invariant(typeof key === "string" && /^[a-zA-Z0-9_.-]+$/.test(key), "Invalid media key.");
    return path.join(this.root, key);
  }
  async importFile(source, key) { await fs.promises.copyFile(source, this.path(key)); return key; }
  stream(key, options) { return fs.createReadStream(this.path(key), options); }
  async remove(key) { await fs.promises.unlink(this.path(key)).catch(error => { if (error.code !== "ENOENT") throw error; }); }
  async size(key) { return (await fs.promises.stat(this.path(key))).size; }
  async blob(key, type) { return fs.openAsBlob(this.path(key), { type }); }
}
