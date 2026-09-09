/**
 * Default applicant profile shape + chrome.storage.local helpers.
 * Storage key: fillApply.profile
 * Attaches API to globalThis.FillApplyProfile (classic script; no bundler).
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
    location: '',
    city: '',
    state: '',
    country: '',
    zip: '',
    linkedin: '',
    portfolio: '',
    website: '',
    github: '',
    resumeUrl: '',
    resumeSummary: '',
    workHistory: '',
    education: '',
    coverLetter: '',
    customQA: []
  };

  const SAMPLE_PROFILE = {
    firstName: 'Alex',
    lastName: 'Rivera',
    fullName: 'Alex Rivera',
    email: 'alex.rivera@example.com',
    phone: '+1 (555) 123-4567',
    location: 'San Francisco, CA, USA',
    city: 'San Francisco',
    state: 'CA',
    country: 'United States',
    zip: '94105',
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
    customQA: [
      { question: 'Years of experience', answer: '6' },
      { question: 'Authorized to work', answer: 'Yes' },
      { question: 'Requires sponsorship', answer: 'No' },
      { question: 'Willing to relocate', answer: 'Yes' },
      { question: 'Salary expectation', answer: 'Negotiable' }
    ]
  };

  function getProfile() {
    return new Promise((resolve) => {
      chrome.storage.local.get([PROFILE_STORAGE_KEY], (result) => {
        const stored = result[PROFILE_STORAGE_KEY];
        if (!stored || typeof stored !== 'object') {
          resolve(Object.assign({}, DEFAULT_PROFILE));
          return;
        }
        resolve(
          Object.assign({}, DEFAULT_PROFILE, stored, {
            customQA: Array.isArray(stored.customQA) ? stored.customQA : []
          })
        );
      });
    });
  }

  function saveProfile(profile) {
    return new Promise((resolve, reject) => {
      const toSave = Object.assign({}, DEFAULT_PROFILE, profile, {
        customQA: Array.isArray(profile.customQA) ? profile.customQA : []
      });
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
