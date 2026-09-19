/**
 * Tab handoff picker + Apply modal root + Michael Page Apply CTA (not Save Job).
 * Run: node scripts/smoke-tab-popup-handoff.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-tab-popup-handoff');
const ROOT = path.join(__dirname, '..');

function loadRunnerPick() {
  const src = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
  // Extract pickApplyHandoffTab by evaluating a minimal stub of chrome APIs
  const sandbox = {
    chrome: {
      tabs: {
        query: async function () {
          return [];
        },
        get: async function () {
          return null;
        },
        onUpdated: { addListener: function () {}, removeListener: function () {} }
      },
      scripting: { executeScript: async function () { return []; } },
      runtime: { lastError: null, sendMessage: function () {} }
    },
    globalThis: null,
    self: null
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  // Runner attaches FillApplyRunner at end; may throw on missing deps — wrap
  try {
    Function('chrome', 'globalThis', 'self', src)(sandbox.chrome, sandbox, sandbox);
  } catch (e) {
    // Still may have attached helpers if error is late
  }
  return sandbox.FillApplyRunner || null;
}

(async function main() {
  // --- Pure pickApplyHandoffTab ---
  const runner = loadRunnerPick();
  suite.ok(runner && typeof runner.pickApplyHandoffTab === 'function', 'pickApplyHandoffTab exported');

  const opener = 10;
  const known = { 10: true, 11: true };
  const tabs = [
    { id: 10, url: 'https://www.naukrigulf.com/job-listing', openerTabId: null },
    { id: 11, url: 'https://www.naukrigulf.com/job-listing', openerTabId: null },
    { id: 42, url: 'https://www.naukrigulf.com/apply/123', openerTabId: 10 },
    { id: 40, url: 'https://boards.greenhouse.io/acme/jobs/1', openerTabId: null }
  ];
  const picked = runner.pickApplyHandoffTab(tabs, opener, known);
  suite.ok(picked && picked.id === 42, 'prefers openerTabId child apply tab');

  const picked2 = runner.pickApplyHandoffTab(
    [
      { id: 10, url: 'https://www.michaelpage.ae/job-detail/1' },
      { id: 55, url: 'https://www.michaelpage.ae/apply/candidate', openerTabId: null }
    ],
    10,
    { 10: true }
  );
  suite.ok(picked2 && picked2.id === 55, 'falls back to newest apply-like URL not in known set');

  const none = runner.pickApplyHandoffTab([{ id: 10, url: 'https://x.com' }], 10, { 10: true });
  suite.equal(none, null, 'no handoff when only opener remains');

  // --- Synonyms modal root + Apply CTA ---
  const page = createPage(
    `
    <div>
      <button id="save">Save Job</button>
      <a id="apply" href="#">Apply</a>
      <div id="noise"><input name="search" placeholder="Search jobs" /></div>
      <div role="dialog" aria-modal="true" class="modal show" id="applyModal" style="display:block;width:400px;height:300px">
        <label>First name <input name="firstName" /></label>
        <label>Email <input name="email" type="email" /></label>
        <button type="submit">Submit application</button>
      </div>
    </div>
    `,
    [
      'lib/dom-deep.js',
      'lib/synonyms.js',
      'adapters/registry.js',
      'adapters/fallback.js',
      'adapters/agencies/michaelpage.js'
    ]
  );
  const Syn = page.window.FillApplySynonyms;
  suite.ok(Syn, 'synonyms loaded');
  suite.ok(Syn.isApplyStartCta('Apply'), 'Apply is start CTA');
  suite.ok(!Syn.isApplyStartCta('Save Job'), 'Save Job is not start CTA');
  const modal = Syn.findApplicationModalRoot(page.document);
  suite.ok(modal && modal.id === 'applyModal', 'findApplicationModalRoot finds dialog');

  const MP = page.window.FillApply_michaelpageAdapter;
  suite.ok(MP && MP.findJobApplyCta, 'michaelpage adapter loaded');
  const cta = MP.findJobApplyCta(page.document);
  suite.ok(cta && /apply/i.test(cta.textContent || cta.id), 'findJobApplyCta finds Apply');
  suite.ok(cta && cta.id !== 'save', 'Apply CTA is not Save Job');

  const clicked = MP.clickJobApply(page.document);
  suite.ok(clicked && clicked.clicked, 'clickJobApply clicks Apply');

  // Modal root on MP
  suite.ok(MP.findApplicationModalRoot(page.document), 'MP findApplicationModalRoot');

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
