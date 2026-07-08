/* ============================================================
   transfer-report.js — evening score-transfer checklist
   ============================================================
   Turns a show day's Draws data into an organized checklist for
   typing scores into the season entry sheet: one section per
   season class, riders alphabetized, with flags for rider+horse
   combos that don't exist in the season data yet (new row needed).

   This replaces "hunting" — read down the list, type down the tab.
   (A future version may write the entry sheet directly; this
   report is the safe first step.)

   Run from the project folder:

     node tools/transfer-report.js                 ← fetches live Draws data
     node tools/transfer-report.js --file day.tsv  ← or a saved TSV/CSV export

   Output: terminal + tools/transfer-report.txt

   IMPORTANT — CLASS_MAP below is the brain: it maps each group's
   positional class tokens to season entry-sheet class names. Only
   mapped tokens are reported; everything else lands in a "needs
   mapping" section instead of being guessed. Fill it in as codes
   are confirmed (same campaign as KNOWN_ABBRS / LEVEL_LABELS).
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { parseCsv, transformSheetRows } = require('../js/data.js');

/** The Show Day sheet's Apps Script endpoint (same one arena.html uses) */
const SHOW_DAY_URL =
  'https://script.google.com/macros/s/AKfycbw2QJ_NOzHqAWXpS6edKpYKG1KIYdQz3Xao8dqhmTDsANiTHUYELqhG9zewKR3svyqhsA/exec';

const PUBLISHED_SEASON_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSwJmc6cAJJqGb4JeR-NSG3H9RTjbrmP3meTDJZ43vcj1NDUTHfZYmw09OFS-SADZDRjFgyEpX0_cBj/pub?gid=648253065&single=true&output=csv';

/**
 * (pretty group name) → (token → SEASON CLASS NAME as it appears in
 * MASTER FULL INFO's Class column). Tokens are positional per group,
 * so the same code can mean different classes in different groups —
 * which is why the map is two-level.
 *
 * DRAFT entries below are best guesses pending Mike's club/national
 * confirmations — verify before relying on a section.
 */
const CLASS_MAP = {
  'Nov Horse NP: L1, L2, L3': {
    '1:NHN1': 'NOVICE HORSE NON PRO L1',
    '2:NHn2': 'NOVICE HORSE NP L2',
    '3:L3': 'NOVICE HORSE NP L3',
    '4:L1': 'NOVICE HORSE NON PRO L1',
    '5:L2': 'NOVICE HORSE NP L2',
    '6:L3': 'NOVICE HORSE NP L3',
  },
  'Green Reiner / Green as Grass': {
    '1:GR': 'GREEN AS GRASS',
    // 2:G1 / 3:G2 are national Green Reiner — not tracked by the club,
    // deliberately unmapped so they surface in "not transferred"
  },
};

const OUT_PATH = path.join(__dirname, 'transfer-report.txt');

const normalize = n => n.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Parse Draws data from JSON (Apps Script), TSV, or CSV */
function parseDraws(text) {
  const t = text.trimStart();
  if (t.startsWith('[')) return JSON.parse(text);
  const firstLine = text.split('\n', 1)[0];
  if (firstLine.includes('\t')) {
    return text.split('\n').filter(l => l.trim() !== '').map(l => l.split('\t'));
  }
  return parseCsv(text);
}

async function getDrawsGrid() {
  const i = process.argv.indexOf('--file');
  if (i !== -1) {
    const f = process.argv[i + 1];
    console.log(`Reading local file: ${f}`);
    return parseDraws(fs.readFileSync(f, 'utf8'));
  }
  console.log('Fetching Show Day data…');
  const resp = await fetch(SHOW_DAY_URL);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return parseDraws(await resp.text());
}

/** Season combos: Set of "class|rider|horse" (normalized) for new-row
    detection. Live fetch by default; --roster file.csv for offline. */
async function getSeasonCombos() {
  try {
    const i = process.argv.indexOf('--roster');
    let text;
    if (i !== -1) {
      text = fs.readFileSync(process.argv[i + 1], 'utf8');
    } else {
      const resp = await fetch(PUBLISHED_SEASON_CSV_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      text = await resp.text();
    }
    const { byClass } = transformSheetRows(parseCsv(text));
    const combos = new Set();
    Object.entries(byClass).forEach(([cls, entries]) =>
      entries.forEach(e => combos.add(`${cls}|${normalize(e.rider)}|${normalize(e.horse)}`)));
    return combos;
  } catch (err) {
    console.log(`(season data unavailable — new-combo flags skipped: ${err.message})`);
    return null;
  }
}

async function main() {
  const grid = await getDrawsGrid();
  const combos = await getSeasonCombos();

  const header = grid[0].map(h => String(h).trim());
  const idx = n => header.indexOf(n);
  const gi = idx('Group'), ri = idx('Rider'), hi = idx('Horse'),
        ci = idx('Classes'), si = idx('Score');
  if (gi === -1 || ri === -1 || ci === -1 || si === -1) {
    throw new Error('Data did not match the Draws layout (need Group/Rider/Classes/Score columns)');
  }

  const byClass = new Map();   // season class → [{rider, horse, score, isNew}]
  const unmapped = new Map();  // "group :: token" → count (scores that were NOT transferred)

  grid.slice(1).forEach(r => {
    const rider = (r[ri] || '').trim();
    const score = String(r[si] || '').trim();
    if (!rider || score === '') return;          // drags, unscored, markers
    if (score.toUpperCase() === 'SC') return;    // scratches: nothing to enter
    const group = (r[gi] || '').trim();
    const horse = (r[hi] || '').trim();
    const tokens = (r[ci] || '').trim().split(/\s+/).filter(Boolean);

    // One run may carry several tokens mapping to the SAME class
    // (club + national pairs) — the score goes in once per class.
    const seenClasses = new Set();
    tokens.forEach(t => {
      const cls = (CLASS_MAP[group] || {})[t];
      if (!cls) {
        const key = `${group} :: ${t}`;
        unmapped.set(key, (unmapped.get(key) || 0) + 1);
        return;
      }
      if (seenClasses.has(cls)) return;
      seenClasses.add(cls);
      if (!byClass.has(cls)) byClass.set(cls, []);
      const isNew = combos ? !combos.has(`${cls}|${normalize(rider)}|${normalize(horse)}`) : false;
      byClass.get(cls).push({ rider, horse, score, isNew });
    });
  });

  const lines = [];
  const log = (l = '') => { lines.push(l); console.log(l); };

  log(`Score transfer checklist — ${new Date().toISOString().slice(0, 10)}`);
  log('Read down each section, type down the matching class tab.');
  log('NEW ROW = this rider+horse combo is not in the season sheet yet.');
  log('');

  [...byClass.keys()].sort().forEach(cls => {
    const rows = byClass.get(cls).sort((a, b) => a.rider.localeCompare(b.rider) || a.horse.localeCompare(b.horse));
    log(`===== ${cls}  (${rows.length} scores) =====`);
    rows.forEach(x => {
      log(`  ${(x.rider + ' — ' + x.horse).padEnd(48)} ${String(x.score).padStart(5)}${x.isNew ? '   << NEW ROW' : ''}`);
    });
    log('');
  });

  if (unmapped.size) {
    log('===== NOT TRANSFERRED (no CLASS_MAP entry — intentional for non-club classes) =====');
    [...unmapped.entries()].sort().forEach(([k, n]) => log(`  ${k}  (${n} scores)`));
    log('');
  }
  if (!byClass.size) log('No transferable scores found — is CLASS_MAP filled in for these groups?');

  fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n');
  console.log(`Saved to ${OUT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
