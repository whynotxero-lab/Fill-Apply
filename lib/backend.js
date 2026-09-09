/**
 * Stub backend API client for the job queue.
 * - getNextJob() / getQueue()
 * - markApplied(jobId, payload)
 * - getProfile() / getDocuments()  (server-side; local storage used when mock)
 * Configurable base URL via RunConfig; mock mode uses saved https job URLs.
 *
 * Works in the service worker (fetch + chrome.storage).
 * Depends on FillApplyStorage (and optionally FillApplyProfile / FillApplyTypes).
 */
(function (global) {
  'use strict';

  const Storage = function () {
    return global.FillApplyStorage;
  };

  const NO_URLS_ERROR =
    'Add job apply URLs in Options (Mock queue)';

  function isExtensionDemoUrl(url) {
    return /^chrome-extension:\/\//i.test(String(url || ''));
  }

  function isHttpUrl(url) {
    return /^https?:\/\//i.test(String(url || ''));
  }

  /**
   * Build queue jobs from the user-saved mock URL list (https only).
   * Never uses chrome.runtime.getURL('demo/...') — executeScript cannot inject there.
   */
  function jobsFromUrls(urls) {
    return (urls || [])
      .map(function (url, i) {
        url = String(url || '').trim();
        if (!isHttpUrl(url) || isExtensionDemoUrl(url)) return null;
        let host = '';
        let pathTail = '';
        try {
          const u = new URL(url);
          host = u.hostname.replace(/^www\./, '');
          const parts = u.pathname.split('/').filter(Boolean);
          pathTail = parts.length ? parts[parts.length - 1] : '';
        } catch (_e) {
          return null;
        }
        const title = pathTail
          ? decodeURIComponent(pathTail).replace(/[-_]+/g, ' ').slice(0, 80)
          : 'Job ' + (i + 1);
        return {
          id: 'mock-' + (i + 1),
          title: title || 'Job ' + (i + 1),
          company: host || 'Mock',
          url: url,
          ats: /greenhouse\.io/i.test(host) ? 'greenhouse' : undefined,
          meta: { source: 'mock' }
        };
      })
      .filter(Boolean);
  }

  async function getConfiguredMockUrls() {
    const S = Storage();
    if (S.getMockQueueUrls) return S.getMockQueueUrls();
    const raw = await S.get([S.KEYS.mockQueueUrls]);
    const stored = raw[S.KEYS.mockQueueUrls];
    if (S.normalizeMockUrls) return S.normalizeMockUrls(stored || []);
    return Array.isArray(stored) ? stored : [];
  }

  async function buildMockJobsFromConfig() {
    const urls = await getConfiguredMockUrls();
    return jobsFromUrls(urls);
  }

  function sanitizeQueue(queue) {
    if (!Array.isArray(queue)) return [];
    return queue.filter(function (j) {
      return j && isHttpUrl(j.url) && !isExtensionDemoUrl(j.url);
    });
  }

  /**
   * Ensure a mock queue exists from saved URLs.
   * Does NOT seed chrome-extension:// demo pages.
   * Returns [] when no URLs are configured.
   */
  async function ensureMockQueue() {
    const S = Storage();
    const raw = await S.get([S.KEYS.mockQueue]);
    let queue = sanitizeQueue(raw[S.KEYS.mockQueue]);

    // Drop legacy extension-demo entries if present
    if (Array.isArray(raw[S.KEYS.mockQueue]) && queue.length !== raw[S.KEYS.mockQueue].length) {
      await S.set({ [S.KEYS.mockQueue]: queue });
    }

    if (!queue.length) {
      const built = await buildMockJobsFromConfig();
      if (built.length) {
        await S.set({ [S.KEYS.mockQueue]: built });
        return built;
      }
      return [];
    }
    return queue;
  }

  async function assertMockUrlsConfigured() {
    const urls = await getConfiguredMockUrls();
    const jobs = jobsFromUrls(urls);
    if (!jobs.length) {
      throw new Error(NO_URLS_ERROR);
    }
    return jobs;
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
      const urls = await getConfiguredMockUrls();
      if (!jobsFromUrls(urls).length) {
        throw new Error(NO_URLS_ERROR);
      }
      const queue = await ensureMockQueue();
      if (!queue.length) return null;
      return queue[0];
    }
    try {
      const data = await apiFetch('/queue/next');
      return data && data.id ? data : data && data.job ? data.job : null;
    } catch (e) {
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

  /**
   * Rebuild mock queue from saved URL list (not the broken extension demo).
   */
  async function resetMockQueue() {
    const jobs = await buildMockJobsFromConfig();
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
    return apiFetch('/documents');
  }

  global.FillApplyBackend = {
    jobsFromUrls,
    NO_URLS_ERROR,
    getQueue,
    getNextJob,
    markApplied,
    resetMockQueue,
    assertMockUrlsConfigured,
    getConfiguredMockUrls,
    getProfile: getProfileFromBackend,
    getDocuments: getDocumentsFromBackend
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
