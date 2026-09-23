/**
 * Bayt adapter (board) — Thin detect stub — fill delegates to fallback heuristics. Boards often redirect into an ATS adapter at apply time.
 */
(function (global) {
  'use strict';

  var HOSTS = ['bayt.com', 'www.bayt.com'];
  var HOST_RE = /bayt\.com/i;

  function detect(url, doc) {
    url = String(url || '');
    try {
      var u = new URL(url, typeof location !== 'undefined' ? location.href : undefined);
      if (HOST_RE.test(u.hostname) || HOST_RE.test(url)) return true;
      for (var i = 0; i < HOSTS.length; i++) {
        if (u.hostname === HOSTS[i] || u.hostname.endsWith('.' + HOSTS[i].replace(/^www\./, ''))) return true;
      }
    } catch (_e) {
      if (HOST_RE.test(url)) return true;
    }
    return false;
  }

  function clickBaytApplyStart(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return { clicked: false };
    var Syn = global.FillApplySynonyms;
    // Prefer host-aware Easy Apply / Apply — never location chips like "Saudi Arabia".
    if (Syn && typeof Syn.tryClickApplyStart === 'function') {
      var open = Syn.tryClickApplyStart(doc, { minFields: 2, force: true, host: 'www.bayt.com' });
      if (open && open.clicked) {
        var t = String(open.text || '');
        if (Syn.isExcludedApplyCta && Syn.isExcludedApplyCta(t)) {
          return { clicked: false, reason: 'excluded_location_or_chrome', text: t };
        }
        if (/saudi arabia|shortlist|save job/i.test(t) && !/\bapply\b/i.test(t)) {
          return { clicked: false, reason: 'location_chip', text: t };
        }
        return open;
      }
    }
    return { clicked: false };
  }

  var adapter = {
    id: 'bayt',
    name: 'Bayt',
    category: 'board',
    hosts: HOSTS,
    detect: detect,
    fieldMaps: [],
    submitSelector: 'button[type="submit"], input[type="submit"]',
    fileInputHints: [
      { kind: 'resume', match: 'resume|cv' },
      { kind: 'cover', match: 'cover' }
    ],
    fill: function (ctx) {
      var doc = (ctx && ctx.document) || (typeof document !== 'undefined' ? document : null);
      var apply = clickBaytApplyStart(doc);
      if (apply && apply.clicked) {
        return {
          ok: true,
          adapterId: 'bayt',
          clickedApplyStart: true,
          reDetect: true,
          handedOff: true,
          deferToPageAdapter: true,
          filled: 0,
          unmatched: 0,
          total: 0,
          submitted: false,
          message: 'Bayt: clicked "' + (apply.text || 'Apply') + '" — not location search',
          applyStartText: apply.text || 'Apply',
          error: null
        };
      }
      var fb = global.FillApplyFallbackAdapter;
      if (!fb) {
        return { ok: false, adapterId: 'bayt', error: 'Fallback adapter missing', filled: 0, unmatched: 0, total: 0 };
      }
      return fb.fill(Object.assign({}, ctx, {
        adapterId: 'bayt',
        submitSelector: adapter.submitSelector,
        fileInputHints: adapter.fileInputHints,
        fieldMaps: adapter.fieldMaps
      }));
    }
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
})(typeof globalThis !== 'undefined' ? globalThis : self);
