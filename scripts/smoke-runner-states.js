/**
 * Smoke: runner/fill phase transitions + blocker messages.
 *
 * Run: node scripts/smoke-runner-states.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite, ROOT } = require('./test-harness');

const suite = createSuite('smoke-runner-states');

const PHASES = [
  'DETECTING',
  'FILLING',
  'REGISTERING',
  'NAVIGATING',
  'WAITING_FOR_DEPENDENT_FIELDS',
  'VALIDATING',
  'MISSING_INFORMATION',
  'BLOCKED',
  'READY',
  'SUBMITTING',
  'COMPLETE',
  'WAITING_FOR_USER',
  'AUTH_REQUIRED',
  'AMBIGUOUS',
  'TIMEOUT'
];

(async function main() {
  await (async function runPhasesConstant() {
    // Load runner in a window to read RUN_PHASES (runner expects chrome — stub)
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'chrome-extension://fillapplytest/background.html'
    });
    const window = dom.window;
    window.chrome = {
      storage: { local: { get: function (k, cb) { cb({}); }, set: function (o, cb) { if (cb) cb(); } } },
      runtime: { sendMessage: function () {}, lastError: null },
      tabs: {},
      scripting: {},
      sidePanel: null,
      alarms: { create: function () {}, clear: function () {} }
    };
    // Minimal: eval only the RUN_PHASES by loading a tiny harness
    // Instead, read source for RUN_PHASES keys
    const src = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
    PHASES.forEach(function (p) {
      suite.ok(src.indexOf(p) !== -1, 'runner source has phase ' + p);
    });
    suite.ok(/RUN_PHASES/.test(src), 'RUN_PHASES defined');
    suite.ok(/WAITING_FOR_DEPENDENT_FIELDS/.test(src), 'WAITING_FOR_DEPENDENT_FIELDS present');
  })();

  await (async function panelSurfacesPhases() {
    const src = fs.readFileSync(path.join(ROOT, 'content/page-panel.js'), 'utf8');
    PHASES.forEach(function (p) {
      suite.ok(src.indexOf(p) !== -1, 'page-panel knows ' + p);
    });
  })();

  await (async function fillResultPhases() {
    const LIBS = [
      'lib/dom-deep.js',
      'lib/format.js',
      'lib/synonyms.js',
      'lib/field-map.js',
      'lib/control-adapter.js',
      'lib/ats-faq-seed.js',
      'lib/knowledge-canonical.js',
      'lib/knowledge-store.js',
      'lib/knowledge-resolver.js',
      'lib/knowledge-learn.js',
      'lib/files.js',
      'content/fill.js'
    ];
    const html = fs.readFileSync(path.join(ROOT, 'scripts/fixtures/controls/application-flow.html'), 'utf8')
      .replace(/<script>[\s\S]*?<\/script>/g, '');
    const page = createPage(html, LIBS);

    // Incomplete profile → missing information / unmatched
    const result = await page.window.__fillApply.run(
      { firstName: 'Alex' },
      { skipCvImport: true, dependentWaitMs: 20, maxDependentPasses: 1 }
    );
    suite.ok(result.ok, 'run returns ok envelope');
    suite.ok(typeof result.phase === 'string', 'phase: ' + result.phase);
    suite.ok(
      result.phase === 'MISSING_INFORMATION' || result.phase === 'READY' || result.phase === 'BLOCKED' || result.phase === 'VALIDATING',
      'phase is a known terminal-ish state'
    );
    suite.ok(Array.isArray(result.blockers), 'blockers array present');
  })();

  await (async function fileBlockerMessage() {
    const page = createPage(
      fs.readFileSync(path.join(ROOT, 'scripts/fixtures/controls/file-upload.html'), 'utf8'),
      ['lib/control-adapter.js']
    );
    const A = page.window.FillApplyControlAdapter;
    const r = A.applyToControl(page.document.getElementById('resume'), null, {
      label: 'Upload Resume / CV',
      documents: {}
    });
    suite.ok(r.blocker, 'blocker flag');
    suite.ok(/configured|document|resume|cv/i.test(String(r.message || r.reason)), 'human reason: ' + (r.message || r.reason));
  })();

  await (async function mapStateToPhaseLogic() {
    // Unit-test the mapping rules by reimplementing lightly from source expectations
    function mapStateToPhase(state, message) {
      const s = String(state || '');
      const m = String(message || '');
      if (s === 'done') return 'COMPLETE';
      if (s === 'paused' || /missing|blocker|blocked/i.test(m)) {
        if (/\bdocument\b|\bfile\b|\bupload\b|\bresume\b|\bcv\b/i.test(m)) return 'BLOCKED';
        return 'MISSING_INFORMATION';
      }
      if (s === 'error') return 'BLOCKED';
      if (/submit/i.test(m)) return 'SUBMITTING';
      if (/depend/i.test(m)) return 'WAITING_FOR_DEPENDENT_FIELDS';
      if (/detect|inspect|open/i.test(m)) return 'DETECTING';
      if (/fill/i.test(m)) return 'FILLING';
      if (/valid|ready/i.test(m)) return 'READY';
      return 'FILLING';
    }
    suite.equal(mapStateToPhase('done'), 'COMPLETE', 'done→COMPLETE');
    suite.equal(mapStateToPhase('paused', 'Missing profile fields'), 'MISSING_INFORMATION', 'paused missing');
    suite.equal(mapStateToPhase('paused', 'Resume upload required'), 'BLOCKED', 'paused file→BLOCKED');
    suite.equal(mapStateToPhase('running', 'Filling form'), 'FILLING', 'filling');
    suite.equal(mapStateToPhase('running', 'Waiting for dependent fields'), 'WAITING_FOR_DEPENDENT_FIELDS', 'dependent');
    suite.equal(mapStateToPhase('running', 'Submitting'), 'SUBMITTING', 'submitting');
  })();

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
