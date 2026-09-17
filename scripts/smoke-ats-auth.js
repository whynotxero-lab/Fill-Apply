/**
 * ATS auth + Google OAuth helpers: detection phrases, name normalization,
 * existing-account recovery, ambiguous chooser → pause, success/failure cases.
 *
 * Run: node scripts/smoke-ats-auth.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const LIBS = ['lib/auth-walls.js', 'lib/challenges.js', 'lib/ats-auth.js'];
const suite = createSuite('smoke-ats-auth');

const PROFILE = {
  fullName: 'Chaudhry Zahid Ali',
  firstName: 'Chaudhry Zahid',
  lastName: 'Ali',
  email: 'czahidali@gmail.com'
};

(function detectionPhrases() {
  const page = createPage(
    `
    <h1>Create an account</h1>
    <p>Returning candidate? Log back in</p>
    <label>Password</label><input type="password" />
    <label>Password Re-enter</label><input type="password" />
    <button type="button">Sign Up</button>
  `,
    LIBS
  );
  const A = page.window.FillApplyAtsAuth;
  const wall = page.window.FillApplyAuthWalls.detectAuthWall(page.document);
  suite.ok(wall.challenged, 'create-account / password-reenter is an auth wall');
  const insp = A.inspectAuthPage(page.document, PROFILE);
  suite.equal(insp.result, A.AUTH_RESULTS.UNSUPPORTED_AUTH_FLOW, 'no Google → UNSUPPORTED_AUTH_FLOW');
  suite.ok(insp.pause, 'unsupported auth flow pauses');
})();

(function googleAuthActionDetected() {
  const page = createPage(
    `
    <h1>Sign in</h1>
    <input type="password" />
    <button type="button">Continue with Google</button>
    <a href="/register">Create account</a>
  `,
    LIBS
  );
  const A = page.window.FillApplyAtsAuth;
  const actions = A.findGoogleAuthActions(page.document);
  suite.ok(actions.length >= 1, 'Continue with Google is detected as auth action');
  suite.ok(/google/i.test(actions[0].text), 'action text mentions Google');
  const insp = A.inspectAuthPage(page.document, PROFILE);
  suite.equal(insp.action, 'click_google', 'inspect recommends click_google');
  suite.equal(insp.result, 'GOOGLE_AUTH_AVAILABLE', 'Google auth available on wall');
})();

(function bareGoogleTextIsNotAuthAction() {
  const page = createPage(
    `
    <p>We use Google Maps for office locations.</p>
    <button type="button">Google</button>
    <a href="https://maps.google.com">Open Google Maps</a>
  `,
    LIBS
  );
  const A = page.window.FillApplyAtsAuth;
  const actions = A.findGoogleAuthActions(page.document);
  suite.equal(actions.length, 0, 'bare Google / Maps text is not an auth action');
})();

(function nameNormalizationVariants() {
  const page = createPage('<div></div>', LIBS);
  const A = page.window.FillApplyAtsAuth;
  suite.equal(
    A.normalizePersonName('Chaudary Zahid Ali'),
    A.normalizePersonName('Chaudhry Zahid Ali'),
    'Chaudary ≡ Chaudhry after normalize'
  );
  suite.equal(
    A.normalizePersonName('Chaudhary Zahid Ali'),
    A.normalizePersonName('Chaudhry Zahid Ali'),
    'Chaudhary ≡ Chaudhry after normalize'
  );
  suite.ok(
    A.namesEquivalent('Chaudary Zahid Ali', 'Chaudhry Zahid Ali'),
    'namesEquivalent treats preferred/variant as equal'
  );
  suite.ok(
    A.namesEquivalent('Zahid Ali Chaudhry', 'Chaudhry Zahid Ali'),
    'token-order-insensitive name match'
  );
  suite.ok(!A.namesEquivalent('Someone Else', 'Chaudhry Zahid Ali'), 'different names do not match');
})();

(function existingAccountSwitchesToGoogleLogin() {
  const page = createPage(
    `
    <div class="error">An account with this email already exists. Please sign in.</div>
    <button type="button">Sign in with Google</button>
    <button type="button">Create account</button>
  `,
    LIBS
  );
  const A = page.window.FillApplyAtsAuth;
  const existing = A.detectExistingAccountMessage(page.document);
  suite.ok(existing && existing.found, 'existing-account message detected');
  const insp = A.inspectAuthPage(page.document, PROFILE);
  suite.equal(insp.result, A.AUTH_RESULTS.ACCOUNT_ALREADY_EXISTS, 'ACCOUNT_ALREADY_EXISTS code');
  suite.equal(insp.action, 'click_google', 'recovery path clicks Google sign-in');
  suite.ok(insp.existingAccount, 'existingAccount flag set');
})();

(function ambiguousAccountPauses() {
  const page = createPage(
    `
    <h1>Choose an account</h1>
    <div data-identifier="other@example.com">
      <div class="account-name">Other Person</div>
      <div>other@example.com</div>
    </div>
    <div data-identifier="also@example.com">
      <div class="account-name">Chaudhry Zahid Ali</div>
      <div>also@example.com</div>
    </div>
    <div data-identifier="twin@example.com">
      <div class="account-name">Chaudary Zahid Ali</div>
      <div>twin@example.com</div>
    </div>
  `,
    LIBS
  );
  const A = page.window.FillApplyAtsAuth;
  // Force Google chooser path
  const insp = A.inspectAuthPage(page.document, PROFILE, { forceGoogleChooser: true });
  suite.equal(insp.result, A.AUTH_RESULTS.USER_ACTION_REQUIRED, 'ambiguous → USER_ACTION_REQUIRED');
  suite.ok(insp.pause, 'ambiguous account pauses (never guesses)');
})();

(function highConfidenceEmailMatch() {
  const page = createPage(
    `
    <h1>Choose an account</h1>
    <div data-identifier="other@example.com">
      <div class="account-name">Other Person</div>
      other@example.com
    </div>
    <div data-identifier="czahidali@gmail.com">
      <div class="account-name">Chaudary Zahid Ali</div>
      czahidali@gmail.com
    </div>
  `,
    LIBS
  );
  const A = page.window.FillApplyAtsAuth;
  const opts = A.listGoogleAccountOptions(page.document);
  suite.ok(opts.length >= 2, 'lists Google account options');
  const match = A.matchApplicantAccount(opts, PROFILE);
  suite.equal(match.status, 'match', 'email match is high confidence');
  suite.equal(match.option.email, 'czahidali@gmail.com', 'selects applicant email');
  const insp = A.inspectAuthPage(page.document, PROFILE, { forceGoogleChooser: true });
  suite.equal(insp.result, 'GOOGLE_ACCOUNT_MATCH', 'inspect exposes account match action');
  suite.equal(insp.action, 'click_account', 'action is click_account');
})();

(function continueAsButton() {
  const page = createPage(
    `
    <button type="button">Continue as Chaudhry Zahid Ali</button>
  `,
    LIBS
  );
  const A = page.window.FillApplyAtsAuth;
  // Sole Continue-as with matching name and no other accounts
  const insp = A.inspectAuthPage(page.document, PROFILE, { forceGoogleChooser: true });
  // With only Continue as and matching name as sole option → match
  suite.ok(
    insp.result === 'GOOGLE_ACCOUNT_MATCH' || insp.result === A.AUTH_RESULTS.USER_ACTION_REQUIRED,
    'Continue as handled without crash (' + insp.result + ')'
  );
  if (insp.result === 'GOOGLE_ACCOUNT_MATCH') {
    suite.equal(insp.action, 'click_account', 'Continue as → click_account when confident');
  }
})();

(function successAndFailurePauseCases() {
  const okPage = createPage(
    `
    <button type="button">Sign out</button>
    <span>Connected</span>
    <button type="button">Disconnect</button>
    <form id="application">
      <label for="fn">First Name</label><input id="fn" name="first_name" />
      <label for="em">Email</label><input id="em" type="email" />
      <input type="file" />
      <button type="submit">Submit Application</button>
    </form>
  `,
    LIBS
  );
  const A = okPage.window.FillApplyAtsAuth;
  // SSO connected short-circuits auth wall
  const wall = okPage.window.FillApplyAuthWalls.detectAuthWall(okPage.document);
  suite.ok(wall.ssoConnected || !wall.challenged, 'SSO connected / no wall on success page');
  const success = A.detectAuthSuccess(okPage.document);
  suite.ok(success.success || (success.signals && success.signals.length), 'success signals collected');

  const captchaPage = createPage(
    `
    <h1>Verify you are human</h1>
    <div class="h-captcha" data-sitekey="x" style="width:300px;height:80px"></div>
    <iframe src="https://newassets.hcaptcha.com/captcha/v1/x/frame" title="hCaptcha" style="width:300px;height:80px"></iframe>
  `,
    LIBS
  );
  const A2 = captchaPage.window.FillApplyAtsAuth;
  const inspCap = A2.inspectAuthPage(captchaPage.document, PROFILE);
  suite.equal(inspCap.result, A2.AUTH_RESULTS.CAPTCHA_REQUIRED, 'CAPTCHA_REQUIRED pauses');
  suite.ok(inspCap.pause, 'captcha inspect pauses');

  const mfaPage = createPage(
    `
    <h1>2-Step Verification</h1>
    <p>Enter the code from your authenticator</p>
    <input type="tel" name="totp" placeholder="Enter code" autocomplete="one-time-code" />
  `,
    LIBS
  );
  const A3 = mfaPage.window.FillApplyAtsAuth;
  const inspMfa = A3.inspectAuthPage(mfaPage.document, PROFILE);
  suite.equal(inspMfa.result, A3.AUTH_RESULTS.MFA_REQUIRED, 'MFA_REQUIRED pauses');
  suite.ok(inspMfa.pause, 'mfa inspect pauses');
})();

(function resultCodesExported() {
  const page = createPage('<div></div>', LIBS);
  const AR = page.window.FillApplyAtsAuth.AUTH_RESULTS;
  [
    'AUTHENTICATED',
    'ACCOUNT_CREATED',
    'ACCOUNT_ALREADY_EXISTS',
    'USER_ACTION_REQUIRED',
    'CAPTCHA_REQUIRED',
    'MFA_REQUIRED',
    'EMAIL_VERIFICATION_REQUIRED',
    'UNSUPPORTED_AUTH_FLOW',
    'AUTH_FAILED',
    'TIMEOUT'
  ].forEach(function (k) {
    suite.equal(AR[k], k, 'AUTH_RESULTS.' + k);
  });
})();

(function performClickGoogle() {
  const page = createPage(
    `
    <h1>Sign in</h1>
    <input type="password" />
    <button id="g" type="button">Sign in with Google</button>
  `,
    LIBS
  );
  let clicked = false;
  page.document.getElementById('g').addEventListener('click', function () {
    clicked = true;
  });
  const A = page.window.FillApplyAtsAuth;
  const insp = A.inspectAuthPage(page.document, PROFILE);
  const out = A.performAuthAction(page.document, PROFILE, insp);
  suite.ok(out.ok, 'performAuthAction clicks Google');
  suite.ok(clicked, 'Google button received click');
})();


(function continueApplyingSocialWallPrefersGoogle() {
  const page = createPage(
    `
    <div class="modal overlay" role="dialog" aria-label="Continue applying">
      <h2>Continue applying to Finance Manager at AL Kanz Jewellery LLC</h2>
      <label for="em">Enter Email Id</label>
      <input id="em" type="text" placeholder="Enter Email Id" />
      <button type="button" id="emailContinue">Continue</button>
      <div class="social">
        <button type="button" id="googleBtn">google</button>
        <button type="button" id="fbBtn">Facebook</button>
      </div>
      <p>All your activity will remain private</p>
    </div>
  `,
    LIBS
  );
  const A = page.window.FillApplyAtsAuth;
  const wall = page.window.FillApplyAuthWalls.detectAuthWall(page.document);
  suite.ok(wall.challenged, 'Continue applying + email + social is an auth wall');
  suite.ok(wall.continueApplying || wall.kind === 'continue_applying_social', 'wall marked continueApplying');
  suite.ok(A.isContinueApplyingContext(page.document), 'isContinueApplyingContext true');
  const actions = A.findGoogleAuthActions(page.document);
  suite.ok(actions.length >= 1, 'bare google button detected in Continue applying context');
  suite.ok(actions.every(function (a) { return !/facebook/i.test(a.text); }), 'Facebook never listed as Google action');
  const insp = A.inspectAuthPage(page.document, PROFILE);
  suite.equal(insp.action, 'click_google', 'Continue applying prefers Google OAuth');
  suite.equal(insp.result, 'GOOGLE_AUTH_AVAILABLE', 'GOOGLE_AUTH_AVAILABLE for Continue applying');
  suite.ok(!insp.pause, 'Continue applying with Google does not pause before click');

  let clicked = null;
  page.document.getElementById('googleBtn').addEventListener('click', function () { clicked = 'google'; });
  page.document.getElementById('fbBtn').addEventListener('click', function () { clicked = 'facebook'; });
  page.document.getElementById('emailContinue').addEventListener('click', function () { clicked = 'email'; });
  const out = A.performAuthAction(page.document, PROFILE, insp);
  suite.ok(out.ok, 'perform clicks Google on Continue applying wall');
  suite.equal(clicked, 'google', 'clicked google — not Facebook, not email Continue');
})();

(function continueApplyingWithoutGooglePauses() {
  const page = createPage(
    `
    <h2>Continue applying to Warehouse Associate at Example Corp</h2>
    <input type="email" placeholder="Enter your Email ID" />
    <button type="button">Continue</button>
    <button type="button">Facebook</button>
    <p>All your activity will remain private</p>
  `,
    LIBS
  );
  const A = page.window.FillApplyAtsAuth;
  const insp = A.inspectAuthPage(page.document, PROFILE);
  suite.equal(insp.result, A.AUTH_RESULTS.UNSUPPORTED_AUTH_FLOW, 'no Google → UNSUPPORTED_AUTH_FLOW');
  suite.ok(insp.pause, 'Continue applying without Google pauses');
  suite.ok(!insp.action || insp.action !== 'click_google', 'does not click when Google missing');
})();

(function bareGoogleStillRejectedOutsideSocialContext() {
  const page = createPage(
    `
    <p>We use Google Maps for office locations.</p>
    <button type="button">Google</button>
    <a href="https://maps.google.com">Open Google Maps</a>
  `,
    LIBS
  );
  const A = page.window.FillApplyAtsAuth;
  const actions = A.findGoogleAuthActions(page.document);
  suite.equal(actions.length, 0, 'bare Google outside social/continue context still rejected');
})();


suite.finish();

