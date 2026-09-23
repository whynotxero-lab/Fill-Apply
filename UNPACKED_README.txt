Fill & Apply v1.26.2 — Load unpacked

1. Chrome → chrome://extensions
2. Enable Developer mode
3. Load unpacked → select this folder
4. Pin the extension — toolbar click opens the **side panel** (Import Profile, queue Start/Stop)
5. On job / JobPool pages, use the floating **Auto Apply** panel:
   - **JobPool** — open/focus /fill-apply hub, then run end-to-end Apply
   - **Current page** — run end-to-end Apply on the active tab
   - **Stop** — abort the run

What changed in 1.26.2 (SLICE 1 — tab/popup adoption only)
- After Open Application / Apply opens a new tab or popup, the runner adopts that child as the active run target and continues there.
- Listens for tabs.onCreated + windows.onCreated from the opener tab (service worker / runner).
- JobPool /fill-apply hub stays in the background (not closed); pending mark preserved; Open Application is not re-clicked while pending.
- Fixed hop-loop knownTabIds snapshot-merge that previously hid the new tab and stalled on the opener.

Prior 1.26.1
- NaukriGulf Easy Apply screening fill quality (intent-safe essays).

Prior 1.26.0
- Companion removed; Auto Apply = JobPool / Current page / Stop; side panel import restored.
