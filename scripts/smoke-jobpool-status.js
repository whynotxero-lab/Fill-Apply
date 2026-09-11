/**
 * JobPool status mapping: only `submitted` means the employer got the apply.
 *
 * Run: node scripts/smoke-jobpool-status.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-jobpool-status');
const page = createPage('<div></div>', ['lib/types.js']);
const T = page.window.FillApplyTypes;

suite.equal(T.jobPoolOutcome({ ok: true, submitted: true, filled: 4 }), 'submitted', 'raw FillResult submitted');
suite.equal(
  T.jobPoolOutcome({ ok: true, submitted: false, advanced: true, filled: 4 }),
  'ready',
  'raw FillResult continued/advanced'
);
suite.equal(T.jobPoolOutcome({ ok: true, filled: 6 }), 'filled', 'raw FillResult filled only');
suite.equal(T.jobPoolOutcome({ ok: true, filled: 0 }), 'processed', 'ok with no fields');
suite.equal(T.jobPoolOutcome({ ok: false, error: 'boom' }), 'failed', 'raw FillResult failed');
suite.equal(T.jobPoolOutcome({ cancelled: true }), 'cancelled', 'raw cancelled');
suite.equal(T.jobPoolOutcome(null), 'failed', 'null is failed');

suite.equal(
  T.jobPoolOutcome({
    fillResult: { ok: true, submitted: true, filled: 8 },
    submitted: true,
    runMode: 'submit'
  }),
  'submitted',
  'runner payload submit'
);
suite.equal(
  T.jobPoolOutcome({
    fillResult: { ok: true, advanced: true, filled: 8, submitted: false },
    submitted: false,
    advanced: true,
    runMode: 'ready'
  }),
  'ready',
  'runner payload ready'
);
suite.equal(
  T.jobPoolOutcome({
    fillResult: { ok: true, filled: 8, submitted: false },
    submitted: false,
    advanced: false,
    runMode: 'fill'
  }),
  'filled',
  'runner payload fill'
);
suite.equal(
  T.jobPoolOutcome({
    failed: true,
    error: 'Fill failed',
    fillResult: { ok: false, error: 'Fill failed' },
    runMode: 'submit'
  }),
  'failed',
  'runner payload failed'
);
suite.equal(
  T.jobPoolOutcome({
    fillResult: { ok: true, filled: 3 },
    submitted: false,
    runMode: 'submit'
  }),
  'filled',
  'submit mode that never clicked Submit is not Applied'
);
suite.ok(T.JOB_POOL_OUTCOMES.indexOf('submitted') !== -1, 'JOB_POOL_OUTCOMES lists submitted');
suite.ok(typeof T.jobPoolOutcome === 'function', 'jobPoolOutcome exported');

suite.finish();
