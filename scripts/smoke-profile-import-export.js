/**
 * Profile Import / Export — mandatory coverage for Fill & Apply 1.18.0
 *
 * - fresh init (Mock + empty Zahid shell; Zahid active)
 * - import Zahid from private fill-apply-profile JSON
 * - immediate use after import
 * - knowledge + aliases restored
 * - survives reload (new page / fresh module eval, same storage bag)
 * - update does not reset (ensure* without reset preserves data)
 * - Mock preserved
 * - export → fresh → import equivalent
 * - no private data in package
 * - invalid JSON safe
 * - unsupported schema safe
 * - export excludes secrets
 *
 * Run: node scripts/smoke-profile-import-export.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./test-harness');

const suite = createSuite('smoke-profile-import-export');
const ROOT = path.join(__dirname, '..');
const PRIVATE_ZAHID = path.join('/workspace/private-profiles/zahid-profile.json');

function loadScript(window, rel) {
  const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  window.eval(source);
}

function makePage() {
  const { JSDOM } = require('jsdom');
  const bag = {};
  const memoryIdb = {
    knowledge: {},
    aliases: {},
    events: {},
    history: {}
  };

  // Minimal IndexedDB stub so knowledge-store persists across "reloads" of the same bag.
  function FakeRequest(result) {
    this.result = result;
    this.onerror = null;
    this.onsuccess = null;
    this.onupgradeneeded = null;
    this.oncomplete = null;
  }
  function flush(req, prop) {
    setTimeout(function () {
      if (typeof req[prop] === 'function') req[prop]({ target: req });
    }, 0);
  }

  const fakeIndexedDB = {
    open: function () {
      const req = new FakeRequest({
        objectStoreNames: {
          contains: function () {
            return true;
          }
        },
        transaction: function (storeName, mode) {
          const store = {
            put: function (record) {
              memoryIdb[storeName] = memoryIdb[storeName] || {};
              memoryIdb[storeName][record.id] = record;
              return new FakeRequest(record);
            },
            delete: function (id) {
              if (memoryIdb[storeName]) delete memoryIdb[storeName][id];
              return new FakeRequest(undefined);
            },
            getAll: function () {
              const all = Object.keys(memoryIdb[storeName] || {}).map(function (k) {
                return memoryIdb[storeName][k];
              });
              const r = new FakeRequest(all);
              flush(r, 'onsuccess');
              return r;
            }
          };
          const tx = {
            objectStore: function () {
              return store;
            },
            oncomplete: null,
            onerror: null
          };
          setTimeout(function () {
            if (typeof tx.oncomplete === 'function') tx.oncomplete();
          }, 0);
          return tx;
        }
      });
      setTimeout(function () {
        // pretend already at version
        flush(req, 'onsuccess');
      }, 0);
      return req;
    }
  };

  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'chrome-extension://fillapplytest/options/options.html'
  });
  const window = dom.window;
  window.indexedDB = fakeIndexedDB;
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
    runtime: {
      lastError: null,
      getManifest: function () {
        return { version: '1.18.0' };
      }
    }
  };

  loadScript(window, 'lib/profile.js');
  loadScript(window, 'lib/knowledge-canonical.js');
  loadScript(window, 'lib/knowledge-store.js');
  loadScript(window, 'lib/profile-io.js');

  return {
    window: window,
    bag: bag,
    memoryIdb: memoryIdb,
    Profile: window.FillApplyProfile,
    IO: window.FillApplyProfileIO,
    Knowledge: window.FillApplyKnowledgeStore
  };
}

/** Simulate extension reload: new JS realm, same chrome.storage + IDB memory. */
function reloadPage(prev) {
  const ctx = makePage();
  // Reuse storage bag
  Object.keys(prev.bag).forEach(function (k) {
    ctx.bag[k] = prev.bag[k];
  });
  // Reuse IDB memory
  Object.keys(prev.memoryIdb).forEach(function (store) {
    ctx.memoryIdb[store] = prev.memoryIdb[store];
  });
  return ctx;
}

function readPrivateZahid() {
  suite.ok(fs.existsSync(PRIVATE_ZAHID), 'private Zahid fixture exists at ' + PRIVATE_ZAHID);
  return JSON.parse(fs.readFileSync(PRIVATE_ZAHID, 'utf8'));
}

function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

(async function main() {
  /* ------------------------------------------------------------------ */
  /* Package must not contain real Zahid PII                             */
  /* ------------------------------------------------------------------ */
  await (async function noPrivateDataInPackage() {
    const markers = ['czahidali.accacma@gmail.com', 'chaudhryzahidali', '504131857', 'Chaudhary Zahid Ali'];
    const scanFiles = [
      'lib/profile.js',
      'profiles/zahid-general.json',
      'lib/profile-io.js',
      'manifest.json',
      'options/options.js'
    ];
    scanFiles.forEach(function (rel) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      markers.forEach(function (m) {
        suite.ok(text.indexOf(m) === -1, rel + ' has no private marker: ' + m);
      });
    });
    const publicZahid = JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles/zahid-general.json'), 'utf8'));
    suite.equal(publicZahid.email || '', '', 'public zahid-general.json email is empty');
    suite.equal(publicZahid.firstName || '', '', 'public zahid-general.json firstName is empty');
  })();

  /* ------------------------------------------------------------------ */
  /* Fresh init                                                          */
  /* ------------------------------------------------------------------ */
  let ctx = makePage();
  await (async function freshInit() {
    const P = ctx.Profile;
    const list = await P.listProfiles();
    const names = list.map(function (p) {
      return String(p.name || '').toLowerCase();
    });
    suite.ok(names.some(function (n) { return n === 'zahid' || n === 'zahid general'; }), 'fresh init includes Zahid');
    suite.ok(names.some(function (n) { return n === 'mock'; }), 'fresh init includes Mock');
    const active = await P.getActiveProfileMeta();
    suite.ok(P.isMockName ? P.isMockName(active.name) : /^mock$/i.test(active.name), 'fresh init activates Mock');
    const zahidMeta = list.filter(function (p) {
      return P.isZahidName ? P.isZahidName(p.name) : /zahid/i.test(p.name);
    })[0];
    suite.ok(zahidMeta, 'Zahid shell exists on fresh init');
    const profile = await P.getProfileById(zahidMeta.id);
    suite.equal(profile.email || '', '', 'fresh Zahid shell has no email PII');
    suite.equal(profile.firstName || '', '', 'fresh Zahid shell has no firstName PII');
  })();

  /* ------------------------------------------------------------------ */
  /* Import Zahid + immediate use + knowledge                             */
  /* ------------------------------------------------------------------ */
  const privatePayload = readPrivateZahid();
  suite.equal(privatePayload.format, 'fill-apply-profile', 'private fixture format');
  suite.equal(privatePayload.schemaVersion, 1, 'private fixture schemaVersion');

  // Seed knowledge into the private payload for restore tests
  const enriched = JSON.parse(JSON.stringify(privatePayload));
  enriched.knowledge = {
    version: 1,
    records: [
      {
        canonicalKey: 'willing_to_relocate',
        fieldType: 'boolean',
        value: 'Yes',
        aliases: ['Open to relocation', 'Can you relocate?', 'Relocation OK'],
        status: 'confirmed',
        source: 'import'
      },
      {
        canonicalKey: 'notice_period',
        fieldType: 'string',
        value: 'I can start immediately',
        aliases: ['Availability', 'When can you start'],
        status: 'confirmed',
        source: 'import'
      }
    ]
  };

  await (async function importZahid() {
    const result = await ctx.IO.importPayload(enriched, { activate: true });
    suite.ok(result.ok, 'import Zahid ok: ' + JSON.stringify(result.errors || []));
    suite.ok(result.activated, 'import activates profile');
    suite.ok(result.knowledgeImported >= 2, 'knowledge facts imported (' + result.knowledgeImported + ')');

    const profile = await ctx.Profile.getProfile();
    suite.equal(profile.email, 'czahidali.accacma@gmail.com', 'imported email usable immediately');
    suite.equal(profile.fullName, 'Chaudhary Zahid Ali', 'imported fullName');
    suite.ok(profile.city === 'Khobar' || profile.city === 'Riyadh', 'imported city (got ' + profile.city + ')');
    suite.ok(
      Array.isArray(profile.experienceEntries) && profile.experienceEntries.length >= 7,
      'imported experience entries'
    );

    const active = await ctx.Profile.getActiveProfileMeta();
    suite.ok(ctx.Profile.isZahidName(active.name), 'Zahid active after import');

    // Knowledge + aliases
    await sleep(20);
    const facts = await ctx.Knowledge.listKnowledge(await ctx.Profile.getActiveProfileId());
    const relocate = facts.filter(function (r) {
      return r.canonicalKey === 'willing_to_relocate';
    })[0];
    suite.ok(relocate, 'willing_to_relocate knowledge present');
    suite.ok(
      relocate && Array.isArray(relocate.aliases) && relocate.aliases.length >= 2,
      'aliases restored on knowledge record'
    );
    suite.equal(relocate && relocate.value, 'Yes', 'knowledge value restored');
  })();

  /* ------------------------------------------------------------------ */
  /* Survives reload                                                     */
  /* ------------------------------------------------------------------ */
  await (async function survivesReload() {
    ctx = reloadPage(ctx);
    await sleep(20);
    const profile = await ctx.Profile.getProfile();
    suite.equal(profile.email, 'czahidali.accacma@gmail.com', 'email survives reload');
    suite.equal(profile.nationality, 'Pakistan', 'nationality survives reload');
    const active = await ctx.Profile.getActiveProfileMeta();
    suite.ok(ctx.Profile.isZahidName(active.name), 'Zahid still active after reload');

    const facts = await ctx.Knowledge.listKnowledge(await ctx.Profile.getActiveProfileId());
    suite.ok(
      facts.some(function (r) {
        return r.canonicalKey === 'notice_period';
      }),
      'knowledge survives reload'
    );
  })();

  /* ------------------------------------------------------------------ */
  /* Update does not reset / Mock preserved                              */
  /* ------------------------------------------------------------------ */
  await (async function updateDoesNotReset() {
    // Simulate "update" startup paths: ensureMock + ensureZahid without reset
    await ctx.Profile.ensureMockProfile();
    await ctx.Profile.ensureZahidProfile({ activate: false, reset: false });
    if (ctx.Profile.ensureDefaultProfiles) {
      // Without force/fresh flags this must not wipe imported data
      await ctx.Profile.ensureDefaultProfiles({});
    }
    const profile = await ctx.Profile.getProfile();
    suite.equal(profile.email, 'czahidali.accacma@gmail.com', 'ensure* without reset keeps imported email');
    const list = await ctx.Profile.listProfiles();
    suite.ok(
      list.some(function (p) {
        return ctx.Profile.isMockName(p.name);
      }),
      'Mock preserved across ensure*'
    );
    // Explicit selection of Mock must stick
    const mock = list.filter(function (p) {
      return ctx.Profile.isMockName(p.name);
    })[0];
    await ctx.Profile.setActiveProfile(mock.id);
    await ctx.Profile.ensureZahidProfile({ activate: false, reset: false });
    suite.equal(await ctx.Profile.getActiveProfileId(), mock.id, 'explicit Mock selection not bounced to Zahid');
  })();

  /* ------------------------------------------------------------------ */
  /* Export → fresh → import equivalent                                  */
  /* ------------------------------------------------------------------ */
  await (async function exportFreshImportEquivalent() {
    // Switch back to Zahid and export
    const list = await ctx.Profile.listProfiles();
    const zahid = list.filter(function (p) {
      return ctx.Profile.isZahidName(p.name);
    })[0];
    await ctx.Profile.setActiveProfile(zahid.id);
    const bundled = await ctx.IO.exportActiveProfile();
    suite.equal(bundled.payload.format, 'fill-apply-profile', 'export format');
    suite.equal(bundled.payload.schemaVersion, 1, 'export schemaVersion');
    suite.ok(/zahid.*\.json$/i.test(bundled.filename) || /profile\.json$/i.test(bundled.filename), 'export filename');
    suite.equal(bundled.payload.profile.email, 'czahidali.accacma@gmail.com', 'export includes profile email');
    suite.ok(
      bundled.payload.knowledge &&
        Array.isArray(bundled.payload.knowledge.records) &&
        bundled.payload.knowledge.records.length >= 1,
      'export includes accumulated knowledge'
    );

    // Fresh extension storage — Mock is active by default; Zahid shell stays empty until import
    const fresh = makePage();
    await fresh.Profile.listProfiles();
    const freshList = await fresh.Profile.listProfiles();
    const freshZahid = freshList.filter(function (p) {
      return fresh.Profile.isZahidName
        ? fresh.Profile.isZahidName(p.name)
        : /zahid/i.test(p.name);
    })[0];
    suite.ok(freshZahid, 'fresh page has Zahid shell');
    const before = await fresh.Profile.getProfileById(freshZahid.id);
    suite.equal(before.email || '', '', 'fresh profile empty before import');
    const imported = await fresh.IO.importPayload(bundled.payload, { activate: true });
    suite.ok(imported.ok, 're-import ok');
    const after = await fresh.Profile.getProfile();
    suite.equal(after.email, bundled.payload.profile.email, 'round-trip email');
    suite.equal(after.fullName, bundled.payload.profile.fullName, 'round-trip fullName');
    suite.equal(after.yearsExperience, bundled.payload.profile.yearsExperience, 'round-trip yearsExperience');
    await sleep(20);
    const facts = await fresh.Knowledge.listKnowledge(await fresh.Profile.getActiveProfileId());
    suite.ok(facts.length >= 1, 'round-trip knowledge count ' + facts.length);
  })();

  /* ------------------------------------------------------------------ */
  /* Invalid JSON / unsupported schema — no corruption                   */
  /* ------------------------------------------------------------------ */
  await (async function invalidAndUnsupportedSafe() {
    const page = makePage();
    await page.IO.importPayload(enriched, { activate: true });
    const emailBefore = (await page.Profile.getProfile()).email;

    const badJson = await page.IO.importPayload('{not-json', { activate: true });
    suite.ok(!badJson.ok, 'invalid JSON rejected');
    suite.ok(!badJson.imported, 'invalid JSON not marked imported');
    suite.equal((await page.Profile.getProfile()).email, emailBefore, 'invalid JSON did not corrupt profile');

    const badSchema = await page.IO.importPayload(
      {
        format: 'fill-apply-profile',
        schemaVersion: 999,
        profile: { firstName: 'Hacker', email: 'hack@evil.test' },
        knowledge: { records: [] }
      },
      { activate: true }
    );
    suite.ok(!badSchema.ok, 'unsupported schema rejected');
    suite.ok(
      (badSchema.errors || []).some(function (e) {
        return /schemaVersion|Unsupported/i.test(e);
      }),
      'unsupported schema error is clear'
    );
    suite.equal((await page.Profile.getProfile()).email, emailBefore, 'unsupported schema did not corrupt');

    const badFormat = await page.IO.importPayload(
      {
        format: 'other-tool-profile',
        schemaVersion: 1,
        profile: { email: 'x@y.z' }
      },
      { activate: true }
    );
    suite.ok(!badFormat.ok, 'unsupported format rejected');
    suite.equal((await page.Profile.getProfile()).email, emailBefore, 'bad format did not corrupt');
  })();

  /* ------------------------------------------------------------------ */
  /* Export excludes secrets                                             */
  /* ------------------------------------------------------------------ */
  await (async function exportExcludesSecrets() {
    const page = makePage();
    await page.IO.importPayload(enriched, { activate: true });
    // Poison active profile with secret-like fields (should be stripped on export)
    const poisoned = await page.Profile.getProfile();
    poisoned.password = 'super-secret';
    poisoned.oauth = { accessToken: 'tok_abc', refreshToken: 'ref_xyz' };
    poisoned.captcha = { solution: 'bypass' };
    poisoned.customAnswers = Object.assign({}, poisoned.customAnswers, {
      apiKey: 'should-not-export'
    });
    await page.Profile.saveProfile(poisoned);

    const bundled = await page.IO.exportActiveProfile();
    const json = bundled.json;
    suite.ok(json.indexOf('super-secret') === -1, 'export omits password value');
    suite.ok(json.indexOf('tok_abc') === -1, 'export omits accessToken');
    suite.ok(json.indexOf('ref_xyz') === -1, 'export omits refreshToken');
    suite.ok(json.indexOf('bypass') === -1, 'export omits captcha solution');
    suite.ok(json.indexOf('should-not-export') === -1, 'export omits apiKey customAnswer');
    suite.ok(!Object.prototype.hasOwnProperty.call(bundled.payload.profile, 'password'), 'no password key');
    suite.ok(!Object.prototype.hasOwnProperty.call(bundled.payload.profile, 'oauth'), 'no oauth key');
    // Legitimate data still present
    suite.equal(bundled.payload.profile.email, 'czahidali.accacma@gmail.com', 'export still has real profile fields');
  })();

  /* ------------------------------------------------------------------ */
  /* Create/Reset Zahid is explicit and does not run on "startup"        */
  /* ------------------------------------------------------------------ */
  await (async function createResetIsExplicit() {
    const page = makePage();
    await page.IO.importPayload(enriched, { activate: true });
    suite.equal((await page.Profile.getProfile()).email, 'czahidali.accacma@gmail.com', 'pre-reset has data');
    // Startup-like ensure must NOT wipe
    await page.Profile.ensureZahidProfile({ reset: false });
    suite.equal((await page.Profile.getProfile()).email, 'czahidali.accacma@gmail.com', 'startup ensure does not reset');
    // Explicit user action resets to empty public shell
    await page.Profile.createZahidGeneralProfile();
    const after = await page.Profile.getProfile();
    suite.equal(after.email || '', '', 'Create/Reset Zahid restores empty public shell');
    suite.ok(page.Profile.isZahidName((await page.Profile.getActiveProfileMeta()).name), 'Create/Reset activates Zahid');
    suite.ok(
      (await page.Profile.listProfiles()).some(function (p) {
        return page.Profile.isMockName(p.name);
      }),
      'Mock kept after Create/Reset Zahid'
    );
  })();

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
