/**
 * Shared panel UI logic for sidepanel/ (and popup/ markup).
 * Loaded by sidepanel/sidepanel.html and popup/popup.html.
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
  const runStateEl = document.getElementById('runState');
  const queueStatusEl = document.getElementById('queueStatus');
  const countQueuedEl = document.getElementById('countQueued');
  const countAppliedEl = document.getElementById('countApplied');
  const countFailedEl = document.getElementById('countFailed');
  const countCancelledEl = document.getElementById('countCancelled');
  const lastJobTitleEl = document.getElementById('lastJobTitle');
  const lastErrorEl = document.getElementById('lastError');

  const MSG = (globalThis.FillApplyTypes && globalThis.FillApplyTypes.MSG) || {
    START: 'FILL_APPLY_START',
    STOP: 'FILL_APPLY_STOP',
    STATUS: 'FILL_APPLY_STATUS'
  };

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

  function setStatus(text, kind) {
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

  async function refreshSummary() {
    const profile = await FillApplyProfile.getProfile();
    summaryEl.textContent = FillApplyProfile.profileSummary(profile);
  }

  function applyStatus(data) {
    if (!data) return;
    const running = !!data.running;
    runStateEl.textContent = running ? 'Running…' : 'Idle';
    runStateEl.className = 'run-state ' + (running ? 'running' : 'idle');
    btnStart.disabled = running;
    btnStop.disabled = !running;

    const counts =
      (data.counts) ||
      (data.queueStatus && data.queueStatus.counts) || {
        queued: data.queueStatus && typeof data.queueStatus.remaining === 'number'
          ? data.queueStatus.remaining
          : 0,
        applied: 0,
        failed: 0,
        cancelled: 0
      };
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
    } else if (queueStatusEl && !countQueuedEl) {
      const title =
        data.queueStatus && data.queueStatus.lastJobTitle
          ? ' · ' + data.queueStatus.lastJobTitle
          : '';
      queueStatusEl.textContent =
        'Queued: ' +
        (counts.queued || 0) +
        ' · Applied: ' +
        (counts.applied || 0) +
        ' · Failed: ' +
        (counts.failed || 0) +
        ' · Cancelled: ' +
        (counts.cancelled || 0) +
        title;
    }

    if (data.queueStatus && data.queueStatus.lastError) {
      lastErrorEl.hidden = false;
      lastErrorEl.textContent = 'Last error: ' + data.queueStatus.lastError;
    } else {
      lastErrorEl.hidden = true;
      lastErrorEl.textContent = '';
    }

    if (data.config) {
      delaySecEl.value = String(Math.round((data.config.delayMs || 0) / 1000));
      const mode =
        data.config.runMode ||
        (data.config.autoSubmit ? 'submit' : 'fill');
      setSelectedRunMode(mode);
      autoCloseEl.checked = data.config.autoCloseAppliedTab !== false;
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

  function readConfigPartial() {
    const sec = Number(delaySecEl.value);
    const runMode = getSelectedRunMode();
    return {
      delayMs: (Number.isFinite(sec) && sec >= 0 ? sec : 3) * 1000,
      runMode: runMode,
      autoSubmit: runMode === 'submit',
      autoCloseAppliedTab: !!autoCloseEl.checked
    };
  }

  btnOptions.addEventListener('click', function () {
    chrome.runtime.openOptionsPage();
  });

  btnSeed.addEventListener('click', async function () {
    try {
      await FillApplyProfile.seedSampleProfile();
      await refreshSummary();
      setStatus('Sample profile saved (includes work auth / sponsorship).', 'ok');
    } catch (e) {
      setStatus('Failed to seed profile: ' + e.message, 'err');
    }
  });

  btnStart.addEventListener('click', async function () {
    setStatus('Starting…');
    try {
      const data = await send(MSG.START, { config: readConfigPartial(), resetMock: false });
      applyStatus(data);
      const mode = getSelectedRunMode();
      setStatus(
        'Runner started (' +
          mode +
          ') — opening https URLs from Queued. Demo URLs are never queued.',
        'ok'
      );
    } catch (e) {
      setStatus('Start failed: ' + e.message, 'err');
    }
  });

  btnStop.addEventListener('click', async function () {
    setStatus('Stopping…');
    try {
      const data = await send(MSG.STOP);
      applyStatus(data);
      setStatus('Stopped — current job cancelled if incomplete; remaining stay queued.', 'ok');
    } catch (e) {
      setStatus('Stop failed: ' + e.message, 'err');
    }
  });

  btnResetMock.addEventListener('click', async function () {
    try {
      const data = await send('FILL_APPLY_RESET_MOCK');
      if (!data.remaining) {
        setStatus(
          'Queued empty — add https apply URLs in Options (Mock queue).',
          'warn'
        );
      } else {
        setStatus(
          'Queued rebuilt (' + data.remaining + ' jobs from saved https URLs). Applied history kept.',
          'ok'
        );
      }
      await refreshStatus();
    } catch (e) {
      setStatus('Reset failed: ' + e.message, 'err');
    }
  });

  delaySecEl.addEventListener('change', async function () {
    try {
      await send('FILL_APPLY_SAVE_CONFIG', { config: readConfigPartial() });
    } catch (_e) {}
  });

  document.querySelectorAll('input[name="runMode"]').forEach(function (radio) {
    radio.addEventListener('change', async function () {
      try {
        const cfg = readConfigPartial();
        await send('FILL_APPLY_SAVE_CONFIG', { config: cfg });
        setStatus('Run mode: ' + cfg.runMode, 'ok');
      } catch (_e) {}
    });
  });

  autoCloseEl.addEventListener('change', async function () {
    try {
      await send('FILL_APPLY_SAVE_CONFIG', { config: readConfigPartial() });
      setStatus(
        autoCloseEl.checked
          ? 'Auto-close applied tab: ON'
          : 'Auto-close applied tab: OFF (tabs stay open)',
        'ok'
      );
    } catch (_e) {}
  });

  async function getActiveTab() {
    // Side panel: prefer lastFocusedWindow so we hit the browsing window, not an empty set.
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

  btnFill.addEventListener('click', async function () {
    setStatus('Filling…');
    btnFill.disabled = true;
    try {
      const tab = await getActiveTab();
      if (!tab || tab.id == null) {
        setStatus('No active tab.', 'err');
        return;
      }
      if (isRestrictedUrl(tab.url)) {
        setStatus(
          'Cannot fill this page. Open a real https apply form (demo is manual via Live Server / file://).',
          'warn'
        );
        return;
      }

      const profile = await FillApplyProfile.getProfile();
      if (!(profile.email || profile.fullName || profile.firstName)) {
        setStatus('Profile is empty. Seed sample or open Options first.', 'warn');
        return;
      }

      const documents = await FillApplyStorage.getDocuments();
      const highlightUnmatched = highlightEl.checked;
      const runMode = getSelectedRunMode();

      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: INJECT_FILES });

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

      const result = results && results[0] && results[0].result;
      if (!result || !result.ok) {
        setStatus((result && result.error) || 'Fill failed.', 'err');
        return;
      }
      const filesN =
        result.filesAttached && result.filesAttached.attached
          ? result.filesAttached.attached.length
          : 0;
      const attachBits = [];
      if (result.resumeAttached) attachBits.push('resume');
      if (result.coverAttached) attachBits.push('cover');
      const insp = result.inspection && result.inspection.counts
        ? ' · fields in:' +
          result.inspection.counts.input +
          ' sel:' +
          result.inspection.counts.select +
          ' file:' +
          result.inspection.counts.file
        : '';
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
          insp +
          '.',
        result.filled || filesN ? 'ok' : 'warn'
      );
    } catch (e) {
      setStatus('Error: ' + (e && e.message ? e.message : String(e)), 'err');
    } finally {
      btnFill.disabled = false;
    }
  });

  refreshSummary().catch(function (e) {
    summaryEl.textContent = 'Could not load profile';
    setStatus(String(e.message || e), 'err');
  });
  refreshStatus();
  setInterval(refreshStatus, 1500);
})();
