import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filename = path.join(path.resolve(process.env.BRIDGE_DATA_DIR || path.join(backendDir, ".bridge")), "bridge.sqlite");
if (!fs.existsSync(filename)) throw new Error("No Meadow database exists at the configured BRIDGE_DATA_DIR.");
const [, , command, reference, confirmation] = process.argv;
if (command && command !== "--analytics-complete") throw new Error("Use no arguments to inspect jobs, or --analytics-complete REFERENCE --confirmed-in-posthog after verifying deletion.");
const write = command === "--analytics-complete";
if (write && (!reference || confirmation !== "--confirmed-in-posthog")) throw new Error("Manual completion requires the deletion reference and --confirmed-in-posthog.");
const db = new Database(filename, { readonly: !write, fileMustExist: true });
try {
  if (write) db.transaction(() => {
    const row = db.prepare("SELECT data FROM entities WHERE kind='erasure' AND id=?").get(reference);
    const job = row && JSON.parse(row.data);
    if (!job || job.type !== "owner") throw new Error("Pending account deletion reference not found.");
    job.analyticsDone = true; job.analyticsVerifiedManuallyAt = Date.now(); job.dueAt = Date.now();
    db.prepare("UPDATE entities SET data=?,due_at=?,revision=revision+1 WHERE kind='erasure' AND id=?").run(JSON.stringify(job), job.dueAt, reference);
    db.prepare("DELETE FROM entities WHERE kind='processor_erasure' AND owner_uid=?").run(job.ownerUid);
  })();
  const jobs = db.prepare("SELECT kind,data FROM entities WHERE kind IN ('erasure','revocation') ORDER BY created_at").all().map(row => {
    const item = JSON.parse(row.data);
    return { reference: item.id, type: row.kind === "revocation" ? "token_revocation" : item.type, status: item.status, platform: item.platform,
      pending: item.pending || [], ageHours: Math.floor((Date.now() - item.createdAt) / 3600000), overdue: item.createdAt < Date.now() - 7 * 86400000, nextAttemptAt: item.dueAt ? new Date(item.dueAt).toISOString() : null, lastError: item.lastError || null };
  });
  console.log(JSON.stringify({ pendingJobs: jobs.length, jobs }, null, 2));
} finally { db.close(); }
