/**
 * E2E module validation for 1.26.1 — Companion removed; NaukriGulf screening intent-safe fill; Auto Apply JobPool/Current page.
 * Preserves JobPool Open-once + Applied Successfully + iCIMS profile||{} fixes.
 *
 * Run: node scripts/smoke-e2e-module-validation-1.26.1.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-e2e-module-validation-1.26.1');
const ROOT = path.join(__dirname, '..');
const matrix = [];

function record(module, ok, detail) {
  matrix.push({ module: module, ok: !!ok, detail: detail || '' });
  suite.ok(ok, module + (detail ? ' — ' + detail : ''));
}

(async function main() {
  const manif = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  record('manifest.version', /^1\.26\./.test(manif.version), 'got ' + manif.version + ' (1.26.x)');
  record('manifest.sidePanel', manif.permissions.indexOf('sidePanel') !== -1, 'permission');
  record(
    'companion.deleted',
    !fs.existsSync(path.join(ROOT, 'lib/companion-nav.js')),
    'lib/companion-nav.js absent'
  );
  record(
    'docs.companion_removed',
    !fs.existsSync(path.join(ROOT, 'docs/SIMPLIFY_COMPANION.md')),
    'SIMPLIFY_COMPANION.md gone'
  );

  const panelSrc = fs.readFileSync(path.join(ROOT, 'content/page-panel.js'), 'utf8');
  record('panel.start_or_jobpool', /data-action=['\"]start['\"]/.test(panelSrc) || /data-action=['\"]jobpool['\"]/.test(panelSrc), 'Start or JobPool');
  record('panel.pause_or_current', /data-action=['\"]pause-toggle['\"]/.test(panelSrc) || /data-action=['\"]current['\"]/.test(panelSrc), 'Pause or Current');
  record('panel.cancel_or_stop', /data-action=['\"]cancel['\"]/.test(panelSrc) || /data-action=['\"]stop['\"]/.test(panelSrc), 'Cancel or Stop');
  record('panel.no_companion', !/data-action=['"]companion['"]/.test(panelSrc), 'no Companion');

  record(
    'screening.intent_lib',
    fs.existsSync(path.join(ROOT, 'lib/screening-intent.js')),
    'lib/screening-intent.js'
  );
  const intentSrc = fs.readFileSync(path.join(ROOT, 'lib/screening-intent.js'), 'utf8');
  record('screening.forbid_city', /looksLikeGeoOnly|isForbiddenValue/.test(intentSrc), 'geo guard');
  record('screening.forbid_notice', /looksLikeNoticeOnly/.test(intentSrc), 'notice guard');
  const ngSrc = fs.readFileSync(path.join(ROOT, 'adapters/boards/naukrigulf.js'), 'utf8');
  record('ng.uses_screening_intent', /FillApplyScreeningIntent/.test(ngSrc), 'adapter wired');
  const runnerSrc = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
  record('runner.injects_screening_intent', /screening-intent\.js/.test(runnerSrc), 'INJECT_FILES');
  record(
    'faq.ng_screening_seeds',
    /ifrsVatTaxExperience|basedInUae|caOnly|soxAuditControlsExperience|bankingFsYearsEmployer/.test(
      fs.readFileSync(path.join(ROOT, 'lib/ats-faq-seed.js'), 'utf8')
    ),
    'FAQ seeds'
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

  // JobPool Open Application once per pending (preserved from 1.25.x)
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

  // iCIMS profile||{} fix preserved
  const icimsSrc = fs.readFileSync(path.join(ROOT, 'adapters/ats/icims.js'), 'utf8');
  record(
    'icims.clickSubmitProfile_has_profile_param',
    /function clickSubmitProfile\s*\(\s*doc\s*,\s*profile\s*\)/.test(icimsSrc),
    'signature includes profile'
  );
  record(
    'icims.profile_guard',
    /profile\s*=\s*profile\s*\|\|\s*\{\}/.test(icimsSrc) || /profile\s*\|\|\s*\{\}/.test(icimsSrc),
    'profile||{} present'
  );

  record('runner.no_companion', !/runCompanionOnTab/.test(runnerSrc), 'no companion loop');
  record(
    'runner.jobpool_mark',
    /maybeCompleteJobPoolHubMark/.test(runnerSrc),
    'Applied Successfully path intact'
  );

  console.log('\n=== 1.26.1 E2E module validation matrix ===');
  matrix.forEach(function (row) {
    console.log((row.ok ? 'PASS' : 'FAIL') + '  ' + row.module + (row.detail ? ' — ' + row.detail : ''));
  });
  suite.finish();
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
