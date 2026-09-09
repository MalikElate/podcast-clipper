import "dotenv/config";
import { BridgeApplication } from "./BridgeApplication.js";
import { ProcessRunner } from "./core/ProcessRunner.js";

const bridge = new BridgeApplication();
bridge.start();
const port = Number(process.env.PORT || 8787);
const host = bridge.localPreview ? "127.0.0.1" : process.env.HOST || "127.0.0.1";
const server = bridge.app.listen(port, host, () => console.log(`Bridge API listening on http://${host}:${port}`));
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
