Fill & Apply v1.19.1 — Load unpacked

1. Chrome → chrome://extensions
2. Enable Developer mode
3. Load unpacked → select this folder (Fill-Apply-1.19.1-clean)
4. Options → Import Profile → choose private zahid-profile.json
   (deliverables/zahid-profile.json or private-profiles copy)

Notes (tabs / popups / Settings UI) — v1.19.1:
- Apply that opens a NEW TAB (NaukriGulf, Michael Page, boards): runner adopts
  that tab and continues Auto Fill / Ready / Submit there.
- Michael Page: deep/shadow Apply CTA (not Save Job); same-page Apply
  modal/drawer detection continues fill inside the popup.
- Options: Source selection, Backend/runner knobs, per-ATS caps, and Application
  reports UI are hidden (defaults still work). Profiles: Mock (built-in demo) +
  Import / Export / Delete for imported profiles; click a chip to switch. No
  Create/Reset Zahid, Set active, Rename, or Duplicate in the store UI.
- Adaptive knowledge: Export JSON + Import merge/replace (no passwords; no invent).

After Load unpacked / Reload extension: refresh any open job tabs (old content scripts die — otherwise you may see "Receiving end does not exist" / "Extension context invalidated").

Phone + documents (v1.19.1):
- Alone phone field → full E.164 (phoneFull / phoneE164, e.g. +966…).
- Country + local siblings stay split.
- Choose File / Upload CV / Browse: resume DOCX/PDF from profile documents.
- Ignite-like labels: Current Salary → salary_text; Location → Riyadh/etc.; Available → notice period.
- NaukriGulf Easy Apply screening: Yes/No radios even when label text includes glued "YesNo";
  CA/ACCA, Notice Period, Remuneration, contracting textarea filled from profile/customAnswers.
