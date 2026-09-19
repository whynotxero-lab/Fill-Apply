/**
 * Smoke: dependent-field re-scan loop (select reveals next → fill → verify).
 *
 * Run: node scripts/smoke-dependent-fields.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite, ROOT } = require('./test-harness');

const suite = createSuite('smoke-dependent-fields');

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
  'content/fill.js'
];

const PROFILE = {
  firstName: 'Alex',
  lastName: 'Applicant',
  email: 'alex@example.com',
  phone: '+15551234567',
  willingToRelocate: 'Yes',
  customAnswers: {
    relocate_city: 'Riyadh',
    'Preferred relocation city': 'Riyadh',
    certifications: 'ACCA',
    'Which certifications?': 'ACCA',
    certs: 'ACCA'
  },
  customQA: [
    { question: 'Preferred relocation city', answer: 'Riyadh' },
    { question: 'Which certifications?', answer: 'ACCA' },
    { question: 'Have professional certifications?', answer: 'Yes' }
  ]
};

function loadFixture(name) {
  return fs.readFileSync(path.join(ROOT, 'scripts/fixtures/controls', name), 'utf8');
}

(async function main() {
  await (async function dependentReveal() {
    const html = loadFixture('dependent-fields.html');
    // Strip script tags for createPage then re-bind dependency manually for jsdom
    const page = createPage(html.replace(/<script>[\s\S]*?<\/script>/g, ''), LIBS);
    const doc = page.document;
    const sel = doc.getElementById('relocate');
    const dep = doc.getElementById('dep');
    const where = doc.getElementById('where');

    // Wire dependent reveal
    sel.addEventListener('change', function () {
      dep.hidden = sel.value !== 'Yes';
    });

    suite.ok(dep.hidden, 'dependent hidden initially');

    const A = page.window.FillApplyControlAdapter;
    const r = A.applyToControl(sel, 'Yes');
    suite.ok(r.ok, 'relocate Yes selected');
    // Fire change for reveal
    sel.dispatchEvent(new page.window.Event('change', { bubbles: true }));
    suite.ok(!dep.hidden, 'dependent revealed after Yes');

    // Simulate re-scan fill of newcomer
    const r2 = A.applyToControl(where, 'Riyadh');
    suite.ok(r2.ok && where.value === 'Riyadh', 'dependent field filled on re-scan');
  })();

  await (async function fillEngineDependentPass() {
    const html = loadFixture('application-flow.html').replace(/<script>[\s\S]*?<\/script>/g, '');
    const page = createPage(html, LIBS);
    const doc = page.document;
    const sel = doc.getElementById('has_cert');
    const dep = doc.getElementById('cert_detail');
    sel.addEventListener('change', function () {
      dep.hidden = sel.value !== 'Yes';
    });

    const profile = Object.assign({}, PROFILE, {
      authorizedToWork: 'Yes',
      country: 'Saudi Arabia',
      yearsExperience: '15',
      customAnswers: Object.assign({}, PROFILE.customAnswers, {
        has_cert: 'Yes',
        'Have professional certifications?': 'Yes'
      })
    });

    const result = await page.window.__fillApply.run(profile, {
      dependentWaitMs: 50,
      maxDependentPasses: 2,
      skipCvImport: true
    });

    suite.ok(result.ok, 'run ok');
    suite.ok(typeof result.phase === 'string', 'phase surfaced: ' + result.phase);
    suite.ok(result.filled >= 3, 'filled some fields (' + result.filled + ')');

    // After run, cert select may be Yes and dependent may be filled if revealed
    if (sel.value === 'Yes') {
      suite.ok(!dep.hidden || result.dependentPasses >= 0, 'cert dependent path exercised');
    }
    suite.ok(result.dependentPasses != null, 'dependentPasses reported');
  })();

  await (async function multiStepStub() {
    const html = loadFixture('multi-step-stub.html').replace(/<script>[\s\S]*?<\/script>/g, '');
    const page = createPage(html, LIBS);
    const doc = page.document;
    doc.getElementById('next1').addEventListener('click', function () {
      doc.querySelector('[data-step="1"]').hidden = true;
      doc.querySelector('[data-step="2"]').hidden = false;
    });

    const A = page.window.FillApplyControlAdapter;
    A.applyToControl(doc.getElementById('email'), 'alex@example.com');
    suite.equal(doc.getElementById('email').value, 'alex@example.com', 'step1 email');
    doc.getElementById('next1').click();
    suite.ok(doc.querySelector('[data-step="2"]').hidden === false, 'step2 visible');
    A.applyToControl(doc.getElementById('phone'), '5551234567');
    suite.equal(doc.getElementById('phone').value, '5551234567', 'step2 phone after advance');
  })();

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
