Fill & Apply v1.19.3 — Load unpacked

1. Chrome → chrome://extensions
2. Enable Developer mode
3. Load unpacked → select this folder (Fill-Apply-1.19.3-clean)
4. Options → Import Profile → choose private zahid-profile.json
   (deliverables/zahid-profile.json or private-profiles copy)

Notes — v1.19.3 (Name split + DOB formats):
- First name = Chaudhary; Last name = Zahid Ali (multi-word). Full name
  Chaudhary Zahid Ali. Given / Surname map correctly.
- DOB stored as ISO 1979-04-06; filled as MM/DD/YYYY, DD/MM/YYYY, or
  type=date ISO depending on the field (Workable → 04/06/1979).
- Workable / Qiddiya: Masters education, conflict No, empty PIF/salary
  skipped, LinkedIn social, Riyadh location, Qiddiya No, privacy/criminal
  Yes, resume upload.

Also from v1.19.2:
- NaukriGulf Yes/No radios use real click; CA vs CA/ACCA distinction.

After Load unpacked / Reload extension: refresh any open job tabs (old content
scripts die — otherwise "Receiving end does not exist" / context invalidated).
