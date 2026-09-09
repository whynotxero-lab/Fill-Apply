/**
 * Stub backend API client for the job queue.
 * - getNextJob() / getQueue()
 * - markApplied(jobId, payload)
 * - getProfile() / getDocuments()  (server-side; local storage used when mock)
 * Configurable base URL via RunConfig; mock mode returns demo jobs.
 *
 * Works in the service worker (fetch + chrome.storage).
 * Depends on FillApplyStorage (and optionally FillApplyProfile / FillApplyTypes).
 */
(function (global) {
  'use strict';

  const Storage = function () {
    return global.FillApplyStorage;
  };

  function demoJobs() {
    let demoUrl = 'demo/sample-application.html';
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        demoUrl = chrome.runtime.getURL('demo/sample-application.html');
      }
    } catch (_e) {
      /* ignore */
    }
    return [
      {
        id: 'mock-1',
        title: 'Software Engineer',
        company: 'Acme Corp',
        url: demoUrl,
        ats: 'fallback',
        meta: { source: 'mock' }
      },
      {
        id: 'mock-2',
        title: 'Frontend Engineer',
        company: 'Acme Corp',
        url: demoUrl,
        ats: 'fallback',
        meta: { source: 'mock' }
      },
      {
        id: 'mock-3',
        title: 'Full-Stack Engineer',
        company: 'Acme Corp',
        url: demoUrl,
        ats: 'fallback',
        meta: { source: 'mock' }
      }
    ];
  }

  async function ensureMockQueue() {
    const S = Storage();
    const raw = await S.get([S.KEYS.mockQueue]);
    let queue = raw[S.KEYS.mockQueue];
    if (!Array.isArray(queue) || !queue.length) {
      queue = demoJobs().slice();
      await S.set({ [S.KEYS.mockQueue]: queue });
    }
    return queue;
  }

  async function apiFetch(path, options) {
    const config = await Storage().getRunConfig();
    const base = config.backendBaseUrl;
    if (!base) throw new Error('backendBaseUrl is empty');
    const url = base.replace(/\/$/, '') + path;
    const opts = Object.assign({ method: 'GET' }, options || {});
    opts.headers = Object.assign(
      { Accept: 'application/json', 'Content-Type': 'application/json' },
      opts.headers || {}
    );
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text().catch(function () {
        return '';
      });
      throw new Error('HTTP ' + res.status + (text ? ': ' + text.slice(0, 200) : ''));
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function getQueue() {
    const config = await Storage().getRunConfig();
    if (config.mockMode || !config.backendBaseUrl) {
      return ensureMockQueue();
    }
    const data = await apiFetch('/queue');
    return Array.isArray(data) ? data : data && data.jobs ? data.jobs : [];
  }

  async function getNextJob() {
    const config = await Storage().getRunConfig();
    if (config.mockMode || !config.backendBaseUrl) {
      const queue = await ensureMockQueue();
      if (!queue.length) return null;
      const job = queue[0];
      return job;
    }
    try {
      const data = await apiFetch('/queue/next');
      return data && data.id ? data : data && data.job ? data.job : null;
    } catch (e) {
      // Fallback: full queue then first item
      const queue = await getQueue();
      return queue[0] || null;
    }
  }

  async function markApplied(jobId, payload) {
    const config = await Storage().getRunConfig();
    if (config.mockMode || !config.backendBaseUrl) {
      const queue = await ensureMockQueue();
      const next = queue.filter(function (j) {
        return j.id !== jobId;
      });
      await Storage().set({ [Storage().KEYS.mockQueue]: next });
      await Storage().appendSessionLog({
        type: 'markApplied',
        jobId: jobId,
        payload: payload || {},
        mock: true
      });
      return { ok: true, mock: true, remaining: next.length };
    }
    return apiFetch('/applied/' + encodeURIComponent(jobId), {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });
  }

  async function resetMockQueue() {
    const jobs = demoJobs();
    await Storage().set({ [Storage().KEYS.mockQueue]: jobs });
    return jobs;
  }

  async function getProfileFromBackend() {
    const config = await Storage().getRunConfig();
    if (config.mockMode || !config.backendBaseUrl) {
      if (global.FillApplyProfile) return global.FillApplyProfile.getProfile();
      return null;
    }
    return apiFetch('/profile');
  }

  async function getDocumentsFromBackend() {
    const config = await Storage().getRunConfig();
    if (config.mockMode || !config.backendBaseUrl) {
      return Storage().getDocuments();
    }
    // Expected: { resume: { name, mime, base64|url }, cover: {...} }
    return apiFetch('/documents');
  }

  global.FillApplyBackend = {
    demoJobs,
    getQueue,
    getNextJob,
    markApplied,
    resetMockQueue,
    getProfile: getProfileFromBackend,
    getDocuments: getDocumentsFromBackend
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
