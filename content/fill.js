/**
 * Form field detection + fill heuristics.
 * Expects FillApplyFieldMap to be loaded first when injected as files.
 * Exposes globalThis.__fillApply.run(profile, options).
 */
(function (global) {
  'use strict';

  const HIGHLIGHT_ATTR = 'data-fill-apply-unmatched';
  const FILLED_ATTR = 'data-fill-apply-filled';

  function getLabelText(el) {
    if (el.id) {
      const byFor = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (byFor) return byFor.textContent.trim();
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
    // Nearby preceding text / legend
    const prev = el.previousElementSibling;
    if (prev && /^(LABEL|SPAN|DIV|P|STRONG)$/i.test(prev.tagName)) {
      return prev.textContent.trim();
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

  function setNativeValue(el, value) {
    const tag = el.tagName;
    const type = (el.type || '').toLowerCase();

    if (tag === 'SELECT') {
      const want = String(value).toLowerCase();
      let matched = false;
      for (let i = 0; i < el.options.length; i++) {
        const opt = el.options[i];
        const t = (opt.textContent || '').trim().toLowerCase();
        const v = String(opt.value || '').toLowerCase();
        if (t === want || v === want || t.includes(want) || want.includes(t)) {
          el.selectedIndex = i;
          matched = true;
          break;
        }
      }
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
        const radios = document.querySelectorAll('input[type="radio"][name="' + CSS.escape(name) + '"]');
        radios.forEach(function (r) {
          const label = getLabelText(r).toLowerCase();
          const rv = String(r.value || '').toLowerCase();
          r.checked = rv === want || label === want || label.includes(want);
          if (r.checked) {
            r.dispatchEvent(new Event('input', { bubbles: true }));
            r.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        return;
      }
      el.checked = true;
    } else {
      // React/framework-friendly value setter
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
      // Skip already-handled radios of same name except first
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

  function run(profile, options) {
    options = options || {};
    const highlightUnmatched = !!options.highlightUnmatched;
    const map = global.FillApplyFieldMap;
    if (!map) {
      return { ok: false, error: 'FillApplyFieldMap not loaded', filled: 0, unmatched: 0 };
    }

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
        details.push({ key: key, name: descriptor.name || descriptor.id, ok: true });
      } else {
        unmatched += 1;
        if (highlightUnmatched) highlight(el, 'unmatched');
        details.push({
          key: null,
          name: descriptor.name || descriptor.id || descriptor.label.slice(0, 40),
          ok: false
        });
      }
    });

    return {
      ok: true,
      filled: filled,
      unmatched: unmatched,
      total: fields.length,
      details: details
    };
  }

  global.__fillApply = {
    run: run,
    clearHighlights: clearHighlights
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
