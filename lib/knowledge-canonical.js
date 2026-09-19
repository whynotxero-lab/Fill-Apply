/**
 * Semantic identity for application questions.
 * Maps wording → canonical_key. Never supplies values.
 *
 * Attaches globalThis.FillApplyKnowledgeCanonical.
 */
(function (global) {
  'use strict';

  /** User-facing types (Options / Complete Missing Information). */
  var USER_FIELD_TYPES = ['boolean', 'string', 'number', 'date', 'select', 'multiselect'];

  /** Stored + legacy aliases accepted on read/write. */
  var FIELD_TYPES = ['boolean', 'string', 'number', 'date', 'select', 'multiselect', 'text', 'multi-select', 'url'];

  var TYPE_ALIASES = {
    text: 'string',
    string: 'string',
    'multi-select': 'multiselect',
    multiselect: 'multiselect',
    boolean: 'boolean',
    number: 'number',
    date: 'date',
    select: 'select',
    url: 'string'
  };

  function toUserFieldType(t) {
    var raw = String(t || 'string').toLowerCase();
    return TYPE_ALIASES[raw] || 'string';
  }

  function fromUserFieldType(t) {
    return toUserFieldType(t);
  }

  function normalizeFieldType(t) {
    return toUserFieldType(t);
  }

  var STOP_WORDS = {
    a: 1, an: 1, the: 1, is: 1, are: 1, do: 1, does: 1, did: 1, you: 1, your: 1,
    yours: 1, we: 1, us: 1, our: 1, to: 1, of: 1, in: 1, on: 1, at: 1, for: 1,
    with: 1, and: 1, or: 1, if: 1, please: 1, what: 1, which: 1, how: 1, have: 1,
    has: 1, will: 1, would: 1, can: 1, any: 1, this: 1, that: 1, be: 1, been: 1,
    me: 1, my: 1, i: 1, yes: 1, no: 1, not: 1, there: 1, their: 1, about: 1,
    from: 1, into: 1, also: 1, ever: 1, been: 1
  };

  var GENERIC_TOKENS = {
    experience: 1, experienced: 1, used: 1, using: 1, work: 1, working: 1,
    worked: 1, years: 1, year: 1, knowledge: 1, familiar: 1, familiarity: 1,
    skill: 1, skills: 1, able: 1, ability: 1, currently: 1, current: 1,
    previous: 1, previously: 1, prior: 1, question: 1, answer: 1, field: 1,
    apply: 1, application: 1, job: 1, role: 1, position: 1
  };

  /**
   * Built-in wording catalog. Keys only — values always come from the
   * applicant (profile or adaptive store). Distinctive token stems keep
   * willing_to_relocate ≠ requires_sponsorship even when both answers are Yes.
   */
  var CANONICAL_CATALOG = [
    {
      key: 'willing_to_relocate',
      profileKey: 'willingToRelocate',
      fieldType: 'boolean',
      aliases: [
        'willing to relocate',
        'are you willing to relocate',
        'would you relocate',
        'open to relocation',
        'can you relocate',
        'relocation',
        'able to relocate'
      ],
      stems: ['relocat']
    },
    {
      key: 'requires_sponsorship',
      profileKey: 'requiresSponsorship',
      fieldType: 'boolean',
      aliases: [
        'require sponsorship',
        'requires sponsorship',
        'need visa sponsorship',
        'do you require sponsorship',
        'will you require sponsorship',
        'visa sponsorship',
        'need sponsorship'
      ],
      stems: ['sponsor']
    },
    {
      key: 'authorized_to_work',
      profileKey: 'authorizedToWork',
      fieldType: 'boolean',
      aliases: [
        'authorized to work',
        'legally authorized',
        'eligible to work',
        'right to work',
        'work authorization',
        'permitted to work'
      ],
      stems: ['authoriz', 'eligib']
    },
    {
      key: 'sap_experience',
      fieldType: 'boolean',
      aliases: [
        'sap experience',
        'experience with sap',
        'experience in sap',
        'have you used sap',
        'do you have sap experience',
        'worked with sap',
        'sap',
        'familiar with sap'
      ],
      stems: ['sap']
    },
    {
      key: 'notice_period',
      profileKey: 'noticePeriod',
      fieldType: 'string',
      aliases: ['notice period', 'what is your notice period', 'availability notice'],
      stems: ['notice']
    },
    {
      key: 'current_salary',
      profileKey: 'currentSalary',
      fieldType: 'number',
      aliases: [
        'current salary',
        'current monthly salary',
        'what is your current salary',
        'what is your current monthly salary',
        'present salary',
        'current CTC',
        'current compensation'
      ],
      // Require current/present — never bare "salary" (collides with expected_salary)
      stems: ['current', 'present'],
      requireAll: [['salary', 'ctc', 'compensation', 'pay']]
    },
    {
      key: 'expected_salary',
      profileKey: 'expectedSalary',
      fieldType: 'number',
      aliases: [
        'expected salary',
        'salary expectation',
        'desired salary',
        'salary / ote',
        'expected CTC',
        'expected compensation',
        'target salary'
      ],
      stems: ['expected', 'desire', 'target', 'expectation'],
      requireAll: [['salary', 'ctc', 'compensation', 'ote', 'pay']]
    },
    {
      key: 'willing_to_travel',
      fieldType: 'boolean',
      aliases: [
        'willing to travel',
        'able to travel',
        'open to travel',
        'are you willing to travel',
        'can you travel'
      ],
      stems: ['travel']
    },
    {
      key: 'years_experience',
      profileKey: 'yearsExperience',
      fieldType: 'number',
      aliases: [
        'years of experience',
        'years experience',
        'total years of experience',
        'how many years of experience',
        'overall experience'
      ],
      stems: ['years'],
      requireAll: [['experience', 'exp']],
      excludeStems: ['manag', 'supervis', 'lead']
    },
    {
      key: 'management_experience',
      fieldType: 'boolean',
      aliases: [
        'management experience',
        'people management experience',
        'have you managed a team',
        'managerial experience'
      ],
      stems: ['manag', 'managerial'],
      requireAll: [['experience', 'managed']],
      excludeStems: ['supervis', 'size', 'largest', 'how many']
    },
    {
      key: 'remote_preference',
      profileKey: 'remotePreference',
      fieldType: 'select',
      aliases: ['remote preference', 'work from home', 'hybrid or remote'],
      stems: ['remote', 'hybrid']
    },
    {
      key: 'drivers_license',
      profileKey: 'driversLicense',
      fieldType: 'boolean',
      aliases: ['drivers license', 'driving licence', 'driving license', 'do you have a driving licence'],
      stems: ['licen']
    },
    {
      key: 'available_from',
      profileKey: 'availableFrom',
      fieldType: 'date',
      aliases: ['available from', 'start date', 'when can you start', 'available to start', 'when are you available to start'],
      stems: ['available', 'start']
    },
    {
      key: 'salary_currency',
      profileKey: 'salaryCurrency',
      fieldType: 'string',
      aliases: ['currency', 'salary currency', 'current salary currency', 'pay currency'],
      stems: ['currency']
    },
    {
      key: 'experience_level',
      profileKey: 'experienceLevel',
      fieldType: 'string',
      aliases: ['experience level', 'seniority', 'career level', 'what is your experience level'],
      stems: ['seniority']
    },
    {
      key: 'sector',
      profileKey: 'sector',
      fieldType: 'string',
      aliases: ['sector', 'which sector do you work in', 'which sector', 'industry sector'],
      stems: ['sector']
    },
    {
      key: 'sub_sector',
      profileKey: 'subSector',
      fieldType: 'string',
      aliases: ['sub-sector', 'sub sector', 'which sub-sector do you work in', 'which sub-sector'],
      stems: ['sub']
    },
    {
      key: 'middle_east_working_visa',
      profileKey: 'middleEastWorkingVisa',
      fieldType: 'boolean',
      aliases: [
        'do you currently have a working visa for the middle east',
        'working visa for the middle east',
        'middle east working visa',
        'middle east visa'
      ],
      stems: ['middle']
    },
    {
      key: 'title',
      profileKey: 'salutation',
      fieldType: 'select',
      aliases: [
        'title',
        'salutation',
        'name title',
        'courtesy title',
        'honorific',
        'prefix',
        'mr',
        'mr.',
        'mrs',
        'ms'
      ],
      stems: ['salutation', 'honorific', 'title'],
      excludeStems: ['job', 'current', 'position', 'role', 'designation']
    },
    {
      key: 'relatives_employed',
      fieldType: 'boolean',
      aliases: [
        'relatives employed',
        'relatives at company',
        'relative at company',
        'family employed',
        'do you have any relatives employed at this or any of our company locations',
        'do you have any relatives employed'
      ],
      stems: ['relative', 'relatives'],
      requireAll: [['employ', 'company', 'family', 'work']]
    },
    {
      key: 'former_team_member',
      fieldType: 'boolean',
      aliases: [
        'former team member',
        'are you a former team member',
        'previously employed here',
        'former employee',
        'ex employee'
      ],
      stems: ['former', 'team'],
      requireAll: [['member', 'employee', 'employ']]
    },
    {
      key: 'work_auth_no_permit',
      profileKey: 'authorizedToWork',
      fieldType: 'boolean',
      aliases: [
        'without having to obtain a working permit',
        'authorized to work without a permit',
        'proof that you are authorized to work',
        'working permit',
        'work permit'
      ],
      stems: ['permit'],
      requireAll: [['permit']]
    },
    {
      key: 'supervising_experience',
      fieldType: 'boolean',
      aliases: [
        'supervising teams',
        'leading or supervising teams',
        'do you have prior experience with leading or supervising teams',
        'supervising experience',
        'leadership experience',
        'people management experience'
      ],
      stems: ['supervis', 'leading'],
      requireAll: [['team', 'supervis', 'lead', 'manag']]
    },
    {
      key: 'finance_accounting_qualifications',
      fieldType: 'boolean',
      aliases: [
        'finance and/or accounting qualifications',
        'do you hold any finance and/or accounting qualifications',
        'finance qualifications',
        'accounting qualifications',
        'acca',
        'cma'
      ],
      stems: ['qualif', 'finance', 'account'],
      requireAll: [['qualif', 'finance', 'account', 'acca', 'cma']]
    },
    {
      key: 'address_line_1',
      profileKey: 'street',
      fieldType: 'string',
      aliases: [
        'address line 1',
        'address 1',
        'street address',
        'home address',
        'please enter your home address'
      ],
      stems: ['address'],
      requireAll: [['line', 'street', 'home', '1']],
      excludeStems: ['email', 'ip', 'web']
    },
    {
      key: 'address_line_2',
      profileKey: 'addressLine2',
      fieldType: 'string',
      aliases: ['address line 2', 'apt', 'suite', 'unit', 'street address 2'],
      stems: ['address'],
      requireAll: [['line', '2', 'apt', 'suite', 'unit']]
    },
    {
      key: 'address_country',
      profileKey: 'country',
      fieldType: 'select',
      aliases: ['address country', 'country of residence', 'residence country'],
      stems: ['country'],
      requireAll: [['address', 'residence', 'country']]
    },
    {
      key: 'country',
      profileKey: 'country',
      fieldType: 'select',
      aliases: ['country', 'country of residence', 'location country'],
      stems: ['country'],
      excludeStems: ['phone', 'dial', 'code', 'calling']
    },
    {
      key: 'province',
      profileKey: 'state',
      fieldType: 'select',
      aliases: ['province', 'state', 'state/province', 'region', 'emirate'],
      stems: ['province', 'state', 'region', 'emirate']
    },
    {
      key: 'city',
      profileKey: 'city',
      fieldType: 'string',
      aliases: ['city', 'town', 'current city', 'location (city)', 'city or town', 'what city or town do you live in'],
      stems: ['city', 'town']
    },
    {
      key: 'nationality',
      profileKey: 'nationality',
      fieldType: 'select',
      aliases: ['nationality', 'citizenship', 'country of citizenship'],
      stems: ['national', 'citizen']
    },
    {
      key: 'gender',
      profileKey: 'gender',
      fieldType: 'select',
      aliases: ['gender', 'gender identity', 'sex'],
      stems: ['gender', 'sex']
    },
    {
      key: 'middle_name',
      profileKey: 'middleName',
      fieldType: 'string',
      aliases: ['middle name', 'middle initial'],
      stems: ['middle']
    }
  ];

  /** Pairs that must never share an answer via weak substring matching. */
  var SEMANTIC_EXCLUSIONS = [
    ['current_salary', 'expected_salary'],
    ['years_experience', 'management_experience'],
    ['years_experience', 'supervising_experience'],
    ['management_experience', 'supervising_experience'],
    ['willing_to_relocate', 'willing_to_travel'],
    ['authorized_to_work', 'requires_sponsorship'],
    ['authorized_to_work', 'work_auth_no_permit'],
    ['country', 'address_country'],
    ['country', 'phone_country'],
    ['address_country', 'phone_country'],
    ['title', 'current_title'],
    ['address_line_1', 'location'],
    ['address_line_2', 'location'],
    ['street', 'location']
  ];

  function normalize(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/[^a-z0-9\u0600-\u06ff ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function contentTokens(str) {
    return normalize(str)
      .split(/\s+/)
      .filter(function (t) {
        return t && t.length > 1 && !STOP_WORDS[t];
      });
  }

  function slugFromTokens(tokens) {
    var distinctive = (tokens || []).filter(function (t) {
      return !GENERIC_TOKENS[t] || t.length >= 8;
    });
    if (!distinctive.length) distinctive = tokens || [];
    return distinctive.slice(0, 4).join('_') || 'unknown_field';
  }

  function deriveCanonicalKey(label) {
    var tokens = contentTokens(label);
    var slug = slugFromTokens(tokens);
    var entry = catalogEntry(slug);
    // Avoid deriving "title" from "Current job title" when catalog title rejects it
    if (
      entry &&
      (excludeStemsHit(entry.excludeStems, label) ||
        !stemsHit(entry.stems, label) ||
        !requireAllHit(entry.requireAll, label))
    ) {
      return tokens.slice(0, 4).join('_') || 'unknown_field';
    }
    return slug;
  }

  function catalogEntry(key) {
    for (var i = 0; i < CANONICAL_CATALOG.length; i++) {
      if (CANONICAL_CATALOG[i].key === key) return CANONICAL_CATALOG[i];
    }
    return null;
  }

  function profileKeyFor(canonicalKey) {
    var entry = catalogEntry(canonicalKey);
    return entry && entry.profileKey ? entry.profileKey : null;
  }

  function stemsHit(stems, hay) {
    if (!stems || !stems.length) return true;
    var n = normalize(hay);
    for (var i = 0; i < stems.length; i++) {
      if (n.indexOf(stems[i]) !== -1) return true;
    }
    return false;
  }

  /** Optional: at least one token from each group in requireAll must appear. */
  function requireAllHit(requireAll, hay) {
    if (!requireAll || !requireAll.length) return true;
    var n = normalize(hay);
    for (var g = 0; g < requireAll.length; g++) {
      var group = requireAll[g] || [];
      var ok = false;
      for (var i = 0; i < group.length; i++) {
        if (n.indexOf(group[i]) !== -1) {
          ok = true;
          break;
        }
      }
      if (!ok) return false;
    }
    return true;
  }

  function excludeStemsHit(excludeStems, hay) {
    if (!excludeStems || !excludeStems.length) return false;
    var n = normalize(hay);
    for (var i = 0; i < excludeStems.length; i++) {
      if (n.indexOf(excludeStems[i]) !== -1) return true;
    }
    return false;
  }

  function isExcludedPair(a, b) {
    if (!a || !b || a === b) return false;
    for (var i = 0; i < SEMANTIC_EXCLUSIONS.length; i++) {
      var pair = SEMANTIC_EXCLUSIONS[i];
      if ((pair[0] === a && pair[1] === b) || (pair[0] === b && pair[1] === a)) return true;
    }
    return false;
  }

  /**
   * Score how well a label matches a set of aliases (content-word overlap).
   */
  /**
   * Score wording against aliases. Exact / near-exact only for strong hits.
   * Bare generics ("salary", "experience") must NOT score high just because
   * a longer alias contains them.
   */
  function aliasScore(label, aliases) {
    var hay = normalize(label);
    if (!hay) return 0;
    var hayTokens = contentTokens(hay);
    var best = 0;
    (aliases || []).forEach(function (alias) {
      var q = normalize(alias);
      if (!q) return;
      var score = 0;
      var qTokens = contentTokens(q);
      if (hay === q) {
        score = 200;
      } else if (hay.indexOf(q) !== -1) {
        // Full alias inside the question. Short single tokens inside longer
        // phrases are weak (Title ⊂ "Current job title") — below learned gate.
        if (qTokens.length === 1 && hayTokens.length > 1 && q.length <= 10) {
          score = 40;
        } else {
          score = 100 + Math.min(q.length, hay.length);
        }
      } else if (q.indexOf(hay) !== -1) {
        // Question is a substring of an alias — only strong when the hay
        // itself is multi-token / distinctive (not bare "salary").
        if (hayTokens.length >= 2 || (hayTokens.length === 1 && hayTokens[0].length >= 8 && !AMBIGUOUS_BARE[hayTokens[0]])) {
          score = 90 + Math.min(q.length, hay.length);
        } else {
          score = 0;
        }
      } else {
        if (!qTokens.length || !hayTokens.length) return;
        var overlap = 0;
        qTokens.forEach(function (t) {
          if (hayTokens.indexOf(t) !== -1) overlap += 1;
        });
        var ratio = overlap / Math.min(qTokens.length, hayTokens.length);
        if (overlap >= 2 && ratio >= 0.6) score = Math.round(ratio * 50) + overlap;
        else if (
          overlap === 1 &&
          qTokens.length === 1 &&
          qTokens[0].length >= 6 &&
          !AMBIGUOUS_BARE[qTokens[0]] &&
          !AMBIGUOUS_BARE[hayTokens[0]]
        ) {
          score = 30;
        }
      }
      if (score > best) best = score;
    });
    return best;
  }

  /**
   * Single-token wordings that are never specific enough to pick a key alone.
   * Matching these to a catalog/learned key silently is forbidden.
   */
  var AMBIGUOUS_BARE = {
    salary: 1,
    compensation: 1,
    pay: 1,
    ctc: 1,
    experience: 1,
    authorization: 1,
    authorisation: 1,
    sponsorship: 1,
    travel: 1,
    relocation: 1,
    relocate: 1
  };

  /** Evidence layers — higher priority wins; name/id never define identity; soft metadata never manufactures ambiguity. */
  var EVIDENCE_PRIORITY = [
    'question',
    'label',
    'ariaLabel',
    'groupContext',
    'placeholder',
    'autocomplete',
    'name',
    'id'
  ];

  function emptyEvidence() {
    return {
      label: '',
      question: '',
      placeholder: '',
      name: '',
      id: '',
      autocomplete: '',
      ariaLabel: '',
      groupContext: '',
      controlType: '',
      options: []
    };
  }

  /**
   * Build a structured evidence object. Fields stay SEPARATE — never concatenate
   * into one unrestricted matcher string (that let name/id override label).
   */
  function buildEvidence(descriptor, el) {
    var e = emptyEvidence();
    if (!descriptor && !el) return e;
    descriptor = descriptor || {};
    e.label = String(descriptor.label || '').trim();
    e.question = String(descriptor.question || '').trim();
    e.placeholder = String(descriptor.placeholder || '').trim();
    e.name = String(descriptor.name || '').trim();
    e.id = String(descriptor.id || '').trim();
    e.autocomplete = String(descriptor.autocomplete || '').trim();
    e.ariaLabel = String(descriptor.ariaLabel || '').trim();
    e.groupContext = String(descriptor.groupContext || descriptor.fieldset || '').trim();
    e.controlType = String(
      descriptor.controlType ||
        detectControlType(el || null, descriptor) ||
        descriptor.type ||
        ''
    ).trim();
    e.options = descriptor.options || (el ? optionsFromEl(el) : []) || [];
    if (el && el.getAttribute) {
      if (!e.ariaLabel) {
        try {
          e.ariaLabel = String(el.getAttribute('aria-label') || '').trim();
        } catch (_a) { /* ignore */ }
      }
      if (!e.groupContext && el.closest) {
        try {
          var fs = el.closest('fieldset');
          if (fs) {
            var leg = fs.querySelector('legend');
            if (leg) e.groupContext = String(leg.textContent || '').replace(/\s+/g, ' ').trim();
          }
        } catch (_g) { /* ignore */ }
      }
    }
    return e;
  }

  function isAmbiguousBareWording(text) {
    var tokens = contentTokens(text);
    if (tokens.length === 1 && AMBIGUOUS_BARE[tokens[0]]) return true;
    // "Salary?" / "Compensation:" after normalize
    var n = normalize(text);
    if (AMBIGUOUS_BARE[n]) return true;
    return false;
  }

  function areCompetingKeys(a, b) {
    if (!a || !b || a === b) return false;
    if (isExcludedPair(a, b)) return true;
    // Same stem family collisions already covered by SEMANTIC_EXCLUSIONS.
    return false;
  }

  /**
   * Match ONE wording string against catalog + learned aliases.
   * Does not invent identity from DOM name/id patterns unless allowDerive.
   */
  function matchWording(text, extras) {
    extras = extras || {};
    var hay = String(text || '').trim();
    if (!normalize(hay)) {
      return { key: null, score: 0, source: null, fieldType: null, profileKey: null, ambiguous: false, candidateKeys: [] };
    }

    if (isAmbiguousBareWording(hay) && !extras.allowAmbiguousBare) {
      // Which catalog keys could claim this bare token?
      var maybe = [];
      var n = normalize(hay);
      CANONICAL_CATALOG.forEach(function (entry) {
        var related = false;
        if (stemsHit(entry.stems, hay) && requireAllHit(entry.requireAll, hay) && !excludeStemsHit(entry.excludeStems, hay)) {
          related = true;
        }
        (entry.aliases || []).concat([entry.key.replace(/_/g, ' ')]).forEach(function (a) {
          var an = normalize(a);
          // Exact alias/key equality with the bare token
          if (an === n) related = true;
          // Bare token is a content word of a multi-word alias (e.g. "travel" in "willing to travel")
          var toks = contentTokens(a);
          if (toks.length >= 1 && toks.indexOf(n) !== -1) related = true;
        });
        if (related && maybe.indexOf(entry.key) === -1) maybe.push(entry.key);
      });
      // Also check exclusion-pair siblings for this token family
      if (n === 'salary' || n === 'compensation' || n === 'pay' || n === 'ctc') {
        maybe = ['current_salary', 'expected_salary'];
      }
      if (n === 'experience') {
        maybe = ['years_experience', 'management_experience'];
      }
      // Unique catalog claim (travel→travel, relocation→relocate, sponsorship→sponsorship) is OK
      if (maybe.length === 1) {
        var only = catalogEntry(maybe[0]);
        return {
          key: maybe[0],
          score: 120,
          source: 'catalog',
          fieldType: only && only.fieldType,
          profileKey: only && only.profileKey ? only.profileKey : null,
          ambiguous: false,
          candidateKeys: maybe,
          matchedEvidenceHint: 'bare_unique'
        };
      }
      // Multiple competing keys → AMBIGUOUS (no silent wrong key)
      return {
        key: null,
        score: 0,
        source: null,
        fieldType: null,
        profileKey: null,
        ambiguous: true,
        reason: 'ambiguous_bare_label',
        candidateKeys: maybe
      };
    }

    var candidates = [];
    var best = { key: null, score: 0, source: null, fieldType: null, profileKey: null, ambiguous: false, candidateKeys: [] };

    CANONICAL_CATALOG.forEach(function (entry) {
      if (!stemsHit(entry.stems, hay)) return;
      if (!requireAllHit(entry.requireAll, hay)) return;
      if (excludeStemsHit(entry.excludeStems, hay)) return;
      var score = aliasScore(hay, entry.aliases.concat([entry.key.replace(/_/g, ' ')]));
      if (score > 0) {
        candidates.push({ key: entry.key, score: score, source: 'catalog', fieldType: entry.fieldType, profileKey: entry.profileKey || null });
      }
      if (score > best.score) {
        best = {
          key: entry.key,
          score: score,
          source: 'catalog',
          fieldType: entry.fieldType,
          profileKey: entry.profileKey || null,
          ambiguous: false,
          candidateKeys: []
        };
      }
    });

    var learned = (extras && extras.records) || [];
    learned.forEach(function (rec) {
      if (!rec || !rec.canonicalKey) return;
      var aliases = (rec.aliases || []).concat([String(rec.canonicalKey).replace(/_/g, ' ')]);
      if (rec.lastSeenLabel) aliases.push(rec.lastSeenLabel);
      var score = aliasScore(hay, aliases);
      // Learned aliases: require strong score (≥ 90). Never fuzzy bare salary/relocation↔travel.
      if (score < 90) return;
      candidates.push({
        key: rec.canonicalKey,
        score: score,
        source: 'learned',
        fieldType: rec.fieldType || null,
        profileKey: profileKeyFor(rec.canonicalKey)
      });
      if (score > best.score) {
        best = {
          key: rec.canonicalKey,
          score: score,
          source: 'learned',
          fieldType: rec.fieldType || null,
          profileKey: profileKeyFor(rec.canonicalKey),
          ambiguous: false,
          candidateKeys: []
        };
      }
    });

    // Competing near-tied keys → AMBIGUOUS (with bare-label preferences)
    var strong = candidates.filter(function (c) {
      return c.score >= 90 && (!best.key || c.score >= best.score - 20);
    });
    var uniqKeys = [];
    strong.forEach(function (c) {
      if (uniqKeys.indexOf(c.key) === -1) uniqKeys.push(c.key);
    });
    if (uniqKeys.length > 1) {
      var top = strong.slice().sort(function (a, b) { return b.score - a.score; });
      var hayN = normalize(hay);
      // Bare residence labels: prefer country over address_country / phone_country
      if (hayN === 'country' || hayN === 'title' || hayN === 'city' || hayN === 'province' || hayN === 'state') {
        var preferKey = hayN === 'state' ? 'province' : hayN;
        var preferHit = null;
        for (var pi = 0; pi < top.length; pi++) {
          if (top[pi].key === preferKey) {
            preferHit = top[pi];
            break;
          }
        }
        if (!preferHit) {
          preferHit = top.slice().sort(function (a, b) {
            return String(a.key).length - String(b.key).length;
          })[0];
        }
        if (preferHit && preferHit.key) {
          return {
            key: preferHit.key,
            score: preferHit.score,
            source: preferHit.source,
            fieldType: preferHit.fieldType,
            profileKey: preferHit.profileKey || profileKeyFor(preferHit.key),
            ambiguous: false,
            candidateKeys: uniqKeys,
            matchedEvidenceHint: 'bare_prefer_short'
          };
        }
      }
      if (top.length >= 2 && top[0].score - top[1].score < 30 && areCompetingKeys(top[0].key, top[1].key)) {
        return {
          key: null,
          score: 0,
          source: null,
          fieldType: null,
          profileKey: null,
          ambiguous: true,
          reason: 'competing_keys',
          candidateKeys: uniqKeys
        };
      }
      if (uniqKeys.length > 1 && top[0].score === top[1].score) {
        return {
          key: null,
          score: 0,
          source: null,
          fieldType: null,
          profileKey: null,
          ambiguous: true,
          reason: 'competing_keys',
          candidateKeys: uniqKeys
        };
      }
    }

    if (best.score > 0) {
      best.candidateKeys = uniqKeys.length ? uniqKeys : [best.key];
      return best;
    }

    if (extras.allowDerive === false) {
      return { key: null, score: 0, source: null, fieldType: null, profileKey: null, ambiguous: false, candidateKeys: [] };
    }

    var derived = deriveCanonicalKey(hay);
    return {
      key: derived,
      score: derived && derived !== 'unknown_field' ? 10 : 0,
      source: 'derived',
      fieldType: extras && extras.fieldType ? normalizeFieldType(extras.fieldType) : 'string',
      profileKey: null,
      derived: true,
      ambiguous: false,
      candidateKeys: derived ? [derived] : []
    };
  }

  /**
   * True when a hit is decisive semantic evidence (catalog/learned, not weak derive).
   * Used to detect genuine disagreement between meaningful layers.
   */
  function isDecisiveHit(hit) {
    if (!hit || !hit.key || hit.ambiguous) return false;
    if (hit.derived) return false;
    if (hit.source !== 'catalog' && hit.source !== 'learned') return false;
    return (hit.score || 0) >= 90;
  }

  /**
   * Resolve semantic identity from structured evidence.
   *
   * Policy (v1.17.5):
   *   1. Higher-priority semantic evidence determines identity when decisive.
   *   2. Lower-priority name/id NEVER overrides that identity.
   *   3. Lower-priority contradictory metadata (placeholder/autocomplete/name/id)
   *      must NOT manufacture ambiguity when a higher-priority question is already decisive.
   *   4. Meaningful layers (question/label vs aria/group): if they genuinely disagree
   *      → AMBIGUOUS / DO_NOT_FILL (no guess).
   *   5. DOM name/id alone never defines canonical identity.
   *
   * Priority: question/label → ariaLabel → groupContext → placeholder → autocomplete
   * → name/id (diagnostics only; never identity).
   * Canonical key comes from the resolved semantic question — not DOM id/name.
   */
  function resolveFromEvidence(evidence, extras) {
    extras = extras || {};
    evidence = evidence || emptyEvidence();
    var candidateKeys = [];
    var matchedEvidence = null;
    var winner = null;

    function consider(layerName, text, opts) {
      if (!text || !String(text).trim()) return;
      var hit = matchWording(text, Object.assign({}, extras, opts || {}));
      if (hit && hit.candidateKeys) {
        hit.candidateKeys.forEach(function (k) {
          if (k && candidateKeys.indexOf(k) === -1) candidateKeys.push(k);
        });
      }
      if (hit && hit.ambiguous) {
        return { ambiguous: true, hit: hit, layer: layerName };
      }
      if (hit && hit.key && hit.score > 0) {
        return { ambiguous: false, hit: hit, layer: layerName };
      }
      return null;
    }

    function ambiguousResult(reason, layer, keys, fieldType) {
      return {
        key: null,
        semanticKey: null,
        score: 0,
        source: null,
        fieldType: fieldType != null
          ? fieldType
          : extras.fieldType
            ? normalizeFieldType(extras.fieldType)
            : null,
        profileKey: null,
        ambiguous: true,
        action: 'DO_NOT_FILL',
        reason: reason || 'ambiguous',
        matchedEvidence: layer || matchedEvidence,
        candidateKeys: keys || candidateKeys,
        evidence: evidence
      };
    }

    // Priority 1: visible question / associated label
    var primaryTexts = [];
    if (evidence.question) primaryTexts.push({ layer: 'question', text: evidence.question });
    if (evidence.label && evidence.label !== evidence.question) {
      primaryTexts.push({ layer: 'label', text: evidence.label });
    } else if (evidence.label && !evidence.question) {
      primaryTexts.push({ layer: 'label', text: evidence.label });
    }

    for (var p = 0; p < primaryTexts.length; p++) {
      var prim = consider(primaryTexts[p].layer, primaryTexts[p].text, { allowDerive: true });
      if (!prim) continue;
      if (prim.ambiguous) {
        // Bare ambiguous primary stays AMBIGUOUS — name/id cannot rescue it.
        return ambiguousResult(
          (prim.hit && prim.hit.reason) || 'ambiguous',
          prim.layer,
          (prim.hit && prim.hit.candidateKeys) || candidateKeys,
          extras.fieldType ? normalizeFieldType(extras.fieldType) : null
        );
      }
      if (!winner) {
        winner = prim.hit;
        matchedEvidence = prim.layer;
      } else if (prim.hit.key !== winner.key && isDecisiveHit(prim.hit) && isDecisiveHit(winner)) {
        // Two primary signals disagree strongly
        return ambiguousResult('primary_conflict', matchedEvidence, [winner.key, prim.hit.key], null);
      } else if (
        prim.hit.key !== winner.key &&
        areCompetingKeys(prim.hit.key, winner.key)
      ) {
        return ambiguousResult('primary_conflict', matchedEvidence, [winner.key, prim.hit.key], null);
      }
    }

    // Meaningful layers (aria / group): may establish identity if none yet;
    // if they genuinely disagree with a decisive higher winner → AMBIGUOUS.
    var meaningful = [
      { layer: 'ariaLabel', text: evidence.ariaLabel, allowDerive: true },
      { layer: 'groupContext', text: evidence.groupContext, allowDerive: true }
    ];
    for (var m = 0; m < meaningful.length; m++) {
      var mean = consider(meaningful[m].layer, meaningful[m].text, {
        allowDerive: meaningful[m].allowDerive
      });
      if (!mean) continue;
      if (mean.ambiguous) {
        // Ambiguous bare on aria/group only blocks when nothing higher decided.
        if (!winner) {
          return ambiguousResult(
            (mean.hit && mean.hit.reason) || 'ambiguous',
            mean.layer,
            (mean.hit && mean.hit.candidateKeys) || candidateKeys,
            null
          );
        }
        // Higher priority already decisive — do not manufacture ambiguity from bare aria/group.
        continue;
      }
      if (!winner) {
        winner = mean.hit;
        matchedEvidence = mean.layer;
        continue;
      }
      // Genuine disagreement between decisive meaningful layers → AMBIGUOUS
      if (
        mean.hit.key &&
        mean.hit.key !== winner.key &&
        isDecisiveHit(mean.hit) &&
        (isDecisiveHit(winner) || areCompetingKeys(mean.hit.key, winner.key))
      ) {
        return ambiguousResult(
          'meaningful_layer_conflict',
          matchedEvidence,
          [winner.key, mean.hit.key],
          null
        );
      }
      // else: non-decisive / non-competing secondary — ignore (no override)
    }

    // Soft metadata (placeholder / autocomplete): fill gap only.
    // Never override; never manufacture ambiguity when higher is decisive.
    var soft = [
      { layer: 'placeholder', text: evidence.placeholder, allowDerive: false },
      { layer: 'autocomplete', text: evidence.autocomplete, allowDerive: false }
    ];
    for (var s = 0; s < soft.length; s++) {
      var sec = consider(soft[s].layer, soft[s].text, { allowDerive: soft[s].allowDerive });
      if (!sec || sec.ambiguous) continue;
      if (!winner) {
        winner = sec.hit;
        matchedEvidence = sec.layer;
      }
      // Conflicting soft metadata vs decisive winner: higher wins; no ambiguity.
    }

    // name / id — diagnostics / candidate collection only.
    // NEVER define canonical identity; NEVER override; NEVER manufacture ambiguity.
    var domLayers = [
      { layer: 'name', text: evidence.name },
      { layer: 'id', text: evidence.id }
    ];
    for (var d = 0; d < domLayers.length; d++) {
      var raw = domLayers[d].text;
      if (!raw) continue;
      var humanized = String(raw).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
      // consider() still folds catalog candidates into candidateKeys for diagnostics
      consider(domLayers[d].layer, humanized, { allowDerive: false, allowAmbiguousBare: false });
      // Intentionally never assign winner from name/id alone.
    }

    if (!winner || !winner.key) {
      return {
        key: null,
        semanticKey: null,
        score: 0,
        source: null,
        fieldType: extras.fieldType ? normalizeFieldType(extras.fieldType) : null,
        profileKey: null,
        ambiguous: false,
        action: 'DO_NOT_FILL',
        reason: 'unresolved',
        matchedEvidence: null,
        candidateKeys: candidateKeys,
        evidence: evidence
      };
    }

    return {
      key: winner.key,
      semanticKey: winner.key,
      score: winner.score,
      source: winner.source,
      fieldType: winner.fieldType || (extras.fieldType ? normalizeFieldType(extras.fieldType) : null),
      profileKey: winner.profileKey || profileKeyFor(winner.key),
      derived: !!winner.derived,
      ambiguous: false,
      action: 'FILL',
      reason: 'resolved',
      matchedEvidence: matchedEvidence,
      candidateKeys: candidateKeys.length ? candidateKeys : [winner.key],
      evidence: evidence
    };
  }

  /**
   * Resolve a page label (and optional extras) to a canonical key.
   * Prefer resolveFromEvidence when a full descriptor is available.
   * extraRecords: learned knowledge rows whose .aliases should also match.
   */
  function matchCanonical(label, extras) {
    extras = extras || {};
    // Backward compatible: if extras carries structured evidence / descriptor fields,
    // use the evidence model. Never concatenate label+name+id into one matcher.
    if (extras.evidence) {
      return resolveFromEvidence(extras.evidence, extras);
    }
    if (extras.descriptor) {
      return resolveFromEvidence(buildEvidence(extras.descriptor), extras);
    }
    // Label-only (or explicit also[] for non-DOM hints — still NOT name/id override)
    var also = extras.also || [];
    // If caller passed DOM name/id via also (legacy), ignore them for identity —
    // only allow placeholder-like secondary text when labelled as such.
    if (also.length) {
      var evidence = buildEvidence({
        label: label,
        placeholder: extras.placeholder || '',
        ariaLabel: extras.ariaLabel || '',
        question: extras.question || '',
        groupContext: extras.groupContext || '',
        autocomplete: extras.autocomplete || '',
        name: extras.name || '',
        id: extras.id || '',
        type: extras.fieldType || extras.type || ''
      });
      // Legacy `also` may include placeholder; fold first non-empty into placeholder if unset
      if (!evidence.placeholder && also[0] && also[0] !== label) {
        // Do not treat also[0] as name — callers historically passed placeholder, name.
        // Prefer resolveFromEvidence when name/id provided explicitly on extras.
      }
      if (extras.name || extras.id || extras.placeholder || extras.ariaLabel) {
        return resolveFromEvidence(evidence, extras);
      }
    }
    return matchWording(label, extras);
  }

  function normalizeValue(value, fieldType) {
    if (value == null) return '';
    var ft = normalizeFieldType(fieldType);
    if (ft === 'multiselect' && Array.isArray(value)) {
      return value.map(function (v) { return String(v).trim(); }).filter(Boolean).join('; ');
    }
    var s = String(value).trim();
    if (ft === 'boolean') {
      if (/^(yes|true|1|on|y|checked)$/i.test(s)) return 'Yes';
      if (/^(no|false|0|off|n)$/i.test(s)) return 'No';
    }
    return s;
  }

  function isValidFieldType(t) {
    var raw = String(t || '').toLowerCase();
    return !!TYPE_ALIASES[raw] || FIELD_TYPES.indexOf(raw) !== -1;
  }

  function inferFieldType(el, descriptor) {
    var control = detectControlType(el, descriptor);
    if (control === 'checkbox' || control === 'radio') {
      // Radio groups with Yes/No are boolean knowledge; richer option sets are select.
      if (control === 'checkbox') return 'boolean';
      var opts = (descriptor && descriptor.options) || optionsFromEl(el) || [];
      if (isYesNoOptions(opts)) return 'boolean';
      return 'select';
    }
    if (control === 'number') return 'number';
    if (control === 'date') return 'date';
    if (control === 'select') return 'select';
    if (control === 'multiselect') return 'multiselect';
    if (control === 'combobox' || control === 'custom') return 'select';
    return 'string';
  }

  function optionsFromEl(el) {
    if (!el || el.tagName !== 'SELECT' || !el.options) return [];
    var out = [];
    for (var i = 0; i < el.options.length; i++) {
      out.push({
        value: el.options[i].value,
        text: String(el.options[i].textContent || '').replace(/\s+/g, ' ').trim()
      });
    }
    return out;
  }

  /**
   * Real DOM / ARIA control semantics. Knowledge Type must not override this.
   * Returns: text|email|tel|number|date|url|checkbox|radio|select|multiselect|
   *          textarea|combobox|custom
   */
  function detectControlType(el, descriptor) {
    var type = String(
      (descriptor && descriptor.type) || (el && el.type) || ''
    ).toLowerCase();
    var tag = String((el && el.tagName) || (descriptor && descriptor.tag) || '').toUpperCase();
    var role = '';
    try {
      role = String((el && el.getAttribute && el.getAttribute('role')) || (descriptor && descriptor.role) || '').toLowerCase();
    } catch (_e) {
      role = '';
    }

    if (type === 'checkbox' || role === 'checkbox') return 'checkbox';
    if (type === 'radio' || role === 'radio') return 'radio';
    if (type === 'email') return 'email';
    if (type === 'tel') return 'tel';
    if (type === 'url') return 'url';
    if (type === 'number' || type === 'range') return 'number';
    if (type === 'date' || type === 'datetime-local' || type === 'month' || type === 'week') return 'date';
    if (tag === 'TEXTAREA' || type === 'textarea') return 'textarea';
    if (tag === 'SELECT' || type === 'select' || type === 'select-one') {
      if ((el && el.multiple) || type === 'select-multiple') return 'multiselect';
      return 'select';
    }
    if (role === 'combobox' || role === 'listbox') return 'combobox';
    if (
      (el && el.getAttribute && (el.getAttribute('aria-autocomplete') || el.getAttribute('aria-haspopup') === 'listbox')) ||
      (descriptor && descriptor.combobox)
    ) {
      return 'combobox';
    }
    if (role === 'button' && descriptor && (descriptor.options || []).length) return 'custom';
    if (type === 'text' || type === 'search' || type === 'password' || !type) return 'text';
    return type || 'text';
  }

  function isYesNoOptions(options) {
    var texts = (options || [])
      .map(function (o) {
        return normalize(o && (o.text != null ? o.text : o.label != null ? o.label : o.value != null ? o.value : o));
      })
      .filter(function (t) {
        return t && !/^(select|choose|please|--|–|—)/.test(t);
      });
    if (texts.length < 2) return false;
    var hasYes = texts.some(function (t) {
      return /^(yes|y|true|1)$/.test(t);
    });
    var hasNo = texts.some(function (t) {
      return /^(no|n|false|0)$/.test(t) && !/not sure|unknown/.test(t);
    });
    return hasYes && hasNo && texts.length <= 4;
  }

  function optionLabels(options) {
    return (options || [])
      .map(function (o) {
        if (o == null) return '';
        if (typeof o === 'string') return String(o).trim();
        return String(o.text != null ? o.text : o.label != null ? o.label : o.value != null ? o.value : '').trim();
      })
      .filter(Boolean);
  }

  /**
   * Knowledge value+type vs DOM control+options. Incompatible → do not fill.
   */
  function isTypeCompatible(knowledgeType, controlType, value, options) {
    var kt = normalizeFieldType(knowledgeType || 'string');
    var ct = String(controlType || 'text').toLowerCase();
    var v = value == null ? '' : String(value).trim();
    if (!v) return { ok: false, reason: 'empty_value' };

    if (ct === 'checkbox') {
      if (kt === 'boolean' || /^(yes|no|true|false|1|0|on|off|y|n)$/i.test(v)) {
        return { ok: true, reason: 'checkbox_boolean' };
      }
      return { ok: false, reason: 'checkbox_needs_boolean' };
    }

    if (ct === 'select' || ct === 'radio' || ct === 'combobox' || ct === 'custom' || ct === 'multiselect') {
      var labels = optionLabels(options);
      if (!labels.length) {
        // Options unknown yet (custom/combobox) — allow boolean Yes/No and non-empty select knowledge
        if (kt === 'boolean' || /^(yes|no)$/i.test(v)) return { ok: true, reason: 'boolean_without_options' };
        if (kt === 'select' || kt === 'multiselect' || kt === 'string' || kt === 'number') {
          return { ok: true, reason: 'options_deferred' };
        }
        return { ok: false, reason: 'select_incompatible_knowledge' };
      }
      // Closed Yes/No lists: only boolean-like values (never free-text names etc.)
      if (isYesNoOptions(options)) {
        if (kt === 'boolean' || /^(yes|no|true|false|y|n|1|0)$/i.test(v)) {
          if (findOptionMatch(labels, v)) return { ok: true, reason: 'boolean_select' };
          return { ok: false, reason: 'boolean_no_matching_option' };
        }
        return { ok: false, reason: 'no_matching_option' };
      }
      if (findOptionMatch(labels, v)) return { ok: true, reason: 'option_match' };
      // Non-boolean selects: allow through so format/variants/bucket matching can run.
      // setNativeValue still refuses free-text when no option ultimately matches.
      if (kt === 'boolean') {
        return { ok: false, reason: 'boolean_into_non_boolean_select' };
      }
      return { ok: true, reason: 'select_deferred_match' };
    }

    if (ct === 'number') {
      if (kt === 'boolean') return { ok: false, reason: 'boolean_into_number' };
      var num = coerceNumber(v);
      if (num === '') return { ok: false, reason: 'not_numeric' };
      return { ok: true, reason: 'number_ok', value: num };
    }

    if (ct === 'date') {
      if (kt === 'boolean') return { ok: false, reason: 'boolean_into_date' };
      var iso = coerceDate(v);
      if (!iso) return { ok: false, reason: 'not_date' };
      return { ok: true, reason: 'date_ok', value: iso };
    }

    if (ct === 'email') {
      if (kt === 'boolean' || kt === 'number') return { ok: false, reason: 'wrong_type_for_email' };
      return { ok: true, reason: 'email_ok' };
    }

    if (ct === 'tel' || ct === 'url' || ct === 'text' || ct === 'textarea') {
      if (kt === 'boolean' && ct !== 'text' && ct !== 'textarea') {
        // Allow Yes/No into plain text boxes (some ATS use text for Y/N)
        return { ok: true, reason: 'boolean_as_text' };
      }
      return { ok: true, reason: 'textish_ok' };
    }

    return { ok: true, reason: 'default_ok' };
  }

  function optionBoundaryContains(longer, shorter) {
    if (!longer || !shorter) return false;
    if (longer === shorter) return true;
    if (shorter.length < 3) return false;
    // Whole-token / hyphen boundary only — never male⊂female, yes⊂yesterday
    if (longer.indexOf(shorter) === -1) return false;
    return (
      longer.indexOf(shorter + ' ') === 0 ||
      longer.lastIndexOf(' ' + shorter) === longer.length - shorter.length - 1 ||
      longer.indexOf(shorter + '-') === 0 ||
      longer.lastIndexOf('-' + shorter) === longer.length - shorter.length - 1 ||
      (' ' + longer + ' ').indexOf(' ' + shorter + ' ') !== -1
    );
  }

  function findOptionMatch(labels, value) {
    var want = normalize(value);
    var wantBool = null;
    if (/^(yes|true|1|y)$/.test(want)) wantBool = 'yes';
    if (/^(no|false|0|n)$/.test(want)) wantBool = 'no';
    for (var i = 0; i < labels.length; i++) {
      var t = normalize(labels[i]);
      if (!t || /^(select|choose|please|--)/.test(t)) continue;
      if (t === want) return labels[i];
      if (wantBool === 'yes' && /^(yes|y|true|1)$/.test(t)) return labels[i];
      if (wantBool === 'no' && /^(no|n|false|0)$/.test(t) && !/not sure|unknown/.test(t)) return labels[i];
      if (optionBoundaryContains(t, want) || optionBoundaryContains(want, t)) {
        return labels[i];
      }
    }
    return null;
  }

  /** Deterministic only — e.g. "30 days" → "30". No guessing. */
  function coerceNumber(value) {
    var s = String(value == null ? '' : value).trim();
    if (!s) return '';
    if (/^-?\d+(?:\.\d+)?$/.test(s)) return s;
    // Explicit unit patterns only
    var m = s.match(/^(-?\d+(?:\.\d+)?)\s*(days?|weeks?|months?|years?|yrs?|%|percent)?$/i);
    if (m) return m[1];
    m = s.match(/(?:^|\s)(-?\d+(?:\.\d+)?)(?:\s|$)/);
    if (m && /days?|weeks?|months?|years?|notice|experience|salary|ctc|aed|usd|eur|gbp|pkr/i.test(s)) {
      return m[1];
    }
    return '';
  }

  function coerceDate(value) {
    var s = String(value == null ? '' : value).trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var parsed = Date.parse(s);
    if (Number.isNaN(parsed)) return '';
    var d = new Date(parsed);
    var pad = function (n) {
      return String(n).padStart(2, '0');
    };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /**
   * Shape a knowledge value for a specific control. Returns { ok, value, action, reason }.
   * action: FILLED candidate | DO_NOT_FILL
   */
  function prepareFillValue(value, knowledgeType, controlType, options) {
    var compat = isTypeCompatible(knowledgeType, controlType, value, options);
    if (!compat.ok) {
      return { ok: false, value: '', action: 'DO_NOT_FILL', reason: compat.reason };
    }
    var ct = String(controlType || 'text').toLowerCase();
    var kt = normalizeFieldType(knowledgeType || 'string');
    var v = value == null ? '' : String(value).trim();

    if (compat.value != null && compat.value !== '') v = String(compat.value);

    if (kt === 'boolean' || /^(yes|no|true|false|1|0|y|n)$/i.test(v)) {
      v = normalizeValue(v, 'boolean');
    }

    if (ct === 'number') {
      var n = coerceNumber(v);
      if (!n) return { ok: false, value: '', action: 'DO_NOT_FILL', reason: 'not_numeric' };
      return { ok: true, value: n, action: 'FILL', reason: 'number_coerced' };
    }
    if (ct === 'date') {
      var iso = coerceDate(v);
      if (!iso) return { ok: false, value: '', action: 'DO_NOT_FILL', reason: 'not_date' };
      return { ok: true, value: iso, action: 'FILL', reason: 'date_coerced' };
    }
    if (ct === 'select' || ct === 'radio' || ct === 'combobox' || ct === 'custom' || ct === 'multiselect') {
      var labels = optionLabels(options);
      if (labels.length) {
        var hit = findOptionMatch(labels, v);
        if (hit) return { ok: true, value: hit, action: 'FILL', reason: 'option_mapped' };
        if (isYesNoOptions(options)) {
          return { ok: false, value: '', action: 'DO_NOT_FILL', reason: 'no_matching_option' };
        }
        // Defer to fill layer (variants / buckets / codes). Keep original value.
        return { ok: true, value: v, action: 'FILL', reason: 'select_deferred_match' };
      }
    }
    if (ct === 'checkbox') {
      return { ok: true, value: /^(yes|true|1|on|y)$/i.test(v) ? 'Yes' : 'No', action: 'FILL', reason: 'checkbox' };
    }
    return { ok: true, value: v, action: 'FILL', reason: compat.reason || 'ok' };
  }

  /**
   * Validate a stored knowledge row before auto-fill. Ambiguous/malformed → reject.
   */
  function validateRecord(record, descriptor) {
    if (!record || !record.canonicalKey) {
      return { ok: false, reason: 'missing_key', action: 'DO_NOT_FILL' };
    }
    if (!isValidFieldType(record.fieldType || 'string')) {
      return { ok: false, reason: 'bad_field_type', action: 'DO_NOT_FILL' };
    }
    var val = record.displayValue != null && String(record.displayValue).trim() !== ''
      ? record.displayValue
      : record.value;
    if (val == null || String(val).trim() === '') {
      return { ok: false, reason: 'empty_value', action: 'DO_NOT_FILL' };
    }
    if (record.status === 'rejected') {
      return { ok: false, reason: 'rejected', action: 'DO_NOT_FILL' };
    }
    if (descriptor) {
      var control = detectControlType(null, descriptor);
      var prepared = prepareFillValue(
        val,
        record.fieldType,
        control,
        descriptor.options || []
      );
      if (!prepared.ok) {
        return { ok: false, reason: prepared.reason, action: 'DO_NOT_FILL', controlType: control };
      }
      // Semantic exclusion: identified question key must not be an excluded pair of the record
      if (descriptor._identifiedKey && isExcludedPair(descriptor._identifiedKey, record.canonicalKey)) {
        return { ok: false, reason: 'semantic_exclusion', action: 'DO_NOT_FILL' };
      }
      if (descriptor._identifiedKey && descriptor._identifiedKey !== record.canonicalKey) {
        // Only allow if alias evidence is strong and not an exclusion pair
        return { ok: false, reason: 'key_mismatch', action: 'DO_NOT_FILL' };
      }
      return {
        ok: true,
        reason: 'validated',
        action: 'FILL',
        value: prepared.value,
        controlType: control
      };
    }
    return { ok: true, reason: 'validated', action: 'FILL', value: String(val).trim() };
  }

  /**
   * Debug / inspection row for a resolution attempt.
   */
  function inspectResolution(info) {
    info = info || {};
    return {
      question: info.question || info.label || '',
      semanticKey: info.semanticKey || info.canonicalKey || info.key || null,
      canonicalKey: info.canonicalKey || info.semanticKey || info.key || null,
      knowledgeType: info.knowledgeType || info.fieldType || null,
      domControlType: info.domControlType || info.controlType || null,
      controlType: info.controlType || info.domControlType || null,
      candidateKeys: info.candidateKeys || [],
      selectedKey: info.selectedKey || info.semanticKey || info.canonicalKey || info.key || null,
      matchedEvidence: info.matchedEvidence || null,
      source: info.source || info.resolution || null,
      value: info.value != null ? String(info.value).slice(0, 200) : '',
      resolution: info.resolution || info.source || null,
      confidence: info.confidence != null ? info.confidence : null,
      action: info.action || 'DO_NOT_FILL',
      reason: info.reason || null
    };
  }

  global.FillApplyKnowledgeCanonical = {
    FIELD_TYPES: FIELD_TYPES,
    USER_FIELD_TYPES: USER_FIELD_TYPES,
    CANONICAL_CATALOG: CANONICAL_CATALOG,
    SEMANTIC_EXCLUSIONS: SEMANTIC_EXCLUSIONS,
    EVIDENCE_PRIORITY: EVIDENCE_PRIORITY,
    AMBIGUOUS_BARE: AMBIGUOUS_BARE,
    normalize: normalize,
    contentTokens: contentTokens,
    deriveCanonicalKey: deriveCanonicalKey,
    slugFromTokens: slugFromTokens,
    catalogEntry: catalogEntry,
    profileKeyFor: profileKeyFor,
    aliasScore: aliasScore,
    matchCanonical: matchCanonical,
    matchWording: matchWording,
    buildEvidence: buildEvidence,
    resolveFromEvidence: resolveFromEvidence,
    isAmbiguousBareWording: isAmbiguousBareWording,
    areCompetingKeys: areCompetingKeys,
    isDecisiveHit: isDecisiveHit,
    inferFieldType: inferFieldType,
    detectControlType: detectControlType,
    isTypeCompatible: isTypeCompatible,
    prepareFillValue: prepareFillValue,
    validateRecord: validateRecord,
    inspectResolution: inspectResolution,
    isExcludedPair: isExcludedPair,
    isYesNoOptions: isYesNoOptions,
    findOptionMatch: findOptionMatch,
    coerceNumber: coerceNumber,
    coerceDate: coerceDate,
    normalizeValue: normalizeValue,
    isValidFieldType: isValidFieldType,
    toUserFieldType: toUserFieldType,
    fromUserFieldType: fromUserFieldType,
    normalizeFieldType: normalizeFieldType
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
