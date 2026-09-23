/**
 * On-page floating panel: relevance gating, corner positioning, Start/Pause/Cancel.
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

  suite.equal(P.normalizeRunMode('Auto Register'), 'register', 'Auto Register maps to register');
  suite.equal(P.normalizeRunMode('Auto Fill'), 'fill', 'Auto Fill maps to fill');
  suite.equal(P.normalizeRunMode('Auto Navigate'), 'navigate', 'Auto Navigate maps to navigate');
  suite.equal(P.normalizeRunMode('Auto Ready'), 'ready', 'Auto Ready maps to ready');
  suite.equal(P.normalizeRunMode('Auto Submit'), 'submit', 'Auto Submit maps to submit');
  suite.equal(P.normalizeRunMode('jobpool'), 'submit', 'jobpool maps to submit');
  suite.equal(P.normalizeRunMode('Current page'), 'submit', 'Current page maps to submit');
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

  // Keep-outs on the right (Simplify-like) — panel should prefer LEFT.
  const titleAndCta = [
    { left: 640, top: 24, right: 1240, bottom: 80 },
    { left: 1040, top: 520, right: 1260, bottom: 564 }
  ];
  const bl = P.pickAnchor(viewport, panel, titleAndCta);
  suite.ok(/left/.test(bl.id), 'default prefers a left slot (got ' + bl.id + ')');
  suite.ok(bl.overlap === 0, 'left slot does not overlap keep-outs');

  const bottomLeftBlocked = titleAndCta.concat([
    { left: 16, top: 620, right: 240, bottom: 784 }
  ]);
  const next = P.pickAnchor(viewport, panel, bottomLeftBlocked);
  suite.ok(next.id !== 'bottom-left' || next.overlap === 0, 'blocked bottom-left yields usable slot (' + next.id + ')');
  suite.ok(next.overlap === 0, 'fallback slot still avoids keep-outs');

  const midLeft = P.slotRect({ id: 'mid-left', v: 'mid', h: 'left' }, viewport, panel, 16);
  suite.ok(midLeft.left < 40, 'mid-left sits on the left edge');
  suite.ok(midLeft.top > 200 && midLeft.top < 500, 'mid-left is vertically centered');
})();

(function mountsStartPauseCancel() {
  const page = createPage(JOB_FORM, LIBS);
  const P = page.window.FillApplyPagePanel;
  const host = page.document.getElementById(P.HOST_ID) || P.mount(page.document);
  suite.ok(!!host, 'panel host is in the document');
  suite.ok(!!host.shadowRoot, 'panel uses shadow DOM');
  suite.ok(host.style.position === 'fixed', 'host is position:fixed (not a page overlay)');

  const shadow = host.shadowRoot;
  const start = shadow.querySelector('[data-action="start"]');
  const pauseToggle = shadow.querySelector('[data-action="pause-toggle"]');
  const cancel = shadow.querySelector('[data-action="cancel"]');
  suite.ok(start && start.textContent === 'Start', 'Start button');
  suite.ok(pauseToggle && /Pause|Resume/.test(pauseToggle.textContent), 'Pause/Resume toggle');
  suite.ok(cancel && cancel.textContent === 'Cancel', 'Cancel button');
  suite.ok(!shadow.querySelector('[data-action="companion"]'), 'No Companion button');
  suite.ok(!shadow.querySelector('[data-action="jobpool"]'), 'No separate JobPool button');
  suite.ok(!shadow.querySelector('[data-action="current"]'), 'No separate Current page button');
  suite.ok(!shadow.querySelector('[data-action="stop"]'), 'No Stop button (renamed Cancel)');
  suite.ok(!shadow.querySelector('[data-mode="register"]'), 'No Auto Register mode button');
  suite.ok(!shadow.querySelector('[data-mode="fill"]'), 'No Auto Fill mode button');
  const wrap = shadow.querySelector('.wrap');
  suite.ok(wrap && !wrap.classList.contains('collapsed'), 'Panel always expanded');
  suite.ok(!!shadow.querySelector('.status'), 'status line is present');

  const style = shadow.querySelector('style');
  suite.ok(style && /pointer-events:\s*auto/.test(style.textContent), 'panel CSS isolates pointer-events to itself');

  // Smart entry: JobPool hub vs page
  suite.equal(
    P.detectSmartEntry && P.isJobPoolHubUrl
      ? P.isJobPoolHubUrl('https://zahid-jobpool.vercel.app/fill-apply')
        ? 'jobpool'
        : 'current'
      : 'missing',
    'jobpool',
    'hub URL detects jobpool entry'
  );
  suite.ok(
    P.isJobPoolHubUrl && !P.isJobPoolHubUrl('https://boards.greenhouse.io/x/jobs/1'),
    'employer page is not JobPool hub'
  );

  // Pause/Resume toggle labels
  P.setPanelPhase('running');
  P.syncActionButtons();
  suite.equal(pauseToggle.textContent, 'Pause', 'running shows Pause');
  suite.equal(pauseToggle.getAttribute('data-mode'), 'pause', 'data-mode=pause while running');
  P.setPanelPhase('paused');
  P.syncActionButtons();
  suite.equal(pauseToggle.textContent, 'Resume', 'paused shows Resume');
  suite.equal(pauseToggle.getAttribute('data-mode'), 'resume', 'data-mode=resume while paused');
  P.setPanelPhase('idle');
  P.syncActionButtons();
  suite.ok(pauseToggle.disabled, 'Pause disabled when idle');
})();

(function jobPoolApplicationsPanel() {
  const page = createPage(JOB_FORM, LIBS);
  const P = page.window.FillApplyPagePanel;
  suite.ok(
    P.isRelevantPage('https://zahid-jobpool.vercel.app/fill-apply', page.document),
    'JobPool /fill-apply hub shows page panel'
  );
  suite.ok(
    P.isRelevantPage('https://zahid-jobpool.vercel.app/applications', page.document),
    'JobPool Applications shows page panel (legacy)'
  );
  suite.ok(
    P.isRelevantPage('https://zahid-jobpool.vercel.app/applications?tab=ready', null),
    'JobPool Applications relevant without DOM'
  );
  suite.ok(
    P.KNOWN_HOST_RE.test('zahid-jobpool.vercel.app'),
    'KNOWN_HOST_RE includes JobPool'
  );
})();

suite.finish();
