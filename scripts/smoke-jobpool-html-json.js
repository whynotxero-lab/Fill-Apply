/**
 * JobPool apiFetch must not throw raw "Unexpected token <" when /queue returns HTML.
 * Run: node scripts/smoke-jobpool-html-json.js
 */
'use strict';
const { createPage, createSuite } = require('./test-harness');
const suite = createSuite('smoke-jobpool-html-json');

(async function () {
  const page = createPage('<div></div>', ['lib/types.js', 'lib/storage.js', 'lib/backend.js']);
  const B = page.window.FillApplyBackend;
  suite.ok(B, 'backend loaded');

  const html = '<!DOCTYPE html><html><head></head><body>JobPool</body></html>';
  const calls = [];
  page.window.fetch = async function (url, opts) {
    calls.push({ url: String(url), opts: opts });
    return {
      ok: true,
      status: 200,
      headers: { get: function () { return 'text/html'; } },
      text: async function () { return html; },
      json: async function () { throw new SyntaxError('Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON'); }
    };
  };

  page.window.FillApplyStorage = {
    getRunConfig: async function () {
      return { backendBaseUrl: 'https://zahid-jobpool.vercel.app', mockMode: false };
    },
    getBucket: async function () { return []; },
    setBucket: async function () {},
    getQueueCounts: async function () { return { queued: 0, applied: 0, failed: 0, cancelled: 0 }; },
    setQueueStatus: async function () {},
    isHttpUrl: function (u) { return /^https?:/i.test(u); },
    isBlockedUrl: function () { return false; },
    saveRunConfig: async function () {},
    KEYS: {}
  };

  let threw = null;
  try {
    await B.loadJobsFromJobPool({ baseUrl: 'https://zahid-jobpool.vercel.app' });
  } catch (e) {
    threw = e;
  }
  suite.ok(!threw, 'loadJobsFromJobPool does not throw on HTML');
  const loaded = await B.loadJobsFromJobPool({ baseUrl: 'https://zahid-jobpool.vercel.app' });
  suite.ok(loaded && Array.isArray(loaded.jobs), 'returns jobs array');
  suite.equal(loaded.jobs.length, 0, 'empty jobs when API is HTML');
  suite.ok(
    !/Unexpected token/i.test(String(loaded.error || '')),
    'error is friendly (not raw JSON.parse)'
  );

  // getQueue soft-fails to local bucket
  const q = await B.getQueue();
  suite.ok(Array.isArray(q), 'getQueue returns array on HTML live API');

  suite.finish();
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
