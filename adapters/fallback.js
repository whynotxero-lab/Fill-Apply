/**
 * Generic heuristic fill adapter — wraps content/fill.js (__fillApply) + file attach.
 * Always detects (last resort). Other ATS stubs can override selectors then delegate here.
 */
(function (global) {
  'use strict';

  function detect(_url, _doc) {
    return true;
  }

  function fill(ctx) {
    ctx = ctx || {};
    const profile = ctx.profile || {};
    const options = ctx.options || {};
    const documents = ctx.documents || {};
    const fieldMaps = ctx.fieldMaps || null;
    const fileInputHints = ctx.fileInputHints || [];
    const submitSelector = ctx.submitSelector || null;
    const autoSubmit = !!ctx.autoSubmit;

    if (!global.__fillApply || typeof global.__fillApply.run !== 'function') {
      return {
        ok: false,
        adapterId: 'fallback',
        filled: 0,
        unmatched: 0,
        total: 0,
        error: 'Fill engine (__fillApply) not loaded'
      };
    }

    // Optional field-map overrides from a thin ATS adapter
    if (fieldMaps && global.FillApplyFieldMap && Array.isArray(fieldMaps)) {
      try {
        fieldMaps.forEach(function (entry) {
          if (entry && entry.key) global.FillApplyFieldMap.FIELD_MAP.push(entry);
        });
      } catch (_e) {
        /* ignore */
      }
    }

    const fillResult = global.__fillApply.run(profile, {
      highlightUnmatched: !!options.highlightUnmatched
    });

    let filesAttached = { ok: true, attached: [], inputCount: 0 };
    if (global.FillApplyFiles && typeof global.FillApplyFiles.attachDocuments === 'function') {
      filesAttached = global.FillApplyFiles.attachDocuments(documents, fileInputHints);
    }

    let submitted = false;
    if (autoSubmit) {
      const sel =
        submitSelector ||
        'button[type="submit"], input[type="submit"], button[data-qa="btn-submit"], [data-testid="submit"]';
      const btn = document.querySelector(sel);
      if (btn) {
        btn.click();
        submitted = true;
      }
    }

    return {
      ok: !!fillResult.ok,
      adapterId: ctx.adapterId || 'fallback',
      filled: fillResult.filled || 0,
      unmatched: fillResult.unmatched || 0,
      total: fillResult.total || 0,
      details: fillResult.details || [],
      filesAttached: filesAttached,
      submitted: submitted,
      error: fillResult.error || null
    };
  }

  const adapter = {
    id: 'fallback',
    name: 'Generic fallback',
    detect: detect,
    fieldMaps: null,
    submitSelector:
      'button[type="submit"], input[type="submit"], button[data-qa="btn-submit"]',
    fileInputHints: [
      { kind: 'resume', match: 'resume|cv|curriculum' },
      { kind: 'cover', match: 'cover|letter' }
    ],
    fill: fill
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
  global.FillApplyFallbackAdapter = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : self);
