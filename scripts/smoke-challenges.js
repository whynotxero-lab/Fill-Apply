/**
 * CAPTCHA / Cloudflare settle: wait + recheck, false-positive form continue,
 * real blocking challenge still pauses.
 *
 * Run: node scripts/smoke-challenges.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const LIBS = ['lib/auth-walls.js', 'lib/challenges.js', 'lib/ats-auth.js'];
const suite = createSuite('smoke-challenges');

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

(async function main() {
  // 1) Instant detect still flags interactable CAPTCHA (no form)
  (function instantCaptchaDetect() {
    const page = createPage(
      `
      <h1>Security check required</h1>
      <div class="h-captcha" data-sitekey="x" style="width:300px;height:80px"></div>
      <iframe src="https://newassets.hcaptcha.com/captcha/v1/x/frame" title="hCaptcha"
        style="width:300px;height:80px"></iframe>
    `,
      LIBS
    );
    const C = page.window.FillApplyChallenges;
    const ch = C.detectChallenge(page.document);
    suite.ok(ch.challenged, 'instant detect: captcha challenged');
    suite.equal(ch.kind, 'captcha', 'instant detect: kind captcha');
    suite.ok(C.shouldPauseForChallenge(ch, page.document), 'no form → still pause');
  })();

  // 2) Fillable Greenhouse-style form + widget CAPTCHA → do not pause (false positive)
  (function fillableFormSuppressesWidget() {
    const page = createPage(
      `
      <form id="application">
        <label>First Name</label><input type="text" id="first_name" name="first_name" />
        <label>Last Name</label><input type="text" id="last_name" name="last_name" />
        <label>Email</label><input type="email" id="email" name="email" />
        <label>Phone</label><input type="tel" id="phone" name="phone" />
        <label>Resume</label><input type="file" id="resume" name="resume" />
        <div class="g-recaptcha" data-sitekey="x" style="width:300px;height:80px"></div>
        <iframe src="https://www.google.com/recaptcha/api2/anchor" title="reCAPTCHA"
          style="width:300px;height:80px"></iframe>
      </form>
    `,
      LIBS
    );
    const C = page.window.FillApplyChallenges;
    const ch = C.detectChallenge(page.document);
    suite.ok(ch.challenged, 'widget still detected on fillable form');
    suite.ok(C.applicationFormLooksFillable(page.document), 'application form looks fillable');
    suite.ok(!C.shouldPauseForChallenge(ch, page.document), 'fillable form → do not pause for widget');

    const A = page.window.FillApplyAtsAuth;
    const insp = A.inspectAuthPage(page.document, { email: 'a@b.com' });
    suite.ok(
      insp.result !== A.AUTH_RESULTS.CAPTCHA_REQUIRED,
      'inspectAuth does not CAPTCHA_REQUIRED when form fillable'
    );
  })();

  // 3) detectChallengeWithSettle: transient challenge clears after wait
  await (async function settleClearsTransient() {
    const page = createPage(
      `
      <div id="wrap">
        <h1>Just a moment...</h1>
        <div id="challenge-stage" class="cf-turnstile" data-sitekey="x"
          style="width:300px;height:80px"></div>
      </div>
    `,
      LIBS
    );
    // Force title for CF detector
    page.document.title = 'Just a moment...';
    const C = page.window.FillApplyChallenges;
    const first = C.detectChallenge(page.document);
    suite.ok(first.challenged && first.kind === 'cloudflare', 'transient CF detected first');

    const settleP = C.detectChallengeWithSettle(page.document, { settleMs: 40 });
    await wait(15);
    // Clear challenge mid-wait
    page.document.title = 'Senior Manager, Finance';
    const stage = page.document.getElementById('challenge-stage');
    if (stage) stage.remove();
    page.document.getElementById('wrap').innerHTML =
      '<form id="application"><input type="text" name="first_name" />' +
      '<input type="email" name="email" /></form>';

    const settled = await settleP;
    suite.ok(!settled.challenged, 'after settle wait, cleared challenge → not challenged');
    suite.ok(settled.waited, 'settle waited');
    suite.ok(settled.clearedAfterWait, 'clearedAfterWait flag');
  })();

  // 4) detectChallengeWithSettle: real CAPTCHA (no form) still pauses after wait
  await (async function realCaptchaStillPauses() {
    const page = createPage(
      `
      <h1>Security check required</h1>
      <div class="h-captcha" data-sitekey="x" style="width:300px;height:80px"></div>
      <iframe src="https://newassets.hcaptcha.com/captcha/v1/x/frame" title="hCaptcha"
        style="width:300px;height:80px"></iframe>
    `,
      LIBS
    );
    const C = page.window.FillApplyChallenges;
    const settled = await C.detectChallengeWithSettle(page.document, { settleMs: 30 });
    suite.ok(settled.challenged, 'real CAPTCHA still challenged after wait');
    suite.ok(settled.waited, 'real CAPTCHA path waited');
    suite.equal(settled.kind, 'captcha', 'kind remains captcha');
  })();

  // 5) detectChallengeWithSettle: widget + fillable form → continue (suppressed)
  await (async function falsePositiveContinues() {
    const page = createPage(
      `
      <form id="application" class="application--container">
        <input type="text" id="first_name" name="job_application[first_name]" />
        <input type="text" id="last_name" name="job_application[last_name]" />
        <input type="email" id="email" name="job_application[email]" />
        <input type="tel" id="phone" name="job_application[phone]" />
        <input type="text" id="linkedin" name="job_application[urls][LinkedIn]" />
        <input type="file" id="resume" />
        <div class="g-recaptcha" data-sitekey="x"></div>
      </form>
    `,
      LIBS
    );
    const C = page.window.FillApplyChallenges;
    const settled = await C.detectChallengeWithSettle(page.document, { settleMs: 30 });
    suite.ok(!settled.challenged, 'false positive: continue fill (not challenged)');
    suite.ok(settled.suppressed || settled.formFillable, 'suppressed / formFillable set');
    suite.ok(settled.waited, 'false-positive path still waited before suppress');
  })();

  // 6) Cloudflare interstitial with no form still pauses after wait
  await (async function cloudflareStillBlocks() {
    const page = createPage(
      `
      <h1>Attention Required</h1>
      <div id="challenge-form"><div class="cf-turnstile" data-sitekey="x"></div></div>
      <p>Checking your browser before accessing the site. Ray ID abc</p>
    `,
      LIBS
    );
    page.document.title = 'Just a moment...';
    const C = page.window.FillApplyChallenges;
    const settled = await C.detectChallengeWithSettle(page.document, { settleMs: 30 });
    suite.ok(settled.challenged, 'Cloudflare interstitial still blocks after wait');
    suite.equal(settled.kind, 'cloudflare', 'kind cloudflare');
  })();

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
