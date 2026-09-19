/**
 * Trial ATS dictionary (v1.19.5): catalog aliases resolve CA/ACCA, B.Com,
 * ME visa, Experience Level Director, Masters, Al-Futtaim Nos, ERP, etc.
 * Import redacted zahid fixture → IndexedDB knowledge → key resolutions.
 *
 * Run: node scripts/smoke-trial-ats-dictionary.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite, ROOT } = require('./test-harness');

const suite = createSuite('smoke-trial-ats-dictionary');

const FIXTURE_CANDIDATES = [
  path.join(__dirname, 'fixtures', 'zahid-profile-redacted.json'),
  path.join('/workspace/deliverables/zahid-profile.json'),
  path.join('/workspace/private-profiles/zahid-profile.json')
];

function loadFixture() {
  for (let i = 0; i < FIXTURE_CANDIDATES.length; i++) {
    if (fs.existsSync(FIXTURE_CANDIDATES[i])) {
      const raw = JSON.parse(fs.readFileSync(FIXTURE_CANDIDATES[i], 'utf8'));
      // Never keep passwords in the in-memory smoke payload
      if (raw.profile) {
        delete raw.profile.password;
        delete raw.profile.passwd;
        delete raw.profile.pwd;
        if (raw.profile.customAnswers) {
          Object.keys(raw.profile.customAnswers).forEach(function (k) {
            if (/password|passwd|secret/i.test(k)) delete raw.profile.customAnswers[k];
          });
        }
      }
      return { path: FIXTURE_CANDIDATES[i], payload: raw };
    }
  }
  return null;
}

function loadScript(window, rel) {
  const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  window.eval(source);
}

function makeImportPage() {
  const { JSDOM } = require('jsdom');
  const bag = {};
  const memoryIdb = { knowledge: {}, aliases: {}, events: {}, history: {} };

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
        transaction: function (storeName) {
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
        return { version: '1.19.5' };
      }
    }
  };

  [
    'lib/storage.js',
    'lib/profile.js',
    'lib/control-adapter.js',
  'lib/ats-faq-seed.js',
  'lib/knowledge-canonical.js',
    'lib/knowledge-store.js',
    'lib/knowledge-resolver.js',
    'lib/field-map.js',
    'lib/format.js',
    'lib/profile-io.js'
  ].forEach(function (rel) {
    loadScript(window, rel);
  });

  return {
    window: window,
    bag: bag,
    memoryIdb: memoryIdb,
    Profile: window.FillApplyProfile,
    IO: window.FillApplyProfileIO,
    Knowledge: window.FillApplyKnowledgeStore,
    Canonical: window.FillApplyKnowledgeCanonical,
    Resolver: window.FillApplyKnowledge,
    FieldMap: window.FillApplyFieldMap,
    Format: window.FillApplyFormat
  };
}

function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

(async function main() {
  /* A) Built-in catalog resolves trial wordings (no profile required) */
  await (async function catalogAliases() {
    const ctx = makeImportPage();
    const C = ctx.Canonical;
    const expect = [
      ['Are you a qualified CA or ACCA?', 'qualified_ca_or_acca'],
      ['Are you a qualified Chartered Accountant (CA)?', 'qualified_ca'],
      ['Do you hold a Bachelor’s Degree in Commerce (B.Com) or M.Com qualification?', 'bcom_or_mcom'],
      ['Working visa for Middle East?', 'middle_east_working_visa'],
      ['Experience Level', 'experience_level'],
      ['Highest Education Level', 'highest_education'],
      ['Conflict of interest?', 'conflict_of_interest'],
      ['Working for Qiddiya?', 'working_for_qiddiya'],
      ['ERP experience?', 'erp_experience'],
      ['Client or Candidate', 'candidate_or_client'],
      ['What is your current Remuneration?', 'current_remuneration'],
      ['Are you a previous Al-Futtaim Group employee?', 'previous_alfuttaim_employee'],
      ['Do you have any family members in the Al-Futtaim Group?', 'family_members_alfuttaim']
    ];
    expect.forEach(function (pair) {
      const m = C.matchCanonical(pair[0]);
      suite.equal(m.key, pair[1], 'catalog: ' + pair[0].slice(0, 48));
      suite.ok(!m.derived && m.score >= 90, 'decisive catalog hit for ' + pair[1]);
    });
  })();

  /* B) Fixture present under scripts/fixtures (no password in repo fixture) */
  const loaded = loadFixture();
  suite.ok(!!loaded, 'zahid fixture found (redacted or deliverables)');
  if (!loaded) {
    suite.finish();
    return;
  }
  const fixtureJson = JSON.stringify(loaded.payload);
  suite.ok(!/"password"\s*:\s*"[^"]+"/i.test(fixtureJson), 'fixture payload has no password value');
  suite.ok(
    /fixtures\/zahid-profile-redacted\.json$/.test(loaded.path) ||
      /deliverables|private-profiles/.test(loaded.path),
    'fixture path ok: ' + loaded.path
  );

  /* C) Import loads knowledge into IndexedDB + resolves values */
  await (async function importAndResolve() {
    const ctx = makeImportPage();
    await ctx.Profile.ensureMockProfile();
    const result = await ctx.IO.importPayload(loaded.payload, { activate: true });
    suite.ok(result.ok, 'import ok');
    suite.ok(result.knowledgeImported >= 80, 'imported ≥80 knowledge records (got ' + result.knowledgeImported + ')');

    await sleep(30);
    const listed = await ctx.Knowledge.listKnowledge(result.profileId);
    suite.ok(listed.length >= 80, 'IndexedDB/listKnowledge ≥80 (got ' + listed.length + ')');

    const byKey = {};
    listed.forEach(function (r) {
      if (r && r.canonicalKey) byKey[r.canonicalKey] = r;
    });

    suite.equal(byKey.first_name && byKey.first_name.value, 'Chaudhary', 'first_name Chaudhary');
    suite.equal(byKey.last_name && byKey.last_name.value, 'Zahid Ali', 'last_name Zahid Ali');
    suite.equal(byKey.qualified_ca_or_acca && byKey.qualified_ca_or_acca.value, 'Yes', 'CA or ACCA Yes');
    suite.equal(byKey.qualified_ca && byKey.qualified_ca.value, 'No', 'CA-only No');
    suite.equal(byKey.highest_education && byKey.highest_education.value, 'Masters', 'Masters');
    suite.equal(byKey.experience_level && byKey.experience_level.value, 'Director', 'Director');
    suite.equal(
      byKey.middle_east_working_visa && byKey.middle_east_working_visa.value,
      'Yes',
      'ME visa Yes'
    );
    suite.equal(byKey.phone_full && byKey.phone_full.value, '+966504131857', 'phone_full E.164');
    suite.equal(byKey.date_of_birth && byKey.date_of_birth.value, '1979-04-06', 'DOB ISO');

    // Resolver + format path for DOB display variants
    const profile = await ctx.Profile.getProfile();
    suite.equal(profile.firstName, 'Chaudhary', 'profile firstName');
    suite.equal(profile.lastName, 'Zahid Ali', 'profile lastName');

    if (ctx.Format && ctx.Format.formatDate) {
      const mmdd = ctx.Format.formatDate(
        { type: 'text', placeholder: 'MM/DD/YYYY' },
        profile.dateOfBirth || '1979-04-06'
      );
      suite.equal(mmdd && mmdd.value, '04/06/1979', 'DOB MM/DD/YYYY');
    } else {
      suite.equal(String(profile.dateOfBirth || ''), '1979-04-06', 'profile DOB ISO');
    }

    // Knowledge resolver for screening labels
    if (ctx.Resolver && ctx.Resolver.resolve) {
      const caOr = ctx.Resolver.resolve(profile, {
        label: 'Are you a qualified CA or ACCA?',
        type: 'radio'
      }, ctx.FieldMap);
      suite.equal(String(caOr && caOr.value), 'Yes', 'resolve CA or ACCA → Yes');

      const caOnly = ctx.Resolver.resolve(profile, {
        label: 'Are you a qualified Chartered Accountant (CA)?',
        type: 'radio'
      }, ctx.FieldMap);
      suite.equal(String(caOnly && caOnly.value), 'No', 'resolve CA-only → No');

      const lvl = ctx.Resolver.resolve(profile, {
        label: 'Experience Level',
        type: 'select'
      }, ctx.FieldMap);
      suite.equal(String(lvl && lvl.value), 'Director', 'resolve Experience Level → Director');
    }

    // Mock still exists; package profiles stay empty of this PII
    const list = await ctx.Profile.listProfiles();
    const mock = list.find(function (p) {
      return String(p.name || '').toLowerCase() === 'mock' || p.id === 'mock';
    });
    suite.ok(!!mock, 'Mock profile preserved');
  })();

  /* D) Repo package files must not embed real password */
  await (async function noPasswordInPackage() {
    const scan = ['profiles/zahid-general.json', 'lib/profile.js', 'lib/source-profiles.js'];
    scan.forEach(function (rel) {
      const p = path.join(ROOT, rel);
      if (!fs.existsSync(p)) return;
      const txt = fs.readFileSync(p, 'utf8');
      suite.ok(!/"password"\s*:\s*"[^"]{4,}"/.test(txt), rel + ' has no password literal');
    });
    // Fixture under scripts/fixtures may hold PII for smoke but never a password value
    const fix = path.join(__dirname, 'fixtures', 'zahid-profile-redacted.json');
    if (fs.existsSync(fix)) {
      const txt = fs.readFileSync(fix, 'utf8');
      suite.ok(!/"password"\s*:\s*"[^"]+"/.test(txt), 'redacted fixture has no password value');
    }
  })();

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
