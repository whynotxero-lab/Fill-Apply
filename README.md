# Fill & Apply

Chrome / Edge **Manifest V3** extension that fills job-application forms from a locally stored applicant profile.

Vanilla HTML / CSS / JS — load unpacked, no build step.

## Load unpacked (Chrome or Edge)

1. Clone or download this repo.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this folder (`Fill-Apply` — the folder that contains `manifest.json`).
5. Pin the extension from the toolbar puzzle icon if you like.

## Quick test with the demo form

1. Open the extension popup → **Seed sample profile** (or edit your own under **Open options**).
2. Open `demo/sample-application.html` in the browser.
   - Prefer serving it over `http://localhost` (any static server), **or**
   - For `file://` pages: open the extension’s details page and enable **Allow access to file URLs**.
3. Click the extension icon → optionally enable **Highlight unmatched fields** → **Fill current page**.
4. Confirm fields populate (green outlines = filled, amber = unmatched when highlight is on).
5. Submit on the demo page only logs JSON locally — nothing is uploaded.

## How fill works

1. Profile is read from `chrome.storage.local` (key `fillApply.profile`).
2. Popup uses `activeTab` + `scripting` to inject:
   - `lib/field-map.js` — heuristics mapping labels / names / ids / autocomplete / placeholders → profile keys
   - `content/fill.js` — walks `input`, `textarea`, `select`, sets values, dispatches `input` / `change` / `blur` so React and similar frameworks notice
3. Custom Q&A entries are matched when a field’s label/placeholder resembles the stored question text.
4. No broad host permissions: injection runs only on the tab you activate the popup against.

## Permissions rationale

| Permission   | Why |
|-------------|-----|
| `storage`   | Save and load your applicant profile in `chrome.storage.local`. |
| `activeTab` | Temporary access to the current tab when you click **Fill current page**. |
| `scripting` | Inject the fill helpers into that tab on demand. |

Host permissions are **not** requested. Prefer popup-driven injection over always-on content scripts.

## Editing your profile

Popup → **Open options**, or right-click the extension icon → **Options**.

Fields include name, email, phone, location parts, LinkedIn / portfolio / GitHub / resume URL, work & education summaries, cover letter, and a custom Q&A list.

## Project layout

```
manifest.json
background/service-worker.js
content/fill.js
popup/          # summary, fill, seed sample, open options
options/        # edit profile
lib/profile.js  # default shape + storage helpers
lib/field-map.js
demo/sample-application.html
icons/
README.md
.gitignore
```

## Notes / limitations

- Heuristics will not cover every ATS. Use **Highlight unmatched fields** to see gaps; extend `lib/field-map.js` or custom Q&A.
- File upload inputs are intentionally skipped (browsers block scripted file path setting).
- Password fields are skipped.
- Restricted URLs (`chrome://`, Web Store, etc.) cannot be scripted.
- This tool assists form fill only — review every application before submitting. Do not use it to misrepresent yourself.

## Development

No bundler required. After editing files, click **Reload** on `chrome://extensions` and re-test with the demo page.
