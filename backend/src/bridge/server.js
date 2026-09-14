import "dotenv/config";
import { BridgeApplication } from "./BridgeApplication.js";
import { ProcessRunner } from "./core/ProcessRunner.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { restoreDurableDatabase } from "./storage/DurableDatabase.js";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dataDir = path.resolve(process.env.BRIDGE_DATA_DIR || path.join(backendDir, ".bridge"));
const durability = process.env.BRIDGE_DURABLE_STORAGE_URL ? await restoreDurableDatabase({ filename: path.join(dataDir, "bridge.sqlite"), url: process.env.BRIDGE_DURABLE_STORAGE_URL }) : undefined;
const bridge = new BridgeApplication({ durability });
await bridge.store.flush();
const port = Number(process.env.PORT || 8787);
const host = bridge.localPreview ? "127.0.0.1" : process.env.HOST || "127.0.0.1";
const server = bridge.app.listen(port, host);
await new Promise((resolve, reject) => {
  server.once("listening", () => {
    console.log(`Meadow API listening on http://${host}:${port}`);
    resolve();
  });
  server.once("error", reject);
});
try { if (durability) await durability.ready(); }
catch (error) { await new Promise(resolve => server.close(resolve)); bridge.close(); throw error; }
bridge.start();
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  bridge.stopWorkers();
  // Leave durable claims intact if a provider does not respond before shutdown.
  // Recovery requires review for an unconfirmed publication rather than resending.
  const force = setTimeout(() => { ProcessRunner.terminateAll(); process.exit(0); }, 30000);
  force.unref();
  await new Promise(resolve => server.close(resolve));
  const drained = await bridge.shutdown();
  if (!drained) ProcessRunner.terminateAll();
  clearTimeout(force);
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
