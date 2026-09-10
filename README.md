# Fill & Apply

Chrome / Edge **Manifest V3** extension: a **queue-driven runner** that fills job-application forms from a saved profile, with **thin ATS / board / agency adapters** and a **generic heuristic fallback**.

Vanilla HTML / CSS / JS — load unpacked, no build step.

**Adaptive fill:** synonym CTAs (Apply / Apply Now / Start Apply / Apply for this Job / …) and Resume≈CV via `lib/synonyms.js` + **universal Apply-start** (click Apply to open the form when still on a job overview) + generic fallback for unknown hosts.

**Docs:** [Docs index](docs/README.md) · [Fill engine](docs/FILL_ENGINE.md) · [Job Application Guide](docs/APPLICATION_GUIDE.md) · [Vision & functionality](docs/APP_VISION_AND_FUNCTIONALITY.md) · [Sources & fields](docs/SOURCES_AND_FIELDS.md) · [Chat log](docs/CHAT_LOG.md) · [Implementation checklist](docs/IMPLEMENTATION_CHECKLIST.md)

Guide covers Ashby limits, LinkedIn Easy Apply vs External Apply (PepsiCo/Riyadh Air→iCIMS), eFinancialCareers account-first + employer handoff, NaukriGulf 100% profile + Easy Apply modal, per-source caps, source profiles / Start gate, App Settings, diversity survey policy.

**Version 1.15.2** — **full applicant profile**. The Zahid General record now carries every field ATS forms are known to ask for as its own value — school, degree, field of study, graduation year, years of experience, current title, and the rest — instead of burying them in a paragraph the engine cannot split. Selects, radios and listboxes resolve buckets (`15` → `10+ years`), education levels (`Master's / MBA` → `Master's Degree`, falling back to `Bachelor's` when that is the highest option offered) and demonyms (`Pakistan` → `Pakistani`). Blank salary and date of birth stay blank. See [Fill engine](docs/FILL_ENGINE.md).

**Version 1.15.1** — **value formats + preloaded documents**. Every value is now shaped for the control receiving it: `lib/format.js` reads the `type`, `pattern`, `maxlength`, `inputmode`, `step` and placeholder mask a field advertises, so a phone number arrives as `+971501234567` in a single field but as `501234567` where the form has its own country-code selector, and as ten bare digits where the control declares `pattern="\d{10}"`. Postal codes, dates, URLs and numbers follow the same rule, and selects try alternate spellings (`United Arab Emirates` → `AE`). The **resume and cover letter loaded in App Settings are attached by the engine itself**, on whichever step asks for them, without ever opening the operating system's file chooser. See [Fill engine](docs/FILL_ENGINE.md).

**Version 1.15.0** — **fill engine rebuild**. Injection now runs in **all frames**, so ATS forms embedded in iframes (Greenhouse / Lever / Workable / SmartRecruiters embeds, iCIMS, Glassdoor→Indeed) are reachable for the first time. Form detection is **signal-scored** instead of matching a container whitelist, so React-rendered forms (Ashby, Lever, Teamtailor, Workday) are recognised. The fill pass is **async**, so custom dropdown options are awaited rather than queried in the same tick — previously no custom dropdown could ever be filled. New `lib/dom-deep.js` pierces shadow roots, resolves labels from wrapper divs, and clicks with real pointer events. Source-profile answers under `customAnswers` now reach reworded page labels.

Prior **1.14.1** Glassdoor Easy Apply click fix; **1.14.0** Glassdoor Easy Apply multi-step + frame-churn retry; **1.13.0** source profiles + Start gate + batch-by-source + App Settings rename.

## Load unpacked

1. Clone or download this repo.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
3. Enable **Developer mode**.
4. **Load unpacked** → select this folder (contains `manifest.json`).
5. Open **App Settings** (Options page): manage **profiles** (chips: Set active / Rename / Duplicate / Delete / Create-Reset Zahid), edit **Profile settings**, paste **Application queue** target apply URLs, optionally upload resume/cover or Drive/URL links (documents shared across profiles).
6. Click the **Fill & Apply** toolbar icon — the UI opens in Chrome’s **right sidebar** (not a tiny popup).

## Multi-profile (v1.9)

App Settings → **Profiles** (collapsible; expanded by default):

- Chips: **Zahid General**, **Mock** 🔒 (permanent demo — cannot delete), **+ Create new profile** (★ = active)
- **Set active / Rename / Duplicate / Delete / Reset Mock / Create-Reset Zahid**
- **Profile settings / Identity** is a separate collapsed section (opens while editing)
- Form edits save into the **active** profile only; switching warns if unsaved
- Side panel shows active applicant `Person · email` only (not chip·person·email)
- Storage: `fillApply.profiles` + `fillApply.activeProfileId`. Legacy migrates to **"Mock"**. Section open-state: `fillApply.ui.sections`.
- **Documents**: file upload + optional Resume/Cover Drive/URL (`resumeLink`/`coverLink` + profile `resumeUrl`/`coverUrl`). Fetch→blob is best-effort; Drive auth/CORS → pause + manual upload.
- **Zahid General**: Create/Reset loads Chaudhary Zahid Ali’s full KSA FP&A profile — every ATS field type, not just contact + a paragraph (see `profiles/zahid-general.json`). Salary, date of birth and driving licence stay blank until supplied.
- **Missing profile fields**: never invented — OS notification + **in-panel popup** to type values → Save & continue writes the active profile, then Resume (batch) or re-runs Single.

## Single vs Batch (v1.12)

| Runner mode | What **Start runner** does |
|-------------|----------------------------|
| **Single** | Fill & Apply on the **current page**: wait ready + settle → detect adapter → Apply-start + 2–3 re-detect retries → fill. Live log shows detecting / clicked Apply / waiting / filling / missing fields. |
| **Batch** | Processes **queued** URLs from App Settings → **Application queue**, **sorted/grouped by source**. If the queue is empty, prompts: run on current page? / open App Settings. |

**Pacing:** random action delay (default 400–900ms) under App Settings → Backend (“Action delay ms” min/max), plus wait-for-load after navigations. **Focus HUD** (default on) outlines the field being filled/clicked and scrolls it into view.

Never clicks paid **AI Auto-Apply** / **Upgrade** / **Subscribe**. LinkedIn **Easy Apply** stays on the LinkedIn board adapter. Host-unknown pages use **fallback + universal Apply-start** (e.g. Parsons “Apply Now” → Workday/SuccessFactors handoff + re-detect).

## Source profiles & Start gate (v1.13)

1. Open **App Settings** (side panel → **Open App Settings**).
2. Expand **Source selection & profiles**.
3. Dropdown: **None (no gate)** | Indeed | LinkedIn | Teamtailor | Greenhouse | …
4. Completeness meter shows `filled/total`. Compulsory fields marked `*`.
5. **Save source answers** / **Clear** / **Copy from active profile** / **Seed Mock source answers**.
6. When a source is selected and incomplete, **Start** is disabled and the side panel shows **Complete [Indeed] source profile**.
7. At fill time: `effectiveProfile = merge(baseProfile, sourceAnswers)` (source wins on mapped keys).
8. Storage: `fillApply.sourceProfiles`, `fillApply.selectedSourceId`.

**Mock demo:** Reset Mock (or Seed Mock source answers) fills Teamtailor/Indeed/… compulsory answers (`currentSalary=25000`, notice **Onspot**, citizenship UAE, basedInRiyadh No, team 11-20, etc.) so demos run without pauses.

**Batch order:** queue is stable-sorted by `sourceId`; session log lines like `batch_source · indeed (3 jobs)`.

## Side panel (Chrome right sidebar)


Toolbar clicks open the **side panel** (`sidepanel/sidepanel.html`) via `chrome.sidePanel` with `openPanelOnActionClick: true`. There is no `action.default_popup`.

**How to open**

- Click the **Fill & Apply** extension icon in the toolbar → right sidebar opens.
- Or use Chrome’s **side panel** menu (toolbar / view) and choose **Fill & Apply**.

**App Settings** (options page)

- Inside the panel: **Open options**
- Or right-click the extension icon → **App Settings** (options page)

Shared controls live in `ui/panel-app.js` (used by the side panel; `popup/` HTML remains as a fallback layout reference).

## Architecture

```
sidepanel/      Primary UI — full-height right sidebar (sticky header, scrollable body)
ui/panel-app.js Shared panel logic (profile, modes, Start/Stop, buckets, reports, fill/seed)
popup/          Same markup/CSS width reference (not opened by toolbar; no default_popup)
background/     Service worker — runner + sidePanel + PDF report helpers
lib/report.js   Application report + minimal PDF writer + chrome.downloads
runner/         Queue loop: next queued job → tab → detect → fill → applied/failed → close? → delay
adapters/
  registry.js   register / detect
  fallback.js   heuristics + file attach + mode-aware Next/Submit
  catalog.js    hostname index for every supported platform
  ats/          Greenhouse (hardened), Ashby (hardened), Lever, Workday, SmartRecruiters, Workable, iCIMS (multi-step + account human-gate + hCaptcha), CATS, Recruitee (Apply with Indeed → Indeed), Teamtailor (Apply for this job → modal)
  boards/       Indeed (multi-step), LinkedIn (Easy Apply + External Apply → iCIMS), NaukriGulf (Easy Apply modal), eFinancialCareers (account-first modal → employer), Wellfound, Remote OK, We Work Remotely (external Apply handoff), Working Nomads (→ Greenhouse), Jooble (→ Swooped/ATS), Swooped (Apply manually instead), …
  agencies/     Michael Page, Hays, Robert Half, …
lib/
  dom-deep.js   deep DOM engine — shadow roots + same-origin frames, label resolution,
                required detection, real pointer clicks, native-setter writes,
                typeahead typing, MutationObserver waits
  types.js      shapes + storage keys + message constants + runMode + pause flags
  storage.js    run config, buckets, documents, mock URL list, applyHistory, source caps, pausedForHuman
  profile.js    multi-profile store (fillApply.profiles + activeProfileId; migrate legacy; phoneCountry, customAnswers, …)
  field-map.js  field heuristics
  format.js     per-control value shaping — phone, postal, date, url, number,
                text truncation, country/state spellings
  files.js      base64 ↔ File + DataTransfer; Attach/Upload discovery with the
                native file dialog suppressed; accept + existing-upload checks
  challenges.js Cloudflare / Turnstile / interactable CAPTCHA detection (no auto-click); auth-wall bridge
  auth-walls.js Sign in / Register / Create a login / Password Re-enter detection (optional for adapters)
  backend.js    getNextJob / markApplied / markFailed / markCancelled + buckets
content/fill.js fill engine, inspectForm, native + custom dropdowns
demo/           sample application form (manual testing only — never enters the queue)
```

**Boards often redirect into an ATS host at apply time.** Detection runs on the apply URL, so a LinkedIn “Apply on company site” flow that lands on `boards.greenhouse.io` is handled by the Greenhouse adapter. Native **LinkedIn Easy Apply** modals are handled by `adapters/boards/linkedin.js`.

## Run modes

Replace the old auto-submit checkbox with a three-way control:

| Mode | Behavior |
|------|----------|
| **Auto Fill** (`fill`) | Fill text / selects / files only. Do **not** click Continue / Next / Submit. |
| **Auto Ready** (`ready`) | Fill + navigate multi-step forms (Next / Continue) as far as possible. **Never** click final Submit / Apply. |
| **Auto Submit** (`submit`) | Full end-to-end, including final Submit / Apply when confidently found. |

Legacy `autoSubmit: true` migrates to `runMode: 'submit'`; otherwise `fill`.

## Fill engine

The DOM layer every adapter builds on. Full detail in [docs/FILL_ENGINE.md](docs/FILL_ENGINE.md).

- **Cross-frame** — injection runs with `allFrames: true`, so ATS forms embedded in iframes are reachable. Sub-frames with no form and no Apply CTA return immediately; the frame that fills the form wins.
- **Signal-scored detection** — `scoreApplicationForm()` weighs named application fields, resume inputs, final-submit CTAs and field density instead of matching a container whitelist, so React-rendered forms count. Search boxes, newsletter signups and sign-in forms are excluded.
- **Async** — the pass waits for a slow SPA to render, awaits listbox options after opening a dropdown (they render a tick later, usually portalled to `<body>`), and types into typeahead comboboxes.
- **Deep and typed** — shadow roots are traversed, labels resolve from wrapper divs and `aria-*`, required fields are detected including a trailing `*`, and checkboxes and radios use real pointer clicks so framework state updates.
- **Formatted per control** — `lib/format.js` shapes each value for the field receiving it, reading its `type`, `pattern`, `maxlength`, `inputmode`, `step` and placeholder mask. Phone numbers split into a dial code and a national number depending on whether the form has its own country-code control; postal codes, dates, URLs and numbers follow the same rule; selects try alternate spellings so `United Arab Emirates` finds `AE`.
- **Documents attached from storage** — the resume and cover letter loaded in App Settings go onto the page's upload control via `DataTransfer`, on whichever step asks for them, including one revealed by Continue. The operating system's file chooser is never opened; an upload the site already holds is kept and reported; a file type the form's `accept` list forbids is reported for manual upload rather than counted as attached.
- **Reported, never invented** — consent checkboxes and voluntary self-identification are skipped and reported; required fields with no answer are named in `missingRequired`, which drives the missing-fields popup.

Every result carries `details[]`, `skipped[]`, `missingRequired[]`, `filesAttached`, `formSignals`, `inspection` and `frames[]`, so a failure shows what the engine actually saw.

## Tests

The extension has no build step; `package.json` exists only for the test harness.

```bash
npm install
npm test                      # jsdom suites: detection, fill engine, value formats, documents, full profile
node scripts/browser-e2e.js   # real Chrome + unpacked extension (needs a display)
```

`scripts/browser-e2e.js` serves a career page whose application form lives in an iframe on a **different** origin, installs the unpacked extension, and drives the real runner injection path from the service worker. It also checks the phone number is split across the country-code control and the number field, that the preloaded resume reaches an upload control that does not exist until Attach is clicked, and that Chrome opened no file chooser dialog.

## Queue buckets

Structured lists in `chrome.storage.local` (not a single looping mock queue):

| Bucket | Meaning |
|--------|---------|
| `queued` | Waiting to process |
| `applied` | Successfully processed for the current mode (fill / ready / submit completed ok) |
| `failed` | Error / inject failure / no adapter / critical file failure |
| `cancelled` | User Stop aborted the current job (incomplete) |

Each job: `{ id, title, company, url, status, attempts, lastError?, result?, updatedAt }`.

**Flow:** `getNextJob` reads from **queued** only → process → move to **applied** or **failed** (never leave looping in queued). The same URL will not reappear until the user re-queues it.

**Stop behavior:** current incomplete job → **cancelled**; remaining jobs stay in **queued**.

**Saving mock URLs** rebuilds **queued** from `http`/`https` URLs only (`chrome-extension:`, `about:`, empty filtered out). **Reset mock** rebuilds queued from the saved URL list and **keeps** applied history (use **Clear history** to wipe applied / failed / cancelled).

Side panel shows counts: **Queued / Applied / Failed / Cancelled**.

## Start / Stop with real apply URLs

The runner **never** opens `chrome-extension://…/demo/…` (executeScript cannot inject into extension pages). Demo URLs can **never** enter the mock queue.

1. App Settings → enable **Mock mode** (default) → paste one apply URL per line under **Application queue** (e.g. Greenhouse `https://boards.greenhouse.io/…/jobs/…`) → **Save & rebuild queued & rebuild queued**.
2. Confirm **Auto-close old submitted tabs** is ON (default) and set **Keep recent tabs** (3–10, default 5) if using **Submit** mode — fill/ready never auto-close.
3. Confirm **Auto PDF report** is ON (default) to download an audit PDF after each successful Submit.
4. Side panel → **Seed sample profile** (once) — includes work auth / sponsorship Yes/No.
5. Optional: App Settings → upload a small PDF resume/cover → **Save documents**.
6. Side panel → set **Delay (sec)** → choose **Auto Fill / Auto Ready / Auto Submit**.
7. Click **Start**. The runner opens each queued `https` URL, detects the adapter, fills (and optionally advances / submits), moves the job to applied or failed, prunes oldest submitted tabs beyond the keep window (Submit success only), waits `delayMs`, then opens the next.
8. Click **Stop** between jobs to halt (current → cancelled; remaining stay queued). **Reset mock queue** rebuilds queued from saved URLs.

If no URLs are configured, Start fails with: **Add job apply URLs in App Settings (Application queue)**.

### Manual demo form (optional)

`demo/sample-application.html` is for **manual** testing only. Open it via Live Server or `file://`, then use **Fill current page**. Do **not** paste it into the mock queue.



## Auto-close policy (Submit mode only)

- **Fill** and **Ready** never auto-close tabs — you keep the just-filled page for review.
- **Submit** + successful `submitted` result: the finished tab is tracked in an oldest-first list. When the count exceeds **Keep recent tabs** (`keepRecentTabs`, default **5**, configurable **3–10**), the **oldest** submitted tabs are closed first.
- The active apply tab is never closed while it is being processed.
- Toggle label: **Auto-close old submitted tabs (keeps last N; Submit mode only)**.
- Failed jobs and exception paths also leave tabs open for debugging.

## PDF application reports (Submit success)

When a job is **submitted** via Submit mode and **Auto PDF report** is ON (default):

1. The extension builds a structured `applicationReport` (title, company, URL, timestamp, adapter, run mode, field label→value map, resume/cover flags, status **Submitted**).
2. A minimal PDF is generated in the service worker (`lib/report.js`) and saved via `chrome.downloads` as `FillApply-Report-{company}-{date}.pdf`.
3. Report metadata is stored in `chrome.storage.local` (`fillApply.reports`) and listed in the side panel (**Last report** / recent list).
4. A JSON summary (and optional small PDF base64) is included when calling backend `markApplied` / POST `/applied/:id`.

Fill and Ready modes do **not** generate PDFs. Reports are the audit trail so applied jobs are never “blind.”

## Indeed apply flow

Hosts: `indeed.com`, `pk.indeed.com`, `ae.indeed.com`, and other `*.indeed.com` locales.

1. Job page with **Apply with Indeed** → adapter clicks it (ready/submit; fill may also enter the form).
2. Multi-step progress (~%):
   - **Contact (~10%)** — First / Last name, Email, Phone (+ country code from `phoneCountry`)
   - **Location (~30%)** — Country, Postcode, City / province / territory, Street
   - **Work auth (~40%)** — “Authorized to work … without visa sponsorship?” → **Yes** when `authorizedToWork` is Yes-like, or default **Yes** if the job was queued (pre-screened)
   - **Resume (~50%)** — if Indeed already shows an uploaded filename, leave as-is (no forced re-upload)
   - **Employer questions (~60%)** — Driving License, own car, years UAE Contracting, etc. from `profile.customAnswers` / `customQA` (fuzzy label match)
   - **Review (~100%)** — **Submit** only in `submit` mode
3. **Structure drift** — unknown new required questions → pause + notify “Indeed form changed — review required” (no guessing).

Profile fields used: `phoneCountry`, `postcode` (alias `zip`), `street`, `city`, `state`, `country`, `customAnswers` map.

## Missing-fields popup (v1.12)

When fill pauses with `needsHuman` + `missingProfileFields`, the side panel opens a modal listing each field with an input. **Save & continue** persists into the active profile (`customAnswers` + `customQA` + mapped keys like nationality / noticePeriod / salary) via `FillApplyProfile.applyMissingFieldAnswers`, clears `fillApply.pauseState`, then **Resume** (batch) or re-runs **Single**. The OS notification remains a heads-up only.

## Number / salary sanitize (v1.12)

`input[type=number]` rejects values like `25000 AED`. Shared helpers: `FillApplyProfile.numericAmount` and `__fillApply.sanitizeForInput(el, value)` strip currency codes/symbols before setting. Text inputs keep the full string.

## Cloudflare / CAPTCHA human gate

Dashboard or apply URLs may hit Cloudflare (“Additional Verification Required”, “Verify you are human”, Turnstile, Ray ID, tab title **Just a moment…**) or an interactable reCAPTCHA/hCaptcha checkbox/iframe.

**Behavior (platform-wide via `lib/challenges.js`):**

- Detect and **pause** the run (`pausedForHuman`); keep the apply tab focused
- Desktop notification: **Fill & Apply — action needed** (job title + URL host)
- Job stays **queued** with `needsAttention: true`
- Side panel shows **Paused — verify Cloudflare/CAPTCHA** with a **Resume** button
- Footer-only “protected by reCAPTCHA” text does **not** pause; only interactable challenges / Cloudflare interstitials do
- **Never** auto-click Cloudflare or CAPTCHA — complete them yourself, then **Resume**

Human-like: slight delay jitter between jobs; tab is focused (`chrome.tabs.update(tabId, { active: true })`) before fill.

## Greenhouse / file uploads

Greenhouse “Attach” is often a visible button + hidden `input[type=file]`, or a dropzone.

- Find file inputs (including **hidden**) near Resume / CV / Cover Letter labels.
- Find buttons/links with text Attach / Upload / Resume / CV.
- Prefer assigning a `DataTransfer` to the underlying file input; if only a button is visible, click to reveal then assign.
- Match resume vs cover by label / accept / name.
- Fill result reports `resumeAttached` / `coverAttached` booleans.

Hardened for `boards.greenhouse.io`, `job-boards.greenhouse.io`, and `*.greenhouse.io` (v1.8.5): preferred name, city/country/phone-country, sponsorship / work-auth / prior employer / US-based / employment-agreement Yes–No selects, why-join long text from `coverLetter`/`customAnswers`, team-interest radios, EEO skip, **Apply for this job** / **Submit application**. Paste examples (GitLab / Figma Strategic Finance) in [APPLICATION_GUIDE](docs/APPLICATION_GUIDE.md#greenhouse--hardened-ats).

## Jooble → Swooped / external ATS

Jooble is a **discovery** aggregator; **Apply** often opens **Swooped** (assisted-apply intermediary) or an employer ATS. Fill & Apply clicks Jooble Apply, re-detects on the new host, prefers Swooped **Apply manually instead** (never product Auto Apply / Upgrade). If already in Swooped **Apply Agent** (Needs Input), it uploads the stored resume, prefers **Focused & Impactful**, fills profile questions + **Save Answer**, skips EEO, and only clicks **Autofill & Submit** in submit mode. See [APPLICATION_GUIDE](docs/APPLICATION_GUIDE.md#jooble--swooped--external-ats).

## Working Nomads → Greenhouse

Working Nomads is a **discovery** board; **Apply** often opens **Greenhouse**. The board adapter clicks Apply (not unrelated CTAs), hands off on host change, and the runner re-injects so Greenhouse fills. See [APPLICATION_GUIDE](docs/APPLICATION_GUIDE.md#working-nomads--greenhouse-handoff).

## We Work Remotely — paid source

WWR needs a **full profile** then a **paid plan** (intro pricing may apply; still paid) to **browse**. **Apply now** often opens an **external ATS** (e.g. **Powered by CATS**); the runner re-detects on the new host. **Do not use** WWR **AI Auto-Apply**. See [APPLICATION_GUIDE](docs/APPLICATION_GUIDE.md#we-work-remotely--paid-source) and [CATS](docs/APPLICATION_GUIDE.md#cats-catsonecom--ats).

## Remote OK — paid source

Remote OK is a **paid** board (**no free trial**). Fill & Apply pauses on paywall/geolock and will not fake applies until a paid account unlocks the real form. See [APPLICATION_GUIDE](docs/APPLICATION_GUIDE.md#remote-ok--paid-source).

## NaukriGulf prerequisite

Before queueing NaukriGulf jobs, your **NaukriGulf profile must be 100% complete**. Incomplete profiles redirect to profile completion instead of the job/apply page. Easy Apply uses an on-page screening modal (**Submit & Apply**). Details: [docs/APPLICATION_GUIDE.md](docs/APPLICATION_GUIDE.md#naukrigulf--profile-completeness-required) and [Easy Apply](docs/APPLICATION_GUIDE.md#naukrigulf-easy-apply).

## Ashby apply flow

Hosts: `jobs.ashbyhq.com`, `ashbyhq.com`, `*.ashbyhq.com`.

1. Overview → click **Application** / **Apply for this Job** when needed.
2. Fill Name, Email, Resume (DataTransfer), LinkedIn, work-from country/city, sponsorship Yes/No.
3. Role-specific long answers from `customAnswers` / `coverLetter` when mapped; otherwise blank (or human pause if required in Submit).
4. **Diversity survey skipped** by default (Prefer not to answer — never invent demographics).
5. Modes: fill / ready / submit (**Submit Application** only in submit).
6. Cloudflare / structure drift → human pause via `challenges.js`.

**Ashby employer limits** (enforced by Fill & Apply caps): at most **3** applications / **60** days; no same-role re-apply within **180** days without an offer. See [docs/APPLICATION_GUIDE.md](docs/APPLICATION_GUIDE.md).

## Per-source application caps

- Config key `sourceApplyLimits`: e.g. `{ ashby: 2, indeed: 2, greenhouse: 2, lever: 2, default: 2 }`.
- **Hard max 3**; UI clamps 1–3. Default **2** for Ashby and others.
- Before opening a job, the runner counts successful **submitted** applies for that source in the last **60 days**.
- Over cap → skip to **cancelled** with `Source apply cap reached (N/max for ashby)` + notification (no open/submit).
- Ashby same URL within 180 days → soft-blocked with a clear message.
- Configure in **Options** or the side panel; full write-up in [docs/APPLICATION_GUIDE.md](docs/APPLICATION_GUIDE.md).


## Form inspection

Before filling, `inspectForm(document)` catalogs inputs, textareas, select options, contenteditables, file inputs, Attach buttons, and custom dropdown triggers. A summary (`field count by type`) is returned in the fill result and used to drive select / listbox matching (fuzzy Yes/No, country lists, etc.).

## Backend contract (live mode)

Set **Backend base URL** and turn **Mock mode** off.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/queue` | List jobs `{ id, title, company, url, ats? }[]` |
| GET | `/queue/next` | Next job or empty |
| POST | `/applied/:id` | Body: fill result / submitted / runMode / `reportSummary` (+ optional `pdfBase64`) |
| GET | `/profile` | Optional remote profile |
| GET | `/documents` | `{ resume, cover }` each `{ name, mime, base64 }` or URL |

With mock mode (or empty base URL), `lib/backend.js` serves the in-extension **queued** bucket built from **Options → Application queue** URLs.

## File attach method

Browsers block setting a file path on `<input type="file">`. We store resume/cover as **base64 in `chrome.storage`**, rebuild a `File` / `Blob`, and assign via **`DataTransfer`** (`lib/files.js` → `assignFilesToInput`). Blobs may also come from the backend `getDocuments()` response.

## Recruitee → Apply with Indeed

Hosts: `*.recruitee.com` and Recruitee-powered company careers pages.

1. Detect Recruitee; prefer **Apply with Indeed** when present (`preferIndeedApply` default **true**).
2. Handoff → Indeed adapter (Cloudflare pause via `challenges.js` if shown).
3. Else click **Apply** and fill native Recruitee form via fallback.

See `docs/APPLICATION_GUIDE.md` → "Recruitee → Apply with Indeed".

## How to add a platform adapter

1. Pick a slug (`myats`) and category (`ats` | `board` | `agency`).
2. Add hostname patterns to `adapters/catalog.js` **or** add `adapters/<category>/<slug>.js` that calls `FillApplyRegistry.register({ id, name, detect, submitSelector, fileInputHints, fill })`.
3. For deeper ATS behavior, put an override in `adapters/ats/<slug>.js` with better `detect` / selectors; load it **after** `catalog.js` in the inject list (`runner/runner.js` + popup) so it replaces the thin entry.
4. `fill` may delegate to `FillApplyFallbackAdapter.fill(ctx)` with overrides. Honor `ctx.runMode`.
5. Reload the extension and open a matching URL → **Fill current page**; status shows `adapterId`.

### Supported platforms (catalog)

**ATS:** Greenhouse, Ashby, Lever, Workable, Workday, SmartRecruiters, iCIMS, CATS, Recruitee (→ Apply with Indeed)  

**Boards / aggregators:** LinkedIn (Easy Apply + External Apply → careers/iCIMS), Upwork, NaukriGulf, Remote OK, We Work Remotely, Working Nomads (→ Greenhouse), Indeed, eFinancialCareers (account-first → employer), FreeHire, Jooble (→ Swooped/ATS), Swooped (Apply manually instead), Bayt, GulfTalent, Glassdoor, Wellfound, AngelList/Talent, FlexJobs, Remote.co, Remotive, Himalayas, Otta, Jobgether, Y Combinator Jobs, Built In  

**Agencies:** Michael Page, Hays, Robert Half, Cooper Fitch, Charterhouse, Robert Walters, Jivaro Partners, LHH  

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Profile, run config, documents, session log, queue buckets, mock URLs |
| `tabs` / `scripting` | Runner opens job URLs and injects adapters |
| `activeTab` | One-off fill from the side panel |
| `alarms` | Reserved for durable delays |
| `sidePanel` | Open Fill & Apply in Chrome’s right sidebar |
| `notifications` | Alert when Cloudflare/CAPTCHA / Indeed drift needs a human |
| `downloads` | Save PDF application reports after successful Submit |
| host_permissions | Inject into http(s) / file job pages |

## Notes

- Heuristics will not cover every form; extend field-map or add adapter overrides.
- Password fields are skipped.
- Review every application before submitting. Do not misrepresent yourself.
- **Auto Fill** is the default mode for safety.
- **Auto-close old submitted tabs** defaults ON; Submit-success only; keeps last N tabs (default 5). Fill/ready/failed never auto-close.
- **Auto PDF report** defaults ON for successful Submit; files land in Downloads; side panel shows recent report meta.
- Paste **real https apply URLs**; the demo page is manual-only and can never enter the mock queue.

## Reload test (Indeed + Cloudflare)

1. `chrome://extensions` → **Reload** Fill & Apply (v1.8.0).
2. App Settings → seed sample profile (includes `phoneCountry`, UAE location, Driving License / car / contracting `customAnswers`) → Save.
3. Paste an `https://ae.indeed.com/…` or `https://pk.indeed.com/…` (or www) job URL into Application queue → Save.
4. Side panel → **Auto Ready** or **Auto Submit** → Start.
5. If Cloudflare / Turnstile appears: run pauses, notification fires, side panel shows **Paused — verify Cloudflare/CAPTCHA** — solve it in the tab (do not expect the extension to click it) → **Resume**.
6. Confirm steps: Apply with Indeed → contact/location/work-auth/resume/employer Qs → review; Submit only in submit mode; resume file left alone if already shown.
7. Unknown required employer question → pause with “Indeed form changed — review required”.

## Reload test (Greenhouse + Working Nomads)

1. `chrome://extensions` → **Reload** Fill & Apply (**v1.8.5**).
2. App Settings → paste a real `https://boards.greenhouse.io/…` or `job-boards.greenhouse.io` apply URL (GitLab/Figma-style) **or** a Working Nomads job URL that Apply-opens Greenhouse → Save → confirm Queued count ≥ 1.
3. Upload resume/cover → Save documents. Seed sample profile; map `customAnswers` for why-join / team interest / prior employer if using **Auto Submit**.
4. Side panel → **Auto Fill** → Start. Confirm: preferred name / city / selects / resume+cover attached; EEO left alone; Working Nomads Apply hands off to Greenhouse when applicable; tab **stays open** in Fill mode.
5. Optional: **Auto Ready** / **Auto Submit** (Submit application / Apply for this job only in submit; PDF + keep-N).


## Reload test (NaukriGulf Easy Apply)

1. `chrome://extensions` → **Reload** Fill & Apply (v1.8.0).
2. Confirm NaukriGulf profile is **100% complete** on naukrigulf.com (incomplete → profile redirect pause).
3. App Settings → seed sample profile (UAE location helps “located in UAE”) → add `customAnswers` for employed / industry questions if you use them → Save.
4. Paste a NaukriGulf job URL that shows **Easy Apply** into Application queue → Save.
5. Side panel → **Auto Fill** or **Auto Ready** → Start. Confirm: Easy Apply opens on-page modal, Yes/No answered, **Submit & Apply** not clicked.
6. Optional: **Auto Submit** → Confirm **Submit & Apply** is clicked; unknown unmapped required question → pause with structure-drift message.
7. If modal never appears → pause asking you to open Easy Apply manually, then Resume.


## Reload test (LinkedIn Easy Apply)

1. `chrome://extensions` → **Reload** Fill & Apply (**v1.9.6**).
2. Sign in to LinkedIn in the same browser profile (login wall → pause).
3. App Settings → seed profile + upload resume → add `customAnswers` for employer Qs (conflict of interest, PIF, salaries, DOB, nationality, privacy, criminal) → Save.
4. Paste a LinkedIn job URL that shows **Easy Apply** into Application queue → Save.
5. Side panel → **Auto Fill** or **Auto Ready** → Start. Confirm: Easy Apply opens, pages fill, Next/Review advance, **Submit application** is **not** clicked.
6. Optional: **Auto Submit** → Confirm **Submit application** on Review; captcha / missing modal / unmapped required → pause.
7. External-only Apply jobs are not Easy Apply — use the company ATS URL or expect a structure-drift pause.

## Reload test (Ashby + caps)

1. `chrome://extensions` → **Reload** Fill & Apply (v1.8.0).
2. App Settings → set Ashby cap to **2** (default) → Save. Seed profile + upload resume.
3. Paste a `https://jobs.ashbyhq.com/…` apply URL → Save mock queue.
4. Side panel → **Auto Fill** → Start. Confirm Application tab, fields filled, diversity skipped, no submit.
5. Optional: **Auto Submit** once; confirm history records the apply. Queue a 3rd Ashby URL after two submits → expect skip with **Source apply cap reached**.

## Branding

| Path | Contents |
|------|----------|
| `brand/` | Master assets: `icon-master.png`, `banner.png`, `favicon.ico`, and sized `icon16` / `32` / `48` / `128` / `256.png` |
| `icons/` | Extension toolbar / store icons used by `manifest.json` (`icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`, `icon256.png`) |

Options uses a **thin sticky title bar** (logo + name + version + active profile chip) and **collapsible sections**. The side panel is a **lean runner console** (profile select, application mode, Single/Batch, Start/Stop/Resume, bucket pills, live log) with mint accent `#22c55e` on dark navy.

## Development

No bundler. After edits: **Reload** on `chrome://extensions`, then paste Greenhouse apply URLs into App Settings → Application queue → Start / Stop.
