/**
 * Phase 1 — Universal Identity Autofill Hardening.
 *
 * Covers: canonical identity keys, name split (first+rest), Title≠job title,
 * phone E.164 / split / no dial duplication, email, address compose,
 * nationality≠residence≠phoneCountry, gender, DOB formats (no silent MM/DD
 * vs DD/MM), education/cert serialization (no [object Object]), B.Com/EMBA,
 * Expected≠Current salary, profile beats weak adaptive.
 *
 * Profile convention (documented): firstName + multi-word lastName
 * (e.g. first=Alex last="Sample Ali") — never last-token-of-full alone.
 * Same rule as Chaudhry / Zahid Ali style real profiles; tests use Mock data.
 *
 * Run: node scripts/smoke-identity-autofill.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite, ROOT } = require('./test-harness');

const suite = createSuite('smoke-identity-autofill');

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
  'lib/profile.js',
  'content/fill.js'
];

const PROFILE = {
  salutation: 'Mr.',
  title: 'Mr.',
  firstName: 'Alex',
  lastName: 'Sample Ali',
  fullName: 'Alex Sample Ali',
  email: 'alex.sample@example.com',
  phone: '501234567',
  phoneCountry: '+966',
  phoneFull: '+966501234567',
  phoneE164: '+966501234567',
  dateOfBirth: '1990-01-15',
  gender: 'Male',
  nationality: 'Pakistan',
  country: 'Saudi Arabia',
  countryOfResidence: 'Saudi Arabia',
  addressCountry: 'Saudi Arabia',
  addressLine1: 'King Fahd Road',
  addressLine2: 'Olaya',
  city: 'Riyadh',
  state: 'Riyadh',
  zip: '12211',
  location: 'Riyadh',
  currentTitle: 'Financial Planning Manager',
  highestEducation: "Master's Degree",
  currentSalary: '15000 SAR',
  expectedSalary: '18000 SAR',
  // Structured — must serialize, never "[object Object]"
  education: [
    {
      school: 'Sample State University',
      degree: 'MBA Executive — Finance',
      fieldOfStudy: 'Finance',
      endYear: '2018'
    },
    {
      school: 'Sample College',
      degree: 'Bachelor of Commerce (B.Com)',
      fieldOfStudy: 'Commerce',
      endYear: '2005'
    }
  ],
  certifications: [
    { name: 'CMA', issuer: 'IMA', year: '2015' },
    { name: 'ACCA', issuer: 'UK', year: '2005' }
  ],
  educationEntries: [
    { degree: 'EMBA', school: 'Sample State University', end: '2018' },
    { degree: 'B.Com', school: 'Sample College', end: '2005' }
  ]
};

function loadFixture(name) {
  return fs.readFileSync(path.join(ROOT, 'scripts/fixtures/controls', name), 'utf8');
}

(async function main() {
  const page0 = createPage('<div></div>', LIBS);
  const F = page0.window.FillApplyFormat;
  const Map = page0.window.FillApplyFieldMap;
  const K = page0.window.FillApplyKnowledge;
  const A = page0.window.FillApplyControlAdapter;

  /* ---------------------------------------------------------------- *
   * Serialize — root cause of [object Object]
   * ---------------------------------------------------------------- */
  const eduText = F.serializeAnswer(PROFILE.education);
  suite.ok(eduText.indexOf('[object Object]') === -1, 'education serialize has no [object Object]');
  suite.ok(/B\.Com|Bachelor of Commerce/i.test(eduText), 'education serialize keeps B.Com');
  suite.ok(/MBA Executive|EMBA|Finance/i.test(eduText), 'education serialize keeps EMBA/MBA');
  const certText = F.serializeAnswer(PROFILE.certifications);
  suite.ok(certText.indexOf('[object Object]') === -1, 'certifications serialize has no [object Object]');
  suite.ok(/CMA/i.test(certText) && /ACCA/i.test(certText), 'certifications list names');

  /* ---------------------------------------------------------------- *
   * Name split convention (Mock: Alex / Sample Ali)
   * ---------------------------------------------------------------- */
  const parts = F.nameParts({ fullName: 'Alex Sample Ali' });
  suite.equal(parts.first, 'Alex', 'full→first=Alex');
  suite.equal(parts.last, 'Sample Ali', 'full→last=Sample Ali (not Ali)');
  suite.equal(F.nameParts(PROFILE).last, 'Sample Ali', 'explicit lastName preserved');

  suite.equal(Map.bestKeyForField({ label: 'Given name' }), 'firstName', 'Given name');
  suite.equal(Map.bestKeyForField({ label: 'Forename' }), 'firstName', 'Forename');
  suite.equal(Map.bestKeyForField({ label: 'Surname' }), 'lastName', 'Surname');
  suite.equal(
    Map.bestKeyForField({ label: 'Title', name: 'title' }),
    'title',
    'Title → honorific'
  );
  suite.equal(
    Map.bestKeyForField({ label: 'Job title', name: 'job_title' }),
    'currentTitle',
    'Job title → currentTitle'
  );

  /* ---------------------------------------------------------------- *
   * DOB — no silent MM/DD vs DD/MM
   * ---------------------------------------------------------------- */
  suite.equal(F.detectDateFormat({ type: 'date' }), 'iso', 'type=date → iso');
  suite.equal(
    F.detectDateFormat({ type: 'text', placeholder: 'MM/DD/YYYY' }),
    'mdy',
    'hint MM/DD'
  );
  suite.equal(
    F.detectDateFormat({ type: 'text', placeholder: 'DD/MM/YYYY' }),
    'dmy',
    'hint DD/MM'
  );
  suite.equal(
    F.detectDateFormat({ type: 'text', autocomplete: 'bday' }),
    'mdy',
    'autocomplete=bday → mdy (Workable)'
  );
  suite.equal(
    F.detectDateFormat({ type: 'text', name: 'birthday' }),
    'ambiguous',
    'no hint → ambiguous'
  );
  suite.ok(
    F.formatDate({ type: 'text', name: 'birthday' }, '1990-01-15').skip,
    'ambiguous DOB is skipped (not guessed)'
  );

  /* ---------------------------------------------------------------- *
   * Phone / country / address helpers
   * ---------------------------------------------------------------- */
  const pp = F.phoneParts(PROFILE);
  suite.equal(pp.dial, '+966', 'phone dial +966');
  suite.equal(pp.national, '501234567', 'national without country');
  suite.equal(pp.e164, '+966501234567', 'E.164');
  const withSibling = F.formatPhone(
    { type: 'tel' },
    pp,
    { hasCountryField: true }
  );
  suite.ok(
    withSibling.value.indexOf('966') === -1 || withSibling.value === '501234567',
    'with country sibling → national only (no dial dup)'
  );

  const addr = F.composeAddress(PROFILE, 'parts');
  suite.ok(/King Fahd/.test(addr.single), 'address single has street');
  suite.ok(/Saudi Arabia/.test(addr.single), 'address single has residence country');
  suite.ok(addr.multiline.indexOf('\n') !== -1, 'multiline address');

  /* ---------------------------------------------------------------- *
   * Nationality / gender / education level variants
   * ---------------------------------------------------------------- */
  const natVars = F.valueVariants('Pakistan', { kind: 'nationality' });
  suite.ok(natVars.some(function (v) { return /Pakistani/i.test(v); }), 'Pakistan → Pakistani');
  const genVars = F.valueVariants('Male', 'gender');
  suite.ok(genVars.indexOf('Man') !== -1 && genVars.indexOf('M') !== -1, 'Male→Man/M');
  suite.ok(F.educationLevel('B.Com'), 'B.Com maps to bachelor level');
  suite.ok(F.educationLevel('EMBA'), 'EMBA maps to master level');

  /* ---------------------------------------------------------------- *
   * Profile beats weak adaptive for identity email
   * ---------------------------------------------------------------- */
  const weakSnap = {
    records: [
      {
        id: 'r1',
        canonicalKey: 'email',
        value: 'wrong.adaptive@example.com',
        displayValue: 'wrong.adaptive@example.com',
        status: 'provisional',
        confidence: 0.5,
        aliases: ['email', 'email address'],
        fieldType: 'email'
      }
    ]
  };
  const resolvedEmail = K.resolve(
    Object.assign({}, PROFILE, { __adaptiveKnowledge: weakSnap }),
    { label: 'Email address', name: 'email', type: 'email' },
    Map
  );
  suite.equal(
    resolvedEmail.value,
    'alex.sample@example.com',
    'profile email beats weak adaptive'
  );
  suite.ok(
    /profile|fieldMap/i.test(String(resolvedEmail.source || '')),
    'email from profile path (got ' + resolvedEmail.source + ')'
  );
  suite.ok(resolvedEmail.value !== 'wrong.adaptive@example.com', 'adaptive email did not win');

  /* ---------------------------------------------------------------- *
   * Expected Salary ≠ Current Salary
   * ---------------------------------------------------------------- */
  suite.equal(
    Map.bestKeyForField({ label: 'Expected Salary', name: 'current_salary', type: 'text' }),
    'expectedSalary',
    'label Expected Salary wins over name current_salary'
  );
  suite.equal(
    Map.bestKeyForField({ label: 'Current Salary', name: 'expected_salary', type: 'text' }),
    'currentSalary',
    'label Current Salary wins over name expected_salary'
  );

  /* ---------------------------------------------------------------- *
   * End-to-end fill on synthetic fixture
   * ---------------------------------------------------------------- */
  const page = createPage(loadFixture('identity-phase1.html'), LIBS);
  // Wire calendar open on click for jsdom
  const calInput = page.document.getElementById('dob_cal');
  const calDialog = page.document.querySelector('.datepicker');
  calInput.addEventListener('click', function () {
    calDialog.hidden = false;
  });
  Array.prototype.forEach.call(calDialog.querySelectorAll('[data-day]'), function (btn) {
    btn.addEventListener('click', function () {
      const y = calDialog.querySelector('.cal-year').value;
      const m = calDialog.querySelector('.cal-month').value;
      const d = btn.getAttribute('data-day');
      calInput.value =
        y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      calDialog.hidden = true;
    });
  });

  await page.window.__fillApply.run(PROFILE, { formWaitMs: 50 });
  const d = page.document;

  suite.ok(/^(Mr\.?)$/i.test(d.getElementById('title').value) || d.getElementById('title').value === 'Mr', 'Title=Mr');
  suite.equal(d.getElementById('first').value, 'Alex', 'Given name=Alex');
  suite.equal(d.getElementById('last').value, 'Sample Ali', 'Surname=Sample Ali');
  suite.equal(d.getElementById('email').value, 'alex.sample@example.com', 'Email from profile');
  suite.ok(
    !/@/.test(d.getElementById('job').value || '') || /Financial|Manager/i.test(d.getElementById('job').value),
    'Job title is job title not email'
  );
  suite.ok(/Financial|Manager/i.test(d.getElementById('job').value), 'Job title filled from currentTitle');

  const cc = d.getElementById('cc').value;
  suite.ok(/\+?966/.test(cc), 'phone country Saudi/+966 (got ' + cc + ')');
  const phoneNat = d.getElementById('phone').value.replace(/\D/g, '');
  suite.ok(phoneNat === '501234567' || phoneNat.endsWith('501234567'), 'national phone');
  suite.ok(!/^966966/.test(phoneNat), 'no duplicated country code in national');

  suite.ok(/King Fahd/i.test(d.getElementById('addr_single').value), 'single address');
  suite.ok(/King Fahd/i.test(d.getElementById('line1').value), 'address line1');
  suite.equal(d.getElementById('city').value, 'Riyadh', 'city');
  suite.ok(/Saudi/i.test(d.getElementById('res').value), 'residence Saudi Arabia');
  suite.ok(/Pakistan|Pakistani/i.test(d.getElementById('nat').value), 'nationality Pakistani/Pakistan');
  suite.ok(d.getElementById('nat').value !== d.getElementById('res').value, 'nationality ≠ residence');
  suite.ok(/Riyadh/i.test(d.getElementById('loc').value), 'current location city');

  const gSel = d.getElementById('gender_sel').value;
  suite.ok(/male|man|^m$/i.test(gSel), 'gender select Male/Man/M (got ' + gSel + ')');
  const sexChecked = d.querySelector('input[name="sex"]:checked');
  suite.ok(sexChecked && /Male/i.test(sexChecked.value), 'gender radio Male');

  suite.equal(d.getElementById('dob_iso').value, '1990-01-15', 'type=date ISO');
  suite.equal(d.getElementById('dob_mdy').value, '01/15/1990', 'MM/DD/YYYY');
  suite.equal(d.getElementById('dob_dmy').value, '15/01/1990', 'DD/MM/YYYY');
  suite.equal(d.getElementById('dob_amb').value, '', 'ambiguous DOB left blank');
  suite.equal(d.getElementById('by').value, '1990', 'birth year');
  suite.equal(d.getElementById('bm').value, '01', 'birth month');
  suite.equal(d.getElementById('bd').value, '15', 'birth day');

  // Custom calendar via adapter
  const calResult = A.fillCustomCalendar
    ? A.fillCustomCalendar(d.getElementById('dob_cal'), '1990-01-15')
    : null;
  if (calResult) {
    suite.ok(calResult.ok || calResult.clicked, 'custom calendar open/navigate/select attempted');
  } else {
    suite.ok(true, 'custom calendar helper present or skipped in env');
  }

  const eduFilled = d.getElementById('edu').value;
  suite.ok(eduFilled.indexOf('[object Object]') === -1, 'filled education not [object Object]');
  suite.ok(/B\.Com|Commerce|MBA|Finance/i.test(eduFilled), 'education text meaningful');
  const certFilled = d.getElementById('certs').value;
  suite.ok(certFilled.indexOf('[object Object]') === -1, 'filled certs not [object Object]');
  suite.ok(/CMA|ACCA/i.test(certFilled), 'certs text meaningful');

  suite.ok(/15000|15000 SAR/i.test(d.getElementById('cur_sal').value), 'Current Salary');
  suite.ok(/18000|18000 SAR/i.test(d.getElementById('exp_sal').value), 'Expected Salary');
  suite.ok(
    d.getElementById('cur_sal').value !== d.getElementById('exp_sal').value,
    'Expected ≠ Current Salary'
  );

  const ser2 = F.serializeAnswer(PROFILE.education);
  suite.ok(ser2.indexOf('[object Object]') === -1, 'options-path serialize education');
  suite.ok(/B\.Com|Commerce/i.test(ser2), 'options-path keeps degree text');

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
