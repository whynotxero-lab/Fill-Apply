# Job Application Guide & Instructions

This guide covers **Fill & Apply** behavior when submitting applications through supported ATS and job boards, with special attention to **Ashby** apply caps, **NaukriGulf** profile completeness, **Remote OK** paid access and **Easy Apply**, and how the extension rate-limits applies.

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

## NaukriGulf — profile completeness (required)

**Before** queueing NaukriGulf / Naukrigulf jobs in Fill & Apply, confirm your **NaukriGulf profile is 100% complete** on the platform (logged-in web profile).

### Why

If the profile is incomplete, NaukriGulf often **redirects to the profile completion flow** instead of opening the job / apply page. The runner then sees a profile form (not an apply form), which looks like a failed or drifted application and wastes queue slots.

### Checklist for operators

1. Sign in at NaukriGulf (e.g. `naukrigulf.com` / regional hosts).
2. Open **My Profile** and ensure completeness shows **100%** (or the platform’s “complete” state — no mandatory missing sections).
3. Typical gaps that block apply: resume upload, personal details, experience, education, key skills, preferred location.
4. Only then paste job / apply URLs into the Fill & Apply mock queue (or JobPool).

### Extension behavior

- Documented prerequisite for source **naukrigulf**.
- If the adapter detects a **profile completion redirect** (URL/path or page copy about completing profile), it should **pause** with a human notification rather than filling the profile as a job apply — do not treat profile pages as applications.
- Successful **Submit** counts still respect per-source caps (default 2, max 3).

### Related

- Adapter: `adapters/boards/naukrigulf.js` (injected like Indeed via runner / panel `INJECT_FILES`)
- Paste-library: capture a complete-profile Easy Apply path, an incomplete-profile redirect, and a modal with Yes/No screening for regression notes.

## NaukriGulf Easy Apply

NaukriGulf **Easy Apply** jobs open an **on-page popup/modal** (not necessarily a new tab), rather than a multi-page ATS wizard.

### What you see

1. Job page (e.g. Financial Controller) with an **Easy Apply** tag/button.
2. Clicking Easy Apply opens a modal such as:
   - Greeting / “Confidential Company would require below details…”
   - Screening **Yes/No** questions, for example:
     - Are you currently employed?
     - Are you currently located in UAE?
     - Do you have work experience in manufacturing industry?
   - Buttons: **Submit & Apply** | **Cancel**
3. **Prerequisite still applies:** profile must be **100% complete** or NaukriGulf redirects to profile completion (adapter pauses — see section above). Diversity surveys are **N/A** on this flow.

### Extension behavior

| Mode | Behavior |
|------|----------|
| **fill** | Click Easy Apply if needed, answer mapped Yes/No questions in the modal, **do not** click Submit & Apply |
| **ready** | Same as fill (modal left ready for human review) |
| **submit** | Same answers, then click **Submit & Apply** |

Answer mapping (scoped to the modal only):

- Fuzzy match question label → `profile.customAnswers` / `customQA`
- **Located in UAE** (or similar) → **Yes** when `profile.country` / `location` / city suggests UAE, Dubai, or United Arab Emirates
- **Currently employed** → `customAnswers` or profile employment fields when set; otherwise left blank in fill/ready
- **Work experience in … industry** → `customAnswers`; if unknown and **submit** mode → pause for human (structure drift)
- Easy Apply modal never appears → `needsHuman` pause with a clear error
- Unknown required screening question in **submit** → pause; in **fill** / **ready** leave unanswered

### Operator tips

1. Ensure NaukriGulf profile is 100% before queueing Easy Apply URLs.
2. Seed `customAnswers` for recurring screening questions (employed, industry experience, etc.).
3. Use **Auto Fill** / **Auto Ready** first to confirm the modal and answers; use **Auto Submit** only when mappings look correct.
4. Reload the extension after upgrading so `adapters/boards/naukrigulf.js` is included in the inject list.

## Remote OK — paid source

**Status:** **PAID JOB SOURCE — no free trial.**

Remote OK (`remoteok.com`) gates apply / early access behind a subscription (e.g. Single Platform ~$14.95/mo or TopAccess Bundle ~$29.95/mo, billed with commitment; marketing copy states **no free trial**).

### What Fill & Apply does today

1. Detects Remote OK job pages.
2. If **paywall** UI appears (“You’re almost there”, Subscribe to Remote OK / TopAccess, pricing cards) → **pause + notify**. Does **not** subscribe or bypass payment.
3. If **geolock** warning appears (job only accepts certain nationalities/residencies) → **pause** for human confirmation. Does **not** bypass geolocks.
4. Until a **paid unlocked** account exposes the real application form, the adapter will not pretend to complete Apply.
5. Full apply-form automation will be adapted **after** the operator has paid access and pastes the unlocked apply UI into the paste library.

### Operator checklist

1. Maintain an active Remote OK paid subscription if you want this source in Auto Submit.
2. Respect geolocks — only apply when eligible.
3. Some posts include anti-spam keywords (“Please mention the word …”) — put that word in cover letter / `customAnswers` once the form is unlocked.
4. Per-source apply caps still apply (default 2, max 3).

### Related

- Adapter: `adapters/boards/remoteok.js` (`paidSource: true`, `noFreeTrial: true`)

## Related docs

- Main project README (load unpacked, architecture, Greenhouse / Indeed notes).
- Adapter comments in `adapters/ats/ashby.js` restate Ashby’s 3/60 and 180-day rules for maintainers.
