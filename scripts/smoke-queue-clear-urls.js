'use strict';
const { createPage, createSuite } = require('./test-harness');
const suite = createSuite('smoke-queue-clear-urls');
(async function () {
  const page = createPage('<div></div>', ['lib/types.js', 'lib/storage.js', 'lib/backend.js']);
  const store = {
    buckets: { queued: [{ id: '1', url: 'https://example.com/a' }], applied: [], failed: [], cancelled: [] },
    urls: ['https://example.com/a', 'https://example.com/b'],
    KEYS: page.window.FillApplyTypes.STORAGE_KEYS
  };
  page.window.FillApplyStorage = {
    KEYS: store.KEYS,
    isHttpUrl: (u) => /^https?:/i.test(u),
    isBlockedUrl: () => false,
    getRunConfig: async () => ({ mockMode: true, backendBaseUrl: '' }),
    getBucket: async (n) => (store.buckets[n] || []).slice(),
    setBucket: async (n, list) => { store.buckets[n] = Array.isArray(list) ? list.slice() : []; },
    getQueueCounts: async () => ({
      queued: store.buckets.queued.length,
      applied: store.buckets.applied.length,
      failed: 0,
      cancelled: 0
    }),
    setQueueStatus: async () => {},
    get: async (keys) => {
      const o = {};
      (keys || []).forEach((k) => {
        if (k === store.KEYS.mockQueueUrls) o[k] = store.urls.slice();
        if (k === store.KEYS.mockQueue) o[k] = [];
      });
      return o;
    },
    set: async (obj) => {
      if (obj[store.KEYS.mockQueueUrls]) store.urls = obj[store.KEYS.mockQueueUrls];
      if (obj[store.KEYS.mockQueue]) { /* cleared */ }
    },
    getMockQueueUrls: async () => store.urls.slice(),
    saveMockQueueUrls: async (input) => {
      store.urls = Array.isArray(input) ? input.slice() : [];
      return store.urls;
    },
    normalizeMockUrls: (input) => (Array.isArray(input) ? input : [])
  };
  // Re-eval backend against our storage? Backend already loaded with empty storage.
  // Re-inject backend after storage stub
  const fs = require('fs');
  page.window.eval(fs.readFileSync('lib/backend.js', 'utf8'));
  const B = page.window.FillApplyBackend;
  suite.equal(store.urls.length, 2, 'urls before clear');
  const jobs = await B.resetMockQueue({});
  suite.equal(jobs.length, 0, 'reset returns empty jobs');
  suite.equal(store.urls.length, 0, 'URLs cleared from storage');
  suite.equal(store.buckets.queued.length, 0, 'queued bucket empty');
  suite.finish();
})().catch((e) => { console.error(e); process.exit(1); });
