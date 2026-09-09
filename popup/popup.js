(function () {
  'use strict';

  const summaryEl = document.getElementById('summary');
  const statusEl = document.getElementById('status');
  const btnFill = document.getElementById('btnFill');
  const btnOptions = document.getElementById('btnOptions');
  const btnSeed = document.getElementById('btnSeed');
  const highlightEl = document.getElementById('highlightUnmatched');

  function setStatus(text, kind) {
    statusEl.textContent = text || '';
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }

  async function refreshSummary() {
    const profile = await FillApplyProfile.getProfile();
    summaryEl.textContent = FillApplyProfile.profileSummary(profile);
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

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0] : null;
  }

  function isRestrictedUrl(url) {
    if (!url) return true;
    return /^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(url);
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
        setStatus('Cannot fill this page (browser UI / restricted URL). Open a normal web page or the demo form.', 'warn');
        return;
      }

      const profile = await FillApplyProfile.getProfile();
      const hasIdentity = profile.email || profile.fullName || profile.firstName;
      if (!hasIdentity) {
        setStatus('Profile is empty. Seed sample or open Options first.', 'warn');
        return;
      }

      const highlightUnmatched = highlightEl.checked;

      // Inject field map + fill helpers into the active tab (activeTab + scripting).
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lib/field-map.js', 'content/fill.js']
      });

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function (profileArg, opts) {
          if (!globalThis.__fillApply || typeof globalThis.__fillApply.run !== 'function') {
            return { ok: false, error: 'Fill helper missing after inject' };
          }
          return globalThis.__fillApply.run(profileArg, opts);
        },
        args: [profile, { highlightUnmatched: highlightUnmatched }]
      });

      const result = results && results[0] && results[0].result;
      if (!result || !result.ok) {
        setStatus((result && result.error) || 'Fill failed.', 'err');
        return;
      }

      setStatus(
        'Filled ' + result.filled + ' / ' + result.total + ' fields' +
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
})();
