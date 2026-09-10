/**
 * NaukriGulf / Naukrigulf board adapter.
 *
 * PREREQUISITE: User must have a 100% complete NaukriGulf profile on the platform.
 * Incomplete profiles redirect to profile completion instead of the job/apply page.
 * See docs/APPLICATION_GUIDE.md → "NaukriGulf — profile completeness".
 *
 * If a profile-completion redirect is detected, pause for human (do not fill as apply).
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
        if (u.hostname === HOSTS[i] || u.hostname.endsWith('.' + HOSTS[i].replace(/^www\./, ''))) return true;
      }
    } catch (_e) {
      if (HOST_RE.test(url)) return true;
    }
    return false;
  }

  var adapter = {
    id: 'naukrigulf',
    name: 'NaukriGulf',
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
      var href = '';
      try {
        href = String((ctx && ctx.url) || (typeof location !== 'undefined' ? location.href : '') || '');
      } catch (_e) {}
      var bodyText = '';
      try {
        bodyText = doc && doc.body ? String(doc.body.innerText || '').slice(0, 8000) : '';
      } catch (_e2) {}
      var profileRedirect =
        /\/profile|completeness|complete-your-profile|updateprofile|myprofile/i.test(href) ||
        /complete your profile|profile completeness|complete profile|profile is incomplete|make your profile/i.test(bodyText);
      if (profileRedirect) {
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
      var fb = global.FillApplyFallbackAdapter;
      if (!fb) {
        return { ok: false, adapterId: 'naukrigulf', error: 'Fallback adapter missing', filled: 0, unmatched: 0, total: 0 };
      }
      return fb.fill(Object.assign({}, ctx, {
        adapterId: 'naukrigulf',
        submitSelector: adapter.submitSelector,
        fileInputHints: adapter.fileInputHints,
        fieldMaps: adapter.fieldMaps
      }));
    }
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
})(typeof globalThis !== 'undefined' ? globalThis : self);
