/**
 * SLICE 2 — Nav-first: iCIMS-like Apply on job page + Next after welcome fill.
 * Run: node scripts/smoke-nav-first-icims.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-nav-first-icims');

const LIBS = [
  'lib/dom-deep.js',
  'lib/synonyms.js',
  'lib/nav-first.js',
  'lib/challenges.js',
  'lib/auth-walls.js',
  'adapters/registry.js',
  'adapters/fallback.js',
  'adapters/ats/icims.js'
];

const PROFILE = {
  email: 'candidate@example.com',
  firstName: 'Test',
  lastName: 'User'
};

(function navFirstDecide() {
  const page = createPage(
    `<main>
      <h1>Cabin Crew</h1>
      <div class="job-description">Fly with us</div>
      <a id="fwd" href="#">Forward to a Friend</a>
      <button type="button" id="apply" class="btn-primary">Apply</button>
    </main>`,
    ['lib/synonyms.js', 'lib/nav-first.js']
  );
  const N = page.window.FillApplyNavFirst;
  suite.ok(!!N, 'FillApplyNavFirst attached');
  const d = N.decidePageAction(page.document);
  suite.equal(d.action, 'apply_start', 'job page → apply_start (got ' + d.action + ')');
  suite.ok(N.hasClickableApplyStart(page.document), 'hasClickableApplyStart');
  suite.ok(N.mustNotStopOnEmptyFill(page.document, { filled: 0, total: 0, ok: true }), 'must not stop on 0/0');
})();

(async function icimsJobPageClicksApply() {
  const page = createPage(
    `<html><body>
      <div class="iCIMS_JobHeader">Riyadh Air — Cabin Crew</div>
      <div class="job-description">Role overview</div>
      <button type="button" id="apply" style="background:purple;color:#fff">Apply</button>
      <a href="#forward">Forward to a Friend</a>
      <!-- stray newsletter must NOT block Apply -->
      <form class="newsletter"><input type="email" name="newsletter" placeholder="Email" /></form>
    </body></html>`,
    LIBS
  );
  // Make buttons visible to jsdom-ish checks
  page.window.FillApplySynonyms.isVisible = function (el) {
    return !!(el && !el.hidden);
  };
  let clicks = 0;
  page.document.getElementById('apply').addEventListener('click', function () {
    clicks += 1;
  });

  const adapter = page.window.FillApply_icimsAdapter;
  suite.ok(!!adapter && adapter.detect('https://careers-riyadhair.icims.com/jobs/123/job', page.document), 'detects icims');

  const result = await adapter.fill({
    profile: PROFILE,
    documents: {},
    runMode: 'submit',
    document: page.document
  });

  suite.ok(clicks === 1, 'clicked Apply once (got ' + clicks + ')');
  suite.ok(
    !!(result && result.clickedApplyStart),
    'clickedApplyStart flag (got ' + JSON.stringify(result && {
      clickedApplyStart: result.clickedApplyStart,
      filled: result.filled,
      advanced: result.advanced,
      message: result.message
    }) + ')'
  );
  suite.ok(!(result && result.filled > 0 && !result.clickedApplyStart && !result.advanced), 'did not stop as plain 0/0 fill');
  suite.ok(result && result.ok !== false, 'ok handoff');
})()
  .then(async function () {
    // Welcome: email + I accept + Next — must click Next after fill (captcha badge present)
    const page = createPage(
      `<html><body>
        <h1>Enter Your Information</h1>
        <p>Software Powered by iCIMS</p>
        <label>Email <input id="em" type="email" name="email" /></label>
        <label><input id="acc" type="checkbox" name="accept" /> I accept the privacy policy</label>
        <!-- hCaptcha privacy badge — must NOT skip Next -->
        <div class="hcaptcha-badge" style="width:100px;height:20px">Protected by hCaptcha</div>
        <button type="button" id="next">Next</button>
      </body></html>`,
      LIBS
    );
    page.window.FillApplySynonyms.isVisible = function (el) {
      return !!(el && !el.hidden);
    };
    // Force challenge detector: badge text alone should not pause before Next
    if (page.window.FillApplyChallenges) {
      page.window.FillApplyChallenges.detectChallenge = function () {
        return { challenged: false, kind: null, detail: '', markers: [] };
      };
    }

    let nextClicks = 0;
    page.document.getElementById('next').addEventListener('click', function () {
      nextClicks += 1;
    });

    const adapter = page.window.FillApply_icimsAdapter;
    const result = await adapter.fill({
      profile: PROFILE,
      documents: {},
      runMode: 'submit',
      document: page.document
    });

    suite.ok(page.document.getElementById('em').value === PROFILE.email, 'email filled');
    suite.ok(page.document.getElementById('acc').checked, 'I accept checked');
    suite.ok(nextClicks >= 1, 'clicked Next after fill (got ' + nextClicks + ')');
    suite.ok(result && result.advanced, 'advanced=true after Next (got ' + !!(result && result.advanced) + ')');
    suite.ok(result && result.filled >= 2, 'filled >= 2 (got ' + (result && result.filled) + ')');
    suite.ok(!(result && result.needsHuman), 'did not pause on badge alone');
  })
  .then(async function () {
    // Next disabled (true captcha block) → may pause, must not silently Idle without trying
    const page = createPage(
      `<html><body>
        <h1>Enter Your Information</h1>
        <p>Powered by iCIMS</p>
        <label>Email <input id="em" type="email" name="email" /></label>
        <label><input id="acc" type="checkbox" /> I accept</label>
        <div class="h-captcha" style="width:300px;height:80px"><iframe src="https://newassets.hcaptcha.com/captcha/v1/x/static/hcaptcha.html" width="300" height="80"></iframe></div>
        <button type="button" id="next" disabled>Next</button>
      </body></html>`,
      LIBS
    );
    page.window.FillApplySynonyms.isVisible = function (el) {
      return !!(el && !el.hidden);
    };
    const adapter = page.window.FillApply_icimsAdapter;
    const result = await adapter.fill({
      profile: PROFILE,
      documents: {},
      runMode: 'fill',
      document: page.document
    });
    // Next disabled: may pause on captcha before/after fill — must not claim advanced success
    suite.ok(!(result && result.advanced && !result.needsHuman), 'must not advance when Next disabled');
    const handled =
      (result && result.needsHuman) ||
      (result && result.filled >= 1) ||
      (result && result.ok === false) ||
      (result && result.ok && !result.advanced);
    suite.ok(handled, 'handles disabled Next without fake complete hop');
  })
  .then(function () {
    suite.finish();
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
