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
    const badText = C.prepareFillValue('Zahid Khan', 'string', 'select', yesNo);
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
