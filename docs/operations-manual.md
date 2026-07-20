# IRHA Dashboard — Operations Manual

Written July 17, 2026. This is the companion to `docs/cheat-sheet.md`:
the cheat sheet answers "what was that command again?"; this manual
answers "what is the whole procedure, in order, and why." It's written
so that a future you — or a Claude Code session with no prior context —
can run a show day from it. Setup that only happens once (Apps Script
deployment, OBS, Overlay formulas) lives in `docs/show-day-setup.md`
and isn't repeated here.

---

## Part 1 — The system map: what lives where

### The four Google Sheets

**1. Season entry sheet ("IRHA Points 2026 v1 Site")**
The master record of the season, and where evening score entry happens.
One tab per class; within a tab, one row per rider+horse combination,
with score/place/points per show. Sheet formulas compute place/points
(reference only — see Part 2). The **GaG tab** was added recently:
identical layout to the other class tabs except its place and points
formulas use the Green as Grass rules (both formula sets are saved in
`docs/Google Sheets scoring formulas.txt`).

**2. Leaderboard Source sheet ("2026 IRHA Year End Leaderboard source")**
A separate spreadsheet holding the **MASTER FULL INFO** tab, which pulls
every class tab from the entry sheet into one flat table (Rider, Horse,
Class, one "<Show> Score" column per show), classes stacked in row
chunks. This two-sheet arrangement is a holdover from the old
Data/Looker Studio setup — the connection already existed, so the
dashboard reuses it. This sheet is what `SHEET_ID` in `js/data.js`
points at, and MASTER FULL INFO is the published tab the dashboard
reads.
The GaG tab **is** pulled into MASTER FULL INFO — verified July 17,
2026 with a test score that appeared in the published CSV (32 GREEN AS
GRASS rows, riders only, no horse names — which is fine, the GaG view
keys on rider). No connection work is needed; GaG scores entered in the
entry sheet reach the dashboard like any other class. Note the sheet's
per-rider `Total Points` cells show placeholder 0s — harmless, since
the dashboard reads only the "<Show> Score" columns and those must stay
blank until a rider actually competes (a 0 in a *Score* column means
"competed, scored zero" and would affect GaG beat-bonus math).

**3. GaG Tracker sheet**
Lifetime Green as Grass carryover. Machine-friendly tab `GaG Tracker`
with columns Rider | Previous Points | Last Shown | Archived. **The
double-counting rule:** Previous Points covers everything through the
June 2026 show, and the season sheet's GaG tab keeps April and June
*blank* — new GaG scores are entered only from the July show onward.
Carryover and season points therefore never overlap. Any non-blank
value in `Archived` (a date or `Y`) moves a graduate into the
dashboard's collapsible Graduates section.

**4. Show Day sheet ("IRHA Show Day")**
The live sheet used at the show. Tab `Draws` (Group | Draw | Rider |
Horse | Classes | Score | Note) is the day's queue — the Score column is
the only thing touched during the show. Tab `Overlay` holds ten
formulas (row 2, A through J) that H2R Graphics reads for the
livestream lower-third. An
attached Apps Script serves the Draws tab as JSON at a `/exec` URL.

### How the sheets are shared with the code (three speeds)

- **Published CSV link** — in Sheets: File → Share → Publish to web →
  pick the tab + "Comma-separated values (.csv)". Google generates a
  permanent URL that returns the tab as plain CSV text. Reliable in
  every browser, but **cached for minutes** — fine for season standings,
  too slow for the arena. Both the MASTER FULL INFO tab and the GaG
  Tracker tab are published this way; their URLs are pasted into the
  code (locations below). If a tab is ever re-published, the URL changes
  and must be re-pasted.
- **gviz endpoint** — Google's public read-only URL that works for any
  sheet shared "anyone with the link can view," no publishing step.
  The dashboard tries it first; some browsers block it (CORS — a browser
  safety rule about which sites may read data from which other sites),
  which is exactly why the published URL exists as the fallback.
- **Apps Script `/exec` URL** — a tiny script attached to the Show Day
  sheet that hands out the Draws tab as JSON, updating **within
  seconds**. This is the arena display's feed. Its permission is
  narrowed to that one spreadsheet (`spreadsheets.currentonly`).

### Fallback chains (what the code tries, in order)

- Leaderboard season data: gviz → published CSV → offline snapshot
  (`js/sample-data.js`), with a red banner explaining any failure.
- GaG tracker: published CSV → gviz → GaG view shows a warning and
  displays season points only.
- Arena display: Apps Script URL only; on failure it keeps showing the
  last good data and notes the problem in the corner.

### The code: which file does what

| File | Role |
|---|---|
| `index.html` | Leaderboard page skeleton; loads the js files in order |
| `js/data.js` | Data layer: fetches + parses CSV, standard data shape |
| `js/scoring.js` | Rules engine: all placement/points/qualification math, both standard and GaG |
| `js/render.js` | View layer: computed rows → HTML tables (detail, summary, GaG progress) |
| `js/main.js` | Controller: page state, nav clicks, iframe height reporting |
| `js/sample-data.js` | GENERATED offline snapshot — never edit by hand |
| `css/styles.css` | All leaderboard styling; theme colors in `:root` |
| `arena.html` | Self-contained show-day TV/OBS display (own CSS + JS inside) |
| `tools/serve.js` | Local dev server (http://localhost:8080) |
| `tools/import-draws.js` | Show mornings: secretary CSVs → `draws-import.tsv` |
| `tools/transfer-report.js` | Show evenings: Draws data → `transfer-report.txt` checklist |
| `tools/check-names.js` | Hygiene: name-variant report → `name-report.txt` |
| `tools/make-snapshot.js` | Regenerates `js/sample-data.js` from the live sheet |
| `tests/scoring.test.js`, `tests/data.test.js` | Command-line tests (81 assertions) |
| `incoming/` | Gitignored drop zone for the day's secretary CSVs |
| `reining_leaderboard.html` | Original single-file prototype (historical) |

### Config constants: the settings you actually edit, and where

| Setting | File | What it controls |
|---|---|---|
| `SHEET_ID`, `SHEET_TAB`, `PUBLISHED_CSV_URL` | `js/data.js` | Where season data comes from |
| `GAG_TRACKER_SHEET_ID`, `GAG_TRACKER_PUBLISHED_CSV_URL` | `js/data.js` | Where GaG carryover comes from |
| `SEASON_TITLE`, `SHOW_LABELS`, `CLASS_GROUPS` | `js/data.js` | Page title, show column names, class/level navigation |
| `DATA_URL` | `arena.html` | The Apps Script `/exec` URL the display polls |
| `SHOW_TITLE` | `arena.html` | Gold centered title — **edit once per show** |
| `LEVEL_LABELS` | `arena.html` | Class-code token → display label (merges club+national leader boxes) |
| `KNOWN_ABBRS` | `tools/import-draws.js` | Which secretary codes are recognized vs flagged |
| `GROUP_LABELS` | `tools/import-draws.js` | Raw filename group name → pretty name used everywhere |
| `CLASS_MAP`, `SHOW_DAY_URL` | `tools/transfer-report.js` | Group+token → season class; where Draws data is fetched |
| `GAG_GRADUATION_PTS`, `PLACE_PTS`, `GAG_PLACE_PTS` | `js/scoring.js` | The scoring rules themselves |

### Hosting and deployment

Code lives in a git repository pushed to GitHub (user `rail-mn`), served
by GitHub Pages at `https://rail-mn.github.io/irha-leaderboard/`. The
Squarespace site embeds `index.html` in an auto-resizing iframe
(`main.js` reports its height; a code block on the Squarespace side
listens and resizes). OBS and the arena TV load `arena.html` from the
same Pages site. **Nothing is live until pushed** — commit in GitHub
Desktop, then Push origin; Pages redeploys in ~1–2 minutes.

### The one-typed-score principle (the flow in one paragraph)

Each score is typed **once**, into the Draws tab, as it's announced.
From that single cell: the arena TV and stream update within seconds
(Apps Script feed), the Overlay tab recomputes so H2R follows, the
Leaders Today boxes update, and the queue advances (current run = first
unscored row). That evening the same data becomes the transfer report,
scores are entered into the season entry sheet, MASTER FULL INFO (in
the Leaderboard Source sheet) aggregates them, the published CSV serves
them, and the leaderboard
recomputes everything from raw scores. The JavaScript — not the sheet
formulas — is the source of truth for placements and points.

---

## Part 2 — Show day tasks

### The night before / stream laptop prep

1. On the stream laptop: GitHub Desktop → Fetch → **Pull**. Never edit
   code on the laptop; pull only.
2. If this is a new show, set `SHOW_TITLE` in `arena.html` (desktop
   machine) → commit → push → confirm the Pages URL shows it.
3. Open `arena.html` via the Pages URL in a browser to confirm the
   display connects ("updated <time>" in the top-right, not an error).

### Morning: secretary CSVs → the day's queue

1. Get the day's Order-of-Go CSV exports from the show secretary — one
   file per run group, filenames prefixed with the running order number
   ("4_Nov Hrs NP…").
2. **Empty the `incoming/` folder** (leftover files from last time will
   be imported too — the importer processes everything it finds).
3. Drop all of the day's CSVs into `incoming/`.
4. In a terminal in the project folder:

   ```
   node tools/import-draws.js incoming
   ```

5. Read the summary, group by group:
   - **Unknown class codes** (`*** UNKNOWN ***`): confirm what they mean
     at the show, then add them to `KNOWN_ABBRS` (importer) and
     `LEVEL_LABELS` (arena.html). Same-level club+national pairs map to
     the same label; classifiers like Prime Time get their own.
   - **"no pretty name configured"**: optionally add the raw name to
     `GROUP_LABELS` so future imports use the display name.
   - **Name warnings** ("close to season roster's …"): fix the spelling
     **in the TSV** before pasting — this is the moment misspellings are
     cheapest to catch.
   - **DNPCode warnings**: verify with the secretary before trusting
     the row.
6. Open `tools/draws-import.tsv`, select everything **below the header
   row**, copy, and paste **once** into the Draws tab of the Show Day
   sheet, first empty row. The whole day lands in run order.
7. Insert `DRAG` rows where arena drags fall: a row with just the Group
   filled in and `DRAG` in the Note column.
8. Glance at the arena display — it should show the first rider as NOW.

### During the show

- Type each score into its row's Score cell as it's announced. `SC` for
  a scratch, the moment it's announced — same reflex as a score.
- **The one rule: no RIDER row stays blank.** The display treats the
  first empty Score cell as "in the arena right now"; a skipped row
  stalls the queue even if later rows are scored. The NOW card always
  names the row it's waiting on — that's your diagnostic.
- Drag rows take care of themselves: a pending drag shows ARENA DRAG in
  gold and retires automatically once any later run is scored.
- Everything else (display advancing, group changeover, leaders,
  overlay) is automatic.
- Venue internet drops: the display keeps the last good data and says so
  in the corner; it recovers on its own. Fix the connection, don't
  restart anything.

---

## Part 3 — End of show day tasks

1. From the project folder:

   ```
   node tools/transfer-report.js
   ```

   This fetches the day's Draws data and writes
   `tools/transfer-report.txt`: one section per **season class**, riders
   alphabetized, scratches skipped, club+national duplicate tokens
   collapsed so each score appears once per class.
2. Open the season entry sheet next to the report. For each section,
   read down the list and type down the matching class tab's column for
   this show.
   - `<< NEW ROW` flags: this rider+horse combo isn't in that tab yet.
     Add the row first (rider — with trailing `+` if 65 or older —
     horse), then enter the score.
   - GaG scores go into the GaG tab like any other class — its formulas
     handle the different point math.
   - The "NOT TRANSFERRED" section is *intentional*: non-club classes
     (national Green Reiner, Mens, Short Stirrup, …) have no CLASS_MAP
     entry on purpose. If a section you *do* track appears there, its
     group/token needs a CLASS_MAP entry — add it and rerun.
3. Spot-check MASTER FULL INFO picked the new scores up (the sheet's own
   aggregation formulas do this), then load the dashboard and spot-check
   a class or two against the report.
4. Hygiene check:

   ```
   node tools/check-names.js
   ```

   Review `tools/name-report.txt`; fix real duplicates **in the Google
   Sheet** (the tool never changes anything). Watch the "GAG TRACKER vs
   SEASON RIDERS" section especially — a JOIN RISK means a rider's
   lifetime total is silently split across two spellings.
5. Once the show's scores are final:

   ```
   node tools/make-snapshot.js
   ```

   Then commit the regenerated `js/sample-data.js` in GitHub Desktop and
   push. This refreshes what visitors see if the live fetch ever fails.
6. GaG follow-ups, if anyone crossed 50 this weekend: they'll be pinned
   to the top of the GaG view with a NEW GRADUATE pill. After the buckle
   is delivered, fold their season points into `Previous Points` in the
   GaG Tracker (which clears the pill), then set their `Archived` cell
   (date or `Y`) to move them into the Graduates section.

---

## Part 4 — Data hygiene and input reference

### Entry sheet conventions (what a cell means)

- Blank = did not participate in that show.
- `0` = competed, scored zero (off-pattern, touched the horn without
  the 65+ allowance): counts toward qualification, earns nothing.
- `SC` = scratch → treated as blank (never ran).
- `NS` / `DQ` = no score / disqualified → treated as 0 (participated).
- Trailing `+` on a rider name = 65 or older; shown as the 65+ badge.
  A `+` anywhere else in a name is left alone.
- Scores are half-point increments displayed with one decimal (70.0).
- One row per rider+horse combination — the same rider on two horses is
  two independent rows.

### Rules the JavaScript enforces (sheet columns are reference only)

Points 10→1 for places 1–10; ties share a "-T" label and split pooled
points; qualification = 3 of 4 shows (0 scores count, and mid-season
DNQ only appears once qualifying is mathematically impossible); 4-show
participants drop their lowest points result. GaG: points 8→1 plus 0.5
per rider beaten, zeros place last and earn nothing, points accumulate
per rider across horses and seasons, graduation at 50 lifetime points.
After changing any rule, run both test files.

### GaG tracker upkeep

- Columns: Rider | Previous Points | Last Shown (year, or `UNK`) |
  Archived (blank = shown normally; any value archives a *graduate* —
  the flag is ignored on non-graduates, and a NEW GRADUATE pin always
  wins, so a stray value can't hide anyone who matters).
- Previous Points covers through June 2026; season GaG entry starts with
  the July show (April/June deliberately blank in the GaG tab). Keep
  this boundary in mind any time carryover is edited — a show's points
  must live on exactly one side of it.
- Riders join between tracker and season **by name** (normalized:
  case/punctuation ignored). `check-names.js` flags near-misses; exact
  spelling drift is the main way a lifetime total goes wrong.

### Adding things

- **A new class**: add the tab in the sheet and make sure MASTER FULL
  INFO includes it. The dashboard will show it automatically as its own
  single-level group; to place it properly in the navigation, add it to
  `CLASS_GROUPS` in `js/data.js`.
- **A new show column**: the dashboard discovers shows from MASTER FULL
  INFO headers (any column ending " Score"), so a 5th show would appear
  with no code change.
- **A new class code from the secretary**: three config edits —
  `KNOWN_ABBRS`, `LEVEL_LABELS`, and (if the club tracks it)
  `CLASS_MAP`. See the roadmap for consolidating these.

### When something changes in Google

- Re-publishing a tab generates a **new** published URL — update the
  matching constant (`PUBLISHED_CSV_URL` or
  `GAG_TRACKER_PUBLISHED_CSV_URL` in `js/data.js`).
- Editing the Apps Script code requires Deploy → Manage deployments →
  new version to take effect; the URL stays the same.
- Renaming a tab breaks the fetch for it — tab names are part of the
  URLs (`Draws`, `MASTER FULL INFO`, `GaG Tracker` are load-bearing
  names).

---

## Part 5 — How we got here: the secretary CSV story

Kept here so the *why* behind the morning routine survives.

The old workflow was OCR: official score PDFs arrived at end of day, a
model extracted scores to CSV, and scores were matched into the sheet by
hand. There is no live score feed at these shows — scores are announced
over the speakers, one run at a time. That constraint became the design:
if someone has to hear and record each score anyway, typing it into one
cell can *be* the live feed.

The secretary's show software can export one **Order-of-Go CSV per run
group** (multiple classes run concurrently within a group). Examining
real June exports revealed the structure: `OrderOfGo`, `RiderName`
(with a trailing " +" senior marker), `HorseName`, and up to fifteen
`Abbr` columns holding class codes. Two discoveries mattered:

1. **The codes are positional** — `L3` in the Abbr3 column can mean a
   different class than `L3` in Abbr6, because club and national
   versions of a level occupy different columns. That's why every token
   carries its column number (`3:L3`) through the whole system, and why
   `CLASS_MAP` is two-level (group first, then token).
2. **The filename's number prefix is the running order** — so a whole
   morning's files can be imported at once and sorted automatically.
   (Still to be spot-checked at the first live show.)

A full dry run against the previous show's 12 CSVs (62+ entries) proved
the pipeline and taught the rest: the mysterious `DNPCode` column showed
"SC" on two scratched entries (probable meaning: scratch — pending
secretary confirmation); the roster name-check caught real variants live
("Steve T Talbot" vs season "Steve Talbot"); and the Green Reiner group
turned out to contain IRHA's Green as Grass (`GR`, tracked) alongside
national Green Reiner levels (`G1`/`G2`, displayed at the arena but
never transferred to the season sheet).

The importer embodies the resulting philosophy: **validate and flag,
never guess.** Unknown codes are imported as-is but flagged; name
near-misses are reported for fixing before paste; a non-empty DNPCode is
a warning, not an action. The TSV it emits matches the Draws tab
column-for-column, so one paste queues the entire day.
