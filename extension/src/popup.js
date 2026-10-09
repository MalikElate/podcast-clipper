import { CAPTURE_KEY, ENABLED_KEY, MAX_TEXT, captureFromPage, handoffUrl, readStoredCapture } from "./capture.js";

const byId = id => document.getElementById(id);
const empty = () => ({ version: 1, title: "", url: "", text: "", imageUrl: "" });
let capture = empty(), enabled = false, busy = false;
let writes = Promise.resolve();
if (new URLSearchParams(location.search).get("editor") === "tab") document.body.classList.add("editor-tab");

function status(message = "") { byId("status").textContent = message; byId("status").hidden = !message; }
function render() {
  byId("welcome").hidden = enabled;
  byId("editor").hidden = !enabled;
  byId("disable").hidden = !enabled;
  byId("caption").value = capture.text;
  byId("count").textContent = `${capture.text.length.toLocaleString()} / ${MAX_TEXT.toLocaleString()}`;
  byId("source").hidden = !capture.url;
  byId("source-title").textContent = capture.title || "Web page";
  byId("source-url").textContent = capture.url;
  byId("image").hidden = !capture.imageUrl;
  byId("image-url").textContent = capture.imageUrl;
}
function save() {
  const record = { capture: { ...capture }, savedAt: Date.now() };
  writes = writes.catch(() => {}).then(() => chrome.storage.session.set({ [CAPTURE_KEY]: record }));
  return writes;
}
async function run(action) {
  if (busy) return;
  busy = true;
  status();
  for (const button of document.querySelectorAll("button")) button.disabled = true;
  try { await action(); }
  catch (error) { status(error.message || "Something went wrong. Please try again."); }
  finally { busy = false; for (const button of document.querySelectorAll("button")) button.disabled = false; }
}
async function capturePage(selectionOnly) {
  if (!enabled) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:\/\//i.test(tab.url || "")) throw new Error("Open a normal website to clip it. You can also write a caption here.");
  let selection = "";
  if (selectionOnly) {
    try {
      const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => String(window.getSelection?.() || "") });
      selection = results[0]?.result || "";
    } catch {
      throw new Error("Chrome cannot read selected text on this page. Copy it into the caption instead.");
    }
  }
  if (selectionOnly && !selection.trim()) throw new Error("Highlight some text on the page first, then reopen FindMeadow and try again.");
  const next = captureFromPage({ title: tab.title || "", url: tab.url, selection: selectionOnly ? selection : "" });
  if (capture.text.trim() && capture.text !== next.text && !window.confirm("Replace the current clip and caption?")) return;
  capture = next;
  await save();
  render();
}

byId("enable").addEventListener("click", () => run(async () => {
  await chrome.storage.local.set({ [ENABLED_KEY]: true });
  enabled = true; render(); byId("caption").focus();
}));
byId("disable").addEventListener("click", () => run(async () => {
  await writes;
  await chrome.storage.local.set({ [ENABLED_KEY]: false });
  await chrome.storage.session.remove([CAPTURE_KEY, "meadowCaptureError"]);
  enabled = false; capture = empty(); render();
}));
byId("page").addEventListener("click", () => run(() => capturePage(false)));
byId("selection").addEventListener("click", () => run(() => capturePage(true)));
byId("caption").addEventListener("input", () => {
  capture.text = byId("caption").value;
  byId("count").textContent = `${capture.text.length.toLocaleString()} / ${MAX_TEXT.toLocaleString()}`;
  void save().catch(() => status("This clip could not be saved locally. Keep this window open and try again."));
});
byId("clear").addEventListener("click", () => run(async () => {
  if ((capture.text.trim() || capture.imageUrl) && !window.confirm("Clear this clip and caption?")) return;
  await writes; await chrome.storage.session.remove(CAPTURE_KEY);
  capture = empty(); render(); byId("caption").focus();
}));
byId("remove-image").addEventListener("click", () => run(async () => { capture.imageUrl = ""; await save(); render(); }));
byId("continue").addEventListener("click", () => run(async () => {
  const url = handoffUrl({ ...capture, text: byId("caption").value });
  await writes;
  await chrome.tabs.create({ url });
  // Keep the clip until the user clears it, so a failed sign-in never loses their text.
  status("Opened in Meadow. Review the content there, then save your draft.");
}));

async function initialize() {
  const [settings, session] = await Promise.all([
    chrome.storage.local.get(ENABLED_KEY), chrome.storage.session.get([CAPTURE_KEY, "meadowCaptureError"]),
  ]);
  enabled = settings[ENABLED_KEY] === true;
  capture = enabled ? readStoredCapture(session[CAPTURE_KEY]) || empty() : empty();
  if (session[CAPTURE_KEY] && !readStoredCapture(session[CAPTURE_KEY])) await chrome.storage.session.remove(CAPTURE_KEY);
  render();
  if (session.meadowCaptureError) { status(session.meadowCaptureError); await chrome.storage.session.remove("meadowCaptureError"); }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ENABLED_KEY in changes) { enabled = changes[ENABLED_KEY].newValue === true; if (!enabled) capture = empty(); render(); }
});
initialize().catch(error => { byId("welcome").hidden = false; status(error.message || "Could not load FindMeadow. Reopen the extension."); });
