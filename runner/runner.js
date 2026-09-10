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
    'lib/dom-deep.js',
    'lib/synonyms.js',
    'lib/pace.js',
    'lib/field-map.js',
    'lib/files.js',
    'lib/auth-walls.js',
    'lib/challenges.js',
    'lib/easy-apply-steps.js',
    'content/focus-hud.js',
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
    'adapters/ats/recruitee.js',
    'adapters/ats/teamtailor.js',
    'adapters/boards/indeed.js',
    'adapters/boards/glassdoor.js',
    'adapters/boards/linkedin.js',
    'adapters/boards/naukrigulf.js',
    'adapters/boards/remoteok.js',
    'adapters/boards/weworkremotely.js',
    'adapters/boards/workingnomads.js',
    'adapters/boards/jooble.js',
    'adapters/boards/swooped.js',
    'adapters/boards/efinancialcareers.js'
  ];

  /**
   * Company career sites embed the real ATS form in an iframe (Greenhouse,
   * Lever, Workable, SmartRecruiters, iCIMS, Glassdoor→Indeed). Injecting into
   * the top frame only means the extension never sees those forms, so every
   * injection runs in all frames and the best frame result wins.
   */
  const INJECT_TARGET = { allFrames: true };

  let loopActive = false;
  let delayTimer = null;
  let currentJobId = null;
  let pausedTabId = null;
  let resumeTabId = null;
  /** Oldest-first list of submitted job tabs kept for context: { tabId, jobId, at } */
  let submittedTabs = [];

  /**
   * Rank per-frame fill results and return the frame that actually did the work.
   *
   * Only one frame holds the application form; the rest report that they had
   * nothing to do. Higher score wins, and diagnostics from every frame are
   * attached so a failure shows what each frame saw.
   */
  function pickBestFrameResult(injectionResults) {
    const entries = (injectionResults || [])
      .map(function (entry) {
        return {
          frameId: entry && entry.frameId,
          result: entry && entry.result
        };
      })
      .filter(function (entry) {
        return entry.result;
      });

    if (!entries.length) return null;

    function score(r) {
      if (!r) return -1;
      if (r.frameSkipped) return 0;
      let s = 1;
      if (r.total > 0) s += 5;
      if (r.needsHuman) s += 40;
      if (r.submitted) s += 60;
      if (r.filled > 0) s += 100 + Math.min(r.filled, 50);
      if (r.clickedApplyStart || r.reDetect) s += 20;
      if (r.ok === false && !r.total) s -= 1;
      return s;
    }

    let best = entries[0];
    let bestScore = score(entries[0].result);
    for (let i = 1; i < entries.length; i++) {
      const s = score(entries[i].result);
      if (s > bestScore) {
        bestScore = s;
        best = entries[i];
      }
    }

    const winner = Object.assign({}, best.result, { frameId: best.frameId });
    if (entries.length > 1) {
      winner.frames = entries.map(function (entry) {
        return {
          frameId: entry.frameId,
          filled: entry.result.filled || 0,
          total: entry.result.total || 0,
          skipped: !!entry.result.frameSkipped,
          error: entry.result.error || null
        };
      });
    }
    return winner;
  }

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

  /** Frame/tab invalidated after Easy Apply Continue / navigation. */
  function isFrameInvalidError(err) {
    if (global.FillApplyEasyApplySteps && global.FillApplyEasyApplySteps.isFrameInvalidError) {
      return global.FillApplyEasyApplySteps.isFrameInvalidError(err);
    }
    var msg = String((err && err.message) || err || '');
    return (
      /Frame with ID\s+\d+\s+was removed/i.test(msg) ||
      /No tab with id/i.test(msg) ||
      /No frame with id/i.test(msg) ||
      /The tab was closed/i.test(msg) ||
      /Cannot access contents of (the page|url)/i.test(msg) ||
      /Frame does not exist/i.test(msg)
    );
  }

  /**
   * After navigation, tab id may still be valid but frame 0 was removed.
   * Prefer existing tabId; else find a tab matching the job URL host.
   */
  async function resolveFreshTabId(job, preferredTabId) {
    if (preferredTabId != null) {
      try {
        const t = await chrome.tabs.get(preferredTabId);
        if (t && t.id != null) return t.id;
      } catch (_e) {
        /* fall through */
      }
    }
    if (!job || !job.url) return preferredTabId;
    let host = '';
    try {
      host = new URL(job.url).hostname;
    } catch (_u) {
      host = '';
    }
    try {
      const tabs = await chrome.tabs.query({});
      for (let i = 0; i < tabs.length; i++) {
        const t = tabs[i];
        if (!t || t.id == null || !t.url) continue;
        try {
          const th = new URL(t.url).hostname;
          if (
            (host && (th === host || th.endsWith('.' + host.replace(/^www\./, '')))) ||
            /glassdoor\.com|indeed\.com/i.test(th)
          ) {
            if (job.url && (t.url === job.url || t.url.indexOf(host) !== -1)) return t.id;
          }
        } catch (_e2) {
          /* ignore */
        }
      }
      // Second pass: any glassdoor/indeed tab from this session
      for (let j = 0; j < tabs.length; j++) {
        const t2 = tabs[j];
        if (t2 && t2.url && /glassdoor\.com|indeed\.com/i.test(t2.url)) return t2.id;
      }
    } catch (_q) {
      /* ignore */
    }
    return preferredTabId;
  }

  async function waitPageSettle(tabId, settleMin, settleMax) {
    settleMin = settleMin != null ? settleMin : 800;
    settleMax = settleMax != null ? settleMax : 1500;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: function (minMs, maxMs) {
          return new Promise(function (resolve) {
            var done = false;
            function finish() {
              if (done) return;
              done = true;
              var span = Math.max(0, maxMs - minMs);
              var ms = minMs + Math.floor(Math.random() * (span + 1));
              setTimeout(resolve, ms);
            }
            try {
              if (document.readyState === 'complete') finish();
              else {
                window.addEventListener('load', finish, { once: true });
                document.addEventListener('readystatechange', function onRs() {
                  if (document.readyState === 'complete') {
                    document.removeEventListener('readystatechange', onRs);
                    finish();
                  }
                });
              }
            } catch (_e) {
              finish();
            }
            setTimeout(finish, 12000);
          });
        },
        args: [settleMin, settleMax]
      });
    } catch (_e) {
      await sleep(settleMin + Math.floor(Math.random() * Math.max(0, settleMax - settleMin)));
    }
  }

  async function setMissingFieldsPauseState(payload) {
    const S = global.FillApplyStorage;
    const state = Object.assign(
      {
        jobId: null,
        tabId: null,
        missingProfileFields: [],
        message: '',
        at: Date.now(),
        mode: 'batch'
      },
      payload || {}
    );
    try {
      if (S.setPauseState) await S.setPauseState(state);
      else await chrome.storage.local.set({ 'fillApply.pauseState': state });
    } catch (_e) {}
    try {
      chrome.runtime.sendMessage({ type: 'FILL_APPLY_MISSING_FIELDS', data: state });
    } catch (_e2) {}
    try {
      if (state.tabId != null && chrome.sidePanel && chrome.sidePanel.open) {
        const tab = await chrome.tabs.get(state.tabId);
        if (tab && tab.windowId != null) await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    } catch (_e3) {}
    return state;
  }

  async function clearMissingFieldsPauseState() {
    const S = global.FillApplyStorage;
    try {
      if (S.clearPauseState) await S.clearPauseState();
      else await chrome.storage.local.set({ 'fillApply.pauseState': null });
    } catch (_e) {}
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
        'Cannot open chrome-extension:// or about: pages in the runner. Add https job apply URLs in App Settings (Application queue).'
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

  function jobHost(job) {
    try {
      return job && job.url ? new URL(job.url).host : '';
    } catch (_e) {
      return '';
    }
  }

  function notifyActionNeeded(job, detail) {
    if (!chrome.notifications || !chrome.notifications.create) return;
    const host = jobHost(job);
    const title = (job && job.title) || 'Job';
    const message =
      (title.length > 60 ? title.slice(0, 57) + '…' : title) +
      (host ? ' · ' + host : '') +
      (detail ? ' — ' + String(detail).slice(0, 100) : '');
    try {
      chrome.notifications.create('fill-apply-human-' + Date.now(), {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'Fill & Apply — action needed',
        message: message,
        priority: 2,
        requireInteraction: true
      });
    } catch (_e2) {
      /* notifications may be unavailable */
    }
  }

  /**
   * High-alert pause when a required profile field is empty / unknown.
   * Never invent — user fills Options or the page, then Resume.
   */
  function notifyMissingProfileField(job, fieldLabels) {
    if (!chrome.notifications || !chrome.notifications.create) return;
    const host = jobHost(job);
    const title = (job && job.title) || 'Job';
    const fields = (Array.isArray(fieldLabels) ? fieldLabels : [fieldLabels])
      .filter(Boolean)
      .map(function (f) {
        return String(f).trim();
      })
      .filter(Boolean);
    const fieldText = fields.length ? fields.join(', ') : 'required field';
    const message =
      (title.length > 40 ? title.slice(0, 37) + '…' : title) +
      (host ? ' · ' + host : '') +
      ' — ' +
      fieldText +
      ' — open Fill & Apply side panel to enter values, then Save & continue';
    try {
      chrome.notifications.create('fill-apply-missing-profile-' + Date.now(), {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'Fill & Apply — profile field needed',
        message: message.slice(0, 250),
        priority: 2,
        requireInteraction: true
      });
    } catch (_e2) {
      /* notifications may be unavailable */
    }
  }

  function looksLikeMissingProfile(msg, fields) {
    if (fields && fields.length) return true;
    var s = String(msg || '').toLowerCase();
    if (!s) return false;
    return (
      /missing profile|profile field needed|unanswered required|empty (profile|answer)|blank (profile|field)|unmapped|map it in customanswers|fill in options/.test(
        s
      ) && !/cloudflare|captcha|hcaptcha|challenge|verify you are human/.test(s)
    );
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
        files: ['lib/auth-walls.js', 'lib/challenges.js']
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

    var missingFields =
      (pauseInfo && pauseInfo.missingProfileFields) ||
      (extra && extra.missingProfileFields) ||
      null;
    if (looksLikeMissingProfile(pauseInfo.message, missingFields)) {
      notifyMissingProfileField(job, missingFields || [pauseInfo.message]);
      await setMissingFieldsPauseState({
        jobId: job && job.id,
        tabId: tabId,
        missingProfileFields: missingFields || [],
        message: pauseInfo.message,
        at: Date.now(),
        mode: 'batch',
        reason: 'missing_profile_field'
      });
    } else {
      notifyActionNeeded(job, pauseInfo.message);
    }
    currentJobId = null;
    return getStatusSnapshot();
  }

  async function injectAndFillOnce(tabId, profile, documents, runMode, config) {
    await focusTab(tabId);
    await waitPageSettle(tabId, 800, 1500);
    if (config) {
      const amin = config.actionDelayMinMs != null ? config.actionDelayMinMs : 400;
      const amax = config.actionDelayMaxMs != null ? config.actionDelayMaxMs : 900;
      const lo = Math.min(amin, amax);
      const hi = Math.max(amin, amax);
      await sleep(lo + Math.floor(Math.random() * Math.max(0, hi - lo + 1)));
    } else {
      await sleep(150 + Math.floor(Math.random() * 200));
    }

    await chrome.scripting.executeScript({
      target: Object.assign({ tabId: tabId }, INJECT_TARGET),
      files: INJECT_FILES
    });

    const preferIndeedApply =
      config && typeof config.preferIndeedApply === 'boolean' ? config.preferIndeedApply : true;
    const focusHud = !(config && config.focusHud === false);
    const paceCfg = {
      actionDelayMinMs: config && config.actionDelayMinMs != null ? config.actionDelayMinMs : 400,
      actionDelayMaxMs: config && config.actionDelayMaxMs != null ? config.actionDelayMaxMs : 900
    };

    const results = await chrome.scripting.executeScript({
      target: Object.assign({ tabId: tabId }, INJECT_TARGET),
      func: async function (profileArg, documentsArg, runModeArg, preferIndeedApplyArg, focusHudArg, paceArg) {
        // Sub-frames are mostly ads, trackers and social widgets. Only engage a
        // sub-frame that actually contains an application form or an Apply CTA.
        const isSubFrame = (function () {
          try {
            return window.top !== window.self;
          } catch (_e) {
            return true;
          }
        })();
        if (isSubFrame) {
          const syn = globalThis.FillApplySynonyms;
          const hasForm = syn && syn.isApplicationFormOpen && syn.isApplicationFormOpen(document);
          const hasCta =
            syn && syn.findApplyStartButtons && syn.findApplyStartButtons(document).length > 0;
          if (!hasForm && !hasCta) {
            return { ok: true, frameSkipped: true, filled: 0, unmatched: 0, total: 0 };
          }
        }

        if (globalThis.FillApplyFocusHud && globalThis.FillApplyFocusHud.setEnabled) {
          globalThis.FillApplyFocusHud.setEnabled(focusHudArg !== false);
        }
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
          var out = adapter.fill({
            profile: profileArg,
            documents: documentsArg,
            runMode: runModeArg || 'fill',
            autoSubmit: runModeArg === 'submit',
            preferIndeedApply: preferIndeedApplyArg !== false,
            options: {
              highlightUnmatched: false,
              runMode: runModeArg || 'fill',
              preferIndeedApply: preferIndeedApplyArg !== false,
              pace: paceArg || null
            },
            config: {
              preferIndeedApply: preferIndeedApplyArg !== false,
              focusHud: focusHudArg !== false,
              actionDelayMinMs: paceArg && paceArg.actionDelayMinMs,
              actionDelayMaxMs: paceArg && paceArg.actionDelayMaxMs
            },
            adapterId: adapter.id,
            submitSelector: adapter.submitSelector,
            fileInputHints: adapter.fileInputHints,
            fieldMaps: adapter.fieldMaps
          });
          if (out && typeof out.then === 'function') out = await out;

          // A site-specific adapter that matched nothing has usually drifted
          // from the layout it was written against. The generic engine knows
          // how to read the page as it is now, so let it try before giving up.
          const adapterFoundNothing =
            out &&
            adapter.id !== 'fallback' &&
            !(out.filled > 0) &&
            !out.submitted &&
            !out.needsHuman &&
            !out.clickedApplyStart &&
            !out.reDetect &&
            !out.handedOff &&
            !out.externalApply;

          if (adapterFoundNothing && globalThis.__fillApply) {
            try {
              const generic = await globalThis.__fillApply.run(profileArg, {
                highlightUnmatched: false,
                runMode: runModeArg || 'fill'
              });
              if (generic && generic.filled > 0) {
                generic.adapterId = adapter.id;
                generic.usedGenericFallback = true;
                generic.adapterMessage = out.error || out.message || null;
                return generic;
              }
            } catch (genericErr) {
              out.genericFallbackError = String(
                (genericErr && genericErr.message) || genericErr
              );
            }
          }

          return out;
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
      args: [profile, documents, runMode || 'fill', preferIndeedApply, focusHud, paceCfg]
    });

    return (
      pickBestFrameResult(results) || {
        ok: false,
        error: 'No result from inject',
        filled: 0,
        unmatched: 0,
        total: 0
      }
    );
  }

  /**
   * injectAndFill with frame-churn retries (Easy Apply Continue navigations).
   * Does not mark failed solely for "Frame with ID … removed" / "No tab with id".
   * Returns { result, tabId } when opts.returnTabId; else result (compat).
   */
  async function injectAndFill(tabId, profile, documents, runMode, config, job, opts) {
    opts = opts || {};
    const maxAttempts = opts.maxAttempts != null ? opts.maxAttempts : 4;
    let currentTabId = tabId;
    let lastErr = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await injectAndFillOnce(
          currentTabId,
          profile,
          documents,
          runMode,
          config
        );
        if (opts.returnTabId) return { result: result, tabId: currentTabId };
        return result;
      } catch (e) {
        lastErr = e;
        if (!isFrameInvalidError(e) || attempt >= maxAttempts - 1) {
          throw e;
        }
        await sleep(600 + attempt * 400 + Math.floor(Math.random() * 300));
        const fresh = await resolveFreshTabId(job || null, currentTabId);
        if (fresh != null) currentTabId = fresh;
        try {
          await waitTabComplete(currentTabId, 20000);
        } catch (_w) {
          /* continue retry */
        }
        await sleep(400 + Math.floor(Math.random() * 300));
        try {
          await chrome.scripting.executeScript({
            target: Object.assign({ tabId: currentTabId }, INJECT_TARGET),
            files: INJECT_FILES
          });
        } catch (_reinj) {
          /* next attempt */
        }
      }
    }
    throw lastErr || new Error('injectAndFill failed after frame retries');
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
    await clearMissingFieldsPauseState();
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
        let profile = null;
        let documents = null;
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

          profile = P ? await P.getProfile() : await B.getProfile();
          if (global.FillApplySourceProfiles && global.FillApplySourceProfiles.getEffectiveProfile) {
            try {
              profile = await global.FillApplySourceProfiles.getEffectiveProfile(profile);
            } catch (_mergeErr) {
              /* keep base */
            }
          }
          documents = await B.getDocuments();
          // Best-effort Drive/direct URL → blob before attach (CORS may still fail → needsHuman)
          try {
            if (
              global.FillApplyFiles &&
              typeof global.FillApplyFiles.resolveDocumentLinks === 'function'
            ) {
              const resolved = await global.FillApplyFiles.resolveDocumentLinks(documents, profile);
              documents = resolved.documents || documents;
              if (resolved.needsManual && resolved.errors && resolved.errors.length) {
                await pauseForHuman(job, tab.id, 'documents', {
                  message: resolved.errors[0] || 'Open Drive link or upload file manually'
                });
                return getStatusSnapshot();
              }
            }
          } catch (_docLinkErr) { /* continue with whatever blobs we have */ }

          let preHandoffUrl = '';
          try {
            const preTab = await chrome.tabs.get(tab.id);
            preHandoffUrl = (preTab && preTab.url) || '';
          } catch (_ePre) {}

          {
            const packed = await injectAndFill(
              tab.id,
              profile,
              documents,
              runMode,
              config,
              job,
              { returnTabId: true, maxAttempts: 4 }
            );
            fillResult = packed.result;
            if (packed.tabId != null) tab.id = packed.tabId;
          }

          // External Apply handoff OR universal Apply-start (same-host modal / form open):
          // wait for load/overlay, then re-detect / fill. Host-change required for pure
          // externalApply; clickedApplyStart / reDetect re-runs even on same host (once).
          if (
            fillResult &&
            fillResult.ok !== false &&
            (fillResult.deferToPageAdapter ||
              fillResult.handedOff ||
              fillResult.externalApply ||
              fillResult.clickedApplyStart ||
              fillResult.reDetect) &&
            !(fillResult.filled > 0) &&
            !fillResult.submitted &&
            !fillResult.needsHuman
          ) {
            try {
              await sleep(700 + Math.floor(Math.random() * 500));
              await waitTabComplete(tab.id, 45000);
              await sleep(500 + Math.floor(Math.random() * 400));
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
              const sameHostOpen =
                !!(fillResult.clickedApplyStart || fillResult.reDetect);
              if (hostChanged || sameHostOpen) {
                const handedPack = await injectAndFill(
                  tab.id,
                  profile,
                  documents,
                  runMode,
                  config,
                  job,
                  { returnTabId: true, maxAttempts: 4 }
                );
                const handed = handedPack && handedPack.result;
                if (handedPack && handedPack.tabId != null) tab.id = handedPack.tabId;
                if (handed) {
                  if (hostChanged) handed.externalApply = true;
                  if (fillResult.clickedApplyStart) handed.fromApplyStart = true;
                  handed.fromBoardHandoff = (fillResult && fillResult.adapterId) || true;
                  if (!handed.message && fillResult && fillResult.message) {
                    handed.message = fillResult.message;
                  }
                  // Slow same-host modals (Teamtailor): one extra wait + fill before giving up
                  if (
                    handed.clickedApplyStart &&
                    fillResult.clickedApplyStart &&
                    !(handed.filled > 0) &&
                    !handed.needsHuman
                  ) {
                    try {
                      await sleep(900 + Math.floor(Math.random() * 500));
                      const handed2Pack = await injectAndFill(
                        tab.id,
                        profile,
                        documents,
                        runMode,
                        config,
                        job,
                        { returnTabId: true, maxAttempts: 3 }
                      );
                      const handed2 = handed2Pack && handed2Pack.result;
                      if (handed2Pack && handed2Pack.tabId != null) tab.id = handed2Pack.tabId;
                      if (handed2 && (handed2.filled > 0 || handed2.needsHuman || handed2.submitted)) {
                        fillResult = handed2;
                        if (hostChanged) fillResult.externalApply = true;
                        fillResult.fromApplyStart = true;
                        fillResult.fromBoardHandoff =
                          (fillResult && fillResult.adapterId) ||
                          (fillResult && fillResult.fromBoardHandoff) ||
                          true;
                      } else if (handed2 && !(handed2.clickedApplyStart && !(handed2.filled > 0))) {
                        fillResult = handed2;
                      } else {
                        handed.ok = true;
                        handed.clickedApplyStart = false;
                        handed.reDetect = false;
                        handed.message =
                          (handed.message || fillResult.message || 'Apply clicked') +
                          ' — form still not open; open Apply manually or check page';
                        fillResult = handed;
                      }
                    } catch (_eExtra) {
                      handed.ok = true;
                      handed.clickedApplyStart = false;
                      handed.reDetect = false;
                      handed.message =
                        (handed.message || fillResult.message || 'Apply clicked') +
                        ' — form still not open; open Apply manually or check page';
                      fillResult = handed;
                    }
                  } else {
                    fillResult = handed;
                  }
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

          // Indeed "could not advance" without needsHuman — promote to pause
          if (
            fillResult &&
            !fillResult.needsHuman &&
            fillResult.error &&
            /could not advance step/i.test(String(fillResult.error))
          ) {
            fillResult.needsHuman = true;
            fillResult.pauseReason = fillResult.pauseReason || 'could_not_advance';
          }

          // Adapter asked for human (structure drift / challenge mid-flow)
          if (fillResult && fillResult.needsHuman) {
            const missingFields = Array.isArray(fillResult.missingProfileFields)
              ? fillResult.missingProfileFields
              : null;
            const isMissingProfile =
              fillResult.pauseReason === 'missing_profile_field' ||
              looksLikeMissingProfile(fillResult.error, missingFields);
            const msg = isMissingProfile
              ? fillResult.error ||
                'Missing profile field — fill in App Settings or on the page, then Resume'
              : fillResult.pauseReason === 'structure_drift'
                ? fillResult.error || 'Form changed — review required'
                : fillResult.error || 'Paused — verify Cloudflare/CAPTCHA';
            await pauseForHuman(
              job,
              tab.id,
              isMissingProfile
                ? 'missing_profile_field'
                : fillResult.pauseReason || 'challenge',
              {
                message: msg,
                challenge: fillResult.challenge || null,
                driftLabel: fillResult.driftLabel || null,
                missingProfileFields: missingFields
              }
            );
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
          // Frame churn after Continue (Glassdoor/Indeed Easy Apply) — retry, do not markFailed
          if (isFrameInvalidError(e) && job && !moved) {
            await S.appendSessionLog({
              type: 'frame_retry',
              jobId: job.id,
              error: msg,
              note: 'Frame/tab invalidated after navigation — re-inject and continue'
            });
            await S.setQueueStatus({ lastError: null });
            try {
              await sleep(800 + Math.floor(Math.random() * 500));
              const freshId = await resolveFreshTabId(job, tab && tab.id);
              if (freshId != null) {
                try {
                  tab = await chrome.tabs.get(freshId);
                } catch (_gt) {
                  tab = { id: freshId };
                }
              }
              const packedRetry = await injectAndFill(
                tab && tab.id,
                profile,
                documents,
                runMode,
                config,
                job,
                { returnTabId: true, maxAttempts: 3 }
              );
              fillResult = packedRetry.result;
              if (packedRetry.tabId != null && tab) tab.id = packedRetry.tabId;

              if (fillResult && fillResult.needsHuman) {
                await pauseForHuman(job, tab && tab.id, fillResult.pauseReason || 'challenge', {
                  message: fillResult.error || 'Paused — verify Cloudflare/CAPTCHA',
                  challenge: fillResult.challenge || null,
                  missingProfileFields: fillResult.missingProfileFields || null
                });
                return getStatusSnapshot();
              }

              const failedRetry = isCriticalFailure(fillResult);
              if (!failedRetry) {
                await B.markApplied(job.id, {
                  fillResult: fillResult,
                  submitted: !!(fillResult && fillResult.submitted),
                  advanced: !!(fillResult && fillResult.advanced),
                  runMode: runMode,
                  resumeAttached: !!(fillResult && fillResult.resumeAttached),
                  url: job.url
                });
                moved = true;
                currentJobId = null;
                tab = null;
              } else {
                await B.markApplied(job.id, {
                  error: (fillResult && fillResult.error) || msg,
                  failed: true,
                  runMode: runMode,
                  url: job.url
                });
                moved = true;
                currentJobId = null;
                tab = null;
              }
            } catch (retryErr) {
              const rmsg = String(retryErr && retryErr.message ? retryErr.message : retryErr);
              await S.appendSessionLog({ type: 'error', jobId: job.id, error: rmsg });
              await S.setQueueStatus({ lastError: rmsg });
              if (!moved) {
                try {
                  // Only hard-fail if retry also failed for a non-frame reason
                  if (!isFrameInvalidError(retryErr)) {
                    await B.markApplied(job.id, {
                      error: rmsg,
                      failed: true,
                      runMode: runMode,
                      url: job.url
                    });
                    moved = true;
                  } else {
                    // Keep queued — pause for human so Ready loop can resume
                    await pauseForHuman(job, tab && tab.id, 'frame_churn', {
                      message:
                        'Paused — page navigated during Easy Apply (frame removed). Confirm the apply form, then Resume.'
                    });
                    return getStatusSnapshot();
                  }
                } catch (_e2) {
                  /* ignore */
                }
              }
              currentJobId = null;
              tab = null;
            }
          } else {
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

    if (global.FillApplySourceProfiles && global.FillApplySourceProfiles.assertSelectedSourceComplete) {
      var gate = await global.FillApplySourceProfiles.assertSelectedSourceComplete();
      if (!gate.ok) {
        await global.FillApplyStorage.appendSessionLog({
          type: 'error',
          error: gate.error,
          code: 'SOURCE_PROFILE_INCOMPLETE',
          sourceId: gate.selectedSourceId
        });
        throw new Error(gate.error || 'Complete selected source profile in App Settings');
      }
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

    // Batch by source: stable sort queued so same source runs consecutively
    try {
      var Bsort = global.FillApplyBackend;
      var SP = global.FillApplySourceProfiles;
      if (Bsort && Bsort.getQueued && Bsort.setQueued && SP && SP.sortJobsBySource) {
        var queued0 = await Bsort.getQueued();
        var sorted = SP.sortJobsBySource(queued0);
        await Bsort.setQueued(sorted);
        var groups = {};
        sorted.forEach(function (j) {
          var sid = String((j && j.sourceId) || SP.detectSourceIdFromUrl(j && j.url) || 'generic');
          groups[sid] = (groups[sid] || 0) + 1;
        });
        Object.keys(groups).forEach(function (sid) {
          global.FillApplyStorage.appendSessionLog({
            type: 'batch_source',
            message: 'batch_source · ' + sid + ' (' + groups[sid] + ' jobs)',
            sourceId: sid,
            count: groups[sid]
          });
        });
        await global.FillApplyStorage.appendSessionLog({
          type: 'info',
          message: 'Batch order: by source'
        });
      }
    } catch (_sortErr) {
      /* non-fatal */
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
    await clearMissingFieldsPauseState();
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
