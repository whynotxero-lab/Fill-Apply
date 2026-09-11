/**
 * Documents: the resume and cover letter loaded into the extension ahead of
 * time have to land on the page's upload control without ever handing the
 * applicant back to their file system.
 *
 * Run: node scripts/smoke-documents.js
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

const suite = createSuite('smoke-documents');

/** "Preloaded" documents, the same shape App Settings stores. */
const DOCUMENTS = {
  resume: { name: 'zahid-ali-cv.pdf', mime: 'application/pdf', base64: btoaAscii('%PDF-1.4 resume') },
  cover: { name: 'cover-letter.docx', mime: '', base64: btoaAscii('cover letter text') }
};

const PROFILE = {
  firstName: 'Zahid',
  lastName: 'Ali',
  email: 'zahid@example.com',
  phone: '501234567',
  phoneCountry: '+971'
};

function btoaAscii(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

/**
 * The waits that let a slow SPA render are real, but jsdom renders everything
 * up front, so the suite shortens them rather than idling through each one.
 */
function fill(page, documents) {
  return page.window.__fillApply.run(
    PROFILE,
    Object.assign({ formWaitMs: 300, documentWaitMs: 200 }, documents ? { documents: documents } : {})
  );
}

const FORM = `
  <div id="application-form">
    <div class="field"><label for="fn">First name</label><input id="fn" name="first_name" /></div>
    <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
  </div>
`;

(async function main() {
  /* The plain case: a visible resume input. */
  await (async function visibleInput() {
    const page = createPage(
      FORM.replace(
        '</div>\n',
        '<div class="field"><label for="cv">Resume/CV</label><input id="cv" name="resume" type="file" /></div></div>\n'
      ),
      LIBS
    );
    const result = await fill(page, DOCUMENTS);
    const input = page.document.getElementById('cv');
    suite.ok(!!(input.files && input.files.length), 'the stored resume is attached to the file input');
    suite.equal(
      input.files && input.files[0] && input.files[0].name,
      'zahid-ali-cv.pdf',
      'the attached file keeps the stored filename'
    );
    suite.ok(result.resumeAttached, 'the run reports the resume as attached');
  })();

  /* Greenhouse-style: a hidden input behind an Attach button whose handler
   * calls input.click(). In a browser that opens the OS file dialog. */
  await (async function hiddenInputBehindAttachButton() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="fn">First name</label><input id="fn" name="first_name" /></div>
        <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
        <div class="field">
          <span class="label">Resume</span>
          <button type="button" id="attach">Attach</button>
          <input id="cv" name="resume" type="file" style="display:none" />
        </div>
      </div>
    `,
      LIBS
    );
    const window = page.window;
    let pickerOpened = 0;
    window.document.getElementById('attach').addEventListener('click', function () {
      pickerOpened += 1;
      window.document.getElementById('cv').click();
    });

    const result = await fill(page, DOCUMENTS);
    const input = page.document.getElementById('cv');
    suite.ok(!!(input.files && input.files.length), 'a hidden input behind Attach still gets the resume');
    suite.ok(result.resumeAttached, 'the hidden-input attach is reported');
    suite.equal(pickerOpened, 0, 'the Attach button is not clicked when its input can be found directly');
  })();

  /* An Attach button that builds its input on click: the click is the only way
   * to learn which input the site wants, and it must not reach the operating
   * system's file chooser. */
  await (async function pickerIsSuppressed() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="fn">First name</label><input id="fn" name="first_name" /></div>
        <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
        <div class="upload"><button type="button" id="attach">Upload resume</button></div>
      </div>
      <div id="portal"></div>
    `,
      LIBS
    );
    const window = page.window;
    const doc = page.document;
    let nativeDialogs = 0;

    const realClick = window.HTMLInputElement.prototype.click;
    window.HTMLInputElement.prototype.click = function () {
      if (String(this.type).toLowerCase() === 'file') nativeDialogs += 1;
      return realClick.apply(this, arguments);
    };

    doc.getElementById('attach').addEventListener('click', function () {
      const input = doc.createElement('input');
      input.type = 'file';
      input.id = 'cv';
      input.name = 'resume';
      input.style.display = 'none';
      doc.getElementById('portal').appendChild(input);
      input.click();
    });

    const result = await fill(page, DOCUMENTS);
    window.HTMLInputElement.prototype.click = realClick;

    suite.equal(nativeDialogs, 0, 'the file dialog is never opened');
    suite.ok(result.filesAttached.suppressedPickers > 0, 'the intercepted picker call is reported');
    const created = doc.getElementById('cv');
    suite.ok(
      !!(created && created.files && created.files.length),
      'the input the site asked for gets the stored resume'
    );
  })();

  /* A <label for> bound to a file input opens the dialog through the label's
   * own activation behaviour, which cannot be intercepted — so it is only ever
   * used to find its input. */
  await (async function labelIsNeverClicked() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="fn">First name</label><input id="fn" name="first_name" /></div>
        <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
        <div class="field">
          <label for="cv" class="button">Attach resume</label>
          <input id="cv" name="resume" type="file" style="display:none" />
        </div>
      </div>
    `,
      LIBS
    );
    let labelClicks = 0;
    page.document.querySelector('label[for="cv"]').addEventListener('click', function () {
      labelClicks += 1;
    });
    await fill(page, DOCUMENTS);
    suite.equal(labelClicks, 0, 'a label bound to a file input is not clicked');
    const input = page.document.getElementById('cv');
    suite.ok(!!(input.files && input.files.length), 'the label is used to locate its input instead');
  })();

  /* Resume and cover letter go to their own inputs. */
  await (async function bothDocuments() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
        <div class="field"><label for="cv">Resume</label><input id="cv" name="resume" type="file" /></div>
        <div class="field"><label for="cl">Cover letter</label><input id="cl" name="cover_letter" type="file" /></div>
      </div>
    `,
      LIBS
    );
    const result = await fill(page, DOCUMENTS);
    suite.equal(
      page.document.getElementById('cv').files[0].name,
      'zahid-ali-cv.pdf',
      'the resume goes to the resume input'
    );
    suite.equal(
      page.document.getElementById('cl').files[0].name,
      'cover-letter.docx',
      'the cover letter goes to the cover-letter input'
    );
    suite.ok(result.coverAttached, 'the cover letter attach is reported');
  })();

  /* A .docx stored with no content type still has to arrive as a .docx, since
   * forms validate the file's own type. */
  await (async function mimeIsInferred() {
    const page = createPage(FORM, LIBS);
    const F = page.window.FillApplyFiles;
    suite.equal(
      F.mimeForName('cover-letter.docx', ''),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'a missing content type is inferred from the filename'
    );
    suite.equal(
      F.mimeForName('resume.pdf', 'application/octet-stream'),
      'application/pdf',
      'a generic content type is replaced with the real one'
    );
  })();

  /* Never claim success when the form does not take the file type we hold. */
  await (async function acceptMismatchIsReported() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
        <div class="field">
          <label for="cv">Resume</label>
          <input id="cv" name="resume" type="file" accept=".doc,.docx" />
        </div>
      </div>
    `,
      LIBS
    );
    const result = await fill(page, { resume: DOCUMENTS.resume });
    const input = page.document.getElementById('cv');
    suite.ok(!(input.files && input.files.length), 'a file the form rejects is not attached');
    suite.ok(!result.resumeAttached, 'the resume is not reported as attached');
    suite.ok(result.filesAttached.needsManual, 'the mismatch is flagged for the applicant');
    suite.ok(
      /not one of the types this form accepts/.test(result.filesAttached.errors.join(' ')),
      'the message names the problem'
    );
  })();

  /* A resume the site already holds is left where it is. */
  await (async function existingUploadIsKept() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
        <div class="field">
          <label for="cv">Resume</label>
          <div class="uploaded">alex-rivera-resume.pdf <button type="button">Replace</button></div>
          <input id="cv" name="resume" type="file" style="display:none" />
        </div>
      </div>
    `,
      LIBS
    );
    const result = await fill(page, DOCUMENTS);
    const input = page.document.getElementById('cv');
    suite.ok(!(input.files && input.files.length), 'an upload the site already has is not overwritten');
    suite.equal(
      result.filesAttached.alreadyAttached[0].name,
      'alex-rivera-resume.pdf',
      'the existing upload is reported by name'
    );
    suite.ok(result.resumeAttached, 'the resume requirement counts as satisfied');
  })();

  /* Attaching twice on the same page must not attach twice. */
  await (async function repeatPassIsIdempotent() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
        <div class="field"><label for="cv">Resume</label><input id="cv" name="resume" type="file" /></div>
      </div>
    `,
      LIBS
    );
    await fill(page, DOCUMENTS);
    const second = await fill(page, DOCUMENTS);
    suite.equal(
      page.document.getElementById('cv').files.length,
      1,
      'the input still holds exactly one file after a second pass'
    );
    suite.equal(
      second.filesAttached.attached.length,
      0,
      'the second pass attaches nothing new'
    );
    suite.ok(second.resumeAttached, 'the second pass still reports the resume as present');
  })();

  /* A step whose only control is the upload is still work worth doing. */
  await (async function uploadOnlyStep() {
    const page = createPage(
      `
      <div id="application-form">
        <h2>Upload your CV</h2>
        <input id="cv" name="resume" type="file" required />
        <button type="submit">Submit application</button>
      </div>
    `,
      LIBS
    );
    const result = await fill(page, DOCUMENTS);
    suite.ok(result.ok, 'an upload-only step does not fail the job');
    suite.ok(result.documentStep, 'the step is reported as a document step');
    suite.ok(
      !!(page.document.getElementById('cv').files || []).length,
      'the resume is attached on an upload-only step'
    );
  })();

  /* Multi-step applications keep the upload behind Continue, so a single pass
   * before advancing can never reach it. */
  await (async function uploadStepBehindContinue() {
    const page = createPage(
      `
      <div id="application-form">
        <div id="step1">
          <div class="field"><label for="fn">First name</label><input id="fn" name="first_name" /></div>
          <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
          <button type="button" id="next">Continue</button>
        </div>
      </div>
    `,
      LIBS.concat(['adapters/registry.js', 'adapters/fallback.js'])
    );

    const doc = page.document;
    doc.getElementById('next').addEventListener('click', function () {
      doc.getElementById('application-form').innerHTML =
        '<div class="field"><span class="label">Resume</span>' +
        '<input id="cv" name="resume" type="file" required /></div>' +
        '<button type="submit">Submit application</button>';
    });

    const result = await page.window.FillApplyFallbackAdapter.fill({
      profile: PROFILE,
      documents: DOCUMENTS,
      runMode: 'ready',
      adapterId: 'fallback',
      fileInputHints: [],
      options: { formWaitMs: 300, documentWaitMs: 200 }
    });

    suite.ok(result.advanced, 'the adapter advanced past the first step');
    const revealed = doc.getElementById('cv');
    suite.ok(
      !!(revealed && revealed.files && revealed.files.length),
      'the upload control revealed by Continue receives the stored resume'
    );
    suite.ok(result.resumeAttached, 'the adapter reports the resume as attached after advancing');
  })();

  /* No stored documents: report it, never guess. */
  await (async function noDocuments() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" /></div>
        <div class="field"><label for="cv">Resume</label><input id="cv" name="resume" type="file" /></div>
      </div>
    `,
      LIBS
    );
    const result = await fill(page);
    suite.equal(result.filesAttached, null, 'nothing is attached when no documents are stored');
    suite.ok(result.ok, 'the fill itself still succeeds');
  })();

  suite.finish();
})();
