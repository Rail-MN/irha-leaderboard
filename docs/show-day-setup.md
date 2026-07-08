# Show Day Setup — Arena Display & Live Scores

One-time setup before the July show, then a simple routine each show day.
The core idea: **you type each score once, as it's announced, and the
arena display, livestream scene, and (that evening) the season leaderboard
all feed from that single entry.**

## One-time setup

### 1. Create the Show Day spreadsheet

A new Google Sheet (e.g. "IRHA Show Day"). One tab named exactly `Draws`
with row 1 headers exactly:

```
Group | Draw | Rider | Horse | Classes | Score | Note
```

- **Group** — the run group (one secretary CSV = one group)
- **Draw** — order of go number
- **Classes** — positional class codes from the importer (e.g. `2:NHn2 3:L3`)
- **Score** — THE ONLY CELL YOU TOUCH DURING THE SHOW. A number, or `SC` for scratch
- **Note** — `DRAG` marks an arena drag row; importer warnings land here too

### 2. Add the Apps Script JSON endpoint

Published-CSV links cache for minutes — fine for the season dashboard,
too slow for "who's in the arena." This 10-line script serves the Draws
tab as JSON that updates within seconds.

In the Show Day sheet: **Extensions → Apps Script**, replace the contents with:

```javascript
function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Draws');
  const values = sheet.getDataRange().getDisplayValues();
  return ContentService
    .createTextOutput(JSON.stringify(values))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Then: **Deploy → New deployment → type: Web app** →
Execute as: **Me** · Who has access: **Anyone** → Deploy.
Copy the URL ending in `/exec`.

> "Anyone" here means anyone with this unguessable URL can *read the
> draw list* — the same information posted on paper at the show. Writing
> still requires edit access to the sheet.

### 3. Point arena.html at it

In `arena.html`, set:

```javascript
const DATA_URL = 'https://script.google.com/macros/s/…/exec';
```

Commit + push so GitHub Pages serves it.

### 4. OBS

Add a **Browser** source → URL: `https://rail-mn.github.io/irha-leaderboard/arena.html`
→ 1920×1080. Use OBS's fullscreen projector on the HDMI output for the
arena TV; use the same source in the livestream drag-break scene.

Until DATA_URL is set, arena.html shows built-in DEMO data — use that to
arrange the OBS scene ahead of time.

## Each show day

**Morning — drop ALL the day's secretary CSVs into `incoming/`, then one command:**

```
node tools/import-draws.js incoming/*.csv
```

Files are ordered by the number prefix in their names ("4_Nov Hrs NP…"),
which appears to be the class running order — spot-check the group order
in the output the first time. The `incoming/` folder is gitignored: a
drop zone, not part of the project.

- Review the summary: unknown class codes are flagged — confirm what they
  mean, then add them to `KNOWN_ABBRS` (importer) and `LEVEL_LABELS`
  (arena.html). Codes for the same level (club + national) map to the
  same label and share one leader box; classifiers like Prime Time or
  Masters get their own label and their own box.
- Fix any flagged rider-name mismatches IN THE TSV before pasting.
- Open `tools/draws-import.tsv`, copy the rows (not the header), paste
  ONCE into the Draws tab — every group for the day, already in run order.
- Insert `DRAG` rows (just Group + `DRAG` in Note) where breaks fall.

The display advances through the whole day on its own: the current run is
always the first unscored row, so when one group's last score goes in,
the next group appears automatically. The queue is the sheet itself.

**During the show:** type each score into its row as it's announced.
`SC` for scratches. That's it — the display follows automatically:
current run = first row without a score.

**Evening:** copy the day's scores from the Draws tab into the class tabs
of the entry sheet (this replaces the OCR step). Run
`node tools/check-names.js` afterward as a hygiene check.

## How the display decides things

- **Current run** = first row whose Score is empty (drag rows count, so a
  pending DRAG shows "ARENA DRAG" in gold)
- **Next / On Deck** = the following unscored rows
- **Leaders Today** = top 3 entered scores per class code in the active
  group (scores of 0 and SC excluded)
- **Connection lost?** The display keeps the last good data on screen and
  notes the problem in the corner — it never blanks mid-show.
