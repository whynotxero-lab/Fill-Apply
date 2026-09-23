Fill & Apply v1.26.4 — Load unpacked

1. chrome://extensions
2. Enable Developer mode
3. Load unpacked → select this folder

What changed in 1.26.4 (floating Auto Apply panel)
- Primary controls: Start / Pause·Resume / Cancel (replaces JobPool / Current page / Stop).
- Start is smart: on JobPool /fill-apply hub → JobPool e2e (Open Application once → follow apply tab → nav/fill); otherwise runs on the current page. Both behaviors preserved.
- Pause / Resume toggle: while running shows Pause; while paused shows Resume.
- Unknown fields: highlight (yellow/outline), auto-pause on the same tab (no new tab / no job hop). User fills highlighted field(s); Resume learns via existing adaptive dictionary / Question Bank path, then continues fill on the same tab.
- Cancel aborts (same as legacy Stop).

Preserves 1.26.3 nav-first Apply/Next, iCIMS geography/password, JobPool open-once + tab follow, Environments password, side panel Import Profile. No Companion.

Out of scope this slice: NaukriGulf Applied Successfully, Michael Page/Ashby/Workable specifics, document upload side panel, Manual Applied button.

Manual test:
1. Load unpacked @ 1.26.4.
2. On a normal apply form: Start → fills known fields → pauses on unknown with yellow highlight → fill field → Resume → continues (no new tab).
3. On JobPool /fill-apply: Start → Open Application once → follows employer tab → fill/pause/resume as above.
4. Cancel aborts; Pause mid-run soft-pauses for human.

Do not merge until live verify passes.
