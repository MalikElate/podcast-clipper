// A persistent extension tab keeps uploads and the composer alive when a user
// switches tabs. No access to the current page is requested.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
});
