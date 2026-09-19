Fill & Apply v1.19.5 — Load unpacked

1. Chrome → chrome://extensions
2. Enable Developer mode
3. Load unpacked → select this folder (Fill-Apply-1.19.5-clean)
4. Options → Import Profile → choose private zahid-profile.json
   (deliverables/zahid-profile.json or private-profiles copy)
5. Default profile remains Mock (demo). Applicant data is import-only.

Notes — v1.19.5 (trial ATS dictionary):
- Built-in aliases resolve trial questions across ATS (not one-off adapters):
  CA or ACCA Yes vs CA-only No, B.Com/M.Com, ME working visa, Experience Level
  Director, Highest Education Masters, conflict of interest, Qiddiya involvement,
  ERP, notice/remuneration, Candidate vs Client, Al-Futtaim Nos.
- Import Profile loads all knowledge records (incl. empty alias shells) into
  IndexedDB. Store package still has Mock default and empty Zahid shell (no PII).

Also from v1.19.4:
- Chrome Web Store manifest description shortened to ≤132 characters.

Also from v1.19.3:
- First name = Chaudhary; Last name = Zahid Ali; DOB format conversion.

After Load unpacked / Reload extension: refresh any open job tabs (old content
scripts die — otherwise "Receiving end does not exist" / context invalidated).
