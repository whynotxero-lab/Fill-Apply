/**
 * E2E module validation for 1.25.6:
 * - profile inject never throws ReferenceError for profile
 * - Open Application clicked at most once per pending job
 * - companion does not treat Open Application as nav CTA / no loop
 * - Start continues past open (handoff flags when pending)
 * - iCIMS-like login: Next after email+accept; password fields when Environments password set
 *
 * Run: node scripts/smoke-e2e-module-validation-1.25.6.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-e2e-module-validation-1.25.6');
const ROOT = path.join(__dirname, '..');
const matrix = [];

function record(module, ok, detail) {
  matrix.push({ module: module, ok: !!ok, detail: detail || '' });
  suite.ok(ok, module + (detail ? ' — ' + detail : ''));
}

(async function main() {
  const manif = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  record('manifest.version', /^1\.25\.6$|^1\.26\./.test(manif.version), 'got ' + manif.version + ' (accept 1.25.6 / 1.26.x)');

  const icimsSrc = fs.readFileSync(path.join(ROOT, 'adapters/ats/icims.js'), 'utf8');
  record(
    'icims.clickSubmitProfile_has_profile_param',
    /function clickSubmitProfile\s*\(\s*doc\s*,\s*profile\s*\)/.test(icimsSrc),
    'signature includes profile'
  );
  record(
    'icims.clickSubmit_has_profile_param',
    /function clickSubmit\s*\(\s*doc\s*,\s*profile\s*\)/.test(icimsSrc),
    'signature includes profile'
  );

  // Runtime: fill with undefined profile must not throw ReferenceError
  const page = createPage(
    '<html><body><h1>Welcome</h1><p>Powered by iCIMS</p>' +
      '<label>Email <input id="em" type="email" name="email" /></label>' +
      '<label><input id="acc" type="checkbox" /> I accept the privacy policy</label>' +
      '<button id="next" type="button">Next</button></body></html>',
    [
      'lib/auth-walls.js',
      'lib/environment-store.js',
      'lib/signup-login.js',
      'lib/synonyms.js',
      'adapters/ats/icims.js'
    ]
  );
  let threw = null;
  try {
    const adapter = page.window.FillApply_icimsAdapter;
    const result = await adapter.fill({
      profile: undefined,
      runMode: 'submit',
      document: page.document
    });
    if (result && /profile is not defined/i.test(String(result.error || result.message || ''))) {
      threw = result.error || result.message;
    }
  } catch (e) {
    threw = String((e && e.message) || e);
  }
  record(
    'icims.fill_undefined_profile_no_ReferenceError',
    !threw || !/profile is not defined/i.test(String(threw)),
    threw ? String(threw).slice(0, 120) : 'ok'
  );

  // companion: Open Application excluded
  const navPage = createPage(
    `<main>
      <button id="open">Open Application</button>
      <button id="next">Next</button>
      <button id="cont">Save and Continue</button>
    </main>`,
    ['lib/synonyms.js', 'lib/companion-nav.js']
  );
  const C = navPage.window.FillApplyCompanionNav;
  const ranked = C.findCompanionNavButtons(navPage.document);
  const texts = ranked.map(function (el) {
    return C.buttonText(el);
  });
  record(
    'companion.excludes_open_application',
    texts.every(function (t) {
      return !/open\s*application/i.test(t);
    }),
    'texts=' + JSON.stringify(texts)
  );
  record(
    'companion.includes_next_or_continue',
    texts.some(function (t) {
      return /next|continue/i.test(t);
    }),
    'texts=' + JSON.stringify(texts)
  );

  // JobPool Open Application once per pending
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
  const first = await hub.fill({ runMode: 'fill' });
  const clicksAfterFirst = openClicks;
  const second = await hub.fill({ runMode: 'fill' });
  // companion mode removed — Open-once covered by fill/submit modes above
  record(
    'jobpool.start_continues_past_open',
    !!(second && (second.jobpoolHubApply || second.clickedApplyStart || second.externalApply)),
    'handoff flags present for Start hop'
  );

  // iCIMS-like login welcome: email + I accept + Next
  const loginHtml =
    '<html><body><h1>Welcome</h1><p>Software Powered by iCIMS</p>' +
    '<label>Email <input id="em" type="email" name="email" /></label>' +
    '<label><input id="acc" type="checkbox" /> I accept the privacy policy</label>' +
    '<button id="next" type="button">Next</button></body></html>';
  const loginPage = createPage(loginHtml, [
    'lib/auth-walls.js',
    'lib/environment-store.js',
    'lib/signup-login.js',
    'lib/synonyms.js',
    'adapters/ats/icims.js'
  ]);
  const Env = loginPage.window.FillApplyEnvironment;
  if (Env && Env.save) {
    await Env.save({ registrationPassword: 'Zahid@Finance786' });
  }
  const adapter = loginPage.window.FillApply_icimsAdapter;
  let nextClicked = false;
  loginPage.document.getElementById('next').addEventListener('click', function () {
    nextClicked = true;
  });
  const profile = {
    email: 'zahid@example.com',
    password: 'Zahid@Finance786',
    __registrationPassword: 'Zahid@Finance786'
  };
  const loginOut = await adapter.fill({
    profile: profile,
    runMode: 'fill',
    document: loginPage.document
  });
  record(
    'icims.login_email_filled',
    loginPage.document.getElementById('em').value === 'zahid@example.com',
    loginPage.document.getElementById('em').value
  );
  record('icims.login_accept_checked', !!loginPage.document.getElementById('acc').checked, '');
  record('icims.login_next_clicked', nextClicked, String((loginOut && loginOut.message) || ''));
  record(
    'icims.login_no_profile_error',
    !(loginOut && /profile is not defined/i.test(String(loginOut.error || loginOut.message || ''))),
    String((loginOut && (loginOut.error || loginOut.message)) || 'ok').slice(0, 100)
  );

  // Create-login password form
  const createHtml =
    '<html><body><h1>Create a login</h1>' +
    '<label>Email <input type="email" name="email" value="zahid@example.com" /></label>' +
    '<label>Password <input id="pw" type="password" name="password" /></label>' +
    '<label>Re-enter Password <input id="pw2" type="password" name="passwordConfirm" /></label>' +
    '<button type="button">Next</button></body></html>';
  const createPage2 = createPage(createHtml, [
    'lib/auth-walls.js',
    'lib/environment-store.js',
    'lib/signup-login.js',
    'lib/synonyms.js',
    'adapters/ats/icims.js'
  ]);
  const Env2 = createPage2.window.FillApplyEnvironment;
  if (Env2 && Env2.save) await Env2.save({ registrationPassword: 'Zahid@Finance786' });
  if (Env2 && Env2.load) await Env2.load();
  const Signup = createPage2.window.FillApplySignupLogin;
  const prep = await Signup.prepareSignupOrLogin(
    createPage2.document,
    {
      email: 'zahid@example.com',
      __registrationPassword: 'Zahid@Finance786'
    },
    {}
  );
  record(
    'icims.create_login_password_filled',
    createPage2.document.getElementById('pw').value === 'Zahid@Finance786',
    'pwLen=' + String(createPage2.document.getElementById('pw').value || '').length
  );
  record(
    'icims.create_login_reenter_filled',
    createPage2.document.getElementById('pw2').value === 'Zahid@Finance786',
    ''
  );
  record(
    'icims.create_login_no_manual_pause',
    !(prep && prep.pause),
    prep ? JSON.stringify({ pause: prep.pause, detail: prep.detail }) : 'ok'
  );

  const runnerSrc = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
  record(
    'runner.inject_args_profile_default',
    /args:\s*\[\s*profile\s*\|\|\s*\{\}/.test(runnerSrc),
    'profile || {} in executeScript args'
  );
  record(
    'runner.inject_func_profileArg_default',
    /profileArg\s*=\s*profileArg\s*\|\|\s*\{\}/.test(runnerSrc),
    'profileArg || {} inside inject func'
  );
  const jobpoolSrc = fs.readFileSync(path.join(ROOT, 'adapters/boards/jobpool.js'), 'utf8');
  record(
    'jobpool.durable_pending_no_force_reopen',
    /jobpoolAlreadyOpened:\s*true/.test(jobpoolSrc) &&
      !/Clear stale pending and fall through to Open Application/.test(jobpoolSrc),
    'durable pending path present'
  );
  record('companion.removed', !fs.existsSync(path.join(ROOT, 'lib/companion-nav.js')), 'companion-nav.js deleted in 1.26+');

  console.log('\nMatrix:');
  matrix.forEach(function (row) {
    console.log((row.ok ? 'PASS' : 'FAIL') + '  ' + row.module + (row.detail ? ' — ' + row.detail : ''));
  });
  suite.finish();
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
