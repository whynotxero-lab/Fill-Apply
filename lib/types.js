/**
 * Shared shape documentation + constants for Fill & Apply.
 * Vanilla JS — types are JSDoc / runtime constants only (no TypeScript).
 *
 * Job:        { id, title, company, url, ats?, meta? }
 * Profile:    see FillApplyProfile.DEFAULT_PROFILE
 * Adapter:    { id, name, detect(url, document), fieldMaps?, submitSelector?,
 *               fileInputHints?, fill?(ctx) }
 * FillResult: { ok, adapterId, filled, unmatched, total, filesAttached?,
 *               submitted?, details?, error? }
 * RunConfig:  { delayMs, autoSubmit, mockMode, backendBaseUrl }
 * DocumentBlob: { name, mime, base64 }
 */
(function (global) {
  'use strict';

  const STORAGE_KEYS = {
    profile: 'fillApply.profile',
    runConfig: 'fillApply.runConfig',
    running: 'fillApply.running',
    sessionLog: 'fillApply.sessionLog',
    documents: 'fillApply.documents',
    queueStatus: 'fillApply.queueStatus',
    mockQueue: 'fillApply.mockQueue'
  };

  const DEFAULT_RUN_CONFIG = {
    delayMs: 3000,
    autoSubmit: false,
    mockMode: true,
    backendBaseUrl: ''
  };

  const MSG = {
    PING: 'FILL_APPLY_PING',
    START: 'FILL_APPLY_START',
    STOP: 'FILL_APPLY_STOP',
    STATUS: 'FILL_APPLY_STATUS',
    FILL_ONCE: 'FILL_APPLY_FILL_ONCE',
    LOG_UPDATED: 'FILL_APPLY_LOG_UPDATED'
  };

  global.FillApplyTypes = {
    STORAGE_KEYS,
    DEFAULT_RUN_CONFIG,
    MSG
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
