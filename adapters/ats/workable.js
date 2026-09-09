/**
 * Workable adapter — detection + known selectors; fill delegates to fallback.
 */
(function (global) {
  'use strict';

  function detect(url, doc) {
    url = String(url || '');
    if (/apply\.workable\.com|jobs\.workable\.com|workable\.com/i.test(url)) return true;
    if (doc && doc.querySelector('[data-ui="application-form"], .job-application, #job-application')) return true;
    return false;
  }

  var adapter = {
    id: 'workable',
    name: 'Workable',
    category: 'ats',
    detect: detect,
    fieldMaps: [],
    submitSelector: 'button[type="submit"], button[data-ui="submit"], [data-ui="application-form"] button[type="submit"]',
    fileInputHints: [
      { kind: 'resume', match: 'resume|cv', selector: 'input[type=file][name*="resume"], input[type=file]' },
      { kind: 'cover', match: 'cover' }
    ],
    fill: function (ctx) {
      var fb = global.FillApplyFallbackAdapter;
      if (!fb) {
        return { ok: false, adapterId: 'workable', error: 'Fallback adapter missing', filled: 0, unmatched: 0, total: 0 };
      }
      return fb.fill(Object.assign({}, ctx, {
        adapterId: 'workable',
        submitSelector: adapter.submitSelector,
        fileInputHints: adapter.fileInputHints,
        fieldMaps: adapter.fieldMaps
      }));
    }
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
})(typeof globalThis !== 'undefined' ? globalThis : self);
