/**
 * Queue-driven runner (service-worker side).
 * Loop: getNextJob (queued only) → open tab → detect → fill → move to applied/failed →
 * close tab? → delay. Honors STOP (current → cancelled; remaining stay queued).
 *
 * runMode: fill | ready | submit
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
  let currentJobId = null;

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

  function resolveRunMode(config) {
    if (global.FillApplyStorage && global.FillApplyStorage.normalizeRunMode) {
      return global.FillApplyStorage.normalizeRunMode(config);
    }
    if (config && config.runMode) return config.runMode;
    if (config && config.autoSubmit) return 'submit';
    return 'fill';
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
    if (!job || !job.url) {
      throw new Error('Job is missing a url');
    }
    if (/^chrome-extension:\/\//i.test(job.url) || /^about:/i.test(job.url)) {
      throw new Error(
        'Cannot open chrome-extension:// or about: pages in the runner. Add https job apply URLs in Options (Mock queue).'
      );
    }
    if (!/^https?:\/\//i.test(job.url)) {
      throw new Error('Job URL must be http(s): ' + String(job.url).slice(0, 80));
    }
    const tab = await chrome.tabs.create({ url: job.url, active: true });
    await waitTabComplete(tab.id);
    await sleep(800);
    return tab;
  }

  async function closeAppliedTab(tabId, config) {
    if (!config || !config.autoCloseAppliedTab) return;
    if (tabId == null) return;
    try {
      await chrome.tabs.remove(tabId);
    } catch (_e) {
      /* tab may already be closed */
    }
  }

  async function injectAndFill(tabId, profile, documents, runMode) {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: INJECT_FILES
    });

    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function (profileArg, documentsArg, runModeArg) {
        const registry = globalThis.FillApplyRegistry;
        if (!registry) {
          return {
            ok: false,
            error: 'Adapter registry missing',
            filled: 0,
            unmatched: 0,
            total: 0
          };
        }
        const adapter = registry.detect(location.href, document);
        if (!adapter) {
          return {
            ok: false,
            error: 'No adapter matched',
            filled: 0,
            unmatched: 0,
            total: 0
          };
        }
        if (typeof adapter.fill === 'function') {
          return adapter.fill({
            profile: profileArg,
            documents: documentsArg,
            runMode: runModeArg || 'fill',
            autoSubmit: runModeArg === 'submit',
            options: { highlightUnmatched: false, runMode: runModeArg || 'fill' },
            adapterId: adapter.id,
            submitSelector: adapter.submitSelector,
            fileInputHints: adapter.fileInputHints,
            fieldMaps: adapter.fieldMaps
          });
        }
        return {
          ok: false,
          adapterId: adapter.id,
          error: 'Adapter has no fill()',
          filled: 0,
          unmatched: 0,
          total: 0
        };
      },
      args: [profile, documents, runMode || 'fill']
    });

    return (
      (results && results[0] && results[0].result) || {
        ok: false,
        error: 'No result from inject',
        filled: 0,
        unmatched: 0,
        total: 0
      }
    );
  }

  async function getStatusSnapshot() {
    const S = global.FillApplyStorage;
    const B = global.FillApplyBackend;
    const running = await S.isRunning();
    const config = await S.getRunConfig();
    const queueStatus = await S.getQueueStatus();
    const log = await S.getSessionLog();
    let counts = queueStatus.counts || {
      queued: 0,
      applied: 0,
      failed: 0,
      cancelled: 0
    };
    try {
      if (B.getBucketsSnapshot) {
        const snap = await B.getBucketsSnapshot();
        counts = snap.counts;
      } else if (B.refreshCounts) {
        counts = await B.refreshCounts();
      }
    } catch (_e) {
      /* keep stored */
    }
    return {
      running: running,
      config: config,
      queueStatus: Object.assign({}, queueStatus, {
        remaining: counts.queued,
        counts: counts,
        currentJobId: currentJobId || queueStatus.currentJobId
      }),
      counts: counts,
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
    const S = global.FillApplyStorage;
    const B = global.FillApplyBackend;
    const jobId = currentJobId;
    await S.setRunning(false);
    loopActive = false;

    // On Stop: current incomplete job → cancelled; remaining stay queued
    if (jobId && B.markCancelled) {
      try {
        await B.markCancelled(jobId, 'Stopped by user');
      } catch (_e) {
        /* ignore */
      }
    }
    currentJobId = null;
    await S.appendSessionLog({
      type: 'stop',
      note: 'Current job cancelled if incomplete; remaining stay queued'
    });
    return getStatusSnapshot();
  }

  function isCriticalFailure(fillResult) {
    if (!fillResult) return true;
    if (fillResult.ok === false) return true;
    if (fillResult.error) {
      // Soft errors (partial fill) may still be ok
      if (/no adapter|registry missing|not loaded|inject/i.test(fillResult.error)) return true;
    }
    return false;
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
        const runMode = resolveRunMode(config);
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
          currentJobId = null;
          await S.setQueueStatus({
            remaining: 0,
            currentJobId: null,
            lastJobTitle: null
          });
          if (B.refreshCounts) await B.refreshCounts();
          break;
        }

        currentJobId = job.id;
        await S.setQueueStatus({
          currentJobId: job.id,
          lastJobTitle: (job.company ? job.company + ' — ' : '') + (job.title || job.id),
          lastError: null
        });
        await S.appendSessionLog({
          type: 'job_start',
          jobId: job.id,
          title: job.title,
          url: job.url,
          runMode: runMode
        });

        if (!(await S.isRunning())) break;

        let tab = null;
        let fillResult = null;
        let moved = false;
        try {
          tab = await openJobTab(job);
          if (!(await S.isRunning())) break;

          const profile = P ? await P.getProfile() : await B.getProfile();
          const documents = await B.getDocuments();
          fillResult = await injectAndFill(tab.id, profile, documents, runMode);

          await S.appendSessionLog({
            type: 'fill',
            jobId: job.id,
            result: {
              ok: fillResult.ok,
              adapterId: fillResult.adapterId,
              filled: fillResult.filled,
              unmatched: fillResult.unmatched,
              submitted: fillResult.submitted,
              advanced: fillResult.advanced,
              runMode: runMode,
              resumeAttached: fillResult.resumeAttached,
              coverAttached: fillResult.coverAttached,
              inspection: fillResult.inspection,
              filesAttached: fillResult.filesAttached && fillResult.filesAttached.attached
            },
            error: fillResult.error || null
          });

          // If Stop already cancelled this job, do not move to applied/failed
          if (!(await S.isRunning()) || currentJobId !== job.id) {
            moved = true; // stop path owns the bucket move
            break;
          }

          const failed = isCriticalFailure(fillResult);
          await S.setQueueStatus({
            lastResult: fillResult,
            lastError: failed
              ? fillResult.error || 'Fill failed'
              : null
          });

          // Move out of queued BEFORE closing tab (capture failure info first)
          if (failed) {
            await B.markApplied(job.id, {
              failed: true,
              error: fillResult.error || 'Fill failed',
              fillResult: fillResult,
              runMode: runMode,
              url: job.url
            });
          } else {
            await B.markApplied(job.id, {
              fillResult: fillResult,
              submitted: !!fillResult.submitted,
              advanced: !!fillResult.advanced,
              runMode: runMode,
              resumeAttached: !!fillResult.resumeAttached,
              coverAttached: !!fillResult.coverAttached,
              url: job.url
            });
          }
          moved = true;
          currentJobId = null;

          const counts = B.refreshCounts ? await B.refreshCounts() : { queued: 0 };
          await S.setQueueStatus({
            remaining: counts.queued,
            currentJobId: null,
            counts: counts
          });

          // Close only after status move
          if (tab && tab.id != null) {
            await closeAppliedTab(tab.id, config);
            tab = null;
          }
        } catch (e) {
          const msg = String(e && e.message ? e.message : e);
          await S.appendSessionLog({ type: 'error', jobId: job.id, error: msg });
          await S.setQueueStatus({ lastError: msg });

          // Move to failed with error — never leave looping in queued
          if (!moved) {
            try {
              await B.markApplied(job.id, {
                error: msg,
                failed: true,
                runMode: runMode,
                url: job.url
              });
              moved = true;
            } catch (_e2) {
              /* ignore */
            }
          }
          currentJobId = null;

          // Close after status move
          if (tab && tab.id != null) {
            await closeAppliedTab(tab.id, config);
            tab = null;
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
      // If we exited while a job was still current (e.g. break after stop mid-open),
      // stopRunner may already have cancelled it; clear the pointer.
      if (!(await S.isRunning()) && currentJobId && B.markCancelled) {
        try {
          await B.markCancelled(currentJobId, 'Stopped by user');
        } catch (_e) {
          /* ignore */
        }
      }
      currentJobId = null;
      await S.setRunning(false);
      await S.appendSessionLog({ type: 'idle' });
    }

    return getStatusSnapshot();
  }

  async function startRunner() {
    if (loopActive || (await global.FillApplyStorage.isRunning())) {
      if (!loopActive) await global.FillApplyStorage.setRunning(false);
      else return getStatusSnapshot();
    }

    const cfg = await global.FillApplyStorage.getRunConfig();
    if (cfg.mockMode || !cfg.backendBaseUrl) {
      if (global.FillApplyBackend && global.FillApplyBackend.assertMockUrlsConfigured) {
        await global.FillApplyBackend.assertMockUrlsConfigured();
      }
      // Ensure queued is populated from saved URLs if empty
      const B = global.FillApplyBackend;
      if (B.getQueued && B.resetMockQueue) {
        const q = await B.getQueued();
        if (!q.length) {
          await B.resetMockQueue();
        }
      }
    }

    runLoop().catch(async function (e) {
      await global.FillApplyStorage.setRunning(false);
      await global.FillApplyStorage.appendSessionLog({
        type: 'error',
        error: String(e && e.message ? e.message : e)
      });
    });
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
