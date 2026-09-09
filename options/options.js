(function () {
  'use strict';

  const form = document.getElementById('profileForm');
  const qaList = document.getElementById('qaList');
  const statusEl = document.getElementById('status');
  const btnAddQA = document.getElementById('btnAddQA');
  const btnSeed = document.getElementById('btnSeed');
  const btnReset = document.getElementById('btnReset');

  const TEXT_FIELDS = [
    'firstName',
    'lastName',
    'fullName',
    'email',
    'phone',
    'location',
    'city',
    'state',
    'country',
    'zip',
    'linkedin',
    'portfolio',
    'website',
    'github',
    'resumeUrl',
    'resumeSummary',
    'workHistory',
    'education',
    'coverLetter'
  ];

  function setStatus(text, kind) {
    statusEl.textContent = text || '';
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
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
    });
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
      .filter(function (qa) {
        return qa.question || qa.answer;
      });
  }

  function fillForm(profile) {
    TEXT_FIELDS.forEach(function (name) {
      const el = form.elements.namedItem(name);
      if (el) el.value = profile[name] || '';
    });
    qaList.innerHTML = '';
    const list = Array.isArray(profile.customQA) ? profile.customQA : [];
    if (!list.length) addQARow('', '');
    else list.forEach(function (qa) {
      addQARow(qa.question, qa.answer);
    });
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
      setStatus('Saved.', 'ok');
    } catch (err) {
      setStatus('Save failed: ' + err.message, 'err');
    }
  });

  btnAddQA.addEventListener('click', function () {
    addQARow('', '');
  });

  btnSeed.addEventListener('click', async function () {
    fillForm(FillApplyProfile.SAMPLE_PROFILE);
    setStatus('Sample loaded into form — click Save to persist.', 'ok');
  });

  btnReset.addEventListener('click', async function () {
    if (!confirm('Clear the saved profile?')) return;
    try {
      await FillApplyProfile.saveProfile(Object.assign({}, FillApplyProfile.DEFAULT_PROFILE));
      fillForm(FillApplyProfile.DEFAULT_PROFILE);
      setStatus('Cleared.', 'ok');
    } catch (err) {
      setStatus(err.message, 'err');
    }
  });

  FillApplyProfile.getProfile()
    .then(fillForm)
    .catch(function (err) {
      setStatus('Load failed: ' + err.message, 'err');
      fillForm(FillApplyProfile.DEFAULT_PROFILE);
    });
})();
