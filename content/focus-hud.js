/**
 * Light focus HUD — outline the element being filled/clicked and scroll into view.
 * Feature flag: fillApply.config.focusHud / runConfig.focusHud (default true).
 * Attaches globalThis.FillApplyFocusHud.
 */
(function (global) {
  'use strict';

  var ATTR = 'data-fill-apply-focus-hud';
  var STYLE_ID = 'fill-apply-focus-hud-style';
  var enabled = true;
  var lastEl = null;

  function ensureStyle() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    try {
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent =
        '[' +
        ATTR +
        ']{outline:2px solid #22c55e !important;outline-offset:2px !important;box-shadow:0 0 0 3px rgba(34,197,94,0.25) !important;transition:outline 0.12s ease,box-shadow 0.12s ease;}';
      (document.head || document.documentElement).appendChild(style);
    } catch (_e) {}
  }

  function setEnabled(on) {
    enabled = on !== false;
    if (!enabled) clear();
  }

  function isEnabled() {
    return enabled !== false;
  }

  function clear() {
    if (typeof document === 'undefined') return;
    try {
      document.querySelectorAll('[' + ATTR + ']').forEach(function (el) {
        el.removeAttribute(ATTR);
      });
    } catch (_e) {}
    lastEl = null;
  }

  function mark(el, opts) {
    if (!enabled || !el) return;
    opts = opts || {};
    ensureStyle();
    try {
      if (lastEl && lastEl !== el) {
        try {
          lastEl.removeAttribute(ATTR);
        } catch (_e0) {}
      }
      el.setAttribute(ATTR, '1');
      lastEl = el;
      if (opts.scroll !== false && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: opts.behavior || 'smooth' });
      }
      if (opts.focus && typeof el.focus === 'function') {
        try {
          el.focus({ preventScroll: true });
        } catch (_e1) {
          try {
            el.focus();
          } catch (_e2) {}
        }
      }
    } catch (_e) {}
  }

  /**
   * Read flag from chrome.storage if available (async); default true.
   */
  function syncFromStorage() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
      chrome.storage.local.get(['fillApply.config', 'fillApply.runConfig'], function (res) {
        var cfg = (res && res['fillApply.config']) || {};
        var run = (res && res['fillApply.runConfig']) || {};
        var flag = cfg.focusHud;
        if (flag == null) flag = run.focusHud;
        setEnabled(flag !== false);
      });
    } catch (_e) {}
  }

  syncFromStorage();

  global.FillApplyFocusHud = {
    ATTR: ATTR,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    clear: clear,
    mark: mark,
    syncFromStorage: syncFromStorage
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
