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
      aliases: ['current salary', 'current monthly salary', 'what is your current salary'],
      stems: ['salary']
    },
    {
      key: 'expected_salary',
      profileKey: 'expectedSalary',
      fieldType: 'number',
      aliases: ['expected salary', 'salary expectation', 'desired salary', 'salary / ote'],
      stems: ['expected', 'desire']
    },
    {
      key: 'willing_to_travel',
      fieldType: 'boolean',
      aliases: ['willing to travel', 'able to travel', 'open to travel'],
      stems: ['travel']
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
      aliases: ['available from', 'start date', 'when can you start'],
      stems: ['available', 'start']
    }
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
    return slugFromTokens(contentTokens(label));
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

  /**
   * Score how well a label matches a set of aliases (content-word overlap).
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
      if (hay === q) score = 200;
      else if (hay.indexOf(q) !== -1 || q.indexOf(hay) !== -1) {
        score = 100 + Math.min(q.length, hay.length);
      } else {
        var qTokens = contentTokens(q);
        if (!qTokens.length || !hayTokens.length) return;
        var overlap = 0;
        qTokens.forEach(function (t) {
          if (hayTokens.indexOf(t) !== -1) overlap += 1;
        });
        var ratio = overlap / Math.min(qTokens.length, hayTokens.length);
        if (overlap >= 2 && ratio >= 0.6) score = Math.round(ratio * 50) + overlap;
        else if (overlap === 1 && qTokens.length === 1 && qTokens[0].length >= 3 && ratio >= 0.4) {
          score = qTokens[0].length >= 6 ? 30 : 22;
        }
      }
      if (score > best) best = score;
    });
    return best;
  }

  /**
   * Resolve a page label (and optional name/placeholder) to a canonical key.
   * extraRecords: learned knowledge rows whose .aliases should also match.
   */
  function matchCanonical(label, extras) {
    var hay = [label].concat(extras && extras.also ? extras.also : []).filter(Boolean).join(' ');
    if (!normalize(hay)) {
      return { key: null, score: 0, source: null, fieldType: null, profileKey: null };
    }

    var best = { key: null, score: 0, source: null, fieldType: null, profileKey: null };

    CANONICAL_CATALOG.forEach(function (entry) {
      if (!stemsHit(entry.stems, hay)) return;
      var score = aliasScore(hay, entry.aliases.concat([entry.key.replace(/_/g, ' ')]));
      if (score > best.score) {
        best = {
          key: entry.key,
          score: score,
          source: 'catalog',
          fieldType: entry.fieldType,
          profileKey: entry.profileKey || null
        };
      }
    });

    var learned = (extras && extras.records) || [];
    learned.forEach(function (rec) {
      if (!rec || !rec.canonicalKey) return;
      var aliases = (rec.aliases || []).concat([String(rec.canonicalKey).replace(/_/g, ' ')]);
      if (rec.lastSeenLabel) aliases.push(rec.lastSeenLabel);
      var score = aliasScore(hay, aliases);
      if (score > best.score) {
        best = {
          key: rec.canonicalKey,
          score: score,
          source: 'learned',
          fieldType: rec.fieldType || null,
          profileKey: profileKeyFor(rec.canonicalKey)
        };
      }
    });

    if (best.score > 0) return best;

    var derived = deriveCanonicalKey(hay);
    return {
      key: derived,
      score: derived && derived !== 'unknown_field' ? 10 : 0,
      source: 'derived',
      fieldType: extras && extras.fieldType ? normalizeFieldType(extras.fieldType) : 'string',
      profileKey: null,
      derived: true
    };
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
    var type = String(
      (descriptor && descriptor.type) || (el && el.type) || (el && el.tagName) || ''
    ).toLowerCase();
    if (type === 'checkbox') return 'boolean';
    if (type === 'radio') return 'select';
    if (type === 'number' || type === 'range') return 'number';
    if (type === 'date' || type === 'datetime-local' || type === 'month') return 'date';
    if (type === 'url') return 'string';
    if (type === 'email') return 'string';
    if (el && el.tagName === 'SELECT' && el.multiple) return 'multiselect';
    if (el && el.tagName === 'SELECT') return 'select';
    if (type === 'select-one') return 'select';
    if (type === 'select-multiple') return 'multiselect';
    return 'string';
  }

  global.FillApplyKnowledgeCanonical = {
    FIELD_TYPES: FIELD_TYPES,
    USER_FIELD_TYPES: USER_FIELD_TYPES,
    CANONICAL_CATALOG: CANONICAL_CATALOG,
    normalize: normalize,
    contentTokens: contentTokens,
    deriveCanonicalKey: deriveCanonicalKey,
    slugFromTokens: slugFromTokens,
    catalogEntry: catalogEntry,
    profileKeyFor: profileKeyFor,
    aliasScore: aliasScore,
    matchCanonical: matchCanonical,
    inferFieldType: inferFieldType,
    normalizeValue: normalizeValue,
    isValidFieldType: isValidFieldType,
    toUserFieldType: toUserFieldType,
    fromUserFieldType: fromUserFieldType,
    normalizeFieldType: normalizeFieldType
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
