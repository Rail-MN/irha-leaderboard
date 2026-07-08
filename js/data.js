/* ============================================================
   data.js — the DATA LAYER (live Google Sheets edition)
   ============================================================
   This file's ONLY job: provide season data in a standard shape.
   The rest of the app calls getSeasonData() and never knows or
   cares where the data came from.

   Source: the "MASTER FULL INFO" tab of the IRHA points sheet,
   fetched as CSV through Google's public gviz endpoint (works
   for any sheet shared "anyone with the link can view" — no API
   key, no backend). If that fails we try the published-to-web
   CSV URL; if both fail we render the offline snapshot in
   sample-data.js (real data, saved by tools/make-snapshot.js).

   Standard shape returned by getSeasonData():
   {
     season:  { title, subtitle, shows: [{label, full}, ...] },
     classes: {
       'Group Name': {
         levels: ['Level 1', ...],
         data: { 'Level 1': [ {rider, horse, senior, scores:[...]}, ... ] }
       }
     }
   }

   Score conventions (one entry per show, in show order):
   - a number (e.g. 71.5) = competed, that was the score
   - 0                    = competed but scored zero (e.g. touched
                            the horn, off-pattern): counts as
                            participation, earns no points
   - null                 = did not participate in that show
   Cell shorthand also accepted: "SC" (scratch) → null;
   "NS" / "DQ" (no score / disqualified) → 0.

   Rider conventions:
   - A trailing "+" on a rider's name in the sheet means the rider
     is 65 or older as of Jan 1 (may hold the saddle horn). We
     strip it from the name and set senior: true instead.
   ============================================================ */

// ---- Configuration -------------------------------------------------------

const SHEET_ID = '1iP-ebybGMnD0vCfuyzCkG-57gk6DethBkJxqoBl1XWU';
const SHEET_TAB = 'MASTER FULL INFO';
const SEASON_TITLE = 'IRHA — 2026 Season';

/** Optional backup URL. If the direct sheet fetch is blocked by the
    browser (CORS), publish the tab instead: in Sheets, File → Share →
    Publish to web → choose "MASTER FULL INFO" + "Comma-separated values
    (.csv)" → paste the generated URL here. Published URLs always allow
    browser access. Leave '' to use only the direct fetch. */
const PUBLISHED_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSwJmc6cAJJqGb4JeR-NSG3H9RTjbrmP3meTDJZ43vcj1NDUTHfZYmw09OFS-SADZDRjFgyEpX0_cBj/pub?gid=648253065&single=true&output=csv';

/** Green as Grass: the graduation class. Season scores arrive through
    MASTER FULL INFO like any class; lifetime carryover lives in its own
    tracker sheet (Rider | Previous Points | Last Shown, where Last Shown
    is a year or "UNK" for riders not seen recently). */
const GAG_CLASS = 'GREEN AS GRASS';
const GAG_NAV_LABEL = 'Green as Grass';
const GAG_TRACKER_SHEET_ID = '1SX3pInYaUqmaXPxiTDtUJPKB95Z27a6DrIKQxCbfCTA';
const GAG_TRACKER_TAB = 'GaG Tracker';
/** Published-to-web CSV for the tracker — tried first (best CORS
    behavior); the direct sheet fetch below is the fallback. */
const GAG_TRACKER_PUBLISHED_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSTVxclMfxxGILoFaHAsIWzB7hABrnSCT-p4noo0YoIPdEe77C3v70lAOkofWKhZrUoKC776YlZRXYm/pub?gid=1641467833&single=true&output=csv';

/** Optional pretty names for the show columns found in the sheet header.
    The sheet calls them "Apr", "Jun", etc. — map them to fuller labels
    here if desired, e.g. { Apr: 'S. Jordan Apr' }. Unmapped labels pass
    through unchanged. */
const SHOW_LABELS = {};

/**
 * How the sheet's flat class names group into the two-level navigation
 * (class group buttons on top, level buttons below). Each entry is:
 *   [exact class name in the sheet, level label shown in the UI]
 * Order here = display order. Any class found in the sheet but not
 * listed here still shows up, as its own single-level group — so a new
 * class added to the sheet never silently disappears.
 */
const CLASS_GROUPS = [
  { group: 'Open', levels: [
    ['OPEN', 'Open'],
    ['INTERMEDIATE OPEN', 'Intermediate'],
    ['LIMITED OPEN', 'Limited'],
  ] },
  { group: 'Non Pro', levels: [
    ['NON PRO', 'Non Pro'],
    ['INTERMEDIATE NON PRO', 'Intermediate'],
    ['LIMITED NON PRO', 'Limited'],
    ['PRIME TIME NON PRO', 'Prime Time'],
    ['MASTERS NON PRO', 'Masters'],
  ] },
  { group: 'Rookie', levels: [
    ['ROOKIE LEVEL 1', 'Level 1'],
    ['ROOKIE LEVEL 2', 'Level 2'],
    ['PRIME TIME ROOKIE', 'Prime Time'],
  ] },
  { group: 'Youth', levels: [
    ['YOUTH 10 & UNDER', '10 & Under'],
    ['YOUTH 13 & UNDER', '13 & Under'],
    ['YOUTH 14 TO 18', '14–18'],
  ] },
  { group: 'Novice Horse Open', levels: [
    ['NOVICE HORSE OPEN L1', 'Level 1'],
    ['NOVICE HORSE OPEN L2', 'Level 2'],
  ] },
  { group: 'Novice Horse Non Pro', levels: [
    ['NOVICE HORSE NON PRO L1', 'Level 1'],
    ['NOVICE HORSE NP L2', 'Level 2'],
    ['NOVICE HORSE NP L3', 'Level 3'],
  ] },
  { group: 'Mares', levels: [
    ['MARES OPEN', 'Open'],
    ['MARES NON PRO', 'Non Pro'],
  ] },
  { group: 'Stallions & Geldings', levels: [
    ['STALLIONS GELDINGS OPEN', 'Open'],
    ['STALLIONS GELDINGS NON PRO', 'Non Pro'],
  ] },
  { group: 'Green Horse', levels: [
    ['GREEN HORSE OPEN', 'Open'],
    ['GREEN HORSE NP', 'Non Pro'],
  ] },
  // GaG renders a special graduation-progress view (see main.js/render.js)
  { group: GAG_NAV_LABEL, levels: [
    [GAG_CLASS, 'All'],
  ] },
];

// ---- CSV parsing ---------------------------------------------------------

/**
 * Minimal CSV parser that handles quoted fields (Google quotes every
 * field), commas inside quotes, escaped quotes (""), and \r\n endings.
 * Returns an array of rows, each row an array of string fields.
 *
 * Why not String.split(',')? Because a horse named "Slides, Naturally"
 * would break it. Parsing character-by-character with an "inside
 * quotes?" flag is the standard way to do this correctly.
 */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // "" = literal quote
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ---- Transforming sheet rows into the standard shape ---------------------

/**
 * Read the parsed CSV grid and extract what we actually need:
 * rider, horse, senior flag, class, and the raw scores per show.
 * We deliberately IGNORE the sheet's Place/Points/Total columns —
 * scoring.js recomputes all of that, so the JS is the single
 * source of truth for the rules.
 *
 * The show list is discovered from the header (any column named
 * "<something> Score"), so adding a 5th show to the sheet would
 * just work with no code change.
 */
function transformSheetRows(rows) {
  const header = rows[0];

  const showCols = [];
  header.forEach((h, i) => {
    if (/ Score$/.test(h)) showCols.push({ idx: i, label: h.replace(/ Score$/, '') });
  });
  const riderIdx = header.indexOf('Rider');
  const horseIdx = header.indexOf('Horse');
  const classIdx = header.indexOf('Class');
  if (riderIdx === -1 || classIdx === -1 || showCols.length === 0) {
    throw new Error('Sheet header did not match the expected MASTER FULL INFO layout');
  }

  const byClass = {}; // { 'OPEN': [entry, entry, ...], ... }

  rows.slice(1).forEach(r => {
    let rider = (r[riderIdx] || '').trim();
    const horse = (r[horseIdx] || '').trim();
    const cls = (r[classIdx] || '').trim();
    if (!rider || !cls) return; // skip blank/partial rows

    // Trailing "+" = 65 or older (may hold the saddle horn).
    // Only a TRAILING + is the marker; a + elsewhere in the name is left alone.
    const senior = /\+$/.test(rider);
    if (senior) rider = rider.replace(/\+$/, '').trim();

    const scores = showCols.map(c => {
      const v = (r[c.idx] || '').trim();
      if (v === '') return null;          // blank = didn't participate
      // Status shorthand (rare, but must not be misread):
      //   SC = scratch — never ran, same as blank
      //   NS/DQ = no score / disqualified — DID participate, earns nothing
      const u = v.toUpperCase();
      if (u === 'SC') return null;
      if (u === 'NS' || u === 'DQ') return 0;
      const n = parseFloat(v);
      return Number.isNaN(n) ? null : n;  // "0" parses to 0 = participated, zero score
    });

    if (!byClass[cls]) byClass[cls] = [];
    byClass[cls].push({ rider, horse, senior, scores });
  });

  const shows = showCols.map(c => ({
    label: SHOW_LABELS[c.label] || c.label,
    full: SHOW_LABELS[c.label] || c.label,
  }));

  // A show counts as "completed" if anyone anywhere has a score in it.
  // Views use this for the mid-season qualification rule.
  const all = Object.values(byClass).flat();
  const completedShows = shows.filter((_, si) => all.some(e => e.scores[si] !== null)).length;

  return { shows, byClass, completedShows };
}

/**
 * Parse the GaG Tracker tab: one row per rider with their lifetime
 * carryover. Header matching is forgiving — the "Previous Points" column
 * is found by prefix so the documentation in its header text can change.
 */
function parseGagTracker(rows) {
  const header = rows[0];
  if (!header) throw new Error('tracker CSV was empty');
  const riderIdx = header.findIndex(h => h.trim() === 'Rider');
  const prevIdx = header.findIndex(h => h.trim().startsWith('Previous Points'));
  const lastIdx = header.findIndex(h => h.trim().startsWith('Last Shown'));
  if (riderIdx === -1 || prevIdx === -1 || lastIdx === -1) {
    throw new Error('GaG Tracker header did not match (need Rider / Previous Points / Last Shown)');
  }
  const out = [];
  rows.slice(1).forEach(r => {
    const rider = (r[riderIdx] || '').trim();
    if (!rider) return;
    const prev = parseFloat((r[prevIdx] || '').trim());
    out.push({
      rider,
      prev: Number.isNaN(prev) ? 0 : prev,
      lastShown: (r[lastIdx] || '').trim().toUpperCase() || 'UNK',
    });
  });
  return out;
}

/**
 * Fold the flat class list into the grouped navigation structure using
 * CLASS_GROUPS. Classes in the sheet that aren't in the config become
 * their own single-level group (defensive: new classes never vanish).
 */
function groupClasses(byClass) {
  const classes = {};
  const used = new Set();

  CLASS_GROUPS.forEach(g => {
    const levels = [];
    const data = {};
    g.levels.forEach(([sheetName, levelLabel]) => {
      if (byClass[sheetName]) {
        levels.push(levelLabel);
        data[levelLabel] = byClass[sheetName];
        used.add(sheetName);
      }
    });
    if (levels.length) classes[g.group] = { levels, data };
  });

  // Anything not covered by the config
  Object.keys(byClass).forEach(cls => {
    if (!used.has(cls)) classes[cls] = { levels: ['All'], data: { 'All': byClass[cls] } };
  });

  return classes;
}

// ---- The public entry point ----------------------------------------------

/** Fetch one URL and return its body text, or throw with a useful message. */
async function fetchCsvText(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.text();
}

/**
 * Fetch live data; fall back to sample data if anything goes wrong.
 * Tries the direct sheet endpoint first, then the published CSV URL
 * (if configured). On total failure the sample data is returned with
 * season.error set, so the page can show WHAT went wrong instead of
 * hiding it in the developer console.
 */
async function getSeasonData() {
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}`;

  const attempts = []; // remember each failure for the error banner
  const urls = [gvizUrl];
  if (PUBLISHED_CSV_URL) urls.push(PUBLISHED_CSV_URL);

  for (const url of urls) {
    try {
      const text = await fetchCsvText(url);
      const { shows, byClass, completedShows } = transformSheetRows(parseCsv(text));
      // GaG always appears in the nav, even before any season scores exist
      if (!byClass[GAG_CLASS]) byClass[GAG_CLASS] = [];

      // The tracker is a separate, independent fetch: if it fails, the
      // main dashboard still works and the GaG view explains what's missing.
      // Same fallback-chain pattern as the main season fetch
      let gag = { carryover: null, error: null };
      const gvizTrackerUrl =
        `https://docs.google.com/spreadsheets/d/${GAG_TRACKER_SHEET_ID}/gviz/tq` +
        `?tqx=out:csv&sheet=${encodeURIComponent(GAG_TRACKER_TAB)}`;
      const trackerUrls = GAG_TRACKER_PUBLISHED_CSV_URL
        ? [GAG_TRACKER_PUBLISHED_CSV_URL, gvizTrackerUrl]
        : [gvizTrackerUrl];
      for (const tUrl of trackerUrls) {
        try {
          gag.carryover = parseGagTracker(parseCsv(await fetchCsvText(tUrl)));
          gag.error = null;
          break;
        } catch (err) {
          console.error('GaG tracker fetch failed:', tUrl, err);
          gag.error = err.message;
        }
      }

      return {
        gag,
        season: {
          title: SEASON_TITLE,
          subtitle: `Must participate in at least 3 out of ${shows.length} shows for a given class ` +
            `to qualify for year-end awards. For ${shows.length}-show participants, ` +
            `the lowest score of the season is dropped.`,
          shows,
          completedShows,
        },
        classes: groupClasses(byClass),
      };
    } catch (err) {
      // "TypeError: Failed to fetch" with no further detail usually means
      // the browser blocked the response (CORS) or there is no network.
      attempts.push(`${url.slice(0, 60)}… → ${err.message}`);
      console.error('Fetch attempt failed:', url, err);
    }
  }

  // Total failure → parse the offline snapshot (js/sample-data.js, real
  // data saved by tools/make-snapshot.js) through the SAME pipeline as
  // live data. Visitors see real standings — possibly outdated — plus a
  // clear warning in the title and the red error banner.
  const { shows, byClass, completedShows } = transformSheetRows(parseCsv(SNAPSHOT_CSV));
  if (!byClass[GAG_CLASS]) byClass[GAG_CLASS] = [];
  return {
    gag: { carryover: null, error: 'offline snapshot' },
    season: {
      title: `${SEASON_TITLE} — LIVE FETCH FAILED`,
      subtitle: `Showing saved snapshot from ${SNAPSHOT_DATE} — standings may be outdated`,
      shows,
      completedShows,
      error: attempts.join('  |  '),
    },
    classes: groupClasses(byClass),
  };
}

/* Node.js export guard for command-line tests; browsers skip this. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseCsv, transformSheetRows, groupClasses, parseGagTracker, CLASS_GROUPS, getSeasonData };
}
