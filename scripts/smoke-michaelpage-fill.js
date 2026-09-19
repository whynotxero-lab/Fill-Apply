/**
 * Michael Page (michaelpage.ae): awkward placeholders + question text above,
 * Candidate / Apply with CV gates, salary AED/SAR mapping, ME visa from profile,
 * Apply CTA (not Save Job), nav-only Ready/Submit (no re-fill), Next/Apply Now.
 * Run: node scripts/smoke-michaelpage-fill.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-michaelpage-fill');

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
  'lib/profile.js',
  'adapters/registry.js',
  'adapters/fallback.js',
  'adapters/agencies/michaelpage.js',
  'content/fill.js'
];

const PROFILE = {
  firstName: 'Alex',
  lastName: 'Ali',
  phone: '501234567',
  phoneCountry: '+966',
  city: 'Khobar',
  country: 'Saudi Arabia',
  nationality: 'Pakistan',
  currentTitle: 'Financial Planning, Analysis & Reporting Manager',
  salaryCurrency: 'SAR',
  salaryCurrentSAR: '3000',
  salaryCurrentAED: '2900',
  currentSalary: '',
  availableFrom: '09/25/2026',
  middleEastWorkingVisa: 'Yes',
  experienceLevel: 'Director',
  sector: 'Accounting & Finance',
  subSector: 'Financial Planning & Analysis',
  customAnswers: {
    city_or_town: 'Riyadh',
    experience_level: 'Director',
    sector: 'Accounting & Finance',
    sub_sector: 'Financial Planning & Analysis',
    middle_east_working_visa: 'Yes',
    salary_currency: 'SAR',
    current_monthly_salary: '3000',
    salary_current_aed: '2900',
    salary_current_sar: '3000',
    available_to_start: '09/25/2026',
    available_from: '09/25/2026'
  }
};

(async function main() {
  // --- 1) Question text above awkward placeholders maps & fills (0/4 fix) ---
  const page = createPage(
    `
    <form id="mp-personal">
      <div class="field">
        <p class="question">First name</p>
        <input id="fn" name="first" placeholder="Name" />
      </div>
      <div class="field">
        <p class="question">Last Name</p>
        <input id="ln" name="last" placeholder="Last Name" />
      </div>
      <div class="field">
        <p class="question">Telephone number</p>
        <input id="tel" name="telephone" placeholder="Telephone number" type="tel" />
      </div>
      <div class="field">
        <p class="question">What city or town do you live in?</p>
        <input id="town" name="town" placeholder="Town" />
      </div>
      <div class="field">
        <label>What country do you live in?</label>
        <input id="country" name="country" placeholder="Country" />
      </div>
      <div class="field">
        <label>For which country do you hold nationality?</label>
        <input id="nat" name="nationality" placeholder="Nationality" />
      </div>
    </form>
  `,
    LIBS
  );

  const D = page.window.FillApplyDom;
  suite.ok(D && D.describeField, 'FillApplyDom.describeField present');

  const fnDesc = D.describeField(page.document.getElementById('fn'));
  suite.ok(fnDesc, 'describes first name field');
  suite.ok(
    /first\s*name/i.test(String((fnDesc && fnDesc.label) || '')),
    'first name label uses question text above, not bare Name placeholder: ' + (fnDesc && fnDesc.label)
  );

  const townDesc = D.describeField(page.document.getElementById('town'));
  suite.ok(
    /city or town|town/i.test(String((townDesc && townDesc.label) || '')),
    'town field gets question/town label: ' + (townDesc && townDesc.label)
  );

  const Map = page.window.FillApplyFieldMap;
  suite.equal(Map.bestKeyForField(fnDesc), 'firstName', 'maps First name / Name → firstName');
  suite.equal(
    Map.bestKeyForField(D.describeField(page.document.getElementById('ln'))),
    'lastName',
    'maps Last Name → lastName'
  );
  suite.equal(
    Map.bestKeyForField(D.describeField(page.document.getElementById('tel'))),
    'phone',
    'maps Telephone number → phone'
  );
  const townKey = Map.bestKeyForField(townDesc);
  suite.ok(townKey === 'city' || townKey === 'location', 'maps Town → city (got ' + townKey + ')');

  const fillResult = await page.window.__fillApply.run(PROFILE, { skipCvImport: true });
  suite.ok(fillResult && fillResult.ok !== false, 'fill engine ok');
  suite.ok((fillResult.filled || 0) >= 4, 'filled ≥ 4 personal fields (was 0/4): filled=' + fillResult.filled);
  suite.equal(page.document.getElementById('fn').value, 'Alex', 'first name filled');
  suite.equal(page.document.getElementById('ln').value, 'Ali', 'last name filled');
  suite.ok(
    /501234567/.test(page.document.getElementById('tel').value),
    'phone filled: ' + page.document.getElementById('tel').value
  );
  suite.equal(page.document.getElementById('town').value, 'Khobar', 'city/town filled from profile.city in raw fill');

  // --- 2) Adapter: Candidate gate + Apply with CV ---
  const page2 = createPage(
    `
    <h1>Are you a Client or a Candidate?</h1>
    <button type="button" id="client">Client</button>
    <button type="button" id="cand">Candidate</button>
    <div id="apply-choice" style="display:none">
      <p>How would you like to apply?</p>
      <button type="button" id="li">Apply with LinkedIn</button>
      <button type="button" id="cv">Apply with CV</button>
    </div>
    <form id="wiz" style="display:none">
      <p class="question">First name</p>
      <input id="wfn" placeholder="Name" />
      <p class="question">Last Name</p>
      <input id="wln" placeholder="Last Name" />
    </form>
  `,
    LIBS
  );

  const adapter = page2.window.FillApply_michaelpageAdapter;
  suite.ok(adapter, 'michaelpage adapter registered');
  suite.ok(adapter.detect('https://www.michaelpage.ae/job-detail/123'), 'detects michaelpage.ae');

  const candBtn = page2.document.getElementById('cand');
  const cvBtn = page2.document.getElementById('cv');
  let candClicked = false;
  let cvClicked = false;
  candBtn.addEventListener('click', function () {
    candClicked = true;
    page2.document.getElementById('apply-choice').style.display = 'block';
  });
  cvBtn.addEventListener('click', function () {
    cvClicked = true;
    page2.document.getElementById('wiz').style.display = 'block';
    // jsdom display none still "visible" sometimes — ensure inputs exist
  });

  const gateCand = adapter.clickCandidateGate(page2.document);
  suite.ok(gateCand.clicked && candClicked, 'Candidate gate clicked');

  const gateCv = adapter.clickApplyWithCv(page2.document);
  suite.ok(gateCv.clicked && cvClicked, 'Apply with CV clicked (not LinkedIn)');

  // --- 3) Salary mapping AED/SAR ---
  suite.equal(adapter.resolveSalaryCurrency(PROFILE), 'SAR', 'default currency SAR');
  suite.equal(String(adapter.resolveSalaryAmount(PROFILE, 'SAR')), '3000', 'SAR amount 3000');
  suite.equal(String(adapter.resolveSalaryAmount(PROFILE, 'AED')), '2900', 'AED amount 2900');
  suite.equal(String(adapter.resolveSalaryAmount(PROFILE, '')), '3000', 'empty currency → SAR 3000');

  const enriched = adapter.enrichProfile(PROFILE);
  suite.equal(String(enriched.currentSalary), '3000', 'enrich sets currentSalary for SAR');
  suite.equal(enriched.city, 'Riyadh', 'enrich prefers city_or_town Riyadh');
  suite.equal(enriched.middleEastWorkingVisa, 'Yes', 'enrich keeps ME visa Yes');
  suite.equal(enriched.experienceLevel, 'Director', 'enrich experienceLevel Director');

  // Visa empty when unknown — do not invent
  const noVisa = adapter.enrichProfile({ firstName: 'A', customAnswers: {} });
  suite.ok(isBlank(noVisa.middleEastWorkingVisa), 'empty visa when unknown');

  // --- 4) Employment-ish labels via field map ---
  const page3 = createPage(
    `
    <form>
      <label>Experience Level</label>
      <select id="lvl">
        <option value="">Select</option>
        <option value="Director">Director</option>
        <option value="Manager">Manager</option>
      </select>
      <fieldset>
        <legend>Do you currently have a working visa for the Middle East?</legend>
        <label><input type="radio" name="visa" value="Yes" /> Yes</label>
        <label><input type="radio" name="visa" value="No" /> No</label>
      </fieldset>
      <label>Currency</label>
      <select id="cur"><option>SAR</option><option>AED</option></select>
      <label>What is your current monthly salary?</label>
      <input id="amt" name="amount" placeholder="Amount" />
      <label>Current Job Title</label>
      <input id="title" />
    </form>
  `,
    LIBS
  );

  const Map3 = page3.window.FillApplyFieldMap;
  const lvlDesc = page3.window.FillApplyDom.describeField(page3.document.getElementById('lvl'));
  suite.equal(Map3.bestKeyForField(lvlDesc), 'experienceLevel', 'Experience Level → experienceLevel');

  const amtDesc = page3.window.FillApplyDom.describeField(page3.document.getElementById('amt'));
  suite.equal(Map3.bestKeyForField(amtDesc), 'currentSalary', 'monthly salary → currentSalary');

  const curDesc = page3.window.FillApplyDom.describeField(page3.document.getElementById('cur'));
  suite.equal(Map3.bestKeyForField(curDesc), 'salaryCurrency', 'Currency → salaryCurrency');

  const enriched2 = page3.window.FillApply_michaelpageAdapter.enrichProfile(PROFILE);
  const r3 = await page3.window.__fillApply.run(enriched2, { skipCvImport: true });
  suite.ok((r3.filled || 0) >= 3, 'employment fields filled: ' + r3.filled);
  suite.equal(page3.document.getElementById('lvl').value, 'Director', 'Experience Level = Director');
  suite.equal(page3.document.getElementById('amt').value, '3000', 'salary amount 3000 SAR');
  suite.equal(page3.document.getElementById('cur').value, 'SAR', 'currency SAR');
  const yesRadio = page3.document.querySelector('input[name="visa"][value="Yes"]');
  suite.ok(yesRadio && yesRadio.checked, 'ME working visa Yes checked');

  const enrichedStart = page3.window.FillApply_michaelpageAdapter.enrichProfile(PROFILE);
  suite.equal(
    String(enrichedStart.availableFrom || ''),
    '09/25/2026',
    'enrich availableFrom 09/25/2026'
  );

  // --- 5) Find Apply CTA (not Save Job) + robust click ---
  const pageApply = createPage(
    `
    <h1>Finance Manager — Riyadh</h1>
    <button type="button" id="save">Save Job</button>
    <button type="button" id="share">Share</button>
    <a href="#apply" id="apply" class="btn-apply">Apply</a>
    <input type="search" placeholder="Search jobs" />
    <input type="text" placeholder="Keywords" />
  `,
    LIBS
  );
  const adA = pageApply.window.FillApply_michaelpageAdapter;
  const cta = adA.findJobApplyCta(pageApply.document);
  suite.ok(cta && cta.id === 'apply', 'findJobApplyCta prefers Apply over Save Job');
  let applyClicked = false;
  pageApply.document.getElementById('apply').addEventListener('click', function () {
    applyClicked = true;
  });
  const clicked = adA.clickJobApply(pageApply.document);
  suite.ok(clicked.clicked && applyClicked, 'clickJobApply clicks visible Apply (not Save Job)');

  // --- 6) Nav-only: runMode submit skips field fill ---
  const pageNav = createPage(
    `
    <form id="wiz">
      <p class="question">First name</p>
      <input id="nfn" placeholder="Name" value="Alex" />
      <p class="question">Last Name</p>
      <input id="nln" placeholder="Last Name" value="Ali" />
      <button type="button" id="next">Next</button>
    </form>
  `,
    LIBS
  );
  const adN = pageNav.window.FillApply_michaelpageAdapter;
  suite.ok(adN.isNavOnlyMode('submit'), 'submit is nav-only mode');
  suite.ok(adN.isNavOnlyMode('ready'), 'ready is nav-only mode');
  suite.ok(!adN.isNavOnlyMode('fill'), 'fill is NOT nav-only');

  let nextClicked = false;
  pageNav.document.getElementById('next').addEventListener('click', function () {
    nextClicked = true;
  });
  const beforeFn = pageNav.document.getElementById('nfn').value;
  const navResult = await adN.fill({
    profile: PROFILE,
    document: pageNav.document,
    runMode: 'submit'
  });
  suite.ok(navResult && navResult.navOnly, 'submit returns navOnly');
  suite.ok(navResult.advanced || nextClicked, 'submit clicks Next');
  suite.ok(nextClicked, 'Next button received click');
  suite.equal(pageNav.document.getElementById('nfn').value, beforeFn, 'nav-only did not re-fill first name');
  suite.equal((navResult.filled || 0), 0, 'nav-only filled count is 0');

  // --- 7) Next / Apply Now detection ---
  const pageFinal = createPage(
    `
    <form>
      <label>Experience Level</label>
      <select id="el"><option>Director</option></select>
      <label>Do you currently have a working visa for the Middle East?</label>
      <input type="radio" name="v" value="Yes" checked />
      <button type="button" id="applyNow">Apply Now</button>
    </form>
  `,
    LIBS
  );
  const adF = pageFinal.window.FillApply_michaelpageAdapter;
  suite.ok(adF.looksLikeWizardStep(pageFinal.document), 'employment step looks like wizard');
  const nextMissing = adF.findNextOrContinue(pageFinal.document);
  suite.ok(!nextMissing, 'no Next on final step');
  const fin = adF.findFinalSubmitCta(pageFinal.document);
  suite.ok(fin && /apply now/i.test(fin.textContent || ''), 'detects Apply Now submit CTA');
  let applyNowClicked = false;
  pageFinal.document.getElementById('applyNow').addEventListener('click', function () {
    applyNowClicked = true;
  });
  const subResult = await adF.fill({
    profile: PROFILE,
    document: pageFinal.document,
    runMode: 'submit'
  });
  suite.ok(subResult && subResult.submitted, 'submit mode clicks Apply Now → submitted');
  suite.ok(applyNowClicked, 'Apply Now received click');
  suite.ok(subResult.navOnly, 'final submit still navOnly (no fill)');

  // Auto Fill path still fills when runMode=fill
  const pageFill = createPage(
    `
    <form>
      <p class="question">First name</p>
      <input id="ffn" placeholder="Name" />
      <p class="question">Last Name</p>
      <input id="fln" placeholder="Last Name" />
      <button type="button">Next</button>
    </form>
  `,
    LIBS
  );
  const fillMode = await pageFill.window.FillApply_michaelpageAdapter.fill({
    profile: PROFILE,
    document: pageFill.document,
    runMode: 'fill'
  });
  suite.ok((fillMode.filled || 0) >= 2, 'Auto Fill (runMode=fill) still fills fields: ' + (fillMode && fillMode.filled));
  suite.equal(pageFill.document.getElementById('ffn').value, 'Alex', 'fill mode wrote first name');
  suite.ok(!fillMode.navOnly, 'fill mode is not navOnly');

  suite.finish();
  if (suite.failed) process.exit(1);
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});

function isBlank(v) {
  return v == null || String(v).trim() === '';
}
