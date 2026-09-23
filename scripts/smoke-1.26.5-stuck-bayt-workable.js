/**
 * 1.26.5 smoke: stuck-run clear; no tab create on unknown/failure;
 * Bayt exclude location; Apply with CV / Apply for this Job;
 * Workable years + entertainment No + address shape.
 * Run: node scripts/smoke-1.26.5-stuck-bayt-workable.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-1.26.5-stuck-bayt-workable');
const ROOT = path.join(__dirname, '..');

(function versions() {
  const manif = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  suite.ok(/^1\.26\./.test(manif.version), 'manifest 1.26.x (got ' + manif.version + ')');
  suite.ok(/^1\.26\./.test(pkg.version), 'package 1.26.x (got ' + pkg.version + ')');
})();

(function stuckRunClear() {
  const runner = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
  suite.ok(/function clearCurrentTabRunLock/.test(runner), 'clearCurrentTabRunLock defined');
  suite.ok(/function throwIfAborted/.test(runner), 'throwIfAborted defined');
  suite.ok(/function isFailureOrHumanPause/.test(runner), 'isFailureOrHumanPause defined');
  const stopIdx = runner.indexOf('async function stopRunner');
  const stopSlice = stopIdx >= 0 ? runner.slice(stopIdx, stopIdx + 900) : '';
  suite.ok(stopSlice.indexOf('clearCurrentTabRunLock') !== -1, 'stopRunner clears run lock');
  suite.ok(
    /currentTabRunActive && currentTabAbort/.test(runner),
    'Start clears stale lock after Cancel'
  );
  suite.ok(
    /Cancelled by user/.test(runner) && /ABORTED/.test(runner),
    'abort error code for Cancel mid-run'
  );
})();

(function noTabHopOnFailure() {
  const runner = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
  suite.ok(/isFailureOrHumanPause\(fillResult\)/.test(runner), 'adopt guards use failure pause');
  suite.ok(
    /intentionalOpen && !isFailureOrHumanPause/.test(runner),
    'pickEmployer only after intentional open'
  );
  const fill = fs.readFileSync(path.join(ROOT, 'content/fill.js'), 'utf8');
  suite.ok(/pauseReason:\s*'no_form_fields'/.test(fill) || /paused on same tab/.test(fill), 'no fields → pause same tab');
  suite.ok(/apply with \(cv\|resume\|curriculum\)/i.test(fill), 'Apply with CV gate before empty form');
})();

(function baytExcludeLocation() {
  const src = fs.readFileSync(path.join(ROOT, 'lib/synonyms.js'), 'utf8');
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  Function('globalThis', 'self', src)(sandbox, sandbox);
  const S = sandbox.FillApplySynonyms;
  suite.ok(!!S, 'synonyms loaded');
  suite.ok(S.isExcludedApplyCta('Saudi Arabia'), 'Saudi Arabia excluded');
  suite.ok(S.isExcludedApplyCta('SHORTLIST'), 'SHORTLIST excluded');
  suite.ok(S.isExcludedApplyCta('Save job'), 'Save job excluded');
  suite.ok(S.isExcludedApplyCta('Riyadh'), 'Riyadh chip excluded');
  suite.ok(S.isApplyStartCta('Apply'), 'Apply is start CTA');
  suite.ok(S.isApplyStartCta('APPLY') || S.scoreApplyStartText('APPLY') >= 85, 'APPLY scores high');
  suite.ok(S.isApplyStartCta('Apply with CV'), 'Apply with CV is start CTA');
  suite.ok(S.isApplyStartCta('Apply for this Job'), 'Apply for this Job is start CTA');
  suite.ok(S.scoreApplyStartText('Apply with CV') >= 90, 'Apply with CV high score');
  suite.ok(S.scoreApplyStartText('Apply for this Job') >= 90, 'Apply for this Job high score');
  suite.equal(S.scoreApplyStartText('Saudi Arabia'), 0, 'Saudi Arabia scores 0');
  suite.ok(
    S.isApplyStartCtaForHost('Easy Apply', 'www.bayt.com') === true,
    'Bayt Easy Apply host-aware'
  );
})();

(function workableYearsEntertainmentAddress() {
  const FmtSrc = fs.readFileSync(path.join(ROOT, 'lib/format.js'), 'utf8');
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  Function('globalThis', 'self', FmtSrc)(sandbox, sandbox);
  const F = sandbox.FillApplyFormat;
  suite.ok(!!F, 'format loaded');
  const labels = ['Less than 5', '5–10', '10–15', '+15 years'];
  // matchBucketIndex via formatValue / matchOption — use parse through public API
  suite.ok(typeof F.composeAddress === 'function', 'composeAddress');
  suite.ok(typeof F.looksLikeComposedAddressJunk === 'function', 'junk detector');
  suite.ok(
    F.looksLikeComposedAddressJunk('Riyadh, Riyadh 12791, Saudi Arabia, Riyadh, 12791, Saudi Arabia'),
    'detects duplicated address junk'
  );
  const parts = F.composeAddress(
    {
      addressLine1: '',
      address: 'Riyadh, Riyadh 12791, Saudi Arabia, Riyadh, 12791, Saudi Arabia',
      city: 'Riyadh',
      zip: '12791',
      addressCountry: 'Saudi Arabia'
    },
    'parts'
  );
  suite.equal(parts.line1, '', 'line1 empty when only junk address');
  suite.equal(parts.city, 'Riyadh', 'city kept');
  suite.equal(parts.zip, '12791', 'zip kept');
  suite.equal(parts.country, 'Saudi Arabia', 'country kept');

  // Bucket: +15 years must contain 16 and prefer over 10-15 for 15+
  // Use matchSelect-like API if exposed — fall back to source contract
  suite.ok(/\+15 years/.test(FmtSrc) || /plusBefore/.test(FmtSrc), 'parseBucket handles +15 prefix');

  const workable = fs.readFileSync(path.join(ROOT, 'adapters/ats/workable.js'), 'utf8');
  suite.ok(/webook\\.com/i.test(workable), 'webook.com detect');
  suite.ok(/entertainment_industry/.test(workable), 'entertainment answers seeded');
  suite.ok(/years_of_experience_bucket/.test(workable) || /\+15 years/.test(workable), 'years bucket seeded');

  // Live enrichProfile if adapter registers
  const page = createPage(
    '<form><label>Years of experience</label><select id="y"><option>Less than 5</option><option>5–10</option><option>10–15</option><option>+15 years</option></select></form>',
    ['lib/format.js', 'adapters/registry.js', 'adapters/ats/workable.js']
  );
  // workable registers on FillApplyRegistry — enrichProfile may be on adapter
  const reg = page.window.FillApplyRegistry;
  let adapter = null;
  if (reg && reg.list) {
    const all = reg.list();
    adapter = (all || []).find(function (a) { return a.id === 'workable'; }) || null;
  }
  if (!adapter && page.window.FillApply_workableAdapter) adapter = page.window.FillApply_workableAdapter;
  // workable.js doesn't export global adapter var — call enrich via source evaluation already done through detect path
  // Soft check: registry detect webook
  if (reg && typeof reg.detect === 'function') {
    const d = reg.detect('https://www.webook.com/careers/job/1', page.document);
    suite.ok(!!d && d.id === 'workable', 'detect webook as workable');
  } else {
    suite.ok(/webook\\.com/i.test(workable), 'webook detect in source');
  }

  // years bucket match via FillApplyFormat.matchBestOption or similar
  suite.ok(typeof F.matchBucketIndex === 'function', 'matchBucketIndex exported');
  const idx15plus = F.matchBucketIndex(labels, '15+');
  suite.equal(idx15plus, 3, '15+ prefers +15 years (got ' + idx15plus + ')');
  const idx16 = F.matchBucketIndex(labels, '16');
  suite.equal(idx16, 3, '16 maps to +15 years (got ' + idx16 + ')');
  const idx12 = F.matchBucketIndex(labels, '12');
  suite.equal(idx12, 2, '12 maps to 10-15 (got ' + idx12 + ')');
  const parsed = F.parseBucket('+15 years');
  suite.ok(parsed && parsed.max === Infinity && parsed.min === 15, '+15 years is open-ended bucket');
})();

(function mpAshbyContracts() {
  const mp = fs.readFileSync(path.join(ROOT, 'adapters/agencies/michaelpage.js'), 'utf8');
  suite.ok(/Apply with CV visible/.test(mp) || /apply_with_cv/.test(mp), 'MP Apply with CV path');
  suite.ok(/paused on same popup/.test(mp), 'MP pause on same popup');
  const ashby = fs.readFileSync(path.join(ROOT, 'adapters/ats/ashby.js'), 'utf8');
  suite.ok(/Clicked Apply for this Job/.test(ashby), 'Ashby clicks Apply for this Job');
  suite.ok(/waiting for application form \(same tab\)/.test(ashby), 'Ashby stays on same tab');
})();

(function authSocialPrefer() {
  const signup = fs.readFileSync(path.join(ROOT, 'lib/signup-login.js'), 'utf8');
  suite.ok(/tryPreferSocialContinue/.test(signup), 'social continue helper');
  suite.ok(/Continue with Google|continue with google/i.test(signup), 'Google continue');
  suite.ok(/continue as/i.test(signup), 'Continue as');
  suite.ok(/paused on same popup/i.test(signup), 'auth pause same popup');
})();


const workdayOraclePromise = (function workdayOracleContracts() {
  const workday = fs.readFileSync(path.join(ROOT, 'adapters/ats/workday.js'), 'utf8');
  suite.ok(/Apply Manually/.test(workday), 'Workday Apply Manually');
  suite.ok(/Autofill with Resume/.test(workday), 'Workday Autofill with Resume');
  suite.ok(/stayOnTab/.test(workday), 'Workday stayOnTab');
  suite.ok(/Start Your Application|hasStartApplicationModal/.test(workday), 'Workday start modal');
  const oracle = fs.readFileSync(path.join(ROOT, 'adapters/ats/oraclecloud.js'), 'utf8');
  suite.ok(/oraclecloud/.test(oracle), 'oraclecloud adapter');
  suite.ok(/fillEmailTermsNext|Email Address|terms and conditions/i.test(oracle), 'Oracle email+terms');
  suite.ok(/NEXT/.test(oracle), 'Oracle NEXT');
  suite.ok(/stayOnTab/.test(oracle), 'Oracle stayOnTab');
  const runner = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
  suite.ok(/oraclecloud\.js/.test(runner), 'runner injects oraclecloud');
  suite.ok(/isSameTabRedetect/.test(runner), 'same-tab redetect helper');
  const page = createPage(
    `<div role="dialog">
      <h2>Start Your Application</h2>
      <button>Autofill with Resume</button>
      <button id="manual">Apply Manually</button>
      <button>Use My Last Application</button>
      <button>Apply With LinkedIn</button>
    </div>`,
    ['adapters/registry.js', 'adapters/ats/workday.js']
  );
  const W = page.window.FillApply_workdayAdapter;
  suite.ok(!!W, 'workday adapter global');
  suite.ok(W.hasStartApplicationModal(page.document), 'detects start modal');
  const click = W.clickStartModalOption(page.document, false);
  suite.ok(click.clicked, 'clicked a start option');
  suite.ok(/Apply Manually/i.test(click.text || ''), 'preferred Apply Manually got ' + click.text);

  const page2 = createPage(
    `<main>
      <h1>You don't need to have an account</h1>
      <label for="em">Email Address *</label>
      <input id="em" type="email" />
      <label><input id="terms" type="checkbox" /> I agree with the terms and conditions *</label>
      <button type="button">CANCEL</button>
      <button type="button" id="next">NEXT</button>
    </main>`,
    ['adapters/registry.js', 'adapters/ats/oraclecloud.js']
  );
  const O = page2.window.FillApply_oraclecloudAdapter;
  suite.ok(!!O, 'oracle adapter global');
  suite.ok(O.isEmailApplyStep(page2.document), 'detects email apply step');
  return O.fillEmailTermsNext(page2.document, { email: 'alex@example.com' }).then(function (step) {
    suite.ok(step.emailFilled, 'oracle email filled');
    suite.ok(step.termsChecked, 'oracle terms checked');
    suite.ok(step.nextClicked, 'oracle NEXT clicked');
    suite.equal(page2.document.getElementById('em').value, 'alex@example.com', 'email value');
    suite.ok(page2.document.getElementById('terms').checked, 'terms checked in DOM');
  });
})();

(async function unknownNoWindowOpen() {
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
  const html = `
    <main>
      <h1>Job</h1>
      <form id="application-form">
        <label for="fn">First name</label><input id="fn" name="first_name" required />
        <label for="q">Mystery screening?</label><input id="q" name="mystery_screening" required />
        <button type="button">Apply Now</button>
      </form>
    </main>`;
  const page = createPage(html, LIBS);
  let tabsCreated = 0;
  page.window.open = function () {
    tabsCreated += 1;
    return null;
  };
  const fillResult = await page.window.__fillApply.run(
    { firstName: 'Alex', email: 'alex@example.com' },
    { skipCvImport: true, dependentWaitMs: 10, maxDependentPasses: 0 }
  );
  suite.ok(!!fillResult.needsHuman || fillResult.ok === false, 'unknown/failure path');
  suite.equal(tabsCreated, 0, 'no window.open on unknown/failure');
})();

Promise.resolve(workdayOraclePromise)
  .then(function () {
    return suite.finish();
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
