/* ============================================================
   main.js — the CONTROLLER
   ============================================================
   The only file that owns page state (which class/level/view is
   active) and wires user clicks to re-renders. The flow is always:

     data.js  →  scoring.js  →  render.js  →  the page

   main.js just conducts that pipeline.
   ============================================================ */

// ---- Application state -------------------------------------------------
let seasonData = null;   // { season, classes } once loaded
let activeClass = null;
let activeLevel = null;
let activeView = 'detail';

// ---- Navigation rendering ----------------------------------------------
// Buttons are built with createElement + addEventListener (rather than
// inline onclick strings) so names with quotes/apostrophes can't break
// the markup, and so no functions need to live on the global window.

function renderClassNav() {
  const nav = document.getElementById('classNav');
  nav.innerHTML = '';
  Object.keys(seasonData.classes).forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'nav-btn' + (c === activeClass ? ' active' : '');
    btn.textContent = c;
    btn.addEventListener('click', () => setClass(c));
    nav.appendChild(btn);
  });
}

function renderLevelNav() {
  const nav = document.getElementById('levelNav');
  nav.innerHTML = '';
  const levels = seasonData.classes[activeClass].levels;
  if (levels.length < 2) return; // hide level row for single-level classes
  levels.forEach(l => {
    const btn = document.createElement('button');
    btn.className = 'nav-btn' + (l === activeLevel ? ' active' : '');
    btn.textContent = l;
    btn.addEventListener('click', () => setLevel(l));
    nav.appendChild(btn);
  });
}

// ---- Main render: run the pipeline for the active selection ------------

function render() {
  const shows = seasonData.season.shows;
  const entries = seasonData.classes[activeClass].data[activeLevel];

  // The pipeline: raw entries → computed rows → ranked rows → HTML
  const completed = seasonData.season.completedShows ?? shows.length;
  const rows = rankRows(buildRows(entries, shows.length, completed));

  // Mid-season, "N qualified" would read 0 for everyone — show season
  // progress instead until all shows are complete.
  const status = completed < shows.length
    ? `${completed} of ${shows.length} shows complete`
    : `${rows.filter(r => r.qualified).length} qualified`;
  document.getElementById('rowCount').textContent =
    `${rows.length} entries · ${status}`;
  document.getElementById('tableWrap').innerHTML =
    activeView === 'detail' ? renderDetail(rows, shows) : renderSummary(rows, shows);

  document.getElementById('btnDetail').classList.toggle('active', activeView === 'detail');
  document.getElementById('btnSummary').classList.toggle('active', activeView === 'summary');
}

// ---- State changers ------------------------------------------------------

function setClass(c) {
  activeClass = c;
  activeLevel = seasonData.classes[c].levels[0]; // reset to first level
  renderClassNav();
  renderLevelNav();
  render();
}

function setLevel(l) {
  activeLevel = l;
  renderLevelNav();
  render();
}

function setView(v) {
  activeView = v;
  render();
}

// ---- Startup -------------------------------------------------------------
// async because getSeasonData() is async (see data.js) — when the Google
// Sheets fetch replaces the sample data, nothing here changes.

async function init() {
  seasonData = await getSeasonData();

  document.getElementById('pageTitle').textContent = seasonData.season.title;
  document.getElementById('pageSubtitle').textContent = seasonData.season.subtitle;

  // If the data layer fell back to the offline snapshot, say why, on the
  // page — much friendlier than making you open the developer console.
  const banner = document.getElementById('dataBanner');
  if (seasonData.season.error) {
    banner.textContent = 'Live data unavailable — showing a saved snapshot that may be outdated. ' +
      'Details: ' + seasonData.season.error;
    banner.hidden = false;
  }

  // Default selection: first class, its first level
  activeClass = Object.keys(seasonData.classes)[0];
  activeLevel = seasonData.classes[activeClass].levels[0];

  document.getElementById('btnDetail').addEventListener('click', () => setView('detail'));
  document.getElementById('btnSummary').addEventListener('click', () => setView('summary'));

  renderClassNav();
  renderLevelNav();
  render();
}

init();
