import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { downloadRemoteMedia, remoteMediaUrl } from "../src/bridge/services/RemoteMedia.js";

const pdf = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");
const publicAddress = async () => [{ address: "93.184.216.34", family: 4 }];

async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-remote-media-"));
  const server = http.createServer((req, res) => {
    if (req.url === "/file.pdf") return res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": pdf.length }).end(pdf);
    if (req.url === "/named") return res.writeHead(200, { "Content-Disposition": "attachment; filename=\"launch deck.pdf\"" }).end(pdf);
    if (req.url === "/redirect") return res.writeHead(302, { Location: "/file.pdf" }).end();
    if (req.url === "/loop") return res.writeHead(302, { Location: "/loop" }).end();
    if (req.url === "/private") return res.writeHead(302, { Location: "http://127.0.0.1/file.pdf" }).end();
    if (req.url === "/declared-large") return res.writeHead(200, { "Content-Length": 2000 }).end(Buffer.alloc(2000));
    if (req.url === "/streamed-large") { res.writeHead(200); res.write(Buffer.alloc(600)); return res.end(Buffer.alloc(600)); }
    if (req.url === "/slow") return res.writeHead(200);
    res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  // Stand in for the public internet: the request goes to the local server
  // while the URL and resolved address stay public.
  const request = (url, options, callback) => http.request({ host: "127.0.0.1", port: server.address().port, path: url.pathname, method: options.method, headers: options.headers, signal: options.signal }, callback);
  const download = (urlPath, options = {}) => downloadRemoteMedia(`https://media.example.com${urlPath}`, path.join(dir, `download-${Math.random()}`), { maxBytes: 1024, resolve: publicAddress, request, ...options });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, download };
}

test("media URLs must be public HTTP or HTTPS addresses on standard ports", () => {
  assert.equal(remoteMediaUrl("https://cdn.example.com/a.png").hostname, "cdn.example.com");
  for (const value of [
    "http://127.0.0.1/a.png", "http://localhost/a.png", "http://10.0.0.8/a.png", "http://169.254.169.254/latest/meta-data",
    "http://[::1]/a.png", "https://printer.local/a.png", "ftp://example.com/a.png", "file:///etc/passwd",
    "https://user:secret@example.com/a.png", "https://example.com:8443/a.png", "not a url",
  ]) assert.throws(() => remoteMediaUrl(value), undefined, value);
});

test("downloads follow a limited number of public redirects and keep the filename", async t => {
  const h = await setup(t);
  const direct = await h.download("/file.pdf");
  assert.deepEqual(direct, { filename: "file.pdf", bytes: pdf.length });
  assert.deepEqual(await h.download("/redirect"), { filename: "file.pdf", bytes: pdf.length });
  assert.equal((await h.download("/named")).filename, "launch deck.pdf");
  await assert.rejects(h.download("/loop"), /redirected too many times/);
  await assert.rejects(h.download("/private"), /public internet address/);
  await assert.rejects(h.download("/missing"), /HTTP 404/);
});

test("downloads stop at the size limit, the time limit, and private DNS answers", async t => {
  const h = await setup(t);
  await assert.rejects(h.download("/declared-large"), error => error.code === "upload_limit");
  await assert.rejects(h.download("/streamed-large"), error => error.code === "upload_limit");
  await assert.rejects(h.download("/slow", { timeoutMs: 200 }), /took too long/);
  await assert.rejects(h.download("/file.pdf", { resolve: async () => [{ address: "10.1.2.3", family: 4 }] }), /public internet address/);
  await assert.rejects(h.download("/file.pdf", { resolve: async () => [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }] }), /public internet address/);
});
