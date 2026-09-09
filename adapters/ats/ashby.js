/**
 * Ashby adapter stub — honest detection + known selectors; fill delegates to fallback.
 */
(function (global) {
  'use strict';

  function detect(url, doc) {
    url = String(url || '');
    if (/jobs\.ashbyhq\.com|ashbyhq\.com/i.test(url)) return true;
    if (doc && doc.querySelector('[data-ashby-root], #ashby_application_form, .ashby-application-form')) {
      return true;
    }
    return false;
  }

  const adapter = {
    category: 'ats',
    id: 'ashby',
    name: 'Ashby',
    detect: detect,
    fieldMaps: [],
    submitSelector: 'button[type="submit"], button[class*="submit"]',
    fileInputHints: [
      { kind: 'resume', match: 'resume|cv' },
      { kind: 'cover', match: 'cover' }
    ],
    fill: function (ctx) {
      const fb = global.FillApplyFallbackAdapter;
      if (!fb) {
        return {
          ok: false,
          adapterId: 'ashby',
          error: 'Fallback adapter missing',
          filled: 0,
          unmatched: 0,
          total: 0
        };
      }
      return fb.fill(
        Object.assign({}, ctx, {
          adapterId: 'ashby',
          submitSelector: adapter.submitSelector,
          fileInputHints: adapter.fileInputHints,
          fieldMaps: adapter.fieldMaps
        })
      );
    }
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
  global.FillApply_ashbyAdapter = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : self);
