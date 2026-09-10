/**
 * Generic heuristic fill adapter — wraps content/fill.js (__fillApply) + file attach.
 * Supports runMode: fill | ready | submit.
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
    // Prefer runMode; migrate legacy autoSubmit
    let runMode = ctx.runMode || options.runMode;
    if (!runMode) {
      runMode = ctx.autoSubmit || options.autoSubmit ? 'submit' : 'fill';
    }
    if (['fill', 'ready', 'submit'].indexOf(runMode) === -1) runMode = 'fill';

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

    let filesAttached = {
      ok: true,
      attached: [],
      inputCount: 0,
      resumeAttached: false,
      coverAttached: false
    };
    if (global.FillApplyFiles && typeof global.FillApplyFiles.attachDocuments === 'function') {
      filesAttached = global.FillApplyFiles.attachDocuments(documents, fileInputHints);
    }

    let advanced = false;
    let submitted = false;

    if (runMode === 'ready' || runMode === 'submit') {
      // Navigate multi-step as far as possible (Next/Continue), never final submit in ready
      if (global.__fillApply.clickContinueButtons) {
        const clicked = global.__fillApply.clickContinueButtons();
        advanced = !!(clicked && clicked.length);
      }
    }

    if (runMode === 'submit') {
      if (global.__fillApply.clickSubmitButtons) {
        submitted = !!global.__fillApply.clickSubmitButtons(submitSelector);
      } else {
        const sel =
          submitSelector ||
          'button[type="submit"], input[type="submit"], button[data-qa="btn-submit"], [data-testid="submit"]';
        const btn = document.querySelector(sel);
        if (btn) {
          btn.click();
          submitted = true;
        }
      }
    }

    // Required mapped fields with blank profile answers → high-alert pause (never invent)
    var missingProfileFields = [];
    var P = global.FillApplyFieldMap || global.FillApplyProfile;
    var details = fillResult.details || [];
    for (var di = 0; di < details.length; di++) {
      var d = details[di];
      if (!d || d.ok) continue;
      var lab = d.label || d.name || d.key || '';
      if (!lab) continue;
      // Only pause on fields that look required / known profile keys
      var keyHint = d.key;
      if (keyHint && P && typeof P.isBlank === 'function' && P.isBlank(profile[keyHint])) {
        missingProfileFields.push(keyHint);
        continue;
      }
      if (P && typeof P.answerForLabel === 'function') {
        var looked = P.answerForLabel(profile, lab);
        if (looked && looked.missing && looked.key) {
          missingProfileFields.push(looked.key);
        }
      }
    }
    // Deduplicate
    var seenM = {};
    missingProfileFields = missingProfileFields.filter(function (f) {
      var k = String(f);
      if (seenM[k]) return false;
      seenM[k] = true;
      return true;
    });

    if (missingProfileFields.length && (runMode === 'ready' || runMode === 'submit')) {
      return {
        ok: false,
        adapterId: ctx.adapterId || 'fallback',
        needsHuman: true,
        pauseReason: 'missing_profile_field',
        missingProfileFields: missingProfileFields,
        filled: fillResult.filled || 0,
        unmatched: fillResult.unmatched || 0,
        total: fillResult.total || 0,
        details: details,
        applicationFields: fillResult.applicationFields || [],
        filesAttached: filesAttached,
        resumeAttached: !!(filesAttached && filesAttached.resumeAttached),
        coverAttached: !!(filesAttached && filesAttached.coverAttached),
        runMode: runMode,
        advanced: advanced,
        submitted: false,
        error:
          'Missing profile field(s): ' +
          missingProfileFields.join(', ') +
          ' — fill in Options or on the page, then Resume'
      };
    }

    return {
      ok: !!fillResult.ok,
      adapterId: ctx.adapterId || 'fallback',
      filled: fillResult.filled || 0,
      unmatched: fillResult.unmatched || 0,
      total: fillResult.total || 0,
      details: fillResult.details || [],
      applicationFields: fillResult.applicationFields || [],
      applicationReport: fillResult.applicationReport || null,
      filesAttached: filesAttached,
      resumeAttached: !!(filesAttached && filesAttached.resumeAttached),
      coverAttached: !!(filesAttached && filesAttached.coverAttached),
      inspection: fillResult.inspection || null,
      customDropdownsFilled: fillResult.customDropdownsFilled || [],
      runMode: runMode,
      advanced: advanced,
      submitted: submitted,
      error: fillResult.error || null,
      missingProfileFields: missingProfileFields.length ? missingProfileFields : undefined
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
