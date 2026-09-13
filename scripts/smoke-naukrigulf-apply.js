/**
 * Smoke: NaukriGulf Apply vs Easy Apply start paths.
 * Run: node scripts/smoke-naukrigulf-apply.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const LIBS = [
  'lib/dom-deep.js',
  'lib/synonyms.js',
  'adapters/registry.js',
  'adapters/fallback.js',
  'adapters/boards/naukrigulf.js'
];

const suite = createSuite('smoke-naukrigulf-apply');
const NG_URL = 'https://www.naukrigulf.com/job/financial-controller-1';

const PROFILE = {
  country: 'United Arab Emirates',
  location: 'Dubai',
  customAnswers: {
    'Are you currently employed?': 'Yes',
    'Are you currently located in UAE?': 'Yes',
    'Do you have work experience in manufacturing industry?': 'No'
  }
};

function modalHtml() {
  return `
    <div role="dialog" class="modal easyApplyModal" id="ea-modal">
      <p>Confidential Company would require below details</p>
      <fieldset>
        <legend>Are you currently employed?</legend>
        <label><input type="radio" name="emp" value="Yes" /> Yes</label>
        <label><input type="radio" name="emp" value="No" /> No</label>
      </fieldset>
      <fieldset>
        <legend>Are you currently located in UAE?</legend>
        <label><input type="radio" name="uae" value="Yes" /> Yes</label>
        <label><input type="radio" name="uae" value="No" /> No</label>
      </fieldset>
      <button type="button">Submit &amp; Apply</button>
      <button type="button">Cancel</button>
    </div>
  `;
}

async function easyApplyModalStillWorks() {
  const page = createPage(
    `
    <h1>Financial Controller</h1>
    <button type="button" id="ea">Easy Apply</button>
    ${modalHtml()}
  `,
    LIBS,
    { url: NG_URL }
  );
  const adapter = page.window.FillApply_naukrigulfAdapter;
  suite.ok(!!adapter, 'naukrigulf adapter registered');
  suite.ok(!!adapter.findEasyApplyButton(page.document), 'findEasyApplyButton finds Easy Apply');
  const result = await adapter.fill({
    profile: PROFILE,
    document: page.document,
    url: NG_URL,
    runMode: 'fill'
  });
  suite.ok(result && result.ok === true, 'Easy Apply modal path ok');
  suite.ok(result.step === 'easy_apply_modal', 'step is easy_apply_modal');
  suite.ok(result.filled >= 1, 'answered at least one screening question (' + result.filled + ')');
  suite.ok(!result.externalApply, 'Easy Apply path is not external handoff');
  suite.ok(!result.needsHuman, 'Easy Apply path does not need human');
}

async function standardApplyExternalHandoff() {
  const page = createPage(
    `
    <h1>Finance Manager</h1>
    <button type="button" id="apply" data-url="https://boards.greenhouse.io/acme/jobs/123">Apply</button>
  `,
    LIBS,
    { url: NG_URL }
  );
  const adapter = page.window.FillApply_naukrigulfAdapter;
  suite.ok(!!adapter.findApplyButton(page.document), 'findApplyButton finds Apply');
  suite.ok(!adapter.findEasyApplyButton(page.document), 'no Easy Apply on standard Apply page');
  const result = await adapter.fill({
    profile: PROFILE,
    document: page.document,
    url: NG_URL,
    runMode: 'fill'
  });
  suite.ok(result && result.ok === true, 'standard Apply returns ok handoff');
  suite.ok(result.externalApply === true, 'externalApply set for off-site Apply');
  suite.ok(result.handedOff === true || result.deferToPageAdapter === true, 'handoff flags set');
  suite.ok(result.clickedApplyStart === true, 'clickedApplyStart set');
  suite.ok(
    !/Easy Apply modal did not appear/i.test(String(result.error || '')),
    'does not require Easy Apply modal for standard Apply'
  );
}

async function standardApplyOnPageForm() {
  const page = createPage(
    `
    <h1>Accountant</h1>
    <button type="button" id="apply">Apply Now</button>
    <form id="application-form" style="display:none">
      <label>First Name <input name="first_name" type="text" /></label>
      <label>Last Name <input name="last_name" type="text" /></label>
      <label>Email <input name="email" type="email" /></label>
      <label>Resume <input name="resume" type="file" /></label>
      <button type="submit">Submit Application</button>
    </form>
  `,
    LIBS,
    { url: NG_URL }
  );
  const applyBtn = page.document.getElementById('apply');
  applyBtn.addEventListener('click', function () {
    page.document.getElementById('application-form').style.display = 'block';
  });

  page.window.FillApplyFallbackAdapter = {
    id: 'fallback',
    fill: function () {
      return {
        ok: true,
        adapterId: 'fallback',
        filled: 3,
        unmatched: 0,
        total: 3,
        submitted: false
      };
    }
  };

  const adapter = page.window.FillApply_naukrigulfAdapter;
  const result = await adapter.fill({
    profile: PROFILE,
    document: page.document,
    url: NG_URL,
    runMode: 'ready'
  });
  suite.ok(result && result.ok === true, 'Apply → on-page form returns ok');
  suite.ok(result.clickedApplyStart === true, 'clickedApplyStart for on-page Apply');
  suite.ok(
    !/Easy Apply modal did not appear/i.test(String(result.error || '')),
    'on-page Apply does not demand Easy Apply modal'
  );
  suite.ok((result.filled || 0) >= 1 || result.externalApply, 'filled via fallback or handed off');
}

async function noCtaNeedsHumanWithUpdatedMessage() {
  const page = createPage(
    `
    <h1>Job detail</h1>
    <p>Description only — no apply controls.</p>
  `,
    LIBS,
    { url: NG_URL }
  );
  const adapter = page.window.FillApply_naukrigulfAdapter;
  const result = await adapter.fill({
    profile: PROFILE,
    document: page.document,
    url: NG_URL,
    runMode: 'fill'
  });
  suite.ok(result && result.ok === false, 'no CTA → not ok');
  suite.ok(result.needsHuman === true, 'no CTA → needsHuman');
  suite.ok(
    /Apply\s*\/\s*Easy Apply|Apply or Easy Apply/i.test(String(result.error || '')),
    'error mentions Apply or Easy Apply (got: ' + result.error + ')'
  );
  suite.ok(
    !/^NaukriGulf Easy Apply modal did not appear/i.test(String(result.error || '')),
    'legacy Easy-Apply-only error retired'
  );
}

async function synonymsHostIncludesNaukrigulf() {
  const page = createPage('<div></div>', ['lib/synonyms.js'], { url: NG_URL });
  const S = page.window.FillApplySynonyms;
  suite.ok(S.isEasyApplyCta('Easy Apply') === true, 'isEasyApplyCta');
  suite.ok(S.isApplyStartCta('Apply') === true, 'generic Apply is start CTA');
  suite.ok(S.isApplyStartCta('Easy Apply') === false, 'generic start excludes Easy Apply');
  suite.ok(
    S.isApplyStartCtaForHost('Easy Apply', 'www.naukrigulf.com') === true,
    'naukrigulf host treats Easy Apply as start CTA'
  );
  suite.ok(
    S.isApplyStartCtaForHost('Apply Now', 'www.naukrigulf.com') === true,
    'naukrigulf host treats Apply Now as start CTA'
  );
}

(async function main() {
  await easyApplyModalStillWorks();
  await standardApplyExternalHandoff();
  await standardApplyOnPageForm();
  await noCtaNeedsHumanWithUpdatedMessage();
  await synonymsHostIncludesNaukrigulf();
  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
