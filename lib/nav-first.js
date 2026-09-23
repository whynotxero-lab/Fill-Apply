/**
 * Nav-first page action decision (SLICE 2).
 *
 * Locked order every step:
 *   (a) apply-start / start CTA if present and form not open
 *   (b) auth / login wall (caller owns — this module only signals)
 *   (c) fill fields when required
 *   (d) advance Continue / Next
 *   (e) else stop with a clear reason
 *
 * Do NOT treat filled 0/0 as done while a clickable Apply/start CTA remains.
 * Do NOT click Submit as the first hop on a job-description page.
 *
 * Attaches globalThis.FillApplyNavFirst.
 */
(function (global) {
  'use strict';

  var ACTIONS = {
    APPLY_START: 'apply_start',
    AUTH: 'auth',
    FILL: 'fill',
    ADVANCE: 'advance',
    STOP: 'stop'
  };

  function syn() {
    return global.FillApplySynonyms || null;
  }

  function buttonText(el) {
    var S = syn();
    if (S && typeof S.buttonText === 'function') return String(S.buttonText(el) || '');
    if (!el) return '';
    return String(
      (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.title || '')
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * True when page still shows a start CTA and does not look like an open form.
   * Job overview / options pages with purple Apply fall here.
   */
  function hasClickableApplyStart(root, opts) {
    opts = opts || {};
    root = root || (typeof document !== 'undefined' ? document : null);
    var S = syn();
    if (!root || !S || typeof S.findApplyStartButtons !== 'function') return false;
    var btns = S.findApplyStartButtons(root) || [];
    if (!btns.length) return false;
    if (opts.force) return true;
    var formOpen =
      typeof S.isApplicationFormOpen === 'function'
        ? S.isApplicationFormOpen(root, opts.minFields)
        : false;
    // High-confidence start CTAs (Apply / Apply now / Start application) win
    // even if a sparse newsletter email made the form scorer ambiguous.
    for (var i = 0; i < btns.length; i++) {
      var t = buttonText(btns[i]);
      var score =
        typeof S.scoreApplyStartText === 'function' ? S.scoreApplyStartText(t) : 0;
      if (score >= 80) return true;
      if (S.isApplyStartDataCta && S.isApplyStartDataCta(btns[i])) return true;
    }
    if (formOpen) return false;
    return true;
  }

  function hasAdvanceCta(root) {
    root = root || (typeof document !== 'undefined' ? document : null);
    var S = syn();
    if (!root || !S || typeof S.findContinueButtons !== 'function') return false;
    var btns = S.findContinueButtons(root) || [];
    return btns.length > 0;
  }

  function fillableCount(root, opts) {
    opts = opts || {};
    root = root || (typeof document !== 'undefined' ? document : null);
    var S = syn();
    if (!root || !S) return 0;
    if (typeof S.countFillableApplicationInputs === 'function') {
      return S.countFillableApplicationInputs(root) || 0;
    }
    return 0;
  }

  function looksLikeAuthWall(root) {
    root = root || (typeof document !== 'undefined' ? document : null);
    if (!root) return false;
    try {
      if (global.FillApplyAuthWalls && typeof global.FillApplyAuthWalls.detectAuthWall === 'function') {
        var w = global.FillApplyAuthWalls.detectAuthWall(root);
        if (w && w.challenged) return true;
      }
    } catch (_e) {}
    return false;
  }

  /**
   * Decide the next action for this page snapshot.
   * @returns {{ action: string, reason: string, ctaText?: string, applyButtons?: Element[] }}
   */
  function decidePageAction(root, opts) {
    opts = opts || {};
    root = root || (typeof document !== 'undefined' ? document : null);
    var S = syn();
    if (!root) {
      return { action: ACTIONS.STOP, reason: 'no_document' };
    }

    var applyBtns =
      S && typeof S.findApplyStartButtons === 'function'
        ? S.findApplyStartButtons(root) || []
        : [];
    var formOpen =
      S && typeof S.isApplicationFormOpen === 'function'
        ? S.isApplicationFormOpen(root, opts.minFields)
        : false;
    var fields = fillableCount(root, opts);

    // (a) Apply-start / navigation start — before fill-complete / 0 fields stop
    if (hasClickableApplyStart(root, opts)) {
      var top = applyBtns[0] || null;
      var text = top ? buttonText(top).slice(0, 80) : 'Apply';
      return {
        action: ACTIONS.APPLY_START,
        reason: formOpen
          ? 'high_confidence_apply_start_despite_form_signals'
          : 'apply_start_cta_present',
        ctaText: text,
        applyButtons: applyBtns
      };
    }

    // (b) Auth wall — signal only (slice 3 owns OAuth); callers may pause
    if (opts.checkAuth !== false && looksLikeAuthWall(root) && fields < 2) {
      return { action: ACTIONS.AUTH, reason: 'auth_wall' };
    }

    // (c) Fill when fields exist
    if (fields > 0 || formOpen) {
      return {
        action: ACTIONS.FILL,
        reason: fields > 0 ? 'fields_present:' + fields : 'form_open_signal',
        fieldCount: fields
      };
    }

    // (d) Advance Continue / Next (welcome / mid-wizard) — not Submit
    if (hasAdvanceCta(root)) {
      var cont =
        S && typeof S.findContinueButtons === 'function'
          ? S.findContinueButtons(root) || []
          : [];
      var ct = cont[0] ? buttonText(cont[0]).slice(0, 80) : 'Continue';
      return {
        action: ACTIONS.ADVANCE,
        reason: 'continue_next_present',
        ctaText: ct
      };
    }

    // (e) Stop with clear reason — never silent idle while Apply was available
    return {
      action: ACTIONS.STOP,
      reason: applyBtns.length
        ? 'apply_cta_present_but_not_clickable'
        : 'no_apply_start_no_fields_no_advance',
      applyButtons: applyBtns
    };
  }

  /**
   * Click best Apply-start via synonyms.tryClickApplyStart (force when needed).
   * @returns {{ clicked: boolean, text?: string, reason: string, el?: Element }}
   */
  function tryNavApplyStart(root, opts) {
    opts = opts || {};
    root = root || (typeof document !== 'undefined' ? document : null);
    var S = syn();
    if (!root || !S || typeof S.tryClickApplyStart !== 'function') {
      return { clicked: false, reason: 'no_synonyms' };
    }
    var decision = decidePageAction(root, opts);
    if (decision.action !== ACTIONS.APPLY_START) {
      return { clicked: false, reason: 'not_apply_start:' + decision.reason };
    }
    var open = S.tryClickApplyStart(root, {
      minFields: opts.minFields,
      force: true
    });
    if (open && open.clicked) {
      return {
        clicked: true,
        text: open.text || decision.ctaText || 'Apply',
        reason: open.reason || 'clicked',
        el: open.el || null
      };
    }
    return {
      clicked: false,
      reason: (open && open.reason) || 'click_failed',
      text: decision.ctaText
    };
  }

  /**
   * True when a fill result of 0/0 must NOT end the run (Apply/start still available).
   */
  function mustNotStopOnEmptyFill(root, fillResult, opts) {
    if (fillResult && (fillResult.clickedApplyStart || fillResult.reDetect || fillResult.handedOff)) {
      return true;
    }
    if (fillResult && (fillResult.filled > 0 || fillResult.submitted || fillResult.advanced)) {
      return false;
    }
    return hasClickableApplyStart(root, opts);
  }

  global.FillApplyNavFirst = {
    ACTIONS: ACTIONS,
    decidePageAction: decidePageAction,
    hasClickableApplyStart: hasClickableApplyStart,
    hasAdvanceCta: hasAdvanceCta,
    tryNavApplyStart: tryNavApplyStart,
    mustNotStopOnEmptyFill: mustNotStopOnEmptyFill,
    fillableCount: fillableCount
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
