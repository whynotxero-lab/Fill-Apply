/**
 * Form field detection + fill heuristics + inspectForm.
 * Expects FillApplyFieldMap to be loaded first when injected as files.
 * Exposes globalThis.__fillApply.run(profile, options) and inspectForm.
 */
(function (global) {
  'use strict';

  const HIGHLIGHT_ATTR = 'data-fill-apply-unmatched';
  const FILLED_ATTR = 'data-fill-apply-filled';

  function getLabelText(el) {
    if (!el) return '';
    if (el.id) {
      try {
        const byFor = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (byFor) return byFor.textContent.trim();
      } catch (_e) {
        /* ignore */
      }
    }
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll('input, textarea, select').forEach(function (n) {
        n.remove();
      });
      return clone.textContent.trim();
    }
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      return labelledBy
        .split(/\s+/)
        .map(function (id) {
          const node = document.getElementById(id);
          return node ? node.textContent.trim() : '';
        })
        .filter(Boolean)
        .join(' ');
    }
    const prev = el.previousElementSibling;
    if (prev && /^(LABEL|SPAN|DIV|P|STRONG|LEGEND)$/i.test(prev.tagName)) {
      return prev.textContent.trim();
    }
    // Fieldset legend
    const fs = el.closest('fieldset');
    if (fs) {
      const leg = fs.querySelector('legend');
      if (leg) return leg.textContent.trim();
    }
    return '';
  }

  function isFillable(el) {
    if (!el || el.disabled || el.readOnly) return false;
    if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'image') {
      return false;
    }
    if (el.type === 'file' || el.type === 'password') return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
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
      // Yes/No fuzzy
      else if (/^(yes|y)$/i.test(want) && /^(yes|y|true|1)$/i.test(t + v)) score = 85;
      else if (/^(no|n)$/i.test(want) && /^(no|n|false|0)$/i.test(t + v) && !/not sure|unknown/i.test(t)) {
        score = 85;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestScore >= 60) {
      selectEl.selectedIndex = bestIdx;
      return true;
    }
    return false;
  }

  function setNativeValue(el, value) {
    const tag = el.tagName;
    const type = (el.type || '').toLowerCase();

    if (tag === 'SELECT') {
      const matched = matchSelectOption(el, value);
      if (!matched) {
        el.value = value;
      }
    } else if (type === 'checkbox') {
      const truthy = /^(yes|true|1|on|y)$/i.test(String(value));
      el.checked = truthy;
    } else if (type === 'radio') {
      const want = String(value).toLowerCase();
      const name = el.name;
      if (name) {
        const radios = document.querySelectorAll(
          'input[type="radio"][name="' + CSS.escape(name) + '"]'
        );
        radios.forEach(function (r) {
          const label = getLabelText(r).toLowerCase();
          const rv = String(r.value || '').toLowerCase();
          const hit =
            rv === want ||
            label === want ||
            label.indexOf(want) !== -1 ||
            (/^(yes|y)$/i.test(want) && /^(yes|y)$/i.test(rv + label)) ||
            (/^(no|n)$/i.test(want) && /^(no|n)$/i.test(rv) && !/not/i.test(label));
          r.checked = !!hit;
          if (r.checked) {
            r.dispatchEvent(new Event('input', { bubbles: true }));
            r.dispatchEvent(new Event('change', { bubbles: true }));
            try {
              r.click();
            } catch (_e) {
              /* ignore */
            }
          }
        });
        return;
      }
      el.checked = true;
    } else {
      const proto =
        tag === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, value);
      } else {
        el.value = value;
      }
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function clearHighlights() {
    document.querySelectorAll('[' + HIGHLIGHT_ATTR + ']').forEach(function (el) {
      el.removeAttribute(HIGHLIGHT_ATTR);
      el.style.outline = '';
    });
    document.querySelectorAll('[' + FILLED_ATTR + ']').forEach(function (el) {
      el.removeAttribute(FILLED_ATTR);
      el.style.outline = '';
    });
  }

  function highlight(el, kind) {
    if (kind === 'unmatched') {
      el.setAttribute(HIGHLIGHT_ATTR, '1');
      el.style.outline = '2px solid #f59e0b';
    } else {
      el.setAttribute(FILLED_ATTR, '1');
      el.style.outline = '2px solid #22c55e';
    }
  }

  function collectFields() {
    const nodes = document.querySelectorAll('input, textarea, select');
    const list = [];
    nodes.forEach(function (el) {
      if (!isFillable(el)) return;
      if ((el.type || '').toLowerCase() === 'radio' && el.name) {
        const first = document.querySelector(
          'input[type="radio"][name="' + CSS.escape(el.name) + '"]'
        );
        if (first !== el) return;
      }
      list.push(el);
    });
    return list;
  }

  /**
   * Catalog form controls before filling.
   */
  function inspectForm(doc) {
    doc = doc || document;
    const summary = {
      inputs: [],
      textareas: [],
      selects: [],
      contenteditables: [],
      fileInputs: [],
      attachButtons: [],
      customDropdowns: [],
      counts: {
        input: 0,
        textarea: 0,
        select: 0,
        contenteditable: 0,
        file: 0,
        attachButton: 0,
        customDropdown: 0
      }
    };

    doc.querySelectorAll('input').forEach(function (el) {
      const type = (el.type || 'text').toLowerCase();
      if (type === 'file') {
        summary.fileInputs.push({
          type: type,
          name: el.name || '',
          id: el.id || '',
          accept: el.getAttribute('accept') || '',
          required: !!el.required,
          label: getLabelText(el),
          hidden: el.offsetParent === null || el.hidden
        });
        summary.counts.file += 1;
        return;
      }
      if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'image') return;
      summary.inputs.push({
        type: type,
        name: el.name || '',
        id: el.id || '',
        autocomplete: el.getAttribute('autocomplete') || '',
        label: getLabelText(el),
        required: !!el.required,
        accept: el.getAttribute('accept') || ''
      });
      summary.counts.input += 1;
    });

    doc.querySelectorAll('textarea').forEach(function (el) {
      summary.textareas.push({
        type: 'textarea',
        name: el.name || '',
        id: el.id || '',
        autocomplete: el.getAttribute('autocomplete') || '',
        label: getLabelText(el),
        required: !!el.required
      });
      summary.counts.textarea += 1;
    });

    doc.querySelectorAll('select').forEach(function (el) {
      const options = [];
      for (let i = 0; i < el.options.length; i++) {
        options.push({
          value: el.options[i].value,
          text: (el.options[i].textContent || '').trim()
        });
      }
      summary.selects.push({
        type: 'select',
        name: el.name || '',
        id: el.id || '',
        label: getLabelText(el),
        required: !!el.required,
        options: options
      });
      summary.counts.select += 1;
    });

    doc.querySelectorAll('[contenteditable="true"], [contenteditable=""]').forEach(function (el) {
      summary.contenteditables.push({
        type: 'contenteditable',
        id: el.id || '',
        label: getLabelText(el),
        text: (el.textContent || '').slice(0, 80)
      });
      summary.counts.contenteditable += 1;
    });

    const attachRe = /\b(attach|upload|choose file|browse|select file)\b/i;
    doc.querySelectorAll('button, a, [role="button"], label').forEach(function (el) {
      const text = ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')).trim();
      if (attachRe.test(text)) {
        summary.attachButtons.push({ text: text.slice(0, 80), tag: el.tagName });
        summary.counts.attachButton += 1;
      }
    });

    doc
      .querySelectorAll(
        '[role="listbox"], [role="combobox"], button[aria-haspopup="listbox"], [aria-haspopup="listbox"], [class*="select"], [class*="dropdown"]'
      )
      .forEach(function (el) {
        if (el.tagName === 'SELECT') return;
        summary.customDropdowns.push({
          tag: el.tagName,
          role: el.getAttribute('role') || '',
          label: getLabelText(el) || (el.getAttribute('aria-label') || '').slice(0, 80),
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
        });
        summary.counts.customDropdown += 1;
      });

    return summary;
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
   * Fill custom listbox/combobox widgets (Greenhouse-style).
   */
  function fillCustomDropdowns(profile, map) {
    const filled = [];
    const triggers = document.querySelectorAll(
      'button[aria-haspopup="listbox"], [role="combobox"], [aria-haspopup="listbox"], button.select__button, .select-style, [class*="select__control"], [data-testid*="select"]'
    );

    triggers.forEach(function (trigger) {
      const label = (
        getLabelText(trigger) ||
        trigger.getAttribute('aria-label') ||
        (trigger.textContent || '')
      )
        .replace(/\s+/g, ' ')
        .trim();
      if (!label) return;

      let value = '';
      const labLower = label.toLowerCase();

      if (
        /authoriz|eligible.*work|legally.*work|work.*auth|right to work|permitted to work/.test(
          labLower
        )
      ) {
        value = profile.authorizedToWork || 'Yes';
      } else if (/sponsor|visa|require.*sponsor|need.*sponsor/.test(labLower)) {
        value = profile.requiresSponsorship || 'No';
      } else if (map) {
        const key = map.bestKeyForField({
          label: label,
          name: '',
          id: trigger.id || '',
          autocomplete: '',
          placeholder: '',
          type: 'select'
        });
        value = resolveValue(profile, key);
        if (!value) {
          value = map.matchCustomQA(profile.customQA, label, '') || '';
        }
      }

      if (!value) {
        // customQA fallback by label
        if (map && map.matchCustomQA) {
          value = map.matchCustomQA(profile.customQA, label, '') || '';
        }
      }
      if (!value) return;

      // Skip if already showing the answer
      const current = (trigger.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (current === String(value).toLowerCase()) {
        filled.push({ label: label, value: value, already: true });
        return;
      }
      if (!/select|choose|—|--|please/i.test(current) && current.indexOf(String(value).toLowerCase()) !== -1) {
        filled.push({ label: label, value: value, already: true });
        return;
      }

      try {
        trigger.click();
      } catch (_e) {
        return;
      }

      // Options may appear immediately or shortly after
      const want = String(value).toLowerCase();
      const optionSelectors = [
        '[role="option"]',
        '[role="listbox"] li',
        '[role="listbox"] [role="option"]',
        'ul[role="listbox"] li',
        '.select__option',
        '[class*="option"]',
        'li[data-value]',
        'div[data-value]'
      ];

      let clicked = false;
      for (let s = 0; s < optionSelectors.length && !clicked; s++) {
        const opts = document.querySelectorAll(optionSelectors[s]);
        for (let i = 0; i < opts.length; i++) {
          const t = (opts[i].textContent || '').replace(/\s+/g, ' ').trim();
          const tLower = t.toLowerCase();
          const vAttr = String(opts[i].getAttribute('data-value') || '').toLowerCase();
          if (
            tLower === want ||
            vAttr === want ||
            tLower.indexOf(want) !== -1 ||
            (/^(yes|y)$/i.test(want) && /^(yes|y)$/i.test(t)) ||
            (/^(no|n)$/i.test(want) && /^(no|n)$/i.test(t) && !/not sure/i.test(t))
          ) {
            try {
              opts[i].click();
              clicked = true;
              filled.push({ label: label, value: value });
              break;
            } catch (_e2) {
              /* ignore */
            }
          }
        }
      }

      // Close if we opened but didn't match — press Escape
      if (!clicked) {
        try {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        } catch (_e3) {
          /* ignore */
        }
      }
    });

    return filled;
  }

  function run(profile, options) {
    options = options || {};
    const highlightUnmatched = !!options.highlightUnmatched;
    const map = global.FillApplyFieldMap;
    if (!map) {
      return { ok: false, error: 'FillApplyFieldMap not loaded', filled: 0, unmatched: 0 };
    }

    const inspection = inspectForm(document);
    clearHighlights();

    const fields = collectFields();
    let filled = 0;
    let unmatched = 0;
    const details = [];

    fields.forEach(function (el) {
      const descriptor = {
        autocomplete: el.getAttribute('autocomplete') || el.autocomplete || '',
        name: el.getAttribute('name') || '',
        id: el.id || '',
        label: getLabelText(el),
        placeholder: el.getAttribute('placeholder') || '',
        type: (el.type || el.tagName || '').toLowerCase()
      };

      let key = map.bestKeyForField(descriptor);
      let value = resolveValue(profile, key);

      // Work auth / sponsorship from profile fields via label heuristics
      if (!value) {
        const lab = (descriptor.label || '').toLowerCase();
        if (/authoriz|eligible.*work|legally.*work|work.*auth|right to work/.test(lab)) {
          key = 'authorizedToWork';
          value = resolveValue(profile, key) || 'Yes';
        } else if (/sponsor|visa|require.*sponsor|need.*sponsor/.test(lab)) {
          key = 'requiresSponsorship';
          value = resolveValue(profile, key) || 'No';
        }
      }

      if (!value) {
        const qa = map.matchCustomQA(profile.customQA, descriptor.label, descriptor.placeholder);
        if (qa) {
          key = 'customQA';
          value = qa;
        }
      }

      if (value) {
        setNativeValue(el, value);
        filled += 1;
        if (highlightUnmatched) highlight(el, 'filled');
        details.push({
          key: key,
          name: descriptor.name || descriptor.id,
          label: descriptor.label || key || descriptor.name || descriptor.id,
          value: String(value).slice(0, 500),
          ok: true
        });
      } else {
        unmatched += 1;
        if (highlightUnmatched) highlight(el, 'unmatched');
        details.push({
          key: null,
          name: descriptor.name || descriptor.id || descriptor.label.slice(0, 40),
          label: descriptor.label || descriptor.name || descriptor.id || '',
          value: null,
          ok: false
        });
      }
    });

    // Custom dropdowns (Greenhouse often uses these for Yes/No)
    const customFilled = fillCustomDropdowns(profile, map);
    filled += customFilled.length;

    const applicationFields = [];
    details.forEach(function (d) {
      if (d && d.ok && (d.label || d.key)) {
        applicationFields.push({
          label: d.label || d.key,
          key: d.key,
          value: d.value
        });
      }
    });
    customFilled.forEach(function (c) {
      if (!c) return;
      applicationFields.push({
        label: c.label || c.key || 'dropdown',
        key: c.key || null,
        value: c.value
      });
    });

    return {
      ok: true,
      filled: filled,
      unmatched: unmatched,
      total: fields.length,
      details: details,
      customDropdownsFilled: customFilled,
      applicationFields: applicationFields,
      applicationReport: {
        fields: applicationFields,
        steps: []
      },
      inspection: {
        counts: inspection.counts,
        selectCount: inspection.counts.select,
        fileCount: inspection.counts.file,
        attachButtonCount: inspection.counts.attachButton,
        customDropdownCount: inspection.counts.customDropdown
      }
    };
  }

  /**
   * Click Next/Continue but never final Submit/Apply (for runMode=ready).
   */
  function clickContinueButtons() {
    const clicked = [];
    const buttons = document.querySelectorAll(
      'button, input[type="button"], input[type="submit"], a[role="button"], a.button'
    );
    const syn = global.FillApplySynonyms;
    const continueRe = (syn && syn.CONTINUE_CTA) || /\b(next|continue|save and continue|save & continue)\b/i;
    const isApply = syn && syn.isApplyCta ? syn.isApplyCta : function (t) {
      return /\b(submit application|apply now|apply for this|submit & apply|apply)\b/i.test(t);
    };

    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      if (btn.disabled) continue;
      const text = syn && syn.buttonText ? syn.buttonText(btn) : (
        (btn.textContent || '') + ' ' + (btn.value || '') + ' ' + (btn.getAttribute('aria-label') || '')
      ).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (isApply(text) && !continueRe.test(text)) continue;
      if (continueRe.test(text)) {
        try {
          btn.click();
          clicked.push(text.slice(0, 40));
          break; // one step at a time
        } catch (_e) {
          /* ignore */
        }
      }
    }
    return clicked;
  }

  /**
   * Click final Submit/Apply when confidently found (runMode=submit).
   */
  function clickSubmitButtons(submitSelector) {
    if (submitSelector) {
      try {
        const nodes = document.querySelectorAll(submitSelector);
        for (let s = 0; s < nodes.length; s++) {
          const btn = nodes[s];
          if (btn && !btn.disabled) {
            btn.click();
            return true;
          }
        }
      } catch (_e) {
        /* ignore */
      }
    }
    const syn = global.FillApplySynonyms;
    const isApply = syn && syn.isApplyCta ? syn.isApplyCta : function (t) {
      return /\b(submit application|submit & apply|apply now|apply for this|send application|apply)\b/i.test(t);
    };
    const buttons = document.querySelectorAll(
      'button[type="submit"], input[type="submit"], button, input[type="button"], a[role="button"]'
    );
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      if (btn.disabled) continue;
      const text = syn && syn.buttonText ? syn.buttonText(btn) : (
        (btn.textContent || '') + ' ' + (btn.value || '') + ' ' + (btn.getAttribute('aria-label') || '') + ' ' + (btn.id || '')
      ).replace(/\s+/g, ' ').trim();
      if (isApply(text) || /submit_app|submit-app|btn-submit|btn-apply/i.test(btn.id + ' ' + btn.className)) {
        if (/\bnext\b|\bcontinue\b/i.test(text) && !/\bsubmit\b|\bapply\b/i.test(text)) continue;
        try {
          btn.click();
          return true;
        } catch (_e2) {
          /* ignore */
        }
      }
    }
    return false;
  }

  global.__fillApply = {
    run: run,
    inspectForm: inspectForm,
    clearHighlights: clearHighlights,
    matchSelectOption: matchSelectOption,
    fillCustomDropdowns: fillCustomDropdowns,
    clickContinueButtons: clickContinueButtons,
    clickSubmitButtons: clickSubmitButtons,
    getLabelText: getLabelText
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
