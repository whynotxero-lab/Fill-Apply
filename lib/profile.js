/**
 * Multi-profile applicant storage + chrome.storage.local helpers.
 * Keys:
 *   fillApply.profiles        — { [profileId]: { id, name, createdAt, updatedAt, ...fields } }
 *   fillApply.activeProfileId — string
 * Legacy single profile (fillApply.profile) migrates into a "Mock" profile when multi store is empty.
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
    coverUrl: '',
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
    gender: 'Male',
    noticePeriod: 'I can start immediately',
    linkedin: 'https://linkedin.com/in/alexrivera',
    portfolio: 'https://alexrivera.dev',
    website: 'https://alexrivera.dev',
    github: 'https://github.com/alexrivera',
    resumeUrl: 'https://alexrivera.dev/resume.pdf',
    coverUrl: '',
    resumeSummary:
      'Product-minded engineer with 6+ years shipping reliable web platforms across the UAE. Strong in JavaScript, TypeScript, React, and Node.js; comfortable owning hiring tooling and form workflows end to end.',
    workHistory:
      'Senior Software Engineer @ Acme Corp (2021–present): led hiring tooling and form automation.\nSoftware Engineer @ StartupXYZ (2018–2021): shipped customer-facing dashboards.',
    education: "Bachelor's / B.S. Computer Science, State University (2018)",
    coverLetter:
      'I bring six years of shipping hiring and application workflows with clear metrics (time-to-fill, completion rate). In the first six months I would map your funnel, harden Apply-start reliability, and partner with the team on measurable quality of hire.',
    authorizedToWork: 'Yes',
    requiresSponsorship: 'No',
    customQA: [
      { question: 'Expected Salary', answer: '25000 AED' },
      { question: 'Salary expectation', answer: '25000 AED' },
      { question: 'Current monthly salary', answer: '25000 AED' },
      { question: 'Notice period', answer: 'I can start immediately' },
      { question: 'Years of experience', answer: '6' },
      { question: 'Highest Education', answer: "Bachelor's" },
      { question: 'Salutation', answer: 'Mr.' },
      { question: 'Driving License', answer: 'Yes' },
      { question: 'Located in UAE', answer: 'Yes' },
      { question: 'Located in Saudi Arabia', answer: 'No' },
      { question: 'Located in KSA', answer: 'No' },
      { question: 'Primary work location', answer: 'Dubai' },
      { question: 'Over 18', answer: 'Yes' },
      { question: 'Conflict of interest', answer: 'No' },
      { question: 'PIF', answer: 'No' },
      { question: 'Previously worked at company', answer: 'No' },
      { question: 'OFAC', answer: 'No' },
      { question: 'Willing to work EST', answer: 'Yes' },
      { question: 'Authorized to work', answer: 'Yes' },
      { question: 'Requires sponsorship', answer: 'No' },
      { question: 'Work authorization', answer: 'Yes' },
      { question: 'Sponsorship', answer: 'No' },
      { question: 'Citizenship', answer: 'United Arab Emirates' },
      { question: 'Based in Riyadh', answer: 'No' },
      { question: 'Currently based in Riyadh?', answer: 'No' },
      { question: 'Largest team size', answer: '11-20' },
      { question: 'شهادة تربوية', answer: 'No' },
      { question: 'educational certificate', answer: 'No' },
      {
        question: 'Previously recruited/hired',
        answer: 'Yes — managed full recruitment process end to end'
      },
      {
        question: 'Computer tools / operational data',
        answer: 'I am proficient with most computer tools and can work independently with operational data'
      },
      {
        question: 'Why should we hire you',
        answer:
          'I bring six years of shipping hiring and application workflows with clear metrics (time-to-fill, completion rate). In the first six months I would map your funnel, harden Apply-start reliability, and partner on measurable quality of hire.'
      },
      { question: 'Willing to relocate', answer: 'Yes' },
      { question: 'Do you have your own car?', answer: 'Yes' },
      { question: 'years UAE Contracting experience', answer: '3' }
    ],
    customAnswers: {
      'Expected Salary': '25000 AED',
      'Salary expectation': '25000 AED',
      'Current monthly salary': '25000 AED',
      'Current Salary': '25000 AED',
      currentSalary: '25000 AED',
      'Expected Salary / salary expectation': '25000 AED',
      'Notice period': 'I can start immediately',
      'Years of experience': '6',
      yearsExperience: '6',
      'Highest Education': "Bachelor's",
      Salutation: 'Mr.',
      'Driving License': 'Yes',
      'Located in UAE': 'Yes',
      'Located in Saudi Arabia': 'No',
      'Located in KSA': 'No',
      'Located in Saudi Arabia / KSA': 'No',
      'Primary work location': 'Dubai',
      'Over 18': 'Yes',
      'Conflict of interest': 'No',
      PIF: 'No',
      'Previously worked at company': 'No',
      OFAC: 'No',
      'Willing to work EST': 'Yes',
      'Authorized to work': 'Yes',
      'Requires sponsorship': 'No',
      'Work authorization': 'Yes',
      Sponsorship: 'No',
      Citizenship: 'United Arab Emirates',
      nationality: 'United Arab Emirates',
      'Based in Riyadh': 'No',
      'Currently based in Riyadh?': 'No',
      'based in Riyadh': 'No',
      'Largest team size': '11-20',
      largestTeamSize: '11-20',
      'شهادة تربوية': 'No',
      'educational certificate': 'No',
      'Previously recruited/hired': 'Yes — managed full recruitment process end to end',
      'previously recruited': 'Yes — managed full recruitment process end to end',
      recruited: 'Yes — managed full recruitment process end to end',
      'hired members': 'Yes — managed full recruitment process end to end',
      'Computer tools / operational data':
        'I am proficient with most computer tools and can work independently with operational data',
      'computer tools':
        'I am proficient with most computer tools and can work independently with operational data',
      'operational data':
        'I am proficient with most computer tools and can work independently with operational data',
      'rate your ability':
        'I am proficient with most computer tools and can work independently with operational data',
      'Why should we hire you':
        'I bring six years of shipping hiring and application workflows with clear metrics (time-to-fill, completion rate). In the first six months I would map your funnel, harden Apply-start reliability, and partner on measurable quality of hire.',
      'why should we hire':
        'I bring six years of shipping hiring and application workflows with clear metrics (time-to-fill, completion rate). In the first six months I would map your funnel, harden Apply-start reliability, and partner on measurable quality of hire.',
      'first 6 months':
        'Map the apply funnel, harden Apply-start for Teamtailor modals, and publish completion-rate metrics with the hiring team.',
      'Do you ahve your own car?': 'Yes',
      'Do you have your own car?': 'Yes',
      'years UAE Contracting experience': '3',
      uaeContractingYears: '3'
    }
  };

  const ZAHID_GENERAL_PROFILE = {
    "firstName": "Chaudhary Zahid",
    "lastName": "Ali",
    "fullName": "Chaudhary Zahid Ali",
    "email": "czahidali@gmail.com",
    "phone": "504131857",
    "phoneCountry": "+966",
    "location": "Riyadh, Saudi Arabia",
    "street": "Khobar, Ryadh",
    "city": "Riyadh",
    "state": "Riyadh",
    "country": "Saudi Arabia",
    "zip": "",
    "postcode": "",
    "nationality": "Pakistan",
    "gender": "Male",
    "noticePeriod": "I can start immediately",
    "linkedin": "https://linkedin.com/in/chaudhryzahidali",
    "portfolio": "",
    "website": "",
    "github": "",
    "resumeUrl": "",
    "coverUrl": "",
    "resumeSummary": "CMA and ACCA-qualified Strategic Finance and FP&A professional with 15+ years across Saudi Arabia and the MENA region. Specializes in multi-year planning, budgeting, forecasting, management reporting, capital appraisal, and digital finance transformation across retail, F&B franchising, mobility, fuel/energy, and Big Four environments. Recognized for shortening reporting cycles, strengthening forecast discipline, and turning complex financial data into clear executive decision support.",
    "workHistory": "SIXT, Samara Land Transportation Services Co. Ltd. | Khobar, Saudi Arabia\nFinancial Planning, Analysis & Reporting Manager | Oct 2024 – Sep 2025\n- Led FP&A, forecasting, KPI dashboards, and scenario modeling for planning and investments.\n- Delivered ROI/ROCE appraisals, P&L/cost reviews, and executive reporting aligned to finance-operations.\n\nIndependent Financial Advisory & FP&A Consulting | Islamabad, Pakistan\nFP&A Consultant / Financial Planning, Analysis & Reporting Advisor | Dec 2021 – Jun 2024\n- Multi-year strategic plans, valuations, feasibility studies, budgets/forecasts, and Power BI dashboards for multi-industry clients.\n- Improved profitability and reporting via process automation, scenario planning, and cost initiatives.\n\nPanda Group, Head Office | Saudi Arabia\nManager, Planning, Reporting & Operational Finance | Nov 2017 – Nov 2021\n- Cut Group reporting time by ~4 weeks via VBA automation and standardized workflows.\n- Owned multi-year plans, budgets, rolling forecasts, store capital appraisals (NPV/IRR/ROI), and finance team mentoring.\n\nAlamar Foods Company (Master Franchiser of Domino's Pizza) | Riyadh, Saudi Arabia\nGroup Reporting Manager | Nov 2015 – Nov 2017\n- Led group reporting, budgeting, and forecasting across KSA/MENAP; reduced reporting lag by weeks through automation.\n- KPI dashboards, offer feasibility, and regional liaison with Domino's International and sub-franchisees.\n\nUnited Fuel Company (in partnership with PETRONAS) | Riyadh, Saudi Arabia\nHead of Accounting & Finance / Fractional CFO | Jun 2014 – Oct 2015\n- Built finance function from the ground up (policies, controls, Sage ERP, cash/liquidity, budgeting).\n- Partnered with PETRONAS directors and Group CFO on planning and operational decisions.\n\nAzizia Panda United, Head Office | Riyadh, Saudi Arabia\nAssistant Manager, Planning & Reporting | Feb 2010 – Jun 2014\n- Budgeting, variance analysis, VBA/Oracle MIS, capital appraisals, and executive summaries.\n- Key contributor to Oracle ERP rollout, chart of accounts redesign, and loaded P&L (ABC allocation).\n\nPricewaterhouseCoopers (PwC) | Islamabad, Pakistan\nSupervising Senior, Audit & Assurance | Mar 2006 – Dec 2009\n- Led audits across reporting, controls, and compliance; supervised teams and client communication.\n- Oil & gas, financial services, and public sector engagements; IFRS/GAAP readiness.",
    "education": "MBA Executive — Finance | Virtual University of Pakistan (VUP) | 2018 | CGPA 3.75; B.Com | University of the Punjab, Lahore | 2001; CMA — Institute of Management Accountants (IMA), USA | 2015; ACCA — United Kingdom | 2005",
    "coverLetter": "I am writing to express my interest in a strategic finance / FP&A leadership role where rigorous planning, clear management reporting, and commercial partnership drive better decisions. As a CMA and ACCA-qualified professional with 15+ years across KSA and MENA retail, F&B, mobility, and energy, I bring proven skills in budgeting, forecasting, capital appraisal, and reporting automation. I am based in Saudi Arabia, authorized to work, and ready to contribute immediately to stronger forecast discipline and executive visibility. I would welcome the opportunity to discuss how my experience aligns with your team's priorities.",
    "authorizedToWork": "Yes",
    "requiresSponsorship": "Yes",
    "customQA": [
      {
        "question": "Expected Salary",
        "answer": ""
      },
      {
        "question": "Salary expectation",
        "answer": ""
      },
      {
        "question": "Current monthly salary",
        "answer": ""
      },
      {
        "question": "Years of experience",
        "answer": "15+"
      },
      {
        "question": "Highest Education",
        "answer": "Master's / MBA"
      },
      {
        "question": "Salutation",
        "answer": "Mr."
      },
      {
        "question": "Driving License",
        "answer": ""
      },
      {
        "question": "Located in UAE",
        "answer": "No"
      },
      {
        "question": "Located in Saudi Arabia",
        "answer": "Yes"
      },
      {
        "question": "Located in KSA",
        "answer": "Yes"
      },
      {
        "question": "Primary work location",
        "answer": "Riyadh, Saudi Arabia"
      },
      {
        "question": "Willing to work EST",
        "answer": ""
      },
      {
        "question": "Over 18",
        "answer": ""
      },
      {
        "question": "Conflict of interest",
        "answer": ""
      },
      {
        "question": "PIF",
        "answer": ""
      },
      {
        "question": "Previously worked at company",
        "answer": ""
      },
      {
        "question": "OFAC",
        "answer": ""
      },
      {
        "question": "Notice period",
        "answer": "I can start immediately"
      },
      {
        "question": "Social media",
        "answer": "https://linkedin.com/in/chaudhryzahidali"
      },
      {
        "question": "LinkedIn",
        "answer": "https://linkedin.com/in/chaudhryzahidali"
      },
      {
        "question": "Authorized to work",
        "answer": "Yes"
      },
      {
        "question": "Requires sponsorship",
        "answer": "Yes"
      },
      {
        "question": "Work authorization",
        "answer": "Yes"
      },
      {
        "question": "Sponsorship",
        "answer": "Yes"
      }
    ],
    "customAnswers": {
      "Expected Salary": "",
      "Salary expectation": "",
      "Current monthly salary": "",
      "Years of experience": "15+",
      "Highest Education": "Master's / MBA",
      "Salutation": "Mr.",
      "Driving License": "",
      "Located in UAE": "No",
      "Located in Saudi Arabia": "Yes",
      "Located in KSA": "Yes",
      "Primary work location": "Riyadh, Saudi Arabia",
      "Willing to work EST": "",
      "Over 18": "",
      "Conflict of interest": "",
      "PIF": "",
      "Previously worked at company": "",
      "OFAC": "",
      "Notice period": "I can start immediately",
      "Social media": "https://linkedin.com/in/chaudhryzahidali",
      "LinkedIn": "https://linkedin.com/in/chaudhryzahidali",
      "Authorized to work": "Yes",
      "Requires sponsorship": "Yes",
      "Work authorization": "Yes",
      "Sponsorship": "Yes",
      "Expected Salary / salary expectation": "",
      "salary expectation": "",
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
    delete toSave.locked;
    delete toSave.systemProfile;
    return toSave;
  }

  function isMockName(name) {
    return String(name || '').trim().toLowerCase() === 'mock';
  }

  function isLockedProfile(record) {
    if (!record) return false;
    if (record.locked || record.systemProfile) return true;
    if (isMockName(record.name)) return true;
    if (String(record.id || '') === 'mock') return true;
    return false;
  }

  function metaOnly(record) {
    return {
      id: record.id,
      name: record.name || 'Untitled',
      createdAt: record.createdAt || 0,
      updatedAt: record.updatedAt || 0,
      locked: !!record.locked || !!record.systemProfile || isMockName(record.name) || String(record.id || '') === 'mock',
      systemProfile: !!record.systemProfile || isMockName(record.name) || String(record.id || '') === 'mock'
    };
  }

  function mergeMissingSampleFields(existing) {
    var sample = SAMPLE_PROFILE;
    var out = Object.assign({}, fieldsFromInput(existing));
    Object.keys(sample).forEach(function (k) {
      if (k === 'customQA' || k === 'customAnswers') return;
      if (out[k] == null || String(out[k]).trim() === '') {
        if (sample[k] != null && String(sample[k]).trim() !== '') out[k] = sample[k];
      }
    });
    var sampleQA = Array.isArray(sample.customQA) ? sample.customQA : [];
    var qa = Array.isArray(out.customQA) ? out.customQA.slice() : [];
    var haveQ = {};
    qa.forEach(function (row) {
      if (row && row.question) haveQ[String(row.question).toLowerCase()] = true;
    });
    sampleQA.forEach(function (row) {
      if (!row || !row.question) return;
      var key = String(row.question).toLowerCase();
      if (!haveQ[key]) {
        qa.push({ question: row.question, answer: row.answer });
        haveQ[key] = true;
      } else {
        for (var i = 0; i < qa.length; i++) {
          if (qa[i] && String(qa[i].question || '').toLowerCase() === key) {
            if (qa[i].answer == null || String(qa[i].answer).trim() === '') {
              qa[i].answer = row.answer;
            }
            break;
          }
        }
      }
    });
    out.customQA = qa;
    var answers = Object.assign({}, sample.customAnswers || {}, out.customAnswers || {});
    qa.forEach(function (row) {
      if (row && row.question) {
        if (answers[row.question] == null || String(answers[row.question]).trim() === '') {
          answers[row.question] = row.answer;
        }
      }
    });
    out.customAnswers = answers;
    return out;
  }

  async function ensureMockProfile() {
    var store = await readStoreRaw();
    var profiles = store.profiles;
    var mockId = null;
    Object.keys(profiles).forEach(function (id) {
      var p = profiles[id];
      if (!p) return;
      if (String(p.id || id) === 'mock' || isMockName(p.name)) {
        mockId = id;
      }
    });
    var now = Date.now();
    var changed = false;
    if (!mockId) {
      mockId = 'mock';
      var fields = fieldsFromInput(SAMPLE_PROFILE);
      profiles[mockId] = Object.assign({}, fields, {
        id: mockId,
        name: 'Mock',
        locked: true,
        systemProfile: true,
        createdAt: now,
        updatedAt: now
      });
      changed = true;
    } else {
      var existing = profiles[mockId];
      var patched = Object.assign({}, existing, {
        name: 'Mock',
        locked: true,
        systemProfile: true
      });
      // Prefer stable id "mock" when safe
      if (mockId !== 'mock' && !profiles.mock) {
        delete profiles[mockId];
        patched.id = 'mock';
        if (store.activeId === mockId) store.activeId = 'mock';
        mockId = 'mock';
        profiles[mockId] = patched;
        changed = true;
      }
      if (patched.locked || patched.systemProfile) {
        var merged = mergeMissingSampleFields(patched);
        var next = Object.assign({}, merged, {
          id: mockId,
          name: 'Mock',
          locked: true,
          systemProfile: true,
          createdAt: patched.createdAt || now,
          updatedAt: now
        });
        // Only write if something meaningful was missing
        var before = JSON.stringify({
          g: existing.gender,
          n: existing.nationality,
          c: existing.customAnswers && existing.customAnswers['Current monthly salary'],
          t: existing.customAnswers && existing.customAnswers['Largest team size'],
          r: existing.customAnswers && existing.customAnswers['Based in Riyadh']
        });
        var after = JSON.stringify({
          g: next.gender,
          n: next.nationality,
          c: next.customAnswers && next.customAnswers['Current monthly salary'],
          t: next.customAnswers && next.customAnswers['Largest team size'],
          r: next.customAnswers && next.customAnswers['Based in Riyadh']
        });
        if (before !== after || !existing.locked || !existing.systemProfile || existing.name !== 'Mock') {
          profiles[mockId] = next;
          changed = true;
        } else if (!existing.locked || !existing.systemProfile || existing.name !== 'Mock') {
          profiles[mockId] = Object.assign({}, existing, {
            name: 'Mock',
            locked: true,
            systemProfile: true,
            id: mockId
          });
          changed = true;
        }
      }
    }
    if (changed) {
      await writeStore(profiles, store.activeId || mockId);
    }
    return mockId;
  }

  async function readStoreRaw() {
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
        var renamed = false;
        Object.keys(profiles).forEach(function (pid) {
          var nm = String(profiles[pid].name || '').trim();
          if (nm === 'Default' || isMockName(nm) || String(pid) === 'mock') {
            var p = profiles[pid];
            var need =
              p.name !== 'Mock' || !p.locked || !p.systemProfile || String(p.id || pid) !== String(pid);
            if (need) {
              p.name = 'Mock';
              p.locked = true;
              p.systemProfile = true;
              p.id = pid;
              p.updatedAt = Date.now();
              renamed = true;
            }
          }
        });
        var patch = {};
        if (!activeId || !profiles[activeId]) {
          var firstId = Object.keys(profiles).sort(function (a, b) {
            return (profiles[a].createdAt || 0) - (profiles[b].createdAt || 0);
          })[0];
          patch[ACTIVE_PROFILE_ID_KEY] = firstId;
        }
        if (renamed) patch[PROFILES_KEY] = profiles;
        if (Object.keys(patch).length) await storageSet(patch);
        return;
      }

      var now = Date.now();
      var id = 'mock';
      var legacy = result[LEGACY_PROFILE_KEY];
      var seedSrc =
        legacy && typeof legacy === 'object' && (legacy.email || legacy.firstName || legacy.fullName)
          ? legacy
          : SAMPLE_PROFILE;
      var record = Object.assign({}, fieldsFromInput(seedSrc), {
        id: id,
        name: 'Mock',
        locked: true,
        systemProfile: true,
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
    // Ensure locked Mock exists / is complete before any profile read
    try {
      await ensureMockProfile();
    } catch (_eMock) {
      /* ignore — store may be mid-migrate */
    }
    return readStoreRaw();
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
      name: isLockedProfile(existing) ? 'Mock' : existing.name,
      locked: !!existing.locked || isLockedProfile(existing),
      systemProfile: !!existing.systemProfile || isLockedProfile(existing),
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
    if (isMockName(trimmed)) {
      throw new Error('Name "Mock" is reserved for the system demo profile.');
    }
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
    if (isLockedProfile(store.profiles[id])) {
      throw new Error('Mock profile cannot be renamed. Use Reset Mock to restore sample fields.');
    }
    var trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Name required');
    if (isMockName(trimmed)) throw new Error('Name "Mock" is reserved for the system demo profile.');
    store.profiles[id].name = trimmed;
    store.profiles[id].updatedAt = Date.now();
    await writeStore(store.profiles, store.activeId);
    return metaOnly(store.profiles[id]);
  }

  async function deleteProfile(id) {
    var store = await readStore();
    if (!id || !store.profiles[id]) throw new Error('Profile not found');
    var victim = store.profiles[id];
    if (isLockedProfile(victim)) {
      throw new Error('Mock profile cannot be deleted. Switch to another profile instead.');
    }
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

  async function resetMockProfile() {
    var store = await readStore();
    var mockId = null;
    Object.keys(store.profiles).forEach(function (id) {
      if (String(id) === 'mock' || isMockName(store.profiles[id].name)) mockId = id;
    });
    var now = Date.now();
    var fields = fieldsFromInput(SAMPLE_PROFILE);
    if (!mockId) {
      mockId = 'mock';
      store.profiles[mockId] = Object.assign({}, fields, {
        id: mockId,
        name: 'Mock',
        locked: true,
        systemProfile: true,
        createdAt: now,
        updatedAt: now
      });
    } else {
      var existing = store.profiles[mockId];
      store.profiles[mockId] = Object.assign({}, fields, {
        id: mockId,
        name: 'Mock',
        locked: true,
        systemProfile: true,
        createdAt: existing.createdAt || now,
        updatedAt: now
      });
    }
    await writeStore(store.profiles, store.activeId || mockId);
    return Object.assign(stripMeta(store.profiles[mockId]), {
      id: mockId,
      name: 'Mock',
      locked: true,
      systemProfile: true
    });
  }

  async function seedSampleProfile() {
    // Always reseed the locked Mock profile (keeps same id).
    return resetMockProfile();
  }

  function profileSummary(profile) {
    const name =
      (profile && (profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(' '))) ||
      '(no name)';
    const email = (profile && profile.email) || '(no email)';
    return name + ' · ' + email;
  }

  async function profileSummaryWithActive() {
    // Active applicant identity only (name · email) — do not prepend profile chip name.
    var profile = await getProfile();
    return profileSummary(profile);
  }


  function isBlank(v) {
    return v == null || String(v).trim() === '';
  }

  function missingKeys(profile, keys) {
    profile = profile || {};
    var out = [];
    (keys || []).forEach(function (k) {
      if (isBlank(profile[k])) out.push(k);
    });
    return out;
  }

  /**
   * Lookup a profile field-map key or customAnswers / customQA label.
   * Never invents a value — blank → { value: null, missing: true }.
   */
  function answerForLabel(profile, label) {
    profile = profile || {};
    var raw = label == null ? '' : String(label).trim();
    if (!raw) return { value: null, missing: true };

    // Direct profile key
    if (Object.prototype.hasOwnProperty.call(profile, raw) && !isBlank(profile[raw])) {
      return { value: String(profile[raw]).trim(), missing: false, source: 'profile.' + raw };
    }

    // Field-map key match by label / names
    var mapApi = global.FillApplyFieldMap;
    if (mapApi && Array.isArray(mapApi.FIELD_MAP)) {
      var labLower = raw.toLowerCase();
      for (var i = 0; i < mapApi.FIELD_MAP.length; i++) {
        var entry = mapApi.FIELD_MAP[i];
        if (!entry || !entry.key) continue;
        var hit = entry.key.toLowerCase() === labLower;
        var labels = entry.labels || [];
        var names = entry.names || [];
        for (var L = 0; !hit && L < labels.length; L++) {
          if (labLower.indexOf(String(labels[L]).toLowerCase()) !== -1) hit = true;
        }
        for (var N = 0; !hit && N < names.length; N++) {
          if (labLower.indexOf(String(names[N]).toLowerCase()) !== -1) hit = true;
        }
        if (hit) {
          if (!isBlank(profile[entry.key])) {
            return { value: String(profile[entry.key]).trim(), missing: false, source: 'fieldMap.' + entry.key };
          }
          return { value: null, missing: true, key: entry.key };
        }
      }
    }

    // customAnswers fuzzy
    var cmap = profile.customAnswers;
    if (cmap && typeof cmap === 'object' && !Array.isArray(cmap)) {
      var keys = Object.keys(cmap);
      var best = null;
      var bestScore = 0;
      var bestKey = null;
      var nLab = raw.toLowerCase().replace(/\s+/g, ' ');
      for (var c = 0; c < keys.length; c++) {
        var k = keys[c];
        var nk = String(k).toLowerCase().replace(/\s+/g, ' ');
        if (!nk) continue;
        if (nLab.indexOf(nk) !== -1 || nk.indexOf(nLab) !== -1) {
          var score = Math.min(nk.length, nLab.length);
          if (score > bestScore) {
            bestScore = score;
            best = cmap[k];
            bestKey = k;
          }
        }
      }
      if (bestKey != null) {
        if (isBlank(best)) return { value: null, missing: true, key: bestKey };
        return { value: String(best).trim(), missing: false, source: 'customAnswers.' + bestKey };
      }
    }

    // customQA
    if (mapApi && typeof mapApi.matchCustomQA === 'function') {
      var qa = mapApi.matchCustomQA(profile.customQA, raw, '');
      if (!isBlank(qa)) return { value: String(qa).trim(), missing: false, source: 'customQA' };
    } else if (Array.isArray(profile.customQA)) {
      var nLab2 = raw.toLowerCase();
      for (var q = 0; q < profile.customQA.length; q++) {
        var row = profile.customQA[q];
        if (!row || !row.question) continue;
        var nq = String(row.question).toLowerCase();
        if (nLab2.indexOf(nq) !== -1 || nq.indexOf(nLab2) !== -1) {
          if (isBlank(row.answer)) return { value: null, missing: true, key: row.question };
          return { value: String(row.answer).trim(), missing: false, source: 'customQA' };
        }
      }
    }

    return { value: null, missing: true };
  }

  /**
   * Adapters call this before filling a known mapped field.
   * If blank → needsHuman payload with missingProfileFields (never invent).
   */
  function requireOrPause(profile, keyOrLabel) {
    var key = keyOrLabel == null ? '' : String(keyOrLabel).trim();
    if (!key) {
      return {
        value: null,
        missing: true,
        needsHuman: true,
        pauseReason: 'missing_profile_field',
        missingProfileFields: ['(unknown field)'],
        error: 'Missing profile field — fill in Options or on the page, then Resume'
      };
    }
    if (Object.prototype.hasOwnProperty.call(profile || {}, key) && !isBlank(profile[key])) {
      return { value: String(profile[key]).trim(), missing: false };
    }
    var looked = answerForLabel(profile, key);
    if (!looked.missing && !isBlank(looked.value)) {
      return { value: looked.value, missing: false, source: looked.source };
    }
    var label = looked.key || key;
    return {
      value: null,
      missing: true,
      needsHuman: true,
      pauseReason: 'missing_profile_field',
      missingProfileFields: [label],
      error:
        'Missing profile field: ' +
        label +
        ' — fill in Options or on the page, then Resume'
    };
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
    resetMockProfile: resetMockProfile,
    ensureMockProfile: ensureMockProfile,
    isLockedProfile: isLockedProfile,
    isMockName: isMockName,
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
    isBlank: isBlank,
    missingKeys: missingKeys,
    answerForLabel: answerForLabel,
    requireOrPause: requireOrPause,
    ensureMigrated: ensureMigrated
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
