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

## Two more gaps (v1.15.1)

Finding a field correctly is not the same as filling it correctly, and two gaps sat downstream of detection.

| Gap | Effect |
|-----|--------|
| Values were written verbatim apart from currency and date handling | A phone number went in as `+971501234567` even where the form had its own country-code selector, producing `+971 +971501234567`; a field declaring `pattern="\d{10}"` rejected everything it was given |
| Only site adapters attached documents, in one pass before any Continue click | The generic engine — which runs on unknown sites and behind an adapter that matched nothing — filled the form and left the resume empty, and multi-step applications whose upload step comes later never received the file |

## Layers

```
lib/dom-deep.js     Find and touch things (shadow roots, frames, labels, clicks, waits)
lib/format.js       Shape a value for the control that will receive it
lib/synonyms.js     Decide what a page is (form open? apply CTA? job overview?)
lib/field-map.js    Decide what an answer is (profile key, customAnswers, customQA)
lib/files.js        Put stored documents onto upload controls
content/fill.js     Drive the pass (wait → open → collect → fill → attach → report)
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
| text / email / tel / url / textarea | Shaped by `lib/format.js`, then native setter + `input`/`change` |
| number / range / numeric tel | Currency stripped (`25000 AED` → `25000`), rounded to the step, clamped to min/max |
| date | ISO for `type=date`, otherwise the order the placeholder shows |
| select | Exact → case-insensitive → substring → Yes/No fuzzy → alternate spellings → **buckets and education levels** (`15` → `10+ years`, `Master's / MBA` → `Master's Degree`) |
| checkbox | Real click, so framework state updates |
| radio | Group question (legend / radiogroup) is mapped, then the matching option is clicked — including buckets and Yes/No |
| contenteditable | `textContent` + input events |
| combobox / listbox | Open, await options, match, or type and await |
| file | See [Documents](#documents) — never the operating system's file chooser |

### Value formatting — `lib/format.js`

Finding the right field is only half of filling it. The same phone number has to arrive three different ways depending on the control, and a value the control rejects is indistinguishable from a value that was never filled.

Every value is shaped against the constraints the control advertises — `type`, `pattern`, `maxlength`, `inputmode`, `step`, `min`/`max` and a placeholder that is really an input mask:

| Kind | Shaping |
|------|---------|
| phone | Split into dial code and national number. A form with its own country-code control gets the national number; one without gets `+971501234567`. `pattern="\d{10}"` gets ten bare digits, `placeholder="(555) 555-5555"` gets that mask. A trunk zero is dropped in front of a country code, and a code already present in the stored number is never added twice |
| phone country code | `+971` for a text or select control, `971` where the control is numeric |
| postal | US five digits, `A1A 1A1` for Canada, `SW1A 1AA` for the UK, compact when the pattern forbids spaces |
| date | `yyyy-mm-dd` for `type=date`; `dd/mm/yyyy` or `mm/dd/yyyy` for a text field, read off its placeholder |
| url | Scheme added for `type=url`; reduced to a handle when the field asks for a username |
| number | Currency stripped, rounded to the step, clamped to `min`/`max` |
| text | Long answers cut on a word boundary rather than mid-word |

Selects and listboxes also try alternate spellings, so a profile saying `United Arab Emirates` finds an option labelled `AE`, and `California` finds `CA`. Nationality selects list the demonym, so `Pakistan` finds `Pakistani`.

Years, education and notice period are not string-equal to the options forms offer. `lib/format.js` now also:

| Stored answer | Form option |
|---------------|-------------|
| `15` / `15+` years | Teamtailor / Indeed buckets `0-2`, `3-5`, `6-9`, `10+` — tightest bucket that contains the number |
| `Master's Degree` / `Master's / MBA` | `Master's Degree`; if the form does not offer that level, the highest level *below* it (the applicant also holds a Bachelor's) |
| `I can start immediately` | `Immediately`, `Onspot`, `Available immediately`, `Less than 15 days` |
| `Yes` / `No` | checkbox, radio, or select — never a neighbouring option that happens to contain the letters |

A radio group's *question* is read from the `<legend>`, `[role=radiogroup]`, or the caption above the options. Mapping against the first option's text (`0-2`) is how those questions used to be missed.

## Full applicant profile (v1.15.2)

ATS forms split what a CV writes as prose. Workday asks for school, degree, field of study and graduation year as four controls; Teamtailor asks years of experience as a bucketed radio; Greenhouse asks highest education as a select. The Zahid General profile (`profiles/zahid-general.json`, also `FillApplyProfile.ZAHID_GENERAL_PROFILE`) now stores each of those as its own value, plus seven structured work entries and two education entries.

App Settings → Profile settings exposes the same fields, with a completeness readout that names what is still blank. Blank is deliberate: salary, date of birth, driving licence and similar answers are the applicant's to give, and the engine pauses rather than guessing.

**Create / Reset Zahid** reseeds the record from that JSON. Documents stay in the shared Documents section — they are not stored on the profile.

The phone rules are the ones that matter most in practice: Greenhouse and Lever take a single field, while Indeed, LinkedIn and iCIMS render a country-code selector beside the number — and sending the international form into the second shape produces `+971 +971501234567`.

## Documents

The resume and cover letter loaded through App Settings are attached to the page's upload control, so reaching the upload step never sends the applicant back to their file system.

Order of preference:

1. Assign the stored file straight onto an `input[type=file]`, hidden ones included, via `DataTransfer`.
2. Use an Attach button only to find out which input the site wants — with `HTMLInputElement.prototype.click` and `showPicker` intercepted, so the native dialog cannot open and the intercepted call names the input.
3. Synthesize a drop on the page's dropzone when it offers no input at all.

A `<label for>` bound to a file input is never clicked, because a label opens the dialog through its own activation behaviour, which no patching intercepts; such labels are only used to locate their input.

| Situation | Behaviour |
|-----------|-----------|
| A document is already on the input, or the page shows a filename from a previous application | Left alone, reported in `alreadyAttached` |
| The stored file's type is not in the control's `accept` list | Not attached; reported for manual upload rather than counted as success |
| The stored file has no content type | Inferred from its name, because forms validate `File.type` |
| The same page is filled again by a re-detect pass | Attached inputs are marked, so nothing is attached twice |
| The upload control only appears after Continue | `attachDocumentsAsync` waits for it, and the fallback adapter re-attaches after advancing a step |
| A step whose only control is the upload | Reported as `documentStep` rather than "no application form fields found" |

The engine owns attaching whenever it is given documents, which is what makes it work on unknown sites and behind an adapter that matched nothing. Site adapters that locate their own resume input still do so.

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
| `filesAttached` | What was attached, what the page already held, what it rejected, and how many picker calls were intercepted |
| `documentsPending` | Documents that are stored but did not reach a control |
| `formSignals` | The `scoreApplicationForm` breakdown |
| `inspection` | Counts of inputs, selects, files, custom dropdowns, required fields, plus visible button labels |
| `frames[]` | Per-frame outcome when the page has sub-frames |
| `usedGenericFallback` | The adapter found nothing and the generic engine filled instead |

## Tests

```bash
npm install
npm test                      # 10 suites, jsdom
node scripts/browser-e2e.js   # real Chrome, needs a display
```

| Suite | Covers |
|-------|--------|
| `smoke-form-detection.js` | Signal-based detection, iframes, shadow roots, page furniture |
| `smoke-fill-engine.js` | Labels, control types, async dropdowns, answer resolution, never-invented policy |
| `smoke-value-format.js` | Phone, postal, date, url, number and text shaping, and select spellings |
| `smoke-documents.js` | Preloaded document attach, picker suppression, accept mismatch, existing uploads, multi-step |
| `smoke-profile-fill.js` | Full Zahid profile across text, select, radio, checkbox, buckets, education levels, demonyms; blanks, consent and EEO left alone |
| `smoke-jobpool-status.js` | JobPool `status` mapping — only `submitted` means Applied |
| `smoke-run-modes.js` | Fallback fill / ready / submit: Continue and Submit only in the matching mode |
| `smoke-backend-jobpool.js` | Local `jobPoolStatus`, live POST `/applied/:id`, cancelled fallback |

`scripts/browser-e2e.js` is the honest end-to-end check. It serves a career page on one origin whose application form lives in an iframe on a **different** origin — a shape no same-document traversal can reach — installs the unpacked extension, and drives the real runner injection path from the extension's own service worker. It asserts that the cross-origin form is filled, that the async portalled listbox option is selected, that the winning result came from the sub-frame, that the phone number is split across the country-code control and the number field, that the preloaded resume lands on an upload control that does not exist until Attach is clicked, and that Chrome opened no file chooser dialog while doing it.

Chrome no longer honours `--load-extension`, so the test installs the extension through the CDP `Extensions.loadUnpacked` domain with `--enable-unsafe-extension-debugging`.
