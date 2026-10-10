import assert from "node:assert/strict";
import test from "node:test";
import { UPLOAD_ACCEPT, validateUploadFile, validateUploadSelection, validateUploadSignature } from "../src/bridge/uploadValidation.js";

const file = (name, bytes, type = "") => new File([Uint8Array.from(bytes)], name, { type });
const cases = [
  ["photo.JPG", [0xff, 0xd8, 0xff], "image/jpeg", "image"],
  ["photo.png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png", "image"],
  ["photo.webp", [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")], "image/webp", "image"],
  ["photo.gif", [...Buffer.from("GIF89a")], "image/gif", "image"],
  ["clip.mp4", [0, 0, 0, 24, ...Buffer.from("ftypisom")], "video/mp4", "video"],
  ["clip.mov", [0, 0, 0, 24, ...Buffer.from("ftypqt  ")], "video/quicktime", "video"],
  ["older.mov", [0, 0, 0, 24, ...Buffer.from("moov")], "video/quicktime", "video"],
  ["clip.webm", [0x1a, 0x45, 0xdf, 0xa3], "video/webm", "video"],
  ["deck.pdf", [...Buffer.from("%PDF-1.7")], "application/pdf", "document"],
  ["deck.docx", [0x50, 0x4b, 0x03, 0x04], "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document"],
  ["deck.pptx", [0x50, 0x4b, 0x03, 0x04], "application/vnd.openxmlformats-officedocument.presentationml.presentation", "document"],
];

test("accepted upload types have a matching picker hint, MIME, and content signature", () => {
  for (const [name, bytes, mime, kind] of cases) {
    const selected = file(name, bytes, mime);
    assert.equal(validateUploadFile(selected), kind);
    assert.doesNotThrow(() => validateUploadSignature(selected, Uint8Array.from(bytes)));
    assert.ok(UPLOAD_ACCEPT.includes(`.${name.split(".").at(-1).toLowerCase()}`));
  }
  assert.doesNotMatch(UPLOAD_ACCEPT, /\.mp3|\.doc,|\.ppt,/);
});

test("unsupported, empty, mislabeled, oversized, and spoofed files fail before upload", () => {
  assert.throws(() => validateUploadFile(file("sound.mp3", [1, 2, 3], "audio/mpeg")), /not supported/);
  assert.throws(() => validateUploadFile(file("legacy.doc", [1, 2, 3], "application/msword")), /not supported/);
  assert.throws(() => validateUploadFile(new File([], "empty.pdf")), /empty/);
  assert.throws(() => validateUploadFile(file("wrong.pdf", [1], "image/png")), /does not match/);
  assert.throws(() => validateUploadFile(file("large.pdf", [1, 2, 3]), 2), /upload limit/);
  assert.throws(() => validateUploadSignature(file("spoofed.pdf", [...Buffer.from("<html>")]), Buffer.from("<html>")), /does not contain/);
});

test("documents stay single while images and videos may form a carousel of up to 35", () => {
  const png = file("image.png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pdf = file("paper.pdf", [...Buffer.from("%PDF-1.7")]);
  assert.deepEqual(validateUploadSelection([png, png]), [png, png]);
  assert.deepEqual(validateUploadSelection([pdf]), [pdf]);
  assert.throws(() => validateUploadSelection([png, pdf]), /one document on its own/);
  assert.throws(() => validateUploadSelection([png], [{ kind: "document" }]), /one document on its own/);
  assert.throws(() => validateUploadSelection([png], Array.from({ length: 35 }, () => ({ kind: "image" }))), /up to 35/);
});
