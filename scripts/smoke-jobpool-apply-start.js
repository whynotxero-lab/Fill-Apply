/**
 * JobPool apply-link automation: overview → Apply-start → form fill;
 * data-fill-apply attrs win over ambiguous text; never paid upsell CTAs;
 * Advance Continue/Review; live queue preserves url/ats/sourceId.
 *
 * Run: node scripts/smoke-jobpool-apply-start.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createPage, createSuite, ROOT } = require('./test-harness');

const suite = createSuite('smoke-jobpool-apply-start');

const FILL_LIBS = [
  'lib/types.js',
  'lib/dom-deep.js',
  'lib/format.js',
  'lib/synonyms.js',
  'lib/pace.js',
  'lib/field-map.js',
  'lib/control-adapter.js',
  'lib/ats-faq-seed.js',
  'lib/knowledge-canonical.js',
  'lib/knowledge-store.js',
  'lib/knowledge-resolver.js',
  'lib/knowledge-learn.js',
  'lib/files.js',
  'content/fill.js',
  'adapters/registry.js',
  'adapters/fallback.js'
];

const PROFILE = {
  firstName: 'Alex',
  lastName: 'Sample',
  fullName: 'Alex Sample',
  email: 'alex.sample@example.com',
  phone: '501234567',
  phoneCountry: '+971'
};

function fixtureHtml() {
  return fs
    .readFileSync(path.join(ROOT, 'scripts/fixtures/controls/jobpool-overview-apply.html'), 'utf8')
    .replace(/<script>[\s\S]*?<\/script>/g, '');
}

(async function main() {
  // --- A) Synonyms: Review is Continue; data-fill-apply helpers exist ---
  const synPage = createPage('<div></div>', ['lib/dom-deep.js', 'lib/synonyms.js']);
  const Syn = synPage.window.FillApplySynonyms;
  suite.ok(!!Syn, 'FillApplySynonyms attached');
  suite.ok(Syn.isContinueCta('Review'), 'Review is Advance CTA');
  suite.ok(Syn.isContinueCta('Continue'), 'Continue is Advance CTA');
  suite.ok(Syn.isContinueCta('Next'), 'Next is Advance CTA');
  suite.ok(!Syn.isApplyStartCta('AI Auto-Apply'), 'AI Auto-Apply excluded from Apply-start');
  suite.ok(!Syn.isApplyStartCta('Upgrade'), 'Upgrade excluded from Apply-start');
  suite.ok(typeof Syn.findContinueButtons === 'function', 'findContinueButtons exported');
  suite.ok(typeof Syn.findSubmitButtons === 'function', 'findSubmitButtons exported');
  suite.ok(typeof Syn.hasDataFillApply === 'function', 'hasDataFillApply exported');

  // --- B) Overview → Apply-start (data-fill-apply wins) → form fill ---
  const html = fixtureHtml();
  const page = createPage(html, FILL_LIBS);
  const doc = page.document;

  // Wire fixture behaviour (script stripped for jsdom)
  const applyBtn = doc.getElementById('apply');
  const app = doc.getElementById('application');
  const nextBtn = doc.getElementById('next');
  const reviewBtn = doc.getElementById('review-step');
  const submitBtn = doc.getElementById('submit');
  applyBtn.addEventListener('click', function () {
    app.hidden = false;
    app.style.display = 'block';
  });
  nextBtn.addEventListener('click', function () {
    nextBtn.hidden = true;
    reviewBtn.hidden = false;
  });
  reviewBtn.addEventListener('click', function () {
    reviewBtn.hidden = true;
    submitBtn.hidden = false;
  });

  // Force visibility for jsdom (getBoundingClientRect often 0x0)
  const Syn2 = page.window.FillApplySynonyms;
  const origVisible = Syn2.isVisible;
  Syn2.isVisible = function (el) {
    if (!el) return false;
    if (el.hidden) return false;
    try {
      const st = el.style && el.style.display;
      if (st === 'none') return false;
    } catch (_e) {}
    return true;
  };

  const starts = Syn2.findApplyStartButtons(doc);
  suite.ok(starts.length >= 1, 'finds Apply-start on overview');
  suite.equal(starts[0] && starts[0].id, 'apply', 'data-fill-apply=apply-start wins over ambiguous text');
  suite.ok(
    !starts.some(function (el) {
      return el.id === 'ai-upsell' || el.id === 'upgrade';
    }),
    'never selects AI Auto-Apply / Upgrade'
  );

  const FA = page.window.__fillApply;
  suite.ok(FA && typeof FA.run === 'function', '__fillApply.run present');

  const result = await FA.run(PROFILE, {
    skipCvImport: true,
    formWaitMs: 50,
    applyOpenTimeoutMs: 200,
    dependentWaitMs: 20,
    maxDependentPasses: 1,
    progressPlateauMs: 2000
  });

  suite.ok(result && (result.ok || result.clickedApplyStart || result.filled > 0), 'run engages overview');
  suite.ok(
    !!result.clickedApplyStart || result.filled >= 2 || doc.getElementById('fn').value === 'Alex',
    'Apply-start clicked or fields already filled'
  );

  // If first pass only opened the form, run again (mirrors runner re-detect)
  let fillResult = result;
  if (!(doc.getElementById('fn').value === 'Alex') && !app.hidden) {
    fillResult = await FA.run(PROFILE, {
      skipCvImport: true,
      formWaitMs: 20,
      applyOpenTimeoutMs: 50,
      dependentWaitMs: 20,
      maxDependentPasses: 1,
      progressPlateauMs: 2000
    });
  }

  suite.equal(doc.getElementById('fn').value, 'Alex', 'filled first name after Apply-start');
  suite.equal(doc.getElementById('ln').value, 'Sample', 'filled last name');
  suite.equal(doc.getElementById('em').value, 'alex.sample@example.com', 'filled email');
  suite.ok(fillResult.filled >= 3 || doc.getElementById('fn').value === 'Alex', 'filled count ok');

  // --- C) data-fill-apply=continue preferred; Review advances ---
  const cont = Syn2.findContinueButtons(doc);
  suite.ok(cont.length >= 1, 'findContinueButtons finds Continue');
  suite.equal(cont[0] && cont[0].id, 'next', 'data-fill-apply=continue is Continue button');

  const clicked = FA.clickContinueButtons();
  suite.ok(clicked && clicked.length >= 1, 'clickContinueButtons advances');
  suite.ok(!nextBtn.hidden === false || reviewBtn.hidden === false, 'Continue revealed Review');

  // Restore Review visibility path
  if (reviewBtn.hidden === false) {
    const cont2 = Syn2.findContinueButtons(doc);
    suite.ok(
      cont2.some(function (el) {
        return el.id === 'review-step';
      }),
      'Review found as continue CTA'
    );
    const clickedReview = FA.clickContinueButtons();
    suite.ok(clickedReview && clickedReview.length >= 1, 'clicked Review advance');
  }

  // --- D) data-fill-apply=submit preferred over Apply-start leftovers ---
  submitBtn.hidden = false;
  const submits = Syn2.findSubmitButtons(doc);
  suite.ok(
    submits.some(function (el) {
      return el.id === 'submit';
    }),
    'findSubmitButtons includes data-fill-apply=submit'
  );

  // --- E) Ambiguous text loses to stamped Apply-start ---
  const pageAmb = createPage(
    `
    <button id="noise">Start free trial</button>
    <a id="marked" data-fill-apply="apply-start" href="#form">Open</a>
    <button id="paid">Subscribe</button>
    <div id="form" style="display:none">
      <input name="email" type="email" />
    </div>
  `,
    ['lib/dom-deep.js', 'lib/synonyms.js']
  );
  // Visibility stub
  pageAmb.window.FillApplySynonyms.isVisible = function (el) {
    return !!(el && !el.hidden);
  };
  const ranked = pageAmb.window.FillApplySynonyms.findApplyStartButtons(pageAmb.document);
  suite.equal(ranked[0] && ranked[0].id, 'marked', 'stamped apply-start beats ambiguous Open/noise');
  suite.ok(
    !ranked.some(function (el) {
      return el.id === 'paid';
    }),
    'Subscribe never Apply-start'
  );

  // --- F) Live JobPool queue preserves url / ats / sourceId ---
  const backendPage = createPage('<div></div>', ['lib/types.js']);
  const buckets = { queued: [], applied: [], failed: [], cancelled: [] };
  backendPage.window.FillApplyStorage = {
    KEYS: backendPage.window.FillApplyTypes.STORAGE_KEYS,
    isHttpUrl: function (u) {
      return /^https?:\/\//i.test(String(u || ''));
    },
    isBlockedUrl: function () {
      return false;
    },
    getRunConfig: async function () {
      return { mockMode: false, backendBaseUrl: 'https://jobpool.example' };
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
    appendSessionLog: async function () {},
    get: async function () {
      return {};
    },
    set: async function () {},
    getMockQueueUrls: async function () {
      return [];
    }
  };
  const fetchCalls = [];
  backendPage.window.fetch = async function (url) {
    fetchCalls.push(String(url));
    const payload = {
          jobs: [
            {
              id: 'jp-42',
              title: 'FP&A Manager',
              company: 'Acme',
              url: 'https://boards.greenhouse.io/acme/jobs/99',
              ats: 'greenhouse',
              sourceId: 'greenhouse',
              extraFromJobPool: true
            },
            {
              id: 'jp-43',
              applyUrl: 'https://jobs.lever.co/acme/abc',
              title: 'Ops'
            }
          ]
        };
    const body = JSON.stringify(payload);
    return {
      ok: true,
      status: 200,
      headers: { get: function () { return 'application/json'; } },
      json: async function () {
        return payload;
      },
      text: async function () {
        return body;
      }
    };
  };
  backendPage.window.eval(
    fs.readFileSync(path.join(ROOT, 'lib/backend.js'), 'utf8')
  );
  const B = backendPage.window.FillApplyBackend;
  suite.ok(typeof B.normalizeLiveJob === 'function', 'normalizeLiveJob exported');
  const queue = await B.getQueue();
  suite.equal(queue.length, 2, 'live queue normalized to 2 jobs');
  suite.equal(queue[0].id, 'jp-42', 'preserves JobPool id');
  suite.equal(queue[0].url, 'https://boards.greenhouse.io/acme/jobs/99', 'preserves url');
  suite.equal(queue[0].ats, 'greenhouse', 'preserves ats');
  suite.equal(queue[0].sourceId, 'greenhouse', 'preserves sourceId');
  suite.ok(queue[0].extraFromJobPool === true, 'preserves unknown JobPool fields');
  suite.equal(queue[1].sourceId, 'lever', 'detects sourceId from Lever URL when omitted');
  suite.ok(queue[1].url.indexOf('lever.co') !== -1, 'maps applyUrl → url');

  // JobPool status contract unchanged: only submitted = Applied
  const T = backendPage.window.FillApplyTypes;
  suite.equal(T.jobPoolOutcome({ ok: true, submitted: true }), 'submitted', 'submitted = Applied');
  suite.equal(
    T.jobPoolOutcome({ ok: true, filled: 4, submitted: false }),
    'filled',
    'fill-only is not Applied'
  );

  // Restore visibility if needed (no-op)
  void origVisible;

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
