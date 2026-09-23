/**
 * Zahid-as-default fresh init (1.26.6); Mock demoted; Create/Reset restores seed.
 *
 * Run: node scripts/smoke-profile-init.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./test-harness');

const suite = createSuite('smoke-profile-init');
const ROOT = path.join(__dirname, '..');

function makePage(opts) {
  opts = opts || {};
  const { JSDOM } = require('jsdom');
  const bag = {};
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://jobs.example.com/'
  });
  const window = dom.window;
  window.chrome = {
    storage: {
      local: {
        get: function (keys, cb) {
          const out = {};
          let list;
          if (Array.isArray(keys)) list = keys;
          else if (keys && typeof keys === 'object') list = Object.keys(keys);
          else list = [keys];
          list.forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(bag, k)) out[k] = bag[k];
          });
          cb(out);
        },
        set: function (obj, cb) {
          Object.keys(obj || {}).forEach(function (k) {
            bag[k] = obj[k];
          });
          if (cb) cb();
        },
        remove: function (keys, cb) {
          (Array.isArray(keys) ? keys : [keys]).forEach(function (k) {
            delete bag[k];
          });
          if (cb) cb();
        }
      }
    },
    runtime: { lastError: null }
  };
  if (opts.withSeed !== false) {
    window.eval(fs.readFileSync(path.join(ROOT, 'lib/private-zahid-seed.js'), 'utf8'));
  }
  window.eval(fs.readFileSync(path.join(ROOT, 'lib/profile.js'), 'utf8'));
  return { window: window, bag: bag, Profile: window.FillApplyProfile };
}

(async function main() {
  await (async function freshInitSeedsZahid() {
    const ctx = makePage();
    const P = ctx.Profile;
    suite.ok(P, 'profile module loaded');
    const list = await P.listProfiles();
    const names = list.map(function (p) {
      return String(p.name || '').toLowerCase();
    });
    suite.ok(names.some(function (n) { return n === 'zahid' || n === 'zahid general'; }), 'fresh init auto-seeds Zahid');
    suite.ok(!names.some(function (n) { return n === 'mock'; }), 'fresh init does not auto-seed Mock as built-in');
    const activeId = await P.getActiveProfileId();
    const active = list.filter(function (p) { return p.id === activeId; })[0];
    suite.ok(active, 'active profile exists');
    suite.ok(
      P.isZahidName ? P.isZahidName(active.name) : /zahid/i.test(active.name),
      'fresh init activates Zahid (not Mock)'
    );
    suite.ok(activeId === 'zahid' || /zahid/i.test(active.name), 'extension opens with Zahid as default active');
    const profile = await P.getProfile();
    suite.ok(/czahidali\.accacma@gmail\.com/i.test(String(profile.email || '')), 'active email is Zahid gmail');
    suite.ok(/Chaudhry/i.test(String(profile.firstName || '')), 'firstName Chaudhry');
    suite.ok(!/alex\.rivera@example\.com/i.test(String(profile.email || '')), 'active is not Mock Alex');
  })();

  await (async function createResetRestoresSeed() {
    const ctx = makePage();
    const P = ctx.Profile;
    await P.listProfiles();
    // Create Mock explicitly then switch away / reset Zahid
    if (P.ensureMockProfile) await P.ensureMockProfile();
    const list1 = await P.listProfiles();
    const mock = list1.filter(function (p) {
      return P.isMockName ? P.isMockName(p.name) : String(p.name).toLowerCase() === 'mock';
    })[0];
    suite.ok(mock, 'Mock can still be created explicitly');
    await P.setActiveProfile(mock.id);
    suite.equal(await P.getActiveProfileId(), mock.id, 'explicit Mock selection works');

    const zahid = await P.createZahidGeneralProfile();
    suite.ok(zahid && zahid.id, 'Create/Reset Zahid returns profile');
    suite.ok(
      P.isZahidName ? P.isZahidName(zahid.name) : /zahid/i.test(zahid.name),
      'Create/Reset names profile Zahid'
    );
    suite.equal(await P.getActiveProfileId(), zahid.id, 'Create/Reset Zahid activates immediately');
    const fields = await P.getProfile();
    suite.ok(/czahidali\.accacma@gmail\.com/i.test(String(fields.email || '')), 'Reset restores Zahid gmail seed');

    const list2 = await P.listProfiles();
    suite.ok(
      list2.some(function (p) {
        return P.isMockName ? P.isMockName(p.name) : String(p.name).toLowerCase() === 'mock';
      }),
      'Mock is kept after Create/Reset Zahid when previously created'
    );
  })();

  await (async function preserveExplicitMockSelection() {
    const ctx = makePage();
    const P = ctx.Profile;
    await P.listProfiles();
    if (P.ensureMockProfile) await P.ensureMockProfile();
    const list = await P.listProfiles();
    const mock = list.filter(function (p) {
      return P.isMockName ? P.isMockName(p.name) : String(p.name).toLowerCase() === 'mock';
    })[0];
    await P.setActiveProfile(mock.id);
    const again = await P.listProfiles();
    const activeId = await P.getActiveProfileId();
    suite.equal(activeId, mock.id, 'explicit Mock selection persists across reads');
    const activeMeta = again.filter(function (p) { return p.id === activeId; })[0];
    suite.ok(P.isMockName(activeMeta.name), 'active remains Mock until user switches');
  })();

  await (async function ensureDefaultProfilesForce() {
    const ctx = makePage();
    const P = ctx.Profile;
    await P.listProfiles();
    if (P.ensureMockProfile) await P.ensureMockProfile();
    const list = await P.listProfiles();
    const mock = list.filter(function (p) {
      return P.isMockName(p.name);
    })[0];
    await P.setActiveProfile(mock.id);
    if (P.ensureDefaultProfiles) {
      await P.ensureDefaultProfiles({ forceZahidActive: true });
      const active = await P.getActiveProfileMeta();
      suite.ok(P.isZahidName(active.name), 'forceZahidActive switches to Zahid');
      const profile = await P.getProfile();
      suite.ok(/czahidali\.accacma@gmail\.com/i.test(String(profile.email || '')), 'forced Zahid has gmail');
    } else {
      suite.ok(false, 'ensureDefaultProfiles exported');
    }
  })();

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
