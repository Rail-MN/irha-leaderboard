/* ============================================================
   import-draws.js — secretary OOG CSV → Show Day sheet rows
   ============================================================
   Converts one Order-of-Go export from the show secretary into
   clean rows ready to paste into the Show Day sheet's Draws tab.

   Run from the project folder — a folder, one file, or several:

     node tools/import-draws.js incoming
     node tools/import-draws.js "one file.csv" --group "Novice Horse NP"
     node tools/import-draws.js incoming --roster season.csv

   Passing a FOLDER imports every .csv inside it. (Unix-style
   incoming/*.csv also works — the script expands the * itself,
   because Windows shells don't.)

   Multiple files are ordered by the number the secretary prefixes
   to each file name ("4_Nov Hrs NP…" → 4), which appears to be the
   class running order — CONFIRM at the first show. Files without a
   number keep the order you listed them in.

   Output: tools/draws-import.tsv — TAB-separated, so pasting into
   the Draws tab fills the columns correctly. All groups land in one
   file, in run order: paste once and the whole day is queued. A
   per-group summary + warnings print to the terminal.

   Validation (report, never guess):
   - Abbr codes are checked against KNOWN_ABBRS below. Unknown
     codes are imported AS-IS but flagged loudly — confirm what
     they mean at the show and add them to the config.
   - NOTE: Abbr columns appear to be POSITIONAL (Abbr3's "L3" may
     mean a different class than Abbr6's "L3"), so codes are kept
     with their column number, e.g. "3:L3". The column number +
     code together identify the class-level.
   - A non-empty DNPCode is flagged (legacy field, meaning unknown,
     always empty in recent files — if it ever appears, ask the
     secretary what it means before trusting the row).
   - Rider names are checked against the season roster (fetched
     live, or pass a local season CSV as the LAST argument) and
     near-misses are flagged so misspellings get caught BEFORE
     they enter the data.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { parseCsv, transformSheetRows } = require('../js/data.js');

/** Abbr codes confirmed so far. Add entries as show-morning CSVs
    teach us more. Key = the code exactly as it appears; value = what
    we believe it means (used only in the summary printout). */
const KNOWN_ABBRS = {
  'NHN1': 'Novice Horse Non Pro L1 (club)',
  'NHn2': 'Novice Horse Non Pro L2 (club)',
  'L1': 'Level 1 (national)',
  'L2': 'Level 2 (national)',
  'L3': 'Level 3 (national)',
  'GR': 'Green as Grass (IRHA — feeds the graduation tracker)',
  'G1': 'Green Reiner L1 (national — not tracked by club)',
  'G2': 'Green Reiner L2 (national — not tracked by club)',
};

/** Pretty names for run groups. Key = the RAW name derived from the
    secretary's file name (shown in the import summary); value = what
    you want displayed everywhere (sheet, arena display, overlay).
    Write each once — every future import substitutes automatically.
    Unmapped groups pass through unchanged, with a note in the summary.
    THE VALUES BELOW ARE DRAFTS from the June dry-run batch — edit
    freely; only the keys must match the raw names exactly. */
const GROUP_LABELS = {
  'Mens': 'Mens',
  'Rookie & Primetime Rookie': 'Rookie: L1, L2 & Prime Time',
  'Nov Hrs NP L1 & Nov Hrs NP L2 & Nov Horse NP & Nov Hrs NP': 'Nov Horse NP: L1, L2, L3',
  'Green Reiner': 'Green Reiner / Green as Grass',
  'Ltd NonPro & Primetime NP & Master NP & Ltd NP & PT Non Pro': 'Non Pro: Limited, Prime Time, Masters',
  'Youth 10&U & Short Stirrup': 'Youth 10 & Under / Short Stirrup',
  'Youth 13&U & Youth 14-18': 'Youth: 13 & Under, 14\u201318',
  'Open & Int Open & Ltd Open': 'Open: Open, Intermediate, Limited',
  'Mares Open & Mares NP': 'Mares: Open, Non Pro',
  'Non Pro & Int Non Pro & NonPro & NonPro Maturity': 'Non Pro: Open, Intermediate, Maturity',
  'Nov Hrs Open & Nov Horse O L2': 'Nov Horse Open: L1, L2',
  'Gr Hrs Open & Green Hrs NP': 'Green Horse: Open, Non Pro',
};

const PUBLISHED_SEASON_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSwJmc6cAJJqGb4JeR-NSG3H9RTjbrmP3meTDJZ43vcj1NDUTHfZYmw09OFS-SADZDRjFgyEpX0_cBj/pub?gid=648253065&single=true&output=csv';

const OUT_PATH = path.join(__dirname, 'draws-import.tsv');

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Derive a readable group name from the secretary's file name, e.g.
    "Copy of 4_Nov Hrs NP L1 & ... - June 19, 11_23 AM - Show_Class_OOG_Export2_qry.csv"
    → "Nov Hrs NP L1 & Nov Hrs NP L2 & ..." */
function groupNameFromFile(file) {
  let name = path.basename(file, path.extname(file));
  name = name.replace(/^Copy of /i, '').replace(/^\d+_/, '');
  name = name.split(' - ')[0]; // drop the date/export suffix parts
  return name.trim();
}

async function getRoster(localPath) {
  try {
    let text;
    if (localPath) {
      text = fs.readFileSync(localPath, 'utf8');
    } else {
      const resp = await fetch(PUBLISHED_SEASON_CSV_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      text = await resp.text();
    }
    const { byClass } = transformSheetRows(parseCsv(text));
    const riders = new Map(); // normalized → canonical spelling
    Object.values(byClass).flat().forEach(e => riders.set(normalize(e.rider), e.rider));
    return riders;
  } catch (err) {
    console.log(`(roster unavailable — name check skipped: ${err.message})`);
    return null;
  }
}

/** Expand arguments into concrete CSV paths. A directory yields every
    .csv inside it; a pattern containing * is matched within its folder.
    We do this OURSELVES because Windows shells (PowerShell, cmd) pass
    globs through literally — only Unix shells pre-expand them. */
function expandCsvArgs(args) {
  const files = [];
  args.forEach(a => {
    if (fs.existsSync(a) && fs.statSync(a).isDirectory()) {
      fs.readdirSync(a)
        .filter(f => f.toLowerCase().endsWith('.csv'))
        .forEach(f => files.push(path.join(a, f)));
    } else if (a.includes('*')) {
      const dir = path.dirname(a);
      const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('^' + path.basename(a).split('*').map(esc).join('.*') + '$', 'i');
      if (fs.existsSync(dir)) {
        fs.readdirSync(dir).filter(f => re.test(f)).forEach(f => files.push(path.join(dir, f)));
      }
    } else {
      files.push(a);
    }
  });
  return files;
}

/** The secretary prefixes a number to each file ("4_Nov Hrs NP…") that
    appears to be the class running order — used to sort a whole
    morning's files. Files without a prefix sort by argument order. */
function runOrderOf(file) {
  const m = path.basename(file).replace(/^Copy of /i, '').match(/^(\d+)_/);
  return m ? parseInt(m[1], 10) : Infinity;
}

async function main() {
  // Flags (--group X, --roster Y) are pulled out; everything else is a CSV
  const argv = process.argv.slice(2);
  const flagVal = name => { const i = argv.indexOf(name); return i !== -1 ? argv[i + 1] : null; };
  const flagIdxs = new Set();
  ['--group', '--roster'].forEach(f => {
    const i = argv.indexOf(f);
    if (i !== -1) { flagIdxs.add(i); flagIdxs.add(i + 1); }
  });
  const csvPaths = expandCsvArgs(argv.filter((_, i) => !flagIdxs.has(i)));
  if (!csvPaths.length) {
    console.log('No CSV files found. Usage:');
    console.log('  node tools/import-draws.js incoming            (whole drop folder)');
    console.log('  node tools/import-draws.js "file.csv" [more…]  [--group "Name"] [--roster season.csv]');
    process.exit(1);
  }
  const groupOverride = flagVal('--group'); // only sensible for a single file
  const rosterPath = flagVal('--roster');

  // Whole-morning ordering: stable sort by the filename's number prefix
  csvPaths.sort((a, b) => runOrderOf(a) - runOrderOf(b));

  const roster = await getRoster(rosterPath);

  const warnings = [];
  const out = [['Group', 'Draw', 'Rider', 'Horse', 'Classes', 'Score', 'Note']];
  const summaries = [];

  for (const csvPath of csvPaths) {
    const rawGroup = groupNameFromFile(csvPath);
    const group = (groupOverride && csvPaths.length === 1)
      ? groupOverride
      : (GROUP_LABELS[rawGroup] || rawGroup);
    const prettied = group !== rawGroup;
    const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
    const header = rows[0];

    const col = name => header.findIndex(h => h.trim() === name);
    const oogIdx = col('OrderOfGo'), riderIdx = col('RiderName'), horseIdx = col('HorseName');
    const dnpIdx = col('DNPCode');
    const abbrCols = header
      .map((h, i) => ({ h: h.trim(), i }))
      .filter(c => /^Abbr\d+$/.test(c.h));
    if (oogIdx === -1 || riderIdx === -1 || abbrCols.length === 0) {
      throw new Error(`${path.basename(csvPath)}: header did not match the OOG export layout`);
    }

    const abbrSeen = new Map(); // "col#:code" → { count, known }
    let count = 0;

    rows.slice(1).forEach(r => {
    let rider = (r[riderIdx] || '').trim();
    const horse = (r[horseIdx] || '').trim();
    const draw = (r[oogIdx] || '').trim();
    if (!rider || !draw) return;

    // Secretary marks 65+ with a trailing " +" — not needed on the arena
    // display, so strip it (the season sheet remains the senior source)
    rider = rider.replace(/\s*\+$/, '').trim();

    // Positional class tokens: column number + code, e.g. "3:L3"
    const tokens = [];
    abbrCols.forEach(c => {
      const code = (r[c.i] || '').trim();
      if (!code) return;
      const colNum = c.h.replace('Abbr', '');
      tokens.push(`${colNum}:${code}`);
      const key = `${colNum}:${code}`;
      const cur = abbrSeen.get(key) || { count: 0, known: code in KNOWN_ABBRS };
      cur.count++;
      abbrSeen.set(key, cur);
    });

    let note = '';
    const dnp = dnpIdx !== -1 ? (r[dnpIdx] || '').trim() : '';
    if (dnp) {
      note = `DNPCode=${dnp} — VERIFY`;
      warnings.push(`Draw ${draw} (${rider}): DNPCode "${dnp}" is set — legacy field, meaning unknown. Ask the secretary.`);
    }

    if (roster && !roster.has(normalize(rider))) {
      for (const [n, canonical] of roster) {
        const d = editDistance(normalize(rider), n);
        if (d > 0 && d <= 2) {
          warnings.push(`Draw ${draw}: "${rider}" is close to season roster's "${canonical}" — same person? Fix the spelling BEFORE pasting.`);
          break;
        }
      }
    }

      out.push([group, draw, rider, horse, tokens.join(' '), '', note]);
      count++;
    });

    summaries.push({ group, rawGroup, prettied, count, abbrSeen, file: path.basename(csvPath) });
  }

  fs.writeFileSync(OUT_PATH, out.map(r => r.join('\t')).join('\n') + '\n');

  summaries.forEach(sm => {
    console.log(`\n=== ${sm.group}  (${sm.count} entries — ${sm.file}) ===`);
    if (!sm.prettied) console.log(`  (no pretty name configured — add '${sm.rawGroup}' to GROUP_LABELS if wanted)`);
    [...sm.abbrSeen.entries()].sort().forEach(([key, v]) => {
      const code = key.split(':')[1];
      const label = v.known ? KNOWN_ABBRS[code] : '*** UNKNOWN — confirm at the show, then add to KNOWN_ABBRS ***';
      console.log(`  ${key.padEnd(10)} x${String(v.count).padEnd(4)} ${label}`);
    });
  });
  if (warnings.length) {
    console.log('\nWARNINGS:');
    warnings.forEach(w => console.log('  ! ' + w));
  } else {
    console.log('\nNo warnings.');
  }
  console.log(`\nPaste-ready rows for ${summaries.length} group(s) written to ${OUT_PATH}`);
  console.log('Copy everything below the header and paste ONCE into the Draws tab — the whole day is queued in run order.');
}

main().catch(err => { console.error(err); process.exit(1); });
