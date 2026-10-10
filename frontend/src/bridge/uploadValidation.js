// New uploads offered by the composer. The picker hint is not a validation
// boundary; each file is checked again before a transfer starts.
const types = {
  jpg: { kind: "image", mime: ["image/jpeg"] },
  jpeg: { kind: "image", mime: ["image/jpeg"] },
  png: { kind: "image", mime: ["image/png"] },
  webp: { kind: "image", mime: ["image/webp"] },
  gif: { kind: "image", mime: ["image/gif"] },
  mp4: { kind: "video", mime: ["video/mp4"] },
  mov: { kind: "video", mime: ["video/quicktime"] },
  webm: { kind: "video", mime: ["video/webm"] },
  pdf: { kind: "document", mime: ["application/pdf"] },
};

export const UPLOAD_ACCEPT = Object.keys(types).map(extension => `.${extension}`).join(",");
export const UPLOAD_CATEGORIES = "Videos, images, and PDFs";
export const UPLOAD_FORMATS = "JPG/JPEG, PNG, WebP, GIF, MP4, MOV, WebM, and PDF";

export function validateUploadFile(file, maxBytes = Infinity) {
  const extension = String(file?.name || "").split(".").at(-1).toLowerCase();
  const type = types[extension];
  if (!type) throw new Error(`${file?.name || "This file"} is not supported. Choose ${UPLOAD_FORMATS}.`);
  if (!Number.isSafeInteger(file.size) || file.size < 1) throw new Error(`${file.name} is empty. Choose a file with content.`);
  if (file.size > maxBytes) throw new Error(`${file.name} exceeds the ${Math.round(maxBytes / 1024 ** 2)} MB upload limit.`);
  const mime = String(file.type || "").toLowerCase();
  if (mime && mime !== "application/octet-stream" && !type.mime.includes(mime)) throw new Error(`${file.name} does not match its file type. Choose ${UPLOAD_FORMATS}.`);
  return type.kind;
}

// A quick local content check avoids transferring an obviously renamed file.
// The server inspects the complete file and remains the final authority.
export function validateUploadSignature(file, sample) {
  const extension = String(file?.name || "").split(".").at(-1).toLowerCase();
  const bytes = sample instanceof Uint8Array ? sample : new Uint8Array(sample);
  const starts = (...expected) => expected.every((byte, index) => bytes[index] === byte);
  const text = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  const valid = extension === "jpg" || extension === "jpeg" ? starts(0xff, 0xd8, 0xff)
    : extension === "png" ? starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    : extension === "webp" ? text(0, 4) === "RIFF" && text(8, 4) === "WEBP"
    : extension === "gif" ? ["GIF87a", "GIF89a"].includes(text(0, 6))
    : extension === "mp4" ? text(4, 4) === "ftyp"
    : extension === "mov" ? ["ftyp", "free", "mdat", "moov", "wide"].includes(text(4, 4))
    : extension === "webm" ? starts(0x1a, 0x45, 0xdf, 0xa3)
    : extension === "pdf" ? text(0, 5) === "%PDF-"
    : false;
  if (!valid) throw new Error(`${file?.name || "This file"} does not contain a valid ${extension.toUpperCase()} file. Choose ${UPLOAD_FORMATS}.`);
}

export function validateUploadSelection(files, existingMedia = [], maxBytes = Infinity) {
  const selected = Array.from(files || []);
  if (!selected.length) return selected;
  if (existingMedia.length + selected.length > 35) throw new Error("A post can contain up to 35 files.");
  const kinds = [...existingMedia.map(item => item.kind), ...selected.map(file => validateUploadFile(file, maxBytes))];
  if (kinds.includes("document") && kinds.length > 1) throw new Error("Upload one document on its own. Remove the other files first.");
  return selected;
}
