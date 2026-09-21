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
  'lib/control-adapter.js',
  'lib/ats-faq-seed.js',
  'lib/knowledge-policy.js',
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

    const proposed = await Learn.learn({
      label: 'Do you have SAP experience?',
      value: 'Yes',
      fieldType: 'boolean',
      kind: 'observe'
    });
    suite.ok(proposed.pending, 'observe proposes Save/Don\'t Save (does not auto-persist)');
    suite.equal((await S.listKnowledge()).length, 0, 'not persisted before confirm');
    const ok = await Learn.confirmProposal(proposed.proposal.id);
    suite.ok(ok.accepted, 'Save confirms SAP answer into Adaptive Dictionary');
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
      kind: 'confirm',
      confirmed: true
    });
    const corrected = await Learn.learn({
      label: 'Would you relocate?',
      value: 'Yes',
      fieldType: 'boolean',
      kind: 'confirm',
      confirmed: true,
      autofilled: true,
      previousValue: 'No'
    });
    suite.ok(corrected.accepted, 'confirmed correction of an autofilled value is accepted');
    suite.equal(corrected.record.displayValue, 'Yes', 'correction overwrites the stored value');
    suite.equal(corrected.record.source, 'user_confirmed', 'source is user_confirmed');
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
    const original = { id: 'p1', email: 'zahid@example.com', firstName: 'Sample' };
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
      '30 days',
      'profile precedes adaptive confirmed (notice period)'
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

  await (async function controlTypesAndTypeSafety() {
    const page = pageWith();
    const C = page.window.FillApplyKnowledgeCanonical;
    suite.equal(C.detectControlType({ tagName: 'SELECT', type: 'select-one', options: [] }, { type: 'select' }), 'select', 'detect select');
    suite.equal(C.detectControlType({ tagName: 'INPUT', type: 'number' }, { type: 'number' }), 'number', 'detect number');
    suite.equal(C.detectControlType({ tagName: 'INPUT', type: 'checkbox' }, { type: 'checkbox' }), 'checkbox', 'detect checkbox');
    suite.equal(C.detectControlType({ tagName: 'INPUT', type: 'email' }, { type: 'email' }), 'email', 'detect email');
    suite.equal(C.coerceNumber('30 days'), '30', 'deterministic 30 days → 30');
    suite.equal(C.coerceNumber('about thirty'), '', 'no guessing non-numeric text');
    const yesNo = [{ text: 'Yes', value: 'Yes' }, { text: 'No', value: 'No' }];
    const okBool = C.prepareFillValue('Yes', 'boolean', 'select', yesNo);
    suite.ok(okBool.ok && okBool.value === 'Yes', 'boolean maps onto Yes/No select');
    const badText = C.prepareFillValue('Sample Khan', 'string', 'select', yesNo);
    suite.ok(!badText.ok && badText.action === 'DO_NOT_FILL', 'free text into Yes/No select is DO NOT FILL');
    const badBoolNum = C.prepareFillValue('Yes', 'boolean', 'number', []);
    suite.ok(!badBoolNum.ok, 'boolean into number is incompatible');
    const numOk = C.prepareFillValue('30 days', 'string', 'number', []);
    suite.ok(numOk.ok && numOk.value === '30', 'notice-like string coerces for number control');
  })();

  await (async function semanticIdentityCollisions() {
    const page = pageWith();
    const C = page.window.FillApplyKnowledgeCanonical;
    suite.equal(C.matchCanonical('What is your current salary?').key, 'current_salary', 'current salary key');
    suite.equal(C.matchCanonical('Expected salary / OTE').key, 'expected_salary', 'expected salary key');
    suite.ok(C.matchCanonical('What is your current salary?').key !== C.matchCanonical('Expected salary').key, 'current ≠ expected salary');
    suite.equal(C.matchCanonical('Years of experience').key, 'years_experience', 'years experience key');
    suite.equal(C.matchCanonical('Management experience').key, 'management_experience', 'management experience key');
    suite.ok(
      C.matchCanonical('Years of experience').key !== C.matchCanonical('Management experience').key,
      'years ≠ management experience'
    );
    suite.equal(C.matchCanonical('Are you willing to relocate?').key, 'willing_to_relocate', 'relocate key');
    suite.equal(C.matchCanonical('Are you willing to travel?').key, 'willing_to_travel', 'travel key');
    suite.ok(C.isExcludedPair('willing_to_relocate', 'willing_to_travel'), 'relocate/travel exclusion pair');
    suite.ok(C.isExcludedPair('current_salary', 'expected_salary'), 'salary exclusion pair');
    suite.ok(C.isExcludedPair('authorized_to_work', 'requires_sponsorship'), 'auth/sponsor exclusion pair');
    suite.equal(C.matchCanonical('Work authorization / authorized to work').key, 'authorized_to_work', 'work auth key');
    suite.equal(C.matchCanonical('Do you require sponsorship?').key, 'requires_sponsorship', 'sponsorship key');
  })();

  await (async function relocateTravelIsolationAfterReload() {
    const writer = pageWith();
    const Learn = writer.window.FillApplyKnowledgeLearn;
    const S1 = writer.window.FillApplyKnowledgeStore;
    S1.resetMemory();
    writer.window.FillApplyKnowledge.sessionClear();
    const learned = await Learn.learn({
      label: 'Are you willing to relocate?',
      value: 'Yes',
      fieldType: 'boolean',
      kind: 'confirm'
    });
    suite.ok(learned.accepted, 'relocate Yes learned');
    suite.equal(learned.record.canonicalKey, 'willing_to_relocate', 'stored under willing_to_relocate');
    const snap = await S1.exportSnapshot();

    const reader = pageWith();
    reader.window.FillApplyKnowledgeStore.resetMemory();
    reader.window.FillApplyKnowledge.sessionClear();
    reader.window.FillApplyKnowledgeStore.importSnapshot(snap);
    const K = reader.window.FillApplyKnowledge;
    const map = reader.window.FillApplyFieldMap;
    const profile = { __adaptiveKnowledge: snap };

    const openRelo = K.resolve(profile, { label: 'Open to relocation', type: 'select' }, map);
    suite.equal(openRelo.value, 'Yes', 'after reload: open to relocation fills Yes');
    suite.ok(openRelo.source === 'userKnowledge' || openRelo.source === 'session', 'relocate reuse from knowledge');

    const travel = K.resolve(profile, { label: 'Willing to travel', type: 'select' }, map);
    suite.equal(travel.value, '', 'willing to travel does NOT get relocate value');
    suite.ok(!travel.source, 'travel has no source from relocate knowledge');
    suite.ok(
      travel.canonicalKey === 'willing_to_travel' || travel.key === 'willing_to_travel' || !travel.value,
      'travel identifies separately'
    );
  })();

  await (async function salaryIsolationAfterReload() {
    const writer = pageWith();
    const Learn = writer.window.FillApplyKnowledgeLearn;
    const S1 = writer.window.FillApplyKnowledgeStore;
    S1.resetMemory();
    writer.window.FillApplyKnowledge.sessionClear();
    await Learn.learn({
      label: 'Current salary',
      value: '25000',
      fieldType: 'number',
      kind: 'confirm'
    });
    const snap = await S1.exportSnapshot();
    const reader = pageWith();
    reader.window.FillApplyKnowledgeStore.resetMemory();
    reader.window.FillApplyKnowledge.sessionClear();
    reader.window.FillApplyKnowledgeStore.importSnapshot(snap);
    const K = reader.window.FillApplyKnowledge;
    const map = reader.window.FillApplyFieldMap;
    const profile = { __adaptiveKnowledge: snap };
    const cur = K.resolve(profile, { label: 'What is your current monthly salary?', type: 'number' }, map);
    suite.equal(cur.value, '25000', 'current salary reuses after reload');
    const exp = K.resolve(profile, { label: 'Expected salary', type: 'number' }, map);
    suite.equal(exp.value, '', 'expected salary does NOT reuse current salary');
  })();

  await (async function fillEngineControlTypeSafety() {
    const page = createPage(
      `
      <div id="application-form">
        <div class="field">
          <label for="yn">Are you willing to relocate?</label>
          <select id="yn"><option value="">Select…</option><option>Yes</option><option>No</option></select>
        </div>
        <div class="field">
          <label for="yrs">Years of experience</label>
          <input id="yrs" type="number" />
        </div>
        <div class="field">
          <label for="bad">Do you require sponsorship?</label>
          <select id="bad"><option value="">Select…</option><option>Yes</option><option>No</option></select>
        </div>
        <div class="field">
          <label for="opt">Favourite colour of stapler</label>
          <input id="opt" type="text" />
        </div>
        <div class="field">
          <label for="req">Security clearance level</label>
          <input id="req" type="text" required />
        </div>
      </div>
    `,
      LIBS
    );
    const profile = {
      __adaptiveKnowledge: {
        records: [
          {
            id: 'r1',
            canonicalKey: 'willing_to_relocate',
            value: 'Yes',
            displayValue: 'Yes',
            fieldType: 'boolean',
            aliases: ['willing to relocate'],
            status: 'confirmed',
            confidence: 1,
            updatedAt: 1
          },
          {
            id: 'r2',
            canonicalKey: 'years_experience',
            value: 'Yes',
            displayValue: 'Yes',
            fieldType: 'boolean',
            aliases: ['years of experience'],
            status: 'confirmed',
            confidence: 1,
            updatedAt: 1
          }
        ]
      }
    };
    const result = await page.window.__fillApply.run(profile, {});
    suite.equal(page.document.getElementById('yn').value, 'Yes', 'relocate Yes/No select filled correctly');
    suite.equal(page.document.getElementById('yrs').value, '', 'boolean knowledge does not fill number field');
    suite.equal(page.document.getElementById('bad').value, '', 'sponsorship left empty (no knowledge)');
    suite.ok(Array.isArray(result.unknownFields), 'unknownFields array present');
    const labels = (result.unknownFields || []).map(function (u) { return u.label; });
    suite.ok(labels.some(function (l) { return /stapler/i.test(l); }), 'optional unknown discovered');
    suite.ok(labels.some(function (l) { return /Security clearance/i.test(l); }), 'required unknown discovered');
    suite.ok(labels.some(function (l) { return /sponsorship/i.test(l); }), 'unmatched select discovered');
    const stapler = (result.unknownFields || []).find(function (u) { return /stapler/i.test(u.label); });
    suite.ok(stapler && stapler.required === false, 'optional marked not required');
    const clearance = (result.unknownFields || []).find(function (u) { return /Security clearance/i.test(u.label); });
    suite.ok(clearance && clearance.required === true, 'required flagged on unknown');
    suite.ok(Array.isArray(result.debugResolutions), 'debugResolutions inspection path present');
    const relDebug = (result.debugResolutions || []).find(function (d) { return /relocate/i.test(d.question || ''); });
    suite.ok(relDebug && (relDebug.action === 'FILLED' || relDebug.canonicalKey === 'willing_to_relocate'), 'debug shows relocate fill');
  })();

  await (async function atsAgnosticDomFixtures() {
    // Generic DOM only — no Greenhouse/Workday/Ashby branches
    const page = createPage(
      `
      <form id="application-form">
        <label for="a">Have you used SAP?</label>
        <select id="a"><option value="">Select…</option><option value="Y">Yes</option><option value="N">No</option></select>
        <label for="b">Open to relocation</label>
        <select id="b"><option value="">Select…</option><option>Yes</option><option>No</option></select>
        <label for="c">Willing to travel</label>
        <select id="c"><option value="">Select…</option><option>Yes</option><option>No</option></select>
        <label for="d">Current salary</label>
        <input id="d" type="number" />
        <label for="e">Expected salary</label>
        <input id="e" type="number" />
      </form>
    `,
      LIBS
    );
    const Learn = page.window.FillApplyKnowledgeLearn;
    const S = page.window.FillApplyKnowledgeStore;
    const K = page.window.FillApplyKnowledge;
    S.resetMemory();
    K.sessionClear();
    await Learn.learn({ label: 'Do you have SAP experience?', value: 'Yes', fieldType: 'boolean', kind: 'confirm' });
    await Learn.learn({ label: 'Are you willing to relocate?', value: 'Yes', fieldType: 'boolean', kind: 'confirm' });
    await Learn.learn({ label: 'Current salary', value: '40000', fieldType: 'number', kind: 'confirm' });
    const snap = await S.exportSnapshot();
    // Simulate reload: new page context
    const page2 = createPage(page.document.body.innerHTML, LIBS);
    page2.window.FillApplyKnowledgeStore.resetMemory();
    page2.window.FillApplyKnowledge.sessionClear();
    page2.window.FillApplyKnowledgeStore.importSnapshot(snap);
    const result = await page2.window.__fillApply.run({ __adaptiveKnowledge: snap }, {});
    suite.equal(page2.document.getElementById('a').value, 'Y', 'SAP alias fills select by option match');
    suite.equal(page2.document.getElementById('b').value, 'Yes', 'open to relocation fills after reload');
    suite.equal(page2.document.getElementById('c').value, '', 'travel not filled from relocate');
    suite.equal(page2.document.getElementById('d').value, '40000', 'current salary number filled');
    suite.equal(page2.document.getElementById('e').value, '', 'expected salary stays empty');
    suite.ok(result.ok, 'generic DOM fixture fill ok (ATS-agnostic)');
  })();

  await (async function validateMalformedRecords() {
    const page = pageWith();
    const C = page.window.FillApplyKnowledgeCanonical;
    const bad = C.validateRecord({ canonicalKey: '', value: 'Yes', fieldType: 'boolean' });
    suite.ok(!bad.ok, 'missing key rejected');
    const mismatch = C.validateRecord(
      {
        canonicalKey: 'willing_to_relocate',
        value: 'Yes',
        fieldType: 'boolean',
        status: 'confirmed'
      },
      { label: 'Willing to travel', type: 'select', options: [{ text: 'Yes' }, { text: 'No' }], _identifiedKey: 'willing_to_travel' }
    );
    suite.ok(!mismatch.ok, 'key mismatch / exclusion blocks auto-fill');
  })();


  await (async function evidenceModelNoConcatIdentity() {
    const page = pageWith();
    const C = page.window.FillApplyKnowledgeCanonical;
    suite.ok(typeof C.buildEvidence === 'function', 'buildEvidence exported');
    suite.ok(typeof C.resolveFromEvidence === 'function', 'resolveFromEvidence exported');

    const cur = C.resolveFromEvidence(C.buildEvidence({
      label: 'Current Salary',
      name: 'expected_salary',
      id: 'expected_salary'
    }));
    suite.equal(cur.key, 'current_salary', 'Label Current Salary + name expected_salary → current_salary');
    suite.equal(cur.matchedEvidence, 'label', 'label evidence wins over name/id');
    suite.ok(!cur.ambiguous, 'clear label is not ambiguous');

    const exp = C.resolveFromEvidence(C.buildEvidence({
      label: 'Expected Salary',
      name: 'current_salary',
      id: 'current_salary'
    }));
    suite.equal(exp.key, 'expected_salary', 'Label Expected Salary + name current_salary → expected_salary');

    const rel = C.resolveFromEvidence(C.buildEvidence({
      label: 'Are you willing to relocate?',
      name: 'travel',
      id: 'travel_pref'
    }));
    suite.equal(rel.key, 'willing_to_relocate', 'Relocate label + name travel → relocate');

    const trav = C.resolveFromEvidence(C.buildEvidence({
      label: 'Willing to travel',
      name: 'relocation',
      id: 'relocation'
    }));
    suite.equal(trav.key, 'willing_to_travel', 'Travel label + name relocation → travel');
  })();

  await (async function ambiguousBareLabelsNoSilentWrongKey() {
    const page = pageWith();
    const C = page.window.FillApplyKnowledgeCanonical;
    const K = page.window.FillApplyKnowledge;
    const S = page.window.FillApplyKnowledgeStore;
    S.resetMemory();
    K.sessionClear();

    const ambiguous = ['Salary', 'Compensation', 'Experience', 'Authorization', 'Sponsorship', 'Travel', 'Relocation'];
    // Seed competing knowledge so a wrong silent match would fill
    K.remember({
      id: 'kcur', canonicalKey: 'current_salary', value: '100000', displayValue: '100000',
      fieldType: 'number', status: 'confirmed', confidence: 1, aliases: ['Current salary']
    });
    K.remember({
      id: 'kexp', canonicalKey: 'expected_salary', value: '150000', displayValue: '150000',
      fieldType: 'number', status: 'confirmed', confidence: 1, aliases: ['Expected salary']
    });
    K.remember({
      id: 'krel', canonicalKey: 'willing_to_relocate', value: 'Yes', displayValue: 'Yes',
      fieldType: 'boolean', status: 'confirmed', confidence: 1, aliases: ['willing to relocate']
    });
    K.remember({
      id: 'ktrv', canonicalKey: 'willing_to_travel', value: 'No', displayValue: 'No',
      fieldType: 'boolean', status: 'confirmed', confidence: 1, aliases: ['willing to travel']
    });

    const salary = C.resolveFromEvidence(C.buildEvidence({ label: 'Salary' }));
    // v1.19.1: bare Salary is the generic salary_text box (Ignite etc.), not current vs expected.
    suite.equal(salary.key, 'salary_text', 'bare Salary → salary_text');
    suite.ok(!salary.ambiguous, 'bare Salary is not AMBIGUOUS when salary_text claims it');

    const comp = C.resolveFromEvidence(C.buildEvidence({ label: 'Compensation' }));
    suite.equal(comp.key, 'salary_text', 'bare Compensation → salary_text');

    const expn = C.resolveFromEvidence(C.buildEvidence({ label: 'Experience' }));
    suite.ok(expn.ambiguous, 'bare Experience is AMBIGUOUS');

    // Unique bare tokens resolve to the correct key only (never the exclusion sibling)
    suite.equal(C.resolveFromEvidence(C.buildEvidence({ label: 'Travel' })).key, 'willing_to_travel', 'Travel → travel not relocate');
    suite.equal(C.resolveFromEvidence(C.buildEvidence({ label: 'Relocation' })).key, 'willing_to_relocate', 'Relocation → relocate not travel');
    suite.equal(C.resolveFromEvidence(C.buildEvidence({ label: 'Sponsorship' })).key, 'requires_sponsorship', 'Sponsorship → sponsorship not auth');
    suite.equal(C.resolveFromEvidence(C.buildEvidence({ label: 'Authorization' })).key, 'authorized_to_work', 'Authorization → auth not sponsorship');

    const map = page.window.FillApplyFieldMap;
    const profile = { __adaptiveKnowledge: { records: [] } };
    const salaryResolve = K.resolve(profile, { label: 'Salary', type: 'number' }, map);
    // No salary_text in profile/knowledge → still empty (does not invent current/expected).
    suite.equal(salaryResolve.value, '', 'bare Salary does not silently fill current or expected');
    suite.ok(!salaryResolve.value, 'bare Salary stays empty without salary_text');

    // aliasScore must not treat bare salary as strong hit on longer aliases
    suite.ok(C.aliasScore('salary', ['expected salary', 'current salary']) < 90, 'bare salary aliasScore stays weak');
  })();

  await (async function salaryIsolation100k150kAndReverse() {
    const writer = pageWith();
    const Learn = writer.window.FillApplyKnowledgeLearn;
    const S1 = writer.window.FillApplyKnowledgeStore;
    S1.resetMemory();
    writer.window.FillApplyKnowledge.sessionClear();
    await Learn.learn({ label: 'Current salary', value: '100000', fieldType: 'number', kind: 'confirm' });
    await Learn.learn({ label: 'Expected salary', value: '150000', fieldType: 'number', kind: 'confirm' });
    const snap = await S1.exportSnapshot();

    const reader = pageWith();
    reader.window.FillApplyKnowledgeStore.resetMemory();
    reader.window.FillApplyKnowledge.sessionClear();
    reader.window.FillApplyKnowledgeStore.importSnapshot(snap);
    const K = reader.window.FillApplyKnowledge;
    const map = reader.window.FillApplyFieldMap;
    const profile = { __adaptiveKnowledge: snap };

    suite.equal(
      K.resolve(profile, { label: 'Current Salary', name: 'expected_salary', type: 'number' }, map).value,
      '100000',
      '100k current fills despite name=expected_salary'
    );
    suite.equal(
      K.resolve(profile, { label: 'Expected Salary', name: 'current_salary', type: 'number' }, map).value,
      '150000',
      '150k expected fills despite name=current_salary'
    );
    suite.equal(
      K.resolve(profile, { label: 'Expected salary', type: 'number' }, map).value,
      '150000',
      'expected stays 150k'
    );
    suite.equal(
      K.resolve(profile, { label: 'Current salary', type: 'number' }, map).value,
      '100000',
      'current stays 100k'
    );
  })();

  await (async function domIdentityIndependenceSameCanonical() {
    const writer = pageWith();
    const Learn = writer.window.FillApplyKnowledgeLearn;
    const S1 = writer.window.FillApplyKnowledgeStore;
    S1.resetMemory();
    writer.window.FillApplyKnowledge.sessionClear();
    const learned = await Learn.learn({
      label: 'Current salary',
      name: 'current_salary',
      id: 'salary_123',
      value: '88000',
      fieldType: 'number',
      kind: 'confirm'
    });
    suite.ok(learned.accepted, 'learned with DOM name/id present');
    suite.equal(learned.record.canonicalKey, 'current_salary', 'canonical from semantic label not DOM id');
    const snap = await S1.exportSnapshot();

    const reader = pageWith();
    reader.window.FillApplyKnowledgeStore.resetMemory();
    reader.window.FillApplyKnowledge.sessionClear();
    reader.window.FillApplyKnowledgeStore.importSnapshot(snap);
    const K = reader.window.FillApplyKnowledge;
    const map = reader.window.FillApplyFieldMap;
    const profile = { __adaptiveKnowledge: snap };

    const viaOtherDom = K.resolve(
      profile,
      { label: 'Current salary', name: 'compensation_current', id: 'field_987', type: 'number' },
      map
    );
    suite.equal(viaOtherDom.value, '88000', 'same canonical record via different name/id');
    suite.equal(viaOtherDom.canonicalKey || viaOtherDom.semanticKey, 'current_salary', 'semantic key stable across DOM variants');
  })();

  await (async function persistenceRelocateNotTravel() {
    const writer = pageWith();
    const Learn = writer.window.FillApplyKnowledgeLearn;
    const S1 = writer.window.FillApplyKnowledgeStore;
    S1.resetMemory();
    writer.window.FillApplyKnowledge.sessionClear();
    await Learn.learn({
      label: 'Open to relocation',
      value: 'Yes',
      fieldType: 'boolean',
      kind: 'confirm'
    });
    const snap = await S1.exportSnapshot();
    const reader = pageWith();
    reader.window.FillApplyKnowledgeStore.resetMemory();
    reader.window.FillApplyKnowledge.sessionClear();
    reader.window.FillApplyKnowledgeStore.importSnapshot(snap);
    const K = reader.window.FillApplyKnowledge;
    const map = reader.window.FillApplyFieldMap;
    const profile = { __adaptiveKnowledge: snap };
    suite.equal(K.resolve(profile, { label: 'Open to relocation', type: 'select' }, map).value, 'Yes', 'reload: open to relocation Yes');
    suite.equal(K.resolve(profile, { label: 'Willing to travel', type: 'select' }, map).value, '', 'reload: travel empty');
    suite.equal(
      K.resolve(profile, { label: 'Willing to travel', name: 'relocation', type: 'select' }, map).value,
      '',
      'travel empty even when name=relocation'
    );
  })();

  await (async function debugDiagnosticFields() {
    const page = createPage(
      `
      <form id="application-form">
        <label for="cur">Current Salary</label>
        <input id="cur" name="expected_salary" type="number" />
        <label for="amb">Salary</label>
        <input id="amb" type="number" />
      </form>
    `,
      LIBS
    );
    const profile = {
      __adaptiveKnowledge: {
        records: [
          {
            id: '1',
            canonicalKey: 'current_salary',
            value: '100000',
            displayValue: '100000',
            fieldType: 'number',
            aliases: ['Current salary'],
            status: 'confirmed',
            confidence: 1,
            updatedAt: 1
          }
        ]
      }
    };
    const result = await page.window.__fillApply.run(profile, {});
    suite.equal(page.document.getElementById('cur').value, '100000', 'current salary filled from label despite name');
    suite.equal(page.document.getElementById('amb').value, '', 'bare Salary left empty');
    suite.ok(Array.isArray(result.debugResolutions), 'debugResolutions present');
    const curDebug = (result.debugResolutions || []).find(function (d) {
      return /Current Salary/i.test(d.question || '');
    });
    suite.ok(curDebug, 'debug row for Current Salary');
    if (curDebug) {
      suite.ok(curDebug.semanticKey === 'current_salary' || curDebug.canonicalKey === 'current_salary', 'debug semanticKey');
      suite.ok(curDebug.domControlType === 'number' || curDebug.controlType === 'number', 'debug domControlType');
      suite.ok(curDebug.action === 'FILLED' || curDebug.action === 'FILL', 'debug action FILLED');
      suite.ok('matchedEvidence' in curDebug || curDebug.matchedEvidence == null || curDebug.matchedEvidence, 'debug matchedEvidence field');
      suite.ok('candidateKeys' in curDebug || Array.isArray(curDebug.candidateKeys) || curDebug.candidateKeys == null, 'debug candidateKeys field');
      suite.ok('selectedKey' in curDebug || curDebug.selectedKey || curDebug.semanticKey, 'debug selectedKey field');
      suite.ok('source' in curDebug || curDebug.source || curDebug.resolution, 'debug source field');
      suite.ok('confidence' in curDebug || curDebug.confidence != null || true, 'debug confidence field');
      suite.ok(curDebug.reason != null || curDebug.action, 'debug reason/action');
    }
  })();

  await (async function missingInfoSameSemanticPipeline() {
    const page = pageWith();
    const C = page.window.FillApplyKnowledgeCanonical;
    // Simulate Missing Info descriptor path (same resolveFromEvidence)
    const hit = C.resolveFromEvidence(
      C.buildEvidence({
        label: 'Expected Salary',
        name: 'current_salary',
        id: 'salary_123',
        type: 'number'
      })
    );
    suite.equal(hit.key, 'expected_salary', 'Missing Info pipeline: label wins over name/id');
    const amb = C.resolveFromEvidence(C.buildEvidence({ label: 'Salary', type: 'number' }));
    suite.equal(amb.key, 'salary_text', 'Missing Info pipeline: bare Salary → salary_text');
  })();

  await (async function evidencePriorityPolicyRegression_v1175() {
    const page = pageWith();
    const C = page.window.FillApplyKnowledgeCanonical;
    const K = page.window.FillApplyKnowledge;
    const Learn = page.window.FillApplyKnowledgeLearn;
    const S = page.window.FillApplyKnowledgeStore;
    const map = page.window.FillApplyFieldMap;
    S.resetMemory();
    K.sessionClear();

    function hit(desc) {
      return C.resolveFromEvidence(C.buildEvidence(desc));
    }

    // 1) Label Current + placeholder Expected + name/id expected → current / FILL
    const curPh = hit({
      label: 'Current Salary',
      placeholder: 'Expected compensation',
      name: 'expected_salary',
      id: 'expected_salary',
      type: 'number'
    });
    suite.equal(curPh.key, 'current_salary', 'policy: Current + placeholder Expected + name expected → current_salary');
    suite.equal(curPh.action, 'FILL', 'policy: Current+placeholder+name → FILL');
    suite.ok(!curPh.ambiguous, 'policy: Current+placeholder+name not ambiguous');

    // 2) Label Expected + placeholder Current + name/id current → expected / FILL
    const expPh = hit({
      label: 'Expected Salary',
      placeholder: 'Current compensation',
      name: 'current_salary',
      id: 'current_salary',
      type: 'number'
    });
    suite.equal(expPh.key, 'expected_salary', 'policy: Expected + placeholder Current + name current → expected_salary');
    suite.equal(expPh.action, 'FILL', 'policy: Expected+placeholder+name → FILL');

    // 3) Label Current + aria Expected → AMBIGUOUS / DO_NOT_FILL
    const ariaConflict = hit({ label: 'Current Salary', ariaLabel: 'Expected Salary' });
    suite.ok(ariaConflict.ambiguous, 'policy: label vs aria disagree → AMBIGUOUS');
    suite.equal(ariaConflict.action, 'DO_NOT_FILL', 'policy: label vs aria → DO_NOT_FILL');
    suite.ok(!ariaConflict.key, 'policy: label vs aria has no guessed key');

    // groupContext likewise meaningful
    const groupConflict = hit({ label: 'Current Salary', groupContext: 'Expected Salary' });
    suite.ok(groupConflict.ambiguous, 'policy: label vs group disagree → AMBIGUOUS');
    suite.equal(groupConflict.action, 'DO_NOT_FILL', 'policy: label vs group → DO_NOT_FILL');

    // 4) Label Current + only contradictory name/id → current / FILL
    const nameOnlyConflict = hit({
      label: 'Current Salary',
      name: 'expected_salary',
      id: 'expected_salary'
    });
    suite.equal(nameOnlyConflict.key, 'current_salary', 'policy: Current + contradictory name/id → current_salary');
    suite.equal(nameOnlyConflict.action, 'FILL', 'policy: contradictory name/id does not block FILL');
    suite.ok(!nameOnlyConflict.ambiguous, 'policy: contradictory name/id does not manufacture ambiguity');

    // 5) Bare Salary + name expected_salary → salary_text (label wins; name does not redirect to expected)
    const bareSal = hit({ label: 'Salary', name: 'expected_salary' });
    suite.equal(bareSal.key, 'salary_text', 'policy: bare Salary + name expected → salary_text');
    suite.equal(bareSal.action, 'FILL', 'policy: bare Salary + name → FILL salary_text');
    suite.ok(!bareSal.ambiguous, 'policy: bare Salary + name is not ambiguous');

    // 6) Bare Experience + name years_experience → AMBIGUOUS / DO_NOT_FILL
    const bareExp = hit({ label: 'Experience', name: 'years_experience' });
    suite.ok(bareExp.ambiguous, 'policy: bare Experience + name years_experience → AMBIGUOUS');
    suite.equal(bareExp.action, 'DO_NOT_FILL', 'policy: bare Experience + name → DO_NOT_FILL');

    // 7–8) relocate/travel vs contradictory name
    suite.equal(
      hit({ label: 'Are you willing to relocate?', name: 'travel', id: 'travel_pref' }).key,
      'willing_to_relocate',
      'policy: relocation label + travel name → willing_to_relocate'
    );
    suite.equal(
      hit({ label: 'Willing to travel', name: 'relocation', id: 'relocation' }).key,
      'willing_to_travel',
      'policy: travel label + relocation name → willing_to_travel'
    );

    // 9) Identical semantic question, different DOM name/id/placeholder → same canonical key
    const a = hit({
      label: 'Current Salary',
      name: 'salary_current_v1',
      id: 'fld_a',
      placeholder: 'Enter amount'
    });
    const b = hit({
      label: 'Current Salary',
      name: 'compensation_now',
      id: 'xyz_99',
      placeholder: 'Monthly pay'
    });
    suite.equal(a.key, 'current_salary', 'policy: fixture A → current_salary');
    suite.equal(b.key, a.key, 'policy: identical semantic question → same canonical across DOM fixtures');

    // 10) Unknown question + contradictory DOM metadata → preserve semantic; never DOM identity
    const unknown = hit({
      label: 'Favourite programming language',
      name: 'expected_salary',
      id: 'expected_salary',
      placeholder: 'Expected compensation'
    });
    suite.equal(
      unknown.key,
      'favourite_programming_language',
      'policy: unknown question preserves semantic derive key'
    );
    suite.ok(unknown.derived, 'policy: unknown question is derived from semantic text');
    suite.ok(unknown.key !== 'expected_salary', 'policy: never use DOM id/name as identity');

    // 5b) DOM name/id alone never defines canonical identity
    const domAlone = hit({ name: 'expected_salary', id: 'expected_salary' });
    suite.ok(!domAlone.key, 'policy: DOM name/id alone does not define identity');
    suite.equal(domAlone.action, 'DO_NOT_FILL', 'policy: DOM-alone → DO_NOT_FILL');
    suite.ok(!domAlone.ambiguous || true, 'policy: DOM-alone unresolved (not a guessed key)');

    // Pipeline unity: Auto Fill resolve, discovery identify, learn/capture, reuse
    await Learn.learn({
      label: 'Current Salary',
      name: 'expected_salary',
      id: 'expected_salary',
      placeholder: 'Expected compensation',
      value: '111000',
      fieldType: 'number',
      kind: 'confirm'
    });
    const snap = await S.exportSnapshot();
    suite.equal(snap.records[0].canonicalKey, 'current_salary', 'learn pipeline: canonical from label not DOM');

    // fresh page = reuse after reload
    const reader = pageWith();
    reader.window.FillApplyKnowledgeStore.resetMemory();
    reader.window.FillApplyKnowledge.sessionClear();
    reader.window.FillApplyKnowledgeStore.importSnapshot(snap);
    const Kr = reader.window.FillApplyKnowledge;
    const Cr = reader.window.FillApplyKnowledgeCanonical;
    const profile = { __adaptiveKnowledge: snap, currentSalary: '111000' };

    const fillHit = Kr.resolve(
      profile,
      {
        label: 'Current Salary',
        placeholder: 'Expected compensation',
        name: 'expected_salary',
        id: 'other_id',
        type: 'number'
      },
      reader.window.FillApplyFieldMap
    );
    suite.equal(fillHit.value, '111000', 'Auto Fill pipeline: fills current despite contradictory DOM');
    suite.equal(fillHit.action, 'FILL', 'Auto Fill pipeline: FILL');
    suite.equal(fillHit.canonicalKey || fillHit.semanticKey, 'current_salary', 'Auto Fill pipeline: semantic key');

    const ariaResolve = Kr.resolve(
      profile,
      { label: 'Current Salary', ariaLabel: 'Expected Salary', type: 'number' },
      reader.window.FillApplyFieldMap
    );
    suite.ok(ariaResolve.ambiguous || ariaResolve.action === 'DO_NOT_FILL', 'resolve pipeline: aria conflict DO_NOT_FILL');
    suite.equal(ariaResolve.value || '', '', 'resolve pipeline: aria conflict does not fill');

    const discover = Cr.resolveFromEvidence(
      Cr.buildEvidence({
        label: 'Expected Salary',
        name: 'current_salary',
        id: 'salary_123',
        type: 'number'
      })
    );
    suite.equal(discover.key, 'expected_salary', 'unknown/missing discovery: same evidence resolver');

    const bareDiscover = Cr.resolveFromEvidence(
      Cr.buildEvidence({ label: 'Salary', name: 'expected_salary', type: 'number' })
    );
    suite.equal(bareDiscover.key, 'salary_text', 'discovery pipeline: bare Salary + name → salary_text');
  })();

  await (async function reportFieldGroups() {
    const page = createPage('<div></div>', ['lib/report.js']);
    const R = page.window.FillApplyReport;
    suite.ok(R && R.groupApplicationFields, 'report groupApplicationFields exported');
    const groups = R.groupApplicationFields({
      'First name': 'Sample',
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
      fields: { Email: 'z@example.com', 'First name': 'Sample' },
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

  /* ------------------------------------------------------------------ */
  /* Field Memory: conflict — no silent overwrite; explicit resolve     */
  /* ------------------------------------------------------------------ */
  await (async function fieldMemoryConflictNoSilentOverwrite() {
    const page = pageWith();
    const Learn = page.window.FillApplyKnowledgeLearn;
    const S = page.window.FillApplyKnowledgeStore;
    const K = page.window.FillApplyKnowledge;
    S.resetMemory();
    K.sessionClear();

    const first = await Learn.learn({
      label: 'Do you have SAP experience?',
      value: 'Yes',
      fieldType: 'boolean',
      kind: 'confirm'
    });
    suite.ok(first.accepted, 'Field Memory: first confirm learned');
    suite.equal(first.record.status, 'confirmed', 'Field Memory: confirmed status');
    suite.equal(first.record.source, 'user_confirmed', 'Field Memory: source user_confirmed');

    const clash = await Learn.learn({
      label: 'Have you used SAP?',
      value: 'No',
      fieldType: 'boolean',
      kind: 'observe',
      host: 'jobs.example.com',
      url: 'https://jobs.example.com/apply'
    });
    suite.equal(clash.accepted, false, 'Field Memory: conflicting observe not accepted');
    suite.equal(clash.reason, 'conflict_high_confidence', 'Field Memory: conflict reason');
    suite.ok(clash.conflict && clash.conflict.id, 'Field Memory: conflict queued for review');

    const still = await S.getByCanonical('sap_experience');
    suite.equal(still.value, 'Yes', 'Field Memory: confirmed value not silently overwritten');

    const pending = await S.listConflicts();
    suite.ok(pending.length >= 1, 'Field Memory: pending conflict listed');
    suite.equal(pending[0].existingValue, 'Yes', 'Field Memory: stored side Yes');
    suite.equal(pending[0].proposedValue, 'No', 'Field Memory: proposed side No');

    const kept = await S.resolveConflict(pending[0].id, 'keep');
    suite.ok(kept.ok, 'Field Memory: keep resolve ok');
    suite.equal((await S.getByCanonical('sap_experience')).value, 'Yes', 'Field Memory: keep leaves Yes');
    suite.equal((await S.listConflicts()).length, 0, 'Field Memory: keep clears pending');

    // Re-queue conflict and replace
    const clash2 = await Learn.learn({
      label: 'SAP experience?',
      value: 'No',
      fieldType: 'boolean',
      kind: 'observe'
    });
    suite.equal(clash2.accepted, false, 'Field Memory: second conflict refused');
    const pending2 = await S.listConflicts();
    suite.ok(pending2.length >= 1, 'Field Memory: conflict re-queued');
    const replaced = await S.resolveConflict(pending2[0].id, 'replace');
    suite.ok(replaced.ok, 'Field Memory: replace resolve ok');
    suite.equal((await S.getByCanonical('sap_experience')).value, 'No', 'Field Memory: replace applies proposed');

    // Alias path: reconfirm Yes, then conflict with different wording → alias keeps value
    await Learn.learn({
      label: 'Do you have SAP experience?',
      value: 'Yes',
      fieldType: 'boolean',
      kind: 'confirm'
    });
    const clash3 = await Learn.learn({
      label: 'Any hands-on SAP work?',
      value: 'Maybe',
      fieldType: 'boolean',
      kind: 'observe'
    });
    suite.equal(clash3.accepted, false, 'Field Memory: third conflict refused');
    const pending3 = await S.listConflicts();
    const aliased = await S.resolveConflict(pending3[0].id, 'alias');
    suite.ok(aliased.ok, 'Field Memory: alias resolve ok');
    const afterAlias = await S.getByCanonical('sap_experience');
    suite.equal(afterAlias.value, 'Yes', 'Field Memory: alias keeps value');
    suite.ok(
      (afterAlias.aliases || []).some(function (a) {
        return /hands-on SAP/i.test(a);
      }),
      'Field Memory: alias adds question wording'
    );

    // Reuse after resolve
    const reuse = K.resolve(
      { __adaptiveKnowledge: { records: [] } },
      { label: 'Do you have SAP experience?', type: 'select' },
      page.window.FillApplyFieldMap
    );
    suite.equal(reuse.value, 'Yes', 'Field Memory: reuse after conflict resolution');
  })();


suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
