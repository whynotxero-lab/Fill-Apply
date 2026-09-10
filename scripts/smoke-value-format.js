/**
 * Value formatting: the shape a value has to be in before the control accepts
 * it — phone numbers, postal codes, dates, URLs, numbers and select spellings.
 *
 * Run: node scripts/smoke-value-format.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const LIBS = [
  'lib/dom-deep.js',
  'lib/format.js',
  'lib/synonyms.js',
  'lib/field-map.js',
  'lib/files.js',
  'content/fill.js'
];

const suite = createSuite('smoke-value-format');

const PROFILE = {
  firstName: 'Zahid',
  lastName: 'Ali',
  email: 'zahid@example.com',
  phone: '501234567',
  phoneCountry: '+971',
  country: 'United Arab Emirates',
  state: 'California',
  zip: '10018-1234',
  linkedin: 'linkedin.com/in/zahid',
  github: 'https://github.com/zahid',
  authorizedToWork: 'Yes',
  coverLetter:
    'I have led financial planning and analysis for a retail group across the Gulf for fifteen years.',
  customAnswers: {
    currentSalary: '25000 AED',
    dateOfBirth: '1988-03-15'
  }
};

/** Format a value the way the fill engine does, for a bare descriptor. */
function shape(page, descriptor, value, context) {
  return page.window.FillApplyFormat.formatForField(
    descriptor,
    value,
    Object.assign({ profile: PROFILE }, context || {})
  );
}

(async function main() {
  const page = createPage('<div id="application-form"></div>', LIBS);

  /* ---------------------------------------------------------------- *
   * Phone numbers
   * ---------------------------------------------------------------- */

  const tel = { tag: 'INPUT', type: 'tel' };

  suite.equal(
    shape(page, tel, '501234567', { key: 'phone' }).value,
    '+971501234567',
    'a single phone field gets the full international number'
  );

  suite.equal(
    shape(page, tel, '501234567', { key: 'phone', hasPhoneCountryField: true }).value,
    '501234567',
    'a form with its own country-code control gets the national number only'
  );

  suite.equal(
    shape(page, tel, '+971501234567', { key: 'phone', hasPhoneCountryField: true }).value,
    '501234567',
    'a stored international number is split when the code has its own field'
  );

  suite.equal(
    shape(page, tel, '0501234567', { key: 'phone' }).value,
    '+971501234567',
    'a national trunk zero is dropped in front of a country code'
  );

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'tel', pattern: '\\d{10}' }, '5551234567', {
      key: 'phone',
      profile: { phoneCountry: '+1' }
    }).value,
    '5551234567',
    'pattern="\\d{10}" gets ten bare digits, not +1...'
  );

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'tel', placeholder: '(555) 555-5555' }, '5551234567', {
      key: 'phone',
      profile: { phoneCountry: '+1' }
    }).value,
    '(555) 123-4567',
    'a placeholder mask is filled in that exact shape'
  );

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'tel', maxLength: 10 }, '5551234567', {
      key: 'phone',
      profile: { phoneCountry: '+1' }
    }).value,
    '5551234567',
    'maxlength=10 keeps the value inside the limit'
  );

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'text', label: 'Country code' }, '+971', {}).value,
    '+971',
    'a country-code field gets the dial code on its own'
  );

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'number', label: 'Phone country code' }, '+971', {}).value,
    '971',
    'a numeric country-code field gets the dial code without the plus'
  );

  suite.equal(
    page.window.FillApplyFormat.phoneParts({ phone: '971501234567', phoneCountry: '+971' }).national,
    '501234567',
    'a duplicated country code in the stored number is not filled twice'
  );

  suite.equal(
    page.window.FillApplyFormat.phoneParts({ phone: '5551234567' }).e164,
    '',
    'no country code means no invented international number'
  );

  /* ---------------------------------------------------------------- *
   * Postal codes
   * ---------------------------------------------------------------- */

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'text', maxLength: 5 }, '10018-1234', {
      key: 'zip',
      profile: { country: 'United States' }
    }).value,
    '10018',
    'a US ZIP field of maxlength 5 loses the +4 suffix'
  );

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'text', pattern: '\\d{5}' }, '10018-1234', {
      key: 'zip',
      profile: { country: 'United States' }
    }).value,
    '10018',
    'pattern="\\d{5}" gets five digits'
  );

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'text' }, 'k1a0b1', {
      key: 'zip',
      profile: { country: 'Canada' }
    }).value,
    'K1A 0B1',
    'a Canadian postal code is uppercased and spaced'
  );

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'text' }, 'sw1a1aa', {
      key: 'postcode',
      profile: { country: 'United Kingdom' }
    }).value,
    'SW1A 1AA',
    'a UK postcode gets its space before the last three characters'
  );

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'text', pattern: '[A-Z0-9]{6}' }, 'K1A 0B1', {
      key: 'zip',
      profile: { country: 'Canada' }
    }).value,
    'K1A0B1',
    'a pattern that forbids spaces gets the compact postal code'
  );

  /* ---------------------------------------------------------------- *
   * URLs, dates, numbers, long text
   * ---------------------------------------------------------------- */

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'url' }, 'linkedin.com/in/zahid', { key: 'linkedin' }).value,
    'https://linkedin.com/in/zahid',
    'type="url" gets a scheme added'
  );

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'text', placeholder: 'username' }, 'https://github.com/zahid', {
      key: 'github'
    }).value,
    'zahid',
    'a field asking for a username gets the handle, not the URL'
  );

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'date' }, '15 March 1988', { kind: 'date' }).value,
    '1988-03-15',
    'type="date" gets the ISO date it requires'
  );

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'text', placeholder: 'DD/MM/YYYY' }, '1988-03-15', {
      kind: 'date'
    }).value,
    '15/03/1988',
    'a text date field is written in the order its placeholder shows'
  );

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'number' }, '25000 AED', { kind: 'number' }).value,
    '25000',
    'a currency code is stripped for a number input'
  );

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'number', min: '0', max: '20' }, '25', { kind: 'number' }).value,
    '20',
    'a number above the control maximum is clamped'
  );

  suite.equal(
    shape(page, { tag: 'INPUT', type: 'number', min: '0' }, '25000 AED', { kind: 'number' }).value,
    '25000',
    'an empty max attribute does not clamp the value to zero'
  );

  suite.equal(
    shape(page, { tag: 'TEXTAREA', type: 'textarea', maxLength: 40 }, PROFILE.coverLetter, {
      kind: 'text'
    }).value,
    'I have led financial planning and',
    'a long answer in a short box is cut on a word boundary'
  );

  /* ---------------------------------------------------------------- *
   * Alternate spellings for selects
   * ---------------------------------------------------------------- */

  const variants = page.window.FillApplyFormat.valueVariants('United Arab Emirates', 'country');
  suite.ok(variants.indexOf('AE') !== -1, 'a country name offers its two-letter code as an alternative');
  suite.ok(
    page.window.FillApplyFormat.valueVariants('California', 'state').indexOf('CA') !== -1,
    'a state name offers its two-letter code as an alternative'
  );

  /* ---------------------------------------------------------------- *
   * End to end through the fill engine
   * ---------------------------------------------------------------- */

  await (async function phoneSplitAcrossTwoFields() {
    const p = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
        <div class="field">
          <label for="cc">Phone country code</label>
          <select id="cc" name="phone_country">
            <option value="">Select...</option>
            <option value="+1">+1</option>
            <option value="+971">+971</option>
          </select>
        </div>
        <div class="field"><label for="ph">Mobile number</label><input id="ph" name="phone" type="tel" /></div>
      </div>
    `,
      LIBS
    );
    await p.window.__fillApply.run(PROFILE, {});
    suite.equal(p.document.getElementById('cc').value, '+971', 'the country-code select is set');
    suite.equal(
      p.document.getElementById('ph').value,
      '501234567',
      'the number field next to it gets the national number'
    );
  })();

  await (async function constrainedFieldsEndToEnd() {
    const p = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
        <div class="field"><label for="ph">Phone</label><input id="ph" name="phone" type="tel" /></div>
        <div class="field"><label for="zp">ZIP code</label><input id="zp" name="zip" maxlength="5" /></div>
        <div class="field"><label for="li">LinkedIn</label><input id="li" name="linkedin" type="url" /></div>
        <div class="field">
          <label for="ct">Country</label>
          <select id="ct" name="country">
            <option value="">Select...</option>
            <option value="AE">AE</option>
            <option value="US">US</option>
          </select>
        </div>
      </div>
    `,
      LIBS
    );
    await p.window.__fillApply.run(PROFILE, {});
    const doc = p.document;
    suite.equal(doc.getElementById('ph').value, '+971501234567', 'a lone phone field gets the full number');
    suite.equal(doc.getElementById('zp').value, '10018', 'the ZIP field respects its maxlength');
    suite.equal(
      doc.getElementById('li').value,
      'https://linkedin.com/in/zahid',
      'the LinkedIn URL field gets an absolute URL'
    );
    suite.equal(
      doc.getElementById('ct').value,
      'AE',
      'a country select offering codes is matched from the full country name'
    );
  })();

  suite.finish();
})();
