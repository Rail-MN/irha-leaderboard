# IRHA Dashboard — Roadmap

Written July 17, 2026. Organized as **Now** (before the July 30 show),
**Next** (between July and Heber September), **Later** (worthwhile ideas,
no deadline), and **Long-term vision**. Technical terms are explained in
plain language the first time they appear, in parentheses.

## Where the project stands

The season leaderboard is live on GitHub Pages and embedded in the
Squarespace site. The arena display is deployed and fed by the Show Day
sheet's Apps Script endpoint. The show-day toolkit exists end to end:
morning draw import, live scoring in one cell per run, the Overlay tab
feeding H2R graphics, an evening transfer checklist, and name-hygiene
checks. Two of four shows are complete (April, June); scoring rules are
implemented and covered by 90 test assertions.

---

## Now — before the July 30 show

### 1. Finish the class-code vocabulary

The June dry run revealed the secretary's full set of class codes, but
several remain unconfirmed. Three **config maps** (a "config" is a list
of settings kept at the top of a file, meant to be edited without
touching the surrounding logic) each need entries:

- `KNOWN_ABBRS` in `tools/import-draws.js` — what each code means, so
  the morning import stops flagging it as unknown
- `LEVEL_LABELS` in `arena.html` — what label the arena display shows,
  and which codes merge into one "Leaders Today" box
- `CLASS_MAP` in `tools/transfer-report.js` — which season entry-sheet
  class each group's code transfers into (two-level on purpose: codes
  are positional, so `3:L3` can mean different classes in different
  groups)

Also to confirm at the show: the filename number prefix really is the
running order, and DNPCode = "SC" means scratch (the dry run strongly
suggested it; the secretary should confirm before the importer ever
auto-fills a Score from it). Classes not in the season points program
(Mens, Short Stirrup, NonPro Maturity, etc.) stay deliberately unmapped
so their scores surface in the report's "not transferred" section rather
than being guessed.

### 2. GaG graduate archiving (requested feature) — ✅ DONE July 20, 2026

Shipped as specced below. One behavior confirmed during build: an
`Archived` flag on a rider who has NOT graduated is ignored (they stay
in the normal list, governed by Last Shown) — the Graduates section is
strictly an honor roll. **Earmarked for later:** today "not seen
recently" is manual (`Last Shown` = `UNK`); once past seasons accumulate
real years, auto-hide riders whose Last Shown is more than two years
back. Small change in `buildGagProgress`'s `active` test when wanted.

**Problem:** graduates never leave the Green as Grass board. Since the
GaG view sorts by lifetime total, every past graduate sits above every
active rider — as the graduate count grows, the riders actually chasing
the buckle sink out of sight.

**Decision made:** archiving is manual, driven by a new column in the
GaG Tracker sheet. Buckle delivery is the natural moment to set it, but
that's your workflow choice, not a rule the code enforces.

**How it works:**

1. Add a column to the GaG Tracker tab, e.g. `Archived` (a date or `Y`;
   blank means not archived). The tracker parser already finds columns
   by name-prefix, so the new column follows the same pattern and older
   tracker layouts without the column keep working unchanged.
2. `parseGagTracker` (in `js/data.js`) reads the flag into each rider's
   carryover record.
3. `buildGagProgress` (in `js/scoring.js`) passes it through as an
   `archived` property on the rider's computed row.
4. `renderGagProgress` (in `js/render.js`) gets a third section. Today
   there are two: the active list, and a collapsible "Riders not seen
   recently" archive. Add a separate collapsible **"Graduates"** section
   between them — graduates are an honor roll worth browsing, which is
   different in spirit from riders who drifted away, so they shouldn't
   share the inactive archive.

**Safety valves designed in:**

- A rider with `newGrad` set (crossed 50 this season, buckle not yet
  acknowledged) stays pinned to the top **even if** the archive flag is
  accidentally set early — the buckle to-do list can't be hidden by a
  data slip.
- Your full workflow per graduate becomes: deliver buckle → fold season
  points into `Previous Points` (clears the NEW GRADUATE pill, as today)
  → set `Archived` (moves them to the Graduates section).
- Tests to add in `tests/scoring.test.js`: archived graduate leaves the
  active list; archived + newGrad stays pinned; blank column behaves
  exactly as today.

Effort is small — roughly a dozen lines across the three files plus
tests — and it's purely additive, so it's safe to do before the July
show if the tracker column is ready.

**Prerequisite resolved (July 17, 2026):** the MASTER FULL INFO pull
from the entry sheet's GaG tab was already in place — verified with a
test score that flowed through to the published CSV. No connection work
needed; the archiving feature can proceed exactly as specced above.

### 3. Snapshot + hygiene pass after the July show

Existing routine, listed so the roadmap reflects the full cadence: enter
scores, run `check-names.js`, fix flagged names, run
`make-snapshot.js`, commit and push.

---

## Next — between July and Heber September

### 4. Score-transfer tool, Phase 1: paste-ready columns

Today `transfer-report.js` produces a read-and-type checklist. The
requested upgrade is output you can paste — but two real obstacles were
identified: entry tabs have score columns separated by place/points
columns, and the rider order in each tab won't match show-day order.

**Design that solves both:** instead of emitting rows, emit **one column
per class tab, in that tab's existing row order**. The tool would:

1. Fetch each class tab of the season entry sheet. Note this is a
   *different spreadsheet* than the code touches today — the dashboard
   reads MASTER FULL INFO from the Leaderboard Source sheet, while the
   class tabs live in the entry sheet ("IRHA Points 2026 v1 Site"), so
   the tool needs the entry sheet's ID and that sheet shared "anyone
   with the link can view" for the gviz endpoint ("gviz" is Google's
   public read-only URL for sheet data) to work.
2. Read the tab's rider+horse rows top to bottom.
3. Line up the day's scores against those rows and print a single
   column of values — score where the combo ran, blank where it didn't.
4. You select the first cell of the show's Score column in that tab and
   paste once. Ordering and column-separation problems both disappear,
   because the tool matched your sheet's layout instead of asking you to.

Rider+horse combos not yet in the tab (today's `NEW ROW` flags) are
listed separately: add those rows by hand first, rerun the tool, then
paste. This phase needs no write access to your sheets — worst case a
bad paste is one Ctrl+Z.

### 5. Score-transfer tool, Phase 2: direct write

Once Phase 1 has proven the group→code→class mapping and the row
matching are trustworthy, automate the paste itself. The mechanism is an
**Apps Script web app with a `doPost` function** (the Show Day sheet
already uses `doGet` — "get" hands data out, "post" accepts data in;
this would be the first component allowed to *write* to a sheet).

Safeguards to build before trusting it:

- **Dry-run mode** (the tool prints exactly which cells it *would*
  change, and you approve before anything is written)
- **A shared secret token** (a password-like string known only to the
  script and the tool, sent with each request, so the write URL being
  public doesn't mean anyone can write)
- **Automatic backup**: the script copies the spreadsheet (Google's
  "make a copy," dated) before its first write of the day
- **Change report**: after writing, the tool prints every cell it
  changed, old value → new value

Staging it this way means the risky part (write access) arrives only
after the error-prone part (the mapping) has been verified by weeks of
Phase 1 use.

### 6. One home for the class-code vocabulary

The same knowledge currently lives in three files (item 1 above). Every
new code means three edits, and a missed one causes quiet
inconsistencies. The fix is a **single source of truth**: one shared
config file (say `js/class-config.js`) that the importer and transfer
report both `require` (Node's way for one file to load another).

The complication is `arena.html`, which is deliberately self-contained —
one file, no dependencies, so OBS and the arena TV need exactly one URL.
Two honest options:

- **Accept one duplicate:** importer + transfer report share the config
  file; `arena.html` keeps its own copy with a comment pointing at the
  shared file. Two places instead of three, self-containment preserved.
  (Recommended — simple, and arena labels change rarely.)
- **Generate arena.html's block:** a small tool stamps the shared config
  into `arena.html` automatically. Zero duplication, but adds a build
  step (a command you must remember to run), which is the kind of
  invisible dependency this project has avoided so far.

### 7. Year-end decisions before Heber

- **Tie-breaker rule:** the handoff brief notes no tie-breaker is
  defined for tied year-end totals. That's an association/board decision
  (common options: most firsts, best score at the final show, co-champions).
  Whatever is decided is a small change in `rankRows`.
- **Season-end freeze:** after Heber, take the final snapshot and tag it
  (a git "tag" is a named bookmark on a commit) as the official 2026
  record.

---

## Later — worthwhile ideas for this kind of application

### 8. Rider search on the leaderboard

The single most-used feature on public standings pages is "find my
name." A small text box above the table that filters rows as you type
(and highlights the match across classes) is a modest change confined to
`render.js`/`main.js`, and pays off every time a competitor opens the
site on their phone.

### 9. Spectator view of show day

`arena.html` already knows who's in the arena, who's next, and who leads
each class — but it's formatted for a 1080p TV. A phone-friendly page
reading the **same** Apps Script feed (no new data plumbing at all)
would let anyone at the show, or watching the stream, follow along. Post
a QR code at the show office. This is mostly a layout exercise; the risky
parts (data, polling, drag logic) are already solved and stay shared.

### 10. Multi-season history

2027 will need a fresh sheet, but 2026 shouldn't vanish. A season
selector on the dashboard backed by one frozen snapshot file per past
season (the `make-snapshot.js` pattern, kept per year instead of
overwritten) gives permanent records with no backend. Doing item 7's
freeze properly makes this nearly free later.

### 11. Year-end awards packet

A tool that renders final standings per class plus the GaG graduate list
into a clean printable document (PDF) for the banquet — the data and
scoring already exist; this is a formatting exercise, and it replaces an
error-prone manual retype at exactly the moment accuracy matters most.

### 12. Automated sheet backups

Git protects the code; nothing yet protects the sheets, and the season
sheet IS the master data — an accidental sort or deleted tab is
unrecoverable beyond Google's version history. Two cheap options:
a `tools/backup-sheets.js` that saves dated CSV copies of every
published tab into a gitignored folder (run it in the evening routine),
or a **time-driven trigger** in Apps Script (a schedule that runs a
script automatically, e.g. nightly) that copies the spreadsheet within
Google Drive. The tool version is simpler and keeps backups on your
machine.

### 13. One-command pre-publish check

The pre-publish routine is currently four commands run from memory
(tests ×2, `check-names`, `make-snapshot`). A tiny
`tools/preflight.js` that runs them in sequence and prints one
pass/fail summary turns "did I remember everything?" into a single
command — and becomes the natural home for future checks.

---

## Long-term vision (from the original brief, still the destination)

- **Other associations:** most association-specific knowledge already
  lives in config (class groups, points tables, labels, colors as CSS
  variables). Finishing item 6 and then gathering *all* per-association
  settings into one file is the main prerequisite to a second club
  running this system.
- **Score entry interface:** Phase 2's write plumbing (item 5) is also
  the foundation for a small web form for show-day score entry —
  typing into a purpose-built page instead of a spreadsheet cell, with
  validation (e.g. rejecting a 7.05 typo'd for 70.5).
- **A backend, only when needed:** a "backend" is a server program of
  your own that holds the data and enforces the rules, replacing Google
  Sheets as the system of record. The current architecture deliberately
  avoids one — Sheets + Apps Script + static pages cost nothing and
  have no server to maintain. The signals that would justify one:
  multiple associations, simultaneous writers, or login-protected roles.
- **Multi-judge scoring:** out of scope for this association today;
  noted so the score data shape (one number per run) is the only thing
  standing in the way, not the architecture.
