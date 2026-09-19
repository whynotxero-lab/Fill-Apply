/**
 * Name split (First=Alex, Last=Sample Ali) + DOB format detection
 * (MM/DD vs DD/MM vs type=date + split year/month/day).
 * Run: node scripts/smoke-name-dob-formats.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const LIBS = [
  'lib/dom-deep.js',
  'lib/format.js',
  'lib/synonyms.js',
  'lib/field-map.js',
  'lib/control-adapter.js',
  'lib/ats-faq-seed.js',
  'lib/knowledge-canonical.js',
  'lib/files.js',
  'content/fill.js',
  'adapters/registry.js',
  'adapters/fallback.js',
  'adapters/ats/workable.js'
];

const suite = createSuite('smoke-name-dob-formats');

const PROFILE = {
  firstName: 'Alex',
  lastName: 'Sample Ali',
  fullName: 'Alex Sample Ali',
  middleName: '',
  email: 'alex.sample@example.com',
  phone: '501234567',
  phoneCountry: '+966',
  dateOfBirth: '1990-01-15',
  salutation: 'Mr.',
  nationality: 'Pakistan',
  city: 'Riyadh',
  location: 'Riyadh',
  linkedin: 'https://www.linkedin.com/in/alex-sample',
  highestEducation: "Master's Degree",
  yearsExperience: '15',
  conflictOfInterest: 'No',
  workingForQiddiya: 'No',
  neverHadCriminalConviction: 'Yes',
  privacyAccepted: 'Yes',
  customAnswers: {
    date_of_birth: '1990-01-15',
    highest_education: 'Masters',
    'Highest Education Level': 'Masters',
    conflict_of_interest: 'No',
    working_for_qiddiya: 'No',
    never_had_criminal_conviction: 'Yes',
    social_media_profiles: 'https://www.linkedin.com/in/alex-sample',
    current_location: 'Riyadh',
    years_of_relevant_experience: '15',
    current_monthly_salary: '',
    expected_salary: '',
    worked_for_pif_or_affiliate: ''
  }
};

(async function main() {
  const page = createPage('<div id="application-form"></div>', LIBS);
  const F = page.window.FillApplyFormat;
  const Map = page.window.FillApplyFieldMap;

  /* ---------------------------------------------------------------- *
   * A) Name split
   * ---------------------------------------------------------------- */
  const fromFull = F.nameParts({ fullName: 'Alex Sample Ali' });
  suite.equal(fromFull.first, 'Alex', 'nameParts from fullName → first=Alex');
  suite.equal(fromFull.last, 'Sample Ali', 'nameParts from fullName → last=Sample Ali (not Ali alone)');
  suite.equal(fromFull.full, 'Alex Sample Ali', 'nameParts full preserved');

  const explicit = F.nameParts(PROFILE);
  suite.equal(explicit.first, 'Alex', 'explicit firstName kept');
  suite.equal(explicit.last, 'Sample Ali', 'explicit multi-word lastName kept');

  suite.equal(
    Map.bestKeyForField({ label: 'Given name', type: 'text' }),
    'firstName',
    'Given name → firstName'
  );
  suite.equal(
    Map.bestKeyForField({ label: 'Surname', type: 'text' }),
    'lastName',
    'Surname → lastName'
  );
  suite.equal(
    Map.bestKeyForField({ label: 'Family name', type: 'text' }),
    'lastName',
    'Family name → lastName'
  );

  await (async function nameFillEndToEnd() {
    const p = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="fn">First name</label><input id="fn" name="first_name" autocomplete="given-name" /></div>
        <div class="field"><label for="ln">Last name</label><input id="ln" name="last_name" autocomplete="family-name" /></div>
        <div class="field"><label for="gn">Given name</label><input id="gn" name="given_name" /></div>
        <div class="field"><label for="sn">Surname</label><input id="sn" name="surname" /></div>
        <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
      </div>
    `,
      LIBS
    );
    await p.window.__fillApply.run(PROFILE, {});
    const doc = p.document;
    suite.equal(doc.getElementById('fn').value, 'Alex', 'fills First name=Alex');
    suite.equal(doc.getElementById('ln').value, 'Sample Ali', 'fills Last name=Sample Ali');
    suite.equal(doc.getElementById('gn').value, 'Alex', 'fills Given name=Alex');
    suite.equal(doc.getElementById('sn').value, 'Sample Ali', 'fills Surname=Sample Ali');
  })();

  await (async function nameFromFullNameOnly() {
    const p = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="fn">First name</label><input id="fn" name="first_name" /></div>
        <div class="field"><label for="ln">Last name</label><input id="ln" name="last_name" /></div>
        <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
      </div>
    `,
      LIBS
    );
    await p.window.__fillApply.run(
      { fullName: 'Alex Sample Ali', email: PROFILE.email },
      {}
    );
    suite.equal(
      p.document.getElementById('fn').value,
      'Alex',
      'fullName-only → First=Alex'
    );
    suite.equal(
      p.document.getElementById('ln').value,
      'Sample Ali',
      'fullName-only → Last=Sample Ali (not Ali)'
    );
  })();

  /* ---------------------------------------------------------------- *
   * B) DOB format detection
   * ---------------------------------------------------------------- */
  suite.equal(
    F.detectDateFormat({ type: 'date' }, {}),
    'iso',
    'type=date → iso'
  );
  suite.equal(
    F.detectDateFormat({ type: 'text', placeholder: 'MM/DD/YYYY' }, {}),
    'mdy',
    'placeholder MM/DD/YYYY → mdy'
  );
  suite.equal(
    F.detectDateFormat({ type: 'text', placeholder: 'DD/MM/YYYY' }, {}),
    'dmy',
    'placeholder DD/MM/YYYY → dmy'
  );
  suite.equal(
    F.detectDateFormat({ type: 'text', 'data-format': 'YYYY-MM-DD' }, {}),
    'ymd',
    'data-format YYYY-MM-DD → ymd'
  );
  suite.equal(
    F.detectDateFormat({ type: 'text', label: 'DOB (DD/MM/YYYY)' }, { label: 'DOB (DD/MM/YYYY)' }),
    'dmy',
    'label hint DD/MM/YYYY → dmy'
  );
  suite.equal(
    F.formatDate({ type: 'text', placeholder: 'MM/DD/YYYY' }, '1990-01-15').value,
    '01/15/1990',
    'canonical → MM/DD/YYYY (Workable)'
  );
  suite.equal(
    F.formatDate({ type: 'text', placeholder: 'DD/MM/YYYY' }, '1990-01-15').value,
    '15/01/1990',
    'canonical → DD/MM/YYYY'
  );
  suite.equal(
    F.formatDate({ type: 'date' }, '1990-01-15').value,
    '1990-01-15',
    'canonical → ISO for type=date'
  );
  suite.equal(
    F.formatDate({ type: 'text', name: 'birth_year' }, '1990-01-15').value,
    '1990',
    'split DOB year'
  );
  suite.equal(
    F.formatDate({ type: 'text', name: 'birth_month' }, '1990-01-15').value,
    '01',
    'split DOB month'
  );
  suite.equal(
    F.formatDate({ type: 'text', name: 'birth_day' }, '1990-01-15').value,
    '15',
    'split DOB day'
  );
  suite.equal(
    F.formatDate(
      { type: 'text', placeholder: 'MM/DD/YYYY' },
      '1990-01-15',
      { formats: { mm_dd_yyyy: '01/15/1990', dd_mm_yyyy: '15/01/1990' } }
    ).source,
    'formats_map',
    'optional formats map is used when present'
  );

  await (async function dobFillEndToEnd() {
    const p = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
        <div class="field">
          <label for="dob1">Date of Birth</label>
          <input id="dob1" name="dob" placeholder="MM/DD/YYYY" />
        </div>
        <div class="field">
          <label for="dob2">Date of birth</label>
          <input id="dob2" name="date_of_birth" placeholder="DD/MM/YYYY" />
        </div>
        <div class="field">
          <label for="dob3">Birthday</label>
          <input id="dob3" name="birthday" type="date" />
        </div>
        <div class="field"><label for="by">Birth year</label><input id="by" name="birth_year" /></div>
        <div class="field"><label for="bm">Birth month</label><input id="bm" name="birth_month" /></div>
        <div class="field"><label for="bd">Birth day</label><input id="bd" name="birth_day" /></div>
      </div>
    `,
      LIBS
    );
    await p.window.__fillApply.run(PROFILE, {});
    const doc = p.document;
    suite.equal(doc.getElementById('dob1').value, '01/15/1990', 'fills MM/DD/YYYY DOB');
    suite.equal(doc.getElementById('dob2').value, '15/01/1990', 'fills DD/MM/YYYY DOB');
    suite.equal(doc.getElementById('dob3').value, '1990-01-15', 'fills type=date ISO DOB');
    suite.equal(doc.getElementById('by').value, '1990', 'fills birth year part');
    suite.equal(doc.getElementById('bm').value, '01', 'fills birth month part');
    suite.equal(doc.getElementById('bd').value, '15', 'fills birth day part');
  })();

  /* ---------------------------------------------------------------- *
   * C) Workable / Qiddiya enrich + mapping
   * ---------------------------------------------------------------- */
  const W = page.window.FillApplyRegistry && page.window.FillApplyRegistry.get
    ? page.window.FillApplyRegistry.get('workable')
    : null;
  // Registry may expose list — fall back to scanning
  let workable = W;
  if (!workable && page.window.FillApplyRegistry) {
    const all =
      (page.window.FillApplyRegistry.list && page.window.FillApplyRegistry.list()) ||
      (page.window.FillApplyRegistry.adapters) ||
      [];
    const arr = Array.isArray(all) ? all : Object.values(all || {});
    workable = arr.find(function (a) {
      return a && a.id === 'workable';
    });
  }
  suite.ok(workable, 'workable adapter registered');
  if (workable) {
    suite.ok(workable.detect('https://apply.workable.com/qiddiya/j/ABC'), 'detects workable URL');
    suite.ok(workable.detect('https://careers.qiddiya.com/j/1'), 'detects qiddiya.com');
    const enriched = workable.enrichProfile({
      fullName: 'Alex Sample Ali',
      dateOfBirth: '1990-01-15',
      linkedin: PROFILE.linkedin,
      customAnswers: { worked_for_pif_or_affiliate: '', current_monthly_salary: '' }
    });
    suite.equal(enriched.firstName, 'Alex', 'enrich firstName');
    suite.equal(enriched.lastName, 'Sample Ali', 'enrich lastName multi-word');
    suite.equal(enriched.customAnswers.conflict_of_interest, 'No', 'enrich conflict → No');
    suite.equal(enriched.customAnswers.working_for_qiddiya, 'No', 'enrich working for Qiddiya → No');
    suite.equal(
      enriched.customAnswers.never_had_criminal_conviction,
      'Yes',
      'enrich never conviction → Yes'
    );
    suite.equal(enriched.customAnswers.current_monthly_salary, '', 'empty salary stays empty');
    suite.equal(enriched.customAnswers.worked_for_pif_or_affiliate, '', 'empty PIF stays empty');
  }

  await (async function workableStyleForm() {
    const p = createPage(
      `
      <div id="application-form" data-ui="application-form">
        <div class="field"><label for="fn">First name</label><input id="fn" name="firstname" /></div>
        <div class="field"><label for="ln">Last name</label><input id="ln" name="lastname" /></div>
        <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
        <div class="field">
          <label for="dob">Date of Birth</label>
          <input id="dob" name="date_of_birth" placeholder="MM/DD/YYYY" autocomplete="bday" />
        </div>
        <div class="field">
          <label for="edu">Highest Education Level</label>
          <select id="edu" name="education">
            <option value="">Select...</option>
            <option value="bachelors">Bachelors</option>
            <option value="masters">Masters</option>
            <option value="mba">MBA</option>
            <option value="phd">Doctorate</option>
          </select>
        </div>
        <div class="field">
          <label for="loc">Current Location</label>
          <input id="loc" name="current_location" />
        </div>
        <div class="field">
          <label for="nat">Nationality</label>
          <select id="nat" name="nationality">
            <option value="">Select...</option>
            <option value="Pakistan">Pakistan</option>
            <option value="Saudi Arabia">Saudi Arabia</option>
          </select>
        </div>
        <div class="field">
          <label for="sal">Salutation</label>
          <select id="sal" name="salutation">
            <option value="">Select...</option>
            <option value="Mr.">Mr.</option>
            <option value="Ms.">Ms.</option>
          </select>
        </div>
        <div class="field">
          <label for="yrs">Years of relevant experience</label>
          <input id="yrs" name="years_experience" />
        </div>
        <div class="field">
          <label for="sm">Social media</label>
          <input id="sm" name="social_media" type="url" />
        </div>
        <div class="field">
          <label for="coi">Conflict of interest</label>
          <select id="coi" name="conflict">
            <option value="">Select...</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </div>
        <div class="field">
          <label for="qid">Are you currently involved or working directly for Qiddiya</label>
          <select id="qid" name="qiddiya">
            <option value="">Select...</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </div>
        <div class="field">
          <label for="crim">I hereby confirm that I have never had any criminal conviction</label>
          <select id="crim" name="criminal">
            <option value="">Select...</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </div>
        <div class="field">
          <label for="salc">Current monthly salary</label>
          <input id="salc" name="current_salary" />
        </div>
        <div class="field">
          <label for="pif">Are you currently or have you ever worked directly for PIF or one of its affiliated companies?</label>
          <select id="pif" name="pif">
            <option value="">Select...</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </div>
        <div class="field">
          <label for="cv">Resume</label>
          <input id="cv" name="resume" type="file" />
        </div>
      </div>
    `,
      LIBS
    );
    await p.window.__fillApply.run(PROFILE, {});
    const doc = p.document;
    suite.equal(doc.getElementById('fn').value, 'Alex', 'Workable First name');
    suite.equal(doc.getElementById('ln').value, 'Sample Ali', 'Workable Last name');
    suite.equal(doc.getElementById('dob').value, '01/15/1990', 'Workable DOB MM/DD/YYYY');
    suite.ok(
      /masters|mba/i.test(doc.getElementById('edu').value) ||
        /masters|mba/i.test(doc.getElementById('edu').selectedOptions[0].text),
      'Highest Education → Masters/MBA'
    );
    suite.equal(doc.getElementById('loc').value, 'Riyadh', 'Current Location → Riyadh');
    suite.equal(doc.getElementById('nat').value, 'Pakistan', 'Nationality → Pakistan');
    suite.equal(doc.getElementById('sal').value, 'Mr.', 'Salutation → Mr.');
    suite.equal(doc.getElementById('yrs').value, '15', 'Years of relevant experience → 15');
    suite.ok(
      /linkedin/i.test(doc.getElementById('sm').value),
      'Social media → LinkedIn URL'
    );
    suite.equal(doc.getElementById('coi').value, 'No', 'Conflict of interest → No');
    suite.equal(doc.getElementById('qid').value, 'No', 'Working for Qiddiya → No');
    suite.equal(doc.getElementById('crim').value, 'Yes', 'Never had conviction → Yes');
    suite.equal(doc.getElementById('salc').value, '', 'Empty salary skipped');
    suite.equal(doc.getElementById('pif').value, '', 'Empty PIF skipped');
  })();

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
