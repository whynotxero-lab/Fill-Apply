# Sources & Fields

Per-source application format, flow, and fields derived from operator pastes, `docs/APPLICATION_GUIDE.md`, and `lib/source-profiles.js` (v1.13).

**Policy everywhere:** never invent answers; empty required → pause / missing-fields popup; EEO/diversity → skip or prefer-not only; never click paid Upgrade / AI Auto-Apply / Subscribe.

---

## Teamtailor (Noon / white-label careers)

**Hosts:** `*.teamtailor.com`, Teamtailor CDN / Stimulus markers, footer “Applicant tracking system by Teamtailor” (e.g. `careers.learnatnoon.com`).

**Flow**
1. Job page → **Apply for this job** (cover + floating)
2. Modal/overlay apply form
3. Screening + personal info + Upload CV + cover letter
4. **Submit application** only in submit mode; privacy checkbox when present

**Required / mapped**
| Field | Source |
|-------|--------|
| First / Last / Email / Phone | profile |
| Years experience (0-2 / 3-5 / 6-9 / 10+) | yearsExperience / customAnswers (15+ → 10+) |
| Current salary | customAnswers.currentSalary (numbers only for `type=number`) |
| Notice period (Onspot / 15 / 30 / 60 days) | noticePeriod |
| Citizenship | nationality |
| Based in Riyadh? | location heuristic or customAnswers.basedInRiyadh |
| Largest team size | customAnswers only |
| Educational certificate (شهادة تربوية) | customAnswers only |
| Previously recruited/hired | customAnswers only |
| Computer tools / operational data rating | customAnswers only |
| Why hire / first 6 months | coverLetter / resumeSummary / customAnswers |
| Upload CV | documents resume (DataTransfer) |
| Cover letter | coverLetter |

---

## Indeed

**Hosts:** `indeed.com`, `pk.indeed.com`, `ae.indeed.com`, other locales.

**Flow**
1. Job page → **Apply with Indeed**
2. Multi-step: Contact → Location → Work auth → Resume → Employer questions → Review
3. Structure drift on unknown required → pause

**Typical fields**
| Stage | Fields |
|-------|--------|
| Contact | First / Last, Email, Phone + phoneCountry |
| Location | Country, Postcode, City / province, Street |
| Work auth | Authorized without sponsorship |
| Resume | Leave existing Indeed resume if present |
| Employer Qs | Driving license, own car, years experience, salary, salutation, nationality, PIF/conflict, cover letter, etc. via customAnswers |
| Review | Submit in submit mode only |

Also reached via **Recruitee → Apply with Indeed** (possible Cloudflare pause).

---

## LinkedIn — Easy Apply

**Prerequisite:** signed into LinkedIn (account-first). Never clicks Premium / Tailor my resume.

**Flow:** Easy Apply button → multi-page modal (e.g. 1/6 → … → Review → Submit).

**Example pages (Qiddiya-style)**
- Contact: name*, phone country + mobile*, email*, city*, education*, gender (optional), conflict of interest*, PIF*, social, DOB*, salary*, salutation*, nationality*
- Resume: upload*, summary, years experience*, involved with company*
- Work / Education: often prefilled — do not wipe
- Additional: privacy*, criminal conviction*
- Review → Submit only in submit mode

---

## LinkedIn — External Apply → iCIMS

**Flow**
1. **Apply** (not Easy Apply) — “Responses managed off LinkedIn”
2. Share your profile? Prefer **Off**, then Continue
3. Employer careers (e.g. PepsiCo) → Apply Now
4. **iCIMS** welcome (email, privacy, Next) → possible hCaptcha → Candidate Profile

Runner re-detects on host change (`externalApply` / handoff).

---

## iCIMS (PepsiCo / Riyadh Air)

**Hosts:** `*.icims.com`, “Software Powered by ICIMS”.

**Welcome:** Email, I accept…, Next; hCaptcha → needsHuman.

**Auth gate:** Create login / Returning Candidate / Password Re-enter → **manual** (never invent passwords). **SSO Connected / Disconnect** without Password Re-enter → treat authenticated.

**Candidate Profile (richer Riyadh Air)**
| Control | Source |
|---------|--------|
| CV / Resume* | DataTransfer |
| First / Last* | profile |
| Nationality*, Gender* | nationality / gender |
| Email*, phone country + number* | email / phoneCountry / phone |
| City*, Country* | city / country |
| Notice period* | noticePeriod / customAnswers |
| Employment / Education blocks | workHistory / education — do not wipe if populated |
| Previously employed / Relative?* | customAnswers (default No heuristics) |
| Marketing consent* | Prefer No unless customAnswers Yes |
| Submit Profile | submit mode only when auth cleared |

Later: Candidate Questions, job-specific Qs, EEO skip/decline, Questionnaire.

---

## Greenhouse

**Hosts:** `boards.greenhouse.io`, `job-boards.greenhouse.io`, `*.greenhouse.io`. Often via **Working Nomads → Apply**.

**Examples:** GitLab Strategic Finance (many required selects); Figma Strategic Finance (Why join*, location*, work auth*, prior employer*).

**Fills:** Resume/CV + Cover (DataTransfer / Attach), preferred name, location/country/phone-country, sponsorship / authorized / prior employer / US-based / employment-agreement selects, why-join long text, team-interest radios (customAnswers only), EEO skip. Submit synonyms: Apply for this job / Submit application.

---

## Ashby

Published **apply caps** (default 2, max 3 per source) enforced by the extension. Baseline ATS: contact + resume + cover + work auth / sponsorship. Diversity surveys: skip / prefer-not — never invent. See APPLICATION_GUIDE for cap enforcement details.

---

## NaukriGulf

**Prerequisite:** platform profile **100% complete** or redirect to profile → pause.

**Easy Apply flow:** job page → modal with Yes/No screening (employed?, located in UAE?, industry experience?) → **Submit & Apply** only in submit mode.

Mapped via customAnswers + location heuristics (UAE/Dubai → Yes for location questions).

---

## Jooble → Swooped

**Jooble:** discovery board — click Apply → host change → handoff.

**Swooped:** prefer **Apply manually instead** (never product Auto Apply / Upgrade). If already in Apply Agent / Needs Input:
- Upload resume; prefer **Focused & Impactful** resume style
- Fill Needs Input + Save Answer: name, email, phone, location, LinkedIn, salary/OTE, located in KSA, work auth, sponsorship basis, OFAC (default No)
- EEO skip; Autofill & Submit only in submit mode

---

## We Work Remotely → CATS

**WWR:** paid source + full profile prerequisite; Apply Now often opens external ATS. Never subscribe via the extension.

**CATS (`catsone.com`)** fields from paste:
| Field | Req |
|-------|-----|
| Upload Resume | * |
| First / Last / Email / City / Country / Phone | * |
| LinkedIn | * |
| Portfolio | optional |
| Expected pay rate | optional (customAnswers) |
| Willing to work EST timezone? | * (default Yes if unset) |
| Submit Application | submit mode only |

---

## Working Nomads → Greenhouse

Discovery board: click Apply / Apply now → external Greenhouse URL → re-detect Greenhouse adapter. Prefer queueing final Greenhouse URL when known.

---

## Recruitee → Indeed

Prefer **Apply with Indeed** when present (`preferIndeedApply` default true) → Cloudflare possible → Indeed multi-step. Else native Recruitee Apply + fallback fill.

---

## eFinancialCareers

Account-first (Sign in / Register → pause). Apply now → “Your application” modal (First*, Last*, Upload Resume* ≤3MB) → modal Apply shares profile and redirects to employer careers (e.g. AIIB) → handoff / re-detect.

- **fill:** fill modal only, do not click modal Apply
- **ready / submit:** click modal Apply to continue on employer site

---

## Lever (thin)

Baseline ATS adapter (`jobs.lever.co`): contact + resume + cover + work auth / sponsorship. Thin coverage vs Greenhouse/iCIMS — rely on fallback + customAnswers for employer-specific questions.

---

## Workday / Workable / SmartRecruiters (baseline)

Catalog + thin adapters with **BASELINE_ATS** source-profile fields: First/Last/Email/Phone, Resume, Cover letter, Authorized to work, Requires sponsorship. Universal Apply-start + generic fallback for overview→form pages. Handoffs from boards re-detect these hosts when present.

---

## Remote OK / We Work Remotely — paid notes

| Source | Gate |
|--------|------|
| **Remote OK** | Paid, **no free trial**. Pause on subscribe/paywall UI and geolock. No pretend-apply until unlocked. |
| **We Work Remotely** | Paid + **full profile** required to browse reliably. External Apply handoff (often CATS). Never click Upgrade. |

Per-source apply caps still apply.

---

## Comparison table — common vs source-specific

| Field / concept | Common (most ATS) | Source-specific notes |
|-----------------|-------------------|------------------------|
| First / Last / Email / Phone | ✅ | Indeed / LinkedIn also want phoneCountry |
| Resume / CV upload | ✅ | Synonyms Resume≈CV; Indeed may keep existing |
| Cover letter / why hire | ✅ | Teamtailor/Greenhouse long-text; Figma “Why join” |
| Authorized to work | ✅ | Indeed work-auth step; LinkedIn Easy Apply |
| Requires sponsorship | ✅ | Greenhouse / baseline ATS |
| Location / city / country | ✅ | Indeed location wizard; Greenhouse city* |
| LinkedIn URL | Often | CATS*, Swooped*, Greenhouse |
| Nationality / citizenship | — | Teamtailor*, iCIMS*, LinkedIn Easy, Indeed employer Qs |
| Notice period | — | Teamtailor*, iCIMS* |
| Current / expected salary | — | Teamtailor*, Indeed*, LinkedIn Easy, Swooped OTE |
| Years experience | — | Teamtailor buckets; LinkedIn Easy; Indeed |
| Gender / DOB / salutation | — | LinkedIn Easy / iCIMS / Indeed (optional or * per paste) |
| Based in Riyadh / UAE / KSA | — | Teamtailor Riyadh; NaukriGulf UAE; Swooped KSA |
| Team size / cert / tools rating | — | Teamtailor Noon screening |
| Driving license / own car | — | Indeed employer questions |
| OFAC / EST timezone | — | Swooped OFAC; CATS EST |
| Account / SSO | — | LinkedIn, eFC, NaukriGulf, iCIMS create-login |
| Paywall | — | Remote OK, WWR |
| Apply handoff | — | LinkedIn→iCIMS, Jooble→Swooped, WN→GH, WWR→CATS, Recruitee→Indeed, eFC→employer |
| EEO / diversity | Skip only | Never invent on any source |

---

## Related

- [APPLICATION_GUIDE.md](APPLICATION_GUIDE.md) — full operator pastes and mode matrices
- [APP_VISION_AND_FUNCTIONALITY.md](APP_VISION_AND_FUNCTIONALITY.md)
- Source catalog implementation: `lib/source-profiles.js`, `adapters/catalog.js`
