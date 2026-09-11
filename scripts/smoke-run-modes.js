/**
 * Fallback adapter run modes: start/fill, continue, submit.
 *
 * Run: node scripts/smoke-run-modes.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const LIBS = [
  'lib/dom-deep.js',
  'lib/format.js',
  'lib/synonyms.js',
  'lib/field-map.js',
  'lib/files.js',
  'content/fill.js',
  'adapters/fallback.js'
];

const suite = createSuite('smoke-run-modes');

const PROFILE = {
  firstName: 'Zahid',
  lastName: 'Ali',
  email: 'zahid@example.com'
};

const FORM = `
  <div id="application-form">
    <div class="field"><label for="fn">First name</label><input id="fn" name="first_name" /></div>
    <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
    <button type="button" id="next">Continue</button>
    <button type="submit" id="send">Submit application</button>
  </div>
`;

function wireClicks(doc) {
  const clicks = { continue: 0, submit: 0 };
  doc.getElementById('next').addEventListener('click', function () {
    clicks.continue += 1;
  });
  doc.getElementById('send').addEventListener('click', function (e) {
    e.preventDefault();
    clicks.submit += 1;
  });
  return clicks;
}

(async function main() {
  const fillPage = createPage(FORM, LIBS);
  const fillClicks = wireClicks(fillPage.document);
  const fillResult = await fillPage.window.FillApplyFallbackAdapter.fill({
    profile: PROFILE,
    runMode: 'fill',
    adapterId: 'fallback',
    options: { formWaitMs: 50 }
  });
  suite.ok(fillResult.ok, 'fill mode completes');
  suite.equal(fillPage.document.getElementById('fn').value, 'Zahid', 'fill mode writes mapped fields');
  suite.equal(fillClicks.continue, 0, 'fill mode does not click Continue');
  suite.equal(fillClicks.submit, 0, 'fill mode does not click Submit');
  suite.equal(!!fillResult.advanced, false, 'fill result is not advanced');
  suite.equal(!!fillResult.submitted, false, 'fill result is not submitted');

  const readyPage = createPage(FORM, LIBS);
  const readyClicks = wireClicks(readyPage.document);
  const readyResult = await readyPage.window.FillApplyFallbackAdapter.fill({
    profile: PROFILE,
    runMode: 'ready',
    adapterId: 'fallback',
    options: { formWaitMs: 50 }
  });
  suite.ok(readyResult.ok, 'ready mode completes');
  suite.equal(readyPage.document.getElementById('em').value, 'zahid@example.com', 'ready mode fills');
  suite.ok(readyClicks.continue >= 1, 'ready mode clicks Continue');
  suite.equal(readyClicks.submit, 0, 'ready mode does not click Submit');
  suite.ok(readyResult.advanced, 'ready result is advanced');
  suite.equal(!!readyResult.submitted, false, 'ready result is not submitted');

  const submitPage = createPage(FORM, LIBS);
  const submitClicks = wireClicks(submitPage.document);
  const submitResult = await submitPage.window.FillApplyFallbackAdapter.fill({
    profile: PROFILE,
    runMode: 'submit',
    adapterId: 'fallback',
    options: { formWaitMs: 50 }
  });
  suite.ok(submitResult.ok, 'submit mode completes');
  suite.ok(submitClicks.continue >= 1, 'submit mode still continues first');
  suite.ok(submitClicks.submit >= 1, 'submit mode clicks Submit application');
  suite.ok(submitResult.submitted, 'submit result is submitted');

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
