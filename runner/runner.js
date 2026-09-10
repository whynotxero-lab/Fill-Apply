/**
 * Queue-driven runner (service-worker side).
 * Loop: getNextJob (queued only) → open tab → detect challenge? → fill →
 * (optional) external Apply handoff: re-wait load + re-inject/detect → fill →
 * move to applied/failed OR pause for human → prune old submitted tabs? → delay.
 * Honors STOP and RESUME (after Cloudflare/CAPTCHA / form drift).
 *
 * runMode: fill | ready | submit
 * Auto-close: Submit mode + submitted success only; keeps last N tabs (keepRecentTabs).
 * PDF report: on successful submit when autoPdfReport is ON.
 */
(function (global) {
  'use strict';

  const INJECT_FILES = [
    'lib/synonyms.js',
    'lib/field-map.js',
    'lib/files.js',
    'lib/challenges.js',
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
    'adapters/ats/icims.js',
    'adapters/ats/cats.js',
    'adapters/boards/indeed.js',
    'adapters/boards/linkedin.js',
    'adapters/boards/naukrigulf.js',
    'adapters/boards/remoteok.js',
    'adapters/boards/weworkremotely.js',
    'adapters/boards/workingnomads.js',
    'adapters/boards/jooble.js',
    'adapters/boards/swooped.js'
  ];

  let loopActive = false;
  let delayTimer = null;
  let currentJobId = null;
  let pausedTabId = null;
  let resumeTabId = null;
  /** Oldest-first list of submitted job tabs kept for context: { tabId, jobId, at } */
  let submittedTabs = [];

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

  /** Human-like delay: base delayMs ± small jitter. */
  function jitteredDelay(delayMs) {
    const base = Math.max(0, Number(delayMs) || 0);
    const jitter = Math.floor(Math.random() * Math.min(900, Math.max(200, base * 0.25 + 150)));
    return base + jitter;
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
    await sleep(800 + Math.floor(Math.random() * 400));
    return tab;
  }

  async function focusTab(tabId) {
    if (tabId == null) return;
    try {
      await chrome.tabs.update(tabId, { active: true });
    } catch (_e) {
      /* ignore */
    }
  }

  function clampKeep(n) {
    if (global.FillApplyStorage && global.FillApplyStorage.clampKeepRecentTabs) {
      return global.FillApplyStorage.clampKeepRecentTabs(n);
    }
    const v = Number(n);
    if (!Number.isFinite(v)) return 5;
    return Math.min(10, Math.max(3, Math.round(v)));
  }

  /**
   * Auto-close ONLY after successful Submit-mode apply.
   * Keeps the newest `keepRecentTabs` submitted tabs open for context;
   * closes oldest submitted tabs beyond that window.
   * Never closes while a tab is the active processing tab (caller only
   * invokes this after processing finishes). Never runs for fill/ready.
   */
  async function trackSubmittedTabAndPrune(tabId, jobId, config, activeTabId) {
    if (!config || !config.autoCloseAppliedTab) return;
    if (tabId == null) return;

    submittedTabs.push({ tabId: tabId, jobId: jobId || null, at: Date.now() });

    // Drop entries for tabs that no longer exist
    const alive = [];
    for (let i = 0; i < submittedTabs.length; i++) {
      const entry = submittedTabs[i];
      try {
        await chrome.tabs.get(entry.tabId);
        alive.push(entry);
      } catch (_e) {
        /* gone */
      }
    }
    submittedTabs = alive;

    const keep = clampKeep(config.keepRecentTabs);
    while (submittedTabs.length > keep) {
      const oldest = submittedTabs.shift();
      if (!oldest || oldest.tabId == null) continue;
      // Never close the tab still being processed / just finished if it is activeTabId
      // and somehow still inside the prune set as the only one — but oldest ≠ newest.
      if (activeTabId != null && oldest.tabId === activeTabId && submittedTabs.length < keep) {
        submittedTabs.unshift(oldest);
        break;
      }
      if (activeTabId != null && oldest.tabId === activeTabId) {
        // Prefer closing a different old tab; re-queue this one at front only if empty prune
        continue;
      }
      try {
        await chrome.tabs.remove(oldest.tabId);
      } catch (_e2) {
        /* tab may already be closed */
      }
    }
  }

  /** @deprecated immediate close — kept as no-op helper name for clarity */
  async function closeAppliedTab(/* tabId, config */) {
    /* replaced by trackSubmittedTabAndPrune — fill/ready/failed never auto-close */
  }

  function notifyActionNeeded(job, detail) {
    if (!chrome.notifications || !chrome.notifications.create) return;
    let host = '';
    try {
      host = job && job.url ? new URL(job.url).host : '';
    } catch (_e) {
      host = '';
    }
    const title = (job && job.title) || 'Job';
    const message =
      (title.length > 60 ? title.slice(0, 57) + '…' : title) +
      (host ? ' · ' + host : '') +
      (detail ? ' — ' + String(detail).slice(0, 80) : '');
    try {
      chrome.notifications.create('fill-apply-human-' + Date.now(), {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'Fill & Apply — action needed',
        message: message,
        priority: 2
      });
    } catch (_e2) {
      /* notifications may be unavailable */
    }
  }


  function notifySourceCap(job, reason) {
    if (!chrome.notifications || !chrome.notifications.create) return;
    let host = '';
    try {
      host = job && job.url ? new URL(job.url).host : '';
    } catch (_e) {
      host = '';
    }
    const title = (job && job.title) || 'Job';
    const message =
      (title.length > 50 ? title.slice(0, 47) + '…' : title) +
      (host ? ' · ' + host : '') +
      ' — ' +
      String(reason || 'Source apply cap reached').slice(0, 100);
    try {
      chrome.notifications.create('fill-apply-cap-' + Date.now(), {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'Fill & Apply — source cap',
        message: message,
        priority: 1
      });
    } catch (_e2) {
      /* ignore */
    }
  }

  async function detectChallengeInTab(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['lib/challenges.js']
      });
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: function () {
          const C = globalThis.FillApplyChallenges;
          if (!C || !C.detectChallenge) {
            return { challenged: false, kind: null, detail: '', markers: [] };
          }
          return C.detectChallenge(document);
        }
      });
      return (
        (results && results[0] && results[0].result) || {
          challenged: false,
          kind: null,
          detail: '',
          markers: []
        }
      );
    } catch (_e) {
      return { challenged: false, kind: null, detail: '', markers: [] };
    }
  }

  /**
   * Pause run for human (Cloudflare / CAPTCHA / Indeed structure drift).
   * Keeps job in queued with needsAttention; does not auto-click challenges.
   */
  async function pauseForHuman(job, tabId, reason, extra) {
    const S = global.FillApplyStorage;
    const B = global.FillApplyBackend;
    clearDelay();
    await S.setRunning(false);
    loopActive = false;
    pausedTabId = tabId;

    // Keep tab focused for the human
    await focusTab(tabId);

    const pauseInfo = Object.assign(
      {
        paused: true,
        reason: reason || 'challenge',
        message: (extra && extra.message) || reason || 'Paused — verify Cloudflare/CAPTCHA',
        jobId: job && job.id,
        jobTitle: job && job.title,
        jobUrl: job && job.url,
        tabId: tabId,
        at: Date.now()
      },
      extra || {}
    );
    await S.setPausedForHuman(pauseInfo);

    // Flag job in queued bucket; leave it queued for Resume
    if (job && job.id && B.getQueued && B.setQueued) {
      try {
        const queued = await B.getQueued();
        const next = queued.map(function (j) {
          if (j.id !== job.id) return j;
          return Object.assign({}, j, {
            needsAttention: true,
            status: 'queued',
            lastError: pauseInfo.message,
            meta: Object.assign({}, j.meta || {}, {
              waitingHuman: true,
              pauseReason: pauseInfo.reason
            })
          });
        });
        // If job was already popped from queued, put it back at front
        if (!next.some(function (j) { return j.id === job.id; })) {
          next.unshift(
            Object.assign({}, job, {
              needsAttention: true,
              status: 'queued',
              lastError: pauseInfo.message,
              meta: Object.assign({}, job.meta || {}, {
                waitingHuman: true,
                pauseReason: pauseInfo.reason
              })
            })
          );
        }
        await B.setQueued(next);
      } catch (_e) {
        /* best-effort */
      }
    } else if (job && S.getBucket && S.setBucket) {
      try {
        let queued = await S.getBucket('queued');
        if (!queued.some(function (j) { return j.id === job.id; })) {
          queued = [
            Object.assign({}, job, { needsAttention: true, status: 'queued' })
          ].concat(queued);
        } else {
          queued = queued.map(function (j) {
            return j.id === job.id
              ? Object.assign({}, j, { needsAttention: true })
              : j;
          });
        }
        await S.setBucket('queued', queued);
      } catch (_e2) {
        /* ignore */
      }
    }

    await S.setQueueStatus({
      currentJobId: job && job.id,
      lastJobTitle: (job && job.company ? job.company + ' — ' : '') + ((job && job.title) || (job && job.id) || ''),
      lastError: pauseInfo.message,
      pausedForHuman: true
    });

    await S.appendSessionLog({
      type: 'paused_human',
      jobId: job && job.id,
      reason: pauseInfo.reason,
      message: pauseInfo.message
    });

    notifyActionNeeded(job, pauseInfo.message);
    currentJobId = null;
    return getStatusSnapshot();
  }

  async function injectAndFill(tabId, profile, documents, runMode) {
    await focusTab(tabId);
    await sleep(150 + Math.floor(Math.random() * 200));

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
    const paused = S.isPausedForHuman ? await S.isPausedForHuman() : null;
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
      pausedForHuman: !!(paused && paused.paused),
      pauseInfo: paused && paused.paused ? paused : null,
      config: config,
      queueStatus: Object.assign({}, queueStatus, {
        remaining: counts.queued,
        counts: counts,
        currentJobId: currentJobId || queueStatus.currentJobId,
        pausedForHuman: !!(paused && paused.paused)
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
    if (S.clearPausedForHuman) await S.clearPausedForHuman();
    loopActive = false;
    pausedTabId = null;

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
    await S.setQueueStatus({ pausedForHuman: false, lastError: null });
    return getStatusSnapshot();
  }

  function isCriticalFailure(fillResult) {
    if (!fillResult) return true;
    if (fillResult.needsHuman) return false; // handled as pause, not failed
    if (fillResult.ok === false) return true;
    if (fillResult.error) {
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
      if (S.clearPausedForHuman) await S.clearPausedForHuman();
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
          lastError: null,
          pausedForHuman: false
        });
        await S.appendSessionLog({
          type: 'job_start',
          jobId: job.id,
          title: job.title,
          url: job.url,
          runMode: runMode
        });

        if (!(await S.isRunning())) break;

        // Per-source apply cap / Ashby same-role soft block — before open/submit
        if (S.checkSourceApplyCap) {
          try {
            const cap = await S.checkSourceApplyCap(job, config);
            if (cap && cap.ok === false) {
              const reason =
                cap.reason ||
                'Source apply cap reached (' +
                  (cap.count != null ? cap.count : '?') +
                  '/' +
                  (cap.limit != null ? cap.limit : '?') +
                  ' for ' +
                  (cap.sourceId || 'source') +
                  ')';
              await S.appendSessionLog({
                type: 'source_cap',
                jobId: job.id,
                sourceId: cap.sourceId,
                reason: reason,
                kind: cap.kind || 'cap'
              });
              notifySourceCap(job, reason);
              if (B.markCancelled) {
                await B.markCancelled(job.id, reason);
              } else if (B.markFailed) {
                await B.markFailed(job.id, reason, {
                  blocked: true,
                  sourceCap: true,
                  sourceId: cap.sourceId
                });
              } else {
                await B.markApplied(job.id, {
                  failed: true,
                  error: reason,
                  blocked: true,
                  sourceCap: true,
                  url: job.url
                });
              }
              currentJobId = null;
              const counts = B.refreshCounts ? await B.refreshCounts() : { queued: 0 };
              await S.setQueueStatus({
                remaining: counts.queued,
                currentJobId: null,
                lastError: reason,
                counts: counts
              });
              const delay = jitteredDelay(config.delayMs);
              if (delay > 0 && (await S.isRunning())) {
                await S.appendSessionLog({ type: 'delay', ms: delay });
                await sleep(delay);
              }
              continue;
            }
          } catch (capErr) {
            await S.appendSessionLog({
              type: 'error',
              jobId: job.id,
              error: 'Cap check failed: ' + String(capErr && capErr.message ? capErr.message : capErr)
            });
          }
        }

        let tab = null;
        let fillResult = null;
        let moved = false;
        try {
          // Reuse tab left open from a human pause when URL still matches
          if (resumeTabId != null) {
            try {
              const existing = await chrome.tabs.get(resumeTabId);
              if (existing && existing.id != null) {
                let same = false;
                try {
                  same =
                    existing.url &&
                    job.url &&
                    (existing.url === job.url ||
                      existing.url.indexOf(new URL(job.url).hostname) !== -1);
                } catch (_u) {
                  same = true; // prefer reuse after challenge pages
                }
                if (same) {
                  tab = existing;
                  await focusTab(tab.id);
                  await sleep(400 + Math.floor(Math.random() * 300));
                }
              }
            } catch (_e) {
              tab = null;
            }
            resumeTabId = null;
          }
          if (!tab) {
            tab = await openJobTab(job);
          }
          if (!(await S.isRunning())) break;

          await focusTab(tab.id);

          // Platform-wide challenge check before fill (do not auto-click)
          const challenge = await detectChallengeInTab(tab.id);
          if (challenge && challenge.challenged) {
            await pauseForHuman(job, tab.id, 'challenge', {
              message:
                challenge.kind === 'cloudflare'
                  ? 'Paused — verify Cloudflare/CAPTCHA'
                  : 'Paused — verify Cloudflare/CAPTCHA',
              challenge: challenge
            });
            return getStatusSnapshot();
          }

          const profile = P ? await P.getProfile() : await B.getProfile();
          const documents = await B.getDocuments();

          let preHandoffUrl = '';
          try {
            const preTab = await chrome.tabs.get(tab.id);
            preHandoffUrl = (preTab && preTab.url) || '';
          } catch (_ePre) {}

          fillResult = await injectAndFill(tab.id, profile, documents, runMode);

          // WWR (and similar boards): Apply now opened an external ATS host —
          // wait for navigation and re-detect / fill with the destination adapter (e.g. CATS).
          // Only re-run when the tab hostname actually changed (avoids Apply-click loops).
          if (
            fillResult &&
            fillResult.ok !== false &&
            (fillResult.deferToPageAdapter || fillResult.handedOff || fillResult.externalApply) &&
            !(fillResult.filled > 0) &&
            !fillResult.submitted &&
            !fillResult.needsHuman
          ) {
            try {
              await sleep(700 + Math.floor(Math.random() * 500));
              await waitTabComplete(tab.id, 45000);
              await sleep(400 + Math.floor(Math.random() * 300));
              let postUrl = '';
              try {
                const postTab = await chrome.tabs.get(tab.id);
                postUrl = (postTab && postTab.url) || '';
              } catch (_ePost) {}
              let hostChanged = false;
              try {
                const a = preHandoffUrl ? new URL(preHandoffUrl).hostname : '';
                const b = postUrl ? new URL(postUrl).hostname : '';
                hostChanged = !!(a && b && a !== b);
              } catch (_eHost) {
                hostChanged = !!(preHandoffUrl && postUrl && preHandoffUrl !== postUrl);
              }
              if (hostChanged) {
                const handed = await injectAndFill(tab.id, profile, documents, runMode);
                if (handed) {
                  handed.externalApply = true;
                  handed.fromBoardHandoff = (fillResult && fillResult.adapterId) || true;
                  if (!handed.message && fillResult && fillResult.message) {
                    handed.message = fillResult.message;
                  }
                  fillResult = handed;
                }
              } else if (fillResult) {
                fillResult.message =
                  (fillResult.message || 'External apply handoff') +
                  ' (same-tab host unchanged — destination may have opened in another tab; continue there or paste ATS URL in queue)';
              }
            } catch (handoffErr) {
              // Keep original handoff result; job may still succeed if destination filled elsewhere.
              if (fillResult && !fillResult.error) {
                fillResult.handoffWaitError = String(
                  (handoffErr && handoffErr.message) || handoffErr || 'handoff wait failed'
                );
              }
            }
          }

          // Adapter asked for human (structure drift / challenge mid-flow)
          if (fillResult && fillResult.needsHuman) {
            const msg =
              fillResult.pauseReason === 'structure_drift'
                ? fillResult.error || 'Form changed — review required'
                : fillResult.error || 'Paused — verify Cloudflare/CAPTCHA';
            await pauseForHuman(job, tab.id, fillResult.pauseReason || 'challenge', {
              message: msg,
              challenge: fillResult.challenge || null,
              driftLabel: fillResult.driftLabel || null
            });
            return getStatusSnapshot();
          }

          // Re-check challenge after fill (interstitial may have appeared)
          const challengeAfter = await detectChallengeInTab(tab.id);
          if (challengeAfter && challengeAfter.challenged) {
            await pauseForHuman(job, tab.id, 'challenge', {
              message: 'Paused — verify Cloudflare/CAPTCHA',
              challenge: challengeAfter
            });
            return getStatusSnapshot();
          }

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

          if (!(await S.isRunning()) || currentJobId !== job.id) {
            moved = true;
            break;
          }

          const failed = isCriticalFailure(fillResult);
          await S.setQueueStatus({
            lastResult: fillResult,
            lastError: failed ? fillResult.error || 'Fill failed' : null
          });

          const wasSubmitted =
            !failed && runMode === 'submit' && !!(fillResult && fillResult.submitted);

          let reportPayload = null;
          let reportPdfBase64 = null;
          if (wasSubmitted && config.autoPdfReport !== false && global.FillApplyReport) {
            try {
              const reportOut = await global.FillApplyReport.generateAndSave(
                job,
                fillResult,
                runMode,
                profile
              );
              reportPayload = reportOut.summary;
              if (reportOut.report && reportOut.report.pdfBase64) {
                reportPdfBase64 = reportOut.report.pdfBase64;
              }
              await S.appendSessionLog({
                type: 'report',
                jobId: job.id,
                reportId: reportPayload && reportPayload.id,
                filename: reportPayload && reportPayload.filename
              });
            } catch (reportErr) {
              await S.appendSessionLog({
                type: 'report_error',
                jobId: job.id,
                error: String(reportErr && reportErr.message ? reportErr.message : reportErr)
              });
            }
          }

          const markPayload = failed
            ? {
                failed: true,
                error: fillResult.error || 'Fill failed',
                fillResult: fillResult,
                runMode: runMode,
                url: job.url
              }
            : {
                fillResult: fillResult,
                submitted: !!fillResult.submitted,
                advanced: !!fillResult.advanced,
                runMode: runMode,
                resumeAttached: !!fillResult.resumeAttached,
                coverAttached: !!fillResult.coverAttached,
                url: job.url,
                applicationReport: reportPayload ||
                  (fillResult && fillResult.applicationReport) ||
                  null,
                reportSummary: reportPayload || null
              };

          if (reportPdfBase64) {
            markPayload.pdfBase64 = reportPdfBase64;
          }

          await B.markApplied(job.id, markPayload);
          moved = true;
          currentJobId = null;

          const counts = B.refreshCounts ? await B.refreshCounts() : { queued: 0 };
          await S.setQueueStatus({
            remaining: counts.queued,
            currentJobId: null,
            counts: counts
          });

          // Track submitted apply for per-source rate limits (once per success)
          if (wasSubmitted && S.recordSubmittedApply) {
            try {
              const sourceId =
                (fillResult && fillResult.adapterId) ||
                (S.detectSourceId && S.detectSourceId(job.url, job)) ||
                'default';
              await S.recordSubmittedApply({
                sourceId: sourceId,
                jobUrl: job.url,
                jobId: job.id,
                submittedAt: Date.now()
              });
            } catch (_recErr) {
              /* best-effort */
            }
          }

          // Auto-close: Submit + submitted success only; keep recent context tabs
          if (wasSubmitted && tab && tab.id != null) {
            await trackSubmittedTabAndPrune(tab.id, job.id, config, tab.id);
          }
          // fill / ready / failed: never auto-close
          tab = null;
        } catch (e) {
          const msg = String(e && e.message ? e.message : e);
          await S.appendSessionLog({ type: 'error', jobId: job.id, error: msg });
          await S.setQueueStatus({ lastError: msg });

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
          // Failed / exception path: never auto-close (keep context for debugging)
          tab = null;
        }

        if (!(await S.isRunning())) break;

        const delay = jitteredDelay(config.delayMs);
        if (delay > 0) {
          await S.appendSessionLog({ type: 'delay', ms: delay });
          await sleep(delay);
        }
      }
    } finally {
      clearDelay();
      loopActive = false;
      if (!(await S.isRunning()) && currentJobId && B.markCancelled) {
        const paused = S.isPausedForHuman ? await S.isPausedForHuman() : null;
        // Do not cancel when paused for human — job stays queued
        if (!(paused && paused.paused)) {
          try {
            await B.markCancelled(currentJobId, 'Stopped by user');
          } catch (_e) {
            /* ignore */
          }
        }
      }
      currentJobId = null;
      const stillPaused = S.isPausedForHuman ? await S.isPausedForHuman() : null;
      if (!(stillPaused && stillPaused.paused)) {
        await S.setRunning(false);
      }
      await S.appendSessionLog({ type: 'idle' });
    }

    return getStatusSnapshot();
  }

  async function startRunner() {
    if (loopActive || (await global.FillApplyStorage.isRunning())) {
      if (!loopActive) await global.FillApplyStorage.setRunning(false);
      else return getStatusSnapshot();
    }

    if (global.FillApplyStorage.clearPausedForHuman) {
      await global.FillApplyStorage.clearPausedForHuman();
    }

    const cfg = await global.FillApplyStorage.getRunConfig();
    if (cfg.mockMode || !cfg.backendBaseUrl) {
      if (global.FillApplyBackend && global.FillApplyBackend.assertMockUrlsConfigured) {
        await global.FillApplyBackend.assertMockUrlsConfigured();
      }
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

  /**
   * Resume after human verified Cloudflare/CAPTCHA / reviewed Indeed form.
   * Clears pause flag and continues the queue (job remains queued with needsAttention cleared on next success).
   */
  async function resumeRunner() {
    const S = global.FillApplyStorage;
    const paused = S.isPausedForHuman ? await S.isPausedForHuman() : null;
    if (paused && paused.tabId != null) {
      resumeTabId = paused.tabId;
      await focusTab(paused.tabId);
    } else if (pausedTabId != null) {
      resumeTabId = pausedTabId;
      await focusTab(pausedTabId);
    }
    if (S.clearPausedForHuman) await S.clearPausedForHuman();
    await S.setQueueStatus({ pausedForHuman: false, lastError: null });
    await S.appendSessionLog({ type: 'resume_human' });
    pausedTabId = null;

    // Clear needsAttention on queued jobs (best-effort)
    const B = global.FillApplyBackend;
    if (B && B.getQueued && B.setQueued) {
      try {
        const queued = await B.getQueued();
        await B.setQueued(
          queued.map(function (j) {
            if (!j.needsAttention) return j;
            const meta = Object.assign({}, j.meta || {});
            delete meta.waitingHuman;
            delete meta.pauseReason;
            return Object.assign({}, j, {
              needsAttention: false,
              lastError: null,
              meta: meta
            });
          })
        );
      } catch (_e) {
        /* ignore */
      }
    }

    return startRunner();
  }

  global.FillApplyRunner = {
    start: startRunner,
    stop: stopRunner,
    resume: resumeRunner,
    getStatus: getStatusSnapshot,
    injectAndFill: injectAndFill,
    INJECT_FILES: INJECT_FILES
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
