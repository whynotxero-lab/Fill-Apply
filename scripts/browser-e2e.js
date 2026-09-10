/**
 * End-to-end check in a real Chrome with the unpacked extension loaded.
 *
 * Serves a career page on one origin whose application form lives in an iframe
 * on a *different* origin — the shape the extension previously could not see at
 * all, and one that no same-document traversal can reach. Then drives the real
 * runner injection path from the extension's own service worker.
 *
 * Not part of `npm test`: needs Chrome and a display.
 * Run: node scripts/browser-e2e.js
 */
'use strict';

const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer-core');

const EXTENSION_PATH = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
const CAREER_PORT = 8711;
const ATS_PORT = 8712;

const ATS_FORM = `<!doctype html><html><body>
  <div class="_form">
    <h2>Application</h2>
    <div class="_fieldEntry"><div class="_label">First Name *</div><div><input id="fn" /></div></div>
    <div class="_fieldEntry"><div class="_label">Last Name *</div><div><input id="ln" /></div></div>
    <div class="_fieldEntry"><div class="_label">Email</div><div><input id="em" type="email" /></div></div>
    <div class="_fieldEntry"><div class="_label">Phone</div><div><input id="ph" type="tel" /></div></div>
    <div class="_fieldEntry"><div class="_label">LinkedIn URL</div><div><input id="li" type="url" /></div></div>
    <div class="_fieldEntry"><div class="_label">Expected salary</div><div><input id="sal" type="number" /></div></div>
    <div class="_fieldEntry"><div class="_label">Resume</div><div><input id="cv" type="file" /></div></div>
    <div class="_fieldEntry">
      <div class="_label" id="lbl-auth">Are you authorized to work?</div>
      <button id="auth" type="button" aria-haspopup="listbox" aria-labelledby="lbl-auth">Select...</button>
    </div>
    <div class="_fieldEntry"><div class="_label">Why should we hire you?</div><div><textarea id="why"></textarea></div></div>
    <button type="submit">Submit application</button>
  </div>
  <script>
    // A react-select style dropdown: options are portalled to <body> two
    // frames later, so a same-tick query can never see them.
    document.getElementById('auth').addEventListener('click', function () {
      if (document.getElementById('lb')) return;
      setTimeout(function () {
        var ul = document.createElement('ul');
        ul.id = 'lb';
        ul.setAttribute('role', 'listbox');
        ul.style.cssText = 'position:absolute;top:0;left:0;background:#fff';
        ['Yes', 'No'].forEach(function (t) {
          var li = document.createElement('li');
          li.setAttribute('role', 'option');
          li.textContent = t;
          li.style.cssText = 'padding:8px;width:120px';
          li.addEventListener('click', function () {
            document.getElementById('auth').textContent = t;
            ul.remove();
          });
          ul.appendChild(li);
        });
        document.body.appendChild(ul);
      }, 250);
    });
  </script>
</body></html>`;

const CAREER_PAGE = `<!doctype html><html><body>
  <h1>Acme — Strategic Finance Manager</h1>
  <div class="job-description"><p>Responsibilities: own the forecasting model.</p></div>
  <iframe src="http://127.0.0.1:${ATS_PORT}/form" style="width:900px;height:1200px;border:0"></iframe>
</body></html>`;

const PROFILE = {
  firstName: 'Zahid',
  lastName: 'Ali',
  fullName: 'Chaudhary Zahid Ali',
  email: 'zahid@example.com',
  phone: '+966500000000',
  linkedin: 'https://linkedin.com/in/zahid',
  authorizedToWork: 'Yes',
  customAnswers: { expectedSalary: '25000 SAR' },
  customQA: [{ question: 'Why should we hire you', answer: 'Fifteen years in FP&A.' }]
};

function serve(port, body) {
  return new Promise(function (resolve) {
    const server = http.createServer(function (_req, res) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(body);
    });
    server.listen(port, '127.0.0.1', function () {
      resolve(server);
    });
  });
}

const failures = [];
function check(condition, message) {
  if (condition) console.log('  ok  ' + message);
  else {
    console.error('  FAIL ' + message);
    failures.push(message);
  }
}

(async function main() {
  const careerServer = await serve(CAREER_PORT, CAREER_PAGE);
  const atsServer = await serve(ATS_PORT, ATS_FORM);

  // Chrome no longer honours --load-extension, so the unpacked extension is
  // installed through the CDP Extensions domain instead.
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    pipe: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-extension-debugging',
      '--window-size=1280,1000'
    ]
  });

  try {
    const cdp = await browser.target().createCDPSession();
    const loaded = await cdp.send('Extensions.loadUnpacked', { path: EXTENSION_PATH });
    check(!!(loaded && loaded.id), 'unpacked extension installed (' + (loaded && loaded.id) + ')');

    const workerTarget = await browser.waitForTarget(
      function (t) {
        return t.type() === 'service_worker' && t.url().indexOf('chrome-extension://') === 0;
      },
      { timeout: 20000 }
    );
    const worker = await workerTarget.worker();
    check(!!worker, 'extension service worker started');

    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + CAREER_PORT + '/', { waitUntil: 'networkidle2' });

    const frames = page.frames();
    check(frames.length >= 2, 'career page hosts a cross-origin application iframe');

    // Resolve the tab id the way the runner does, then run the real injection path.
    const tabId = await worker.evaluate(async function (url) {
      const tabs = await chrome.tabs.query({});
      const match = tabs.filter(function (t) {
        return t.url && t.url.indexOf(url) === 0;
      })[0];
      return match ? match.id : null;
    }, 'http://127.0.0.1:' + CAREER_PORT);
    check(tabId != null, 'runner can resolve the job tab');

    const result = await worker.evaluate(
      async function (id, profile) {
        return globalThis.FillApplyRunner.injectAndFill(
          id,
          profile,
          {},
          'fill',
          { actionDelayMinMs: 50, actionDelayMaxMs: 120, focusHud: false },
          { id: 'e2e', url: '' }
        );
      },
      tabId,
      PROFILE
    );

    console.log('  runner result: ' + JSON.stringify({
      ok: result && result.ok,
      adapterId: result && result.adapterId,
      filled: result && result.filled,
      total: result && result.total,
      frameId: result && result.frameId
    }));

    check(result && result.ok !== false, 'injection succeeded');
    check(result && result.filled > 0, 'fields were filled in the cross-origin iframe');
    check(result && result.frameId, 'the winning result came from the sub-frame, not the top frame');

    const formFrame = page.frames().filter(function (f) {
      return f.url().indexOf(String(ATS_PORT)) !== -1;
    })[0];
    const values = await formFrame.evaluate(function () {
      const val = function (id) {
        const el = document.getElementById(id);
        return el ? el.value : null;
      };
      return {
        fn: val('fn'),
        ln: val('ln'),
        em: val('em'),
        ph: val('ph'),
        li: val('li'),
        sal: val('sal'),
        why: val('why'),
        auth: document.getElementById('auth').textContent.trim()
      };
    });
    console.log('  form values: ' + JSON.stringify(values));

    check(values.fn === 'Zahid', 'first name filled from a wrapper-div label');
    check(values.em === 'zahid@example.com', 'email filled');
    check(values.ph === '+966500000000', 'phone filled');
    check(values.li === PROFILE.linkedin, 'linkedin filled');
    check(values.sal === '25000', 'salary coerced for a number input');
    check(values.why === 'Fifteen years in FP&A.', 'free-text question answered from customQA');
    check(values.auth === 'Yes', 'async portalled listbox option selected');

    const requiredReported = (result.details || []).filter(function (d) {
      return d && d.required;
    }).length;
    check(requiredReported >= 2, 'required fields are identified in the report (' + requiredReported + ')');

    if (process.env.E2E_SCREENSHOT) {
      await page.screenshot({ path: process.env.E2E_SCREENSHOT });
      console.log('  screenshot: ' + process.env.E2E_SCREENSHOT);
    }
  } finally {
    await browser.close();
    careerServer.close();
    atsServer.close();
  }

  if (failures.length) {
    console.error('\nFAILED browser-e2e: ' + failures.length + ' checks');
    process.exit(1);
  }
  console.log('\nPASS browser-e2e');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
