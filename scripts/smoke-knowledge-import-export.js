/**
 * Adaptive knowledge Export / Import round-trip (no passwords; no invent).
 * Run: node scripts/smoke-knowledge-import-export.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const suite = createSuite('smoke-knowledge-import-export');

const LIBS = [
  'lib/control-adapter.js',
  'lib/ats-faq-seed.js',
  'lib/knowledge-canonical.js',
  'lib/knowledge-store.js'
];

(async function main() {
  const page = createPage('<div></div>', LIBS);
  const S = page.window.FillApplyKnowledgeStore;
  suite.ok(S, 'knowledge store loaded');

  await S.putKnowledge({
    id: 'k1',
    canonicalKey: 'sap_experience',
    value: 'Yes',
    displayValue: 'Yes',
    fieldType: 'boolean',
    aliases: ['Have you used SAP?'],
    source: 'user_edit',
    confidence: 1,
    status: 'confirmed'
  });
  await S.putKnowledge({
    id: 'k-secret',
    canonicalKey: 'account_password',
    value: 'hunter2',
    displayValue: 'hunter2',
    fieldType: 'string',
    aliases: ['Password'],
    source: 'user_edit',
    confidence: 1,
    status: 'confirmed'
  });

  const snap = await S.exportSnapshot();
  suite.ok(snap && snap.kind === 'fill-apply-adaptive-knowledge', 'export has kind');
  suite.equal(snap.records.length, 1, 'export excludes password-like keys');
  suite.equal(snap.records[0].canonicalKey, 'sap_experience', 'export keeps sap_experience');

  // Round-trip into a fresh page via durable bundle API
  const page2 = createPage('<div></div>', LIBS);
  const S2 = page2.window.FillApplyKnowledgeStore;
  const merged = await S2.importKnowledgeBundle(snap, { mode: 'merge' });
  suite.equal(merged.imported, 1, 'merge imports one fact');
  const list = await S2.listKnowledge();
  suite.equal(list.length, 1, 'list after merge');
  suite.equal(list[0].value, 'Yes', 'value preserved (not invented)');

  // Replace mode clears then imports
  await S2.putKnowledge({
    id: 'k-extra',
    canonicalKey: 'extra_fact',
    value: 'keep-me-not',
    displayValue: 'keep-me-not',
    fieldType: 'string',
    status: 'confirmed'
  });
  const replaced = await S2.importKnowledgeBundle(snap, { mode: 'replace' });
  suite.equal(replaced.mode, 'replace', 'replace mode');
  const list2 = await S2.listKnowledge();
  suite.equal(list2.length, 1, 'replace leaves only imported records');
  suite.equal(list2[0].canonicalKey, 'sap_experience', 'replace kept exported key');

  // Sync importSnapshot skips secrets + empty values
  const page3 = createPage('<div></div>', LIBS);
  const S3 = page3.window.FillApplyKnowledgeStore;
  const sync = S3.importSnapshot({
    records: [
      { id: 'a', canonicalKey: 'ok_key', value: 'v', displayValue: 'v' },
      { id: 'b', canonicalKey: 'login_password', value: 'x', displayValue: 'x' },
      { id: 'c', canonicalKey: 'empty_key', value: '', displayValue: '' }
    ]
  });
  suite.equal(sync.imported, 1, 'sync importSnapshot imports one');
  suite.ok(sync.skipped >= 2, 'sync skips secret + empty');

  suite.ok(S.isSecretKnowledgeRecord({ canonicalKey: 'user_password' }), 'detects password key');
  suite.ok(!S.isSecretKnowledgeRecord({ canonicalKey: 'years_experience' }), 'non-secret ok');

  // Conflict queue API smoke (store-level)
  const conflict = await S2.putConflict({
    canonicalKey: 'sap_experience',
    label: 'SAP?',
    existingValue: 'Yes',
    proposedValue: 'No',
    existingConfidence: 1,
    existingStatus: 'confirmed'
  });
  suite.ok(conflict && conflict.id, 'putConflict returns id');
  const listed = await S2.listConflicts();
  suite.ok(listed.some(function (c) { return c.id === conflict.id; }), 'listConflicts includes pending');
  const kept = await S2.resolveConflict(conflict.id, 'keep');
  suite.ok(kept.ok && kept.action === 'keep', 'resolveConflict keep');
  suite.equal((await S2.listConflicts()).length, 0, 'resolve clears pending');

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
