/**
 * Michael Page adapter (agency) — michaelpage.ae / michaelpage.com apply wizard.
 *
 * Multi-step:
 * 1. Survey gate: Client vs Candidate → Candidate
 * 2. Job page Apply → wizard
 * 3. How would you like to apply? → Apply with CV / Resume (not LinkedIn)
 * 4. Personal + employment fields via fallback + fieldMaps
 *
 * Salary: AED → 2900, SAR → 3000, default SAR/3000 from profile.
 * Middle East working visa: only when profile has middleEastWorkingVisa /
 * customAnswers.middle_east_working_visa (never invent Yes/No).
 */
(function (global) {
  'use strict';

  var HOSTS = [
    'michaelpage.com',
    'www.michaelpage.com',
    'michaelpage.ae',
    'www.michaelpage.ae',
    'michaelpage.be',
    'michaelpage.co.uk'
  ];
  var HOST_RE = /michaelpage\./i;

  function detect(url, doc) {
    url = String(url || '');
    try {
      var u = new URL(url, typeof location !== 'undefined' ? location.href : undefined);
      if (HOST_RE.test(u.hostname) || HOST_RE.test(url)) return true;
      for (var i = 0; i < HOSTS.length; i++) {
        if (u.hostname === HOSTS[i] || u.hostname.endsWith('.' + HOSTS[i].replace(/^www\./, ''))) {
          return true;
        }
      }
    } catch (_e) {
      if (HOST_RE.test(url)) return true;
    }
    return false;
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function visible(el) {
    if (!el) return false;
    try {
      var r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      var st = window.getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
    } catch (_e) {
      return true;
    }
  }

  function buttonText(el) {
    return (
      (el.textContent || '') +
      ' ' +
      (el.value || '') +
      ' ' +
      (el.getAttribute('aria-label') || '') +
      ' ' +
      (el.getAttribute('title') || '')
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  function realClick(el) {
    if (!el) return false;
    if (global.FillApplyDom && global.FillApplyDom.realClick) {
      return !!global.FillApplyDom.realClick(el);
    }
    try {
      el.click();
      return true;
    } catch (_e) {
      return false;
    }
  }

  function isBlank(v) {
    return v == null || String(v).trim() === '';
  }

  function profileVisa(profile) {
    profile = profile || {};
    if (!isBlank(profile.middleEastWorkingVisa)) return String(profile.middleEastWorkingVisa).trim();
    var ca = profile.customAnswers || {};
    if (!isBlank(ca.middle_east_working_visa)) return String(ca.middle_east_working_visa).trim();
    if (!isBlank(ca.working_visa_middle_east)) return String(ca.working_visa_middle_east).trim();
    if (!isBlank(ca['Do you currently have a working visa for the Middle East?'])) {
      return String(ca['Do you currently have a working visa for the Middle East?']).trim();
    }
    return '';
  }

  /**
   * Salary amount for the currency in play.
   * AED → 2900, SAR → 3000, default SAR/3000 (user profile).
   */
  function resolveSalaryAmount(profile, currencyHint) {
    profile = profile || {};
    var ca = profile.customAnswers || {};
    var cur = norm(currencyHint || profile.salaryCurrency || ca.salary_currency || 'SAR');
    if (/aed|dirham|united arab/.test(cur)) {
      return (
        profile.salaryCurrentAED ||
        ca.salary_current_aed ||
        ca.current_monthly_salary_aed ||
        '2900'
      );
    }
    if (/sar|riyal|saudi/.test(cur)) {
      return (
        profile.salaryCurrentSAR ||
        ca.salary_current_sar ||
        ca.current_monthly_salary ||
        ca.current_salary ||
        '3000'
      );
    }
    // Unknown currency label on the page — prefer explicit amount, else SAR default.
    if (!isBlank(profile.currentSalary)) return String(profile.currentSalary).trim();
    if (!isBlank(ca.current_monthly_salary)) return String(ca.current_monthly_salary).trim();
    if (!isBlank(ca.current_salary)) return String(ca.current_salary).trim();
    return String(profile.salaryCurrentSAR || ca.salary_current_sar || '3000').trim();
  }

  function resolveSalaryCurrency(profile) {
    profile = profile || {};
    var ca = profile.customAnswers || {};
    var cur = profile.salaryCurrency || ca.salary_currency || 'SAR';
    return String(cur).trim() || 'SAR';
  }

  /** Enrich a shallow profile copy so universal fill sees salary / visa / MP answers. */
  function enrichProfile(profile) {
    profile = profile || {};
    var out = Object.assign({}, profile);
    var ca = Object.assign({}, profile.customAnswers || {});
    out.customAnswers = ca;

    var currency = resolveSalaryCurrency(out);
    out.salaryCurrency = currency;
    if (isBlank(ca.salary_currency)) ca.salary_currency = currency;

    var amount = resolveSalaryAmount(out, currency);
    // Only set when we have a real mapped amount — never invent beyond SAR/AED defaults from user.
    if (!isBlank(amount)) {
      out.currentSalary = String(amount);
      if (isBlank(ca.current_monthly_salary)) ca.current_monthly_salary = String(amount);
      if (isBlank(ca.current_salary)) ca.current_salary = String(amount);
    }

    var visa = profileVisa(out);
    if (!isBlank(visa)) {
      out.middleEastWorkingVisa = visa;
      ca.middle_east_working_visa = visa;
      ca.working_visa_middle_east = visa;
      ca['Do you currently have a working visa for the Middle East?'] = visa;
    }

    if (isBlank(out.experienceLevel) && !isBlank(ca.experience_level)) {
      out.experienceLevel = ca.experience_level;
    }
    if (isBlank(out.experienceLevel) && !isBlank(ca['Experience Level'])) {
      out.experienceLevel = ca['Experience Level'];
    }

    if (isBlank(out.sector) && !isBlank(ca.sector)) out.sector = ca.sector;
    if (isBlank(out.sector) && !isBlank(ca['Which sector do you work in?'])) {
      out.sector = ca['Which sector do you work in?'];
    }
    if (isBlank(out.subSector) && !isBlank(ca.sub_sector)) out.subSector = ca.sub_sector;
    if (isBlank(out.subSector) && !isBlank(ca['Which sub-sector do you work in?'])) {
      out.subSector = ca['Which sub-sector do you work in?'];
    }

    // Michael Page city/town often wants Riyadh (city_or_town) over Khobar residence city.
    if (!isBlank(ca.city_or_town)) {
      out.city = ca.city_or_town;
    } else if (!isBlank(ca['What city or town do you live in?'])) {
      out.city = ca['What city or town do you live in?'];
    }

    if (isBlank(out.availableFrom) && !isBlank(ca.available_to_start)) {
      out.availableFrom = ca.available_to_start;
    }

    return out;
  }

  function findClickableByText(doc, patterns, opts) {
    opts = opts || {};
    doc = doc || document;
    var nodes = doc.querySelectorAll(
      'button, a, input[type="button"], input[type="submit"], [role="button"], label, div[role="radio"], [role="option"], span[onclick]'
    );
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el)) continue;
      var t = buttonText(el);
      var n = norm(t);
      if (!n) continue;
      if (opts.exclude && opts.exclude.test(t)) continue;
      for (var p = 0; p < patterns.length; p++) {
        var re = patterns[p];
        if (!re.test(t) && !re.test(n)) continue;
        var score = 50 + Math.min(40, 80 - n.length);
        if (opts.preferExact && re.test(t) && t.length < 28) score += 20;
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      }
    }
    return best;
  }

  /** Client vs Candidate survey — pick Candidate. */
  function clickCandidateGate(doc) {
    doc = doc || document;
    var body = '';
    try {
      body = norm((doc.body && doc.body.innerText) || '').slice(0, 4000);
    } catch (_e) {
      body = '';
    }
    var looksLikeSurvey =
      /client/.test(body) && /candidate/.test(body) &&
      (/looking for a (job|role)|are you a|i am a|i'm a|apply as/.test(body) ||
        /client or candidate|candidate or client/.test(body));
    var candidate = findClickableByText(
      doc,
      [/^candidate$/i, /\bi'?m a candidate\b/i, /\bas a candidate\b/i, /\bcandidate\b/i],
      { exclude: /client|employer|recruiter|hiring/i, preferExact: true }
    );
    if (candidate && (looksLikeSurvey || /^candidate$/i.test(buttonText(candidate).trim()))) {
      realClick(candidate);
      return { clicked: true, text: buttonText(candidate) };
    }
    // Radio / card labelled Candidate
    var radios = doc.querySelectorAll('input[type="radio"], [role="radio"]');
    for (var i = 0; i < radios.length; i++) {
      var r = radios[i];
      if (!visible(r) && r.tagName === 'INPUT') continue;
      var lab = '';
      if (global.__fillApply && global.__fillApply.getLabelText) lab = global.__fillApply.getLabelText(r);
      lab = lab || buttonText(r) || String(r.value || '');
      if (/^candidate$/i.test(lab.trim()) || /\bcandidate\b/i.test(lab) && !/client/i.test(lab)) {
        realClick(r);
        return { clicked: true, text: lab };
      }
    }
    return { clicked: false };
  }

  /** How would you like to apply? → Apply with CV / Resume (not LinkedIn). */
  function clickApplyWithCv(doc) {
    doc = doc || document;
    var cv = findClickableByText(
      doc,
      [
        /apply with (cv|resume|curriculum)/i,
        /upload (cv|resume)/i,
        /use (my )?(cv|resume)/i,
        /^(cv|resume)$/i,
        /apply (by|via) (cv|resume)/i
      ],
      { exclude: /linkedin|easy apply with linkedin|continue with linkedin|sign in with linkedin/i, preferExact: true }
    );
    if (cv) {
      realClick(cv);
      return { clicked: true, text: buttonText(cv) };
    }
    return { clicked: false };
  }

  function clickJobApply(doc) {
    doc = doc || document;
    var Syn = global.FillApplySynonyms;
    if (Syn && typeof Syn.tryClickApplyStart === 'function') {
      var open = Syn.tryClickApplyStart(doc, { minOpenFormFields: 2 });
      if (open && open.clicked) return open;
    }
    var apply = findClickableByText(
      doc,
      [/^apply now$/i, /^apply$/i, /apply for this (job|role|position)/i, /\bapply now\b/i],
      { exclude: /linkedin|auto-?apply|save job|share/i, preferExact: true }
    );
    if (apply) {
      realClick(apply);
      return { clicked: true, text: buttonText(apply), reason: 'michaelpage-apply' };
    }
    return { clicked: false };
  }

  function pageHasApplicationFields(doc) {
    doc = doc || document;
    var Syn = global.FillApplySynonyms;
    if (Syn && Syn.isApplicationFormOpen) return !!Syn.isApplicationFormOpen(doc, 2);
    var inputs = doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
    var n = 0;
    for (var i = 0; i < inputs.length; i++) {
      if (visible(inputs[i])) n += 1;
    }
    return n >= 2;
  }

  var FIELD_MAPS = [
    {
      key: 'firstName',
      labels: ['first name', 'what is your first name'],
      placeholders: ['name'],
      names: ['firstname', 'first_name', 'first-name']
    },
    {
      key: 'lastName',
      labels: ['last name', 'what is your last name'],
      placeholders: ['last name'],
      names: ['lastname', 'last_name']
    },
    {
      key: 'phone',
      labels: ['telephone number', 'phone', 'telephone'],
      placeholders: ['telephone number'],
      names: ['telephone', 'phone']
    },
    {
      key: 'city',
      labels: ['town', 'city', 'city or town', 'what city or town'],
      placeholders: ['town'],
      names: ['town', 'city']
    },
    {
      key: 'country',
      labels: ['country', 'what country do you live', 'country of residence'],
      placeholders: ['country'],
      names: ['country']
    },
    {
      key: 'nationality',
      labels: ['nationality', 'for which country do you hold nationality'],
      placeholders: ['nationality'],
      names: ['nationality']
    },
    {
      key: 'currentTitle',
      labels: ['current job title', 'job title'],
      placeholders: ['job title'],
      names: ['current_job_title', 'job_title']
    },
    {
      key: 'experienceLevel',
      labels: ['experience level'],
      placeholders: ['experience level'],
      names: ['experience_level']
    },
    {
      key: 'sector',
      labels: ['which sector do you work in', 'sector'],
      names: ['sector']
    },
    {
      key: 'subSector',
      labels: ['which sub-sector do you work in', 'sub-sector', 'sub sector'],
      names: ['sub_sector']
    },
    {
      key: 'middleEastWorkingVisa',
      labels: [
        'do you currently have a working visa for the middle east',
        'working visa for the middle east'
      ],
      names: ['middle_east_working_visa']
    },
    {
      key: 'salaryCurrency',
      labels: ['currency'],
      names: ['currency', 'salary_currency']
    },
    {
      key: 'currentSalary',
      labels: ['current monthly salary', 'amount', 'what is your current monthly salary'],
      names: ['amount', 'current_monthly_salary']
    },
    {
      key: 'availableFrom',
      labels: ['available to start', 'when are you available to start'],
      names: ['available_to_start']
    }
  ];

  async function runGates(doc) {
    doc = doc || document;
    var steps = [];
    var cand = clickCandidateGate(doc);
    if (cand.clicked) {
      steps.push({ step: 'candidate', text: cand.text });
      await sleep(400);
    }
    if (!pageHasApplicationFields(doc)) {
      var apply = clickJobApply(doc);
      if (apply.clicked) {
        steps.push({ step: 'apply', text: apply.text || apply.reason });
        await sleep(600);
      }
    }
    var cv = clickApplyWithCv(doc);
    if (cv.clicked) {
      steps.push({ step: 'apply_with_cv', text: cv.text });
      await sleep(500);
    }
    // Candidate gate can appear after Apply as well
    if (!cand.clicked) {
      cand = clickCandidateGate(doc);
      if (cand.clicked) {
        steps.push({ step: 'candidate', text: cand.text });
        await sleep(400);
      }
    }
    if (!cv.clicked) {
      cv = clickApplyWithCv(doc);
      if (cv.clicked) {
        steps.push({ step: 'apply_with_cv', text: cv.text });
        await sleep(500);
      }
    }
    return steps;
  }

  async function fill(ctx) {
    ctx = ctx || {};
    var doc = ctx.document || (typeof document !== 'undefined' ? document : null);
    var profile = enrichProfile(ctx.profile || {});
    var steps = [];
    try {
      steps = await runGates(doc);
    } catch (_eGates) {
      steps = [];
    }

    // If we only opened a gate and the form is not here yet, hand off for re-detect.
    if (steps.length && doc && !pageHasApplicationFields(doc)) {
      return {
        ok: true,
        adapterId: 'michaelpage',
        clickedApplyStart: true,
        reDetect: true,
        handedOff: true,
        deferToPageAdapter: true,
        filled: 0,
        unmatched: 0,
        total: 0,
        submitted: false,
        michaelPageSteps: steps,
        message: 'Michael Page gate clicked — re-detect after wizard load',
        error: null
      };
    }

    var fb = global.FillApplyFallbackAdapter;
    if (!fb) {
      return {
        ok: false,
        adapterId: 'michaelpage',
        error: 'Fallback adapter missing',
        filled: 0,
        unmatched: 0,
        total: 0,
        michaelPageSteps: steps
      };
    }

    var result = await fb.fill(
      Object.assign({}, ctx, {
        profile: profile,
        adapterId: 'michaelpage',
        submitSelector: adapter.submitSelector,
        fileInputHints: adapter.fileInputHints,
        fieldMaps: (adapter.fieldMaps || []).concat(ctx.fieldMaps || [])
      })
    );
    result = result || {};
    result.adapterId = 'michaelpage';
    result.michaelPageSteps = steps;
    return result;
  }

  var adapter = {
    id: 'michaelpage',
    name: 'Michael Page',
    category: 'agency',
    hosts: HOSTS,
    detect: detect,
    fieldMaps: FIELD_MAPS,
    submitSelector:
      'button[type="submit"], input[type="submit"], button[data-testid*="apply" i], button[class*="apply" i]',
    fileInputHints: [
      { kind: 'resume', match: 'resume|cv|curriculum' },
      { kind: 'cover', match: 'cover' }
    ],
    enrichProfile: enrichProfile,
    resolveSalaryAmount: resolveSalaryAmount,
    resolveSalaryCurrency: resolveSalaryCurrency,
    profileVisa: profileVisa,
    clickCandidateGate: clickCandidateGate,
    clickApplyWithCv: clickApplyWithCv,
    clickJobApply: clickJobApply,
    findClickableByText: findClickableByText,
    fill: fill
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
  global.FillApply_michaelpageAdapter = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : self);
