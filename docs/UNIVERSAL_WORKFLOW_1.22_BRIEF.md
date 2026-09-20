# Fill & Apply — Final Universal Application Workflow / Reliability (v1.22.0)

## Base
- Start from `origin/main` (v1.20.0 @ ef4439e).
- Also fold in (do not leave behind) open work if not on main:
  - `grok/adaptive-field-memory` (PR #15, Field Memory / adaptiveDictionary / conflict UX)
  - `grok/fix-adaptive-knowledge-theme` (PR #16, dark theme cards)
  Preferred: branch `grok/universal-application-workflow-1.22.0` that contains main + those commits + new work, one coherent PR. Do NOT merge to main.
- EXTEND existing: runner, control-adapter, semantic evidence, adaptive knowledge, dependent re-scan, tab handoff, Google auth, phone/DOB/name, resume Choose File. NO parallel runner/knowledge/auth/resolver.

## Popup controls (order)
1. Auto Register
2. Auto Fill
3. Auto Navigate
4. Auto Ready
5. Auto Submit
Simple labels; no runner/debug internals in normal UI. Clear status strings (Filling…, Waiting for user…, Blocked — CAPTCHA…, Ready…, Complete…).

## State machine (conceptual)
AUTH → DETECT → FILL → DEPENDENT_RESCAN → VALIDATE → NAVIGATE → NEXT_STEP → FILL… → READY → optional SUBMIT → COMPLETE
Auth kinds: already auth / none / register / login / social / ambiguous-blocked. Never assume every app needs registration.

## Auto Register
Reuse `lib/ats-auth.js`, `auth-walls.js`, `signup-login.js`. Patterns: Google social (existing) + email/password. Detect already-authenticated first. Passwords NEVER learn/export/commit/fixture/scrape. MFA/CAPTCHA → STOP user action.

## Auto Fill
Existing fill engine + resolver. ~10s **no-progress plateau** (not absolute 10s lifetime). Progress = fill/select/dependent/nav/upload/new controls. On plateau: stop, report filled + unresolved + blockers, usable page. Explicit terminals only: COMPLETE|READY|WAITING_FOR_USER|MISSING_INFORMATION|BLOCKED|AUTH_REQUIRED|AMBIGUOUS|TIMEOUT — no infinite RUNNING.

## Adaptive learning
Existing Tier-2 + Field Memory. Unknown → unresolved record → user fills → observe → persist → reload → auto-fill. No passwords/MFA/CAPTCHA/payment/tokens/consent-as-generic-true.

## Identity universal
Name split/combined (existing format.js). Phone E.164 vs split no double prefix. Email. DOB all formats. Country ≠ nationality ≠ residence ≠ phone country code. Address split/combined. Other universal fields from profile/KB only — never invent salary/auth/etc.

## Resume
Universal aliases (Resume/CV/…). Verify upload actually accepted.

## Auto Navigate
New action: after fill+validate, click Apply/Next/Continue/Review (semantic, not site chrome). Do NOT Submit unless Auto Submit. Follow tab/redirect/modal; re-detect; fill; loop. Bounded timeouts.

## Tests / fixtures
Synthetic only. Identity, controls, flows (auth/register/google/easy-apply/multistep/dependent/tab), adaptive learn sequence, plateau timeout, navigate loop, resume aliases. `npm test` all green. Public PII scan clean. Chrome-store zip root-level.

## Done criteria
See user message §39–40. Report files, architecture, tests, results, limitations, SHA, PR#. Package deliverable ZIP.
