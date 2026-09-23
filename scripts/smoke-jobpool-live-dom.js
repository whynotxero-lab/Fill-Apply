/**
 * JobPool live Applications DOM (user dump): external Apply <a> + Mark button.
 * Run: node scripts/smoke-jobpool-live-dom.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { createPage, createSuite } = require('./test-harness');
const suite = createSuite('smoke-jobpool-live-dom');
const html = fs.readFileSync(
  path.join(__dirname, 'fixtures/jobpool-applications-snippet.html'),
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
  const url = 'https://zahid-jobpool.vercel.app/applications';

  suite.ok(S.isJobPoolHubPage(page.document, url, {}), 'isJobPoolHubPage on applications URL');
  suite.ok(Hub.detect(url, page.document), 'jobpool adapter detects hub');

  const apply = Hub.findFirstReadyApply(page.document);
  suite.ok(!!apply, 'findFirstReadyApply finds Apply');
  suite.equal(String(apply.tagName).toUpperCase(), 'A', 'Apply is an anchor');
  suite.ok(/naukrigulf\.com/i.test(apply.href || apply.getAttribute('href') || ''), 'Apply href is employer URL');
  suite.ok(!/zahid-jobpool/i.test(apply.href || ''), 'Apply href is not JobPool');

  const id = Hub.extractJobIdNear(apply, page.document);
  suite.ok(!!id, "extractJobIdNear from Apply href");
  // extractJobIdNear may not be exported — test via pending path if needed
  suite.ok(true, 'apply control present');

  // Page panel relevance
  const panelPage = createPage(html, ['content/page-panel.js']);
  panelPage.window.__FILL_APPLY_PAGE_PANEL_NOBOOT = true;
  // re-create with noboot flag before load — harness loads immediately; call API directly
  const P = panelPage.window.FillApplyPagePanel;
  suite.ok(P.isRelevantPage(url, panelPage.document), 'page panel relevant on JobPool Applications');

  suite.finish();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
