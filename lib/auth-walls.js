/**
 * Generic auth-wall / account-gate detection for ATS and board adapters.
 *
 * Sign Up / Sign In / Register / Login / Create a login / Returning Candidate
 * "Log back in" are **manual attention signals** — never invent credentials
 * or auto-create accounts. Adapters should pause with needsHuman + notify.
 *
 * Attaches FillApplyAuthWalls to globalThis. Optional for any adapter.
 */
(function (global) {
  'use strict';

  /** Phrases that strongly indicate an account gate (signup or sign-in). */
  var AUTH_PHRASES = [
    'create a login',
    'create account',
    'create an account',
    'returning candidate',
    'log back in',
    'sign in',
    'sign up',
    'log in',
    'login',
    'register',
    'password re-enter',
    'password reenter',
    're-enter password',
    'reenter password',
    'confirm password',
    'forgot password'
  ];

  function pageText(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return '';
    try {
      return String((doc.body && doc.body.innerText) || '').slice(0, 14000);
    } catch (_e) {
      return '';
    }
  }

  function isVisible(el) {
    if (!el) return false;
    try {
      var r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      var st =
        el.ownerDocument && el.ownerDocument.defaultView
          ? el.ownerDocument.defaultView.getComputedStyle(el)
          : null;
      if (st && (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0')) {
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
          el.getAttribute('aria-label') ||
          el.getAttribute('title'))) ||
        ''
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  function labelNear(el, doc) {
    doc = doc || (el && el.ownerDocument) || document;
    if (!el) return '';
    var parts = [
      el.getAttribute('aria-label') || '',
      el.getAttribute('placeholder') || '',
      el.name || '',
      el.id || ''
    ];
    try {
      if (el.id) {
        var esc = el.id;
        try {
          if (typeof CSS !== 'undefined' && CSS.escape) esc = CSS.escape(el.id);
        } catch (_eEsc) {}
        var lab = doc.querySelector('label[for="' + esc + '"]');
        if (lab) parts.push(buttonText(lab));
      }
      var parent = el.closest('label, .form-group, .field, [class*="field"], fieldset, [class*="Form"]');
      if (parent) parts.push(buttonText(parent).slice(0, 200));
    } catch (_e) {}
    return parts.join(' ');
  }

  /**
   * Visible password inputs that look like account create / sign-in
   * (Password, Password Re-enter, Confirm password) — never auto-fill these.
   */
  function findPasswordCreateFields(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return [];
    var out = [];
    var inputs = doc.querySelectorAll('input[type="password"]');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      if (!isVisible(el) && el.offsetParent === null) continue;
      if (el.disabled) continue;
      out.push({
        el: el,
        label: labelNear(el, doc)
      });
    }
    return out;
  }

  /**
   * Social SSO already connected: page shows Connected / Disconnect without
   * Password Re-enter create-login fields → treat as authenticated.
   */
  function isSsoConnected(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return false;
    if (findPasswordCreateFields(doc).length > 0) return false;
    var text = pageText(doc);
    if (/password\s*re-?enter|re-?enter\s*password/i.test(text) && /create a login|create (an )?account/i.test(text)) {
      return false;
    }
    var sawConnected = false;
    var sawDisconnect = false;
    var nodes = doc.querySelectorAll(
      'a, button, [role="button"], span, div, label, p, li, strong, em'
    );
    for (var i = 0; i < nodes.length && i < 500; i++) {
      var el = nodes[i];
      if (!isVisible(el) && el.offsetParent === null) continue;
      var t = buttonText(el).slice(0, 80);
      if (!t || t.length > 48) continue;
      var trim = t.trim();
      if (/^connected$/i.test(trim) || /^connected\b/i.test(trim)) sawConnected = true;
      if (/^disconnect$/i.test(trim)) sawDisconnect = true;
    }
    if (sawConnected && sawDisconnect) return true;
    if (sawDisconnect && /\b(linkedin|google|microsoft|facebook|apple|sso|social)\b/i.test(text)) {
      return true;
    }
    if (
      sawConnected &&
      /\b(linkedin|google|microsoft|facebook|apple|sso|social)\b/i.test(text) &&
      !/create a login/i.test(text)
    ) {
      return true;
    }
    // Copy like "SSO Connected" / "Connected to LinkedIn"
    if (/\bsso\s*connected\b|\bconnected\s+to\s+(linkedin|google|microsoft|facebook|apple)\b/i.test(text) &&
        !/password\s*re-?enter/i.test(text)) {
      return true;
    }
    return false;
  }

  function hasCreateLoginCopy(text) {
    return /create a login|create (an )?account|password\s*re-?enter|re-?enter\s*password|confirm\s*password|returning candidate|log back in/i.test(
      text
    );
  }

  function hasSignInRegisterCopy(text) {
    return /\bsign\s*in\b|\blog\s*in\b|\blogin\b|\bsign\s*up\b|\bregister\b/i.test(text);
  }

  /**
   * Detect an account / auth wall that requires human sign-in or registration.
   *
   * @param {Document} [doc]
   * @param {{ extraPhrases?: string[], requirePasswordField?: boolean }} [opts]
   * @returns {{ challenged: boolean, kind: string|null, detail: string, markers: string[], passwordFields: number }}
   */
  function detectAuthWall(doc, opts) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    opts = opts || {};
    if (!doc) {
      return { challenged: false, kind: null, detail: '', markers: [], passwordFields: 0 };
    }

    // SSO Connected / Disconnect without create-login passwords → authenticated
    if (isSsoConnected(doc)) {
      return {
        challenged: false,
        kind: null,
        detail: 'SSO connected',
        markers: ['sso_connected'],
        passwordFields: 0,
        ssoConnected: true
      };
    }

    var text = pageText(doc);
    var textLower = text.toLowerCase();
    var markers = [];
    var pwFields = findPasswordCreateFields(doc);
    var passwordFields = pwFields.length;

    // Strong: Create a login / Password Re-enter / Returning Candidate
    if (hasCreateLoginCopy(text)) {
      markers.push('create-login/returning-candidate copy');
    }
    for (var p = 0; p < pwFields.length; p++) {
      var pl = String(pwFields[p].label || '').toLowerCase();
      if (/re-?enter|confirm|verify|create|login|password/i.test(pl) || true) {
        markers.push('password field: ' + (pl || 'password').slice(0, 60));
      }
    }

    // Links / headings / buttons
    var nodes = doc.querySelectorAll(
      'a, button, input[type="submit"], input[type="button"], [role="button"], h1, h2, h3, legend, label, .iCIMS_InfoMsg, [class*="login"], [class*="Login"], [id*="login"], [id*="Login"]'
    );
    for (var i = 0; i < nodes.length && markers.length < 12; i++) {
      var el = nodes[i];
      if (!isVisible(el) && el.tagName !== 'INPUT') continue;
      var t = buttonText(el).slice(0, 120);
      if (!t) continue;
      if (/^create a login$/i.test(t.trim()) || /create a login/i.test(t)) {
        markers.push('Create a login');
      } else if (/returning candidate/i.test(t) || /^log back in/i.test(t.trim())) {
        markers.push(t.slice(0, 80));
      } else if (/^(sign in|log in|login|sign up|register|create account)$/i.test(t.trim())) {
        markers.push(t.trim());
      }
    }

    if (opts.extraPhrases && opts.extraPhrases.length) {
      for (var e = 0; e < opts.extraPhrases.length; e++) {
        var phrase = String(opts.extraPhrases[e] || '').toLowerCase();
        if (phrase && textLower.indexOf(phrase) !== -1) markers.push(opts.extraPhrases[e]);
      }
    }

    // Deduplicate
    var seen = {};
    var uniq = [];
    markers.forEach(function (m) {
      var k = String(m).toLowerCase();
      if (!seen[k]) {
        seen[k] = true;
        uniq.push(m);
      }
    });
    markers = uniq;

    var strongCreate =
      /create a login|password\s*re-?enter|returning candidate|log back in|create (an )?account/i.test(
        text
      ) || passwordFields >= 2;

    var signInWithPassword =
      passwordFields >= 1 &&
      (hasSignInRegisterCopy(text) ||
        /forgot password|remember me|keep me (signed|logged)/i.test(text));

    // Footer-only "Sign in" without password fields → not a wall
    var requirePw = opts.requirePasswordField !== false;
    var challenged = false;
    if (strongCreate) challenged = true;
    else if (signInWithPassword) challenged = true;
    else if (!requirePw && markers.length && hasSignInRegisterCopy(text) && passwordFields >= 1) {
      challenged = true;
    }

    // Explicit: any visible password create fields on a page advertising Create a login
    if (passwordFields >= 1 && /create a login|create (an )?account/i.test(text)) {
      challenged = true;
    }

    if (!challenged) {
      return { challenged: false, kind: null, detail: '', markers: markers, passwordFields: passwordFields };
    }

    return {
      challenged: true,
      kind: 'auth_wall',
      detail: strongCreate
        ? 'Account signup / Create a login required — complete manually'
        : 'Sign in / register required — complete manually',
      markers: markers.length ? markers : ['auth wall'],
      passwordFields: passwordFields
    };
  }

  /**
   * True when Create-login / password-reenter fields are visible (never auto-fill).
   */
  function hasPasswordCreateFields(doc) {
    return findPasswordCreateFields(doc).length > 0;
  }

  function describeAuthWall(result) {
    if (!result || !result.challenged) return '';
    return 'Auth wall: ' + (result.detail || 'sign in or register manually');
  }

  /** Phrase list exported for adapters that want to scan copy themselves. */
  var AUTH_WALL_PATTERN =
    /sign\s*in|log\s*in|login|register|create\s+account|create\s+a\s+login|password\s*\(?\s*re-?enter|returning\s+candidate|log\s+back\s+in|sign\s*up|confirm\s+password/i;

  global.FillApplyAuthWalls = {
    detectAuthWall: detectAuthWall,
    hasPasswordCreateFields: hasPasswordCreateFields,
    findPasswordCreateFields: findPasswordCreateFields,
    isSsoConnected: isSsoConnected,
    describeAuthWall: describeAuthWall,
    AUTH_PHRASES: AUTH_PHRASES,
    AUTH_WALL_PATTERN: AUTH_WALL_PATTERN
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
