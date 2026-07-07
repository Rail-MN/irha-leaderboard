# IRHA Reining Leaderboard

A live standings dashboard for the Idaho Reining Horse Association's
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
node tests/scoring.test.js   # test the scoring rules engine
node tests/data.test.js      # test CSV parsing / sheet transformation
node tools/make-snapshot.js  # refresh the offline fallback snapshot
```

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

The "Green as Grass" class has special scoring and is not yet handled.

## Project layout

```
index.html          page skeleton
css/styles.css      all styling (theme variables in :root)
js/                 data layer, rules engine, views, controller
tests/              command-line tests (44+ assertions)
tools/serve.js      local dev server
tools/make-snapshot.js  regenerates js/sample-data.js from the live sheet
claude_code_handoff.md  original project brief
```
