/**
 * Form-open detection: React-rendered application forms must count as open,
 * and page furniture must not.
 *
 * Run: node scripts/smoke-form-detection.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const LIBS = ['lib/dom-deep.js', 'lib/synonyms.js'];
const suite = createSuite('smoke-form-detection');

/* An Ashby/Lever style form: no <form id="application">, no whitelisted
 * container class, labels as sibling divs. This is the shape the old
 * container-whitelist check scored as "not an application form". */
const REACT_FORM = `
  <div class="_container_xyz">
    <h1>Strategic Finance Manager</h1>
    <div class="_fieldEntry">
      <label for="fn">First Name</label>
      <input id="fn" type="text" />
    </div>
    <div class="_fieldEntry">
      <label for="ln">Last Name</label>
      <input id="ln" type="text" />
    </div>
    <div class="_fieldEntry">
      <label for="em">Email</label>
      <input id="em" type="email" />
    </div>
    <div class="_fieldEntry">
      <label for="rs">Resume</label>
      <input id="rs" type="file" />
    </div>
    <button type="submit">Submit Application</button>
  </div>
`;

(function reactFormCountsAsOpen() {
  const page = createPage(REACT_FORM, LIBS);
  const S = page.window.FillApplySynonyms;
  const signals = S.scoreApplicationForm(page.document);
  suite.ok(S.isApplicationFormOpen(page.document), 'React-rendered form is detected as open');
  suite.ok(signals.namedFields >= 3, 'named application fields are counted (' + signals.namedFields + ')');
  suite.ok(signals.hasFileInput, 'resume file input is detected');
  suite.ok(signals.hasFinalSubmit, 'Submit Application is recognised as a final submit CTA');
})();

/* A job overview page: description plus a search box and a newsletter signup.
 * Nothing here is an application form. */
(function jobOverviewIsNotOpen() {
  const page = createPage(
    `
    <header><input type="search" name="q" placeholder="Search jobs" /></header>
    <main>
      <h1>Strategic Finance Manager</h1>
      <div class="job-description">
        <h2>Responsibilities</h2>
        <p>Own the forecasting model.</p>
      </div>
      <a href="/apply" class="btn">Apply for this job</a>
    </main>
    <footer>
      <label for="nl">Subscribe to our newsletter</label>
      <input id="nl" name="newsletter_email" type="email" />
    </footer>
  `,
    LIBS
  );
  const S = page.window.FillApplySynonyms;
  suite.ok(!S.isApplicationFormOpen(page.document), 'job overview page is not treated as an open form');
  suite.ok(S.findApplyStartButtons(page.document).length === 1, 'the Apply CTA is found on the overview');
  suite.ok(S.shouldClickApplyStart(page.document), 'Apply-start is the right action on an overview page');
})();

(function loginFormIsNotAnApplication() {
  const page = createPage(
    `
    <form id="signin">
      <label for="u">Email</label><input id="u" type="email" name="email" />
      <label for="p">Password</label><input id="p" type="password" name="password" />
      <button type="submit">Sign in</button>
    </form>
  `,
    LIBS
  );
  const S = page.window.FillApplySynonyms;
  suite.ok(!S.isApplicationFormOpen(page.document), 'sign-in form is not treated as an application');
})();

/* The embed case: a career site whose real form lives in a same-origin iframe. */
(function sameOriginIframeFormIsFound() {
  const page = createPage('<h1>Careers</h1><iframe id="gh"></iframe>', LIBS);
  const frame = page.document.getElementById('gh');
  const innerDoc = frame.contentDocument;
  innerDoc.body.innerHTML = REACT_FORM;
  // The harness patches layout on the outer window only.
  innerDoc.defaultView.Element.prototype.getBoundingClientRect = function () {
    return { width: 200, height: 24, top: 0, left: 0, right: 200, bottom: 24 };
  };

  const S = page.window.FillApplySynonyms;
  suite.ok(S.isApplicationFormOpen(page.document), 'form inside a same-origin iframe is detected');
})();

/* Design systems that wrap controls in an open shadow root. */
(function shadowDomFormIsFound() {
  const page = createPage('<div id="host"></div>', LIBS);
  const host = page.document.getElementById('host');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = REACT_FORM;

  const S = page.window.FillApplySynonyms;
  suite.ok(S.isApplicationFormOpen(page.document), 'form inside an open shadow root is detected');
})();

suite.finish();
