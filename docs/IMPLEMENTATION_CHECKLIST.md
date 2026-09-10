# Implementation Checklist

Honest status of what was actually shipped in **Fill & Apply** as of **v1.15.0** on `main`.

Legend: ✅ done · 🚧 in progress · ⏳ planned / deferred

---

## Fill engine (v1.15.0)

Everything below fixes a defect that made forms unreadable or invisible regardless of which adapter matched. See [FILL_ENGINE.md](FILL_ENGINE.md).

| Item | Status | Notes |
|------|--------|-------|
| Cross-frame injection (`allFrames: true`) | ✅ | Was top-frame only, so every iframed ATS form was invisible |
| Sub-frame guard + best-frame result ranking | ✅ | Ad/tracker frames return immediately; the frame that fills wins |
| Signal-scored form detection | ✅ | `scoreApplicationForm()` replaces the container whitelist |
| Async fill pass | ✅ | Waits for SPA render; awaits portalled listbox options |
| Custom dropdown / combobox filling | ✅ | Previously impossible — options were queried in the same tick as the click |
| Typeahead combobox typing | ✅ | Character-by-character with key events |
| Shadow-DOM traversal | ✅ | `lib/dom-deep.js` |
| Label resolution from wrapper divs / `aria-*` | ✅ | Was `previousElementSibling` only |
| Required-field detection (incl. trailing `*`) | ✅ | Feeds `missingRequired` |
| Real pointer clicks for checkbox / radio / CTA | ✅ | react-select, Radix, Headless UI, MUI ignore bare `.click()` |
| Date normalization + `maxlength` truncation | ✅ | |
| Page-furniture exclusion (search / newsletter / sign-in) | ✅ | |
| `customAnswers` reaching reworded page labels | ✅ | Source-profile answers were being collected and then discarded |
| Generic engine as fallback behind a drifted adapter | ✅ | Adapter fills nothing → generic engine tries |
| Per-run diagnostics (`details`, `skipped`, `missingRequired`, `formSignals`, `frames`) | ✅ | |
| jsdom test suites | ✅ | `npm test` — 4 suites, 44 assertions |
| Real-Chrome end-to-end test | ✅ | `scripts/browser-e2e.js` — cross-origin iframe form |

---

## Core platform

| Item | Status | Notes |
|------|--------|-------|
| Repo scaffold (MV3, load unpacked, vanilla JS) | ✅ | Initial commit → queue-driven reshape |
| Queue runner (getNextJob → tab → detect → fill → buckets) | ✅ | `runner/runner.js` + `lib/backend.js` |
| Run modes Fill / Ready / Submit | ✅ | v1.3+ |
| Buckets queued / applied / failed / cancelled | ✅ | |
| chrome.storage.local config + pause state | ✅ | |
| Adaptive synonyms (Apply CTAs, Resume≈CV) | ✅ | `lib/synonyms.js` |
| Universal Apply-start + re-detect retries | ✅ | v1.10 → hardened 1.11.1 |
| Generic heuristic fallback | ✅ | `adapters/fallback.js` |
| Cloudflare / captcha human gate | ✅ | `lib/challenges.js` — never auto-click |
| Auth-wall pause (sign-in / create login) | ✅ | `lib/auth-walls.js` + adapter bridges |
| Per-source apply caps (default 2, max 3) | ✅ | Ashby-style enforcement |
| PDF application reports (Submit success) | ✅ | `lib/report.js` |
| Auto-close old submitted tabs (keep N) | ✅ | Submit mode only |
| Focus HUD (outline + scroll into view) | ✅ | Light HUD — `content/focus-hud.js` |
| Cinematic cursor / heavy animation | ⏳ | Deferred |

---

## Adapters hardened from pastes

| Adapter | Status | Notes |
|---------|--------|-------|
| Greenhouse | ✅ | GitLab / Figma pastes; file Attach; selects; EEO skip |
| Indeed | ✅ | Multi-step contact→review; Cloudflare pause; fill→Continue→rescan |
| Glassdoor Easy Apply | ✅ | v1.14.1 — inFlow false-positive fix + Easy Apply click/reDetect; v1.14.0 steps + frame-churn |
| Ashby | ✅ | + published caps |
| NaukriGulf | ✅ | 100% profile gate + Easy Apply modal |
| Remote OK | ✅ | Paid / paywall / geolock pause (no full unlocked form yet) |
| We Work Remotely | ✅ | Paid + profile gate; external Apply handoff |
| CATS | ✅ | From WWR destination paste |
| Working Nomads | ✅ | Handoff → Greenhouse |
| Jooble | ✅ | Handoff → Swooped / ATS |
| Swooped | ✅ | Apply manually instead + Needs Input |
| LinkedIn Easy Apply | ✅ | Multi-page modal |
| LinkedIn External → iCIMS | ✅ | Share-profile Off + handoff |
| iCIMS | ✅ | Welcome, auth gate, PepsiCo + Riyadh Air richer profile, SSO |
| eFinancialCareers | ✅ | Account-first modal → employer handoff |
| Recruitee | ✅ | Prefer Apply with Indeed |
| Teamtailor | ✅ | Noon careers modal paste |
| Lever | ✅ | Thin / baseline |
| Workday / Workable / SmartRecruiters | ✅ | Baseline catalog adapters |
| Agencies (Michael Page, Hays, …) | ✅ | Thin catalog entries |
| Full Remote OK / WWR unlocked apply forms | ⏳ | After paid access + fresh pastes |

---

## Profiles & answers

| Item | Status | Notes |
|------|--------|-------|
| Multi-profile (create / select / save / switch) | ✅ | v1.9.0 |
| Zahid General built-in template | ✅ | v1.9.8 — `profiles/zahid-general.json` |
| Mock locked complete demo (non-deletable) | ✅ | v1.11.1 |
| No invented answers + high-alert pause | ✅ | v1.9.9 |
| Missing-fields in-panel popup | ✅ | v1.12.0 — Save & continue |
| Number / salary sanitize (`25000 AED` → number) | ✅ | v1.12.0 |
| Source-based profiles + Start gate | ✅ | v1.13.0 — already in tree (`lib/source-profiles.js`) |
| Batch-by-source queue sort | ✅ | v1.13.0 |
| Mock seed source answers (Teamtailor/Indeed/Glassdoor/…) | ✅ | v1.13.0 + Glassdoor in 1.14.0 |
| Frame-removed / No-tab retry on Easy Apply Continue | ✅ | v1.14.0 — runner + panel |
| Zahid empty source shells (fill when needed) | ✅ | v1.13.0 |

---

## UI / UX

| Item | Status | Notes |
|------|--------|-------|
| Side panel (Chrome right sidebar) | ✅ | v1.4.0 |
| Banner removed | ✅ | v1.11.0 |
| Collapsible App Settings sections | ✅ | v1.11.0 |
| Lean side panel (profile, mode, Single/Batch, Start, log) | ✅ | v1.11.0 |
| Application queue section | ✅ | Options / App Settings |
| Options → **App Settings** rename | ✅ | v1.13.0 (path still `options/options.html`) |
| Single settle / paced clicks | ✅ | v1.12.0 |
| Branding icons / mint accent | ✅ | |

---

## Documents

| Item | Status | Notes |
|------|--------|-------|
| Resume/cover upload → DataTransfer | ✅ | |
| Drive / URL doc links (best-effort fetch) | ✅ | Auth/CORS → pause + manual |
| Shared documents across profiles | ✅ | |

---

## Docs pack

| Item | Status | Notes |
|------|--------|-------|
| Root README.md | ✅ | Pre-existing; kept updated with versions |
| docs/APPLICATION_GUIDE.md | ✅ | Pre-existing (~48KB) |
| docs/README.md (index) | ✅ | This pack |
| docs/APP_VISION_AND_FUNCTIONALITY.md | ✅ | This pack |
| docs/SOURCES_AND_FIELDS.md | ✅ | This pack |
| docs/CHAT_LOG.md | ✅ | This pack (paraphrased transcript) |
| docs/IMPLEMENTATION_CHECKLIST.md | ✅ | This file |

---

## Not in scope / deferred

| Item | Status |
|------|--------|
| Auto-bypass Cloudflare / captcha / paywalls | ❌ Never — by design |
| Invent EEO / diversity / passwords | ❌ Never — by design |
| Cinematic cursor HUD | ⏳ Deferred |
| Native store listing / packaged Web Store release | ⏳ Not started |
| Real backend JobPool production integration beyond mock buckets | 🚧 Storage buckets + optional POST hooks; full server TBD |

---

*Last reviewed against repo `main` at v1.15.0 (fill engine rebuild).*
