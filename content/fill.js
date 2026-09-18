/**
 * Form field detection + fill engine.
 *
 * Built on FillApplyDom, so every lookup pierces open shadow roots and
 * same-origin iframes, and every interaction emits the events frameworks
 * listen for.
 *
 * `run()` is async on purpose: application forms render their controls, their
 * listbox options and their conditional follow-up questions on later ticks, so
 * a single synchronous pass sees only part of the form (and never sees a
 * portalled dropdown option at all).
 *
 * Exposes globalThis.__fillApply.
 */
(function (global) {
  'use strict';

  const HIGHLIGHT_ATTR = 'data-fill-apply-unmatched';
  const FILLED_ATTR = 'data-fill-apply-filled';
  const FILLED_VALUE_ATTR = 'data-fill-apply-value';

  /** Voluntary self-identification — reported, never answered. */
  const DIVERSITY_RE =
    /diversity|equal opportunity|\beeo\b|race|ethnicity|gender identity|\bveteran\b|disability|sexual orientation|hispanic|latino|\blgbt|decline to (self-)?identify|voluntary self.?identif|self.?identification/i;

  /** Agreements a human must make for themselves. */
  const CONSENT_RE =
    /\b(i agree|i accept|i consent|i acknowledge|i certify|i confirm|terms|privacy policy|data protection|gdpr|declaration)\b/i;

  /** Gender / sex questions (including voluntary "Gender Identity"). */
  const GENDER_FIELD_RE = /\b(gender(\s*identity)?|sex)\b/i;
  const SEXUAL_ORIENTATION_RE = /sexual\s*orientation/i;

  function isGenderField(label) {
    const t = String(label || '');
    if (!GENDER_FIELD_RE.test(t)) return false;
    if (SEXUAL_ORIENTATION_RE.test(t)) return false;
    return true;
  }

  function profileHasGender(profile) {
    const g = profile && profile.gender;
    return !!(g != null && String(g).trim());
  }

  /**
   * EEO / diversity controls are skipped — except gender/sex when the profile
   * already has a gender value the applicant chose to share.
   */
  function shouldSkipDiversity(el, label, profile) {
    if (!isDiversityControl(el, label)) return false;
    if (isGenderField(label) && profileHasGender(profile)) return false;
    return true;
  }

  /** Options that look like phone dial codes: "+966", "+966 Saudi Arabia". */
  function optionsLookLikeDialCodes(options) {
    if (!options || !options.length) return false;
    let dialish = 0;
    const n = Math.min(options.length, 40);
    for (let i = 0; i < n; i++) {
      const o = options[i];
      const t = String((o && (o.text || o.label || o.value)) || '');
      if (/\+\d{1,4}\b/.test(t) || /^\s*\d{1,4}\s*[-–/]/.test(t)) dialish += 1;
    }
    return dialish >= 3 || (dialish >= 1 && dialish / n >= 0.25);
  }

  function descriptorLooksLikePhoneCountry(descriptor, el) {
    if (!descriptor) return false;
    const blob = String(
      (descriptor.label || '') +
        ' ' +
        (descriptor.name || '') +
        ' ' +
        (descriptor.id || '') +
        ' ' +
        (descriptor.autocomplete || '') +
        ' ' +
        (descriptor.placeholder || '')
    ).toLowerCase();
    if (/country code|dial code|calling code|phone country|tel-country|phone.?country/.test(blob)) {
      return true;
    }
    const opts = descriptor.options || (el && el.options ? null : null);
    let optionList = descriptor.options;
    if ((!optionList || !optionList.length) && el && el.tagName === 'SELECT' && el.options) {
      optionList = [];
      for (let i = 0; i < el.options.length; i++) {
        optionList.push({ text: el.options[i].textContent, value: el.options[i].value });
      }
    }
    if (optionsLookLikeDialCodes(optionList)) {
      // Bare "Country*" next to a phone field, or any dial-code select.
      if (/^\s*country\b/.test(blob) || /\bcountry\b/.test(blob)) return true;
      return true;
    }
    return false;
  }


  function dom() {
    return global.FillApplyDom || null;
  }

  function sleep(ms) {
    const D = dom();
    if (D && D.sleep) return D.sleep(ms);
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function queryAll(selector, root) {
    const D = dom();
    if (D && D.queryAll) return D.queryAll(selector, root);
    try {
      return Array.prototype.slice.call((root || document).querySelectorAll(selector));
    } catch (_e) {
      return [];
    }
  }

  function isVisible(el) {
    const D = dom();
    return D && D.isVisible ? D.isVisible(el) : !!el;
  }

  function textOf(el) {
    const D = dom();
    if (D && D.textOf) return D.textOf(el);
    return String((el && (el.innerText || el.textContent)) || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function realClick(el) {
    const D = dom();
    if (D && D.realClick) return D.realClick(el);
    try {
      el.click();
      return true;
    } catch (_e) {
      return false;
    }
  }

  /**
   * Label text for a control. Kept on the public API because every adapter
   * delegates to it.
   */
  function getLabelText(el) {
    const D = dom();
    if (D && D.labelFor) return D.labelFor(el);
    if (!el) return '';
    const aria = el.getAttribute && el.getAttribute('aria-label');
    return aria ? aria.trim() : '';
  }

  function isRequiredField(el, label) {
    const D = dom();
    if (D && D.isRequired) return D.isRequired(el, label);
    return !!(el && el.required);
  }

  function isFillable(el) {
    if (!el || el.disabled) return false;
    const type = String(el.type || '').toLowerCase();
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'image') return false;
    if (type === 'file' || type === 'password') return false;
    if (el.readOnly && !isComboboxInput(el)) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return !!(el.getAttribute && el.getAttribute('contenteditable') === 'true');
  }

  /**
   * A text input that drives a listbox rather than accepting free text
   * (Greenhouse location, Workday country, react-select).
   */
  function isComboboxInput(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    const role = el.getAttribute('role') || '';
    if (role === 'combobox') return true;
    if (el.getAttribute('aria-autocomplete')) return true;
    if (el.getAttribute('aria-haspopup') === 'listbox') return true;
    if (el.getAttribute('aria-controls') && el.readOnly) return true;
    return false;
  }

  function normalizeText(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Match a select option by exact, case-insensitive, or includes.
   */
  function matchSelectOption(selectEl, value) {
    if (!selectEl || !selectEl.options) return false;
    const want = String(value).trim();
    const wantLower = want.toLowerCase();
    let bestIdx = -1;
    let bestScore = 0;

    for (let i = 0; i < selectEl.options.length; i++) {
      const opt = selectEl.options[i];
      const t = (opt.textContent || '').trim();
      const v = String(opt.value || '').trim();
      const tLower = t.toLowerCase();
      const vLower = v.toLowerCase();
      // Skip placeholder options
      if (!v && /^(select|choose|please select|--|–)/i.test(t)) continue;
      if (tLower === 'select...' || tLower === 'select …') continue;

      let score = 0;
      if (t === want || v === want) score = 100;
      else if (tLower === wantLower || vLower === wantLower) score = 90;
      else if (tLower.indexOf(wantLower) !== -1 || wantLower.indexOf(tLower) !== -1) score = 70;
      else if (vLower.indexOf(wantLower) !== -1) score = 60;
      else if (/^(yes|y)$/i.test(want) && /^(yes|y|true|1)$/i.test(t + v)) score = 85;
      else if (/^(no|n)$/i.test(want) && /^(no|n|false|0)$/i.test(t + v) && !/not sure|unknown/i.test(t)) {
        score = 85;
      } else {
        // Dial-code options: "+966" must match "+966 Saudi Arabia" / "Saudi Arabia (+966)".
        const wantDial = (want.match(/\+?\d{1,4}/) || [''])[0].replace(/^\+/, '');
        const tDial = (t.match(/\+?\d{1,4}/) || [''])[0].replace(/^\+/, '');
        const vDial = (v.match(/\+?\d{1,4}/) || [''])[0].replace(/^\+/, '');
        if (wantDial && (wantDial === tDial || wantDial === vDial)) score = 88;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestScore >= 60) {
      selectEl.selectedIndex = bestIdx;
      const D = dom();
      if (D && D.setValue) {
        // Fire the same event pair a user selection produces.
        try {
          selectEl.dispatchEvent(new Event('input', { bubbles: true }));
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_e) {
          /* ignore */
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Shape a profile value for the control it is about to be written into.
   *
   * Knowing which field we found is not enough: a phone number that a single
   * Greenhouse field accepts as +971501234567 has to arrive as 501234567 when
   * the form renders its own country-code selector, and as 5551234567 when the
   * control declares pattern="\d{10}". FillApplyFormat reads those constraints
   * off the control; this stays as the local fallback for the numeric and date
   * cases when it is not loaded.
   */
  function sanitizeForInput(el, value, context) {
    if (value == null) return { value: '', skip: true };
    var str = String(value);
    if (!el) return { value: str, skip: false };

    var fmt = global.FillApplyFormat;
    if (fmt && typeof fmt.formatForField === 'function') {
      var shaped = fmt.formatForField(el, str, context || {});
      if (shaped) return { value: shaped.value, skip: !!shaped.skip, format: shaped.format, kind: shaped.kind };
    }

    var type = String(el.type || '').toLowerCase();
    var inputMode = (el.getAttribute && (el.getAttribute('inputmode') || '')).toLowerCase();
    var pattern = (el.getAttribute && el.getAttribute('pattern')) || '';

    if (type === 'date') {
      var iso = toIsoDate(str);
      return iso ? { value: iso, skip: false } : { value: '', skip: true };
    }

    var wantsNumber =
      type === 'number' ||
      type === 'range' ||
      (type === 'tel' && (/[0-9]/.test(pattern) || inputMode === 'numeric' || inputMode === 'decimal')) ||
      inputMode === 'numeric' ||
      inputMode === 'decimal';
    if (!wantsNumber) {
      var maxLength = Number(el.maxLength);
      if (Number.isFinite(maxLength) && maxLength > 0 && str.length > maxLength) {
        str = str.slice(0, maxLength);
      }
      return { value: str, skip: false };
    }
    var num = '';
    if (global.FillApplyProfile && typeof global.FillApplyProfile.numericAmount === 'function') {
      num = global.FillApplyProfile.numericAmount(str);
    } else {
      num = str
        .replace(/(AED|SAR|USD|EUR|GBP|PKR|INR|CAD|AUD|CHF|JPY|CNY|QAR|KWD|BHD|OMR|EGP)\b/gi, '')
        .replace(/[£$€¥₹]/g, '')
        .replace(/,/g, '')
        .replace(/\s+/g, '');
      var m = num.match(/-?\d+(?:\.\d+)?/);
      num = m ? m[0] : '';
    }
    if (!num) return { value: '', skip: true };
    return { value: num, skip: false };
  }

  function toIsoDate(str) {
    var s = String(str || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var parsed = Date.parse(s);
    if (Number.isNaN(parsed)) return '';
    var d = new Date(parsed);
    var pad = function (n) {
      return String(n).padStart(2, '0');
    };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /**
   * Write a value into any control type. Checkboxes and radios go through a real
   * click so framework state updates; everything else uses the native setter.
   */
  function setNativeValue(el, value, context) {
    const D = dom();
    const tag = el.tagName;
    const type = String(el.type || '').toLowerCase();

    if (type === 'checkbox') {
      const want = /^(yes|true|1|on|y|checked)$/i.test(String(value));
      if (el.checked !== want) realClick(el);
      if (el.checked !== want) {
        el.checked = want;
        fireChange(el);
      }
      return true;
    }

    if (type === 'radio') return selectRadioInGroup(el, value, kindOf(el, context));

    var sanitized = sanitizeForInput(el, value, context);
    if (sanitized.skip) return false;
    const finalValue = sanitized.value;

    if (tag === 'SELECT') {
      if (matchSelectOption(el, finalValue)) return true;
      // Selects spell countries and states either way round: a profile saying
      // "United Arab Emirates" has to find an option labelled "AE".
      const variants = selectVariants(finalValue, sanitized.kind);
      for (let v = 0; v < variants.length; v++) {
        if (matchSelectOption(el, variants[v])) return true;
      }
      // Buckets and levels: "15" belongs in "10+ years", "Master's / MBA" in
      // "Master's Degree". Neither is reachable by comparing strings.
      if (selectByOptionMatch(el, finalValue, sanitized.kind)) return true;
      // Never free-text into a <select> — incompatible options → DO NOT FILL
      return false;
    }

    if (D && D.setValue) {
      D.setValue(el, finalValue);
    } else {
      el.value = finalValue;
      fireChange(el);
    }
    return true;
  }

  /** Alternate spellings of a value that a select might use as its option text. */
  function selectVariants(value, kind) {
    const fmt = global.FillApplyFormat;
    if (!fmt || typeof fmt.valueVariants !== 'function') return [];
    return fmt.valueVariants(value, kind).filter(function (v) {
      return v && v !== value;
    });
  }

  /** What shape of answer a control wants, for option matching. */
  function kindOf(el, context) {
    const fmt = global.FillApplyFormat;
    if (!fmt || typeof fmt.fieldKind !== 'function') return null;
    const D = dom();
    const descriptor = D && D.describeField ? D.describeField(el) : el;
    return fmt.fieldKind(descriptor, context && context.key);
  }

  /** Real options of a select, placeholders dropped, with their indexes kept. */
  function realOptions(selectEl) {
    const out = [];
    if (!selectEl || !selectEl.options) return out;
    for (let i = 0; i < selectEl.options.length; i++) {
      const opt = selectEl.options[i];
      const text = (opt.textContent || '').trim();
      const value = String(opt.value || '').trim();
      if (!value && /^(select|choose|please select|--|–|—)/i.test(text)) continue;
      if (/^select\s*[….]{0,3}$/i.test(text)) continue;
      out.push({ index: i, label: text || value });
    }
    return out;
  }

  /**
   * Choose a select option by bucket or level rather than by text similarity.
   */
  function selectByOptionMatch(selectEl, value, kind) {
    const fmt = global.FillApplyFormat;
    if (!fmt || typeof fmt.matchOptionIndex !== 'function') return false;
    const options = realOptions(selectEl);
    if (!options.length) return false;
    const hit = fmt.matchOptionIndex(
      options.map(function (o) {
        return o.label;
      }),
      value,
      kind
    );
    if (!hit) return false;
    selectEl.selectedIndex = options[hit.index].index;
    fireChange(selectEl);
    return true;
  }

  function fireChange(el) {
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_e) {
      /* ignore */
    }
  }

  /** Pick the radio in `el`'s group whose label or value matches `value`. */
  function selectRadioInGroup(el, value, kind) {
    const want = String(value).toLowerCase().trim();
    const group = radioGroupFor(el);
    if (!group.length) return false;

    let best = null;
    let bestScore = 0;
    group.forEach(function (radio) {
      const label = getLabelText(radio).toLowerCase().trim();
      const raw = String(radio.value || '').toLowerCase().trim();
      let score = 0;
      if (raw === want || label === want) score = 100;
      else if (label.indexOf(want) !== -1 || want.indexOf(label) !== -1) score = 70;
      else if (raw.indexOf(want) !== -1) score = 60;
      else if (/^(yes|y)$/i.test(want) && /^(yes|y|true)$/i.test(raw || label)) score = 85;
      else if (/^(no|n)$/i.test(want) && /^(no|n|false)$/i.test(raw || label) && !/not/i.test(label)) {
        score = 85;
      }
      if (score > bestScore) {
        bestScore = score;
        best = radio;
      }
    });

    if (!best || bestScore < 60) {
      // Radio groups carry buckets and levels as often as selects do:
      // "0-2 / 3-5 / 6-9 / 10+" is the same question either way.
      best = radioByOptionMatch(group, value, kind);
      if (!best) return false;
    }
    realClick(best);
    if (!best.checked) {
      best.checked = true;
      fireChange(best);
    }
    return true;
  }

  function radioByOptionMatch(group, value, kind) {
    const fmt = global.FillApplyFormat;
    if (!fmt || typeof fmt.matchOptionIndex !== 'function') return null;
    const labels = group.map(function (radio) {
      return getLabelText(radio) || String(radio.value || '');
    });
    const hit = fmt.matchOptionIndex(labels, value, kind);
    return hit ? group[hit.index] : null;
  }

  function radioGroupFor(el) {
    if (!el) return [];
    const D = dom();
    const name = el.getAttribute && el.getAttribute('name');
    if (name) {
      const escaped = D && D.cssEscape ? D.cssEscape(name) : name;
      const found = queryAll('input[type="radio"][name="' + escaped + '"]');
      if (found.length) return found;
    }
    const container = el.closest ? el.closest('fieldset, [role="radiogroup"], .field, [class*="field"]') : null;
    if (container) {
      try {
        return Array.prototype.slice.call(container.querySelectorAll('input[type="radio"]'));
      } catch (_e) {
        /* ignore */
      }
    }
    return [el];
  }

  function clearHighlights() {
    if (global.FillApplyFocusHud && global.FillApplyFocusHud.clearStatus) {
      global.FillApplyFocusHud.clearStatus();
    }
    queryAll('[' + HIGHLIGHT_ATTR + ']').forEach(function (el) {
      el.removeAttribute(HIGHLIGHT_ATTR);
      el.style.outline = '';
    });
    queryAll('[' + FILLED_ATTR + ']').forEach(function (el) {
      el.removeAttribute(FILLED_ATTR);
      el.style.outline = '';
    });
  }

    function highlight(el, kind) {
    if (kind === 'unmatched') {
      el.setAttribute(HIGHLIGHT_ATTR, '1');
      el.style.outline = '2px solid #f59e0b';
      if (global.FillApplyFocusHud && global.FillApplyFocusHud.markStatus) {
        global.FillApplyFocusHud.markStatus(el, 'unfilled', 'Needs info');
      }
    } else {
      el.setAttribute(FILLED_ATTR, '1');
      el.style.outline = '2px solid #22c55e';
      if (global.FillApplyFocusHud && global.FillApplyFocusHud.markStatus) {
        global.FillApplyFocusHud.markStatus(el, 'filled', 'Filled');
      }
    }
  }

  /**
   * Every fillable control on the page, deduplicated by radio group and with
   * page furniture (search, newsletter, sign-in) filtered out.
   */
  function collectFields(root) {
    const syn = global.FillApplySynonyms;
    const nodes = queryAll('input, textarea, select, [contenteditable="true"]', root);
    const list = [];
    const seenRadioGroups = {};

    nodes.forEach(function (el) {
      if (!isFillable(el)) return;
      if (!isVisible(el)) return;
      if (syn && syn.isSearchLikeField && syn.isSearchLikeField(el)) return;
      if (syn && syn.isInsideLoginForm && syn.isInsideLoginForm(el)) return;

      if (String(el.type || '').toLowerCase() === 'radio') {
        const name = el.getAttribute('name') || '';
        const groupKey = name || 'radio:' + list.length;
        if (seenRadioGroups[groupKey]) return;
        seenRadioGroups[groupKey] = true;
      }
      list.push(el);
    });
    return list;
  }

  /**
   * Catalog every control on the page — the diagnostic view of what the engine
   * can actually see, surfaced in the run report.
   */
  function inspectForm(root) {
    const D = dom();
    const summary = {
      inputs: [],
      textareas: [],
      selects: [],
      contenteditables: [],
      fileInputs: [],
      attachButtons: [],
      customDropdowns: [],
      buttons: [],
      counts: {
        input: 0,
        textarea: 0,
        select: 0,
        contenteditable: 0,
        file: 0,
        attachButton: 0,
        customDropdown: 0,
        button: 0,
        required: 0
      }
    };

    queryAll('input', root).forEach(function (el) {
      const type = String(el.type || 'text').toLowerCase();
      if (type === 'file') {
        summary.fileInputs.push({
          type: type,
          name: el.name || '',
          id: el.id || '',
          accept: el.getAttribute('accept') || '',
          required: isRequiredField(el),
          label: getLabelText(el),
          hidden: !isVisible(el)
        });
        summary.counts.file += 1;
        return;
      }
      if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'image') return;
      const described = D && D.describeField ? D.describeField(el) : { type: type, label: getLabelText(el) };
      summary.inputs.push(described);
      summary.counts.input += 1;
      if (described.required) summary.counts.required += 1;
    });

    queryAll('textarea', root).forEach(function (el) {
      const described = D && D.describeField ? D.describeField(el) : { type: 'textarea', label: getLabelText(el) };
      summary.textareas.push(described);
      summary.counts.textarea += 1;
      if (described.required) summary.counts.required += 1;
    });

    queryAll('select', root).forEach(function (el) {
      const described = D && D.describeField ? D.describeField(el) : { type: 'select', label: getLabelText(el) };
      summary.selects.push(described);
      summary.counts.select += 1;
      if (described.required) summary.counts.required += 1;
    });

    queryAll('[contenteditable="true"], [contenteditable=""]', root).forEach(function (el) {
      summary.contenteditables.push({
        type: 'contenteditable',
        id: el.id || '',
        label: getLabelText(el),
        text: textOf(el).slice(0, 80)
      });
      summary.counts.contenteditable += 1;
    });

    const attachRe = /\b(attach|upload|choose file|browse|select file)\b/i;
    queryAll('button, a, [role="button"], label', root).forEach(function (el) {
      const text = (textOf(el) + ' ' + (el.getAttribute('aria-label') || '')).trim();
      if (!text) return;
      if (attachRe.test(text)) {
        summary.attachButtons.push({ text: text.slice(0, 80), tag: el.tagName });
        summary.counts.attachButton += 1;
      }
      if (summary.buttons.length < 40 && isVisible(el)) {
        summary.buttons.push({ tag: el.tagName, text: text.slice(0, 60), disabled: !!el.disabled });
        summary.counts.button += 1;
      }
    });

    findCustomDropdownTriggers(root).forEach(function (el) {
      summary.customDropdowns.push({
        tag: el.tagName,
        role: el.getAttribute('role') || '',
        label: getLabelText(el) || (el.getAttribute('aria-label') || '').slice(0, 80),
        text: textOf(el).slice(0, 60)
      });
      summary.counts.customDropdown += 1;
    });

    return summary;
  }

  function controlTypeOf(el, descriptor) {
    const C = global.FillApplyKnowledgeCanonical;
    if (C && typeof C.detectControlType === 'function') {
      return C.detectControlType(el, descriptor || {});
    }
    const type = String((descriptor && descriptor.type) || (el && el.type) || '').toLowerCase();
    if (el && el.tagName === 'SELECT') return el.multiple ? 'multiselect' : 'select';
    if (type === 'checkbox' || type === 'radio') return type;
    if (isComboboxInput(el)) return 'combobox';
    return type || 'text';
  }

  function optionsForControl(el, descriptor) {
    if (descriptor && Array.isArray(descriptor.options) && descriptor.options.length) {
      return descriptor.options;
    }
    if (!el || el.tagName !== 'SELECT' || !el.options) return [];
    const out = [];
    for (let i = 0; i < el.options.length; i++) {
      out.push({
        value: el.options[i].value,
        text: (el.options[i].textContent || '').replace(/\s+/g, ' ').trim()
      });
    }
    return out;
  }

  /**
   * Gate: knowledge value+type must be compatible with DOM control+options.
   * Knowledge Type never overrides DOM. Incompatible → do not fill.
   */
  function gateFill(el, descriptor, answer) {
    const C = global.FillApplyKnowledgeCanonical;
    if (!answer || answer.value == null || String(answer.value).trim() === '') {
      return { ok: false, action: 'DO_NOT_FILL', reason: 'empty' };
    }
    if (answer.action === 'DO_NOT_FILL') {
      return { ok: false, action: 'DO_NOT_FILL', reason: answer.reason || 'blocked' };
    }
    const controlType = controlTypeOf(el, descriptor);
    const options = optionsForControl(el, descriptor);
    const knowledgeType = (answer && answer.fieldType) || (C && C.inferFieldType ? C.inferFieldType(el, descriptor) : 'string');
    if (C && typeof C.prepareFillValue === 'function') {
      const prepared = C.prepareFillValue(answer.value, knowledgeType, controlType, options);
      if (!prepared.ok) {
        return {
          ok: false,
          action: 'DO_NOT_FILL',
          reason: prepared.reason,
          controlType: controlType,
          knowledgeType: knowledgeType
        };
      }
      return {
        ok: true,
        action: 'FILL',
        value: prepared.value,
        reason: prepared.reason,
        controlType: controlType,
        knowledgeType: knowledgeType
      };
    }
    // Fallback without canonical helpers.
    // Closed Yes/No: require a boolean-like value. Other selects defer to
    // setNativeValue (variants / ISO codes / buckets) — which still never
    // free-texts when nothing matches.
    if ((controlType === 'select' || controlType === 'multiselect' || controlType === 'radio') && options.length) {
      var labels = options.map(function (o) {
        return String((o && (o.text || o.label || o.value)) || '').trim();
      }).filter(Boolean);
      var real = labels.filter(function (t) {
        return !/^(select|choose|please|--|–|—)/i.test(t);
      });
      var hasYes = real.some(function (t) { return /^(yes|y|true|1)$/i.test(t); });
      var hasNo = real.some(function (t) { return /^(no|n|false|0)$/i.test(t) && !/not sure|unknown/i.test(t); });
      if (hasYes && hasNo && real.length <= 4) {
        if (!/^(yes|no|true|false|y|n|1|0)$/i.test(String(answer.value).trim())) {
          return {
            ok: false,
            action: 'DO_NOT_FILL',
            reason: 'no_matching_option',
            controlType: controlType,
            knowledgeType: knowledgeType
          };
        }
      }
    }
    return { ok: true, action: 'FILL', value: answer.value, controlType: controlType, knowledgeType: knowledgeType };
  }

  function resolveValue(profile, key) {
    if (!key) return '';
    if (key === 'fullName') {
      return (
        profile.fullName ||
        [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
        ''
      );
    }
    const v = profile[key];
    return v == null ? '' : String(v);
  }

  /**
   * Find the answer for a control.
   *
   * When the adaptive resolver is loaded it owns precedence (session →
   * confirmed user knowledge → profile → built-in). Otherwise the original
   * field-map / customAnswers / customQA lookup runs unchanged.
   */
  function answerFor(profile, descriptor, map) {
    const K = global.FillApplyKnowledge;
    if (K && typeof K.resolve === 'function') {
      return K.resolve(profile, descriptor, map);
    }

    const label = descriptor.label || '';
    const labLower = label.toLowerCase();

    let key = map.bestKeyForField(descriptor);
    if (descriptorLooksLikePhoneCountry(descriptor, null) && resolveValue(profile, 'phoneCountry')) {
      key = 'phoneCountry';
    }
    let value = resolveValue(profile, key);
    if (value) return { key: key, value: value, source: 'fieldMap' };

    if (/authoriz|eligible.*work|legally.*work|work.*auth|right to work|permitted to work/.test(labLower)) {
      value = resolveValue(profile, 'authorizedToWork');
      if (value) return { key: 'authorizedToWork', value: value, source: 'workAuth' };
    }
    if (/sponsor|visa|require.*sponsor|need.*sponsor/.test(labLower)) {
      value = resolveValue(profile, 'requiresSponsorship');
      if (value) return { key: 'requiresSponsorship', value: value, source: 'sponsorship' };
    }

    if (label && typeof map.answerForLabel === 'function') {
      const looked = map.answerForLabel(profile, label);
      if (looked && !looked.missing && looked.value) {
        return { key: looked.key || 'customAnswers', value: looked.value, source: looked.source || 'answerForLabel' };
      }
    }

    const qa = map.matchCustomQA(profile.customQA, label, descriptor.placeholder);
    if (qa) return { key: 'customQA', value: qa, source: 'customQA' };

    return { key: key || null, value: '', source: null };
  }

  function markAutofilled(el, value) {
    if (!el || !el.setAttribute) return;
    try {
      el.setAttribute(FILLED_ATTR, '1');
      el.setAttribute(FILLED_VALUE_ATTR, String(value == null ? '' : value).slice(0, 500));
    } catch (_e) { /* ignore */ }
  }

  function isDiversityControl(el, label) {
    if (DIVERSITY_RE.test(String(label || ''))) return true;
    if (!el || !el.closest) return false;
    try {
      const section = el.closest(
        'section, fieldset, [class*="eeo" i], [id*="eeo" i], [class*="demographic" i], [id*="demographic" i], [class*="diversity" i], [class*="self-identif" i]'
      );
      if (!section) return false;
      const heading = section.querySelector('h1, h2, h3, h4, legend, .section-header');
      return DIVERSITY_RE.test(textOf(heading || section).slice(0, 400));
    } catch (_e) {
      return false;
    }
  }

  /* ------------------------------------------------------------------ *
   * Custom dropdowns and comboboxes
   * ------------------------------------------------------------------ */

  const DROPDOWN_TRIGGER_SELECTOR = [
    'button[aria-haspopup="listbox"]',
    '[aria-haspopup="listbox"]',
    '[role="combobox"]',
    'button.select__button',
    '.select-style',
    '[class*="select__control"]',
    '[class*="Select__control"]',
    '[data-testid*="select" i]'
  ].join(', ');

  const OPTION_SELECTOR = [
    '[role="option"]',
    '[role="listbox"] li',
    'ul[role="listbox"] li',
    '.select__option',
    '[class*="select__option"]',
    '[class*="Select__option"]',
    'li[data-value]',
    'div[data-value]',
    '[class*="dropdown"] li',
    '[class*="menu"] [role="menuitem"]'
  ].join(', ');

  function findCustomDropdownTriggers(root) {
    return queryAll(DROPDOWN_TRIGGER_SELECTOR, root).filter(function (el) {
      if (el.tagName === 'SELECT') return false;
      return isVisible(el);
    });
  }

  /** Options currently rendered anywhere on the page, including portals. */
  function visibleOptions() {
    return queryAll(OPTION_SELECTOR).filter(isVisible);
  }

  function scoreOption(optionEl, want) {
    const text = normalizeText(textOf(optionEl));
    const dataValue = normalizeText(optionEl.getAttribute && optionEl.getAttribute('data-value'));
    const target = normalizeText(want);
    if (!target) return 0;
    if (text === target || dataValue === target) return 100;
    if (text.indexOf(target) !== -1) return 80;
    if (target.indexOf(text) !== -1 && text.length > 2) return 70;
    if (dataValue && dataValue.indexOf(target) !== -1) return 60;
    if (/^(yes|y)$/.test(target) && /^(yes|y)$/.test(text)) return 90;
    if (/^(no|n)$/.test(target) && /^(no|n)$/.test(text) && !/not sure/.test(text)) return 90;
    return 0;
  }

  /**
   * Open a custom dropdown and pick the matching option.
   *
   * The wait after opening is the whole point: React renders listbox options on
   * a later tick and usually into a portal at <body>, so querying them in the
   * same tick as the click can never find them.
   */
  async function pickFromDropdown(trigger, value, opts) {
    opts = opts || {};
    const D = dom();
    const want = String(value);
    const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 2500;

    // Country and state listboxes label their options either way round, so an
    // "AE" option still has to be reachable from "United Arab Emirates".
    const wants = [want].concat(selectVariants(want, opts.kind));

    const before = visibleOptions().length;
    realClick(trigger);

    let options = [];
    if (D && D.waitFor) {
      options =
        (await D.waitFor(
          function () {
            const current = visibleOptions();
            return current.length && current.length !== before ? current : null;
          },
          { timeoutMs: timeoutMs, pollMs: 80 }
        )) || [];
    }
    if (!options.length) {
      await sleep(300);
      options = visibleOptions();
    }

    let picked = pickBestOptionAny(options, wants);
    if (!picked) picked = pickByOptionMatch(options, want, opts.kind);

    // Typeahead comboboxes only render matching options once text is entered.
    if (!picked) {
      const input = comboboxInputFor(trigger);
      if (input && D && D.typeInto) {
        await D.typeInto(input, want, { perCharMs: 20 });
        const filtered =
          (await D.waitFor(
            function () {
              const current = visibleOptions();
              return current.length ? current : null;
            },
            { timeoutMs: 2000, pollMs: 80 }
          )) || visibleOptions();
        picked = pickBestOptionAny(filtered, wants);
        if (!picked) picked = pickByOptionMatch(filtered, want, opts.kind);
        if (!picked && filtered.length === 1) picked = filtered[0];
      }
    }

    if (!picked) {
      if (D && D.pressKey) D.pressKey(trigger, 'Escape');
      return { ok: false, reason: 'no_matching_option' };
    }

    realClick(picked);
    await sleep(120);
    return { ok: true, text: textOf(picked).slice(0, 80) };
  }

  function pickBestOption(options, want) {
    let best = null;
    let bestScore = 0;
    for (let i = 0; i < options.length; i++) {
      const score = scoreOption(options[i], want);
      if (score > bestScore) {
        bestScore = score;
        best = options[i];
      }
    }
    return bestScore >= 60 ? best : null;
  }

  function pickBestOptionAny(options, wants) {
    for (let i = 0; i < wants.length; i++) {
      const picked = pickBestOption(options, wants[i]);
      if (picked) return picked;
    }
    return null;
  }

  /** Bucket / level matching over rendered listbox options. */
  function pickByOptionMatch(options, want, kind) {
    const fmt = global.FillApplyFormat;
    if (!fmt || typeof fmt.matchOptionIndex !== 'function' || !options.length) return null;
    const hit = fmt.matchOptionIndex(
      options.map(function (el) {
        return textOf(el);
      }),
      want,
      kind
    );
    return hit ? options[hit.index] : null;
  }

  /** The text input a combobox trigger types into, if it has one. */
  function comboboxInputFor(trigger) {
    if (!trigger) return null;
    if (trigger.tagName === 'INPUT') return trigger;
    let input = null;
    try {
      input = trigger.querySelector('input:not([type="hidden"])');
    } catch (_e) {
      input = null;
    }
    if (input) return input;
    const owns = trigger.getAttribute && (trigger.getAttribute('aria-owns') || trigger.getAttribute('aria-controls'));
    if (owns) {
      const D = dom();
      const escaped = D && D.cssEscape ? D.cssEscape(owns) : owns;
      const panel = queryAll('#' + escaped)[0];
      if (panel) {
        try {
          return panel.querySelector('input:not([type="hidden"])');
        } catch (_e2) {
          return null;
        }
      }
    }
    const container = trigger.closest ? trigger.closest('.field, [class*="field"], [class*="select"]') : null;
    if (container) {
      try {
        return container.querySelector('input:not([type="hidden"])');
      } catch (_e3) {
        return null;
      }
    }
    return null;
  }

  /**
   * Fill custom listbox / combobox widgets (Greenhouse, Ashby, Workday, Lever).
   */
  async function fillCustomDropdowns(profile, map, options) {
    options = options || {};
    const filled = [];
    const triggers = findCustomDropdownTriggers();

    for (let i = 0; i < triggers.length; i++) {
      const trigger = triggers[i];
      const label = (getLabelText(trigger) || trigger.getAttribute('aria-label') || textOf(trigger))
        .replace(/\s+/g, ' ')
        .trim();
      if (!label) continue;
      if (isDiversityControl(trigger, label)) continue;

      const descriptor = {
        label: label,
        name: trigger.getAttribute('name') || '',
        id: trigger.id || '',
        autocomplete: '',
        placeholder: '',
        type: 'select'
      };
      const answer = answerFor(profile, descriptor, map);
      const gate = gateFill(trigger, descriptor, answer);
      if (!answer.value || !gate.ok) continue;

      const fillValue = gate.value != null ? gate.value : answer.value;

      // Already showing the answer — leave it alone.
      const current = normalizeText(textOf(trigger));
      const want = normalizeText(fillValue);
      const isPlaceholder = /select|choose|—|--|please/.test(current);
      if (current === want || (!isPlaceholder && current && current.indexOf(want) !== -1)) {
        filled.push({ label: label, key: answer.key, value: fillValue, already: true });
        continue;
      }

      if (global.FillApplyFocusHud && global.FillApplyFocusHud.mark) {
        global.FillApplyFocusHud.mark(trigger, { scroll: true });
      }

      const fmt = global.FillApplyFormat;
      const result = await pickFromDropdown(
        trigger,
        fillValue,
        Object.assign({}, options, {
          kind: fmt ? fmt.fieldKind(descriptor, answer.key) : null
        })
      );
      if (result.ok) {
        markAutofilled(trigger, fillValue);
        filled.push({ label: label, key: answer.key, value: fillValue, action: 'FILLED' });
      }
    }

    return filled;
  }

  /* ------------------------------------------------------------------ *
   * Documents
   * ------------------------------------------------------------------ */

  /**
   * Put the documents already loaded in the extension onto this page's upload
   * controls. Returns null when the caller supplied none, so a report can tell
   * "nothing to attach" apart from "could not attach".
   */
  async function attachStoredDocuments(options) {
    options = options || {};
    const documents = options.documents;
    const files = global.FillApplyFiles;
    if (!documents || !files) return null;
    if (!documents.resume && !documents.cover) return null;

    const hints = options.fileInputHints || [];
    try {
      if (typeof files.attachDocumentsAsync === 'function') {
        return await files.attachDocumentsAsync(documents, hints, {
          timeoutMs: options.documentWaitMs
        });
      }
      return files.attachDocuments(documents, hints);
    } catch (e) {
      return {
        ok: false,
        attached: [],
        alreadyAttached: [],
        rejected: [],
        errors: [String((e && e.message) || e)],
        pending: ['resume', 'cover'],
        needsManual: true,
        resumeAttached: false,
        coverAttached: false
      };
    }
  }

  /* ------------------------------------------------------------------ *
   * Apply-start
   * ------------------------------------------------------------------ */

  /**
   * Open-application step: on a job overview, click Apply-start once.
   * Allowed in fill, ready, AND submit (opening is not final submit).
   */
  function tryOpenApplication(options) {
    options = options || {};
    if (options.skipApplyStart) return null;
    const syn = global.FillApplySynonyms;
    if (!syn || typeof syn.tryClickApplyStart !== 'function') return null;

    const open = syn.tryClickApplyStart(document, {
      minFields: options.minOpenFormFields
    });
    if (!open || !open.clicked) return null;
    if (open.el && global.FillApplyFocusHud && global.FillApplyFocusHud.mark) {
      global.FillApplyFocusHud.mark(open.el, { scroll: true });
    }

    return {
      ok: true,
      clickedApplyStart: true,
      reDetect: true,
      handedOff: true,
      deferToPageAdapter: true,
      externalApply: false,
      filled: 0,
      unmatched: 0,
      total: 0,
      submitted: false,
      message:
        'Clicked "' +
        (open.text || 'Apply') +
        '" to open the application — waiting to re-detect / fill',
      applyStartText: open.text || '',
      applyStartReason: open.reason || 'clicked'
    };
  }

  /**
   * Click Apply and wait for the form to appear in this same page.
   *
   * Most Apply buttons open a modal or expand a section rather than navigating.
   * Waiting here means one pass fills the form instead of handing back to the
   * runner for a full re-injection round trip.
   */
  async function openApplicationAndWait(options) {
    options = options || {};
    const syn = global.FillApplySynonyms;
    const D = dom();
    const opened = tryOpenApplication(options);
    if (!opened) return { clicked: false, formOpen: false };

    if (!syn || !D || !D.waitFor) return { clicked: true, formOpen: false, opened: opened };

    const appeared = await D.waitFor(
      function () {
        return syn.isApplicationFormOpen(document, options.minOpenFormFields) ? true : null;
      },
      { timeoutMs: options.applyOpenTimeoutMs != null ? options.applyOpenTimeoutMs : 4000, pollMs: 150 }
    );

    return { clicked: true, formOpen: !!appeared, opened: opened };
  }

  /* ------------------------------------------------------------------ *
   * Main entry point
   * ------------------------------------------------------------------ */

  async function run(profile, options) {
    options = options || {};
    profile = profile || {};
    if (global.FillApplyKnowledge && profile.__adaptiveKnowledge) {
      global.FillApplyKnowledge.hydrate(profile.__adaptiveKnowledge);
    }
    const highlightUnmatched = !!options.highlightUnmatched;
    const map = global.FillApplyFieldMap;
    const syn = global.FillApplySynonyms;
    const D = dom();
    if (!map) {
      return { ok: false, error: 'FillApplyFieldMap not loaded', filled: 0, unmatched: 0 };
    }

    // Give a slow SPA a moment to render its form before deciding anything.
    if (D && D.waitFor && syn) {
      await D.waitFor(
        function () {
          if (syn.isApplicationFormOpen(document, options.minOpenFormFields)) return true;
          if (syn.findApplyStartButtons(document).length) return true;
          return null;
        },
        { timeoutMs: options.formWaitMs != null ? options.formWaitMs : 3000, pollMs: 150 }
      );
    }

    let formSignals = syn && syn.scoreApplicationForm ? syn.scoreApplicationForm(document) : null;
    let applyStart = null;

    if (!(formSignals && formSignals.open)) {
      const openResult = await openApplicationAndWait(options);
      if (openResult.clicked) {
        applyStart = openResult.opened;
        if (!openResult.formOpen) {
          // Form did not appear here — the page is probably navigating or
          // handing off. Let the runner re-detect on the destination.
          return applyStart;
        }
        formSignals = syn && syn.scoreApplicationForm ? syn.scoreApplicationForm(document) : formSignals;
      }
    }

    const fields = collectFields();

    if (!fields.length) {
      // A step whose only control is the resume upload is still work we can do.
      const uploadOnly = await attachStoredDocuments(options);
      if (uploadOnly && (uploadOnly.attached.length || uploadOnly.alreadyAttached.length)) {
        return {
          ok: true,
          filled: 0,
          unmatched: 0,
          total: 0,
          submitted: false,
          filesAttached: uploadOnly,
          documentStep: true,
          formSignals: formSignals,
          inspection: summarizeInspection(inspectForm())
        };
      }

      const startButtons = syn && syn.findApplyStartButtons ? syn.findApplyStartButtons(document) : [];
      return {
        ok: false,
        error: startButtons.length
          ? 'Apply button found but the application form did not open'
          : 'No application form fields found on this page',
        filled: 0,
        unmatched: 0,
        total: 0,
        submitted: false,
        filesAttached: uploadOnly,
        formSignals: formSignals,
        inspection: summarizeInspection(inspectForm())
      };
    }

    const inspection = inspectForm();
    clearHighlights();

    // A form with its own country-code control needs the national number in the
    // phone box; one without it needs the full international number.
        const hasPhoneCountryField = fields.some(function (el) {
      const fmt = global.FillApplyFormat;
      const descriptor = D && D.describeField ? D.describeField(el) : legacyDescriptor(el);
      if (descriptorLooksLikePhoneCountry(descriptor, el)) return true;
      return !!fmt && fmt.fieldKind(descriptor, null) === 'phoneCountry';
    });

    let filled = 0;
    let unmatched = 0;
    const details = [];
    const skipped = [];
    const missingRequired = [];
    const unknownFields = [];
    const C = global.FillApplyKnowledgeCanonical;

    function pushUnknown(descriptor, el, reason) {
      const label = descriptor.label || descriptor.question || descriptor.ariaLabel || descriptor.name || descriptor.id || '';
      if (!label) return;
      const controlType = controlTypeOf(el, descriptor);
      const opts = optionsForControl(el, descriptor);
      const identified =
        C && C.resolveFromEvidence && C.buildEvidence
          ? C.resolveFromEvidence(
              C.buildEvidence(
                Object.assign({}, descriptor, { controlType: controlType, options: opts }),
                el
              ),
              { fieldType: controlType }
            )
          : C && C.matchCanonical
            ? C.matchCanonical(descriptor.question || descriptor.label || '', { fieldType: controlType })
            : null;
      const knowledgeType =
        (identified && identified.fieldType) ||
        (C && C.inferFieldType ? C.inferFieldType(el, descriptor) : 'string');
      const row = {
        label: label,
        name: descriptor.name || '',
        id: descriptor.id || '',
        required: !!descriptor.required,
        controlType: controlType,
        knowledgeType: knowledgeType,
        options: opts,
        canonicalKey: (identified && identified.key) || null,
        semanticKey: (identified && (identified.semanticKey || identified.key)) || null,
        matchedEvidence: identified && identified.matchedEvidence,
        candidateKeys: (identified && identified.candidateKeys) || [],
        reason: (identified && identified.ambiguous ? identified.reason : null) || reason || 'unknown'
      };
      unknownFields.push(row);
      if (descriptor.required) {
        missingRequired.push(label);
      }
    }

    for (let i = 0; i < fields.length; i++) {
      const el = fields[i];
      const descriptor = D && D.describeField ? D.describeField(el) : legacyDescriptor(el);
      const label = descriptor.label || '';

      if (shouldSkipDiversity(el, label, profile)) {
        skipped.push({ label: label, reason: 'voluntary_self_identification' });
        continue;
      }

      const type = String(descriptor.type || '').toLowerCase();
      if (type === 'checkbox' && CONSENT_RE.test(label)) {
        // Agreements are the applicant's to make — report, never tick.
        if (!el.checked) {
          skipped.push({ label: label, reason: 'consent_checkbox', required: descriptor.required });
          if (descriptor.required) missingRequired.push(label || 'consent checkbox');
        }
        continue;
      }

      if (isComboboxInput(el)) {
        const answer = answerFor(profile, descriptor, map);
        const gate = gateFill(el, Object.assign({}, descriptor, { type: 'combobox', combobox: true }), answer);
        if (!answer.value || !gate.ok) {
          unmatched += 1;
          pushUnknown(descriptor, el, gate.reason || 'unknown');
          details.push(
            Object.assign(unmatchedDetail(descriptor, gate.reason || 'no_profile_value'), {
              controlType: gate.controlType || 'combobox',
              action: 'DO_NOT_FILL',
              canonicalKey: answer.canonicalKey || null
            })
          );
          highlight(el, 'unmatched');
          continue;
        }
        const fillValue = gate.value != null ? gate.value : answer.value;
        const picked = await pickFromDropdown(el, fillValue, options);
        if (picked.ok) {
          filled += 1;
          markAutofilled(el, fillValue);
          highlight(el, 'filled');
          details.push(
            Object.assign(filledDetail(descriptor, Object.assign({}, answer, { value: fillValue })), {
              controlType: 'combobox',
              action: 'FILLED',
              canonicalKey: answer.canonicalKey || answer.key
            })
          );
        } else {
          // Combobox with no matching option — do NOT free-text force
          unmatched += 1;
          pushUnknown(descriptor, el, 'combobox_no_option');
          details.push(
            Object.assign(unmatchedDetail(descriptor, 'combobox_no_option'), {
              controlType: 'combobox',
              action: 'DO_NOT_FILL',
              canonicalKey: answer.canonicalKey || null
            })
          );
        }
        continue;
      }

      const answer = answerFor(profile, descriptor, map);
      const gate = gateFill(el, descriptor, answer);

      if (!answer.value || !gate.ok) {
        unmatched += 1;
        pushUnknown(descriptor, el, gate.reason || 'unknown');
        highlight(el, 'unmatched');
        details.push(
          Object.assign(unmatchedDetail(descriptor, gate.reason || answer.reason || 'no_profile_value'), {
            controlType: gate.controlType || controlTypeOf(el, descriptor),
            knowledgeType: gate.knowledgeType || answer.fieldType || null,
            action: 'DO_NOT_FILL',
            canonicalKey: answer.canonicalKey || answer.semanticKey || answer.key || null,
            semanticKey: answer.semanticKey || answer.canonicalKey || null,
            selectedKey: answer.semanticKey || answer.canonicalKey || answer.key || null,
            matchedEvidence: answer.matchedEvidence || null,
            candidateKeys: answer.candidateKeys || [],
            source: answer.source || null,
            confidence: answer.confidence != null ? answer.confidence : null,
            reason: gate.reason || answer.reason || 'no_profile_value'
          })
        );
        continue;
      }

      if (global.FillApplyFocusHud && global.FillApplyFocusHud.mark) {
        global.FillApplyFocusHud.mark(el, { scroll: true });
      }

      const fillValue = gate.value != null ? gate.value : answer.value;
      const setOk = setNativeValue(el, fillValue, {
        key: answer.key,
        profile: profile,
        hasPhoneCountryField: hasPhoneCountryField
      });
      if (setOk === false) {
        unmatched += 1;
        pushUnknown(descriptor, el, 'value_rejected');
        details.push(
          Object.assign(unmatchedDetail(descriptor, 'value_rejected'), {
            controlType: gate.controlType,
            action: 'DO_NOT_FILL',
            canonicalKey: answer.canonicalKey || answer.key || null
          })
        );
        highlight(el, 'unmatched');
        continue;
      }

      filled += 1;
      markAutofilled(el, fillValue);
      highlight(el, 'filled');
      details.push(
        Object.assign(filledDetail(descriptor, Object.assign({}, answer, { value: fillValue })), {
          controlType: gate.controlType,
          knowledgeType: gate.knowledgeType || answer.fieldType || null,
          action: 'FILLED',
          canonicalKey: answer.canonicalKey || answer.semanticKey || answer.key || null,
          semanticKey: answer.semanticKey || answer.canonicalKey || null,
          selectedKey: answer.semanticKey || answer.canonicalKey || answer.key || null,
          matchedEvidence: answer.matchedEvidence || null,
          candidateKeys: answer.candidateKeys || [],
          source: answer.source || null,
          confidence: answer.confidence != null ? answer.confidence : null,
          resolution: answer.source || null,
          reason: answer.reason || gate.reason || null
        })
      );

      if (options.pauseBetweenFieldsMs) await sleep(options.pauseBetweenFieldsMs);
    }

    const customFilled = await fillCustomDropdowns(profile, map, options);
    filled += customFilled.filter(function (c) {
      return !c.already;
    }).length;

    // Documents the applicant loaded into the extension go on now, so the
    // upload step never asks them to find the file again.
    const filesAttached = await attachStoredDocuments(options);
    if (filesAttached && filesAttached.needsManual) {
      filesAttached.errors.forEach(function (message) {
        skipped.push({ label: 'document upload', reason: 'document_type_rejected', detail: message });
      });
    }

    const applicationFields = [];
    details.forEach(function (d) {
      if (d && d.ok && (d.label || d.key)) {
        applicationFields.push({ label: d.label || d.key, key: d.key, value: d.value });
      }
    });
    customFilled.forEach(function (c) {
      if (!c) return;
      applicationFields.push({ label: c.label || c.key || 'dropdown', key: c.key || null, value: c.value });
    });

    // Labels for Missing Info UI: ALL unknowns (required + optional), not required-only
    const unknownLabels = [];
    const seenU = {};
    unknownFields.forEach(function (u) {
      const lab = u && u.label;
      if (!lab || seenU[lab]) return;
      seenU[lab] = true;
      unknownLabels.push(lab);
    });

    return {
      ok: true,
      filled: filled,
      unmatched: unmatched,
      total: fields.length,
      details: details,
      skipped: skipped,
      missingRequired: dedupe(missingRequired),
      unknownFields: unknownFields,
      // Prefer rich unknown discovery for Complete Missing Information
      missingProfileFields: unknownLabels.length ? unknownLabels : undefined,
      customDropdownsFilled: customFilled,
      applicationFields: applicationFields,
      applicationReport: { fields: applicationFields, steps: [] },
      filesAttached: filesAttached,
      resumeAttached: !!(filesAttached && filesAttached.resumeAttached),
      coverAttached: !!(filesAttached && filesAttached.coverAttached),
      formSignals: formSignals,
      clickedApplyStart: !!applyStart,
      inspection: summarizeInspection(inspection),
      debugResolutions: details.map(function (d) {
        return C && C.inspectResolution
          ? C.inspectResolution({
              question: d.label || d.question,
              semanticKey: d.semanticKey || d.canonicalKey || d.key,
              canonicalKey: d.canonicalKey || d.semanticKey || d.key,
              knowledgeType: d.knowledgeType || d.fieldType,
              domControlType: d.controlType || d.type,
              controlType: d.controlType || d.type,
              candidateKeys: d.candidateKeys || [],
              selectedKey: d.selectedKey || d.semanticKey || d.canonicalKey || d.key,
              matchedEvidence: d.matchedEvidence || null,
              source: d.source || d.resolution,
              value: d.value,
              resolution: d.resolution || d.source,
              confidence: d.confidence,
              action: d.action || (d.ok ? 'FILLED' : 'DO_NOT_FILL'),
              reason: d.reason
            })
          : d;
      })
    };
  }

  function legacyDescriptor(el) {
    return {
      autocomplete: el.getAttribute('autocomplete') || '',
      name: el.getAttribute('name') || '',
      id: el.id || '',
      label: getLabelText(el),
      question: getLabelText(el),
      ariaLabel: (el.getAttribute('aria-label') || '').trim(),
      groupContext: '',
      placeholder: el.getAttribute('placeholder') || '',
      type: String(el.type || el.tagName || '').toLowerCase(),
      required: isRequiredField(el)
    };
  }

  function filledDetail(descriptor, answer) {
    return {
      ok: true,
      key: answer.key,
      name: descriptor.name || descriptor.id,
      label: descriptor.label || answer.key || descriptor.name || descriptor.id,
      type: descriptor.type,
      required: !!descriptor.required,
      source: answer.source,
      value: String(answer.value).slice(0, 500),
      canonicalKey: answer.canonicalKey || answer.semanticKey || null,
      semanticKey: answer.semanticKey || answer.canonicalKey || null,
      knowledgeType: answer.fieldType || null,
      matchedEvidence: answer.matchedEvidence || null,
      candidateKeys: answer.candidateKeys || [],
      selectedKey: answer.semanticKey || answer.canonicalKey || answer.key || null,
      confidence: answer.confidence,
      action: answer.action || 'FILLED',
      reason: answer.reason || null
    };
  }

  function unmatchedDetail(descriptor, reason) {
    return {
      ok: false,
      key: null,
      name: descriptor.name || descriptor.id || String(descriptor.label || '').slice(0, 40),
      label: descriptor.label || descriptor.name || descriptor.id || '',
      type: descriptor.type,
      required: !!descriptor.required,
      reason: reason || 'no_profile_value',
      action: 'DO_NOT_FILL'
    };
  }

  function dedupe(list) {
    const seen = {};
    return (list || []).filter(function (item) {
      const key = String(item);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function summarizeInspection(inspection) {
    if (!inspection) return null;
    return {
      counts: inspection.counts,
      selectCount: inspection.counts.select,
      fileCount: inspection.counts.file,
      attachButtonCount: inspection.counts.attachButton,
      customDropdownCount: inspection.counts.customDropdown,
      requiredCount: inspection.counts.required,
      buttons: inspection.buttons.slice(0, 12)
    };
  }

  /* ------------------------------------------------------------------ *
   * Navigation
   * ------------------------------------------------------------------ */

  /**
   * Click Next/Continue but never final Submit/Apply (for runMode=ready).
   */
  function clickContinueButtons() {
    const clicked = [];
    const buttons = queryAll(
      'button, input[type="button"], input[type="submit"], a[role="button"], a.button, [role="button"]'
    );
    const syn = global.FillApplySynonyms;
    const continueRe = (syn && syn.CONTINUE_CTA) || /\b(next|continue|save and continue|save & continue)\b/i;
    const isApply = syn && syn.isApplyCta ? syn.isApplyCta : function (t) {
      return /\b(submit application|apply now|apply for this|submit & apply|apply)\b/i.test(t);
    };

    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      if (btn.disabled) continue;
      if (!isVisible(btn)) continue;
      const text = syn && syn.buttonText ? syn.buttonText(btn) : textOf(btn);
      if (!text) continue;
      if (isApply(text) && !continueRe.test(text)) continue;
      if (continueRe.test(text)) {
        if (realClick(btn)) {
          clicked.push(text.slice(0, 40));
          break; // one step at a time
        }
      }
    }
    return clicked;
  }

  /**
   * Click final Submit/Apply when confidently found (runMode=submit).
   */
  function clickSubmitButtons(submitSelector) {
    const syn = global.FillApplySynonyms;

    if (submitSelector) {
      const nodes = queryAll(submitSelector);
      for (let s = 0; s < nodes.length; s++) {
        const btn = nodes[s];
        if (btn && !btn.disabled && isVisible(btn)) {
          if (realClick(btn)) return true;
        }
      }
    }

    const isApply = syn && syn.isApplyCta ? syn.isApplyCta : function (t) {
      return /\b(submit application|submit & apply|apply now|apply for this|send application|apply)\b/i.test(t);
    };
    const buttons = queryAll(
      'button[type="submit"], input[type="submit"], button, input[type="button"], a[role="button"], [role="button"]'
    );
    const formOpen =
      syn && typeof syn.isApplicationFormOpen === 'function' ? syn.isApplicationFormOpen(document) : true;
    const isExcluded =
      syn && syn.isExcludedApplyCta
        ? syn.isExcludedApplyCta
        : function (t) {
            return /\b(auto[- ]?apply|upgrade|subscribe)\b/i.test(t);
          };

    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      if (btn.disabled) continue;
      if (!isVisible(btn)) continue;
      const text = syn && syn.buttonText ? syn.buttonText(btn) : textOf(btn);
      if (isExcluded(text)) continue;
      // If form not open yet, leave Apply-start to tryOpenApplication — do not "submit" overview CTAs
      if (
        !formOpen &&
        syn &&
        syn.isApplyStartCta &&
        syn.isApplyStartCta(text) &&
        !(syn.isFinalSubmitCta && syn.isFinalSubmitCta(text))
      ) {
        continue;
      }
      if (isApply(text) || /submit_app|submit-app|btn-submit|btn-apply/i.test(btn.id + ' ' + btn.className)) {
        if (/\bnext\b|\bcontinue\b/i.test(text) && !/\bsubmit\b|\bapply\b/i.test(text)) continue;
        if (realClick(btn)) return true;
      }
    }
    return false;
  }

  /**
   * Attach one stored document to a specific file input. Adapters that locate
   * their own resume input (Glassdoor, Indeed) call this directly.
   */
  function attachFileInput(input, documents, kind) {
    if (!input || !documents) return false;
    const F = global.FillApplyFiles;
    if (!F || !F.assignFilesToInput || !F.fileFromBase64) return false;
    const doc = documents[kind] || (kind === 'resume' ? documents.resume : documents.cover);
    if (!doc || !doc.base64) return false;
    const file = F.fileFromBase64(
      doc.base64,
      doc.name || (kind === 'cover' ? 'cover-letter.pdf' : 'resume.pdf'),
      doc.mime || 'application/pdf'
    );
    const result = F.assignFilesToInput(input, file);
    return !!(result && result.ok);
  }

  global.__fillApply = {
    isGenderField: isGenderField,
    shouldSkipDiversity: shouldSkipDiversity,
    optionsLookLikeDialCodes: optionsLookLikeDialCodes,
    descriptorLooksLikePhoneCountry: descriptorLooksLikePhoneCountry,
    run: run,
    inspectForm: inspectForm,
    collectFields: collectFields,
    clearHighlights: clearHighlights,
    matchSelectOption: matchSelectOption,
    fillCustomDropdowns: fillCustomDropdowns,
    pickFromDropdown: pickFromDropdown,
    clickContinueButtons: clickContinueButtons,
    clickSubmitButtons: clickSubmitButtons,
    tryOpenApplication: tryOpenApplication,
    openApplicationAndWait: openApplicationAndWait,
    attachFileInput: attachFileInput,
    getLabelText: getLabelText,
    isRequiredField: isRequiredField,
    isComboboxInput: isComboboxInput,
    sanitizeForInput: sanitizeForInput,
    setNativeValue: setNativeValue,
    numericAmount: function (s) {
      if (global.FillApplyProfile && global.FillApplyProfile.numericAmount) {
        return global.FillApplyProfile.numericAmount(s);
      }
      return sanitizeForInput({ type: 'number' }, s).value;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
