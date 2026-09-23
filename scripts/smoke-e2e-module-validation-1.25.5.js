/**
 * E2E module validation for 1.25.5 — pass/fail matrix covering:
 * JobPool open→mark, apply-start synonyms, signup/login password fill,
 * phone combined/split + country (no American Samoa for SA/+966),
 * companion nav-no-stall, auth-wall password present vs absent,
 * panel left + manifest sidepanel removed.
 *
 * Run: node scripts/smoke-e2e-module-validation-1.25.5.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-e2e-module-validation-1.25.5');
const ROOT = path.join(__dirname, '..');
const matrix = [];

function record(module, ok, detail) {
  matrix.push({ module: module, ok: !!ok, detail: detail || '' });
  suite.ok(ok, module + (detail ? ' — ' + detail : ''));
}

const FILL_LIBS = [
  'lib/dom-deep.js',
  'lib/format.js',
  'lib/synonyms.js',
  'lib/field-map.js',
  'lib/control-adapter.js',
  'lib/files.js',
  'lib/auth-walls.js',
  'lib/signup-login.js',
  'lib/environment-store.js',
  'content/focus-hud.js',
  'content/fill.js'
];

(async function main() {
  // --- Manifest / sidepanel removed ---
  const manif = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  record(
    'manifest.version',
    (manif.version === '1.25.5' || manif.version === '1.25.6'),
    'got ' + manif.version + ' (accept 1.25.5+)'
  );
  record(
    'manifest.sidepanel_removed',
    !manif.side_panel && !(manif.permissions || []).includes('sidePanel'),
    'side_panel=' + !!manif.side_panel
  );
  record(
    'manifest.popup',
    !!(manif.action && manif.action.default_popup),
    (manif.action && manif.action.default_popup) || 'missing'
  );
  const popupHtml = fs.readFileSync(path.join(ROOT, 'popup/popup.html'), 'utf8');
  record(
    'popup.settings_button',
    /id="btnOptions"/.test(popupHtml) && /Settings/i.test(popupHtml),
    'Settings via btnOptions'
  );
  const sw = fs.readFileSync(path.join(ROOT, 'background/service-worker.js'), 'utf8');
  record(
    'sw.sidepanel_disabled',
    /disableSidePanelIfPresent/.test(sw) && !/openPanelOnActionClick:\s*true/.test(sw),
    'side panel not opened on action click'
  );

  // --- Apply-start synonyms ---
  const synPage = createPage('<div></div>', ['lib/synonyms.js']);
  const S = synPage.window.FillApplySynonyms;
  const starts = [
    'Apply',
    'Easy Apply',
    'Start Apply',
    'Start Application',
    'Begin Application',
    'Continue Application',
    'Apply Now'
  ];
  // Easy Apply excluded by generic isApplyStartCta but host-aware may allow
  let startOk = true;
  starts.forEach(function (t) {
    if (t === 'Easy Apply') {
      if (!S.isEasyApplyCta(t)) startOk = false;
    } else if (!S.isApplyStartCta(t) && !S.isContinueCta(t)) {
      startOk = false;
    }
  });
  record('apply_start_synonyms', startOk, starts.join(', '));

  // --- JobPool open→mark hooks remain ---
  record(
    'jobpool_open_mark_hooks',
    S.DATA_JOBPOOL_APPLY === 'jobpool-apply' &&
      S.DATA_JOBPOOL_MARK_APPLIED === 'jobpool-mark-applied',
    'data attrs present'
  );

  // --- Signup/login password fill ---
  const signupHtml = `
    <form id="create">
      <h2>Create a login to access your application</h2>
      <label>Email <input id="em" type="email" name="email" /></label>
      <label>Password <input id="pw" type="password" name="password" /></label>
      <label>Password (Re-enter) <input id="pw2" type="password" name="password_confirm" /></label>
    </form>`;
  const signupPage = createPage(signupHtml, [
    'lib/auth-walls.js',
    'lib/signup-login.js',
    'lib/environment-store.js'
  ]);
  const Signup = signupPage.window.FillApplySignupLogin;
  const Auth = signupPage.window.FillApplyAuthWalls;
  const withPw = {
    email: 'czahidali.accacma@gmail.com',
    password: 'Zahid@Finance786'
  };
  const filled = Signup.fillCredentials(signupPage.document, withPw);
  record(
    'signup_password_fill',
    filled.ok &&
      signupPage.document.getElementById('pw').value === 'Zahid@Finance786' &&
      signupPage.document.getElementById('pw2').value === 'Zahid@Finance786',
    'filled=' + filled.filled
  );
  const gateWith = Signup.shouldPauseForAuth(signupPage.document, withPw);
  record('auth_wall_password_present', !gateWith.pause, gateWith.detail || 'no pause');
  const gateWithout = Signup.shouldPauseForAuth(signupPage.document, {
    email: 'czahidali.accacma@gmail.com'
  });
  record('auth_wall_password_absent', !!gateWithout.pause, gateWithout.detail || 'pause');

  // --- Phone combined / split + no American Samoa ---
  const fmtPage = createPage('<div></div>', ['lib/format.js', 'lib/field-map.js']);
  const F = fmtPage.window.FillApplyFormat;
  const M = fmtPage.window.FillApplyFieldMap;
  const labels = [
    'Select',
    '(+1684) American Samoa',
    '(+1) United States',
    '(+966) Saudi Arabia',
    '(+971) United Arab Emirates'
  ];
  const saHit = F.matchOptionIndex(labels, 'SA', 'country');
  const dialHit = F.matchOptionIndex(labels, '+966', 'phoneCountry');
  record(
    'phone_country_no_samoa',
    saHit && labels[saHit.index].indexOf('Saudi') !== -1,
    saHit ? labels[saHit.index] : 'null'
  );
  record(
    'phone_dial_966',
    dialHit && /966/.test(labels[dialHit.index]),
    dialHit ? labels[dialHit.index] : 'null'
  );
  record(
    'residence_not_phoneCountry',
    M.bestKeyForField({
      label: 'Country / Region of Residence',
      name: 'country',
      type: 'select-one'
    }) === 'country',
    M.bestKeyForField({
      label: 'Country / Region of Residence',
      name: 'country',
      type: 'select-one'
    })
  );
  record(
    'qualification_title_is_degree',
    M.bestKeyForField({
      label: 'Qualification Title',
      name: 'qualification_title',
      type: 'text'
    }) === 'degree',
    'mapped'
  );

  const phonePage = createPage(
    `<form>
      <label for="cc">Phone Country Code</label>
      <select id="cc" name="phone_country">
        <option value="">Select</option>
        <option value="AS">(+1684) American Samoa</option>
        <option value="US">(+1) United States</option>
        <option value="SA">(+966) Saudi Arabia</option>
      </select>
      <label for="ph">Mobile number</label>
      <input id="ph" name="phone" type="tel" />
      <label for="co">Country / Region of Residence</label>
      <select id="co" name="country">
        <option value="">Select</option>
        <option value="AS">American Samoa</option>
        <option value="SA">Saudi Arabia</option>
        <option value="PK">Pakistan</option>
      </select>
      <label for="nat">Nationality</label>
      <select id="nat" name="nationality">
        <option value="">Select</option>
        <option value="PK">Pakistani</option>
        <option value="SA">Saudi</option>
      </select>
      <label for="qt">Qualification Title</label>
      <input id="qt" name="qualification_title" type="text" />
      <label for="yr">Year</label>
      <input id="yr" name="year" type="text" />
      <label for="title">Title</label>
      <select id="title" name="title">
        <option value="">Select</option>
        <option value="Mr">Mr.</option>
        <option value="Ms">Ms.</option>
      </select>
    </form>`,
    FILL_LIBS
  );
  const PROFILE = {
    salutation: 'Mr.',
    title: 'Mr.',
    firstName: 'Zahid',
    lastName: 'Ali',
    email: 'czahidali.accacma@gmail.com',
    phone: '504131857',
    phoneCountry: '+966',
    phoneFull: '+966504131857',
    country: 'Saudi Arabia',
    nationality: 'Pakistani',
    degree: 'MBA Executive Finance',
    education: 'MBA Executive Finance, Virtual University of Pakistan, 2018',
    password: 'Zahid@Finance786'
  };
  await phonePage.window.__fillApply.run(PROFILE, { formWaitMs: 50, runMode: 'fill' });
  const d = phonePage.document;
  record(
    'phone_split_country',
    d.getElementById('cc').value === 'SA' || /966/.test(d.getElementById('cc').selectedOptions[0].text),
    'cc=' + d.getElementById('cc').value
  );
  record(
    'phone_split_national',
    d.getElementById('ph').value === '504131857' || /504131857$/.test(d.getElementById('ph').value),
    'ph=' + d.getElementById('ph').value
  );
  record(
    'residence_saudi',
    d.getElementById('co').value === 'SA',
    'co=' + d.getElementById('co').value
  );
  record(
    'nationality_pakistani',
    d.getElementById('nat').value === 'PK' || /Pakistani/i.test(d.getElementById('nat').selectedOptions[0].text),
    'nat=' + d.getElementById('nat').value
  );
  record(
    'qualification_not_mr',
    !/^(mr\.?)$/i.test(d.getElementById('qt').value.trim()) &&
      /MBA/i.test(d.getElementById('qt').value),
    'qt=' + d.getElementById('qt').value
  );
  record(
    'year_not_mba',
    d.getElementById('yr').value === '2018',
    'yr=' + d.getElementById('yr').value + ' (must not be MBA)'
  );
  record(
    'salutation_title_mr',
    /mr/i.test(d.getElementById('title').value || d.getElementById('title').selectedOptions[0].text),
    'title=' + d.getElementById('title').value
  );

  // Combined E.164
  const comb = createPage(
    `<form><label>Phone <input id="ph" name="phone" type="tel" autocomplete="tel" /></label></form>`,
    FILL_LIBS
  );
  await comb.window.__fillApply.run(PROFILE, { formWaitMs: 50 });
  record(
    'phone_combined_e164',
    /^\+966504131857$/.test(comb.document.getElementById('ph').value),
    comb.document.getElementById('ph').value
  );

  // --- Companion nav-no-stall ---
  const cPage = createPage(
    `<main><h1>Gate</h1><button type="button" id="start">Start Application</button></main>`,
    ['lib/synonyms.js', 'lib/companion-nav.js']
  );
  const C = cPage.window.FillApplyCompanionNav;
  record('companion_nav_only', C.isNavOnlyPage(cPage.document), 'no fillable fields');
  let cClicks = 0;
  cPage.document.getElementById('start').addEventListener('click', function () {
    cClicks += 1;
  });
  const cRes = C.clickCompanionNav(cPage.document);
  record('companion_clicks_start_app', cRes.clicked && cClicks === 1, 'clicks=' + cClicks);
  record(
    'companion_settle_bounded',
    C.DEFAULT_SETTLE_MS <= 5000 && C.DEFAULT_MAX_WAIT_MS <= 60000,
    'settle=' + C.DEFAULT_SETTLE_MS + ' max=' + C.DEFAULT_MAX_WAIT_MS
  );
  const settle = await C.waitForSettle({
    document: cPage.document,
    settleMs: 80,
    maxWaitMs: 2000,
    pollMs: 20
  });
  record(
    'companion_settle_with_cta',
    settle.settled === true,
    settle.reason || 'settled'
  );

  // --- Panel left preference ---
  const panelPage = createPage(
    `<form id="application-form"><label>Name <input name="n" /></label><button>Apply</button></form>`,
    ['content/page-panel.js']
  );
  const P = panelPage.window.FillApplyPagePanel;
  const anchor = P.pickAnchor(
    { width: 1280, height: 800 },
    { width: P.PANEL_WIDTH, height: P.PANEL_HEIGHT },
    [{ left: 900, top: 0, right: 1280, bottom: 800 }]
  );
  record('panel_prefers_left', /left/.test(anchor.id), 'slot=' + anchor.id);

  // --- Print matrix ---
  console.log('\n=== 1.25.5 E2E module validation matrix ===');
  matrix.forEach(function (row) {
    console.log((row.ok ? 'PASS' : 'FAIL') + '\t' + row.module + (row.detail ? '\t' + row.detail : ''));
  });
  const failed = matrix.filter(function (r) {
    return !r.ok;
  }).length;
  console.log('---');
  console.log(failed ? failed + ' failed of ' + matrix.length : 'All ' + matrix.length + ' modules passed');

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
