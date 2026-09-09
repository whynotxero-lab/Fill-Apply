# Fill & Apply

Chrome / Edge **Manifest V3** extension: a **queue-driven runner** that fills job-application forms from a saved profile, with **thin ATS / board / agency adapters** and a **generic heuristic fallback**.

Vanilla HTML / CSS / JS — load unpacked, no build step.

## Load unpacked

1. Clone or download this repo.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
3. Enable **Developer mode**.
4. **Load unpacked** → select this folder (contains `manifest.json`).
5. Open **Options**: seed/edit profile, optionally upload resume/cover, confirm **Mock mode** is on.

## Architecture

```
popup/          Start / Stop, delay, auto-submit, queue status, one-off Fill
background/     Service worker — runner state machine + message API
runner/         Queue loop: next job → tab → detect adapter → fill → files → markApplied → delay
adapters/
  registry.js   register / detect
  fallback.js   label/name/autocomplete heuristics (+ file attach + optional submit)
  catalog.js    hostname index for every supported platform
  ats/          deeper stubs (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable, iCIMS)
  boards/       LinkedIn, Indeed, Wellfound, Remote OK, …
  agencies/     Michael Page, Hays, Robert Half, …
lib/
  types.js      shapes + storage keys + message constants
  storage.js    run config, running flag, session log, documents
  profile.js    applicant profile
  field-map.js  field heuristics
  files.js      base64 ↔ File + DataTransfer assign to input[type=file]
  backend.js    getNextJob / markApplied / getDocuments (+ mock queue)
content/fill.js fill engine used by fallback
demo/           sample application form (mock queue target)
```

**Boards often redirect into an ATS host at apply time.** Detection runs on the apply URL, so a LinkedIn Easy Apply or “Apply on company site” flow that lands on `boards.greenhouse.io` is handled by the Greenhouse adapter (not the LinkedIn stub).

## Start / Stop with the mock queue

1. Options → enable **Mock mode** (default) → **Save runner config**.
2. Popup → **Seed sample profile** (once).
3. Optional: Options → upload a small PDF resume/cover → **Save documents**.
4. Popup → set **Delay (sec)** (e.g. `2`) → leave **Auto-submit** off for a dry run.
5. Click **Start**. The runner opens `demo/sample-application.html` for each mock job, detects the **fallback** adapter, fills fields, attaches files when inputs exist, then `markApplied` and waits `delayMs`.
6. Click **Stop** between jobs to halt. **Reset mock queue** restores three demo jobs.

Manual one-off: open the demo page → **Fill current page**.

## Backend contract (live mode)

Set **Backend base URL** and turn **Mock mode** off.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/queue` | List jobs `{ id, title, company, url, ats? }[]` |
| GET | `/queue/next` | Next job or empty |
| POST | `/applied/:id` | Body: fill result / submitted flags |
| GET | `/profile` | Optional remote profile |
| GET | `/documents` | `{ resume, cover }` each `{ name, mime, base64 }` or URL |

With mock mode (or empty base URL), `lib/backend.js` serves an in-extension demo queue.

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
| `storage` | Profile, run config, documents, session log |
| `tabs` / `scripting` | Runner opens job URLs and injects adapters |
| `activeTab` | One-off fill from the popup |
| `alarms` | Reserved for durable delays |
| host_permissions | Inject into http(s) / file job pages |

## Notes

- Heuristics will not cover every form; extend field-map or add adapter overrides.
- Password fields are skipped.
- Review every application before submitting. Do not misrepresent yourself.
- Auto-submit is off by default for safety.

## Development

No bundler. After edits: **Reload** on `chrome://extensions`, then re-test mock **Start** / **Stop**.
