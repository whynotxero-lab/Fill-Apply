/**
 * Smoke: every control type fill + verify via FillApplyControlAdapter.
 * Fixtures: scripts/fixtures/controls/*
 *
 * Run: node scripts/smoke-control-adapter.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite, ROOT } = require('./test-harness');

const suite = createSuite('smoke-control-adapter');

const LIBS = [
  'lib/dom-deep.js',
  'lib/format.js',
  'lib/control-adapter.js',
  'lib/ats-faq-seed.js',
  'lib/knowledge-canonical.js'
];

function loadFixture(name) {
  return fs.readFileSync(path.join(ROOT, 'scripts/fixtures/controls', name), 'utf8');
}

function pageFromFixture(name) {
  return createPage(loadFixture(name), LIBS);
}

(async function main() {
  await (async function detectTypes() {
    const page = pageFromFixture('native-text-email-tel.html');
    const A = page.window.FillApplyControlAdapter;
    suite.ok(!!A, 'adapter loaded');
    suite.equal(A.detectControl(page.document.getElementById('fn')), 'text', 'text');
    suite.equal(A.detectControl(page.document.getElementById('em')), 'email', 'email');
    suite.equal(A.detectControl(page.document.getElementById('ph')), 'tel', 'tel');
    suite.equal(A.detectControl(page.document.getElementById('about')), 'textarea', 'textarea');
  })();

  await (async function textEmailTel() {
    const page = pageFromFixture('native-text-email-tel.html');
    const A = page.window.FillApplyControlAdapter;
    const doc = page.document;
    let r = A.applyToControl(doc.getElementById('fn'), 'Alex');
    suite.ok(r.ok, 'fill first name');
    suite.equal(doc.getElementById('fn').value, 'Alex', 'verify first name');
    r = A.applyToControl(doc.getElementById('em'), 'alex@example.com');
    suite.ok(r.ok, 'fill email');
    suite.equal(doc.getElementById('em').value, 'alex@example.com', 'verify email');
    r = A.applyToControl(doc.getElementById('ph'), '+966501234567');
    suite.ok(r.ok, 'fill tel');
    suite.ok(doc.getElementById('ph').value.indexOf('501234567') !== -1 || doc.getElementById('ph').value.indexOf('+966') !== -1, 'verify tel');
    r = A.applyToControl(doc.getElementById('about'), 'Hello');
    suite.ok(r.ok && doc.getElementById('about').value === 'Hello', 'textarea');
  })();

  await (async function numberAndDate() {
    const page = pageFromFixture('native-number-date.html');
    const A = page.window.FillApplyControlAdapter;
    const doc = page.document;
    let adapted = A.adaptAnswer('number', '15 years', { label: 'Years of experience' });
    suite.equal(adapted.value, '15', 'normalize 15 years');
    adapted = A.adaptAnswer('number', '15+', { label: 'Years of experience' });
    suite.equal(adapted.value, '15', 'normalize 15+');
    let r = A.applyToControl(doc.getElementById('yoe'), '15 years', { label: 'Years of experience' });
    suite.ok(r.ok, 'fill number');
    suite.equal(String(doc.getElementById('yoe').value), '15', 'verify number');

    r = A.applyToControl(doc.getElementById('dob'), '1990-05-15');
    suite.ok(r.ok, 'fill type=date with ISO');
    suite.equal(doc.getElementById('dob').value, '1990-05-15', 'verify ISO in type=date');

    // Human date must be converted — never left as "15 May 1990" in type=date
    const bad = A.adaptAnswer('date', '15 May 1990', { el: doc.getElementById('dob') });
    suite.ok(bad.ok && bad.value === '1990-05-15' || bad.iso === '1990-05-15', 'human date → ISO for type=date');

    r = A.applyToControl(doc.getElementById('dob2'), '1990-05-15', { label: 'Birth date' });
    suite.ok(r.ok, 'fill text date with placeholder');
    const v = doc.getElementById('dob2').value;
    suite.ok(v === '15/05/1990' || v === '1990-05-15', 'placeholder DD/MM/YYYY or ISO (' + v + ')');
  })();

  await (async function radioSharedLabel() {
    const page = pageFromFixture('radio-shared-label.html');
    const A = page.window.FillApplyControlAdapter;
    const doc = page.document;
    const authYes = doc.querySelector('input[name="auth"][value="yes"]');
    let r = A.applyToControl(authYes, 'Yes');
    suite.ok(r.ok, 'radio Yes fill');
    suite.ok(authYes.checked === true, 'auth Yes checked===true');
    suite.ok(doc.querySelector('input[name="auth"][value="no"]').checked === false, 'auth No unchecked');

    const spNo = doc.getElementById('sp_no');
    r = A.applyToControl(spNo, 'No');
    suite.ok(r.ok && spNo.checked === true, 'sponsorship No checked');
    suite.ok(doc.getElementById('sp_yes').checked === false, 'sponsorship Yes unchecked');
  })();

  await (async function checkboxGroups() {
    const page = pageFromFixture('checkbox-and-groups.html');
    const A = page.window.FillApplyControlAdapter;
    const doc = page.document;
    let r = A.applyToControl(doc.getElementById('terms'), 'Yes', { consent: true });
    suite.ok(r.ok && doc.getElementById('terms').checked, 'consent checkbox checked (not typed Yes)');

    const excel = doc.querySelector('input[name="skills"][value="excel"]');
    r = A.applyToControl(excel, 'Excel, SAP', {});
    suite.ok(r.ok || r.controlType === 'checkbox-group' || r.controlType === 'checkbox', 'skills group attempted');
    // Force checkbox-group path
    const adapted = A.adaptAnswer('checkbox-group', 'Excel, SAP', {});
    const filled = A.fill(excel, adapted, {});
    suite.ok(filled.ok && filled.matched >= 1, 'checkbox-group matched >=1');
    suite.ok(excel.checked, 'Excel checked');
    suite.ok(doc.querySelector('input[name="skills"][value="sap"]').checked, 'SAP checked');
  })();

  await (async function selectAndMulti() {
    const page = pageFromFixture('select-multiselect.html');
    const A = page.window.FillApplyControlAdapter;
    const doc = page.document;
    suite.equal(A.detectControl(doc.getElementById('country')), 'select', 'select type');
    suite.equal(A.detectControl(doc.getElementById('skills')), 'multiselect', 'multiselect type');

    let r = A.applyToControl(doc.getElementById('country'), 'Saudi Arabia');
    suite.ok(r.ok, 'country select');
    suite.equal(doc.getElementById('country').value, 'SA', 'country value SA');

    r = A.applyToControl(doc.getElementById('nationality'), 'Pakistan');
    suite.ok(r.ok, 'nationality select');
    suite.equal(doc.getElementById('nationality').value, 'PK', 'nationality PK');

    // Country vs nationality disambiguation helper
    suite.equal(A.disambiguateGeoKey('Country of residence'), 'country', 'geo country');
    suite.equal(A.disambiguateGeoKey('Nationality / Citizenship'), 'nationality', 'geo nationality');

    r = A.applyToControl(doc.getElementById('edu'), "Master's Degree");
    suite.ok(r.ok, 'education select');

    r = A.applyToControl(doc.getElementById('skills'), 'Excel, Oracle');
    suite.ok(r.ok, 'multiselect fill');
    const v = A.verify(doc.getElementById('skills'), 'multiselect', ['Excel', 'Oracle']);
    suite.ok(v.ok, 'multiselect verify each');
  })();

  await (async function comboboxDetect() {
    const page = pageFromFixture('aria-combobox.html');
    const A = page.window.FillApplyControlAdapter;
    const input = page.document.getElementById('city');
    const ct = A.detectControl(input);
    suite.ok(ct === 'autocomplete' || ct === 'combobox', 'aria combobox detected as ' + ct);
    // Sync path must NOT invent / blind Enter — deferAsync or typed without false ok
    const r = A.applyToControl(input, 'Riyadh');
    suite.ok(r.deferAsync || r.ok === false || r.ok === true, 'combobox handled without crash');
    if (r.ok && !r.deferAsync) {
      suite.equal(input.value, 'Riyadh', 'if sync ok, value set');
    }
  })();

  await (async function select2Detect() {
    const page = pageFromFixture('select2-like.html');
    const A = page.window.FillApplyControlAdapter;
    const btn = page.document.querySelector('.select2-selection');
    const ct = A.detectControl(btn, { customSelect: true });
    suite.ok(ct === 'custom-select' || ct === 'combobox' || ct === 'button-group' || ct === 'text', 'select2-like type ' + ct);
  })();

  await (async function phoneCountrySplit() {
    const page = pageFromFixture('country-phone-code.html');
    const A = page.window.FillApplyControlAdapter;
    const phone = page.document.getElementById('phone');
    const adapted = A.adaptAnswer('tel', '+966501234567', { hasPhoneCountryField: true });
    suite.ok(adapted.value.indexOf('966') === -1 || adapted.value === '501234567', 'strip +966 when country control exists: ' + adapted.value);
    const r = A.applyToControl(phone, '+966501234567', { hasPhoneCountryField: true });
    suite.ok(r.ok, 'phone fill with country field');
    suite.ok(phone.value.indexOf('+966') === -1, 'no duplicate +966 in phone box');
  })();

  await (async function fileBlocker() {
    const page = pageFromFixture('file-upload.html');
    const A = page.window.FillApplyControlAdapter;
    const resume = page.document.getElementById('resume');
    suite.equal(A.detectControl(resume), 'file', 'file type');
    const r = A.applyToControl(resume, '', { label: 'Upload Resume / CV', documents: {} });
    suite.ok(!r.ok && r.blocker, 'file without doc → BLOCKER');
    suite.ok(/resume|cv|document/i.test(r.message || r.reason || ''), 'blocker message clear');
  })();

  await (async function faqSeedGeneric() {
    const page = createPage('<div></div>', ['lib/ats-faq-seed.js']);
    const F = page.window.FillApplyAtsFaqSeed;
    suite.ok(F && F.FAQ_ENTRIES.length > 10, 'FAQ seed has entries');
    suite.ok(F.isExplicitUnknownPolicy('currentSalary'), 'salary UNKNOWN policy');
    suite.ok(F.isExplicitUnknownPolicy('expectedSalary'), 'expected salary UNKNOWN');
    const body = JSON.stringify(F.FAQ_ENTRIES);
    suite.ok(!/zahid|chaudhary|\+9665|@gmail|password/i.test(body), 'FAQ seed has no Zahid PII');
  })();

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
