/**
 * JobPool Fill-Apply hub DOM: Open Application + Applied Successfully.
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

  suite.ok(S.isJobPoolHubPage(page.document, url, {}), 'isJobPoolHubPage on /fill-apply');
  suite.ok(Hub.detect(url, page.document), 'jobpool adapter detects fill-apply hub');
  suite.ok(S.isOpenApplicationCta('Open Application'), 'Open Application CTA synonym');
  suite.ok(S.isMarkAppliedCta('Applied Successfully'), 'Applied Successfully is mark CTA');
  suite.ok(!S.isMarkAppliedCta('Application Issue'), 'Application Issue is not mark CTA');
  suite.ok(!S.isMarkAppliedCta('Blocked'), 'Blocked is not mark CTA');

  const open = Hub.findFirstReadyApply(page.document);
  suite.ok(!!open, 'findFirstReadyApply finds Open Application');
  suite.ok(/open\s*application/i.test(String(open.textContent || '')), 'CTA text is Open Application');

  const id = Hub.extractJobIdNear(open, page.document);
  suite.equal(id, 'efinancialcareers:24519857', 'job id from Fill-Apply card text');

  const mark = Hub.findMarkForJob(page.document, id);
  suite.ok(!!mark, 'findMarkForJob finds Applied Successfully');
  suite.ok(/applied\s*successfully/i.test(String(mark.textContent || '')), 'mark label Applied Successfully');

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

  suite.finish();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
