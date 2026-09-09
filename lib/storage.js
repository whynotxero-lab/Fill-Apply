/**
 * chrome.storage helpers for run config, start/stop flag, session log, documents.
 * Depends on FillApplyTypes (or falls back to known keys).
 */
(function (global) {
  'use strict';

  const KEYS =
    (global.FillApplyTypes && global.FillApplyTypes.STORAGE_KEYS) || {
      runConfig: 'fillApply.runConfig',
      running: 'fillApply.running',
      sessionLog: 'fillApply.sessionLog',
      documents: 'fillApply.documents',
      queueStatus: 'fillApply.queueStatus',
      mockQueue: 'fillApply.mockQueue',
      mockQueueUrls: 'fillApply.mockQueueUrls'
    };

  const DEFAULT_RUN_CONFIG =
    (global.FillApplyTypes && global.FillApplyTypes.DEFAULT_RUN_CONFIG) || {
      delayMs: 3000,
      autoSubmit: false,
      mockMode: true,
      backendBaseUrl: '',
      autoCloseAppliedTab: true
    };

  const MAX_LOG = 100;

  function get(keys) {
    return new Promise(function (resolve) {
      chrome.storage.local.get(keys, function (result) {
        resolve(result || {});
      });
    });
  }

  function set(obj) {
    return new Promise(function (resolve, reject) {
      chrome.storage.local.set(obj, function () {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  async function getRunConfig() {
    const result = await get([KEYS.runConfig]);
    const stored = result[KEYS.runConfig];
    return Object.assign({}, DEFAULT_RUN_CONFIG, stored && typeof stored === 'object' ? stored : {});
  }

  async function saveRunConfig(partial) {
    const current = await getRunConfig();
    const next = Object.assign({}, current, partial || {});
    if (typeof next.delayMs !== 'number' || next.delayMs < 0) next.delayMs = DEFAULT_RUN_CONFIG.delayMs;
    next.autoSubmit = !!next.autoSubmit;
    next.mockMode = !!next.mockMode;
    next.autoCloseAppliedTab = next.autoCloseAppliedTab !== false;
    next.backendBaseUrl = String(next.backendBaseUrl || '').replace(/\/$/, '');
    await set({ [KEYS.runConfig]: next });
    return next;
  }

  async function isRunning() {
    const result = await get([KEYS.running]);
    return !!result[KEYS.running];
  }

  async function setRunning(flag) {
    await set({ [KEYS.running]: !!flag });
  }

  async function getSessionLog() {
    const result = await get([KEYS.sessionLog]);
    return Array.isArray(result[KEYS.sessionLog]) ? result[KEYS.sessionLog] : [];
  }

  async function appendSessionLog(entry) {
    const log = await getSessionLog();
    log.push(
      Object.assign(
        {
          ts: Date.now()
        },
        entry || {}
      )
    );
    while (log.length > MAX_LOG) log.shift();
    await set({ [KEYS.sessionLog]: log });
    return log;
  }

  async function clearSessionLog() {
    await set({ [KEYS.sessionLog]: [] });
  }

  async function getDocuments() {
    const result = await get([KEYS.documents]);
    const docs = result[KEYS.documents];
    return Object.assign(
      { resume: null, cover: null },
      docs && typeof docs === 'object' ? docs : {}
    );
  }

  async function saveDocuments(docs) {
    const current = await getDocuments();
    const next = Object.assign({}, current, docs || {});
    await set({ [KEYS.documents]: next });
    return next;
  }

  async function getQueueStatus() {
    const result = await get([KEYS.queueStatus]);
    const s = result[KEYS.queueStatus];
    return Object.assign(
      {
        remaining: 0,
        currentJobId: null,
        lastError: null,
        lastResult: null,
        lastJobTitle: null
      },
      s && typeof s === 'object' ? s : {}
    );
  }

  async function setQueueStatus(partial) {
    const current = await getQueueStatus();
    const next = Object.assign({}, current, partial || {});
    await set({ [KEYS.queueStatus]: next });
    return next;
  }

  function normalizeMockUrls(input) {
    let lines = [];
    if (typeof input === 'string') {
      lines = input.split(/\r?\n/);
    } else if (Array.isArray(input)) {
      lines = input.map(function (u) {
        return String(u || '');
      });
    }
    const urls = [];
    const seen = {};
    lines.forEach(function (line) {
      const trimmed = String(line || '').trim();
      if (!trimmed || trimmed.charAt(0) === '#') return;
      let url = trimmed;
      // Allow JSON array paste of strings or {url} objects (one JSON blob)
      if (!/^https?:\/\//i.test(url) && trimmed.charAt(0) === '[') return;
      if (!/^https?:\/\//i.test(url)) return;
      if (seen[url]) return;
      seen[url] = true;
      urls.push(url);
    });
    // If input was a JSON array string, parse it
    if (!urls.length && typeof input === 'string') {
      const t = input.trim();
      if (t.charAt(0) === '[') {
        try {
          const parsed = JSON.parse(t);
          if (Array.isArray(parsed)) {
            parsed.forEach(function (item) {
              const u =
                typeof item === 'string'
                  ? item.trim()
                  : item && item.url
                    ? String(item.url).trim()
                    : '';
              if (/^https?:\/\//i.test(u) && !seen[u]) {
                seen[u] = true;
                urls.push(u);
              }
            });
          }
        } catch (_e) {
          /* ignore */
        }
      }
    }
    return urls;
  }

  async function getMockQueueUrls() {
    const result = await get([KEYS.mockQueueUrls]);
    const stored = result[KEYS.mockQueueUrls];
    if (Array.isArray(stored)) return normalizeMockUrls(stored);
    if (typeof stored === 'string') return normalizeMockUrls(stored);
    return [];
  }

  async function saveMockQueueUrls(input) {
    const urls = normalizeMockUrls(input);
    await set({ [KEYS.mockQueueUrls]: urls });
    return urls;
  }

  global.FillApplyStorage = {
    KEYS,
    DEFAULT_RUN_CONFIG,
    get,
    set,
    getRunConfig,
    saveRunConfig,
    isRunning,
    setRunning,
    getSessionLog,
    appendSessionLog,
    clearSessionLog,
    getDocuments,
    saveDocuments,
    getQueueStatus,
    setQueueStatus,
    normalizeMockUrls,
    getMockQueueUrls,
    saveMockQueueUrls
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
