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
  const autoSubmitEl = document.getElementById('autoSubmit');
  const runStateEl = document.getElementById('runState');
  const queueStatusEl = document.getElementById('queueStatus');
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

    const qs = data.queueStatus || {};
    const title = qs.lastJobTitle ? ' · ' + qs.lastJobTitle : '';
    queueStatusEl.textContent =
      'Queue remaining: ' +
      (typeof qs.remaining === 'number' ? qs.remaining : '—') +
      title;

    if (qs.lastError) {
      lastErrorEl.hidden = false;
      lastErrorEl.textContent = 'Last error: ' + qs.lastError;
    } else {
      lastErrorEl.hidden = true;
      lastErrorEl.textContent = '';
    }

    if (data.config) {
      delaySecEl.value = String(Math.round((data.config.delayMs || 0) / 1000));
      autoSubmitEl.checked = !!data.config.autoSubmit;
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
    return {
      delayMs: (Number.isFinite(sec) && sec >= 0 ? sec : 3) * 1000,
      autoSubmit: !!autoSubmitEl.checked
    };
  }

  btnOptions.addEventListener('click', function () {
    chrome.runtime.openOptionsPage();
  });

  btnSeed.addEventListener('click', async function () {
    try {
      await FillApplyProfile.seedSampleProfile();
      await refreshSummary();
      setStatus('Sample profile saved.', 'ok');
    } catch (e) {
      setStatus('Failed to seed profile: ' + e.message, 'err');
    }
  });

  btnStart.addEventListener('click', async function () {
    setStatus('Starting…');
    try {
      const data = await send(MSG.START, { config: readConfigPartial(), resetMock: false });
      applyStatus(data);
      setStatus('Runner started (mock queue if enabled).', 'ok');
    } catch (e) {
      setStatus('Start failed: ' + e.message, 'err');
    }
  });

  btnStop.addEventListener('click', async function () {
    setStatus('Stopping…');
    try {
      const data = await send(MSG.STOP);
      applyStatus(data);
      setStatus('Stopped.', 'ok');
    } catch (e) {
      setStatus('Stop failed: ' + e.message, 'err');
    }
  });

  btnResetMock.addEventListener('click', async function () {
    try {
      const data = await send('FILL_APPLY_RESET_MOCK');
      setStatus('Mock queue reset (' + (data.remaining || 0) + ' jobs).', 'ok');
      await refreshStatus();
    } catch (e) {
      setStatus('Reset failed: ' + e.message, 'err');
    }
  });

  delaySecEl.addEventListener('change', async function () {
    try { await send('FILL_APPLY_SAVE_CONFIG', { config: readConfigPartial() }); } catch (_e) {}
  });
  autoSubmitEl.addEventListener('change', async function () {
    try { await send('FILL_APPLY_SAVE_CONFIG', { config: readConfigPartial() }); } catch (_e) {}
  });

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0] : null;
  }

  function isRestrictedUrl(url) {
    if (!url) return true;
    if (/^chrome-extension:\/\//i.test(url)) return false;
    return /^(chrome|edge|about|devtools|view-source):/i.test(url);
  }

  btnFill.addEventListener('click', async function () {
    setStatus('Filling…');
    btnFill.disabled = true;
    try {
      const tab = await getActiveTab();
      if (!tab || tab.id == null) { setStatus('No active tab.', 'err'); return; }
      if (isRestrictedUrl(tab.url)) {
        setStatus('Cannot fill this page (browser UI). Open a form or the demo.', 'warn');
        return;
      }

      const profile = await FillApplyProfile.getProfile();
      if (!(profile.email || profile.fullName || profile.firstName)) {
        setStatus('Profile is empty. Seed sample or open Options first.', 'warn');
        return;
      }

      const documents = await FillApplyStorage.getDocuments();
      const highlightUnmatched = highlightEl.checked;

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
            autoSubmit: false,
            options: opts,
            adapterId: adapter.id,
            submitSelector: adapter.submitSelector,
            fileInputHints: adapter.fileInputHints,
            fieldMaps: adapter.fieldMaps
          });
        },
        args: [profile, documents, { highlightUnmatched: highlightUnmatched }]
      });

      const result = results && results[0] && results[0].result;
      if (!result || !result.ok) {
        setStatus((result && result.error) || 'Fill failed.', 'err');
        return;
      }
      const filesN = result.filesAttached && result.filesAttached.attached
        ? result.filesAttached.attached.length : 0;
      setStatus(
        'Filled ' + result.filled + ' / ' + result.total + ' via ' + (result.adapterId || 'unknown') +
          (filesN ? '; files: ' + filesN : '') +
          (result.unmatched ? ' (' + result.unmatched + ' unmatched)' : '') + '.',
        result.filled ? 'ok' : 'warn'
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
