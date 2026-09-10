/**
 * We Work Remotely (WWR) adapter — PAID JOB SOURCE + full profile prerequisite.
 *
 * 1) Complete your WWR profile first (incomplete / onboarding redirects away from jobs).
 * 2) Full job access requires a paid plan (e.g. ~$2.95 first month then $14.95/mo,
 *    12-month commitment — still paid access, not a free apply unlock).
 *
 * Until paid access unlocks real apply flows: detect paywall / checkout ("Get Full Access",
 * Step 3 of 3, Subscribe) → pause for human. Do not complete payment or fake applies.
 *
 * See docs/APPLICATION_GUIDE.md → "We Work Remotely — paid source".
 */
(function (global) {
  'use strict';

  var HOSTS = ['weworkremotely.com', 'www.weworkremotely.com'];
  var HOST_RE = /weworkremotely\.com/i;

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

  function pageText(doc) {
    try {
      return doc && doc.body ? String(doc.body.innerText || '').slice(0, 12000) : '';
    } catch (_e) {
      return '';
    }
  }

  function detectPaywall(doc, text) {
    text = text || pageText(doc);
    if (/get full access to all we work remotely jobs/i.test(text)) return true;
    if (/accelerate your remote job search/i.test(text) && /\$\s*14\.95/i.test(text)) return true;
    if (/step\s*3\s*of\s*3/i.test(text) && (/payment method/i.test(text) || /billed now/i.test(text))) return true;
    if (/12-month commitment/i.test(text) && /\$\s*2\.95/i.test(text)) return true;
    if (/payment method/i.test(text) && /apple pay|google pay/i.test(text) && /\$\s*14\.95/i.test(text)) return true;
    return false;
  }

  function detectProfileIncomplete(doc, text, href) {
    text = text || pageText(doc);
    href = String(href || '');
    if (/\/profile|onboarding|complete.?profile|account\/setup/i.test(href)) return true;
    if (/complete your profile|finish your profile|profile is incomplete|set up your profile/i.test(text)) return true;
    return false;
  }

  function humanPause(error, extra) {
    return Object.assign(
      {
        ok: false,
        adapterId: 'weworkremotely',
        needsHuman: true,
        pauseReason: 'challenge',
        paidSource: true,
        error: error,
        filled: 0,
        unmatched: 0,
        total: 0
      },
      extra || {}
    );
  }

  var adapter = {
    id: 'weworkremotely',
    name: 'We Work Remotely',
    category: 'board',
    hosts: HOSTS,
    paidSource: true,
    requiresPaidAccount: true,
    requiresCompleteProfile: true,
    detect: detect,
    fieldMaps: [],
    submitSelector: 'button[type="submit"], input[type="submit"], a.apply, button.apply',
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
      var text = pageText(doc);

      if (detectProfileIncomplete(doc, text, href)) {
        return humanPause(
          'We Work Remotely: complete your full profile on the platform first, then Resume. Incomplete profiles block job access.',
          { profileIncomplete: true }
        );
      }

      if (detectPaywall(doc, text)) {
        return humanPause(
          'We Work Remotely paywall / checkout detected (paid plan). Complete payment only if you intend to subscribe, then Resume. Fill & Apply will not purchase plans or fake applies.',
          { paywall: true }
        );
      }

      var hasRealForm = false;
      try {
        hasRealForm = !!(
          doc &&
          doc.querySelector(
            'form input[type="email"], form input[name*="email" i], form textarea, form input[type="file"]'
          )
        );
      } catch (_e2) {}

      if (!hasRealForm) {
        return humanPause(
          'We Work Remotely: no unlocked application form yet. Need full profile + paid access, then paste the real apply UI for hardening.',
          { awaitingPaidAccess: true }
        );
      }

      var fb = global.FillApplyFallbackAdapter;
      if (!fb) {
        return {
          ok: false,
          adapterId: 'weworkremotely',
          error: 'Fallback adapter missing',
          filled: 0,
          unmatched: 0,
          total: 0
        };
      }
      var result = fb.fill(
        Object.assign({}, ctx, {
          adapterId: 'weworkremotely',
          submitSelector: adapter.submitSelector,
          fileInputHints: adapter.fileInputHints,
          fieldMaps: adapter.fieldMaps
        })
      );
      if (result && typeof result === 'object') result.paidSource = true;
      return result;
    }
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
})(typeof globalThis !== 'undefined' ? globalThis : self);
