/**
 * Unified answer resolver.
 *
 * Precedence:
 *   1. explicit current-session input
 *   2. confirmed user knowledge (Tier 2)
 *   3. user profile (stable facts)
 *   4. built-in knowledge (FIELD_MAP / customAnswers / customQA)
 *   5. AI inference (seam — never invents)
 *   6. unknown (empty)
 *
 * Attaches globalThis.FillApplyKnowledge.
 */
(function (global) {
  'use strict';

  var session = {};

  function store() {
    return global.FillApplyKnowledgeStore || null;
  }

  function canonical() {
    return global.FillApplyKnowledgeCanonical || null;
  }

  function isBlank(v) {
    return v == null || String(v).trim() === '';
  }

  function hydrate(snapshot) {
    var S = store();
    if (S && typeof S.importSnapshot === 'function' && snapshot) {
      S.importSnapshot(snapshot);
    }
    return snapshot || null;
  }

  function sessionSet(record) {
    if (!record || !record.canonicalKey) return;
    session[record.canonicalKey] = record;
    var S = store();
    if (S && record.id) {
      try {
        S.importSnapshot({ records: [record] });
      } catch (_e) { /* ignore */ }
    }
  }

  function sessionGet(canonicalKey) {
    return canonicalKey ? session[canonicalKey] || null : null;
  }

  function sessionClear() {
    session = {};
  }

  function descriptorHay(descriptor) {
    if (!descriptor) return '';
    return [descriptor.label, descriptor.placeholder, descriptor.name, descriptor.id]
      .filter(Boolean)
      .join(' ');
  }

  function snapshotRecords(profile) {
    var snap = profile && profile.__adaptiveKnowledge;
    var fromSnap = snap && Array.isArray(snap.records) ? snap.records : [];
    var S = store();
    var fromMem = [];
    if (S && S.listKnowledge) {
      /* listKnowledge is async; memory was imported via hydrate. Read via export of import. */
    }
    var merged = {};
    fromSnap.forEach(function (r) {
      if (r && r.canonicalKey) merged[r.canonicalKey] = r;
    });
    Object.keys(session).forEach(function (k) {
      merged[k] = session[k];
    });
    if (S && S.normalizeRecord) {
      /* pull anything imported into the store's memory by walking export if sync */
    }
    return Object.keys(merged).map(function (k) {
      return merged[k];
    });
  }

  /**
   * Sync view of records: session + hydrated snapshot + in-memory store.
   */
  function allRecords(profile) {
    var byKey = {};
    var snap = profile && profile.__adaptiveKnowledge;
    (snap && snap.records ? snap.records : []).forEach(function (r) {
      if (r && r.canonicalKey) byKey[r.canonicalKey] = r;
    });
    var S = store();
    if (S && S.exportSnapshot) {
      /* memory already merged into snapshot at attach time; also import */
    }
    if (S && typeof S.listKnowledge !== 'function') {
      /* noop */
    }
    // Memory layer: store keeps records on importSnapshot
    if (S && S.resetMemory) {
      try {
        var memSnap = syncMemoryRecords();
        memSnap.forEach(function (r) {
          if (r && r.canonicalKey) {
            var prev = byKey[r.canonicalKey];
            if (!prev || (r.updatedAt || 0) >= (prev.updatedAt || 0)) byKey[r.canonicalKey] = r;
          }
        });
      } catch (_e) { /* ignore */ }
    }
    Object.keys(session).forEach(function (k) {
      byKey[k] = session[k];
    });
    return Object.keys(byKey).map(function (k) {
      return byKey[k];
    });
  }

  function syncMemoryRecords() {
    var S = store();
    if (!S) return [];
    // exportSnapshot is async; read the private-ish memory via a dummy import roundtrip
    // The store exposes nothing sync except after importSnapshot. We keep a
    // local mirror on this module instead.
    return _memoryMirror;
  }

  var _memoryMirror = [];

  function remember(record) {
    if (!record || !record.canonicalKey) return;
    var next = [];
    var replaced = false;
    _memoryMirror.forEach(function (r) {
      if (r.canonicalKey === record.canonicalKey) {
        next.push(record);
        replaced = true;
      } else next.push(r);
    });
    if (!replaced) next.push(record);
    _memoryMirror = next;
    sessionSet(record);
  }

  function usable(record) {
    if (!record || isBlank(record.value) && isBlank(record.displayValue)) return false;
    if (record.status === 'rejected') return false;
    return record.status === 'confirmed' || (record.status === 'provisional' && (record.confidence || 0) >= 0.8);
  }

  function pack(record, source, key) {
    var value = record.displayValue != null && String(record.displayValue).trim() !== ''
      ? record.displayValue
      : record.value;
    return {
      key: key || record.canonicalKey,
      value: String(value == null ? '' : value),
      source: source,
      fieldType: record.fieldType || 'text',
      confidence: record.confidence,
      canonicalKey: record.canonicalKey
    };
  }

  function matchRecord(records, descriptor, profile) {
    var C = canonical();
    var hay = descriptorHay(descriptor);
    if (!hay || !C) return null;
    var identified = C.matchCanonical(hay, {
      records: records,
      also: [descriptor && descriptor.placeholder],
      fieldType: descriptor && descriptor.type
    });
    if (!identified || !identified.key) return null;

    for (var i = 0; i < records.length; i++) {
      if (records[i].canonicalKey === identified.key && usable(records[i])) {
        return { record: records[i], identified: identified };
      }
    }

    // Alias-only: a learned alias may identify a key we already have
    var best = null;
    var bestScore = 0;
    records.forEach(function (rec) {
      if (!usable(rec)) return;
      var aliases = (rec.aliases || []).concat([
        String(rec.canonicalKey || '').replace(/_/g, ' '),
        rec.lastSeenLabel || ''
      ]);
      var score = C.aliasScore(hay, aliases);
      if (score > bestScore) {
        bestScore = score;
        best = rec;
      }
    });
    if (best && bestScore >= 22) return { record: best, identified: identified };
    return identified.key && !identified.derived ? { record: null, identified: identified } : { record: null, identified: identified };
  }

  function legacyAnswerFor(profile, descriptor, map) {
    profile = profile || {};
    map = map || global.FillApplyFieldMap;
    if (!map) return { key: null, value: '', source: null };

    var label = (descriptor && descriptor.label) || '';
    var labLower = label.toLowerCase();

    function resolveValue(key) {
      if (!key) return '';
      if (key === 'fullName') {
        return (
          profile.fullName ||
          [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
          ''
        );
      }
      var v = profile[key];
      return v == null ? '' : String(v);
    }

    var key = typeof map.bestKeyForField === 'function' ? map.bestKeyForField(descriptor) : null;
    var value = resolveValue(key);
    if (value) return { key: key, value: value, source: 'fieldMap' };

    if (/authoriz|eligible.*work|legally.*work|work.*auth|right to work|permitted to work/.test(labLower)) {
      value = resolveValue('authorizedToWork');
      if (value) return { key: 'authorizedToWork', value: value, source: 'workAuth' };
    }
    if (/sponsor|visa|require.*sponsor|need.*sponsor/.test(labLower)) {
      value = resolveValue('requiresSponsorship');
      if (value) return { key: 'requiresSponsorship', value: value, source: 'sponsorship' };
    }

    if (label && typeof map.answerForLabel === 'function') {
      var looked = map.answerForLabel(profile, label);
      if (looked && !looked.missing && looked.value) {
        return {
          key: looked.key || 'customAnswers',
          value: looked.value,
          source: looked.source || 'answerForLabel'
        };
      }
    }

    var qa = typeof map.matchCustomQA === 'function'
      ? map.matchCustomQA(profile.customQA, label, descriptor && descriptor.placeholder)
      : null;
    if (qa) return { key: 'customQA', value: qa, source: 'customQA' };

    return { key: key || null, value: '', source: null };
  }

  function inferAi(_profile, _descriptor) {
    // Seam only. Product rule: never invent an answer.
    return { key: null, value: '', source: null };
  }

  /**
   * @returns {{ key, value, source, fieldType?, confidence?, canonicalKey? }}
   */
  function resolve(profile, descriptor, map) {
    profile = profile || {};
    if (profile.__adaptiveKnowledge) hydrate(profile.__adaptiveKnowledge);

    var records = allRecords(profile);
    var C = canonical();
    var identified = C
      ? C.matchCanonical(descriptorHay(descriptor), {
          records: records,
          also: [descriptor && descriptor.placeholder],
          fieldType: descriptor && descriptor.type
        })
      : { key: null, score: 0 };

    // 1. explicit current-session
    if (identified && identified.key && session[identified.key] && usable(session[identified.key])) {
      return pack(session[identified.key], 'session', identified.profileKey || identified.key);
    }
    var sessionHit = matchRecord(Object.keys(session).map(function (k) { return session[k]; }), descriptor, profile);
    if (sessionHit && sessionHit.record) {
      return pack(sessionHit.record, 'session', sessionHit.identified && sessionHit.identified.profileKey);
    }

    // 2. confirmed / usable user knowledge
    var knowledgeHit = matchRecord(
      records.filter(function (r) {
        return r && r.status !== 'rejected';
      }),
      descriptor,
      profile
    );
    if (knowledgeHit && knowledgeHit.record && usable(knowledgeHit.record)) {
      return pack(
        knowledgeHit.record,
        'userKnowledge',
        (knowledgeHit.identified && knowledgeHit.identified.profileKey) || knowledgeHit.record.canonicalKey
      );
    }

    // 3 + 4. profile facts, then built-in field-map / customAnswers / customQA
    var legacy = legacyAnswerFor(profile, descriptor, map);
    if (legacy && !isBlank(legacy.value)) return legacy;

    // 5. AI seam
    var ai = inferAi(profile, descriptor);
    if (ai && !isBlank(ai.value)) return ai;

    // 6. unknown
    return {
      key: (identified && identified.profileKey) || (identified && identified.key) || (legacy && legacy.key) || null,
      value: '',
      source: null,
      canonicalKey: identified && identified.key
    };
  }

  global.FillApplyKnowledge = {
    hydrate: hydrate,
    remember: remember,
    sessionSet: sessionSet,
    sessionGet: sessionGet,
    sessionClear: sessionClear,
    resolve: resolve,
    legacyAnswerFor: legacyAnswerFor,
    descriptorHay: descriptorHay
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
