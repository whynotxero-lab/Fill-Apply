/**
 * Zahid + Mock profile init, Create/Reset Zahid activation, selection persistence.
 *
 * Run: node scripts/smoke-profile-init.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./test-harness');

const suite = createSuite('smoke-profile-init');
const ROOT = path.join(__dirname, '..');

function makePage() {
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
  const source = fs.readFileSync(path.join(ROOT, 'lib/profile.js'), 'utf8');
  window.eval(source);
  return { window: window, bag: bag, Profile: window.FillApplyProfile };
}

(async function main() {
  await (async function freshInit() {
    const ctx = makePage();
    const P = ctx.Profile;
    suite.ok(P, 'profile module loaded');
    const list = await P.listProfiles();
    const names = list.map(function (p) {
      return String(p.name || '').toLowerCase();
    });
    suite.ok(names.some(function (n) { return n === 'zahid' || n === 'zahid general'; }), 'fresh init includes Zahid');
    suite.ok(names.some(function (n) { return n === 'mock'; }), 'fresh init includes Mock');
    const activeId = await P.getActiveProfileId();
    const active = list.filter(function (p) { return p.id === activeId; })[0];
    suite.ok(active, 'active profile exists');
    suite.ok(
      P.isZahidName ? P.isZahidName(active.name) : /zahid/i.test(active.name),
      'fresh init activates Zahid (not Mock)'
    );
    suite.ok(activeId !== 'mock' && !/^mock$/i.test(active.name), 'extension does not open with Mock as default');
  })();

  await (async function createResetActivatesZahidKeepsMock() {
    const ctx = makePage();
    const P = ctx.Profile;
    await P.listProfiles();
    // Switch to Mock explicitly
    const list1 = await P.listProfiles();
    const mock = list1.filter(function (p) {
      return P.isMockName ? P.isMockName(p.name) : String(p.name).toLowerCase() === 'mock';
    })[0];
    suite.ok(mock, 'Mock exists before Create/Reset');
    await P.setActiveProfile(mock.id);
    suite.equal(await P.getActiveProfileId(), mock.id, 'explicit Mock selection works');

    const zahid = await P.createZahidGeneralProfile();
    suite.ok(zahid && zahid.id, 'Create/Reset Zahid returns profile');
    suite.ok(
      P.isZahidName ? P.isZahidName(zahid.name) : /zahid/i.test(zahid.name),
      'Create/Reset names profile Zahid'
    );
    suite.equal(await P.getActiveProfileId(), zahid.id, 'Create/Reset Zahid activates Zahid immediately');

    const list2 = await P.listProfiles();
    suite.ok(
      list2.some(function (p) {
        return P.isMockName ? P.isMockName(p.name) : String(p.name).toLowerCase() === 'mock';
      }),
      'Mock is kept after Create/Reset Zahid'
    );
    suite.ok(
      list2.some(function (p) {
        return P.isZahidName ? P.isZahidName(p.name) : /zahid/i.test(p.name);
      }),
      'Zahid still present (not deleted on init/reset)'
    );
  })();

  await (async function preserveExplicitSelection() {
    const ctx = makePage();
    const P = ctx.Profile;
    const list = await P.listProfiles();
    const mock = list.filter(function (p) {
      return P.isMockName ? P.isMockName(p.name) : String(p.name).toLowerCase() === 'mock';
    })[0];
    await P.setActiveProfile(mock.id);
    // Subsequent readStore / listProfiles must not bounce back to Zahid
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
    const list = await P.listProfiles();
    const mock = list.filter(function (p) {
      return P.isMockName(p.name);
    })[0];
    await P.setActiveProfile(mock.id);
    if (P.ensureDefaultProfiles) {
      await P.ensureDefaultProfiles({ forceZahidActive: true });
      const active = await P.getActiveProfileMeta();
      suite.ok(P.isZahidName(active.name), 'forceZahidActive switches to Zahid');
      const stillMock = (await P.listProfiles()).some(function (p) {
        return P.isMockName(p.name);
      });
      suite.ok(stillMock, 'force still keeps Mock');
    } else {
      suite.ok(false, 'ensureDefaultProfiles exported');
    }
  })();

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
