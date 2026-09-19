# Profile Import / Export (v1.18.7)

## Format

```json
{
  "format": "fill-apply-profile",
  "schemaVersion": 1,
  "exportedAt": "ISO-8601",
  "meta": { "profileName": "Zahid", "activate": true, "appVersion": "1.18.0" },
  "profile": { /* applicant fields, customQA, customAnswers, experienceEntries, … */ },
  "knowledge": { "version": 1, "records": [ /* key / aliases / type / value */ ] }
}
```

Export = complete accumulated state (profile + adaptive knowledge), not a static CV only.
Secrets, OAuth tokens, CAPTCHA/runtime/DOM state are stripped on **export**. On **import** (v1.18.7), client-provided apply-time `password` / confirm / retype email aliases are preserved in the same profile store the fill engine reads so common signup/login can auto-fill career sites. Export still strips passwords (never re-export secrets).

## UI

App Settings → Profiles → **Export Profile** / **Import Profile**.
Export downloads `{active-profile-name}-profile.json` (e.g. `zahid-profile.json`).
Import validates fully before writing; success reports field + knowledge counts.

## Public vs private

- Published package: empty/generic Zahid shell only (`Create / Reset Zahid`).
- Real client PII: private handoff file (gitignored), e.g. `/workspace/private-profiles/zahid-profile.json`.
- Never auto Create/Reset Zahid on startup or update — only create missing defaults; Mock preserved.

## Import private Zahid (client)

1. Install / load Fill & Apply 1.18.7+.
2. Options → Import Profile → select private `zahid-profile.json`.
3. Zahid activates and is immediately usable; survives reload and updates.

## v1.18.5 notes

- Import normalizes knowledge `status:"active"` → confirmed and preserves aliases / question text.
- Empty knowledge shells (blank value) are skipped on fill — never invented.
- `applicationQuestions` fold into `customQA` / `customAnswers` for long ATS labels.
- Title/salutation (Mr.), country/province/city, and Yes/No app questions resolve via adaptive knowledge + profile.

## v1.18.6 notes

- Profile: `availableFrom` / `available_to_start` = 09/25/2026; `middle_east_working_visa` Yes; salary AED 2900 / SAR 3000 kept for Auto Fill maps.
- Michael Page Submit mode does not rewrite those fields (nav-only); Auto Fill still can.

## v1.18.7 notes

- Import persists `password` (+ confirm/retype email aliases) into the active profile for apply-time signup/login only.
- Export continues to strip password keys (smoke-covered).
- Adaptive knowledge never learns passwords from the page (`isSensitiveLabel`).
- See `lib/signup-login.js` and `docs/APPLICATION_GUIDE.md` (SuccessFactors / Al-Futtaim).
