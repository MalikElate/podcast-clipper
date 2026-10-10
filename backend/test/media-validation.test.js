import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateUploadRequest } from "../src/bridge/services/mediaValidation.js";
import { MediaService } from "../src/bridge/services/MediaService.js";

// Small, valid OpenXML archives. Their content-type entries identify the kind
// from file bytes, independently of the browser-provided MIME type.
const docx = Buffer.from("UEsDBBQAAAAAAPBlSl2T+DSMlwAAAJcAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbDxUeXBlcz48T3ZlcnJpZGUgUGFydE5hbWU9Ii93b3JkL2RvY3VtZW50LnhtbCIgQ29udGVudFR5cGU9ImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC53b3JkcHJvY2Vzc2luZ21sLmRvY3VtZW50Lm1haW4reG1sIi8+PC9UeXBlcz5QSwMEFAAAAAAA8GVKXSuEJhIEAAAABAAAABEAAAB3b3JkL2RvY3VtZW50LnhtbDx4Lz5QSwECFAMUAAAAAADwZUpdk/g0jJcAAACXAAAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAxQAAAAAAPBlSl0rhCYSBAAAAAQAAAARAAAAAAAAAAAAAACAAcgAAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAgACAIAAAAD7AAAAAAA=", "base64");
const pptx = Buffer.from("UEsDBBQAAAAAAPBlSl0kD2eCmAAAAJgAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbDxUeXBlcz48T3ZlcnJpZGUgUGFydE5hbWU9Ii9wcHQvZG9jdW1lbnQueG1sIiBDb250ZW50VHlwZT0iYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LnByZXNlbnRhdGlvbm1sLnByZXNlbnRhdGlvbi5tYWluK3htbCIvPjwvVHlwZXM+UEsDBBQAAAAAAPBlSl0rhCYSBAAAAAQAAAAQAAAAcHB0L2RvY3VtZW50LnhtbDx4Lz5QSwECFAMUAAAAAAPBlSl0rhCYSBAAAAAQAAAAQAAAAAAAAAAAAAACAAckAAABwcHQvZG9jdW1lbnQueG1sUEsFBgAAAAACAAIAfwAAAPsAAAAAAA==", "base64");

test("upload preflight allows PDF and rejects DOCX, PPTX, and legacy Office files", async () => {
  const check = (filename, bytes) => validateUploadRequest({ filename, bytes: bytes.length, sample: bytes.toString("base64") }, 1024 ** 3);
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
  assert.equal((await check("paper.pdf", pdf)).expectedMime, "application/pdf");
  await assert.rejects(check("paper.DOCX", docx), error => error.code === "unsupported_media");
  await assert.rejects(check("slides.pptx", docx), error => error.code === "unsupported_media");
  await assert.rejects(check("slides.pptx", pptx), error => error.code === "unsupported_media");
  await assert.rejects(check("legacy.doc", docx), error => error.code === "unsupported_media");
});

test("legacy whole-file ingestion also rejects valid DOCX and PPTX bytes", async t => {
  const dir = await mkdtemp(join(tmpdir(), "meadow-unsupported-docs-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const service = new MediaService({
    projects: { require() {} }, store: { put() { assert.fail("Unsupported media must not be stored"); } },
    storage: { importFile() { assert.fail("Unsupported media must not be imported"); } }, signingKey: "test",
  });
  for (const [filename, bytes] of [["paper.docx", docx], ["slides.pptx", pptx]]) {
    const path = join(dir, filename);
    await writeFile(path, bytes);
    await assert.rejects(service.ingest("alice", "project", { path, originalname: filename }), error => error.code === "unsupported_media");
  }
});
