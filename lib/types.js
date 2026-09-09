/**
 * Shared shape documentation + constants for Fill & Apply.
 * Vanilla JS — types are JSDoc / runtime constants only (no TypeScript).
 *
 * Job:        { id, title, company, url, status, attempts, lastError?, result?,
 *               updatedAt, ats?, meta?, needsAttention? }
 * Profile:    see FillApplyProfile.DEFAULT_PROFILE (phoneCountry, postcode, street, customAnswers)
 * Adapter:    { id, name, detect(url, document), fieldMaps?, submitSelector?,
 *               fileInputHints?, fill?(ctx) }
 * FillResult: { ok, adapterId, filled, unmatched, total, filesAttached?,
 *               resumeAttached?, coverAttached?, submitted?, advanced?,
 *               needsHuman?, challenge?, pauseReason?, inspection?, details?, error? }
 * RunConfig:  { delayMs, runMode, mockMode, backendBaseUrl, autoCloseAppliedTab }
 *   runMode:  'fill' | 'ready' | 'submit'
 * DocumentBlob: { name, mime, base64 }
 * Queues:     queued | applied | failed | cancelled
 * Pause:      pausedForHuman — Cloudflare/CAPTCHA / Indeed structure drift
 */
(function (global) {
  'use strict';

  const STORAGE_KEYS = {
    profile: 'fillApply.profile',
    runConfig: 'fillApply.runConfig',
    running: 'fillApply.running',
    pausedForHuman: 'fillApply.pausedForHuman',
    sessionLog: 'fillApply.sessionLog',
    documents: 'fillApply.documents',
    queueStatus: 'fillApply.queueStatus',
    mockQueue: 'fillApply.mockQueue',
    mockQueueUrls: 'fillApply.mockQueueUrls',
    queued: 'fillApply.queued',
    applied: 'fillApply.applied',
    failed: 'fillApply.failed',
    cancelled: 'fillApply.cancelled'
  };

  const RUN_MODES = ['fill', 'ready', 'submit'];

  const DEFAULT_RUN_CONFIG = {
    delayMs: 3000,
    runMode: 'fill',
    autoSubmit: false,
    mockMode: true,
    backendBaseUrl: '',
    autoCloseAppliedTab: true
  };

  const MSG = {
    PING: 'FILL_APPLY_PING',
    START: 'FILL_APPLY_START',
    STOP: 'FILL_APPLY_STOP',
    RESUME: 'FILL_APPLY_RESUME',
    STATUS: 'FILL_APPLY_STATUS',
    FILL_ONCE: 'FILL_APPLY_FILL_ONCE',
    LOG_UPDATED: 'FILL_APPLY_LOG_UPDATED'
  };

  const JOB_STATUS = {
    queued: 'queued',
    applied: 'applied',
    failed: 'failed',
    cancelled: 'cancelled',
    waiting_human: 'waiting_human'
  };

  function normalizeRunMode(cfg) {
    cfg = cfg || {};
    if (cfg.runMode && RUN_MODES.indexOf(cfg.runMode) !== -1) return cfg.runMode;
    if (cfg.autoSubmit === true) return 'submit';
    return 'fill';
  }

  global.FillApplyTypes = {
    STORAGE_KEYS,
    DEFAULT_RUN_CONFIG,
    RUN_MODES,
    MSG,
    JOB_STATUS,
    normalizeRunMode
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
