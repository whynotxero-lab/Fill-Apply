/**
 * 1.26.6 smoke: private Zahid default seed (not Mock); GulfTalent Google CTA;
 * Oracle easy-apply/email + privacy + circular next.
 * Run: node scripts/smoke-1.26.6-seed-gulftalent-oracle.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./test-harness');

const suite = createSuite('smoke-1.26.6-seed-gulftalent-oracle');
const ROOT = path.join(__dirname, '..');

function load(win, rel) {
  win.eval(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

(async function main() {
  const manif = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  suite.equal(manif.version, '1.26.6', 'manifest 1.26.6');
  suite.equal(pkg.version, '1.26.6', 'package 1.26.6');

  suite.ok(fs.existsSync(path.join(ROOT, 'lib/private-zahid-seed.js')), 'private-zahid-seed.js present');
  const seedSrc = fs.readFileSync(path.join(ROOT, 'lib/private-zahid-seed.js'), 'utf8');
  suite.ok(/czahidali\.accacma@gmail\.com/.test(seedSrc), 'seed contains Zahid gmail');
  suite.ok(/Zahid@Finance786/.test(seedSrc), 'seed contains Environments password');
  suite.ok(!/alex\.rivera@example\.com/.test(seedSrc), 'seed is not Mock Alex');

  const sw = fs.readFileSync(path.join(ROOT, 'background/service-worker.js'), 'utf8');
  suite.ok(/private-zahid-seed\.js/.test(sw), 'SW imports private seed');
  suite.ok(/ensureInstalled/.test(sw), 'SW calls ensureInstalled');

  const runner = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
  suite.ok(/gulftalent\.js/.test(runner), 'runner injects gulftalent');
  suite.ok(/bayt\.js/.test(runner), 'runner injects bayt');

  // --- Profile init: Zahid active not Mock ---
  const { JSDOM } = require('jsdom');
  const bag = {};
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://example.com/'
  });
  const w = dom.window;
  w.chrome = {
    storage: {
      local: {
        get: function (keys, cb) {
          const out = {};
          const list = Array.isArray(keys) ? keys : keys && typeof keys === 'object' ? Object.keys(keys) : [keys];
          list.forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(bag, k)) out[k] = bag[k];
          });
          cb(out);
        },
        set: function (obj, cb) {
          Object.assign(bag, obj || {});
          if (cb) cb();
        }
      }
    },
    runtime: { lastError: null }
  };
  load(w, 'lib/private-zahid-seed.js');
  load(w, 'lib/profile.js');
  load(w, 'lib/environment-store.js');
  load(w, 'lib/question-bank-store.js');
  load(w, 'lib/profile-io.js');
  const P = w.FillApplyProfile;
  const list = await P.listProfiles();
  const activeId = await P.getActiveProfileId();
  const active = list.filter(function (p) { return p.id === activeId; })[0];
  suite.ok(P.isZahidName(active.name), 'default active is Zahid');
  const profile = await P.getProfile();
  suite.ok(/czahidali\.accacma@gmail\.com/i.test(profile.email), 'default email Zahid gmail');
  suite.ok(!P.isMockName(active.name), 'default active is not Mock');

  // Install seed path
  const Seed = w.FillApplyPrivateZahidSeed;
  suite.ok(!!Seed, 'FillApplyPrivateZahidSeed global');
  const installed = await Seed.ensureInstalled({ force: true });
  suite.ok(installed && installed.ok !== false, 'ensureInstalled ok');
  await w.FillApplyEnvironment.load();
  const env = w.FillApplyEnvironment.get();
  suite.equal(env.registrationPassword, 'Zahid@Finance786', 'Environments password seeded');

  // --- GulfTalent Google CTA ---
  const gtDom = new JSDOM(
    `<!doctype html><html><body>
      <h2>Register before applying to Finance Manager</h2>
      <button id="g">Continue with Google</button>
      <button id="a">Continue with Apple</button>
      <button id="f">Continue with Facebook</button>
      <button id="e">Sign up with Email</button>
    </body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://www.gulftalent.com/jobs/apply' }
  );
  const gw = gtDom.window;
  // minimal visibility
  Object.defineProperty(gw.HTMLElement.prototype, 'getBoundingClientRect', {
    value: function () {
      return { width: 120, height: 40, top: 0, left: 0, bottom: 40, right: 120 };
    }
  });
  gw.getComputedStyle = function () {
    return { display: 'block', visibility: 'visible' };
  };
  load(gw, 'adapters/registry.js');
  load(gw, 'adapters/boards/gulftalent.js');
  const GT = gw.FillApply_gulftalentAdapter;
  suite.ok(!!GT, 'gulftalent adapter global');
  suite.ok(GT.isRegisterBeforeApplyingModal(gw.document), 'detects Register before applying');
  const ctas = GT.findRegisterSocialCtas(gw.document);
  suite.ok(ctas.length >= 3, 'finds social CTAs');
  suite.equal(ctas[0].provider, 'google', 'Google preferred first');
  let clicked = null;
  gw.document.getElementById('g').addEventListener('click', function () {
    clicked = 'google';
  });
  const step = await GT.handleRegisterModal(gw.document, profile);
  suite.ok(step.clicked, 'register modal clicked CTA');
  suite.equal(step.provider, 'google', 'clicked Google');
  suite.ok(step.pause, 'pauses for OAuth human on same modal');

  // Google synonym in signup-login
  const slSrc = fs.readFileSync(path.join(ROOT, 'lib/signup-login.js'), 'utf8');
  suite.ok(/sign up with google|register with google/i.test(slSrc), 'signup-login Google synonyms');
  suite.ok(/apple/i.test(slSrc) && /facebook/i.test(slSrc), 'signup-login Apple/Facebook');

  // --- Oracle easy-apply/email + privacy + circular next ---
  const oracleSrc = fs.readFileSync(path.join(ROOT, 'adapters/ats/oraclecloud.js'), 'utf8');
  suite.ok(/easy-apply/.test(oracleSrc), 'oracle mentions easy-apply');
  suite.ok(/privacy/i.test(oracleSrc), 'oracle privacy policy');
  suite.ok(/let'?s get started|What'?s your email/i.test(oracleSrc), 'oracle easy-apply copy');

  const oDom = new JSDOM(
    `<!doctype html><html><body>
      <h1>Let's get started</h1>
      <label for="em">What's your email?</label>
      <input id="em" type="email" />
      <label><input id="priv" type="checkbox" /> I agree with the privacy policy</label>
      <button aria-label="Next" class="oj-button circular arrow" id="nxt"></button>
    </body></html>`,
    {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'https://eeho.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/123/easy-apply/email'
    }
  );
  const ow = oDom.window;
  Object.defineProperty(ow.HTMLElement.prototype, 'getBoundingClientRect', {
    value: function () {
      return { width: 40, height: 40, top: 0, left: 0, bottom: 40, right: 40 };
    }
  });
  ow.getComputedStyle = function () {
    return { display: 'block', visibility: 'visible' };
  };
  load(ow, 'adapters/registry.js');
  load(ow, 'adapters/ats/oraclecloud.js');
  const O = ow.FillApply_oraclecloudAdapter;
  suite.ok(!!O, 'oracle adapter global');
  suite.ok(O.isEmailApplyStep(ow.document), 'easy-apply/email detected as email step');
  let nextClicked = false;
  ow.document.getElementById('nxt').addEventListener('click', function () {
    nextClicked = true;
  });
  const ostep = await O.fillEmailTermsNext(ow.document, {
    email: 'czahidali.accacma@gmail.com'
  });
  suite.ok(ostep.emailFilled, 'oracle easy-apply email filled');
  suite.ok(ostep.termsChecked, 'oracle privacy checkbox checked');
  suite.ok(ostep.nextClicked || nextClicked, 'oracle circular next clicked');
  suite.ok(ow.document.getElementById('em').value.indexOf('czahidali') !== -1, 'email value set');
  suite.ok(ow.document.getElementById('priv').checked, 'privacy checked');

  // Classic apply/email still works
  const oDom2 = new JSDOM(
    `<!doctype html><html><body>
      <p>You don't need to have an account</p>
      <label>Email Address</label><input type="email" id="e2" />
      <label><input type="checkbox" id="t2" /> I agree with the terms and conditions</label>
      <button id="n2">NEXT</button>
    </body></html>`,
    {
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      url: 'https://eeho.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/123/apply/email'
    }
  );
  const ow2 = oDom2.window;
  Object.defineProperty(ow2.HTMLElement.prototype, 'getBoundingClientRect', {
    value: function () {
      return { width: 40, height: 40, top: 0, left: 0, bottom: 40, right: 40 };
    }
  });
  ow2.getComputedStyle = function () {
    return { display: 'block', visibility: 'visible' };
  };
  load(ow2, 'adapters/registry.js');
  load(ow2, 'adapters/ats/oraclecloud.js');
  const O2 = ow2.FillApply_oraclecloudAdapter;
  const ostep2 = await O2.fillEmailTermsNext(ow2.document, { email: 'czahidali.accacma@gmail.com' });
  suite.ok(ostep2.emailFilled && ostep2.termsChecked && ostep2.nextClicked, 'classic apply/email still works');

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
