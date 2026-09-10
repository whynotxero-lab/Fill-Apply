/**
 * Cross-site label / CTA synonyms for adaptive fill.
 * Same candidate profile; boards rename the same actions (Resume≈CV, Apply≈Apply Now).
 * Attaches globalThis.FillApplySynonyms.
 */
(function (global) {
  'use strict';

  /**
   * Broad Apply / Submit Application labels (open OR final submit — same wording on many sites).
   * Easy Apply is LinkedIn-specific: board adapters own it; generic start helpers exclude it.
   */
  var APPLY_CTA =
    /\b(apply\s*now|start\s*apply|start\s*application|apply\s*for\s*this\s*(job|role|position)|apply\s*to\s*this\s*(job|role)|apply\s*here|submit\s*(&|and)\s*apply|submit\s*application|submit\s*your\s*application|send\s*application|complete\s*application|easy\s*apply|apply)\b/i;

  /** Labels that usually open an application from a job overview (not “Submit Application”). */
  var APPLY_START_CTA =
    /\b(apply\s*now|start\s*apply|start\s*application|apply\s*for\s*this\s*(job|role|position)|apply\s*to\s*this\s*(job|role)|apply\s*here|apply)\b/i;

  /** Labels that usually mean final submit on an already-open form. */
  var FINAL_SUBMIT_CTA =
    /\b(submit\s*(&|and)\s*apply|submit\s*application|submit\s*your\s*application|send\s*application|complete\s*application)\b/i;

  var CONTINUE_CTA =
    /\b(next(\s*step)?|continue|save\s*(&|and)\s*continue|save\s*and\s*next|proceed|review\s*and\s*continue)\b/i;

  var RESUME_FILE =
    /\b(resume|cv|c\.v\.|curriculum\s*vitae|upload\s*resume|upload\s*cv|attach\s*resume|attach\s*cv|upload\s*file)\b|^cv\s*\*?$/i;

  var COVER_FILE =
    /\b(cover\s*letter|covering\s*letter|motivation\s*letter|letter\s*of\s*interest|cover)\b/i;

  var ATTACH_ACTION =
    /\b(attach|upload|browse|drop\s*files|choose\s*file|select\s*file|add\s*file)\b/i;

  /** Paid / upsell / AI auto-apply chrome — never treat as Apply-start. */
  var EXCLUDED_APPLY_CTA =
    /\b(ai\s*auto[- ]?apply|auto[- ]?apply\s*with\s*ai|auto[- ]?apply|upgrade|subscribe|pricing|premium|share(\s*job)?|save\s*job|bookmark|tailor\s*my\s*resume|post\s*a\s*job|hire\s*(talent|now)?)\b/i;

  /** Sources that typically need a logged-in / complete profile before apply works well. */
  var ACCOUNT_PROFILE_FIRST = [
    'naukrigulf',
    'linkedin',
    'indeed',
    'upwork',
    'bayt',
    'gulftalent',
    'glassdoor',
    'wellfound',
    'angellist',
    'weworkremotely',
    'remoteok',
    'flexjobs'
  ];

  var PAID_SOURCES = ['remoteok', 'weworkremotely', 'flexjobs'];

  /** Min visible application-like inputs before we treat the form as open. */
  var MIN_OPEN_FORM_FIELDS = 2;

  function buttonText(el) {
    if (!el) return '';
    return (
      (el.textContent || '') +
      ' ' +
      (el.value || '') +
      ' ' +
      (el.getAttribute('aria-label') || '') +
      ' ' +
      (el.getAttribute('title') || '') +
      ' ' +
      (el.id || '') +
      ' ' +
      (el.className || '')
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isVisible(el) {
    if (!el) return false;
    try {
      var r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      var st = typeof window !== 'undefined' && window.getComputedStyle
        ? window.getComputedStyle(el)
        : null;
      if (st && (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0')) {
        return false;
      }
      return true;
    } catch (_e) {
      return true;
    }
  }

  function isExcludedApplyCta(text) {
    return EXCLUDED_APPLY_CTA.test(String(text || ''));
  }

  function isApplyCta(text) {
    var t = String(text || '');
    if (!t || isExcludedApplyCta(t)) return false;
    return APPLY_CTA.test(t);
  }

  function isFinalSubmitCta(text) {
    var t = String(text || '');
    if (!t || isExcludedApplyCta(t)) return false;
    return FINAL_SUBMIT_CTA.test(t);
  }

  /**
   * Apply-start CTAs (open form). Excludes Easy Apply (LinkedIn adapter owns it),
   * Auto-Apply / Upgrade / Subscribe / Share / Save job, and pure final-submit labels
   * when they don't also look like start wording.
   */
  function isApplyStartCta(text) {
    var t = String(text || '');
    if (!t || isExcludedApplyCta(t)) return false;
    // LinkedIn Easy Apply — board adapter owns this path
    if (/\beasy\s*apply\b/i.test(t)) return false;
    if (APPLY_START_CTA.test(t)) return true;
    // Same label used for open + submit on many sites ("Apply")
    if (APPLY_CTA.test(t) && !isFinalSubmitCta(t)) return true;
    return false;
  }

  function isContinueCta(text) {
    var t = String(text || '');
    if (isApplyCta(t) && !CONTINUE_CTA.test(t)) return false;
    return CONTINUE_CTA.test(t);
  }

  function isResumeLabel(text) {
    return RESUME_FILE.test(String(text || ''));
  }

  function isCoverLabel(text) {
    return COVER_FILE.test(String(text || ''));
  }

  function scoreApplyStartText(t) {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    if (!t || !isApplyStartCta(t)) return 0;
    if (/^apply now$/i.test(t)) return 100;
    if (/^start\s*apply$/i.test(t)) return 98;
    if (/start\s*application/i.test(t)) return 96;
    if (/apply for this job/i.test(t)) return 95;
    if (/apply for this role/i.test(t)) return 94;
    if (/apply for this position/i.test(t)) return 93;
    if (/apply here/i.test(t)) return 90;
    if (/^apply$/i.test(t) && t.length < 12) return 85;
    if (/\bapply now\b/i.test(t)) return 80;
    if (/\bapply\b/i.test(t) && t.length < 48) return 50;
    return 30;
  }

  /**
   * Visible buttons/links matching apply-start CTAs.
   * Excludes paid Auto-Apply / Upgrade / AI Auto-Apply / Subscribe / Easy Apply.
   */
  function findApplyStartButtons(root) {
    root = root || (typeof document !== 'undefined' ? document : null);
    if (!root || !root.querySelectorAll) return [];
    var nodes = root.querySelectorAll(
      'a, button, input[type="button"], input[type="submit"], [role="button"], [data-careersite--jobs--form-overlay-target="coverButton"], [data-action*="showFormOverlay"]'
    );
    var out = [];
    var seen = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (seen.indexOf(el) !== -1) continue;
      seen.push(el);
      if (el.disabled && !/floating|coverButton|showFormOverlay/i.test(
        (el.className || '') + ' ' + (el.getAttribute('data-action') || '') + ' ' + (el.getAttribute('data-careersite--jobs--form-overlay-target') || '')
      )) {
        continue;
      }
      var action = el.getAttribute('data-action') || '';
      var overlayTarget = el.getAttribute('data-careersite--jobs--form-overlay-target') || '';
      var highConfidenceOverlay =
        /showFormOverlay/i.test(action) || overlayTarget === 'coverButton';
      // Sticky / floating Teamtailor CTAs may fail a strict visible() check — still include them.
      if (!isVisible(el) && !highConfidenceOverlay && !/floating/i.test(el.className || '')) {
        continue;
      }
      var t = buttonText(el);
      if (highConfidenceOverlay && (!t || !isApplyStartCta(t))) {
        // Treat overlay openers as Apply-start even with sparse text
        if (!t) t = 'Apply for this job';
      }
      if (!isApplyStartCta(t) && !highConfidenceOverlay) continue;
      if (isExcludedApplyCta(t)) continue;
      out.push(el);
    }
    out.sort(function (a, b) {
      var sa = scoreApplyStartText(buttonText(a));
      var sb = scoreApplyStartText(buttonText(b));
      var aa = (a.getAttribute('data-action') || '') + (a.getAttribute('data-careersite--jobs--form-overlay-target') || '');
      var bb = (b.getAttribute('data-action') || '') + (b.getAttribute('data-careersite--jobs--form-overlay-target') || '');
      if (/showFormOverlay|coverButton/i.test(bb)) sb += 20;
      if (/showFormOverlay|coverButton/i.test(aa)) sa += 20;
      return sb - sa;
    });
    return out;
  }

  var APPLY_CONTAINER_SELECTORS = [
    '#job-application-form',
    'turbo-frame#application_form',
    '#application',
    '#application-form',
    'form#application',
    '#greenhouse-job-application',
    '#main_fields',
    '.application--container',
    '#apply_form',
    'form[action*="apply" i]',
    'form[id*="application" i]',
    'form[class*="application" i]',
    'form[data-controller*="careersite--form"]',
    '[data-careersite--jobs--form-overlay-target="form"]',
    '[role="dialog"]',
    '[aria-modal="true"]',
    '.ReactModal__Content',
    '.modal.show',
    '.modal[open]',
    '[data-test="application-form"]'
  ];

  function findApplyContainers(root) {
    root = root || (typeof document !== 'undefined' ? document : null);
    if (!root || !root.querySelectorAll) return [];
    var out = [];
    var seen = [];
    for (var s = 0; s < APPLY_CONTAINER_SELECTORS.length; s++) {
      var nodes;
      try {
        nodes = root.querySelectorAll(APPLY_CONTAINER_SELECTORS[s]);
      } catch (_eSel) {
        continue;
      }
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (seen.indexOf(el) !== -1) continue;
        seen.push(el);
        out.push(el);
      }
    }
    return out;
  }

  function containerLooksOpen(container) {
    if (!container) return false;
    try {
      if (isVisible(container)) return true;
      // Hidden host with visible descendants (rare) — count visible fillables instead
      return countFillableApplicationInputs(container) > 0;
    } catch (_e) {
      return false;
    }
  }

  function isSearchLikeField(el) {
    if (!el) return false;
    var blob =
      (el.getAttribute('name') || '') +
      ' ' +
      (el.id || '') +
      ' ' +
      (el.getAttribute('placeholder') || '') +
      ' ' +
      (el.getAttribute('aria-label') || '') +
      ' ' +
      (el.className || '');
    return /\b(search|filter|keyword|query|location-search|job.?search)\b/i.test(blob);
  }

  /**
   * Count visible text/email/tel/textarea/select fields that look like an application form.
   */
  function countFillableApplicationInputs(root) {
    root = root || (typeof document !== 'undefined' ? document : null);
    if (!root || !root.querySelectorAll) return 0;
    var nodes = root.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type]), textarea, select'
    );
    var n = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var type = String(el.type || '').toLowerCase();
      if (type === 'hidden' || type === 'search') continue;
      if (el.disabled || el.readOnly) continue;
      if (!isVisible(el)) continue;
      if (isSearchLikeField(el)) continue;
      n += 1;
    }
    return n;
  }

  function looksLikeJobPosting(root) {
    root = root || (typeof document !== 'undefined' ? document : null);
    if (!root) return false;
    try {
      if (
        root.querySelector(
          '.job-description, [class*="job-description"], [data-qa="job-description"], [itemprop="description"], .listing-container, #job-description, .job-details'
        )
      ) {
        return true;
      }
      var body = root.body || root;
      var text = String((body && (body.innerText || body.textContent)) || '').slice(0, 6000);
      return /job description|about (the )?role|about (the )?job|responsibilities|requirements|what you.?ll do|position overview|key responsibilities|the role\b/i.test(
        text
      );
    } catch (_e) {
      return false;
    }
  }

  /**
   * True when an application form already looks open (do not click Apply-start / final Submit as open).
   * Only counts fields inside known apply containers — never whole-document newsletter/search inputs.
   */
  function isApplicationFormOpen(root, minFields) {
    root = root || (typeof document !== 'undefined' ? document : null);
    if (!root || !root.querySelector) return false;
    minFields = minFields == null ? MIN_OPEN_FORM_FIELDS : minFields;

    var containers = findApplyContainers(root);
    for (var c = 0; c < containers.length; c++) {
      var box = containers[c];
      if (!containerLooksOpen(box)) continue;
      var nBox = countFillableApplicationInputs(box);
      if (nBox >= minFields) return true;
      try {
        var hasFile = !!box.querySelector('input[type="file"]');
        var hasEmail = !!box.querySelector(
          'input[type="email"], input[name*="email" i], input[id*="email" i], input[autocomplete="email"]'
        );
        if (hasFile && hasEmail && nBox >= 1) return true;
      } catch (_eBox) {}
    }

    // Do NOT treat whole-document incidental inputs (newsletter, search, footer) as form open.
    return false;
  }

  /**
   * Whether we should click an Apply-start CTA (form not open yet + CTA present).
   */
  function shouldClickApplyStart(root, minFields) {
    root = root || (typeof document !== 'undefined' ? document : null);
    if (!root) return false;
    if (isApplicationFormOpen(root, minFields)) return false;
    var btns = findApplyStartButtons(root);
    if (!btns.length) return false;
    // High-confidence Apply-start present and modal/form not visibly open → always click
    for (var bi = 0; bi < btns.length; bi++) {
      var bt = buttonText(btns[bi]);
      var action = btns[bi].getAttribute('data-action') || '';
      var overlayTarget = btns[bi].getAttribute('data-careersite--jobs--form-overlay-target') || '';
      if (
        scoreApplyStartText(bt) >= 80 ||
        /showFormOverlay/i.test(action) ||
        overlayTarget === 'coverButton' ||
        /apply for this job/i.test(bt)
      ) {
        return true;
      }
    }
    // Prefer when page looks like a posting OR has almost no fillable fields in apply containers
    var containers = findApplyContainers(root);
    var n = 0;
    if (containers.length) {
      for (var ci = 0; ci < containers.length; ci++) {
        n += countFillableApplicationInputs(containers[ci]);
      }
    } else {
      n = countFillableApplicationInputs(root);
    }
    if (n < (minFields == null ? MIN_OPEN_FORM_FIELDS : minFields)) return true;
    if (looksLikeJobPosting(root)) return true;
    try {
      var app = root.querySelector('#application, form#application, #application-form');
      if (app && countFillableApplicationInputs(app) < (minFields || MIN_OPEN_FORM_FIELDS)) {
        return true;
      }
    } catch (_e) {}
    return false;
  }

  /**
   * Click one Apply-start CTA when the form is not open yet.
   * Allowed in fill / ready / submit (opening is not final submit).
   * Returns { clicked, text?, reason, el? }.
   */
  function tryClickApplyStart(root, opts) {
    opts = opts || {};
    root = root || (typeof document !== 'undefined' ? document : null);
    if (!root) return { clicked: false, reason: 'no_root' };
    var minFields = opts.minFields != null ? opts.minFields : MIN_OPEN_FORM_FIELDS;

    if (isApplicationFormOpen(root, minFields)) {
      return { clicked: false, reason: 'form_open' };
    }
    if (!shouldClickApplyStart(root, minFields) && !opts.force) {
      // still allow if CTA exists and few fields
      var n = countFillableApplicationInputs(root);
      var btns0 = findApplyStartButtons(root);
      if (!(btns0.length && n < minFields)) {
        return { clicked: false, reason: 'not_needed' };
      }
    }

    var buttons = findApplyStartButtons(root);
    if (!buttons.length) return { clicked: false, reason: 'no_cta' };

    var best = buttons[0];
    var text = buttonText(best).replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!text) text = 'Apply';
    try {
      best.scrollIntoView({ block: 'center', inline: 'nearest' });
    } catch (_eScroll) {}
    try {
      best.disabled = false;
    } catch (_eEn) {}
    try {
      best.click();
      return { clicked: true, text: text, reason: 'clicked', el: best };
    } catch (_eClick) {
      try {
        best.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
        );
        return { clicked: true, text: text, reason: 'mouse_event', el: best };
      } catch (_eMouse) {}
      try {
        if (best.href && typeof location !== 'undefined') {
          location.href = best.href;
          return { clicked: true, text: text, reason: 'navigated', el: best };
        }
      } catch (_eNav) {}
      return { clicked: false, reason: 'click_failed', text: text };
    }
  }

  global.FillApplySynonyms = {
    APPLY_CTA: APPLY_CTA,
    APPLY_START_CTA: APPLY_START_CTA,
    FINAL_SUBMIT_CTA: FINAL_SUBMIT_CTA,
    CONTINUE_CTA: CONTINUE_CTA,
    RESUME_FILE: RESUME_FILE,
    COVER_FILE: COVER_FILE,
    ATTACH_ACTION: ATTACH_ACTION,
    EXCLUDED_APPLY_CTA: EXCLUDED_APPLY_CTA,
    ACCOUNT_PROFILE_FIRST: ACCOUNT_PROFILE_FIRST,
    PAID_SOURCES: PAID_SOURCES,
    MIN_OPEN_FORM_FIELDS: MIN_OPEN_FORM_FIELDS,
    buttonText: buttonText,
    isVisible: isVisible,
    isExcludedApplyCta: isExcludedApplyCta,
    isApplyCta: isApplyCta,
    isApplyStartCta: isApplyStartCta,
    isFinalSubmitCta: isFinalSubmitCta,
    isContinueCta: isContinueCta,
    isResumeLabel: isResumeLabel,
    isCoverLabel: isCoverLabel,
    scoreApplyStartText: scoreApplyStartText,
    findApplyStartButtons: findApplyStartButtons,
    findApplyContainers: findApplyContainers,
    countFillableApplicationInputs: countFillableApplicationInputs,
    looksLikeJobPosting: looksLikeJobPosting,
    isApplicationFormOpen: isApplicationFormOpen,
    shouldClickApplyStart: shouldClickApplyStart,
    tryClickApplyStart: tryClickApplyStart
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
