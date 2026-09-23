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
  'lib/screening-intent.js',
  'lib/field-map.js',
  'lib/files.js',
  'lib/question-bank-store.js',
  'content/fill.js',
  'adapters/boards/naukrigulf.js'
];

const PROFILE = {
  firstName: 'Alex',
  lastName: 'Ali',
  city: 'Riyadh',
  location: 'Riyadh',
  country: 'Saudi Arabia',
  noticePeriod: 'Immediately available',
  phoneFull: '+966501234567',
  phoneE164: '+966501234567',
  currentSalary: '25000 AED',
  expectedSalary: '30000 AED',
  salaryText: '25000 AED',
  yearsExperience: '15+',
  currentCompany: 'SIXT / Samara',
  summary: '15+ years FP&A leadership across KSA/MENA',
  certifications: 'ACCA — UK; CMA',
  skills: 'Excel, Power BI, Oracle ERP, SAP, FP&A, IFRS, VAT',
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
    'What is your current Remuneration?': '25000 AED',
    contracting_finance_experience:
      'Over 15 years of finance leadership across MENA including Big Four (PwC) audit of contracting firms.',
    notice_period: 'Immediately available',
    current_remuneration: '25000 AED',
    expected_salary: '30000 AED',
    salary_text: '25000 AED',
    based_in_uae: 'No',
    located_in_uae: 'No',
    qualified_ca: 'No'
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
  suite.ok(/25000|AED/i.test(rem) && !/^Immediately available$/i.test(String(rem).trim()), 'Remuneration filled without bare notice (got ' + JSON.stringify(rem).slice(0, 80) + ')');

  const loc = page.document.getElementById('loc').value;
  suite.ok(/Riyadh/i.test(loc), 'Location filled (got ' + JSON.stringify(loc) + ')');

  const sal = page.document.getElementById('sal').value;
  suite.ok(sal.length > 0 && !/immediate/i.test(sal), 'Current Salary filled without notice (got ' + JSON.stringify(sal).slice(0, 80) + ')');

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


  // --- Screening intent guards ---
  const SI = page.window.FillApplyScreeningIntent;
  suite.ok(SI && typeof SI.classify === 'function', 'screening-intent loaded');
  suite.ok(SI.classify('Please elaborate your experience with IFRS, VAT, taxation') === SI.INTENT.IFRS_TAX, 'classify IFRS');
  suite.ok(SI.isForbiddenValue(SI.INTENT.IFRS_TAX, 'Riyadh'), 'city forbidden on IFRS essay');
  suite.ok(SI.isForbiddenValue(SI.INTENT.UAE_BASED, 'Immediately available'), 'notice forbidden on UAE');
  suite.ok(SI.isForbiddenValue(SI.INTENT.SALARY_CURRENT, 'Immediately available'), 'notice forbidden on salary');

  // --- DIFC Confidential screening (live bad-fill reproduction) ---
  const DIFC_HTML = `
<div role="dialog" class="modal easy-apply" id="difc">
  <h2>Confidential Company Finance Manager DIFC Dubai</h2>
  <div class="q">
    <div class="label">Are you a qualified Chartered Accountant (CA)? If yes, please mention the year of qualification and years of post qualification experience</div>
    <label><input type="radio" name="caq" value="Yes" /> Yes</label>
    <label><input type="radio" name="caq" value="No" /> No</label>
  </div>
  <div class="field">
    <label for="bankFs">Please mention your years of experience in Banking/Financial Services and your most recent employer</label>
    <textarea id="bankFs" name="bankFs"></textarea>
  </div>
  <div class="field">
    <label for="ifrs">Please elaborate your experience with IFRS, VAT, taxation and finalization of financial statements</label>
    <textarea id="ifrs" name="ifrs"></textarea>
  </div>
  <div class="field">
    <label for="sox">Please provide examples of your experience with audit coordination, SOX, risk management and internal controls</label>
    <textarea id="sox" name="sox"></textarea>
  </div>
  <div class="q">
    <div class="label">Are you currently based in UAE and available for in-person interview in Dubai DIFC?</div>
    <label><input type="radio" name="uae" value="Yes" /> Yes</label>
    <label><input type="radio" name="uae" value="No" /> No</label>
    <textarea id="uaeDetail" name="uaeDetail"></textarea>
  </div>
  <div class="field">
    <label for="curSal">Current salary (AED/month)</label>
    <input id="curSal" name="currentSalary" />
  </div>
  <div class="field">
    <label for="expSal">Expected salary (AED/month)</label>
    <input id="expSal" name="expectedSalary" />
  </div>
  <div class="field">
    <label for="notice2">Notice period</label>
    <input id="notice2" name="noticePeriod" />
  </div>
  <button type="button">Submit &amp; Apply</button>
</div>`;

  const pageD = createPage(DIFC_HTML, LIBS);
  const QB = pageD.window.FillApplyQuestionBank;
  if (QB && typeof QB.upsert === 'function') {
    await QB.upsert({
      question: 'Please elaborate your experience with IFRS, VAT, taxation and finalization of financial statements',
      answer:
        'Hands-on IFRS reporting support, VAT/tax coordination and financial statement finalization through FP&A close cycles. Tools: Excel, Power BI, Oracle/SAP.',
      aliases: ['IFRS, VAT, taxation']
    });
    await QB.upsert({
      question: 'Please provide examples of your experience with audit coordination, SOX, risk management and internal controls',
      answer:
        'Supported audit coordination and control-minded FP&A packs (variances, reconciliations, evidence for review). Familiar with risk-aware close and internal control hygiene.',
      aliases: ['SOX', 'audit coordination', 'internal controls']
    });
    await QB.upsert({
      question: 'Are you currently based in UAE and available for in-person interview in Dubai DIFC?',
      answer: 'No',
      aliases: ['based in UAE', 'Dubai DIFC']
    });
  }

  const rD = await pageD.window.FillApply_naukrigulfAdapter.fill({
    profile: PROFILE,
    document: pageD.document,
    url: 'https://www.naukrigulf.com/job/difc-finance-manager',
    runMode: 'fill'
  });
  suite.ok(rD && rD.ok !== false, 'DIFC modal fill ok');

  const caqNo = pageD.document.querySelector('input[name="caq"][value="No"]');
  suite.ok(caqNo && caqNo.checked, 'DIFC: CA-only → No');

  const ifrsVal = pageD.document.getElementById('ifrs').value;
  suite.ok(!!ifrsVal && !/^(Riyadh|Jeddah|Dubai|KSA|UAE)$/i.test(ifrsVal.trim()), 'city must not fill IFRS essay');
  suite.ok(
    /IFRS|VAT|FP&A|Excel|Power BI|Oracle|SAP|finalization|tax/i.test(ifrsVal),
    'IFRS essay has finance content (got ' + JSON.stringify(ifrsVal).slice(0, 120) + ')'
  );

  const soxVal = pageD.document.getElementById('sox').value;
  suite.ok(!!soxVal && !/^(Riyadh|Immediately available)$/i.test(soxVal.trim()), 'SOX essay not blank/city/notice');
  suite.ok(/audit|SOX|control|FP&A|risk/i.test(soxVal), 'SOX essay has control content');

  const bankVal = pageD.document.getElementById('bankFs').value;
  suite.ok(!!bankVal && !/^Riyadh$/i.test(bankVal.trim()), 'Banking/FS not city-only');
  suite.ok(/15|SIXT|Samara|finance|FP&A|year/i.test(bankVal), 'Banking/FS has years/employer');

  const uaeNo = pageD.document.querySelector('input[name="uae"][value="No"]');
  suite.ok(uaeNo && uaeNo.checked, 'DIFC: UAE based → No');

  const uaeDetail = pageD.document.getElementById('uaeDetail').value;
  suite.ok(
    !uaeDetail || /^(no)$/i.test(uaeDetail.trim()) || !/immediate/i.test(uaeDetail),
    'notice must not fill UAE question (got ' + JSON.stringify(uaeDetail) + ')'
  );

  const curSal = pageD.document.getElementById('curSal').value;
  const expSal = pageD.document.getElementById('expSal').value;
  const notice2 = pageD.document.getElementById('notice2').value;
  suite.ok(/25000|AED/i.test(curSal) && !/immediate/i.test(curSal), 'notice must not fill salary (current=' + curSal + ')');
  suite.ok(/30000|25000|AED/i.test(expSal) && !/immediate/i.test(expSal), 'expected salary not notice');
  suite.ok(/immediate/i.test(notice2), 'notice period keeps notice text');


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
