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

  const TEXT_FIELDS = [
    'firstName', 'lastName', 'fullName', 'email', 'phone', 'location', 'city', 'state',
    'country', 'zip', 'linkedin', 'portfolio', 'website', 'github', 'resumeUrl',
    'resumeSummary', 'workHistory', 'education', 'coverLetter'
  ];

  function setStatus(el, text, kind) {
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
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
    document.getElementById('autoSubmit').checked = !!cfg.autoSubmit;
  }

  btnSaveConfig.addEventListener('click', async function () {
    try {
      const sec = Number(document.getElementById('delaySec').value);
      const next = await FillApplyStorage.saveRunConfig({
        backendBaseUrl: document.getElementById('backendBaseUrl').value.trim(),
        mockMode: document.getElementById('mockMode').checked,
        delayMs: (Number.isFinite(sec) && sec >= 0 ? sec : 3) * 1000,
        autoSubmit: document.getElementById('autoSubmit').checked
      });
      setStatus(configStatus, 'Config saved (delay ' + next.delayMs + 'ms).', 'ok');
    } catch (e) {
      setStatus(configStatus, e.message, 'err');
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

  // CSS for checkbox labels inside options
  FillApplyProfile.getProfile()
    .then(fillForm)
    .catch(function (err) {
      setStatus(statusEl, 'Load failed: ' + err.message, 'err');
      fillForm(FillApplyProfile.DEFAULT_PROFILE);
    });

  loadConfig().catch(function (e) { setStatus(configStatus, e.message, 'err'); });
  refreshDocsMeta().catch(function () {});
})();
