/**
 * Workday adapter — myworkdayjobs.com / *.wd*.myworkdayjobs.com.
 *
 * Job detail Apply opens a "Start Your Application" modal with:
 *   Autofill with Resume | Apply Manually | Use My Last Application | Apply With LinkedIn
 * Prefer Apply Manually (or Autofill with Resume). Apply With LinkedIn only when
 * social-auth preference is the path. Stay on the same tab/popup — never idle on the modal.
 */
(function (global) {
  'use strict';

  function detect(url, doc) {
    url = String(url || '');
    if (/myworkdayjobs\.com|workdayjobs\.com|workday\.com/i.test(url)) return true;
    if (
      doc &&
      doc.querySelector(
        '[data-automation-id="jobPostingDescription"], [data-automation-id="applyButton"], [data-automation-id="submit"], [data-automation-id="applyManually"]'
      )
    ) {
      return true;
    }
    try {
      var body = doc && doc.body ? String(doc.body.innerText || '').slice(0, 4000) : '';
      if (/start your application/i.test(body) && /apply manually|autofill with resume/i.test(body)) {
        return true;
      }
    } catch (_e) {}
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
      var st = el.ownerDocument && el.ownerDocument.defaultView
        ? el.ownerDocument.defaultView.getComputedStyle(el)
        : null;
      if (st && (st.display === 'none' || st.visibility === 'hidden' || (st.opacity !== '' && st.opacity != null && Number(st.opacity) === 0))) {
        return false;
      }
      var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (r && r.width < 2 && r.height < 2) {
        var raw =
          (el.innerText || el.textContent || el.value || (el.getAttribute && el.getAttribute('aria-label')) || '');
        if (String(raw).replace(/\s+/g, ' ').trim()) return true;
        return false;
      }
      return true;
    } catch (_e) {
      return true;
    }
  }

  function buttonText(el) {
    return String(
      (el &&
        (el.innerText ||
          el.textContent ||
          el.value ||
          (el.getAttribute && el.getAttribute('aria-label')) ||
          (el.getAttribute && el.getAttribute('data-automation-id')))) ||
        ''
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  function queryClickables(doc) {
    doc = doc || document;
    var sel =
      'a, button, input[type="button"], input[type="submit"], [role="button"], [data-automation-id], div[role="link"]';
    try {
      return Array.prototype.slice.call(doc.querySelectorAll(sel));
    } catch (_e) {
      return [];
    }
  }

  function findByText(doc, re, opts) {
    opts = opts || {};
    var nodes = queryClickables(doc);
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el)) continue;
      var t = buttonText(el);
      if (!t) continue;
      if (opts.exclude && opts.exclude.test(t)) continue;
      if (!re.test(t) && !(el.getAttribute && re.test(String(el.getAttribute('data-automation-id') || '')))) {
        continue;
      }
      var score = 50 + Math.min(40, 100 - t.length);
      if (opts.preferExact && re.test(t) && t.length < 40) score += 25;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function hasStartApplicationModal(doc) {
    doc = doc || document;
    var body = '';
    try {
      body = String((doc.body && (doc.body.innerText || doc.body.textContent)) || '').slice(0, 8000);
    } catch (_e) {
      body = '';
    }
    if (/start your application/i.test(body) && /apply manually|autofill with resume|apply with linkedin/i.test(body)) {
      return true;
    }
    return !!(
      findByText(doc, /^apply manually$/i, { preferExact: true }) ||
      findByText(doc, /autofill with resume/i, { preferExact: true }) ||
      doc.querySelector('[data-automation-id="applyManually"], [data-automation-id="autofillWithResume"]')
    );
  }

  function clickStartModalOption(doc, preferSocial) {
    doc = doc || document;
    // Prefer Apply Manually, then Autofill with Resume. LinkedIn only when social preferred.
    var order = preferSocial
      ? [
          { re: /apply with linkedin/i, label: 'Apply With LinkedIn', auto: 'applyWithLinkedIn' },
          { re: /^apply manually$/i, label: 'Apply Manually', auto: 'applyManually' },
          { re: /autofill with resume/i, label: 'Autofill with Resume', auto: 'autofillWithResume' }
        ]
      : [
          { re: /^apply manually$/i, label: 'Apply Manually', auto: 'applyManually' },
          { re: /autofill with resume/i, label: 'Autofill with Resume', auto: 'autofillWithResume' },
          { re: /use my last application/i, label: 'Use My Last Application', auto: 'useMyLastApplication' }
        ];
    for (var i = 0; i < order.length; i++) {
      var item = order[i];
      var byAuto = null;
      try {
        byAuto = doc.querySelector('[data-automation-id="' + item.auto + '"]');
      } catch (_q) {}
      var el = (byAuto && visible(byAuto) ? byAuto : null) || findByText(doc, item.re, { preferExact: true });
      if (!el) continue;
      try {
        if (el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest' });
      } catch (_s) {}
      try {
        el.click();
        return { clicked: true, text: buttonText(el) || item.label, reason: item.auto };
      } catch (_c) {
        try {
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          return { clicked: true, text: buttonText(el) || item.label, reason: item.auto + '_dispatch' };
        } catch (_c2) {}
      }
    }
    return { clicked: false };
  }

  function clickJobApply(doc) {
    doc = doc || document;
    var apply =
      doc.querySelector('[data-automation-id="applyButton"], [data-automation-id="adventureButton"]') ||
      findByText(doc, /^apply$/i, { preferExact: true, exclude: /manually|linkedin|autofill|last application/i }) ||
      findByText(doc, /^apply now$/i, { preferExact: true });
    if (!apply || !visible(apply)) return { clicked: false };
    try {
      apply.click();
      return { clicked: true, text: buttonText(apply) || 'Apply' };
    } catch (_e) {
      return { clicked: false };
    }
  }

  function pageHasFormFields(doc) {
    doc = doc || document;
    var Syn = global.FillApplySynonyms;
    if (Syn && Syn.isApplicationFormOpen) return !!Syn.isApplicationFormOpen(doc, 2);
    var inputs = doc.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'
    );
    var n = 0;
    for (var i = 0; i < inputs.length; i++) {
      if (visible(inputs[i])) n += 1;
    }
    return n >= 2;
  }

  function preferSocialLinkedIn(ctx) {
    ctx = ctx || {};
    var opts = ctx.options || {};
    if (opts.preferLinkedIn === true || opts.preferSocialAuth === true) return true;
    var profile = ctx.profile || {};
    if (profile.__preferLinkedInAuth || profile.preferLinkedInAuth) return true;
    return false;
  }

  async function fill(ctx) {
    ctx = ctx || {};
    var doc = ctx.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) {
      return { ok: false, adapterId: 'workday', error: 'No document', filled: 0, unmatched: 0, total: 0 };
    }
    var steps = [];
    var social = preferSocialLinkedIn(ctx);

    if (hasStartApplicationModal(doc)) {
      var modalClick = clickStartModalOption(doc, social);
      if (modalClick.clicked) {
        steps.push({ step: 'start_modal', text: modalClick.text, reason: modalClick.reason });
        await sleep(700);
        return {
          ok: true,
          adapterId: 'workday',
          clickedApplyStart: true,
          reDetect: true,
          advanced: true,
          // Stay on this Workday tab — do not signal external handoff/tab hop.
          handedOff: false,
          externalApply: false,
          stayOnTab: true,
          filled: 0,
          unmatched: 0,
          total: 0,
          submitted: false,
          workdaySteps: steps,
          message: 'Workday: clicked "' + modalClick.text + '" — continuing on same tab',
          applyStartText: modalClick.text,
          error: null
        };
      }
      return {
        ok: false,
        needsHuman: true,
        pauseReason: 'workday_start_modal',
        adapterId: 'workday',
        filled: 0,
        unmatched: 0,
        total: 0,
        submitted: false,
        workdaySteps: steps,
        error:
          'Workday Start Your Application modal visible — could not click Apply Manually (paused on same tab)'
      };
    }

    if (!pageHasFormFields(doc)) {
      var apply = clickJobApply(doc);
      if (apply.clicked) {
        steps.push({ step: 'apply', text: apply.text });
        await sleep(600);
        if (hasStartApplicationModal(doc)) {
          var modal2 = clickStartModalOption(doc, social);
          if (modal2.clicked) {
            steps.push({ step: 'start_modal', text: modal2.text, reason: modal2.reason });
            await sleep(700);
          }
        }
        return {
          ok: true,
          adapterId: 'workday',
          clickedApplyStart: true,
          reDetect: true,
          advanced: true,
          handedOff: false,
          externalApply: false,
          stayOnTab: true,
          filled: 0,
          unmatched: 0,
          total: 0,
          submitted: false,
          workdaySteps: steps,
          message: 'Workday: clicked Apply / start modal — continuing on same tab',
          error: null
        };
      }
    }

    var fb = global.FillApplyFallbackAdapter;
    if (!fb) {
      return {
        ok: false,
        adapterId: 'workday',
        error: 'Fallback adapter missing',
        filled: 0,
        unmatched: 0,
        total: 0,
        workdaySteps: steps
      };
    }
    var result = await fb.fill(
      Object.assign({}, ctx, {
        adapterId: 'workday',
        submitSelector: adapter.submitSelector,
        fileInputHints: adapter.fileInputHints,
        fieldMaps: adapter.fieldMaps
      })
    );
    result = result || {};
    result.adapterId = 'workday';
    result.workdaySteps = steps;
    // If fallback says no fields but modal is up, force modal click path next.
    if (
      result.ok === false &&
      /no application form fields|apply\/apply with cv visible/i.test(String(result.error || '')) &&
      hasStartApplicationModal(doc)
    ) {
      var modal3 = clickStartModalOption(doc, social);
      if (modal3.clicked) {
        return {
          ok: true,
          adapterId: 'workday',
          clickedApplyStart: true,
          reDetect: true,
          advanced: true,
          handedOff: false,
          externalApply: false,
          stayOnTab: true,
          filled: 0,
          unmatched: 0,
          total: 0,
          submitted: false,
          workdaySteps: steps.concat([{ step: 'start_modal', text: modal3.text }]),
          message: 'Workday: clicked "' + modal3.text + '" after empty-form — same tab',
          error: null
        };
      }
    }
    return result;
  }

  var adapter = {
    category: 'ats',
    id: 'workday',
    name: 'Workday',
    detect: detect,
    fieldMaps: [],
    submitSelector:
      '[data-automation-id="submit"], button[data-automation-id="bottom-submit"], button[type="submit"]',
    fileInputHints: [
      { kind: 'resume', match: 'resume|cv', selector: 'input[type=file]' },
      { kind: 'cover', match: 'cover' }
    ],
    hasStartApplicationModal: hasStartApplicationModal,
    clickStartModalOption: clickStartModalOption,
    fill: fill
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
  global.FillApply_workdayAdapter = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : self);
