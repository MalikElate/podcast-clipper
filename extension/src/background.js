import { CAPTURE_KEY, ENABLED_KEY, captureFromContext } from "./capture.js";

const menus = [
  { id: "meadow-page", title: "Clip this page to Meadow", contexts: ["page"] },
  { id: "meadow-link", title: "Clip this link to Meadow", contexts: ["link"] },
  { id: "meadow-selection", title: "Clip selected text to Meadow", contexts: ["selection"] },
  { id: "meadow-image", title: "Clip this image to Meadow", contexts: ["image"] },
];

let menuUpdate = Promise.resolve();
export function updateMenus() {
  // Serialize install/startup/preference changes so removeAll cannot erase a newer registration.
  menuUpdate = menuUpdate.catch(() => {}).then(async () => {
    const settings = await chrome.storage.local.get(ENABLED_KEY);
    await chrome.contextMenus.removeAll();
    if (settings[ENABLED_KEY] !== true) return;
    for (const item of menus) chrome.contextMenus.create({ ...item, documentUrlPatterns: ["http://*/*", "https://*/*"] });
  });
  return menuUpdate;
}

async function openEditor() {
  try { await chrome.action.openPopup(); }
  catch { await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?editor=tab") }); }
}

export async function clipContext(info, tab) {
  if (!menus.some(item => item.id === info.menuItemId)) return;
  if ((await chrome.storage.local.get(ENABLED_KEY))[ENABLED_KEY] !== true) return;
  try {
    const capture = captureFromContext(info, tab);
    await chrome.storage.session.set({ [CAPTURE_KEY]: { capture, savedAt: Date.now() }, meadowCaptureError: "" });
  } catch (error) {
    await chrome.storage.session.set({ meadowCaptureError: error.message });
  }
  await openEditor();
}

chrome.runtime.onInstalled.addListener(() => { void updateMenus(); });
chrome.runtime.onStartup.addListener(() => { void updateMenus(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ENABLED_KEY in changes) void updateMenus();
});
chrome.contextMenus.onClicked.addListener((info, tab) => { void clipContext(info, tab); });
