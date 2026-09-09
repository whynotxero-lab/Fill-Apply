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
    console.log('[Fill & Apply] Installed. Open Options to edit profile; popup Start runs the mock queue.');
  }
  FillApplyStorage.getRunConfig().then(function (cfg) {
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
        await FillApplyStorage.setQueueStatus({ remaining: jobs.length, lastError: null });
        return { remaining: jobs.length, jobs: jobs };
      })
    );
  }

  if (message.type === 'FILL_APPLY_SAVE_CONFIG') {
    return reply(FillApplyStorage.saveRunConfig(message.config || {}));
  }

  return false;
});
