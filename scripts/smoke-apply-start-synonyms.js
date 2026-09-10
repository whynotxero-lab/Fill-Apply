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
  'Apply for this Job',
  'Apply for this Role',
  'Apply here',
  'APPLY FOR THIS JOB'
];
const expectFalse = [
  'Auto-Apply with AI',
  'AI Auto-Apply',
  'Auto-Apply',
  'Upgrade',
  'Subscribe',
  'Share',
  'Save job',
  'Easy Apply' // LinkedIn-owned; generic start excludes
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

if (failed) {
  console.error('FAILED', failed);
  process.exit(1);
}
console.log('PASS smoke-apply-start-synonyms');
