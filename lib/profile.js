/**
 * Default applicant profile shape + chrome.storage.local helpers.
 * Storage key: fillApply.profile
 * Attaches API to globalThis.FillApplyProfile (classic script; no bundler).
 *
 * Location helpers: phoneCountry, postcode (alias zip), street, city.
 * Employer questions: customAnswers map + legacy customQA array.
 */
(function (global) {
  'use strict';

  const PROFILE_STORAGE_KEY = 'fillApply.profile';

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

  function getProfile() {
    return new Promise((resolve) => {
      chrome.storage.local.get([PROFILE_STORAGE_KEY], (result) => {
        const stored = result[PROFILE_STORAGE_KEY];
        if (!stored || typeof stored !== 'object') {
          resolve(Object.assign({}, DEFAULT_PROFILE));
          return;
        }
        const merged = Object.assign({}, DEFAULT_PROFILE, stored, {
          customQA: Array.isArray(stored.customQA) ? stored.customQA : [],
          customAnswers: normalizeCustomAnswers(stored)
        });
        // Keep postcode/zip mirrored when only one is set
        if (!merged.postcode && merged.zip) merged.postcode = merged.zip;
        if (!merged.zip && merged.postcode) merged.zip = merged.postcode;
        resolve(merged);
      });
    });
  }

  function saveProfile(profile) {
    return new Promise((resolve, reject) => {
      const customQA = Array.isArray(profile.customQA) ? profile.customQA : [];
      let customAnswers =
        profile.customAnswers && typeof profile.customAnswers === 'object' && !Array.isArray(profile.customAnswers)
          ? Object.assign({}, profile.customAnswers)
          : {};
      customQA.forEach(function (row) {
        if (row && row.question) customAnswers[row.question] = row.answer;
      });
      const toSave = Object.assign({}, DEFAULT_PROFILE, profile, {
        customQA: customQA,
        customAnswers: customAnswers
      });
      if (!toSave.postcode && toSave.zip) toSave.postcode = toSave.zip;
      if (!toSave.zip && toSave.postcode) toSave.zip = toSave.postcode;
      chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: toSave }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(toSave);
      });
    });
  }

  function seedSampleProfile() {
    return saveProfile(Object.assign({}, SAMPLE_PROFILE));
  }

  function profileSummary(profile) {
    const name =
      profile.fullName ||
      [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
      '(no name)';
    const email = profile.email || '(no email)';
    return name + ' · ' + email;
  }

  global.FillApplyProfile = {
    PROFILE_STORAGE_KEY,
    DEFAULT_PROFILE,
    SAMPLE_PROFILE,
    getProfile,
    saveProfile,
    seedSampleProfile,
    profileSummary
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
