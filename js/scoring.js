/* ============================================================
   scoring.js — the RULES ENGINE
   ============================================================
   Pure logic, zero DOM code. These functions take data in and
   return data out — they never touch the page. That's what
   makes them reusable by every future view (arena display,
   livestream scene) AND testable from the command line.

   Score conventions (must match data.js):
   - number > 0 : competed, real score
   - 0          : competed, zero score (DQ/off-pattern) —
                  counts as participation, earns 0 points, no placement
   - null       : did not participate
   ============================================================ */

/** Points paid per placement: 1st = 10 ... 10th = 1, 11th+ = 0 */
const PLACE_PTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

/**
 * Compute placement and points for every entry at ONE show.
 *
 * Tie rule: tied competitors share the placement label ("2-T") and split
 * the pooled points for the places they occupy. Example: three-way tie
 * for 2nd occupies places 2, 3, 4 → (9+8+7) / 3 = 8.0 each.
 *
 * @param {Array}  entries - [{scores: [...]}, ...]
 * @param {number} showIdx - which show (column) to score
 * @returns {{pts: Array, place: Array}} parallel to entries;
 *          null = didn't compete, 0 pts + null place = zero score
 */
function getPlacePts(entries, showIdx) {
  // Only real (non-zero) scores compete for placements
  const present = entries
    .map((e, i) => ({ i, s: e.scores[showIdx] }))
    .filter(x => x.s !== null && x.s > 0);
  present.sort((a, b) => b.s - a.s); // highest score first

  const pts = new Array(entries.length).fill(null);
  const place = new Array(entries.length).fill(null);

  // Walk the sorted list, handling each tie-group as a block
  let j = 0;
  while (j < present.length) {
    const s = present[j].s;
    let k = j;
    while (k < present.length && present[k].s === s) k++; // find end of tie group

    const cnt = k - j;     // how many are tied
    const pos = j + 1;     // the placement they share (1-based)

    // Pool the points for every place the group occupies, then split evenly
    let tot = 0;
    for (let p = pos; p < pos + cnt; p++) {
      if (p <= 10) tot += PLACE_PTS[p - 1]; // places past 10th add nothing
    }
    const each = parseFloat((tot / cnt).toFixed(2));
    const lbl = cnt > 1 ? `${pos}-T` : `${pos}`; // "-T" marks a tie

    for (let m = j; m < k; m++) {
      pts[present[m].i] = each;
      place[present[m].i] = lbl;
    }
    j = k;
  }

  // Zero scores: participated, but no placement and no points
  entries.forEach((e, i) => {
    if (e.scores[showIdx] === 0) {
      pts[i] = 0;
      place[i] = null;
    }
  });

  return { pts, place };
}

/**
 * Build the full computed row for every entry across the season:
 * per-show points/placements, participation count, qualification,
 * the dropped show (if any), and the year-end total.
 *
 * Rules applied here:
 * - Qualification: at least 3 shows entered (a 0 score counts)
 * - Mid-season rule: an entry is only marked DNQ when qualifying has
 *   become mathematically IMPOSSIBLE (shows attended + shows remaining
 *   < 3). Early in the season everyone is ranked normally on running
 *   totals, since nobody can have 3 shows after show two.
 * - Low-score drop: 4-show participants drop their lowest POINTS result;
 *   3-show participants are exempt (all 3 count)
 *
 * @param {Array}  entries        - raw entries from the data layer
 * @param {number} numShows       - shows in the season (e.g. 4)
 * @param {number} completedShows - shows already held (defaults to all,
 *                                  i.e. end-of-season behavior)
 */
function buildRows(entries, numShows, completedShows = numShows) {
  // Score every show once up front
  const showData = [];
  for (let si = 0; si < numShows; si++) showData.push(getPlacePts(entries, si));

  return entries.map((e, ei) => {
    const showPts = showData.map(sd => sd.pts[ei]);
    const showPlace = showData.map(sd => sd.place[ei]);

    // Participation = any recorded score, including 0
    const participated = e.scores.slice(0, numShows).filter(s => s !== null).length;
    const qualified = participated >= 3;
    const remaining = numShows - completedShows;
    const dnq = !qualified && (participated + remaining < 3);

    // Running total is computed for everyone; the views decide whether
    // to display it (DNQ rows show a dash).
    let dropIdx = -1;
    let total = 0;
    if (participated === numShows) {
      // Full participation → find and drop the lowest points result
      let minV = Infinity, minI = -1;
      showPts.forEach((p, i) => {
        if (p !== null && p < minV) { minV = p; minI = i; }
      });
      dropIdx = minI;
    }
    showPts.forEach((p, i) => {
      if (p !== null && i !== dropIdx) total += p;
    });
    total = parseFloat(total.toFixed(2)); // guard against float dust like 26.999999

    // Spread copies the original entry fields, then adds the computed ones
    return { ...e, showPts, showPlace, participated, qualified, dnq, dropIdx, total };
  });
}

/**
 * Sort rankable entries by total (descending) and assign ranks.
 * Tied totals share a rank; the next rank skips accordingly (1, 1, 3...).
 * DNQ entries (qualification impossible) get rank null and sort to the
 * bottom, below every ranked entry.
 */
function rankRows(rows) {
  const q = rows.filter(r => !r.dnq).sort((a, b) => b.total - a.total);
  const u = rows.filter(r => r.dnq);

  let rank = 1;
  for (let i = 0; i < q.length;) {
    let j = i;
    while (j < q.length && q[j].total === q[i].total) j++; // tie group
    for (let k = i; k < j; k++) q[k].rank = rank;
    rank += (j - i);
    i = j;
  }
  u.forEach(r => { r.rank = null; });

  return [...q, ...u];
}

/* Node.js export guard for command-line tests; browsers skip this. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PLACE_PTS, getPlacePts, buildRows, rankRows };
}
