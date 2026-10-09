export const CAPTURE_KEY = "meadowCapture";
export const ENABLED_KEY = "meadowClippingEnabled";
export const MAX_TEXT = 20000;
export const MAX_FRAGMENT = 65536;
export const CAPTURE_LIFETIME = 60 * 60 * 1000;
export const APP_URL = "https://app.findmeadow.com/dashboard/import";

function bounded(value, limit, label) {
  if (typeof value !== "string" || value.length > limit) throw new Error(`${label} is too long or invalid.`);
  return value;
}

export function webUrl(value, optional = true) {
  if (value === "" && optional) return "";
  bounded(value, 4096, "The address");
  let url;
  try { url = new URL(value); } catch { throw new Error("Choose a normal web page or a public image address."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Clipping works on HTTP and HTTPS pages without credentials in the address.");
  }
  return url.href;
}

export function validateCapture(input) {
  if (!input || input.version !== 1) throw new Error("This clip is no longer supported. Capture it again.");
  const capture = {
    version: 1,
    title: bounded(input.title ?? "", 500, "The page title"),
    url: webUrl(input.url ?? ""),
    text: bounded(input.text ?? "", MAX_TEXT, "The caption"),
    imageUrl: webUrl(input.imageUrl ?? ""),
  };
  if (!capture.text.trim() && !capture.imageUrl) throw new Error("Write a caption or choose an image first.");
  return capture;
}

export function captureFromPage({ title = "", url, selection = "", imageUrl = "" }) {
  const source = webUrl(url, false);
  const heading = String(title).slice(0, 500);
  const selected = String(selection).trim();
  if (selected.length > MAX_TEXT - source.length - 2) throw new Error("This selection is too long. Select a shorter passage and try again.");
  return validateCapture({
    version: 1,
    title: heading,
    url: source,
    text: `${selected || (imageUrl ? "" : heading)}${(selected || (!imageUrl && heading)) ? "\n\n" : ""}${source}`,
    imageUrl,
  });
}

export function captureFromContext(info, tab = {}) {
  const image = info.menuItemId === "meadow-image";
  const selection = info.menuItemId === "meadow-selection";
  if (image && !info.srcUrl) throw new Error("This image has no public address. Upload the file in Meadow instead.");
  return captureFromPage({
    title: tab.title || "",
    url: info.linkUrl || info.pageUrl || tab.url || "",
    selection: selection ? info.selectionText || "" : "",
    imageUrl: image ? webUrl(info.srcUrl, false) : "",
  });
}

export function handoffUrl(input) {
  const capture = validateCapture(input);
  const fragment = `meadow-capture=${encodeURIComponent(JSON.stringify(capture))}`;
  if (fragment.length > MAX_FRAGMENT) throw new Error("This clip is too large to send. Shorten the caption or remove the image and try again.");
  return `${APP_URL}#${fragment}`;
}

export function readStoredCapture(record, now = Date.now()) {
  if (!record || !Number.isFinite(record.savedAt) || record.savedAt > now || now - record.savedAt > CAPTURE_LIFETIME) return null;
  try { return validateCapture(record.capture); } catch { return null; }
}
