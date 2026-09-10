/**
 * Swooped adapter (board) — **assisted-apply intermediary**, not a primary ATS.
 *
 * Often reached from **Jooble** (and similar aggregators) after Apply. UI chrome
 * includes Find Jobs / Auto Apply / Track Jobs / Resumes / Cover Letters / Upgrade,
 * job filters, company job detail, and **Prepare Application**.
 *
 * Fill & Apply policy:
 * - **Do NOT** use Swooped Auto Apply, paid Upgrade, or auto-build application packet.
 * - Prefer **Apply manually instead** when present, then hand off again to the
 *   employer ATS if the URL/host changes (runner re-detects Greenhouse etc.).
 * - If stuck on the Prepare Application / upload wall with no manual path →
 *   `needsHuman` pause explaining the Swooped intermediary.
 * - `paidSource: false` unless an Upgrade / subscription wall blocks progress —
 *   then pause (never purchase).
 *
 * See docs/APPLICATION_GUIDE.md → "Jooble → Swooped / external ATS".
 */
(function (global) {
  'use strict';

  var HOSTS = ['swooped.co', 'www.swooped.co', 'app.swooped.co'];
  var HOST_RE = /(^|\.)swooped\.co$/i;

  var CONTENT_MARKERS = [
    /auto\s*apply/i,
    /prepare\s*application/i,
    /apply\s*manually\s*instead/i,
    /we'?ll\s*build\s*your\s*entire\s*application/i,
    /upload\s*your\s*resume/i
  ];

  function pageText(doc) {
    try {
      return doc && doc.body ? String(doc.body.innerText || '').slice(0, 14000) : '';
    } catch (_e) {
      return '';
    }
  }

  function contentLooksLikeSwooped(doc) {
    var text = pageText(doc);
    if (!text) return false;
    var hits = 0;
    for (var i = 0; i < CONTENT_MARKERS.length; i++) {
      if (CONTENT_MARKERS[i].test(text)) hits++;
    }
    // Need at least two distinctive markers to avoid false positives on other sites.
    return hits >= 2;
  }

  function detect(url, doc) {
    url = String(url || '');
    try {
      var u = new URL(url, typeof location !== 'undefined' ? location.href : undefined);
      if (HOST_RE.test(u.hostname) || /swooped\.co/i.test(url)) return true;
      for (var i = 0; i < HOSTS.length; i++) {
        var h = HOSTS[i].replace(/^www\./, '');
        if (u.hostname === HOSTS[i] || u.hostname === h || u.hostname.endsWith('.' + h)) {
          return true;
        }
      }
    } catch (_e) {
      if (/swooped\.co/i.test(url)) return true;
    }
    if (doc && contentLooksLikeSwooped(doc)) return true;
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
      var st = window.getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
    } catch (_e) {
      return true;
    }
  }

  function buttonText(el) {
    return String(
      (el && (el.innerText || el.textContent || el.value || el.getAttribute('aria-label'))) ||
        ''
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  function currentHostname() {
    try {
      return String((typeof location !== 'undefined' && location.hostname) || '');
    } catch (_e) {
      return '';
    }
  }

  function isSwoopedHost(hostname) {
    return /swooped\.co/i.test(String(hostname || ''));
  }

  function resolveHref(el) {
    if (!el) return '';
    try {
      var raw =
        el.href ||
        el.getAttribute('href') ||
        el.getAttribute('data-href') ||
        el.getAttribute('data-url') ||
        '';
      if (!raw || raw === '#' || /^javascript:/i.test(raw)) return '';
      return new URL(raw, typeof location !== 'undefined' ? location.href : undefined).href;
    } catch (_e) {
      return '';
    }
  }

  function detectUpgradePaywall(doc, text) {
    text = text || pageText(doc);
    if (/upgrade\s*(to|your|plan|now)?/i.test(text) && /subscription|billing|\$\s*\d|per\s*month|premium|pro plan/i.test(text)) {
      return true;
    }
    if (/unlock\s*(auto\s*apply|unlimited|premium)/i.test(text) && /\$\s*\d|subscribe|upgrade/i.test(text)) {
      return true;
    }
    // Visible Upgrade CTA dominating a paywalled empty state
    if (doc) {
      try {
        var nodes = doc.querySelectorAll('a, button, [role="button"]');
        for (var i = 0; i < nodes.length; i++) {
          var t = buttonText(nodes[i]);
          if (/^upgrade$/i.test(t) || /^upgrade\s+now$/i.test(t)) {
            if (/subscription|paywall|pricing|billing|locked|premium/i.test(text)) return true;
          }
        }
      } catch (_e) {}
    }
    return false;
  }

  function isAutoApplyOrUpgradeText(t) {
    return /auto\s*apply|auto[- ]?apply|upgrade|buy\s*credits|subscribe|start\s*free\s*trial|get\s*premium/i.test(
      String(t || '')
    );
  }

  function isBuildPacketCta(t) {
    return /build\s*(your\s*)?(entire\s*)?application|we'?ll\s*build|auto[- ]?build|generate\s*(resume|cover|application)|tailor\s*(my\s*)?(resume|cover)/i.test(
      String(t || '')
    );
  }

  /**
   * Prefer "Apply manually instead" — never Auto Apply / Upgrade / auto-build.
   */
  function findManualApplyControl(doc) {
    doc = doc || document;
    var nodes = doc.querySelectorAll(
      'a, button, input[type="button"], input[type="submit"], [role="button"], span, div'
    );
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el)) continue;
      var t = buttonText(el);
      if (!t || t.length > 80) continue;
      if (isAutoApplyOrUpgradeText(t) || isBuildPacketCta(t)) continue;
      var score = 0;
      if (/apply\s*manually\s*instead/i.test(t)) score = 100;
      else if (/apply\s*manually/i.test(t)) score = 90;
      else if (/manual\s*apply/i.test(t)) score = 85;
      else if (/continue\s*without\s*(swooped|auto)/i.test(t)) score = 80;
      else if (/skip\s*(auto|assisted)/i.test(t)) score = 70;
      // Only count clickable-ish nodes for lower scores
      if (score > 0 && score < 85) {
        var tag = (el.tagName || '').toLowerCase();
        if (tag !== 'a' && tag !== 'button' && el.getAttribute('role') !== 'button') {
          // Prefer parent clickable
          var parent = el.closest && el.closest('a, button, [role="button"]');
          if (parent && visible(parent)) el = parent;
          else if (tag !== 'span' && tag !== 'div') {
            /* keep */
          } else if (score < 90) continue;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function looksLikePrepareUploadWall(doc, text) {
    text = text || pageText(doc);
    if (!/prepare\s*application/i.test(text) && !/we'?ll\s*build\s*your\s*entire\s*application/i.test(text)) {
      return false;
    }
    if (/upload\s*your\s*resume/i.test(text) || /upload\s*(resume|cv)/i.test(text)) return true;
    if (/tailored\s*(resume|cover)/i.test(text) && /build/i.test(text)) return true;
    return false;
  }

  function humanPause(error, extra) {
    return Object.assign(
      {
        ok: false,
        adapterId: 'swooped',
        needsHuman: true,
        pauseReason: 'challenge',
        paidSource: false,
        error: error,
        filled: 0,
        unmatched: 0,
        total: 0
      },
      extra || {}
    );
  }

  function handoffResult(extra) {
    return Object.assign(
      {
        ok: true,
        adapterId: 'swooped',
        externalApply: true,
        handedOff: true,
        deferToPageAdapter: true,
        filled: 0,
        unmatched: 0,
        total: 0,
        submitted: false,
        paidSource: false,
        message: 'Left Swooped via Apply manually instead — continue with destination ATS adapter'
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
    if (!next || next.id === 'swooped' || next.id === 'fallback') {
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
          fr.fromAdapter = 'swooped';
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

  var adapter = {
    id: 'swooped',
    name: 'Swooped',
    category: 'board',
    hosts: HOSTS,
    paidSource: false,
    assistedApplyIntermediary: true,
    detect: detect,
    fieldMaps: [],
    submitSelector:
      'a, button, [role="button"]',
    fileInputHints: [
      { kind: 'resume', match: 'resume|cv' },
      { kind: 'cover', match: 'cover' }
    ],
    fill: function (ctx) {
      ctx = ctx || {};
      var doc = (ctx && ctx.document) || (typeof document !== 'undefined' ? document : null);
      var text = pageText(doc);

      return Promise.resolve().then(async function () {
        // Upgrade / subscription wall → pause; never purchase.
        if (detectUpgradePaywall(doc, text)) {
          return humanPause(
            'Swooped Upgrade / subscription wall detected. Fill & Apply will not purchase plans or use paid Auto Apply. Open the employer apply URL directly, use Apply manually instead if available, or Resume after you leave the paywall.',
            { paywall: true, paidSource: true, pauseReason: 'challenge' }
          );
        }

        var startHost = currentHostname();
        var manualEl = findManualApplyControl(doc);
        var manualHref = resolveHref(manualEl);
        var externalTarget = false;
        if (manualHref) {
          try {
            var au = new URL(manualHref);
            if (au.hostname && !isSwoopedHost(au.hostname)) externalTarget = true;
          } catch (_e2) {}
        }

        if (manualEl) {
          if (externalTarget) {
            try {
              manualEl.click();
            } catch (_e3) {
              try {
                if (manualHref) location.href = manualHref;
              } catch (_e4) {}
            }
            return handoffResult({
              externalUrl: manualHref,
              message:
                'Clicked Apply manually instead — runner will re-detect employer ATS'
            });
          }

          try {
            manualEl.click();
          } catch (_e5) {}
          await sleep(700 + Math.floor(Math.random() * 500));
        }

        var hostNow = currentHostname();
        if (hostNow && startHost && hostNow !== startHost && !isSwoopedHost(hostNow)) {
          var dest = tryDestinationFill(ctx);
          if (dest && typeof dest.then === 'function') dest = await dest;
          if (dest && typeof dest === 'object') {
            dest.externalApply = true;
            dest.handedOff = true;
            dest.fromAdapter = 'swooped';
            dest.paidSource = false;
            if (!dest.message) {
              dest.message =
                'Left Swooped — continue with destination ATS adapter';
            }
            return dest;
          }
          return handoffResult({
            message: 'Left Swooped — continue with destination ATS adapter'
          });
        }

        // Refresh text after possible click
        text = pageText(doc);

        if (detectUpgradePaywall(doc, text)) {
          return humanPause(
            'Swooped Upgrade / subscription wall detected after interaction. Do not purchase via Fill & Apply — paste the employer ATS URL or choose Apply manually instead, then Resume.',
            { paywall: true, paidSource: true }
          );
        }

        // Stuck on prepare / upload wall without a manual path
        if (!manualEl && looksLikePrepareUploadWall(doc, text)) {
          return humanPause(
            'Swooped assisted-apply intermediary: Prepare Application / resume-upload wall with no "Apply manually instead" path. Do not use Swooped Auto Apply or Upgrade. Open the employer ATS apply URL directly (or find Apply manually instead), then Resume so Fill & Apply can fill the destination form.',
            { swoopedIntermediary: true, pauseReason: 'structure_drift' }
          );
        }

        if (manualEl && isSwoopedHost(hostNow)) {
          // Manual click may open new tab; signal handoff
          return handoffResult({
            message:
              'Apply manually instead clicked — if a new tab/host opened, runner/destination ATS should continue. Do not use Swooped Auto Apply.'
          });
        }

        // Rare: real employer-like form still hosted on swooped — fill via fallback only
        var hasRealForm = false;
        try {
          hasRealForm = !!(
            doc &&
            doc.querySelector(
              'form input[type="email"], form input[name*="email" i], form textarea, form input[type="file"]'
            )
          );
        } catch (_e6) {}

        if (hasRealForm && !looksLikePrepareUploadWall(doc, text)) {
          var fb = global.FillApplyFallbackAdapter;
          if (!fb) {
            return {
              ok: false,
              adapterId: 'swooped',
              error: 'Fallback adapter missing',
              filled: 0,
              unmatched: 0,
              total: 0,
              paidSource: false
            };
          }
          var result = fb.fill(
            Object.assign({}, ctx, {
              adapterId: 'swooped',
              submitSelector: adapter.submitSelector,
              fileInputHints: adapter.fileInputHints,
              fieldMaps: adapter.fieldMaps
            })
          );
          if (result && typeof result.then === 'function') result = await result;
          if (result && typeof result === 'object') result.paidSource = false;
          return result;
        }

        return humanPause(
          'Swooped assisted-apply intermediary detected. Fill & Apply does not use Auto Apply, Upgrade, or auto-build packets. Click "Apply manually instead" if available, or paste the employer ATS URL into the queue, then Resume.',
          { swoopedIntermediary: true, pauseReason: 'structure_drift' }
        );
      });
    }
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
  global.FillApply_swoopedAdapter = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : self);
