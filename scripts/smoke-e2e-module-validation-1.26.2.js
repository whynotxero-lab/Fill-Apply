/**
 * E2E module validation for 1.26.2 — SLICE 1 tab/popup adoption only.
 * Preserves 1.26.0/1.26.1 Auto Apply + NaukriGulf screening; no slices 2–5.
 *
 * Run: node scripts/smoke-e2e-module-validation-1.26.2.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-e2e-module-validation-1.26.2');
const ROOT = path.join(__dirname, '..');
const matrix = [];

function record(module, ok, detail) {
  matrix.push({ module: module, ok: !!ok, detail: detail || '' });
  suite.ok(ok, module + (detail ? ' — ' + detail : ''));
}

(async function main() {
  const manif = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  record('manifest.version', /^1\.26\.(2|3|4|5|6)$/.test(manif.version), 'got ' + manif.version);
  record('manifest.windows', manif.permissions.indexOf('windows') !== -1, 'windows permission');
  record('manifest.sidePanel', manif.permissions.indexOf('sidePanel') !== -1, 'permission');
  record(
    'companion.deleted',
    !fs.existsSync(path.join(ROOT, 'lib/companion-nav.js')),
    'lib/companion-nav.js absent'
  );

  const panelSrc = fs.readFileSync(path.join(ROOT, 'content/page-panel.js'), 'utf8');
  record('panel.start_or_jobpool', /data-action=['\"]start['\"]/.test(panelSrc) || /data-action=['\"]jobpool['\"]/.test(panelSrc), 'Start or JobPool');
  record('panel.pause_or_current', /data-action=['\"]pause-toggle['\"]/.test(panelSrc) || /data-action=['\"]current['\"]/.test(panelSrc), 'Pause or Current');
  record('panel.cancel_or_stop', /data-action=['\"]cancel['\"]/.test(panelSrc) || /data-action=['\"]stop['\"]/.test(panelSrc), 'Cancel or Stop');
  record('panel.no_companion', !/data-action=['"]companion['"]/.test(panelSrc), 'no Companion');

  const runnerSrc = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
  record('runner.armOpenerTabFollow', /function armOpenerTabFollow/.test(runnerSrc), 'arm helper');
  record('runner.tabs_onCreated', /tabs\.onCreated\.addListener/.test(runnerSrc), 'tab create listen');
  record(
    'runner.windows_onCreated',
    /windows\.onCreated\.addListener/.test(runnerSrc),
    'window open listen'
  );
  record(
    'runner.knownTabIds_fix',
    /do NOT merge a fresh full tab snapshot into knownTabIds/.test(runnerSrc),
    'no snapshot-merge after click'
  );
  record(
    'runner.hub_kept',
    /JobPool hub kept in background/.test(runnerSrc),
    'hub background message'
  );
  record(
    'runner.exports_follow',
    /armOpenerTabFollow:\s*armOpenerTabFollow/.test(runnerSrc) &&
      /resolveRunTargetAfterOpenerClick:\s*resolveRunTargetAfterOpenerClick/.test(runnerSrc),
    'follow APIs exported'
  );
  record(
    'runner.pickEmployer_all_windows',
    /Query all windows/.test(runnerSrc) || /chrome\.tabs\.query\(\{\}\)/.test(runnerSrc),
    'employer pick all windows'
  );
  record('runner.no_companion', !/runCompanionOnTab/.test(runnerSrc), 'no companion loop');
  record(
    'runner.jobpool_mark',
    /maybeCompleteJobPoolHubMark/.test(runnerSrc),
    'Applied Successfully path intact'
  );
  record(
    'screening.intent_lib',
    fs.existsSync(path.join(ROOT, 'lib/screening-intent.js')),
    '1.26.1 screening preserved'
  );

  // JobPool Open Application once (preserved)
  const fixture = fs.readFileSync(
    path.join(ROOT, 'scripts/fixtures/jobpool-fill-apply-snippet.html'),
    'utf8'
  );
  const hubPage = createPage(fixture, [
    'lib/dom-deep.js',
    'lib/synonyms.js',
    'adapters/registry.js',
    'adapters/fallback.js',
    'adapters/boards/jobpool.js'
  ]);
  const hub = hubPage.window.FillApplyJobPoolHub;
  if (hubPage.window.FillApplySynonyms) {
    hubPage.window.FillApplySynonyms.isVisible = function (el) {
      return !!(el && !el.hidden);
    };
  }
  let openClicks = 0;
  hubPage.document.querySelectorAll('button, a').forEach(function (btn) {
    if (/open\s*application/i.test(btn.textContent || '')) {
      btn.addEventListener('click', function () {
        openClicks += 1;
      });
    }
  });
  await hub.clearPendingMark();
  const first = await hub.fill({ runMode: 'submit' });
  const clicksAfterFirst = openClicks;
  const second = await hub.fill({ runMode: 'submit' });
  record(
    'jobpool.open_once',
    clicksAfterFirst === 1 && openClicks === 1,
    'clicks=' + openClicks + ' firstFlags=' + !!(first && first.jobpoolHubApply)
  );
  record(
    'jobpool.pending_no_reopen',
    !!(second && (second.jobpoolAlreadyOpened || second.jobpoolHubApply)),
    'second returns handoff/already-opened'
  );

  const page = createPage(
    `<main><h1>Job</h1><form><input name="email" type="email" /><button>Apply</button></form></main>`,
    ['content/page-panel.js']
  );
  const P = page.window.FillApplyPagePanel;
  P.mount(page.document);
  const shadow = page.document.getElementById(P.HOST_ID).shadowRoot;
  record(
    'panel.mount_three',
    !!(
      (shadow.querySelector('[data-action="start"]') &&
        shadow.querySelector('[data-action="pause-toggle"]') &&
        shadow.querySelector('[data-action="cancel"]')) ||
      (shadow.querySelector('[data-action="jobpool"]') &&
        shadow.querySelector('[data-action="current"]') &&
        shadow.querySelector('[data-action="stop"]'))
    ),
    'Start/Pause/Cancel or JobPool/Current/Stop'
  );

  console.log('\n=== 1.26.2 E2E module validation matrix (SLICE 1) ===');
  matrix.forEach(function (row) {
    console.log((row.ok ? 'PASS' : 'FAIL') + '  ' + row.module + (row.detail ? ' — ' + row.detail : ''));
  });
  suite.finish();
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
