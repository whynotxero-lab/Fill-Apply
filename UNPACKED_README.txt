Fill & Apply v1.21.0 — Load unpacked

1. Chrome → chrome://extensions
2. Enable Developer mode
3. Load unpacked → select this folder (Fill-Apply-1.21.0-clean)
4. Options → Import Profile → choose private zahid-profile.json
   (deliverables/zahid-profile.json or private-profiles copy)
5. Default profile remains Mock (demo). Applicant data is import-only.

Notes — v1.21.0 (reliability / control-adapter sprint):
- lib/control-adapter.js: detect → adapt → fill → verify per DOM control type
  (text/email/tel/number/date/radio/checkbox/select/multiselect/combobox/file…).
- Dependent-field re-scan (WAITING_FOR_DEPENDENT_FIELDS) after fills that reveal
  follow-ups. Runner/panel surface phases through COMPLETE.
- Built-in Universal ATS FAQ seed (generic semantics + strategies — no PII).
- Salary current/expected stay UNKNOWN when blank (never invent).
- File inputs without a configured local document → clear BLOCKER message.

Also from v1.19.5:
- Built-in aliases resolve trial ATS questions (CA/ACCA, B.Com, ME visa, etc.).

Also from v1.19.4:
- Chrome Web Store manifest description shortened to ≤132 characters.

After Load unpacked / Reload extension: refresh any open job tabs (old content
scripts die — otherwise "Receiving end does not exist" / context invalidated).
