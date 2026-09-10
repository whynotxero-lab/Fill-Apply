/**
 * Run every smoke script in sequence.
 * Run: npm test
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  'smoke-apply-start-synonyms.js',
  'smoke-glassdoor-inflow.js',
  'smoke-form-detection.js',
  'smoke-fill-engine.js',
  'smoke-value-format.js'
];

let failed = 0;
SUITES.forEach(function (suite) {
  console.log('\n=== ' + suite + ' ===');
  const result = spawnSync(process.execPath, [path.join(__dirname, suite)], { stdio: 'inherit' });
  if (result.status !== 0) failed += 1;
});

if (failed) {
  console.error('\n' + failed + ' of ' + SUITES.length + ' suites failed');
  process.exit(1);
}
console.log('\nAll ' + SUITES.length + ' suites passed');
