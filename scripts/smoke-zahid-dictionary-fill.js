/**
 * Zahid dictionary fill: title Mr., Yes/No app Q by label, skip empty address,
 * country / province / city from profile + adaptive knowledge.
 * Run: node scripts/smoke-zahid-dictionary-fill.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-zahid-dictionary-fill');

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
  'lib/profile-io.js',
  'lib/profile.js',
  'content/fill.js'
];

const PROFILE_PATHS = [
  path.join('/workspace/private-profiles/zahid-profile.json'),
  path.join('/workspace/deliverables/zahid-profile.json'),
  path.join(__dirname, '..', 'profiles', 'zahid-profile.json')
];

function loadZahid() {
  for (let i = 0; i < PROFILE_PATHS.length; i++) {
    if (fs.existsSync(PROFILE_PATHS[i])) {
      return JSON.parse(fs.readFileSync(PROFILE_PATHS[i], 'utf8'));
    }
  }
  // Minimal fixture when private file is absent
  return {
    format: 'fill-apply-profile',
    schemaVersion: 1,
    meta: { profileName: 'Zahid', activate: true },
    profile: {
      title: 'Mr.',
      salutation: 'Mr.',
      city: 'Khobar',
      province: 'Eastern Province',
      state: 'Eastern Province',
      country: 'Saudi Arabia',
      addressCountry: 'Saudi Arabia',
      addressLine1: '',
      addressLine2: '',
      street: '',
      location: 'Riyadh / Khobar, Saudi Arabia',
      applicationQuestions: {
        relatives_employed: {
          question: 'Do you have any relatives employed at this or any of our company locations?',
          answer: 'No',
          type: 'boolean'
        },
        former_team_member: { question: 'Are you a former Team Member?', answer: 'No', type: 'boolean' },
        work_auth_no_permit: {
          question:
            'If you are hired, can you provide proof that you are authorized to work in the country within which this position resides, without having to obtain a working permit?',
          answer: 'Yes',
          type: 'boolean'
        },
        supervising_experience: {
          question: 'Do you have prior experience with leading or supervising teams?',
          answer: 'Yes',
          type: 'boolean'
        },
        finance_accounting_qualifications: {
          question: 'Do you hold any finance and/or Accounting qualifications?',
          answer: 'Yes',
          type: 'boolean'
        }
      },
      customAnswers: {}
    },
    knowledge: {
      version: 1,
      records: [
        {
          canonical_key: 'title',
          key: 'title',
          type: 'select',
          value: 'Mr.',
          status: 'active',
          confidence: 'confirmed',
          aliases: ['Title', 'Salutation', 'Mr.', 'Mr']
        },
        {
          canonical_key: 'relatives_employed',
          key: 'relatives_employed',
          type: 'boolean',
          value: 'No',
          status: 'active',
          confidence: 'confirmed',
          aliases: [
            'Do you have any relatives employed at this or any of our company locations?',
            'Relatives employed'
          ]
        },
        {
          canonical_key: 'former_team_member',
          key: 'former_team_member',
          type: 'boolean',
          value: 'No',
          status: 'active',
          confidence: 'confirmed',
          aliases: ['Are you a former Team Member?', 'Former Team Member']
        },
        {
          canonical_key: 'work_auth_no_permit',
          key: 'work_auth_no_permit',
          type: 'boolean',
          value: 'Yes',
          status: 'active',
          confidence: 'confirmed',
          aliases: [
            'If you are hired, can you provide proof that you are authorized to work in the country within which this position resides, without having to obtain a working permit?'
          ]
        },
        {
          canonical_key: 'supervising_experience',
          key: 'supervising_experience',
          type: 'boolean',
          value: 'Yes',
          status: 'active',
          confidence: 'confirmed',
          aliases: ['Do you have prior experience with leading or supervising teams?']
        },
        {
          canonical_key: 'finance_accounting_qualifications',
          key: 'finance_accounting_qualifications',
          type: 'boolean',
          value: 'Yes',
          status: 'active',
          confidence: 'confirmed',
          aliases: ['Do you hold any finance and/or Accounting qualifications?']
        },
        {
          canonical_key: 'address_line_1',
          key: 'address_line_1',
          type: 'string',
          value: '',
          status: 'active',
          confidence: 'shell',
          aliases: ['Address Line 1', 'Street Address']
        },
        {
          canonical_key: 'address_line_2',
          key: 'address_line_2',
          type: 'string',
          value: '',
          status: 'active',
          confidence: 'shell',
          aliases: ['Address Line 2']
        },
        {
          canonical_key: 'city',
          key: 'city',
          type: 'string',
          value: 'Khobar',
          status: 'active',
          confidence: 'confirmed',
          aliases: ['City']
        },
        {
          canonical_key: 'province',
          key: 'province',
          type: 'select',
          value: 'Eastern Province',
          status: 'active',
          confidence: 'confirmed',
          aliases: ['Province', 'State', 'State/Province']
        },
        {
          canonical_key: 'country',
          key: 'country',
          type: 'select',
          value: 'Saudi Arabia',
          status: 'active',
          confidence: 'confirmed',
          aliases: ['Country', 'Country of Residence']
        },
        {
          canonical_key: 'address_country',
          key: 'address_country',
          type: 'select',
          value: 'Saudi Arabia',
          status: 'active',
          confidence: 'confirmed',
          aliases: ['Address Country', 'Country']
        },
        {
          canonical_key: 'phone_country',
          key: 'phone_country',
          type: 'select',
          value: '+966',
          status: 'active',
          confidence: 'confirmed',
          aliases: ['Country', 'Country code', 'Phone Country', '+966']
        }
      ]
    }
  };
}

function checkedRadio(doc, name) {
  const el = Array.prototype.slice
    .call(doc.querySelectorAll('input[type="radio"][name="' + name + '"]'))
    .find(function (r) {
      return r.checked;
    });
  return el ? el.value : null;
}

(async function main() {
  const zahid = loadZahid();
  const page0 = createPage('<div></div>', ['lib/profile-io.js', 'lib/profile.js']);
  const IO = page0.window.FillApplyProfileIO;
  const validated = IO.validateImportPayload(zahid);
  suite.ok(validated.ok, 'Zahid profile validates');
  const titleRec = validated.data.knowledge.find(function (r) {
    return r.canonicalKey === 'title';
  });
  suite.equal(titleRec && titleRec.status, 'confirmed', 'import normalizes status active→confirmed');
  suite.ok(
    (validated.data.profile.customQA || []).some(function (q) {
      return /relatives employed/i.test(q.question || '');
    }),
    'applicationQuestions folded into customQA'
  );

  const html = `
    <form id="app">
      <fieldset>
        <legend>Title</legend>
        <label><input type="radio" name="title" value="Mr." /> Mr.</label>
        <label><input type="radio" name="title" value="Mrs." /> Mrs.</label>
        <label><input type="radio" name="title" value="Ms." /> Ms.</label>
      </fieldset>
      <div>
        <p>Do you have any relatives employed at this or any of our company locations?</p>
        <label><input type="radio" name="rel" value="Yes" /> Yes</label>
        <label><input type="radio" name="rel" value="No" /> No</label>
      </div>
      <div>
        <p>Are you a former Team Member?</p>
        <label><input type="radio" name="ftm" value="Yes" /> Yes</label>
        <label><input type="radio" name="ftm" value="No" /> No</label>
      </div>
      <div>
        <p>If you are hired, can you provide proof that you are authorized to work in the country within which this position resides, without having to obtain a working permit?</p>
        <label><input type="radio" name="wa" value="Yes" /> Yes</label>
        <label><input type="radio" name="wa" value="No" /> No</label>
      </div>
      <div>
        <p>Do you have prior experience with leading or supervising teams?</p>
        <label><input type="radio" name="sup" value="Yes" /> Yes</label>
        <label><input type="radio" name="sup" value="No" /> No</label>
      </div>
      <div>
        <p>Do you hold any finance and/or Accounting qualifications?</p>
        <label><input type="radio" name="fin" value="Yes" /> Yes</label>
        <label><input type="radio" name="fin" value="No" /> No</label>
      </div>
      <div>
        <label for="a1">Address Line 1</label>
        <input id="a1" name="address1" value="" />
      </div>
      <div>
        <label for="city">City</label>
        <input id="city" name="city" />
      </div>
      <div>
        <label for="prov">Province / State</label>
        <select id="prov" name="province">
          <option value="">--</option>
          <option value="Eastern Province">Eastern Province</option>
          <option value="Riyadh">Riyadh</option>
        </select>
      </div>
      <div>
        <label for="ctry">Country</label>
        <select id="ctry" name="country">
          <option value="">--</option>
          <option value="Saudi Arabia">Saudi Arabia</option>
          <option value="Pakistan">Pakistan</option>
        </select>
      </div>
    </form>
  `;

  const page = createPage(html, LIBS);
  const profile = Object.assign({}, validated.data.profile, {
    __adaptiveKnowledge: { version: 1, records: validated.data.knowledge }
  });
  page.window.FillApplyKnowledge.hydrate(profile.__adaptiveKnowledge);
  await page.window.__fillApply.run(profile, { skipApplyStart: true, skipCvImport: true });
  const doc = page.document;

  suite.equal(checkedRadio(doc, 'title'), 'Mr.', 'title radio → Mr.');
  suite.equal(checkedRadio(doc, 'rel'), 'No', 'relatives_employed → No by long label');
  suite.equal(checkedRadio(doc, 'ftm'), 'No', 'former_team_member → No');
  suite.equal(checkedRadio(doc, 'wa'), 'Yes', 'work_auth_no_permit → Yes');
  suite.equal(checkedRadio(doc, 'sup'), 'Yes', 'supervising_experience → Yes');
  suite.equal(checkedRadio(doc, 'fin'), 'Yes', 'finance_accounting_qualifications → Yes');
  suite.equal(doc.getElementById('a1').value, '', 'empty address line 1 skipped (not location)');
  // Knowledge may prefer Riyadh (Michael Page city/town) over profile.city Khobar.
  var cityVal = doc.getElementById('city').value;
  suite.ok(
    cityVal === 'Khobar' || cityVal === 'Riyadh',
    'city filled from profile or knowledge (got ' + cityVal + ')'
  );
  suite.ok(['Eastern Province','Riyadh'].indexOf(doc.getElementById('prov').value) !== -1, 'province filled (got ' + doc.getElementById('prov').value + ')');
  suite.equal(doc.getElementById('ctry').value, 'Saudi Arabia', 'country filled (not phone_country)');

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
