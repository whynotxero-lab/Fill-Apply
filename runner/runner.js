/**
 * Queue-driven runner (service-worker side).
 * Loop: getNextJob → open/navigate tab → detect adapter → fill → attach files →
 * optional submit → markApplied → delayMs. Honors STOP between steps.
 *
 * Requires importScripts of: types, storage, profile, backend (and this file).
 * Content injection loads field-map, fill, files, registry, adapters.
 */
(function (global) {
  'use strict';

  const INJECT_FILES = [
    'lib/field-map.js',
    'lib/files.js',
    'content/fill.js',
    'adapters/registry.js',
    'adapters/fallback.js',
    'adapters/catalog.js',
    'adapters/ats/greenhouse.js',
    'adapters/ats/lever.js',
    'adapters/ats/ashby.js',
    'adapters/ats/workday.js',
    'adapters/ats/smartrecruiters.js',
    'adapters/ats/workable.js',
    'adapters/ats/icims.js'
  ];

  let loopActive = false;
  let delayTimer = null;

  function sleep(ms) {
    return new Promise(function (resolve) {
      delayTimer = setTimeout(function () {
        delayTimer = null;
        resolve();
      }, ms);
    });
  }

  function clearDelay() {
    if (delayTimer) {
      clearTimeout(delayTimer);
      delayTimer = null;
    }
  }

  function waitTabComplete(tabId, timeoutMs) {
    timeoutMs = timeoutMs || 45000;
    return new Promise(function (resolve, reject) {
      let done = false;
      const timer = setTimeout(function () {
        if (done) return;
        done = true;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        reject(new Error('Tab load timeout'));
      }, timeoutMs);

      function finish(tab) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve(tab);
      }

      function onUpdated(id, info, tab) {
        if (id !== tabId) return;
        if (info.status === 'complete') finish(tab);
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.get(tabId, function (tab) {
        if (chrome.runtime.lastError) {
          if (!done) {
            done = true;
            clearTimeout(timer);
            chrome.tabs.onUpdated.removeListener(onUpdated);
            reject(new Error(chrome.runtime.lastError.message));
          }
          return;
        }
        if (tab && tab.status === 'complete') finish(tab);
      });
    });
  }

  async function openJobTab(job) {
    const tab = await chrome.tabs.create({ url: job.url, active: true });
    await waitTabComplete(tab.id);
    // Brief settle for SPA forms
    await sleep(800);
    return tab;
  }

  async function injectAndFill(tabId, profile, documents, autoSubmit) {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: INJECT_FILES
    });

    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function (profileArg, documentsArg, autoSubmitArg) {
        const registry = globalThis.FillApplyRegistry;
        if (!registry) {
          return { ok: false, error: 'Adapter registry missing', filled: 0, unmatched: 0, total: 0 };
        }
        const adapter = registry.detect(location.href, document);
        if (!adapter) {
          return { ok: false, error: 'No adapter matched', filled: 0, unmatched: 0, total: 0 };
        }
        if (typeof adapter.fill === 'function') {
          return adapter.fill({
            profile: profileArg,
            documents: documentsArg,
            autoSubmit: !!autoSubmitArg,
            options: { highlightUnmatched: false },
            adapterId: adapter.id,
            submitSelector: adapter.submitSelector,
            fileInputHints: adapter.fileInputHints,
            fieldMaps: adapter.fieldMaps
          });
        }
        return { ok: false, adapterId: adapter.id, error: 'Adapter has no fill()', filled: 0, unmatched: 0, total: 0 };
      },
      args: [profile, documents, !!autoSubmit]
    });

    return (results && results[0] && results[0].result) || {
      ok: false,
      error: 'No result from inject',
      filled: 0,
      unmatched: 0,
      total: 0
    };
  }

  async function getStatusSnapshot() {
    const S = global.FillApplyStorage;
    const B = global.FillApplyBackend;
    const running = await S.isRunning();
    const config = await S.getRunConfig();
    const queueStatus = await S.getQueueStatus();
    const log = await S.getSessionLog();
    let remaining = queueStatus.remaining;
    try {
      const q = await B.getQueue();
      remaining = Array.isArray(q) ? q.length : remaining;
    } catch (_e) {
      /* keep stored */
    }
    return {
      running: running,
      config: config,
      queueStatus: Object.assign({}, queueStatus, { remaining: remaining }),
      lastErrors: log
        .filter(function (e) {
          return e.type === 'error' || e.error;
        })
        .slice(-5)
        .reverse(),
      recentLog: log.slice(-10).reverse()
    };
  }

  async function stopRunner() {
    clearDelay();
    await global.FillApplyStorage.setRunning(false);
    loopActive = false;
    await global.FillApplyStorage.appendSessionLog({ type: 'stop' });
    return getStatusSnapshot();
  }

  async function runLoop() {
    if (loopActive) return;
    loopActive = true;
    const S = global.FillApplyStorage;
    const B = global.FillApplyBackend;
    const P = global.FillApplyProfile;

    try {
      await S.setRunning(true);
      await S.appendSessionLog({ type: 'start' });

      while (await S.isRunning()) {
        const config = await S.getRunConfig();
        let job = null;
        try {
          job = await B.getNextJob();
        } catch (e) {
          await S.appendSessionLog({ type: 'error', error: String(e.message || e) });
          await S.setQueueStatus({ lastError: String(e.message || e) });
          break;
        }

        if (!job) {
          await S.appendSessionLog({ type: 'queue_empty' });
          await S.setQueueStatus({
            remaining: 0,
            currentJobId: null,
            lastJobTitle: null
          });
          break;
        }

        await S.setQueueStatus({
          currentJobId: job.id,
          lastJobTitle: (job.company ? job.company + ' — ' : '') + (job.title || job.id),
          lastError: null
        });
        await S.appendSessionLog({
          type: 'job_start',
          jobId: job.id,
          title: job.title,
          url: job.url
        });

        if (!(await S.isRunning())) break;

        let tab = null;
        let fillResult = null;
        try {
          tab = await openJobTab(job);
          if (!(await S.isRunning())) break;

          const profile = P ? await P.getProfile() : await B.getProfile();
          const documents = await B.getDocuments();
          fillResult = await injectAndFill(tab.id, profile, documents, config.autoSubmit);

          await S.appendSessionLog({
            type: 'fill',
            jobId: job.id,
            result: {
              ok: fillResult.ok,
              adapterId: fillResult.adapterId,
              filled: fillResult.filled,
              unmatched: fillResult.unmatched,
              submitted: fillResult.submitted,
              filesAttached: fillResult.filesAttached && fillResult.filesAttached.attached
            },
            error: fillResult.error || null
          });

          await S.setQueueStatus({
            lastResult: fillResult,
            lastError: fillResult.ok ? null : fillResult.error || 'Fill failed'
          });

          const mark = await B.markApplied(job.id, {
            fillResult: fillResult,
            submitted: !!fillResult.submitted,
            autoSubmit: config.autoSubmit,
            url: job.url
          });

          const remaining =
            mark && typeof mark.remaining === 'number'
              ? mark.remaining
              : (await B.getQueue()).length;
          await S.setQueueStatus({ remaining: remaining, currentJobId: null });
        } catch (e) {
          const msg = String(e && e.message ? e.message : e);
          await S.appendSessionLog({ type: 'error', jobId: job.id, error: msg });
          await S.setQueueStatus({ lastError: msg });
          // Still consume mock job so the loop can progress in demo mode
          try {
            await B.markApplied(job.id, { error: msg, failed: true });
          } catch (_e2) {
            /* ignore */
          }
        }

        if (!(await S.isRunning())) break;

        const delay = Math.max(0, Number(config.delayMs) || 0);
        if (delay > 0) {
          await S.appendSessionLog({ type: 'delay', ms: delay });
          await sleep(delay);
        }
      }
    } finally {
      clearDelay();
      loopActive = false;
      await S.setRunning(false);
      await S.appendSessionLog({ type: 'idle' });
    }

    return getStatusSnapshot();
  }

  async function startRunner() {
    if (loopActive || (await global.FillApplyStorage.isRunning())) {
      // If flag stuck true but loop dead, reset and start
      if (!loopActive) await global.FillApplyStorage.setRunning(false);
      else return getStatusSnapshot();
    }
    // Fire-and-forget loop; status polled via getStatus
    runLoop().catch(async function (e) {
      await global.FillApplyStorage.setRunning(false);
      await global.FillApplyStorage.appendSessionLog({
        type: 'error',
        error: String(e && e.message ? e.message : e)
      });
    });
    // Small yield so running flag is set
    await sleep(50);
    return getStatusSnapshot();
  }

  global.FillApplyRunner = {
    start: startRunner,
    stop: stopRunner,
    getStatus: getStatusSnapshot,
    injectAndFill: injectAndFill,
    INJECT_FILES: INJECT_FILES
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
