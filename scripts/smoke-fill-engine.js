/**
 * Fill engine: label resolution, typed control handling, async dropdowns and
 * profile answer lookup.
 *
 * Run: node scripts/smoke-fill-engine.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const LIBS = [
  'lib/dom-deep.js',
  'lib/format.js',
  'lib/synonyms.js',
  'lib/field-map.js',
  'lib/files.js',
  'content/fill.js'
];

const suite = createSuite('smoke-fill-engine');

const PROFILE = {
  firstName: 'Zahid',
  lastName: 'Ali',
  fullName: 'Chaudhary Zahid Ali',
  email: 'zahid@example.com',
  phone: '+966500000000',
  linkedin: 'https://linkedin.com/in/zahid',
  authorizedToWork: 'Yes',
  requiresSponsorship: 'No',
  coverLetter: 'I lead FP&A for a KSA retail group.',
  customAnswers: {
    currentSalary: '25000 AED',
    noticePeriod: 'Immediate',
    largestTeamSize: '11-20'
  },
  customQA: [{ question: 'Why should we hire you', answer: 'Fifteen years in FP&A.' }]
};

function run(page, options) {
  return page.window.__fillApply.run(PROFILE, options || {});
}

(async function main() {
  /* Labels rendered as sibling divs rather than <label for> — the layout the
   * old previousElementSibling-only lookup could not read. */
  await (async function labelResolution() {
    const page = createPage(
      `
      <div class="field">
        <div class="field__label"><span>Email address</span></div>
        <div class="field__control"><input type="email" /></div>
      </div>
      <div class="field">
        <label>Phone number</label>
        <div><input type="tel" /></div>
      </div>
      <div class="field"><input aria-label="LinkedIn profile" type="url" /></div>
    `,
      LIBS
    );
    const D = page.window.FillApplyDom;
    const inputs = page.document.querySelectorAll('input');
    suite.equal(D.labelFor(inputs[0]), 'Email address', 'label read from a wrapper div');
    suite.equal(D.labelFor(inputs[1]), 'Phone number', 'label read from a non-adjacent <label>');
    suite.equal(D.labelFor(inputs[2]), 'LinkedIn profile', 'label read from aria-label');
  })();

  await (async function requiredDetection() {
    const page = createPage(
      `
      <div class="field"><label for="a">First name *</label><input id="a" /></div>
      <div class="field"><label for="b">Middle name</label><input id="b" /></div>
      <div class="field"><label for="c">Email</label><input id="c" aria-required="true" /></div>
    `,
      LIBS
    );
    const D = page.window.FillApplyDom;
    const doc = page.document;
    suite.ok(D.isRequired(doc.getElementById('a')), 'asterisk in the label marks a field required');
    suite.ok(!D.isRequired(doc.getElementById('b')), 'plain label is not required');
    suite.ok(D.isRequired(doc.getElementById('c')), 'aria-required marks a field required');
  })();

  await (async function fillsTypedControls() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="fn">First Name</label><input id="fn" /></div>
        <div class="field"><label for="ln">Last Name</label><input id="ln" /></div>
        <div class="field"><label for="em">Email</label><input id="em" type="email" /></div>
        <div class="field"><label for="ph">Phone</label><input id="ph" type="tel" /></div>
        <div class="field"><label for="li">LinkedIn URL</label><input id="li" type="url" /></div>
        <div class="field"><label for="cl">Cover letter</label><textarea id="cl"></textarea></div>
        <div class="field">
          <label for="auth">Are you legally authorized to work?</label>
          <select id="auth"><option value="">Select...</option><option>Yes</option><option>No</option></select>
        </div>
        <button type="submit">Submit application</button>
      </div>
    `,
      LIBS
    );
    const result = await run(page);
    const doc = page.document;

    suite.ok(result.ok, 'run() completes on a standard form');
    suite.equal(doc.getElementById('fn').value, 'Zahid', 'first name filled');
    suite.equal(doc.getElementById('em').value, 'zahid@example.com', 'email filled');
    suite.equal(doc.getElementById('ph').value, '+966500000000', 'phone filled');
    suite.equal(doc.getElementById('li').value, PROFILE.linkedin, 'linkedin filled');
    suite.equal(doc.getElementById('cl').value, PROFILE.coverLetter, 'cover letter filled');
    suite.equal(doc.getElementById('auth').value, 'Yes', 'work authorization select resolved');
    suite.ok(result.filled >= 6, 'reports the number of fields filled (' + result.filled + ')');
  })();

  /* Number inputs reject "25000 AED"; the value has to be coerced. */
  await (async function sanitizesNumericInput() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" type="email" /></div>
        <div class="field"><label for="sal">Current salary</label><input id="sal" type="number" /></div>
      </div>
    `,
      LIBS
    );
    await run(page);
    suite.equal(page.document.getElementById('sal').value, '25000', 'currency stripped for a number input');
  })();

  /* Source-profile answers live under customAnswers with terse keys, while the
   * page asks a full question. */
  await (async function customAnswersReachThePage() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" type="email" /></div>
        <div class="field"><label for="np">What is your notice period?</label><input id="np" /></div>
        <div class="field"><label for="ts">Largest team size managed</label><input id="ts" /></div>
        <div class="field"><label for="why">Why should we hire you?</label><textarea id="why"></textarea></div>
      </div>
    `,
      LIBS
    );
    await run(page);
    const doc = page.document;
    suite.equal(doc.getElementById('np').value, 'Immediate', 'customAnswers.noticePeriod matched a full question');
    suite.equal(doc.getElementById('ts').value, '11-20', 'customAnswers.largestTeamSize matched a reworded label');
    suite.equal(doc.getElementById('why').value, 'Fifteen years in FP&A.', 'customQA matched a reworded question');
  })();

  /* The central bug: listbox options render on a later tick, usually portalled
   * to <body>, so a same-tick query can never see them. */
  await (async function asyncCustomDropdown() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" type="email" /></div>
        <div class="field">
          <label id="lbl-auth">Work authorization</label>
          <button id="auth" type="button" aria-haspopup="listbox" aria-labelledby="lbl-auth">Select...</button>
        </div>
      </div>
    `,
      LIBS
    );
    const window = page.window;
    const doc = page.document;
    const trigger = doc.getElementById('auth');

    trigger.addEventListener('click', function () {
      if (doc.getElementById('auth-listbox')) return;
      window.setTimeout(function () {
        const list = doc.createElement('ul');
        list.id = 'auth-listbox';
        list.setAttribute('role', 'listbox');
        ['Yes', 'No', 'Not sure'].forEach(function (label) {
          const item = doc.createElement('li');
          item.setAttribute('role', 'option');
          item.textContent = label;
          item.addEventListener('click', function () {
            trigger.textContent = label;
            list.remove();
          });
          list.appendChild(item);
        });
        doc.body.appendChild(list);
      }, 150);
    });

    await run(page);
    suite.equal(trigger.textContent, 'Yes', 'async listbox option selected after it renders');
  })();

  await (async function checkboxAndRadioUseRealClicks() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" type="email" /></div>
        <fieldset>
          <legend>Do you require sponsorship?</legend>
          <label><input type="radio" name="sponsorship" value="yes" /> Yes</label>
          <label><input type="radio" name="sponsorship" value="no" /> No</label>
        </fieldset>
      </div>
    `,
      LIBS
    );
    let clicks = 0;
    page.document.querySelectorAll('input[type="radio"]').forEach(function (radio) {
      radio.addEventListener('click', function () {
        clicks += 1;
      });
    });

    await run(page);
    const chosen = page.document.querySelector('input[name="sponsorship"]:checked');
    suite.ok(!!chosen, 'a radio in the group is selected');
    suite.equal(chosen && chosen.value, 'no', 'the radio matching the profile answer is chosen');
    suite.ok(clicks > 0, 'the radio is chosen with a real click so framework state updates');
  })();

  /* Consent and voluntary self-identification stay with the human. */
  await (async function reportsWithoutInventing() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" type="email" /></div>
        <div class="field"><label for="agree"><input id="agree" type="checkbox" required /> I agree to the privacy policy</label></div>
        <section class="eeo">
          <h3>Voluntary self-identification</h3>
          <div class="field"><label for="gender">Gender</label>
            <select id="gender"><option value="">Select...</option><option>Male</option><option>Female</option></select>
          </div>
        </section>
        <div class="field"><label for="ref">How did you hear about us?</label><input id="ref" required /></div>
      </div>
    `,
      LIBS
    );
    const result = await run(page);
    const doc = page.document;

    suite.ok(!doc.getElementById('agree').checked, 'consent checkbox is never ticked automatically');
    suite.equal(doc.getElementById('gender').value, '', 'voluntary self-identification is left blank');
    suite.ok(
      result.skipped.some(function (s) {
        return s.reason === 'consent_checkbox';
      }),
      'consent checkbox is reported as needing the applicant'
    );
    suite.ok(
      result.skipped.some(function (s) {
        return s.reason === 'voluntary_self_identification';
      }),
      'EEO field is reported as skipped by policy'
    );
    suite.ok(
      result.missingRequired.indexOf('How did you hear about us?') !== -1,
      'unanswerable required field is named in missingRequired'
    );
  })();

  await (async function fillsInsideShadowRoot() {
    const page = createPage('<div id="host"></div>', LIBS);
    const shadow = page.document.getElementById('host').attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <div class="field"><label for="em">Email</label><input id="em" type="email" /></div>
      <div class="field"><label for="fn">First Name</label><input id="fn" /></div>
      <div class="field"><label for="ln">Last Name</label><input id="ln" /></div>
      <button type="submit">Submit application</button>
    `;

    const result = await run(page);
    suite.equal(shadow.getElementById('em').value, 'zahid@example.com', 'field inside a shadow root is filled');
    suite.ok(result.filled >= 3, 'shadow-root fields are counted in the result');
  })();

  /* Page furniture must never be filled. */
  await (async function ignoresPageFurniture() {
    const page = createPage(
      `
      <header><input type="search" name="q" placeholder="Search jobs" /></header>
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" type="email" /></div>
        <div class="field"><label for="fn">First Name</label><input id="fn" /></div>
      </div>
      <footer><label for="nl">Newsletter email</label><input id="nl" name="newsletter_email" type="email" /></footer>
    `,
      LIBS
    );
    await run(page);
    const doc = page.document;
    suite.equal(doc.getElementById('em').value, 'zahid@example.com', 'application email is filled');
    suite.equal(doc.getElementById('nl').value, '', 'newsletter signup is left alone');
    suite.equal(doc.querySelector('input[type="search"]').value, '', 'search box is left alone');
  })();

  /* An overview page with no form should say so plainly instead of reporting
   * a successful fill of zero fields. */
  await (async function reportsWhenThereIsNoForm() {
    const page = createPage(
      `
      <main>
        <h1>Strategic Finance Manager</h1>
        <div class="job-description"><p>Responsibilities: own the model.</p></div>
      </main>
    `,
      LIBS
    );
    const result = await run(page);
    suite.ok(result.ok === false, 'a page with no form is reported as a failure');
    suite.ok(
      /no application form fields/i.test(result.error || ''),
      'the error names the actual problem (' + result.error + ')'
    );
  })();

  suite.finish();
})();
