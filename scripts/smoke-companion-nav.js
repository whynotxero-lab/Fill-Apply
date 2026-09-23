/**
 * Simplify companion navigate-only: settle helpers + nav CTA ranking.
 * Never fills / never clicks Back.
 *
 * Run: node scripts/smoke-companion-nav.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const LIBS = ['lib/synonyms.js', 'lib/companion-nav.js'];
const suite = createSuite('smoke-companion-nav');

const FORM = `
  <main>
    <h1>Workday Visa</h1>
    <form id="application">
      <label>Country <input name="country" value="" /></label>
      <button type="button" id="back">Back</button>
      <button type="button" id="cancel">Cancel</button>
      <button type="button" id="apply">Apply</button>
      <button type="button" id="applyNow">Apply Now</button>
      <button type="button" id="next">Next</button>
      <button type="button" id="saveCont" class="btn-primary">Save and Continue</button>
    </form>
  </main>
`;

(function navCtaRanking() {
  const page = createPage(FORM, LIBS);
  const C = page.window.FillApplyCompanionNav;
  suite.ok(!!C, 'FillApplyCompanionNav attached');

  suite.ok(C.isCompanionNavCta('Save and Continue'), 'Save and Continue is nav CTA');
  suite.ok(C.isCompanionNavCta('Continue'), 'Continue is nav CTA');
  suite.ok(C.isCompanionNavCta('Continue Application'), 'Continue Application is nav CTA');
  suite.ok(C.isCompanionNavCta('Next'), 'Next is nav CTA');
  suite.ok(C.isCompanionNavCta('Next Step'), 'Next Step is nav CTA');
  suite.ok(!C.isCompanionNavCta('Back'), 'Back is excluded');
  suite.ok(!C.isCompanionNavCta('Cancel'), 'Cancel is excluded');
  suite.ok(!C.isCompanionNavCta('Apply'), 'bare Apply excluded when not nav-only');
  suite.ok(C.isCompanionNavCta('Apply Now'), 'Apply Now is a companion/apply-start CTA');
  suite.ok(C.isCompanionNavCta('Start Application'), 'Start Application is a companion CTA');
  suite.ok(!C.isCompanionNavCta('Submit Application'), 'Submit Application is excluded');
  suite.ok(C.isCompanionNavCta('Apply', { navOnly: true }), 'bare Apply allowed on nav-only pages');

  const ranked = C.findCompanionNavButtons(page.document);
  suite.ok(ranked.length >= 1, 'finds at least one nav CTA');
  const top = C.buttonText(ranked[0]);
  suite.ok(/save and continue/i.test(top), 'prefers Save and Continue (got: ' + top + ')');

  const clicks = { save: 0, back: 0, apply: 0, next: 0 };
  page.document.getElementById('saveCont').addEventListener('click', function () {
    clicks.save += 1;
  });
  page.document.getElementById('back').addEventListener('click', function () {
    clicks.back += 1;
  });
  page.document.getElementById('apply').addEventListener('click', function () {
    clicks.apply += 1;
  });
  page.document.getElementById('next').addEventListener('click', function () {
    clicks.next += 1;
  });

  const result = C.clickCompanionNav(page.document);
  suite.ok(result.clicked, 'clickCompanionNav clicks');
  suite.ok(clicks.save === 1, 'clicked Save and Continue (got ' + clicks.save + ')');
  suite.ok(clicks.back === 0, 'did not click Back');
  suite.ok(clicks.apply === 0, 'did not click Apply');
  suite.ok(clicks.next === 0, 'did not click Next when Save and Continue present');
})();

(function continueOnly() {
  const page = createPage(
    `<form><button type="button" id="back">Back</button><button type="button" id="cont">Continue</button></form>`,
    LIBS
  );
  const C = page.window.FillApplyCompanionNav;
  let cont = 0;
  let back = 0;
  page.document.getElementById('cont').addEventListener('click', function () {
    cont += 1;
  });
  page.document.getElementById('back').addEventListener('click', function () {
    back += 1;
  });
  const r = C.clickCompanionNav(page.document);
  suite.ok(r.clicked && cont === 1, 'clicks Continue when it is the only forward CTA (got ' + cont + ')');
  suite.ok(back === 0, 'still never clicks Back');
})();

(async function settleQuiet() {
  const page = createPage(`<div id="root"><input id="x" /></div>`, LIBS);
  const C = page.window.FillApplyCompanionNav;
  const start = Date.now();
  const result = await C.waitForSettle({
    document: page.document,
    settleMs: 80,
    maxWaitMs: 2000,
    pollMs: 20
  });
  const elapsed = Date.now() - start;
  suite.ok(result.settled, 'settle resolves when quiet');
  suite.ok(elapsed >= 50, 'waited about settleMs (got ' + elapsed + 'ms)');
  suite.ok(!result.timedOut, 'not timed out on quiet page');
  suite.ok(C.DEFAULT_SETTLE_MS <= 5000, 'default settle is reasonable (got ' + C.DEFAULT_SETTLE_MS + ')');
  suite.ok(C.DEFAULT_MAX_WAIT_MS <= 60000, 'default max wait not indefinite (got ' + C.DEFAULT_MAX_WAIT_MS + ')');
})()
  .then(function () {
    return (async function settleInterrupted() {
      const page = createPage(`<div id="root"></div>`, LIBS);
      const C = page.window.FillApplyCompanionNav;
      const p = C.waitForSettle({
        document: page.document,
        settleMs: 120,
        maxWaitMs: 3000,
        pollMs: 20
      });
      // Keep mutating so settle clock resets, then stop
      let n = 0;
      const iv = setInterval(function () {
        n += 1;
        const el = page.document.createElement('span');
        el.textContent = String(n);
        page.document.getElementById('root').appendChild(el);
        if (n >= 3) clearInterval(iv);
      }, 30);
      const result = await p;
      suite.ok(result.settled || result.timedOut, 'settle finishes after mutations stop');
    })();
  })
  .then(function () {
    // Nav-only page: only Apply CTA → click it (do not stall)
    const page = createPage(
      `<main><h1>Job</h1><a id="apply" href="#form">Start Application</a></main>`,
      LIBS
    );
    const C = page.window.FillApplyCompanionNav;
    suite.ok(C.isNavOnlyPage(page.document), 'page with no inputs is nav-only');
    let clicked = 0;
    page.document.getElementById('apply').addEventListener('click', function () {
      clicked += 1;
    });
    // Promote <a> to button-like for query
    page.document.getElementById('apply').setAttribute('role', 'button');
    const r = C.clickCompanionNav(page.document);
    suite.ok(r.clicked && clicked === 1, 'nav-only clicks Start Application (got clicked=' + clicked + ')');
  })
  .then(function () {
    // Fallback adapter companion short-circuit
    const page = createPage(
      `<form><label>Name <input name="first_name" /></label><button id="next">Continue</button></form>`,
      [
        'lib/dom-deep.js',
        'lib/format.js',
        'lib/synonyms.js',
        'lib/companion-nav.js',
        'lib/field-map.js',
        'lib/files.js',
        'content/fill.js',
        'adapters/fallback.js'
      ]
    );
    return page.window.FillApplyFallbackAdapter.fill({
      profile: { firstName: 'Sample', email: 'a@b.com' },
      runMode: 'companion',
      options: { formWaitMs: 50 }
    }).then(function (res) {
      suite.ok(res && res.companion === true, 'fallback companion flag');
      suite.equal(res.filled, 0, 'companion never fills');
      suite.equal(!!res.submitted, false, 'companion never submits');
      suite.equal(page.document.querySelector('input[name="first_name"]').value, '', 'input left empty');
      suite.finish();
    });
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
