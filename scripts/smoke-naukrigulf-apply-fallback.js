/**
 * NaukriGulf: when Easy Apply modal never appears, click standard Apply
 * instead of permanent Easy-Apply-only pause.
 * Run: node scripts/smoke-naukrigulf-apply-fallback.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-naukrigulf-apply-fallback');

const LIBS = [
  'lib/dom-deep.js',
  'lib/synonyms.js',
  'lib/format.js',
  'lib/field-map.js',
  'lib/challenges.js',
  'adapters/registry.js',
  'adapters/boards/naukrigulf.js',
  'content/fill.js'
];

(async function main() {
  // 1) Easy Apply missing → standard Apply clicked, handoff (no Easy-Apply-only pause)
  const page = createPage(
    `
      <h1>Finance Manager - Khobar</h1>
      <a id="applyNow" href="https://company.example/jobs/123/apply">Apply Now</a>
      <button type="button" id="save">Save job</button>
  `,
    LIBS
  );

  const adapter = page.window.FillApply_naukrigulfAdapter;
  suite.ok(adapter, 'naukrigulf adapter registered');
  suite.ok(typeof adapter.findStandardApplyButton === 'function', 'findStandardApplyButton exported');

  const std = adapter.findStandardApplyButton(page.document);
  suite.ok(std, 'finds standard Apply Now');
  suite.equal(std && std.id, 'applyNow', 'standard Apply is Apply Now (not Save)');

  let clicked = false;
  if (std) {
    std.addEventListener('click', function () {
      clicked = true;
    });
  }

  const result = await adapter.fill({
    profile: { customAnswers: { employed: 'No' } },
    document: page.document,
    url: 'https://www.naukrigulf.com/job/finance-manager-123',
    runMode: 'fill'
  });

  suite.ok(clicked, 'standard Apply clicked when Easy Apply modal absent');
  suite.ok(result && result.ok, 'fill returns ok (not hard-fail)');
  suite.ok(
    !!(result && (result.clickedApplyStart || result.handedOff || result.reDetect || result.externalApply)),
    'handoff / reDetect for company-site apply'
  );
  suite.ok(!(result && result.needsHuman), 'does NOT pause as needsHuman for Easy-Apply-only');
  suite.ok(
    !/Easy Apply modal did not appear — open Easy Apply manually/i.test(String((result && result.error) || '')),
    'legacy Easy-Apply-only error text absent'
  );

  // 2) Easy Apply present still preferred / detectable
  const page2 = createPage(
    `
      <button type="button" id="easy">Easy Apply</button>
      <a id="applyNow" href="/apply">Apply Now</a>
      <div id="modal" role="dialog" style="display:block;width:200px;height:200px">
        <p>Are you currently employed?</p>
        <label><input type="radio" name="emp" value="Yes" /> Yes</label>
        <label><input type="radio" name="emp" value="No" /> No</label>
        <button type="button">Submit &amp; Apply</button>
      </div>
  `,
    LIBS
  );
  const adapter2 = page2.window.FillApply_naukrigulfAdapter;
  const easy = adapter2.findEasyApplyButton(page2.document);
  suite.ok(!!(easy && easy.id === 'easy'), 'Easy Apply found when present');
  const modal = adapter2.findEasyApplyModal(page2.document);
  suite.ok(!!modal, 'Easy Apply modal detected when present');

  // 3) synonyms: naukrigulf host treats Easy Apply as start CTA; Apply Now universal
  const Syn = page.window.FillApplySynonyms;
  suite.ok(
    Syn.isApplyStartCtaForHost('Easy Apply', 'www.naukrigulf.com'),
    'host-aware: Easy Apply is start CTA on naukrigulf'
  );
  suite.ok(Syn.isApplyStartCta('Apply Now'), 'Apply Now is universal start CTA');
  suite.ok(Syn.isApplyStartCta('Apply'), 'Apply is universal start CTA');

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
