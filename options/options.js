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

  const TEXT_FIELDS = [
    'firstName', 'lastName', 'fullName', 'email', 'phone', 'location', 'city', 'state',
    'country', 'zip', 'linkedin', 'portfolio', 'website', 'github', 'resumeUrl',
    'resumeSummary', 'workHistory', 'education', 'coverLetter',
    'authorizedToWork', 'requiresSponsorship'
  ];

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

  function addQARow(question, answer) {
    const row = document.createElement('div');
    row.className = 'qa-row';
    row.innerHTML =
      '<input class="q" placeholder="Question (matched to labels)" />' +
      '<input class="a" placeholder="Answer" />' +
      '<button type="button" class="icon danger" title="Remove">×</button>';
    row.querySelector('.q').value = question || '';
    row.querySelector('.a').value = answer || '';
    row.querySelector('button').addEventListener('click', function () { row.remove(); });
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
    TEXT_FIELDS.forEach(function (name) {
      const el = form.elements.namedItem(name);
      if (el) el.value = profile[name] || '';
    });
    qaList.innerHTML = '';
    const list = Array.isArray(profile.customQA) ? profile.customQA : [];
    if (!list.length) addQARow('', '');
    else list.forEach(function (qa) { addQARow(qa.question, qa.answer); });
  }

  function readForm() {
    const profile = {};
    TEXT_FIELDS.forEach(function (name) {
      const el = form.elements.namedItem(name);
      profile[name] = el ? el.value.trim() : '';
    });
    profile.customQA = readQA();
    return profile;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    try {
      await FillApplyProfile.saveProfile(readForm());
      setStatus(statusEl, 'Saved.', 'ok');
    } catch (err) {
      setStatus(statusEl, 'Save failed: ' + err.message, 'err');
    }
  });

  btnAddQA.addEventListener('click', function () { addQARow('', ''); });

  btnSeed.addEventListener('click', async function () {
    fillForm(FillApplyProfile.SAMPLE_PROFILE);
    setStatus(statusEl, 'Sample loaded into form — click Save to persist.', 'ok');
  });

  btnReset.addEventListener('click', async function () {
    if (!confirm('Clear the saved profile?')) return;
    try {
      await FillApplyProfile.saveProfile(Object.assign({}, FillApplyProfile.DEFAULT_PROFILE));
      fillForm(FillApplyProfile.DEFAULT_PROFILE);
      setStatus(statusEl, 'Cleared.', 'ok');
    } catch (err) {
      setStatus(statusEl, err.message, 'err');
    }
  });

  async function loadConfig() {
    const cfg = await FillApplyStorage.getRunConfig();
    document.getElementById('backendBaseUrl').value = cfg.backendBaseUrl || '';
    document.getElementById('mockMode').checked = !!cfg.mockMode;
    document.getElementById('delaySec').value = String(Math.round((cfg.delayMs || 0) / 1000));
    const mode = cfg.runMode || (cfg.autoSubmit ? 'submit' : 'fill');
    document.getElementById('runMode').value = mode;
    document.getElementById('autoCloseAppliedTab').checked = cfg.autoCloseAppliedTab !== false;
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
      const next = await FillApplyStorage.saveRunConfig({
        backendBaseUrl: document.getElementById('backendBaseUrl').value.trim(),
        mockMode: document.getElementById('mockMode').checked,
        delayMs: (Number.isFinite(sec) && sec >= 0 ? sec : 3) * 1000,
        runMode: runMode,
        autoSubmit: runMode === 'submit',
        autoCloseAppliedTab: document.getElementById('autoCloseAppliedTab').checked
      });
      setStatus(
        configStatus,
        'Config saved (mode ' +
          next.runMode +
          '; delay ' +
          next.delayMs +
          'ms; auto-close ' +
          (next.autoCloseAppliedTab ? 'ON' : 'OFF') +
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
      const data = await send('FILL_APPLY_CLEAR_HISTORY');
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
    docsMeta.textContent = parts.join(' · ');
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

  FillApplyProfile.getProfile()
    .then(fillForm)
    .catch(function (err) {
      setStatus(statusEl, 'Load failed: ' + err.message, 'err');
      fillForm(FillApplyProfile.DEFAULT_PROFILE);
    });

  loadConfig().catch(function (e) { setStatus(configStatus, e.message, 'err'); });
  loadMockUrls().catch(function (e) { setStatus(mockUrlsStatus, e.message, 'err'); });
  refreshDocsMeta().catch(function () {});
  refreshBucketCounts().catch(function () {});
})();
