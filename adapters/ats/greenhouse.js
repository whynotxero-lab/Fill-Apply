/**
 * Greenhouse adapter stub — honest detection + known selectors; fill delegates to fallback.
 */
(function (global) {
  'use strict';

  function detect(url, doc) {
    url = String(url || '');
    if (/boards\.greenhouse\.io|greenhouse\.io|job-boards\.greenhouse\.io/i.test(url)) return true;
    if (
      doc &&
      (doc.querySelector('#application-form, #greenhouse-job-application, [data-provides="greenhouse"]') ||
        /greenhouse/i.test((doc.body && doc.body.className) || ''))
    ) {
      return true;
    }
    return false;
  }

  const adapter = {
    category: 'ats',
    id: 'greenhouse',
    name: 'Greenhouse',
    detect: detect,
    fieldMaps: [],
    submitSelector: 'input[type="submit"], #submit_app, button[type="submit"]',
    fileInputHints: [
      { kind: 'resume', match: 'resume|cv', selector: 'input[type=file]#resume, input[type=file][name*="resume"]' },
      { kind: 'cover', match: 'cover', selector: 'input[type=file]#cover_letter, input[type=file][name*="cover"]' }
    ],
    fill: function (ctx) {
      const fb = global.FillApplyFallbackAdapter;
      if (!fb) {
        return {
          ok: false,
          adapterId: 'greenhouse',
          error: 'Fallback adapter missing',
          filled: 0,
          unmatched: 0,
          total: 0
        };
      }
      return fb.fill(
        Object.assign({}, ctx, {
          adapterId: 'greenhouse',
          submitSelector: adapter.submitSelector,
          fileInputHints: adapter.fileInputHints,
          fieldMaps: adapter.fieldMaps
        })
      );
    }
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
  global.FillApply_greenhouseAdapter = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : self);
