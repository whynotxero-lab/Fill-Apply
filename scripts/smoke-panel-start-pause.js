/**
 * Floating panel Start / Pause·Resume / Cancel + unknown→pause + resume learn contract.
 * Run: node scripts/smoke-panel-start-pause.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-panel-start-pause');
const ROOT = path.join(__dirname, '..');

const JOB_FORM = `
  <main>
    <h1 id="job-title">Strategic Finance Manager</h1>
    <form id="application-form">
      <label for="fn">First name</label><input id="fn" name="first_name" required />
      <label for="em">Email</label><input id="em" name="email" type="email" required />
      <label for="q">Are you open to relocation?</label><input id="q" name="open_to_relocation" required />
      <button type="button" id="apply">Apply Now</button>
    </form>
  </main>
`;

(function panelTrioAndToggle() {
  const page = createPage(JOB_FORM, ['content/page-panel.js']);
  const P = page.window.FillApplyPagePanel;
  const host = P.mount(page.document);
  const shadow = host.shadowRoot;
  const start = shadow.querySelector('[data-action="start"]');
  const toggle = shadow.querySelector('[data-action="pause-toggle"]');
  const cancel = shadow.querySelector('[data-action="cancel"]');
  suite.ok(!!start && start.textContent === 'Start', 'Start');
  suite.ok(!!toggle, 'Pause/Resume toggle');
  suite.ok(!!cancel && cancel.textContent === 'Cancel', 'Cancel');

  P.setPanelPhase('idle');
  P.syncActionButtons();
  suite.ok(!start.disabled, 'Start enabled idle');
  suite.ok(toggle.disabled, 'Pause disabled idle');

  P.setPanelPhase('running');
  P.syncActionButtons();
  suite.ok(start.disabled, 'Start disabled while running');
  suite.equal(toggle.textContent, 'Pause', 'shows Pause while running');
  suite.ok(!toggle.disabled, 'Pause enabled while running');

  P.setPanelPhase('paused');
  P.syncActionButtons();
  suite.equal(toggle.textContent, 'Resume', 'shows Resume while paused');
  suite.equal(toggle.getAttribute('data-mode'), 'resume', 'data-mode resume');

  suite.ok(P.isJobPoolHubUrl('https://zahid-jobpool.vercel.app/fill-apply'), 'hub');
  suite.ok(!P.isJobPoolHubUrl('https://example.com/jobs/1'), 'not hub');
})();

(function messagingContract() {
  const panel = fs.readFileSync(path.join(ROOT, 'content/page-panel.js'), 'utf8');
  suite.ok(/FILL_APPLY_FILL_ONCE/.test(panel), 'Start → FILL_ONCE');
  suite.ok(/FILL_APPLY_PAUSE/.test(panel), 'Pause → PAUSE');
  suite.ok(/FILL_APPLY_RESUME/.test(panel), 'Resume → RESUME');
  suite.ok(/FILL_APPLY_STOP/.test(panel), 'Cancel → STOP');
  suite.ok(/entry === 'jobpool'/.test(panel) || /entry = detectSmartEntry/.test(panel) || /detectSmartEntry/.test(panel), 'smart entry');
})();

(async function unknownPauseNoTabHop() {
  const LIBS = [
    'lib/dom-deep.js',
    'lib/format.js',
    'lib/synonyms.js',
    'lib/field-map.js',
    'lib/control-adapter.js',
    'lib/ats-faq-seed.js',
    'lib/knowledge-canonical.js',
    'lib/knowledge-store.js',
    'lib/knowledge-resolver.js',
    'lib/knowledge-learn.js',
    'lib/files.js',
    'content/fill.js',
    'adapters/fallback.js'
  ];
  const page = createPage(JOB_FORM, LIBS);
  let tabsCreated = 0;
  page.window.open = function () {
    tabsCreated += 1;
    return null;
  };

  const profile = { firstName: 'Alex', email: 'alex@example.com' };
  const fillResult = await page.window.__fillApply.run(profile, {
    skipCvImport: true,
    dependentWaitMs: 10,
    maxDependentPasses: 0
  });
  suite.ok(!!fillResult.needsHuman || fillResult.phase === 'MISSING_INFORMATION', 'unknown → needsHuman/MISSING');
  suite.ok(
    Array.isArray(fillResult.unknownFields) && fillResult.unknownFields.length > 0,
    'unknownFields populated'
  );
  suite.ok(!!page.document.querySelector('[data-fill-apply-unmatched]'), 'field highlighted');
  suite.equal(tabsCreated, 0, 'no window.open / tab create on unknown');

  // Fallback submit mode also needsHuman
  if (page.window.FillApplyFallback && page.window.FillApplyFallback.fill) {
    /* optional */
  }
  const fb = fs.readFileSync(path.join(ROOT, 'adapters/fallback.js'), 'utf8');
  suite.ok(/needsHuman:\s*true/.test(fb), 'fallback can set needsHuman');
})();

(function cancelClearsRunLock() {
  const runner = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
  suite.ok(/clearCurrentTabRunLock/.test(runner), 'clearCurrentTabRunLock');
  const stopIdx = runner.indexOf('async function stopRunner');
  const slice = stopIdx >= 0 ? runner.slice(stopIdx, stopIdx + 800) : '';
  suite.ok(slice.indexOf('clearCurrentTabRunLock') !== -1, 'Cancel/stop clears currentTabRunActive lock');
  suite.ok(/isFailureOrHumanPause/.test(runner), 'no tab-hop on failure helper');
})();

(function resumeLearnHook() {
  const runner = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
  suite.ok(/async function learnUnmatchedFieldsInTab/.test(runner), 'learnUnmatchedFieldsInTab defined');
  suite.ok(/FillApplyKnowledgeLearn/.test(runner), 'uses existing KnowledgeLearn');
  suite.ok(/kind:\s*'resume_human'/.test(runner), 'resume_human kind');
  suite.ok(/isSingle && tabId != null/.test(runner), 'single-tab resume gate');
  suite.ok(/runOnceOnTab\(tabId,\s*'submit'\)/.test(runner), 'resume re-runs same tab');
  var resumeIdx = runner.indexOf('async function resumeRunner');
  var resumeSlice = resumeIdx >= 0 ? runner.slice(resumeIdx, resumeIdx + 3500) : '';
  suite.ok(resumeSlice.indexOf('runOnceOnTab') !== -1, 'resumeRunner calls runOnceOnTab for single');
  suite.ok(resumeSlice.indexOf('chrome.tabs.create') === -1, 'resumeRunner avoids tabs.create');
})();

Promise.resolve()
  .then(function () {
    return suite.finish();
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
