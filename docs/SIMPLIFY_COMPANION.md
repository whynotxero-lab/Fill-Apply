# Simplify companion (navigate-only) — v1.25.0

Fill & Apply can run beside Simplify Copilot without racing the same fields.

## Behaviour

- **runMode `companion`** (page panel **Companion** button, or `FILL_APPLY_FILL_ONCE` with `companion: true` / `runMode: "companion"`).
- **Never fills fields or uploads documents.**
- Loop on the **host page DOM only** (cannot read/click `chrome-extension://` Simplify sidepanel):
  1. Wait until the page is quiet for `companionSettleMs` (default 12s) via MutationObserver + input/change listeners.
  2. Click the best forward CTA: **Save and Continue**, Continue, Next, Next Step (prefer primary). Never Back / Cancel / bare Apply / Submit Application.
  3. Wait for step change, then **grace** (`companionGraceMs`, default 4s) so Simplify can auto-start on the next step (API cannot be force-triggered).
  4. Repeat until **Stop** or no nav CTA remains.
- If quiet never arrives within `companionMaxWaitMs` (~12 min), pause for human.

## Config (`fillApply.runConfig`)

| Key | Default | Meaning |
|-----|---------|---------|
| `companionSettleMs` | 12000 | Quiet window before clicking Continue |
| `companionMaxWaitMs` | 720000 | Max wait for quiet before human pause |
| `companionGraceMs` | 4000 | Post-nav grace for Simplify auto-start |

## Limitations

- Opaque to Simplify’s sidepanel; settle is inferred from host DOM mutations only.
- Cannot start Simplify’s autofill — relies on Simplify auto-starting after navigation.
- Does not click final Submit / Apply Now (navigate-only).
