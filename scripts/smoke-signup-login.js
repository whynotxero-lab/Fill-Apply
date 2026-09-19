/**
 * Common signup/login (v1.18.7):
 * - fill Email + Retype Email / Password + Retype when profile.password set
 * - pause auth wall when password missing (never invent)
 * - prefer Sign in when "Already a registered user? Please sign in"
 * - AF-style dropdown labels (Title, Nationality, Country/Region Code, hear, Terms)
 * - import preserves password; export strips it
 * - never learn passwords into adaptive KB
 *
 * Run: node scripts/smoke-signup-login.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-signup-login');

const SIGNUP_LIBS = [
  'lib/dom-deep.js',
  'lib/format.js',
  'lib/synonyms.js',
  'lib/field-map.js',
  'lib/files.js',
  'lib/auth-walls.js',
  'lib/signup-login.js',
  'content/focus-hud.js',
  'content/fill.js'
];

const PROFILE_WITH_PW = {
  firstName: 'Chaudhary',
  lastName: 'Ali',
  email: 'czahidali.accacma@gmail.com',
  password: 'profile-password-field',
  confirm_password: 'profile-password-field',
  retype_password: 'profile-password-field',
  confirm_email: 'czahidali.accacma@gmail.com',
  retype_email: 'czahidali.accacma@gmail.com',
  title: 'Mr',
  salutation: 'Mr',
  nationality: 'Pakistani',
  country: 'Saudi Arabia',
  phone: '504131857',
  phoneCountry: 'Saudi Arabia (+966)',
  referralSource: 'Job Board',
  customAnswers: {
    password: 'profile-password-field',
    confirm_password: 'profile-password-field',
    retype_password: 'profile-password-field',
    confirm_email: 'czahidali.accacma@gmail.com',
    retype_email: 'czahidali.accacma@gmail.com',
    'How did you hear about this position?': 'Job Board',
    'Are you a previous Al-Futtaim Group employee?': 'No',
    'Are you currently employed with any Al-Futtaim Group company': 'No',
    'Do you have any family members in the Al-Futtaim Group?': 'No',
    'Are you a member of the Al Futtaim Schools alumni?': 'Not Applicable',
    accept_data_privacy: 'Yes',
    terms_of_use_accepted: 'Yes',
    'Date of Birth': '',
    'What is your current monthly salary (In Job Location Currency)?': ''
  }
};

const PROFILE_NO_PW = {
  firstName: 'Chaudhary',
  lastName: 'Ali',
  email: 'czahidali.accacma@gmail.com'
};

(async function main() {
  // 1) Field-map: email confirm + password confirm + AF labels
  await (async function fieldMapAliases() {
    const page = createPage('<html><body></body></html>', [
      'lib/field-map.js'
    ]);
    const M = page.window.FillApplyFieldMap;
    suite.ok(M, 'field map loaded');
    const emailConfirm = M.bestKeyForField({
      label: 'Retype Email',
      name: 'confirm_email',
      type: 'email'
    });
    suite.equal(emailConfirm, 'emailConfirm', 'Retype Email → emailConfirm');
    const pwConfirm = M.bestKeyForField({
      label: 'Retype Password',
      name: 'confirm_password',
      type: 'password'
    });
    suite.equal(pwConfirm, 'passwordConfirm', 'Retype Password → passwordConfirm');
    const phoneCc = M.bestKeyForField({
      label: 'Country/Region Code',
      name: 'country_region_code',
      type: 'select-one'
    });
    suite.equal(phoneCc, 'phoneCountry', 'Country/Region Code → phoneCountry');
    const hear = M.answerForLabel(PROFILE_WITH_PW, 'How did you hear about this position?');
    suite.ok(!hear.missing && /job board/i.test(hear.value), 'AF how-did-you-hear from customAnswers');
  })();

  // 2) Fill register form when profile password set
  await (async function fillRegisterWithPassword() {
    const page = createPage(
      `
      <form id="sf-register">
        <h1>Create an account</h1>
        <label for="fn">First Name</label><input id="fn" name="firstName" />
        <label for="ln">Last Name</label><input id="ln" name="lastName" />
        <label for="em">Email</label><input id="em" name="email" type="email" />
        <label for="em2">Retype Email</label><input id="em2" name="confirm_email" type="email" />
        <label for="pw">Password</label><input id="pw" name="password" type="password" />
        <label for="pw2">Retype Password</label><input id="pw2" name="confirm_password" type="password" />
        <label for="title">Title</label>
        <select id="title"><option value="">Select</option><option>Mr</option><option>Ms</option></select>
        <label for="nat">Nationality</label>
        <select id="nat"><option value="">Select</option><option>Pakistani</option><option>Saudi</option></select>
        <label for="res">Country of Residence</label>
        <select id="res"><option value="">Select</option><option>Saudi Arabia</option></select>
        <label for="cc">Country/Region Code</label>
        <select id="cc"><option value="">Select</option><option>Saudi Arabia (+966)</option><option>UAE (+971)</option></select>
        <label for="ph">Phone</label><input id="ph" name="phone" />
        <label for="hear">How did you hear about this position?</label>
        <select id="hear"><option value="">Select</option><option>Job Board</option><option>LinkedIn</option></select>
        <label for="prev">Are you a previous Al-Futtaim Group employee?</label>
        <select id="prev"><option value="">Select</option><option>No</option><option>Yes</option></select>
        <label for="cur">Are you currently employed with any Al-Futtaim Group company</label>
        <select id="cur"><option value="">Select</option><option>No</option><option>Yes</option></select>
        <label for="fam">Do you have any family members in the Al-Futtaim Group?</label>
        <select id="fam"><option value="">Select</option><option>No</option><option>Yes</option></select>
        <label for="alum">Are you a member of the Al Futtaim Schools alumni?</label>
        <select id="alum"><option value="">Select</option><option>Not Applicable</option><option>Yes</option></select>
        <label for="dob">Date of Birth</label><input id="dob" name="date_of_birth" required />
        <label for="sal">What is your current monthly salary (In Job Location Currency)?</label>
        <input id="sal" name="salary_job_currency" />
        <label><input id="terms" type="checkbox" required /> I accept the Terms of Use and data privacy</label>
        <button type="submit">Apply</button>
      </form>
    `,
      SIGNUP_LIBS
    );
    const result = await page.window.__fillApply.run(PROFILE_WITH_PW, {});
    const doc = page.document;
    suite.equal(doc.getElementById('em').value, PROFILE_WITH_PW.email, 'email filled');
    suite.equal(doc.getElementById('em2').value, PROFILE_WITH_PW.email, 'retype email filled');
    suite.ok(doc.getElementById('pw').value.length > 0, 'password filled from profile password field');
    suite.ok(doc.getElementById('pw2').value.length > 0, 'retype password filled');
    suite.ok(doc.getElementById('pw').value === doc.getElementById('pw2').value, 'password matches retype');
    // Never print raw password
    suite.ok(doc.getElementById('fn').value === 'Chaudhary', 'first name');
    suite.ok(doc.getElementById('title').value === 'Mr' || /Mr/i.test(doc.getElementById('title').selectedOptions[0].text), 'Title Mr');
    suite.ok(/Pakistani/i.test(doc.getElementById('nat').selectedOptions[0].text), 'Nationality Pakistani');
    suite.ok(/Saudi Arabia/i.test(doc.getElementById('res').selectedOptions[0].text), 'Country of Residence');
    suite.ok(/\+966|Saudi/i.test(doc.getElementById('cc').selectedOptions[0].text), 'Country/Region Code +966');
    suite.equal(doc.getElementById('ph').value.replace(/\D/g, '').slice(-9), '504131857', 'phone national');
    suite.ok(/Job Board/i.test(doc.getElementById('hear').selectedOptions[0].text), 'How did you hear Job Board');
    suite.ok(/No/i.test(doc.getElementById('prev').selectedOptions[0].text), 'previous AF No');
    suite.ok(doc.getElementById('terms').checked, 'Terms / privacy ticked');
    suite.equal(doc.getElementById('dob').value, '', 'DOB left empty (dummy)');
    suite.equal(doc.getElementById('sal').value, '', 'job-currency salary left empty');
    suite.ok(result.ok !== false || (result.missingRequired && result.missingRequired.length), 'run completed or reports missing required');
    const missing = (result.missingRequired || []).join(' ').toLowerCase();
    suite.ok(/date of birth|dob|salary/i.test(missing) || doc.getElementById('dob').value === '', 'DOB/salary empty path preserved');
  })();

  // 3) No profile password → auth pause (never invent)
  await (async function pauseWithoutPassword() {
    const page = createPage(
      `
      <form>
        <h1>Create a login</h1>
        <label>Email</label><input type="email" name="email" />
        <label>Password</label><input type="password" name="password" />
        <label>Password Re-enter</label><input type="password" name="confirm" />
      </form>
    `,
      SIGNUP_LIBS
    );
    const result = await page.window.__fillApply.run(PROFILE_NO_PW, {});
    suite.ok(result.needsHuman, 'needsHuman when no profile password');
    suite.equal(result.pauseReason, 'auth_wall', 'pauseReason auth_wall');
    suite.ok(page.document.querySelector('input[type="password"]').value === '', 'password left empty — never invented');
  })();

  // 4) Prefer Sign in when already registered
  await (async function preferSignIn() {
    const page = createPage(
      `
      <div>
        <p>Already a registered user? Please sign in</p>
        <a id="signin" href="#login">Sign in</a>
        <form id="reg">
          <label>Email</label><input type="email" name="email" />
          <label>Password</label><input type="password" name="password" />
          <label>Retype Password</label><input type="password" name="confirm_password" />
        </form>
      </div>
    `,
      ['lib/auth-walls.js', 'lib/signup-login.js']
    );
    let clicked = false;
    page.document.getElementById('signin').addEventListener('click', function (e) {
      e.preventDefault();
      clicked = true;
    });
    const S = page.window.FillApplySignupLogin;
    const mode = S.detectMode(page.document, PROFILE_WITH_PW);
    suite.equal(mode.mode, 'sign_in', 'detectMode prefers sign_in when already registered');
    const pref = S.preferSignIn(page.document);
    suite.ok(pref.clicked && clicked, 'Sign in link clicked');
  })();

  // 5) Import preserves password; export strips
  await (async function importExportPassword() {
    const page = createPage('<html><body></body></html>', ['lib/profile-io.js']);
    const IO = page.window.FillApplyProfileIO;
    const validated = IO.validateImportPayload({
      format: 'fill-apply-profile',
      schemaVersion: 1,
      profile: {
        email: 'czahidali.accacma@gmail.com',
        password: 'profile-password-field',
        firstName: 'Chaudhary',
        customAnswers: { password: 'profile-password-field', confirm_password: 'profile-password-field' }
      },
      knowledge: { records: [] }
    });
    suite.ok(validated.ok, 'import validates');
    suite.ok(!!validated.data.profile.password, 'import preserves profile password field');
    suite.ok(!!validated.data.profile.customAnswers.password, 'import preserves customAnswers password');
    const stripped = IO.sanitizeProfileFields(validated.data.profile); // export path — no preserve
    suite.ok(!stripped.password, 'export sanitize strips password key');
    suite.ok(
      !stripped.customAnswers || !stripped.customAnswers.password,
      'export sanitize strips customAnswers password'
    );
    const json = JSON.stringify(stripped);
    suite.ok(json.indexOf('profile-password-field') === -1, 'export omits password value');
  })();

  // 6) Knowledge learn rejects password labels
  await (async function neverLearnPassword() {
    const page = createPage('<html><body></body></html>', [
      'lib/control-adapter.js',
  'lib/ats-faq-seed.js',
  'lib/knowledge-canonical.js',
      'lib/knowledge-store.js',
      'lib/knowledge-learn.js'
    ]);
    const L = page.window.FillApplyKnowledgeLearn;
    suite.ok(L.isSensitiveLabel('Password'), 'password label is sensitive');
    suite.ok(L.isSensitiveLabel('Confirm Password'), 'confirm password sensitive');
    const r = await L.learn({
      label: 'Password',
      value: 'should-not-store',
      fieldType: 'string',
      kind: 'correct'
    });
    suite.ok(r && r.accepted === false && r.reason === 'sensitive', 'learn rejects password');
  })();

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
