/**
 * On-page floating panel: relevance gating, corner positioning, three buttons.
 *
 * Run: node scripts/smoke-page-panel.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const LIBS = ['content/page-panel.js'];
const suite = createSuite('smoke-page-panel');

const JOB_FORM = `
  <main>
    <h1 id="job-title">Strategic Finance Manager</h1>
    <p class="job-description">Own the forecasting model.</p>
    <form id="application-form">
      <label for="fn">First name</label><input id="fn" name="first_name" />
      <label for="em">Email</label><input id="em" name="email" type="email" />
      <button type="button" id="apply">Apply Now</button>
      <button type="submit" id="send">Submit application</button>
    </form>
  </main>
`;

(function relevanceAndModes() {
  const page = createPage(JOB_FORM, LIBS);
  const P = page.window.FillApplyPagePanel;
  suite.ok(!!P, 'FillApplyPagePanel is attached');

  suite.equal(P.normalizeRunMode('Auto Fill'), 'fill', 'Auto Fill maps to fill');
  suite.equal(P.normalizeRunMode('Auto Ready'), 'ready', 'Auto Ready maps to ready');
  suite.equal(P.normalizeRunMode('Auto Submit'), 'submit', 'Auto Submit maps to submit');
  suite.equal(P.normalizeRunMode('ready'), 'ready', 'ready stays ready');
  suite.equal(P.normalizeRunMode('nope'), 'fill', 'unknown mode falls back to fill');

  suite.ok(P.isRestrictedUrl('chrome://extensions'), 'chrome:// is restricted');
  suite.ok(P.isRestrictedUrl('chrome-extension://abc/sidepanel.html'), 'extension pages are restricted');
  suite.ok(!P.isRestrictedUrl('https://boards.greenhouse.io/x/jobs/1'), 'https apply URL is allowed');

  suite.ok(
    P.isRelevantPage('https://boards.greenhouse.io/company/jobs/123', page.document),
    'known ATS host is relevant'
  );
  suite.ok(
    P.isRelevantPage('https://www.linkedin.com/jobs/view/123', page.document),
    'LinkedIn job URL is relevant'
  );
  suite.ok(
    !P.isRelevantPage('https://www.linkedin.com/feed/', null),
    'LinkedIn feed without a job/apply DOM is not treated as a job page'
  );
  suite.ok(
    P.isRelevantPage('https://jobs.example.com/careers/engineer', page.document),
    'career-path URL is relevant'
  );
  suite.ok(
    !P.isRelevantPage('chrome://settings', page.document),
    'chrome settings is not relevant'
  );
})();

(function positioningAvoidsPrimaryContent() {
  const page = createPage(JOB_FORM, LIBS);
  const P = page.window.FillApplyPagePanel;
  const viewport = { width: 1280, height: 800 };
  const panel = { width: P.PANEL_WIDTH, height: P.PANEL_HEIGHT };

  const titleAndCta = [
    { left: 40, top: 24, right: 640, bottom: 80 },
    { left: 40, top: 520, right: 220, bottom: 564 }
  ];
  const br = P.pickAnchor(viewport, panel, titleAndCta);
  suite.equal(br.id, 'bottom-right', 'default empty corner is bottom-right');
  suite.ok(br.overlap === 0, 'bottom-right does not overlap title/CTA keep-outs');

  const bottomRightBlocked = titleAndCta.concat([
    { left: 1040, top: 620, right: 1264, bottom: 784 }
  ]);
  const next = P.pickAnchor(viewport, panel, bottomRightBlocked);
  suite.ok(next.id !== 'bottom-right', 'blocked bottom-right yields another slot (' + next.id + ')');
  suite.ok(next.overlap === 0, 'fallback slot still avoids keep-outs');

  const midLeft = P.slotRect({ id: 'mid-left', v: 'mid', h: 'left' }, viewport, panel, 16);
  suite.ok(midLeft.left < 40, 'mid-left sits on the left edge');
  suite.ok(midLeft.top > 200 && midLeft.top < 500, 'mid-left is vertically centered');
})();

(function mountsThreeButtonsInShadow() {
  const page = createPage(JOB_FORM, LIBS);
  const P = page.window.FillApplyPagePanel;
  const host = page.document.getElementById(P.HOST_ID) || P.mount(page.document);
  suite.ok(!!host, 'panel host is in the document');
  suite.ok(!!host.shadowRoot, 'panel uses shadow DOM');
  suite.ok(host.style.position === 'fixed', 'host is position:fixed (not a page overlay)');

  const shadow = host.shadowRoot;
  const fill = shadow.querySelector('[data-mode="fill"]');
  const ready = shadow.querySelector('[data-mode="ready"]');
  const submit = shadow.querySelector('[data-mode="submit"]');
  suite.ok(fill && fill.textContent === 'Auto Fill', 'Auto Fill button');
  suite.ok(ready && ready.textContent === 'Auto Ready', 'Auto Ready button');
  suite.ok(submit && submit.textContent === 'Auto Submit', 'Auto Submit button');
  suite.ok(!!shadow.querySelector('.status'), 'status line is present');

  const style = shadow.querySelector('style');
  suite.ok(style && /pointer-events:\s*auto/.test(style.textContent), 'panel CSS isolates pointer-events to itself');
})();

suite.finish();
