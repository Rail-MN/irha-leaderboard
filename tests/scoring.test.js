/* ============================================================
   scoring.test.js — command-line tests for the rules engine
   ============================================================
   Run from the project folder with:   node tests/scoring.test.js

   No test framework — just a tiny assert helper. Because
   scoring.js has zero DOM code, we can load and exercise it in
   Node directly. Every association scoring rule gets a named
   test here; when a rule changes, change the test FIRST, watch
   it fail, then fix the code until it passes.
   ============================================================ */

const { getPlacePts, buildRows, rankRows, getPlacePtsGreenAsGrass, buildGagProgress } = require('../js/scoring.js');

let passed = 0, failed = 0;

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}\n        expected ${e}\n        got      ${a}`);
  }
}

// Helper: build minimal entries from score arrays
const entries = (...scoreArrays) => scoreArrays.map((scores, i) => ({
  rider: `R${i + 1}`, horse: `H${i + 1}`, scores,
}));

// ---------------------------------------------------------------
console.log('\nPlacement & points (single show)');

{ // Simple ordering: highest score wins
  const { pts, place } = getPlacePts(entries([72], [70], [71]), 0);
  assertEqual(place, ['1', '3', '2'], 'places follow score order');
  assertEqual(pts, [10, 8, 9], 'points follow placement');
}

{ // Two-way tie for 1st: places 1+2 pooled → (10+9)/2 = 9.5 each
  const { pts, place } = getPlacePts(entries([72], [72], [70]), 0);
  assertEqual(place, ['1-T', '1-T', '3'], 'two-way tie labeled 1-T, next place is 3rd');
  assertEqual(pts, [9.5, 9.5, 8], 'two-way tie for 1st pays 9.5 each');
}

{ // Three-way tie for 2nd: places 2+3+4 pooled → (9+8+7)/3 = 8.0 each
  const { pts } = getPlacePts(entries([73], [71], [71], [71]), 0);
  assertEqual(pts, [10, 8, 8, 8], 'three-way tie for 2nd pays 8.0 each');
}

{ // Places beyond 10th earn nothing
  const e = entries(...[76, 75, 74, 73, 72, 71, 70, 69, 68, 67, 66].map(s => [s]));
  const { pts } = getPlacePts(e, 0);
  assertEqual(pts[9], 1, '10th place earns 1 pt');
  assertEqual(pts[10], 0, '11th place earns 0 pts');
}

{ // Non-participants (null) get no place, no points
  const { pts, place } = getPlacePts(entries([72], [null]), 0);
  assertEqual(place[1], null, 'null score → no placement');
  assertEqual(pts[1], null, 'null score → no points');
}

// ---------------------------------------------------------------
console.log('\nZero score = participation only (association rule)');

{
  const e = entries([71, 71, 71, null], [0, 71, 71, null]);
  const { pts, place } = getPlacePts(e, 0);
  assertEqual(place[1], null, 'zero score → no placement');
  assertEqual(pts[1], 0, 'zero score → 0 points (not null)');
  assertEqual(place[0], '1', 'zero scorer does not occupy a place — rival is 1st, not 1-T');

  const rows = buildRows(e, 4);
  assertEqual(rows[1].participated, 3, 'zero score counts toward participation');
  assertEqual(rows[1].qualified, true, 'zero + 2 real scores = 3 shows = qualified');
}

// ---------------------------------------------------------------
console.log('\nQualification & low-score drop');

{ // 4 shows → lowest points result dropped
  // Solo entrant: 10 pts per show entered
  const rows = buildRows(entries([70, 71, 72, 73]), 4);
  assertEqual(rows[0].participated, 4, '4 shows participated');
  assertEqual(rows[0].dropIdx !== -1, true, '4-show participant gets a drop');
  assertEqual(rows[0].total, 30, 'total = 4x10 minus dropped 10');
}

{ // Exactly 3 shows → exempt from drop, all count
  const rows = buildRows(entries([70, 71, 72, null]), 4);
  assertEqual(rows[0].dropIdx, -1, '3-show participant: no drop');
  assertEqual(rows[0].total, 30, 'all 3 results count');
}

{ // 2 shows → DNQ
  const rows = buildRows(entries([70, 71, null, null]), 4);
  assertEqual(rows[0].qualified, false, '2 shows = DNQ');
}

{ // The drop removes the LOWEST POINTS result
  // R1 beats R2 in shows 1-3, R2 wins show 4 → R1's low is show 4 (9 pts)... build:
  // R1: [72,72,72,70]  R2: [71,71,71,71]
  // Show 1-3: R1 1st (10), R2 2nd (9). Show 4: R2 1st (10), R1 2nd (9)
  const rows = buildRows(entries([72, 72, 72, 70], [71, 71, 71, 71]), 4);
  assertEqual(rows[0].dropIdx, 3, 'R1 drops show 4 (their 9-pt result)');
  assertEqual(rows[0].total, 30, 'R1 total = 10+10+10');
  assertEqual(rows[1].total, 28, 'R2 total = 10+9+9 (one 9 dropped)');
}

{ // A dropped zero-score show
  const rows = buildRows(entries([70, 71, 72, 0]), 4);
  assertEqual(rows[0].dropIdx, 3, 'zero-point show is the drop for 4-show participant');
  assertEqual(rows[0].total, 30, 'total unaffected by the dropped zero');
}

// ---------------------------------------------------------------
console.log('\nGreen as Grass (graduation class: 8..1 placing + 0.5/beat bonus)');

{ // 10 distinct scores: 1st = 8 placing + 0.5*9 beaten = 12.5
  const e = entries(...[76, 75, 74, 73, 72, 71, 70, 69, 68, 67].map(s => [s]));
  const { pts, place } = getPlacePtsGreenAsGrass(e, 0);
  assertEqual(pts[0], 12.5, '1st of 10 = 8 + 4.5 bonus = 12.5');
  assertEqual(pts[7], 2, '8th = 1 placing + 0.5*2 = 2');
  assertEqual(pts[8], 0.5, '9th = 0 placing + 0.5*1 = 0.5');
  assertEqual(pts[9], 0, '10th (lowest, >0) = no placing, beat nobody = 0');
  assertEqual(place[0], '1', 'places assigned normally');
}

{ // Two-way tie for 1st of 4: (8+7)/2 = 7.5 placing + 0.5*2 beaten = 8.5 each
  const e = entries([72], [72], [70], [69]);
  const { pts, place } = getPlacePtsGreenAsGrass(e, 0);
  assertEqual(place[0], '1-T', 'tie labeled 1-T');
  assertEqual(pts[0], 8.5, 'tied 1st: pooled placing + bonus, ties do not beat each other');
  assertEqual(pts[1], 8.5, 'both tied riders equal');
}

{ // Zero score: gets last place, earns nothing; rider above gets bonus for beating them
  const e = entries([70], [0], [null]);
  const { pts, place } = getPlacePtsGreenAsGrass(e, 0);
  assertEqual(place[1], '2', 'zero score is ranked (last place) in GaG');
  assertEqual(pts[1], 0, 'zero score earns no points in GaG');
  assertEqual(pts[0], 8.5, 'winner: 8 placing + 0.5 for beating the zero scorer');
  assertEqual(place[2], null, 'scratch (null) still gets nothing');
}

// ---------------------------------------------------------------
console.log('\nGaG graduation progress (rider-level, carryover + season)');

{
  // Rider A rides two horses in show 3: 70 (1st) and 69 (2nd); B rides 68 (3rd)
  // A-H1: 8 + 0.5*2 = 9;  A-H2: 7 + 0.5*1 = 7.5;  B: 6 + 0 = 6
  const entries = [
    { rider: 'Anna Fields', horse: 'H1', scores: [null, null, 70, null] },
    { rider: 'Anna Fields', horse: 'H2', scores: [null, null, 69, null] },
    { rider: 'Ben Cole',    horse: 'H3', scores: [null, null, 68, null] },
  ];
  const carryover = [
    { rider: 'Anna Fields', prev: 40, lastShown: '2026' },
    { rider: 'Cara Dunn',   prev: 12, lastShown: 'UNK' },
  ];
  const rows = buildGagProgress(entries, carryover, 4);

  const anna = rows.find(r => r.rider === 'Anna Fields');
  assertEqual(anna.seasonPts, 16.5, 'season points sum ACROSS horses (9 + 7.5)');
  assertEqual(anna.total, 56.5, 'lifetime total = carryover + season');
  assertEqual(anna.graduated, true, 'graduates at 50+');
  assertEqual(anna.newGrad, true, 'crossed 50 THIS season');
  assertEqual(rows[0].rider, 'Anna Fields', 'new graduate pinned to top');

  const ben = rows.find(r => r.rider === 'Ben Cole');
  assertEqual(ben.total, 6, 'no carryover row → season only');
  assertEqual(ben.active, true, 'competed this season → active');

  const cara = rows.find(r => r.rider === 'Cara Dunn');
  assertEqual(cara.active, false, 'UNK + no season scores → archive');
  assertEqual(cara.graduated, false, '12 points, not graduated');
}

{ // New grads outrank even higher lifetime totals (buckle to-do list on top)
  const entries = [{ rider: 'Riser', horse: 'H', scores: [null, null, 70, null] }];
  const carryover = [
    { rider: 'Riser',    prev: 45, lastShown: '2026' },  // 45 + 8 = 53: NEW grad
    { rider: 'Old Grad', prev: 80, lastShown: '2026' },  // long since graduated
  ];
  const rows = buildGagProgress(entries, carryover, 4);
  assertEqual(rows[0].rider, 'Riser', 'new grad pins above older, higher-total grad');
  assertEqual(rows[1].rider, 'Old Grad', 'established grad follows, still sorted by total');
  assertEqual(rows[1].newGrad, false, 'prev >= 50 means not new — folding points into carryover clears the pin');
}

{ // Name drift between tracker and entry sheet must not split a rider
  const entries = [{ rider: 'Kriston N. Hill', horse: 'H', scores: [null, null, 70, null] }];
  const carryover = [{ rider: 'Kriston N Hill', prev: 45, lastShown: '2026' }];
  const rows = buildGagProgress(entries, carryover, 4);
  assertEqual(rows.length, 1, 'punctuation-only name variants merge');
  assertEqual(rows[0].total, 53, 'merged total = 45 carryover + 8 (solo 1st: 8 base, nobody beaten)');
}

// ---------------------------------------------------------------
console.log('\nMid-season qualification (DNQ only when mathematically impossible)');

{ // 2 of 4 shows complete: 2-show participant can still reach 3 -> ranked
  const rows = rankRows(buildRows(entries([70, 71, null, null]), 4, 2));
  assertEqual(rows[0].dnq, false, '2 shows attended, 2 remaining: not DNQ');
  assertEqual(rows[0].rank, 1, 'ranked normally mid-season');
  assertEqual(rows[0].total, 20, 'running total displayed mid-season');
}

{ // 3 of 4 complete, only 1 attended: 1 + 1 remaining = 2 < 3 -> DNQ
  const rows = rankRows(buildRows(entries([70, null, null, null]), 4, 3));
  assertEqual(rows[0].dnq, true, 'cannot reach 3 shows -> DNQ');
  assertEqual(rows[0].rank, null, 'DNQ gets no rank');
}

{ // End of season (default completedShows): 2 shows = DNQ as before
  const rows = rankRows(buildRows(entries([70, 71, null, null]), 4));
  assertEqual(rows[0].dnq, true, 'season over with 2 shows -> DNQ');
}

// ---------------------------------------------------------------
console.log('\nYear-end ranking');

{
  const rows = rankRows(buildRows(entries(
    [72, 72, 72, null],   // qualified, 30 pts
    [71, 71, 71, null],   // qualified, 27 pts
    [70, 70, null, null], // DNQ
  ), 4));
  assertEqual(rows.map(r => r.rank), [1, 2, null], 'ranks assigned; DNQ rank is null');
  assertEqual(rows[2].qualified, false, 'DNQ sorted to bottom');
}

{ // Tied totals share a rank; next rank skips
  const rows = rankRows(buildRows(entries(
    [72, 71, 71, null],  // 10 + 9 + 9 = 28
    [71, 72, 71, null],  // 9 + 10 + 9 = 28
    [70, 70, 70, null],  // 8 + 8 + 8 = 24
  ), 4));
  assertEqual(rows.map(r => r.rank), [1, 1, 3], 'tied totals share rank 1; next is rank 3');
}

// ---------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
