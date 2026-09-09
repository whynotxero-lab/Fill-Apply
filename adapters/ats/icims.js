/**
 * iCIMS adapter — detection + known selectors; fill delegates to fallback.
 */
(function (global) {
  'use strict';

  function detect(url, doc) {
    url = String(url || '');
    if (/icims\.com/i.test(url)) return true;
    if (doc && doc.querySelector('.iCIMS_JobForm, #icims_content_iframe, [class*="iCIMS"]')) return true;
    return false;
  }

  var adapter = {
    id: 'icims',
    name: 'iCIMS',
    category: 'ats',
    detect: detect,
    fieldMaps: [],
    submitSelector: 'input[type="submit"], button[type="submit"], .iCIMS_SubmitButton',
    fileInputHints: [
      { kind: 'resume', match: 'resume|cv' },
      { kind: 'cover', match: 'cover' }
    ],
    fill: function (ctx) {
      var fb = global.FillApplyFallbackAdapter;
      if (!fb) {
        return { ok: false, adapterId: 'icims', error: 'Fallback adapter missing', filled: 0, unmatched: 0, total: 0 };
      }
      return fb.fill(Object.assign({}, ctx, {
        adapterId: 'icims',
        submitSelector: adapter.submitSelector,
        fileInputHints: adapter.fileInputHints,
        fieldMaps: adapter.fieldMaps
      }));
    }
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
})(typeof globalThis !== 'undefined' ? globalThis : self);
