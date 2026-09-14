import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import http from "node:http";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { migrationScript } from "../../cloudflare/migrationScript.js";
import Database from "better-sqlite3";

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve)); return port;
}
async function execute(script) {
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "pipe"] });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 20000);
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  clearTimeout(timeout);
  if (code !== 0) throw new Error(stderr); return JSON.parse(stdout);
}

test("migration preflight is read-only; capture drains the actual backend without replacement and can resume", { timeout: 60000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "meadow-migration-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  await fs.symlink(path.join(backend, "src"), path.join(root, "src"));
  await fs.symlink(path.join(backend, "node_modules"), path.join(root, "node_modules"));
  await fs.writeFile(path.join(root, "package.json"), '{"type":"module"}');
  const inspectorPort = await unusedPort();
  let savedSnapshot;
  const storage = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    savedSnapshot = Buffer.concat(chunks);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ bytes: savedSnapshot.length, sha256: createHash("sha256").update(savedSnapshot).digest("hex"), durable: true }));
  });
  await new Promise(resolve => storage.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => storage.close(resolve)));
  const moduleUrl = pathToFileURL(path.join(backend, "src/bridge/BridgeApplication.js")).href;
  const fixture = `import http from 'node:http'; import { BridgeApplication } from ${JSON.stringify(moduleUrl)};
    const bridge = new BridgeApplication({ env: { NODE_ENV: 'test', BRIDGE_LOCAL_PREVIEW: '1', BRIDGE_DATA_DIR: ${JSON.stringify(path.join(root, ".bridge"))} } });
    bridge.store.put('account', { id: 'preserved', platform: 'x', status: 'connected', encryptedCredentials: 'encrypted-test-value' });
    bridge.start();
    const server = http.createServer((req,res) => res.end(JSON.stringify({ running: !bridge.privacyTimer._destroyed, account: bridge.store.get('account','preserved').id })));
    server.listen(0,'127.0.0.1',()=>console.log('READY:'+server.address().port));
    process.on('SIGTERM',()=>{server.close();bridge.close();process.exit(0)});`;
  const child = spawn(process.execPath, [`--inspect-port=127.0.0.1:${inspectorPort}`, "--input-type=module", "-e", fixture], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => { if (child.exitCode === null) { child.kill("SIGKILL"); await new Promise(resolve => child.once("exit", resolve)); } });
  let stderr = ""; child.stderr.on("data", chunk => { stderr += chunk; });
  const port = await new Promise((resolve, reject) => {
    child.once("exit", code => reject(new Error(`Migration fixture exited ${code}: ${stderr}`)));
    child.stdout.on("data", chunk => { const match = chunk.toString().match(/READY:(\d+)/); if (match) resolve(Number(match[1])); });
  });
  const options = { appDir: root, pid: child.pid, inspectorPort, storageUrl: `http://127.0.0.1:${storage.address().port}` };
  const before = await execute(migrationScript("preflight", options));
  assert.equal(before.metadata.counts.find(row => row.kind === "account").count, 1);
  assert.equal((await (await fetch(`http://127.0.0.1:${port}`)).json()).running, true);
  const captured = await execute(migrationScript("capture", options));
  assert.equal(captured.metadata.mediaPending, false);
  assert.equal(child.exitCode, null);
  assert.equal((await (await fetch(`http://127.0.0.1:${port}`)).json()).running, false);
  const snapshotFile = path.join(root, "preserved.sqlite");
  await fs.writeFile(snapshotFile, savedSnapshot);
  const verified = new Database(snapshotFile, { readonly: true });
  const account = JSON.parse(verified.prepare("SELECT data FROM entities WHERE kind='account'").get().data);
  assert.equal(account.encryptedCredentials, "encrypted-test-value"); verified.close();
  assert.equal((await execute(migrationScript("resume", options))).resumed, true);
  assert.equal((await (await fetch(`http://127.0.0.1:${port}`)).json()).running, true);
});
