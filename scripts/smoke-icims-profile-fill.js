/**
 * iCIMS Candidate Profile fill accuracy (1.26.3):
 * - Nationality = Pakistan/Pakistani
 * - Education Country = Pakistan (NOT Saudi Arabia)
 * - Residence / phone country = Saudi Arabia / +966
 * - Employment Country = Saudi Arabia when role in Riyadh
 * - Qualification Title never [object Object]
 * - Environments password fills Create-login; no manual pause
 *
 * Run: node scripts/smoke-icims-profile-fill.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-icims-profile-fill');

const LIBS = [
  'lib/dom-deep.js',
  'lib/format.js',
  'lib/synonyms.js',
  'lib/nav-first.js',
  'lib/challenges.js',
  'lib/auth-walls.js',
  'lib/environment-store.js',
  'lib/signup-login.js',
  'lib/files.js',
  'adapters/registry.js',
  'adapters/fallback.js',
  'adapters/ats/icims.js'
];

const PROFILE = {
  email: 'zahid@example.com',
  firstName: 'Zahid',
  lastName: 'Ali',
  city: 'Riyadh',
  country: 'Saudi Arabia',
  nationality: 'Pakistani',
  phone: '504131857',
  phoneCountry: '+966',
  currentTitle: 'FP&A Manager',
  education: [
    {
      title: 'MBA Executive — Finance',
      degree: 'MBA',
      institution: 'Virtual University of Pakistan',
      country: 'Pakistan',
      end: '2018'
    }
  ],
  workHistory: [
    {
      title: 'FP&A Manager',
      employer: 'Acme KSA',
      city: 'Riyadh',
      country: 'Saudi Arabia',
      current: true
    }
  ],
  password: 'Zahid@Finance786'
};

const FORM = `
<html><body>
  <h1>Candidate Profile</h1>
  <p>Create a login</p>
  <label>CV <input type="file" id="cv" name="resume" accept=".pdf" /></label>
  <label>First Name <input name="firstName" /></label>
  <label>Last Name <input name="lastName" /></label>
  <label>Email <input type="email" name="email" /></label>
  <label>Nationality
    <select id="nat" name="nationality">
      <option value="">Select</option>
      <option value="PK">Pakistani</option>
      <option value="SA">Saudi</option>
      <option value="US">American</option>
    </select>
  </label>
  <label>Phone Country Code
    <select id="pcc" name="phoneCountry">
      <option value="">Select</option>
      <option value="1684">American Samoa (+1684)</option>
      <option value="966">Saudi Arabia (+966)</option>
      <option value="92">Pakistan (+92)</option>
    </select>
  </label>
  <label>Mobile Phone Number <input id="phone" name="phone" value="" /></label>
  <label>Country / Region of Residence
    <select id="res" name="country">
      <option value="">Select</option>
      <option value="SA">Saudi Arabia</option>
      <option value="PK">Pakistan</option>
    </select>
  </label>
  <label>City <input name="city" /></label>
  <h3>Employment Details</h3>
  <label>Job Title <input id="jt" name="jobTitle" /></label>
  <label>Employer <input name="employer" /></label>
  <label>Employment Country
    <select id="empC" name="empCountry">
      <option value="">Select</option>
      <option value="SA">Saudi Arabia</option>
      <option value="PK">Pakistan</option>
    </select>
  </label>
  <label>Details <textarea id="relDetails" name="relativeDetails"></textarea></label>
  <h3>Education</h3>
  <label>Qualification Title <input id="qt" name="qualTitle" /></label>
  <label>Institution <input id="inst" name="institution" /></label>
  <label>Education Country
    <select id="eduC" name="eduCountry">
      <option value="">Select</option>
      <option value="SA">Saudi Arabia</option>
      <option value="PK">Pakistan</option>
    </select>
  </label>
  <label>Password <input id="pw" type="password" name="password" /></label>
  <label>Password Re-enter <input id="pw2" type="password" name="passwordConfirm" /></label>
  <button type="button">Submit Profile</button>
</body></html>
`;

function selectedText(sel) {
  const opt = sel.options[sel.selectedIndex];
  return opt ? (opt.textContent || '').trim() : '';
}

(async function main() {
  const page = createPage(FORM, LIBS);
  page.window.FillApplySynonyms.isVisible = function (el) {
    return !!(el && !el.hidden);
  };
  // Seed Environments password (and keep profile.password too)
  if (page.window.FillApplyEnvironment && page.window.FillApplyEnvironment.save) {
    await page.window.FillApplyEnvironment.save({ registrationPassword: 'Zahid@Finance786' });
  }

  const docs = {
    resume: {
      name: 'Zahid_CV.pdf',
      mime: 'application/pdf',
      // tiny valid-ish base64 payload
      base64: Buffer.from('%PDF-1.1 smoke resume').toString('base64')
    }
  };

  const adapter = page.window.FillApply_icimsAdapter;
  suite.ok(!!adapter, 'icims adapter present');

  const result = await adapter.fill({
    profile: Object.assign({}, PROFILE),
    documents: docs,
    runMode: 'fill',
    document: page.document
  });

  const doc = page.document;
  const nat = selectedText(doc.getElementById('nat'));
  const pcc = selectedText(doc.getElementById('pcc'));
  const res = selectedText(doc.getElementById('res'));
  const empC = selectedText(doc.getElementById('empC'));
  const eduC = selectedText(doc.getElementById('eduC'));
  const qt = doc.getElementById('qt').value;
  const pw = doc.getElementById('pw').value;
  const pw2 = doc.getElementById('pw2').value;
  const rel = doc.getElementById('relDetails').value;
  const phone = doc.getElementById('phone').value;

  suite.ok(/pakistan/i.test(nat), 'Nationality Pakistan/Pakistani (got "' + nat + '")');
  suite.ok(!/saudi arabia$/i.test(nat) || /pakistan/i.test(nat), 'Nationality is not residence-only Saudi');
  suite.ok(/saudi|966/i.test(pcc) && !/american samoa|1684/i.test(pcc), 'Phone country +966 Saudi (got "' + pcc + '")');
  suite.ok(/saudi/i.test(res), 'Residence Saudi Arabia (got "' + res + '")');
  suite.ok(/saudi/i.test(empC), 'Employment Country Saudi Arabia (got "' + empC + '")');
  suite.ok(/pakistan/i.test(eduC), 'Education Country Pakistan (got "' + eduC + '")');
  suite.ok(!/saudi/i.test(eduC), 'Education Country is NOT Saudi Arabia');
  suite.ok(qt.indexOf('[object Object]') === -1, 'Qualification Title not object (got "' + qt + '")');
  suite.ok(/MBA|Finance|Executive/i.test(qt), 'Qualification Title is real degree string (got "' + qt + '")');
  suite.ok(pw === 'Zahid@Finance786', 'Password filled from Environments/profile');
  suite.ok(pw2 === 'Zahid@Finance786', 'Password Re-enter filled');
  suite.ok(!(result && result.needsHuman), 'no create-login manual pause when password present');
  suite.ok(!(result && /complete manually/i.test(String((result && result.error) || (result && result.message) || ''))), 'error is not manual-complete');
  suite.ok(!/FP&A|Manager|job title/i.test(rel) || rel === '', 'Details (relative) did not get job title (got "' + rel + '")');
  suite.ok(/504131857/.test(phone) || phone === '', 'phone national present or left for later (got "' + phone + '")');

  // Structured education object path specifically
  const page2 = createPage(
    `<label>Qualification Title <input id="qt" /></label>
     <label>Education Country <select id="eduC"><option value="">Select</option><option value="SA">Saudi Arabia</option><option value="PK">Pakistan</option></select></label>`,
    LIBS
  );
  page2.window.FillApplySynonyms.isVisible = function (el) {
    return !!(el && !el.hidden);
  };
  // Make page look like candidate profile
  const h = page2.document.createElement('h1');
  h.textContent = 'Candidate Profile — Education';
  page2.document.body.insertBefore(h, page2.document.body.firstChild);
  const fn = page2.document.createElement('input');
  fn.name = 'firstName';
  page2.document.body.appendChild(fn);
  const ln = page2.document.createElement('input');
  ln.name = 'lastName';
  page2.document.body.appendChild(ln);

  await page2.window.FillApply_icimsAdapter.fill({
    profile: {
      email: 'a@b.com',
      firstName: 'A',
      lastName: 'B',
      country: 'Saudi Arabia',
      nationality: 'Pakistani',
      education: [{ title: { oops: true }, degree: 'MBA Executive — Finance', institution: 'VU Pakistan', country: 'Pakistan' }]
    },
    documents: {},
    runMode: 'fill',
    document: page2.document
  });
  const qt2 = page2.document.getElementById('qt').value;
  const edu2 = selectedText(page2.document.getElementById('eduC'));
  suite.ok(qt2.indexOf('[object Object]') === -1 && qt2.indexOf('{') === -1, 'object title coerced away (got "' + qt2 + '")');
  suite.ok(/MBA|Finance|Executive/i.test(qt2) || qt2 === '', 'falls back to degree string or blank (got "' + qt2 + '")');
  suite.ok(/pakistan/i.test(edu2), 'edu country still Pakistan when residence Saudi');

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
