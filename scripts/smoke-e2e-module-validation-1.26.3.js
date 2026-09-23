/**
 * E2E module validation for 1.26.3 — SLICE 2 nav-first (Apply + Next-after-fill).
 * Preserves 1.26.0–1.26.2; no slices 3–4 (OAuth / Applied button).
 *
 * Run: node scripts/smoke-e2e-module-validation-1.26.3.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-e2e-module-validation-1.26.3');
const ROOT = path.join(__dirname, '..');
const matrix = [];

function record(module, ok, detail) {
  matrix.push({ module: module, ok: !!ok, detail: detail || '' });
  suite.ok(ok, module + (detail ? ' — ' + detail : ''));
}

(async function main() {
  const manif = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  record('manifest.version', /^1\.26\.(3|4|5)$/.test(manif.version), 'got ' + manif.version + ' (1.26.3+)');
  record('package.version', /^1\.26\.(3|4|5)$/.test(pkg.version), 'got ' + pkg.version + ' (1.26.3+)');
  record(
    'nav_first.lib',
    fs.existsSync(path.join(ROOT, 'lib/nav-first.js')),
    'lib/nav-first.js present'
  );
  record(
    'companion.still_deleted',
    !fs.existsSync(path.join(ROOT, 'lib/companion-nav.js')),
    'companion-nav stays gone'
  );

  const runnerSrc = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
  record('runner.injects_nav_first', /lib\/nav-first\.js/.test(runnerSrc), 'INJECT_FILES');
  record(
    'runner.hop_on_advanced',
    /Nav-first: after Apply-start OR Next\/Continue advance/.test(runnerSrc),
    'needsHandoffHop advanced'
  );
  record(
    'runner.generic_keeps_apply_start',
    /clickedApplyStart \|\|/.test(runnerSrc) && /usedGenericFallback/.test(runnerSrc),
    'generic fallback keeps Apply-start'
  );
  record('runner.tab_follow_preserved', /armOpenerTabFollow/.test(runnerSrc), '1.26.2 follow');
  record('runner.jobpool_mark', /maybeCompleteJobPoolHubMark/.test(runnerSrc), 'pending mark');

  const icims = fs.readFileSync(path.join(ROOT, 'adapters/ats/icims.js'), 'utf8');
  record('icims.nav_first_apply', /Nav-first \(a\): click Apply/.test(icims), 'Apply handoff');
  record('icims.advance_after_fill', /function advanceAfterFill/.test(icims), 'Next helper');
  record(
    'icims.welcome_next_before_captcha',
    /Click Next before captcha pause/.test(icims),
    'Next before pause'
  );
  record(
    'icims.no_stop_nn',
    /filled N\/N alone is not terminal/.test(icims),
    'no stop on N/N'
  );

  const navSrc = fs.readFileSync(path.join(ROOT, 'lib/nav-first.js'), 'utf8');
  record('nav.actions', /APPLY_START/.test(navSrc) && /ADVANCE/.test(navSrc), 'action enum');
  record('nav.must_not_stop', /mustNotStopOnEmptyFill/.test(navSrc), '0/0 guard');

  // Live decide + click Apply
  const jobPage = createPage(
    `<main><div class="job-description">Job</div><button id="a">Apply</button></main>`,
    ['lib/synonyms.js', 'lib/nav-first.js']
  );
  jobPage.window.FillApplySynonyms.isVisible = function (el) {
    return !!(el && !el.hidden);
  };
  const N = jobPage.window.FillApplyNavFirst;
  const d = N.decidePageAction(jobPage.document);
  record('nav.decide_apply', d.action === 'apply_start', d.action);

  let clicked = 0;
  jobPage.document.getElementById('a').addEventListener('click', function () {
    clicked += 1;
  });
  const open = N.tryNavApplyStart(jobPage.document);
  record('nav.click_apply', !!(open && open.clicked && clicked === 1), 'clicks=' + clicked);

  // Panel: 1.26.4 Start/Pause/Cancel (accept legacy JobPool/Current/Stop)
  const panelSrc = fs.readFileSync(path.join(ROOT, 'content/page-panel.js'), 'utf8');
  const hasStartTrio =
    /data-action=['\"]start['\"]/.test(panelSrc) &&
    /data-action=['\"]pause-toggle['\"]/.test(panelSrc) &&
    /data-action=['\"]cancel['\"]/.test(panelSrc);
  const hasLegacyTrio =
    /data-action=['\"]jobpool['\"]/.test(panelSrc) &&
    /data-action=['\"]current['\"]/.test(panelSrc) &&
    /data-action=['\"]stop['\"]/.test(panelSrc);
  record('panel.auto_apply_trio', hasStartTrio || hasLegacyTrio, hasStartTrio ? 'Start/Pause/Cancel' : 'JobPool/Current/Stop');
  record('panel.no_companion', !/data-action=['\"]companion['\"]/.test(panelSrc), 'no Companion');


  record('icims.resolveEducationCountry', /function resolveEducationCountry/.test(icims), 'edu Pakistan helper');
  record('icims.resolveNationality', /function resolveNationality/.test(icims), 'nationality helper');
  record('icims.safeScalar', /function safeScalar/.test(icims), 'no object stringify');
  record('runner.jobpool_stamp', /stampRegistrationPassword\(profile \|\| \{\}\)/.test(runnerSrc), 'JobPool password stamp');
  record(
    'smoke.icims_profile',
    fs.existsSync(path.join(ROOT, 'scripts/smoke-icims-profile-fill.js')),
    'profile fill smoke present'
  );

  console.log('\nModule matrix 1.26.3:');
  matrix.forEach(function (row) {
    console.log((row.ok ? 'PASS' : 'FAIL') + '\t' + row.module + (row.detail ? '\t' + row.detail : ''));
  });
  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
