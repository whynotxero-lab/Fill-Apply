/**
 * Auto Apply entry points: JobPool vs Current page messaging + panel buttons.
 * Run: node scripts/smoke-auto-apply-entries.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-auto-apply-entries');
const ROOT = path.join(__dirname, '..');

const JOB_FORM = `
  <main>
    <h1 id="job-title">Finance Manager</h1>
    <form>
      <label>Email <input name="email" type="email" /></label>
      <button type="button">Apply Now</button>
    </form>
  </main>
`;

(function panelEntries() {
  const page = createPage(JOB_FORM, ['content/page-panel.js']);
  const P = page.window.FillApplyPagePanel;
  const host = P.mount(page.document);
  const shadow = host.shadowRoot;
  suite.ok(!!shadow.querySelector('[data-action="start"]'), 'Start entry button');
  suite.ok(!!shadow.querySelector('[data-action="pause-toggle"]'), 'Pause/Resume toggle');
  suite.ok(!!shadow.querySelector('[data-action="cancel"]'), 'Cancel button');
  suite.ok(!shadow.querySelector('[data-action="companion"]'), 'Companion gone');
  suite.ok(!shadow.querySelector('[data-action="jobpool"]'), 'separate JobPool gone (smart Start)');
  suite.ok(!shadow.querySelector('[data-action="stop"]'), 'Stop renamed to Cancel');
  suite.equal(P.normalizeRunMode('jobpool'), 'submit', 'jobpool → submit');
  suite.equal(P.normalizeRunMode('current'), 'submit', 'current → submit');
  suite.equal(P.normalizeRunMode('start'), 'fill', 'start alone falls back to fill normalize');
  suite.ok(typeof P.startSmart === 'function', 'startSmart exported');
  suite.ok(typeof P.pauseAutoApply === 'function', 'pauseAutoApply exported');
  suite.ok(typeof P.resumeAutoApply === 'function', 'resumeAutoApply exported');
  suite.ok(typeof P.cancelAutoApply === 'function', 'cancelAutoApply exported');
})();

(function serviceWorkerEntryContract() {
  const sw = fs.readFileSync(path.join(ROOT, 'background/service-worker.js'), 'utf8');
  suite.ok(/ensureJobPoolHubTab/.test(sw), 'SW has ensureJobPoolHubTab');
  suite.ok(/entry === 'jobpool'/.test(sw) || /entry === \"jobpool\"/.test(sw), 'SW handles entry=jobpool');
  suite.ok(/FILL_APPLY_PAUSE/.test(sw) || /MSG\.PAUSE/.test(sw), 'SW handles PAUSE');
  suite.ok(/configureSidePanel/.test(sw), 'SW restores configureSidePanel');
  suite.ok(!/disableSidePanelIfPresent/.test(sw), 'SW no longer disables side panel');
  suite.ok(!/runMode: 'companion'/.test(sw) && !/mode = 'companion'/.test(sw), 'SW has no companion mode');
})();

(function runnerNoCompanion() {
  const runner = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
  suite.ok(!/runCompanionOnTab/.test(runner), 'runner has no runCompanionOnTab');
  suite.ok(!/companion-nav\.js/.test(runner), 'runner does not inject companion-nav');
  suite.ok(!fs.existsSync(path.join(ROOT, 'lib/companion-nav.js')), 'companion-nav.js deleted');
  suite.ok(/pause:\s*pauseRunner/.test(runner) || /pause:\s*pauseRunner/.test(runner), 'runner exports pause');
  suite.ok(/learnUnmatchedFieldsInTab/.test(runner), 'runner has resume learn hook');
  suite.ok(/mode === 'single'/.test(runner) || /modeHint === 'single'/.test(runner), 'single-tab resume path');
})();

(function sidepanelProfileImport() {
  const html = fs.readFileSync(path.join(ROOT, 'sidepanel/sidepanel.html'), 'utf8');
  suite.ok(/btnImportProfile/.test(html), 'side panel Import Profile button');
  suite.ok(/importProfileFile/.test(html), 'side panel import file input');
  suite.ok(/profile-io\.js/.test(html), 'side panel loads profile-io');
  suite.ok(!/value="register"/.test(html), 'side panel removed Register mode radios');
  suite.ok(/value="submit"/.test(html), 'side panel defaults to submit');
  const manif = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  suite.ok(manif.permissions.indexOf('sidePanel') !== -1, 'manifest sidePanel permission');
  suite.ok(manif.side_panel && manif.side_panel.default_path, 'manifest side_panel path');
  suite.ok(!manif.action || !manif.action.default_popup, 'toolbar opens side panel (no default_popup)');
})();

suite.finish();
