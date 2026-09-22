'use strict';
const { createPage, createSuite } = require('./test-harness');
const suite = createSuite('smoke-qb-load-on-fill');
const LIBS = [
  'lib/dom-deep.js','lib/format.js','lib/synonyms.js','lib/field-map.js',
  'lib/control-adapter.js','lib/ats-faq-seed.js','lib/knowledge-canonical.js',
  'lib/knowledge-policy.js','lib/knowledge-store.js','lib/knowledge-resolver.js',
  'lib/knowledge-learn.js','lib/question-bank-store.js','lib/files.js','lib/profile.js','content/fill.js'
];
(async function () {
  const page = createPage(
    `<form id="application-form">
      <label>Are you open to weekend shifts? <input id="wk" name="weekend" /></label>
      <label>Email <input type="email" id="em" name="email" /></label>
    </form>`,
    LIBS
  );
  // Fake chrome.storage.local so Options→content inject path works
  const bag = {};
  page.window.chrome = {
    storage: {
      local: {
        get: function (keys, cb) {
          const out = {};
          (Array.isArray(keys) ? keys : [keys]).forEach(function (k) {
            if (bag[k] != null) out[k] = bag[k];
          });
          cb(out);
        },
        set: function (obj, cb) {
          Object.assign(bag, obj);
          cb && cb();
        }
      }
    },
    runtime: { lastError: null }
  };
  // Re-bind QB storage by re-eval? Upsert uses closure hasChromeStorage from load time.
  // Simpler: upsert in memory then fill (load must not wipe)
  await page.window.FillApplyQuestionBank.upsert({
    question: 'Are you open to weekend shifts?',
    answer: 'No',
    aliases: ['Weekend availability']
  });
  suite.equal(page.window.FillApplyQuestionBank.list().length, 1, 'QB has 1 record');
  await page.window.__fillApply.run({ email: 'alex.sample@example.com' }, { formWaitMs: 50 });
  suite.equal(page.document.getElementById('em').value, 'alex.sample@example.com', 'email filled');
  suite.equal(page.document.getElementById('wk').value, 'No', 'Question Bank answer filled');
  suite.finish();
})().catch((e) => { console.error(e); process.exit(1); });
