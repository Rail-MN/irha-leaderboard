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


/* ============================================================
   GREEN AS GRASS — special scoring
   ============================================================
   GaG has no year-end standings. Instead, RIDERS (not rider+horse
   combos) accumulate points toward a 50-point "graduation" and a
   belt buckle. Per-show scoring differs from standard classes:

   - Placing points: 1st = 8, 2nd = 7 ... 8th = 1, 9th+ = 0.
     Ties pool and split, same mechanism as standard classes.
   - Beat bonus: riders with a score ABOVE 0 also earn 0.5 points
     per rider they beat (strictly lower score, including riders
     who scored 0) in that show.
   - Zero scores: shown with their (last) placement, but earn
     nothing — no placing points, no bonus.
   ============================================================ */

/** GaG placing points: 1st = 8 ... 8th = 1, 9th+ = 0 */
const GAG_PLACE_PTS = [8, 7, 6, 5, 4, 3, 2, 1];

/** Bonus per rider beaten (score strictly lower), only for scores > 0 */
const GAG_BEAT_BONUS = 0.5;

/**
 * Green as Grass placement and points for ONE show.
 * Same shape as getPlacePts, so future views can swap it in per class.
 */
function getPlacePtsGreenAsGrass(entries, showIdx) {
  // Unlike standard classes, zero scores ARE ranked here (they take
  // last place) — they just earn no points.
  const present = entries
    .map((e, i) => ({ i, s: e.scores[showIdx] }))
    .filter(x => x.s !== null);
  present.sort((a, b) => b.s - a.s);

  const pts = new Array(entries.length).fill(null);
  const place = new Array(entries.length).fill(null);

  let j = 0;
  while (j < present.length) {
    const s = present[j].s;
    let k = j;
    while (k < present.length && present[k].s === s) k++;

    const cnt = k - j;
    const pos = j + 1;

    // Pool placing points across the tie group's places, split evenly
    let base = 0;
    for (let p = pos; p < pos + cnt; p++) {
      if (p <= GAG_PLACE_PTS.length) base += GAG_PLACE_PTS[p - 1];
    }
    const baseEach = base / cnt;

    // Beat bonus: everyone below this tie group in the sorted list
    // scored strictly lower (ties don't beat each other)
    const beaten = present.length - k;

    const lbl = cnt > 1 ? `${pos}-T` : `${pos}`;
    for (let m = j; m < k; m++) {
      place[present[m].i] = lbl;
      pts[present[m].i] = s > 0
        ? parseFloat((baseEach + GAG_BEAT_BONUS * beaten).toFixed(2))
        : 0; // zero score: placed, but earns nothing
    }
    j = k;
  }

  return { pts, place };
}


/** Lifetime points needed to graduate and earn the belt buckle */
const GAG_GRADUATION_PTS = 50;

/**
 * Rider-level graduation progress: sums this season's GaG points per
 * RIDER (across all their horses), adds lifetime carryover from the
 * tracker, and flags graduates. Names are joined on a normalized key
 * (lowercase, punctuation stripped) so minor spelling drift between the
 * tracker and entry sheet doesn't split a rider's total.
 *
 * @param {Array}      entries   - GaG rider+horse entries with scores
 * @param {Array|null} carryover - [{rider, prev, lastShown, archived}] from tracker
 * @param {number}     numShows  - shows in the season
 * @returns rows sorted by lifetime total, each:
 *   { rider, prev, seasonPts, total, graduated, newGrad, active, archived }
 */
function buildGagProgress(entries, carryover, numShows) {
  const keyOf = n => n.toLowerCase().replace(/[^a-z0-9]/g, '');

  const showData = [];
  for (let si = 0; si < numShows; si++) showData.push(getPlacePtsGreenAsGrass(entries, si));

  const byRider = new Map();
  entries.forEach((e, ei) => {
    let pts = 0, shows = 0;
    for (let si = 0; si < numShows; si++) {
      const p = showData[si].pts[ei];
      if (p !== null) { pts += p; shows++; }
    }
    const k = keyOf(e.rider);
    const cur = byRider.get(k) || { rider: e.rider, seasonPts: 0, seasonShows: 0, prev: 0, lastShown: null };
    cur.seasonPts += pts;
    cur.seasonShows += shows;
    byRider.set(k, cur);
  });

  (carryover || []).forEach(c => {
    const k = keyOf(c.rider);
    const cur = byRider.get(k) || { rider: c.rider, seasonPts: 0, seasonShows: 0, prev: 0, lastShown: null };
    cur.prev = c.prev;
    cur.lastShown = c.lastShown;
    cur.archivedFlag = !!c.archived;
    byRider.set(k, cur);
  });

  return [...byRider.values()].map(r => {
    const total = parseFloat((r.prev + r.seasonPts).toFixed(2));
    const graduated = total >= GAG_GRADUATION_PTS;
    const newGrad = graduated && r.prev < GAG_GRADUATION_PTS;
    return {
      ...r,
      seasonPts: parseFloat(r.seasonPts.toFixed(2)),
      total,
      graduated,
      // Crossed 50 THIS season — the belt-buckle moment
      newGrad,
      // Active = competed this season, or tracker says seen recently
      active: r.seasonShows > 0 || (r.lastShown !== null && r.lastShown !== 'UNK'),
      // Archived (moves to the Graduates section) only when the tracker
      // flag is set AND the rider really graduated AND the buckle has been
      // acknowledged. Two safety valves: a flag on a non-graduate is
      // ignored (a data slip can't hide an active rider), and newGrad
      // wins over an early flag (the buckle to-do list can't be hidden).
      archived: !!r.archivedFlag && graduated && !newGrad,
    };
  }).sort((a, b) => {
    // NEW graduates pin to the top — they're the "needs a buckle" list.
    // (Once the buckle is delivered, folding their season points into
    // Previous Points in the tracker clears the flag — data, not code.)
    if (a.newGrad !== b.newGrad) return a.newGrad ? -1 : 1;
    return b.total - a.total;
  });
}

/* Node.js export guard for command-line tests; browsers skip this. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PLACE_PTS, getPlacePts, buildRows, rankRows, GAG_PLACE_PTS, getPlacePtsGreenAsGrass, buildGagProgress, GAG_GRADUATION_PTS };
}
