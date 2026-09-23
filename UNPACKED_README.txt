Fill & Apply v1.26.3 — Load unpacked

1. chrome://extensions
2. Enable Developer mode
3. Load unpacked → select this folder

What changed in 1.26.3 (SLICE 2 — Nav-first + iCIMS profile accuracy)
- Nav-first: Apply/start on job page before Idle 0/0; Next/Continue after fill (welcome Email+I accept).
- iCIMS Candidate Profile:
  - Nationality = Pakistan / Pakistani (not residence)
  - Education Country = Pakistan (NOT Saudi Arabia)
  - Residence / phone country = Saudi Arabia / +966 (never American Samoa / blank)
  - Employment Country = Saudi Arabia when role in Riyadh/KSA
  - Qualification Title = real degree string (never [object Object])
  - Create-login Password + Re-enter from Environments/profile — no manual pause when password set
- Preserves 1.26.2 tab/popup follow, JobPool / Current page / Stop, open-once, pending mark.

Manual test: JobPool → Open Application → Apply on JD → welcome Next → profile countries/password/CV correct.

Do not merge until live Riyadh Air iCIMS verify passes.
