// BPAN Research Notes — Background Service Worker
// Handles extension icon click → toggle sidebar

chrome.action.onClicked.addListener((tab) => {
  // If popup is set, this won't fire. We use the popup instead.
});

// When the extension is installed, set up defaults
chrome.runtime.onInstalled.addListener(() => {
  console.log("BPAN Research Notes extension installed");
});
