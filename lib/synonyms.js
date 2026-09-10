/**
 * Cross-site label / CTA synonyms for adaptive fill.
 * Same candidate profile; boards rename the same actions (Resume≈CV, Apply≈Apply Now).
 * Attaches globalThis.FillApplySynonyms.
 */
(function (global) {
  'use strict';

  var APPLY_CTA =
    /\b(apply\s*now|apply\s*for\s*this\s*(job|role|position)|apply\s*to\s*this\s*(job|role)|submit\s*(&|and)\s*apply|submit\s*application|submit\s*your\s*application|send\s*application|complete\s*application|apply)\b/i;

  var CONTINUE_CTA =
    /\b(next(\s*step)?|continue|save\s*(&|and)\s*continue|save\s*and\s*next|proceed|review\s*and\s*continue)\b/i;

  var RESUME_FILE =
    /\b(resume|cv|c\.v\.|curriculum\s*vitae|upload\s*resume|upload\s*cv|attach\s*resume|attach\s*cv|upload\s*file)\b|^cv\s*\*?$/i;

  var COVER_FILE =
    /\b(cover\s*letter|covering\s*letter|motivation\s*letter|letter\s*of\s*interest|cover)\b/i;

  var ATTACH_ACTION =
    /\b(attach|upload|browse|drop\s*files|choose\s*file|select\s*file|add\s*file)\b/i;

  /** Sources that typically need a logged-in / complete profile before apply works well. */
  var ACCOUNT_PROFILE_FIRST = [
    'naukrigulf',
    'linkedin',
    'indeed',
    'upwork',
    'bayt',
    'gulftalent',
    'glassdoor',
    'wellfound',
    'angellist',
    'weworkremotely',
    'remoteok',
    'flexjobs'
  ];

  var PAID_SOURCES = ['remoteok', 'weworkremotely', 'flexjobs'];

  function buttonText(el) {
    if (!el) return '';
    return (
      (el.textContent || '') +
      ' ' +
      (el.value || '') +
      ' ' +
      (el.getAttribute('aria-label') || '') +
      ' ' +
      (el.getAttribute('title') || '') +
      ' ' +
      (el.id || '') +
      ' ' +
      (el.className || '')
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isApplyCta(text) {
    return APPLY_CTA.test(String(text || ''));
  }

  function isContinueCta(text) {
    var t = String(text || '');
    if (isApplyCta(t) && !CONTINUE_CTA.test(t)) return false;
    return CONTINUE_CTA.test(t);
  }

  function isResumeLabel(text) {
    return RESUME_FILE.test(String(text || ''));
  }

  function isCoverLabel(text) {
    return COVER_FILE.test(String(text || ''));
  }

  global.FillApplySynonyms = {
    APPLY_CTA: APPLY_CTA,
    CONTINUE_CTA: CONTINUE_CTA,
    RESUME_FILE: RESUME_FILE,
    COVER_FILE: COVER_FILE,
    ATTACH_ACTION: ATTACH_ACTION,
    ACCOUNT_PROFILE_FIRST: ACCOUNT_PROFILE_FIRST,
    PAID_SOURCES: PAID_SOURCES,
    buttonText: buttonText,
    isApplyCta: isApplyCta,
    isContinueCta: isContinueCta,
    isResumeLabel: isResumeLabel,
    isCoverLabel: isCoverLabel
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
