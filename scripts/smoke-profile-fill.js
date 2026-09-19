/**
 * Full applicant profile: every control type an ATS form actually uses, filled
 * from the Zahid General record, plus the bucket / level / demonym matching
 * that lets a stored answer reach a differently-worded option.
 *
 * Run: node scripts/smoke-profile-fill.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite } = require('./test-harness');

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

const suite = createSuite('smoke-profile-fill');

/** Real Zahid PII lives only in the private handoff file (gitignored). */
function loadPrivateZahidProfile() {
  const candidates = [
    path.join('/workspace/private-profiles/zahid-profile.json'),
    path.join(__dirname, '..', '..', 'private-profiles', 'zahid-profile.json'),
    path.join(__dirname, '..', 'private', 'zahid-profile.json')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const payload = JSON.parse(fs.readFileSync(c, 'utf8'));
      if (payload && payload.profile) return payload.profile;
      return payload;
    }
  }
  throw new Error(
    'Private Zahid fixture missing. Expected /workspace/private-profiles/zahid-profile.json (Deliverable B).'
  );
}

function zahid(_page) {
  return loadPrivateZahidProfile();
}

function run(page, profile, options) {
  return page.window.__fillApply.run(profile, options || { formWaitMs: 50 });
}

(async function main() {
  const page = createPage('<div id="application-form"></div>', LIBS);
  const fmt = page.window.FillApplyFormat;
  const map = page.window.FillApplyFieldMap;
  const profile = zahid(page);

  /* ---------------------------------------------------------------- *
   * The stored record itself
   * ---------------------------------------------------------------- */

  suite.equal(profile.fullName, 'Chaudhary Zahid Ali', 'full name is stored');
  suite.equal(profile.email, 'czahidali.accacma@gmail.com', 'email is stored');
  suite.equal(profile.phoneCountry, '+966', 'Saudi dial code is stored');
  suite.equal(profile.phone, '504131857', 'national number is stored without the code');
  suite.ok(profile.city === 'Khobar' || profile.city === 'Riyadh', 'city is stored (got ' + profile.city + ')');
  suite.equal(profile.country, 'Saudi Arabia', 'country is stored');
  suite.equal(profile.nationality, 'Pakistan', 'nationality is stored');
  suite.equal(profile.highestEducation, "Master's Degree", 'highest education is a level, not a sentence');
  suite.equal(profile.yearsExperience, '15', 'years of experience is a number a bucket can hold');
  suite.equal(profile.school, 'Virtual University of Pakistan (VUP)', 'school is stored separately from the education paragraph');
  suite.equal(profile.degree, 'MBA Executive — Finance', 'degree is stored separately');
  suite.equal(profile.fieldOfStudy, 'Finance', 'field of study is stored');
  suite.equal(profile.graduationYear, '2018', 'graduation year is stored');
  suite.equal(profile.currentTitle.indexOf('Financial Planning') !== -1, true, 'current title is stored');
  suite.ok(Array.isArray(profile.experienceEntries) && profile.experienceEntries.length === 7, 'seven roles are stored as structured entries');
  suite.ok(Array.isArray(profile.educationEntries) && profile.educationEntries.length === 2, 'two degrees are stored as structured entries');
  suite.equal(profile.customAnswers.employed, 'No', 'currently employed is No — last role ended Sep 2025');
  suite.equal(profile.expectedSalary, '', 'expected salary is left blank rather than invented');
  suite.ok(profile.dateOfBirth === '' || /^\d{4}-\d{2}-\d{2}$/.test(String(profile.dateOfBirth)), 'date of birth blank or ISO from private import (got ' + JSON.stringify(profile.dateOfBirth) + ')');

  const gaps = page.window.FillApplyProfile.profileGaps(profile);
  suite.ok(gaps.percent >= 70, 'commonly-asked fields are mostly filled (' + gaps.percent + '%)');
  suite.ok(gaps.missing.indexOf('expectedSalary') !== -1, 'the completeness readout names the blank salary');
  suite.ok(gaps.missing.indexOf('dateOfBirth') === -1 || gaps.missing.indexOf('currentSalary') !== -1, 'blank compensation is reported');

  /* ---------------------------------------------------------------- *
   * Field map: split keys, not the old catch-all education/experience
   * ---------------------------------------------------------------- */

  function keyFor(descriptor) {
    return map.bestKeyForField(descriptor);
  }

  suite.equal(keyFor({ label: 'School / University', name: 'school' }), 'school', 'School maps to school, not the education paragraph');
  suite.equal(keyFor({ label: 'Degree', name: 'degree' }), 'degree', 'Degree maps to degree');
  suite.equal(keyFor({ label: 'Field of study' }), 'fieldOfStudy', 'Field of study maps');
  suite.equal(keyFor({ label: 'Graduation year' }), 'graduationYear', 'Graduation year maps');
  suite.equal(keyFor({ label: 'Highest level of education' }), 'highestEducation', 'Highest education maps to the level, not the paragraph');
  suite.equal(keyFor({ label: 'Years of experience' }), 'yearsExperience', 'Years of experience maps to the number, not work history');
  suite.equal(keyFor({ label: 'Current job title' }), 'currentTitle', 'Current job title maps');
  suite.equal(keyFor({ label: 'Current employer' }), 'currentCompany', 'Current employer maps');
  suite.equal(keyFor({ label: 'Willing to relocate' }), 'willingToRelocate', 'Willing to relocate maps');
  suite.equal(keyFor({ label: 'How did you hear about us' }), 'referralSource', 'Referral source maps');
  suite.equal(keyFor({ label: 'Education history' }), 'education', 'Education history still maps to the long-form paragraph');

  /* ---------------------------------------------------------------- *
   * Buckets, levels, demonyms
   * ---------------------------------------------------------------- */

  suite.equal(
    fmt.matchBucketIndex(['0-2', '3-5', '6-9', '10+'], '15'),
    3,
    '15 years lands in the 10+ bucket'
  );
  suite.equal(
    fmt.matchBucketIndex(['0-2 years', '3-5 years', '6-9 years', '10+ years'], '15+'),
    3,
    '15+ also lands in 10+ years'
  );
  suite.equal(
    fmt.matchBucketIndex(['Less than 5', '5-10', '10+'], '10'),
    1,
    'a tight 5-10 bucket wins over 10+ for an answer of 10'
  );

  suite.equal(
    fmt.matchEducationIndex(["High School", "Bachelor's Degree", "Master's Degree", 'Doctorate'], "Master's / MBA"),
    2,
    "Master's / MBA finds the Master's Degree option"
  );
  suite.equal(
    fmt.matchEducationIndex(["High School", "Bachelor's Degree"], "Master's Degree"),
    1,
    "when Master's is not offered, the Bachelor's the applicant also holds is used"
  );
  suite.ok(
    fmt.matchEducationIndex(["High School", "Bachelor's Degree"], "Master's Degree") !== 0,
    'education matching never picks a level above the one held'
  );

  const nationalityVariants = fmt.valueVariants('Pakistan', 'country');
  suite.ok(nationalityVariants.indexOf('Pakistani') !== -1, 'nationality variants include the demonym Pakistani');
  suite.ok(nationalityVariants.indexOf('PK') !== -1, 'nationality variants include the ISO code');

  const noticeVariants = fmt.valueVariants('I can start immediately', 'noticePeriod');
  suite.ok(noticeVariants.indexOf('Immediately') !== -1, 'immediate notice also tries Immediately');
  suite.ok(noticeVariants.indexOf('Onspot') !== -1, 'immediate notice also tries Teamtailor Onspot');

  /* ---------------------------------------------------------------- *
   * End-to-end fill of every control type from the Zahid record
   * ---------------------------------------------------------------- */

  await (async function fillsEveryControlType() {
    const form = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="fn">First name</label><input id="fn" name="first_name" /></div>
        <div class="field"><label for="ln">Last name</label><input id="ln" name="last_name" /></div>
        <div class="field"><label for="em">Email</label><input id="em" type="email" /></div>
        <div class="field">
          <label for="cc">Phone country code</label>
          <select id="cc" name="phone_country">
            <option value="">Select...</option>
            <option value="+1">+1</option>
            <option value="+966">+966</option>
            <option value="+971">+971</option>
          </select>
        </div>
        <div class="field"><label for="ph">Mobile number</label><input id="ph" name="phone" type="tel" /></div>
        <div class="field"><label for="city">City</label><input id="city" /></div>
        <div class="field">
          <label for="nat">Nationality</label>
          <select id="nat">
            <option value="">Select...</option>
            <option>Saudi</option>
            <option>Pakistani</option>
            <option>Indian</option>
          </select>
        </div>
        <div class="field">
          <label for="co">Country</label>
          <select id="co">
            <option value="">Select...</option>
            <option value="SA">SA</option>
            <option value="PK">PK</option>
            <option value="AE">AE</option>
          </select>
        </div>
        <fieldset>
          <legend>Gender</legend>
          <label><input type="radio" name="gender" value="female" /> Female</label>
          <label><input type="radio" name="gender" value="male" /> Male</label>
        </fieldset>
        <fieldset>
          <legend>Years of experience</legend>
          <label><input type="radio" name="yoe" value="0-2" /> 0-2</label>
          <label><input type="radio" name="yoe" value="3-5" /> 3-5</label>
          <label><input type="radio" name="yoe" value="6-9" /> 6-9</label>
          <label><input type="radio" name="yoe" value="10+" /> 10+</label>
        </fieldset>
        <div class="field">
          <label for="edu">Highest level of education</label>
          <select id="edu">
            <option value="">Select...</option>
            <option>High School</option>
            <option>Bachelor's Degree</option>
            <option>Master's Degree</option>
            <option>Doctorate</option>
          </select>
        </div>
        <div class="field">
          <label for="np">Notice period</label>
          <select id="np">
            <option value="">Select...</option>
            <option>Onspot</option>
            <option>30 days</option>
            <option>60 days</option>
          </select>
        </div>
        <div class="field"><label for="title">Current job title</label><input id="title" /></div>
        <div class="field"><label for="comp">Current employer</label><input id="comp" /></div>
        <div class="field"><label for="school">School / University</label><input id="school" /></div>
        <div class="field"><label for="deg">Degree</label><input id="deg" /></div>
        <div class="field"><label for="fos">Field of study</label><input id="fos" /></div>
        <div class="field"><label for="gy">Graduation year</label><input id="gy" /></div>
        <div class="field">
          <label for="rel">Willing to relocate</label>
          <input id="rel" type="checkbox" />
        </div>
        <div class="field">
          <label for="auth">Are you authorized to work?</label>
          <select id="auth"><option value="">Select...</option><option>Yes</option><option>No</option></select>
        </div>
        <div class="field">
          <label for="spon">Will you now or in the future require sponsorship?</label>
          <select id="spon"><option value="">Select...</option><option>Yes</option><option>No</option></select>
        </div>
        <fieldset>
          <legend>Currently based in Riyadh?</legend>
          <label><input type="radio" name="riyadh" value="yes" /> Yes</label>
          <label><input type="radio" name="riyadh" value="no" /> No</label>
        </fieldset>
        <fieldset>
          <legend>Currently employed?</legend>
          <label><input type="radio" name="emp" value="yes" /> Yes</label>
          <label><input type="radio" name="emp" value="no" /> No</label>
        </fieldset>
        <div class="field"><label for="why">Cover letter</label><textarea id="why"></textarea></div>
        <div class="field"><label for="sal">Expected salary</label><input id="sal" type="number" /></div>
        <div class="field">
          <label><input id="consent" type="checkbox" required /> I agree to the privacy policy</label>
        </div>
        <div class="field">
          <label for="race">Race / ethnicity (voluntary)</label>
          <select id="race"><option value="">Decline to self-identify</option><option>Asian</option></select>
        </div>
      </div>
    `,
      LIBS
    );
    const result = await run(form, zahid(form));
    const doc = form.document;

    suite.ok(result.ok, 'the full form run completes');
    suite.equal(doc.getElementById('fn').value, 'Chaudhary', 'first name filled');
    suite.equal(doc.getElementById('ln').value, 'Zahid Ali', 'last name filled (multi-word)');
    suite.equal(doc.getElementById('em').value, 'czahidali.accacma@gmail.com', 'email filled');
    suite.equal(doc.getElementById('cc').value, '+966', 'phone country code selected');
    suite.equal(doc.getElementById('ph').value, '504131857', 'national number written beside the code');
    suite.ok(['Khobar','Riyadh'].indexOf(doc.getElementById('city').value) !== -1, 'city filled (got ' + doc.getElementById('city').value + ')');
    suite.equal(doc.getElementById('nat').value, 'Pakistani', 'nationality select uses the demonym');
    suite.equal(doc.getElementById('co').value, 'SA', 'country select uses the ISO code');
    suite.ok(doc.querySelector('input[name="gender"][value="male"]').checked, 'gender radio selected');
    suite.ok(doc.querySelector('input[name="yoe"][value="10+"]').checked, 'years-of-experience radio lands in 10+');
    suite.equal(doc.getElementById('edu').value, "Master's Degree", 'education select resolved to Master\'s Degree');
    suite.equal(doc.getElementById('np').value, 'Onspot', 'immediate availability finds Teamtailor Onspot');
    suite.ok(doc.getElementById('title').value.indexOf('Financial Planning') !== -1, 'current title filled');
    suite.ok(doc.getElementById('comp').value.indexOf('SIXT') !== -1, 'current employer filled');
    suite.equal(doc.getElementById('school').value, 'Virtual University of Pakistan (VUP)', 'school filled from the split education fields');
    suite.equal(doc.getElementById('deg').value, 'MBA Executive — Finance', 'degree filled');
    suite.equal(doc.getElementById('fos').value, 'Finance', 'field of study filled');
    suite.equal(doc.getElementById('gy').value, '2018', 'graduation year filled');
    suite.ok(doc.getElementById('rel').checked, 'willing-to-relocate checkbox ticked for Yes');
    suite.equal(doc.getElementById('auth').value, 'Yes', 'work authorization select filled');
    suite.ok(['Yes','No'].indexOf(doc.getElementById('spon').value) !== -1, 'sponsorship select filled (got ' + doc.getElementById('spon').value + ')');
    suite.ok(doc.querySelector('input[name="riyadh"][value="yes"]').checked, 'based in Riyadh radio selected');
    suite.ok(doc.querySelector('input[name="emp"][value="no"]').checked, 'currently-employed radio selected No');
    suite.ok(doc.getElementById('why').value.length > 80, 'cover letter filled');
    suite.equal(doc.getElementById('sal').value, '', 'blank salary is left blank, not invented');
    suite.ok(doc.getElementById('consent').checked, 'consent checkbox is ticked so Next can proceed');
    suite.equal(doc.getElementById('race').value, '', 'EEO select is left on the decline option');
    suite.ok(
      (result.skipped || []).some(function (s) {
        return s && s.reason === 'voluntary_self_identification';
      }),
      'the EEO field is reported as skipped'
    );
    suite.ok(
      !(result.skipped || []).some(function (s) {
        return s && s.reason === 'consent_checkbox';
      }),
      'consent checkbox is no longer skipped — it is ticked'
    );
    suite.ok(
      (result.details || []).some(function (d) {
        return d && d.canonicalKey === 'consent' && d.action === 'FILLED';
      }),
      'consent appears in filled details'
    );
  })();

  /* A form that only offers Bachelor's still gets an honest answer: the
   * applicant holds that degree too. */
  await (async function educationFallsBack() {
    const form = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" type="email" /></div>
        <div class="field">
          <label for="edu">Highest education</label>
          <select id="edu">
            <option value="">Select...</option>
            <option>High School</option>
            <option>Bachelor's Degree</option>
          </select>
        </div>
      </div>
    `,
      LIBS
    );
    await run(form, zahid(form));
    suite.equal(
      form.document.getElementById('edu').value,
      "Bachelor's Degree",
      "Master's falls back to Bachelor's when that is the highest option offered"
    );
  })();

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
