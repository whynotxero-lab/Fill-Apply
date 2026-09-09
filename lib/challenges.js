/**
 * Platform-wide human challenge detection (Cloudflare Turnstile / interstitials,
 * interactable reCAPTCHA / hCaptcha). Injectable into job tabs.
 *
 * Does NOT auto-click challenges. Footer-only "protected by reCAPTCHA" text is
 * ignored — pause only when a visible/interactable challenge is present.
 *
 * Attaches FillApplyChallenges to globalThis.
 */
(function (global) {
  'use strict';

  var CLOUDFLARE_MARKERS = [
    'additional verification required',
    'verify you are human',
    'just a moment',
    'checking your browser',
    'attention required',
    'enable javascript and cookies',
    'cf-turnstile',
    'challenge-platform',
    'ray id'
  ];

  function pageText(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return '';
    var title = '';
    try {
      title = (doc.title || '') + ' ';
    } catch (_e) {
      /* ignore */
    }
    var body = '';
    try {
      body = (doc.body && doc.body.innerText) || '';
    } catch (_e2) {
      body = '';
    }
    // Cap scan size for hot paths
    return (title + body).slice(0, 12000).toLowerCase();
  }

  function hasSelector(doc, sel) {
    try {
      return !!(doc && doc.querySelector(sel));
    } catch (_e) {
      return false;
    }
  }

  function isVisible(el) {
    if (!el) return false;
    try {
      var style = el.ownerDocument && el.ownerDocument.defaultView
        ? el.ownerDocument.defaultView.getComputedStyle(el)
        : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
        return false;
      }
      var r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    } catch (_e) {
      return true;
    }
  }

  /**
   * Cloudflare interstitial / Turnstile (not a privacy footer).
   */
  function detectCloudflare(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;

    var title = '';
    try {
      title = String(doc.title || '');
    } catch (_e) {
      title = '';
    }
    if (/just a moment/i.test(title)) {
      return {
        kind: 'cloudflare',
        detail: 'Tab title: Just a moment…',
        markers: ['Just a moment']
      };
    }

    var markers = [];
    if (hasSelector(doc, '#challenge-form, #challenge-stage, .cf-turnstile, [data-sitekey].cf-turnstile')) {
      markers.push('cf-turnstile/challenge-form');
    }
    if (hasSelector(doc, 'iframe[src*="challenges.cloudflare.com"], iframe[src*="challenge-platform"]')) {
      markers.push('challenge-platform iframe');
    }
    if (hasSelector(doc, 'script[src*="challenge-platform"], script[src*="turnstile"]')) {
      markers.push('challenge-platform script');
    }

    var text = pageText(doc);
    CLOUDFLARE_MARKERS.forEach(function (m) {
      if (text.indexOf(m) !== -1) markers.push(m);
    });

    // Require a strong interstitial signal (not alone "ray id" buried in footer of normal pages)
    var strong =
      /just a moment|additional verification required|verify you are human|checking your browser|attention required/i.test(
        title + ' ' + text.slice(0, 2000)
      ) ||
      hasSelector(doc, '#challenge-form, #challenge-stage, .cf-turnstile') ||
      hasSelector(doc, 'iframe[src*="challenges.cloudflare.com"], iframe[src*="challenge-platform"]');

    if (!strong) return null;

    // Deduplicate markers
    var seen = {};
    var uniq = [];
    markers.forEach(function (m) {
      if (!seen[m]) {
        seen[m] = true;
        uniq.push(m);
      }
    });

    return {
      kind: 'cloudflare',
      detail: 'Cloudflare verification required',
      markers: uniq
    };
  }

  /**
   * Interactable CAPTCHA checkbox / challenge iframe (not footer "protected by reCAPTCHA" alone).
   */
  function detectCaptchaChallenge(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;

    var iframes = doc.querySelectorAll(
      'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[title*="reCAPTCHA"], iframe[title*="hCaptcha"], iframe[src*="captcha"]'
    );
    var interactable = [];
    for (var i = 0; i < iframes.length; i++) {
      var frame = iframes[i];
      var src = (frame.getAttribute('src') || '').toLowerCase();
      // Privacy/badge footers are tiny; challenge widgets are larger
      if (!isVisible(frame)) continue;
      var r = frame.getBoundingClientRect();
      var isBadge = r.height < 80 && r.width < 320 && /badge|bframe/i.test(src) === false;
      // Explicit challenge frames
      if (/anchor|bframe|checkbox|challenge|hcaptcha\.com\/captcha/i.test(src) || r.height >= 60) {
        if (r.height >= 40 || /anchor|bframe|hcaptcha/i.test(src)) {
          interactable.push({
            src: src.slice(0, 120),
            w: Math.round(r.width),
            h: Math.round(r.height)
          });
        }
      } else if (!isBadge && r.height >= 60) {
        interactable.push({
          src: src.slice(0, 120),
          w: Math.round(r.width),
          h: Math.round(r.height)
        });
      }
    }

    // Visible checkbox widgets (often in shadow / or as div#recaptcha)
    var widgets = doc.querySelectorAll(
      '.g-recaptcha:not([data-size="invisible"]), .h-captcha, [data-callback][data-sitekey], #rc-anchor-container, .rc-anchor'
    );
    var visibleWidget = false;
    for (var j = 0; j < widgets.length; j++) {
      if (isVisible(widgets[j])) {
        visibleWidget = true;
        break;
      }
    }

    // Invisible reCAPTCHA (data-size=invisible) alone does NOT pause
    if (!interactable.length && !visibleWidget) return null;

    // Footer-only: page text mentions protected by reCAPTCHA but no interactable widget
    // (already handled by returning null above)

    return {
      kind: 'captcha',
      detail: 'CAPTCHA challenge is interactable — complete it manually',
      markers: interactable.length
        ? interactable.map(function (x) {
            return 'iframe ' + x.w + 'x' + x.h;
          })
        : ['visible captcha widget']
    };
  }

  /**
   * @returns {{ challenged: boolean, kind: string|null, detail: string, markers: string[] }}
   */
  function detectChallenge(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    var cf = detectCloudflare(doc);
    if (cf) {
      return {
        challenged: true,
        kind: cf.kind,
        detail: cf.detail,
        markers: cf.markers || []
      };
    }
    var cap = detectCaptchaChallenge(doc);
    if (cap) {
      return {
        challenged: true,
        kind: cap.kind,
        detail: cap.detail,
        markers: cap.markers || []
      };
    }
    return { challenged: false, kind: null, detail: '', markers: [] };
  }

  function describeChallenge(result) {
    if (!result || !result.challenged) return '';
    var kind = result.kind === 'cloudflare' ? 'Cloudflare' : result.kind === 'captcha' ? 'CAPTCHA' : 'Challenge';
    return kind + ': ' + (result.detail || 'action needed');
  }

  global.FillApplyChallenges = {
    detectChallenge: detectChallenge,
    detectCloudflare: detectCloudflare,
    detectCaptchaChallenge: detectCaptchaChallenge,
    describeChallenge: describeChallenge
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
