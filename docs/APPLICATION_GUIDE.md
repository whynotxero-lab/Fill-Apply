# Job Application Guide & Instructions

This guide covers **Fill & Apply** behavior when submitting applications through supported ATS and job boards, with special attention to **Ashby** employer-published limits and how the extension rate-limits applies.

## Ashby published limits

Ashby (employer ATS) documents candidate apply restrictions roughly as follows:

- Candidates **may not apply more than 3 times in 60 days** for any job (across Ashby-hosted roles).
- Candidates **may not re-apply to the same role within 180 days** without an offer.

Fill & Apply treats these as hard operational constraints. Violating them can get applications rejected or accounts throttled by the employer platform — the extension will not try to bypass them.

## How Fill & Apply enforces caps

| Rule | Behavior |
|------|----------|
| **Hard max selectable** | **3** applications per source in the rolling window (UI clamps 1–3). |
| **Default per source** | **2** (including Ashby, Indeed, Greenhouse, Lever, and `default` for others). |
| **Rolling window** | **60 days** for Ashby and other sources (unless you change config later). |
| **Ashby same-role soft block** | Same normalized job URL submitted within **180 days** → job skipped with a clear message. |
| **Counted events** | Successful **Submit** mode applies where `submitted=true` only. Fill / Ready do **not** count. |
| **When over cap** | Job is **not** opened or submitted. It moves to **cancelled** with reason like `Source apply cap reached (N/max for ashby)`, and you get a notification. |

Tracked history entries look like:

```json
{ "sourceId": "ashby", "jobUrl": "https://jobs.ashbyhq.com/…", "jobId": "job-…", "submittedAt": 1710000000000 }
```

Stored under `chrome.storage.local` key `fillApply.applyHistory`.

## Configure in Options

1. Open **Options** (side panel → **Open options**, or right-click the extension icon → **Options**).
2. Under **Per-source application caps**, set **Ashby / Indeed / Greenhouse / Lever / Default** to **1**, **2**, or **3**.
3. Values above 3 are rejected by the UI and storage normalizer.
4. Click **Save runner config**.
5. The side panel mirrors the same inputs (changes auto-save).

**Ashby note in the UI:** *Ashby allows at most 3 apps / 60 days; we default to 2.*

## Ashby adapter behavior

Hosts: `jobs.ashbyhq.com`, `ashbyhq.com`, `*.ashbyhq.com`.

1. Detect **Overview** vs **Application** view.
2. Click **Application** tab or **Apply for this Job** when needed.
3. Fill **Basic Info**: Name, Email, Resume (DataTransfer upload), LinkedIn.
4. Fill **“Which country do you intend to work from?”** (city/country autocomplete) from profile location.
5. Answer **sponsorship** Yes/No from `profile.requiresSponsorship`.
6. **Role-specific** long text: filled from `customAnswers` / `coverLetter` heuristics when mapped; otherwise left blank in **fill** / **ready**, or pause for human in **submit** if required and empty.
7. **Diversity Survey**: optional — **skipped / Prefer not to answer by default**. The extension does **not** invent demographics.
8. Modes: **fill** = fields only; **ready** = fill, no submit; **submit** = click **Submit Application**.
9. Cloudflare / structure drift → existing `challenges.js` human pause.

## Diversity surveys

Across adapters (including Ashby), demographic / EEO / diversity questions are **optional by default**:

- Prefer **Prefer not to answer** / **Decline to self-identify** when that option exists.
- Otherwise leave blank.
- **Never** fabricate race, gender, veteran, or disability answers.

## Modes reminder

| Mode | Counts toward source cap? |
|------|---------------------------|
| Auto Fill | No |
| Auto Ready | No |
| Auto Submit (successful submit) | **Yes** |

## Related docs

- Main project README (load unpacked, architecture, Greenhouse / Indeed notes).
- Adapter comments in `adapters/ats/ashby.js` restate Ashby’s 3/60 and 180-day rules for maintainers.
