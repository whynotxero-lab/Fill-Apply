Fill & Apply v1.25.6 — Load unpacked

1. Chrome → chrome://extensions
2. Enable Developer mode
3. Load unpacked → select this folder
4. Options / popup Settings → Import Profile / Environments password
5. Toolbar icon opens the popup (side panel removed). Floating Auto Apply panel prefers LEFT.

Notes — v1.25.6:
- Critical: iCIMS clickSubmit*/clickSubmitProfile no longer ReferenceError on bare `profile` (Start=submit path).
- JobPool: durable pending after Open Application — never re-click until marked/failed/cleared (Companion loop fixed).
- Companion nav: Open Application excluded from navigate CTAs; adopt employer tab after hub open.
- Start continues past open via handoff flags when pending already opened.
- iCIMS login: Email + I accept + Next; Create-login fills Environments password without manual pause.
- Smokes: profile inject, Open-once, companion no-loop, Start past open, iCIMS login/password.

After Load unpacked / Reload extension: refresh open job tabs.
