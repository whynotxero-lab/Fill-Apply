/**
 * Multi-profile applicant storage + chrome.storage.local helpers.
 * Keys:
 *   fillApply.profiles        — { [profileId]: { id, name, createdAt, updatedAt, ...fields } }
 *   fillApply.activeProfileId — string
 * Legacy single profile (fillApply.profile) migrates into a "Default" profile when multi store is empty.
 * getProfile() / saveProfile() always read/write the active profile only.
 * Attaches API to globalThis.FillApplyProfile (classic script; no bundler).
 */
(function (global) {
  'use strict';

  const LEGACY_PROFILE_KEY = 'fillApply.profile';
  const PROFILES_KEY = 'fillApply.profiles';
  const ACTIVE_PROFILE_ID_KEY = 'fillApply.activeProfileId';

  const DEFAULT_PROFILE = {
    firstName: '',
    lastName: '',
    fullName: '',
    email: '',
    phone: '',
    phoneCountry: '',
    location: '',
    street: '',
    city: '',
    state: '',
    country: '',
    zip: '',
    postcode: '',
    nationality: '',
    gender: '',
    noticePeriod: '',
    linkedin: '',
    portfolio: '',
    website: '',
    github: '',
    resumeUrl: '',
    resumeSummary: '',
    workHistory: '',
    education: '',
    coverLetter: '',
    authorizedToWork: 'Yes',
    requiresSponsorship: 'No',
    customQA: [],
    customAnswers: {}
  };

  const SAMPLE_PROFILE = {
    firstName: 'Alex',
    lastName: 'Rivera',
    fullName: 'Alex Rivera',
    email: 'alex.rivera@example.com',
    phone: '501234567',
    phoneCountry: '+971',
    location: 'Dubai, United Arab Emirates',
    street: 'Sheikh Zayed Road',
    city: 'Dubai',
    state: 'Dubai',
    country: 'United Arab Emirates',
    zip: '00000',
    postcode: '00000',
    nationality: 'United Arab Emirates',
    gender: '',
    noticePeriod: 'I can start immediately',
    linkedin: 'https://linkedin.com/in/alexrivera',
    portfolio: 'https://alexrivera.dev',
    website: 'https://alexrivera.dev',
    github: 'https://github.com/alexrivera',
    resumeUrl: 'https://alexrivera.dev/resume.pdf',
    resumeSummary:
      'Full-stack engineer with 6+ years building web products. Strong in JavaScript, TypeScript, React, and Node.js.',
    workHistory:
      'Senior Software Engineer @ Acme Corp (2021–present): led hiring tooling and form automation.\nSoftware Engineer @ StartupXYZ (2018–2021): shipped customer-facing dashboards.',
    education: 'B.S. Computer Science, State University (2018)',
    coverLetter:
      'I am excited to apply for this role. My experience filling and shipping reliable product workflows maps well to your team needs.',
    authorizedToWork: 'Yes',
    requiresSponsorship: 'No',
    customQA: [
      { question: 'Years of experience', answer: '6' },
      { question: 'Authorized to work', answer: 'Yes' },
      { question: 'Requires sponsorship', answer: 'No' },
      { question: 'Work authorization', answer: 'Yes' },
      { question: 'Sponsorship', answer: 'No' },
      { question: 'Willing to relocate', answer: 'Yes' },
      { question: 'Salary expectation', answer: 'Negotiable' },
      { question: 'Driving License', answer: 'Yes' },
      { question: 'Do you have your own car?', answer: 'Yes' },
      { question: 'years UAE Contracting experience', answer: '3' }
    ],
    customAnswers: {
      'Driving License': 'Yes',
      'Do you ahve your own car?': 'Yes',
      'Do you have your own car?': 'Yes',
      'years UAE Contracting experience': '3',
      uaeContractingYears: '3'
    }
  };

  function storageGet(keys) {
    return new Promise(function (resolve) {
      chrome.storage.local.get(keys, function (result) {
        resolve(result || {});
      });
    });
  }

  function storageSet(obj) {
    return new Promise(function (resolve, reject) {
      chrome.storage.local.set(obj, function () {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function newId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function normalizeCustomAnswers(stored) {
    var map = {};
    if (stored && typeof stored.customAnswers === 'object' && !Array.isArray(stored.customAnswers)) {
      Object.keys(stored.customAnswers).forEach(function (k) {
        map[k] = stored.customAnswers[k];
      });
    }
    var qa = Array.isArray(stored && stored.customQA) ? stored.customQA : [];
    qa.forEach(function (row) {
      if (row && row.question && map[row.question] == null) {
        map[row.question] = row.answer;
      }
    });
    return map;
  }

  function stripMeta(record) {
    if (!record || typeof record !== 'object') return Object.assign({}, DEFAULT_PROFILE);
    var out = Object.assign({}, DEFAULT_PROFILE, record, {
      customQA: Array.isArray(record.customQA) ? record.customQA : [],
      customAnswers: normalizeCustomAnswers(record)
    });
    if (!out.postcode && out.zip) out.postcode = out.zip;
    if (!out.zip && out.postcode) out.zip = out.postcode;
    return out;
  }

  function fieldsFromInput(profile) {
    var customQA = Array.isArray(profile && profile.customQA) ? profile.customQA : [];
    var customAnswers =
      profile &&
      profile.customAnswers &&
      typeof profile.customAnswers === 'object' &&
      !Array.isArray(profile.customAnswers)
        ? Object.assign({}, profile.customAnswers)
        : {};
    customQA.forEach(function (row) {
      if (row && row.question) customAnswers[row.question] = row.answer;
    });
    var toSave = Object.assign({}, DEFAULT_PROFILE, profile || {}, {
      customQA: customQA,
      customAnswers: customAnswers
    });
    if (!toSave.postcode && toSave.zip) toSave.postcode = toSave.zip;
    if (!toSave.zip && toSave.postcode) toSave.zip = toSave.postcode;
    delete toSave.id;
    delete toSave.name;
    delete toSave.createdAt;
    delete toSave.updatedAt;
    return toSave;
  }

  function metaOnly(record) {
    return {
      id: record.id,
      name: record.name || 'Untitled',
      createdAt: record.createdAt || 0,
      updatedAt: record.updatedAt || 0
    };
  }

  var migratePromise = null;

  function ensureMigrated() {
    if (migratePromise) return migratePromise;
    migratePromise = (async function () {
      var result = await storageGet([PROFILES_KEY, ACTIVE_PROFILE_ID_KEY, LEGACY_PROFILE_KEY]);
      var profiles = result[PROFILES_KEY];
      var activeId = result[ACTIVE_PROFILE_ID_KEY];
      var hasProfiles =
        profiles && typeof profiles === 'object' && !Array.isArray(profiles) && Object.keys(profiles).length > 0;

      if (hasProfiles) {
        if (!activeId || !profiles[activeId]) {
          var firstId = Object.keys(profiles).sort(function (a, b) {
            return (profiles[a].createdAt || 0) - (profiles[b].createdAt || 0);
          })[0];
          await storageSet({ [ACTIVE_PROFILE_ID_KEY]: firstId });
        }
        return;
      }

      var now = Date.now();
      var id = newId();
      var legacy = result[LEGACY_PROFILE_KEY];
      var fields = stripMeta(legacy && typeof legacy === 'object' ? legacy : {});
      var record = Object.assign({}, fields, {
        id: id,
        name: 'Default',
        createdAt: now,
        updatedAt: now
      });
      var map = {};
      map[id] = record;
      var payload = {};
      payload[PROFILES_KEY] = map;
      payload[ACTIVE_PROFILE_ID_KEY] = id;
      await storageSet(payload);
    })().catch(function (err) {
      migratePromise = null;
      throw err;
    });
    return migratePromise;
  }

  async function readStore() {
    await ensureMigrated();
    var result = await storageGet([PROFILES_KEY, ACTIVE_PROFILE_ID_KEY]);
    var profiles =
      result[PROFILES_KEY] && typeof result[PROFILES_KEY] === 'object' && !Array.isArray(result[PROFILES_KEY])
        ? result[PROFILES_KEY]
        : {};
    var activeId = result[ACTIVE_PROFILE_ID_KEY];
    if (!activeId || !profiles[activeId]) {
      var ids = Object.keys(profiles);
      activeId = ids.length
        ? ids.sort(function (a, b) {
            return (profiles[a].createdAt || 0) - (profiles[b].createdAt || 0);
          })[0]
        : null;
    }
    return { profiles: profiles, activeId: activeId };
  }

  async function writeStore(profiles, activeId) {
    var payload = {};
    payload[PROFILES_KEY] = profiles;
    payload[ACTIVE_PROFILE_ID_KEY] = activeId;
    // Keep legacy key mirrored to active fields for any old readers
    if (activeId && profiles[activeId]) {
      payload[LEGACY_PROFILE_KEY] = fieldsFromInput(profiles[activeId]);
    }
    await storageSet(payload);
  }

  async function listProfiles() {
    var store = await readStore();
    return Object.keys(store.profiles)
      .map(function (id) {
        return metaOnly(store.profiles[id]);
      })
      .sort(function (a, b) {
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
  }

  async function getActiveProfileId() {
    var store = await readStore();
    return store.activeId;
  }

  async function getActiveProfileMeta() {
    var store = await readStore();
    if (!store.activeId || !store.profiles[store.activeId]) return null;
    return metaOnly(store.profiles[store.activeId]);
  }

  async function getProfile() {
    var store = await readStore();
    if (!store.activeId || !store.profiles[store.activeId]) {
      return Object.assign({}, DEFAULT_PROFILE);
    }
    return stripMeta(store.profiles[store.activeId]);
  }

  async function getProfileById(id) {
    var store = await readStore();
    if (!id || !store.profiles[id]) return null;
    return stripMeta(store.profiles[id]);
  }

  async function saveProfile(profile) {
    var store = await readStore();
    if (!store.activeId || !store.profiles[store.activeId]) {
      throw new Error('No active profile');
    }
    var existing = store.profiles[store.activeId];
    var fields = fieldsFromInput(profile);
    var now = Date.now();
    store.profiles[store.activeId] = Object.assign({}, fields, {
      id: existing.id,
      name: existing.name,
      createdAt: existing.createdAt || now,
      updatedAt: now
    });
    await writeStore(store.profiles, store.activeId);
    return stripMeta(store.profiles[store.activeId]);
  }

  async function createProfile(name) {
    var store = await readStore();
    var now = Date.now();
    var id = newId();
    var trimmed = String(name || '').trim() || 'Untitled';
    var record = Object.assign({}, DEFAULT_PROFILE, {
      id: id,
      name: trimmed,
      createdAt: now,
      updatedAt: now
    });
    store.profiles[id] = record;
    await writeStore(store.profiles, id);
    return metaOnly(record);
  }

  async function renameProfile(id, name) {
    var store = await readStore();
    if (!id || !store.profiles[id]) throw new Error('Profile not found');
    var trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Name required');
    store.profiles[id].name = trimmed;
    store.profiles[id].updatedAt = Date.now();
    await writeStore(store.profiles, store.activeId);
    return metaOnly(store.profiles[id]);
  }

  async function deleteProfile(id) {
    var store = await readStore();
    if (!id || !store.profiles[id]) throw new Error('Profile not found');
    var ids = Object.keys(store.profiles);
    if (ids.length <= 1) throw new Error('Cannot delete the last profile');
    delete store.profiles[id];
    var nextActive = store.activeId;
    if (nextActive === id) {
      nextActive = Object.keys(store.profiles).sort(function (a, b) {
        return (store.profiles[a].createdAt || 0) - (store.profiles[b].createdAt || 0);
      })[0];
    }
    await writeStore(store.profiles, nextActive);
    return { deletedId: id, activeId: nextActive };
  }

  async function setActiveProfile(id) {
    var store = await readStore();
    if (!id || !store.profiles[id]) throw new Error('Profile not found');
    await writeStore(store.profiles, id);
    return metaOnly(store.profiles[id]);
  }

  async function duplicateProfile(id) {
    var store = await readStore();
    if (!id || !store.profiles[id]) throw new Error('Profile not found');
    var src = store.profiles[id];
    var now = Date.now();
    var newProfileId = newId();
    var fields = fieldsFromInput(src);
    var baseName = (src.name || 'Untitled').replace(/\s*\(copy(?:\s+\d+)?\)\s*$/i, '').trim() || 'Untitled';
    var copyName = baseName + ' (copy)';
    var existingNames = {};
    Object.keys(store.profiles).forEach(function (pid) {
      existingNames[String(store.profiles[pid].name || '').toLowerCase()] = true;
    });
    var n = 2;
    while (existingNames[copyName.toLowerCase()]) {
      copyName = baseName + ' (copy ' + n + ')';
      n++;
    }
    var record = Object.assign({}, fields, {
      id: newProfileId,
      name: copyName,
      createdAt: now,
      updatedAt: now
    });
    store.profiles[newProfileId] = record;
    await writeStore(store.profiles, newProfileId);
    return metaOnly(record);
  }

  function seedSampleProfile() {
    return saveProfile(Object.assign({}, SAMPLE_PROFILE));
  }

  function profileSummary(profile) {
    const name =
      (profile && (profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(' '))) ||
      '(no name)';
    const email = (profile && profile.email) || '(no email)';
    return name + ' · ' + email;
  }

  async function profileSummaryWithActive() {
    var meta = await getActiveProfileMeta();
    var profile = await getProfile();
    var person = profileSummary(profile);
    if (meta && meta.name) return meta.name + ' · ' + person;
    return person;
  }

  global.FillApplyProfile = {
    PROFILE_STORAGE_KEY: LEGACY_PROFILE_KEY,
    PROFILES_KEY: PROFILES_KEY,
    ACTIVE_PROFILE_ID_KEY: ACTIVE_PROFILE_ID_KEY,
    DEFAULT_PROFILE: DEFAULT_PROFILE,
    SAMPLE_PROFILE: SAMPLE_PROFILE,
    getProfile: getProfile,
    getProfileById: getProfileById,
    saveProfile: saveProfile,
    seedSampleProfile: seedSampleProfile,
    profileSummary: profileSummary,
    profileSummaryWithActive: profileSummaryWithActive,
    listProfiles: listProfiles,
    getActiveProfileId: getActiveProfileId,
    getActiveProfileMeta: getActiveProfileMeta,
    createProfile: createProfile,
    renameProfile: renameProfile,
    deleteProfile: deleteProfile,
    setActiveProfile: setActiveProfile,
    duplicateProfile: duplicateProfile,
    ensureMigrated: ensureMigrated
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
