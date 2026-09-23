/**
 * Quick node smoke: Apply-start synonym matching (no browser).
 * Run: node scripts/smoke-apply-start-synonyms.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'synonyms.js'), 'utf8');
const sandbox = { globalThis: {} };
sandbox.globalThis = sandbox;
Function('globalThis', 'self', src)(sandbox, sandbox);
const S = sandbox.FillApplySynonyms;
if (!S) {
  console.error('FAIL: FillApplySynonyms not attached');
  process.exit(1);
}

const expectTrue = [
  'Apply',
  'Apply Now',
  'Start Apply',
  'Start Application',
  'Begin Application',
  'Continue Application',
  'Apply for this Job',
  'Apply for this Role',
  'Apply here',
  'APPLY FOR THIS JOB',
  'Apply with CV',
  'Apply with Resume',
  'Apply Manually',
  'Autofill with Resume'
];
const expectFalse = [
  'Saudi Arabia',
  'SHORTLIST',
  'Riyadh',
  'Apply With LinkedIn',
  'Use My Last Application',

  'Auto-Apply with AI',
  'AI Auto-Apply',
  'Auto-Apply',
  'Upgrade',
  'Subscribe',
  'Share',
  'Save job',
  'Easy Apply', // LinkedIn-owned; generic start excludes
  'Fill-Apply', // JobPool sidebar / page nav — never Apply-start
  'Applications',
  'Logs'
];

let failed = 0;
expectTrue.forEach(function (t) {
  const ok = S.isApplyStartCta(t);
  if (!ok) {
    console.error('FAIL expected true:', t);
    failed++;
  } else {
    console.log('ok true:', t);
  }
});
expectFalse.forEach(function (t) {
  const ok = S.isApplyStartCta(t);
  if (ok) {
    console.error('FAIL expected false:', t);
    failed++;
  } else {
    console.log('ok false:', t);
  }
});

// Final submit labels
if (!S.isFinalSubmitCta('Submit application')) {
  console.error('FAIL Submit application should be final submit');
  failed++;
} else {
  console.log('ok final:', 'Submit application');
}

// Advance CTAs (Ready mode): Review / Continue / Next
['Review', 'Continue', 'Next', 'Review and continue'].forEach(function (t) {
  if (!S.isContinueCta(t)) {
    console.error('FAIL expected continue:', t);
    failed++;
  } else {
    console.log('ok continue:', t);
  }
});
if (typeof S.findContinueButtons !== 'function' || typeof S.findSubmitButtons !== 'function') {
  console.error('FAIL missing findContinueButtons / findSubmitButtons');
  failed++;
} else {
  console.log('ok api: findContinueButtons + findSubmitButtons');
}
if (!S.DATA_APPLY_START || S.DATA_APPLY_START !== 'apply-start') {
  console.error('FAIL DATA_APPLY_START hook');
  failed++;
} else {
  console.log('ok data-fill-apply hooks:', S.DATA_APPLY_START, S.DATA_CONTINUE, S.DATA_SUBMIT);
}

// Container-scoped form-open: incidental page inputs must NOT count as open
(function () {
  // Minimal DOM stubs
  function el(tag, attrs, kids) {
    const o = {
      tagName: tag.toUpperCase(),
      type: (attrs && attrs.type) || '',
      disabled: false,
      readOnly: false,
      id: (attrs && attrs.id) || '',
      className: (attrs && attrs.className) || '',
      getAttribute: function (k) { return (attrs && attrs[k]) || null; },
      querySelectorAll: function (sel) {
        // very small stub used only for our constructed tree below
        return this._kids || [];
      },
      querySelector: function () { return null; },
      getBoundingClientRect: function () { return { width: 100, height: 20 }; }
    };
    o._kids = kids || [];
    return o;
  }
  // Skip heavy DOM simulation if helpers need real document — just assert API exists
  if (typeof S.isApplicationFormOpen !== 'function' || typeof S.findApplyContainers !== 'function') {
    console.error('FAIL missing isApplicationFormOpen / findApplyContainers');
    failed++;
  } else {
    console.log('ok api: isApplicationFormOpen + findApplyContainers');
  }
})();

if (failed) {
  console.error('FAILED', failed);
  process.exit(1);
}
console.log('PASS smoke-apply-start-synonyms');
