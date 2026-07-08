/* ============================================================
   check-names.js — data hygiene report (READ-ONLY)
   ============================================================
   Scans the season data for rider and horse names that are
   probably the same person/horse spelled differently — the kind
   of drift that creates duplicate leaderboard rows.

   This tool NEVER changes anything. It writes a report you can
   review, and you make any fixes in the Google Sheet yourself.

   Run from the project folder:

     node tools/check-names.js                  ← fetches the live published CSV
     node tools/check-names.js path/to/file.csv ← checks a local CSV instead

   Output: a summary in the terminal, and the full report saved
   to tools/name-report.txt (overwritten each run, so commit or
   rename one you want to keep).

   Detection methods:
   1. NORMALIZED MATCH — names identical after lowercasing and
      stripping punctuation/spacing ("Dan V Myers" vs "Dan V. Myers",
      "Snap n Bend" vs "Snap N Bend"). Very likely duplicates.
   2. NEAR MATCH — names within edit distance 2 of each other
      ("Gabriela Harmsen" vs "Gabriala Harmsen"). Worth a look,
      but can be false alarms (e.g. deliberately quirky spellings
      like "Freeezing Reyn"), which is why nothing is auto-fixed.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { parseCsv, transformSheetRows, parseGagTracker } = require('../js/data.js');

const PUBLISHED_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSwJmc6cAJJqGb4JeR-NSG3H9RTjbrmP3meTDJZ43vcj1NDUTHfZYmw09OFS-SADZDRjFgyEpX0_cBj/pub?gid=648253065&single=true&output=csv';

const GAG_TRACKER_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSTVxclMfxxGILoFaHAsIWzB7hABrnSCT-p4noo0YoIPdEe77C3v70lAOkofWKhZrUoKC776YlZRXYm/pub?gid=1641467833&single=true&output=csv';

const REPORT_PATH = path.join(__dirname, 'name-report.txt');

/** Lowercase, drop everything but letters/digits — the "fingerprint" of a name */
function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Levenshtein edit distance: the minimum number of single-character
 * insertions, deletions, or substitutions to turn a into b.
 * Classic dynamic-programming implementation.
 */
function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99; // can't be within 2 — skip the work
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,        // delete
        cur[j - 1] + 1,     // insert
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // substitute
      );
    }
    prev = cur;
  }
  return prev[n];
}

/** Season CSV: local file as arg 1, or fetched live */
async function getCsvText() {
  const fileArg = process.argv[2];
  if (fileArg) {
    console.log(`Reading local season file: ${fileArg}`);
    return fs.readFileSync(fileArg, 'utf8');
  }
  console.log('Fetching published season CSV from Google…');
  const resp = await fetch(PUBLISHED_CSV_URL);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

/** GaG tracker CSV: local file as arg 2, or fetched live. Optional —
    if it can't be loaded, the tracker cross-check section is skipped. */
async function getTrackerCsvText() {
  const fileArg = process.argv[3];
  if (fileArg) {
    console.log(`Reading local tracker file: ${fileArg}`);
    return fs.readFileSync(fileArg, 'utf8');
  }
  console.log('Fetching GaG Tracker CSV from Google…');
  const resp = await fetch(GAG_TRACKER_CSV_URL);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

async function main() {
  const csv = await getCsvText();
  const { byClass } = transformSheetRows(parseCsv(csv));

  // Build an index: every distinct spelling → the classes it appears in.
  // Kind is 'rider' or 'horse' so the two namespaces don't cross-match.
  const seen = new Map(); // key: kind + '|' + exact name → { kind, name, classes:Set }
  Object.entries(byClass).forEach(([cls, entries]) => {
    entries.forEach(e => {
      [['rider', e.rider], ['horse', e.horse]].forEach(([kind, name]) => {
        if (!name) return;
        const key = kind + '|' + name;
        if (!seen.has(key)) seen.set(key, { kind, name, classes: new Set() });
        seen.get(key).classes.add(cls);
      });
    });
  });

  const lines = [];
  const log = (l = '') => { lines.push(l); console.log(l); };

  log(`Name hygiene report — generated ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`);
  log(`Names scanned: ${seen.size} distinct spellings (riders + horses)`);
  log('This report is informational only — nothing has been changed.');
  log();

  for (const kind of ['rider', 'horse']) {
    const items = [...seen.values()].filter(v => v.kind === kind);
    log(`===== ${kind.toUpperCase()}S =====`);

    // 1. Normalized matches: same fingerprint, different spelling
    const byNorm = new Map();
    items.forEach(v => {
      const n = normalize(v.name);
      if (!byNorm.has(n)) byNorm.set(n, []);
      byNorm.get(n).push(v);
    });
    let exact = 0;
    byNorm.forEach(group => {
      if (group.length < 2) return;
      exact++;
      log(`  LIKELY DUPLICATE (differ only in punctuation/case/spacing):`);
      group.forEach(v => log(`      "${v.name}"  — appears in: ${[...v.classes].join(', ')}`));
    });
    if (!exact) log('  No punctuation/case duplicates found.');
    log();

    // 2. Near matches: different fingerprints, edit distance <= 2
    const norms = [...byNorm.keys()].filter(n => n.length > 4);
    let near = 0;
    for (let i = 0; i < norms.length; i++) {
      for (let j = i + 1; j < norms.length; j++) {
        const d = editDistance(norms[i], norms[j]);
        if (d > 0 && d <= 2) {
          near++;
          const a = byNorm.get(norms[i])[0], b = byNorm.get(norms[j])[0];
          log(`  POSSIBLE MATCH (edit distance ${d} — verify before changing anything):`);
          log(`      "${a.name}"  — ${[...a.classes].join(', ')}`);
          log(`      "${b.name}"  — ${[...b.classes].join(', ')}`);
        }
      }
    }
    if (!near) log('  No near-matches found.');
    log();
  }

  // ----- GaG tracker cross-check ---------------------------------------
  // The GaG view joins tracker riders to season riders BY NAME. A spelling
  // mismatch silently splits a rider's lifetime total — a 45-point rider
  // could cross 50 invisibly. So: every tracker name that ALMOST matches a
  // season rider name gets flagged.
  log('===== GAG TRACKER vs SEASON RIDERS =====');
  try {
    const tracker = parseGagTracker(parseCsv(await getTrackerCsvText()));
    const seasonRiders = new Map(); // normalized → exact spelling
    [...seen.values()].filter(v => v.kind === 'rider')
      .forEach(v => seasonRiders.set(normalize(v.name), v.name));

    // Duplicates INSIDE the tracker
    const trackNorms = new Map();
    tracker.forEach(t => {
      const n = normalize(t.rider);
      if (trackNorms.has(n)) log(`  DUPLICATE TRACKER ROW: "${trackNorms.get(n)}" and "${t.rider}"`);
      else trackNorms.set(n, t.rider);
    });

    // Tracker vs season: exact-normalized match = fine; near match = flag.
    // No match at all is fine too — most tracker riders are archived.
    let flagged = 0;
    tracker.forEach(t => {
      const n = normalize(t.rider);
      if (seasonRiders.has(n)) return; // joined correctly
      for (const [sn, exact] of seasonRiders) {
        const d = editDistance(n, sn);
        if (d > 0 && d <= 2) {
          flagged++;
          log(`  JOIN RISK (edit distance ${d}) — these will NOT merge:`);
          log(`      tracker: "${t.rider}"  (${t.prev} pts carryover)`);
          log(`      season:  "${exact}"`);
        }
      }
    });
    if (!flagged) log('  No tracker/season near-mismatches found.');
  } catch (err) {
    log(`  Tracker unavailable — cross-check skipped (${err.message})`);
  }
  log();

  fs.writeFileSync(REPORT_PATH, lines.join('\n') + '\n');
  console.log(`Full report saved to ${REPORT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
