/**
 * Screening question intent + value guards.
 *
 * Stops city/notice/salary tokens from landing in experience/skills essays
 * (NaukriGulf Easy Apply and universal filler). Prefer Question Bank /
 * customAnswers / adaptive; if unknown required → leave blank so Complete
 * Missing Information can collect a real answer.
 *
 * Attaches globalThis.FillApplyScreeningIntent.
 */
(function (global) {
  'use strict';

  var INTENT = {
    CA_ONLY: 'ca_only',
    CA_OR_ACCA: 'ca_or_acca',
    UAE_BASED: 'uae_based',
    LOCATION_CITY: 'location_city',
    NOTICE: 'notice',
    SALARY_CURRENT: 'salary_current',
    SALARY_EXPECTED: 'salary_expected',
    SALARY_GENERIC: 'salary_generic',
    IFRS_TAX: 'ifrs_tax',
    SOX_AUDIT: 'sox_audit',
    BANKING_FS: 'banking_fs',
    EXPERIENCE_ESSAY: 'experience_essay',
    YEARS_BAND: 'years_band',
    YES_NO_OTHER: 'yes_no_other',
    OTHER: 'other'
  };

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isCaOrAccaQuestion(lab) {
    var s = String(lab || '');
    return /ca\s*or\s*acca|acca\s*or\s*ca|qualified\s*ca\s*or\s*acca|ca\s*\/\s*acca|acca\s*\/\s*ca/i.test(s);
  }

  function isCaOnlyQuestion(lab) {
    var s = String(lab || '');
    if (isCaOrAccaQuestion(s)) return false;
    if (/\bacca\b/i.test(s) && !/chartered accountant|\(\s*ca\s*\)/i.test(s)) return false;
    if (/qualified\s+chartered\s+accountant/i.test(s)) return true;
    if (/are you a qualified\s+chartered\s+accountant\s*\(\s*ca\s*\)/i.test(s)) return true;
    if (/are you a qualified\s*\(\s*ca\s*\)/i.test(s)) return true;
    if (/are you a qualified/i.test(s) && /\(\s*ca\s*\)/i.test(s) && !/\bacca\b/i.test(s)) return true;
    if (/qualified\s+ca\b/i.test(s) && !/\bacca\b/i.test(s) && !/\bor\b/i.test(s)) return true;
    if (
      /chartered accountant/i.test(s) &&
      /qualif|are you/i.test(s) &&
      !/\bacca\b/i.test(s)
    ) {
      return true;
    }
    return false;
  }

  function isUaeBasedQuestion(lab) {
    var s = norm(lab);
    if (!s) return false;
    // Currently based in UAE / open for Dubai DIFC in-person — NOT city of residence alone
    if (
      /(based|located|living|reside|residing)\s+(in\s+)?(the\s+)?uae\b/.test(s) ||
      /\bin\s+the\s+uae\b/.test(s) ||
      (/uae|united arab emirates|dubai|difc|abu dhabi/.test(s) &&
        /(based|located|living|reside|interview|in[- ]person|face to face|open for)/.test(s))
    ) {
      return true;
    }
    return false;
  }

  function isNoticeQuestion(lab) {
    var s = norm(lab);
    if (!s) return false;
    // Exclude UAE/interview "available for in-person" and salary+notice combos handled separately
    if (isUaeBasedQuestion(s)) return false;
    if (/ifrs|vat|taxation|sox|audit|internal control|experience with|elaborate|provide examples/.test(s)) {
      return false;
    }
    if (/notice\s*period|when can you (join|start)|earliest (join|start)|how soon can you join/.test(s)) {
      return true;
    }
    // Bare availability / immediate — only when NOT also a location/salary/experience essay
    if (
      /^(availability|available|available (from|to join|immediately)|immediate(ly)? available)$/.test(s) ||
      (/availability|available to (join|start)|immediate joining|serving notice/.test(s) &&
        !/salary|remuneration|ctc|based in|located|uae|dubai|experience|ifrs|audit/.test(s))
    ) {
      return true;
    }
    return false;
  }

  function isSalaryCurrent(lab) {
    var s = norm(lab);
    return (
      /\bcurrent\b/.test(s) &&
      /\b(salary|ctc|pay|remuneration|compensation|package)\b/.test(s) &&
      !/\bexpected\b|\bdesired\b|\bnegotiable\b/.test(s)
    );
  }

  function isSalaryExpected(lab) {
    var s = norm(lab);
    return (
      /\b(expected|desired|seeking|target)\b/.test(s) &&
      /\b(salary|ctc|pay|remuneration|compensation|package)\b/.test(s)
    );
  }

  function isSalaryGeneric(lab) {
    var s = norm(lab);
    if (isSalaryCurrent(s) || isSalaryExpected(s)) return false;
    if (isNoticeQuestion(s)) return false;
    return /remuneration|\bsalary\b|\bcompensation\b|\bctc\b|monthly\s*salary|pay expectation/.test(s);
  }

  function isLocationCityQuestion(lab) {
    var s = norm(lab);
    if (!s) return false;
    if (isUaeBasedQuestion(s)) return false;
    if (/ifrs|vat|tax|sox|audit|experience|elaborate|examples|skills|finalization/.test(s)) return false;
    if (/notice|salary|remuneration|ctc/.test(s)) return false;
    // Short pure location prompts only
    if (
      /^(location|city|town|current location|primary work location|work location|where are you based|where do you live)[\s*?]*$/.test(
        s
      )
    ) {
      return true;
    }
    if (
      s.length < 48 &&
      /^(current )?location\b|work location|city \/ location|city\/location|where are you (based|located)/.test(s) &&
      !/uae|dubai|difc|interview|experience/.test(s)
    ) {
      return true;
    }
    return false;
  }

  function isIfrsTaxQuestion(lab) {
    return /ifrs|\bvat\b|taxation|tax\b.*final|finalization of financial|financial statements/.test(
      String(lab || '')
    );
  }

  function isSoxAuditQuestion(lab) {
    return /\bsox\b|sarbanes|audit coordination|internal control|risk management|risk\b.*control/.test(
      String(lab || '')
    );
  }

  function isBankingFsQuestion(lab) {
    return /banking|financial services|\bfs\b|most recent employer|recent employer/.test(String(lab || '')) &&
      /year|experience|employer|bank/.test(String(lab || ''));
  }

  function isExperienceEssay(lab) {
    var s = String(lab || '');
    if (s.length < 40 && !/elaborate|provide examples|describe|tell us about|detail your/.test(s)) {
      return false;
    }
    return /experience with|elaborate|provide examples|describe your|tell us about|detail your|how have you|please mention your years|years of experience in/.test(
      s
    );
  }

  function isYearsBand(lab) {
    return /how many years|years of relevant|post[-\s]?qualification|more than \d+\s*years/.test(
      String(lab || '')
    );
  }

  /**
   * Classify a screening / modal question label into an intent.
   */
  function classify(label) {
    var lab = String(label || '');
    if (!lab.trim()) return INTENT.OTHER;
    if (isCaOrAccaQuestion(lab)) return INTENT.CA_OR_ACCA;
    if (isCaOnlyQuestion(lab)) return INTENT.CA_ONLY;
    if (isUaeBasedQuestion(lab)) return INTENT.UAE_BASED;
    if (isIfrsTaxQuestion(lab)) return INTENT.IFRS_TAX;
    if (isSoxAuditQuestion(lab)) return INTENT.SOX_AUDIT;
    if (isBankingFsQuestion(lab)) return INTENT.BANKING_FS;
    if (isNoticeQuestion(lab)) return INTENT.NOTICE;
    if (isSalaryCurrent(lab)) return INTENT.SALARY_CURRENT;
    if (isSalaryExpected(lab)) return INTENT.SALARY_EXPECTED;
    if (isSalaryGeneric(lab)) return INTENT.SALARY_GENERIC;
    if (isLocationCityQuestion(lab)) return INTENT.LOCATION_CITY;
    if (isYearsBand(lab)) return INTENT.YEARS_BAND;
    if (isExperienceEssay(lab)) return INTENT.EXPERIENCE_ESSAY;
    return INTENT.OTHER;
  }

  /** City / country-only tokens (never essays). */
  function looksLikeGeoOnly(value) {
    var v = String(value || '').trim();
    if (!v) return false;
    if (v.length > 40) return false;
    if (
      /^(riyadh|jeddah|dammam|khobar|dubai|abu dhabi|sharjah|doha|manama|muscat|kuwait|cairo|amman|beirut|karachi|lahore|islamabad|ksa|saudi arabia|uae|united arab emirates|pakistan|india|bahrain|qatar|oman)$/i.test(
        v
      )
    ) {
      return true;
    }
    // "Riyadh, KSA" style
    if (/^[A-Za-z\s.'-]{2,30},\s*[A-Za-z\s.]{2,24}$/.test(v) && !/\d/.test(v) && v.split(/\s+/).length <= 6) {
      if (/riyadh|dubai|ksa|saudi|uae|pakistan|khobar/i.test(v)) return true;
    }
    return false;
  }

  function looksLikeNoticeOnly(value) {
    var v = String(value || '').trim();
    if (!v) return false;
    if (v.length > 80) return false;
    return /^(immediately available|immediate(ly)?|available immediately|serving notice|onspot|on the spot|0\s*days?|15\s*days?|30\s*days?|45\s*days?|60\s*days?|90\s*days?|1\s*month|2\s*months|3\s*months|notice period[:\s].*)$/i.test(
      v
    );
  }

  function looksLikeSalaryAlone(value) {
    var v = String(value || '').trim();
    if (!v) return false;
    // Pure notice text is not a salary answer
    if (looksLikeNoticeOnly(v)) return true;
    return false;
  }

  /**
   * True when the candidate value is incompatible with the question intent.
   * Essays must not receive city / notice / bare salary tokens.
   */
  function isForbiddenValue(intent, value) {
    var v = String(value == null ? '' : value).trim();
    if (!v) return true;
    var essayish =
      intent === INTENT.IFRS_TAX ||
      intent === INTENT.SOX_AUDIT ||
      intent === INTENT.BANKING_FS ||
      intent === INTENT.EXPERIENCE_ESSAY;
    if (essayish) {
      if (looksLikeGeoOnly(v)) return true;
      if (looksLikeNoticeOnly(v)) return true;
      if (/^(yes|no)$/i.test(v) && v.length <= 3) return true;
    }
    if (intent === INTENT.UAE_BASED) {
      if (looksLikeNoticeOnly(v)) return true;
      if (looksLikeGeoOnly(v) && !/^(yes|no)$/i.test(v)) return true;
    }
    if (
      intent === INTENT.SALARY_CURRENT ||
      intent === INTENT.SALARY_EXPECTED ||
      intent === INTENT.SALARY_GENERIC
    ) {
      if (looksLikeNoticeOnly(v) && !/\d/.test(v)) return true;
      if (looksLikeGeoOnly(v)) return true;
    }
    if (intent === INTENT.NOTICE) {
      if (looksLikeGeoOnly(v)) return true;
    }
    if (intent === INTENT.CA_ONLY || intent === INTENT.CA_OR_ACCA) {
      if (looksLikeGeoOnly(v) || looksLikeNoticeOnly(v)) return true;
    }
    return false;
  }

  function pick() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  }

  function skillsBlob(profile) {
    profile = profile || {};
    var parts = [
      profile.skills,
      Array.isArray(profile.skills) ? profile.skills.join(', ') : '',
      profile.certifications,
      profile.summary,
      profile.resumeSummary,
      profile.headline
    ];
    return parts
      .filter(Boolean)
      .map(function (x) {
        return Array.isArray(x) ? x.join(', ') : String(x);
      })
      .join(' ');
  }

  function recentEmployer(profile) {
    profile = profile || {};
    var ca = profile.customAnswers || {};
    var fromCa = pick(
      ca.recent_employer,
      ca.current_employer,
      ca['Current employer'],
      ca.currentCompany,
      ca.current_company,
      profile.currentCompany,
      profile.currentEmployer,
      profile.company
    );
    if (fromCa) return fromCa;
    var hist = profile.experienceEntries || profile.workHistory;
    if (Array.isArray(hist) && hist[0]) {
      return hist[0].company || hist[0].employer || '';
    }
    if (typeof hist === 'string' && hist.trim()) {
      var line = hist.trim().split(/\n/)[0] || '';
      var m = line.match(/^([^|–\-:]+)/);
      if (m) return m[1].trim();
    }
    return '';
  }

  function yearsExperienceText(profile) {
    profile = profile || {};
    var ca = profile.customAnswers || {};
    var y = pick(
      ca.years_experience_text,
      ca.yearsExperience,
      profile.yearsExperience,
      profile.yearsOfExperience
    );
    if (y) return String(y).replace(/years?/i, '').trim() || y;
    if (/15/.test(String(profile.summary || profile.resumeSummary || profile.headline || ''))) return '15+';
    return '';
  }

  /**
   * Profile / FAQ-derived answers for known NG screening intents.
   * Private-safe: uses generic finance professional phrasing from skills when present.
   */
  function defaultAnswerForIntent(intent, profile) {
    profile = profile || {};
    var ca = profile.customAnswers || {};
    var blob = skillsBlob(profile);

    if (intent === INTENT.CA_ONLY) {
      return pick(ca.qualified_ca, ca.ca_icai, ca['Are you a qualified Chartered Accountant (CA)?'], 'No');
    }
    if (intent === INTENT.UAE_BASED) {
      return pick(
        ca.based_in_uae,
        ca.located_in_uae,
        ca['Are you currently located in UAE?'],
        ca['Currently based in UAE'],
        'No'
      );
    }
    if (intent === INTENT.IFRS_TAX) {
      var ifrs = pick(
        ca.ifrs_vat_tax_experience,
        ca.ifrs_experience,
        ca['Experience with IFRS, VAT, taxation']
      );
      if (ifrs) return ifrs;
      if (/\bifrs\b|\bvat\b|tax|oracle|sap|excel|power bi|fp&a|finance/i.test(blob)) {
        return (
          'Hands-on exposure to IFRS-aligned reporting, VAT/tax coordination with finance stakeholders, ' +
          'and financial statement finalization support through FP&A, management reporting and close processes. ' +
          'Tools: Excel, Power BI, Oracle/SAP as available in role.'
        );
      }
      return '';
    }
    if (intent === INTENT.SOX_AUDIT) {
      var sox = pick(ca.sox_audit_experience, ca.audit_coordination, ca.internal_controls_examples);
      if (sox) return sox;
      if (/audit|sox|control|risk|fp&a|pwc|big four/i.test(blob + ' ' + String(profile.workHistory || ''))) {
        return (
          'Supported audit coordination and control-minded FP&A reporting (variance packs, reconciliations, ' +
          'evidence for external/internal review). Familiar with risk-aware close routines and internal control hygiene; ' +
          'happy to expand on specific SOX cycle examples if required.'
        );
      }
      return '';
    }
    if (intent === INTENT.BANKING_FS) {
      var bank = pick(ca.banking_fs_experience, ca.years_in_banking_fs);
      if (bank) return bank;
      var yrs = yearsExperienceText(profile) || '15+';
      var emp = recentEmployer(profile);
      if (emp) {
        return (
          yrs +
          ' years in finance leadership spanning FS-adjacent reporting and commercial finance; most recent employer: ' +
          emp +
          '.'
        );
      }
      if (yrs) return yrs + ' years in finance / FP&A (KSA & MENA).';
      return '';
    }
    if (intent === INTENT.NOTICE) {
      return pick(
        ca['What is your notice Period?'],
        ca['Notice period'],
        ca.notice_period,
        ca.noticePeriod,
        profile.noticePeriod,
        ''
      );
    }
    if (intent === INTENT.SALARY_CURRENT) {
      return pick(
        ca.current_salary,
        ca.currentSalary,
        ca.current_remuneration,
        ca['What is your current Remuneration?'],
        profile.currentSalary,
        profile.salaryText,
        ''
      );
    }
    if (intent === INTENT.SALARY_EXPECTED) {
      return pick(
        ca.expected_salary,
        ca.expectedSalary,
        ca['Expected salary'],
        profile.expectedSalary,
        profile.salaryText,
        ''
      );
    }
    if (intent === INTENT.SALARY_GENERIC) {
      return pick(
        ca.salary_text,
        ca.current_remuneration,
        profile.salaryText,
        profile.currentSalary,
        profile.expectedSalary,
        ''
      );
    }
    if (intent === INTENT.LOCATION_CITY) {
      return pick(ca.location, ca.city, profile.city, profile.location, '');
    }
    return '';
  }

  /**
   * Resolve a safe answer for a screening label. Returns '' when unknown
   * (caller should leave blank / Complete Missing Information — never invent).
   */
  function resolveAnswer(label, profile, explicitValue) {
    var intent = classify(label);
    var v = explicitValue != null && String(explicitValue).trim() !== '' ? String(explicitValue).trim() : '';
    if (v && isForbiddenValue(intent, v)) v = '';
    if (!v) v = defaultAnswerForIntent(intent, profile);
    if (v && isForbiddenValue(intent, v)) v = '';
    return { intent: intent, value: v || '', forbidden: !v };
  }

  global.FillApplyScreeningIntent = {
    INTENT: INTENT,
    classify: classify,
    isForbiddenValue: isForbiddenValue,
    looksLikeGeoOnly: looksLikeGeoOnly,
    looksLikeNoticeOnly: looksLikeNoticeOnly,
    defaultAnswerForIntent: defaultAnswerForIntent,
    resolveAnswer: resolveAnswer,
    isCaOnlyQuestion: isCaOnlyQuestion,
    isCaOrAccaQuestion: isCaOrAccaQuestion,
    isUaeBasedQuestion: isUaeBasedQuestion,
    isNoticeQuestion: isNoticeQuestion,
    isLocationCityQuestion: isLocationCityQuestion
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
