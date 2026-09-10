# Fill & Apply

Chrome / Edge **Manifest V3** extension: a **queue-driven runner** that fills job-application forms from a saved profile, with **thin ATS / board / agency adapters** and a **generic heuristic fallback**.

Vanilla HTML / CSS / JS — load unpacked, no build step.

**Docs:** [Job Application Guide](docs/APPLICATION_GUIDE.md) — Ashby limits, NaukriGulf 100% profile + Easy Apply modal, per-source caps, Options configuration, diversity survey policy.

**Version 1.8.0** — NaukriGulf Easy Apply (on-page modal screening + Submit & Apply), Ashby caps, Application Guide, Submit keep-N tabs, PDF reports, Indeed multi-step, Cloudflare pause, Greenhouse harden.

## Load unpacked

1. Clone or download this repo.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
3. Enable **Developer mode**.
4. **Load unpacked** → select this folder (contains `manifest.json`).
5. Open **Options**: seed/edit profile, paste **Mock queue** apply URLs, optionally upload resume/cover.
6. Click the **Fill & Apply** toolbar icon — the UI opens in Chrome’s **right sidebar** (not a tiny popup).

## Side panel (Chrome right sidebar)

Toolbar clicks open the **side panel** (`sidepanel/sidepanel.html`) via `chrome.sidePanel` with `openPanelOnActionClick: true`. There is no `action.default_popup`.

**How to open**

- Click the **Fill & Apply** extension icon in the toolbar → right sidebar opens.
- Or use Chrome’s **side panel** menu (toolbar / view) and choose **Fill & Apply**.

**Options**

- Inside the panel: **Open options**
- Or right-click the extension icon → **Options**

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
  ats/          Greenhouse (hardened), Ashby (hardened), Lever, Workday, SmartRecruiters, Workable, iCIMS
  boards/       Indeed (multi-step), NaukriGulf (Easy Apply modal), LinkedIn, Wellfound, Remote OK, …
  agencies/     Michael Page, Hays, Robert Half, …
lib/
  types.js      shapes + storage keys + message constants + runMode + pause flags
  storage.js    run config, buckets, documents, mock URL list, applyHistory, source caps, pausedForHuman
  profile.js    applicant profile (phoneCountry, postcode, street, customAnswers, work auth)
  field-map.js  field heuristics
  files.js      base64 ↔ File + DataTransfer; Attach/Upload button discovery
  challenges.js Cloudflare / Turnstile / interactable CAPTCHA detection (no auto-click)
  backend.js    getNextJob / markApplied / markFailed / markCancelled + buckets
content/fill.js fill engine, inspectForm, native + custom dropdowns
demo/           sample application form (manual testing only — never enters the queue)
```

**Boards often redirect into an ATS host at apply time.** Detection runs on the apply URL, so a LinkedIn Easy Apply or “Apply on company site” flow that lands on `boards.greenhouse.io` is handled by the Greenhouse adapter (not the LinkedIn stub).

## Run modes

Replace the old auto-submit checkbox with a three-way control:

| Mode | Behavior |
|------|----------|
| **Auto Fill** (`fill`) | Fill text / selects / files only. Do **not** click Continue / Next / Submit. |
| **Auto Ready** (`ready`) | Fill + navigate multi-step forms (Next / Continue) as far as possible. **Never** click final Submit / Apply. |
| **Auto Submit** (`submit`) | Full end-to-end, including final Submit / Apply when confidently found. |

Legacy `autoSubmit: true` migrates to `runMode: 'submit'`; otherwise `fill`.

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

1. Options → enable **Mock mode** (default) → paste one apply URL per line under **Mock queue** (e.g. Greenhouse `https://boards.greenhouse.io/…/jobs/…`) → **Save mock URLs & rebuild queued**.
2. Confirm **Auto-close old submitted tabs** is ON (default) and set **Keep recent tabs** (3–10, default 5) if using **Submit** mode — fill/ready never auto-close.
3. Confirm **Auto PDF report** is ON (default) to download an audit PDF after each successful Submit.
4. Side panel → **Seed sample profile** (once) — includes work auth / sponsorship Yes/No.
5. Optional: Options → upload a small PDF resume/cover → **Save documents**.
6. Side panel → set **Delay (sec)** → choose **Auto Fill / Auto Ready / Auto Submit**.
7. Click **Start**. The runner opens each queued `https` URL, detects the adapter, fills (and optionally advances / submits), moves the job to applied or failed, prunes oldest submitted tabs beyond the keep window (Submit success only), waits `delayMs`, then opens the next.
8. Click **Stop** between jobs to halt (current → cancelled; remaining stay queued). **Reset mock queue** rebuilds queued from saved URLs.

If no URLs are configured, Start fails with: **Add job apply URLs in Options (Mock queue)**.

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

Hardened for `boards.greenhouse.io`, `job-boards.greenhouse.io`, and `*.greenhouse.io` apply forms.


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

With mock mode (or empty base URL), `lib/backend.js` serves the in-extension **queued** bucket built from **Options → Mock queue** URLs.

## File attach method

Browsers block setting a file path on `<input type="file">`. We store resume/cover as **base64 in `chrome.storage`**, rebuild a `File` / `Blob`, and assign via **`DataTransfer`** (`lib/files.js` → `assignFilesToInput`). Blobs may also come from the backend `getDocuments()` response.

## How to add a platform adapter

1. Pick a slug (`myats`) and category (`ats` | `board` | `agency`).
2. Add hostname patterns to `adapters/catalog.js` **or** add `adapters/<category>/<slug>.js` that calls `FillApplyRegistry.register({ id, name, detect, submitSelector, fileInputHints, fill })`.
3. For deeper ATS behavior, put an override in `adapters/ats/<slug>.js` with better `detect` / selectors; load it **after** `catalog.js` in the inject list (`runner/runner.js` + popup) so it replaces the thin entry.
4. `fill` may delegate to `FillApplyFallbackAdapter.fill(ctx)` with overrides. Honor `ctx.runMode`.
5. Reload the extension and open a matching URL → **Fill current page**; status shows `adapterId`.

### Supported platforms (catalog)

**ATS:** Greenhouse, Ashby, Lever, Workable, Workday, SmartRecruiters, iCIMS  

**Boards / aggregators:** LinkedIn, Upwork, NaukriGulf, Remote OK, We Work Remotely, Indeed, eFinancialCareers, FreeHire, Working Nomads, Jooble, Bayt, GulfTalent, Glassdoor, Wellfound, AngelList/Talent, FlexJobs, Remote.co, Remotive, Himalayas, Otta, Jobgether, Y Combinator Jobs, Built In  

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
2. Options → seed sample profile (includes `phoneCountry`, UAE location, Driving License / car / contracting `customAnswers`) → Save.
3. Paste an `https://ae.indeed.com/…` or `https://pk.indeed.com/…` (or www) job URL into Mock queue → Save.
4. Side panel → **Auto Ready** or **Auto Submit** → Start.
5. If Cloudflare / Turnstile appears: run pauses, notification fires, side panel shows **Paused — verify Cloudflare/CAPTCHA** — solve it in the tab (do not expect the extension to click it) → **Resume**.
6. Confirm steps: Apply with Indeed → contact/location/work-auth/resume/employer Qs → review; Submit only in submit mode; resume file left alone if already shown.
7. Unknown required employer question → pause with “Indeed form changed — review required”.

## Reload test (Greenhouse)

1. `chrome://extensions` → **Reload** Fill & Apply.
2. Options → paste a real `https://boards.greenhouse.io/…` (or `job-boards.greenhouse.io`) apply URL → Save → confirm Queued count ≥ 1 (no `chrome-extension:` lines).
3. Upload resume/cover → Save documents. Seed sample profile.
4. Click the toolbar icon → side panel → **Auto Fill** → Start. Confirm: text/selects filled, work-auth dropdowns leave “Select…”, resume/cover no longer “No file chosen”, job moves Queued → Applied (or Failed with an error), tab **stays open** in Fill mode, URL does not loop.
5. Optional: try **Auto Ready** (tabs stay open) / **Auto Submit** (PDF report + keep-N tab prune) on further URLs.


## Reload test (NaukriGulf Easy Apply)

1. `chrome://extensions` → **Reload** Fill & Apply (v1.8.0).
2. Confirm NaukriGulf profile is **100% complete** on naukrigulf.com (incomplete → profile redirect pause).
3. Options → seed sample profile (UAE location helps “located in UAE”) → add `customAnswers` for employed / industry questions if you use them → Save.
4. Paste a NaukriGulf job URL that shows **Easy Apply** into Mock queue → Save.
5. Side panel → **Auto Fill** or **Auto Ready** → Start. Confirm: Easy Apply opens on-page modal, Yes/No answered, **Submit & Apply** not clicked.
6. Optional: **Auto Submit** → Confirm **Submit & Apply** is clicked; unknown unmapped required question → pause with structure-drift message.
7. If modal never appears → pause asking you to open Easy Apply manually, then Resume.

## Reload test (Ashby + caps)

1. `chrome://extensions` → **Reload** Fill & Apply (v1.8.0).
2. Options → set Ashby cap to **2** (default) → Save. Seed profile + upload resume.
3. Paste a `https://jobs.ashbyhq.com/…` apply URL → Save mock queue.
4. Side panel → **Auto Fill** → Start. Confirm Application tab, fields filled, diversity skipped, no submit.
5. Optional: **Auto Submit** once; confirm history records the apply. Queue a 3rd Ashby URL after two submits → expect skip with **Source apply cap reached**.

## Branding

| Path | Contents |
|------|----------|
| `brand/` | Master assets: `icon-master.png`, `banner.png`, `favicon.ico`, and sized `icon16` / `32` / `48` / `128` / `256.png` |
| `icons/` | Extension toolbar / store icons used by `manifest.json` (`icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`, `icon256.png`) |

Side panel and Options headers use the wordmark **Fill & Apply** with tagline **Queue. Fill. Apply.** and the mint accent `#22c55e` on a dark navy / blue palette. The side panel is full-height with a sticky brand header and scrollable body (~320–360px wide).

## Development

No bundler. After edits: **Reload** on `chrome://extensions`, then paste Greenhouse apply URLs into Options → Mock queue → Start / Stop.
