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

  /**
   * @deprecated Do not concatenate DOM metadata into one matcher string.
   * Use identify(descriptor) / buildEvidence instead.
   */
  function descriptorHay(descriptor) {
    if (!descriptor) return '';
    // Label / question only — never name/id (v1.17.4 semantic identity).
    return [descriptor.question, descriptor.label].filter(Boolean).join(' ') ||
      descriptor.ariaLabel ||
      descriptor.placeholder ||
      '';
  }

  function identify(descriptor, records, fieldTypeHint) {
    var C = canonical();
    if (!C) return { key: null, score: 0, ambiguous: false };
    var extras = {
      records: records || [],
      fieldType: fieldTypeHint || (descriptor && descriptor.type) || ''
    };
    if (C.resolveFromEvidence && C.buildEvidence) {
      return C.resolveFromEvidence(C.buildEvidence(descriptor), extras);
    }
    return C.matchCanonical((descriptor && (descriptor.question || descriptor.label)) || '', extras);
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
    if (!record || (isBlank(record.value) && isBlank(record.displayValue))) return false;
    if (record.status === 'rejected') return false;
    var st = String(record.status || 'confirmed').toLowerCase();
    // Import dictionaries often use status:"active"
    if (st === 'confirmed' || st === 'active' || st === 'learned') return true;
    if (st === 'provisional' && (record.confidence || 0) >= 0.8) return true;
    return false;
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
    if (!C || !descriptor) return null;
    var identified = identify(descriptor, records, descriptor.type);
    if (identified && identified.ambiguous) {
      return {
        record: null,
        identified: identified,
        blocked: true,
        reason: identified.reason || 'ambiguous',
        action: 'DO_NOT_FILL',
        ambiguous: true
      };
    }
    if (!identified || !identified.key) {
      return { record: null, identified: identified || { key: null } };
    }

    var primaryText =
      (descriptor.question || descriptor.label || descriptor.ariaLabel || '').trim();

    // Canonical Key is identity. Prefer exact key match only.
    for (var i = 0; i < records.length; i++) {
      if (records[i].canonicalKey === identified.key && usable(records[i])) {
        var rec = records[i];
        if (C.isExcludedPair && descriptor && descriptor._resolvedKeyHint) {
          if (C.isExcludedPair(descriptor._resolvedKeyHint, rec.canonicalKey)) continue;
        }
        if (C.validateRecord) {
          var desc = Object.assign({}, descriptor || {}, { _identifiedKey: identified.key });
          var v = C.validateRecord(rec, desc);
          if (!v.ok) {
            return {
              record: null,
              identified: identified,
              blocked: true,
              reason: v.reason,
              action: 'DO_NOT_FILL'
            };
          }
        }
        return { record: rec, identified: identified };
      }
    }

    // Strong alias-only reuse against the semantic question text (not DOM name/id).
    var best = null;
    var bestScore = 0;
    var competing = [];
    records.forEach(function (rec) {
      if (!usable(rec)) return;
      if (C.isExcludedPair && C.isExcludedPair(identified.key, rec.canonicalKey)) return;
      var aliases = (rec.aliases || []).concat([
        String(rec.canonicalKey || '').replace(/_/g, ' '),
        rec.lastSeenLabel || ''
      ]);
      var score = C.aliasScore(primaryText, aliases);
      // Gate: exact/near-exact only (≥ 100) — never weak single-token
      if (score >= 100) {
        competing.push({ rec: rec, score: score });
        if (score > bestScore) {
          bestScore = score;
          best = rec;
        }
      }
    });
    // Competing keys with strong alias hits → AMBIGUOUS
    var uniq = [];
    competing.forEach(function (c) {
      if (uniq.indexOf(c.rec.canonicalKey) === -1) uniq.push(c.rec.canonicalKey);
    });
    if (uniq.length > 1) {
      return {
        record: null,
        identified: Object.assign({}, identified, {
          ambiguous: true,
          candidateKeys: uniq,
          reason: 'competing_keys'
        }),
        blocked: true,
        reason: 'competing_keys',
        action: 'DO_NOT_FILL',
        ambiguous: true
      };
    }
    if (best) {
      if (best.canonicalKey === identified.key || identified.derived) {
        return {
          record: best,
          identified: Object.assign({}, identified, {
            key: best.canonicalKey,
            semanticKey: best.canonicalKey,
            source: identified.derived ? 'learned' : identified.source
          })
        };
      }
    }
    return { record: null, identified: identified };
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
    var identified = identify(descriptor, records, descriptor && descriptor.type);

    function enrich(result, identifiedHit, action) {
      result = result || {};
      result.canonicalKey = (identifiedHit && identifiedHit.key) || result.canonicalKey || null;
      result.semanticKey = (identifiedHit && (identifiedHit.semanticKey || identifiedHit.key)) || result.canonicalKey;
      result.matchedEvidence = identifiedHit && identifiedHit.matchedEvidence;
      result.candidateKeys = (identifiedHit && identifiedHit.candidateKeys) || [];
      result.action = action || result.action;
      if (identifiedHit && identifiedHit.ambiguous) {
        result.ambiguous = true;
        result.action = 'DO_NOT_FILL';
        result.reason = identifiedHit.reason || result.reason || 'ambiguous';
        result.value = '';
        result.source = null;
      }
      return result;
    }

    if (identified && identified.ambiguous) {
      return enrich({
        key: null,
        value: '',
        source: null,
        fieldType: identified.fieldType || null,
        confidence: null
      }, identified, 'DO_NOT_FILL');
    }

    // 1. explicit current-session
    if (identified && identified.key && session[identified.key] && usable(session[identified.key])) {
      return enrich(
        pack(session[identified.key], 'session', identified.profileKey || identified.key),
        identified,
        'FILL'
      );
    }
    var sessionHit = matchRecord(Object.keys(session).map(function (k) { return session[k]; }), descriptor, profile);
    if (sessionHit && sessionHit.blocked) {
      return enrich({
        key: null,
        value: '',
        source: null,
        fieldType: identified && identified.fieldType,
        reason: sessionHit.reason
      }, sessionHit.identified || identified, 'DO_NOT_FILL');
    }
    if (sessionHit && sessionHit.record) {
      return enrich(
        pack(sessionHit.record, 'session', sessionHit.identified && sessionHit.identified.profileKey),
        sessionHit.identified || identified,
        'FILL'
      );
    }

    // 2. confirmed / usable user knowledge
    var knowledgeHit = matchRecord(
      records.filter(function (r) {
        return r && r.status !== 'rejected';
      }),
      descriptor,
      profile
    );
    if (knowledgeHit && knowledgeHit.blocked) {
      return enrich({
        key: (identified && identified.profileKey) || (identified && identified.key) || null,
        value: '',
        source: null,
        fieldType: identified && identified.fieldType,
        reason: knowledgeHit.reason
      }, knowledgeHit.identified || identified, 'DO_NOT_FILL');
    }
    if (knowledgeHit && knowledgeHit.record && usable(knowledgeHit.record)) {
      var packed = pack(
        knowledgeHit.record,
        'userKnowledge',
        (knowledgeHit.identified && knowledgeHit.identified.profileKey) || knowledgeHit.record.canonicalKey
      );
      packed.fieldType = knowledgeHit.record.fieldType || packed.fieldType;
      packed.confidence = knowledgeHit.record.confidence;
      return enrich(packed, knowledgeHit.identified || identified, 'FILL');
    }

    // 3 + 4. profile facts, then built-in field-map / customAnswers / customQA
    // 3a. Profile / applicationQuestions for the *identified* semantic key first
    if (identified && identified.key) {
      var idPk = identified.profileKey || (C && C.profileKeyFor && C.profileKeyFor(identified.key));
      if (idPk && profile && profile[idPk] != null && String(profile[idPk]).trim() !== '') {
        return enrich(
          { key: idPk, value: String(profile[idPk]).trim(), source: 'profileIdentified', fieldType: identified.fieldType },
          identified,
          'FILL'
        );
      }
      var aq = profile.applicationQuestions && profile.applicationQuestions[identified.key];
      if (aq && typeof aq === 'object') {
        var aqAns = aq.answer != null ? aq.answer : aq.value;
        if (aqAns != null && String(aqAns).trim() !== '') {
          return enrich(
            {
              key: identified.key,
              value: String(aqAns).trim(),
              source: 'applicationQuestions',
              fieldType: aq.type || identified.fieldType || 'boolean'
            },
            identified,
            'FILL'
          );
        }
      }
      var ca = profile.customAnswers;
      if (ca && typeof ca === 'object') {
        var caKeys = [];
        if (idPk) caKeys.push(idPk);
        caKeys.push(identified.key);
        // camelCase ↔ snake_case
        caKeys.push(String(identified.key).replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); }));
        if (idPk) caKeys.push(String(idPk).replace(/([A-Z])/g, function (c) { return '_' + c.toLowerCase(); }));
        for (var ck = 0; ck < caKeys.length; ck++) {
          var caKey = caKeys[ck];
          if (caKey && ca[caKey] != null && String(ca[caKey]).trim() !== '') {
            return enrich(
              {
                key: caKey,
                value: String(ca[caKey]).trim(),
                source: 'customAnswers.key',
                fieldType: identified.fieldType
              },
              identified,
              'FILL'
            );
          }
        }
      }
    }

    var legacy = legacyAnswerFor(profile, descriptor, map);
    if (legacy && !isBlank(legacy.value)) {
      // Guard: label/question semantic identity wins over name/id-driven field-map.
      var legacyCanon = legacy.key;
      if (C && C.CANONICAL_CATALOG) {
        var catalog = C.CANONICAL_CATALOG;
        for (var ci = 0; ci < catalog.length; ci++) {
          if (catalog[ci].profileKey && catalog[ci].profileKey === legacy.key) {
            legacyCanon = catalog[ci].key;
            break;
          }
          if (catalog[ci].key === legacy.key) {
            legacyCanon = catalog[ci].key;
            break;
          }
        }
      }
      if (C && identified && identified.key && legacyCanon && identified.key !== String(legacyCanon)) {
        var decisive =
          !identified.derived &&
          ((identified.score || 0) >= 90 ||
            identified.source === 'learned' ||
            identified.source === 'catalog');
        var competing =
          (C.isExcludedPair && C.isExcludedPair(identified.key, String(legacyCanon))) ||
          (C.areCompetingKeys && C.areCompetingKeys(identified.key, String(legacyCanon)));
        if (decisive || competing) {
          // Prefer profile value for the resolved semantic key when available;
          // otherwise skip — never fill address_line_1 from location, etc.
          var pk = identified.profileKey || (C.profileKeyFor && C.profileKeyFor(identified.key));
          if (pk && profile && profile[pk] != null && String(profile[pk]).trim() !== '') {
            legacy = { key: pk, value: String(profile[pk]), source: 'profileSemantic' };
          } else {
            legacy = null;
          }
        }
      }
    }
    if (legacy && !isBlank(legacy.value)) {
      legacy.action = 'FILL';
      legacy.canonicalKey = (identified && identified.key) || legacy.key;
      return enrich(legacy, identified, 'FILL');
    }

    // 5. AI seam
    var ai = inferAi(profile, descriptor);
    if (ai && !isBlank(ai.value)) return enrich(ai, identified, 'FILL');

    // 6. unknown
    return enrich({
      key: (identified && identified.profileKey) || (identified && identified.key) || (legacy && legacy.key) || null,
      value: '',
      source: null,
      fieldType: identified && identified.fieldType,
      reason: 'unknown'
    }, identified, 'DO_NOT_FILL');
  }

  global.FillApplyKnowledge = {
    hydrate: hydrate,
    remember: remember,
    sessionSet: sessionSet,
    sessionGet: sessionGet,
    sessionClear: sessionClear,
    resolve: resolve,
    matchRecord: matchRecord,
    legacyAnswerFor: legacyAnswerFor,
    descriptorHay: descriptorHay,
    identify: identify
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
