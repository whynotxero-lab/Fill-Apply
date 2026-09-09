/**
 * Greenhouse adapter — boards.greenhouse.io, job-boards.greenhouse.io, *.greenhouse.io.
 * Hardened file attach (Attach button + hidden input) and custom Yes/No dropdowns.
 */
(function (global) {
  'use strict';

  function detect(url, doc) {
    url = String(url || '');
    if (
      /boards\.greenhouse\.io|job-boards\.greenhouse\.io|greenhouse\.io/i.test(url)
    ) {
      return true;
    }
    if (
      doc &&
      (doc.querySelector(
        '#application-form, #greenhouse-job-application, [data-provides="greenhouse"], form#application, #main_fields, .application--container'
      ) ||
        /greenhouse/i.test((doc.body && doc.body.className) || ''))
    ) {
      return true;
    }
    return false;
  }

  function makeFile(Files, doc, fallbackName) {
    if (!Files || !doc || !doc.base64) return null;
    return Files.fileFromBase64(
      doc.base64,
      doc.name || fallbackName,
      doc.mime || 'application/pdf'
    );
  }

  /**
   * Greenhouse-specific file attach: known IDs + Attach buttons + hidden inputs.
   */
  function attachGreenhouseFiles(documents) {
    const Files = global.FillApplyFiles;
    if (!Files) {
      return {
        ok: false,
        attached: [],
        errors: ['FillApplyFiles missing'],
        resumeAttached: false,
        coverAttached: false,
        inputCount: 0
      };
    }

    const hints = [
      {
        kind: 'resume',
        match: 'resume|cv|curriculum',
        selector:
          'input[type=file]#resume, input[type=file][name="resume"], input[type=file][name*="resume"], input[type=file][name*="job_application[resume]"]'
      },
      {
        kind: 'cover',
        match: 'cover',
        selector:
          'input[type=file]#cover_letter, input[type=file][name="cover_letter"], input[type=file][name*="cover"], input[type=file][name*="job_application[cover"]'
      }
    ];

    const resumeFile = makeFile(Files, documents && documents.resume, 'resume.pdf');
    const coverFile = makeFile(Files, documents && documents.cover, 'cover-letter.pdf');
    const directAttached = [];

    function tryDirect(sel, file, kind) {
      if (!file) return null;
      let el = null;
      try {
        el = document.querySelector(sel);
      } catch (_e) {
        return null;
      }
      if (!el || String(el.type || '').toLowerCase() !== 'file') return null;
      const r = Files.assignFilesToInput(el, file);
      if (r && r.ok) return { kind: kind, name: file.name };
      return null;
    }

    const resumeDirect =
      tryDirect('#resume', resumeFile, 'resume') ||
      tryDirect('input[type=file][name="job_application[resume]"]', resumeFile, 'resume') ||
      tryDirect('input[type=file][name*="resume"]', resumeFile, 'resume');
    if (resumeDirect) directAttached.push(resumeDirect);

    const coverDirect =
      tryDirect('#cover_letter', coverFile, 'cover') ||
      tryDirect(
        'input[type=file][name="job_application[cover_letter]"]',
        coverFile,
        'cover'
      ) ||
      tryDirect('input[type=file][name*="cover"]', coverFile, 'cover');
    if (coverDirect) directAttached.push(coverDirect);

    const generic = Files.attachDocuments(documents || {}, hints);

    const resumeAttached =
      !!resumeDirect || !!(generic && generic.resumeAttached);
    const coverAttached =
      !!coverDirect || !!(generic && generic.coverAttached);

    const attached = (generic && generic.attached ? generic.attached.slice() : []).slice();
    directAttached.forEach(function (a) {
      if (
        !attached.some(function (x) {
          return x.kind === a.kind;
        })
      ) {
        attached.push(a);
      }
    });

    return {
      ok: (generic && generic.ok !== false) || attached.length > 0,
      attached: attached,
      errors: (generic && generic.errors) || [],
      inputCount: (generic && generic.inputCount) || 0,
      resumeAttached: resumeAttached,
      coverAttached: coverAttached
    };
  }

  const adapter = {
    category: 'ats',
    id: 'greenhouse',
    name: 'Greenhouse',
    detect: detect,
    fieldMaps: [],
    submitSelector:
      'input[type="submit"]#submit_app, #submit_app, button[type="submit"], input[type="submit"], button.btn-submit',
    fileInputHints: [
      {
        kind: 'resume',
        match: 'resume|cv',
        selector: 'input[type=file]#resume, input[type=file][name*="resume"]'
      },
      {
        kind: 'cover',
        match: 'cover',
        selector: 'input[type=file]#cover_letter, input[type=file][name*="cover"]'
      }
    ],
    fill: function (ctx) {
      ctx = ctx || {};
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

      // 1) Attach files FIRST (before any continue/submit in fallback)
      const filesAttached = attachGreenhouseFiles(ctx.documents || {});

      // 2) Text / select / custom dropdown fill + mode navigation via fallback
      //    Pass empty documents so fallback does not double-attach; we already did.
      const result = fb.fill(
        Object.assign({}, ctx, {
          adapterId: 'greenhouse',
          submitSelector: adapter.submitSelector,
          fileInputHints: adapter.fileInputHints,
          fieldMaps: adapter.fieldMaps,
          documents: {}
        })
      );

      result.filesAttached = filesAttached;
      result.resumeAttached = !!filesAttached.resumeAttached;
      result.coverAttached = !!filesAttached.coverAttached;
      result.adapterId = 'greenhouse';
      return result;
    }
  };

  if (global.FillApplyRegistry) global.FillApplyRegistry.register(adapter);
  global.FillApply_greenhouseAdapter = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : self);
