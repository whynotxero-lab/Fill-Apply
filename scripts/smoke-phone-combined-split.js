/**
 * Phone layouts: ONE combined field (E.164) OR country-code dropdown + national.
 * Canonical: +966504131857 / +966 / 504131857 — never duplicate country code.
 * Run: node scripts/smoke-phone-combined-split.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-phone-combined-split');

const LIBS = [
  'lib/dom-deep.js',
  'lib/format.js',
  'lib/synonyms.js',
  'lib/field-map.js',
  'lib/control-adapter.js',
  'lib/files.js',
  'content/focus-hud.js',
  'content/fill.js'
];

const PROFILE = {
  firstName: 'Alex',
  lastName: 'Sample',
  email: 'alex.sample@example.com',
  phone: '504131857',
  phoneCountry: '+966',
  phoneFull: '+966504131857',
  phoneE164: '+966504131857'
};

async function run(page, profile) {
  return page.window.__fillApply.run(profile || PROFILE, {
    highlightUnmatched: false,
    runMode: 'fill'
  });
}

(async function main() {
  // Combined single tel → full E.164
  await (async function combined() {
    const page = createPage(
      `<form>
        <label for="ph">Phone</label>
        <input id="ph" name="phone" type="tel" autocomplete="tel" />
      </form>`,
      LIBS
    );
    await run(page);
    const v = page.document.getElementById('ph').value;
    suite.ok(/^\+966504131857$/.test(v) || v === '+966504131857', 'combined → +966504131857 (got ' + v + ')');
    suite.ok(!/\+966\+966/.test(v), 'combined does not duplicate dial');
  })();

  // Split: country select + national
  await (async function split() {
    const page = createPage(
      `<form>
        <label for="cc">Country/Region Code</label>
        <select id="cc" name="phone_country">
          <option value="">Select</option>
          <option value="+966">Saudi Arabia (+966)</option>
          <option value="+971">UAE (+971)</option>
        </select>
        <label for="ph">Phone</label>
        <input id="ph" name="phone" type="tel" />
      </form>`,
      LIBS
    );
    await run(page);
    const cc = page.document.getElementById('cc').value;
    const ph = page.document.getElementById('ph').value;
    suite.ok(cc === '+966' || /966/.test(cc), 'split country → +966 (got ' + cc + ')');
    suite.ok(ph === '504131857' || ph.endsWith('504131857'), 'split national → 504131857 (got ' + ph + ')');
    suite.ok(!/^\+966/.test(ph), 'national does not repeat dial code');
  })();

  // phoneFull-only profile still fills both layouts
  await (async function fullOnly() {
    const page = createPage(
      `<form><label>Mobile <input id="ph" type="tel" name="mobile" /></label></form>`,
      LIBS
    );
    await run(page, { phoneFull: '+966504131857', phoneE164: '+966504131857' });
    const v = page.document.getElementById('ph').value;
    suite.ok(/504131857/.test(v), 'phoneFull-only fills (got ' + v + ')');
  })();

  // format helpers
  const fmtPage = createPage('<div></div>', ['lib/format.js']);
  const F = fmtPage.window.FillApplyFormat;
  const parts = F.phoneParts(PROFILE);
  suite.equal(parts.e164, '+966504131857', 'phoneParts e164');
  suite.equal(parts.national, '504131857', 'phoneParts national');
  suite.equal(parts.dial, '+966', 'phoneParts dial');
  suite.equal(
    F.fieldKind({ label: 'Country/Region Code', name: 'countryRegionCode' }, null),
    'phoneCountry',
    'Country/Region Code → phoneCountry'
  );

  suite.finish();
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
