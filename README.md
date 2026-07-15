# IRHA Reining Leaderboard

A live standings dashboard for the Intermountain Reining Horse Association's
4-show season. Scores are entered into Google Sheets; everything
downstream — placements, tie-split points, qualification, the low-score
drop, and year-end ranking — is computed automatically and displayed on
a web page that can be embedded in the association's website.

## Running it locally

Requires [Node.js](https://nodejs.org) (LTS).

```
node tools/serve.js        # start the local dev server
```

Then open http://localhost:8080. (Opening index.html directly from disk
won't load live data — browsers block Google fetches from file:// pages.)

Other commands, run from the project folder:

```
node tests/scoring.test.js         # test the scoring rules engine
node tests/data.test.js            # test CSV parsing / sheet transformation
node tools/make-snapshot.js        # refresh the offline fallback snapshot
node tools/import-draws.js incoming  # show mornings: secretary CSVs → paste-ready TSV
node tools/transfer-report.js      # show evenings: checklist for entering scores
node tools/check-names.js          # report likely rider/horse name variants
```

Full command reference: `docs/cheat-sheet.md`.

## How data flows

```
Google Sheet (score entry, one tab per class)
        │  sheet formulas aggregate
        ▼
"MASTER FULL INFO" tab (rider, horse, class, raw scores)
        │  fetched as CSV (gviz endpoint → published URL → offline snapshot)
        ▼
js/data.js      parses CSV into a standard shape (the data layer)
js/scoring.js   recomputes placements, points, ties, drop, ranks
js/render.js    turns computed rows into HTML tables
js/main.js      holds UI state and conducts the pipeline
```

The JavaScript is the source of truth for scoring rules — the sheet's
own place/points columns are reference only.

## Scoring rules (implemented + tested)

- Points by placement: 1st = 10 … 10th = 1, 11th+ = 0
- Ties share a placement label ("2-T") and split the pooled points
- Score of 0 (e.g. touched the horn) = participation only: counts
  toward qualification, earns no points, no placement
- Trailing "+" on a rider's name = 65 or older (may hold the saddle
  horn) — shown as a "65+" badge
- Year-end qualification: at least 3 of 4 shows; mid-season, DNQ only
  applies once qualifying is mathematically impossible
- 4-show participants drop their lowest points result; 3-show
  participants keep all three

**Green as Grass** has its own rules engine and its own view:

- Per-show points: 1st = 8 … 8th = 1 (ties pool and split), plus a
  0.5 bonus per rider beaten (strictly lower score, including zeros)
- A score of 0 places last and earns nothing
- Points accumulate per RIDER across horses and across seasons —
  carryover comes from the "GaG Tracker" sheet
- At 50 lifetime points a rider graduates (earns the buckle); the
  dashboard's GaG tab shows a progress bar per rider, pins new
  graduates to the top as a buckle to-do list, and tucks riders not
  seen this season into an archive section

## Show day (arena display & live scores)

`arena.html` is a self-contained 1080p display for the arena TV and the
livestream (OBS browser source). It polls a separate Show Day Google
Sheet — the day's draw list, imported each morning by
`tools/import-draws.js` — and shows the current run, next / on deck,
a draw-order window, and today's class leaders. Scores typed into the
sheet appear within seconds; an Overlay tab of formulas feeds the H2R
lower-third graphics from the same data. In the evening,
`tools/transfer-report.js` turns the day's scores into a checklist for
entering them into the season sheet. Full walkthrough:
`docs/show-day-setup.md`.

## Project layout

```
index.html          leaderboard page skeleton
arena.html          show-day TV/OBS display (self-contained, own data source)
css/styles.css      all styling (theme variables in :root)
js/                 data layer, rules engine, views, controller
   sample-data.js   generated offline snapshot (don't edit by hand)
tests/              command-line tests (81 assertions)
tools/
   serve.js            local dev server
   make-snapshot.js    regenerates js/sample-data.js from the live sheet
   import-draws.js     secretary OOG CSVs → draws-import.tsv (show mornings)
   transfer-report.js  evening score-entry checklist (writes transfer-report.txt)
   check-names.js      name-variant report (writes name-report.txt)
docs/
   show-day-setup.md   show-day sheet, Apps Script, OBS, Overlay formulas
   cheat-sheet.md      command-line & troubleshooting reference
   claude_code_handoff.md  original project brief
incoming/           gitignored drop zone for the day's secretary CSVs
reining_leaderboard.html  the original single-file prototype (historical)
```
