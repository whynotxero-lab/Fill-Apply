'use strict';
const fs = require('fs');
const path = require('path');
const { createPage, createSuite } = require('./test-harness');
const suite = createSuite('smoke-naukrigulf-serp-easy-apply');
const html = fs.readFileSync(path.join(__dirname, 'fixtures/naukrigulf-serp-easy-apply.html'), 'utf8');

(async function () {
  const page = createPage(html, [
    'lib/dom-deep.js',
    'lib/synonyms.js',
    'lib/challenges.js',
    'adapters/registry.js',
    'adapters/boards/naukrigulf.js'
  ]);
  const adapter =
    (page.window.FillApplyRegistry &&
      page.window.FillApplyRegistry.get &&
      page.window.FillApplyRegistry.get('naukrigulf')) ||
    page.window.FillApplyNaukriGulf;
  suite.ok(!!adapter, 'naukrigulf adapter present');
  suite.ok(
    adapter.detect('https://www.naukrigulf.com/finance-manager-jobs-in-uae?easyApply=false', page.document),
    'detects SERP URL'
  );
  suite.ok(typeof adapter.findFirstListingApplyControl === 'function', 'listing helper exported');
  const listing = adapter.findFirstListingApplyControl(page.document);
  suite.ok(!!listing, 'finds first listing Easy Apply control');
  const label = String(listing.textContent || listing.innerText || listing.getAttribute('aria-label') || '');
  suite.ok(/easy\s*apply/i.test(label), 'prefers Easy Apply on first card (got: ' + label.slice(0, 40) + ')');
  // Should not pick the Applied card
  suite.ok(!/confidential/i.test(label), 'does not pick Applied-only card label');
  suite.finish();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
