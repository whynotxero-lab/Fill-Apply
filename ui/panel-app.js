/**
 * Shared panel UI logic for sidepanel/ (and popup/ markup).
 * v1.11 — lean runner console: profile select, Single vs Batch, live log.
 */
(function () {
  'use strict';

  const summaryEl = document.getElementById('summary');
  const statusEl = document.getElementById('status');
  const btnFill = document.getElementById('btnFill');
  const btnOptions = document.getElementById('btnOptions');
  const btnSeed = document.getElementById('btnSeed');
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');
  const btnResetMock = document.getElementById('btnResetMock');
  const highlightEl = document.getElementById('highlightUnmatched');
  const delaySecEl = document.getElementById('delaySec');
  const autoCloseEl = document.getElementById('autoCloseAppliedTab');
  const keepRecentTabsEl = document.getElementById('keepRecentTabs');
  const autoPdfReportEl = document.getElementById('autoPdfReport');
  const capAshbyEl = document.getElementById('capAshby');
  const capIndeedEl = document.getElementById('capIndeed');
  const capGreenhouseEl = document.getElementById('capGreenhouse');
  const capLeverEl = document.getElementById('capLever');
  const capDefaultEl = document.getElementById('capDefault');
  const btnLastReport = document.getElementById('btnLastReport');
  const recentReportsEl = document.getElementById('recentReports');
  const runStateEl = document.getElementById('runState');
  const queueStatusEl = document.getElementById('queueStatus');
  const countQueuedEl = document.getElementById('countQueued');
  const countAppliedEl = document.getElementById('countApplied');
  const countFailedEl = document.getElementById('countFailed');
  const countCancelledEl = document.getElementById('countCancelled');
  const lastJobTitleEl = document.getElementById('lastJobTitle');
  const lastErrorEl = document.getElementById('lastError');
  const pauseBannerEl = document.getElementById('pauseBanner');
  const pauseMessageEl = document.getElementById('pauseMessage');
  const btnResume = document.getElementById('btnResume');
  const profileSelectEl = document.getElementById('profileSelect');
  const emptyQueuePromptEl = document.getElementById('emptyQueuePrompt');
  const btnEmptyYes = document.getElementById('btnEmptyYes');
  const btnEmptyNo = document.getElementById('btnEmptyNo');
  const liveLogEl = document.getElementById('liveLog');

  const RUNNER_MODE_KEY = 'fillApply.ui.runnerMode';

  const MSG = (globalThis.FillApplyTypes && globalThis.FillApplyTypes.MSG) || {
    START: 'FILL_APPLY_START',
    STOP: 'FILL_APPLY_STOP',
    RESUME: 'FILL_APPLY_RESUME',
    STATUS: 'FILL_APPLY_STATUS'
  };

  const INJECT_FILES = [
    'lib/synonyms.js',
    'lib/field-map.js',
    'lib/files.js',
    'lib/auth-walls.js',
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
    'adapters/ats/recruitee.js',
    'adapters/ats/teamtailor.js',
    'adapters/boards/indeed.js',
    'adapters/boards/linkedin.js',
    'adapters/boards/naukrigulf.js',
    'adapters/boards/remoteok.js',
    'adapters/boards/weworkremotely.js',
    'adapters/boards/workingnomads.js',
    'adapters/boards/jooble.js',
    'adapters/boards/swooped.js',
    'adapters/boards/efinancialcareers.js'
  ];

  let lastCounts = { queued: 0, applied: 0, failed: 0, cancelled: 0 };

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }

  function send(type, extra) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(Object.assign({ type: type }, extra || {}), function (res) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!res || res.ok === false) {
          reject(new Error((res && res.error) || 'Request failed'));
          return;
        }
        resolve(res.data !== undefined ? res.data : res);
      });
    });
  }

  function getSelectedRunMode() {
    const el = document.querySelector('input[name="runMode"]:checked');
    return el && el.value ? el.value : 'fill';
  }

  function setSelectedRunMode(mode) {
    const m = mode === 'ready' || mode === 'submit' ? mode : 'fill';
    const el = document.querySelector('input[name="runMode"][value="' + m + '"]');
    if (el) el.checked = true;
  }

  function getRunnerMode() {
    const el = document.querySelector('input[name="runnerMode"]:checked');
    return el && el.value === 'batch' ? 'batch' : 'single';
  }

  function setRunnerMode(mode) {
    const m = mode === 'batch' ? 'batch' : 'single';
    const el = document.querySelector('input[name="runnerMode"][value="' + m + '"]');
    if (el) el.checked = true;
  }

  function persistRunnerMode() {
    const payload = {};
    payload[RUNNER_MODE_KEY] = getRunnerMode();
    chrome.storage.local.set(payload);
  }

  function loadRunnerMode() {
    chrome.storage.local.get([RUNNER_MODE_KEY], function (result) {
      if (result && result[RUNNER_MODE_KEY]) setRunnerMode(result[RUNNER_MODE_KEY]);
    });
  }

  async function refreshProfileSelect() {
    if (!profileSelectEl || !FillApplyProfile.listProfiles) return;
    try {
      const list = await FillApplyProfile.listProfiles();
      const activeId = await FillApplyProfile.getActiveProfileId();
      const keep = profileSelectEl.value;
      profileSelectEl.innerHTML = '';
      list.forEach(function (p) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name + (p.id === activeId ? ' ★' : '');
        profileSelectEl.appendChild(opt);
      });
      if (keep && list.some(function (p) { return p.id === keep; })) {
        profileSelectEl.value = keep;
      } else if (activeId) {
        profileSelectEl.value = activeId;
      }
    } catch (_e) { /* ignore */ }
  }

  async function refreshSummary() {
    const profile = await FillApplyProfile.getProfile();
    // Active profile person only — never prepend chip name (fixes Zahid · Alex · alex bug)
    summaryEl.textContent = FillApplyProfile.profileSummary(profile);
  }

  function hideEmptyPrompt() {
    if (emptyQueuePromptEl) emptyQueuePromptEl.hidden = true;
  }

  function showEmptyPrompt() {
    if (emptyQueuePromptEl) emptyQueuePromptEl.hidden = false;
  }

  function applyStatus(data) {
    if (!data) return;
    const running = !!data.running;
    const paused = !!(data.pausedForHuman || (data.pauseInfo && data.pauseInfo.paused));
    if (runStateEl) {
      if (paused) {
        runStateEl.textContent = 'Paused — verify Cloudflare/CAPTCHA';
        runStateEl.className = 'run-state paused';
      } else {
        runStateEl.textContent = running ? 'Running…' : 'Idle';
        runStateEl.className = 'run-state ' + (running ? 'running' : 'idle');
      }
    }
    if (btnStart) btnStart.disabled = running || paused;
    if (btnStop) btnStop.disabled = !running && !paused;
    if (pauseBannerEl) {
      if (paused) {
        pauseBannerEl.hidden = false;
        if (pauseMessageEl) {
          const info = data.pauseInfo || {};
          pauseMessageEl.textContent =
            info.message ||
            (data.queueStatus && data.queueStatus.lastError) ||
            'Paused — verify Cloudflare/CAPTCHA';
        }
      } else {
        pauseBannerEl.hidden = true;
      }
    }
    if (btnResume) btnResume.disabled = !paused;

    const counts =
      data.counts ||
      (data.queueStatus && data.queueStatus.counts) || {
        queued: data.queueStatus && typeof data.queueStatus.remaining === 'number'
          ? data.queueStatus.remaining
          : 0,
        applied: 0,
        failed: 0,
        cancelled: 0
      };
    lastCounts = counts;
    if (countQueuedEl) countQueuedEl.textContent = String(counts.queued || 0);
    if (countAppliedEl) countAppliedEl.textContent = String(counts.applied || 0);
    if (countFailedEl) countFailedEl.textContent = String(counts.failed || 0);
    if (countCancelledEl) countCancelledEl.textContent = String(counts.cancelled || 0);
    if (lastJobTitleEl) {
      const title =
        data.queueStatus && data.queueStatus.lastJobTitle
          ? data.queueStatus.lastJobTitle
          : '';
      if (title) {
        lastJobTitleEl.hidden = false;
        lastJobTitleEl.textContent = 'Last: ' + title;
      } else {
        lastJobTitleEl.hidden = true;
        lastJobTitleEl.textContent = '';
      }
    }

    if (lastErrorEl) {
      if (data.queueStatus && data.queueStatus.lastError) {
        lastErrorEl.hidden = false;
        lastErrorEl.textContent = 'Last error: ' + data.queueStatus.lastError;
      } else {
        lastErrorEl.hidden = true;
        lastErrorEl.textContent = '';
      }
    }

    if (data.config) {
      if (delaySecEl) delaySecEl.value = String(Math.round((data.config.delayMs || 0) / 1000));
      const mode =
        data.config.runMode ||
        (data.config.autoSubmit ? 'submit' : 'fill');
      setSelectedRunMode(mode);
      if (autoCloseEl) autoCloseEl.checked = data.config.autoCloseAppliedTab !== false;
      if (keepRecentTabsEl) {
        keepRecentTabsEl.value = String(
          data.config.keepRecentTabs != null ? data.config.keepRecentTabs : 5
        );
      }
      if (autoPdfReportEl) {
        autoPdfReportEl.checked = data.config.autoPdfReport !== false;
      }
      const lim = data.config.sourceApplyLimits || {};
      function setCapEl(el, key) {
        if (!el) return;
        const v = lim[key] != null ? lim[key] : 2;
        el.value = String(Math.min(3, Math.max(1, Number(v) || 2)));
      }
      setCapEl(capAshbyEl, 'ashby');
      setCapEl(capIndeedEl, 'indeed');
      setCapEl(capGreenhouseEl, 'greenhouse');
      setCapEl(capLeverEl, 'lever');
      setCapEl(capDefaultEl, 'default');
    }
  }

  async function refreshStatus() {
    try {
      const data = await send(MSG.STATUS);
      applyStatus(data);
    } catch (e) {
      setStatus('Status: ' + e.message, 'err');
    }
  }

  function formatLogEntry(entry) {
    if (!entry) return { ts: '', text: '' };
    var ts = entry.ts ? new Date(entry.ts).toLocaleTimeString() : '';
    var parts = [];
    if (entry.type) parts.push(entry.type);
    if (entry.error) parts.push(entry.error);
    if (entry.message) parts.push(entry.message);
    if (entry.title) parts.push(entry.title);
    if (entry.jobId) parts.push(entry.jobId);
    if (!parts.length) {
      try { parts.push(JSON.stringify(entry)); } catch (_e) { parts.push(String(entry)); }
    }
    return { ts: ts, text: parts.join(' · ') };
  }

  async function refreshLiveLog() {
    if (!liveLogEl || !FillApplyStorage.getSessionLog) return;
    try {
      var log = await FillApplyStorage.getSessionLog();
      var slice = (log || []).slice(-8);
      if (!slice.length) {
        liveLogEl.innerHTML = '<p class="empty">No events yet</p>';
        return;
      }
      liveLogEl.innerHTML = slice
        .map(function (e) {
          var f = formatLogEntry(e);
          return (
            '<p class="log-line"><span class="log-ts">' +
            f.ts +
            '</span>' +
            String(f.text).replace(/</g, '&lt;') +
            '</p>'
          );
        })
        .join('');
      liveLogEl.scrollTop = liveLogEl.scrollHeight;
    } catch (_e) { /* ignore */ }
  }

  function readConfigPartial() {
    const sec = delaySecEl ? Number(delaySecEl.value) : 3;
    const runMode = getSelectedRunMode();
    let keep = keepRecentTabsEl ? Number(keepRecentTabsEl.value) : 5;
    if (!Number.isFinite(keep)) keep = 5;
    keep = Math.min(10, Math.max(3, Math.round(keep)));
    function readCap(el) {
      if (!el) return 2;
      const raw = Number(el.value);
      if (!Number.isFinite(raw)) return 2;
      return Math.min(3, Math.max(1, Math.round(raw)));
    }
    return {
      delayMs: (Number.isFinite(sec) && sec >= 0 ? sec : 3) * 1000,
      runMode: runMode,
      autoSubmit: runMode === 'submit',
      autoCloseAppliedTab: autoCloseEl ? !!autoCloseEl.checked : true,
      keepRecentTabs: keep,
      autoPdfReport: autoPdfReportEl ? !!autoPdfReportEl.checked : true,
      sourceApplyLimits: {
        ashby: readCap(capAshbyEl),
        indeed: readCap(capIndeedEl),
        greenhouse: readCap(capGreenhouseEl),
        lever: readCap(capLeverEl),
        default: readCap(capDefaultEl)
      }
    };
  }

  async function getActiveTab() {
    let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tabs || !tabs.length) {
      tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    }
    return tabs && tabs[0] ? tabs[0] : null;
  }

  function isRestrictedUrl(url) {
    if (!url) return true;
    if (/^chrome-extension:\/\//i.test(url)) return true;
    return /^(chrome|edge|about|devtools|view-source):/i.test(url);
  }

  async function resolveDocsForFill(profile) {
    var documents = await FillApplyStorage.getDocuments();
    if (
      globalThis.FillApplyFiles &&
      typeof globalThis.FillApplyFiles.resolveDocumentLinks === 'function'
    ) {
      var resolved = await globalThis.FillApplyFiles.resolveDocumentLinks(documents, profile);
      if (resolved.needsManual && resolved.errors && resolved.errors.length) {
        setStatus(resolved.errors[0] || 'Open Drive link or upload file manually', 'warn');
      }
      return resolved.documents || documents;
    }
    return documents;
  }

  async function fillCurrentPage() {
    setStatus('Filling…');
    if (btnFill) btnFill.disabled = true;
    if (btnStart) btnStart.disabled = true;
    try {
      const tab = await getActiveTab();
      if (!tab || tab.id == null) {
        setStatus('No active tab.', 'err');
        return;
      }
      if (isRestrictedUrl(tab.url)) {
        setStatus(
          'Cannot fill this page. Open a real https apply form.',
          'warn'
        );
        return;
      }

      const profile = await FillApplyProfile.getProfile();
      if (!(profile.email || profile.fullName || profile.firstName)) {
        setStatus('Profile is empty. Open Options and fill identity first.', 'warn');
        return;
      }

      const documents = await resolveDocsForFill(profile);
      const highlightUnmatched = highlightEl ? highlightEl.checked : false;
      const runMode = getSelectedRunMode();

      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: INJECT_FILES });

      // Resolve Drive links inside the page context too (CORS may differ)
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async function (docsArg, profileArg) {
          if (
            globalThis.FillApplyFiles &&
            typeof globalThis.FillApplyFiles.resolveDocumentLinks === 'function'
          ) {
            return globalThis.FillApplyFiles.resolveDocumentLinks(docsArg, profileArg);
          }
          return { documents: docsArg, needsManual: false, errors: [] };
        },
        args: [documents, profile]
      }).then(async function (results) {
        var r = results && results[0] && results[0].result;
        if (r && r.documents) {
          Object.assign(documents, r.documents);
          if (r.needsManual && r.errors && r.errors.length) {
            setStatus(r.errors[0], 'warn');
          }
        }
      }).catch(function () { /* ignore */ });

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function (profileArg, documentsArg, opts) {
          const registry = globalThis.FillApplyRegistry;
          const adapter = registry ? registry.detect(location.href, document) : null;
          if (!adapter || typeof adapter.fill !== 'function') {
            if (!globalThis.__fillApply) return { ok: false, error: 'Fill helper missing' };
            return globalThis.__fillApply.run(profileArg, opts);
          }
          return adapter.fill({
            profile: profileArg,
            documents: documentsArg,
            runMode: opts.runMode || 'fill',
            autoSubmit: opts.runMode === 'submit',
            options: opts,
            adapterId: adapter.id,
            submitSelector: adapter.submitSelector,
            fileInputHints: adapter.fileInputHints,
            fieldMaps: adapter.fieldMaps
          });
        },
        args: [
          profile,
          documents,
          { highlightUnmatched: highlightUnmatched, runMode: runMode }
        ]
      });

      let result = results && results[0] && results[0].result;

      if (
        result &&
        result.ok !== false &&
        (result.clickedApplyStart || result.reDetect || result.handedOff || result.deferToPageAdapter) &&
        !(result.filled > 0) &&
        !result.submitted &&
        !result.needsHuman
      ) {
        setStatus('Opened Apply — waiting for form…');
        await new Promise(function (r) { setTimeout(r, 900); });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: INJECT_FILES });
        const results2 = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: function (profileArg, documentsArg, opts) {
            const registry = globalThis.FillApplyRegistry;
            const adapter = registry ? registry.detect(location.href, document) : null;
            if (!adapter || typeof adapter.fill !== 'function') {
              if (!globalThis.__fillApply) return { ok: false, error: 'Fill helper missing' };
              return globalThis.__fillApply.run(profileArg, opts);
            }
            return adapter.fill({
              profile: profileArg,
              documents: documentsArg,
              runMode: opts.runMode || 'fill',
              autoSubmit: opts.runMode === 'submit',
              options: opts,
              adapterId: adapter.id,
              submitSelector: adapter.submitSelector,
              fileInputHints: adapter.fileInputHints,
              fieldMaps: adapter.fieldMaps
            });
          },
          args: [
            profile,
            documents,
            { highlightUnmatched: highlightUnmatched, runMode: runMode }
          ]
        });
        const result2 = results2 && results2[0] && results2[0].result;
        if (result2) result = result2;
      }

      if (!result || result.ok === false) {
        setStatus((result && result.error) || 'Fill failed.', 'err');
        return;
      }
      if (result.needsHuman) {
        setStatus(
          result.error ||
            'Paused — missing profile field(s): ' +
              ((result.missingProfileFields || []).join(', ') || 'see Options'),
          'warn'
        );
        return;
      }
      if (result.clickedApplyStart && !(result.filled > 0)) {
        setStatus(
          result.message ||
            'Clicked Apply to open the form — run again if fields are not filled yet.',
          'warn'
        );
        return;
      }
      const filesN =
        result.filesAttached && result.filesAttached.attached
          ? result.filesAttached.attached.length
          : 0;
      const attachBits = [];
      if (result.resumeAttached) attachBits.push('resume');
      if (result.coverAttached) attachBits.push('cover');
      setStatus(
        'Filled ' +
          result.filled +
          ' / ' +
          result.total +
          ' via ' +
          (result.adapterId || 'unknown') +
          (filesN ? '; files: ' + filesN : '') +
          (attachBits.length ? ' (' + attachBits.join('+') + ')' : '') +
          (result.unmatched ? ' (' + result.unmatched + ' unmatched)' : '') +
          '.',
        result.filled || filesN ? 'ok' : 'warn'
      );
      try {
        await FillApplyStorage.appendSessionLog({
          type: 'fill_once',
          mode: runMode,
          filled: result.filled,
          adapterId: result.adapterId
        });
        await refreshLiveLog();
      } catch (_e) { /* ignore */ }
    } catch (e) {
      setStatus('Error: ' + (e && e.message ? e.message : String(e)), 'err');
    } finally {
      if (btnFill) btnFill.disabled = false;
      await refreshStatus();
    }
  }

  if (btnOptions) {
    btnOptions.addEventListener('click', function () {
      chrome.runtime.openOptionsPage();
    });
  }

  if (btnSeed) {
    btnSeed.addEventListener('click', async function () {
      try {
        await FillApplyProfile.seedSampleProfile();
        await refreshSummary();
        setStatus('Sample saved into active profile.', 'ok');
      } catch (e) {
        setStatus('Failed to seed profile: ' + e.message, 'err');
      }
    });
  }

  if (profileSelectEl) {
    profileSelectEl.addEventListener('change', async function () {
      var id = profileSelectEl.value;
      if (!id) return;
      try {
        await FillApplyProfile.setActiveProfile(id);
        await refreshSummary();
        await refreshProfileSelect();
        setStatus('Active profile updated.', 'ok');
      } catch (e) {
        setStatus(e.message, 'err');
      }
    });
  }

  document.querySelectorAll('input[name="runnerMode"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      persistRunnerMode();
      hideEmptyPrompt();
    });
  });

  if (btnStart) {
    btnStart.addEventListener('click', async function () {
      hideEmptyPrompt();
      const runnerMode = getRunnerMode();
      if (runnerMode === 'single') {
        setStatus('Single — filling current page…');
        await fillCurrentPage();
        return;
      }
      // Batch
      const queued = lastCounts.queued || 0;
      let urlsCount = 0;
      try {
        const urls = await FillApplyStorage.getMockQueueUrls();
        urlsCount = (urls || []).length;
      } catch (_e) { /* ignore */ }

      if (!queued && !urlsCount) {
        showEmptyPrompt();
        setStatus('Queue empty.', 'warn');
        return;
      }

      setStatus('Starting batch…');
      try {
        const data = await send(MSG.START, { config: readConfigPartial(), resetMock: false });
        applyStatus(data);
        const mode = getSelectedRunMode();
        setStatus('Batch runner started (' + mode + ').', 'ok');
        await refreshLiveLog();
      } catch (e) {
        // If start fails due to empty queue, offer single-page fill
        if (/Application queue|Mock queue|no url|empty/i.test(String(e.message || ''))) {
          showEmptyPrompt();
        }
        setStatus('Start failed: ' + e.message, 'err');
      }
    });
  }

  if (btnEmptyYes) {
    btnEmptyYes.addEventListener('click', async function () {
      hideEmptyPrompt();
      await fillCurrentPage();
    });
  }

  if (btnEmptyNo) {
    btnEmptyNo.addEventListener('click', function () {
      hideEmptyPrompt();
      chrome.runtime.openOptionsPage();
    });
  }

  if (btnStop) {
    btnStop.addEventListener('click', async function () {
      setStatus('Stopping…');
      try {
        const data = await send(MSG.STOP);
        applyStatus(data);
        setStatus('Stopped — current job cancelled if incomplete; remaining stay queued.', 'ok');
        await refreshLiveLog();
      } catch (e) {
        setStatus('Stop failed: ' + e.message, 'err');
      }
    });
  }

  if (btnResume) {
    btnResume.addEventListener('click', async function () {
      setStatus('Resuming…');
      try {
        const data = await send(MSG.RESUME || 'FILL_APPLY_RESUME');
        applyStatus(data);
        setStatus('Resumed — continuing after human verification.', 'ok');
      } catch (e) {
        setStatus('Resume failed: ' + e.message, 'err');
      }
    });
  }

  if (btnResetMock) {
    btnResetMock.addEventListener('click', async function () {
      try {
        const data = await send('FILL_APPLY_RESET_MOCK');
        if (!data.remaining) {
          setStatus('Queued empty — add https apply URLs in Options (Application queue).', 'warn');
        } else {
          setStatus('Queued rebuilt (' + data.remaining + ' jobs).', 'ok');
        }
        await refreshStatus();
      } catch (e) {
        setStatus('Reset failed: ' + e.message, 'err');
      }
    });
  }

  if (btnFill) {
    btnFill.addEventListener('click', function () {
      fillCurrentPage();
    });
  }

  document.querySelectorAll('input[name="runMode"]').forEach(function (radio) {
    radio.addEventListener('change', async function () {
      try {
        const cfg = readConfigPartial();
        await send('FILL_APPLY_SAVE_CONFIG', { config: cfg });
        setStatus('Application mode: ' + cfg.runMode, 'ok');
      } catch (_e) {}
    });
  });

  async function refreshReports() {
    if (!recentReportsEl && !btnLastReport) return;
    try {
      const data = await send('FILL_APPLY_GET_REPORTS');
      const reports = (data && data.reports) || [];
      if (recentReportsEl) {
        if (!reports.length) {
          recentReportsEl.hidden = true;
          recentReportsEl.innerHTML = '';
        } else {
          recentReportsEl.hidden = false;
          const slice = reports.slice(-5).reverse();
          recentReportsEl.innerHTML = slice
            .map(function (r) {
              const when = r.timestamp ? new Date(r.timestamp).toLocaleString() : '';
              const title = (r.company || r.title || r.jobId || 'Report').slice(0, 42);
              const file = r.filename ? ' · ' + r.filename : '';
              return (
                '<li><strong>' +
                title +
                '</strong><span class="sub"> ' +
                when +
                file +
                '</span></li>'
              );
            })
            .join('');
        }
      }
    } catch (_e) { /* ignore */ }
  }

  if (btnLastReport) {
    btnLastReport.addEventListener('click', async function () {
      try {
        const data = await send('FILL_APPLY_GET_LAST_REPORT');
        const r = data && data.report;
        if (!r) {
          setStatus('No submitted reports yet.', 'warn');
          return;
        }
        await refreshReports();
        setStatus(
          'Last report: ' +
            (r.company || r.title || r.jobId || r.id) +
            (r.filename ? ' → ' + r.filename : ''),
          'ok'
        );
      } catch (e) {
        setStatus('Reports: ' + e.message, 'err');
      }
    });
  }

  loadRunnerMode();
  refreshProfileSelect().catch(function () {});
  refreshSummary().catch(function (e) {
    if (summaryEl) summaryEl.textContent = 'Could not load profile';
    setStatus(String(e.message || e), 'err');
  });
  refreshStatus();
  refreshReports();
  refreshLiveLog();
  setInterval(refreshStatus, 1500);
  setInterval(refreshLiveLog, 2000);
  setInterval(function () {
    refreshProfileSelect().catch(function () {});
    refreshSummary().catch(function () {});
  }, 5000);

  try {
    var man = chrome.runtime.getManifest && chrome.runtime.getManifest();
    if (man && man.version) {
      var tag = document.getElementById('extVersionTag');
      if (tag) tag.textContent = 'v' + man.version;
    }
  } catch (_e) { /* ignore */ }
})();
