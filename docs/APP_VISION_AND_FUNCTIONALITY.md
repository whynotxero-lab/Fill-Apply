# App Vision & Functionality

Comprehensive product and architecture overview for **Fill & Apply** (Chrome Manifest V3 extension).

## Product

**Fill & Apply** is a queue-driven job-application filler: a Chrome / Edge MV3 extension that opens apply URLs, detects the ATS or job board, fills forms from a saved applicant profile, and respects human gates (Cloudflare, captcha, sign-in, paywall).

Primary applicant profile: **Chaudhary Zahid Ali** (KSA FP&A template — **Zahid General**). The product also supports **multi-profile** (Mock locked demo, Create new, Duplicate, Rename, Delete).

Vanilla HTML / CSS / JS — load unpacked, no build step.

## Vision

| Principle | What it means in practice |
|-----------|---------------------------|
| Same candidate across ATS/boards | One active profile + optional **source profiles** merged at fill time (`effectiveProfile = merge(base, sourceAnswers)`) |
| Adaptive synonyms | Apply / Apply Now / Start Apply / Apply for this Job; Resume ≈ CV via `lib/synonyms.js` + universal Apply-start |
| Human gates | Cloudflare, Turnstile, interactable captcha, sign-in / register, paid paywalls → pause + notify + Resume — never bypass |
| No invented answers | Empty required fields → high-alert + missing-fields popup; EEO/diversity never invented (skip / prefer-not) |
| Missing-field popup | In-panel modal to type values → Save & continue writes active profile → Resume / re-run Single |
| Source-based profiles (1.13) | Per-platform compulsory fields; Start gate until complete; Mock seeds demo answers |
| Single vs Batch | Single = current page; Batch = Application queue sorted/grouped by source |
| Paced actions | Random action delay (default 400–900 ms) + wait-for-load after navigations |
| Focus HUD | Outline + scroll-into-view on the field being filled/clicked (light HUD; cinematic cursor deferred) |

## Architecture

```
sidepanel/          Primary UI — Chrome right sidebar (sticky header, scrollable body)
ui/panel-app.js     Shared panel logic (profile, modes, Start/Stop, buckets, reports)
options/            App Settings (formerly Options) — profiles, queue, documents, sources
background/         Service worker — runner orchestration, sidePanel, PDF helpers
runner/             Queue loop: next job → tab → detect → fill → applied/failed → delay
adapters/
  registry.js       register / detect
  catalog.js        hostname index
  fallback.js       heuristics + file attach + mode-aware Next/Submit
  ats/              Greenhouse, Ashby, Lever, Workday, SmartRecruiters, Workable,
                    iCIMS, CATS, Recruitee, Teamtailor, …
  boards/           Indeed, LinkedIn, NaukriGulf, eFinancialCareers, Jooble, Swooped,
                    Remote OK, WWR, Working Nomads, …
  agencies/         Michael Page, Hays, Robert Half, …
lib/
  dom-deep.js       deep DOM engine — shadow roots + same-origin frames, labels,
                    required detection, real clicks, waits (used by every layer)
  profile.js        multi-profile store + missing-field apply + number sanitize
  source-profiles.js per-source compulsory fields, Start gate, merge-over-base
  storage.js        run config, buckets, documents, caps, pause state
  field-map.js      field heuristics
  files.js          base64 ↔ File + DataTransfer
  challenges.js     Cloudflare / captcha detection (no auto-click)
  auth-walls.js     Sign in / Register / Create login detection
  synonyms.js       CTA + Resume/CV synonyms
  pace.js           action delay jitter
  report.js         application report + minimal PDF
  backend.js        getNextJob / markApplied / markFailed / markCancelled
content/fill.js     fill engine, inspectForm, native + custom dropdowns
content/focus-hud.js focus outline HUD
profiles/           zahid-general.json seed template
demo/               sample form (manual only — never enters the queue)
```

**Storage:** primarily `chrome.storage.local` (`fillApply.profiles`, `fillApply.activeProfileId`, `fillApply.sourceProfiles`, `fillApply.selectedSourceId`, buckets, documents, run config, pause state, reports, UI section open-state).

**Documents:** resume/cover as stored files (DataTransfer into file inputs) plus optional Drive/URL links (`resumeLink` / `coverLink`) — fetch→blob is best-effort; Drive auth/CORS may pause for manual upload.

**Reports:** on successful Submit, structured report + minimal PDF via `chrome.downloads`.

## UI sections

### Side panel (Chrome right sidebar)

- Active applicant (`Person · email`) / profile select
- Application mode: **Fill / Ready / Submit**
- Runner mode: **Single / Batch**
- **Start** / Stop / Resume
- Bucket pills: Queued / Applied / Failed / Cancelled
- Missing-fields popup (modal)
- Live log (detecting / clicked Apply / waiting / filling / missing fields / batch_source · …)
- Open App Settings
- Focus HUD toggle (when exposed)

Toolbar uses `chrome.sidePanel` with `openPanelOnActionClick: true` (no `action.default_popup`).

### App Settings (Options page — UI title “App Settings”)

Collapsible sections:

1. **Profiles** — Zahid General, Mock 🔒 (locked complete demo), Create new; Set active / Rename / Duplicate / Delete / Reset Mock / Create-Reset Zahid
2. **Application queue** — paste apply URLs; Save & rebuild queued; batch later sorts by source
3. **Documents / Drive links** — upload resume/cover; optional URL/Drive links (shared across profiles)
4. **Backend / runner** — delay, keep-recent tabs, auto-close (Submit only), PDF report, apply caps, preferIndeedApply, etc.
5. **Source selection & profiles** — dropdown (None / Indeed / LinkedIn / Teamtailor / …), completeness meter, Save / Clear / Copy from active / Seed Mock
6. **Identity / custom Q&A** — profile identity fields + `customAnswers` / `customQA` (opens while editing)

Thin sticky title bar (logo + name + version + active profile chip). Large banner removed in 1.11.

## Modes

| Mode | Behavior |
|------|----------|
| **Auto Fill** (`fill`) | Fill text / selects / files only. Do not click Continue / Next / Submit. |
| **Auto Ready** (`ready`) | Fill + navigate multi-step (Next / Continue). Never final Submit / Apply. |
| **Auto Submit** (`submit`) | End-to-end including final Submit / Apply when confidently found. |

## Queue buckets

| Bucket | Meaning |
|--------|---------|
| `queued` | Waiting |
| `applied` | Processed OK for current mode |
| `failed` | Error / inject failure / no adapter |
| `cancelled` | User Stop aborted current job |

Stop → current → cancelled; remaining stay queued. Apply caps: per-source default 2, max 3 (Ashby-published style enforcement).

## Profiles

- **Zahid General** — built-in KSA FP&A applicant template (`profiles/zahid-general.json`); Create/Reset button
- **Mock** — permanent locked demo (cannot delete); seeds source answers for Teamtailor/Indeed/etc. so demos run without pauses
- Additional user profiles via Create / Duplicate

## Version milestones (brief)

| Ver | Highlights |
|-----|------------|
| **1.8.x** | NaukriGulf Easy Apply; Remote OK / WWR paid + profile gates; WWR→CATS; synonyms; Working Nomads→Greenhouse harden |
| **1.9.0** | Multi-profile in Options |
| **1.9.1–1.9.7** | Jooble→Swooped; LinkedIn Easy + External→iCIMS; iCIMS multi-step + SSO; eFinancialCareers; Recruitee→Indeed |
| **1.9.8–1.9.9** | Zahid General template; no invented fields + high-alert pause |
| **1.10.0** | Universal Apply-start + Teamtailor ATS |
| **1.11.0** | Production Options UI (collapsible, no banner) + lean side panel |
| **1.11.1** | Locked Mock demo + Teamtailor Apply-start harden |
| **1.12.0** | Missing-fields popup; Single settle/pace; number/salary sanitize |
| **1.13.0** | Source profiles + Start gate; batch-by-source; Options → App Settings rename |
| **1.14.x** | Glassdoor Easy Apply multi-step, frame-churn retry, `inFlow` false-positive fix |
| **1.15.0** | Fill engine rebuild — cross-frame injection, signal-scored form detection, async dropdown handling, deep DOM field reading, `customAnswers` reaching the page, run diagnostics, jsdom + real-Chrome tests ([FILL_ENGINE.md](FILL_ENGINE.md)) |
| **1.15.1** | Per-control value formatting (phone country-code split, masks and patterns, postal codes, dates, URLs, numbers, country/state spellings) + preloaded resume and cover letter attached by the engine on whichever step asks for them, without the OS file chooser ([FILL_ENGINE.md](FILL_ENGINE.md)) |

## Related

- [FILL_ENGINE.md](FILL_ENGINE.md) — how forms are found, read and filled; failure modes and diagnostics
- [APPLICATION_GUIDE.md](APPLICATION_GUIDE.md) — detailed per-source operator guide
- [SOURCES_AND_FIELDS.md](SOURCES_AND_FIELDS.md) — field comparison
- [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) — status checklist
- [../README.md](../README.md) — load unpacked + architecture tree
