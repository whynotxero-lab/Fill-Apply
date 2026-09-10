/**
 * iCIMS adapter — careers / apply flows often reached via LinkedIn External Apply
 * (example: PepsiCo → pepsicojobs.com → iCIMS welcome + application).
 *
 * Detection: icims.com hosts, "Powered by iCIMS", "Software Powered by ICIMS",
 * classic iCIMS job form chrome.
 *
 * Welcome step (operator paste): Email, privacy "I accept…", Next;
 * footer "Software Powered by ICIMS"; may show **Protected by hCaptcha**.
 *
 * Modes:
 *   fill / ready — welcome + form fill; Next/Continue OK; NEVER final submit
 *   submit — fill then submit when form looks complete (submit synonyms)
 *
 * EEO / diversity: never invent. Captcha → needsHuman via challenges.js.
 */
(function (global) {
  'use strict';

  var HOSTS = ['icims.com', 'www.icims.com'];
  var HOST_RE = /(^|\.)icims\.com$/i;

  function detect(url, doc) {
    url = String(url || '');
    try {
      var u = new URL(url, typeof location !== 'undefined' ? location.href : undefined);
      if (HOST_RE.test(u.hostname) || /icims\.com/i.test(u.hostname)) return true;
      for (var i = 0; i < HOSTS.length; i++) {
        var h = HOSTS[i].replace(/^www\./, '');
        if (u.hostname === HOSTS[i] || u.hostname === h || u.hostname.endsWith('.' + h)) {
          return true;
        }
      }
    } catch (_e) {
      if (/icims\.com/i.test(url)) return true;
    }
    if (doc) {
      try {
        var text = ((doc.body && doc.body.innerText) || '').slice(0, 10000);
        if (/software\s+powered\s+by\s+icims/i.test(text)) return true;
        if (/powered\s+by\s+icims/i.test(text)) return true;
        if (
          doc.querySelector(
            '.iCIMS_JobForm, #icims_content_iframe, [class*="iCIMS"], [id*="icims"], a[href*="icims.com"], img[alt*="iCIMS" i]'
          )
        ) {
          return true;
        }
      } catch (_e2) {}
    }
    return false;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function humanDelay(base) {
    var b = typeof base === 'number' ? base : 400;
    return b + Math.floor(Math.random() * 300);
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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
    return String(
      (el && (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('title'))) ||
        ''
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  function pageText(doc) {
    try {
      return doc && doc.body ? String(doc.body.innerText || '').slice(0, 12000) : '';
    } catch (_e) {
      return '';
    }
  }

  function challengePause(doc, filled) {
    if (!(global.FillApplyChallenges && global.FillApplyChallenges.detectChallenge)) return null;
    var ch = global.FillApplyChallenges.detectChallenge(doc);
    if (!ch || !ch.challenged) return null;
    return {
      ok: false,
      adapterId: 'icims',
      needsHuman: true,
      challenge: ch,
      pauseReason: 'challenge',
      error:
        (global.FillApplyChallenges.describeChallenge && global.FillApplyChallenges.describeChallenge(ch)) ||
        'iCIMS: human verification / hCaptcha required — complete it, then Resume.',
      filled: filled || 0,
      unmatched: 0,
      total: filled || 0,
      submitted: false
    };
  }

  function isEeoLabel(label) {
    return /diversity|eeo|equal opportunity|race|ethnicity|veteran|disability|sexual orientation|lgbt|transgender|hispanic|latino|voluntary self.?identif|decline to (self-)?identify|prefer not to|gender identity|gender\b/i.test(
      norm(label)
    );
  }

  function profileVal(profile, key) {
    if (!profile) return '';
    if (profile[key] != null && String(profile[key]).trim() !== '') return String(profile[key]).trim();
    return '';
  }

  function labelFor(el, doc) {
    doc = doc || document;
    if (!el) return '';
    if (global.__fillApply && global.__fillApply.getLabelText) {
      var t = global.__fillApply.getLabelText(el);
      if (t) return t;
    }
    try {
      if (el.id) {
        var esc = el.id;
        try {
          if (typeof CSS !== 'undefined' && CSS.escape) esc = CSS.escape(el.id);
        } catch (_eEsc) {}
        var lab = doc.querySelector('label[for="' + esc + '"]');
        if (lab) return buttonText(lab);
      }
      var parent = el.closest('label, .form-group, .field, [class*="field"], [class*="Form"], .iCIMS_JobFormField');
      if (parent) return buttonText(parent).slice(0, 220);
    } catch (_e) {}
    return String(el.getAttribute('aria-label') || el.name || el.placeholder || '');
  }

  function setNativeValue(el, value) {
    if (!el) return false;
    var type = String(el.type || '').toLowerCase();
    var str = value == null ? '' : String(value);

    if (type === 'checkbox') {
      var want = /^(yes|y|true|1|on|accept|i accept)$/i.test(str) || str === true;
      if (el.checked !== want) {
        try {
          el.click();
        } catch (_e) {}
        if (el.checked !== want) {
          el.checked = want;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      return true;
    }

    if (el.tagName === 'SELECT') {
      if (global.__fillApply && global.__fillApply.matchSelectOption) {
        return !!global.__fillApply.matchSelectOption(el, str);
      }
      var wantL = str.toLowerCase();
      for (var i = 0; i < el.options.length; i++) {
        var opt = el.options[i];
        var ot = (opt.textContent || '').trim().toLowerCase();
        var ov = String(opt.value || '').toLowerCase();
        if (ot === wantL || ov === wantL || (wantL && ot.indexOf(wantL) !== -1)) {
          el.selectedIndex = i;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }

    try {
      var proto =
        el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      var desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, str);
      else el.value = str;
    } catch (_e2) {
      el.value = str;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  /**
   * Careers job detail (e.g. pepsicojobs.com) → Apply Now before iCIMS welcome.
   */
  function ensureApplyView(doc) {
    doc = doc || document;
    var text = pageText(doc);
    // Already on welcome / form with email
    if (/i accept/i.test(text) && /e-?mail/i.test(text) && /next/i.test(text)) {
      return { clicked: false, kind: 'welcome' };
    }
    if (doc.querySelector('.iCIMS_JobForm, form[action*="icims" i], input[type="email"]')) {
      return { clicked: false, kind: 'form' };
    }

    var nodes = doc.querySelectorAll(
      'a, button, input[type="button"], input[type="submit"], [role="button"]'
    );
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el)) continue;
      var t = buttonText(el);
      if (!t || /premium|tailor|login|sign in|share|save/i.test(t)) continue;
      var score = 0;
      if (/^apply now$/i.test(t)) score = 100;
      else if (/^apply$/i.test(t) && t.length < 12) score = 80;
      else if (/apply for this (job|position|role)/i.test(t)) score = 90;
      else if (/\bapply now\b/i.test(t)) score = 85;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) {
      try {
        best.click();
      } catch (_e) {}
      return { clicked: true, kind: 'apply' };
    }
    return { clicked: false };
  }

  function isWelcomeStep(doc) {
    var text = pageText(doc);
    var hasEmail = !!doc.querySelector('input[type="email"], input[name*="email" i], input[id*="email" i]');
    var hasAccept = /i accept/i.test(text) || !!doc.querySelector('input[type="checkbox"]');
    var hasNext = false;
    var nodes = doc.querySelectorAll('button, input[type="submit"], input[type="button"], a, [role="button"]');
    for (var i = 0; i < nodes.length; i++) {
      if (/^next$/i.test(buttonText(nodes[i]).trim())) {
        hasNext = true;
        break;
      }
    }
    var powered = /powered by\s*icims|software powered by icims/i.test(text);
    var welcomeCopy = /welcome|start your application|begin application|i accept/i.test(text);
    // Welcome is Email + I accept + Next, usually with iCIMS chrome
    return hasEmail && hasAccept && hasNext && (powered || welcomeCopy);
  }

  function fillWelcomeStep(doc, profile) {
    var filled = 0;
    var email = profileVal(profile, 'email');
    var emailInputs = doc.querySelectorAll(
      'input[type="email"], input[name*="email" i], input[id*="email" i], input[placeholder*="email" i]'
    );
    for (var i = 0; i < emailInputs.length; i++) {
      var el = emailInputs[i];
      if (!visible(el) || el.disabled) continue;
      if (email && setNativeValue(el, email)) filled++;
    }

    // Privacy / I accept… checkbox
    var checks = doc.querySelectorAll('input[type="checkbox"]');
    for (var c = 0; c < checks.length; c++) {
      var cb = checks[c];
      if (!visible(cb) && cb.offsetParent === null) continue;
      var lab = labelFor(cb, doc) + ' ' + buttonText(cb.closest('label') || cb);
      if (/i accept|privacy|terms|consent|agree|policy/i.test(lab) || /i accept/i.test(pageText(doc))) {
        if (!cb.checked) {
          if (setNativeValue(cb, 'Yes')) filled++;
        } else {
          filled++;
        }
      }
    }
    // Also click label text containing I accept
    var labels = doc.querySelectorAll('label, span, div');
    for (var l = 0; l < labels.length; l++) {
      var node = labels[l];
      var nt = buttonText(node).slice(0, 160);
      if (/^i accept/i.test(nt) || /i accept.*privacy|i accept.*terms/i.test(nt)) {
        var inp = node.querySelector('input[type="checkbox"]') || (node.htmlFor && doc.getElementById(node.htmlFor));
        if (inp && !inp.checked) {
          try {
            node.click();
            filled++;
          } catch (_e) {
            try {
              inp.click();
              filled++;
            } catch (_e2) {}
          }
          break;
        }
      }
    }

    return filled;
  }

  function clickNext(doc) {
    doc = doc || document;
    var nodes = doc.querySelectorAll('button, input[type="submit"], input[type="button"], a, [role="button"]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el) || el.disabled) continue;
      var t = buttonText(el);
      if (/^next$/i.test(t.trim()) || /^continue$/i.test(t.trim())) {
        try {
          el.click();
          return true;
        } catch (_e) {}
      }
    }
    return false;
  }

  function isSubmitCta(t) {
    t = String(t || '');
    if (/^next$/i.test(t.trim()) || /^continue$/i.test(t.trim()) || /save and continue/i.test(t)) {
      return false;
    }
    if (global.FillApplySynonyms && global.FillApplySynonyms.isApplyCta) {
      return !!global.FillApplySynonyms.isApplyCta(t);
    }
    return /submit\s*application|submit\s*(&|and)\s*apply|^submit$/i.test(t) || /^apply now$/i.test(t);
  }

  function clickSubmit(doc) {
    doc = doc || document;
    var nodes = doc.querySelectorAll(
      'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]'
    );
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el) || el.disabled) continue;
      var t = buttonText(el);
      if (isSubmitCta(t)) {
        try {
          el.click();
          return true;
        } catch (_e) {}
      }
    }
    var fb = doc.querySelector(
      'input[type="submit"], button[type="submit"], .iCIMS_SubmitButton, button.iCIMS_PrimaryButton'
    );
    if (fb && visible(fb)) {
      var ft = buttonText(fb);
      if (!/^next$/i.test(ft.trim()) && !/^continue$/i.test(ft.trim())) {
        try {
          fb.click();
          return true;
        } catch (_e2) {}
      }
    }
    return false;
  }

  function formLooksComplete(doc) {
    // Heuristic: submit CTA visible and no obvious empty required email/name on welcome
    var nodes = doc.querySelectorAll('button, input[type="submit"], [role="button"]');
    for (var i = 0; i < nodes.length; i++) {
      if (visible(nodes[i]) && isSubmitCta(buttonText(nodes[i]))) return true;
    }
    return !!doc.querySelector('.iCIMS_SubmitButton, [class*="Submit"]');
  }

  var FIELD_MAPS = [
    { key: 'email', labels: ['email', 'e-mail'], names: ['email'] },
    { key: 'firstName', labels: ['first name'], names: ['firstname', 'first_name', 'fname'] },
    { key: 'lastName', labels: ['last name'], names: ['lastname', 'last_name', 'lname'] },
    { key: 'phone', labels: ['phone', 'mobile'], names: ['phone', 'mobile', 'telephone'] },
    { key: 'city', labels: ['city'], names: ['city'] },
    { key: 'country', labels: ['country'], names: ['country'] },
    { key: 'linkedin', labels: ['linkedin'], names: ['linkedin'] }
  ];

  var adapter = {
    id: 'icims',
    name: 'iCIMS',
    category: 'ats',
    hosts: HOSTS,
    detect: detect,
    fieldMaps: FIELD_MAPS,
    submitSelector:
      'input[type="submit"], button[type="submit"], .iCIMS_SubmitButton, button.iCIMS_PrimaryButton',
    fileInputHints: [
      { kind: 'resume', match: 'resume|cv' },
      { kind: 'cover', match: 'cover' }
    ],
    fill: function (ctx) {
      ctx = ctx || {};
      var doc = ctx.document || (typeof document !== 'undefined' ? document : null);
      var profile = ctx.profile || {};
      var runMode = ctx.runMode || (ctx.options && ctx.options.runMode) || 'fill';
      if (['fill', 'ready', 'submit'].indexOf(runMode) === -1) runMode = 'fill';

      return Promise.resolve().then(async function () {
        if (!doc) {
          return {
            ok: false,
            adapterId: 'icims',
            error: 'No document',
            filled: 0,
            unmatched: 0,
            total: 0
          };
        }

        var pause0 = challengePause(doc, 0);
        if (pause0) return pause0;

        ensureApplyView(doc);
        await sleep(humanDelay(500));

        var pause1 = challengePause(doc, 0);
        if (pause1) return pause1;

        var totalFilled = 0;
        var advanced = false;

        // Welcome: Email + I accept + Next
        if (isWelcomeStep(doc) || doc.querySelector('input[type="email"]')) {
          totalFilled += fillWelcomeStep(doc, profile);
          var pauseWelcome = challengePause(doc, totalFilled);
          if (pauseWelcome) {
            pauseWelcome.message =
              'iCIMS welcome: complete hCaptcha / captcha if shown, then Resume (Email + I accept filled when possible).';
            return pauseWelcome;
          }
          if (clickNext(doc)) {
            advanced = true;
            await sleep(humanDelay(700));
          }
        }

        var pause2 = challengePause(doc, totalFilled);
        if (pause2) return pause2;

        // Further steps: fallback fill (never invent EEO; never let fallback final-submit)
        var fb = global.FillApplyFallbackAdapter;
        var fbResult = null;
        if (fb && typeof fb.fill === 'function') {
          // Strip EEO-ish fieldMaps — fallback still may see labels; we skip inventing by not providing demo answers
          fbResult = fb.fill(
            Object.assign({}, ctx, {
              adapterId: 'icims',
              submitSelector: adapter.submitSelector,
              fileInputHints: adapter.fileInputHints,
              fieldMaps: adapter.fieldMaps.concat(FIELD_MAPS),
              runMode: 'fill',
              autoSubmit: false
            })
          );
          if (fbResult && typeof fbResult.then === 'function') fbResult = await fbResult;
          if (fbResult) {
            totalFilled += Number(fbResult.filled) || 0;
          }
        }

        // Skip inventing EEO: if fallback left diversity radios, do not force-select
        try {
          var inputs = doc.querySelectorAll('input, select, textarea');
          for (var i = 0; i < inputs.length; i++) {
            var lab = labelFor(inputs[i], doc);
            if (isEeoLabel(lab) && !inputs[i].value && !inputs[i].checked) {
              /* leave blank — never invent */
            }
          }
        } catch (_eeo) {}

        var pause3 = challengePause(doc, totalFilled);
        if (pause3) return pause3;

        var submitted = false;
        if (runMode === 'submit') {
          // Advance remaining Next/Continue then submit when complete
          for (var hop = 0; hop < 6; hop++) {
            var pauseHop = challengePause(doc, totalFilled);
            if (pauseHop) return pauseHop;
            if (formLooksComplete(doc) && clickSubmit(doc)) {
              submitted = true;
              await sleep(humanDelay(400));
              break;
            }
            if (clickNext(doc)) {
              advanced = true;
              await sleep(humanDelay(600));
              continue;
            }
            if (clickSubmit(doc)) {
              submitted = true;
              await sleep(humanDelay(400));
              break;
            }
            break;
          }
        }

        return {
          ok: true,
          adapterId: 'icims',
          filled: totalFilled,
          unmatched: (fbResult && fbResult.unmatched) || 0,
          total: totalFilled + ((fbResult && fbResult.unmatched) || 0),
          submitted: submitted,
          advanced: advanced,
          runMode: runMode,
          resumeAttached: !!(fbResult && fbResult.resumeAttached),
          message: submitted
            ? 'iCIMS: submitted application'
            : 'iCIMS: filled welcome/application fields (Software Powered by ICIMS); fill/ready never final-submit'
        };
      });
    }
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
  global.FillApply_icimsAdapter = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : self);
