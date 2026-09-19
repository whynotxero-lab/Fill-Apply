# Adaptive applicant knowledge (v1.16)

User-oriented, persistent, two-tier knowledge for Fill & Apply.

This is **not** another hardcoded field list. The fill path is:

**User action → field recognition → semantic/canonical mapping → value capture → persistent storage → immediate reflection → future automatic filling.**

---

## Why

Tier 1 (`lib/field-map.js`, `lib/synonyms.js`, profile keys, source `customAnswers` / `customQA`) is developer-maintained. It cannot grow with every applicant-specific question (`Do you have SAP experience?`, `Willing to relocate to Riyadh?`) without an extension rebuild.

Tier 2 is **applicant-specific adaptive knowledge**. It grows from **explicit** user input and corrections, lives locally (IndexedDB), and is consulted on every later form without a rebuild.

Stable identity stays on the **PROFILE**. Adaptive Q&A (relocate, SAP, notice-period preferences that are not profile facts) lives in the knowledge store. The two are resolved together; they are not the same record type.

---

## Two tiers

| Tier | Owner | What it stores | How it grows |
|------|--------|----------------|--------------|
| **1 — built-in KB** | Developers | Label/CTA synonyms, `FIELD_MAP` keys, work-auth heuristics | Code change / release |
| **2 — adaptive KB** | Applicant | Structured records: canonical key, typed value, aliases, provenance, confidence | Explicit user input / correction / Options edit |

Values never come from invented AI guesses. AI/semantic matching may map *wording → `canonical_key`*. Once a value is confirmed, later fills reuse that stored value.

---

## Logical entities

| Entity | Persistence | Role |
|--------|-------------|------|
| **USER / PROFILE** | `chrome.storage.local` (`fillApply.profiles`) | Stable applicant facts (name, email, phone, education…). Unchanged. |
| **KNOWLEDGE** | IndexedDB `knowledge` | One record per canonical fact the applicant confirmed. |
| **FIELD_ALIASES** | IndexedDB `aliases` | Normalized question wording → `canonicalKey`. |
| **LEARNING_EVENTS** | IndexedDB `events` | Audit of observe / correct / edit / reject (noise filtered). |
| **APPLICATION_HISTORY** | IndexedDB `history` | Which keys were used or learned on a host (lightweight). |
| **Hot overlay** | `chrome.storage.local` `fillApply.knowledgeHot` | Last-N mutations so a re-inject in the same session sees new facts before IDB settles. |
| **Settings** | `chrome.storage.local` `fillApply.knowledgeSettings` | Light flags only (`learningEnabled`). |

### Knowledge record (adapted)

```
{
  id,                    // uuid
  canonicalKey,          // willing_to_relocate  ≠  requires_sponsorship
  fieldType,             // boolean | string | number | date | select | multiselect  (legacy: text, multi-select, url)
  value,                 // typed (boolean Yes/No stored as display "Yes"/"No" for HTML controls)
  displayValue,          // as the applicant typed/selected
  formats,               // optional map of alternate shapes from one canonical value
                         // e.g. date_of_birth: { iso, mm_dd_yyyy, dd_mm_yyyy, yyyy, mm, dd }
                         // Fill uses lib/format.js detectDateFormat; works from canonical alone
  aliases,               // question wordings that resolved to this key
  source,                // user_explicit | user_correction | user_confirm | user_edit | imported
  confidence,            // 0..1
  status,                // confirmed | provisional | rejected
  usageCount,
  createdAt, updatedAt, lastUsedAt,
  lastSeenLabel,
  profileId,             // active applicant profile id (or null = all)
  provenance: { host, url, originalLabel, previousValue, autofilled }
}
```

IndexedDB is the source of truth. Records are keyed by **profileId + canonicalKey**, so two applicant profiles can store different answers for the same question. A future Sync API plugs in at `FillApplyKnowledgeStore.applyMutation()` / `FillApplyKnowledgeSync.register()` — the fill engine keeps consuming `exportSnapshot()`, not a cloud client.

---



## Value formats (one dictionary value → many ATS shapes)

Canonical facts stay in one shape. Dates are stored as ISO `YYYY-MM-DD` (`dateOfBirth` / `date_of_birth` = `1979-04-06`). At fill time `FillApplyFormat.formatForField` / `detectDateFormat` converts to whatever the control asks for:

| Signal | Example output |
|--------|----------------|
| `input type="date"` | `1979-04-06` |
| placeholder / data-format `MM/DD/YYYY` (Workable) | `04/06/1979` |
| placeholder / label `DD/MM/YYYY` | `06/04/1979` |
| `birth_year` / `birth_month` / `birth_day` | `1979` / `04` / `06` |

Phone already follows the same idea (full E.164 vs national when a country-code sibling exists). Knowledge records may include an optional `formats` map; the formatter does not require it.

**Names:** `first_name` / `last_name` are first-class catalog keys. Last name may be multi-word (`Zahid Ali`). Deriving from `full_name` uses First = first token, Last = remainder — never the final token alone.

## Unified resolver precedence

First hit with a real value wins. Never invent.

1. **Explicit current-session input** — in-memory overlay written the moment the applicant types/selects.
2. **Confirmed user knowledge** — Tier 2 `status === 'confirmed'` (and high-confidence provisional when no confirmed row exists).
3. **User profile** — stable `profile[key]` via existing field-map / identity keys.
4. **Built-in knowledge** — `FIELD_MAP`, work-auth/sponsorship heuristics, source `customAnswers` / `customQA`.
5. **AI inference** — seam only; current implementation always returns empty (product rule: do not invent blank fields).
6. **Unknown** — leave empty, report `missingRequired` if required, observe.

Confirmed applicant values are **never** overridden by generic built-in answers. Semantic identity is on the *question*, not the Yes/No: `willing_to_relocate` and `requires_sponsorship` can both be `Yes` and stay distinct.

---

## Integration points (exact files)

### Tier 1 — keep / extend (no parallel navigation)

| Module | Role |
|--------|------|
| `lib/field-map.js` | Built-in `FIELD_MAP`, `bestKeyForField`, `answerForLabel`, `matchCustomQA` |
| `lib/synonyms.js` | Apply-start / Continue / Submit CTA detection — **reused as-is** |
| `lib/profile.js` | PROFILE store; `applyMissingFieldAnswers` still writes identity / `customAnswers` |
| `content/fill.js` | `tryOpenApplication`, `clickContinueButtons`, `clickSubmitButtons` — **unchanged navigation** |
| `adapters/fallback.js` | Mode-aware Next/Submit after generic fill |
| `runner/runner.js` | Queue loop, CAPTCHA/auth pauses, missing-fields popup trigger |

### Tier 2 — new

| Module | Role |
|--------|------|
| `lib/knowledge-canonical.js` | Catalog of *wording → canonical_key* (no values). Alias overlap + distinctive tokens (`sap`, `relocat`, `sponsor`). Derive a new key for unknown questions. |
| `lib/knowledge-store.js` | IndexedDB + memory + hot overlay. `exportSnapshot` / `importSnapshot` / `applyMutation`. Extension-origin IDB only (never the page's IDB). |
| `lib/knowledge-resolver.js` | Unified `resolve(profile, descriptor, map)` with the precedence above. |
| `lib/knowledge-learn.js` | Explicit-only learning, noise filter, correction vs first-fill provenance. |
| `content/knowledge-observe.js` | Trusted `change`/`blur` on unknown or autofilled-then-corrected fields. |

### Resolver wired into the fill path

| Call site | Change |
|-----------|--------|
| `content/fill.js` `answerFor()` | Delegates to `FillApplyKnowledge.resolve` when loaded; falls back to the previous lookup. Hydrates snapshot from `profile.__adaptiveKnowledge` at `run()` start. Marks autofilled controls with `data-fill-apply-value` so corrections are detectable. |
| Adapters that call `matchCustomQA` / `answerForLabel` | Unchanged. Greenhouse/Ashby custom Q&A still use Tier 1; the generic engine (and fallback-behind-drift) uses the unified resolver. |
| `runner/runner.js` + `ui/panel-app.js` | After `getEffectiveProfile`, `attachToProfile()` stamps `__adaptiveKnowledge` onto a **shallow copy** (never persisted back onto the profile). `INJECT_FILES` gains the knowledge scripts. Injected `func` signatures are **not** changed (avoids clashing with the in-flight on-page control panel PR). |

### Persistence and messages

| Module | Change |
|--------|--------|
| `background/service-worker.js` | `importScripts` store + learn; handles `FILL_APPLY_KNOWLEDGE_*` messages. |
| `lib/types.js` | New `MSG` constants. |
| Options | `options/options.html` section + `options/knowledge-ui.js` — review / edit / delete / confirm. |

### Immediate same-session reflection

1. Learn writes the in-memory store **synchronously** (same injected JS context → later fields on this pass resolve the new fact).
2. Learn also writes `fillApply.knowledgeHot` so a same-tab re-inject (Continue / re-detect) hydrates the new fact without waiting for IDB.
3. A message persists the mutation into IndexedDB. The next job’s `attachToProfile()` exports IDB ∪ hot.

No extension reload or rebuild.

### Future cloud sync seam (not implemented)

```
FillApplyKnowledgeSync.register(fn)   // fn(mutation)
FillApplyKnowledgeStore.applyMutation // single write path; calls sync hooks
FillApplyKnowledgeStore.importSnapshot // pull
FillApplyKnowledgeStore.exportSnapshot // push
```

The fill engine never talks to a network client.

---

## Learning rules

Learn **only** from explicit applicant action:

- Trusted `input`/`change`/`blur` (or Options save / missing-fields popup confirm).
- Unknown or uncertain fields, and **corrections** of autofilled values (`data-fill-apply-filled` + value ≠ stored autofill).

Do **not** learn:

- Autofill writes (`isTrusted === false`).
- Empty / placeholder / label-echo values.
- Noise (`test`, `asdf`, `xxx`, `qwerty`, `n/a`, `tbd`, `...`).
- Voluntary self-identification / EEO (except gender/sex selects, which are learnable), consent checkboxes (policy-ticked, not learned), passwords, file inputs.
- Temporary wipes (fill then clear before debounce).

Confidence / status:

| Event | confidence | status |
|-------|------------|--------|
| Explicit fill of an unknown field | 0.85 | `confirmed` if the value looks solid; else `provisional` |
| Correction of an autofilled value | 0.95 | `confirmed` |
| Options / missing-fields confirm | 1.0 | `confirmed` |
| Same value seen again on another host | +0.05 (cap 1.0), `usageCount++` | unchanged |
| Conflicting value vs high-confidence confirmed | record event; do not overwrite (edit in UI) | unless it is a same-session correction |

---

## Compatibility

- Queue runner, side panel, Mock profile, source profiles, CAPTCHA/auth pauses, missing-fields popup — unchanged contracts.
- Missing-fields **Save & continue** still writes the PROFILE (`applyMissingFieldAnswers`) **and** upserts Tier 2 knowledge so the same answer fills later apps by canonical key.
- MV3, load unpacked, no build step.
- Parallel PR: on-page Auto Fill/Ready/Submit panel (`cursor/on-page-control-panel-ce9c`). This work stays on its own branch; shared fill entrypoints only gained script-list entries and a profile-copy stamp.

---

## How to test

```bash
npm install
npm test                      # includes scripts/smoke-knowledge.js
```

Manual (Load unpacked):

1. Open `demo/sample-application.html` or any apply form with an unknown question (e.g. SAP experience).
2. Side panel → **Fill**. Unknown fields stay empty (never invented).
3. Type/select an answer. It is learned (debounced). Re-run **Fill** on the same form or a reworded variant — the value is reused immediately.
4. App Settings → **Adaptive knowledge** — review, edit, or delete the fact.
5. Confirm identity fields still come from **Profile settings**, and Apply / Continue / Submit still use existing synonym detection.


---

## Complete Missing Information (v1.17.2)

When fill hits unknown required/asked fields, the side panel opens **Complete Missing Information** (checklist):

1. Detect fields → match profile + built-in + adaptive → fill known
2. Unknown items appear as a checklist (Key hint + Type + Value)
3. On Save & continue: **immediately** normalize to Key / Aliases / Type / Value, persist adaptive KB, write profile customAnswers, re-run fill in the same session
4. Future applications reuse the same Key via aliases

Options → Adaptive knowledge reviews the same Key — Aliases — Type — Value model.


---

## Control type vs Knowledge type (v1.17.3)

Two concepts stay separate:

| Concept | Examples | Role |
|---------|----------|------|
| **Knowledge Type** | boolean / string / number / date / select / multiselect | How the applicant fact is stored |
| **DOM control type** | text / email / tel / number / date / checkbox / radio / select / textarea / combobox / custom | What the page control actually is |

The filler **reconciles** them. Knowledge Type never overrides the DOM. Before fill: type + options compatibility gate. Incompatible → **DO NOT FILL** (surface in Complete Missing Information). Never free-text into a `<select>`.

Canonical **Key** is identity (not label/name/index alone). Exclusions keep `current_salary` ≠ `expected_salary`, `willing_to_relocate` ≠ `willing_to_travel`, `years_experience` ≠ `management_experience`, `authorized_to_work` ≠ `requires_sponsorship`.

Unknown field discovery includes **optional** as well as required. Missing Info UI renders controls from field metadata (Yes/No, number, real select options) and marks Required vs Optional.

Debug: fill results expose `debugResolutions` / `unknownFields` (question, canonical key, knowledge type, control, value, resolution, confidence, action).

## Semantic evidence model (v1.17.5)

DOM metadata must **not** create or override semantic identity via concatenated `label+name+id` strings.

Evidence fields stay separate: `label`, `question`, `placeholder`, `name`, `id`, `autocomplete`, `ariaLabel`, `controlType`, `options` (+ `groupContext`).

**Priority** (higher wins):

1. visible question / associated `<label>`
2. accessible name / `aria-label`
3. fieldset / group context
4. placeholder
5. autocomplete
6. name / id (diagnostics only — **never** defines canonical identity)

**Policy**

1. Higher-priority semantic evidence determines identity when decisive.
2. Lower-priority name/id **never** overrides that identity.
3. Lower-priority contradictory metadata (placeholder / autocomplete / name / id) must **not** manufacture ambiguity when a higher-priority question is already decisive.
4. Meaningful layers (question/label vs aria/group): if they genuinely disagree → `AMBIGUOUS` / `DO_NOT_FILL` (no guess).
5. DOM name/id alone never defines canonical identity.

Bare ambiguous labels (`Salary`, `Compensation`, `Experience`, …) stay `AMBIGUOUS` even when name/id looks decisive.

Canonical key comes from the resolved **semantic question**, not DOM `id`/`name`. Same knowledge record across ATS/DOM variants.

**Pipeline unity:** Auto Fill, unknown/missing discovery, learning/capture, and reuse after reload all call the same `buildEvidence` → `resolveFromEvidence` path.

Debug diagnostic per fill: `question`, `semanticKey`, `knowledgeType`, `domControlType`, `candidateKeys`, `selectedKey`, `matchedEvidence`, `source`, `confidence`, `action`, `reason`.

