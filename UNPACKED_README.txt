Fill & Apply v1.26.1 — Load unpacked

1. Chrome → chrome://extensions
2. Enable Developer mode
3. Load unpacked → select this folder
4. Pin the extension — toolbar click opens the **side panel** (Import Profile, queue Start/Stop)
5. On job / JobPool pages, use the floating **Auto Apply** panel:
   - **JobPool** — open/focus /fill-apply hub, then run end-to-end Apply
   - **Current page** — run end-to-end Apply on the active tab
   - **Stop** — abort the run

What changed in 1.26.1
- NaukriGulf Easy Apply screening fill quality: city/notice no longer leak into experience essays or UAE/salary questions.
- Intent-aware matching + Question Bank / profile blurbs for IFRS, SOX/audit, CA-only No, UAE-based No.
- Unknown required screening → Complete Missing Information instead of wrong tokens.
- Preserved 1.26.0 JobPool / Current page / Stop (no Companion), side panel import, open-once, e2e nav.

Prior 1.26.0
- Companion / Simplify navigate-only mode removed completely (no Companion button, no companion-nav).
- Fill-Apply owns the full pipeline: Open Application → Apply → register/login → fill → submit → JobPool Applied Successfully.
- Side panel restored with profile import.
- Preserved JobPool open-once + Applied Successfully + iCIMS password/profile||{} fixes from 1.25.3–1.25.6.
