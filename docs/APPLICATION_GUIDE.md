# Job Application Guide & Instructions

This guide covers **Fill & Apply** behavior when submitting applications through supported ATS and job boards, with special attention to **multi-profile** Options, **Ashby** apply caps, **NaukriGulf** profile completeness, **Remote OK** / **We Work Remotely** paid access, **Working Nomads → Greenhouse** handoff, **Jooble → Swooped** assisted-apply handoff, **CATS** external apply forms, and how the extension rate-limits applies.

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

## Multi-profile (Options)

Fill & Apply supports **multiple applicant profiles** (v1.9+):

1. Open **Options** → **Profiles** (top of the page).
2. Use **New profile** / **Rename** / **Duplicate** / **Delete** / **Set active**, or pick a name from the dropdown (sets active).
3. Edit Identity / Location / Links / Q&A and click **Save profile** — writes the **active** profile only.
4. The runner and side panel always use the active profile (`getProfile()`).
5. Data is stored in `chrome.storage.local` keys `fillApply.profiles` and `fillApply.activeProfileId` so it **survives extension updates**. A legacy single profile migrates into **"Default"** when the multi store is empty.
6. **Documents** (resume/cover) are **shared across profiles for now**. Export of profiles is TBD.

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

## We Work Remotely — paid source

**Status:** **PAID JOB SOURCE** (like Remote OK) + **full profile prerequisite**.

We Work Remotely (`weworkremotely.com`) expects:

1. A **complete WWR profile** before reliable job/apply access (**paid WWR access + full profile still required to browse**).
2. A **paid plan** for full access (operator paste showed checkout ~**$2.95 first month**, then **$14.95/month**, **12-month commitment** — discounted intro, still paid; not a free apply unlock).
3. **Apply itself may be off-platform:** **Apply now** / **Apply for this job** often opens **another website** for the real application (example: UTTR careers page **Powered by CATS** on `catsone.com`).

### What Fill & Apply does today

1. Detects WWR hosts.
2. If **profile incomplete / onboarding** → **pause + notify** (finish profile on WWR, then Resume).
3. If **paywall / checkout** (“Get Full Access…”, Step 3 of 3, Payment Method, $14.95 / $2.95) → **pause**. Does **not** enter card details or complete purchase.
4. On a job page, clicks **Apply now** / **Apply for this job** only — **never** WWR **AI Auto-Apply** / **Auto-Apply with AI**.
5. When Apply navigates to a **different host**, returns an external handoff (`externalApply` / `deferToPageAdapter` / `handedOff`). The **runner waits for load and re-injects** so `registry.detect` can pick the destination ATS (e.g. **CATS**) and call its `fill`.
6. Until paid access unlocks browsing, the adapter will not fake Submit on WWR itself.

### Operator checklist

1. Complete WWR profile 100%.
2. Subscribe only if you choose to pay for discovery / browse access.
3. Respect per-source caps (default 2, max 3).
4. Expect many applies to finish on the **external ATS** page after Apply now.
5. Do **not** use WWR’s AI Auto-Apply feature with this runner.

### Related

- Adapter: `adapters/boards/weworkremotely.js` (`paidSource`, `requiresCompleteProfile`, external Apply handoff)
- Destination example: [CATS (catsone.com)](#cats-catsonecom--ats)
- Similar pattern: [Remote OK — paid source](#remote-ok--paid-source)

## CATS (catsone.com) — ATS

**Status:** Thin→useful ATS adapter. Often reached via **We Work Remotely** (and other boards) when **Apply now** opens a company careers page with footer **Powered by CATS**.

### Detection

- Hosts: `catsone.com`, `*.catsone.com`
- Content: “Powered by CATS” (and CATS-branded apply chrome)

### Real application form fields (operator paste)

| Field | Required | Profile / source |
|-------|----------|------------------|
| Upload Resume (file / drop / paste / browse) | * | `documents.resume` via DataTransfer |
| First Name | * | `profile.firstName` |
| Last Name | * | `profile.lastName` |
| Email | * | `profile.email` |
| City | * | `profile.city` |
| Country | * | `profile.country` |
| Phone | * | `profile.phone` (+ `phoneCountry` when useful) |
| LinkedIn Profile | * | `profile.linkedin` |
| Portfolio | optional | `profile.portfolio` or `profile.website` |
| Expected Pay Rate | optional | `customAnswers` keys matching pay rate / salary |
| Are you willing and available to work within the EST timezone? (Yes/No) | * | `customAnswers` (EST / timezone); default **Yes** if unset |
| Submit Application | — | Clicked only in **submit** mode |

Footer marker: **Powered by CATS**.

### Modes

- **fill** / **ready**: fill fields + resume; do **not** click Submit Application.
- **submit**: fill then click **Submit Application**.

### Notes

- Prefer company **Application** tab / **Apply Now** on the CATS page (not board AI Auto-Apply).
- Paste additional live DOM selectors later for further hardening if CATS markup drifts.
- Adapter: `adapters/ats/cats.js` (registered in catalog + runner / panel inject lists).

## Greenhouse — hardened ATS

**Status:** Hardened ATS adapter (`adapters/ats/greenhouse.js`). Hosts: `boards.greenhouse.io`, `job-boards.greenhouse.io`, `*.greenhouse.io`. Often reached via **Working Nomads** (and other boards) when **Apply** opens an external Greenhouse URL.

### Paste-library examples

#### 1) GitLab — Manager, Strategic Finance (classic Greenhouse)

- Classic GH fields + many **required Selects**: country of residence, sponsorship, prior GitLab employment, US-based, employment agreements, etc.
- **Resume/CV\*** + **Cover** (Attach / DataTransfer), LinkedIn, **preferred name**, accessibility text (from `customAnswers` only — never invent).
- **Skip voluntary EEO** / diversity (Prefer not to answer).

#### 2) Figma — Strategic Finance (Greenhouse embed)

- Autofill optional (dismiss / ignore).
- First / Last / Email / Phone Country / Phone / **Location City\***.
- **Resume\***, LinkedIn, Other Website.
- **Why join Figma\*** — 3–4 sentences from `coverLetter` or `customAnswers` keyed by question snippet.
- Work-from city/state\*, preferred first name, **authorized to work\***, **worked at Figma before\***.
- Team interest radios (Corporate / GTM / Growth) via `customAnswers`; if required and unmapped in **submit** → pause.
- **Submit application**. Skip EEO.

### What Fill & Apply fills

| Area | Behavior |
|------|----------|
| Resume/CV + Cover | DataTransfer on `#resume` / `#cover_letter` / name hints + Attach buttons |
| Preferred name | `preferredName` / `preferredFirstName` or `firstName` |
| Location | City, state, country of residence, phone country selects |
| Yes/No / Selects | Sponsorship, authorized to work, previously worked, employment agreements, based in US — fuzzy from profile + `customAnswers` |
| Long text | Why join / additional info ← `coverLetter` or `customAnswers`; accessibility ← `customAnswers` only |
| Radios | Team interest ← `customAnswers` only |
| EEO / diversity | Skipped / Prefer not — **never invent** |
| Submit synonyms | **Apply for this job** / **Submit application** (submit mode only) |

### Modes

- **fill** / **ready**: fields + files; do **not** click final Apply/Submit.
- **submit**: fill then click Apply/Submit synonym.

### Related

- Adapter: `adapters/ats/greenhouse.js` (in runner / panel inject lists)
- Discovery handoff: [Working Nomads → Greenhouse](#working-nomads--greenhouse-handoff)


## Jooble → Swooped / external ATS

**Status:** Discovery board (**Jooble**) + assisted-apply intermediary (**Swooped**). Same handoff pattern as We Work Remotely → CATS / Working Nomads → Greenhouse.

### Operator paste (example)

1. Jooble job page (e.g. a Salla role) → **Apply**
2. Lands on **Swooped** UI (Find Jobs / Auto Apply / Track Jobs / Resumes / Cover Letters / Upgrade; filters; company job detail; **Prepare Application**)
3. Swooped offers: "We'll build your entire application… Upload your resume…" (tailored resume/cover) **or** **Apply manually instead**

### What Fill & Apply does today

1. **Jooble** (`jooble.org`): clicks **Apply** / **Apply now** / **Apply for this job** (skips unrelated / Auto Apply / Upgrade chrome).
2. On navigation **away from jooble.org**, returns `externalApply` / `deferToPageAdapter` / `handedOff`. The **runner waits for load and re-injects** so `registry.detect` picks **Swooped** or an employer ATS.
3. **Swooped** (`swooped.co`, `www.swooped.co`, `app.swooped.co`, plus content markers such as "Auto Apply", "Prepare Application", "Apply manually instead", "We'll build your entire application"):
   - **Does not** use Swooped **Auto Apply**, paid **Upgrade**, or auto-build application packets.
   - Prefers **Apply manually instead** when present, then hands off again if the host changes to an employer ATS.
   - If stuck on the Prepare Application / resume-upload wall with no manual path → `needsHuman` pause explaining the Swooped intermediary.
   - `paidSource: false` unless an Upgrade / subscription wall blocks — then pause (never purchase).
4. After a successful manual handoff, Fill & Apply fills the **destination ATS** (Greenhouse, Lever, company careers, …) with the saved profile.

### Operator checklist

1. Prefer queueing the **final employer ATS URL** when you already have it.
2. Or queue the Jooble job page and let Apply → Swooped → **Apply manually instead** hand off.
3. Never rely on Swooped Auto Apply / Upgrade as Fill & Apply's path.
4. If paused on a Swooped prepare wall, open the employer apply URL (or click Apply manually instead yourself) and **Resume**.

### Related

- Adapters: `adapters/boards/jooble.js`, `adapters/boards/swooped.js` (injected in runner / panel `INJECT_FILES`)
- Catalog: `jooble`, `swooped` in `adapters/catalog.js`
- Similar patterns: [Working Nomads → Greenhouse](#working-nomads--greenhouse-handoff), [We Work Remotely — paid source](#we-work-remotely--paid-source)

## Working Nomads → Greenhouse handoff

**Status:** Discovery board adapter with **external Apply handoff** (same pattern as We Work Remotely → CATS).

Working Nomads (`workingnomads.com`) is often a **job discovery** board. The on-site **Apply** control commonly opens an **external ATS** — frequently **Greenhouse** (examples above: GitLab / Figma Strategic Finance roles).

### What Fill & Apply does today

1. Detects Working Nomads hosts.
2. Clicks **Apply** / **Apply now** / **Apply for this job** only — skips unrelated CTAs (subscribe, share, post a job, etc.).
3. When Apply targets a **different host**, returns `externalApply` / `deferToPageAdapter` / `handedOff`. The **runner waits for load and re-injects** so `registry.detect` picks the destination (e.g. **Greenhouse**) and calls its `fill`.
4. If the host already changed in the same tab, re-detects and fills the destination adapter immediately when possible.
5. If a rare on-site form exists, fills via generic fallback.

### Operator checklist

1. Prefer queueing the **final Greenhouse apply URL** when you already have it.
2. Or queue the Working Nomads job page and let Apply hand off.
3. Map Figma “Why join” / team interest / GitLab selects in **customAnswers** before **Auto Submit**.
4. Respect per-source caps (Greenhouse default 2, max 3).

### Related

- Adapter: `adapters/boards/workingnomads.js` (injected in runner / panel `INJECT_FILES`)
- Destination: [Greenhouse — hardened ATS](#greenhouse--hardened-ats)
- Similar pattern: [We Work Remotely — paid source](#we-work-remotely--paid-source) (WWR → CATS)

## Configured sources (catalog)

Registered in `adapters/catalog.js` (+ hardened overrides where noted).

### ATS (apply engines)
**Greenhouse***, Ashby*, Lever, Workable, Workday, SmartRecruiters, iCIMS, **CATS***

### Job boards
LinkedIn, Upwork, **NaukriGulf***, Indeed*, eFinancialCareers, FreeHire, **Working Nomads*** (Apply → Greenhouse handoff), **Jooble*** (Apply → Swooped / ATS), **Swooped*** (assisted-apply intermediary — Apply manually instead), Bayt, GulfTalent, Glassdoor, Wellfound, AngelList/Talent, FlexJobs, Remote.co, Remotive, Himalayas, Otta, Jobgether, Y Combinator Jobs, Built In, **Remote OK*** (paid), **We Work Remotely*** (paid + profile; Apply often hands off to external ATS)

### Agencies
Michael Page, Hays, Robert Half, Cooper Fitch, Charterhouse, Robert Walters, Jivaro Partners, LHH

\* Hardened from paste-library / live testing. Others use **generic fallback** + host detect until pasted.

### Generic fallback (unknown sites)
If no adapter matches, Fill & Apply still attempts **inspect → fill** using the same candidate profile and synonym maps (see below). Prefer pausing on Cloudflare / unknown required questions rather than blind submit.

## Field types the app can process

| Type | Examples | How |
|------|----------|-----|
| Text | Name, email, phone, city, LinkedIn, essays | Label / name / autocomplete / placeholder map |
| Native `<select>` | Country, Yes/No | Fuzzy option match |
| Custom dropdowns / radios | Sponsorship, EST timezone | Trigger + option click / radio |
| File upload | Resume/CV, cover letter | DataTransfer (not OS picker) |
| Multi-step CTAs | Next, Continue, Save & continue | Synonym CTA match |
| Final CTAs | Apply, Apply Now, Apply for this Job, Submit Application, Submit & Apply | Synonym CTA match |
| Challenges | Cloudflare, CAPTCHA | Pause + notify (never bypass) |
| External handoff | WWR → CATS; Working Nomads → Greenhouse; Jooble → Swooped → ATS | Click Apply / Apply manually instead → re-detect destination adapter |

Profile keys commonly mapped: first/last/full name, email, phone (+ country), location/city/state/country/zip/street, LinkedIn, portfolio, website, GitHub, resume URL/summary, work history, education, cover letter, work authorization, sponsorship, `customAnswers` / `customQA`.

## Adaptive synonyms (same meaning, different labels)

Boards rename the same actions. The engine treats these as equivalent (non-exhaustive):

- **Resume file:** Resume, CV, C.V., Curriculum Vitae, Upload Resume/CV, Attach Resume
- **Cover:** Cover letter, Covering letter, Motivation letter, Letter of interest
- **Apply CTA:** Apply, Apply Now, Apply for this Job/Role, Submit Application, Submit & Apply, Send Application
- **Continue CTA:** Next, Continue, Save and continue, Proceed

Same **candidate** and **preferences** across sources; only site chrome changes. Unknown sites rely on fallback + synonyms; paste-library still improves precision.

## Account / profile-first sources

Build a complete **platform account/profile** before queuing applies on:

- NaukriGulf (100% profile or redirect)
- LinkedIn, Indeed, Upwork, Bayt, GulfTalent, Glassdoor, Wellfound
- We Work Remotely, Remote OK, FlexJobs (also **paid** access where marked)

Sources that mainly deep-link into Greenhouse/Ashby/Lever/CATS may need little/no board account beyond reaching the ATS form.

## Related docs

- Main project README (load unpacked, architecture, Greenhouse / Indeed notes).
- Adapter comments in `adapters/ats/ashby.js` restate Ashby’s 3/60 and 180-day rules for maintainers.
