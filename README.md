# טיולון – TripTracker

A shared trip expenses PWA in Hebrew (RTL): plain HTML/JS on GitHub Pages, with Firebase Firestore as the database.

## Run locally
```
python -m http.server 8765 --bind 127.0.0.1 --directory app
```
- Real data (Firebase): http://127.0.0.1:8765/
- Demo mode (data only in this browser, sample Italy trip, PIN 1234): http://127.0.0.1:8765/?demo — leave it with `?demo=0`

Admin code: stored as a hash in `app/config.js` (`ADMIN_HASH`). To change it, open `tools/admin-hash.html`.

## One-time Firebase step
Firestore → **Rules** → paste `firestore.rules` → **Publish**. Until then the real mode shows "אין הרשאה".

## Tests
- Logic: `node --test tests/logic.test.mjs tests/rates.test.mjs`
- Browser end-to-end: see `docs/plans/trip-tracker-plan.md` (Playwright script, demo mode)

## Files
- `app/` – everything that is published (index.html, config.js, css, js, sw.js, manifest, icons)
- `app/js/logic.js` – money math, settle-up, validation (unit tested)
- `app/js/store-firebase.js` / `store-demo.js` – data layer (same interface)
- `firestore.rules` – security rules to paste into the console
- `tools/icon.html` – source of the app icons
