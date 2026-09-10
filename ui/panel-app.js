/**
 * Shared panel UI logic for sidepanel/ (and popup/ markup).
 * v1.13 — source profiles gate, batch-by-source, App Settings rename, missing-fields modal.
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
  const sourceGateBannerEl = document.getElementById('sourceGateBanner');
  const sourceGateMessageEl = document.getElementById('sourceGateMessage');
  const btnOpenSourceSettings = document.getElementById('btnOpenSourceSettings');
  const batchOrderChipEl = document.getElementById('batchOrderChip');

  const RUNNER_MODE_KEY = 'fillApply.ui.runnerMode';
  let sourceGateIncomplete = false;
  let sourceGateLabel = '';


  const MSG = (globalThis.FillApplyTypes && globalThis.FillApplyTypes.MSG) || {
    START: 'FILL_APPLY_START',
    STOP: 'FILL_APPLY_STOP',
    RESUME: 'FILL_APPLY_RESUME',
    STATUS: 'FILL_APPLY_STATUS'
  };

  const INJECT_FILES = [
    'lib/synonyms.js',
    'lib/pace.js',
    'lib/field-map.js',
    'lib/files.js',
    'lib/auth-walls.js',
    'lib/challenges.js',
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

  function liveLog(type, message, extra) {
    var entry = Object.assign({ type: type || 'info', message: message || '' }, extra || {});
    if (FillApplyStorage && FillApplyStorage.appendSessionLog) {
      return FillApplyStorage.appendSessionLog(entry).then(function () {
        return refreshLiveLog();
      }).catch(function () {});
    }
    return Promise.resolve();
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
        var lock = p.locked || p.systemProfile || String(p.name || '').toLowerCase() === 'mock';
        opt.textContent =
          (lock ? '🔒 ' : '') + p.name + (p.id === activeId ? ' ★' : '');
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
    if (btnStart) btnStart.disabled = running || paused || sourceGateIncomplete;
    if (batchOrderChipEl) {
      var rm = getRunnerMode();
      batchOrderChipEl.hidden = rm !== 'batch';
    }
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


  const PAUSE_STATE_KEY = 'fillApply.pauseState';
  let missingFieldsContext = null; // { mode, tabId, jobId, fields }

  function getMissingModalEls() {
    return {
      modal: document.getElementById('missingFieldsModal'),
      list: document.getElementById('missingFieldsList'),
      msg: document.getElementById('missingFieldsMessage'),
      save: document.getElementById('btnSaveContinue'),
      cancel: document.getElementById('btnMissingCancel')
    };
  }

  function hideMissingFieldsModal() {
    var els = getMissingModalEls();
    if (els.modal) els.modal.hidden = true;
  }

  function showMissingFieldsModal(payload) {
    payload = payload || {};
    var fields = Array.isArray(payload.missingProfileFields)
      ? payload.missingProfileFields.filter(Boolean)
      : [];
    if (!fields.length && payload.message) fields = [payload.message];
    if (!fields.length) fields = ['(required field)'];
    missingFieldsContext = {
      mode: payload.mode || (getRunnerMode() === 'batch' ? 'batch' : 'single'),
      tabId: payload.tabId != null ? payload.tabId : null,
      jobId: payload.jobId || null,
      fields: fields,
      message: payload.message || ''
    };
    var els = getMissingModalEls();
    if (!els.modal || !els.list) {
      setStatus(
        'Missing profile field(s): ' + fields.join(', ') + ' — open App Settings or reload panel.',
        'warn'
      );
      return;
    }
    if (els.msg) {
      els.msg.textContent =
        payload.message ||
        'Enter values for the fields below. They save into your active profile, then fill continues.';
    }
    els.list.innerHTML = '';
    fields.forEach(function (field, idx) {
      var wrap = document.createElement('div');
      wrap.className = 'mf-field';
      var id = 'mfInput' + idx;
      var long = /cover|summary|history|essay|why|describe|letter/i.test(String(field));
      var label = document.createElement('label');
      label.setAttribute('for', id);
      label.textContent = String(field);
      var input = document.createElement(long ? 'textarea' : 'input');
      if (!long) input.type = 'text';
      input.id = id;
      input.dataset.field = String(field);
      input.placeholder = 'Type value…';
      input.autocomplete = 'off';
      wrap.appendChild(label);
      wrap.appendChild(input);
      els.list.appendChild(wrap);
    });
    els.modal.hidden = false;
    // Focus first input
    var first = els.list.querySelector('input, textarea');
    if (first) {
      try { first.focus(); } catch (_e) {}
    }
    // Scroll modal card into view / highlight pause banner
    if (pauseBannerEl) {
      pauseBannerEl.hidden = false;
      if (pauseMessageEl) {
        pauseMessageEl.textContent =
          payload.message ||
          ('Paused — missing: ' + fields.join(', '));
      }
    }
    setStatus('Paused — enter missing profile fields, then Save & continue.', 'warn');
  }

  async function clearPauseStateStorage() {
    try {
      if (FillApplyStorage && FillApplyStorage.clearPauseState) {
        await FillApplyStorage.clearPauseState();
      } else {
        var o = {};
        o[PAUSE_STATE_KEY] = null;
        await chrome.storage.local.set(o);
      }
    } catch (_e) {}
  }

  async function readPauseStateStorage() {
    try {
      if (FillApplyStorage && FillApplyStorage.getPauseState) {
        return await FillApplyStorage.getPauseState();
      }
      var res = await chrome.storage.local.get([PAUSE_STATE_KEY]);
      return res && res[PAUSE_STATE_KEY] ? res[PAUSE_STATE_KEY] : null;
    } catch (_e) {
      return null;
    }
  }

  async function onSaveMissingContinue() {
    var els = getMissingModalEls();
    if (!els.list || !missingFieldsContext) return;
    var values = {};
    els.list.querySelectorAll('input, textarea').forEach(function (inp) {
      var field = inp.dataset.field || '';
      var val = (inp.value || '').trim();
      if (field && val) values[field] = val;
    });
    var missing = (missingFieldsContext.fields || []).filter(function (f) {
      return !values[f] || !String(values[f]).trim();
    });
    if (missing.length) {
      setStatus('Please fill: ' + missing.join(', '), 'err');
      return;
    }
    if (els.save) els.save.disabled = true;
    try {
      if (!FillApplyProfile || !FillApplyProfile.applyMissingFieldAnswers) {
        // Fallback: merge into profile manually
        var profile = await FillApplyProfile.getProfile();
        Object.keys(values).forEach(function (k) {
          profile.customAnswers = profile.customAnswers || {};
          profile.customAnswers[k] = values[k];
          var qa = Array.isArray(profile.customQA) ? profile.customQA.slice() : [];
          qa.push({ question: k, answer: values[k] });
          profile.customQA = qa;
          if (/nationality/i.test(k)) profile.nationality = values[k];
          if (/notice/i.test(k)) profile.noticePeriod = values[k];
        });
        await FillApplyProfile.saveProfile(profile);
      } else {
        await FillApplyProfile.applyMissingFieldAnswers(values);
      }
      await liveLog('missing_fields_saved', 'Saved ' + Object.keys(values).length + ' field(s) to active profile');
      await clearPauseStateStorage();
      hideMissingFieldsModal();
      setStatus('Saved to profile — continuing…', 'ok');
      var mode = missingFieldsContext.mode;
      missingFieldsContext = null;
      if (mode === 'batch') {
        try {
          const data = await send(MSG.RESUME || 'FILL_APPLY_RESUME');
          applyStatus(data);
          setStatus('Resumed batch after saving profile fields.', 'ok');
        } catch (e) {
          setStatus('Saved, but Resume failed: ' + e.message, 'err');
        }
      } else {
        await fillCurrentPage();
      }
      await refreshSummary();
    } catch (e) {
      setStatus('Save failed: ' + (e && e.message ? e.message : e), 'err');
    } finally {
      if (els.save) els.save.disabled = false;
    }
  }

  function wireMissingFieldsModal() {
    var els = getMissingModalEls();
    if (els.save) els.save.addEventListener('click', function () { onSaveMissingContinue(); });
    if (els.cancel) {
      els.cancel.addEventListener('click', function () {
        hideMissingFieldsModal();
        setStatus('Cancelled — fill fields in App Settings when ready, then Resume / Single again.', 'warn');
      });
    }
    chrome.runtime.onMessage.addListener(function (message) {
      if (!message) return;
      if (message.type === 'FILL_APPLY_MISSING_FIELDS' || message.type === (MSG && MSG.MISSING_FIELDS)) {
        var data = message.data || message.payload || message;
        showMissingFieldsModal(data);
      }
    });
    // Open automatically if pauseState already set
    readPauseStateStorage().then(function (st) {
      if (st && st.missingProfileFields && st.missingProfileFields.length) {
        showMissingFieldsModal(st);
      }
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      var ch = changes[PAUSE_STATE_KEY];
      if (!ch || !ch.newValue) return;
      var st = ch.newValue;
      if (st && st.missingProfileFields && st.missingProfileFields.length) {
        showMissingFieldsModal(st);
      }
    });
  }

  function openAppSettings(hash) {
    try {
      if (hash) {
        chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') + (hash || '') });
      } else {
        chrome.runtime.openOptionsPage();
      }
    } catch (_e) {
      chrome.runtime.openOptionsPage();
    }
  }

  async function refreshSourceGate() {
    sourceGateIncomplete = false;
    sourceGateLabel = '';
    if (!globalThis.FillApplySourceProfiles) {
      if (sourceGateBannerEl) sourceGateBannerEl.hidden = true;
      return;
    }
    try {
      var selected = await FillApplySourceProfiles.getSelectedSourceId();
      if (!selected) {
        if (sourceGateBannerEl) sourceGateBannerEl.hidden = true;
        if (btnStart && runStateEl) {
          var running = /Running/i.test(runStateEl.textContent || '');
          var paused = /Paused/i.test(runStateEl.textContent || '');
          btnStart.disabled = running || paused;
        }
        return;
      }
      var c = await FillApplySourceProfiles.getCompleteness(selected);
      sourceGateLabel = c.label || selected;
      if (!c.complete) {
        sourceGateIncomplete = true;
        if (sourceGateBannerEl) {
          sourceGateBannerEl.hidden = false;
          if (sourceGateMessageEl) {
            sourceGateMessageEl.textContent =
              'Complete [' + sourceGateLabel + '] source profile (' + c.filled + '/' + c.total + ')';
          }
        }
        if (btnStart) btnStart.disabled = true;
      } else {
        if (sourceGateBannerEl) sourceGateBannerEl.hidden = true;
      }
    } catch (_e) {
      if (sourceGateBannerEl) sourceGateBannerEl.hidden = true;
    }
  }

  async function assertSourceGateOrThrow() {
    if (!globalThis.FillApplySourceProfiles) return null;
    var gate = await FillApplySourceProfiles.assertSelectedSourceComplete();
    if (!gate.ok) {
      await refreshSourceGate();
      openAppSettings('#sec-source-profiles');
      throw new Error(gate.error || 'Complete selected source profile in App Settings');
    }
    return gate;
  }

  async function fillCurrentPage() {
    setStatus('Filling…');
    await liveLog('single_start', 'Single — detecting adapter / waiting for page');
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

      await assertSourceGateOrThrow();

      var profile = await FillApplyProfile.getProfile();
      if (!(profile.email || profile.fullName || profile.firstName)) {
        setStatus('Profile is empty. Open App Settings and fill identity first.', 'warn');
        return;
      }
      if (globalThis.FillApplySourceProfiles && FillApplySourceProfiles.getEffectiveProfile) {
        profile = await FillApplySourceProfiles.getEffectiveProfile(profile);
      }
      // Warn if selected source ≠ page host (still allow)
      try {
        var sel = await FillApplySourceProfiles.getSelectedSourceId();
        if (sel && tab.url) {
          var pageSrc = FillApplySourceProfiles.detectSourceIdFromUrl(tab.url);
          if (pageSrc && pageSrc !== 'generic' && pageSrc !== sel) {
            setStatus(
              'Selected source is ' + sel + ' but page looks like ' + pageSrc + ' — continuing.',
              'warn'
            );
            await liveLog('source_mismatch', 'Selected ' + sel + ' vs page ' + pageSrc);
          }
        }
      } catch (_wm) { /* ignore */ }

      const documents = await resolveDocsForFill(profile);
      const highlightUnmatched = highlightEl ? highlightEl.checked : false;
      const runMode = getSelectedRunMode();

      // Wait for document.readyState complete + settle before first click
      setStatus('Waiting for page to settle…');
      await liveLog('waiting_load', 'Waiting document.readyState complete + settle');
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: function () {
            return new Promise(function (resolve) {
              var done = false;
              function finish() {
                if (done) return;
                done = true;
                var ms = 800 + Math.floor(Math.random() * 700);
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
          }
        });
      } catch (_settleErr) {
        await new Promise(function (r) { setTimeout(r, 1000); });
      }

      // Action delay (pace)
      var paceMin = 400;
      var paceMax = 900;
      var focusHud = true;
      try {
        var cfg = await FillApplyStorage.getRunConfig();
        if (cfg) {
          if (cfg.actionDelayMinMs != null) paceMin = cfg.actionDelayMinMs;
          if (cfg.actionDelayMaxMs != null) paceMax = cfg.actionDelayMaxMs;
          focusHud = cfg.focusHud !== false;
        }
      } catch (_cfgErr) {}
      var lo = Math.min(paceMin, paceMax);
      var hi = Math.max(paceMin, paceMax);
      await new Promise(function (r) {
        setTimeout(r, lo + Math.floor(Math.random() * Math.max(0, hi - lo + 1)));
      });

      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: INJECT_FILES });

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

      async function injectFillOnce() {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: async function (profileArg, documentsArg, opts) {
            if (globalThis.FillApplyFocusHud && globalThis.FillApplyFocusHud.setEnabled) {
              globalThis.FillApplyFocusHud.setEnabled(opts.focusHud !== false);
            }
            const registry = globalThis.FillApplyRegistry;
            const adapter = registry ? registry.detect(location.href, document) : null;
            var adapterId = adapter && adapter.id ? adapter.id : 'fallback';
            // Host-preferring detect; never force Indeed on unknown hosts (registry already host-first)
            if (!adapter || typeof adapter.fill !== 'function') {
              if (!globalThis.__fillApply) return { ok: false, error: 'Fill helper missing' };
              return globalThis.__fillApply.run(profileArg, opts);
            }
            var out = adapter.fill({
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
            if (out && typeof out.then === 'function') out = await out;
            if (out && !out.adapterId) out.adapterId = adapterId;
            return out;
          },
          args: [
            profile,
            documents,
            {
              highlightUnmatched: highlightUnmatched,
              runMode: runMode,
              focusHud: focusHud,
              pace: { actionDelayMinMs: paceMin, actionDelayMaxMs: paceMax }
            }
          ]
        });
        let result = results && results[0] && results[0].result;
        if (result && typeof result.then === 'function') result = await result;
        return result;
      }

      await liveLog('detecting', 'Detecting adapter on ' + String(tab.url || '').slice(0, 80));
      let result = await injectFillOnce();
      if (result && result.adapterId) {
        await liveLog('adapter', 'Using adapter: ' + result.adapterId);
      }

      // Apply-start + 2–3 reDetect retries
      for (let attempt = 0; attempt < 3; attempt++) {
        if (
          !(
            result &&
            result.ok !== false &&
            (result.clickedApplyStart ||
              result.reDetect ||
              result.handedOff ||
              result.deferToPageAdapter ||
              result.externalApply) &&
            !(result.filled > 0) &&
            !result.submitted &&
            !result.needsHuman
          )
        ) {
          break;
        }
        var cta = result.applyStartText || result.message || 'Apply';
        setStatus('Clicked Apply — waiting for form… (' + (attempt + 1) + '/3)');
        await liveLog(
          'clicked_apply',
          'Clicked Apply ("' + String(cta).slice(0, 60) + '"); waiting load (' + (attempt + 1) + '/3)'
        );
        await new Promise(function (r) {
          setTimeout(r, 1000 + attempt * 400 + Math.floor(Math.random() * 400));
        });
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: function () {
              return new Promise(function (resolve) {
                var ms = 400 + Math.floor(Math.random() * 500);
                if (document.readyState === 'complete') setTimeout(resolve, ms);
                else {
                  window.addEventListener('load', function () { setTimeout(resolve, ms); }, { once: true });
                  setTimeout(resolve, 5000);
                }
              });
            }
          });
        } catch (_w) {}
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: INJECT_FILES });
        await liveLog('filling', 'Re-detect / fill attempt ' + (attempt + 2));
        const next = await injectFillOnce();
        if (next) result = next;
      }

      if (!result || result.ok === false) {
        setStatus((result && result.error) || 'Fill failed.', 'err');
        await liveLog('error', (result && result.error) || 'Fill failed');
        return;
      }
      if (result.needsHuman) {
        var missing = Array.isArray(result.missingProfileFields)
          ? result.missingProfileFields
          : [];
        var msg =
          result.error ||
          'Paused — missing profile field(s): ' +
            (missing.join(', ') || 'see App Settings');
        await liveLog('missing_fields', msg, { missingProfileFields: missing });
        var pausePayload = {
          jobId: null,
          tabId: tab.id,
          missingProfileFields: missing,
          message: msg,
          at: Date.now(),
          mode: 'single',
          reason: result.pauseReason || 'missing_profile_field'
        };
        try {
          var o = {};
          o[PAUSE_STATE_KEY] = pausePayload;
          await chrome.storage.local.set(o);
        } catch (_ps) {}
        showMissingFieldsModal(pausePayload);
        return;
      }
      if (result.clickedApplyStart && !(result.filled > 0)) {
        setStatus(
          result.message ||
            'Clicked Apply to open the form — run again if fields are not filled yet.',
          'warn'
        );
        await liveLog('apply_open', result.message || 'Apply clicked; form not filled yet');
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
      await liveLog('filling', 'Filled ' + result.filled + '/' + result.total + ' via ' + (result.adapterId || '?'));
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
      await liveLog('error', e && e.message ? e.message : String(e));
    } finally {
      if (btnFill) btnFill.disabled = false;
      await refreshStatus();
    }
  }


  if (btnOptions) {
    btnOptions.addEventListener('click', function () {
      openAppSettings();
    });
  }
  if (btnOpenSourceSettings) {
    btnOpenSourceSettings.addEventListener('click', function () {
      openAppSettings('#sec-source-profiles');
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
      try {
        await assertSourceGateOrThrow();
      } catch (ge) {
        setStatus(String(ge.message || ge), 'err');
        return;
      }
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
        setStatus('Batch runner started (' + mode + ') — order by source.', 'ok');
        await refreshLiveLog();
      } catch (e) {
        if (/SOURCE_PROFILE|source profile|App Settings/i.test(String(e.message || ''))) {
          await refreshSourceGate();
          openAppSettings('#sec-source-profiles');
        }
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
      openAppSettings('#sec-queue');
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
          setStatus('Queued empty — add https apply URLs in App Settings (Application queue).', 'warn');
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
  refreshSourceGate().catch(function () {});
  refreshStatus();
  refreshReports();
  refreshLiveLog();
  setInterval(refreshStatus, 1500);
  setInterval(refreshLiveLog, 2000);
  setInterval(function () {
    refreshProfileSelect().catch(function () {});
    refreshSummary().catch(function () {});
    refreshSourceGate().catch(function () {});
  }, 5000);
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      if (changes['fillApply.selectedSourceId'] || changes['fillApply.sourceProfiles'] || changes['fillApply.profiles']) {
        refreshSourceGate().catch(function () {});
      }
    });
  }

  try {
    var man = chrome.runtime.getManifest && chrome.runtime.getManifest();
    if (man && man.version) {
      var tag = document.getElementById('extVersionTag');
      if (tag) tag.textContent = 'v' + man.version;
    }
  } catch (_e) { /* ignore */ }
})();
