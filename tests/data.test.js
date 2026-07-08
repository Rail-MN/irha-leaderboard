/* ============================================================
   data.test.js — tests for CSV parsing and sheet transformation
   ============================================================
   Run from the project folder with:   node tests/data.test.js

   The fixture below uses VERBATIM rows from the real 2026
   MASTER FULL INFO tab, covering the quirks found in real data:
   zero scores, the trailing "+" senior marker, a "+" in the
   MIDDLE of a name (must not be stripped), and a class that
   isn't in the grouping config.
   ============================================================ */

const { parseCsv, transformSheetRows, groupClasses, parseGagTracker } = require('../js/data.js');

let passed = 0, failed = 0;
function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}\n        expected ${e}\n        got      ${a}`); }
}

// ---------------------------------------------------------------
console.log('\nparseCsv basics');

{
  const rows = parseCsv('"a","b"\r\n"c,with comma","d ""quoted"" e"\n');
  assertEqual(rows[0], ['a', 'b'], 'simple quoted fields');
  assertEqual(rows[1], ['c,with comma', 'd "quoted" e'], 'comma and escaped quotes inside fields');
}

// ---------------------------------------------------------------
console.log('\ntransformSheetRows on real sheet rows');

// Verbatim structure from MASTER FULL INFO (subset of columns is not
// allowed — the transform reads by header name, so full rows are used).
const FIXTURE = [
  '"Rider","Horse","Apr Place","Apr Score","Apr Points","Jun Place","Jun Score","Jun Points","Jul Place","Jul Score","Jul Points","Sep Place","Sep Score","Sep Points","Total Shows","Total Points","Class"',
  '"Preston J Kent","Einsteins Whiz Kidd","1","72","10","2","73.5","9","","","","","","","2","19","OPEN"',
  '"Dan V Myers","Magnums Little Dream","","0","","","","","","","","","","","1","0","OPEN"',
  '"Denise Wilstead+","Gotcha","1","9","","1","9","","","","","","","","2","18","PRIME TIME ROOKIE"',
  '"Dee + A. Oakeson","Mak Daddy","16","0","","","","","","","","","","","1","0","ROOKIE LEVEL 1"',
  '"Sarai Laney Williamson","Shiner Voodoo Time","1","10","","1","10","","","","","","","","2","20","GREEN AS GRASS"',
  '"Test Rider","Test Horse","","SC","","","NS","","","dq","","","71","","2","0","OPEN"',
].join('\n');

const { shows, byClass } = transformSheetRows(parseCsv(FIXTURE));

assertEqual(shows.map(s => s.label), ['Apr', 'Jun', 'Jul', 'Sep'], 'shows discovered from "* Score" header columns');

{
  const e = byClass['OPEN'][0];
  assertEqual(e.rider, 'Preston J Kent', 'rider parsed');
  assertEqual(e.scores, [72, 73.5, null, null], 'scores: numbers and blanks(null)');
  assertEqual(e.senior, false, 'no trailing + → senior false');
}

{
  const e = byClass['OPEN'][1];
  assertEqual(e.scores[0], 0, 'score "0" parses as 0 (participation), not null');
  assertEqual(e.scores[1], null, 'blank score stays null');
}

{
  const e = byClass['PRIME TIME ROOKIE'][0];
  assertEqual(e.rider, 'Denise Wilstead', 'trailing + stripped from name');
  assertEqual(e.senior, true, 'trailing + → senior true');
}

{
  const e = byClass['ROOKIE LEVEL 1'][0];
  assertEqual(e.rider, 'Dee + A. Oakeson', 'mid-name + left alone');
  assertEqual(e.senior, false, 'mid-name + is not the senior marker');
}

{ // SC/NS/DQ shorthand: SC = scratch (null), NS/DQ = participated with 0
  const e = byClass['OPEN'].find(x => x.rider === 'Test Rider');
  assertEqual(e.scores, [null, 0, 0, 71], 'SC → null; NS and DQ (any case) → 0; numbers unaffected');
}

// ---------------------------------------------------------------
console.log('\ngroupClasses');

const classes = groupClasses(byClass);

assertEqual(classes['Open'].levels, ['Open'], 'OPEN grouped under "Open" (only levels with data appear)');
assertEqual(classes['Rookie'].levels, ['Level 1', 'Prime Time'], 'Rookie group picks up its levels in config order');
assertEqual(classes['Green as Grass'].levels, ['All'], 'GaG grouped under its nav label');
assertEqual(classes['Green as Grass'].data['All'].length, 1, 'GaG keeps its entries');

// ---------------------------------------------------------------
console.log('\nparseGagTracker');

{
  const rows = parseGagTracker(parseCsv([
    '"Rider","Previous Points (Including accumulated points through June 2026)","Last Shown"',
    '"Hadlee Spencer","65.5","2026"',
    '"Shelly Manning","19","UNK"',
    '"No Points Yet","","2026"',
  ].join('\n')));
  assertEqual(rows.length, 3, 'all tracker rows parsed');
  assertEqual(rows[0], { rider: 'Hadlee Spencer', prev: 65.5, lastShown: '2026' }, 'graduate row parsed');
  assertEqual(rows[1].lastShown, 'UNK', 'UNK archive flag preserved');
  assertEqual(rows[2].prev, 0, 'blank points default to 0');
}

// ---------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
