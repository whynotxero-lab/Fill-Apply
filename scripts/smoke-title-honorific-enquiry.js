/**
 * Title (honorific) vs job title; skip employer enquiry forms.
 * Run: node scripts/smoke-title-honorific-enquiry.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite } = require('./test-harness');

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
  'lib/profile.js',
  'content/fill.js'
];

const suite = createSuite('smoke-title-honorific-enquiry');
const html = fs.readFileSync(
  path.join(__dirname, 'fixtures/controls/title-honorific-vs-job.html'),
  'utf8'
);

const PROFILE = {
  salutation: 'Mr.',
  title: 'Mr.',
  firstName: 'Alex',
  middleName: '',
  lastName: 'Sample Ali',
  fullName: 'Alex Sample Ali',
  email: 'alex.sample@example.com',
  currentTitle: 'Financial Planning, Analysis & Reporting Manager',
  salaryText: '3000 SAR',
  expectedSalary: '3000 SAR',
  phone: '501234567',
  phoneCountry: '+966',
  phoneFull: '+966501234567'
};

(async function main() {
  const mapPage = createPage('<div></div>', ['lib/field-map.js']);
  const M = mapPage.window.FillApplyFieldMap;
  suite.equal(
    M.bestKeyForField({ label: 'Title', name: 'title', id: 'title', type: 'text' }),
    'title',
    'name=title + label Title → honorific title (not currentTitle)'
  );
  suite.equal(
    M.bestKeyForField({ label: 'Job Title', name: 'job_title', id: '', type: 'text' }),
    'currentTitle',
    'Job Title still maps to currentTitle'
  );

  const page = createPage(html, LIBS);
  await page.window.__fillApply.run(PROFILE, { formWaitMs: 50 });
  const d = page.document;
  var hon = d.getElementById('honorific');
  var honVal = (hon.value || (hon.options && hon.selectedIndex >= 0 && hon.options[hon.selectedIndex].text) || '').trim();
  suite.ok(/^(Mr\.?)$/i.test(honVal) || honVal === 'Mr', 'Title select gets Mr (got ' + JSON.stringify(honVal) + ')');
  suite.equal(d.getElementById('fn').value, 'Alex', 'First Name');
  suite.equal(d.getElementById('mn').value, '', 'Middle Name stays empty when unset');
  suite.equal(d.getElementById('ln').value, 'Sample Ali', 'Last Name');
  suite.equal(d.getElementById('em').value, 'alex.sample@example.com', 'Email');
  suite.ok(!/SAR|3000/i.test(d.getElementById('em').value), 'Email must never receive salary text');
  suite.equal(d.getElementById('enq_name').value, '', 'enquiry name not filled');
  suite.equal(d.getElementById('enq_email').value, '', 'enquiry email not filled');

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
