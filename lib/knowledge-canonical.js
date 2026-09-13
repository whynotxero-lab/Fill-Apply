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
        'managerial experience',
        'leadership experience'
      ],
      stems: ['manag', 'supervis', 'leadership'],
      requireAll: [['experience', 'team', 'managed']]
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

  /** Pairs that must never share an answer via weak substring matching. */
  var SEMANTIC_EXCLUSIONS = [
    ['current_salary', 'expected_salary'],
    ['years_experience', 'management_experience'],
    ['willing_to_relocate', 'willing_to_travel'],
    ['authorized_to_work', 'requires_sponsorship']
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
      if (!requireAllHit(entry.requireAll, hay)) return;
      if (excludeStemsHit(entry.excludeStems, hay)) return;
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
      if (t.indexOf(want) !== -1 || want.indexOf(t) !== -1) {
        if (Math.min(t.length, want.length) >= 2) return labels[i];
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
      canonicalKey: info.canonicalKey || info.key || null,
      knowledgeType: info.knowledgeType || info.fieldType || null,
      controlType: info.controlType || null,
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
    normalize: normalize,
    contentTokens: contentTokens,
    deriveCanonicalKey: deriveCanonicalKey,
    slugFromTokens: slugFromTokens,
    catalogEntry: catalogEntry,
    profileKeyFor: profileKeyFor,
    aliasScore: aliasScore,
    matchCanonical: matchCanonical,
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
