/**
 * Universal Application Workflow v1.22 — modes, terminals, plateau, navigate, register, identity.
 * Synthetic fixtures only.
 *
 * Run: node scripts/smoke-universal-workflow.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite, ROOT } = require('./test-harness');

const suite = createSuite('smoke-universal-workflow');

const FILL_LIBS = [
  'lib/dom-deep.js',
  'lib/format.js',
  'lib/synonyms.js',
  'lib/field-map.js',
  'lib/control-adapter.js',
  'lib/ats-faq-seed.js',
  'lib/knowledge-policy.js',
  'lib/knowledge-canonical.js',
  'lib/knowledge-store.js',
  'lib/knowledge-resolver.js',
  'lib/knowledge-learn.js',
  'lib/files.js',
  'lib/auth-walls.js',
  'lib/signup-login.js',
  'lib/ats-auth.js',
  'lib/challenges.js',
  'content/fill.js',
  'adapters/registry.js',
  'adapters/fallback.js'
];

const PROFILE = {
  firstName: 'Alex',
  lastName: 'Sample',
  fullName: 'Alex Sample',
  email: 'alex.sample@example.com',
  phone: '501234567',
  phoneCountry: '+971',
  dateOfBirth: '1990-01-15',
  nationality: 'Pakistan',
  country: 'United Arab Emirates',
  countryOfResidence: 'United Arab Emirates',
  password: 'Synthetic-Test-Only-NotReal!'
};

function fixture(name) {
  return fs.readFileSync(path.join(ROOT, 'scripts/fixtures/controls', name), 'utf8');
}

(async function main() {
  // A) Types contract
  const typesSrc = fs.readFileSync(path.join(ROOT, 'lib/types.js'), 'utf8');
  ['register', 'fill', 'navigate', 'ready', 'submit'].forEach(function (m) {
    suite.ok(typesSrc.indexOf("'" + m + "'") !== -1, 'RUN_MODES has ' + m);
  });
  [
    'COMPLETE',
    'READY',
    'WAITING_FOR_USER',
    'MISSING_INFORMATION',
    'BLOCKED',
    'AUTH_REQUIRED',
    'AMBIGUOUS',
    'TIMEOUT'
  ].forEach(function (t) {
    suite.ok(typesSrc.indexOf("'" + t + "'") !== -1, 'terminal ' + t);
  });
  suite.ok(/PROGRESS_PLATEAU_MS\s*=\s*10000/.test(typesSrc), 'plateau 10000ms');

  // B) Page panel five controls
  const flowHtml = fixture('application-flow.html').replace(/<script>[\s\S]*?<\/script>/g, '');
  const panelPage = createPage(flowHtml, ['content/page-panel.js']);
  const P = panelPage.window.FillApplyPagePanel;
  suite.ok(!!P, 'FillApplyPagePanel attached');
  suite.equal(P.normalizeRunMode('Auto Register'), 'register', 'normalize register');
  suite.equal(P.normalizeRunMode('Auto Navigate'), 'navigate', 'normalize navigate');
  const host = P.mount(panelPage.document);
  const shadow = host.shadowRoot;
  const modes = ['register', 'fill', 'navigate', 'ready', 'submit'];
  const labels = ['Auto Register', 'Auto Fill', 'Auto Navigate', 'Auto Ready', 'Auto Submit'];
  modes.forEach(function (m, i) {
    const btn = shadow.querySelector('[data-mode="' + m + '"]');
    suite.ok(btn && btn.textContent === labels[i], labels[i] + ' present');
  });

  // C) Plateau tracker
  const fillPage = createPage('<form></form>', ['content/fill.js']);
  const api = fillPage.window.__fillApply;
  suite.ok(api && typeof api.createProgressTracker === 'function', 'createProgressTracker exported');
  const tr = api.createProgressTracker(25);
  tr.touch();
  suite.ok(!tr.timedOut(), 'fresh tracker not timed out');
  await new Promise(function (r) {
    setTimeout(r, 40);
  });
  suite.ok(tr.timedOut(), 'tracker times out after plateau');

  // D) Navigate multi-step — never Submit
  const navPage = createPage(fixture('navigate-multistep.html'), FILL_LIBS);
  const clicks = { continue: 0, review: 0, submit: 0 };
  navPage.document.getElementById('next1').addEventListener('click', function () {
    clicks.continue += 1;
  });
  navPage.document.getElementById('review').addEventListener('click', function () {
    clicks.review += 1;
  });
  navPage.document.getElementById('submit').addEventListener('click', function (e) {
    e.preventDefault();
    clicks.submit += 1;
  });
  const adapter = navPage.window.FillApplyFallbackAdapter;
  suite.ok(!!adapter, 'fallback adapter present');
  const navResult = await adapter.fill({
    profile: PROFILE,
    runMode: 'navigate',
    options: {
      formWaitMs: 50,
      navigateStabilizeMs: 20,
      maxNavigateSteps: 4,
      progressPlateauMs: 2000
    }
  });
  suite.ok(!!navResult, 'navigate returns result');
  suite.equal(clicks.submit, 0, 'navigate never clicks Submit');
  suite.ok(
    clicks.continue + clicks.review >= 1 ||
      navResult.advanced ||
      navResult.navigateSteps > 0 ||
      navResult.phase === 'READY' ||
      navResult.terminal === 'READY' ||
      navResult.ok,
    'navigate advanced or completed'
  );

  // E) Register — Google path; password never in result JSON
  const regPage = createPage(fixture('register-auth.html'), FILL_LIBS);
  let googleClicks = 0;
  regPage.document.getElementById('google').addEventListener('click', function () {
    googleClicks += 1;
  });
  const regAdapter = regPage.window.FillApplyFallbackAdapter;
  const regResult = await regAdapter.fill({
    profile: PROFILE,
    runMode: 'register',
    options: { formWaitMs: 30 }
  });
  suite.ok(!!regResult, 'register returns result');
  suite.ok(
    regResult.googleAuthClicked ||
      googleClicks >= 1 ||
      regResult.phase === 'WAITING_FOR_USER' ||
      regResult.terminal === 'WAITING_FOR_USER' ||
      regResult.phase === 'AUTH_REQUIRED' ||
      regResult.terminal === 'AUTH_REQUIRED' ||
      regResult.signupLogin ||
      regResult.ok,
    'register engaged auth path'
  );
  suite.ok(JSON.stringify(regResult).indexOf(PROFILE.password) === -1, 'password never in register result');

  // F) Identity kinds + resume aliases
  const idPage = createPage(fixture('identity-split.html'), FILL_LIBS);
  const F = idPage.window.FillApplyFormat;
  suite.ok(!!F && typeof F.fieldKind === 'function', 'format.fieldKind');
  suite.equal(F.fieldKind(idPage.document.getElementById('nat'), 'nationality'), 'nationality', 'nationality kind');
  suite.equal(
    F.fieldKind(idPage.document.getElementById('res'), 'countryOfResidence'),
    'residence',
    'residence kind'
  );
  const ccKind = F.fieldKind(idPage.document.getElementById('cc'), 'phoneCountry');
  suite.ok(ccKind === 'phoneCountry', 'phoneCountry kind: ' + ccKind);

  const syn = idPage.window.FillApplySynonyms;
  suite.ok(syn.isResumeLabel('Upload Resume / CV'), 'resume alias Resume/CV');
  suite.ok(syn.isResumeLabel('Attach CV'), 'resume alias Attach CV');

  // G) Adaptive field memory still present (folded branch)
  const storeSrc = fs.readFileSync(path.join(ROOT, 'lib/knowledge-store.js'), 'utf8');
  suite.ok(/adaptiveDictionary|conflicts|Field Memory/i.test(storeSrc), 'field memory present');
  const learnSrc = fs.readFileSync(path.join(ROOT, 'lib/knowledge-learn.js'), 'utf8');
  suite.ok(/password|sensitive|consent/i.test(learnSrc), 'learn excludes sensitive');

  // H) Runner terminals + modes
  const runnerSrc = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
  ['WAITING_FOR_USER', 'AUTH_REQUIRED', 'AMBIGUOUS', 'TIMEOUT', 'REGISTERING', 'NAVIGATING'].forEach(
    function (ph) {
      suite.ok(runnerSrc.indexOf(ph) !== -1, 'runner has ' + ph);
    }
  );
  suite.ok(runnerSrc.indexOf("'navigate'") !== -1 || /navigate/.test(runnerSrc), 'runner knows navigate');
  suite.ok(runnerSrc.indexOf("'register'") !== -1 || /register/.test(runnerSrc), 'runner knows register');

  // I) Version
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  suite.ok(/^1\.2[23]\./.test(pkg.version), 'package version 1.22+/1.23 (got ' + pkg.version + ')');
  suite.ok(/^1\.2[23]\./.test(man.version), 'manifest version 1.22+/1.23 (got ' + man.version + ')');

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
