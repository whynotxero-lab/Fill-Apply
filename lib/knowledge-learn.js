/**
 * Learn from explicit applicant input only.
 * Noise / autofill / EEO / consent are ignored.
 *
 * Attaches globalThis.FillApplyKnowledgeLearn.
 */
(function (global) {
  'use strict';

  var NOISE_RE =
    /^(test|testing|asdf|asd|xxx|xxxx|qwerty|foo|bar|baz|n\/a|na|tbd|todo|temp|dummy|\.+|-+|_+)$/i;

  var DIVERSITY_RE =
    /diversity|equal opportunity|\beeo\b|race|ethnicity|gender identity|\bveteran\b|disability|sexual orientation|hispanic|latino|\blgbt|decline to (self-)?identify|voluntary self.?identif|self.?identification/i;

  var CONSENT_RE =
    /\b(i understand and agree|i agree|i accept|i consent|i acknowledge|i certify|i confirm|agree|consent|privacy notice|applicant privacy|privacy policy|electronic signature|e-?sign|terms(?:\s+and\s+conditions)?|acknowledge|data protection|gdpr|declaration)\b/i;

  function canonical() {
    return global.FillApplyKnowledgeCanonical;
  }

  function store() {
    return global.FillApplyKnowledgeStore;
  }

  function knowledge() {
    return global.FillApplyKnowledge;
  }

  function isNoise(value) {
    var s = String(value == null ? '' : value).trim();
    if (!s) return true;
    if (NOISE_RE.test(s)) return true;
    if (s.length === 1 && !/[0-9yYnN]/.test(s)) return true;
    return false;
  }

  var GENDER_LEARN_RE = /\b(gender(\s*identity)?|sex)\b/i;
  var SEXUAL_ORIENTATION_RE = /sexual\s*orientation/i;

  function isGenderLabel(label) {
    var s = String(label || '');
    if (!GENDER_LEARN_RE.test(s)) return false;
    if (SEXUAL_ORIENTATION_RE.test(s)) return false;
    return true;
  }

  function isSensitiveLabel(label) {
    var s = String(label || '');
    // Consent is policy-ticked, not learned as applicant knowledge.
    if (CONSENT_RE.test(s)) return true;
    if (/\bpassword\b/i.test(s)) return true;
    // Gender/sex select answers are learnable (Key/Type/Value); other EEO stays blocked.
    if (isGenderLabel(s)) return false;
    if (DIVERSITY_RE.test(s)) return true;
    return false;
  }

  function looksSolid(value, fieldType) {
    var s = String(value == null ? '' : value).trim();
    if (!s) return false;
    var ft = (canonical() && canonical().normalizeFieldType)
      ? canonical().normalizeFieldType(fieldType)
      : fieldType;
    if (ft === 'boolean' || ft === 'select' || ft === 'multiselect' || ft === 'number' || ft === 'date') {
      return true;
    }
    return s.length >= 2;
  }

  function postToBackground(type, payload) {
    return new Promise(function (resolve) {
      if (!global.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
        resolve(null);
        return;
      }
      try {
        chrome.runtime.sendMessage(Object.assign({ type: type }, payload || {}), function (res) {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(res);
        });
      } catch (_e) {
        resolve(null);
      }
    });
  }

  /**
   * @param {object} input
   * @param {string} input.label
   * @param {*} input.value
   * @param {string} [input.fieldType]
   * @param {string} [input.kind] observe | correct | confirm | edit
   * @param {string} [input.host]
   * @param {string} [input.url]
   * @param {string} [input.previousValue]
   * @param {boolean} [input.autofilled]
   * @param {string} [input.profileId]
   * @param {string} [input.name]
   * @param {string} [input.placeholder]
   */
  async function learn(input) {
    input = input || {};
    var C = canonical();
    var S = store();
    var K = knowledge();
    var label = String(input.label || '').trim();
    var fieldType = input.fieldType || 'string';
    var rawValue = C && C.normalizeValue ? C.normalizeValue(input.value, fieldType) : String(input.value || '').trim();

    var rejected = function (reason) {
      if (S && S.addEvent) {
        S.addEvent({
          kind: input.kind || 'observe',
          canonicalKey: '',
          label: label,
          value: rawValue,
          fieldType: fieldType,
          host: input.host || '',
          accepted: false,
          reason: reason
        });
      }
      return { ok: false, accepted: false, reason: reason };
    };

    if (isSensitiveLabel(label)) return rejected('sensitive');
    if (isNoise(rawValue)) return rejected('noise');
    if (!label && !input.canonicalKey) return rejected('no_label');

    var settingsOk = true;
    if (S && S.getSettings) {
      try {
        var settings = await S.getSettings();
        if (settings && settings.learningEnabled === false) settingsOk = false;
      } catch (_e) { /* keep default */ }
    }
    if (!settingsOk) return rejected('learning_disabled');

    var existingRecords = [];
    if (S && S.listKnowledge) {
      try {
        existingRecords = await S.listKnowledge(input.profileId);
      } catch (_e2) {
        existingRecords = [];
      }
    }
    if (K) {
      var sess = [];
      /* session records are merged via remember */
    }

    var identified = null;
    if (C && C.resolveFromEvidence && C.buildEvidence) {
      identified = C.resolveFromEvidence(
        C.buildEvidence({
          label: label,
          question: input.question || '',
          placeholder: input.placeholder || '',
          name: input.name || '',
          id: input.id || '',
          autocomplete: input.autocomplete || '',
          ariaLabel: input.ariaLabel || '',
          groupContext: input.groupContext || '',
          type: fieldType,
          options: input.options || []
        }),
        { records: existingRecords, fieldType: fieldType }
      );
    } else if (C) {
      // Label-only — never concatenate name/id into identity
      identified = C.matchCanonical(label, { records: existingRecords, fieldType: fieldType });
    } else {
      identified = { key: input.canonicalKey || 'unknown_field', score: 0, derived: true };
    }

    if (identified && identified.ambiguous && !input.canonicalKey) {
      return rejected(identified.reason || 'ambiguous');
    }

    var canonicalKey = input.canonicalKey || (identified && identified.key) || (C && C.deriveCanonicalKey(label));
    if (!canonicalKey || canonicalKey === 'unknown_field') return rejected('no_canonical');
    if (identified && identified.fieldType) fieldType = input.fieldType || identified.fieldType;
    if (C && C.normalizeFieldType) fieldType = C.normalizeFieldType(fieldType);

    var existing = null;
    if (S && S.getByCanonical) {
      try {
        existing = await S.getByCanonical(canonicalKey, input.profileId);
      } catch (_e3) {
        existing = null;
      }
    }

    var kind = input.kind || (input.autofilled ? 'correct' : 'observe');
    var isCorrection = kind === 'correct' || !!input.autofilled;
    var isConfirm = kind === 'confirm' || kind === 'edit';

    var confidence = 0.85;
    var status = looksSolid(rawValue, fieldType) ? 'confirmed' : 'provisional';
    if (isCorrection) {
      confidence = 0.95;
      status = 'confirmed';
    }
    if (isConfirm) {
      confidence = 1;
      status = 'confirmed';
    }

    if (existing && existing.status === 'confirmed' && (existing.confidence || 0) >= 0.9) {
      var same = String(existing.displayValue || existing.value || '') === rawValue;
      if (!same && !isCorrection && !isConfirm) {
        if (S && S.addEvent) {
          S.addEvent({
            kind: 'conflict',
            canonicalKey: canonicalKey,
            label: label,
            value: rawValue,
            fieldType: fieldType,
            host: input.host || '',
            accepted: false,
            reason: 'conflict_high_confidence'
          });
        }
        var conflictRow = null;
        if (S && S.putConflict) {
          try {
            conflictRow = await S.putConflict({
              canonicalKey: canonicalKey,
              label: label,
              fieldType: fieldType,
              existingValue: String(existing.displayValue || existing.value || ''),
              proposedValue: rawValue,
              existingConfidence: existing.confidence,
              existingStatus: existing.status,
              existingId: existing.id || null,
              profileId: input.profileId != null ? input.profileId : existing.profileId,
              host: input.host || '',
              url: input.url || '',
              reason: 'conflict_high_confidence'
            });
          } catch (_ce) {
            conflictRow = null;
          }
        }
        return {
          ok: true,
          accepted: false,
          reason: 'conflict_high_confidence',
          canonicalKey: canonicalKey,
          existing: existing,
          conflict: conflictRow
        };
      }
      if (same) {
        existing.usageCount = (existing.usageCount || 0) + 1;
        existing.lastUsedAt = Date.now();
        existing.lastSeenLabel = label || existing.lastSeenLabel;
        existing.confidence = Math.min(1, (existing.confidence || 0.85) + 0.05);
        if (label && (existing.aliases || []).indexOf(label) === -1) {
          existing.aliases = (existing.aliases || []).concat([label]);
        }
        if (S) await S.putKnowledge(existing);
        if (K) K.remember(existing);
        return { ok: true, accepted: true, updated: true, record: existing };
      }
    }

    var aliases = existing && Array.isArray(existing.aliases) ? existing.aliases.slice() : [];
    if (label && aliases.indexOf(label) === -1) aliases.push(label);
    if (identified && !identified.derived && aliases.indexOf(canonicalKey.replace(/_/g, ' ')) === -1) {
      aliases.push(canonicalKey.replace(/_/g, ' '));
    }

    var record = {
      id: existing && existing.id,
      canonicalKey: canonicalKey,
      fieldType: fieldType,
      value: rawValue,
      displayValue: rawValue,
      aliases: aliases,
      source: isConfirm ? 'user_confirm' : isCorrection ? 'user_correction' : 'user_explicit',
      confidence: confidence,
      status: status,
      usageCount: existing ? (existing.usageCount || 0) + 1 : 1,
      createdAt: existing && existing.createdAt,
      lastSeenLabel: label,
      profileId: input.profileId != null ? input.profileId : existing && existing.profileId,
      provenance: {
        host: input.host || '',
        url: input.url || '',
        originalLabel: label,
        previousValue: input.previousValue || (existing && existing.displayValue) || '',
        autofilled: !!input.autofilled
      }
    };

    // Immediate same-context reflection before await persist
    if (K) K.remember(store() && store().normalizeRecord ? store().normalizeRecord(record) : record);

    if (S) {
      record = await S.putKnowledge(record);
      if (S.addEvent) {
        S.addEvent({
          kind: kind,
          canonicalKey: canonicalKey,
          label: label,
          value: rawValue,
          fieldType: fieldType,
          host: input.host || '',
          accepted: true,
          reason: 'learned'
        });
      }
    } else if (K) {
      K.remember(record);
    }

    await postToBackground('FILL_APPLY_KNOWLEDGE_LEARN', { record: record, input: input });

    return { ok: true, accepted: true, record: record };
  }

  /**
   * Learn each { label → value } from the missing-fields popup or Options.
   */
  async function learnMany(map, meta) {
    meta = meta || {};
    var keys = map && typeof map === 'object' ? Object.keys(map) : [];
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var label = keys[i];
      out.push(
        await learn(
          Object.assign({}, meta, {
            label: label,
            value: map[label],
            kind: meta.kind || 'confirm'
          })
        )
      );
    }
    return out;
  }

  global.FillApplyKnowledgeLearn = {
    learn: learn,
    learnMany: learnMany,
    isNoise: isNoise,
    isGenderLabel: isGenderLabel,
    isSensitiveLabel: isSensitiveLabel
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
