# Fill & Apply

Chrome / Edge **Manifest V3** extension: a **queue-driven runner** that fills job-application forms from a saved profile, with **thin ATS / board / agency adapters** and a **generic heuristic fallback**.

Vanilla HTML / CSS / JS — load unpacked, no build step.

**Version 1.3.1** — run modes (fill / ready / submit), structured queue buckets, form inspection, hardened Greenhouse file + dropdown fill.

## Load unpacked

1. Clone or download this repo.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
3. Enable **Developer mode**.
4. **Load unpacked** → select this folder (contains `manifest.json`).
5. Open **Options**: seed/edit profile, paste **Mock queue** apply URLs, optionally upload resume/cover.

## Architecture

```
popup/          Start / Stop, delay, run mode, auto-close tab, bucket counts, one-off Fill
background/     Service worker — runner state machine + message API
runner/         Queue loop: next queued job → tab → detect → fill → applied/failed → close? → delay
adapters/
  registry.js   register / detect
  fallback.js   heuristics + file attach + mode-aware Next/Submit
  catalog.js    hostname index for every supported platform
  ats/          Greenhouse (hardened), Lever, Ashby, Workday, SmartRecruiters, Workable, iCIMS
  boards/       LinkedIn, Indeed, Wellfound, Remote OK, …
  agencies/     Michael Page, Hays, Robert Half, …
lib/
  types.js      shapes + storage keys + message constants + runMode
  storage.js    run config, buckets, documents, mock URL list
  profile.js    applicant profile (incl. authorizedToWork / requiresSponsorship)
  field-map.js  field heuristics
  files.js      base64 ↔ File + DataTransfer; Attach/Upload button discovery
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

Popup shows counts: **Queued / Applied / Failed / Cancelled**.

## Start / Stop with real apply URLs

The runner **never** opens `chrome-extension://…/demo/…` (executeScript cannot inject into extension pages). Demo URLs can **never** enter the mock queue.

1. Options → enable **Mock mode** (default) → paste one apply URL per line under **Mock queue** (e.g. Greenhouse `https://boards.greenhouse.io/…/jobs/…`) → **Save mock URLs & rebuild queued**.
2. Confirm **Auto-close applied tab** is ON (default) if you want each finished job tab closed after the status move.
3. Popup → **Seed sample profile** (once) — includes work auth / sponsorship Yes/No.
4. Optional: Options → upload a small PDF resume/cover → **Save documents**.
5. Popup → set **Delay (sec)** → choose **Auto Fill / Auto Ready / Auto Submit**.
6. Click **Start**. The runner opens each queued `https` URL, detects the adapter, fills (and optionally advances / submits), moves the job to applied or failed, optionally closes the tab, waits `delayMs`, then opens the next.
7. Click **Stop** between jobs to halt (current → cancelled; remaining stay queued). **Reset mock queue** rebuilds queued from saved URLs.

If no URLs are configured, Start fails with: **Add job apply URLs in Options (Mock queue)**.

### Manual demo form (optional)

`demo/sample-application.html` is for **manual** testing only. Open it via Live Server or `file://`, then use **Fill current page**. Do **not** paste it into the mock queue.

## Greenhouse / file uploads

Greenhouse “Attach” is often a visible button + hidden `input[type=file]`, or a dropzone.

- Find file inputs (including **hidden**) near Resume / CV / Cover Letter labels.
- Find buttons/links with text Attach / Upload / Resume / CV.
- Prefer assigning a `DataTransfer` to the underlying file input; if only a button is visible, click to reveal then assign.
- Match resume vs cover by label / accept / name.
- Fill result reports `resumeAttached` / `coverAttached` booleans.

Hardened for `boards.greenhouse.io`, `job-boards.greenhouse.io`, and `*.greenhouse.io` apply forms.

## Form inspection

Before filling, `inspectForm(document)` catalogs inputs, textareas, select options, contenteditables, file inputs, Attach buttons, and custom dropdown triggers. A summary (`field count by type`) is returned in the fill result and used to drive select / listbox matching (fuzzy Yes/No, country lists, etc.).

## Backend contract (live mode)

Set **Backend base URL** and turn **Mock mode** off.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/queue` | List jobs `{ id, title, company, url, ats? }[]` |
| GET | `/queue/next` | Next job or empty |
| POST | `/applied/:id` | Body: fill result / submitted / runMode flags |
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
| `activeTab` | One-off fill from the popup |
| `alarms` | Reserved for durable delays |
| host_permissions | Inject into http(s) / file job pages |

## Notes

- Heuristics will not cover every form; extend field-map or add adapter overrides.
- Password fields are skipped.
- Review every application before submitting. Do not misrepresent yourself.
- **Auto Fill** is the default mode for safety.
- **Auto-close applied tab** defaults ON; tabs close only **after** the job is moved to applied/failed so failure info is captured.
- Paste **real https apply URLs**; the demo page is manual-only and can never enter the mock queue.

## Reload test (Greenhouse)

1. `chrome://extensions` → **Reload** Fill & Apply.
2. Options → paste a real `https://boards.greenhouse.io/…` (or `job-boards.greenhouse.io`) apply URL → Save → confirm Queued count ≥ 1 (no `chrome-extension:` lines).
3. Upload resume/cover → Save documents. Seed sample profile.
4. Popup → **Auto Fill** → Start. Confirm: text/selects filled, work-auth dropdowns leave “Select…”, resume/cover no longer “No file chosen”, job moves Queued → Applied (or Failed with an error), tab closes if auto-close ON, URL does not loop.
5. Optional: try **Auto Ready** / **Auto Submit** on a second URL.


## Branding

| Path | Contents |
|------|----------|
| `brand/` | Master assets: `icon-master.png`, `banner.png`, `favicon.ico`, and sized `icon16` / `32` / `48` / `128` / `256.png` |
| `icons/` | Extension toolbar / store icons used by `manifest.json` (`icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`, `icon256.png`) |

Popup and Options headers use the wordmark **Fill & Apply** with tagline **Queue. Fill. Apply.** and the mint accent `#22c55e` on a dark navy / blue palette.

## Development

No bundler. After edits: **Reload** on `chrome://extensions`, then paste Greenhouse apply URLs into Options → Mock queue → Start / Stop.
