# R.E.A.C.H.

**Resources • Education • Access • Compassion • Help**

A free, mobile-friendly resource directory for people experiencing instability
and those helping them. Runs entirely as static files on GitHub Pages and
treats a Google Sheet as the database.

Live site: <https://gdnsake-lab.github.io/R.E.A.C.H.-App/>

## How it's put together

```
index.html          App shell
styles.css          All styling
app.js              Data loading, filtering, rendering, detail view
service-worker.js   Offline / PWA cache
manifest.json       PWA metadata
assets/             Logo + icons
data/programs.json  Committed snapshot used as an offline fallback
```

### Data flow

1. The app tries `https://opensheet.elk.sh/<sheet-id>/R.E.A.C.H.` (the live
   Google Sheet). When you edit the sheet, the app reflects it on the next
   load — no build or deploy needed.
2. Successful responses are cached in `localStorage` (key `reach:data:v2`) so
   the app still loads quickly and works offline.
3. If both the live sheet and the local cache are unavailable (first visit
   offline, or opensheet is down), it falls back to
   `data/programs.json` committed to this repo.

### The Google Sheet

Source of truth:
<https://docs.google.com/spreadsheets/d/1rTdR5qV-WM9T-K7QJOl33s7bobL4Z5pAvyiWqrKuFJ4/edit>

Tab name: `R.E.A.C.H.`

Expected columns (header row):

- Program Name, Program ID, Category, Focus, Address, Website, Phone Number
- Barrier Level to Services, Crisis Prepared, Eligibility, Walk-ins Accepted
- Intake Method, Intake Requirements, Population, 24 Hours, Summary, Date Verified

Multi-value columns (`Focus`, `Eligibility`, `Population`) use commas as
separators (e.g. `Adults, Families`). The app splits those into individual
filter chips.

### Updating the snapshot

To refresh the offline fallback, from the repo root:

```bash
curl -s 'https://opensheet.elk.sh/1rTdR5qV-WM9T-K7QJOl33s7bobL4Z5pAvyiWqrKuFJ4/R.E.A.C.H.' \
  | python3 -m json.tool > data/programs.json
git add data/programs.json && git commit -m "Refresh programs snapshot" && git push
```

A scheduled GitHub Action to do this automatically is a reasonable follow-up.

## Local development

No build step. Just serve the directory:

```bash
cd path/to/R.E.A.C.H.-App
python3 -m http.server 8000
# open http://localhost:8000
```

Service workers are only active on `http(s)://`, not `file://`, so always use
a local server when testing offline behavior. After changing `service-worker.js`
bump `CACHE_NAME` so users pick up the new app shell.

## Deployment

GitHub Pages serves the `main` branch at the repo root. Pushing to `main`
deploys automatically.
