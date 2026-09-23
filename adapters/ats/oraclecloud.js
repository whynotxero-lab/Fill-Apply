/**
 * Oracle Cloud HCM Candidate Experience —
 * *.fa.ocs.oraclecloud.com /hcmUI/CandidateExperience/.../apply/email
 * and .../easy-apply/email ("Let's get started" / "What's your email?").
 *
 * Email step: Email Address / What's your email? +
 * "I agree with the terms and conditions" OR "I agree with the privacy policy" +
 * NEXT / circular continue arrow. Fill email from profile, tick consent, click next.
 * Same-tab; no hop.
 */
(function (global) {
  'use strict';

  var HOST_RE = /oraclecloud\.com|oraclecloud\.us|oraclecloud\.eu/i;

  function detect(url, doc) {
    url = String(url || '');
    if (HOST_RE.test(url)) return true;
    try {
      var u = new URL(url, typeof location !== 'undefined' ? location.href : undefined);
      if (HOST_RE.test(u.hostname)) return true;
    } catch (_e) {}
    if (
      doc &&
      /candidateexperience|hcmui\/candidate/i.test(url) &&
      doc.querySelector('input[type="email"], input[name*="email" i]')
    ) {
      return true;
    }
    try {
      var body = doc && doc.body ? String(doc.body.innerText || '').slice(0, 4000) : '';
      if (/you don'?t need to have an account/i.test(body) && /email address/i.test(body)) {
        return true;
      }
    } catch (_e2) {}
    return false;
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
      var st =
        el.ownerDocument && el.ownerDocument.defaultView
          ? el.ownerDocument.defaultView.getComputedStyle(el)
          : null;
      if (st && (st.display === 'none' || st.visibility === 'hidden')) return false;
      return true;
    } catch (_e) {
      return true;
    }
  }

  function buttonText(el) {
    return String(
      (el && (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || '')) ||
        ''
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  function profileEmail(profile) {
    profile = profile || {};
    var ca = profile.customAnswers && typeof profile.customAnswers === 'object' ? profile.customAnswers : {};
    return String(
      profile.email || ca.email || ca.Email || ca.emailAddress || ''
    ).trim();
  }

  function setInputValue(el, value) {
    if (!el) return false;
    var str = String(value == null ? '' : value);
    try {
      if (global.__fillApply && typeof global.__fillApply.setNativeValue === 'function') {
        global.__fillApply.setNativeValue(el, str, { key: 'email' });
        return true;
      }
    } catch (_e) {}
    try {
      var proto = window.HTMLInputElement.prototype;
      var desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, str);
      else el.value = str;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (_e2) {
      try {
        el.value = str;
        return true;
      } catch (_e3) {
        return false;
      }
    }
  }

  function findEmailInput(doc) {
    doc = doc || document;
    var nodes = doc.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i], input');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el) || el.disabled) continue;
      var type = String(el.type || '').toLowerCase();
      if (type === 'hidden' || type === 'checkbox' || type === 'radio' || type === 'submit' || type === 'button') {
        continue;
      }
      var lab = '';
      try {
        if (el.id) {
          var byFor = doc.querySelector('label[for="' + String(el.id).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]');
          if (byFor) lab = buttonText(byFor);
        }
        var wrap = el.closest('label, .oj-form-control, [class*="field"], [class*="input"]');
        if (wrap) lab += ' ' + buttonText(wrap);
      } catch (_lab) {}
      var blob =
        (el.name || '') +
        ' ' +
        (el.id || '') +
        ' ' +
        (el.getAttribute('aria-label') || '') +
        ' ' +
        (el.placeholder || '') +
        ' ' +
        lab;
      if (type === 'email' || /e-?mail|what'?s your email/i.test(blob)) return el;
    }
    // Fallback: first visible text input on apply/email / easy-apply/email step
    for (var j = 0; j < nodes.length; j++) {
      var el2 = nodes[j];
      if (!visible(el2) || el2.disabled) continue;
      var t2 = String(el2.type || 'text').toLowerCase();
      if (t2 === 'text' || t2 === 'email' || t2 === '') return el2;
    }
    return null;
  }

  function findTermsCheckbox(doc) {
    doc = doc || document;
    var boxes = doc.querySelectorAll('input[type="checkbox"]');
    var scored = [];
    for (var i = 0; i < boxes.length; i++) {
      var el = boxes[i];
      if (!visible(el) || el.disabled) continue;
      var lab = '';
      try {
        if (el.id) {
          var byFor = doc.querySelector('label[for="' + String(el.id).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]');
          if (byFor) lab = buttonText(byFor);
        }
        var parent = el.closest(
          'label, .oj-checkbox, [class*="checkbox"], [class*="consent"], [class*="terms"], [class*="privacy"], [class*="agree"]'
        );
        if (parent) lab += ' ' + buttonText(parent);
        // Sibling / next-element label text (Oracle easy-apply often uses this)
        var sib = el.nextElementSibling;
        if (sib) lab += ' ' + buttonText(sib);
        var prev = el.previousElementSibling;
        if (prev) lab += ' ' + buttonText(prev);
        var row = el.parentElement;
        if (row) lab += ' ' + buttonText(row).slice(0, 240);
      } catch (_e) {}
      lab +=
        ' ' +
        (el.getAttribute('aria-label') || '') +
        ' ' +
        (el.name || '') +
        ' ' +
        (el.id || '');
      var score = 0;
      if (/privacy\s*policy/i.test(lab)) score = 100;
      else if (/terms\s+and\s+conditions/i.test(lab)) score = 95;
      else if (/i agree with the privacy/i.test(lab)) score = 100;
      else if (/i agree with the terms/i.test(lab)) score = 95;
      else if (/agree|terms|conditions|privacy|consent|acknowledge/i.test(lab)) score = 70;
      if (score > 0) scored.push({ el: el, score: score });
    }
    scored.sort(function (a, b) {
      return b.score - a.score;
    });
    if (scored.length) return scored[0].el;
    // Single visible required checkbox on the email step
    var visibleBoxes = [];
    for (var j = 0; j < boxes.length; j++) {
      if (visible(boxes[j]) && !boxes[j].disabled) visibleBoxes.push(boxes[j]);
    }
    if (visibleBoxes.length === 1) return visibleBoxes[0];
    return null;
  }

  function findNextButton(doc) {
    doc = doc || document;
    var nodes = doc.querySelectorAll(
      'a, button, input[type="button"], input[type="submit"], [role="button"], oj-button, .oj-button, [class*="next"], [class*="continue"], [aria-label]'
    );
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el) || el.disabled) continue;
      var t = buttonText(el);
      var aria = String(el.getAttribute('aria-label') || el.getAttribute('title') || '');
      var cls = String(el.className || '');
      var blob = (t + ' ' + aria + ' ' + cls).replace(/\s+/g, ' ').trim();
      if (/^cancel$/i.test(t) || /^cancel$/i.test(aria)) continue;
      var score = 0;
      if (/^next$/i.test(t) || /^next$/i.test(aria)) score = 100;
      else if (/\bnext\b/i.test(blob) && blob.length < 40) score = 85;
      else if (/continue|proceed/i.test(blob) && blob.length < 48) score = 70;
      else if (/\b(arrow|chevron|forward)\b/i.test(cls + ' ' + aria) && /button|oj-/i.test(cls + ' ' + (el.tagName || ''))) {
        // Circular / icon-only next arrow on Easy Apply
        score = 65;
      } else if (!t && aria && /next|continue|proceed|submit|forward/i.test(aria)) {
        score = 75;
      } else if (
        !t &&
        /oj-button|circular|round|icon-only|arrow/i.test(cls) &&
        el.closest('form, [class*="email"], [class*="apply"], [class*="wizard"], [class*="step"]')
      ) {
        score = 55;
      }
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function isEmailApplyStep(doc) {
    doc = doc || document;
    var body = '';
    try {
      body = String((doc.body && (doc.body.innerText || doc.body.textContent)) || '').slice(0, 6000);
    } catch (_e) {
      body = '';
    }
    var href = '';
    try {
      href = String((doc.defaultView && doc.defaultView.location && doc.defaultView.location.href) || location.href || '');
    } catch (_l) {
      try {
        href = String(location.href || '');
      } catch (_l2) {
        href = '';
      }
    }
    if (/\/(easy-)?apply\/email\b/i.test(href)) return true;
    if (/you don'?t need to have an account/i.test(body)) return true;
    if (/let'?s get started/i.test(body) && /what'?s your email|email/i.test(body)) return true;
    if (
      (/email address|what'?s your email/i.test(body) &&
        /terms and conditions|privacy policy|i agree/i.test(body) &&
        findNextButton(doc))
    ) {
      return true;
    }
    return !!(findEmailInput(doc) && findTermsCheckbox(doc) && findNextButton(doc));
  }

  async function fillEmailTermsNext(doc, profile) {
    doc = doc || document;
    var email = profileEmail(profile);
    var out = { filled: 0, emailFilled: false, termsChecked: false, nextClicked: false, detail: '' };
    if (!email) {
      out.detail = 'no_profile_email';
      return out;
    }
    var input = findEmailInput(doc);
    if (input) {
      if (setInputValue(input, email)) {
        out.filled += 1;
        out.emailFilled = true;
      }
    }
    var terms = findTermsCheckbox(doc);
    if (terms && !terms.checked) {
      try {
        terms.click();
      } catch (_c) {
        terms.checked = true;
        try {
          terms.dispatchEvent(new Event('change', { bubbles: true }));
          terms.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (_d) {}
      }
      if (terms.checked) {
        out.filled += 1;
        out.termsChecked = true;
      }
    } else if (terms && terms.checked) {
      out.termsChecked = true;
    }
    await sleep(250);
    var next = findNextButton(doc);
    if (next && out.emailFilled && out.termsChecked) {
      try {
        next.click();
        out.nextClicked = true;
      } catch (_n) {
        try {
          next.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          out.nextClicked = true;
        } catch (_n2) {}
      }
    }
    out.detail = out.nextClicked
      ? 'email+privacy/terms+next'
      : out.emailFilled
        ? 'email_filled_waiting'
        : 'email_step_incomplete';
    return out;
  }

  async function fill(ctx) {
    ctx = ctx || {};
    var doc = ctx.document || (typeof document !== 'undefined' ? document : null);
    var profile = ctx.profile || {};
    if (!doc) {
      return { ok: false, adapterId: 'oraclecloud', error: 'No document', filled: 0, unmatched: 0, total: 0 };
    }

    if (isEmailApplyStep(doc)) {
      var step = await fillEmailTermsNext(doc, profile);
      if (step.nextClicked) {
        await sleep(600);
        return {
          ok: true,
          adapterId: 'oraclecloud',
          filled: step.filled,
          unmatched: 0,
          total: step.filled,
          submitted: false,
          advanced: true,
          reDetect: true,
          clickedApplyStart: false,
          handedOff: false,
          externalApply: false,
          stayOnTab: true,
          oracleSteps: [step],
          message: 'Oracle Cloud: email + privacy/terms + NEXT — continuing on same tab',
          error: null
        };
      }
      if (!profileEmail(profile)) {
        return {
          ok: false,
          needsHuman: true,
          pauseReason: 'missing_profile_field',
          missingProfileFields: ['email'],
          adapterId: 'oraclecloud',
          filled: step.filled,
          unmatched: 1,
          total: 1,
          submitted: false,
          error: 'Oracle Cloud email step — profile email missing (paused on same tab)'
        };
      }
      return {
        ok: false,
        needsHuman: true,
        pauseReason: 'oracle_email_step',
        adapterId: 'oraclecloud',
        filled: step.filled,
        unmatched: 0,
        total: step.filled,
        submitted: false,
        oracleSteps: [step],
        error:
          'Oracle Cloud email/privacy/terms/NEXT step incomplete — paused on same tab (' +
          (step.detail || 'unknown') +
          ')'
      };
    }

    var fb = global.FillApplyFallbackAdapter;
    if (!fb) {
      return {
        ok: false,
        adapterId: 'oraclecloud',
        error: 'Fallback adapter missing',
        filled: 0,
        unmatched: 0,
        total: 0
      };
    }
    var result = await fb.fill(
      Object.assign({}, ctx, {
        adapterId: 'oraclecloud',
        submitSelector: adapter.submitSelector,
        fileInputHints: adapter.fileInputHints,
        fieldMaps: adapter.fieldMaps
      })
    );
    result = result || {};
    result.adapterId = 'oraclecloud';
    return result;
  }

  var adapter = {
    category: 'ats',
    id: 'oraclecloud',
    name: 'Oracle Cloud Candidate Experience',
    detect: detect,
    fieldMaps: [
      {
        key: 'email',
        names: ['email', 'emailAddress', 'email_address'],
        labels: ['email address', 'email']
      }
    ],
    submitSelector: 'button[type="submit"], button',
    fileInputHints: [
      { kind: 'resume', match: 'resume|cv' },
      { kind: 'cover', match: 'cover' }
    ],
    isEmailApplyStep: isEmailApplyStep,
    fillEmailTermsNext: fillEmailTermsNext,
    fill: fill
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
  global.FillApply_oraclecloudAdapter = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : self);
