/**
 * Run every smoke script in sequence.
 * Run: npm test
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  'smoke-apply-start-synonyms.js',
  'smoke-tab-popup-handoff.js',
  'smoke-glassdoor-inflow.js',
  'smoke-form-detection.js',
  'smoke-fill-engine.js',
  'smoke-value-format.js',
  'smoke-name-dob-formats.js',
  'smoke-identity-autofill.js',
  'smoke-global-fill-fixes.js',
  'smoke-phone-full-choose-file.js',
  'smoke-hilton-consent-cv-learn.js',
  'smoke-naukrigulf-apply-fallback.js',
  'smoke-naukrigulf-screening.js',
  'smoke-trial-ats-dictionary.js',
  'smoke-michaelpage-fill.js',
  'smoke-signup-login.js',
  'smoke-zahid-dictionary-fill.js',
  'smoke-documents.js',
  'smoke-profile-fill.js',
  'smoke-profile-init.js',
  'smoke-profile-import-export.js',
  'smoke-jobpool-status.js',
  'smoke-run-modes.js',
  'smoke-knowledge.js',
  'smoke-repair-knowledge.js',
  'smoke-knowledge-import-export.js',
  'smoke-backend-jobpool.js',
  'smoke-jobpool-apply-start.js',
  'smoke-jobpool-hub-apply-mark.js',
  'smoke-jobpool-multihop-ui.js',
  'smoke-jobpool-live-dom.js',
  'smoke-queue-clear-urls.js',
  'smoke-qb-load-on-fill.js',
  'smoke-docs-local-not-jobpool.js',
  'smoke-jobpool-html-json.js',
  'smoke-page-panel.js',
  'smoke-ats-auth.js',
  'smoke-challenges.js',
  'smoke-control-adapter.js',
  'smoke-dependent-fields.js',
  'smoke-runner-states.js',
  'smoke-application-flow.js',
  'smoke-universal-workflow.js',
  'smoke-title-honorific-enquiry.js',
  'smoke-phone-cv-persistence.js',
  'smoke-private-profile-release.js'
];

let failed = 0;
SUITES.forEach(function (suite) {
  console.log('\n=== ' + suite + ' ===');
  const result = spawnSync(process.execPath, [path.join(__dirname, suite)], { stdio: 'inherit' });
  if (result.status !== 0) failed += 1;
});

if (failed) {
  console.error('\n' + failed + ' of ' + SUITES.length + ' suites failed');
  process.exit(1);
}
console.log('\nAll ' + SUITES.length + ' suites passed');
