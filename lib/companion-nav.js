/**
 * Simplify companion — navigate-only helpers (host page DOM only).
 * Never fills fields or uploads docs. Cannot read chrome-extension:// sidepanels.
 * Attaches globalThis.FillApplyCompanionNav.
 */
(function (global) {
  'use strict';

  var DEFAULT_SETTLE_MS = 3500;
  var DEFAULT_MAX_WAIT_MS = 45 * 1000;
  var DEFAULT_GRACE_MS = 4000;
  var DEFAULT_POLL_MS = 250;

  /** Forward nav CTAs — Continue/Next plus apply-start gates on nav-only pages. */
  var COMPANION_NAV_CTA =
    /\b(save\s*(&|and)\s*continue|continue(\s+application)?|next(\s*step)?|proceed|start\s*application|begin\s*application|start\s*apply|apply\s*now|easy\s*apply|open\s*application)\b/i;

  /** Hard exclusions — never final-submit / back / paid upsell. Bare Apply allowed when nav-only. */
  var COMPANION_NAV_EXCLUDE =
    /\b(back|previous|cancel|close|dismiss|submit(\s+application)?|send\s+application|mark\s*as\s*applied|auto[- ]?apply|upgrade|subscribe)\b/i;

  function buttonText(el) {
    if (!el) return '';
    try {
      var syn = global.FillApplySynonyms;
      if (syn && typeof syn.buttonText === 'function') return String(syn.buttonText(el) || '');
    } catch (_e) {}
    var t =
      (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.title || '')
        .replace(/\s+/g, ' ')
        .trim();
    return t;
  }

  function isVisible(el) {
    if (!el) return false;
    try {
      var syn = global.FillApplySynonyms;
      if (syn && typeof syn.isVisible === 'function') return !!syn.isVisible(el);
    } catch (_e) {}
    try {
      if (el.offsetParent === null && el.tagName !== 'BODY') {
        var st0 = global.getComputedStyle ? global.getComputedStyle(el) : null;
        if (st0 && st0.position !== 'fixed') return false;
      }
      var st = global.getComputedStyle ? global.getComputedStyle(el) : null;
      if (st && (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0')) {
        return false;
      }
      return true;
    } catch (_e2) {
      return true;
    }
  }

  function isPrimaryLooking(el) {
    if (!el) return false;
    try {
      var cls = String(el.className || '').toLowerCase();
      var type = String(el.getAttribute('type') || '').toLowerCase();
      if (type === 'submit') return true;
      if (/primary|btn-primary|wd-primary|css-/i.test(cls)) return true;
      var aria = String(el.getAttribute('data-automation-id') || el.id || '').toLowerCase();
      if (/continue|next|saveAndContinue|bottom-bar/i.test(aria)) return true;
    } catch (_e) {}
    return false;
  }

  function isCompanionNavCta(text, opts) {
    opts = opts || {};
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (COMPANION_NAV_EXCLUDE.test(t)) return false;
    if (COMPANION_NAV_CTA.test(t)) return true;
    // Bare Apply / Easy Apply only when page is nav-only (no fillable fields).
    if (opts.navOnly && /^(apply|easy\s*apply|apply\s*now)$/i.test(t)) return true;
    return false;
  }

  /** True when the page has a forward CTA but essentially no fillable fields. */
  function isNavOnlyPage(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return false;
    var fillable = 0;
    try {
      var nodes = doc.querySelectorAll
        ? doc.querySelectorAll(
            'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), select, textarea'
          )
        : [];
      for (var i = 0; i < nodes.length; i++) {
        if (isVisible(nodes[i]) && !nodes[i].disabled) fillable += 1;
      }
    } catch (_e) {}
    return fillable === 0;
  }

  function scoreCompanionNav(el, text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    var s = 0;
    if (/save\s*(&|and)\s*continue/i.test(t)) s += 100;
    else if (/^continue(\s+application)?$/i.test(t)) s += 80;
    else if (/start\s*application|begin\s*application|start\s*apply/i.test(t)) s += 75;
    else if (/^next(\s*step)?$/i.test(t)) s += 70;
    else if (/apply\s*now|easy\s*apply|open\s*application|^apply$/i.test(t)) s += 65;
    else if (/continue/i.test(t)) s += 50;
    else if (/next/i.test(t)) s += 40;
    if (isPrimaryLooking(el)) s += 25;
    try {
      if (el.getAttribute && el.getAttribute('data-fill-apply') === 'continue') s += 60;
    } catch (_d) {}
    return s;
  }

  /**
   * Ranked forward-nav buttons on the host page (never Back/Cancel/Apply submit).
   */
  function findCompanionNavButtons(root) {
    root = root || (typeof document !== 'undefined' ? document : null);
    if (!root) return [];
    var sel =
      'button, input[type="button"], input[type="submit"], a[role="button"], a.button, [role="button"], [data-fill-apply="continue"]';
    var nodes = [];
    try {
      var syn = global.FillApplySynonyms;
      if (syn && typeof syn.queryAllDeep === 'function') {
        nodes = syn.queryAllDeep(sel, root) || [];
      } else if (root.querySelectorAll) {
        nodes = Array.prototype.slice.call(root.querySelectorAll(sel));
      }
    } catch (_q) {
      return [];
    }
    var out = [];
    var seen = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || seen.indexOf(el) !== -1) continue;
      seen.push(el);
      if (el.disabled) continue;
      var marked = false;
      try {
        marked = el.getAttribute && el.getAttribute('data-fill-apply') === 'continue';
      } catch (_m) {}
      if (!marked && !isVisible(el)) continue;
      var navOnly = isNavOnlyPage(root);
      var t = buttonText(el);
      if (!isCompanionNavCta(t, { navOnly: navOnly }) && !marked) continue;
      if (COMPANION_NAV_EXCLUDE.test(t) && !marked) continue;
      out.push(el);
    }
    out.sort(function (a, b) {
      return scoreCompanionNav(b, buttonText(b)) - scoreCompanionNav(a, buttonText(a));
    });
    return out;
  }

  function realClick(el) {
    if (!el) return false;
    try {
      if (typeof el.focus === 'function') el.focus();
    } catch (_f) {}
    try {
      var opts = { bubbles: true, cancelable: true, view: global };
      el.dispatchEvent(new MouseEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      return true;
    } catch (_e) {
      try {
        if (typeof el.click === 'function') {
          el.click();
          return true;
        }
      } catch (_e2) {}
      return false;
    }
  }

  /**
   * Click the best Save and Continue / Continue / Next on the host page.
   * @returns {{ clicked: boolean, text: string|null }}
   */
  function clickCompanionNav(root) {
    var ranked = findCompanionNavButtons(root);
    if (!ranked.length) return { clicked: false, text: null };
    var btn = ranked[0];
    var text = buttonText(btn).slice(0, 60);
    if (!realClick(btn)) return { clicked: false, text: text };
    return { clicked: true, text: text };
  }

  /**
   * Wait until host DOM is quiet for settleMs (MutationObserver + input/change).
   * Resolves { settled, timedOut, waited }. Does not touch extension pages.
   */
  function waitForSettle(opts) {
    opts = opts || {};
    var settleMs = opts.settleMs != null ? opts.settleMs : DEFAULT_SETTLE_MS;
    var maxWaitMs = opts.maxWaitMs != null ? opts.maxWaitMs : DEFAULT_MAX_WAIT_MS;
    var pollMs = opts.pollMs != null ? opts.pollMs : DEFAULT_POLL_MS;
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var root = (doc && doc.documentElement) || null;

    return new Promise(function (resolve) {
      if (!doc || !root) {
        resolve({ settled: true, timedOut: false, waited: 0, reason: 'no-document' });
        return;
      }
      var lastChange = Date.now();
      var start = Date.now();
      var done = false;
      function bump() {
        lastChange = Date.now();
      }
      var mo = null;
      try {
        mo = new MutationObserver(function () {
          bump();
        });
        mo.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true
        });
      } catch (_mo) {}
      try {
        doc.addEventListener('input', bump, true);
        doc.addEventListener('change', bump, true);
      } catch (_ev) {}

      var iv = setInterval(function () {
        if (done) return;
        var now = Date.now();
        var quietFor = now - lastChange;
        var waited = now - start;
        // Prefer CTA click over indefinite "Waiting for Simplify…" — if a forward
        // nav/apply-start CTA is visible and DOM has been quiet briefly, settle early.
        var earlyMs = Math.min(settleMs, 1500);
        if (quietFor >= earlyMs && waited >= earlyMs) {
          try {
            var ctas = findCompanionNavButtons(doc);
            if (ctas && ctas.length) {
              finish({
                settled: true,
                timedOut: false,
                waited: waited,
                reason: 'cta_ready',
                navOnly: isNavOnlyPage(doc)
              });
              return;
            }
          } catch (_c) {}
        }
        if (quietFor >= settleMs) {
          finish({ settled: true, timedOut: false, waited: waited });
        } else if (waited >= maxWaitMs) {
          // On timeout, still report settled if a CTA exists so companion can click.
          var hasCta = false;
          try {
            hasCta = findCompanionNavButtons(doc).length > 0;
          } catch (_t) {}
          finish({
            settled: hasCta,
            timedOut: true,
            waited: waited,
            reason: hasCta ? 'timeout_with_cta' : 'timeout'
          });
        }
      }, pollMs);

      function finish(result) {
        if (done) return;
        done = true;
        clearInterval(iv);
        try {
          if (mo) mo.disconnect();
        } catch (_d) {}
        try {
          doc.removeEventListener('input', bump, true);
          doc.removeEventListener('change', bump, true);
        } catch (_r) {}
        resolve(result);
      }
    });
  }

  /**
   * Snapshot used to detect step change after a nav click.
   */
  function stepFingerprint(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return '';
    var href = '';
    try {
      href = String((doc.defaultView && doc.defaultView.location && doc.defaultView.location.href) || '');
    } catch (_h) {}
    var title = '';
    try {
      title = String(doc.title || '');
    } catch (_t) {}
    var inputs = 0;
    var filled = 0;
    try {
      var nodes = doc.querySelectorAll
        ? doc.querySelectorAll('input, select, textarea, [contenteditable="true"]')
        : [];
      inputs = nodes.length;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var v = n.value != null ? String(n.value) : '';
        if (v) filled += 1;
      }
    } catch (_i) {}
    var headings = '';
    try {
      var hs = doc.querySelectorAll ? doc.querySelectorAll('h1, h2, [role="heading"]') : [];
      for (var j = 0; j < Math.min(hs.length, 5); j++) {
        headings += (hs[j].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) + '|';
      }
    } catch (_hd) {}
    return [href, title, inputs, filled, headings].join('::');
  }

  function waitForStepChange(opts) {
    opts = opts || {};
    var before = opts.before != null ? opts.before : stepFingerprint(opts.document);
    var timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 15000;
    var pollMs = opts.pollMs != null ? opts.pollMs : 300;
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    return new Promise(function (resolve) {
      var start = Date.now();
      var iv = setInterval(function () {
        var now = Date.now();
        var fp = stepFingerprint(doc);
        if (fp !== before) {
          clearInterval(iv);
          resolve({ changed: true, waited: now - start, fingerprint: fp });
          return;
        }
        if (now - start >= timeoutMs) {
          clearInterval(iv);
          resolve({ changed: false, waited: now - start, fingerprint: fp });
        }
      }, pollMs);
    });
  }

  var api = {
    DEFAULT_SETTLE_MS: DEFAULT_SETTLE_MS,
    DEFAULT_MAX_WAIT_MS: DEFAULT_MAX_WAIT_MS,
    DEFAULT_GRACE_MS: DEFAULT_GRACE_MS,
    COMPANION_NAV_CTA: COMPANION_NAV_CTA,
    COMPANION_NAV_EXCLUDE: COMPANION_NAV_EXCLUDE,
    isCompanionNavCta: isCompanionNavCta,
    isNavOnlyPage: isNavOnlyPage,
    findCompanionNavButtons: findCompanionNavButtons,
    clickCompanionNav: clickCompanionNav,
    waitForSettle: waitForSettle,
    stepFingerprint: stepFingerprint,
    waitForStepChange: waitForStepChange,
    buttonText: buttonText,
    scoreCompanionNav: scoreCompanionNav
  };

  global.FillApplyCompanionNav = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
