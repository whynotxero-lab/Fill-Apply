/**
 * Versioned applicant profile + adaptive knowledge import/export.
 *
 * Format: fill-apply-profile (schemaVersion 1)
 *   { format, schemaVersion, exportedAt, meta, profile, knowledge }
 *
 * Export includes the active profile fields and accumulated adaptive KB
 * (keys / aliases / types / values). Excludes secrets, OAuth tokens,
 * passwords, CAPTCHA / runtime / DOM state, ATS account credentials.
 *
 * Import validates the full payload before any write. On success it restores
 * profile + knowledge, optionally activates Zahid, and persists so the result
 * survives reload. Unsupported schema → clear error, no corruption.
 *
 * Attaches globalThis.FillApplyProfileIO
 */
(function (global) {
  'use strict';

  var FORMAT = 'fill-apply-profile';
  var SCHEMA_VERSION = 1;
  var SUPPORTED_SCHEMA_VERSIONS = [1];

  /** Keys that must never appear in an export (defense in depth). */
  var SECRET_KEY_RE =
    /^(password|passwd|pwd|secret|token|accessToken|refreshToken|idToken|oauth|clientSecret|apiKey|api_key|cookie|cookies|session|captcha|recaptcha|turnstile|__adaptiveKnowledge|__dom|__runtime|rawHtml|pageHtml)$/i;

  var SECRET_NESTED_RE =
    /(password|passwd|token|secret|oauth|cookie|captcha|credential)/i;

  function nowIso() {
    return new Date().toISOString();
  }

  function appVersion() {
    try {
      if (global.chrome && chrome.runtime && chrome.runtime.getManifest) {
        var m = chrome.runtime.getManifest();
        if (m && m.version) return String(m.version);
      }
    } catch (_e) { /* ignore */ }
    return '';
  }

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function deepStripSecrets(value, depth) {
    depth = depth || 0;
    if (depth > 12) return undefined;
    if (Array.isArray(value)) {
      return value
        .map(function (item) {
          return deepStripSecrets(item, depth + 1);
        })
        .filter(function (item) {
          return item !== undefined;
        });
    }
    if (!isPlainObject(value)) return value;
    var out = {};
    Object.keys(value).forEach(function (k) {
      if (SECRET_KEY_RE.test(k) || SECRET_NESTED_RE.test(k)) return;
      var v = deepStripSecrets(value[k], depth + 1);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }

  function sanitizeProfileFields(raw) {
    var P = global.FillApplyProfile;
    var defaults = (P && P.DEFAULT_PROFILE) || {};
    var src = isPlainObject(raw) ? raw : {};
    var cleaned = deepStripSecrets(src) || {};
    // Drop meta / identity keys that belong outside profile fields
    delete cleaned.id;
    delete cleaned.name;
    delete cleaned.createdAt;
    delete cleaned.updatedAt;
    delete cleaned.locked;
    delete cleaned.systemProfile;
    delete cleaned.__adaptiveKnowledge;
    delete cleaned.__dom;
    delete cleaned.__runtime;
    var out = Object.assign({}, defaults, cleaned);
    if (!Array.isArray(out.experienceEntries)) out.experienceEntries = [];
    if (!Array.isArray(out.educationEntries)) out.educationEntries = [];
    if (!Array.isArray(out.customQA)) out.customQA = [];
    if (!isPlainObject(out.customAnswers)) out.customAnswers = {};
    return out;
  }

  function sanitizeKnowledgeRecords(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    list.forEach(function (rec) {
      if (!rec || typeof rec !== 'object') return;
      var key = String(rec.canonicalKey || rec.key || '').trim();
      if (!key) return;
      var cleaned = deepStripSecrets(rec) || {};
      var aliases = Array.isArray(cleaned.aliases)
        ? cleaned.aliases
            .map(function (a) {
              return String(a || '').trim();
            })
            .filter(Boolean)
        : [];
      out.push({
        id: cleaned.id || undefined,
        canonicalKey: key,
        fieldType: cleaned.fieldType || cleaned.type || 'string',
        value: cleaned.value != null ? cleaned.value : cleaned.displayValue != null ? cleaned.displayValue : '',
        displayValue:
          cleaned.displayValue != null
            ? cleaned.displayValue
            : cleaned.value != null
              ? cleaned.value
              : '',
        aliases: aliases,
        source: cleaned.source || 'import',
        confidence: typeof cleaned.confidence === 'number' ? cleaned.confidence : 0.9,
        status: cleaned.status || 'confirmed',
        usageCount: typeof cleaned.usageCount === 'number' ? cleaned.usageCount : 0,
        createdAt: cleaned.createdAt || undefined,
        updatedAt: cleaned.updatedAt || undefined,
        lastUsedAt: cleaned.lastUsedAt || 0,
        lastSeenLabel: cleaned.lastSeenLabel || '',
        profileId: cleaned.profileId != null ? cleaned.profileId : null,
        provenance: isPlainObject(cleaned.provenance) ? cleaned.provenance : { via: 'import' }
      });
    });
    return out;
  }

  /**
   * Full validation before any side effect.
   * Returns { ok:true, data } or { ok:false, errors:[string] }.
   */
  function validateImportPayload(raw) {
    var errors = [];
    if (raw == null) {
      return { ok: false, errors: ['Import is empty.'] };
    }
    var obj = raw;
    if (typeof raw === 'string') {
      try {
        obj = JSON.parse(raw);
      } catch (e) {
        return { ok: false, errors: ['Invalid JSON: ' + (e && e.message ? e.message : String(e))] };
      }
    }
    if (!isPlainObject(obj)) {
      return { ok: false, errors: ['Import root must be a JSON object.'] };
    }
    var format = String(obj.format || '').trim();
    if (format !== FORMAT) {
      errors.push(
        'Unsupported format "' +
          (format || '(missing)') +
          '". Expected "' +
          FORMAT +
          '".'
      );
    }
    var ver = Number(obj.schemaVersion);
    if (!SUPPORTED_SCHEMA_VERSIONS.some(function (v) { return v === ver; })) {
      errors.push(
        'Unsupported schemaVersion ' +
          JSON.stringify(obj.schemaVersion) +
          '. Supported: ' +
          SUPPORTED_SCHEMA_VERSIONS.join(', ') +
          '.'
      );
    }
    if (!isPlainObject(obj.profile)) {
      errors.push('Missing or invalid "profile" object.');
    }
    if (obj.knowledge != null) {
      if (!isPlainObject(obj.knowledge) && !Array.isArray(obj.knowledge)) {
        errors.push('"knowledge" must be an object or array when present.');
      } else if (isPlainObject(obj.knowledge) && obj.knowledge.records != null && !Array.isArray(obj.knowledge.records)) {
        errors.push('"knowledge.records" must be an array when present.');
      }
    }
    if (errors.length) return { ok: false, errors: errors };

    var meta = isPlainObject(obj.meta) ? obj.meta : {};
    var profile = sanitizeProfileFields(obj.profile);
    var knowledgeRaw = Array.isArray(obj.knowledge)
      ? obj.knowledge
      : obj.knowledge && Array.isArray(obj.knowledge.records)
        ? obj.knowledge.records
        : [];
    var knowledge = sanitizeKnowledgeRecords(knowledgeRaw);

    return {
      ok: true,
      data: {
        format: FORMAT,
        schemaVersion: ver,
        exportedAt: obj.exportedAt || null,
        meta: meta,
        profile: profile,
        knowledge: knowledge
      }
    };
  }

  async function buildExportPayload(opts) {
    opts = opts || {};
    var P = global.FillApplyProfile;
    var K = global.FillApplyKnowledgeStore;
    if (!P) throw new Error('FillApplyProfile is not loaded');

    var meta = (await P.getActiveProfileMeta()) || {};
    var profile = await P.getProfile();
    var profileId = await P.getActiveProfileId();
    var fields = sanitizeProfileFields(profile);

    var knowledgeRecords = [];
    if (K && K.listKnowledge) {
      var list = await K.listKnowledge(profileId);
      knowledgeRecords = sanitizeKnowledgeRecords(list);
    } else if (K && K.exportSnapshot) {
      var snap = await K.exportSnapshot(profileId);
      knowledgeRecords = sanitizeKnowledgeRecords(snap && snap.records);
    }

    return {
      format: FORMAT,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: nowIso(),
      meta: {
        profileName: meta.name || opts.profileName || 'Profile',
        profileId: profileId || null,
        activate: true,
        appVersion: appVersion(),
        knowledgeCount: knowledgeRecords.length
      },
      profile: fields,
      knowledge: {
        version: 1,
        records: knowledgeRecords
      }
    };
  }

  function suggestExportFilename(payload) {
    var name =
      (payload && payload.meta && payload.meta.profileName) ||
      (payload && payload.profile && (payload.profile.preferredName || payload.profile.firstName)) ||
      'profile';
    var slug = String(name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'profile';
    return slug + '-profile.json';
  }

  /**
   * Apply a validated payload: write profile fields, restore knowledge, activate.
   * Never partially applies — validateImportPayload must succeed first.
   */
  async function importValidated(data, opts) {
    opts = opts || {};
    var P = global.FillApplyProfile;
    var K = global.FillApplyKnowledgeStore;
    if (!P) throw new Error('FillApplyProfile is not loaded');

    var meta = data.meta || {};
    var wantedName = String(meta.profileName || opts.profileName || 'Imported').trim() || 'Imported';
    var activate = meta.activate !== false && opts.activate !== false;
    var preferZahid =
      opts.preferZahid !== false &&
      (P.isZahidName(wantedName) ||
        String(meta.preferredProfileId || '').toLowerCase() === 'zahid' ||
        /zahid/i.test(wantedName));

    // Ensure Mock exists and is never destroyed
    if (P.ensureMockProfile) {
      try {
        await P.ensureMockProfile();
      } catch (_e) { /* ignore */ }
    }

    var targetId = null;
    var list = await P.listProfiles();

    if (preferZahid && P.findZahidId) {
      // Ensure empty Zahid shell exists without resetting user data first —
      // we will overwrite fields from the import explicitly.
      var storeProfiles = {};
      list.forEach(function (m) {
        storeProfiles[m.id] = m;
      });
      // Prefer existing Zahid id
      for (var i = 0; i < list.length; i++) {
        if (P.isZahidName(list[i].name) || String(list[i].id) === 'zahid') {
          targetId = list[i].id;
          break;
        }
      }
      if (!targetId && P.ensureZahidProfile) {
        // Create missing empty shell only (no reset of unrelated profiles)
        targetId = await P.ensureZahidProfile({ activate: false, reset: false });
      }
    }

    if (!targetId) {
      // Match by name, else create
      for (var j = 0; j < list.length; j++) {
        if (String(list[j].name || '').toLowerCase() === wantedName.toLowerCase()) {
          if (!(P.isLockedProfile && P.isLockedProfile(list[j]))) {
            targetId = list[j].id;
            break;
          }
        }
      }
    }

    if (!targetId) {
      var created = await P.createProfile(wantedName);
      targetId = created.id;
    }

    await P.setActiveProfile(targetId);
    // Rename to wanted name when not Mock
    try {
      var activeMeta = await P.getActiveProfileMeta();
      if (activeMeta && !activeMeta.locked && activeMeta.name !== wantedName && !P.isMockName(wantedName)) {
        await P.renameProfile(targetId, wantedName);
      }
    } catch (_renameErr) { /* ignore */ }

    // Write profile fields onto active
    await P.saveProfile(data.profile);
    // If preferZahid and name drifted, normalize to Zahid
    if (preferZahid) {
      try {
        var m2 = await P.getActiveProfileMeta();
        if (m2 && !m2.locked && !P.isZahidName(m2.name)) {
          await P.renameProfile(targetId, 'Zahid');
        }
      } catch (_e2) { /* ignore */ }
    }

    if (activate) {
      await P.setActiveProfile(targetId);
    }

    var knowledgeImported = 0;
    var knowledgeErrors = 0;
    if (K && Array.isArray(data.knowledge) && data.knowledge.length) {
      for (var k = 0; k < data.knowledge.length; k++) {
        var rec = Object.assign({}, data.knowledge[k], { profileId: targetId });
        try {
          if (K.putKnowledge) {
            await K.putKnowledge(rec);
            knowledgeImported += 1;
          } else if (K.applyMutation) {
            await K.applyMutation({ kind: 'upsert', record: rec });
            knowledgeImported += 1;
          }
        } catch (_ke) {
          knowledgeErrors += 1;
        }
      }
    }

    var saved = await P.getProfile();
    var activeId = await P.getActiveProfileId();
    return {
      ok: true,
      profileId: activeId,
      profileName: (await P.getActiveProfileMeta() || {}).name || wantedName,
      fieldsRestored: Object.keys(data.profile || {}).length,
      knowledgeImported: knowledgeImported,
      knowledgeErrors: knowledgeErrors,
      activated: activate && activeId === targetId,
      profile: saved
    };
  }

  /**
   * Validate then import. On validation failure nothing is written.
   */
  async function importPayload(raw, opts) {
    var checked = validateImportPayload(raw);
    if (!checked.ok) {
      return { ok: false, errors: checked.errors, imported: false };
    }
    try {
      var result = await importValidated(checked.data, opts);
      return Object.assign({ imported: true, errors: [] }, result);
    } catch (e) {
      return {
        ok: false,
        imported: false,
        errors: [e && e.message ? e.message : String(e)]
      };
    }
  }

  async function exportActiveProfile(opts) {
    var payload = await buildExportPayload(opts);
    return {
      payload: payload,
      filename: suggestExportFilename(payload),
      json: JSON.stringify(payload, null, 2)
    };
  }

  /**
   * Browser helper: trigger a download of the export JSON.
   */
  async function downloadExport(opts) {
    var bundled = await exportActiveProfile(opts);
    var blob = new Blob([bundled.json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = bundled.filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try {
        URL.revokeObjectURL(url);
      } catch (_e) { /* ignore */ }
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 1500);
    return bundled;
  }

  global.FillApplyProfileIO = {
    FORMAT: FORMAT,
    SCHEMA_VERSION: SCHEMA_VERSION,
    SUPPORTED_SCHEMA_VERSIONS: SUPPORTED_SCHEMA_VERSIONS,
    validateImportPayload: validateImportPayload,
    sanitizeProfileFields: sanitizeProfileFields,
    sanitizeKnowledgeRecords: sanitizeKnowledgeRecords,
    deepStripSecrets: deepStripSecrets,
    buildExportPayload: buildExportPayload,
    exportActiveProfile: exportActiveProfile,
    importPayload: importPayload,
    importValidated: importValidated,
    suggestExportFilename: suggestExportFilename,
    downloadExport: downloadExport
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
