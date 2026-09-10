# Fill Engine

How Fill & Apply finds an application form, reads its fields, and writes answers into them — and the failure modes this design exists to prevent.

## Why the engine was rebuilt (v1.15)

Adapters, source profiles and per-source documentation were all in place, yet applications frequently went unfilled — including on sources with hand-written adapters. The cause was not the adapters. It was four structural gaps in the shared DOM layer that made the form invisible or unreadable.

| Gap | Effect |
|-----|--------|
| Injection targeted the top frame only | Any ATS form inside an iframe was never seen: Greenhouse / Lever / Workable / SmartRecruiters embeds on career sites, iCIMS, Glassdoor's Indeed-backed Easy Apply |
| Form detection used a container whitelist | React-rendered forms (Ashby, Lever, Teamtailor, Workday) scored zero, so the engine re-clicked Apply or returned "No Apply button found on this page" |
| The fill pass was synchronous | Listbox options render a tick later into a portal, so no custom dropdown could ever be filled — every Yes/No and picklist question on Greenhouse, Ashby, Lever, Workday |
| Labels came only from `previousElementSibling` | The most common ATS layout (`<div><label>Email</label><div><input></div></div>`) produced no label and therefore no field type |

A fifth issue discarded configured answers: source profiles store nearly everything under `profile.customAnswers`, but the engine only consulted `customQA` with strict substring matching, so `Current salary` never matched `What is your current salary?`.

## Layers

```
lib/dom-deep.js     Find and touch things (shadow roots, frames, labels, clicks, waits)
lib/synonyms.js     Decide what a page is (form open? apply CTA? job overview?)
lib/field-map.js    Decide what an answer is (profile key, customAnswers, customQA)
content/fill.js     Drive the pass (wait → open → collect → fill → report)
adapters/           Site-specific behaviour, with the generic engine behind it
```

### `lib/dom-deep.js`

Every query pierces open shadow roots and same-origin iframes. Every interaction emits what a real user produces.

| Helper | Purpose |
|--------|---------|
| `queryAll(selector, root)` | Deep query across shadow roots and same-origin frames |
| `labelFor(el)` | `label[for]` → `aria-label` → `aria-labelledby` → wrapping `<label>` → ancestor walk → placeholder → `<legend>` |
| `isRequired(el, label)` | `required`, `aria-required`, `data-required`, a trailing `*`, or a `*required*` wrapper class |
| `describeField(el)` | Normalized `{tag, type, label, required, visible, options, …}` |
| `realClick(el)` | Focus, then `pointerdown` → `mousedown` → `pointerup` → `mouseup` → `click` |
| `setValue(el, value)` | Native property setter so React's value tracker registers the change |
| `typeInto(el, value)` | Character-by-character with key events, for typeahead comboboxes |
| `waitFor(predicate, opts)` | MutationObserver across every root, plus a polling fallback |

The ancestor walk stops as soon as a container holds more than one control, so a field never inherits its neighbour's label.

`realClick` matters more than it looks: react-select, Radix, Headless UI and MUI all open on `pointerdown` or `mousedown` and ignore a bare `.click()`.

### Form detection — `scoreApplicationForm()`

Replaces the container whitelist. Weighs evidence that holds regardless of markup:

| Signal | Weight |
|--------|--------|
| Fields whose label/name/autocomplete names application data | 3 |
| Fields inside a known apply container | 3 |
| A resume file input alongside at least one named field | 2 |
| A final-submit CTA alongside at least one field | 2 |
| Four or more fields with at least one named | 1 |

A score of 3 or more means the form is open. Search boxes, newsletter signups, and anything inside a form containing a password field are excluded before scoring, so page furniture can never reach the threshold.

### Answer resolution

Tried in order, first hit wins:

1. `bestKeyForField(descriptor)` → `profile[key]`
2. Work-authorization and sponsorship label heuristics
3. `answerForLabel(profile, label)` → field-map keys, then `customAnswers`, then `customQA`
4. `matchCustomQA(profile.customQA, label, placeholder)`

Steps 3 and 4 compare *content words* in both directions rather than requiring a substring, and `customAnswers` keys are split on camelCase first (`noticePeriod` → `notice period`). A field-map hit whose top-level value is blank no longer ends the search — that short-circuit was why source answers stored under `customAnswers` never reached the page.

### The fill pass

`__fillApply.run(profile, options)` is async:

1. Wait up to `formWaitMs` (default 3000) for a form or an Apply CTA to render.
2. If no form is open, click Apply-start and wait up to 4s for an in-page modal. If it appears, fill in the same pass; if the page navigates instead, return `clickedApplyStart` so the runner re-detects on the destination.
3. Collect fields deeply, dropping page furniture and duplicate radio-group members.
4. Fill each control according to its real type.
5. Handle custom dropdowns: open, **await** the options, pick the best match; if nothing matches, type into the combobox and await the filtered list.
6. Return the report.

| Control | Handling |
|---------|----------|
| text / email / tel / url / textarea | Native setter + `input`/`change` |
| number / range / numeric tel | Currency stripped (`25000 AED` → `25000`); skipped if no number remains |
| date | Normalized to `yyyy-mm-dd` |
| select | Exact → case-insensitive → substring → Yes/No fuzzy |
| checkbox | Real click, so framework state updates |
| radio | Best match across the group by label and value, then real click |
| contenteditable | `textContent` + input events |
| combobox / listbox | Open, await options, match, or type and await |

### Policy — never invented

| Field | Behaviour |
|-------|-----------|
| Voluntary self-identification / EEO | Skipped, reported as `voluntary_self_identification` |
| Consent and agreement checkboxes | Never ticked; reported as `consent_checkbox`, and named in `missingRequired` when required |
| Required fields with no profile answer | Named in `missingRequired`, which drives the missing-fields popup |

## Cross-frame injection

`runner/runner.js` and `ui/panel-app.js` inject with `allFrames: true`.

- Sub-frames with no application form and no Apply CTA return `{ frameSkipped: true }` immediately, so ad and tracker frames cost nothing and never act.
- `pickBestFrameResult()` ranks results — filled fields beat submitted beats needs-human beats apply-clicked — and returns the winner with a `frames` summary of what every frame saw.

A site adapter that matches nothing (no fills, no submit, no handoff, no pause) has usually drifted from the layout it was written against, so the generic engine runs behind it as a safety net and its result is used when it fills something.

## Diagnostics

Every run reports what the engine actually saw, which is what makes a failure explainable:

| Field | Meaning |
|-------|---------|
| `details[]` | Per field: label, type, required, filled or not, and which profile source supplied the value |
| `skipped[]` | Fields deliberately left alone, with the reason |
| `missingRequired[]` | Required fields with no answer available |
| `formSignals` | The `scoreApplicationForm` breakdown |
| `inspection` | Counts of inputs, selects, files, custom dropdowns, required fields, plus visible button labels |
| `frames[]` | Per-frame outcome when the page has sub-frames |
| `usedGenericFallback` | The adapter found nothing and the generic engine filled instead |

## Tests

```bash
npm install
npm test                      # 4 suites, 44 assertions, jsdom
node scripts/browser-e2e.js   # real Chrome, needs a display
```

`scripts/browser-e2e.js` is the honest end-to-end check. It serves a career page on one origin whose application form lives in an iframe on a **different** origin — a shape no same-document traversal can reach — installs the unpacked extension, and drives the real runner injection path from the extension's own service worker. It asserts that the cross-origin form is filled, that the async portalled listbox option is selected, and that the winning result came from the sub-frame.

Chrome no longer honours `--load-extension`, so the test installs the extension through the CDP `Extensions.loadUnpacked` domain with `--enable-unsafe-extension-debugging`.
