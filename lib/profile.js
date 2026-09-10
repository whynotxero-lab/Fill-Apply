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

  const ZAHID_GENERAL_PROFILE = {
    firstName: "Chaudhary Zahid",
    lastName: "Ali",
    fullName: "Chaudhary Zahid Ali",
    email: "czahidali@gmail.com",
    phone: "504131857",
    phoneCountry: "+966",
    location: "Riyadh / Khobar, Saudi Arabia",
    street: "",
    city: "Riyadh",
    state: "Riyadh",
    country: "Saudi Arabia",
    zip: "",
    postcode: "",
    nationality: "Pakistani",
    gender: "",
    noticePeriod: "Negotiable / as per contract",
    linkedin: "https://linkedin.com/in/chaudhryzahidali",
    portfolio: "",
    website: "",
    github: "",
    resumeUrl: "",
    resumeSummary: "CMA and ACCA-qualified Strategic Finance and FP&A professional with 15+ years across Saudi Arabia and the MENA region. Specializes in multi-year planning, budgeting, forecasting, management reporting, capital appraisal, and digital finance transformation across retail, F&B franchising, mobility, fuel/energy, and Big Four environments. Recognized for shortening reporting cycles, strengthening forecast discipline, and turning complex financial data into clear executive decision support.",
    workHistory: "SIXT, Samara Land Transportation Services Co. Ltd. | Khobar, Saudi Arabia\nFinancial Planning, Analysis & Reporting Manager | Oct 2024 – Sep 2025\n- Led FP&A, forecasting, KPI dashboards, and scenario modeling for planning and investments.\n- Delivered ROI/ROCE appraisals, P&L/cost reviews, and executive reporting aligned to finance-operations.\n\nIndependent Financial Advisory & FP&A Consulting | Islamabad, Pakistan\nFP&A Consultant / Financial Planning, Analysis & Reporting Advisor | Dec 2021 – Jun 2024\n- Multi-year strategic plans, valuations, feasibility studies, budgets/forecasts, and Power BI dashboards for multi-industry clients.\n- Improved profitability and reporting via process automation, scenario planning, and cost initiatives.\n\nPanda Group, Head Office | Saudi Arabia\nManager, Planning, Reporting & Operational Finance | Nov 2017 – Nov 2021\n- Cut Group reporting time by ~4 weeks via VBA automation and standardized workflows.\n- Owned multi-year plans, budgets, rolling forecasts, store capital appraisals (NPV/IRR/ROI), and finance team mentoring.\n\nAlamar Foods Company (Master Franchiser of Domino's Pizza) | Riyadh, Saudi Arabia\nGroup Reporting Manager | Nov 2015 – Nov 2017\n- Led group reporting, budgeting, and forecasting across KSA/MENAP; reduced reporting lag by weeks through automation.\n- KPI dashboards, offer feasibility, and regional liaison with Domino's International and sub-franchisees.\n\nUnited Fuel Company (in partnership with PETRONAS) | Riyadh, Saudi Arabia\nHead of Accounting & Finance / Fractional CFO | Jun 2014 – Oct 2015\n- Built finance function from the ground up (policies, controls, Sage ERP, cash/liquidity, budgeting).\n- Partnered with PETRONAS directors and Group CFO on planning and operational decisions.\n\nAzizia Panda United, Head Office | Riyadh, Saudi Arabia\nAssistant Manager, Planning & Reporting | Feb 2010 – Jun 2014\n- Budgeting, variance analysis, VBA/Oracle MIS, capital appraisals, and executive summaries.\n- Key contributor to Oracle ERP rollout, chart of accounts redesign, and loaded P&L (ABC allocation).\n\nPricewaterhouseCoopers (PwC) | Islamabad, Pakistan\nSupervising Senior, Audit & Assurance | Mar 2006 – Dec 2009\n- Led audits across reporting, controls, and compliance; supervised teams and client communication.\n- Oil & gas, financial services, and public sector engagements; IFRS/GAAP readiness.",
    education: "MBA Executive — Finance | Virtual University of Pakistan (VUP) | 2018 | CGPA 3.75; B.Com | University of the Punjab, Lahore | 2001; CMA — Institute of Management Accountants (IMA), USA | 2015; ACCA — United Kingdom | 2005",
    coverLetter: "I am writing to express my interest in a strategic finance / FP&A leadership role where rigorous planning, clear management reporting, and commercial partnership drive better decisions. As a CMA and ACCA-qualified professional with 15+ years across KSA and MENA retail, F&B, mobility, and energy, I bring proven skills in budgeting, forecasting, capital appraisal, and reporting automation. I am based in Saudi Arabia, authorized to work, and ready to contribute immediately to stronger forecast discipline and executive visibility. I would welcome the opportunity to discuss how my experience aligns with your team's priorities.",
    authorizedToWork: "Yes",
    requiresSponsorship: "No",
    customQA: [
      { question: "Expected Salary", answer: "Negotiable" },
      { question: "Salary expectation", answer: "Negotiable" },
      { question: "Current monthly salary", answer: "" },
      { question: "Years of experience", answer: "15+" },
      { question: "Highest Education", answer: "Master's / MBA" },
      { question: "Salutation", answer: "Mr." },
      { question: "Driving License", answer: "Yes" },
      { question: "Located in UAE", answer: "No" },
      { question: "Located in Saudi Arabia", answer: "Yes" },
      { question: "Located in KSA", answer: "Yes" },
      { question: "Primary work location", answer: "Riyadh, Saudi Arabia" },
      { question: "Willing to work EST", answer: "No" },
      { question: "Over 18", answer: "Yes" },
      { question: "Conflict of interest", answer: "No" },
      { question: "PIF", answer: "No" },
      { question: "Previously worked at company", answer: "No" },
      { question: "OFAC", answer: "No" },
      { question: "Notice period", answer: "Negotiable" },
      { question: "Social media", answer: "https://linkedin.com/in/chaudhryzahidali" },
      { question: "LinkedIn", answer: "https://linkedin.com/in/chaudhryzahidali" },
      { question: "Authorized to work", answer: "Yes" },
      { question: "Requires sponsorship", answer: "No" },
      { question: "Work authorization", answer: "Yes" },
      { question: "Sponsorship", answer: "No" }
    ],
    customAnswers: {
      "Expected Salary": "Negotiable",
      "Salary expectation": "Negotiable",
      "Current monthly salary": "",
      "Years of experience": "15+",
      "Highest Education": "Master's / MBA",
      "Salutation": "Mr.",
      "Driving License": "Yes",
      "Located in UAE": "No",
      "Located in Saudi Arabia": "Yes",
      "Located in KSA": "Yes",
      "Primary work location": "Riyadh, Saudi Arabia",
      "Willing to work EST": "No",
      "Over 18": "Yes",
      "Conflict of interest": "No",
      "PIF": "No",
      "Previously worked at company": "No",
      "OFAC": "No",
      "Notice period": "Negotiable",
      "Social media": "https://linkedin.com/in/chaudhryzahidali",
      "LinkedIn": "https://linkedin.com/in/chaudhryzahidali",
      "Authorized to work": "Yes",
      "Requires sponsorship": "No",
      "Work authorization": "Yes",
      "Sponsorship": "No",
      "Expected Salary / salary expectation": "Negotiable",
      "salary expectation": "Negotiable",
      "Located in Saudi Arabia / KSA": "Yes"
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

  async function createZahidGeneralProfile() {
    var store = await readStore();
    var now = Date.now();
    var existingId = null;
    Object.keys(store.profiles).forEach(function (id) {
      if (String(store.profiles[id].name || '').trim().toLowerCase() === 'zahid general') {
        existingId = id;
      }
    });
    var fields = fieldsFromInput(ZAHID_GENERAL_PROFILE);
    var id;
    var record;
    if (existingId) {
      id = existingId;
      var existing = store.profiles[id];
      record = Object.assign({}, fields, {
        id: id,
        name: 'Zahid General',
        createdAt: existing.createdAt || now,
        updatedAt: now
      });
    } else {
      id = newId();
      record = Object.assign({}, fields, {
        id: id,
        name: 'Zahid General',
        createdAt: now,
        updatedAt: now
      });
    }
    store.profiles[id] = record;
    await writeStore(store.profiles, id);
    return Object.assign(stripMeta(record), { id: record.id, name: record.name });
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
    ZAHID_GENERAL_PROFILE: ZAHID_GENERAL_PROFILE,
    createZahidGeneralProfile: createZahidGeneralProfile,
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
