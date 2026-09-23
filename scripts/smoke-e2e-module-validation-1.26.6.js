/**
 * E2E module validation for 1.26.6 — private Zahid seed, GulfTalent Google,
 * Oracle easy-apply email+privacy+next. Preserves 1.26.4–1.26.5 panel.
 * Run: node scripts/smoke-e2e-module-validation-1.26.6.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./test-harness');

const suite = createSuite('smoke-e2e-module-validation-1.26.6');
const ROOT = path.join(__dirname, '..');

function record(name, ok, detail) {
  suite.ok(!!ok, name + (detail ? ' — ' + detail : ''));
}

(async function main() {
  const manif = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  record('manifest.version', manif.version === '1.26.6', 'got ' + manif.version);
  record('package.version', pkg.version === '1.26.6', 'got ' + pkg.version);

  record('seed.file', fs.existsSync(path.join(ROOT, 'lib/private-zahid-seed.js')));
  const seed = fs.readFileSync(path.join(ROOT, 'lib/private-zahid-seed.js'), 'utf8');
  record('seed.zahid_gmail', /czahidali\.accacma@gmail\.com/.test(seed));
  record('seed.password', /Zahid@Finance786/.test(seed));
  record('seed.not_mock', !/alex\.rivera@example\.com/.test(seed));

  const profile = fs.readFileSync(path.join(ROOT, 'lib/profile.js'), 'utf8');
  record('profile.zahid_fallback_email', /czahidali\.accacma@gmail\.com/.test(profile));
  record('profile.fresh_active_zahid', /ACTIVE_PROFILE_ID_KEY\] = 'zahid'/.test(profile));

  const sw = fs.readFileSync(path.join(ROOT, 'background/service-worker.js'), 'utf8');
  record('sw.private_seed', /private-zahid-seed/.test(sw) && /ensureInstalled/.test(sw));

  const gt = fs.readFileSync(path.join(ROOT, 'adapters/boards/gulftalent.js'), 'utf8');
  record('gulftalent.register_modal', /Register before applying/i.test(gt));
  record('gulftalent.google_first', /google/.test(gt) && /prefer/i.test(gt) || /score = 100/.test(gt));

  const oracle = fs.readFileSync(path.join(ROOT, 'adapters/ats/oraclecloud.js'), 'utf8');
  record('oracle.easy_apply', /easy-apply/.test(oracle));
  record('oracle.privacy', /privacy/i.test(oracle));
  record('oracle.next_arrow', /circular|aria-label|arrow/i.test(oracle));

  const panel = fs.readFileSync(path.join(ROOT, 'content/page-panel.js'), 'utf8');
  record('panel.start', /Start/.test(panel));
  record('panel.pause', /Pause|Resume/.test(panel));
  record('panel.cancel', /Cancel/.test(panel));

  const runner = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
  record('runner.gulftalent_inject', /gulftalent\.js/.test(runner));
  record('runner.oracle_inject', /oraclecloud\.js/.test(runner));
  record('runner.no_hop_preserved', /stayOnTab|no.?hop|currentTab/i.test(runner));

  console.log('\n=== 1.26.6 E2E module validation matrix ===');
  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
