/* ============================================================
   make-snapshot.js — regenerate the offline snapshot
   ============================================================
   Rebuilds js/sample-data.js from a fresh copy of the MASTER
   FULL INFO tab, so the dashboard's offline fallback shows real
   (if possibly outdated) standings instead of placeholder names.

   Run from the project folder:

     node tools/make-snapshot.js                 ← fetches the published CSV
     node tools/make-snapshot.js path/to/file.csv ← uses a local CSV instead

   The snapshot is stored as raw CSV text and parsed at page load
   by the exact same parseCsv/transformSheetRows pipeline as live
   data — one code path, no second data format to maintain.
   ============================================================ */

const fs = require('fs');
const path = require('path');

// Reuse the app's own parser to VALIDATE the snapshot before saving it.
const { parseCsv, transformSheetRows } = require('../js/data.js');

const PUBLISHED_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSwJmc6cAJJqGb4JeR-NSG3H9RTjbrmP3meTDJZ43vcj1NDUTHfZYmw09OFS-SADZDRjFgyEpX0_cBj/pub?gid=648253065&single=true&output=csv';

const OUT_PATH = path.join(__dirname, '..', 'js', 'sample-data.js');

async function getCsvText() {
  const fileArg = process.argv[2];
  if (fileArg) {
    console.log(`Reading local file: ${fileArg}`);
    return fs.readFileSync(fileArg, 'utf8');
  }
  console.log('Fetching published CSV from Google…');
  const resp = await fetch(PUBLISHED_CSV_URL);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

async function main() {
  const csv = await getCsvText();

  // Validate: run it through the real pipeline and report what we found.
  const { shows, byClass } = transformSheetRows(parseCsv(csv));
  const classCount = Object.keys(byClass).length;
  const rowCount = Object.values(byClass).reduce((a, c) => a + c.length, 0);
  console.log(`Validated: ${rowCount} entries, ${classCount} classes, shows: ${shows.map(s => s.label).join(', ')}`);

  // Escape the three things with meaning inside a JS template literal.
  const escaped = csv.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

  const today = new Date().toISOString().slice(0, 10);
  const out = `/* ============================================================
   sample-data.js — OFFLINE SNAPSHOT of the live sheet
   ============================================================
   GENERATED FILE — do not edit by hand.
   Regenerate with:  node tools/make-snapshot.js
   Snapshot of the "MASTER FULL INFO" tab taken ${today}.

   Used only when the live fetch fails: the dashboard parses this
   CSV with the same pipeline as live data and shows it alongside
   a "live fetch failed" warning, so visitors see real (possibly
   outdated) standings rather than nothing.
   ============================================================ */

const SNAPSHOT_DATE = '${today}';

const SNAPSHOT_CSV = \`${escaped}\`;

/* Node.js export guard for tests; browsers skip this. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SNAPSHOT_DATE, SNAPSHOT_CSV };
}
`;

  fs.writeFileSync(OUT_PATH, out);
  console.log(`Wrote ${OUT_PATH} (${out.length.toLocaleString()} chars, snapshot date ${today})`);
}

main().catch(err => { console.error(err); process.exit(1); });
