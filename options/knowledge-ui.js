/**
 * App Settings — Adaptive knowledge review / edit.
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

  if (!listEl) return;

  var cache = [];

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }

  function store() {
    return globalThis.FillApplyKnowledgeStore;
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
          'No learned facts yet. Fill an unknown question on an application, then return here.';
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

    card.innerHTML =
      '<header>' +
      '<span class="k-key"></span>' +
      '<span class="k-meta"></span>' +
      '</header>' +
      '<label>Value <input class="k-value" /></label>' +
      '<div class="grid">' +
      '<label>Type <select class="k-type"></select></label>' +
      '<label>Status <select class="k-status">' +
      '<option value="confirmed">confirmed</option>' +
      '<option value="provisional">provisional</option>' +
      '<option value="rejected">rejected (ignored)</option>' +
      '</select></label>' +
      '</div>' +
      '<p class="k-aliases"></p>' +
      '<label>Aliases (comma-separated) <input class="k-alias-edit" /></label>' +
      '<div class="k-actions">' +
      '<button type="button" class="primary k-save">Save</button>' +
      '<button type="button" class="ghost k-delete">Delete</button>' +
      '</div>';

    card.querySelector('.k-key').textContent = rec.canonicalKey;
    card.querySelector('.k-meta').textContent =
      (rec.source || 'user') + ' · ' + conf + '% · used ' + used + '×';
    card.querySelector('.k-value').value = rec.displayValue != null ? rec.displayValue : rec.value || '';
    card.querySelector('.k-status').value = rec.status || 'confirmed';
    card.querySelector('.k-aliases').textContent = aliases
      ? 'Seen as: ' + aliases
      : 'No aliases yet — equivalent questions will attach here.';
    card.querySelector('.k-alias-edit').value = aliases;

    var typeSel = card.querySelector('.k-type');
    var types = (globalThis.FillApplyKnowledgeCanonical &&
      globalThis.FillApplyKnowledgeCanonical.FIELD_TYPES) || [
      'text',
      'boolean',
      'number',
      'select',
      'multi-select',
      'date',
      'url'
    ];
    types.forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (t === rec.fieldType) opt.selected = true;
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
      status: card.querySelector('.k-status').value,
      aliases: aliases,
      source: 'user_edit',
      confidence: 1,
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
      var settings = await S.getSettings();
      if (enabledEl) enabledEl.checked = settings.learningEnabled !== false;
    } catch (e) {
      setStatus('Could not load knowledge: ' + (e && e.message ? e.message : e), 'err');
    }
  }

  async function addFact() {
    var S = store();
    if (!S) return;
    var key = prompt('Canonical key (e.g. sap_experience)', '');
    if (!key) return;
    var value = prompt('Value', '');
    if (value == null || String(value).trim() === '') return;
    var label = prompt('Question wording / alias (optional)', key.replace(/_/g, ' '));
    try {
      await S.putKnowledge({
        canonicalKey: String(key)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '_'),
        value: value,
        displayValue: value,
        fieldType: 'text',
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

  if (btnRefresh) btnRefresh.addEventListener('click', load);
  if (btnAdd) btnAdd.addEventListener('click', addFact);
  if (filterEl) filterEl.addEventListener('input', render);
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
