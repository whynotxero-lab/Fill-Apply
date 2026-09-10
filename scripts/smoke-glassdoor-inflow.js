/**
 * Smoke: Glassdoor inFlow must NOT trip on footer-only "Indeed, Inc."
 * Run: node scripts/smoke-glassdoor-inflow.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

function load(rel) {
  const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const sandbox = { globalThis: {}, console };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.document = sandbox.document || {
    body: { innerText: '' },
    querySelectorAll: function () {
      return [];
    },
    querySelector: function () {
      return null;
    }
  };
  Function('globalThis', 'self', 'window', 'document', 'console', src)(
    sandbox,
    sandbox,
    sandbox,
    sandbox.document,
    console
  );
  return sandbox;
}

const ea = load('lib/easy-apply-steps.js');
const gd = load('adapters/boards/glassdoor.js');
// Re-attach EA onto same sandbox as glassdoor — load both in one sandbox
const sandbox = { globalThis: {}, console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
function makeDoc(innerText) {
  return {
    body: { innerText: innerText },
    querySelectorAll: function () {
      return [];
    },
    querySelector: function () {
      return null;
    }
  };
}
sandbox.document = makeDoc('');
Function(
  'globalThis',
  'self',
  'window',
  'document',
  'console',
  fs.readFileSync(path.join(__dirname, '..', 'lib', 'easy-apply-steps.js'), 'utf8')
)(sandbox, sandbox, sandbox, sandbox.document, console);
Function(
  'globalThis',
  'self',
  'window',
  'document',
  'console',
  fs.readFileSync(path.join(__dirname, '..', 'adapters', 'boards', 'glassdoor.js'), 'utf8')
)(sandbox, sandbox, sandbox, sandbox.document, console);

const detect = sandbox.detectGlassdoorApplyFlow;
if (typeof detect !== 'function') {
  console.error('FAIL: detectGlassdoorApplyFlow missing');
  process.exit(1);
}

let failed = 0;

function assert(name, cond) {
  if (!cond) {
    console.error('FAIL:', name);
    failed++;
  } else {
    console.log('ok:', name);
  }
}

// Job page paste: copyright footer only — must NOT set inFlow
const jobOnly =
  'Previon Lead Development Rep · Remote · Easy Apply visible on page. ' +
  'Save Share. Is my resume a good match? Upload resume. ' +
  '© 2026 Indeed, Inc. All rights reserved. Glassdoor, Inc.';
const flowJob = detect(makeDoc(jobOnly));
assert('footer Indeed, Inc. alone → inFlow false', flowJob.inFlow === false);
assert('footer-only step unknown', flowJob.step === 'unknown');

// Real wizard markers → inFlow true
const contactWizard =
  'Add your contact information First name Last name Email Phone Continue © 2026 Indeed, Inc.';
const flowContact = detect(makeDoc(contactWizard));
assert('Add your contact information → inFlow true', flowContact.inFlow === true);
assert('contact step', flowContact.step === 'contact');

const locationWizard = 'Add your location Street address (not shown to employers) Continue';
assert('Add your location → inFlow', detect(makeDoc(locationWizard)).inFlow === true);

const resumeWizard = 'Add a resume Upload a resume Build an Indeed Resume Continue';
assert('Add a resume → inFlow', detect(makeDoc(resumeWizard)).inFlow === true);

// Bare "contact information" without "Add your…" should NOT force contact/inFlow
const bareContact = 'Please review our contact information policy. © Indeed, Inc.';
const flowBare = detect(makeDoc(bareContact));
assert('bare contact information → inFlow false', flowBare.inFlow === false);

// Synonyms: Easy Apply + host helper
Function(
  'globalThis',
  'self',
  'window',
  'document',
  'console',
  fs.readFileSync(path.join(__dirname, '..', 'lib', 'synonyms.js'), 'utf8')
)(sandbox, sandbox, sandbox, sandbox.document, console);
const S = sandbox.FillApplySynonyms;
assert('isEasyApplyCta Easy Apply', S.isEasyApplyCta('Easy Apply') === true);
assert('isApplyStartCta excludes Easy Apply', S.isApplyStartCta('Easy Apply') === false);
assert(
  'isApplyStartCtaForHost glassdoor includes Easy Apply',
  S.isApplyStartCtaForHost('Easy Apply', 'www.glassdoor.com') === true
);
assert(
  'isApplyStartCtaForHost other host excludes Easy Apply',
  S.isApplyStartCtaForHost('Easy Apply', 'example.com') === false
);

if (failed) {
  console.error('FAILED', failed);
  process.exit(1);
}
console.log('PASS smoke-glassdoor-inflow');
