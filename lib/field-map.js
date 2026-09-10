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
      key: 'street',
      autocomplete: ['street-address', 'address-line1'],
      names: ['street', 'street_address', 'streetaddress', 'address1', 'address_line1'],
      labels: ['street', 'street address', 'address line 1'],
      placeholders: ['street', 'address']
    },
    {
      key: 'postcode',
      autocomplete: ['postal-code'],
      names: ['postcode', 'postal_code', 'postal'],
      labels: ['postcode', 'postal code', 'postal'],
      placeholders: ['postcode', 'postal']
    },
    {
      key: 'phoneCountry',
      autocomplete: ['tel-country-code'],
      names: ['phone_country', 'phonecountry', 'country_code', 'dial_code', 'calling_code'],
      labels: ['phone country', 'country code', 'dial code', 'calling code'],
      placeholders: ['+971', '+1']
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
      labels: ['resume url', 'resume link', 'cv url', 'link to resume', 'curriculum vitae url'],
      placeholders: ['resume url', 'link to resume']
    },
    {
      key: 'coverUrl',
      autocomplete: [],
      names: ['cover_url', 'coverurl', 'cover_letter_url', 'cover_link'],
      labels: ['cover letter url', 'cover url', 'cover letter link'],
      placeholders: ['cover letter url']
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
      labels: ['cover letter', 'covering letter', 'motivation letter', 'letter of interest', 'why do you want', 'additional information', 'message'],
      placeholders: ['cover letter', 'tell us why']
    },
    {
      key: 'nationality',
      autocomplete: ['country-name'],
      names: ['nationality', 'citizenship', 'citizen_of'],
      labels: ['nationality', 'citizenship', 'citizen of'],
      placeholders: ['nationality']
    },
    {
      key: 'gender',
      autocomplete: ['sex'],
      names: ['gender', 'sex'],
      labels: ['gender', 'sex'],
      placeholders: ['gender']
    },
    {
      key: 'noticePeriod',
      autocomplete: [],
      names: ['notice_period', 'noticeperiod', 'availability', 'start_availability'],
      labels: [
        'notice period',
        'when can you start',
        'earliest start',
        'availability',
        'i can start immediately'
      ],
      placeholders: ['notice period', 'immediately']
    },
    {
      key: 'authorizedToWork',
      autocomplete: [],
      names: [
        'authorized_to_work',
        'work_authorization',
        'work_auth',
        'legally_authorized',
        'eligible_to_work'
      ],
      labels: [
        'authorized to work',
        'legally authorized',
        'eligible to work',
        'work authorization',
        'right to work',
        'permitted to work',
        'are you authorized'
      ],
      placeholders: ['yes', 'no']
    },
    {
      key: 'requiresSponsorship',
      autocomplete: [],
      names: [
        'requires_sponsorship',
        'sponsorship',
        'need_sponsorship',
        'visa_sponsorship',
        'require_visa'
      ],
      labels: [
        'require sponsorship',
        'requires sponsorship',
        'need sponsorship',
        'visa sponsorship',
        'will you now or in the future require sponsorship',
        'sponsorship'
      ],
      placeholders: ['yes', 'no']
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
      // Substring matching on very short tokens matches almost anything
      // ("e" inside "email"), so only exact matches count below 3 characters.
      const canSubstring = pn.length >= 3;
      if (n && (n === pn || (canSubstring && n.length >= 3 && (n.includes(pn) || pn.includes(n))))) {
        score += 50;
      }
      if (i && (i === pn || (canSubstring && i.length >= 3 && (i.includes(pn) || pn.includes(i))))) {
        score += 40;
      }
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

  /** Words that carry no meaning when comparing a stored question to a page label. */
  const STOP_WORDS = {
    a: 1, an: 1, the: 1, is: 1, are: 1, do: 1, does: 1, did: 1, you: 1, your: 1,
    yours: 1, we: 1, us: 1, our: 1, to: 1, of: 1, in: 1, on: 1, at: 1, for: 1,
    with: 1, and: 1, or: 1, if: 1, please: 1, what: 1, which: 1, how: 1, have: 1,
    has: 1, will: 1, would: 1, can: 1, any: 1, this: 1, that: 1, be: 1, been: 1,
    me: 1, my: 1, i: 1
  };

  function contentTokens(str) {
    return normalize(str)
      .replace(/[^a-z0-9\u0600-\u06ff ]+/g, ' ')
      .split(/\s+/)
      .filter(function (t) {
        return t && t.length > 1 && !STOP_WORDS[t];
      });
  }

  /**
   * Match a stored question to a page label.
   *
   * Pure substring matching fails on the common case: a source profile stores
   * "Current salary" while the page asks "What is your current salary?".
   * Comparing content words handles the wording drift both ways.
   */
  function matchCustomQA(customQA, label, placeholder) {
    if (!Array.isArray(customQA) || !customQA.length) return null;
    const hay = normalize([label, placeholder].filter(Boolean).join(' '));
    if (!hay) return null;
    const hayTokens = contentTokens(hay);

    let best = null;
    let bestScore = 0;
    for (let i = 0; i < customQA.length; i++) {
      const qa = customQA[i];
      if (!qa) continue;
      const q = normalize(qa.question);
      if (!q) continue;

      let score = 0;
      if (hay.includes(q) || q.includes(hay)) {
        score = 100 + Math.min(q.length, hay.length);
      } else {
        const qTokens = contentTokens(q);
        if (!qTokens.length || !hayTokens.length) continue;
        let overlap = 0;
        qTokens.forEach(function (t) {
          if (hayTokens.indexOf(t) !== -1) overlap += 1;
        });
        const ratio = overlap / Math.min(qTokens.length, hayTokens.length);
        // Needs most of the shorter phrase to line up, and a single shared
        // generic word is never enough.
        if (overlap >= 2 && ratio >= 0.6) score = Math.round(ratio * 50) + overlap;
        else if (overlap === 1 && qTokens.length === 1 && qTokens[0].length >= 6 && ratio >= 0.5) score = 25;
      }

      if (score > bestScore) {
        bestScore = score;
        best = qa.answer;
      }
    }
    return bestScore > 0 ? best : null;
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

  /** Lookup profile key / customAnswers / customQA — never invent. */
  function answerForLabel(profile, label) {
    profile = profile || {};
    var raw = label == null ? '' : String(label).trim();
    if (!raw) return { value: null, missing: true };

    if (Object.prototype.hasOwnProperty.call(profile, raw) && !isBlank(profile[raw])) {
      return { value: String(profile[raw]).trim(), missing: false, source: 'profile.' + raw };
    }

    var labLower = raw.toLowerCase();
    // A field-map hit whose top-level profile value is empty is not the end of
    // the search: source profiles store the same answer under customAnswers.
    // Remember the key for the "missing" report and keep looking.
    var blankFieldMapKey = null;
    for (var i = 0; i < FIELD_MAP.length; i++) {
      var entry = FIELD_MAP[i];
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
        if (!blankFieldMapKey) blankFieldMapKey = entry.key;
      }
    }

    var cmap = profile.customAnswers;
    if (cmap && typeof cmap === 'object' && !Array.isArray(cmap)) {
      var keys = Object.keys(cmap);
      var best = null;
      var bestScore = 0;
      var bestKey = null;
      var nLab = raw.toLowerCase().replace(/\s+/g, ' ');
      var labTokens = contentTokens(nLab);
      for (var c = 0; c < keys.length; c++) {
        var k = keys[c];
        var nk = normalize(k);
        if (!nk) continue;
        var score = 0;
        if (nLab.indexOf(nk) !== -1 || nk.indexOf(nLab) !== -1) {
          score = 100 + Math.min(nk.length, nLab.length);
        } else {
          // customAnswers keys are camelCase ("noticePeriod"), so split them
          // before comparing against a human-readable page label.
          var keyTokens = contentTokens(String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
          if (!keyTokens.length || !labTokens.length) continue;
          var overlap = 0;
          for (var t = 0; t < keyTokens.length; t++) {
            if (labTokens.indexOf(keyTokens[t]) !== -1) overlap += 1;
          }
          var ratio = overlap / Math.min(keyTokens.length, labTokens.length);
          if (overlap >= 2 && ratio >= 0.6) score = Math.round(ratio * 50) + overlap;
          else if (overlap === 1 && keyTokens.length === 1 && keyTokens[0].length >= 6) score = 25;
        }
        if (score > bestScore) {
          bestScore = score;
          best = cmap[k];
          bestKey = k;
        }
      }
      if (bestKey != null && !isBlank(best)) {
        return { value: String(best).trim(), missing: false, source: 'customAnswers.' + bestKey };
      }
      if (bestKey != null && !blankFieldMapKey) blankFieldMapKey = bestKey;
    }

    var qa = matchCustomQA(profile.customQA, raw, '');
    if (!isBlank(qa)) return { value: String(qa).trim(), missing: false, source: 'customQA' };

    if (blankFieldMapKey) return { value: null, missing: true, key: blankFieldMapKey };
    return { value: null, missing: true };
  }

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
        'Missing profile field: ' + label + ' — fill in Options or on the page, then Resume'
    };
  }

    /* Label synonyms for actions/files also live in FillApplySynonyms (Resume≈CV, Apply≈Apply Now). */
  global.FillApplyFieldMap = {
    FIELD_MAP,
    normalize,
    contentTokens,
    scoreMatch,
    bestKeyForField,
    matchCustomQA,
    isBlank: isBlank,
    missingKeys: missingKeys,
    answerForLabel: answerForLabel,
    requireOrPause: requireOrPause
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
