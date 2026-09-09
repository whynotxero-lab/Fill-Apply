/**
 * MV3 service worker — keeps a quiet background presence and handles
 * optional messaging. Fill is primarily triggered from the popup via
 * chrome.scripting.executeScript (activeTab).
 */
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') {
    console.log('[Fill & Apply] Installed. Open the popup to seed a sample profile or edit Options.');
  }
});

chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
  if (!message || !message.type) return;

  if (message.type === 'FILL_APPLY_PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return true;
  }

  return false;
});
