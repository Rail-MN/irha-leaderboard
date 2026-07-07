/* ============================================================
   render.js — the VIEW LAYER
   ============================================================
   Turns computed rows (from scoring.js) into HTML strings.
   No scoring math happens here, and no page state lives here —
   render functions are "given data, return markup."

   Embedding note: row backgrounds and hover effects are inline
   styles on each <tr> (not CSS classes) on purpose. When this
   page is embedded in the association's site, host CSS can
   override our classes — inline styles win those fights.
   ============================================================ */

/**
 * Number formatting for scores and points: whole numbers display bare
 * (70, 9, 0), fractional values show up to two accurate decimals
 * (69.5, 0.75, 0.14). toFixed(2) rounds to 2 places; parseFloat then
 * strips any trailing zeros ("9.50" → 9.5, "70.00" → 70).
 */
function fmtNum(v) { return v === null ? null : String(parseFloat(v.toFixed(2))); }
const fmtScore = fmtNum;
const fmtPts = fmtNum;

/** Gold / silver / bronze circle for 1–3, plain number otherwise */
function rankBadge(r) {
  if (r === 1) return `<span class="rank-badge r1">1</span>`;
  if (r === 2) return `<span class="rank-badge r2">2</span>`;
  if (r === 3) return `<span class="rank-badge r3">3</span>`;
  return `<span class="rank-badge rn">${r}</span>`;
}

/** Alternating row shading (inline — see embedding note above) */
const BG_EVEN = '#454443';   /* slightly lighter than the dark page bg */
const BG_ODD = 'transparent';

/** Opening <tr> tag with shading, DNQ dimming, and hover brightening.
    On a dark theme, hover BRIGHTENS (>1) — on light it darkened (<1). */
function rowOpenTag(bg, dnq) {
  const op = dnq ? '0.5' : '1';
  return `<tr style="background:${bg};opacity:${op}"` +
    ` onmouseover="this.style.filter='brightness(1.25)'"` +
    ` onmouseout="this.style.filter=''">`;
}

/** Rank cell + rider/horse cell — shared by both views */
function identityCells(r) {
  const rankCell = r.rank !== null
    ? rankBadge(r.rank)
    : `<span style="color:var(--color-text-tertiary)">—</span>`;
  const dnq = r.dnq ? '<span class="dnq-pill">DNQ</span>' : '';
  // 65+ = rider may hold the saddle horn (trailing "+" in the sheet)
  const senior = r.senior ? '<span class="senior-pill" title="65 or older — may hold the saddle horn">65+</span>' : '';
  return `<td class="l">${rankCell}</td>` +
    `<td class="l"><div class="rider">${r.rider}${senior}${dnq}</div><div class="horse">${r.horse}</div></td>`;
}

/**
 * View 1 (default): per-show detail.
 * Grouped columns per show (Place | Score | Pts), then Total and Shows.
 *
 * @param {Array} rows  - computed + ranked rows
 * @param {Array} shows - [{label, full}, ...] from the data layer
 */
function renderDetail(rows, shows) {
  // Column sizing: each column gets a BASE pixel width (its comfortable
  // minimum), then the bases are converted to percentages of the total.
  // Percentages + table-layout:fixed = every column scales up
  // proportionally when the table stretches to fill the page, instead of
  // one column hogging the extra space. The table's min-width equals the
  // sum of the bases, so on narrow screens the columns never get crushed
  // below their comfortable size — the wrapper scrolls horizontally
  // instead, and white-space:nowrap means text never wraps mid-cell.
  const baseW = [30, 150, ...Array(shows.length).fill([44, 52, 44]).flat(), 62, 46];
  const minW = baseW.reduce((a, b) => a + b, 0);

  let html = `<table class="detail-tbl" style="width:100%;min-width:${minW}px"><colgroup>`;
  baseW.forEach(w => { html += `<col style="width:${(w / minW * 100).toFixed(3)}%">`; });
  html += `</colgroup><thead>`;

  // Header row 1: show names spanning their 3 sub-columns
  html += `<tr style="background:var(--color-background-secondary)">`;
  html += `<th class="show-grp-blank" colspan="2" style="border-right:none"></th>`;
  shows.forEach((s, si) => {
    const sep = si < shows.length - 1 ? 'border-right:0.5px solid var(--color-border-secondary)' : '';
    html += `<th colspan="3" class="show-grp-hdr" title="${s.full}" style="${sep}">${s.label}</th>`;
  });
  html += `<th colspan="2" class="show-grp-blank" style="border-left:0.5px solid var(--color-border-secondary);border-right:none"></th></tr>`;

  // Header row 2: Place / Score / Pts labels
  html += `<tr style="background:var(--color-background-secondary)">`;
  html += `<th class="l" style="border-right:0.5px solid var(--color-border-tertiary)"></th>`;
  html += `<th class="l" style="border-right:0.5px solid var(--color-border-tertiary)">Rider / Horse</th>`;
  shows.forEach((_, si) => {
    const lastShow = si === shows.length - 1;
    const sepR = !lastShow ? 'border-right:0.5px solid var(--color-border-secondary)' : 'border-right:none';
    html += `<th>Place</th><th>Score</th><th style="${sepR}">Pts</th>`;
  });
  html += `<th class="totals-sep">Total</th><th>Shows</th></tr></thead><tbody>`;

  // Data rows
  rows.forEach((r, idx) => {
    html += rowOpenTag(idx % 2 === 0 ? BG_EVEN : BG_ODD, r.dnq);
    html += identityCells(r);

    shows.forEach((_, si) => {
      const score = r.scores[si];
      const pts = r.showPts[si];
      const pl = r.showPlace[si]; // null when zero score (no placement)
      const dropped = si === r.dropIdx;
      const lastShow = si === shows.length - 1;
      const grpSep = !lastShow ? 'border-right:0.5px solid var(--color-border-secondary)' : 'border-right:none';

      if (score === null) {
        // Didn't participate: dimmed dashes
        html += `<td class="empty">—</td><td class="empty">—</td><td class="empty" style="${grpSep}">—</td>`;
      } else {
        // Zero score: competed but no placement — dash for place, real 0.0 for score/pts
        const plCell = pl !== null ? pl : '<span class="empty">—</span>';
        const cls = dropped ? ' class="dropped"' : '';
        html += `<td${cls}>${plCell}</td><td${cls}>${fmtScore(score)}</td><td${cls} style="${grpSep}">${fmtPts(pts)}</td>`;
      }
    });

    const tot = r.dnq ? '—' : fmtPts(r.total);
    html += `<td class="totals-sep" style="font-weight:500">${tot}</td>`;
    html += `<td class="participation">${r.participated}/${shows.length}</td></tr>`;
  });

  html += `</tbody></table>`;
  return html;
}

/**
 * View 2: condensed year-end standings.
 * Rank | Rider/Horse | Total pts | Shows
 */
function renderSummary(rows, shows) {
  // Rank column: 21px badge + 10px padding each side = 41px minimum.
  // The old 40px was one pixel short, so the global td ellipsis rule
  // clipped the badge and appended "…". 56px gives breathing room.
  let html = `<table class="summary-tbl" style="width:100%"><colgroup>
    <col style="width:56px"><col><col style="width:90px"><col style="width:70px">
  </colgroup><thead><tr style="background:var(--color-background-secondary)">
    <th class="l"></th>
    <th class="l">Rider / Horse</th>
    <th>Total pts</th>
    <th>Shows</th>
  </tr></thead><tbody>`;

  rows.forEach((r, idx) => {
    html += rowOpenTag(idx % 2 === 0 ? BG_EVEN : BG_ODD, r.dnq);
    html += identityCells(r);
    const tot = r.dnq ? '—' : fmtPts(r.total);
    html += `<td style="font-weight:500">${tot}</td>` +
      `<td class="participation">${r.participated}/${shows.length}</td></tr>`;
  });

  html += `</tbody></table>`;
  return html;
}
