/**
 * JobPool Applications hub: Apply first Ready card → (after submit/return) Mark as applied.
 * Never Mark before submit; never click Upgrade / AI Auto-Apply.
 *
 * Run: node scripts/smoke-jobpool-hub-apply-mark.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite, ROOT } = require('./test-harness');

const suite = createSuite('smoke-jobpool-hub-apply-mark');

const HUB_LIBS = [
  'lib/dom-deep.js',
  'lib/synonyms.js',
  'adapters/registry.js',
  'adapters/fallback.js',
  'adapters/boards/jobpool.js'
];

function fixtureHtml() {
  return fs
    .readFileSync(path.join(ROOT, 'scripts/fixtures/controls/jobpool-applications-hub.html'), 'utf8')
    .replace(/<script>[\s\S]*?<\/script>/g, '');
}

function wireClicks(doc, win) {
  win.__clicks = [];
  ['apply-1', 'apply-2', 'mark-1', 'mark-2', 'upgrade-1', 'ai-1'].forEach(function (id) {
    const el = doc.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      win.__clicks.push(id);
    });
  });
}

function forceVisible(Syn) {
  Syn.isVisible = function (el) {
    if (!el) return false;
    if (el.hidden) return false;
    try {
      if (el.style && el.style.display === 'none') return false;
    } catch (_e) {}
    return true;
  };
}

(async function main() {
  const html = fixtureHtml();

  // --- A) Detection + synonyms ---
  const synPage = createPage(html, ['lib/dom-deep.js', 'lib/synonyms.js']);
  const Syn0 = synPage.window.FillApplySynonyms;
  forceVisible(Syn0);
  suite.ok(!!Syn0.isJobPoolHubPage, 'isJobPoolHubPage exported');
  suite.ok(
    Syn0.isJobPoolHubPage(synPage.document, 'https://app.example/applications'),
    'detects Intelligent Opportunity Hub by text'
  );
  suite.ok(Syn0.isMarkAppliedCta('Mark as applied'), 'Mark as applied CTA recognized');
  suite.ok(!Syn0.isApplyStartCta('Mark as applied'), 'Mark as applied is NOT Apply-start');
  suite.ok(
    Syn0.looksLikeSubmitSuccessText('Thank you for your application'),
    'thank-you success string'
  );
  suite.ok(
    Syn0.looksLikeSubmitSuccessText('Your application has been submitted'),
    'application submitted success string'
  );
  suite.ok(
    Syn0.looksLikeSubmitSuccessText('We have received your application'),
    'application received success string'
  );
  suite.ok(
    Syn0.looksLikeJobPoolReturnUrl('https://hub.example/applications?from=jobpool'),
    'return URL from=jobpool'
  );
  suite.ok(
    Syn0.looksLikeJobPoolReturnUrl('https://hub.example/apps?returnUrl=%2Fapplications'),
    'returnUrl marker'
  );
  const marks0 = Syn0.findMarkAppliedButtons(synPage.document);
  suite.ok(marks0.length >= 2, 'finds Mark as applied buttons');

  // --- B) Apply clicks first Ready card only ---
  const page = createPage(html, HUB_LIBS);
  const doc = page.document;
  const win = page.window;
  wireClicks(doc, win);
  forceVisible(win.FillApplySynonyms);

  suite.ok(win.FillApplyRegistry.get('jobpool'), 'jobpool adapter registered');
  suite.ok(
    win.FillApplyRegistry.detect('https://unknown.example/applications', doc).id === 'jobpool',
    'registry detects hub by page text (unknown host)'
  );

  const hub = win.FillApplyJobPoolHub;
  const applyBtn = hub.findFirstReadyApply(doc);
  suite.ok(!!applyBtn, 'finds first Ready Apply');
  suite.equal(applyBtn && applyBtn.id, 'apply-1', 'topmost / first Ready Apply is card 1');
  suite.equal(hub.extractJobIdNear(applyBtn, doc), 'jp-101', 'captures Job ID jp-101');

  const startOut = await hub.fill({ runMode: 'submit' });
  suite.ok(startOut && startOut.ok, 'hub Apply fill ok');
  suite.ok(startOut.clickedApplyStart || startOut.jobpoolHubApply, 'flagged hub Apply');
  suite.ok(startOut.externalApply && startOut.handedOff, 'hands off to employer');
  suite.equal(startOut.jobId, 'jp-101', 'pending jobId jp-101');
  suite.ok(win.__clicks.indexOf('apply-1') !== -1, 'Apply on first card clicked');
  suite.ok(win.__clicks.indexOf('mark-1') === -1, 'Mark as applied NOT clicked at start');
  suite.ok(win.__clicks.indexOf('apply-2') === -1, 'second card Apply not clicked');
  suite.ok(win.__clicks.indexOf('upgrade-1') === -1, 'Upgrade never clicked');
  suite.ok(win.__clicks.indexOf('ai-1') === -1, 'AI Auto-Apply never clicked');

  const pending = await hub.getPendingMark();
  suite.ok(pending && pending.jobId === 'jp-101', 'persisted fillApply.jobpoolPendingMark');

  // --- C) Ready/Fill without submit must NOT Mark ---
  win.__clicks = [];
  const readyOut = await hub.fill({ runMode: 'ready' });
  suite.ok(readyOut && readyOut.jobpoolPending, 'ready mode keeps pending without Mark');
  suite.ok(!readyOut.jobpoolMarkedApplied, 'ready mode did not Mark');
  suite.ok(win.__clicks.indexOf('mark-1') === -1, 'no Mark click in ready without submit');

  // --- D) After simulated submit + return → Mark as applied ---
  // Simulate return page chrome still on hub with success banner
  const banner = doc.createElement('div');
  banner.id = 'success-banner';
  banner.textContent = 'Thank you for your application — we have received your application.';
  doc.body.insertBefore(banner, doc.body.firstChild);

  win.__clicks = [];
  const markOut = await hub.fill({
    runMode: 'submit',
    forceJobPoolMark: true,
    submitted: true,
    markAfterSubmit: true
  });
  suite.ok(markOut && markOut.jobpoolMarkedApplied, 'Mark as applied after submit path');
  suite.ok(win.__clicks.indexOf('mark-1') !== -1, 'Mark as applied clicked for jp-101');
  suite.ok(win.__clicks.indexOf('mark-2') === -1, 'did not Mark second card');
  suite.ok(win.__clicks.indexOf('apply-1') === -1, 'did not re-click Apply at end');

  const cleared = await hub.getPendingMark();
  suite.ok(!cleared || !cleared.jobId, 'pending mark cleared');

  // --- E) Never Mark before Apply was taken (fresh page, fill-only success false) ---
  const page2 = createPage(html, HUB_LIBS);
  wireClicks(page2.document, page2.window);
  forceVisible(page2.window.FillApplySynonyms);
  // Pretend success text without pending — should Apply, not Mark
  const b2 = page2.document.createElement('div');
  b2.textContent = 'Thank you for your application';
  page2.document.body.appendChild(b2);
  const out2 = await page2.window.FillApplyJobPoolHub.fill({ runMode: 'fill' });
  suite.ok(out2.jobpoolHubApply || out2.clickedApplyStart, 'without pending, still starts with Apply');
  suite.ok(page2.window.__clicks.indexOf('apply-1') !== -1, 'Apply clicked when no pending');
  suite.ok(
    page2.window.__clicks.indexOf('mark-1') === -1,
    'success text alone without pending+submit path does not Mark first'
  );

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
