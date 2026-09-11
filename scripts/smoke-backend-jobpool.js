/**
 * JobPool backend: local status stamps, live POST /applied/:id, cancelled
 * fallback when POST /cancelled/:id is missing.
 *
 * Run: node scripts/smoke-backend-jobpool.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-backend-jobpool');

function installStorage(window, config) {
  const buckets = {
    queued: [],
    applied: [],
    failed: [],
    cancelled: []
  };
  const logs = [];
  window.FillApplyStorage = {
    KEYS: window.FillApplyTypes.STORAGE_KEYS,
    isHttpUrl: function (u) {
      return /^https?:\/\//i.test(String(u || ''));
    },
    isBlockedUrl: function () {
      return false;
    },
    getRunConfig: async function () {
      return config;
    },
    getBucket: async function (name) {
      return (buckets[name] || []).slice();
    },
    setBucket: async function (name, list) {
      buckets[name] = Array.isArray(list) ? list.slice() : [];
    },
    getQueueCounts: async function () {
      return {
        queued: buckets.queued.length,
        applied: buckets.applied.length,
        failed: buckets.failed.length,
        cancelled: buckets.cancelled.length
      };
    },
    setQueueStatus: async function () {},
    appendSessionLog: async function (entry) {
      logs.push(entry);
    },
    get: async function () {
      return {};
    },
    set: async function () {},
    getMockQueueUrls: async function () {
      return [];
    },
    _buckets: buckets,
    _logs: logs
  };
  return window.FillApplyStorage;
}

(async function main() {
  const mockPage = createPage('<div></div>', ['lib/types.js']);
  const mockStore = installStorage(mockPage.window, {
    mockMode: true,
    backendBaseUrl: ''
  });
  mockStore._buckets.queued.push({
    id: 'job-1',
    url: 'https://boards.greenhouse.io/acme/jobs/1',
    title: 'FP&A',
    attempts: 0
  });
  mockPage.window.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'lib/backend.js'), 'utf8'));

  const filled = await mockPage.window.FillApplyBackend.markApplied('job-1', {
    fillResult: { ok: true, filled: 4, submitted: false },
    submitted: false,
    advanced: false,
    runMode: 'fill',
    url: 'https://boards.greenhouse.io/acme/jobs/1'
  });
  suite.equal(filled.status, 'filled', 'mock fill-only run reports filled, not Applied');
  suite.equal(mockStore._buckets.applied.length, 1, 'mock fill-only still lands in local applied bucket');
  suite.equal(mockStore._buckets.applied[0].jobPoolStatus, 'filled', 'local job stores jobPoolStatus=filled');
  suite.equal(mockStore._buckets.queued.length, 0, 'job left the queued bucket');

  mockStore._buckets.queued.push({
    id: 'job-2',
    url: 'https://boards.greenhouse.io/acme/jobs/2',
    title: 'Controller',
    attempts: 0
  });
  const submitted = await mockPage.window.FillApplyBackend.markApplied('job-2', {
    fillResult: { ok: true, filled: 4, submitted: true },
    submitted: true,
    advanced: true,
    runMode: 'submit',
    url: 'https://boards.greenhouse.io/acme/jobs/2'
  });
  suite.equal(submitted.status, 'submitted', 'mock submit reports submitted');
  suite.equal(mockStore._buckets.applied[1].jobPoolStatus, 'submitted', 'local job stores jobPoolStatus=submitted');

  mockStore._buckets.queued.push({
    id: 'job-3',
    url: 'https://boards.greenhouse.io/acme/jobs/3',
    title: 'Stopped',
    attempts: 0
  });
  const cancelled = await mockPage.window.FillApplyBackend.markCancelled('job-3', 'Stopped by user');
  suite.equal(cancelled.status, 'cancelled', 'mock Stop reports cancelled');
  suite.equal(mockStore._buckets.cancelled.length, 1, 'Stop moves the current job to cancelled');
  suite.equal(mockStore._buckets.cancelled[0].jobPoolStatus, 'cancelled', 'cancelled job stores jobPoolStatus');

  const livePage = createPage('<div></div>', ['lib/types.js']);
  const liveStore = installStorage(livePage.window, {
    mockMode: false,
    backendBaseUrl: 'https://jobpool.test'
  });
  liveStore._buckets.queued.push({
    id: 'jp-9',
    url: 'https://jobs.ashbyhq.com/acme/job',
    title: 'Live cancel',
    attempts: 0
  });
  const posts = [];
  livePage.window.fetch = async function (url, opts) {
    posts.push({
      url: String(url),
      method: (opts && opts.method) || 'GET',
      body: opts && opts.body
    });
    if (String(url).indexOf('/cancelled/') !== -1) {
      return {
        ok: false,
        status: 404,
        text: async function () {
          return 'not found';
        },
        json: async function () {
          return {};
        }
      };
    }
    return {
      ok: true,
      status: 200,
      json: async function () {
        return { ok: true };
      },
      text: async function () {
        return '{}';
      }
    };
  };
  livePage.window.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'lib/backend.js'), 'utf8'));

  await livePage.window.FillApplyBackend.markApplied('jp-1', {
    fillResult: { ok: true, filled: 2, submitted: true },
    submitted: true,
    runMode: 'submit'
  });
  suite.ok(
    posts.some(function (p) {
      return p.method === 'POST' && /\/applied\/jp-1$/.test(p.url);
    }),
    'live submit POSTs /applied/:id'
  );
  const appliedBody = JSON.parse(
    posts.filter(function (p) {
      return /\/applied\/jp-1$/.test(p.url);
    })[0].body
  );
  suite.equal(appliedBody.status, 'submitted', 'live POST body status is submitted');

  posts.length = 0;
  await livePage.window.FillApplyBackend.markCancelled('jp-9', 'Stopped by user');
  suite.ok(
    posts.some(function (p) {
      return p.method === 'POST' && /\/cancelled\/jp-9$/.test(p.url);
    }),
    'live Stop tries POST /cancelled/:id first'
  );
  suite.ok(
    posts.some(function (p) {
      return p.method === 'POST' && /\/applied\/jp-9$/.test(p.url);
    }),
    'live Stop falls back to POST /applied/:id when /cancelled is missing'
  );
  const fallbackBody = JSON.parse(
    posts.filter(function (p) {
      return /\/applied\/jp-9$/.test(p.url);
    })[0].body
  );
  suite.equal(fallbackBody.status, 'cancelled', 'fallback POST still says cancelled, not Applied');
  suite.equal(liveStore._buckets.cancelled.length, 1, 'live Stop still records local cancelled');

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
