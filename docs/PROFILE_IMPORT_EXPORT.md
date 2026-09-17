# Profile Import / Export (v1.18.0)

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
Secrets, OAuth tokens, passwords, CAPTCHA/runtime/DOM state are stripped.

## UI

App Settings → Profiles → **Export Profile** / **Import Profile**.
Export downloads `{active-profile-name}-profile.json` (e.g. `zahid-profile.json`).
Import validates fully before writing; success reports field + knowledge counts.

## Public vs private

- Published package: empty/generic Zahid shell only (`Create / Reset Zahid`).
- Real client PII: private handoff file (gitignored), e.g. `/workspace/private-profiles/zahid-profile.json`.
- Never auto Create/Reset Zahid on startup or update — only create missing defaults; Mock preserved.

## Import private Zahid (client)

1. Install / load Fill & Apply 1.18.0+.
2. Options → Import Profile → select private `zahid-profile.json`.
3. Zahid activates and is immediately usable; survives reload and updates.
