/**
 * chrome.storage helpers for run config, start/stop flag, session log, documents,
 * and structured queue buckets (queued / applied / failed / cancelled).
 */
(function (global) {
  'use strict';

  const KEYS =
    (global.FillApplyTypes && global.FillApplyTypes.STORAGE_KEYS) || {
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
      cancelled: 'fillApply.cancelled',
      reports: 'fillApply.reports'
    };

  const DEFAULT_RUN_CONFIG =
    (global.FillApplyTypes && global.FillApplyTypes.DEFAULT_RUN_CONFIG) || {
      delayMs: 3000,
      runMode: 'fill',
      autoSubmit: false,
      mockMode: true,
      backendBaseUrl: '',
      autoCloseAppliedTab: true,
      keepRecentTabs: 5,
      autoPdfReport: true
    };

  const RUN_MODES =
    (global.FillApplyTypes && global.FillApplyTypes.RUN_MODES) || ['fill', 'ready', 'submit'];

  const MAX_LOG = 100;
  const MAX_HISTORY = 200;

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

  function normalizeRunMode(cfg) {
    if (global.FillApplyTypes && global.FillApplyTypes.normalizeRunMode) {
      return global.FillApplyTypes.normalizeRunMode(cfg);
    }
    if (cfg && cfg.runMode && RUN_MODES.indexOf(cfg.runMode) !== -1) return cfg.runMode;
    if (cfg && cfg.autoSubmit === true) return 'submit';
    return 'fill';
  }

  function clampKeepRecentTabs(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 5;
    return Math.min(10, Math.max(3, Math.round(v)));
  }

  async function getRunConfig() {
    const result = await get([KEYS.runConfig]);
    const stored = result[KEYS.runConfig];
    const merged = Object.assign(
      {},
      DEFAULT_RUN_CONFIG,
      stored && typeof stored === 'object' ? stored : {}
    );
    merged.runMode = normalizeRunMode(merged);
    // Keep autoSubmit in sync for any legacy readers
    merged.autoSubmit = merged.runMode === 'submit';
    merged.keepRecentTabs = clampKeepRecentTabs(merged.keepRecentTabs);
    merged.autoPdfReport = merged.autoPdfReport !== false;
    merged.autoCloseAppliedTab = merged.autoCloseAppliedTab !== false;
    return merged;
  }

  async function saveRunConfig(partial) {
    const current = await getRunConfig();
    const next = Object.assign({}, current, partial || {});
    if (typeof next.delayMs !== 'number' || next.delayMs < 0) {
      next.delayMs = DEFAULT_RUN_CONFIG.delayMs;
    }
    if (partial && partial.runMode != null) {
      next.runMode = RUN_MODES.indexOf(partial.runMode) !== -1 ? partial.runMode : 'fill';
    } else if (partial && Object.prototype.hasOwnProperty.call(partial, 'autoSubmit')) {
      next.runMode = partial.autoSubmit ? 'submit' : current.runMode === 'ready' ? 'ready' : 'fill';
    } else {
      next.runMode = normalizeRunMode(next);
    }
    next.autoSubmit = next.runMode === 'submit';
    next.mockMode = !!next.mockMode;
    next.autoCloseAppliedTab = next.autoCloseAppliedTab !== false;
    next.keepRecentTabs = clampKeepRecentTabs(
      partial && Object.prototype.hasOwnProperty.call(partial, 'keepRecentTabs')
        ? partial.keepRecentTabs
        : next.keepRecentTabs
    );
    if (partial && Object.prototype.hasOwnProperty.call(partial, 'autoPdfReport')) {
      next.autoPdfReport = !!partial.autoPdfReport;
    } else {
      next.autoPdfReport = next.autoPdfReport !== false;
    }
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
        lastJobTitle: null,
        counts: { queued: 0, applied: 0, failed: 0, cancelled: 0 }
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

  function isHttpUrl(url) {
    return /^https?:\/\//i.test(String(url || ''));
  }

  function isBlockedUrl(url) {
    const u = String(url || '').trim();
    if (!u) return true;
    if (/^chrome-extension:/i.test(u)) return true;
    if (/^about:/i.test(u)) return true;
    if (/^(chrome|edge|devtools|view-source):/i.test(u)) return true;
    return false;
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
      if (!isHttpUrl(url) && trimmed.charAt(0) === '[') return;
      if (!isHttpUrl(url) || isBlockedUrl(url)) return;
      if (seen[url]) return;
      seen[url] = true;
      urls.push(url);
    });
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
              if (isHttpUrl(u) && !isBlockedUrl(u) && !seen[u]) {
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

  async function getBucket(name) {
    const key = KEYS[name];
    if (!key) return [];
    const result = await get([key]);
    return Array.isArray(result[key]) ? result[key] : [];
  }

  async function setBucket(name, list) {
    const key = KEYS[name];
    if (!key) throw new Error('Unknown bucket: ' + name);
    const trimmed = Array.isArray(list) ? list.slice() : [];
    while (trimmed.length > MAX_HISTORY && name !== 'queued') trimmed.shift();
    await set({ [key]: trimmed });
    return trimmed;
  }

  async function getQueueCounts() {
    const [queued, applied, failed, cancelled] = await Promise.all([
      getBucket('queued'),
      getBucket('applied'),
      getBucket('failed'),
      getBucket('cancelled')
    ]);
    return {
      queued: queued.length,
      applied: applied.length,
      failed: failed.length,
      cancelled: cancelled.length
    };
  }

  async function clearHistory() {
    await set({
      [KEYS.applied]: [],
      [KEYS.failed]: [],
      [KEYS.cancelled]: []
    });
  }


  async function isPausedForHuman() {
    const result = await get([KEYS.pausedForHuman]);
    const v = result[KEYS.pausedForHuman];
    if (!v) return null;
    if (typeof v === 'object') return v;
    return { paused: !!v };
  }

  async function setPausedForHuman(info) {
    if (!info) {
      await set({ [KEYS.pausedForHuman]: null });
      return null;
    }
    const payload = Object.assign(
      {
        paused: true,
        at: Date.now()
      },
      typeof info === 'object' ? info : { reason: String(info) }
    );
    await set({ [KEYS.pausedForHuman]: payload });
    return payload;
  }

  async function clearPausedForHuman() {
    await set({ [KEYS.pausedForHuman]: null });
  }

  global.FillApplyStorage = {
    KEYS,
    DEFAULT_RUN_CONFIG,
    get,
    set,
    getRunConfig,
    saveRunConfig,
    clampKeepRecentTabs,
    normalizeRunMode,
    isRunning,
    setRunning,
    isPausedForHuman,
    setPausedForHuman,
    clearPausedForHuman,
    getSessionLog,
    appendSessionLog,
    clearSessionLog,
    getDocuments,
    saveDocuments,
    getQueueStatus,
    setQueueStatus,
    normalizeMockUrls,
    getMockQueueUrls,
    saveMockQueueUrls,
    isHttpUrl,
    isBlockedUrl,
    getBucket,
    setBucket,
    getQueueCounts,
    clearHistory
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
