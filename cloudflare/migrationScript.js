// Executed only by the authenticated, hardcoded migration operations. Never
// accepts a command or filesystem path from an HTTP request.
export function migrationScript(action, { appDir = "/app", pid = 1, inspectorPort = 9229, storageUrl = "http://meadow.storage", migrationGeneration = 0 } = {}) {
  if (!["preflight", "capture", "resume"].includes(action)) throw new Error("Invalid migration operation");
  return `const __name = value => value; (${migrationRuntime.toString()})(${JSON.stringify({ action, appDir, pid, inspectorPort, storageUrl, migrationGeneration })}).catch(error => { console.error(error.message); process.exit(1); });`;
}

async function migrationRuntime({ action, appDir, pid, inspectorPort, storageUrl, migrationGeneration }) {
  const fs = await import("node:fs/promises");
  const { createReadStream } = await import("node:fs");
  const path = await import("node:path");
  const { createHash } = await import("node:crypto");
  const { createRequire } = await import("node:module");
  const require = createRequire(path.join(appDir, "package.json"));
  const Database = require("better-sqlite3");
  const dataDir = path.join(appDir, ".bridge");
  const digestFile = async file => {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest("hex");
  };
  async function inventory(directory, prefix = "") {
    const result = [];
    for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; })) {
      const key = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error("Migration refuses symbolic links in media storage.");
      if (entry.isDirectory()) result.push(...await inventory(path.join(directory, entry.name), key));
      else if (entry.isFile()) result.push({ key, bytes: (await fs.stat(path.join(directory, entry.name))).size });
    }
    return result;
  }
  async function inspector() {
    // SIGUSR1 enables Node's diagnostic interface on loopback only. The Worker
    // never forwards its port; close it when resuming or on container rollout.
    process.kill(pid, "SIGUSR1");
    let endpoint;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { endpoint = (await (await fetch(`http://127.0.0.1:${inspectorPort}/json/list`)).json())[0]?.webSocketDebuggerUrl; if (endpoint) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!endpoint) throw new Error("The running backend diagnostic interface is unavailable.");
    const ws = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", () => reject(new Error("Could not attach the migration diagnostic session.")), { once: true }); });
    let id = 0;
    const pending = new Map();
    ws.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const call = pending.get(message.id); if (!call) return;
      pending.delete(message.id);
      if (message.error || message.result?.exceptionDetails) call.reject(new Error(`The backend refused the migration diagnostic operation: ${message.error?.message || message.result?.exceptionDetails?.exception?.description || "unknown diagnostic error"}`));
      else call.resolve(message.result);
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const key = ++id;
      const timeout = setTimeout(() => { pending.delete(key); reject(new Error("The migration diagnostic operation timed out.")); }, 35000);
      pending.set(key, { resolve: result => { clearTimeout(timeout); resolve(result); }, reject: error => { clearTimeout(timeout); reject(error); } });
      ws.send(JSON.stringify({ id: key, method, params }));
    });
    const identity = await call("Runtime.evaluate", { expression: "process.pid", returnByValue: true });
    if (identity.result.value !== pid) { ws.close(); throw new Error("Migration diagnostic process identity does not match the backend."); }
    const modulePath = path.join(appDir, "src/bridge/BridgeApplication.js");
    const prototype = await call("Runtime.evaluate", { expression: `process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(appDir, "package.json"))})(${JSON.stringify(modulePath)}).BridgeApplication.prototype` });
    const objects = await call("Runtime.queryObjects", { prototypeObjectId: prototype.result.objectId });
    await call("Runtime.callFunctionOn", { objectId: objects.objects.objectId, functionDeclaration: "function () { if (this.length !== 1) throw new Error('Expected one backend'); globalThis.__meadowMigrationBridge = this[0]; return true; }", returnByValue: true });
    return { call, close: () => ws.close() };
  }
  if (action === "capture" || action === "resume") {
    const session = await inspector();
    try {
      if (action === "resume") {
        await session.call("Runtime.evaluate", { expression: "if (globalThis.__meadowMigrationBridge.migrationPaused) { globalThis.__meadowMigrationBridge.start(); globalThis.__meadowMigrationBridge.migrationPaused = false; } true", returnByValue: true });
        await session.call("Runtime.evaluate", { expression: "setTimeout(() => process.getBuiltinModule('inspector').close(), 50); true", returnByValue: true });
        process.stdout.write(JSON.stringify({ resumed: true }));
        return;
      }
      await session.call("Runtime.evaluate", { expression: "globalThis.__meadowMigrationBridge.stopWorkers(); globalThis.__meadowMigrationBridge.migrationPaused = true; true", returnByValue: true });
      const drained = await session.call("Runtime.evaluate", { expression: `(async () => { const b = globalThis.__meadowMigrationBridge; const until = Date.now() + 25000; while (b.worker.running || b.analytics.running || b.privacy.running || b.accounts.running || b.accounts.pendingCallbacks || b.privacy.activeRequests?.size) { if (Date.now() > until) return false; await new Promise(resolve => setTimeout(resolve, 50)); } return true; })()`, awaitPromise: true, returnByValue: true });
      if (drained.result.value !== true) throw new Error("Existing backend work has not drained; migration remains paused.");
    } finally { session.close(); }
  }
  const database = new Database(path.join(dataDir, "bridge.sqlite"), { readonly: true, fileMustExist: true });
  let snapshot, counts;
  const referenced = new Set();
  const required = new Set();
  try {
    if (database.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Existing database integrity verification failed.");
    counts = database.prepare("SELECT kind, COUNT(*) AS count FROM entities GROUP BY kind ORDER BY kind").all();
    for (const row of database.prepare("SELECT kind,data FROM entities WHERE kind IN ('media','erasure')").all()) {
      const record = JSON.parse(row.data);
      const keys = row.kind === "media" ? [record.storageKey, record.thumbnailKey, ...Object.values(record.variants || {}).map(item => item.key)] : record.fileKeys || [];
      for (const key of keys.filter(Boolean)) { referenced.add(key); if (row.kind === "media" && record.status !== "deleting") required.add(key); }
    }
    snapshot = database.serialize();
  } finally { database.close(); }
  const allFiles = await inventory(path.join(dataDir, "media"));
  const files = allFiles.filter(file => referenced.has(file.key));
  const present = new Set(files.map(file => file.key));
  const missingActiveMediaFiles = [...required].filter(key => !present.has(key)).length;
  const incoming = await inventory(path.join(dataDir, "incoming"));
  let copied = 0;
  if (action === "capture") {
    if (snapshot.length > 32 * 1024 * 1024) throw new Error("The database exceeds the migration snapshot limit.");
    if (missingActiveMediaFiles) throw new Error("Some active media files are already missing. Migration remains paused for recovery.");
    for (const file of files) {
      const filename = path.join(dataDir, "media", file.key);
      const sha256 = await digestFile(filename);
      const response = await fetch(`${storageUrl}/media/${encodeURIComponent(file.key)}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "Content-Length": String(file.bytes), "X-Meadow-Sha256": sha256, "X-Meadow-Migration-Generation": String(migrationGeneration) }, body: createReadStream(filename), duplex: "half", signal: AbortSignal.timeout(15 * 60000) });
      if (!response.ok || Number(response.headers.get("X-Meadow-Bytes")) !== file.bytes || response.headers.get("X-Meadow-Sha256") !== sha256) throw new Error("Durable media verification failed; migration remains paused.");
      copied++;
    }
  }
  const metadata = { counts, databaseBytes: snapshot.length, sha256: createHash("sha256").update(snapshot).digest("hex"), mediaFiles: files.length, mediaBytes: files.reduce((sum, file) => sum + file.bytes, 0), missingReferencedMediaFiles: [...referenced].filter(key => !present.has(key)).length, missingActiveMediaFiles, ignoredMediaFiles: allFiles.length - files.length, incomingFiles: incoming.length, incomingBytes: incoming.reduce((sum, file) => sum + file.bytes, 0), copiedMediaFiles: copied, mediaPending: action === "capture" && copied !== files.length };
  if (action === "capture") {
    const response = await fetch(`${storageUrl}/migration/snapshot`, { method: "POST", headers: { "Content-Type": "application/vnd.sqlite3", "Content-Length": String(snapshot.length), "X-Meadow-Migration": JSON.stringify(metadata), "X-Meadow-Migration-Generation": String(migrationGeneration) }, body: snapshot, signal: AbortSignal.timeout(60000) });
    const result = await response.json();
    if (!response.ok || !result.durable || result.sha256 !== metadata.sha256 || result.bytes !== snapshot.length) throw new Error("Durable database verification failed; migration remains paused.");
  }
  process.stdout.write(JSON.stringify({ metadata }));
}
