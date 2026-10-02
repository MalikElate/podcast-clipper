import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// The backend runs inside a Cloudflare Container, which receives only the
// variables cloudflare/worker.js names explicitly. A secret added in Cloudflare
// but missing from that list is undefined at runtime and the feature reading it
// stays quietly switched off, which is indistinguishable from nobody enabling it.
const repoFile = name => fileURLToPath(new URL(`../../${name}`, import.meta.url));
const backendSource = fileURLToPath(new URL("../src", import.meta.url));

// Supplied by the runtime or only meaningful outside the container.
const NOT_FROM_CLOUDFLARE = new Set([
  "NODE_ENV",            // set by the runtime
  "BRIDGE_DATA_DIR",     // container uses its own path
  "BRIDGE_LOCAL_PREVIEW", // local preview only
  "BRIDGE_SERVE_FRONTEND", // local preview only
  "BRIDGE_TRUST_PROXY",  // only for a self-hosted reverse proxy
  "META_GRAPH_VERSION",  // falls back to a pinned default
]);

async function sourceFiles(dir) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const full = `${dir}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(full) : entry.name.endsWith(".js") ? [full] : [];
  }));
  return files.flat();
}

test("every variable the backend reads is passed into the container", async () => {
  const worker = await readFile(repoFile("cloudflare/worker.js"), "utf8");
  const passed = new Set([...worker.matchAll(/^\s{4}([A-Z][A-Z0-9_]{2,}):/gm)].map(match => match[1]));

  const read = new Set();
  for (const file of await sourceFiles(backendSource)) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/\benv\.([A-Z][A-Z0-9_]{2,})\b/g)) read.add(match[1]);
  }

  const missing = [...read].filter(name => !passed.has(name) && !NOT_FROM_CLOUDFLARE.has(name)).sort();
  assert.deepEqual(missing, [], `These variables are read by the backend but never reach the container, so they are always undefined in production: ${missing.join(", ")}`);
});

test("the welcome email's configuration reaches the container", async () => {
  const worker = await readFile(repoFile("cloudflare/worker.js"), "utf8");
  for (const name of ["RESEND_API_KEY", "MEADOW_EMAIL_FROM"]) {
    assert.match(worker, new RegExp(`^\\s{4}${name}: env\\.${name},`, "m"), `${name} must be forwarded to the container`);
  }
});
