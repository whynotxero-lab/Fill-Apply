/**
 * Global fill fixes: gender identity, phone country + national number,
 * dial-code option match, resume vs cover routing, green/yellow HUD marks.
 *
 * Run: node scripts/smoke-global-fill-fixes.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const LIBS = [
  'lib/dom-deep.js',
  'lib/format.js',
  'lib/synonyms.js',
  'lib/field-map.js',
  'lib/files.js',
  'content/focus-hud.js',
  'content/fill.js'
];

const suite = createSuite('smoke-global-fill-fixes');

const PROFILE = {
  firstName: 'Sample',
  lastName: 'Ali',
  email: 'zahid@example.com',
  phone: '501234567',
  phoneCountry: '+966',
  country: 'Saudi Arabia',
  gender: 'Male',
  linkedin: 'https://linkedin.com/in/zahid'
};

function run(page, options) {
  return page.window.__fillApply.run(PROFILE, options || {});
}

(async function main() {
  await (async function genderIdentityFilled() {
    const page = createPage(
      `
      <form id="application-form">
        <div class="field"><label for="fn">First Name</label><input id="fn" /></div>
        <section class="eeo">
          <h3>Voluntary Self-Identification</h3>
          <div class="field">
            <label for="gi">Gender Identity: The following question is completely voluntary...</label>
            <select id="gi">
              <option value="">Select...</option>
              <option value="man">Male</option>
              <option value="woman">Female</option>
              <option value="decline">Prefer not to say</option>
            </select>
          </div>
          <div class="field">
            <label for="race">Race / Ethnicity</label>
            <select id="race">
              <option value="">Select...</option>
              <option>Asian</option>
              <option>White</option>
            </select>
          </div>
        </section>
      </form>
    `,
      LIBS
    );
    const result = await run(page);
    const doc = page.document;
    suite.equal(doc.getElementById('gi').value, 'man', 'Gender Identity select picks Male from profile');
    suite.equal(doc.getElementById('race').value, '', 'non-gender EEO fields stay blank');
    suite.ok(
      !(result.skipped || []).some(function (s) {
        return /gender identity/i.test(s.label || '') && s.reason === 'voluntary_self_identification';
      }),
      'Gender Identity is not skipped when profile has gender'
    );
    suite.ok(
      (result.skipped || []).some(function (s) {
        return /race/i.test(s.label || '') && s.reason === 'voluntary_self_identification';
      }),
      'Race/Ethnicity remains skipped by EEO policy'
    );
  })();

  await (async function genderRadioMale() {
    const page = createPage(
      `
      <form id="application-form">
        <fieldset>
          <legend>Gender Identity (voluntary)</legend>
          <label><input type="radio" name="g" value="female" /> Female</label>
          <label><input type="radio" name="g" value="male" /> Male</label>
          <label><input type="radio" name="g" value="decline" /> Decline</label>
        </fieldset>
      </form>
    `,
      LIBS
    );
    await run(page);
    suite.ok(page.document.querySelector('input[name="g"][value="male"]').checked, 'Male radio selected');
  })();

  await (async function phoneCountryAndNumber() {
    const page = createPage(
      `
      <form id="application-form">
        <div class="field">
          <label for="cc">Country*</label>
          <select id="cc" name="country">
            <option value="">Select...</option>
            <option value="US">+1 United States</option>
            <option value="SA">+966 Saudi Arabia</option>
            <option value="AE">+971 United Arab Emirates</option>
            <option value="GB">+44 United Kingdom</option>
          </select>
        </div>
        <div class="field">
          <label for="ph">Phone*</label>
          <input id="ph" name="phone" type="tel" />
        </div>
      </form>
    `,
      LIBS
    );
    const F = page.window.FillApplyFormat;
    const map = page.window.FillApplyFieldMap;
    const desc = {
      label: 'Country*',
      name: 'country',
      type: 'select-one',
      options: [
        { text: '+1 United States', value: 'US' },
        { text: '+966 Saudi Arabia', value: 'SA' },
        { text: '+971 United Arab Emirates', value: 'AE' },
        { text: '+44 United Kingdom', value: 'GB' }
      ]
    };
    suite.equal(
      map.bestKeyForField(desc),
      'phoneCountry',
      'Country* with dial-code options maps to phoneCountry'
    );
    suite.equal(
      F.fieldKind(desc, 'country'),
      'phoneCountry',
      'fieldKind treats dial-code Country* as phoneCountry'
    );

    await run(page);
    const doc = page.document;
    suite.equal(doc.getElementById('cc').value, 'SA', 'phone country select matches +966 / Saudi');
    const phoneVal = String(doc.getElementById('ph').value || '').replace(/\s+/g, '');
    suite.ok(
      phoneVal === '501234567' || phoneVal === '0501234567' || /501234567$/.test(phoneVal),
      'phone field gets national number (got ' + doc.getElementById('ph').value + ')'
    );
    suite.ok(!/^\+966/.test(phoneVal), 'national phone does not repeat the dial code');
  })();

  await (async function dialCodeOptionMatch() {
    const page = createPage(
      `
      <select id="cc">
        <option value="">Select</option>
        <option value="966">Saudi Arabia (+966)</option>
        <option value="971">United Arab Emirates (+971)</option>
      </select>
    `,
      LIBS
    );
    const ok = page.window.__fillApply.matchSelectOption(page.document.getElementById('cc'), '+966');
    suite.ok(ok, 'matchSelectOption finds dial code inside option text');
    suite.equal(page.document.getElementById('cc').value, '966', 'selected option value is 966');

    const variants = page.window.FillApplyFormat.valueVariants('+966', 'phoneCountry');
    suite.ok(variants.indexOf('Saudi Arabia') !== -1, 'variants include country name');
    suite.ok(variants.indexOf('Saudi') !== -1, 'variants include Saudi token');
    suite.ok(
      variants.some(function (v) {
        return /\+?966/.test(v);
      }),
      'variants include dial code'
    );
  })();

  await (async function resumeVsCoverRouting() {
    const page = createPage(
      `
      <form id="application-form">
        <div class="field">
          <label for="cv">Resume / CV</label>
          <input id="cv" name="resume" type="file" />
        </div>
        <div class="field">
          <label for="cl">Cover Letter</label>
          <input id="cl" name="cover_letter" type="file" />
        </div>
      </form>
    `,
      ['lib/dom-deep.js', 'lib/files.js']
    );
    const Files = page.window.FillApplyFiles;
    const result = Files.attachDocuments({
      resume: {
        name: 'zahid-cv.pdf',
        mime: 'application/pdf',
        base64: Buffer.from('%PDF-1.4 resume').toString('base64')
      },
      cover: {
        name: 'cover-letter.pdf',
        mime: 'application/pdf',
        base64: Buffer.from('%PDF-1.4 cover').toString('base64')
      }
    });
    const cv = page.document.getElementById('cv');
    const cl = page.document.getElementById('cl');
    suite.ok(cv.files && cv.files[0] && /cv|resume/i.test(cv.files[0].name), 'resume input gets resume');
    suite.ok(cl.files && cl.files[0] && /cover/i.test(cl.files[0].name), 'cover letter input gets cover letter');
    suite.ok(
      !(cl.files && cl.files[0] && /cv|resume/i.test(cl.files[0].name)),
      'cover letter input does not receive the resume'
    );
    suite.ok(result.resumeAttached, 'resumeAttached reported');
    suite.ok(result.coverAttached, 'coverAttached reported');
  })();

  await (async function coverOnlyField() {
    const page = createPage(
      `
      <form id="application-form">
        <label for="cl">Cover Letter</label>
        <input id="cl" name="cover" type="file" />
      </form>
    `,
      ['lib/dom-deep.js', 'lib/files.js']
    );
    const Files = page.window.FillApplyFiles;
    Files.attachDocuments({
      resume: {
        name: 'zahid-cv.pdf',
        mime: 'application/pdf',
        base64: Buffer.from('%PDF-1.4 resume').toString('base64')
      },
      cover: {
        name: 'cover-letter.pdf',
        mime: 'application/pdf',
        base64: Buffer.from('%PDF-1.4 cover').toString('base64')
      }
    });
    const cl = page.document.getElementById('cl');
    suite.ok(cl.files && cl.files[0], 'cover field received a file');
    suite.equal(cl.files[0].name, 'cover-letter.pdf', 'cover-only field gets cover letter, not resume');
  })();

  await (async function greenYellowHud() {
    const page = createPage(
      `
      <form id="application-form">
        <div class="field"><label for="fn">First Name</label><input id="fn" /></div>
        <div class="field"><label for="unk">Favorite color</label><input id="unk" required /></div>
      </form>
    `,
      LIBS
    );
    await run(page, { highlightUnmatched: true });
    const fn = page.document.getElementById('fn');
    const unk = page.document.getElementById('unk');
    suite.ok(
      fn.getAttribute('data-fill-apply-filled') === '1' ||
        fn.getAttribute('data-fill-apply-status') === 'filled' ||
        String(fn.style.outline || '').indexOf('22c55e') !== -1,
      'auto-filled field marked green'
    );
    suite.ok(
      unk.getAttribute('data-fill-apply-unmatched') === '1' ||
        unk.getAttribute('data-fill-apply-status') === 'unfilled' ||
        String(unk.style.outline || '').indexOf('f59e0b') !== -1,
      'unmatched field marked yellow'
    );

    const Hud = page.window.FillApplyFocusHud;
    suite.ok(Hud && typeof Hud.markStatus === 'function', 'FocusHud.markStatus helper exists');
    Hud.markStatus(fn, 'filled', 'Filled');
    suite.equal(fn.getAttribute('data-fill-apply-status'), 'filled', 'markStatus sets filled');
    Hud.markStatus(unk, 'unfilled', 'Needs info');
    suite.equal(unk.getAttribute('data-fill-apply-status'), 'unfilled', 'markStatus sets unfilled');
  })();

  await (async function genderHelpers() {
    const page = createPage('<div></div>', LIBS);
    const A = page.window.__fillApply;
    suite.ok(A.isGenderField('Gender Identity: voluntary'), 'isGenderField detects Gender Identity');
    suite.ok(!A.isGenderField('Sexual Orientation'), 'isGenderField ignores sexual orientation');
    suite.ok(
      !A.shouldSkipDiversity(null, 'Gender Identity (voluntary)', { gender: 'Male' }),
      'shouldSkipDiversity allows gender when profile has Male'
    );
    suite.ok(
      A.shouldSkipDiversity(null, 'Race / Ethnicity', { gender: 'Male' }),
      'shouldSkipDiversity still skips race'
    );
    suite.ok(
      A.optionsLookLikeDialCodes([
        { text: '+1 US' },
        { text: '+966 Saudi' },
        { text: '+971 UAE' },
        { text: '+44 UK' }
      ]),
      'optionsLookLikeDialCodes detects dial lists'
    );
  })();

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
