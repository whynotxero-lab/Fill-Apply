/**
 * Map profile keys to autocomplete / name / id / label / placeholder patterns.
 * Attaches API to globalThis.FillApplyFieldMap.
 */
(function (global) {
  'use strict';

  const FIELD_MAP = [
    {
      key: 'fullName',
      autocomplete: ['name'],
      names: ['fullname', 'full_name', 'full-name', 'applicant_name', 'your_name', 'name'],
      labels: ['full name', 'your name', 'legal name', 'applicant name'],
      placeholders: ['full name', 'your name']
    },
    {
      key: 'firstName',
      autocomplete: ['given-name'],
      names: ['firstname', 'first_name', 'first-name', 'fname', 'givenname', 'given_name'],
      labels: ['first name', 'given name'],
      placeholders: ['first name', 'given name']
    },
    {
      key: 'lastName',
      autocomplete: ['family-name'],
      names: ['lastname', 'last_name', 'last-name', 'lname', 'surname', 'familyname', 'family_name'],
      labels: ['last name', 'family name', 'surname'],
      placeholders: ['last name', 'surname', 'family name']
    },
    {
      key: 'email',
      autocomplete: ['email'],
      names: ['email', 'e-mail', 'emailaddress', 'email_address', 'user_email'],
      labels: ['email', 'e-mail', 'email address'],
      placeholders: ['email', 'you@example.com', 'email address']
    },
    {
      key: 'phone',
      autocomplete: ['tel'],
      names: ['phone', 'telephone', 'mobile', 'tel', 'phone_number', 'phonenumber', 'cell'],
      labels: ['phone', 'telephone', 'mobile', 'phone number', 'cell'],
      placeholders: ['phone', 'mobile', '(555)']
    },
    {
      key: 'location',
      autocomplete: ['street-address', 'address-line1'],
      names: ['location', 'address', 'current_location', 'city_state'],
      labels: ['location', 'current location', 'address', 'where are you based'],
      placeholders: ['city, state', 'location', 'address']
    },
    {
      key: 'city',
      autocomplete: ['address-level2'],
      names: ['city', 'town'],
      labels: ['city', 'town'],
      placeholders: ['city']
    },
    {
      key: 'state',
      autocomplete: ['address-level1'],
      names: ['state', 'province', 'region'],
      labels: ['state', 'province', 'region'],
      placeholders: ['state', 'province']
    },
    {
      key: 'country',
      autocomplete: ['country-name', 'country'],
      names: ['country', 'country_name'],
      labels: ['country'],
      placeholders: ['country']
    },
    {
      key: 'zip',
      autocomplete: ['postal-code'],
      names: ['zip', 'zipcode', 'zip_code', 'postal', 'postalcode', 'postal_code'],
      labels: ['zip', 'postal', 'postal code', 'zip code'],
      placeholders: ['zip', 'postal']
    },
    {
      key: 'linkedin',
      autocomplete: ['url'],
      names: ['linkedin', 'linkedin_url', 'linkedinurl', 'linked_in'],
      labels: ['linkedin', 'linkedin url', 'linkedin profile'],
      placeholders: ['linkedin.com']
    },
    {
      key: 'portfolio',
      autocomplete: ['url'],
      names: ['portfolio', 'portfolio_url', 'portfoliourl'],
      labels: ['portfolio', 'portfolio url', 'portfolio website'],
      placeholders: ['portfolio']
    },
    {
      key: 'website',
      autocomplete: ['url'],
      names: ['website', 'personal_website', 'homepage', 'site'],
      labels: ['website', 'personal website', 'personal site'],
      placeholders: ['https://']
    },
    {
      key: 'github',
      autocomplete: ['url'],
      names: ['github', 'github_url', 'githuburl'],
      labels: ['github', 'github url', 'github profile'],
      placeholders: ['github.com']
    },
    {
      key: 'resumeUrl',
      autocomplete: [],
      names: ['resume_url', 'resumeurl', 'cv_url', 'resume_link'],
      labels: ['resume url', 'resume link', 'cv url', 'link to resume'],
      placeholders: ['resume url', 'link to resume']
    },
    {
      key: 'resumeSummary',
      autocomplete: [],
      names: ['summary', 'resume_summary', 'about', 'bio', 'profile_summary'],
      labels: ['summary', 'about you', 'professional summary', 'bio'],
      placeholders: ['brief summary', 'tell us about yourself']
    },
    {
      key: 'workHistory',
      autocomplete: [],
      names: ['work_history', 'experience', 'work_experience', 'employment'],
      labels: ['work history', 'work experience', 'experience', 'employment history'],
      placeholders: ['describe your experience']
    },
    {
      key: 'education',
      autocomplete: [],
      names: ['education', 'school', 'degree', 'university'],
      labels: ['education', 'school', 'degree', 'university'],
      placeholders: ['education']
    },
    {
      key: 'coverLetter',
      autocomplete: [],
      names: ['cover_letter', 'coverletter', 'cover', 'message', 'additional_info'],
      labels: ['cover letter', 'why do you want', 'additional information', 'message'],
      placeholders: ['cover letter', 'tell us why']
    }
  ];

  function normalize(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function scoreMatch(entry, descriptor) {
    let score = 0;
    const ac = normalize(descriptor.autocomplete);
    const n = normalize(descriptor.name);
    const i = normalize(descriptor.id);
    const lab = normalize(descriptor.label);
    const ph = normalize(descriptor.placeholder);
    const type = descriptor.type || '';

    (entry.autocomplete || []).forEach(function (a) {
      if (ac && ac === normalize(a)) score += 100;
    });
    (entry.names || []).forEach(function (p) {
      const pn = normalize(p);
      if (n && (n === pn || n.includes(pn) || pn.includes(n))) score += 50;
      if (i && (i === pn || i.includes(pn) || pn.includes(i))) score += 40;
    });
    (entry.labels || []).forEach(function (p) {
      const pl = normalize(p);
      if (lab && (lab === pl || lab.includes(pl))) score += 60;
    });
    (entry.placeholders || []).forEach(function (p) {
      const pp = normalize(p);
      if (ph && (ph === pp || ph.includes(pp))) score += 30;
    });

    if (entry.key === 'email' && type === 'email') score += 80;
    if (entry.key === 'phone' && (type === 'tel' || type === 'phone')) score += 80;
    if (
      ['linkedin', 'portfolio', 'website', 'github', 'resumeUrl'].indexOf(entry.key) !== -1 &&
      type === 'url'
    ) {
      score += 10;
    }

    return score;
  }

  function bestKeyForField(descriptor, minScore) {
    minScore = typeof minScore === 'number' ? minScore : 30;
    let best = null;
    let bestScore = 0;
    for (let i = 0; i < FIELD_MAP.length; i++) {
      const entry = FIELD_MAP[i];
      const s = scoreMatch(entry, descriptor);
      if (s > bestScore) {
        bestScore = s;
        best = entry.key;
      }
    }
    return bestScore >= minScore ? best : null;
  }

  function matchCustomQA(customQA, label, placeholder) {
    if (!Array.isArray(customQA) || !customQA.length) return null;
    const hay = normalize([label, placeholder].filter(Boolean).join(' '));
    if (!hay) return null;
    let best = null;
    let bestScore = 0;
    for (let i = 0; i < customQA.length; i++) {
      const qa = customQA[i];
      const q = normalize(qa.question);
      if (!q) continue;
      if (hay.includes(q) || q.includes(hay)) {
        const score = Math.min(q.length, hay.length);
        if (score > bestScore) {
          bestScore = score;
          best = qa.answer;
        }
      }
    }
    return best;
  }

  global.FillApplyFieldMap = {
    FIELD_MAP,
    normalize,
    scoreMatch,
    bestKeyForField,
    matchCustomQA
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
