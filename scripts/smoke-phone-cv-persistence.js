/**
 * intl-tel country widget → national phone; knowledge DO_NOT_FILL fallback;
 * CV attach from run documents.
 */
'use strict';
const { createPage, createSuite } = require('./test-harness');
const suite = createSuite('smoke-phone-cv-persistence');
const LIBS = [
  'lib/dom-deep.js','lib/format.js','lib/synonyms.js','lib/field-map.js',
  'lib/control-adapter.js','lib/ats-faq-seed.js','lib/knowledge-canonical.js',
  'lib/knowledge-store.js','lib/knowledge-resolver.js','lib/knowledge-learn.js',
  'lib/files.js','lib/profile.js','content/fill.js'
];
const html = `
<form id="requestApplyNow">
  <label>Email <input type="email" name="email" id="em"/></label>
  <div class="iti">
    <button type="button" aria-label="Selected country">Saudi Arabia +966</button>
    <input type="tel" placeholder="Phone" autocomplete="off" id="ph" />
  </div>
  <label>Upload Your CV <input type="file" name="cv" id="cvUpload" /></label>
</form>`;

(async function main() {
  const page = createPage(html, LIBS);
  const K = page.window.FillApplyKnowledge;
  if (K && K.resolve) {
    const orig = K.resolve.bind(K);
    K.resolve = function (profile, descriptor, map) {
      if (String(descriptor.type || '').toLowerCase() === 'tel') {
        return { key: 'phone', value: '', action: 'DO_NOT_FILL', ambiguous: true };
      }
      return orig(profile, descriptor, map);
    };
  }
  const profile = {
    email: 'alex.sample@example.com',
    phone: '504131857',
    phoneCountry: '+966',
    phoneFull: '+966504131857',
    salaryText: '3000 SAR'
  };
  const docs = {
    resume: {
      name: 'Sample_CV.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      base64: Buffer.from('PK\x03\x04').toString('base64')
    }
  };
  await page.window.__fillApply.run(profile, { formWaitMs: 50, documents: docs });
  const d = page.document;
  suite.equal(d.getElementById('em').value, 'alex.sample@example.com', 'email filled');
  suite.ok(!/SAR/i.test(d.getElementById('em').value), 'email not salary');
  const ph = d.getElementById('ph').value.replace(/\D/g, '');
  suite.ok(ph === '504131857' || ph.endsWith('504131857'), 'national phone filled (got ' + d.getElementById('ph').value + ')');
  suite.ok(d.getElementById('cvUpload').files.length === 1, 'CV attached');
  suite.equal(d.getElementById('cvUpload').files[0].name, 'Sample_CV.docx', 'CV filename');
  suite.finish();
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
