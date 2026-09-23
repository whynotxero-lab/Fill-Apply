/**
 * JobPool Fill-Apply hub DOM: Open Application + Applied Successfully.
 * Guards against left-nav "Fill-Apply" mis-clicks.
 * Run: node scripts/smoke-jobpool-fill-apply-dom.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { createPage, createSuite } = require('./test-harness');
const suite = createSuite('smoke-jobpool-fill-apply-dom');
const html = fs.readFileSync(
  path.join(__dirname, 'fixtures/jobpool-fill-apply-snippet.html'),
  'utf8'
);

(async function () {
  const page = createPage(html, [
    'lib/dom-deep.js',
    'lib/synonyms.js',
    'adapters/boards/jobpool.js'
  ]);
  const S = page.window.FillApplySynonyms;
  const Hub = page.window.FillApplyJobPoolHub;
  const url = 'https://zahid-jobpool.vercel.app/fill-apply';

  // Soft-visible for jsdom
  S.isVisible = function (el) {
    return !!(el && !el.hidden);
  };

  suite.ok(S.isJobPoolHubPage(page.document, url, {}), 'isJobPoolHubPage on /fill-apply');
  suite.ok(Hub.detect(url, page.document), 'jobpool adapter detects fill-apply hub');
  suite.ok(S.isOpenApplicationCta('Open Application'), 'Open Application CTA synonym');
  suite.ok(S.isMarkAppliedCta('Applied Successfully'), 'Applied Successfully is mark CTA');
  suite.ok(!S.isMarkAppliedCta('Application Issue'), 'Application Issue is not mark CTA');
  suite.ok(!S.isMarkAppliedCta('Blocked'), 'Blocked is not mark CTA');

  // --- Nav chrome must NEVER be Apply-start ---
  suite.ok(S.isExcludedApplyCta('Fill-Apply'), 'Fill-Apply nav text is excluded');
  suite.ok(!S.isApplyStartCta('Fill-Apply'), 'Fill-Apply is NOT Apply-start');
  suite.ok(S.isNavigationChrome(page.document.getElementById('nav-fill-apply'), url), 'nav Fill-Apply is navigation chrome');
  suite.equal(S.scoreApplyStartText('Fill-Apply'), 0, 'Fill-Apply scores 0 as Apply-start');
  suite.ok(S.scoreApplyStartText('Open Application') >= 100, 'Open Application scores highest');

  const starts = S.findApplyStartButtons(page.document);
  const startTexts = starts.map(function (el) {
    return String(el.textContent || '').replace(/\s+/g, ' ').trim();
  });
  suite.ok(startTexts.indexOf('Fill-Apply') === -1, 'findApplyStartButtons excludes Fill-Apply nav');
  suite.ok(startTexts.indexOf('Open Application') !== -1, 'findApplyStartButtons includes Open Application');
  suite.ok(
    starts[0] && /open\s*application/i.test(String(starts[0].textContent || '')),
    'top Apply-start is Open Application (not nav)'
  );

  // tryClickApplyStart must not click nav
  let navClicks = 0;
  let openClicks = 0;
  page.document.getElementById('nav-fill-apply').addEventListener('click', function (e) {
    e.preventDefault();
    navClicks += 1;
  });
  page.document.querySelectorAll('button').forEach(function (btn) {
    if (/open\s*application/i.test(btn.textContent || '')) {
      btn.addEventListener('click', function () {
        openClicks += 1;
      });
    }
  });
  const clicked = S.tryClickApplyStart(page.document, { force: true });
  suite.ok(clicked && clicked.clicked, 'tryClickApplyStart clicked something');
  suite.ok(navClicks === 0, 'tryClickApplyStart did NOT click nav Fill-Apply');
  suite.ok(openClicks >= 1, 'tryClickApplyStart clicked Open Application');
  suite.ok(/open\s*application/i.test(String(clicked.text || '')), 'clicked text is Open Application');

  const open = Hub.findFirstReadyApply(page.document);
  suite.ok(!!open, 'findFirstReadyApply finds Open Application');
  suite.ok(/open\s*application/i.test(String(open.textContent || '')), 'CTA text is Open Application');
  suite.ok(open.id === 'open-1' || open.getAttribute('id') === 'open-1', 'first card Open Application');

  const id = Hub.extractJobIdNear(open, page.document);
  suite.equal(id, 'indeed:f695eca6770ba2aa', 'job id from Fill-Apply card (indeed:…)');

  const mark = Hub.findMarkForJob(page.document, id);
  suite.ok(!!mark, 'findMarkForJob finds Applied Successfully');
  suite.ok(/applied\s*successfully/i.test(String(mark.textContent || '')), 'mark label Applied Successfully');
  suite.ok(mark.id === 'mark-1', 'mark is same card Applied Successfully');

  const panelPage = createPage(html, ['content/page-panel.js']);
  const P = panelPage.window.FillApplyPagePanel;
  suite.ok(P.isRelevantPage(url, panelPage.document), 'page panel relevant on /fill-apply');

  // Mount Start/Stop only
  P.mount(panelPage.document);
  const host = panelPage.document.getElementById(P.HOST_ID);
  const shadow = host.shadowRoot;
  suite.ok(shadow.querySelector('[data-action="start"]'), 'Start present');
  suite.ok(shadow.querySelector('[data-action="stop"]'), 'Stop present');
  suite.ok(!shadow.querySelector('[data-mode="register"]'), 'No multi-mode Register');
  suite.ok(shadow.querySelector('[data-action="companion"]') || shadow.querySelector('[data-mode="companion"]'), 'Companion present');

  // --- Without pending: Start/Companion/Submit click Open Application once; never nav ---
  // --- With durable pending: NEVER re-click Open Application; return handoff flags ---
  async function clickModes() {
    const modes = ['fill', 'companion', 'submit'];
    for (const mode of modes) {
      // Fresh hub — no pending → open once
      const p = createPage(html, [
        'lib/dom-deep.js',
        'lib/synonyms.js',
        'adapters/registry.js',
        'adapters/fallback.js',
        'adapters/boards/jobpool.js'
      ]);
      const w = p.window;
      const d = p.document;
      if (w.FillApplySynonyms) {
        w.FillApplySynonyms.isVisible = function (el) {
          return !!(el && !el.hidden);
        };
      }
      let clicks = 0;
      let navHit = 0;
      d.getElementById('nav-fill-apply').addEventListener('click', function (e) {
        e.preventDefault();
        navHit += 1;
      });
      d.querySelectorAll('button').forEach(function (btn) {
        if (/open\s*application/i.test(btn.textContent || '')) {
          btn.addEventListener('click', function () {
            clicks += 1;
          });
        }
      });
      try {
        Object.defineProperty(w, 'location', {
          value: { href: url },
          configurable: true
        });
      } catch (_e) {}
      const hub = w.FillApplyJobPoolHub;
      await hub.clearPendingMark();
      const out = await hub.fill({ runMode: mode });
      suite.ok(out && (out.jobpoolHubApply || out.clickedApplyStart), mode + ' opens application (got flags)');
      suite.ok(clicks === 1, mode + ' clicked Open Application exactly once (clicks=' + clicks + ')');
      suite.ok(navHit === 0, mode + ' did NOT click nav Fill-Apply');

      // Durable pending — second fill must NOT re-click Open Application
      let clicks2 = 0;
      d.querySelectorAll('button').forEach(function (btn) {
        if (/open\s*application/i.test(btn.textContent || '')) {
          btn.addEventListener('click', function () {
            clicks2 += 1;
          });
        }
      });
      const pending = await hub.getPendingMark();
      suite.ok(pending && pending.jobId, mode + ' pending persisted after open');
      const out2 = await hub.fill({ runMode: mode });
      suite.ok(out2 && out2.jobpoolAlreadyOpened, mode + ' reports already opened');
      suite.ok(out2 && (out2.jobpoolHubApply || out2.clickedApplyStart), mode + ' still returns handoff flags');
      suite.ok(clicks2 === 0, mode + ' did NOT re-click Open Application (clicks2=' + clicks2 + ')');
      suite.ok(navHit === 0, mode + ' still did NOT click nav');
    }
  }
  await clickModes();

  // --- After simulated success → Applied Successfully for pending card ---
  const markPage = createPage(html, [
    'lib/dom-deep.js',
    'lib/synonyms.js',
    'adapters/registry.js',
    'adapters/fallback.js',
    'adapters/boards/jobpool.js'
  ]);
  const mw = markPage.window;
  const md = markPage.document;
  mw.FillApplySynonyms.isVisible = function (el) {
    return !!(el && !el.hidden);
  };
  try {
    Object.defineProperty(mw, 'location', {
      value: { href: url },
      configurable: true
    });
  } catch (_e) {}
  let markClicks = 0;
  let openAgain = 0;
  let navAgain = 0;
  md.getElementById('mark-1').addEventListener('click', function () {
    markClicks += 1;
  });
  md.getElementById('open-1').addEventListener('click', function () {
    openAgain += 1;
  });
  md.getElementById('nav-fill-apply').addEventListener('click', function (e) {
    e.preventDefault();
    navAgain += 1;
  });
  const hubM = mw.FillApplyJobPoolHub;
  await hubM.setPendingMark({
    jobId: 'indeed:f695eca6770ba2aa',
    title: 'Finance Analyst',
    clickedAt: Date.now() - 1000,
    hubUrl: url
  });
  // Simulate ATS thank-you / return success on hub
  const banner = md.createElement('div');
  banner.textContent = 'Thank you for your application — your application has been submitted.';
  md.body.insertBefore(banner, md.body.firstChild);

  const markOut = await hubM.fill({
    runMode: 'submit',
    submitted: true,
    markAfterSubmit: true,
    forceJobPoolMark: true
  });
  suite.ok(markOut && markOut.jobpoolMarkedApplied, 'after success marks Applied Successfully');
  suite.ok(markClicks >= 1, 'Applied Successfully clicked for indeed:f695eca6770ba2aa');
  suite.ok(openAgain === 0, 'did not re-click Open Application when marking');
  suite.ok(navAgain === 0, 'did not click nav Fill-Apply when marking');
  const cleared = await hubM.getPendingMark();
  suite.ok(!cleared || !cleared.jobId, 'pending mark cleared after Applied Successfully');

  suite.finish();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
