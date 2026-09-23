Fill & Apply v1.26.5 — Load unpacked

1. chrome://extensions
2. Enable Developer mode
3. Load unpacked → select this folder

What changed in 1.26.5
- Cancel always clears in-progress / inject / panel lock so Start works after Cancel or a stuck run (fixes "A current-tab run is already in progress." with APPLY still visible).
- Failures / unknown fields / auth waits stay on the active tab (and its popup/modal) — no tab-hop on error.
- Bayt Apply-start: prefer Apply / Easy Apply / APPLY; exclude location chips (e.g. Saudi Arabia), SHORTLIST, Save Job.
- Auth signup popups: prefer Continue with Google / Continue as / LinkedIn / Indeed; else email+password from Environments; pause on same popup if stuck.
- Workable (incl. webook.com): years combobox prefers +15 / 10–15; entertainment objections → No; address Country/City/Postal without dumping junk into Address Line 1/2.
- Michael Page: click Apply then Apply with CV before treating page as empty form; stay on popup.
- Ashby: click Apply for this Job before looking for form fields; stay on same tab.
- Workday Start Your Application modal: prefer Apply Manually (or Autofill with Resume); stay on same tab — do not idle on “Following Apply to tab…”.
- Oracle Cloud Candidate Experience apply/email: fill Email, tick terms, click NEXT; same-tab.

Preserves 1.26.4 Start / Pause·Resume / Cancel, unknown-field highlight+pause+learn, JobPool open-once + intentional tab follow, geography (Nationality/Education=Pakistan; Residence/phone +966 / Employment=Saudi Arabia), side panel Import Profile. No Companion.

Out of scope: NaukriGulf Applied Successfully, document upload side panel, Manual Applied button.

Do not merge until live verify passes.
