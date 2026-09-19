/**
 * NaukriGulf Easy Apply screening: Yes/No radio click path, CA vs CA/ACCA,
 * B.Com, ERP, post-qualification years multi-option, glued YesNo labels.
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
  firstName: 'Alex',
  lastName: 'Ali',
  city: 'Riyadh',
  location: 'Riyadh',
  noticePeriod: 'Immediately available',
  phoneFull: '+966501234567',
  phoneE164: '+966501234567',
  salaryText: '0 AED / SAR (Currently available for immediate joining)',
  certifications: 'ACCA — UK; CMA',
  skills: 'Oracle ERP, SAP, Sage',
  customAnswers: {
    'Are you a qualified CA or ACCA?': 'Yes',
    qualified_ca_or_acca: 'Yes',
    acca_qualified: 'Yes',
    'Are you a qualified Chartered Accountant (CA)?': 'No',
    qualified_ca: 'No',
    ca_icai: 'No',
    'Do you hold a Bachelor’s Degree in Commerce (B.Com) or M.Com qualification?': 'Yes',
    bcom_or_mcom: 'Yes',
    'Do you have practical experience working with ERP/accounting software?': 'Yes',
    erp_experience: 'Yes',
    'How many years of relevant post-qualification experience do you have in Finance & Accounts?':
      'More than 10 years',
    post_qualification_experience_band: 'More than 10 years',
    oacpa_attested: '',
    experience_letters_available: '',
    'What is your notice Period?': 'Immediately available',
    'What is your current Remuneration?': '0 AED / SAR (Currently available for immediate joining)',
    contracting_finance_experience:
      'Over 15 years of finance leadership across MENA including Big Four (PwC) audit of contracting firms.',
    notice_period: 'Immediately available',
    current_remuneration: '0 AED / SAR (Currently available for immediate joining)',
    salary_text: '3000 SAR'
  }
};

/** Classic separate labels (regression). */
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

/**
 * Shared parent label wrapping BOTH radios — previously made every radio match /yes/
 * so Yes click actually selected No (last overwrite).
 */
const SHARED_LABEL_MODAL = `
<div role="dialog" class="modal easy-apply" id="ea2">
  <h2>Easy Apply</h2>
  <div class="q" id="q-shared">
    <label class="question-wrap">
      Are you a qualified CA or ACCA?
      <input type="radio" name="ca2" id="ca2y" value="Yes" /> Yes
      <input type="radio" name="ca2" id="ca2n" value="No" /> No
    </label>
  </div>
  <div class="q" id="q-bcom">
    <div class="label">Do you hold a Bachelor’s Degree in Commerce (B.Com) or M.Com qualification?</div>
    <label for="bcomy"><input type="radio" name="bcom" id="bcomy" value="Yes" /> Yes</label>
    <label for="bcomn"><input type="radio" name="bcom" id="bcomn" value="No" /> No</label>
  </div>
  <div class="q" id="q-caonly">
    <div class="label">Are you a qualified Chartered Accountant (CA)?</div>
    <label><input type="radio" name="caonly" value="Yes" /> Yes</label>
    <label><input type="radio" name="caonly" value="No" /> No</label>
  </div>
  <div class="q" id="q-years" role="group">
    <legend>How many years of relevant post-qualification experience do you have in Finance &amp; Accounts?</legend>
    <label><input type="radio" name="yrs" value="0-2" /> 0-2 years</label>
    <label><input type="radio" name="yrs" value="3-5" /> 3-5 years</label>
    <label><input type="radio" name="yrs" value="6-10" /> 6-10 years</label>
    <label><input type="radio" name="yrs" value="10+" /> More than 10 years</label>
  </div>
  <div class="q" id="q-erp">
    <div class="label">Do you have practical experience working with ERP/accounting software?</div>
    <label><input type="radio" name="erp" value="Yes" /> Yes</label>
    <label><input type="radio" name="erp" value="No" /> No</label>
  </div>
  <button type="button">Submit &amp; Apply</button>
</div>
`;

(async function main() {
  const page = createPage(MODAL_HTML, LIBS);
  const A = page.window.FillApply_naukrigulfAdapter;
  suite.ok(A && typeof A.fill === 'function', 'naukrigulf adapter present');

  if (typeof A._test === 'object' && A._test.cleanLabel) {
    var cleaned = A._test.cleanLabel('Are you a qualified CA or ACCA?YesNo');
    suite.ok(
      /Are you a qualified CA or ACCA\??/i.test(cleaned) && !/YesNo/i.test(cleaned),
      'cleanLabel strips glued YesNo (got ' + JSON.stringify(cleaned) + ')'
    );
    suite.ok(A._test.isCaOrAccaQuestion('Are you a qualified CA or ACCA?'), 'detect CA or ACCA');
    suite.ok(A._test.isCaOnlyQuestion('Are you a qualified Chartered Accountant (CA)?'), 'detect CA-only');
    suite.ok(
      !A._test.isCaOnlyQuestion('Are you a qualified CA or ACCA?'),
      'CA or ACCA is not CA-only'
    );
    var rCa = A._test.resolveYesNoAnswer(PROFILE, 'Are you a qualified CA or ACCA?');
    suite.ok(rCa.answer === 'Yes', 'resolve CA/ACCA → Yes (got ' + rCa.answer + ')');
    var rOnly = A._test.resolveYesNoAnswer(PROFILE, 'Are you a qualified Chartered Accountant (CA)?');
    suite.ok(rOnly.answer === 'No', 'resolve CA-only → No (got ' + rOnly.answer + ')');
    var rBcom = A._test.resolveYesNoAnswer(
      PROFILE,
      'Do you hold a Bachelor’s Degree in Commerce (B.Com) or M.Com qualification?'
    );
    suite.ok(rBcom.answer === 'Yes', 'resolve B.Com → Yes');
    var rErp = A._test.resolveYesNoAnswer(
      PROFILE,
      'Do you have practical experience working with ERP/accounting software?'
    );
    suite.ok(rErp.answer === 'Yes', 'resolve ERP → Yes');
    var rO = A._test.resolveYesNoAnswer(
      PROFILE,
      'Is your relevant degree/certificate attested/approved by the Oman Association of Chartered Public Accountants (OACPA), as applicable?'
    );
    suite.ok(rO.answer == null && rO.reason === 'leave_empty_shell', 'OACPA left empty');
  } else {
    suite.ok(false, '_test helpers missing');
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

  // Shared-label + multi-question modal (critical click path)
  const pageS = createPage(SHARED_LABEL_MODAL, LIBS);
  const AS = pageS.window.FillApply_naukrigulfAdapter;
  const rS = await AS.fill({
    profile: PROFILE,
    document: pageS.document,
    url: 'https://www.naukrigulf.com/job/y',
    runMode: 'fill'
  });
  suite.ok(rS && rS.ok !== false, 'shared-label modal fill ok');

  const ca2y = pageS.document.getElementById('ca2y');
  const ca2n = pageS.document.getElementById('ca2n');
  suite.ok(ca2y && ca2y.checked, 'shared-label: CA/ACCA Yes selected');
  suite.ok(ca2n && !ca2n.checked, 'shared-label: CA/ACCA No NOT selected');

  const bcomY = pageS.document.getElementById('bcomy');
  suite.ok(bcomY && bcomY.checked, 'B.Com Yes selected');

  const caOnlyNo = pageS.document.querySelector('input[name="caonly"][value="No"]');
  const caOnlyYes = pageS.document.querySelector('input[name="caonly"][value="Yes"]');
  suite.ok(caOnlyNo && caOnlyNo.checked, 'CA-only No selected');
  suite.ok(caOnlyYes && !caOnlyYes.checked, 'CA-only Yes NOT selected');

  const yrs = pageS.document.querySelector('input[name="yrs"][value="10+"]');
  suite.ok(yrs && yrs.checked, 'More than 10 years option clicked');

  const erpY = pageS.document.querySelector('input[name="erp"][value="Yes"]');
  suite.ok(erpY && erpY.checked, 'ERP Yes selected');

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
