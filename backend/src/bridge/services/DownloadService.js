import { randomBytes } from "node:crypto";
import { SecretVault } from "../core/SecretVault.js";
import { invariant } from "../core/errors.js";

/** Short-lived tickets let the browser stream ZIP files without buffering them in JS. */
export class DownloadService {
  constructor({ store, media, clock = () => Date.now() }) { Object.assign(this, { store, media, clock }); }
  create(uid, projectId, ids) {
    invariant(Array.isArray(ids) && ids.length > 0 && ids.length <= 100 && new Set(ids).size === ids.length, "Choose between 1 and 100 files.");
    const records = ids.map(id => this.media.require(uid, projectId, id));
    invariant(records.every(record => record.status === "ready"), "Some files are not available yet.");
    const ticket = randomBytes(32).toString("base64url");
    this.store.saveState(`download:${SecretVault.hash(ticket)}`, { uid, projectId, ids }, this.clock() + 2 * 60000);
    return { url: `/downloads/${ticket}` };
  }
  consume(ticket) {
    const record = this.store.consumeState(`download:${SecretVault.hash(ticket)}`, this.clock());
    invariant(record, "This download link has expired. Start the download again.", { status: 403 });
    record.ids.forEach(id => this.media.require(record.uid, record.projectId, id));
    return record;
  }
}
