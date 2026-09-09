/**
 * Stub backend API client for the job queue.
 * Mock mode uses structured buckets in chrome.storage:
 *   queued / applied / failed / cancelled
 * Never seeds chrome-extension:// or about: URLs.
 */
(function (global) {
  'use strict';

  const Storage = function () {
    return global.FillApplyStorage;
  };

  const NO_URLS_ERROR = 'Add job apply URLs in Options (Mock queue)';

  function isExtensionDemoUrl(url) {
    return /^chrome-extension:\/\//i.test(String(url || ''));
  }

  function isHttpUrl(url) {
    if (Storage() && Storage().isHttpUrl) return Storage().isHttpUrl(url);
    return /^https?:\/\//i.test(String(url || ''));
  }

  function isBlockedUrl(url) {
    if (Storage() && Storage().isBlockedUrl) return Storage().isBlockedUrl(url);
    const u = String(url || '').trim();
    return !u || /^chrome-extension:/i.test(u) || /^about:/i.test(u);
  }

  function now() {
    return Date.now();
  }

  function makeJob(url, i, extra) {
    url = String(url || '').trim();
    if (!isHttpUrl(url) || isBlockedUrl(url) || isExtensionDemoUrl(url)) return null;
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
    return Object.assign(
      {
        id: 'job-' + now() + '-' + (i + 1),
        title: title || 'Job ' + (i + 1),
        company: host || 'Mock',
        url: url,
        status: 'queued',
        attempts: 0,
        lastError: null,
        result: null,
        updatedAt: now(),
        ats: /greenhouse\.io/i.test(host)
          ? 'greenhouse'
          : /ashbyhq\.com/i.test(host)
            ? 'ashby'
            : undefined,
        meta: { source: 'mock' }
      },
      extra || {}
    );
  }

  function jobsFromUrls(urls) {
    return (urls || [])
      .map(function (url, i) {
        return makeJob(url, i);
      })
      .filter(Boolean);
  }

  async function getConfiguredMockUrls() {
    const S = Storage();
    if (S.getMockQueueUrls) return S.getMockQueueUrls();
    const raw = await S.get([S.KEYS.mockQueueUrls]);
    const stored = raw[S.KEYS.mockQueueUrls];
    if (S.normalizeMockUrls) return S.normalizeMockUrls(stored || []);
    return Array.isArray(stored) ? stored.filter(isHttpUrl) : [];
  }

  function sanitizeJobs(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (j) {
      return j && isHttpUrl(j.url) && !isBlockedUrl(j.url) && !isExtensionDemoUrl(j.url);
    });
  }

  async function getQueued() {
    const S = Storage();
    let queued = sanitizeJobs(await S.getBucket('queued'));

    // Migrate legacy mockQueue → queued once
    if (!queued.length && S.KEYS.mockQueue) {
      const raw = await S.get([S.KEYS.mockQueue]);
      const legacy = sanitizeJobs(raw[S.KEYS.mockQueue]);
      if (legacy.length) {
        queued = legacy.map(function (j, i) {
          return Object.assign(
            {
              status: 'queued',
              attempts: 0,
              lastError: null,
              result: null,
              updatedAt: now()
            },
            j,
            { id: j.id || 'job-migrated-' + (i + 1) }
          );
        });
        await S.setBucket('queued', queued);
        await S.set({ [S.KEYS.mockQueue]: [] });
      }
    }

    // Drop any blocked URLs that snuck in
    const clean = sanitizeJobs(queued);
    if (clean.length !== queued.length) {
      await S.setBucket('queued', clean);
      return clean;
    }
    return queued;
  }

  async function setQueued(list) {
    return Storage().setBucket('queued', sanitizeJobs(list));
  }

  async function getApplied() {
    return sanitizeJobs(await Storage().getBucket('applied'));
  }

  async function getFailed() {
    return sanitizeJobs(await Storage().getBucket('failed'));
  }

  async function getCancelled() {
    return sanitizeJobs(await Storage().getBucket('cancelled'));
  }

  async function refreshCounts() {
    const S = Storage();
    const counts = await S.getQueueCounts();
    await S.setQueueStatus({
      remaining: counts.queued,
      counts: counts
    });
    return counts;
  }

  /**
   * Rebuild queued from saved https URL list.
   * Keeps applied history by default; optionally clear failed/cancelled.
   */
  async function resetMockQueue(opts) {
    opts = opts || {};
    const urls = await getConfiguredMockUrls();
    const jobs = jobsFromUrls(urls);
    await setQueued(jobs);
    // Clear legacy single queue
    const S = Storage();
    if (S.KEYS.mockQueue) {
      await S.set({ [S.KEYS.mockQueue]: [] });
    }
    if (opts.clearFailed) await S.setBucket('failed', []);
    if (opts.clearCancelled) await S.setBucket('cancelled', []);
    if (opts.clearApplied) await S.setBucket('applied', []);
    await refreshCounts();
    return jobs;
  }

  /**
   * Saving URLs rebuilds queued from https/http only.
   */
  async function rebuildQueuedFromUrls(input) {
    const S = Storage();
    const urls = await S.saveMockQueueUrls(input);
    const jobs = jobsFromUrls(urls);
    await setQueued(jobs);
    if (S.KEYS.mockQueue) await S.set({ [S.KEYS.mockQueue]: [] });
    await refreshCounts();
    return { urls: urls, jobs: jobs };
  }

  async function assertMockUrlsConfigured() {
    const urls = await getConfiguredMockUrls();
    const jobs = jobsFromUrls(urls);
    if (!jobs.length) {
      const queued = await getQueued();
      if (!queued.length) throw new Error(NO_URLS_ERROR);
      return queued;
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
      return getQueued();
    }
    const data = await apiFetch('/queue');
    return Array.isArray(data) ? data : data && data.jobs ? data.jobs : [];
  }

  /**
   * Peek + reserve next job from queued only.
   * Does not remove until markApplied / markFailed / markCancelled.
   * Returns null when empty.
   */
  async function getNextJob() {
    const config = await Storage().getRunConfig();
    if (config.mockMode || !config.backendBaseUrl) {
      const queued = await getQueued();
      if (!queued.length) {
        const urls = await getConfiguredMockUrls();
        if (!jobsFromUrls(urls).length) {
          throw new Error(NO_URLS_ERROR);
        }
        return null;
      }
      const job = queued[0];
      if (isBlockedUrl(job.url) || isExtensionDemoUrl(job.url)) {
        // Scrub and retry
        await setQueued(queued.slice(1));
        await moveToBucket('failed', Object.assign({}, job, {
          status: 'failed',
          lastError: 'Blocked URL (chrome-extension/about not allowed)',
          updatedAt: now()
        }));
        return getNextJob();
      }
      return job;
    }
    try {
      const data = await apiFetch('/queue/next');
      return data && data.id ? data : data && data.job ? data.job : null;
    } catch (e) {
      const queue = await getQueue();
      return queue[0] || null;
    }
  }

  async function removeFromQueued(jobId) {
    const queued = await getQueued();
    const next = queued.filter(function (j) {
      return j.id !== jobId;
    });
    await setQueued(next);
    return next;
  }

  async function moveToBucket(bucketName, job) {
    const S = Storage();
    const list = await S.getBucket(bucketName);
    // Dedupe by id
    const filtered = list.filter(function (j) {
      return j.id !== job.id;
    });
    filtered.push(job);
    await S.setBucket(bucketName, filtered);
    return filtered;
  }

  /**
   * Successfully processed per current runMode → applied.
   * Removes from queued so the same URL will not reappear until re-queued.
   */
  async function findInBuckets(jobId) {
    const [queued, applied, failed, cancelled] = await Promise.all([
      getQueued(),
      getApplied(),
      getFailed(),
      getCancelled()
    ]);
    const hit = function (list, name) {
      const j = list.find(function (x) { return x.id === jobId; });
      return j ? { bucket: name, job: j } : null;
    };
    return hit(queued, 'queued') || hit(cancelled, 'cancelled') || hit(applied, 'applied') || hit(failed, 'failed') || null;
  }

  async function markApplied(jobId, payload) {
    const config = await Storage().getRunConfig();
    if (config.mockMode || !config.backendBaseUrl) {
      const existing = await findInBuckets(jobId);
      // Do not overwrite a Stop-cancelled job
      if (existing && existing.bucket === 'cancelled') {
        const counts = await refreshCounts();
        return { ok: true, mock: true, bucket: 'cancelled', skipped: true, remaining: counts.queued, counts: counts };
      }
      const queued = await getQueued();
      const job = (existing && existing.job) || queued.find(function (j) {
        return j.id === jobId;
      }) || { id: jobId, url: (payload && payload.url) || '' };

      await removeFromQueued(jobId);

      if (payload && payload.failed) {
        const failedJob = Object.assign({}, job, {
          status: 'failed',
          attempts: (job.attempts || 0) + 1,
          lastError: (payload && payload.error) || 'failed',
          result: payload || null,
          updatedAt: now()
        });
        await moveToBucket('failed', failedJob);
        await Storage().appendSessionLog({
          type: 'markFailed',
          jobId: jobId,
          payload: payload || {},
          mock: true
        });
        const counts = await refreshCounts();
        return { ok: true, mock: true, bucket: 'failed', remaining: counts.queued, counts: counts };
      }

      const appliedJob = Object.assign({}, job, {
        status: 'applied',
        attempts: (job.attempts || 0) + 1,
        lastError: null,
        result: payload || null,
        updatedAt: now()
      });
      await moveToBucket('applied', appliedJob);
      await Storage().appendSessionLog({
        type: 'markApplied',
        jobId: jobId,
        payload: payload || {},
        mock: true
      });
      const counts = await refreshCounts();
      return { ok: true, mock: true, bucket: 'applied', remaining: counts.queued, counts: counts };
    }
    return apiFetch('/applied/' + encodeURIComponent(jobId), {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });
  }

  async function markFailed(jobId, error, payload) {
    return markApplied(jobId, Object.assign({}, payload || {}, { failed: true, error: error || 'failed' }));
  }

  /**
   * On Stop: current incomplete job → cancelled; remaining stay queued.
   */
  async function markCancelled(jobId, reason) {
    const queued = await getQueued();
    const job = queued.find(function (j) {
      return j.id === jobId;
    });
    if (!job) {
      const counts = await refreshCounts();
      return { ok: true, remaining: counts.queued, counts: counts };
    }
    await removeFromQueued(jobId);
    const cancelledJob = Object.assign({}, job, {
      status: 'cancelled',
      lastError: reason || 'Stopped by user',
      updatedAt: now()
    });
    await moveToBucket('cancelled', cancelledJob);
    await Storage().appendSessionLog({
      type: 'markCancelled',
      jobId: jobId,
      reason: reason || 'Stopped by user'
    });
    const counts = await refreshCounts();
    return { ok: true, bucket: 'cancelled', remaining: counts.queued, counts: counts };
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

  async function getBucketsSnapshot() {
    const [queued, applied, failed, cancelled] = await Promise.all([
      getQueued(),
      getApplied(),
      getFailed(),
      getCancelled()
    ]);
    return {
      queued: queued,
      applied: applied,
      failed: failed,
      cancelled: cancelled,
      counts: {
        queued: queued.length,
        applied: applied.length,
        failed: failed.length,
        cancelled: cancelled.length
      }
    };
  }

  global.FillApplyBackend = {
    jobsFromUrls,
    NO_URLS_ERROR,
    getQueue,
    getNextJob,
    markApplied,
    markFailed,
    markCancelled,
    resetMockQueue,
    rebuildQueuedFromUrls,
    assertMockUrlsConfigured,
    getConfiguredMockUrls,
    getQueued,
    setQueued,
    getApplied,
    getFailed,
    getCancelled,
    getBucketsSnapshot,
    refreshCounts,
    getProfile: getProfileFromBackend,
    getDocuments: getDocumentsFromBackend
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
