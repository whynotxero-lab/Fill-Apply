/**
 * v1.19.1 — single Phone → full E.164; split country+phone → parts;
 * Choose File / Upload CV CTAs; Ignite-style short labels (Name, Salary, Available).
 *
 * Run: node scripts/smoke-phone-full-choose-file.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-phone-full-choose-file');

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
  'lib/files.js',
  'content/fill.js'
];

const FILE_LIBS = ['lib/dom-deep.js', 'lib/files.js'];

const PROFILE = {
  firstName: 'Chaudhary',
  lastName: 'Ali',
  fullName: 'Chaudhary Zahid Ali',
  email: 'czahidali.accacma@gmail.com',
  phone: '504131857',
  phoneCountry: '+966',
  phoneFull: '+966504131857',
  phoneE164: '+966504131857',
  currentTitle: 'Financial Planning, Analysis & Reporting Manager',
  city: 'Riyadh',
  location: 'Riyadh',
  noticePeriod: 'Available immediately',
  salaryText: '3000 SAR',
  customAnswers: {
    phone_full: '+966504131857',
    salary_text: '3000 SAR',
    available_immediately: 'Available immediately'
  }
};

function run(page, profile, options) {
  return page.window.__fillApply.run(profile || PROFILE, options || {});
}

(async function main() {
  await (async function singlePhoneGetsE164() {
    const page = createPage(
      `<form id="application-form">
        <label for="ph">Phone</label>
        <input id="ph" name="phone" type="tel" autocomplete="tel" />
      </form>`,
      LIBS
    );
    await run(page);
    suite.equal(
      page.document.getElementById('ph').value.replace(/\s+/g, ''),
      '+966504131857',
      'single phone field gets full E.164'
    );
  })();

  await (async function phoneFullOnlyStillFills() {
    const page = createPage(
      `<form id="application-form">
        <label for="ph">Phone</label>
        <input id="ph" type="tel" />
      </form>`,
      LIBS
    );
    await run(page, { phoneFull: '+966504131857', phoneE164: '+966504131857' });
    suite.equal(
      page.document.getElementById('ph').value.replace(/\s+/g, ''),
      '+966504131857',
      'phoneFull-only profile still fills single Phone'
    );
  })();

  await (async function splitPhoneKeepsParts() {
    const page = createPage(
      `<form id="application-form">
        <div class="field">
          <label for="cc">Country Code</label>
          <select id="cc" name="phone_country">
            <option value="">Select</option>
            <option value="+966">+966 Saudi Arabia</option>
            <option value="+971">+971 UAE</option>
          </select>
        </div>
        <div class="field">
          <label for="ph">Phone</label>
          <input id="ph" name="phone" type="tel" />
        </div>
      </form>`,
      LIBS
    );
    await run(page);
    const cc = page.document.getElementById('cc').value;
    const ph = String(page.document.getElementById('ph').value || '').replace(/\s+/g, '');
    suite.ok(/\+?966/.test(cc), 'split layout fills country code (+966), got ' + cc);
    suite.ok(
      ph === '504131857' || ph === '0504131857' || /504131857$/.test(ph),
      'split layout fills national number (got ' + ph + ')'
    );
    suite.ok(!/^\+966/.test(ph), 'national phone does not repeat dial code');
  })();

  await (async function labelDetection() {
    const page = createPage('<div></div>', LIBS);
    const map = page.window.FillApplyFieldMap;
    const F = page.window.FillApplyFormat;
    suite.equal(map.bestKeyForField({ label: 'Phone', type: 'tel' }), 'phone', 'Phone → phone');
    suite.equal(
      map.bestKeyForField({ label: 'Mobile number', type: 'text', autocomplete: 'tel' }),
      'phone',
      'Mobile / autocomplete tel → phone'
    );
    suite.equal(map.bestKeyForField({ label: 'Name' }), 'fullName', 'Name → fullName');
    suite.equal(map.bestKeyForField({ label: 'Salary' }), 'salaryText', 'Salary → salaryText');
    suite.equal(map.bestKeyForField({ label: 'Available' }), 'noticePeriod', 'Available → noticePeriod');
    suite.equal(map.bestKeyForField({ label: 'Job title' }), 'currentTitle', 'Job title → currentTitle');
    suite.equal(map.bestKeyForField({ label: 'Location' }), 'location', 'Location → location');

    const parts = F.phoneParts({ phoneFull: '+966504131857' });
    suite.equal(parts.e164, '+966504131857', 'phoneParts from phoneFull → e164');
    suite.equal(parts.national, '504131857', 'phoneParts from phoneFull → national');
    suite.equal(parts.dial, '+966', 'phoneParts from phoneFull → dial');
  })();

  await (async function igniteShortLabelsFill() {
    const page = createPage(
      `<form id="application-form">
        <label for="n">Name</label><input id="n" />
        <label for="jt">Job title</label><input id="jt" />
        <label for="ph">Phone</label><input id="ph" type="tel" />
        <label for="em">Email</label><input id="em" type="email" />
        <label for="sal">Salary</label><input id="sal" />
        <label for="loc">Location</label><input id="loc" />
        <label for="av">Available</label><input id="av" />
      </form>`,
      LIBS
    );
    await run(page);
    const d = page.document;
    suite.equal(d.getElementById('n').value, 'Chaudhary Zahid Ali', 'Name → full name');
    suite.equal(
      d.getElementById('jt').value,
      'Financial Planning, Analysis & Reporting Manager',
      'Job title filled'
    );
    suite.equal(d.getElementById('ph').value.replace(/\s+/g, ''), '+966504131857', 'Phone E.164');
    suite.equal(d.getElementById('em').value, 'czahidali.accacma@gmail.com', 'Email');
    suite.equal(d.getElementById('sal').value, '3000 SAR', 'Salary text 3000 SAR');
    suite.ok(/Riyadh/i.test(d.getElementById('loc').value), 'Location → Riyadh');
    suite.equal(d.getElementById('av').value, 'Available immediately', 'Available');
  })();

  await (async function chooseFileButton() {
    const page = createPage(
      `<form id="application-form">
        <h2>Submit Your CV</h2>
        <input type="button" id="choose" value="Choose File" />
        <input id="cv" type="file" accept=".pdf,.docx" style="display:none" />
      </form>`,
      FILE_LIBS
    );
    const Files = page.window.FillApplyFiles;
    const found = Files.findAttachButtons();
    suite.ok(
      found.some(function (b) {
        return /choose file/i.test(b.text);
      }),
      'findAttachButtons detects Choose File input[type=button]'
    );
    const result = Files.attachDocuments({
      resume: {
        name: 'Zahid_CV.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        base64: Buffer.from('PK\x03\x04docx').toString('base64')
      }
    });
    const input = page.document.getElementById('cv');
    suite.ok(result.resumeAttached, 'Choose File path attaches resume');
    suite.equal(
      input.files && input.files[0] && input.files[0].name,
      'Zahid_CV.docx',
      'DOCX filename preserved'
    );
  })();

  await (async function uploadCvSpan() {
    const page = createPage(
      `<form id="application-form">
        <div class="upload">
          <span class="btn">Upload CV</span>
          <input type="file" id="f" hidden accept=".pdf,.doc,.docx" />
        </div>
      </form>`,
      FILE_LIBS
    );
    const Files = page.window.FillApplyFiles;
    suite.ok(
      Files.findAttachButtons().some(function (b) {
        return /upload cv/i.test(b.text);
      }),
      'Upload CV span detected'
    );
    const result = Files.attachDocuments({
      resume: {
        name: 'Zahid_CV.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        base64: Buffer.from('PK').toString('base64')
      }
    });
    suite.ok(result.resumeAttached, 'Upload CV attaches DOCX');
  })();

  await (async function importKeepsPhoneFull() {
    const paths = [
      '/workspace/deliverables/zahid-profile.json',
      path.join(__dirname, '..', 'profiles', 'zahid-profile.json')
    ];
    let bundle = null;
    for (let i = 0; i < paths.length; i++) {
      if (fs.existsSync(paths[i])) {
        bundle = JSON.parse(fs.readFileSync(paths[i], 'utf8'));
        break;
      }
    }
    if (!bundle) {
      suite.ok(true, 'skip import check — no zahid-profile.json');
      return;
    }
    const page = createPage('<div></div>', LIBS);
    const IO = page.window.FillApplyProfileIO;
    const validated = IO.validateImportPayload(bundle);
    suite.ok(validated.ok, 'zahid profile import validates');
    const profile = validated.data.profile;
    suite.ok(
      profile.phoneFull === '+966504131857' || profile.phoneE164 === '+966504131857',
      'import preserves phoneFull/phoneE164'
    );
    suite.ok(
      profile.phoneCountry === '+966' || profile.phoneCountryCode === '+966',
      'import keeps +966'
    );
    const ca = profile.customAnswers || {};
    suite.ok(
      profile.salaryText === '3000 SAR' || ca.salary_text === '3000 SAR',
      'import exposes salary_text'
    );
  })();

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
