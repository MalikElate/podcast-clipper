import test from "node:test";
import assert from "node:assert/strict";
import { validateUploadRequest } from "../src/bridge/services/mediaValidation.js";

// Small, valid OpenXML archives. Their content-type entries identify the kind
// from file bytes, independently of the browser-provided MIME type.
const docx = Buffer.from("UEsDBBQAAAAAAPBlSl2T+DSMlwAAAJcAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbDxUeXBlcz48T3ZlcnJpZGUgUGFydE5hbWU9Ii93b3JkL2RvY3VtZW50LnhtbCIgQ29udGVudFR5cGU9ImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC53b3JkcHJvY2Vzc2luZ21sLmRvY3VtZW50Lm1haW4reG1sIi8+PC9UeXBlcz5QSwMEFAAAAAAA8GVKXSuEJhIEAAAABAAAABEAAAB3b3JkL2RvY3VtZW50LnhtbDx4Lz5QSwECFAMUAAAAAADwZUpdk/g0jJcAAACXAAAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAxQAAAAAAPBlSl0rhCYSBAAAAAQAAAARAAAAAAAAAAAAAACAAcgAAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAgACAIAAAAD7AAAAAAA=", "base64");
const pptx = Buffer.from("UEsDBBQAAAAAAPBlSl0kD2eCmAAAAJgAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbDxUeXBlcz48T3ZlcnJpZGUgUGFydE5hbWU9Ii9wcHQvZG9jdW1lbnQueG1sIiBDb250ZW50VHlwZT0iYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LnByZXNlbnRhdGlvbm1sLnByZXNlbnRhdGlvbi5tYWluK3htbCIvPjwvVHlwZXM+UEsDBBQAAAAAAPBlSl0rhCYSBAAAAAQAAAAQAAAAcHB0L2RvY3VtZW50LnhtbDx4Lz5QSwECFAMUAAAAAAPBlSl0rhCYSBAAAAAQAAAAQAAAAAAAAAAAAAACAAckAAABwcHQvZG9jdW1lbnQueG1sUEsFBgAAAAACAAIAfwAAAPsAAAAAAA==", "base64");

test("upload preflight recognizes DOCX and PPTX and refuses a mismatched document", async () => {
  const check = (filename, bytes) => validateUploadRequest({ filename, bytes: bytes.length, sample: bytes.toString("base64") }, 1024 ** 3);
  assert.equal((await check("paper.DOCX", docx)).expectedMime, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal((await check("slides.pptx", pptx)).expectedMime, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  await assert.rejects(check("slides.pptx", docx), error => error.code === "unsupported_media");
  await assert.rejects(check("legacy.doc", docx), error => error.code === "unsupported_media");
});

test("a DOCX preview can be provisionally ZIP when type metadata lies beyond the first 64 KiB", async () => {
  const prefix = Buffer.alloc(64 * 1024);
  prefix.set([0x50, 0x4b, 0x03, 0x04]);
  const input = { filename: "large.docx", bytes: prefix.length + 1, sample: prefix.toString("base64") };
  assert.equal((await validateUploadRequest(input, 1024 ** 3)).expectedMime, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  await assert.rejects(validateUploadRequest({ ...input, filename: "archive.zip" }, 1024 ** 3), error => error.code === "unsupported_media");
});
