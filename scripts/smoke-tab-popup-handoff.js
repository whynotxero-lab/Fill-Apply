/**
 * Tab handoff picker + opener→child run-target follow (slice 1) + Apply modal root.
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
  const tabCreatedListeners = [];
  const windowCreatedListeners = [];
  const sandbox = {
    chrome: {
      tabs: {
        query: async function () {
          return [];
        },
        get: async function () {
          return null;
        },
        update: async function () {
          return null;
        },
        onUpdated: { addListener: function () {}, removeListener: function () {} },
        onCreated: {
          addListener: function (fn) {
            tabCreatedListeners.push(fn);
          },
          removeListener: function (fn) {
            const i = tabCreatedListeners.indexOf(fn);
            if (i >= 0) tabCreatedListeners.splice(i, 1);
          },
          _emit: function (tab) {
            tabCreatedListeners.slice().forEach(function (fn) {
              try {
                fn(tab);
              } catch (_e) {}
            });
          }
        }
      },
      windows: {
        onCreated: {
          addListener: function (fn) {
            windowCreatedListeners.push(fn);
          },
          removeListener: function (fn) {
            const i = windowCreatedListeners.indexOf(fn);
            if (i >= 0) windowCreatedListeners.splice(i, 1);
          },
          _emit: function (win) {
            windowCreatedListeners.slice().forEach(function (fn) {
              try {
                fn(win);
              } catch (_e) {}
            });
          }
        }
      },
      scripting: { executeScript: async function () { return []; } },
      runtime: { lastError: null, sendMessage: function () {} },
      notifications: { create: function () {} },
      storage: {
        session: { get: function (_k, cb) { cb({}); }, set: function (_o, cb) { if (cb) cb(); } },
        local: { get: function (_k, cb) { cb({}); }, set: function (_o, cb) { if (cb) cb(); } }
      }
    },
    globalThis: null,
    self: null
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  try {
    Function('chrome', 'globalThis', 'self', src)(sandbox.chrome, sandbox, sandbox);
  } catch (e) {
    // Runner may throw on missing deps — helpers often still attach.
  }
  sandbox.__tabCreatedListeners = tabCreatedListeners;
  sandbox.__windowCreatedListeners = windowCreatedListeners;
  return sandbox;
}

(async function main() {
  // --- Pure pickApplyHandoffTab ---
  const sandbox = loadRunnerPick();
  const runner = sandbox.FillApplyRunner;
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

  // --- resolveRunTargetAfterOpenerClick (opener → child becomes run target) ---
  suite.ok(
    typeof runner.resolveRunTargetAfterOpenerClick === 'function',
    'resolveRunTargetAfterOpenerClick exported'
  );
  const resolved = runner.resolveRunTargetAfterOpenerClick(
    [
      { id: 100, url: 'https://zahid-jobpool.vercel.app/fill-apply', openerTabId: null },
      { id: 101, url: 'https://careers.example.com/apply/1', openerTabId: 100 }
    ],
    100,
    { 100: true }
  );
  suite.ok(resolved && resolved.id === 101, 'opener→child tab becomes run target');

  // Contamination regression: child must NOT be in knownIds when searching
  const childHidden = runner.pickApplyHandoffTab(
    [
      { id: 100, url: 'https://zahid-jobpool.vercel.app/fill-apply' },
      { id: 200, url: 'https://ats.example.com/job/9', openerTabId: 100 }
    ],
    100,
    { 100: true, 200: true }
  );
  suite.equal(childHidden, null, 'knownIds including child hides it (do not snapshot-merge after click)');
  const childVisible = runner.pickApplyHandoffTab(
    [
      { id: 100, url: 'https://zahid-jobpool.vercel.app/fill-apply' },
      { id: 200, url: 'https://ats.example.com/job/9', openerTabId: 100 }
    ],
    100,
    { 100: true }
  );
  suite.ok(childVisible && childVisible.id === 200, 'pre-click knownIds still finds child');

  // --- Event arming: tabs.onCreated switches active run target ---
  suite.ok(typeof runner.armOpenerTabFollow === 'function', 'armOpenerTabFollow exported');
  suite.ok(typeof runner.consumeFollowedChildTab === 'function', 'consumeFollowedChildTab exported');
  suite.ok(typeof runner.getActiveRunTargetTabId === 'function', 'getActiveRunTargetTabId exported');

  runner.disarmOpenerTabFollow();
  runner.armOpenerTabFollow(100, { 100: true });
  suite.equal(runner.getActiveRunTargetTabId(), 100, 'armed target starts as opener');
  suite.ok(sandbox.__tabCreatedListeners.length >= 1, 'tabs.onCreated listener registered');

  sandbox.chrome.tabs.onCreated._emit({
    id: 777,
    url: 'https://boards.greenhouse.io/acme/jobs/99',
    openerTabId: 100
  });
  suite.equal(runner.consumeFollowedChildTab(), 777, 'onCreated child becomes followed tab');
  suite.equal(runner.getActiveRunTargetTabId(), 777, 'active run target switches to child');
  const st = runner.getOpenerFollowState();
  suite.ok(st && st.childOpenerMatch === true, 'child marked opener-match');

  // Ignore JobPool hub re-opens without opener match
  runner.disarmOpenerTabFollow();
  runner.armOpenerTabFollow(100, { 100: true });
  sandbox.chrome.tabs.onCreated._emit({
    id: 778,
    url: 'https://zahid-jobpool.vercel.app/fill-apply',
    openerTabId: null
  });
  suite.equal(runner.consumeFollowedChildTab(), null, 'does not adopt unrelated hub tab');

  // windows.onCreated → query tabs in popup window
  runner.disarmOpenerTabFollow();
  runner.armOpenerTabFollow(50, { 50: true });
  sandbox.chrome.tabs.query = async function (q) {
    if (q && q.windowId === 9) {
      return [{ id: 888, url: 'https://login.example.com/oauth', openerTabId: 50, windowId: 9 }];
    }
    return [];
  };
  sandbox.chrome.windows.onCreated._emit({ id: 9, type: 'popup' });
  // allow microtask from Promise in listener
  await new Promise(function (r) {
    setTimeout(r, 30);
  });
  suite.equal(runner.consumeFollowedChildTab(), 888, 'popup window tab becomes run target');
  runner.disarmOpenerTabFollow();

  // pickEmployerTabAfterHubOpen
  suite.ok(typeof runner.pickEmployerTabAfterHubOpen === 'function', 'pickEmployerTabAfterHubOpen exported');
  sandbox.chrome.tabs.query = async function () {
    return [
      { id: 1, url: 'https://zahid-jobpool.vercel.app/fill-apply', active: true },
      { id: 2, url: 'https://careers.riyadhair.com/icims/login', openerTabId: 1, active: false }
    ];
  };
  const emp = await runner.pickEmployerTabAfterHubOpen(1);
  suite.ok(emp && emp.id === 2, 'pickEmployerTabAfterHubOpen prefers opener child employer');

  // Source markers for slice 1 wiring
  const runnerSrc = fs.readFileSync(path.join(ROOT, 'runner/runner.js'), 'utf8');
  suite.ok(/tabs\.onCreated\.addListener/.test(runnerSrc), 'runner listens tabs.onCreated');
  suite.ok(/windows\.onCreated\.addListener/.test(runnerSrc), 'runner listens windows.onCreated');
  suite.ok(
    /do NOT merge a fresh full tab snapshot into knownTabIds/.test(runnerSrc),
    'hop loop documents knownTabIds fix'
  );
  suite.ok(/JobPool hub kept in background/.test(runnerSrc), 'hub kept message present');

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
