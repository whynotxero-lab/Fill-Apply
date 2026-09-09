# Fill & Apply

Chrome / Edge **Manifest V3** extension: a **queue-driven runner** that fills job-application forms from a saved profile, with **thin ATS / board / agency adapters** and a **generic heuristic fallback**.

Vanilla HTML / CSS / JS — load unpacked, no build step.

## Load unpacked

1. Clone or download this repo.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
3. Enable **Developer mode**.
4. **Load unpacked** → select this folder (contains `manifest.json`).
5. Open **Options**: seed/edit profile, paste **Mock queue** apply URLs, optionally upload resume/cover.

## Architecture

```
popup/          Start / Stop, delay, auto-submit, auto-close tab, queue status, one-off Fill
background/     Service worker — runner state machine + message API
runner/         Queue loop: next job → tab → detect adapter → fill → files → markApplied → close tab? → delay
adapters/
  registry.js   register / detect
  fallback.js   label/name/autocomplete heuristics (+ file attach + optional submit)
  catalog.js    hostname index for every supported platform
  ats/          deeper stubs (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable, iCIMS)
  boards/       LinkedIn, Indeed, Wellfound, Remote OK, …
  agencies/     Michael Page, Hays, Robert Half, …
lib/
  types.js      shapes + storage keys + message constants
  storage.js    run config, running flag, session log, documents, mock URL list
  profile.js    applicant profile
  field-map.js  field heuristics
  files.js      base64 ↔ File + DataTransfer assign to input[type=file]
  backend.js    getNextJob / markApplied / getDocuments (+ mock queue from saved URLs)
content/fill.js fill engine used by fallback
demo/           sample application form (manual testing only — not used by Start)
```

**Boards often redirect into an ATS host at apply time.** Detection runs on the apply URL, so a LinkedIn Easy Apply or “Apply on company site” flow that lands on `boards.greenhouse.io` is handled by the Greenhouse adapter (not the LinkedIn stub).

## Start / Stop with real apply URLs (mock queue)

The runner **never** opens `chrome-extension://…/demo/…` (executeScript cannot inject into extension pages). Mock mode uses **your** https job/apply URLs.

1. Options → enable **Mock mode** (default) → paste one apply URL per line under **Mock queue** (e.g. Greenhouse `https://boards.greenhouse.io/…/jobs/…`) → **Save mock URLs & rebuild queue**.
2. Confirm **Auto-close applied tab** is ON (default) if you want each finished job tab closed before the next opens.
3. Popup → **Seed sample profile** (once).
4. Optional: Options → upload a small PDF resume/cover → **Save documents**.
5. Popup → set **Delay (sec)** (e.g. `2`) → leave **Auto-submit** off for a dry run → leave **Auto-close applied tab** ON (or turn OFF to keep tabs).
6. Click **Start**. The runner opens each **real** `job.url`, detects the adapter (Greenhouse on `boards.greenhouse.io` / `greenhouse.io`), fills, `markApplied`, optionally **closes that tab**, waits `delayMs`, then opens the next.
7. Click **Stop** between jobs to halt. **Reset mock queue** rebuilds from the saved URL list (not a demo page).

If no URLs are configured, Start fails with: **Add job apply URLs in Options (Mock queue)**.

### Manual demo form (optional)

`demo/sample-application.html` is for **manual** testing only. Open it via Live Server or `file://`, then use **Fill current page**. Do not rely on it as a Start queue target.

## Backend contract (live mode)

Set **Backend base URL** and turn **Mock mode** off.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/queue` | List jobs `{ id, title, company, url, ats? }[]` |
| GET | `/queue/next` | Next job or empty |
| POST | `/applied/:id` | Body: fill result / submitted flags |
| GET | `/profile` | Optional remote profile |
| GET | `/documents` | `{ resume, cover }` each `{ name, mime, base64 }` or URL |

With mock mode (or empty base URL), `lib/backend.js` serves the in-extension queue built from **Options → Mock queue** URLs.

## File attach method

Browsers block setting a file path on `<input type="file">`. We store resume/cover as **base64 in `chrome.storage`**, rebuild a `File` / `Blob`, and assign via **`DataTransfer`** (`lib/files.js` → `assignFilesToInput`). Blobs may also come from the backend `getDocuments()` response.

## How to add a platform adapter

1. Pick a slug (`myats`) and category (`ats` | `board` | `agency`).
2. Add hostname patterns to `adapters/catalog.js` **or** add `adapters/<category>/<slug>.js` that calls `FillApplyRegistry.register({ id, name, detect, submitSelector, fileInputHints, fill })`.
3. For deeper ATS behavior, put an override in `adapters/ats/<slug>.js` with better `detect` / selectors; load it **after** `catalog.js` in the inject list (`runner/runner.js` + popup) so it replaces the thin entry.
4. `fill` may delegate to `FillApplyFallbackAdapter.fill(ctx)` with overrides.
5. Reload the extension and open a matching URL → **Fill current page**; status shows `adapterId`.

### Supported platforms (catalog)

**ATS:** Greenhouse, Ashby, Lever, Workable, Workday, SmartRecruiters, iCIMS  

**Boards / aggregators:** LinkedIn, Upwork, NaukriGulf, Remote OK, We Work Remotely, Indeed, eFinancialCareers, FreeHire, Working Nomads, Jooble, Bayt, GulfTalent, Glassdoor, Wellfound, AngelList/Talent, FlexJobs, Remote.co, Remotive, Himalayas, Otta, Jobgether, Y Combinator Jobs, Built In  

**Agencies:** Michael Page, Hays, Robert Half, Cooper Fitch, Charterhouse, Robert Walters, Jivaro Partners, LHH  

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Profile, run config, documents, session log, mock URLs |
| `tabs` / `scripting` | Runner opens job URLs and injects adapters |
| `activeTab` | One-off fill from the popup |
| `alarms` | Reserved for durable delays |
| host_permissions | Inject into http(s) / file job pages |

## Notes

- Heuristics will not cover every form; extend field-map or add adapter overrides.
- Password fields are skipped.
- Review every application before submitting. Do not misrepresent yourself.
- Auto-submit is off by default for safety.
- **Auto-close applied tab** defaults ON so only the active job tab stays open while the queue runs.

## Development

No bundler. After edits: **Reload** on `chrome://extensions`, then paste 2 Greenhouse apply URLs into Options → Mock queue → Start / Stop.
