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

  suite.finish();
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
