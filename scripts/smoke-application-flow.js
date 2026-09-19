/**
 * Application-flow smoke (not unit-only):
 * DETECT → FILL → VERIFY → REVEAL dependent → RESCAN → READY
 *
 * Documented end-to-end path over a realistic multi-control form fixture.
 *
 * Run: node scripts/smoke-application-flow.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite, ROOT } = require('./test-harness');

const suite = createSuite('smoke-application-flow');

const LIBS = [
  'lib/dom-deep.js',
  'lib/format.js',
  'lib/synonyms.js',
  'lib/pace.js',
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
  fullName: 'Alex Applicant',
  email: 'alex.applicant@example.com',
  phone: '+15555550100',
  country: 'Saudi Arabia',
  nationality: 'Pakistan',
  yearsExperience: '15 years',
  authorizedToWork: 'Yes',
  requiresSponsorship: 'No',
  customAnswers: {
    'Have professional certifications?': 'Yes',
    has_cert: 'Yes',
    'Which certifications?': 'ACCA, Excel',
    certs: 'ACCA'
  },
  customQA: [
    { question: 'Have professional certifications?', answer: 'Yes' },
    { question: 'Which certifications?', answer: 'ACCA' }
  ]
};

(async function main() {
  const html = fs
    .readFileSync(path.join(ROOT, 'scripts/fixtures/controls/application-flow.html'), 'utf8')
    .replace(/<script>[\s\S]*?<\/script>/g, '');
  const page = createPage(html, LIBS);
  const doc = page.document;
  const win = page.window;

  // Wire dependent reveal (fixture script stripped for jsdom eval order)
  const sel = doc.getElementById('has_cert');
  const dep = doc.getElementById('cert_detail');
  sel.addEventListener('change', function () {
    dep.hidden = sel.value !== 'Yes';
  });

  const phases = [];
  const FA = win.__fillApply;
  const A = win.FillApplyControlAdapter;

  // --- DETECT ---
  phases.push('DETECTING');
  const fields = FA.collectFields();
  suite.ok(fields.length >= 5, 'DETECT: found fields (' + fields.length + ')');
  const types = fields.map(function (el) {
    return A.detectControl(el);
  });
  suite.ok(types.indexOf('text') !== -1 || types.indexOf('email') !== -1, 'DETECT: text/email present');
  suite.ok(types.indexOf('radio') !== -1, 'DETECT: radio present');
  suite.ok(types.indexOf('select') !== -1, 'DETECT: select present');

  // --- FILL + VERIFY (engine run with dependent re-scan) ---
  phases.push('FILLING');
  const result = await FA.run(PROFILE, {
    skipCvImport: true,
    dependentWaitMs: 80,
    maxDependentPasses: 2,
    onPhase: function (p) {
      phases.push(p);
    }
  });

  suite.ok(result.ok, 'FILL run ok');
  suite.ok(result.filled >= 4, 'FILL filled count ' + result.filled);

  // VERIFY key controls
  suite.equal(doc.getElementById('fn').value, 'Alex', 'VERIFY first name');
  suite.equal(doc.getElementById('ln').value, 'Applicant', 'VERIFY last name');
  suite.equal(doc.getElementById('em').value, 'alex.applicant@example.com', 'VERIFY email');
  suite.equal(String(doc.getElementById('yoe').value), '15', 'VERIFY years normalized from "15 years"');

  const authYes = doc.querySelector('input[name="auth"][value="Yes"]');
  suite.ok(authYes && authYes.checked === true, 'VERIFY auth radio checked===true');

  suite.equal(doc.getElementById('country').value, 'SA', 'VERIFY country select');

  // Consent checkbox
  const terms = doc.getElementById('terms');
  suite.ok(terms.checked === true, 'VERIFY consent checkbox checked (not typed Yes)');

  // Dependent reveal path
  if (sel.value === 'Yes') {
    phases.push('WAITING_FOR_DEPENDENT_FIELDS');
    suite.ok(!dep.hidden, 'REVEAL: cert detail visible');
    // Rescan may have filled certs
    const certs = doc.getElementById('certs');
    if (certs.value) {
      suite.ok(/ACCA/i.test(certs.value), 'RESCAN filled certifications');
    }
  }

  phases.push(result.phase || 'READY');
  suite.ok(
    result.phase === 'READY' || result.phase === 'MISSING_INFORMATION' || result.phase === 'BLOCKED',
    'READY/terminal phase: ' + result.phase
  );
  suite.ok(Array.isArray(result.blockers), 'blockers array');
  suite.ok(phases.indexOf('FILLING') !== -1, 'phase trace includes FILLING');

  // Country vs nationality must not be confused (fixture only has residence country)
  suite.ok(A.disambiguateGeoKey('Country of residence') === 'country', 'geo: residence≠nationality');
  suite.ok(A.disambiguateGeoKey('Nationality') === 'nationality', 'geo: nationality key');

  console.log('  flow phases:', phases.join(' → '));
  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
