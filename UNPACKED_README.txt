Fill & Apply v1.19.2 — Load unpacked

1. Chrome → chrome://extensions
2. Enable Developer mode
3. Load unpacked → select this folder (Fill-Apply-1.19.2-clean)
4. Options → Import Profile → choose private zahid-profile.json
   (deliverables/zahid-profile.json or private-profiles copy)

Notes — v1.19.2 (NaukriGulf Yes/No radios):
- Easy Apply screening clicks the real Yes/No radio or label[for] with
  pointer/mouse + input/change events (not checked-only).
- Shared parent labels that contain both "Yes" and "No" no longer mis-bind
  every radio as Yes.
- CA or ACCA → Yes; Chartered Accountant (CA) only → No (ACCA+CMA ≠ ICAI CA);
  B.Com/M.Com → Yes; ERP → Yes; post-qual years → More than 10 years;
  OACPA / experience letters left empty when unset.

Also from v1.19.1:
- Alone phone → full E.164; Choose File / Upload CV attaches docs.
- Apply that opens a NEW TAB: runner adopts that tab.
- Options: Mock + Import/Export/Delete; refresh job tabs after Reload.

After Load unpacked / Reload extension: refresh any open job tabs (old content
scripts die — otherwise "Receiving end does not exist" / context invalidated).
