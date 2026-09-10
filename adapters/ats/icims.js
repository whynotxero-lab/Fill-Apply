/**
 * iCIMS adapter — careers / apply flows often reached via LinkedIn External Apply
 * (example: PepsiCo → globalcareers-pepsico.icims.com / pepsicojobs.com).
 *
 * Detection: icims.com hosts, "Powered by iCIMS", "Software Powered by ICIMS",
 * classic iCIMS job form chrome.
 *
 * Multi-step (operator paste):
 *   Welcome: Email + privacy I accept + Next (hCaptcha may appear)
 *   Step 1/5 Candidate Profile: Resume, Create a login (MANUAL), name/email/phone/address,
 *     privacy → Submit Profile
 *   Then: Candidate Questions, EEO, Portal Specific Forms, Questionnaire
 *
 * Auth rule: Sign Up / Sign In / Register / Login / Create a login / Returning Candidate
 * "Log back in" → needsHuman pause. NEVER invent passwords or create accounts.
 *
 * Modes:
 *   fill / ready — fill fields + Next/Continue; NEVER Submit Profile / final submit
 *   submit — fill then Submit Profile / submit when complete (only after auth gate cleared)
 *
 * EEO / diversity: Skip/decline if available — never invent.
 * Captcha → needsHuman via challenges.js.
 */
(function (global) {
  'use strict';

  var HOSTS = ['icims.com', 'www.icims.com'];
  var HOST_RE = /(^|\.)icims\.com$/i;

  function detect(url, doc) {
    url = String(url || '');
    try {
      var u = new URL(url, typeof location !== 'undefined' ? location.href : undefined);
      if (HOST_RE.test(u.hostname) || /icims\.com/i.test(u.hostname)) return true;
      for (var i = 0; i < HOSTS.length; i++) {
        var h = HOSTS[i].replace(/^www\./, '');
        if (u.hostname === HOSTS[i] || u.hostname === h || u.hostname.endsWith('.' + h)) {
          return true;
        }
      }
    } catch (_e) {
      if (/icims\.com/i.test(url)) return true;
    }
    if (doc) {
      try {
        var text = ((doc.body && doc.body.innerText) || '').slice(0, 10000);
        if (/software\s+powered\s+by\s+icims/i.test(text)) return true;
        if (/powered\s+by\s+icims/i.test(text)) return true;
        if (
          doc.querySelector(
            '.iCIMS_JobForm, #icims_content_iframe, [class*="iCIMS"], [id*="icims"], a[href*="icims.com"], img[alt*="iCIMS" i]'
          )
        ) {
          return true;
        }
      } catch (_e2) {}
    }
    return false;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function humanDelay(base) {
    var b = typeof base === 'number' ? base : 400;
    return b + Math.floor(Math.random() * 300);
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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
      (el && (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('title'))) ||
        ''
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  function pageText(doc) {
    try {
      return doc && doc.body ? String(doc.body.innerText || '').slice(0, 14000) : '';
    } catch (_e) {
      return '';
    }
  }

  function challengePause(doc, filled) {
    if (!(global.FillApplyChallenges && global.FillApplyChallenges.detectChallenge)) return null;
    var ch = global.FillApplyChallenges.detectChallenge(doc);
    if (!ch || !ch.challenged) return null;
    return {
      ok: false,
      adapterId: 'icims',
      needsHuman: true,
      challenge: ch,
      pauseReason: 'challenge',
      error:
        (global.FillApplyChallenges.describeChallenge && global.FillApplyChallenges.describeChallenge(ch)) ||
        'iCIMS: human verification / hCaptcha required — complete it, then Resume.',
      filled: filled || 0,
      unmatched: 0,
      total: filled || 0,
      submitted: false
    };
  }

  /**
   * Create a login / Password Re-enter / Returning Candidate / Sign in / Register
   * → human gate. Never invent credentials.
   */
  function detectAuthWall(doc) {
    doc = doc || document;
    if (global.FillApplyAuthWalls && global.FillApplyAuthWalls.detectAuthWall) {
      return global.FillApplyAuthWalls.detectAuthWall(doc, {
        extraPhrases: ['create a login', 'returning candidate', 'log back in', 'password re-enter']
      });
    }
    if (global.FillApplyChallenges && global.FillApplyChallenges.detectAuthWall) {
      return global.FillApplyChallenges.detectAuthWall(doc);
    }
    // Local fallback
    var text = pageText(doc);
    var pw = doc.querySelectorAll('input[type="password"]');
    var visiblePw = 0;
    for (var i = 0; i < pw.length; i++) {
      if (visible(pw[i]) || pw[i].offsetParent !== null) visiblePw++;
    }
    var strong =
      /create a login|returning candidate|log back in|password\s*re-?enter|create (an )?account/i.test(text) ||
      (visiblePw >= 1 && /\bsign\s*in\b|\blog\s*in\b|\bregister\b|\bsign\s*up\b/i.test(text));
    if (!strong) return { challenged: false, kind: null, detail: '', markers: [], passwordFields: visiblePw };
    return {
      challenged: true,
      kind: 'auth_wall',
      detail: 'iCIMS account required — sign in/register manually, then Resume',
      markers: ['local fallback'],
      passwordFields: visiblePw
    };
  }

  function authWallPause(doc, filled) {
    var wall = detectAuthWall(doc);
    if (!wall || !wall.challenged) return null;
    return {
      ok: false,
      adapterId: 'icims',
      needsHuman: true,
      challenge: wall,
      pauseReason: 'auth_wall',
      error: 'iCIMS account required — sign in/register manually, then Resume',
      filled: filled || 0,
      unmatched: 0,
      total: filled || 0,
      submitted: false,
      message: 'iCIMS account required — sign in/register manually, then Resume'
    };
  }

  function hasPasswordCreateFields(doc) {
    if (global.FillApplyAuthWalls && global.FillApplyAuthWalls.hasPasswordCreateFields) {
      return global.FillApplyAuthWalls.hasPasswordCreateFields(doc);
    }
    var pw = doc.querySelectorAll('input[type="password"]');
    for (var i = 0; i < pw.length; i++) {
      if (visible(pw[i])) return true;
    }
    return false;
  }

  function isEeoLabel(label) {
    return /diversity|eeo|equal opportunity|race|ethnicity|veteran|disability|sexual orientation|lgbt|transgender|hispanic|latino|voluntary self.?identif|decline to (self-)?identify|prefer not to|gender identity|gender\b|protected veteran|disability status/i.test(
      norm(label)
    );
  }

  function isEeoStep(doc) {
    var text = pageText(doc);
    return /eeo|equal employment|voluntary self.?identif|diversity|race\/ethnicity|protected veteran/i.test(text) &&
      !/create a login/i.test(text);
  }

  function isCandidateProfileStep(doc) {
    var text = pageText(doc);
    return (
      /candidate profile|step\s*1\s*\/\s*5|create a login|resume upload|submit profile/i.test(text) ||
      (!!doc.querySelector('input[type="file"]') &&
        /first name|last name/i.test(text) &&
        /phone|address/i.test(text))
    );
  }

  function isQuestionsStep(doc) {
    var text = pageText(doc);
    return /candidate questions|questionnaire|portal specific forms|screening question/i.test(text);
  }

  function profileVal(profile, key) {
    if (!profile) return '';
    if (profile[key] != null && String(profile[key]).trim() !== '') return String(profile[key]).trim();
    return '';
  }

  function labelFor(el, doc) {
    doc = doc || document;
    if (!el) return '';
    if (global.__fillApply && global.__fillApply.getLabelText) {
      var t = global.__fillApply.getLabelText(el);
      if (t) return t;
    }
    try {
      if (el.id) {
        var esc = el.id;
        try {
          if (typeof CSS !== 'undefined' && CSS.escape) esc = CSS.escape(el.id);
        } catch (_eEsc) {}
        var lab = doc.querySelector('label[for="' + esc + '"]');
        if (lab) return buttonText(lab);
      }
      var parent = el.closest(
        'label, .form-group, .field, [class*="field"], [class*="Form"], .iCIMS_JobFormField, .iCIMS_FormField'
      );
      if (parent) return buttonText(parent).slice(0, 220);
    } catch (_e) {}
    return String(el.getAttribute('aria-label') || el.name || el.placeholder || '');
  }

  function setNativeValue(el, value) {
    if (!el) return false;
    var type = String(el.type || '').toLowerCase();
    // NEVER fill password fields — account creation is human-only
    if (type === 'password') return false;
    var str = value == null ? '' : String(value);

    if (type === 'checkbox') {
      var want = /^(yes|y|true|1|on|accept|i accept|agree)$/i.test(str) || str === true;
      if (el.checked !== want) {
        try {
          el.click();
        } catch (_e) {}
        if (el.checked !== want) {
          el.checked = want;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      return true;
    }

    if (el.tagName === 'SELECT') {
      if (global.__fillApply && global.__fillApply.matchSelectOption) {
        return !!global.__fillApply.matchSelectOption(el, str);
      }
      var wantL = str.toLowerCase();
      for (var i = 0; i < el.options.length; i++) {
        var opt = el.options[i];
        var ot = (opt.textContent || '').trim().toLowerCase();
        var ov = String(opt.value || '').toLowerCase();
        if (ot === wantL || ov === wantL || (wantL && ot.indexOf(wantL) !== -1)) {
          el.selectedIndex = i;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }

    try {
      var proto =
        el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      var desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, str);
      else el.value = str;
    } catch (_e2) {
      el.value = str;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  function answerFromCustom(profile, label) {
    var lab = norm(label);
    if (!lab) return null;
    var map = profile && profile.customAnswers;
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      var keys = Object.keys(map);
      var best = null;
      var bestScore = 0;
      for (var i = 0; i < keys.length; i++) {
        var k = norm(keys[i]);
        if (!k) continue;
        if (lab.indexOf(k) !== -1 || k.indexOf(lab) !== -1) {
          var score = Math.min(k.length, lab.length);
          if (score > bestScore) {
            bestScore = score;
            best = map[keys[i]];
          }
        }
      }
      if (best != null && String(best).trim() !== '') return String(best).trim();
    }
    if (global.FillApplyFieldMap && global.FillApplyFieldMap.matchCustomQA) {
      var qa = global.FillApplyFieldMap.matchCustomQA(profile.customQA, label, '');
      if (qa) return qa;
    }
    return null;
  }

  function yesNoHeuristic(profile, label) {
    var custom = answerFromCustom(profile, label);
    if (custom != null) return custom;
    var lab = norm(label);
    if (/sponsor|visa/.test(lab)) return profileVal(profile, 'requiresSponsorship') || 'No';
    if (/authorized|legally|work authorization|eligible to work|right to work/.test(lab)) {
      return profileVal(profile, 'authorizedToWork') || 'Yes';
    }
    if (/previously worked|worked (at|for|with)|prior (employment|employee)|former employee|relat(ed|ive)/.test(lab)) {
      return answerFromCustom(profile, label) || 'No';
    }
    if (/willing to relocate|able to relocate|travel/.test(lab)) {
      return answerFromCustom(profile, label) || 'Yes';
    }
    if (/18 years|over 18|at least 18/.test(lab)) return answerFromCustom(profile, label) || 'Yes';
    return answerFromCustom(profile, label) || '';
  }

  /**
   * Careers job detail (e.g. pepsicojobs.com) → Apply Now before iCIMS welcome.
   */
  function ensureApplyView(doc) {
    doc = doc || document;
    var text = pageText(doc);
    if (/i accept/i.test(text) && /e-?mail/i.test(text) && /next/i.test(text)) {
      return { clicked: false, kind: 'welcome' };
    }
    if (doc.querySelector('.iCIMS_JobForm, form[action*="icims" i], input[type="email"]')) {
      return { clicked: false, kind: 'form' };
    }

    var nodes = doc.querySelectorAll(
      'a, button, input[type="button"], input[type="submit"], [role="button"]'
    );
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el)) continue;
      var t = buttonText(el);
      if (!t || /premium|tailor|login|sign in|share|save/i.test(t)) continue;
      var score = 0;
      if (/^apply now$/i.test(t)) score = 100;
      else if (/^apply$/i.test(t) && t.length < 12) score = 80;
      else if (/apply for this (job|position|role)/i.test(t)) score = 90;
      else if (/\bapply now\b/i.test(t)) score = 85;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) {
      try {
        best.click();
      } catch (_e) {}
      return { clicked: true, kind: 'apply' };
    }
    return { clicked: false };
  }

  function isWelcomeStep(doc) {
    var text = pageText(doc);
    var hasEmail = !!doc.querySelector('input[type="email"], input[name*="email" i], input[id*="email" i]');
    var hasAccept = /i accept/i.test(text) || !!doc.querySelector('input[type="checkbox"]');
    var hasNext = false;
    var nodes = doc.querySelectorAll('button, input[type="submit"], input[type="button"], a, [role="button"]');
    for (var i = 0; i < nodes.length; i++) {
      if (/^next$/i.test(buttonText(nodes[i]).trim())) {
        hasNext = true;
        break;
      }
    }
    var powered = /powered by\s*icims|software powered by icims/i.test(text);
    var welcomeCopy = /welcome|start your application|begin application|i accept/i.test(text);
    // Welcome is Email + I accept + Next — NOT the Candidate Profile create-login step
    if (/create a login|candidate profile|submit profile/i.test(text)) return false;
    return hasEmail && hasAccept && hasNext && (powered || welcomeCopy);
  }

  function fillWelcomeStep(doc, profile) {
    var filled = 0;
    var email = profileVal(profile, 'email');
    var emailInputs = doc.querySelectorAll(
      'input[type="email"], input[name*="email" i], input[id*="email" i], input[placeholder*="email" i]'
    );
    for (var i = 0; i < emailInputs.length; i++) {
      var el = emailInputs[i];
      if (!visible(el) || el.disabled) continue;
      if (String(el.type || '').toLowerCase() === 'password') continue;
      if (email && setNativeValue(el, email)) filled++;
    }

    var checks = doc.querySelectorAll('input[type="checkbox"]');
    for (var c = 0; c < checks.length; c++) {
      var cb = checks[c];
      if (!visible(cb) && cb.offsetParent === null) continue;
      var lab = labelFor(cb, doc) + ' ' + buttonText(cb.closest('label') || cb);
      if (/i accept|privacy|terms|consent|agree|policy/i.test(lab) || /i accept/i.test(pageText(doc))) {
        if (!cb.checked) {
          if (setNativeValue(cb, 'Yes')) filled++;
        } else {
          filled++;
        }
      }
    }
    var labels = doc.querySelectorAll('label, span, div');
    for (var l = 0; l < labels.length; l++) {
      var node = labels[l];
      var nt = buttonText(node).slice(0, 160);
      if (/^i accept/i.test(nt) || /i accept.*privacy|i accept.*terms/i.test(nt)) {
        var inp = node.querySelector('input[type="checkbox"]') || (node.htmlFor && doc.getElementById(node.htmlFor));
        if (inp && !inp.checked) {
          try {
            node.click();
            filled++;
          } catch (_e) {
            try {
              inp.click();
              filled++;
            } catch (_e2) {}
          }
          break;
        }
      }
    }

    return filled;
  }

  function makeFile(Files, docBlob, fallbackName) {
    if (!Files || !docBlob || !docBlob.base64) return null;
    return Files.fileFromBase64(docBlob.base64, docBlob.name || fallbackName, docBlob.mime || 'application/pdf');
  }

  function attachResume(doc, documents) {
    var Files = global.FillApplyFiles;
    if (!Files) return { resumeAttached: false, error: 'FillApplyFiles missing' };
    var resumeFile = makeFile(Files, documents && documents.resume, 'resume.pdf');
    if (!resumeFile) return { resumeAttached: false, error: 'No resume document' };

    var inputs = doc.querySelectorAll('input[type="file"]');
    var attached = false;
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      var near = (labelFor(inp, doc) + ' ' + (inp.name || '') + ' ' + (inp.id || '') + ' ' + (inp.accept || '')).toLowerCase();
      if (/cover/i.test(near) && !/resume|cv/i.test(near)) continue;
      if (!/resume|cv|upload|file|attach|document/i.test(near) && inputs.length > 1) continue;
      var r = Files.assignFilesToInput(inp, [resumeFile]);
      if (r && r.ok) {
        attached = true;
        break;
      }
    }
    if (!attached && Files.attachDocuments) {
      var generic = Files.attachDocuments(documents || {}, [
        { kind: 'resume', match: 'resume|cv|upload' },
        { kind: 'cover', match: 'cover' }
      ]);
      attached = !!(generic && generic.resumeAttached);
    }
    return { resumeAttached: attached };
  }

  /**
   * Map Candidate Profile fields from active profile. Never touches password / login fields.
   */
  function fillCandidateProfile(doc, profile, documents) {
    var filled = 0;
    var resumeInfo = attachResume(doc, documents || {});
    if (resumeInfo.resumeAttached) filled++;

    var mappings = [
      { key: 'firstName', re: /first\s*name|^fname$|given\s*name/i },
      { key: 'lastName', re: /last\s*name|^lname$|surname|family\s*name/i },
      { key: 'email', re: /^e-?mail$|email\s*address|e-?mail/i },
      { key: 'phone', re: /^(phone|mobile|telephone|number)$|phone\s*number|mobile\s*number/i },
      { key: 'phoneCountry', re: /phone\s*country|country\s*code|dial\s*code/i },
      { key: 'street', re: /^(address|street|address\s*line)/i },
      { key: 'city', re: /^city$/i },
      { key: 'zip', re: /zip|postal|post\s*code|postal\s*code/i },
      { key: 'country', re: /^country$/i },
      { key: 'state', re: /^state$|province|region/i }
    ];

    var inputs = doc.querySelectorAll('input, select, textarea');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      if (!visible(el) && String(el.type || '') !== 'file') continue;
      var type = String(el.type || '').toLowerCase();
      if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'password' || type === 'file') {
        continue;
      }
      // Never touch login/password-adjacent name attributes
      var nameId = String(el.name || '') + ' ' + String(el.id || '');
      if (/password|passwd|pwd|loginid|username.*login|create.?login/i.test(nameId)) continue;

      var lab = labelFor(el, doc);
      var blob = norm(lab + ' ' + nameId + ' ' + (el.placeholder || ''));
      if (/password|re-?enter|create a login|login\*|username/i.test(blob) && /password|login|username/i.test(blob)) {
        continue;
      }

      if (type === 'checkbox') {
        if (/privacy|i accept|agree|consent|terms/i.test(lab + ' ' + blob)) {
          if (setNativeValue(el, 'Yes')) filled++;
        }
        continue;
      }

      var matched = false;
      for (var m = 0; m < mappings.length; m++) {
        if (mappings[m].re.test(lab) || mappings[m].re.test(blob)) {
          var val = profileVal(profile, mappings[m].key);
          if (mappings[m].key === 'zip' && !val) val = profileVal(profile, 'postcode');
          if (mappings[m].key === 'street' && !val) val = profileVal(profile, 'location');
          if (mappings[m].key === 'phoneCountry' && !val) {
            val = profileVal(profile, 'phoneCountry') || '';
          }
          if (val && setNativeValue(el, val)) {
            filled++;
            matched = true;
          }
          break;
        }
      }
      if (matched) continue;

      // Preferred Language — English default if select offers it
      if (/preferred\s*language|language/i.test(lab) && el.tagName === 'SELECT') {
        var lang = answerFromCustom(profile, lab) || 'English';
        if (setNativeValue(el, lang)) filled++;
        continue;
      }

      // Phone Type — Mobile / Cell preferred
      if (/phone\s*type/i.test(lab) && el.tagName === 'SELECT') {
        var ptype = answerFromCustom(profile, lab) || 'Mobile';
        if (!setNativeValue(el, ptype)) setNativeValue(el, 'Cell');
        filled++;
        continue;
      }

      // Address Type — Home preferred
      if (/address\s*type/i.test(lab) && el.tagName === 'SELECT') {
        var atype = answerFromCustom(profile, lab) || 'Home';
        if (setNativeValue(el, atype)) filled++;
        continue;
      }
    }

    return { filled: filled, resumeAttached: !!resumeInfo.resumeAttached };
  }

  function skipEeoStep(doc) {
    var skipped = 0;
    // Prefer decline / prefer not / skip buttons
    var nodes = doc.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el) || el.disabled) continue;
      var t = buttonText(el);
      if (/^skip$/i.test(t.trim()) || /skip\s*(this|step|eeo|survey)?/i.test(t) || /decline|prefer not/i.test(t)) {
        // Avoid skipping the whole application
        if (/skip\s*application|skip\s*job/i.test(t)) continue;
        try {
          el.click();
          skipped++;
          return skipped;
        } catch (_e) {}
      }
    }

    // Prefer-not options on selects/radios
    var selects = doc.querySelectorAll('select');
    for (var s = 0; s < selects.length; s++) {
      var sel = selects[s];
      if (!visible(sel)) continue;
      var lab = labelFor(sel, doc);
      if (!isEeoLabel(lab) && !isEeoStep(doc)) continue;
      for (var o = 0; o < sel.options.length; o++) {
        var ot = (sel.options[o].textContent || '').trim();
        if (/prefer not|decline|do not wish|choose not|not to (self-)?identify|don'?t wish/i.test(ot)) {
          sel.selectedIndex = o;
          sel.dispatchEvent(new Event('input', { bubbles: true }));
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          skipped++;
          break;
        }
      }
    }
    var radios = doc.querySelectorAll('input[type="radio"]');
    for (var r = 0; r < radios.length; r++) {
      var radio = radios[r];
      if (!visible(radio)) continue;
      var wrap = radio.closest('fieldset, [role="group"], div, .iCIMS_JobFormField') || radio.parentElement;
      var wLab = ((wrap && wrap.textContent) || '').slice(0, 300) + ' ' + labelFor(radio, doc);
      if (!isEeoLabel(wLab) && !isEeoStep(doc)) continue;
      var rLab = labelFor(radio, doc) || radio.value || '';
      if (/prefer not|decline|do not wish|choose not|not to (self-)?identify/i.test(rLab)) {
        try {
          radio.click();
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          skipped++;
        } catch (_e2) {}
      }
    }
    return skipped;
  }

  function fillYesNoGroup(root, wantYes) {
    var radios = root.querySelectorAll('input[type="radio"], button, [role="radio"]');
    for (var j = 0; j < radios.length; j++) {
      var radio = radios[j];
      var rLab = labelFor(radio, document) || radio.value || buttonText(radio) || '';
      var isYes = /^(yes|y)$/i.test(rLab.trim()) || /^yes\b/i.test(rLab.trim());
      var isNo = /^(no|n)$/i.test(rLab.trim()) || /^no\b/i.test(rLab.trim());
      if ((wantYes && isYes) || (!wantYes && isNo)) {
        try {
          radio.click();
          if (radio.tagName === 'INPUT') {
            radio.checked = true;
            radio.dispatchEvent(new Event('input', { bubbles: true }));
            radio.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return true;
        } catch (_e) {}
      }
    }
    var selects = root.querySelectorAll('select');
    for (var s = 0; s < selects.length; s++) {
      if (setNativeValue(selects[s], wantYes ? 'Yes' : 'No')) return true;
    }
    return false;
  }

  /**
   * Candidate Questions / Questionnaire — customAnswers + Yes/No heuristics.
   * Returns { filled, unknownRequired[] }
   */
  function fillQuestions(doc, profile) {
    var filled = 0;
    var unknownRequired = [];
    var fields = doc.querySelectorAll('input, select, textarea');
    var seenRadioGroups = {};

    for (var i = 0; i < fields.length; i++) {
      var el = fields[i];
      var type = String(el.type || '').toLowerCase();
      if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'password' || type === 'file') {
        continue;
      }
      if (!visible(el) && type !== 'radio' && type !== 'checkbox') continue;

      var lab = labelFor(el, doc);
      var blob = lab + ' ' + (el.name || '') + ' ' + (el.id || '');
      if (isEeoLabel(blob)) continue;
      if (/password|create a login|login\*/i.test(blob)) continue;

      var required =
        el.required ||
        el.getAttribute('aria-required') === 'true' ||
        /\*/.test(lab) ||
        /\(required\)/i.test(lab);

      if (type === 'radio') {
        var gname = el.name || lab;
        if (seenRadioGroups[gname]) continue;
        seenRadioGroups[gname] = true;
        var wrap = el.closest('fieldset, [role="group"], .iCIMS_JobFormField, .iCIMS_FormField, div') || el.parentElement;
        var qLab = labelFor(el, doc);
        if (wrap) {
          var legend = wrap.querySelector('legend, label, .question, [class*="question"]');
          if (legend) qLab = buttonText(legend).slice(0, 220) || qLab;
          else qLab = buttonText(wrap).slice(0, 220) || qLab;
        }
        if (isEeoLabel(qLab)) continue;
        var ans = yesNoHeuristic(profile, qLab);
        if (ans && /^(yes|y|true|1|no|n|false|0)$/i.test(String(ans).trim())) {
          var wantYes = /^(yes|y|true|1)$/i.test(String(ans).trim());
          if (fillYesNoGroup(wrap || el.parentElement, wantYes)) {
            filled++;
            continue;
          }
        }
        var custom = answerFromCustom(profile, qLab);
        if (custom) {
          // Try matching radio option text to custom answer
          var radios = (wrap || doc).querySelectorAll('input[type="radio"]');
          var hit = false;
          for (var r = 0; r < radios.length; r++) {
            var rl = labelFor(radios[r], doc) || radios[r].value || '';
            if (norm(rl).indexOf(norm(custom)) !== -1 || norm(custom).indexOf(norm(rl)) !== -1) {
              try {
                radios[r].click();
                radios[r].checked = true;
                radios[r].dispatchEvent(new Event('change', { bubbles: true }));
                filled++;
                hit = true;
                break;
              } catch (_e) {}
            }
          }
          if (hit) continue;
        }
        // Check if already answered
        var groupRadios = doc.querySelectorAll('input[type="radio"][name="' + (el.name || '').replace(/"/g, '') + '"]');
        var anyChecked = false;
        for (var g = 0; g < groupRadios.length; g++) {
          if (groupRadios[g].checked) anyChecked = true;
        }
        if (!anyChecked && required) unknownRequired.push(qLab || blob);
        continue;
      }

      if (type === 'checkbox') {
        if (/privacy|agree|consent|i accept|terms/i.test(lab)) {
          if (setNativeValue(el, 'Yes')) filled++;
        }
        continue;
      }

      // Already has value
      if (el.value && String(el.value).trim()) continue;

      var answer = answerFromCustom(profile, lab);
      if (!answer && el.tagName === 'SELECT') {
        var yn = yesNoHeuristic(profile, lab);
        if (yn) answer = yn;
      }
      if (!answer) {
        // Profile field heuristics for leftover profile-like questions
        if (/first\s*name/i.test(lab)) answer = profileVal(profile, 'firstName');
        else if (/last\s*name/i.test(lab)) answer = profileVal(profile, 'lastName');
        else if (/e-?mail/i.test(lab)) answer = profileVal(profile, 'email');
        else if (/phone|mobile/i.test(lab)) answer = profileVal(profile, 'phone');
        else if (/city/i.test(lab)) answer = profileVal(profile, 'city');
        else if (/country/i.test(lab)) answer = profileVal(profile, 'country');
        else if (/linkedin/i.test(lab)) answer = profileVal(profile, 'linkedin');
      }

      if (answer && setNativeValue(el, answer)) {
        filled++;
      } else if (required) {
        unknownRequired.push(lab || blob);
      }
    }

    return { filled: filled, unknownRequired: unknownRequired };
  }

  function clickNext(doc) {
    doc = doc || document;
    var nodes = doc.querySelectorAll('button, input[type="submit"], input[type="button"], a, [role="button"]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el) || el.disabled) continue;
      var t = buttonText(el);
      if (/^next$/i.test(t.trim()) || /^continue$/i.test(t.trim()) || /save and continue/i.test(t)) {
        // Do not treat Submit Profile as Next
        if (/submit/i.test(t)) continue;
        try {
          el.click();
          return true;
        } catch (_e) {}
      }
    }
    return false;
  }

  function isSubmitProfileCta(t) {
    return /submit\s*profile/i.test(String(t || ''));
  }

  function isFinalSubmitCta(t) {
    t = String(t || '');
    if (isSubmitProfileCta(t)) return true;
    if (/^next$/i.test(t.trim()) || /^continue$/i.test(t.trim()) || /save and continue/i.test(t)) {
      return false;
    }
    if (global.FillApplySynonyms && global.FillApplySynonyms.isApplyCta) {
      return !!global.FillApplySynonyms.isApplyCta(t);
    }
    return /submit\s*application|submit\s*(&|and)\s*apply|^submit$/i.test(t) || /^apply now$/i.test(t);
  }

  function clickSubmitProfile(doc) {
    doc = doc || document;
    // Never click Submit Profile while Create login / password fields are visible
    if (hasPasswordCreateFields(doc)) return false;
    var wall = detectAuthWall(doc);
    if (wall && wall.challenged) return false;

    var nodes = doc.querySelectorAll(
      'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]'
    );
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el) || el.disabled) continue;
      var t = buttonText(el);
      if (isSubmitProfileCta(t)) {
        try {
          el.click();
          return true;
        } catch (_e) {}
      }
    }
    return false;
  }

  function clickSubmit(doc) {
    doc = doc || document;
    if (hasPasswordCreateFields(doc)) return false;
    var nodes = doc.querySelectorAll(
      'button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]'
    );
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el) || el.disabled) continue;
      var t = buttonText(el);
      if (isFinalSubmitCta(t)) {
        try {
          el.click();
          return true;
        } catch (_e) {}
      }
    }
    var fb = doc.querySelector(
      'input[type="submit"], button[type="submit"], .iCIMS_SubmitButton, button.iCIMS_PrimaryButton'
    );
    if (fb && visible(fb)) {
      var ft = buttonText(fb);
      if (!/^next$/i.test(ft.trim()) && !/^continue$/i.test(ft.trim()) && !hasPasswordCreateFields(doc)) {
        try {
          fb.click();
          return true;
        } catch (_e2) {}
      }
    }
    return false;
  }

  function formLooksComplete(doc) {
    var nodes = doc.querySelectorAll('button, input[type="submit"], [role="button"]');
    for (var i = 0; i < nodes.length; i++) {
      if (visible(nodes[i]) && isFinalSubmitCta(buttonText(nodes[i]))) return true;
    }
    return !!doc.querySelector('.iCIMS_SubmitButton, [class*="Submit"]');
  }

  var FIELD_MAPS = [
    { key: 'email', labels: ['email', 'e-mail'], names: ['email'] },
    { key: 'firstName', labels: ['first name'], names: ['firstname', 'first_name', 'fname'] },
    { key: 'lastName', labels: ['last name'], names: ['lastname', 'last_name', 'lname'] },
    { key: 'phone', labels: ['phone', 'mobile', 'number'], names: ['phone', 'mobile', 'telephone'] },
    { key: 'phoneCountry', labels: ['phone country', 'country code'], names: ['phonecountry', 'countrycode'] },
    { key: 'street', labels: ['address', 'street'], names: ['address', 'street'] },
    { key: 'city', labels: ['city'], names: ['city'] },
    { key: 'state', labels: ['state', 'province'], names: ['state', 'province'] },
    { key: 'zip', labels: ['zip', 'postal', 'postal code'], names: ['zip', 'postal', 'postcode'] },
    { key: 'country', labels: ['country'], names: ['country'] },
    { key: 'linkedin', labels: ['linkedin'], names: ['linkedin'] }
  ];

  var adapter = {
    id: 'icims',
    name: 'iCIMS',
    category: 'ats',
    hosts: HOSTS,
    detect: detect,
    fieldMaps: FIELD_MAPS,
    submitSelector:
      'input[type="submit"], button[type="submit"], .iCIMS_SubmitButton, button.iCIMS_PrimaryButton',
    fileInputHints: [
      { kind: 'resume', match: 'resume|cv|upload' },
      { kind: 'cover', match: 'cover' }
    ],
    detectAuthWall: detectAuthWall,
    fill: function (ctx) {
      ctx = ctx || {};
      var doc = ctx.document || (typeof document !== 'undefined' ? document : null);
      var profile = ctx.profile || {};
      var documents = ctx.documents || {};
      var runMode = ctx.runMode || (ctx.options && ctx.options.runMode) || 'fill';
      if (['fill', 'ready', 'submit'].indexOf(runMode) === -1) runMode = 'fill';

      return Promise.resolve().then(async function () {
        if (!doc) {
          return {
            ok: false,
            adapterId: 'icims',
            error: 'No document',
            filled: 0,
            unmatched: 0,
            total: 0
          };
        }

        var pause0 = challengePause(doc, 0);
        if (pause0) return pause0;

        ensureApplyView(doc);
        await sleep(humanDelay(500));

        var pause1 = challengePause(doc, 0);
        if (pause1) return pause1;

        var totalFilled = 0;
        var advanced = false;
        var resumeAttached = false;
        var submitted = false;

        // Welcome: Email + I accept + Next
        if (isWelcomeStep(doc) || (doc.querySelector('input[type="email"]') && /i accept/i.test(pageText(doc)))) {
          if (!/create a login|submit profile/i.test(pageText(doc))) {
            totalFilled += fillWelcomeStep(doc, profile);
            var pauseWelcome = challengePause(doc, totalFilled);
            if (pauseWelcome) {
              pauseWelcome.message =
                'iCIMS welcome: complete hCaptcha / captcha if shown, then Resume (Email + I accept filled when possible).';
              return pauseWelcome;
            }
            if (clickNext(doc)) {
              advanced = true;
              await sleep(humanDelay(700));
            }
          }
        }

        var pause2 = challengePause(doc, totalFilled);
        if (pause2) return pause2;

        // Candidate Profile: fill non-password fields + resume even if Create-login
        // is visible — but NEVER invent passwords / NEVER Submit Profile while
        // Create-login fields are present → pause for human auth first.
        if (isCandidateProfileStep(doc) || doc.querySelector('input[type="file"]')) {
          var profileFill = fillCandidateProfile(doc, profile, documents);
          totalFilled += profileFill.filled || 0;
          if (profileFill.resumeAttached) resumeAttached = true;

          var pauseProf = challengePause(doc, totalFilled);
          if (pauseProf) return pauseProf;

          if (hasPasswordCreateFields(doc) || (detectAuthWall(doc) || {}).challenged) {
            var authPause = authWallPause(doc, totalFilled);
            if (authPause) {
              authPause.filled = totalFilled;
              authPause.resumeAttached = resumeAttached;
              authPause.message =
                'iCIMS account required — sign in/register manually, then Resume (profile fields/resume filled when possible; passwords never auto-filled)';
              return authPause;
            }
            return {
              ok: false,
              adapterId: 'icims',
              needsHuman: true,
              pauseReason: 'auth_wall',
              error: 'iCIMS account required — sign in/register manually, then Resume',
              filled: totalFilled,
              unmatched: 0,
              total: totalFilled,
              submitted: false,
              resumeAttached: resumeAttached
            };
          }

          // Auth cleared — Submit Profile only in submit mode
          if (runMode === 'submit') {
            if (clickSubmitProfile(doc)) {
              submitted = true;
              advanced = true;
              await sleep(humanDelay(700));
            }
          }
          // fill/ready: fields filled but do NOT Submit Profile
        } else {
          // Non-profile pages: still honor auth wall (e.g. dedicated sign-in)
          var authEarly = authWallPause(doc, totalFilled);
          if (authEarly) return authEarly;
        }

        var pause3 = challengePause(doc, totalFilled);
        if (pause3) return pause3;
        var auth3 = authWallPause(doc, totalFilled);
        if (auth3) return auth3;

        // EEO — skip / decline, never invent
        if (isEeoStep(doc)) {
          skipEeoStep(doc);
          if (runMode === 'submit' || runMode === 'ready' || runMode === 'fill') {
            if (clickNext(doc)) {
              advanced = true;
              await sleep(humanDelay(500));
            }
          }
        }

        // Candidate Questions / Questionnaire
        if (isQuestionsStep(doc) || doc.querySelector('input[type="radio"], textarea, select')) {
          var qResult = fillQuestions(doc, profile);
          totalFilled += qResult.filled || 0;
          if (runMode === 'submit' && qResult.unknownRequired && qResult.unknownRequired.length) {
            var label = qResult.unknownRequired[0] || 'unknown question';
            return {
              ok: false,
              adapterId: 'icims',
              needsHuman: true,
              pauseReason: 'structure_drift',
              driftLabel: label,
              error:
                'iCIMS required question unmapped — add customAnswers or answer manually: "' +
                String(label).slice(0, 120) +
                '"',
              filled: totalFilled,
              unmatched: qResult.unknownRequired.length,
              total: totalFilled + qResult.unknownRequired.length,
              submitted: false
            };
          }
        }

        // Fallback fill for leftover fields (never invent EEO; never final-submit via fallback)
        var fb = global.FillApplyFallbackAdapter;
        var fbResult = null;
        if (fb && typeof fb.fill === 'function') {
          fbResult = fb.fill(
            Object.assign({}, ctx, {
              adapterId: 'icims',
              submitSelector: adapter.submitSelector,
              fileInputHints: adapter.fileInputHints,
              fieldMaps: adapter.fieldMaps.concat(FIELD_MAPS),
              runMode: 'fill',
              autoSubmit: false
            })
          );
          if (fbResult && typeof fbResult.then === 'function') fbResult = await fbResult;
          if (fbResult) {
            totalFilled += Number(fbResult.filled) || 0;
            if (fbResult.resumeAttached) resumeAttached = true;
          }
        }

        var pause4 = challengePause(doc, totalFilled);
        if (pause4) return pause4;
        var auth4 = authWallPause(doc, totalFilled);
        if (auth4) return auth4;

        if (runMode === 'submit') {
          for (var hop = 0; hop < 8; hop++) {
            var pauseHop = challengePause(doc, totalFilled);
            if (pauseHop) return pauseHop;
            var authHop = authWallPause(doc, totalFilled);
            if (authHop) return authHop;

            if (isEeoStep(doc)) {
              skipEeoStep(doc);
            }

            // Unknown required on questions mid-hop
            if (isQuestionsStep(doc)) {
              var q2 = fillQuestions(doc, profile);
              totalFilled += q2.filled || 0;
              if (q2.unknownRequired && q2.unknownRequired.length) {
                var lab2 = q2.unknownRequired[0] || 'unknown question';
                return {
                  ok: false,
                  adapterId: 'icims',
                  needsHuman: true,
                  pauseReason: 'structure_drift',
                  driftLabel: lab2,
                  error:
                    'iCIMS required question unmapped — add customAnswers or answer manually: "' +
                    String(lab2).slice(0, 120) +
                    '"',
                  filled: totalFilled,
                  unmatched: q2.unknownRequired.length,
                  total: totalFilled + q2.unknownRequired.length,
                  submitted: false
                };
              }
            }

            if (hasPasswordCreateFields(doc)) {
              return (
                authWallPause(doc, totalFilled) || {
                  ok: false,
                  adapterId: 'icims',
                  needsHuman: true,
                  pauseReason: 'auth_wall',
                  error: 'iCIMS account required — sign in/register manually, then Resume',
                  filled: totalFilled,
                  unmatched: 0,
                  total: totalFilled,
                  submitted: false
                }
              );
            }

            if (clickSubmitProfile(doc)) {
              submitted = true;
              advanced = true;
              await sleep(humanDelay(600));
              continue;
            }
            if (formLooksComplete(doc) && clickSubmit(doc)) {
              submitted = true;
              await sleep(humanDelay(400));
              break;
            }
            if (clickNext(doc)) {
              advanced = true;
              await sleep(humanDelay(600));
              continue;
            }
            if (clickSubmit(doc)) {
              submitted = true;
              await sleep(humanDelay(400));
              break;
            }
            break;
          }
        }

        return {
          ok: true,
          adapterId: 'icims',
          filled: totalFilled,
          unmatched: (fbResult && fbResult.unmatched) || 0,
          total: totalFilled + ((fbResult && fbResult.unmatched) || 0),
          submitted: submitted,
          advanced: advanced,
          runMode: runMode,
          resumeAttached: resumeAttached || !!(fbResult && fbResult.resumeAttached),
          message: submitted
            ? 'iCIMS: submitted application / profile'
            : 'iCIMS: filled multi-step fields (welcome / Candidate Profile / questions); account signup is human gate; fill/ready never Submit Profile'
        };
      });
    }
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
  global.FillApply_icimsAdapter = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : self);
