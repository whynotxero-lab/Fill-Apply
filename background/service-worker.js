/**
 * MV3 service worker — owns the runner state machine and message API.
 */
/* global importScripts, FillApplyTypes, FillApplyStorage, FillApplyProfile, FillApplyBackend, FillApplyRunner */

importScripts(
  '../lib/types.js',
  '../lib/storage.js',
  '../lib/profile.js',
  '../lib/backend.js',
  '../runner/runner.js'
);

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') {
    console.log(
      '[Fill & Apply] Installed. Add https job apply URLs in Options (Mock queue), then Start from the popup.'
    );
  }
  FillApplyStorage.getRunConfig().then(function (cfg) {
    // Ensure autoCloseAppliedTab default is persisted for upgrades
    if (typeof cfg.autoCloseAppliedTab === 'undefined') {
      cfg.autoCloseAppliedTab = true;
    }
    return FillApplyStorage.saveRunConfig(cfg);
  });
});

chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
  if (!message || !message.type) return false;

  const MSG = FillApplyTypes.MSG;

  function reply(promise) {
    promise
      .then(function (data) {
        sendResponse({ ok: true, data: data });
      })
      .catch(function (e) {
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
      });
    return true;
  }

  if (message.type === MSG.PING || message.type === 'FILL_APPLY_PING') {
    sendResponse({
      ok: true,
      version: chrome.runtime.getManifest().version
    });
    return true;
  }

  if (message.type === MSG.START) {
    return reply(
      (async function () {
        if (message.config) {
          await FillApplyStorage.saveRunConfig(message.config);
        }
        if (message.resetMock) {
          await FillApplyBackend.resetMockQueue();
        }
        return FillApplyRunner.start();
      })()
    );
  }

  if (message.type === MSG.STOP) {
    return reply(FillApplyRunner.stop());
  }

  if (message.type === MSG.STATUS) {
    return reply(FillApplyRunner.getStatus());
  }

  if (message.type === 'FILL_APPLY_RESET_MOCK') {
    return reply(
      FillApplyBackend.resetMockQueue().then(async function (jobs) {
        await FillApplyStorage.setQueueStatus({
          remaining: jobs.length,
          lastError: jobs.length
            ? null
            : FillApplyBackend.NO_URLS_ERROR ||
              'Add job apply URLs in Options (Mock queue)'
        });
        return { remaining: jobs.length, jobs: jobs };
      })
    );
  }

  if (message.type === 'FILL_APPLY_SAVE_CONFIG') {
    return reply(FillApplyStorage.saveRunConfig(message.config || {}));
  }

  if (message.type === 'FILL_APPLY_SAVE_MOCK_URLS') {
    return reply(
      (async function () {
        const urls = await FillApplyStorage.saveMockQueueUrls(
          message.urlsText != null ? message.urlsText : message.urls || []
        );
        const jobs = await FillApplyBackend.resetMockQueue();
        await FillApplyStorage.setQueueStatus({
          remaining: jobs.length,
          lastError: jobs.length ? null : FillApplyBackend.NO_URLS_ERROR
        });
        return { urls: urls, remaining: jobs.length, jobs: jobs };
      })()
    );
  }

  if (message.type === 'FILL_APPLY_GET_MOCK_URLS') {
    return reply(
      FillApplyStorage.getMockQueueUrls().then(function (urls) {
        return { urls: urls, text: urls.join('\n') };
      })
    );
  }

  return false;
});
