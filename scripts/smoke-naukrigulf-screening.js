/**
 * NaukriGulf Easy Apply screening: glued YesNo labels, CA/ACCA radios,
 * Notice Period / Remuneration / contracting textarea from profile.
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-naukrigulf-screening');

const LIBS = [
  'lib/dom-deep.js',
  'lib/format.js',
  'lib/synonyms.js',
  'lib/field-map.js',
  'lib/files.js',
  'content/fill.js',
  'adapters/boards/naukrigulf.js'
];

const PROFILE = {
  firstName: 'Chaudhary',
  lastName: 'Ali',
  city: 'Riyadh',
  location: 'Riyadh',
  noticePeriod: 'Immediately available',
  phoneFull: '+966504131857',
  phoneE164: '+966504131857',
  salaryText: '0 AED / SAR (Currently available for immediate joining)',
  certifications: 'ACCA — UK',
  customAnswers: {
    'Are you a qualified CA or ACCA?': 'Yes',
    qualified_ca_or_acca: 'Yes',
    acca_qualified: 'Yes',
    'What is your notice Period?': 'Immediately available',
    'What is your current Remuneration?': '0 AED / SAR (Currently available for immediate joining)',
    contracting_finance_experience:
      'Over 15 years of finance leadership across MENA including Big Four (PwC) audit of contracting firms.',
    notice_period: 'Immediately available',
    current_remuneration: '0 AED / SAR (Currently available for immediate joining)',
    salary_text: '3000 SAR'
  }
};

const MODAL_HTML = `
<div role="dialog" class="modal easy-apply" id="ea">
  <h2>Easy Apply</h2>
  <div class="q" id="q1">
    <div class="label">Are you a qualified CA or ACCA?YesNo</div>
    <label><input type="radio" name="ca" value="Yes" /> Yes</label>
    <label><input type="radio" name="ca" value="No" /> No</label>
  </div>
  <div class="field">
    <label for="notice">Notice Period</label>
    <input id="notice" name="noticePeriod" />
  </div>
  <div class="field">
    <label for="rem">Current Remuneration</label>
    <input id="rem" name="remuneration" />
  </div>
  <div class="field">
    <label for="loc">Location *</label>
    <input id="loc" name="location" required />
  </div>
  <div class="field">
    <label for="sal">Current Salary</label>
    <input id="sal" name="currentSalary" />
  </div>
  <div class="field">
    <label for="exp">How many years of relevant experience do you have in finance/accounting within the contracting industry?</label>
    <textarea id="exp" name="contracting"></textarea>
  </div>
  <button type="button">Submit &amp; Apply</button>
</div>
`;

(async function main() {
  const page = createPage(MODAL_HTML, LIBS);
  const A = page.window.FillApply_naukrigulfAdapter;
  suite.ok(A && typeof A.fill === 'function', 'naukrigulf adapter present');

  // Unit: strip glued YesNo
  if (typeof A._test === 'object' && A._test.cleanLabel) {
    var cleaned = A._test.cleanLabel('Are you a qualified CA or ACCA?YesNo');
    suite.ok(
      /Are you a qualified CA or ACCA\??/i.test(cleaned) && !/YesNo/i.test(cleaned),
      'cleanLabel strips glued YesNo (got ' + JSON.stringify(cleaned) + ')'
    );
  } else {
    // exercise via fill
    suite.ok(true, 'cleanLabel exercised via fill (no _test export)');
  }

  const result = await A.fill({
    profile: PROFILE,
    document: page.document,
    url: 'https://www.naukrigulf.com/job/x',
    runMode: 'fill'
  });

  suite.ok(result && result.ok !== false, 'fill ok (got ' + JSON.stringify(result && result.ok) + ')');

  const yes = page.document.querySelector('input[name="ca"][value="Yes"]');
  suite.ok(yes && yes.checked, 'CA/ACCA Yes radio selected');

  const notice = page.document.getElementById('notice').value;
  suite.ok(/immediate/i.test(notice), 'Notice Period filled (got ' + JSON.stringify(notice) + ')');

  const rem = page.document.getElementById('rem').value;
  suite.ok(/0 AED|immediate/i.test(rem), 'Remuneration filled (got ' + JSON.stringify(rem).slice(0, 80) + ')');

  const loc = page.document.getElementById('loc').value;
  suite.ok(/Riyadh/i.test(loc), 'Location filled (got ' + JSON.stringify(loc) + ')');

  const sal = page.document.getElementById('sal').value;
  suite.ok(sal.length > 0, 'Current Salary filled (got ' + JSON.stringify(sal).slice(0, 80) + ')');

  const exp = page.document.getElementById('exp').value;
  suite.ok(/PwC|contracting|MENA|15/i.test(exp), 'Contracting textarea filled');

  // Submit mode should not pause for CA question
  const page2 = createPage(MODAL_HTML, LIBS);
  const r2 = await page2.window.FillApply_naukrigulfAdapter.fill({
    profile: PROFILE,
    document: page2.document,
    url: 'https://www.naukrigulf.com/job/x',
    runMode: 'submit'
  });
  suite.ok(!(r2.unmatchedLabels || []).some(function (l) {
    return /qualified CA or ACCA/i.test(l);
  }), 'CA/ACCA not in unmatchedLabels on submit');
  suite.ok(
    !/qualified CA or ACCA\?YesNo/i.test(String(r2.error || '')),
    'pause error does not keep glued YesNo'
  );

  suite.finish();
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
