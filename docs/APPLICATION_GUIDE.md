# Job Application Guide & Instructions

This guide covers **Fill & Apply** behavior when submitting applications through supported ATS and job boards, with special attention to **multi-profile** App Settings, **source profiles**, **Ashby** apply caps, **NaukriGulf** profile completeness, **Remote OK** / **We Work Remotely** paid access, **Working Nomads → Greenhouse** handoff, **Recruitee → Apply with Indeed** (Cloudflare pause → Indeed Easy Apply), **LinkedIn Easy Apply** vs **External Apply** (e.g. PepsiCo → careers → **iCIMS** multi-step + account human-gate + hCaptcha), **Jooble → Swooped** assisted-apply handoff, **eFinancialCareers** account-first modal → employer handoff, **CATS** external apply forms, **Teamtailor** career-site modal apply, **universal Apply-start** CTAs, **Glassdoor Easy Apply** (Indeed-backed multi-step + reCAPTCHA pause), and how the extension rate-limits applies.

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


## Source profiles & Start gate (v1.13)

Per-platform **compulsory** screening fields live in `lib/source-profiles.js` and `chrome.storage.local`:

| Key | Shape |
|-----|--------|
| `fillApply.sourceProfiles` | `{ [sourceId]: { sourceId, label, answers, updatedAt } }` |
| `fillApply.selectedSourceId` | `null` or sourceId — `null` = no Start gate |

**Catalog sources:** teamtailor, indeed, icims, greenhouse, linkedin, naukrigulf, swooped, jooble, ashby, lever, cats, recruitee, efinancialcareers, workday, workable, smartrecruiters, generic.

**Completeness:** `isSourceProfileComplete(sourceId)` — every compulsory `requiredField` has a non-blank answer **or** is satisfied via `mapsTo` from the active applicant profile.

**Start gate:** when `selectedSourceId` is set, Batch and Single Start are blocked until that source profile is complete. Side panel banner: *Complete [Indeed] source profile*. Opens App Settings → Source section.

**Inheritance:** `effectiveProfile = merge(baseProfile, sourceAnswers)` at fill time (source answers overlay base).

**Batch-by-source:** queued jobs are stable-sorted by `sourceId` then original order. Session log: `batch_source · indeed (N jobs)`. UI chip: *Batch order: by source*.

**Mock:** Reset Mock / Seed Mock source answers fills demo screening (Teamtailor Noon-style: years 6-9, salary `25000`, notice Onspot, UAE citizenship, basedInRiyadh No, …). **Zahid General** leaves source answers as empty shells so the gate/popup asks for real screening.

**UI:** App Settings (formerly Options) → **Source selection & profiles**.




## App Settings & side panel layout (v1.13)

- **App Settings** (options page `options/options.html`) sections are collapsible (`<details>`); open state persists in `chrome.storage.local` key `fillApply.ui.sections`. Defaults: Profiles + Source selection & profiles + Application queue expanded; Profile settings + Backend collapsed.
- **Application queue** is the production name for the former Mock queue (storage keys `fillApply.mockQueueUrls` / buckets unchanged). Paste target apply URLs; realtime session log shows while App Settings is open. Batch rebuild sorts by source.
- **Side panel** is a lean runner: Select profile, Application mode (Fill/Ready/Submit), Runner mode (Single/Batch), Start runner, source-gate banner, compact buckets, pause banner, short live log. Delay / keep-tabs / caps / source profiles live in App Settings only (**Open App Settings**).
- **Drive / URL documents**: optional `resumeLink` / `coverLink` (and profile `resumeUrl` / `coverUrl`). Content scripts attempt fetch→blob when CORS allows; authenticated Google Drive links usually fail — pause with “Open Drive link or upload file manually”. Prefer uploading a PDF when possible.

## Configure in App Settings

1. Open **App Settings** (side panel → **Open App Settings**, or right-click the extension icon → **Options**).
2. Under **Per-source application caps**, set **Ashby / Indeed / Greenhouse / Lever / Default** to **1**, **2**, or **3**.
3. Values above 3 are rejected by the UI and storage normalizer.
4. Click **Save runner config**.
5. Caps and delay live in **App Settings** (side panel is lean — open App Settings to edit).

**Ashby note in the UI:** *Ashby allows at most 3 apps / 60 days; we default to 2.*

## Multi-profile (App Settings)

Fill & Apply supports **multiple applicant profiles** (v1.9+):

1. Open **App Settings** → **Profiles** (top of the page).
2. Use profile **chips** + **Set active / Rename / Duplicate / Delete / Create-Reset Zahid**, or **+ Create new profile**.
3. Edit Identity / Location / Links / Q&A and click **Save profile** — writes the **active** profile only.
4. The runner and side panel always use the active profile (`getProfile()`).
5. Data is stored in `chrome.storage.local` keys `fillApply.profiles` and `fillApply.activeProfileId` so it **survives extension updates**. A legacy single profile migrates into **"Mock"** when the multi store is empty (Default is renamed to Mock).
6b. **Mock** is a permanent system demo profile (`locked` / `systemProfile`, preferred id `mock`): end-to-end SAMPLE fields for demos; **cannot be deleted** — switch to another profile instead. **Reset Mock** reseeds SAMPLE. Use **Zahid General** for real applies.
6. **Documents** (resume/cover) are **shared across profiles for now**. Export of profiles is TBD.
7. **Zahid General** — built-in one-click template for Chaudhary Zahid Ali (App Settings → **Create / Reset Zahid**). Creates or resets a named profile, sets it **active**, and persists fields in `chrome.storage.local`. Does not overwrite Mock / sample Alex. Backup JSON: `profiles/zahid-general.json`.

## No invented answers (v1.9.9+)

Empty / unknown required profile fields **must not be guessed**. When an adapter needs a mapped field that is blank (`nationality`, `noticePeriod`, `authorizedToWork`, `requiresSponsorship`, salary, driving license, street/zip, customAnswers miss, etc.), it returns `needsHuman` with `missingProfileFields` and the runner fires a **high-alert** notification (`priority: 2`, `requireInteraction: true`, title **Fill & Apply — profile field needed**). Fill the value in **App Settings** or on the page, then **Resume**. Helpers: `FillApplyProfile.isBlank`, `missingKeys`, `answerForLabel`, `requireOrPause`.

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


## LinkedIn Easy Apply vs External Apply

LinkedIn job pages offer two apply paths. Fill & Apply handles both; it **never** clicks **Premium** upsells or **Tailor my resume**.

| Path | How you recognize it | What happens |
|------|----------------------|--------------|
| **Easy Apply** | Button labeled **Easy Apply** | On-LinkedIn multi-page modal (e.g. 1/6 … Review) |
| **External Apply** | **Apply** (not Easy Apply) + often “Responses managed off LinkedIn” | Opens employer careers → ATS (example: **PepsiCo** → `pepsicojobs.com` → **iCIMS**) |

### Prerequisite

You must be **logged into LinkedIn** in the browser profile that runs Fill & Apply. A login / auth wall pauses with `needsHuman` (sign in, then Resume). LinkedIn is an **account/profile-first** source.

---

### A) Easy Apply (Qiddiya-style example)

1. Job page with an **Easy Apply** button.
2. Modal pages such as:
   - **Contact (1/6):** First/Last name*, phone country + mobile*, email*, location (city)*, highest education*, gender (optional), conflict of interest Yes/No*, PIF/affiliates Yes/No*, social links, current location*, DOB*, expected / current salary*, salutation*, nationality* → **Next**
   - **Resume (2/6):** Resume* upload (DOC/DOCX/PDF), summary, years of relevant experience*, currently involved with company Yes/No* → Next
   - **Work experience (3/6):** Often prefilled from LinkedIn — leave if present → Next
   - **Education (4/6):** Often prefilled — leave if present → Next
   - **Additional Questions (5/6):** Privacy consent Yes*, criminal conviction Yes/No* → **Review**
   - **Review:** Submit application

Employer questions vary; seed `customAnswers` for recurring employer-specific prompts.

| Mode | Behavior |
|------|----------|
| **fill** / **ready** | Open Easy Apply, fill each page, click **Next** / **Review** — **never** **Submit application** |
| **submit** | Same flow, then click **Submit application** on Review |

Details: modal-scoped fields; resume via **DataTransfer**; do not wipe prefilled work/education; optional gender only if profile has it; never invent EEO; captcha / drift → `needsHuman`.

---

### B) External Apply → careers / iCIMS (PepsiCo example)

Operator paste (LinkedIn → PepsiCo → iCIMS):

1. LinkedIn job → click **Apply** (not Easy Apply). Copy may say **Responses managed off LinkedIn**.
2. Modal: **Share your profile?** On/Off toggle + **Continue**.
   - **Preference (documented):** set toggle **Off** (privacy), then **Continue**. If the switch is missing, Continue with the current setting.
3. Employer careers job detail (e.g. `pepsicojobs.com`) → **Apply Now** / **Apply now**.
4. **iCIMS** welcome: Email field, privacy checkbox **I accept…**, **Next**; footer **Software Powered by ICIMS**; may show **Protected by hCaptcha**.

Extension behavior:

1. If **Easy Apply** is present → path A above.
2. Else if external **Apply** → click Apply → handle Share your profile (prefer **Off**, then Continue) → on **host change** return WWR-style handoff (`externalApply` / `deferToPageAdapter` / `handedOff`) so the runner re-injects and re-detects (careers / **iCIMS**).
3. Destination **iCIMS** adapter fills welcome (Email, I accept, Next), pauses on **hCaptcha** and on **Create a login / Returning Candidate** (human gate) unless **SSO Connected / Disconnect** is shown (then treat as authenticated). Then fills Candidate Profile (CV/Resume + richer demographics / employment / education when present). **fill** / **ready** never Submit Profile / final-submit; **submit** submits when auth is cleared and the form looks complete. EEO skip/decline only — never invented.

Captcha: `lib/challenges.js` detects **hCaptcha** (`.h-captcha`, hcaptcha iframes, **Protected by hCaptcha** with a visible widget) → `needsHuman` pause (complete manually, then Resume).

### Operator tips

1. Stay signed in to LinkedIn; complete your LinkedIn profile so Easy Apply cards prefill.
2. Upload a resume in App Settings before queueing applies.
3. For External Apply jobs, expect a careers host + ATS (often iCIMS); complete hCaptcha when paused.
4. For LinkedIn→iCIMS automation, **complete an iCIMS candidate profile / SSO once** (Returning Candidate Log back in). Richer portals (**Riyadh Air**) need nationality, gender, notice period, education/employment in the active Fill-Apply profile + `customAnswers`.
5. Use **Auto Fill** / **Auto Ready** first; **Auto Submit** only when Review / final form looks correct.
6. Adapter: `adapters/boards/linkedin.js`; destination: `adapters/ats/icims.js`.

## iCIMS — ATS (Software Powered by ICIMS)

**Status:** Multi-step hardened (welcome → Candidate Profile → Questions / EEO / Questionnaire). Often reached via **LinkedIn External Apply** (PepsiCo / `globalcareers-pepsico.icims.com` / `pepsicojobs.com`, or richer portals like **Riyadh Air** careers → iCIMS) or direct `*.icims.com` links.

**Operator tip:** For LinkedIn→iCIMS automation, **complete an iCIMS candidate profile / SSO once** (Returning Candidate Log back in). Richer portals (Riyadh Air) need **nationality**, **gender**, **notice period**, **education/employment** in the active Fill-Apply profile + `customAnswers`.

### Detection

- Hosts: `icims.com`, `*.icims.com`
- Content: **Powered by iCIMS**, **Software Powered by ICIMS**, `.iCIMS_JobForm` / iCIMS chrome

### Welcome step (operator paste)

| Control | Behavior |
|---------|----------|
| Email | `profile.email` |
| Privacy **I accept…** | Check when present |
| **Next** | Click to advance |
| **Protected by hCaptcha** | `needsHuman` pause — do not bypass |

### Candidate Profile (operator paste — PepsiCo + richer Riyadh Air)

| Control | Behavior |
|---------|----------|
| **Returning Candidate? Log back in!** | **Manual** — `needsHuman` auth-wall pause |
| **SSO Connected / Disconnect** (no Password Re-enter) | Treat as **authenticated** — **skip** auth pause |
| **CV** / Resume upload* (max 5MB) | DataTransfer; Resume≈CV synonyms (`lib/synonyms.js`) |
| **Create a login:** Login* / Password* / Password Re-enter* | **MANUAL — never invent passwords / never create accounts** (still auth pause if present; skipped when SSO Connected) |
| First / Last Name* (as in passport) | `firstName` / `lastName` |
| Nationality*, Gender* | `nationality` / `gender` (+ `customAnswers`); gender here is profile demographic, not EEO invent |
| Email*, Mobile Phone Country Code* + number* | `email` / `phoneCountry` / `phone` |
| Residential Address: City*, Country/Region* | `city` / `country` |
| Notice period* | `noticePeriod` / `customAnswers` (e.g. **I can start immediately**) |
| Employment Details | From `profile.workHistory` if empty; **do not wipe** if populated |
| Education blocks | From `profile.education` (qualification type/title/institution/dates/city/country/full-time) |
| Previously employed by company / Relative employed?* | Default **No** via `customAnswers` heuristics |
| Marketing consent* | Prefer **No** unless `customAnswers` says Yes (privacy) |
| Privacy agree → **Submit Profile** | Agree checked; **Submit Profile** only in **submit** mode and only when auth pause is cleared |

**User rule:** Sign Up / Sign In / Register / Login / Create a login / Returning Candidate Log back in = manual attention signals → pause + notify — **except** when Connected / Disconnect SSO chrome is shown without Password Re-enter.

### Later steps

| Step | Behavior |
|------|----------|
| Candidate Questions (e.g. over age of 18*) | `customAnswers` / profile heuristics (default **Yes** for 18+); **Finish Later** vs **Submit** — fill/ready never Submit; **submit** clicks Submit |
| Job Specific Questions | `customAnswers`; unknown **required** → pause in **submit** |
| Questionnaire / Portal Specific Forms | Fallback + customAnswers; pause on unknown required in submit |
| EEO | Skip / decline / prefer-not when available — **never invent** |
| hCaptcha | Pause throughout (`lib/challenges.js`) — unchanged |

### Modes

- **fill** / **ready**: fill fields + Next/Continue — **no** Submit Profile / final Submit / Finish Later as submit. If Create-login password fields present (and not SSO Connected) → always pause first.
- **submit**: fill, Submit Profile (when auth cleared / SSO connected), advance, Submit when complete.

### Related

- Adapter: `adapters/ats/icims.js`
- Auth helper: `lib/auth-walls.js` (`isSsoConnected`; also bridged from `lib/challenges.js`)
- Discovery: [LinkedIn Easy Apply vs External Apply](#linkedin-easy-apply-vs-external-apply)
- Challenges: `lib/challenges.js` (hCaptcha)

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

**Status:** Discovery board (**Jooble**) + assisted-apply intermediary (**Swooped**). Same handoff pattern as We Work Remotely → CATS / Working Nomads → Greenhouse, plus optional **Apply Agent** Needs Input fill when already inside Swooped.

### Operator paste (example)

1. Jooble job page (e.g. a Salla role) → **Apply**
2. Lands on **Swooped** UI (Find Jobs / Auto Apply / Track Jobs / Resumes / Cover Letters / Upgrade; filters; company job detail; **Prepare Application**)
3. Swooped offers: "We'll build your entire application… Upload your resume…" (tailored resume/cover) **or** **Apply manually instead**
4. After packet build: **Apply Agent** workspace — job in Queue with **Needs Input** (profile questions + **Save Answer**; optional **Autofill & Submit**)

### What Fill & Apply does today

1. **Jooble** (`jooble.org`): clicks **Apply** / **Apply now** / **Apply for this job** (skips unrelated / Auto Apply / Upgrade chrome).
2. On navigation **away from jooble.org**, returns `externalApply` / `deferToPageAdapter` / `handedOff`. The **runner waits for load and re-injects** so `registry.detect` picks **Swooped** or an employer ATS.
3. **Swooped** (`swooped.co`, `www.swooped.co`, `app.swooped.co`, plus content markers such as "Auto Apply", "Prepare Application", "Apply manually instead", "We'll build your entire application", "Application packet ready", "Needs Input"):
   - **Prefers Apply manually instead** when present **before** entering the auto-packet path — then hands off to the employer ATS if the host changes.
   - **Does not** click Swooped product **Auto Apply**, paid **Upgrade**, or purchase flows (`paidSource: false` unless an Upgrade wall blocks → pause, never purchase).
   - If already in **Prepare Application** / **Apply Agent** (no useful manual escape):
     1. Upload Fill & Apply stored **resume** via DataTransfer when a file input is present.
     2. Resume style chooser: prefer **Focused & Impactful** / "Choose focused resume" (default) unless `profile.resumeStyle` / `customAnswers.resumeStyle` says comprehensive.
     3. Wait for **"Application packet ready"** (or Needs Input / Apply Agent UI).
     4. Fill **Needs Input** from active profile + `customAnswers`, then click **Save Answer** when present:
        - First Name*, Last Name*, Email*, Phone*, Location*
        - LinkedIn Profile*
        - Salary / first year OTE expectations → `customAnswers`
        - Located in Saudi Arabia / primary work location → profile location / `customAnswers`
        - Legally authorized to work → `authorizedToWork`
        - Visa sponsorship → `requiresSponsorship`
        - If yes: work auth basis/expiry; if no: **"N/A"** → `customAnswers`
        - OFAC citizen/resident of sanctioned countries → default **No** / `customAnswers`
     5. EEO/diversity (gender, race, orientation, transgender, disability, veteran, voluntary self-ID): **Skip** / prefer not — never invent.
     6. Modes: **fill / ready** = fill Needs Input + Save Answer, do **not** click **Autofill & Submit**; **submit** may click **Autofill & Submit** only after requireds are filled.
4. After a successful **Apply manually instead** handoff, Fill & Apply fills the **destination ATS** (Greenhouse, Lever, company careers, …) with the saved profile.

### Operator checklist

1. Prefer queueing the **final employer ATS URL** when you already have it.
2. Or queue the Jooble job page and let Apply → Swooped → **Apply manually instead** hand off.
3. Map salary/OTE, Saudi location, work-auth basis, OFAC, etc. in **customAnswers** before Submit mode on Swooped Agent Workspace.
4. Never rely on Swooped product Auto Apply / Upgrade as Fill & Apply's path.
5. If paused on a Swooped prepare wall, open the employer apply URL (or click Apply manually instead yourself) and **Resume**.

### Related

- Adapters: `adapters/boards/jooble.js`, `adapters/boards/swooped.js` (injected in runner / panel `INJECT_FILES`)
- Catalog: `jooble`, `swooped` in `adapters/catalog.js`
- Similar patterns: [Working Nomads → Greenhouse](#working-nomads--greenhouse-handoff), [We Work Remotely — paid source](#we-work-remotely--paid-source)

## eFinancialCareers — account-first + employer handoff

**Status:** Account-first board. Job pages require **Sign in / Register**. Apply opens an on-site **"Your application"** modal, then typically **redirects to the employer website** to finish the application.

### Operator paste (example)

1. Job page on `efinancialcareers.com` — **Sign in / Register** required (account-first)
2. **Apply now** → popup **"Your application"**: First name*, Last name*, Upload Resume* (DOC/DOCX/PDF up to 3MB), **Apply**
3. Clicking **Apply** shares your profile with the company and **redirects to the employer website** to complete the application
4. Example destination: **AIIB Career Site** (`aiib.org` careers) with another **Apply Now** — hand off / re-detect destination adapter or fallback

### What Fill & Apply does today

1. Detects eFinancialCareers hosts (`efinancialcareers.com`).
2. If a **Sign in / Register** wall is present → **needsHuman** pause via `lib/auth-walls.js` (account required). **Never invents credentials.**
3. Clicks **Apply now** on the job page.
4. Fills the **"Your application"** modal: First name / Last name from the active profile; **Upload Resume** via DataTransfer (DOC/DOCX/PDF).
5. Modes:
   - **fill** — fill modal fields only; do **not** click modal **Apply** (avoids profile share / redirect)
   - **ready** / **submit** — after fill, click modal **Apply** so navigation can reach the employer form
6. On host change away from eFinancialCareers → `externalApply` / `deferToPageAdapter` / `handedOff`; runner re-injects and `registry.detect` fills the destination (company careers / ATS) or generic fallback.

### Operator checklist

1. Create / sign in to an **eFinancialCareers account** before queueing jobs.
2. Ensure the Fill & Apply profile has first name, last name, and a stored **resume** (≤3MB DOC/DOCX/PDF).
3. Prefer **ready** or **submit** when you want the extension to click modal Apply and continue on the employer site; use **fill** to stage the modal only.
4. If paused on Sign in / Register, complete auth manually and **Resume**.
5. If the employer site (e.g. AIIB) has another Apply Now, destination adapter / fallback continues after handoff.

### Related

- Adapter: `adapters/boards/efinancialcareers.js` (injected in runner / panel `INJECT_FILES`)
- Catalog: `efinancialcareers` in `adapters/catalog.js`
- Auth helper: `lib/auth-walls.js`
- Similar patterns: [Jooble → Swooped / external ATS](#jooble--swooped--external-ats), [Working Nomads → Greenhouse handoff](#working-nomads--greenhouse-handoff), [We Work Remotely — paid source](#we-work-remotely--paid-source)

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

## Recruitee → Apply with Indeed

**Status:** ATS adapter with **Apply with Indeed** preference + native form fallback (`adapters/ats/recruitee.js`).

Hosts often: `*.recruitee.com` or company career sites powered by Recruitee (Recruitee-style layout, footer / “Powered by Recruitee”, optional **Apply with Indeed** widget).

### Operator paste (SFORS / Recruitee careers)

- CTAs: **Apply** OR **Apply with Indeed**
- User preference: when an Indeed account exists, prefer **Apply with Indeed**
- Then Indeed may show **Cloudflare** → existing `challenges.js` pause → **Indeed** multi-step adapter

### What Fill & Apply does today

1. Detects Recruitee hosts (`recruitee.com` / `*.recruitee.com`) and Recruitee-powered markers (including **Apply with Indeed** on branded careers pages).
2. Config flag **`preferIndeedApply`** (default **`true`**): if **Apply with Indeed** is present, click it and return a WWR-style handoff (`externalApply` / `deferToPageAdapter` / `handedOff`).
3. Runner waits for load / re-injects → `registry.detect` picks the **Indeed** adapter for the Easy Apply multi-step flow.
4. Cloudflare / Turnstile on Indeed → existing challenge pause (never bypass) → Resume continues.
5. If `preferIndeedApply` is **false**, or only native **Apply** exists → click **Apply** and fill the Recruitee form via fallback (synonyms already cover Apply).

### Operator checklist

1. Prefer being logged into **Indeed** before queuing Recruitee jobs that offer Apply with Indeed.
2. Queue the Recruitee job URL (or company careers URL powered by Recruitee).
3. Expect: Recruitee → **Apply with Indeed** → possible Cloudflare pause → Indeed contact / resume / employer Qs → Review; Submit only in **submit** mode.
4. Set `preferIndeedApply: false` in run config only if you want the native Recruitee form instead of Indeed.

### Related

- Adapter: `adapters/ats/recruitee.js` (injected in runner / panel `INJECT_FILES`)
- Catalog: `recruitee` in `adapters/catalog.js`
- Destination: Indeed board adapter (`adapters/boards/indeed.js`)
- Challenges: `lib/challenges.js`
- Similar patterns: [Working Nomads → Greenhouse handoff](#working-nomads--greenhouse-handoff), [We Work Remotely — paid source](#we-work-remotely--paid-source)




## Glassdoor Easy Apply (Indeed-backed)

**Status:** Hardened from live paste (`adapters/boards/glassdoor.js` + shared `lib/easy-apply-steps.js`).

Hosts: `glassdoor.com` / `www.glassdoor.com`. Apply chrome may stay on Glassdoor or **shift to indeed.com** — on host change the runner re-injects and the **Indeed** adapter takes over.

### Flow (progress %)

1. Job page → click **Easy Apply** (never “Is my resume a good match?” / AI Upload widgets).
2. **~11% Add your contact information** — First*, Last*, Email, Phone (country + number) → **Continue**.
3. **~33% Add your location** — Country, Postal code, City, Street (not shown to employers) → **Continue**.
4. **~44% Add a resume** — prefer **Upload a resume** (PDF/DOCX/RTF/TXT); Build an Indeed Resume is optional → **Continue**.
5. **Review** — contact + resume summary; supporting documents optional; **I am not a robot** / reCAPTCHA → **`needsHuman` pause** (never solve).
6. Final **Submit** / Submit application only in **submit** mode after captcha cleared by human.

### Modes

| Mode | Behavior |
|------|----------|
| **fill** | Easy Apply if needed; fill **current step only**; do not Continue / Submit |
| **ready** | Fill → Continue → wait for progress/DOM change → rescan until Review; stop before Submit and before unsolved captcha |
| **submit** | Same loop, then Submit after captcha cleared |

### Runner / panel hardening

- `Frame with ID … was removed` / `No tab with id` after Continue → wait, refresh tabId, re-inject `INJECT_FILES`, retry fill (up to N). Continuous Ready **does not** markFailed solely for frame churn.
- Indeed adapter aligned to the same fill→Continue→rescan loop; advance failure → pause+Resume when possible.

### Operator checklist

1. Reload extension **v1.14.0**.
2. Select source **Glassdoor** in App Settings (contact + location + resume fields) or rely on base profile merge.
3. Queue a Glassdoor Easy Apply job URL → **Ready**.
4. Expect: Easy Apply → contact → location → resume → Review; captcha → notification → solve manually → **Resume**; Submit only in submit mode.
5. If chrome jumps to indeed.com, runner should hand off automatically.

### Related

- Adapter: `adapters/boards/glassdoor.js`
- Shared steps: `lib/easy-apply-steps.js`
- Destination handoff: `adapters/boards/indeed.js`
- Challenges: `lib/challenges.js`


## Teamtailor (career site modal)

**Status:** Hardened from live paste (`careers.learnatnoon.com` Mentorship Manager — footer *Applicant tracking system by Teamtailor*).

**Detect:** `*.teamtailor.com`, Teamtailor CDN / Stimulus (`careersite--jobs--form-overlay`, `#job-application-form`, `turbo-frame#application_form`), or footer “Applicant tracking system by Teamtailor” on white-label career hosts.

### Flow

1. Job page with **Apply for this job** (cover + floating).
2. Click opens **modal/overlay** apply form (“Close modal”).
3. Screening questions + personal info + **Upload CV** + cover letter.
4. **Submit application** only in **submit** mode; **fill** / **ready** stop before Submit.
5. Privacy policy consent checkbox near submit when present.

### Field mapping (no invented answers)

| Question | Source |
|----------|--------|
| Total years of working experience (0-2 / 3-5 / 6-9 / 10+) | `yearsExperience` / workHistory / customAnswers; **15+ → 10+**; blank → pause |
| Current Salary * | `currentSalary` / customAnswers; blank → pause |
| Notice period (Onspot / 15 / 30 / 60 days) | `noticePeriod`; blank → pause |
| Citizenship | `nationality`; blank → pause |
| Currently based in Riyadh? * | **Yes** if `location` contains Riyadh; else `customAnswers` / **No** when location is set elsewhere |
| Largest team size * | `customAnswers` only; blank → pause |
| شهادة تربوية * | `customAnswers` only; blank → pause |
| Previously recruited/hired * | `customAnswers` only; blank → pause |
| Computer tools / operational data rating * | `customAnswers` only; blank → pause |
| Why hire / first 6 months / metrics * | `coverLetter` / `resumeSummary` / customAnswers — **never** Alex sample boilerplate |
| First / Last / Email / Phone | profile |
| Upload CV | DataTransfer resume; Additional files optional |
| Cover letter | `coverLetter` |

Empty required → `needsHuman` + `missingProfileFields` + high-alert notification; fill in App Settings or on the page, then **Resume**.

### Operator checklist

1. Reload extension **v1.11.1**.
2. Open a Teamtailor job URL (or queue it) → **Fill current page** or **Start**.
3. Expect Apply for this job → modal → mapped fields; Submit only in submit mode.
4. Pre-fill `customAnswers` for team size, شهادة تربوية, recruitment, tools rating, and current salary / nationality / notice as needed.

### Related

- Adapter: `adapters/ats/teamtailor.js`
- Universal Apply-start: `lib/synonyms.js`, `content/fill.js`

## Configured sources (catalog)

Registered in `adapters/catalog.js` (+ hardened overrides where noted).

### ATS (apply engines)
**Greenhouse***, Ashby*, Lever, Workable, Workday, SmartRecruiters, **iCIMS*** (multi-step + account human-gate + hCaptcha), **CATS***, **Recruitee*** (Apply with Indeed → Cloudflare → Indeed Easy Apply), **Teamtailor*** (Apply for this job → modal)

### Job boards
**LinkedIn*** (Easy Apply + External Apply handoff), Upwork, **NaukriGulf***, Indeed*, **eFinancialCareers*** (account-first + modal → employer handoff), FreeHire, **Working Nomads*** (Apply → Greenhouse handoff), **Jooble*** (Apply → Swooped / ATS), **Swooped*** (assisted-apply intermediary — Apply manually instead), Bayt, GulfTalent, **Glassdoor*** (Easy Apply / Indeed-backed), Wellfound, AngelList/Talent, FlexJobs, Remote.co, Remotive, Himalayas, Otta, Jobgether, Y Combinator Jobs, Built In, **Remote OK*** (paid), **We Work Remotely*** (paid + profile; Apply often hands off to external ATS)

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
| Challenges | Cloudflare, CAPTCHA, **hCaptcha** (Protected by hCaptcha) | Pause + notify (never bypass) |
| External handoff / Apply-start | WWR → CATS; Working Nomads → Greenhouse; **Recruitee → Apply with Indeed → Indeed**; Jooble → Swooped → ATS; LinkedIn External Apply → careers/iCIMS; eFinancialCareers modal Apply → employer careers; **Teamtailor** Apply for this job → modal; generic job pages | Click Apply-start → wait / re-detect destination or open modal |

Profile keys commonly mapped: first/last/full name, email, phone (+ country), location/city/state/country/zip/street, LinkedIn, portfolio, website, GitHub, resume URL/summary, work history, education, cover letter, work authorization, sponsorship, `customAnswers` / `customQA`.

## Adaptive synonyms (same meaning, different labels)

Boards rename the same actions. The engine treats these as equivalent (non-exhaustive):

- **Resume file:** Resume, CV, C.V., Curriculum Vitae, Upload Resume/CV, Attach Resume
- **Cover:** Cover letter, Covering letter, Motivation letter, Letter of interest
- **Apply-start CTA (open form):** Apply, Apply Now, Start Apply, Start Application, Apply for this Job/Role/Position, Apply here — used when the form is **not** open yet (job overview / few fillable fields). Excludes **Easy Apply** (LinkedIn adapter), **AI Auto-Apply**, **Auto-Apply**, Upgrade, Subscribe, Share, Save job.
- **Final submit CTA:** Submit Application, Submit & Apply, Send Application, Complete Application (and the same Apply labels when the form **is** already open).
- **Continue CTA:** Next, Continue, Save and continue, Proceed

### Universal open step (v1.10 → hardened in v1.11.1)

Shared helper (`lib/synonyms.js` `tryClickApplyStart` + `content/fill.js` `tryOpenApplication` + fallback):

1. **Form-open** only counts fields inside known apply containers (`#job-application-form`, turbo-frame, `#application`, `form[action*=apply]`, visible dialogs) — never whole-page newsletter/search inputs.
2. If a high-confidence Apply-start CTA is present (`Apply for this job`, Teamtailor `showFormOverlay`) **and** the apply modal is not visibly open → **always click** (scrollIntoView + MouseEvent fallback).
3. Return `clickedApplyStart` / `reDetect` / `handedOff` so the **runner** / **Single** waits and re-injects (2–3 retries for slow Teamtailor modals).
4. Allowed in **fill**, **ready**, and **submit** (opening is not final submit). If no Apply CTA is found: panel error **"No Apply button found on this page"**.

Same **candidate** and **preferences** across sources; only site chrome changes. Unknown sites rely on fallback + synonyms; paste-library still improves precision.

## Account / profile-first sources

Build a complete **platform account/profile** before queuing applies on:

- NaukriGulf (100% profile or redirect)
- **eFinancialCareers** (Sign in / Register before Apply; modal then employer handoff)
- LinkedIn, Indeed, Upwork, Bayt, GulfTalent, Glassdoor, Wellfound
- We Work Remotely, Remote OK, FlexJobs (also **paid** access where marked)

Sources that mainly deep-link into Greenhouse/Ashby/Lever/CATS may need little/no board account beyond reaching the ATS form. **Recruitee** often routes through **Indeed** — keep an Indeed session ready when `preferIndeedApply` is on (default).

## Related docs

- Main project README (load unpacked, architecture, Greenhouse / Indeed notes).
- Adapter comments in `adapters/ats/ashby.js` restate Ashby’s 3/60 and 180-day rules for maintainers.
