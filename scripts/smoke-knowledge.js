/**
 * Adaptive knowledge: store, canonical identity, resolver precedence, learning.
 *
 * Run: node scripts/smoke-knowledge.js
 */
'use strict';

const { createPage, createSuite } = require('./test-harness');

const LIBS = [
  'lib/dom-deep.js',
  'lib/format.js',
  'lib/synonyms.js',
  'lib/field-map.js',
  'lib/knowledge-canonical.js',
  'lib/knowledge-store.js',
  'lib/knowledge-resolver.js',
  'lib/knowledge-learn.js',
  'lib/files.js',
  'content/fill.js'
];

const suite = createSuite('smoke-knowledge');

function pageWith(html) {
  return createPage(html || '<div id="application-form"></div>', LIBS);
}

(async function main() {
  await (async function storePutGetExport() {
    const page = pageWith();
    const S = page.window.FillApplyKnowledgeStore;
    suite.ok(S, 'knowledge store loaded');
    S.resetMemory();
    const rec = await S.putKnowledge({
      canonicalKey: 'sap_experience',
      value: 'Yes',
      fieldType: 'boolean',
      aliases: ['Do you have SAP experience?'],
      status: 'confirmed',
      confidence: 0.9
    });
    suite.ok(rec && rec.id, 'store assigns an id');
    suite.equal(rec.displayValue, 'Yes', 'boolean display normalized to Yes');
    const got = await S.getByCanonical('sap_experience');
    suite.equal(got && got.value, 'Yes', 'getByCanonical returns the row');
    const snap = await S.exportSnapshot();
    suite.equal(snap.records.length, 1, 'exportSnapshot includes the row');
    suite.equal(snap.records[0].canonicalKey, 'sap_experience', 'snapshot canonical key');
  })();

  await (async function sapVariantsShareIdentity() {
    const page = pageWith();
    const C = page.window.FillApplyKnowledgeCanonical;
    const a = C.matchCanonical('Do you have SAP experience?');
    const b = C.matchCanonical('Experience with SAP');
    const c = C.matchCanonical('Have you used SAP?');
    suite.equal(a.key, 'sap_experience', 'SAP question maps to sap_experience');
    suite.equal(b.key, 'sap_experience', 'Experience with SAP is the same key');
    suite.equal(c.key, 'sap_experience', 'Have you used SAP is the same key');
  })();

  await (async function relocateIsNotSponsorship() {
    const page = pageWith();
    const C = page.window.FillApplyKnowledgeCanonical;
    const rel = C.matchCanonical('Are you willing to relocate?');
    const spon = C.matchCanonical('Do you require visa sponsorship?');
    suite.equal(rel.key, 'willing_to_relocate', 'relocate maps to willing_to_relocate');
    suite.equal(spon.key, 'requires_sponsorship', 'sponsorship maps to requires_sponsorship');
    suite.ok(rel.key !== spon.key, 'Yes/Yes questions stay semantically distinct');
  })();

  await (async function resolverPrecedence() {
    const page = pageWith();
    const K = page.window.FillApplyKnowledge;
    const S = page.window.FillApplyKnowledgeStore;
    const map = page.window.FillApplyFieldMap;
    S.resetMemory();
    K.sessionClear();

    const profile = {
      email: 'profile@example.com',
      customAnswers: { sap_experience: 'No', 'SAP experience': 'No' },
      __adaptiveKnowledge: {
        records: [
          {
            id: 'k1',
            canonicalKey: 'sap_experience',
            value: 'Yes',
            displayValue: 'Yes',
            fieldType: 'boolean',
            aliases: ['Do you have SAP experience?'],
            status: 'confirmed',
            confidence: 0.95,
            updatedAt: Date.now()
          }
        ]
      }
    };

    const fromKnowledge = K.resolve(
      profile,
      { label: 'Have you used SAP?', type: 'select' },
      map
    );
    suite.equal(fromKnowledge.value, 'Yes', 'confirmed knowledge beats built-in customAnswers');
    suite.equal(fromKnowledge.source, 'userKnowledge', 'source is userKnowledge');

    K.remember({
      id: 'sess',
      canonicalKey: 'sap_experience',
      value: 'No',
      displayValue: 'No',
      status: 'confirmed',
      confidence: 1,
      fieldType: 'boolean'
    });
    const fromSession = K.resolve(
      profile,
      { label: 'Experience with SAP', type: 'select' },
      map
    );
    suite.equal(fromSession.value, 'No', 'session overlay beats confirmed knowledge');
    suite.equal(fromSession.source, 'session', 'source is session');

    K.sessionClear();
    page.window.FillApplyKnowledgeStore.resetMemory();
    const email = K.resolve(profile, { label: 'Email address', type: 'email', autocomplete: 'email' }, map);
    suite.equal(email.value, 'profile@example.com', 'profile identity still fills when no knowledge row');

    const unknown = K.resolve(profile, { label: 'Favourite colour of stapler', type: 'text' }, map);
    suite.equal(unknown.value, '', 'unknown questions stay empty — never invented');
  })();

  await (async function learnExplicitAndRejectNoise() {
    const page = pageWith();
    const Learn = page.window.FillApplyKnowledgeLearn;
    const S = page.window.FillApplyKnowledgeStore;
    const K = page.window.FillApplyKnowledge;
    S.resetMemory();
    K.sessionClear();

    const noise = await Learn.learn({
      label: 'Do you have SAP experience?',
      value: 'asdf',
      fieldType: 'text',
      kind: 'observe'
    });
    suite.equal(noise.accepted, false, 'noise values are not learned');

    const eeo = await Learn.learn({
      label: 'Voluntary self-identification / race',
      value: 'Decline',
      fieldType: 'select',
      kind: 'observe'
    });
    suite.equal(eeo.accepted, false, 'EEO questions are not learned');

    const ok = await Learn.learn({
      label: 'Do you have SAP experience?',
      value: 'Yes',
      fieldType: 'boolean',
      kind: 'observe'
    });
    suite.ok(ok.accepted, 'explicit SAP answer is learned');
    suite.equal(ok.record.canonicalKey, 'sap_experience', 'learned under sap_experience');

    const reuse = K.resolve(
      { __adaptiveKnowledge: { records: [] } },
      { label: 'Experience with SAP', type: 'select' },
      page.window.FillApplyFieldMap
    );
    suite.equal(reuse.value, 'Yes', 'same-session resolve reuses the just-learned value');
    suite.ok(reuse.source === 'session' || reuse.source === 'userKnowledge', 'reuse comes from adaptive knowledge');
  })();

  await (async function correctionUpdates() {
    const page = pageWith();
    const Learn = page.window.FillApplyKnowledgeLearn;
    const S = page.window.FillApplyKnowledgeStore;
    const K = page.window.FillApplyKnowledge;
    S.resetMemory();
    K.sessionClear();

    await Learn.learn({
      label: 'Are you willing to relocate?',
      value: 'No',
      fieldType: 'boolean',
      kind: 'observe'
    });
    const corrected = await Learn.learn({
      label: 'Would you relocate?',
      value: 'Yes',
      fieldType: 'boolean',
      kind: 'correct',
      autofilled: true,
      previousValue: 'No'
    });
    suite.ok(corrected.accepted, 'correction of an autofilled value is accepted');
    suite.equal(corrected.record.displayValue, 'Yes', 'correction overwrites the stored value');
    suite.equal(corrected.record.source, 'user_correction', 'provenance is user_correction');
  })();

  await (async function fillEngineUsesSnapshot() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" type="email" /></div>
        <div class="field">
          <label for="sap">Have you used SAP?</label>
          <select id="sap"><option value="">Select…</option><option>Yes</option><option>No</option></select>
        </div>
        <div class="field">
          <label for="rel">Are you willing to relocate?</label>
          <select id="rel"><option value="">Select…</option><option>Yes</option><option>No</option></select>
        </div>
      </div>
    `,
      LIBS
    );
    const profile = {
      email: 'zahid@example.com',
      __adaptiveKnowledge: {
        records: [
          {
            id: 's1',
            canonicalKey: 'sap_experience',
            value: 'Yes',
            displayValue: 'Yes',
            fieldType: 'boolean',
            aliases: ['Do you have SAP experience?'],
            status: 'confirmed',
            confidence: 0.9,
            updatedAt: 1
          },
          {
            id: 'r1',
            canonicalKey: 'willing_to_relocate',
            value: 'No',
            displayValue: 'No',
            fieldType: 'boolean',
            aliases: ['willing to relocate'],
            status: 'confirmed',
            confidence: 0.9,
            updatedAt: 1
          }
        ]
      }
    };
    await page.window.__fillApply.run(profile, {});
    suite.equal(page.document.getElementById('em').value, 'zahid@example.com', 'email still comes from the profile');
    suite.equal(page.document.getElementById('sap').value, 'Yes', 'SAP select filled from adaptive knowledge');
    suite.equal(page.document.getElementById('rel').value, 'No', 'relocate select filled from adaptive knowledge');
  })();

  await (async function persistReloadAndEquivalentWording() {
    const writer = pageWith();
    const S1 = writer.window.FillApplyKnowledgeStore;
    const Learn = writer.window.FillApplyKnowledgeLearn;
    S1.resetMemory();
    writer.window.FillApplyKnowledge.sessionClear();
    const learned = await Learn.learn({
      label: 'Do you have SAP experience?',
      value: 'Yes',
      fieldType: 'boolean',
      kind: 'confirm'
    });
    suite.ok(learned.accepted, 'create: explicit confirm is persisted in the store');
    const snap = await S1.exportSnapshot();
    suite.equal(snap.records.length, 1, 'persist: exportSnapshot holds the created row');

    const reader = pageWith();
    const S2 = reader.window.FillApplyKnowledgeStore;
    const K2 = reader.window.FillApplyKnowledge;
    S2.resetMemory();
    K2.sessionClear();
    S2.importSnapshot(snap);
    const afterReload = K2.resolve(
      { __adaptiveKnowledge: snap },
      { label: 'Have you used SAP?', type: 'select' },
      reader.window.FillApplyFieldMap
    );
    suite.equal(afterReload.value, 'Yes', 'reload: a new page context resolves the persisted fact');
    suite.equal(afterReload.source, 'userKnowledge', 'reload source is confirmed user knowledge');
    suite.equal(
      reader.window.FillApplyKnowledgeCanonical.matchCanonical('Experience with SAP').key,
      'sap_experience',
      'equivalent wording still maps to the same canonical key after reload'
    );
  })();

  await (async function profileSeparation() {
    const page = pageWith();
    const S = page.window.FillApplyKnowledgeStore;
    const K = page.window.FillApplyKnowledge;
    S.resetMemory();
    K.sessionClear();
    await S.putKnowledge({
      canonicalKey: 'sap_experience',
      value: 'Yes',
      fieldType: 'boolean',
      status: 'confirmed',
      confidence: 1,
      profileId: 'profile-a',
      aliases: ['Do you have SAP experience?']
    });
    await S.putKnowledge({
      canonicalKey: 'sap_experience',
      value: 'No',
      fieldType: 'boolean',
      status: 'confirmed',
      confidence: 1,
      profileId: 'profile-b',
      aliases: ['Do you have SAP experience?']
    });
    const a = await S.getByCanonical('sap_experience', 'profile-a');
    const b = await S.getByCanonical('sap_experience', 'profile-b');
    suite.equal(a && a.displayValue, 'Yes', 'profile A keeps its own SAP answer');
    suite.equal(b && b.displayValue, 'No', 'profile B keeps a different SAP answer');

    const snapA = await S.exportSnapshot('profile-a');
    const fromA = K.resolve(
      { __adaptiveKnowledge: snapA },
      { label: 'Have you used SAP?', type: 'select' },
      page.window.FillApplyFieldMap
    );
    suite.equal(fromA.value, 'Yes', 'resolver for profile A does not use profile B knowledge');
  })();

  await (async function attachDoesNotMutateProfile() {
    const page = pageWith();
    const S = page.window.FillApplyKnowledgeStore;
    S.resetMemory();
    await S.putKnowledge({
      canonicalKey: 'sap_experience',
      value: 'Yes',
      fieldType: 'boolean',
      status: 'confirmed',
      confidence: 1,
      aliases: ['SAP']
    });
    const original = { id: 'p1', email: 'zahid@example.com', firstName: 'Zahid' };
    const stamped = await S.attachToProfile(original);
    suite.ok(stamped.__adaptiveKnowledge, 'attachToProfile stamps a snapshot for the fill pass');
    suite.ok(!original.__adaptiveKnowledge, 'the saved profile object is not mutated');
    suite.equal(original.email, 'zahid@example.com', 'identity fields stay on the profile, not in the KB stamp');
    suite.ok(
      stamped.__adaptiveKnowledge.records.some(function (r) {
        return r.canonicalKey === 'sap_experience';
      }),
      'adaptive knowledge is separate from profile identity'
    );
  })();

  await (async function builtinNotOverrideConfirmed() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field"><label for="em">Email</label><input id="em" type="email" /></div>
        <div class="field">
          <label for="np">What is your notice period?</label>
          <input id="np" />
        </div>
      </div>
    `,
      LIBS
    );
    const profile = {
      email: 'zahid@example.com',
      noticePeriod: '30 days',
      customAnswers: { noticePeriod: '30 days' },
      __adaptiveKnowledge: {
        records: [
          {
            id: 'n1',
            canonicalKey: 'notice_period',
            value: 'Immediate',
            displayValue: 'Immediate',
            fieldType: 'text',
            aliases: ['notice period'],
            status: 'confirmed',
            confidence: 1,
            updatedAt: 2
          }
        ]
      }
    };
    await page.window.__fillApply.run(profile, {});
    suite.equal(
      page.document.getElementById('np').value,
      'Immediate',
      'confirmed user knowledge is not overridden by the profile / built-in notice period'
    );
  })();

  
  await (async function keyAliasesTypeValueModel() {
    const page = pageWith();
    const C = page.window.FillApplyKnowledgeCanonical;
    const S = page.window.FillApplyKnowledgeStore;
    S.resetMemory();
    suite.ok(C.USER_FIELD_TYPES.indexOf('string') !== -1, 'user types include string');
    suite.ok(C.USER_FIELD_TYPES.indexOf('multiselect') !== -1, 'user types include multiselect');
    suite.equal(C.toUserFieldType('text'), 'string', 'legacy text maps to string');
    suite.equal(C.toUserFieldType('multi-select'), 'multiselect', 'legacy multi-select maps to multiselect');
    const rec = await S.putKnowledge({
      canonicalKey: 'notice_period',
      value: '30 days',
      fieldType: 'text',
      aliases: ['Notice period', 'notice period', 'What is your notice period?']
    });
    suite.equal(rec.fieldType, 'string', 'stored fieldType normalized to string');
    suite.equal(rec.aliases.length, 2, 'duplicate aliases collapsed (case-insensitive)');
    const view = S.toDisplayRecord(rec);
    suite.equal(view.key, 'notice_period', 'display Key');
    suite.ok(Array.isArray(view.aliases), 'display Aliases');
    suite.equal(view.type, 'string', 'display Type');
    suite.equal(view.value, '30 days', 'display Value');
  })();

  await (async function aliasExpansionSameKey() {
    const page = pageWith();
    const Learn = page.window.FillApplyKnowledgeLearn;
    const S = page.window.FillApplyKnowledgeStore;
    const K = page.window.FillApplyKnowledge;
    S.resetMemory();
    K.sessionClear();
    await Learn.learn({
      label: 'Do you have SAP experience?',
      value: 'Yes',
      fieldType: 'boolean',
      kind: 'confirm'
    });
    await Learn.learn({
      label: 'Experience with SAP',
      value: 'Yes',
      fieldType: 'boolean',
      kind: 'confirm'
    });
    const list = await S.listKnowledge();
    const sap = list.filter(function (r) { return r.canonicalKey === 'sap_experience'; });
    suite.equal(sap.length, 1, 'no duplicate keys for equivalent SAP wording');
    suite.ok(
      (sap[0].aliases || []).some(function (a) { return /Experience with SAP/i.test(a); }),
      'alias expansion attaches the new wording to the same Key'
    );
  })();

  await (async function typesAndUnknown() {
    const page = pageWith();
    const C = page.window.FillApplyKnowledgeCanonical;
    const K = page.window.FillApplyKnowledge;
    const S = page.window.FillApplyKnowledgeStore;
    S.resetMemory();
    K.sessionClear();
    suite.equal(C.normalizeValue('true', 'boolean'), 'Yes', 'boolean type normalizes true→Yes');
    suite.equal(C.normalizeValue(['A', 'B'], 'multiselect'), 'A; B', 'multiselect joins values');
    const unknown = K.resolve({}, { label: 'Favourite colour of stapler', type: 'text' }, page.window.FillApplyFieldMap);
    suite.equal(unknown.value, '', 'unknown handling leaves value empty');
    suite.ok(!unknown.source, 'unknown has no invented source');
  })();

  await (async function immediatePersistSameSessionAndFuture() {
    const page = pageWith();
    const Learn = page.window.FillApplyKnowledgeLearn;
    const S = page.window.FillApplyKnowledgeStore;
    const K = page.window.FillApplyKnowledge;
    S.resetMemory();
    K.sessionClear();
    const learned = await Learn.learn({
      label: 'Are you willing to relocate?',
      value: 'Yes',
      fieldType: 'boolean',
      kind: 'confirm'
    });
    suite.ok(learned.accepted, 'immediate persist accepts confirm');
    const sameSession = K.resolve(
      { __adaptiveKnowledge: { records: [] } },
      { label: 'Would you relocate?', type: 'select' },
      page.window.FillApplyFieldMap
    );
    suite.equal(sameSession.value, 'Yes', 'same-session reuse after immediate save');
    const snap = await S.exportSnapshot();
    const future = pageWith();
    future.window.FillApplyKnowledgeStore.resetMemory();
    future.window.FillApplyKnowledge.sessionClear();
    future.window.FillApplyKnowledgeStore.importSnapshot(snap);
    const later = future.window.FillApplyKnowledge.resolve(
      { __adaptiveKnowledge: snap },
      { label: 'Open to relocation', type: 'select' },
      future.window.FillApplyFieldMap
    );
    suite.equal(later.value, 'Yes', 'future apps reuse the same Key');
  })();

  await (async function reportFieldGroups() {
    const page = createPage('<div></div>', ['lib/report.js']);
    const R = page.window.FillApplyReport;
    suite.ok(R && R.groupApplicationFields, 'report groupApplicationFields exported');
    const groups = R.groupApplicationFields({
      'First name': 'Zahid',
      Email: 'z@example.com',
      'Requires sponsorship': 'No',
      'Notice period': 'Immediate',
      School: 'LUMS',
      'Years of experience': '15',
      'Favourite colour': 'Green'
    });
    const names = groups.map(function (g) { return g.group; });
    suite.ok(names.indexOf('Personal') !== -1, 'Personal group present');
    suite.ok(names.indexOf('Contact') !== -1, 'Contact group present');
    suite.ok(names.indexOf('Work Auth') !== -1, 'Work Auth group present');
    suite.ok(names.indexOf('Preferences') !== -1, 'Preferences group present');
    suite.ok(names.indexOf('Education') !== -1, 'Education group present');
    suite.ok(names.indexOf('Experience') !== -1, 'Experience group present');
    suite.ok(names.indexOf('Other') !== -1, 'Other group present');
    const html = R.buildHtmlReport({
      title: 'Demo',
      company: 'Acme',
      fields: { Email: 'z@example.com', 'First name': 'Zahid' },
      status: 'Submitted'
    });
    suite.ok(html.indexOf('<details class="field-group">') !== -1, 'HTML report uses collapsible groups');
    const summary = R.reportSummary({
      id: 'r1',
      title: 'Demo',
      fields: { Email: 'z@example.com' },
      status: 'Submitted'
    });
    suite.equal(summary.fields.Email, 'z@example.com', 'report meta keeps fields for app DB UI');
  })();

suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
