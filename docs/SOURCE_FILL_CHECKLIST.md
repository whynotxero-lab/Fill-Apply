# Source fill & JobPool checklist

Honest confirmation of what Fill & Apply can do with the sources already documented, what a **new** application can fill from the user profile, and how the runner reports status back to a **JobPool** website.

This is **not** a claim that every documented source can be filled unattended. Captcha, sign-in, paywalls, and blank required answers still pause the run.

**Related:** [SOURCES_AND_FIELDS.md](SOURCES_AND_FIELDS.md) · [APPLICATION_GUIDE.md](APPLICATION_GUIDE.md) · [FILL_ENGINE.md](FILL_ENGINE.md) · [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md)

---

## Legend

| Mark | Meaning |
|------|---------|
| **Unattended** | Documented fields fill once the form is open. Still pauses on captcha, missing required answers, or EEO. |
| **After gate** | A human must sign in, complete a platform profile, or pass captcha first. After that, documented fields fill. |
| **Handoff** | Discovery board clicks Apply, then the adapter re-detects on the employer ATS. |
| **Generic** | Host detect + generic fallback. Fields already on the profile fill; unknown employer questions pause if required and blank. |
| **Blocked** | Will not pretend to apply (paywall / subscribe). |

**Policy everywhere:** never invent answers; empty required → pause / missing-fields popup; EEO / diversity skip; never click Upgrade / Auto-Apply / Subscribe; never invent passwords.

---

## 1. Start → fill → continue → submit

The runner can start an application, fill it, continue multi-step wizards, and submit — depending on **run mode**. Apply-start (opening the form) is allowed in every mode; opening is not submit.

| Mode | Start (open form) | Fill mapped fields + attach docs | Next / Continue | Final Submit / Apply |
|------|-------------------|----------------------------------|-----------------|----------------------|
| **Auto Fill** (`fill`) | Yes | Yes | No | No |
| **Auto Ready** (`ready`) | Yes | Yes | Yes | No |
| **Auto Submit** (`submit`) | Yes | Yes | Yes | Yes, when a confident Submit CTA is found |

A new application that asks for fields **already on the user profile** is filled by the generic engine (`lib/field-map.js` + `customAnswers` / `customQA`). Reworded labels still match. Required + blank → pause. Consent / EEO are never filled.

Local queue bucket `applied` means **processed for the current mode**, not “submitted to the employer.” JobPool must read `status` (see §4).

---

## 2. Documented sources

### Strong documented fill (once the form is open)

| Source | Confidence | Start / fill / continue / submit | Notes |
|--------|------------|----------------------------------|-------|
| **Teamtailor** (Noon / white-label) | Unattended | Yes in the matching run mode | Contact, YoE buckets (`15` → `10+`), notice (`Onspot`), nationality, resume/cover. **Pauses** if current salary / largest team size / cert / tools rating are required and blank. |
| **Indeed** (incl. locale hosts) | Unattended after Apply click | Yes — multi-step Continue in ready/submit | Contact, location, work auth, resume, employer Qs via profile / customAnswers. **Pauses** on driving licence / own car / salary if required and blank; Cloudflare / structure drift → human. |
| **Glassdoor Easy Apply** | Unattended (Indeed-backed) | Yes | Contact → location → resume → review. **Pauses** on missing postcode / reCAPTCHA. Footer “Indeed, Inc.” alone is not the wizard. |
| **Greenhouse** (GitLab / Figma pastes, WN handoff) | Unattended | Yes | Resume/cover attach, location, sponsorship, why-join, selects. Team-interest radios need customAnswers. EEO skip. |
| **Ashby** | Unattended (baseline + fallback) | Yes | Contact + resume + cover + work auth. Per-source **apply caps** (default 2, max 3). Diversity skip. |
| **CATS** (`catsone.com`, often via WWR) | Unattended on documented fields | Yes | Resume, contact, LinkedIn, EST timezone (default Yes if unset). Expected pay optional. |

### After a human gate

| Source | Confidence | Start / fill / continue / submit | Gate |
|--------|------------|----------------------------------|------|
| **LinkedIn Easy Apply** | After gate | Yes once signed in | Must be signed in. Never Premium / Tailor my resume. DOB / salary pause if required and blank. |
| **LinkedIn External → iCIMS** | Handoff + After gate | Yes after host change | Share-profile Off → employer Apply Now → iCIMS. |
| **iCIMS** (PepsiCo / Riyadh Air) | After gate | Yes after auth | hCaptcha + Create login / Returning Candidate / password are **manual**. SSO without Password Re-enter = authenticated. |
| **eFinancialCareers** | After gate + Handoff | fill = modal only; ready/submit clicks modal Apply | Sign in / Register first. Modal Apply hands off to employer careers. |
| **NaukriGulf** | After gate | Yes (Easy Apply modal) | Platform profile must be **100% complete** or redirect → pause. Submit & Apply only in submit mode. |
| **Recruitee → Indeed** | Handoff + After gate | Yes via Indeed | Prefers Apply with Indeed. Cloudflare possible. |
| **Swooped** (often Jooble →) | After gate | Yes after Needs Input | Prefer **Apply manually** — never product Auto Apply / Upgrade. Salary/OTE pause if blank. |

### Discovery boards (handoff, then re-detect)

| Source | Confidence | What the runner does |
|--------|------------|----------------------|
| **Jooble → Swooped** | Handoff | Click Apply → host change → Swooped adapter. |
| **Working Nomads → Greenhouse** | Handoff | Click Apply → Greenhouse URL → Greenhouse adapter. Prefer queueing the final Greenhouse URL when known. |
| **We Work Remotely → CATS** | Handoff / Blocked | Apply Now often opens CATS. **Do not subscribe.** Treat WWR itself as blocked until unlocked. |
| **eFC / LinkedIn External** | Handoff | Covered above. |

### Thin / generic (catalog host + fallback)

These have a host adapter or catalog detect, then the **same generic engine** as an unknown site. Contact, resume, cover, work auth, and any other control that maps to a filled profile key are filled. Employer-specific questions pause if required and not in the profile.

| Source | Confidence |
|--------|------------|
| **Lever** | Generic (thin ATS) |
| **Workday / Workable / SmartRecruiters** | Generic (baseline ATS fields) |
| **Bayt, GulfTalent** | Generic |
| **Upwork, FreeHire, Wellfound / AngelList, FlexJobs, Remote.co, Remotive, Himalayas, Otta, Jobgether, Y Combinator Jobs, Built In** | Generic |
| **Agencies** (Michael Page, Hays, Robert Half, Cooper Fitch, Charterhouse, Robert Walters, Jivaro Partners, LHH) | Generic |

### Will not pretend to apply

| Source | Confidence | Why |
|--------|------------|-----|
| **Remote OK** | Blocked | Paid, no free trial. Pause on subscribe / paywall / geolock. |
| **We Work Remotely** (until unlocked) | Blocked | Paid + full platform profile. Never click Upgrade. External ATS after unlock is CATS (above). |

---

## 3. New / unknown application URLs

When JobPool (or the local queue) sends an apply URL the catalog has never seen:

1. Open the URL and **start** the application if an Apply CTA is visible.
2. Score the form (`scoreApplicationForm`) — including iframes and shadow DOM.
3. Map each control from label / name / id / question text to a profile key or `customAnswers`.
4. **Fill** every control whose mapped key is already on the user profile (text, select, radio, checkbox, date, buckets, education levels, demonyms, phone/postal shaping, preloaded resume/cover).
5. **Continue** (ready / submit) through Next / Continue.
6. **Submit** only in submit mode when a confident final CTA is found.
7. Pause if a **required** control has no stored answer. Never invent. Never fill EEO.

So: **yes** — if a new application asks for fields already in the user profile, the app can start, fill, continue, and submit.

---

## 4. JobPool website contract

JobPool owns the master application list. Fill & Apply pulls apply URLs into the **Application Queue**, runs them, and POSTs the outcome back so JobPool can change status there.

### Live mode

App Settings → **Backend / runner**: set **Backend base URL** to the JobPool origin, **uncheck Queue mode**.

| Method | Path | When | Body / response |
|--------|------|------|-----------------|
| GET | `/queue` | List | `{ jobs: [{ id, title, company, url, source?, sourceId?, ats? }] }` or a bare array |
| GET | `/queue/next` | Next reserved job | `{ id, url, … }` or `{ job: {…} }` or empty |
| POST | `/applied/:id` | After every finished run (fill / ready / submit / fail) | See payload below |
| POST | `/cancelled/:id` | Stop, or skip for apply-cap | `{ job, jobId, reason, status: "cancelled", outcome: "cancelled", cancelled: true, ok: false }`. If this path is missing, the extension falls back to `POST /applied/:id` with the same cancelled body. |
| GET | `/profile` | Optional | Remote profile |
| GET | `/documents` | Optional | `{ resume, cover }` each `{ name, mime, base64 }` |

Mock / queue mode (default) still uses the **Application queue** URL list in App Settings. The same `status` is stored on the local job as `jobPoolStatus`. Local bucket `applied` still means “processed for this mode.”

### POST `/applied/:id` payload

```json
{
  "jobId": "job-…",
  "url": "https://boards.greenhouse.io/…/jobs/…",
  "runMode": "submit",
  "submitted": true,
  "advanced": true,
  "resumeAttached": true,
  "coverAttached": false,
  "fillResult": { "ok": true, "filled": 12, "submitted": true, "adapterId": "greenhouse" },
  "status": "submitted",
  "outcome": "submitted",
  "reportSummary": {},
  "pdfBase64": null
}
```

`status` and `outcome` are the same value from `FillApplyTypes.jobPoolOutcome`.

### Status JobPool should persist

| `status` | Meaning | Recommended JobPool state |
|----------|---------|---------------------------|
| **`submitted`** | Final Submit/Apply was clicked and accepted | **Applied / Submitted** |
| `ready` | Filled and continued; no final submit | In progress / Ready for human submit |
| `filled` | Fields filled; no Continue / Submit | In progress / Draft filled |
| `processed` | Run succeeded for the mode but no field count | Processed (not Applied) |
| `failed` | Error / inject failure / critical miss | Failed |
| `cancelled` | User Stop or source apply cap | Cancelled / withdrawn from queue |

**Only `status === "submitted"` means the application was actually sent to the employer.** Do not flip JobPool to Applied because the local extension bucket is named `applied`, or because `runMode` was `submit` but `submitted` is false (the run may have paused or only filled).

### Suggested JobPool flow

1. JobPool publishes apply URLs on `GET /queue` (and/or `GET /queue/next`).
2. Operator starts Fill & Apply in the desired run mode (`fill` / `ready` / `submit`).
3. Extension opens each URL, starts the form, fills from the profile, continues, and optionally submits.
4. Extension POSTs `/applied/:id` (or `/cancelled/:id`).
5. JobPool updates that application's status from `status`.
6. Human gates (captcha, sign-in) stay in the extension until Resume; JobPool is not posted until the run finishes or is cancelled.

---

## 5. Operator preflight (before a confident batch)

Tick these before claiming a source will go through.

### Always

- [ ] Active profile has first / last / email / phone
- [ ] Resume (and cover letter if the source requires it) is preloaded under Documents
- [ ] Run mode matches intent: **fill** = fill only; **ready** = fill + Continue; **submit** = fill + Continue + Submit
- [ ] No selected source-profile Start gate is blocking (empty compulsory answers)
- [ ] JobPool live: Queue mode **off**, Backend base URL set; **or** mock: apply URLs pasted in Application queue

### Fill every control the form already knows how to ask

- [ ] Years of experience stored as a number (`15` → `10+`)
- [ ] Highest education stored as a level (`Master's Degree`)
- [ ] School / degree / field / graduation year (not only a paragraph)
- [ ] Nationality (country or demonym)
- [ ] Work auth + sponsorship
- [ ] Notice period / availability
- [ ] LinkedIn URL if the source marks it required (CATS, Greenhouse, Swooped)

### Deliberately blank on Zahid General — will pause if the form requires them

- [ ] Current salary / expected salary / Swooped OTE — still blank unless the operator types them
- [ ] Date of birth (LinkedIn Easy pastes)
- [ ] Driving licence / own car (Indeed employer Qs)
- [ ] Largest team size / educational certificate / tools rating (Teamtailor Noon)
- [ ] Postcode / street (Indeed / Glassdoor location)

### Human gates (do not expect unattended)

- [ ] LinkedIn / eFinancialCareers / NaukriGulf signed in; NaukriGulf profile 100%
- [ ] iCIMS login / SSO already done; expect hCaptcha pause
- [ ] Recruitee / dashboard Cloudflare: be ready to Resume
- [ ] Remote OK / WWR unlocked only if actually paid — otherwise they stay blocked

---

## 6. Confidence summary

| Question | Answer |
|----------|--------|
| Can the app fill **documented fields** on sources already shared? | **Yes**, once the form is reachable — Unattended / After gate / Handoff / Generic as in §2. Not every source is unattended. |
| Can a **new** application be filled if it asks for fields already on the profile? | **Yes.** Generic fallback + field map + customAnswers. Required blanks pause. |
| Can it **start → fill & continue → submit**? | **Yes**, via run modes. Apply-start in all modes; Continue in ready/submit; Submit only in submit. |
| When JobPool sends URLs and an application is actually submitted, does the app POST back? | **Yes.** `POST {backend}/applied/:id` with `status: "submitted"`. Stop / cap → `POST /cancelled/:id`. JobPool must treat only `submitted` as Applied. |
