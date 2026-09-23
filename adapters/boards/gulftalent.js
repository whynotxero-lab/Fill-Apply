/**
 * GulfTalent adapter (board) —
 * Apply popup often shows "Register before applying to …" with Google / Apple /
 * Facebook / Sign up with Email. Prefer Google (then Apple/Facebook), else email
 * signup filled from the hardcoded profile. Pause on the same modal if Google
 * OAuth needs a human — never tab-hop.
 */
(function (global) {
  'use strict';

  var HOSTS = ['gulftalent.com', 'www.gulftalent.com'];
  var HOST_RE = /gulftalent\.com/i;

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

  function visible(el) {
    if (!el) return false;
    try {
      var r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      var st =
        el.ownerDocument && el.ownerDocument.defaultView
          ? el.ownerDocument.defaultView.getComputedStyle(el)
          : null;
      if (st && (st.display === 'none' || st.visibility === 'hidden')) return false;
      return true;
    } catch (_e) {
      return true;
    }
  }

  function buttonText(el) {
    return String(
      (el && (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || '')) ||
        ''
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  function pageText(doc) {
    try {
      return String((doc.body && (doc.body.innerText || doc.body.textContent)) || '').slice(0, 8000);
    } catch (_e) {
      return '';
    }
  }

  function isRegisterBeforeApplyingModal(doc) {
    doc = doc || document;
    var text = pageText(doc);
    if (/register\s+before\s+applying/i.test(text)) return true;
    if (/sign\s*up\s+to\s+apply|create\s+an\s+account\s+to\s+apply/i.test(text)) return true;
    // Modal with social CTAs on gulftalent apply
    var social = findRegisterSocialCtas(doc);
    if (social.length && /gulftalent|apply|register|sign\s*up/i.test(text.slice(0, 1200))) return true;
    return false;
  }

  /**
   * Prefer Google → Apple → Facebook → Sign up with Email.
   */
  function findRegisterSocialCtas(doc) {
    doc = doc || document;
    var nodes = doc.querySelectorAll(
      'a, button, [role="button"], div[role="button"], span[role="link"], input[type="button"], input[type="submit"]'
    );
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el)) continue;
      var t = buttonText(el).slice(0, 160);
      var aria = String(el.getAttribute('aria-label') || '');
      var cls = String(el.className || '');
      var dataProvider = String(
        el.getAttribute('data-provider') ||
          el.getAttribute('data-social') ||
          el.getAttribute('data-auth') ||
          ''
      ).toLowerCase();
      var blob = (t + ' ' + aria + ' ' + cls + ' ' + dataProvider).toLowerCase();
      var provider = '';
      var score = 0;
      if (
        /\bgoogle\b/.test(blob) &&
        /continue|sign\s*up|sign\s*in|log\s*in|register|^google$|with\s+google/i.test(t + ' ' + aria)
      ) {
        provider = 'google';
        score = 100;
      } else if (dataProvider === 'google' || /\/auth\/google|accounts\.google/i.test(String(el.href || ''))) {
        provider = 'google';
        score = 95;
      } else if (/\bapple\b/.test(blob) && /continue|sign|log|register|^apple$|with\s+apple/i.test(t + ' ' + aria)) {
        provider = 'apple';
        score = 70;
      } else if (
        /\b(facebook|fb)\b/.test(blob) &&
        /continue|sign|log|register|^facebook$|^fb$|with\s+facebook/i.test(t + ' ' + aria)
      ) {
        provider = 'facebook';
        score = 50;
      } else if (
        /sign\s*up\s+with\s+email|register\s+with\s+email|create\s+account\s+with\s+email|sign\s*up\s+via\s+email|^email$/i.test(
          t + ' ' + aria
        )
      ) {
        provider = 'email';
        score = 30;
      } else {
        continue;
      }
      out.push({ el: el, text: t || provider, provider: provider, score: score });
    }
    out.sort(function (a, b) {
      return b.score - a.score;
    });
    return out;
  }

  async function handleRegisterModal(doc, profile) {
    doc = doc || document;
    profile = profile || {};
    var out = {
      handled: false,
      clicked: false,
      provider: '',
      pause: false,
      filled: 0,
      detail: ''
    };
    if (!isRegisterBeforeApplyingModal(doc)) {
      out.detail = 'not_register_modal';
      return out;
    }
    out.handled = true;

    // Prefer AtsAuth Google finder when available
    try {
      var A = global.FillApplyAtsAuth;
      if (A && typeof A.findGoogleAuthActions === 'function') {
        var gActs = A.findGoogleAuthActions(doc) || [];
        if (gActs.length && gActs[0].el) {
          try {
            gActs[0].el.click();
            out.clicked = true;
            out.provider = 'google';
            out.detail = 'clicked_google_atsauth';
            // OAuth may need human — pause on same modal (no tab hop)
            out.pause = true;
            out.pauseReason = 'oauth_human';
            return out;
          } catch (_g) {}
        }
      }
    } catch (_a) {}

    var ctas = findRegisterSocialCtas(doc);
    if (ctas.length) {
      var pick = ctas[0];
      try {
        pick.el.click();
        out.clicked = true;
        out.provider = pick.provider;
        out.detail = 'clicked_' + pick.provider;
        if (pick.provider === 'google' || pick.provider === 'apple' || pick.provider === 'facebook') {
          out.pause = true;
          out.pauseReason = 'oauth_human';
        }
        if (pick.provider !== 'email') return out;
      } catch (_c) {}
    }

    // Email signup path — fill from profile / Environments
    try {
      var Signup = global.FillApplySignupLogin;
      if (Signup && typeof Signup.prepareSignupOrLogin === 'function') {
        var prep = await Signup.prepareSignupOrLogin(doc, profile, { waitMs: 400 });
        out.signupPrep = prep;
        if (prep && prep.socialContinue && prep.socialContinue.clicked) {
          out.clicked = true;
          out.provider = prep.socialContinue.provider || 'social';
          out.detail = prep.detail || 'social_continue';
          out.pause = !!prep.pause;
          return out;
        }
        if (prep && prep.credentialsFill && prep.credentialsFill.ok) {
          out.filled = prep.credentialsFill.filled || 1;
          out.detail = 'email_signup_filled';
          out.provider = 'email';
          return out;
        }
        if (prep && prep.pause) {
          out.pause = true;
          out.pauseReason = prep.pauseReason || 'auth_wall';
          out.detail = prep.detail || 'paused_register_modal';
          return out;
        }
      }
    } catch (_s) {}

    out.pause = true;
    out.pauseReason = 'auth_wall';
    out.detail = 'register_modal_needs_human';
    return out;
  }

  async function fill(ctx) {
    ctx = ctx || {};
    var doc = ctx.document || (typeof document !== 'undefined' ? document : null);
    var profile = ctx.profile || {};
    if (!doc) {
      return { ok: false, adapterId: 'gulftalent', error: 'No document', filled: 0, unmatched: 0, total: 0 };
    }

    if (isRegisterBeforeApplyingModal(doc)) {
      var step = await handleRegisterModal(doc, profile);
      if (step.clicked && (step.provider === 'google' || step.provider === 'apple' || step.provider === 'facebook')) {
        return {
          ok: false,
          needsHuman: true,
          pauseReason: step.pauseReason || 'oauth_human',
          adapterId: 'gulftalent',
          filled: step.filled || 0,
          unmatched: 0,
          total: step.filled || 0,
          submitted: false,
          stayOnTab: true,
          gulftalentSteps: [step],
          message:
            'GulfTalent: clicked ' +
            step.provider +
            ' on Register-before-applying — paused on same modal for OAuth',
          error: null
        };
      }
      if (step.provider === 'email' && step.filled) {
        return {
          ok: true,
          adapterId: 'gulftalent',
          filled: step.filled,
          unmatched: 0,
          total: step.filled,
          submitted: false,
          advanced: false,
          stayOnTab: true,
          gulftalentSteps: [step],
          message: 'GulfTalent: Sign up with Email filled from profile — same modal',
          error: null
        };
      }
      return {
        ok: false,
        needsHuman: true,
        pauseReason: step.pauseReason || 'auth_wall',
        adapterId: 'gulftalent',
        filled: step.filled || 0,
        unmatched: 0,
        total: step.filled || 0,
        submitted: false,
        stayOnTab: true,
        gulftalentSteps: [step],
        error: 'GulfTalent Register-before-applying — paused on same modal (' + (step.detail || 'unknown') + ')'
      };
    }

    var fb = global.FillApplyFallbackAdapter;
    if (!fb) {
      return { ok: false, adapterId: 'gulftalent', error: 'Fallback adapter missing', filled: 0, unmatched: 0, total: 0 };
    }
    return fb.fill(
      Object.assign({}, ctx, {
        adapterId: 'gulftalent',
        submitSelector: adapter.submitSelector,
        fileInputHints: adapter.fileInputHints,
        fieldMaps: adapter.fieldMaps
      })
    );
  }

  var adapter = {
    id: 'gulftalent',
    name: 'GulfTalent',
    category: 'board',
    hosts: HOSTS,
    detect: detect,
    fieldMaps: [],
    submitSelector: 'button[type="submit"], input[type="submit"]',
    fileInputHints: [
      { kind: 'resume', match: 'resume|cv' },
      { kind: 'cover', match: 'cover' }
    ],
    isRegisterBeforeApplyingModal: isRegisterBeforeApplyingModal,
    findRegisterSocialCtas: findRegisterSocialCtas,
    handleRegisterModal: handleRegisterModal,
    fill: fill
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
  global.FillApply_gulftalentAdapter = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : self);
