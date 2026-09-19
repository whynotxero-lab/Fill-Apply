/**
 * Hilton-style first step + global policies:
 * - tick consent + fill email from profile
 * - gender is select/radio only (never free text)
 * - prefer CV/Resume import CTA before field fill
 * - human corrections grow adaptive knowledge (Key/Type/Value)
 *
 * Run: node scripts/smoke-hilton-consent-cv-learn.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const FILL_LIBS = [
  'lib/dom-deep.js',
  'lib/format.js',
  'lib/synonyms.js',
  'lib/field-map.js',
  'lib/files.js',
  'content/focus-hud.js',
  'content/fill.js'
];

const LEARN_LIBS = [
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
  'content/knowledge-observe.js',
  'content/fill.js'
];

const suite = createSuite('smoke-hilton-consent-cv-learn');

const PROFILE = {
  firstName: 'Zahid',
  lastName: 'Ali',
  email: 'zahid@example.com',
  phone: '504131857',
  phoneCountry: '+966',
  gender: 'Male'
};

function run(page, options) {
  return page.window.__fillApply.run(PROFILE, options || {});
}

(async function main() {
  await (async function hiltonConsentEmailNext() {
    const page = createPage(
      `
      <form id="application-form">
        <h2>Start your application</h2>
        <div class="field">
          <label for="em">Email Address</label>
          <input id="em" name="email" type="email" required />
        </div>
        <div class="field">
          <label for="consent">
            <input id="consent" type="checkbox" required />
            I understand and agree to the Applicant Privacy Notice and electronic signature terms.
          </label>
        </div>
        <button type="button" id="cancel">Cancel</button>
        <button type="button" id="next">Next</button>
      </form>
    `,
      FILL_LIBS
    );
    const result = await run(page);
    const doc = page.document;
    suite.equal(doc.getElementById('em').value, 'zahid@example.com', 'email filled from profile (not invented)');
    suite.ok(doc.getElementById('consent').checked, 'consent/privacy checkbox ticked');
    suite.ok(
      (result.details || []).some(function (d) {
        return d && d.canonicalKey === 'consent' && d.action === 'FILLED';
      }),
      'consent recorded as FILLED'
    );
    const clicked = page.window.__fillApply.clickContinueButtons();
    suite.ok(clicked && clicked.length, 'Next clicked in ready/continue path (got ' + JSON.stringify(clicked) + ')');
  })();

  await (async function genderSelectNotText() {
    const page = createPage(
      `
      <form id="application-form">
        <div class="field">
          <label for="gtext">Gender</label>
          <input id="gtext" name="gender_text" type="text" />
        </div>
        <div class="field">
          <label for="gsel">Gender Identity</label>
          <select id="gsel">
            <option value="">Select...</option>
            <option value="man">Male</option>
            <option value="woman">Female</option>
            <option value="m">M</option>
          </select>
        </div>
        <fieldset>
          <legend>Sex</legend>
          <label><input type="radio" name="sex" value="female" /> Female</label>
          <label><input type="radio" name="sex" value="male" /> Male</label>
          <label><input type="radio" name="sex" value="man" /> Man</label>
        </fieldset>
      </form>
    `,
      FILL_LIBS
    );
    const result = await run(page);
    const doc = page.document;
    suite.equal(doc.getElementById('gtext').value, '', 'gender text box left empty');
    suite.ok(
      (result.skipped || []).some(function (s) {
        return s && s.reason === 'gender_requires_select';
      }),
      'gender text skipped with gender_requires_select'
    );
    suite.ok(
      doc.getElementById('gsel').value === 'man' || doc.getElementById('gsel').value === 'm',
      'gender select picks Male/Man/M (got ' + doc.getElementById('gsel').value + ')'
    );
    suite.ok(
      doc.querySelector('input[name="sex"][value="male"]').checked ||
        doc.querySelector('input[name="sex"][value="man"]').checked,
      'gender radio Male/Man selected'
    );
  })();

  await (async function cvImportFirstThenFill() {
    const page = createPage(
      `
      <form id="application-form">
        <button type="button" id="cvbtn">Fill with CV</button>
        <div class="field"><label for="fn">First Name</label><input id="fn" /></div>
        <div class="field"><label for="em">Email Address</label><input id="em" type="email" /></div>
        <div class="field"><label for="city">City</label><input id="city" /></div>
      </form>
    `,
      FILL_LIBS
    );
    const doc = page.document;
    let cvClicks = 0;
    doc.getElementById('cvbtn').addEventListener('click', function () {
      cvClicks += 1;
      doc.getElementById('fn').value = 'ImportedFirst';
      doc.getElementById('fn').dispatchEvent(new page.window.Event('input', { bubbles: true }));
      doc.getElementById('fn').dispatchEvent(new page.window.Event('change', { bubbles: true }));
    });

    const result = await run(page, { cvImportWaitMs: 50 });
    suite.ok(cvClicks >= 1, 'CV import button clicked first');
    suite.ok(result.cvImportClicked, 'run reports cvImportClicked');
    suite.ok(/fill with cv/i.test(result.cvImportText || ''), 'cvImportText captured');
    suite.equal(doc.getElementById('em').value, 'zahid@example.com', 'email filled after CV import');
    suite.ok(doc.getElementById('fn').value.length > 0, 'first name has a value after import/fill');
  })();

  await (async function learnOnHumanInput() {
    const page = createPage(
      `
      <form id="application-form">
        <div class="field">
          <label for="g">Gender</label>
          <select id="g">
            <option value="">Select...</option>
            <option>Male</option>
            <option>Female</option>
          </select>
        </div>
        <div class="field">
          <label for="relocate">Are you willing to relocate?</label>
          <select id="relocate">
            <option value="">Select...</option>
            <option>Yes</option>
            <option>No</option>
          </select>
        </div>
      </form>
    `,
      LEARN_LIBS
    );
    const w = page.window;
    const Learn = w.FillApplyKnowledgeLearn;
    const Store = w.FillApplyKnowledgeStore;
    suite.ok(Learn && typeof Learn.learn === 'function', 'knowledge learn API present');
    if (Store && Store.resetMemory) Store.resetMemory();

    suite.ok(Learn.isGenderLabel('Gender Identity'), 'gender label is learnable');
    suite.ok(!Learn.isSensitiveLabel('Gender'), 'gender is not treated as sensitive');
    suite.ok(Learn.isSensitiveLabel('I agree to the privacy policy'), 'consent still sensitive/not learned');
    suite.ok(Learn.isSensitiveLabel('Race / Ethnicity'), 'race EEO still sensitive');

    const genderLearn = await Learn.learn({
      label: 'Gender',
      value: 'Male',
      fieldType: 'select',
      kind: 'observe',
      host: 'jobs.hilton.com'
    });
    suite.ok(genderLearn.accepted, 'human gender select answer is learned (got ' + JSON.stringify(genderLearn) + ')');
    suite.ok(
      genderLearn.record && genderLearn.record.fieldType === 'select',
      'learned gender stored as select type'
    );

    const relocateLearn = await Learn.learn({
      label: 'Are you willing to relocate?',
      value: 'Yes',
      fieldType: 'select',
      kind: 'correct',
      host: 'jobs.hilton.com'
    });
    suite.ok(relocateLearn.accepted, 'human correction on unknown field is learned');
    suite.ok(!!w.FillApplyKnowledgeObserve, 'observe module attached');
  })();

  await (async function consentKeywordsCoverHilton() {
    const page = createPage('<div id="application-form"></div>', FILL_LIBS);
    const A = page.window.__fillApply;
    suite.ok(A.CONSENT_RE.test('I understand and agree to the Applicant Privacy Notice'), 'privacy notice keyword');
    suite.ok(A.CONSENT_RE.test('electronic signature terms'), 'electronic signature keyword');
    suite.ok(A.CONSENT_RE.test('I consent to processing'), 'consent keyword');
    suite.ok(A.CONSENT_RE.test('I acknowledge the terms'), 'acknowledge keyword');
    suite.ok(A.CV_IMPORT_RE.test('Fill with CV'), 'Fill with CV');
    suite.ok(A.CV_IMPORT_RE.test('Import from Resume'), 'Import from Resume');
    suite.ok(A.CV_IMPORT_RE.test('Autofill from resume'), 'Autofill from resume');
  })();

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
