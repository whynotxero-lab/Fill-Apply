/**
 * NaukriGulf / Naukrigulf board adapter — Apply OR Easy Apply start, then fill.
 *
 * PREREQUISITE: User must have a 100% complete NaukriGulf profile on the platform.
 * Incomplete profiles redirect to profile completion instead of the job/apply page.
 * See docs/APPLICATION_GUIDE.md → "NaukriGulf — profile completeness" and
 * "NaukriGulf Easy Apply".
 *
 * Flows:
 * A) Easy Apply — on-page popup/modal with screening Yes/No questions.
 *    1. Click Easy Apply (or use already-open modal)
 *    2. Answer from profile.customAnswers / heuristics (UAE location, employed, industry)
 *    3. fill/ready: leave modal open (do NOT click Submit & Apply)
 *    4. submit: click Submit & Apply
 * B) Standard Apply — valid start CTA (no Easy Apply modal required).
 *    Click Apply / Apply Now; if destination is external ATS / new tab / host change,
 *    return WWR-style handoff (`externalApply` / `deferToPageAdapter` / `handedOff`)
 *    so the runner re-injects and continues fill. If an on-page form opens, fill via
 *    fallback. Prefer Easy Apply when both CTAs exist.
 *
 * Diversity surveys are N/A on this board. Structure drift (unknown required
 * Yes/No with no mapping) pauses in submit mode only.
 */
(function (global) {
  'use strict';

  var HOSTS = ['naukrigulf.com', 'www.naukrigulf.com'];
  var HOST_RE = /naukrigulf\.com/i;

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

  function humanDelay(base) {
    var b = typeof base === 'number' ? base : 400;
    return b + Math.floor(Math.random() * 300);
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

  function getLabelFor(el, root) {
    if (global.__fillApply && global.__fillApply.getLabelText) {
      var t = global.__fillApply.getLabelText(el);
      if (t) return t;
    }
    if (el.id) {
      try {
        var scope = root || document;
        var byFor = scope.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (byFor) return byFor.textContent.trim();
      } catch (_e) {
        /* ignore */
      }
    }
    var parent = el.closest('label');
    if (parent) return parent.textContent.trim();
    return el.getAttribute('aria-label') || el.placeholder || el.name || '';
  }

  function detectProfileRedirect(doc, href) {
    href = String(href || '');
    var bodyText = '';
    try {
      bodyText = doc && doc.body ? String(doc.body.innerText || '').slice(0, 8000) : '';
    } catch (_e) {
      bodyText = '';
    }
    return (
      /\/profile|completeness|complete-your-profile|updateprofile|myprofile/i.test(href) ||
      /complete your profile|profile completeness|complete profile|profile is incomplete|make your profile/i.test(
        bodyText
      )
    );
  }

  function profileRedirectResult() {
    return {
      ok: false,
      adapterId: 'naukrigulf',
      needsHuman: true,
      pauseReason: 'challenge',
      error:
        'NaukriGulf redirected to profile completion — finish profile to 100% on the platform, then Resume. See APPLICATION_GUIDE.',
      filled: 0,
      unmatched: 0,
      total: 0
    };
  }

  function findEasyApplyButton(doc) {
    doc = doc || document;
    var nodes = doc.querySelectorAll(
      'button, a, input[type="button"], input[type="submit"], [role="button"], span[onclick], div[role="button"]'
    );
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el)) continue;
      var t = buttonText(el);
      if (/easy\s*apply/i.test(t)) return el;
      if (
        /easyapply|easy-apply|ng-easy-apply/i.test(
          el.className + ' ' + el.id + ' ' + (el.getAttribute('data-ga-label') || '')
        )
      ) {
        return el;
      }
    }
    var byAttr = doc.querySelector(
      '[data-ga-label*="Easy Apply" i], [aria-label*="Easy Apply" i], a[href*="easyapply" i], button[class*="easyApply" i], .easyApply, #easyApply'
    );
    if (byAttr && visible(byAttr)) return byAttr;
    return null;
  }

  /**
   * Standard Apply / Apply Now (not Easy Apply, Submit & Apply, or board chrome).
   */
  function findApplyButton(doc) {
    doc = doc || document;
    var Syn = global.FillApplySynonyms;
    var nodes = doc.querySelectorAll(
      'button, a, input[type="button"], input[type="submit"], [role="button"], span[onclick], div[role="button"]'
    );
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el)) continue;
      var t = buttonText(el);
      if (!t) continue;
      if (/easy\s*apply/i.test(t)) continue;
      if (
        /easyapply|easy-apply|ng-easy-apply/i.test(
          el.className + ' ' + el.id + ' ' + (el.getAttribute('data-ga-label') || '')
        )
      ) {
        continue;
      }
      if (/submit\s*&\s*apply|submit and apply/i.test(t)) continue;
      if (
        /sign.?up|log.?in|subscribe|newsletter|share|save job|bookmark|upgrade|premium|post a job|hire|filter|register/i.test(
          t
        )
      ) {
        continue;
      }

      var score = 0;
      if (Syn && Syn.isApplyStartCta && Syn.isApplyStartCta(t)) {
        score = Syn.scoreApplyStartText ? Syn.scoreApplyStartText(t) : 60;
      } else if (/^apply now$/i.test(t.trim())) {
        score = 100;
      } else if (/apply for this job/i.test(t)) {
        score = 95;
      } else if (/^apply$/i.test(t.trim()) && t.length < 12) {
        score = 85;
      } else if (/\bapply now\b/i.test(t)) {
        score = 80;
      } else if (/\bapply\b/i.test(t) && t.length < 40) {
        score = 50;
      }
      if (score <= 0) continue;

      var href = resolveHref(el);
      if (href) {
        try {
          var hu = new URL(href, typeof location !== 'undefined' ? location.href : undefined);
          if (hu.hostname && !isNgHost(hu.hostname)) score += 10;
        } catch (_eHref) {}
      }
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function isNgHost(hostname) {
    return HOST_RE.test(String(hostname || ''));
  }

  function currentHostname() {
    try {
      return String((typeof location !== 'undefined' && location.hostname) || '');
    } catch (_e) {
      return '';
    }
  }

  function resolveHref(el) {
    if (!el) return '';
    try {
      var raw =
        el.href ||
        el.getAttribute('href') ||
        el.getAttribute('data-href') ||
        el.getAttribute('data-url') ||
        el.getAttribute('data-apply-url') ||
        '';
      if (!raw || raw === '#' || /^javascript:/i.test(raw)) return '';
      return new URL(raw, typeof location !== 'undefined' ? location.href : undefined).href;
    } catch (_e) {
      return '';
    }
  }

  function handoffResult(extra) {
    return Object.assign(
      {
        ok: true,
        adapterId: 'naukrigulf',
        externalApply: true,
        handedOff: true,
        deferToPageAdapter: true,
        clickedApplyStart: true,
        filled: 0,
        unmatched: 0,
        total: 0,
        submitted: false,
        message:
          'Opened NaukriGulf Apply — runner will re-detect destination ATS / form if navigation or a new tab opened'
      },
      extra || {}
    );
  }

  function tryDestinationFill(ctx) {
    var registry = global.FillApplyRegistry;
    if (!registry || typeof registry.detect !== 'function') return null;
    var href = '';
    try {
      href = String((typeof location !== 'undefined' && location.href) || '');
    } catch (_e) {}
    var next = registry.detect(href, typeof document !== 'undefined' ? document : null);
    if (!next || next.id === 'naukrigulf' || next.id === 'fallback') {
      var fb = global.FillApplyFallbackAdapter;
      if (fb && typeof fb.fill === 'function') {
        var fr = fb.fill(
          Object.assign({}, ctx, {
            adapterId: 'fallback',
            url: href
          })
        );
        if (fr && typeof fr === 'object') {
          fr.externalApply = true;
          fr.handedOff = true;
          fr.fromAdapter = 'naukrigulf';
        }
        return fr;
      }
      return null;
    }
    if (typeof next.fill !== 'function') return null;
    return next.fill(
      Object.assign({}, ctx, {
        adapterId: next.id,
        submitSelector: next.submitSelector,
        fileInputHints: next.fileInputHints,
        fieldMaps: next.fieldMaps,
        url: href
      })
    );
  }

  function pageHasApplicationForm(doc) {
    doc = doc || document;
    var Syn = global.FillApplySynonyms;
    if (Syn && Syn.isApplicationFormOpen) {
      try {
        if (Syn.isApplicationFormOpen(doc)) return true;
      } catch (_e) {}
    }
    try {
      return !!(
        doc &&
        doc.querySelector(
          'form input[type="email"], form input[name*="email" i], form textarea, form input[type="file"], form input[type="text"]'
        )
      );
    } catch (_e2) {
      return false;
    }
  }

    /**
   * Locate the Easy Apply modal/dialog root.
   */
  function findEasyApplyModal(doc) {
    doc = doc || document;

    var dialogs = doc.querySelectorAll(
      '[role="dialog"], dialog, .modal, .Modal, [class*="modal"], [class*="Modal"], [class*="popup"], [class*="Popup"], [class*="overlay"], [class*="Overlay"]'
    );
    for (var i = 0; i < dialogs.length; i++) {
      var d = dialogs[i];
      if (!visible(d)) continue;
      var txt = (d.textContent || '').replace(/\s+/g, ' ');
      if (/submit\s*&\s*apply|submit and apply/i.test(txt)) return d;
      if (/are you currently|would require below details|confidential company/i.test(txt)) return d;
      if (/\byes\b/i.test(txt) && /\bno\b/i.test(txt) && /currently|located|experience|industry/i.test(txt)) {
        return d;
      }
    }

    // Fallback: element that contains Submit & Apply button
    var buttons = doc.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]');
    for (var b = 0; b < buttons.length; b++) {
      var btn = buttons[b];
      if (!visible(btn)) continue;
      if (/submit\s*&\s*apply|submit and apply/i.test(buttonText(btn))) {
        var root =
          btn.closest('[role="dialog"], dialog, .modal, .Modal, [class*="modal"], [class*="popup"], form') ||
          btn.parentElement;
        if (root && visible(root)) return root;
      }
    }

    return null;
  }

  function waitForModal(doc, timeoutMs) {
    doc = doc || document;
    timeoutMs = timeoutMs || 5000;
    var start = Date.now();
    return new Promise(function (resolve) {
      function tick() {
        var modal = findEasyApplyModal(doc);
        if (modal) {
          resolve(modal);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(tick, 200);
      }
      tick();
    });
  }

  function answerFromCustom(profile, label) {
    var lab = norm(label);
    if (!lab) return null;

    var map = profile && profile.customAnswers;
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      var keys = Object.keys(map);
      var best = null;
      var bestScore = 0;
      for (var i = 0; i < keys.length; i++) {
        var k = norm(keys[i]);
        if (!k) continue;
        if (lab.indexOf(k) !== -1 || k.indexOf(lab) !== -1) {
          var score = Math.min(k.length, lab.length);
          if (score > bestScore) {
            bestScore = score;
            best = map[keys[i]];
          }
        }
      }
      if (best != null && String(best).trim() !== '') return String(best).trim();
    }

    if (global.FillApplyFieldMap && global.FillApplyFieldMap.matchCustomQA) {
      var qa = global.FillApplyFieldMap.matchCustomQA(profile && profile.customQA, label, '');
      if (qa) return qa;
    }
    return null;
  }

  function profileSuggestsUae(profile) {
    var blob = norm(
      [
        profile && profile.country,
        profile && profile.location,
        profile && profile.city,
        profile && profile.state
      ].join(' ')
    );
    return /uae|u\.a\.e|united arab emirates|\bdubai\b|\babudhabi\b|abu dhabi|\bsharjah\b|\bajman\b/.test(
      blob
    );
  }

  function toYesNo(val) {
    if (val == null || String(val).trim() === '') return null;
    var s = String(val).trim();
    if (/^(yes|y|true|1|on)$/i.test(s)) return 'Yes';
    if (/^(no|n|false|0|off)$/i.test(s)) return 'No';
    // Free text that clearly affirms/negates
    if (/^yes\b/i.test(s)) return 'Yes';
    if (/^no\b/i.test(s)) return 'No';
    return null;
  }

  /**
   * Resolve Yes/No for a screening question label.
   * Returns { answer: 'Yes'|'No'|null, known: boolean, reason: string }
   */
  function resolveYesNoAnswer(profile, questionLabel) {
    profile = profile || {};
    var lab = norm(questionLabel);

    var custom = answerFromCustom(profile, questionLabel);
    var yn = toYesNo(custom);
    if (yn) return { answer: yn, known: true, reason: 'customAnswers' };

    // Currently employed
    if (/currently employed|are you employed|presently employed|currently working/i.test(lab)) {
      yn =
        toYesNo(answerFromCustom(profile, 'currently employed')) ||
        toYesNo(answerFromCustom(profile, 'Are you currently employed?')) ||
        toYesNo(profile.currentlyEmployed) ||
        toYesNo(profile.employed);
      if (yn) return { answer: yn, known: true, reason: 'employed' };
      // Default unknown — do not invent
      return { answer: null, known: false, reason: 'employed_unknown' };
    }

    // Located in UAE / country
    if (
      /located in uae|currently located in uae|in the uae|united arab emirates|located in.*uae|based in uae/i.test(
        lab
      ) ||
      (/located in|currently located|based in/i.test(lab) && /uae|emirates|dubai/i.test(lab))
    ) {
      if (profileSuggestsUae(profile)) {
        return { answer: 'Yes', known: true, reason: 'uae_location' };
      }
      yn =
        toYesNo(answerFromCustom(profile, 'located in UAE')) ||
        toYesNo(answerFromCustom(profile, 'Are you currently located in UAE?'));
      if (yn) return { answer: yn, known: true, reason: 'uae_custom' };
      return { answer: 'No', known: true, reason: 'uae_not_in_profile' };
    }

    // Work experience in … industry
    if (/work experience in|experience in .+ industry|manufacturing industry|industry\??\s*$/i.test(lab)) {
      yn =
        toYesNo(custom) ||
        toYesNo(answerFromCustom(profile, questionLabel)) ||
        toYesNo(answerFromCustom(profile, 'manufacturing industry')) ||
        toYesNo(answerFromCustom(profile, 'work experience in manufacturing'));
      if (yn) return { answer: yn, known: true, reason: 'industry_custom' };
      return { answer: null, known: false, reason: 'industry_unknown' };
    }

    // Generic: only if customAnswers matched somehow as non-Yes/No text — already handled
    if (custom != null) {
      yn = toYesNo(custom);
      if (yn) return { answer: yn, known: true, reason: 'customAnswers' };
    }

    return { answer: null, known: false, reason: 'unmapped' };
  }

  /**
   * Collect Yes/No question blocks inside the modal.
   * Each item: { label, root, radios/yesEl/noEl }
   */
  function collectYesNoQuestions(modal) {
    var questions = [];
    if (!modal) return questions;

    var seen = [];

    function alreadyHave(label) {
      var n = norm(label);
      for (var i = 0; i < seen.length; i++) {
        if (seen[i] === n) return true;
      }
      return false;
    }

    // Fieldsets / question rows
    var groups = modal.querySelectorAll(
      'fieldset, [role="group"], [class*="question"], [class*="Question"], [class*="screening"], li, .form-group, .row, div'
    );
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      if (!visible(group)) continue;
      var radios = group.querySelectorAll('input[type="radio"]');
      if (radios.length < 2) continue;

      // Prefer legend / label text excluding Yes/No-only noise
      var labelEl =
        group.querySelector('legend, .question-text, [class*="label"], label:not([for])') || null;
      var labelText = '';
      if (labelEl) {
        labelText = (labelEl.textContent || '').replace(/\s+/g, ' ').trim();
      }
      if (!labelText || /^yes$|^no$/i.test(labelText) || labelText.length < 8) {
        // Use group text but strip trailing Yes/No options
        labelText = (group.textContent || '')
          .replace(/\s+/g, ' ')
          .replace(/\bYes\b/gi, ' ')
          .replace(/\bNo\b/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      // Keep short-ish question labels
      if (!labelText || labelText.length < 8 || labelText.length > 220) continue;
      if (!/\?|employed|located|experience|industry|are you|do you|have you/i.test(labelText)) {
        // Still accept if it looks like a screening prompt
        if (!/currently|uae|manufacturing|work/i.test(labelText)) continue;
      }
      if (alreadyHave(labelText)) continue;

      var yesRadio = null;
      var noRadio = null;
      for (var r = 0; r < radios.length; r++) {
        var radio = radios[r];
        var rLab = getLabelFor(radio, modal) || radio.value || '';
        if (/^(yes|y|true|1)$/i.test(rLab.trim()) || /\byes\b/i.test(rLab)) yesRadio = radio;
        else if (/^(no|n|false|0)$/i.test(rLab.trim()) || /\bno\b/i.test(rLab)) noRadio = radio;
      }
      if (!yesRadio && !noRadio) continue;

      seen.push(norm(labelText));
      questions.push({
        label: labelText,
        root: group,
        yesRadio: yesRadio,
        noRadio: noRadio
      });
    }

    // Also: clickable Yes/No labels without radios (buttons / spans)
    if (!questions.length) {
      var textBlocks = modal.querySelectorAll('p, label, div, li, span, h3, h4');
      for (var t = 0; t < textBlocks.length; t++) {
        var block = textBlocks[t];
        if (!visible(block)) continue;
        var bt = (block.textContent || '').replace(/\s+/g, ' ').trim();
        if (bt.length < 12 || bt.length > 180) continue;
        if (!/\?$|are you|do you|have you|currently|experience in/i.test(bt)) continue;
        if (alreadyHave(bt)) continue;
        var container = block.closest('div, li, fieldset, section') || block.parentElement;
        if (!container) continue;
        var yesEl = null;
        var noEl = null;
        var opts = container.querySelectorAll('button, label, span, a, [role="radio"], [role="button"]');
        for (var o = 0; o < opts.length; o++) {
          var ot = buttonText(opts[o]);
          if (/^yes$/i.test(ot.trim())) yesEl = opts[o];
          if (/^no$/i.test(ot.trim())) noEl = opts[o];
        }
        if (yesEl || noEl) {
          seen.push(norm(bt));
          questions.push({
            label: bt,
            root: container,
            yesRadio: yesEl,
            noRadio: noEl
          });
        }
      }
    }

    return questions;
  }

  function clickYesNo(question, wantYes) {
    var target = wantYes ? question.yesRadio : question.noRadio;
    if (!target) return false;
    try {
      if (target.tagName === 'INPUT' && String(target.type).toLowerCase() === 'radio') {
        target.click();
        target.checked = true;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        target.click();
      }
      return true;
    } catch (_e) {
      return false;
    }
  }

  function findSubmitAndApply(modal) {
    var root = modal || document;
    var nodes = root.querySelectorAll(
      'button, a, input[type="button"], input[type="submit"], [role="button"]'
    );
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el) || el.disabled) continue;
      var t = buttonText(el);
      if (/submit\s*&\s*apply|submit and apply/i.test(t)) return el;
    }
    return null;
  }

  function answerModalQuestions(modal, profile, runMode) {
    var questions = collectYesNoQuestions(modal);
    var filled = 0;
    var unmatched = [];
    var answered = [];

    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var resolved = resolveYesNoAnswer(profile, q.label);
      if (resolved.answer) {
        var wantYes = resolved.answer === 'Yes';
        if (clickYesNo(q, wantYes)) {
          filled++;
          answered.push({ label: q.label, answer: resolved.answer, reason: resolved.reason });
        } else {
          unmatched.push(q.label);
        }
      } else {
        unmatched.push(q.label);
      }
    }

    return {
      filled: filled,
      unmatchedLabels: unmatched,
      answered: answered,
      questionCount: questions.length
    };
  }

  function fill(ctx) {
    ctx = ctx || {};
    var profile = ctx.profile || {};
    var doc = (ctx && ctx.document) || (typeof document !== 'undefined' ? document : null);
    var runMode = ctx.runMode || (ctx.options && ctx.options.runMode) || 'fill';
    if (['fill', 'ready', 'submit'].indexOf(runMode) === -1) runMode = 'fill';

    var href = '';
    try {
      href = String((ctx && ctx.url) || (typeof location !== 'undefined' ? location.href : '') || '');
    } catch (_e) {
      href = '';
    }

    if (!doc) {
      return {
        ok: false,
        adapterId: 'naukrigulf',
        error: 'No document',
        filled: 0,
        unmatched: 0,
        total: 0
      };
    }

    if (detectProfileRedirect(doc, href)) {
      return profileRedirectResult();
    }

    if (global.FillApplyChallenges && global.FillApplyChallenges.detectChallenge) {
      var ch = global.FillApplyChallenges.detectChallenge(doc);
      if (ch && ch.challenged) {
        return {
          ok: false,
          adapterId: 'naukrigulf',
          needsHuman: true,
          challenge: ch,
          filled: 0,
          unmatched: 0,
          total: 0,
          error: global.FillApplyChallenges.describeChallenge(ch) || 'Human verification required',
          pauseReason: 'challenge'
        };
      }
    }

    return Promise.resolve().then(async function () {
      var totalFilled = 0;
      var submitted = false;
      var advanced = false;
      var clickedApplyStart = false;
      var startKind = null;
      var modal = findEasyApplyModal(doc);

      // Open Easy Apply (preferred) or standard Apply if modal not already present
      if (!modal) {
        var easyBtn = findEasyApplyButton(doc);
        var applyBtn = findApplyButton(doc);
        if (easyBtn) {
          try {
            easyBtn.click();
            advanced = true;
            startKind = 'easy_apply';
            await sleep(humanDelay(500));
          } catch (_e2) {
            /* ignore */
          }
          modal = await waitForModal(doc, 5500);
        } else if (applyBtn) {
          var startHost = currentHostname();
          var applyHref = resolveHref(applyBtn);
          var externalTarget = false;
          if (applyHref) {
            try {
              var au = new URL(applyHref);
              if (au.hostname && !isNgHost(au.hostname)) externalTarget = true;
            } catch (_eExt) {}
          }
          try {
            applyBtn.click();
            advanced = true;
            clickedApplyStart = true;
            startKind = 'apply';
          } catch (_eApplyClick) {
            try {
              if (applyHref) location.href = applyHref;
              advanced = true;
              clickedApplyStart = true;
              startKind = 'apply';
            } catch (_eNav) {}
          }

          // Known off-site Apply URL → hand off immediately (runner re-detects)
          if (externalTarget) {
            return handoffResult({
              externalUrl: applyHref,
              advanced: true,
              startKind: 'apply',
              message:
                'Opened NaukriGulf Apply (external URL) — runner will re-detect destination ATS'
            });
          }

          await sleep(humanDelay(500));
          // Some Apply CTAs still open the Easy Apply-style modal
          modal = await waitForModal(doc, 3500);

          if (!modal) {
            if (detectProfileRedirect(doc, typeof location !== 'undefined' ? location.href : href)) {
              return profileRedirectResult();
            }

            var hostNow = currentHostname();
            if (hostNow && startHost && hostNow !== startHost && !isNgHost(hostNow)) {
              var dest = tryDestinationFill(ctx);
              if (dest && typeof dest.then === 'function') dest = await dest;
              if (dest && typeof dest === 'object') {
                dest.externalApply = true;
                dest.handedOff = true;
                dest.clickedApplyStart = true;
                dest.fromAdapter = 'naukrigulf';
                dest.startKind = 'apply';
                if (!dest.message) {
                  dest.message =
                    'NaukriGulf Apply handed off — continue with destination ATS adapter';
                }
                return dest;
              }
              return handoffResult({
                advanced: true,
                startKind: 'apply',
                message:
                  'Opened NaukriGulf Apply — runner will re-detect destination ATS'
              });
            }

            if (pageHasApplicationForm(doc)) {
              var fb = global.FillApplyFallbackAdapter;
              if (fb && typeof fb.fill === 'function') {
                var formResult = fb.fill(
                  Object.assign({}, ctx, {
                    adapterId: 'naukrigulf',
                    submitSelector: adapter.submitSelector,
                    fileInputHints: adapter.fileInputHints,
                    fieldMaps: adapter.fieldMaps
                  })
                );
                if (formResult && typeof formResult.then === 'function') {
                  formResult = await formResult;
                }
                if (formResult && typeof formResult === 'object') {
                  formResult.clickedApplyStart = true;
                  formResult.advanced = true;
                  formResult.startKind = 'apply';
                  formResult.fromAdapter = formResult.fromAdapter || 'naukrigulf';
                  if (!formResult.adapterId) formResult.adapterId = 'naukrigulf';
                }
                return formResult;
              }
            }

            // Apply clicked — form may be in another tab or still loading
            return handoffResult({
              advanced: true,
              startKind: 'apply',
              message:
                'NaukriGulf Apply clicked — if an external ATS, new tab, or form opened, runner will re-detect; otherwise open Apply manually then Resume'
            });
          }
        } else {
          // Maybe modal already open after navigation
          modal = await waitForModal(doc, 1500);
        }
      }

      if (detectProfileRedirect(doc, typeof location !== 'undefined' ? location.href : href)) {
        return profileRedirectResult();
      }

      if (!modal) {
        return {
          ok: false,
          adapterId: 'naukrigulf',
          needsHuman: true,
          pauseReason: 'structure_drift',
          error:
            'NaukriGulf Apply / Easy Apply did not start — click Apply or Easy Apply manually (profile must be 100% complete), then Resume.',
          filled: 0,
          unmatched: 0,
          total: 0,
          advanced: advanced,
          clickedApplyStart: clickedApplyStart,
          startKind: startKind,
          submitted: false,
          runMode: runMode
        };
      }

      var result = answerModalQuestions(modal, profile, runMode);
      totalFilled += result.filled || 0;

      // Unknown required questions
      if (result.unmatchedLabels && result.unmatchedLabels.length) {
        if (runMode === 'submit') {
          var ngMissing = (result.unmatchedLabels || []).map(function (l) {
            return String(l).replace(/\s+/g, ' ').trim().slice(0, 80);
          });
          return {
            ok: false,
            adapterId: 'naukrigulf',
            needsHuman: true,
            pauseReason: 'missing_profile_field',
            missingProfileFields: ngMissing,
            error:
              'NaukriGulf Easy Apply: unanswered required screening question — fill in Options or on the page, then Resume. "' +
              String(result.unmatchedLabels[0]).slice(0, 120) +
              '"',
            filled: totalFilled,
            unmatched: result.unmatchedLabels.length,
            total: totalFilled + result.unmatchedLabels.length,
            unmatchedLabels: result.unmatchedLabels,
            answered: result.answered,
            advanced: advanced,
            submitted: false,
            runMode: runMode,
            driftLabel: result.unmatchedLabels[0]
          };
        }
        // fill / ready: leave unanswered, form still "ready" in modal
      }

      if (runMode === 'submit') {
        var submitBtn = findSubmitAndApply(modal);
        if (submitBtn) {
          try {
            submitBtn.click();
            submitted = true;
            await sleep(humanDelay(400));
          } catch (_e3) {
            return {
              ok: false,
              adapterId: 'naukrigulf',
              needsHuman: true,
              pauseReason: 'structure_drift',
              error: 'NaukriGulf Easy Apply: could not click Submit & Apply',
              filled: totalFilled,
              unmatched: result.unmatchedLabels.length,
              total: totalFilled,
              advanced: advanced,
              submitted: false,
              runMode: runMode
            };
          }
        } else {
          return {
            ok: false,
            adapterId: 'naukrigulf',
            needsHuman: true,
            pauseReason: 'structure_drift',
            error: 'NaukriGulf Easy Apply: Submit & Apply button not found in modal',
            filled: totalFilled,
            unmatched: result.unmatchedLabels.length,
            total: totalFilled,
            advanced: advanced,
            submitted: false,
            runMode: runMode
          };
        }
      }

      return {
        ok: true,
        adapterId: 'naukrigulf',
        filled: totalFilled,
        unmatched: (result.unmatchedLabels && result.unmatchedLabels.length) || 0,
        total: totalFilled + ((result.unmatchedLabels && result.unmatchedLabels.length) || 0),
        advanced: advanced,
        clickedApplyStart: clickedApplyStart,
        startKind: startKind || 'easy_apply',
        submitted: submitted,
        answered: result.answered,
        unmatchedLabels: result.unmatchedLabels,
        questionCount: result.questionCount,
        step: submitted ? 'submitted' : 'easy_apply_modal',
        runMode: runMode,
        error: null
      };
    });
  }

  var adapter = {
    id: 'naukrigulf',
    name: 'NaukriGulf',
    category: 'board',
    hosts: HOSTS,
    detect: detect,
    detectProfileRedirect: detectProfileRedirect,
    findEasyApplyModal: findEasyApplyModal,
    findEasyApplyButton: findEasyApplyButton,
    findApplyButton: findApplyButton,
    fieldMaps: [],
    submitSelector:
      'button[type="submit"], input[type="submit"], button[aria-label*="Submit" i]',
    fileInputHints: [
      { kind: 'resume', match: 'resume|cv' },
      { kind: 'cover', match: 'cover' }
    ],
    fill: fill
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
  global.FillApply_naukrigulfAdapter = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : self);
