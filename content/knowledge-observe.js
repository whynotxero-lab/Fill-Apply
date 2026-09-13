/**
 * Observe explicit applicant input on application fields.
 * Autofill writes are not trusted. Corrections of autofilled values are learned.
 *
 * Attaches globalThis.FillApplyKnowledgeObserve.
 */
(function (global) {
  'use strict';

  var FILLED_ATTR = 'data-fill-apply-filled';
  var VALUE_ATTR = 'data-fill-apply-value';
  var DEBOUNCE_MS = 700;
  var timers = {};
  var started = false;

  function learnApi() {
    return global.FillApplyKnowledgeLearn;
  }

  function canonical() {
    return global.FillApplyKnowledgeCanonical;
  }

  function fillApi() {
    return global.__fillApply;
  }

  function labelFor(el) {
    var fill = fillApi();
    if (fill && typeof fill.getLabelText === 'function') return fill.getLabelText(el);
    var D = global.FillApplyDom;
    if (D && D.labelFor) return D.labelFor(el);
    return (el && el.getAttribute && (el.getAttribute('aria-label') || '')) || '';
  }

  function isSkippable(el) {
    if (!el) return true;
    var type = String(el.type || '').toLowerCase();
    if (type === 'password' || type === 'file' || type === 'hidden' || type === 'submit' || type === 'button') {
      return true;
    }
    return false;
  }

  function readValue(el) {
    var type = String(el.type || '').toLowerCase();
    if (type === 'checkbox') return el.checked ? 'Yes' : 'No';
    if (type === 'radio') {
      if (!el.checked) return '';
      var fill = fillApi();
      var lab = labelFor(el);
      return (el.value && el.value !== 'on' ? el.value : lab) || 'Yes';
    }
    if (el.tagName === 'SELECT' && el.multiple) {
      var picked = [];
      for (var i = 0; i < el.options.length; i++) {
        if (el.options[i].selected) picked.push((el.options[i].textContent || el.options[i].value || '').trim());
      }
      return picked.join('; ');
    }
    if (el.tagName === 'SELECT') {
      var opt = el.options && el.options[el.selectedIndex];
      if (!opt) return String(el.value || '').trim();
      var t = (opt.textContent || '').trim();
      if (/^(select|choose|please select|--)/i.test(t)) return '';
      return t || String(el.value || '').trim();
    }
    if (el.getAttribute && el.getAttribute('contenteditable') === 'true') {
      return String(el.textContent || '').trim();
    }
    return String(el.value || '').trim();
  }

  function hostInfo() {
    var host = '';
    var href = '';
    try {
      host = location.hostname;
      href = location.href;
    } catch (_e) { /* ignore */ }
    return { host: host, url: href };
  }

  function schedule(el) {
    var key = el.id || el.name || labelFor(el) || String(el.tagName);
    if (timers[key]) clearTimeout(timers[key]);
    timers[key] = setTimeout(function () {
      delete timers[key];
      capture(el);
    }, DEBOUNCE_MS);
  }

  function capture(el) {
    if (isSkippable(el)) return;
    var Learn = learnApi();
    if (!Learn || typeof Learn.learn !== 'function') return;
    var C = canonical();
    var label = labelFor(el);
    var value = readValue(el);
    if (!value) return;
    var previous = el.getAttribute && el.getAttribute(VALUE_ATTR);
    var autofilled = !!(el.getAttribute && el.getAttribute(FILLED_ATTR));
    var kind = 'observe';
    if (autofilled && previous != null && String(previous) !== String(value)) kind = 'correct';
    var loc = hostInfo();
    var fieldType = C && C.inferFieldType ? C.inferFieldType(el, { type: el.type, label: label }) : 'text';
    Learn.learn({
      label: label,
      value: value,
      fieldType: fieldType,
      kind: kind,
      host: loc.host,
      url: loc.url,
      previousValue: previous || '',
      autofilled: autofilled && kind === 'correct',
      name: el.getAttribute && el.getAttribute('name'),
      placeholder: el.getAttribute && el.getAttribute('placeholder')
    });
  }

  function onEvent(ev) {
    if (!ev || ev.isTrusted === false) return;
    var el = ev.target;
    if (!el || !el.tagName) return;
    var tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !(el.getAttribute && el.getAttribute('contenteditable') === 'true')) {
      return;
    }
    if (ev.type === 'change' || ev.type === 'blur') schedule(el);
  }

  function start() {
    if (started) return;
    started = true;
    document.addEventListener('change', onEvent, true);
    document.addEventListener('blur', onEvent, true);
  }

  start();

  global.FillApplyKnowledgeObserve = {
    start: start,
    capture: capture,
    readValue: readValue
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
