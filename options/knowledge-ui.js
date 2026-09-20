/**
 * App Settings — Adaptive knowledge review / edit.
 * Primary model: Key — Aliases — Type — Value.
 */
(function () {
  'use strict';

  var listEl = document.getElementById('knowledgeList');
  var emptyEl = document.getElementById('knowledgeEmpty');
  var filterEl = document.getElementById('knowledgeFilter');
  var statusEl = document.getElementById('knowledgeStatus');
  var countEl = document.getElementById('knowledgeCountHint');
  var enabledEl = document.getElementById('knowledgeLearningEnabled');
  var btnRefresh = document.getElementById('btnKnowledgeRefresh');
  var btnAdd = document.getElementById('btnKnowledgeAdd');
  var btnExport = document.getElementById('btnKnowledgeExport');
  var btnImport = document.getElementById('btnKnowledgeImport');
  var importFile = document.getElementById('importKnowledgeFile');
  var conflictListEl = document.getElementById('knowledgeConflictList');
  var conflictEmptyEl = document.getElementById('knowledgeConflictEmpty');
  var conflictHintEl = document.getElementById('knowledgeConflictHint');

  if (!listEl) return;

  var cache = [];
  var conflictCache = [];

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }

  function store() {
    return globalThis.FillApplyKnowledgeStore;
  }

  function canonical() {
    return globalThis.FillApplyKnowledgeCanonical;
  }

  function userTypes() {
    var C = canonical();
    return (C && C.USER_FIELD_TYPES) || [
      'boolean',
      'string',
      'number',
      'date',
      'select',
      'multiselect'
    ];
  }

  function toUserType(t) {
    var C = canonical();
    return C && C.toUserFieldType ? C.toUserFieldType(t) : String(t || 'string');
  }

  function matchesFilter(rec, q) {
    if (!q) return true;
    var hay = [
      rec.canonicalKey,
      rec.displayValue,
      rec.value,
      rec.status,
      rec.fieldType,
      (rec.aliases || []).join(' '),
      rec.lastSeenLabel
    ]
      .join(' ')
      .toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function render() {
    var q = filterEl ? String(filterEl.value || '').trim().toLowerCase() : '';
    listEl.innerHTML = '';
    var shown = cache.filter(function (rec) {
      return matchesFilter(rec, q);
    });
    if (countEl) {
      countEl.textContent = cache.length ? '(' + cache.length + ')' : '';
    }
    if (emptyEl) {
      emptyEl.hidden = shown.length > 0;
      if (!cache.length) {
        emptyEl.textContent =
          'No learned facts yet. Answer unknown questions via Complete Missing Information, then return here.';
      } else if (!shown.length) {
        emptyEl.hidden = false;
        emptyEl.textContent = 'No facts match this filter.';
      }
    }
    shown.forEach(function (rec) {
      listEl.appendChild(cardFor(rec));
    });
  }

  function cardFor(rec) {
    var card = document.createElement('article');
    card.className = 'knowledge-card';
    card.dataset.id = rec.id;

    var aliases = (rec.aliases || []).join(', ');
    var used = rec.usageCount || 0;
    var conf = Math.round((rec.confidence || 0) * 100);
    var userType = toUserType(rec.fieldType);

    card.innerHTML =
      '<div class="k-model" aria-label="Key Aliases Type Value">' +
      '<label class="k-row"><span class="k-label">Key</span><input class="k-key-input" readonly /></label>' +
      '<label class="k-row"><span class="k-label">Aliases</span><input class="k-alias-edit" placeholder="Wording variants, comma-separated" /></label>' +
      '<div class="k-row-grid">' +
      '<label class="k-row"><span class="k-label">Type</span><select class="k-type"></select></label>' +
      '<label class="k-row"><span class="k-label">Value</span><input class="k-value" /></label>' +
      '</div>' +
      '</div>' +
      '<p class="k-meta-line"></p>' +
      '<div class="k-actions">' +
      '<button type="button" class="primary k-save">Save</button>' +
      '<button type="button" class="ghost k-delete">Delete</button>' +
      '</div>';

    card.querySelector('.k-key-input').value = rec.canonicalKey || '';
    card.querySelector('.k-value').value = rec.displayValue != null ? rec.displayValue : rec.value || '';
    card.querySelector('.k-alias-edit').value = aliases;
    var prov = rec.provenance || {};
    var ctxBits = [];
    if (prov.host) ctxBits.push(prov.host);
    if (prov.originalLabel && prov.originalLabel !== (rec.aliases || [])[0]) {
      ctxBits.push('q: ' + prov.originalLabel);
    }
    if (rec.lastSeenLabel && ctxBits.indexOf('q: ' + rec.lastSeenLabel) === -1) {
      /* lastSeenLabel often duplicates aliases — show only if useful */
    }
    function fmtTs(t) {
      if (!t) return '';
      try {
        return new Date(t).toLocaleString();
      } catch (_e) {
        return String(t);
      }
    }
    var first = fmtTs(rec.createdAt);
    var last = fmtTs(rec.updatedAt || rec.lastUsedAt);
    card.querySelector('.k-meta-line').textContent =
      (rec.source || 'user') +
      ' · ' +
      conf +
      '% · used ' +
      used +
      '×' +
      (rec.status && rec.status !== 'confirmed' ? ' · ' + rec.status : '') +
      (ctxBits.length ? ' · ' + ctxBits.join(' · ') : '') +
      (first ? ' · first ' + first : '') +
      (last ? ' · last ' + last : '');

    var typeSel = card.querySelector('.k-type');
    userTypes().forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (t === userType) opt.selected = true;
      typeSel.appendChild(opt);
    });

    card.querySelector('.k-save').addEventListener('click', function () {
      saveCard(card, rec);
    });
    card.querySelector('.k-delete').addEventListener('click', function () {
      removeCard(rec);
    });
    return card;
  }

  async function saveCard(card, rec) {
    var S = store();
    if (!S) return;
    var value = card.querySelector('.k-value').value;
    var aliases = String(card.querySelector('.k-alias-edit').value || '')
      .split(',')
      .map(function (a) {
        return a.trim();
      })
      .filter(Boolean);
    var next = Object.assign({}, rec, {
      displayValue: value,
      value: value,
      fieldType: card.querySelector('.k-type').value,
      aliases: aliases,
      source: 'user_edit',
      confidence: 1,
      status: 'confirmed',
      updatedAt: Date.now()
    });
    try {
      await S.putKnowledge(next);
      setStatus('Saved ' + next.canonicalKey, 'ok');
      await load();
    } catch (e) {
      setStatus('Save failed: ' + (e && e.message ? e.message : e), 'err');
    }
  }

  async function removeCard(rec) {
    var S = store();
    if (!S) return;
    if (!confirm('Delete learned fact “' + rec.canonicalKey + '”?')) return;
    try {
      await S.deleteKnowledge(rec.id);
      setStatus('Deleted ' + rec.canonicalKey, 'ok');
      await load();
    } catch (e) {
      setStatus('Delete failed: ' + (e && e.message ? e.message : e), 'err');
    }
  }


  function renderConflicts() {
    if (!conflictListEl) return;
    conflictListEl.innerHTML = '';
    if (conflictHintEl) {
      conflictHintEl.hidden = !conflictCache.length;
      conflictHintEl.textContent = conflictCache.length
        ? conflictCache.length +
          ' pending conflict' +
          (conflictCache.length === 1 ? '' : 's') +
          ' — choose Keep old, Replace, or Add alias. Confirmed answers are never overwritten silently.'
        : '';
    }
    if (conflictEmptyEl) {
      conflictEmptyEl.hidden = conflictCache.length > 0;
    }
    conflictCache.forEach(function (row) {
      conflictListEl.appendChild(conflictCard(row));
    });
  }

  function conflictCard(row) {
    var card = document.createElement('article');
    card.className = 'knowledge-card knowledge-conflict-card';
    card.dataset.id = row.id;
    var host = row.host ? ' · ' + row.host : '';
    card.innerHTML =
      '<p class="k-conflict-title"><strong>Conflict</strong> on <code class="k-key">' +
      escapeHtml(row.canonicalKey || '') +
      '</code>' +
      escapeHtml(host) +
      '</p>' +
      '<p class="k-meta-line">Question: ' +
      escapeHtml(row.label || '(none)') +
      '</p>' +
      '<div class="k-conflict-values">' +
      '<div><span class="k-label">Stored</span><div class="k-conflict-val">' +
      escapeHtml(row.existingValue || '') +
      '</div></div>' +
      '<div><span class="k-label">Proposed</span><div class="k-conflict-val">' +
      escapeHtml(row.proposedValue || '') +
      '</div></div>' +
      '</div>' +
      '<div class="k-actions">' +
      '<button type="button" class="ghost k-keep">Keep old</button>' +
      '<button type="button" class="primary k-replace">Replace</button>' +
      '<button type="button" class="ghost k-alias">Add alias</button>' +
      '</div>';
    card.querySelector('.k-keep').addEventListener('click', function () {
      resolveConflictRow(row.id, 'keep');
    });
    card.querySelector('.k-replace').addEventListener('click', function () {
      resolveConflictRow(row.id, 'replace');
    });
    card.querySelector('.k-alias').addEventListener('click', function () {
      resolveConflictRow(row.id, 'alias');
    });
    return card;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function resolveConflictRow(id, action) {
    var S = store();
    if (!S || !S.resolveConflict) return;
    try {
      var res = await S.resolveConflict(id, action);
      if (!res || !res.ok) {
        setStatus('Conflict resolve failed: ' + ((res && res.reason) || 'unknown'), 'err');
        return;
      }
      setStatus(
        action === 'keep'
          ? 'Kept stored answer'
          : action === 'replace'
            ? 'Replaced with proposed answer'
            : 'Added question wording as alias (value unchanged)',
        'ok'
      );
      await load();
    } catch (e) {
      setStatus('Conflict resolve failed: ' + (e && e.message ? e.message : e), 'err');
    }
  }

  async function load() {
    var S = store();
    if (!S) {
      setStatus('Knowledge store not loaded', 'err');
      return;
    }
    try {
      cache = await S.listKnowledge();
      cache.sort(function (a, b) {
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
      render();
      if (S.listConflicts) {
        conflictCache = await S.listConflicts();
        renderConflicts();
      }
      var settings = await S.getSettings();
      if (enabledEl) enabledEl.checked = settings.learningEnabled !== false;
    } catch (e) {
      setStatus('Could not load knowledge: ' + (e && e.message ? e.message : e), 'err');
    }
  }

  async function addFact() {
    var S = store();
    if (!S) return;
    var key = prompt('Key (canonical id, e.g. sap_experience)', '');
    if (!key) return;
    var value = prompt('Value', '');
    if (value == null || String(value).trim() === '') return;
    var label = prompt('Alias / question wording (optional)', key.replace(/_/g, ' '));
    var type = prompt('Type (boolean|string|number|date|select|multiselect)', 'string') || 'string';
    try {
      await S.putKnowledge({
        canonicalKey: String(key)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '_'),
        value: value,
        displayValue: value,
        fieldType: type,
        aliases: label ? [label] : [],
        source: 'user_edit',
        confidence: 1,
        status: 'confirmed',
        lastSeenLabel: label || ''
      });
      setStatus('Added ' + key, 'ok');
      await load();
    } catch (e) {
      setStatus('Add failed: ' + (e && e.message ? e.message : e), 'err');
    }
  }

  function downloadJson(filename, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 500);
  }

  async function exportKnowledge() {
    var S = store();
    if (!S || !S.exportSnapshot) {
      setStatus('Knowledge store not loaded', 'err');
      return;
    }
    try {
      var snap = await S.exportSnapshot();
      var stamp = new Date().toISOString().slice(0, 10);
      downloadJson('fill-apply-knowledge-' + stamp + '.json', snap);
      setStatus('Exported ' + (snap.records || []).length + ' facts (secrets excluded)', 'ok');
    } catch (e) {
      setStatus('Export failed: ' + (e && e.message ? e.message : e), 'err');
    }
  }

  async function importKnowledgeFromFile(file) {
    var S = store();
    if (!S) return;
    if (!file) return;
    var mode = 'merge';
    try {
      var choice = window.prompt(
        'Import mode: type "merge" (default, upsert by key) or "replace" (clear then import)',
        'merge'
      );
      if (choice == null) return;
      if (String(choice).trim().toLowerCase() === 'replace') mode = 'replace';
    } catch (_e) {
      mode = 'merge';
    }
    try {
      var text = await file.text();
      var snap = JSON.parse(text);
      if (!snap || typeof snap !== 'object') throw new Error('Invalid JSON');
      var result;
      if (typeof S.importKnowledgeBundle === 'function') {
        result = await S.importKnowledgeBundle(snap, { mode: mode });
      } else {
        result = S.importSnapshot(snap);
      }
      setStatus(
        'Imported ' +
          (result.imported || 0) +
          ' (' +
          mode +
          '); skipped ' +
          (result.skipped || 0),
        'ok'
      );
      await load();
    } catch (e) {
      setStatus('Import failed: ' + (e && e.message ? e.message : e), 'err');
    }
  }

  if (btnRefresh) btnRefresh.addEventListener('click', load);
  if (btnAdd) btnAdd.addEventListener('click', addFact);
  if (filterEl) filterEl.addEventListener('input', render);
  if (btnExport) btnExport.addEventListener('click', exportKnowledge);
  if (btnImport && importFile) {
    btnImport.addEventListener('click', function () {
      importFile.value = '';
      importFile.click();
    });
    importFile.addEventListener('change', function () {
      var f = importFile.files && importFile.files[0];
      if (f) importKnowledgeFromFile(f);
    });
  }
  if (enabledEl) {
    enabledEl.addEventListener('change', function () {
      var S = store();
      if (!S) return;
      S.saveSettings({ learningEnabled: !!enabledEl.checked }).then(function () {
        setStatus(enabledEl.checked ? 'Learning on' : 'Learning paused', 'ok');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
