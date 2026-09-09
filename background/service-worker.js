/**
 * MV3 service worker — owns the runner state machine and message API.
 * Also configures chrome.sidePanel so the toolbar action opens the right sidebar.
 */
/* global importScripts, FillApplyTypes, FillApplyStorage, FillApplyProfile, FillApplyBackend, FillApplyRunner */

importScripts(
  '../lib/types.js',
  '../lib/storage.js',
  '../lib/profile.js',
  '../lib/backend.js',
  '../runner/runner.js'
);

var SIDE_PANEL_PATH = 'sidepanel/sidepanel.html';

function configureSidePanel() {
  if (!chrome.sidePanel) return;
  try {
    chrome.sidePanel.setOptions({ enabled: true, path: SIDE_PANEL_PATH });
  } catch (e) {
    console.warn('[Fill & Apply] sidePanel.setOptions failed:', e);
  }
  try {
    // Toolbar click opens the Chrome right sidebar (no tiny popup).
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (e) {
    console.warn('[Fill & Apply] sidePanel.setPanelBehavior failed:', e);
  }
}

configureSidePanel();

chrome.runtime.onInstalled.addListener(function (details) {
  configureSidePanel();
  if (details.reason === 'install') {
    console.log(
      '[Fill & Apply] Installed. Click the toolbar icon to open the side panel. Add https job apply URLs in Options (Mock queue), then Start.'
    );
  }
  FillApplyStorage.getRunConfig().then(function (cfg) {
    // Migrate autoSubmit → runMode; ensure defaults
    const patch = {};
    if (typeof cfg.autoCloseAppliedTab === 'undefined') {
      patch.autoCloseAppliedTab = true;
    }
    if (!cfg.runMode || ['fill', 'ready', 'submit'].indexOf(cfg.runMode) === -1) {
      patch.runMode = cfg.autoSubmit ? 'submit' : 'fill';
    }
    if (Object.keys(patch).length) {
      return FillApplyStorage.saveRunConfig(Object.assign({}, cfg, patch));
    }
    return cfg;
  });

  // Scrub any chrome-extension URLs from legacy mock queue on upgrade
  if (FillApplyBackend && FillApplyBackend.getQueued) {
    FillApplyBackend.getQueued().catch(function () {});
  }
});

chrome.runtime.onStartup.addListener(function () {
  configureSidePanel();
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
      FillApplyBackend.resetMockQueue({ clearFailed: false, clearCancelled: false }).then(
        async function (jobs) {
          const counts = await FillApplyBackend.refreshCounts();
          await FillApplyStorage.setQueueStatus({
            remaining: jobs.length,
            counts: counts,
            lastError: jobs.length
              ? null
              : FillApplyBackend.NO_URLS_ERROR ||
                'Add job apply URLs in Options (Mock queue)'
          });
          return { remaining: jobs.length, jobs: jobs, counts: counts };
        }
      )
    );
  }

  if (message.type === 'FILL_APPLY_CLEAR_HISTORY') {
    return reply(
      (async function () {
        await FillApplyStorage.clearHistory();
        const counts = await FillApplyBackend.refreshCounts();
        return { counts: counts };
      })()
    );
  }

  if (message.type === 'FILL_APPLY_SAVE_CONFIG') {
    return reply(FillApplyStorage.saveRunConfig(message.config || {}));
  }

  if (message.type === 'FILL_APPLY_SAVE_MOCK_URLS') {
    return reply(
      (async function () {
        const result = await FillApplyBackend.rebuildQueuedFromUrls(
          message.urlsText != null ? message.urlsText : message.urls || []
        );
        const counts = await FillApplyBackend.refreshCounts();
        await FillApplyStorage.setQueueStatus({
          remaining: result.jobs.length,
          counts: counts,
          lastError: result.jobs.length ? null : FillApplyBackend.NO_URLS_ERROR
        });
        return {
          urls: result.urls,
          remaining: result.jobs.length,
          jobs: result.jobs,
          counts: counts
        };
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

  if (message.type === 'FILL_APPLY_GET_BUCKETS') {
    return reply(FillApplyBackend.getBucketsSnapshot());
  }

  return false;
});
