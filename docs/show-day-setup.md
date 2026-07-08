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

**Narrowing the permission (recommended):** Google's authorization prompt
claims access to ALL your spreadsheets — that's the default scope, not
what the code does. To make the grant match the code: Project Settings →
enable "Show 'appsscript.json' manifest file" → add to the manifest:

```json
"oauthScopes": ["https://www.googleapis.com/auth/spreadsheets.currentonly"]
```

Re-authorize when prompted. The script is now restricted to the Show Day
sheet only — the consent screen will say so.

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
node tools/import-draws.js incoming
```

(Passing the folder name imports every CSV in it — works identically in
PowerShell, cmd, and Mac/Linux shells.)

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

**The one rule that matters: no RIDER row stays blank.** (Drag rows are
exempt — they retire automatically once a later run is scored.) The display treats the
first empty Score cell as "this is happening in the arena right now" and
waits there — a skipped row stalls the whole queue, even if every later
row is scored. Scratch announced? Type `SC` immediately, same reflex as
a score. (Diagnostic: the NOW card always names the exact row the
display is waiting on.)

**Evening:** copy the day's scores from the Draws tab into the class tabs
of the entry sheet (this replaces the OCR step). Run
`node tools/check-names.js` afterward as a hygiene check.

## How the display decides things

- **Current run** = first row whose Score is empty (drag rows count, so a
  pending DRAG shows "ARENA DRAG" in gold)
- **Drag rows complete themselves** — no placeholder needed. A drag is
  considered over as soon as any later row has a score
- **Next / On Deck** = the following unscored rows
- **Leaders Today** = top 3 entered scores per class code in the active
  group (scores of 0 and SC excluded)
- **Connection lost?** The display keeps the last good data on screen and
  notes the problem in the corner — it never blanks mid-show.

## Overlay tab (H2R feed)

H2R reads fixed cells, so this tab keeps the "interesting" rows in ONE
place: the moment you type a score in Draws, these cells recompute and
the overlay follows — you never touch H2R mid-show.

Setup once: add a tab named `Overlay` to the Show Day sheet. Row 1
headers (for your own sanity): `Cur Draw | Cur Rider | Cur Horse |
Next Draw | Next Rider | Next Horse | Prev Draw | Prev Rider | Prev
Score | Class`. Paste the formulas below into row 2 (A2 through J2),
then point H2R's column IDs at row 2 once.

Behavior:
- **Current** = the first Score-less row. During a drag: Cur Rider says
  `Arena Drag`, Cur Draw and Cur Horse go blank.
- **Next** = the next actual rider (skips drag rows), so it stays
  populated during drags.
- **Prev** = the last completed *ride* — skips `SC` scratches, and holds
  steady during drags.

**A2 — Cur Draw**
```
=IFERROR(LET(f,Draws!$F$2:$F, c,Draws!$C$2:$C, g,Draws!$G$2:$G, r,ARRAYFORMULA(ROW(Draws!$F$2:$F)),
 last, MAX(ARRAYFORMULA(IF(f<>"", r, 0))),
 cur, MIN(ARRAYFORMULA(IF((f="")*((c<>"")+((c="")*ISNUMBER(SEARCH("drag",g))*(r>last))), r, 999999))),
 IF(INDEX(Draws!$C:$C,cur)="","",INDEX(Draws!$B:$B,cur))),"")
```

**B2 — Cur Rider**
```
=IFERROR(LET(f,Draws!$F$2:$F, c,Draws!$C$2:$C, g,Draws!$G$2:$G, r,ARRAYFORMULA(ROW(Draws!$F$2:$F)),
 last, MAX(ARRAYFORMULA(IF(f<>"", r, 0))),
 cur, MIN(ARRAYFORMULA(IF((f="")*((c<>"")+((c="")*ISNUMBER(SEARCH("drag",g))*(r>last))), r, 999999))),
 IF(INDEX(Draws!$C:$C,cur)="","Arena Drag",INDEX(Draws!$C:$C,cur))),"")
```

**C2 — Cur Horse**
```
=IFERROR(LET(f,Draws!$F$2:$F, c,Draws!$C$2:$C, g,Draws!$G$2:$G, r,ARRAYFORMULA(ROW(Draws!$F$2:$F)),
 last, MAX(ARRAYFORMULA(IF(f<>"", r, 0))),
 cur, MIN(ARRAYFORMULA(IF((f="")*((c<>"")+((c="")*ISNUMBER(SEARCH("drag",g))*(r>last))), r, 999999))),
 IF(INDEX(Draws!$C:$C,cur)="","",INDEX(Draws!$D:$D,cur))),"")
```

**D2 — Next Draw**
```
=IFERROR(LET(f,Draws!$F$2:$F, c,Draws!$C$2:$C, g,Draws!$G$2:$G, r,ARRAYFORMULA(ROW(Draws!$F$2:$F)),
 last, MAX(ARRAYFORMULA(IF(f<>"", r, 0))),
 cur, MIN(ARRAYFORMULA(IF((f="")*((c<>"")+((c="")*ISNUMBER(SEARCH("drag",g))*(r>last))), r, 999999))),
 nxt, MIN(ARRAYFORMULA(IF((r>cur)*(f="")*(c<>""), r, 999999))),
 INDEX(Draws!$B:$B,nxt)),"")
```

**E2 — Next Rider**  (same as D2 but ends `INDEX(Draws!$C:$C,nxt)`)
```
=IFERROR(LET(f,Draws!$F$2:$F, c,Draws!$C$2:$C, g,Draws!$G$2:$G, r,ARRAYFORMULA(ROW(Draws!$F$2:$F)),
 last, MAX(ARRAYFORMULA(IF(f<>"", r, 0))),
 cur, MIN(ARRAYFORMULA(IF((f="")*((c<>"")+((c="")*ISNUMBER(SEARCH("drag",g))*(r>last))), r, 999999))),
 nxt, MIN(ARRAYFORMULA(IF((r>cur)*(f="")*(c<>""), r, 999999))),
 INDEX(Draws!$C:$C,nxt)),"")
```

**F2 — Next Horse**  (ends `INDEX(Draws!$D:$D,nxt)`)
```
=IFERROR(LET(f,Draws!$F$2:$F, c,Draws!$C$2:$C, g,Draws!$G$2:$G, r,ARRAYFORMULA(ROW(Draws!$F$2:$F)),
 last, MAX(ARRAYFORMULA(IF(f<>"", r, 0))),
 cur, MIN(ARRAYFORMULA(IF((f="")*((c<>"")+((c="")*ISNUMBER(SEARCH("drag",g))*(r>last))), r, 999999))),
 nxt, MIN(ARRAYFORMULA(IF((r>cur)*(f="")*(c<>""), r, 999999))),
 INDEX(Draws!$D:$D,nxt)),"")
```

**G2 — Prev Draw**
```
=IFERROR(LET(f,Draws!$F$2:$F, r,ARRAYFORMULA(ROW(Draws!$F$2:$F)),
 prv, MAX(ARRAYFORMULA(IF((f<>"")*(UPPER(f)<>"SC"), r, 0))),
 INDEX(Draws!$B:$B,prv)),"")
```

**H2 — Prev Rider**  (ends `INDEX(Draws!$C:$C,prv)`)
```
=IFERROR(LET(f,Draws!$F$2:$F, r,ARRAYFORMULA(ROW(Draws!$F$2:$F)),
 prv, MAX(ARRAYFORMULA(IF((f<>"")*(UPPER(f)<>"SC"), r, 0))),
 INDEX(Draws!$C:$C,prv)),"")
```

**I2 — Prev Score**  (ends `INDEX(Draws!$F:$F,prv)`)
```
=IFERROR(LET(f,Draws!$F$2:$F, r,ARRAYFORMULA(ROW(Draws!$F$2:$F)),
 prv, MAX(ARRAYFORMULA(IF((f<>"")*(UPPER(f)<>"SC"), r, 0))),
 INDEX(Draws!$F:$F,prv)),"")
```

**J2 — Class** (the current row's Group text — automatically shows the
pretty name once the importer's `GROUP_LABELS` fills the sheet with it;
stays filled during drags since drag rows carry the group too)
```
=IFERROR(LET(f,Draws!$F$2:$F, c,Draws!$C$2:$C, g,Draws!$G$2:$G, r,ARRAYFORMULA(ROW(Draws!$F$2:$F)),
 last, MAX(ARRAYFORMULA(IF(f<>"", r, 0))),
 cur, MIN(ARRAYFORMULA(IF((f="")*((c<>"")+((c="")*ISNUMBER(SEARCH("drag",g))*(r>last))), r, 999999))),
 INDEX(Draws!$A:$A,cur)),"")
```

If a formula shows an error, check the Draws tab is named exactly
`Draws` and its columns are A=Group … G=Note as the importer emits them.
