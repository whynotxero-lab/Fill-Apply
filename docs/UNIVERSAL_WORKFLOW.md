# Universal Application Workflow (v1.22.0)

Five on-page / popup controls, one runner, explicit terminals, ~10s no-progress plateau.

## Controls (order)

1. **Auto Register** — detect auth wall; Google social or email/password via existing `ats-auth` / `auth-walls` / `signup-login`. Already signed in → report unnecessary and hand off to fill. CAPTCHA/MFA → **BLOCKED** / **WAITING_FOR_USER**. Passwords never enter knowledge, export, fixtures, or git.
2. **Auto Fill** — existing fill engine + resolver. Stops on ~10s **no-progress plateau** (not an absolute lifetime).
3. **Auto Navigate** — fill + validate → click Apply/Next/Continue/Review (semantic) → wait to stabilize → re-detect → fill → loop. Prefer stop at **READY**. Never Submit unless mode is submit.
4. **Auto Ready** — fill + advance to a reviewable state (existing).
5. **Auto Submit** — end-to-end including final Submit (existing).

## Terminals

Every path ends in one of:

`COMPLETE` | `READY` | `WAITING_FOR_USER` | `MISSING_INFORMATION` | `BLOCKED` | `AUTH_REQUIRED` | `AMBIGUOUS` | `TIMEOUT`

No infinite RUNNING. UI status stays human-readable (e.g. “Auto Fill — Filling…”, “Blocked — CAPTCHA…”).

## Plateau

Progress = fill / select / dependent reveal / navigate / upload / new control. If ~10s pass with none of those, stop, report filled + unresolved + blockers, leave the page usable → **TIMEOUT**.

## Adaptive fields

Observe → learn → reload → fill (Field Memory / adaptive dictionary from v1.21). Sensitive / consent / password excluded.

## Identity

Combined/split name, phone E.164 vs split (no double prefix), DOB formats, **country ≠ nationality ≠ residence ≠ phone country code**. Resume aliases (Resume / CV / curriculum vitae / choose file) with upload verify.

## Architecture

Extends existing runner, control-adapter, synonyms, adaptive knowledge, tab handoff, Google auth. No parallel runner / knowledge store / auth / field resolver.

See also: `docs/UNIVERSAL_WORKFLOW_1.22_BRIEF.md`, `docs/ADAPTIVE_KNOWLEDGE.md`.
