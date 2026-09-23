/**
 * E2E module validation for 1.26.5 — stuck-run clear, no tab-hop on failure,
 * Bayt exclude location, Apply with CV / Ashby Apply for this Job, Workable years/address/entertainment.
 * Run: node scripts/smoke-e2e-module-validation-1.26.5.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./test-harness');

const suite = createSuite('smoke-e2e-module-validation-1.26.5');
const ROOT = path.join(__dirname, '..');

function record(id, ok, detail) {
  suite.ok(!!ok, id + (detail ? ' — ' + detail : ''));
}

(function main() {
  const manif = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  record('manifest.version', /^1\.26\./.test(manif.version), 'got ' + manif.version);
  record('package.version', /^1\.26\./.test(pkg.version), 'got ' + pkg.version);

  const runner = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
  record('runner.clear_lock', /clearCurrentTabRunLock/.test(runner));
  record('runner.stop_unlocks', /async function stopRunner[\s\S]{0,500}clearCurrentTabRunLock/.test(runner));
  record('runner.no_hop_failure', /isFailureOrHumanPause/.test(runner));
  record('runner.intentional_open', /intentionalOpen/.test(runner));

  const panel = fs.readFileSync(path.join(ROOT, 'content/page-panel.js'), 'utf8');
  record('panel.start', /FILL_APPLY_FILL_ONCE/.test(panel));
  record('panel.cancel', /FILL_APPLY_STOP/.test(panel) && /Cancel/.test(panel));
  record('panel.pause_resume', /FILL_APPLY_PAUSE/.test(panel) && /FILL_APPLY_RESUME/.test(panel));

  const syn = fs.readFileSync(path.join(ROOT, 'lib/synonyms.js'), 'utf8');
  record('syn.location_chip', /LOCATION_FILTER_CHIP_CTA/.test(syn));
  record('syn.apply_with_cv', /apply\s*with\s*\(cv\|resume/.test(syn));
  record('syn.bayt_easy', /bayt/.test(syn));

  const fill = fs.readFileSync(path.join(ROOT, 'content/fill.js'), 'utf8');
  record('fill.gate_cta', /Apply with CV|apply with \(cv/.test(fill));
  record('fill.address_junk', /looksLikeComposedAddressJunk/.test(fill));

  const fmt = fs.readFileSync(path.join(ROOT, 'lib/format.js'), 'utf8');
  record('fmt.plus_before', /plusBefore/.test(fmt));
  record('fmt.junk', /looksLikeComposedAddressJunk/.test(fmt));

  const workable = fs.readFileSync(path.join(ROOT, 'adapters/ats/workable.js'), 'utf8');
  record('workable.webook', /webook\.com/.test(workable));
  record('workable.entertainment', /entertainment_industry/.test(workable));

  const mp = fs.readFileSync(path.join(ROOT, 'adapters/agencies/michaelpage.js'), 'utf8');
  record('mp.same_popup', /same popup/.test(mp));

  const ashby = fs.readFileSync(path.join(ROOT, 'adapters/ats/ashby.js'), 'utf8');
  record('ashby.apply_job', /Apply for this Job/.test(ashby));

  const signup = fs.readFileSync(path.join(ROOT, 'lib/signup-login.js'), 'utf8');
  record('auth.social', /tryPreferSocialContinue/.test(signup));

  const workday = fs.readFileSync(path.join(ROOT, 'adapters/ats/workday.js'), 'utf8');
  record('workday.apply_manually', /Apply Manually/.test(workday));
  record('workday.stay', /stayOnTab/.test(workday));
  record('oracle.adapter', fs.existsSync(path.join(ROOT, 'adapters/ats/oraclecloud.js')));
  const oracle = fs.readFileSync(path.join(ROOT, 'adapters/ats/oraclecloud.js'), 'utf8');
  record('oracle.email_next', /fillEmailTermsNext/.test(oracle) && /NEXT/.test(oracle));
  record('runner.same_tab', /isSameTabRedetect/.test(runner));
  record('runner.oracle_inject', /oraclecloud\.js/.test(runner));

  // Preserve 1.26.4 panel trio
  record('preserve.panel_trio', /Start/.test(panel) && /Pause/.test(panel) && /Cancel/.test(panel));
  record('preserve.no_companion', !fs.existsSync(path.join(ROOT, 'lib/companion-nav.js')));

  console.log('\n=== 1.26.5 E2E module validation matrix ===');
})();

Promise.resolve()
  .then(function () {
    return suite.finish();
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
