(function () {
  'use strict';

  const form = document.getElementById('profileForm');
  const qaList = document.getElementById('qaList');
  const statusEl = document.getElementById('status');
  const btnAddQA = document.getElementById('btnAddQA');
  const btnSeed = document.getElementById('btnSeed');
  const btnReset = document.getElementById('btnReset');

  const configStatus = document.getElementById('configStatus');
  const docsStatus = document.getElementById('docsStatus');
  const docsMeta = document.getElementById('docsMeta');
  const btnSaveConfig = document.getElementById('btnSaveConfig');
  const btnSaveDocs = document.getElementById('btnSaveDocs');
  const btnClearDocs = document.getElementById('btnClearDocs');
  const btnSaveMockUrls = document.getElementById('btnSaveMockUrls');
  const btnResetMock = document.getElementById('btnResetMock');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const mockUrlsStatus = document.getElementById('mockUrlsStatus');
  const mockUrlsMeta = document.getElementById('mockUrlsMeta');
  const mockQueueUrlsEl = document.getElementById('mockQueueUrls');
  const bucketCountsEl = document.getElementById('bucketCounts');

  const profileSelect = document.getElementById('profileSelect');
  const profileActiveBadge = document.getElementById('profileActiveBadge');
  const profileMgrStatus = document.getElementById('profileMgrStatus');
  const headerActiveProfile = document.getElementById('headerActiveProfile');
  const formActiveProfileHint = document.getElementById('formActiveProfileHint');
  const btnProfileNew = document.getElementById('btnProfileNew');
  const btnProfileRename = document.getElementById('btnProfileRename');
  const btnProfileDuplicate = document.getElementById('btnProfileDuplicate');
  const btnProfileSetActive = document.getElementById('btnProfileSetActive');
  const btnProfileDelete = document.getElementById('btnProfileDelete');

  const TEXT_FIELDS = [
    'firstName', 'lastName', 'fullName', 'email', 'phone', 'phoneCountry',
    'location', 'street', 'city', 'state',
    'country', 'zip', 'postcode', 'linkedin', 'portfolio', 'website', 'github', 'resumeUrl',
    'resumeSummary', 'workHistory', 'education', 'coverLetter',
    'authorizedToWork', 'requiresSponsorship'
  ];

  let dirty = false;
  let suppressDirty = false;
  let profilesCache = [];
  let activeIdCache = null;
  let selectedIdCache = null;

  function setStatus(el, text, kind) {
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
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

  function markDirty() {
    if (suppressDirty) return;
    dirty = true;
  }

  function clearDirty() {
    dirty = false;
  }

  function confirmIfDirty(message) {
    if (!dirty) return true;
    return confirm(message || 'You have unsaved profile changes. Discard them?');
  }

  function addQARow(question, answer) {
    const row = document.createElement('div');
    row.className = 'qa-row';
    row.innerHTML =
      '<input class="q" placeholder="Question (matched to labels)" />' +
      '<input class="a" placeholder="Answer" />' +
      '<button type="button" class="icon danger" title="Remove">×</button>';
    row.querySelector('.q').value = question || '';
    row.querySelector('.a').value = answer || '';
    row.querySelector('button').addEventListener('click', function () {
      row.remove();
      markDirty();
    });
    row.querySelector('.q').addEventListener('input', markDirty);
    row.querySelector('.a').addEventListener('input', markDirty);
    qaList.appendChild(row);
  }

  function readQA() {
    return Array.from(qaList.querySelectorAll('.qa-row'))
      .map(function (row) {
        return {
          question: row.querySelector('.q').value.trim(),
          answer: row.querySelector('.a').value.trim()
        };
      })
      .filter(function (qa) { return qa.question || qa.answer; });
  }

  function fillForm(profile) {
    suppressDirty = true;
    TEXT_FIELDS.forEach(function (name) {
      const el = form.elements.namedItem(name);
      if (el) el.value = profile[name] || '';
    });
    qaList.innerHTML = '';
    const list = Array.isArray(profile.customQA) ? profile.customQA : [];
    if (!list.length) addQARow('', '');
    else list.forEach(function (qa) { addQARow(qa.question, qa.answer); });
    suppressDirty = false;
    clearDirty();
  }

  function readForm() {
    const profile = {};
    TEXT_FIELDS.forEach(function (name) {
      const el = form.elements.namedItem(name);
      profile[name] = el ? el.value.trim() : '';
    });
    profile.customQA = readQA();
    const answers = {};
    profile.customQA.forEach(function (qa) {
      if (qa.question) answers[qa.question] = qa.answer;
    });
    profile.customAnswers = answers;
    if (profile.postcode && !profile.zip) profile.zip = profile.postcode;
    if (profile.zip && !profile.postcode) profile.postcode = profile.zip;
    return profile;
  }

  function selectedProfileId() {
    return profileSelect && profileSelect.value ? profileSelect.value : null;
  }

  function findMeta(id) {
    for (var i = 0; i < profilesCache.length; i++) {
      if (profilesCache[i].id === id) return profilesCache[i];
    }
    return null;
  }

  function updateActiveLabels() {
    var meta = findMeta(activeIdCache);
    var name = meta ? meta.name : '—';
    if (headerActiveProfile) headerActiveProfile.textContent = name;
    if (formActiveProfileHint) {
      formActiveProfileHint.textContent = meta ? '(editing: ' + meta.name + ')' : '';
    }
    var sel = selectedProfileId();
    if (profileActiveBadge) {
      var isActive = !!sel && sel === activeIdCache;
      profileActiveBadge.hidden = !isActive;
    }
  }

  function renderProfileSelect() {
    if (!profileSelect) return;
    var keep = selectedIdCache || activeIdCache;
    profileSelect.innerHTML = '';
    profilesCache.forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + (p.id === activeIdCache ? ' ★' : '');
      profileSelect.appendChild(opt);
    });
    if (keep && findMeta(keep)) {
      profileSelect.value = keep;
      selectedIdCache = keep;
    } else if (activeIdCache) {
      profileSelect.value = activeIdCache;
      selectedIdCache = activeIdCache;
    }
    updateActiveLabels();
  }

  async function refreshProfilesUI(opts) {
    opts = opts || {};
    profilesCache = await FillApplyProfile.listProfiles();
    activeIdCache = await FillApplyProfile.getActiveProfileId();
    if (opts.selectId) selectedIdCache = opts.selectId;
    else if (!selectedIdCache) selectedIdCache = activeIdCache;
    renderProfileSelect();
    if (opts.loadForm !== false) {
      var profile = await FillApplyProfile.getProfile();
      fillForm(profile);
    }
  }

  async function switchToProfile(id, force) {
    if (!id) return;
    if (id === activeIdCache && !force) {
      selectedIdCache = id;
      updateActiveLabels();
      return;
    }
    if (!confirmIfDirty('You have unsaved changes. Discard them and switch profile?')) {
      profileSelect.value = selectedIdCache || activeIdCache;
      return;
    }
    await FillApplyProfile.setActiveProfile(id);
    activeIdCache = id;
    selectedIdCache = id;
    var profile = await FillApplyProfile.getProfile();
    fillForm(profile);
    renderProfileSelect();
    setStatus(profileMgrStatus, 'Active profile: ' + (findMeta(id) || {}).name, 'ok');
  }

  form.addEventListener('input', markDirty);
  form.addEventListener('change', markDirty);

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    try {
      await FillApplyProfile.saveProfile(readForm());
      clearDirty();
      setStatus(statusEl, 'Saved to active profile.', 'ok');
      await refreshProfilesUI({ loadForm: false, selectId: activeIdCache });
    } catch (err) {
      setStatus(statusEl, 'Save failed: ' + err.message, 'err');
    }
  });

  btnAddQA.addEventListener('click', function () {
    addQARow('', '');
    markDirty();
  });

  btnSeed.addEventListener('click', async function () {
    fillForm(FillApplyProfile.SAMPLE_PROFILE);
    markDirty();
    setStatus(statusEl, 'Sample loaded into active form — click Save to persist.', 'ok');
  });

  btnReset.addEventListener('click', async function () {
    if (!confirm('Clear fields on the active profile?')) return;
    try {
      await FillApplyProfile.saveProfile(Object.assign({}, FillApplyProfile.DEFAULT_PROFILE));
      fillForm(FillApplyProfile.DEFAULT_PROFILE);
      setStatus(statusEl, 'Cleared active profile fields.', 'ok');
    } catch (err) {
      setStatus(statusEl, err.message, 'err');
    }
  });

  if (profileSelect) {
    profileSelect.addEventListener('change', async function () {
      var id = selectedProfileId();
      selectedIdCache = id;
      updateActiveLabels();
      try {
        await switchToProfile(id);
      } catch (e) {
        setStatus(profileMgrStatus, e.message, 'err');
      }
    });
  }

  if (btnProfileNew) {
    btnProfileNew.addEventListener('click', async function () {
      if (!confirmIfDirty('You have unsaved changes. Discard them and create a new profile?')) return;
      var name = prompt('New profile name:', 'New profile');
      if (name == null) return;
      name = String(name).trim();
      if (!name) {
        setStatus(profileMgrStatus, 'Name required.', 'err');
        return;
      }
      try {
        var meta = await FillApplyProfile.createProfile(name);
        activeIdCache = meta.id;
        selectedIdCache = meta.id;
        await refreshProfilesUI({ selectId: meta.id });
        setStatus(profileMgrStatus, 'Created and activated "' + meta.name + '".', 'ok');
      } catch (e) {
        setStatus(profileMgrStatus, e.message, 'err');
      }
    });
  }

  if (btnProfileRename) {
    btnProfileRename.addEventListener('click', async function () {
      var id = selectedProfileId();
      var meta = findMeta(id);
      if (!meta) return;
      var name = prompt('Rename profile:', meta.name);
      if (name == null) return;
      name = String(name).trim();
      if (!name) {
        setStatus(profileMgrStatus, 'Name required.', 'err');
        return;
      }
      try {
        await FillApplyProfile.renameProfile(id, name);
        await refreshProfilesUI({ loadForm: false, selectId: id });
        setStatus(profileMgrStatus, 'Renamed to "' + name + '".', 'ok');
      } catch (e) {
        setStatus(profileMgrStatus, e.message, 'err');
      }
    });
  }

  if (btnProfileDuplicate) {
    btnProfileDuplicate.addEventListener('click', async function () {
      if (!confirmIfDirty('You have unsaved changes. Discard them and duplicate?')) return;
      var id = selectedProfileId();
      if (!id) return;
      try {
        var meta = await FillApplyProfile.duplicateProfile(id);
        activeIdCache = meta.id;
        selectedIdCache = meta.id;
        await refreshProfilesUI({ selectId: meta.id });
        setStatus(profileMgrStatus, 'Duplicated as "' + meta.name + '" (now active).', 'ok');
      } catch (e) {
        setStatus(profileMgrStatus, e.message, 'err');
      }
    });
  }

  if (btnProfileSetActive) {
    btnProfileSetActive.addEventListener('click', async function () {
      var id = selectedProfileId();
      try {
        await switchToProfile(id, true);
      } catch (e) {
        setStatus(profileMgrStatus, e.message, 'err');
      }
    });
  }

  if (btnProfileDelete) {
    btnProfileDelete.addEventListener('click', async function () {
      var id = selectedProfileId();
      var meta = findMeta(id);
      if (!meta) return;
      if (profilesCache.length <= 1) {
        setStatus(profileMgrStatus, 'Cannot delete the last profile.', 'err');
        return;
      }
      if (!confirm('Delete profile "' + meta.name + '"? This cannot be undone.')) return;
      try {
        var result = await FillApplyProfile.deleteProfile(id);
        selectedIdCache = result.activeId;
        activeIdCache = result.activeId;
        await refreshProfilesUI({ selectId: result.activeId });
        setStatus(profileMgrStatus, 'Deleted "' + meta.name + '".', 'ok');
      } catch (e) {
        setStatus(profileMgrStatus, e.message, 'err');
      }
    });
  }

  async function loadConfig() {
    const cfg = await FillApplyStorage.getRunConfig();
    document.getElementById('backendBaseUrl').value = cfg.backendBaseUrl || '';
    document.getElementById('mockMode').checked = !!cfg.mockMode;
    document.getElementById('delaySec').value = String(Math.round((cfg.delayMs || 0) / 1000));
    const mode = cfg.runMode || (cfg.autoSubmit ? 'submit' : 'fill');
    document.getElementById('runMode').value = mode;
    document.getElementById('autoCloseAppliedTab').checked = cfg.autoCloseAppliedTab !== false;
    const keepEl = document.getElementById('keepRecentTabs');
    if (keepEl) keepEl.value = String(cfg.keepRecentTabs != null ? cfg.keepRecentTabs : 5);
    const pdfEl = document.getElementById('autoPdfReport');
    if (pdfEl) pdfEl.checked = cfg.autoPdfReport !== false;
    const lim = cfg.sourceApplyLimits || {};
    function setCap(id, key) {
      const el = document.getElementById(id);
      if (!el) return;
      const v = lim[key] != null ? lim[key] : 2;
      el.value = String(Math.min(3, Math.max(1, Number(v) || 2)));
    }
    setCap('capAshby', 'ashby');
    setCap('capIndeed', 'indeed');
    setCap('capGreenhouse', 'greenhouse');
    setCap('capLever', 'lever');
    setCap('capDefault', 'default');
  }

  async function loadMockUrls() {
    const urls = await FillApplyStorage.getMockQueueUrls();
    mockQueueUrlsEl.value = urls.join('\n');
    mockUrlsMeta.textContent = urls.length
      ? urls.length + ' https URL(s) configured — Start serves these into Queued (demo URLs filtered out).'
      : 'No URLs yet — Start will fail until you add https apply links.';
  }

  async function refreshBucketCounts() {
    try {
      const data = await send('FILL_APPLY_GET_BUCKETS');
      const c = data.counts || {};
      bucketCountsEl.textContent =
        'Buckets — Queued: ' +
        (c.queued || 0) +
        ' · Applied: ' +
        (c.applied || 0) +
        ' · Failed: ' +
        (c.failed || 0) +
        ' · Cancelled: ' +
        (c.cancelled || 0);
    } catch (_e) {
      bucketCountsEl.textContent = '';
    }
  }

  btnSaveConfig.addEventListener('click', async function () {
    try {
      const sec = Number(document.getElementById('delaySec').value);
      const runMode = document.getElementById('runMode').value || 'fill';
      const keepRaw = Number(document.getElementById('keepRecentTabs').value);
      const keep = Number.isFinite(keepRaw) ? Math.min(10, Math.max(3, Math.round(keepRaw))) : 5;
      function readCap(id) {
        const raw = Number(document.getElementById(id).value);
        if (!Number.isFinite(raw)) return 2;
        return Math.min(3, Math.max(1, Math.round(raw)));
      }
      const sourceApplyLimits = {
        ashby: readCap('capAshby'),
        indeed: readCap('capIndeed'),
        greenhouse: readCap('capGreenhouse'),
        lever: readCap('capLever'),
        default: readCap('capDefault')
      };
      const next = await FillApplyStorage.saveRunConfig({
        backendBaseUrl: document.getElementById('backendBaseUrl').value.trim(),
        mockMode: document.getElementById('mockMode').checked,
        delayMs: (Number.isFinite(sec) && sec >= 0 ? sec : 3) * 1000,
        runMode: runMode,
        autoSubmit: runMode === 'submit',
        autoCloseAppliedTab: document.getElementById('autoCloseAppliedTab').checked,
        keepRecentTabs: keep,
        autoPdfReport: document.getElementById('autoPdfReport').checked,
        sourceApplyLimits: sourceApplyLimits
      });
      document.getElementById('keepRecentTabs').value = String(next.keepRecentTabs);
      const L = next.sourceApplyLimits || sourceApplyLimits;
      document.getElementById('capAshby').value = String(L.ashby);
      document.getElementById('capIndeed').value = String(L.indeed);
      document.getElementById('capGreenhouse').value = String(L.greenhouse);
      document.getElementById('capLever').value = String(L.lever);
      document.getElementById('capDefault').value = String(L.default);
      setStatus(
        configStatus,
        'Config saved (mode ' +
          next.runMode +
          '; delay ' +
          next.delayMs +
          'ms; auto-close ' +
          (next.autoCloseAppliedTab ? 'ON keep ' + next.keepRecentTabs : 'OFF') +
          '; PDF ' +
          (next.autoPdfReport ? 'ON' : 'OFF') +
          '; caps ashby=' +
          L.ashby +
          ').',
        'ok'
      );
    } catch (e) {
      setStatus(configStatus, e.message, 'err');
    }
  });

  btnSaveMockUrls.addEventListener('click', async function () {
    try {
      const data = await send('FILL_APPLY_SAVE_MOCK_URLS', {
        urlsText: mockQueueUrlsEl.value
      });
      mockQueueUrlsEl.value = (data.urls || []).join('\n');
      mockUrlsMeta.textContent = data.remaining
        ? data.remaining + ' job(s) in queued from saved https URLs.'
        : 'No valid https URLs — Start will show: Add job apply URLs in Options (Mock queue)';
      setStatus(
        mockUrlsStatus,
        data.remaining
          ? 'Saved ' + data.urls.length + ' URL(s); queued rebuilt (chrome-extension filtered).'
          : 'Saved, but queued is empty (need https:// URLs).',
        data.remaining ? 'ok' : 'err'
      );
      await refreshBucketCounts();
    } catch (e) {
      setStatus(mockUrlsStatus, e.message, 'err');
    }
  });

  btnResetMock.addEventListener('click', async function () {
    try {
      const data = await send('FILL_APPLY_RESET_MOCK');
      setStatus(
        mockUrlsStatus,
        data.remaining
          ? 'Queued reset (' + data.remaining + ' jobs). Applied history kept.'
          : 'Queued empty — save https URLs first.',
        data.remaining ? 'ok' : 'err'
      );
      mockUrlsMeta.textContent = data.remaining
        ? data.remaining + ' job(s) ready in queued.'
        : 'No URLs configured.';
      await refreshBucketCounts();
    } catch (e) {
      setStatus(mockUrlsStatus, e.message, 'err');
    }
  });

  btnClearHistory.addEventListener('click', async function () {
    if (!confirm('Clear applied / failed / cancelled history? Queued is unchanged.')) return;
    try {
      await send('FILL_APPLY_CLEAR_HISTORY');
      setStatus(mockUrlsStatus, 'History cleared.', 'ok');
      await refreshBucketCounts();
    } catch (e) {
      setStatus(mockUrlsStatus, e.message, 'err');
    }
  });

  async function refreshDocsMeta() {
    const docs = await FillApplyStorage.getDocuments();
    const parts = [];
    if (docs.resume && docs.resume.name) {
      parts.push('Resume: ' + docs.resume.name + ' (' + ((docs.resume.base64 || '').length) + ' b64 chars)');
    } else parts.push('Resume: none');
    if (docs.cover && docs.cover.name) {
      parts.push('Cover: ' + docs.cover.name + ' (' + ((docs.cover.base64 || '').length) + ' b64 chars)');
    } else parts.push('Cover: none');
    docsMeta.textContent = parts.join(' · ') + ' · Shared across profiles';
  }

  async function readFileAsDoc(fileInput) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return null;
    const base64 = await FillApplyFiles.blobToBase64(file);
    return { name: file.name, mime: file.type || 'application/octet-stream', base64: base64 };
  }

  btnSaveDocs.addEventListener('click', async function () {
    try {
      const patch = {};
      const resume = await readFileAsDoc(document.getElementById('resumeFile'));
      const cover = await readFileAsDoc(document.getElementById('coverFile'));
      if (resume) patch.resume = resume;
      if (cover) patch.cover = cover;
      if (!resume && !cover) {
        setStatus(docsStatus, 'Choose at least one file first.', 'err');
        return;
      }
      await FillApplyStorage.saveDocuments(patch);
      await refreshDocsMeta();
      setStatus(docsStatus, 'Documents saved to storage.', 'ok');
    } catch (e) {
      setStatus(docsStatus, e.message, 'err');
    }
  });

  btnClearDocs.addEventListener('click', async function () {
    if (!confirm('Clear stored resume/cover blobs?')) return;
    await FillApplyStorage.saveDocuments({ resume: null, cover: null });
    document.getElementById('resumeFile').value = '';
    document.getElementById('coverFile').value = '';
    await refreshDocsMeta();
    setStatus(docsStatus, 'Documents cleared.', 'ok');
  });

  refreshProfilesUI()
    .catch(function (err) {
      setStatus(statusEl, 'Load failed: ' + err.message, 'err');
      fillForm(FillApplyProfile.DEFAULT_PROFILE);
    });

  loadConfig().catch(function (e) { setStatus(configStatus, e.message, 'err'); });
  loadMockUrls().catch(function (e) { setStatus(mockUrlsStatus, e.message, 'err'); });
  refreshDocsMeta().catch(function () {});
  refreshBucketCounts().catch(function () {});

  const btnLastReport = document.getElementById('btnLastReport');
  const reportStatus = document.getElementById('reportStatus');
  if (btnLastReport) {
    btnLastReport.addEventListener('click', async function () {
      try {
        const data = await send('FILL_APPLY_GET_LAST_REPORT');
        const r = data && data.report;
        if (!r) {
          setStatus(reportStatus, 'No submitted reports yet.', 'warn');
          return;
        }
        setStatus(
          reportStatus,
          'Last: ' +
            (r.company || r.title || r.jobId || r.id) +
            (r.filename ? ' → Downloads/' + r.filename : '') +
            (r.timestamp ? ' @ ' + new Date(r.timestamp).toLocaleString() : ''),
          'ok'
        );
      } catch (e) {
        setStatus(reportStatus, e.message, 'err');
      }
    });
  }
})();
