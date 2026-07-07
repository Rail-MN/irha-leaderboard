# Western Reining Leaderboard — Project Handoff Brief

## Project Overview

This is a purpose-built web application for a Western Reining equestrian association to manage and display competitor standings throughout a 4-show season. It is intended to replace a fragile Google Sheets + Looker Studio (Data Studio) workflow that has been difficult to maintain and debug. The long-term vision is a show management ecosystem that could be adopted by other associations; the scoring/leaderboard system is the correct isolated starting point.

The developer (me) is newer to programming and treating this as a learning project. Prefer clear, well-commented code and be willing to explain decisions.

---

## Current State

A working HTML/JavaScript prototype has been built and iterated through several rounds of refinement. It is self-contained in a single HTML file with inline CSS and JS. It uses hardcoded sample data. The next phase is moving this into a proper Claude Code project structure and eventually connecting it to live data from Google Sheets.

---

## Data Structure & Entry Workflow

- Data is entered manually into Google Sheets
- Sheet 1 is organized with **one tab per competition class/level**
- Within each tab, rows are competitor entries (rider + horse combinations); columns represent individual shows
- A model extracts scores from scanned score sheets into CSV, which are then placed into the correct show column matched to the correct rider/horse combination
- Sheet 2 aggregates across all class tabs for further processing
- **Manual entry into Sheets is unavoidable and acceptable** — the goal is for everything downstream (points, placing, ranking) to be automatic

---

## Competition Structure

### Shows
- 4 shows per season
- Each show has a city + month label (not a full title) used for column headers
- Current season shows: **South Jordan April**, **Salina June**, **Salina July**, **Heber September**
- Abbreviated in UI as: S. Jordan Apr / Salina Jun / Salina Jul / Heber Sep

### Classes
- Multiple competition classes, some with up to 3 levels (e.g., Open L1 / L2 / L3)
- Each class/level is scored and ranked **independently** — no cross-class aggregation
- Current classes in prototype: Open (L1/L2/L3), Non Pro (L1/L2/L3), Novice Horse (L1/L2), Novice Rider (L1/L2), Youth (L1)
- There is one special class with different scoring rules — not yet implemented, defer for now

### Competitor Entries
- Each row is a **rider + horse combination**
- A single rider may compete with multiple horses, including within the same class — each combination is a separate independent entry
- **Rider name is the primary identifier; horse name is secondary** but both are displayed on every row

---

## Scoring System

### Scores
- Half-point increments (e.g., 70.0, 69.5, 72.5)
- 70.0 is "par" — judges add or deduct based on performance and penalties
- Typical range: roughly 65.0–76.0 for most classes
- Single-judge format is standard for this association (composite/multi-judge scores exist at higher levels but are out of scope for now)
- Display scores with one decimal place at all times (70.0 not 70)

### Points per Show
- Awarded by placement within each class/level at each individual show
- Points scale (1st through 10th):
  - 1st = 10 pts, 2nd = 9 pts, 3rd = 8 pts ... 10th = 1 pt
  - 11th place and below = 0 pts (no points awarded)

### Tie Handling
- When two or more competitors share the same score, they share the same placement
- Points for all tied places are pooled and divided equally among tied competitors
- Example: two-way tie for 1st → each receives 5.0 pts (10 ÷ 2)
- Example: three-way tie for 2nd → each receives (9+8+7) ÷ 3 = 8.0 pts
- Ties can involve any number of competitors; divide accordingly
- Tie notation in UI: place number followed by "-T" (e.g., **1-T**, **2-T**)

### Qualification for Year-End Awards
- Competitor must participate in **at least 3 of 4 shows** to qualify
- A score of 0 (or earning no points) still counts as participation if they competed
- Competitors with fewer than 3 shows are marked **DNQ** and sorted to the bottom of standings

### Low Score Drop
- Competitors who participated in **all 4 shows** have their **lowest points score dropped**
- Competitors who participated in exactly **3 shows are exempt** from the drop — all 3 scores count
- Year-end total = sum of remaining scores after drop (if applicable)

### Year-End Champion
- Determined by accumulated points total after the low-score drop is applied
- In the event of a tied total, both competitors share that rank (no tiebreaker defined yet)

---

## UI / UX Requirements

### Two Views (toggle between them)
1. **Per-show detail view** (primary/default)
   - One row per rider/horse combination
   - Grouped columns per show: Place | Score | Points
   - Show group headers span all 3 sub-columns
   - Rightmost columns: Total pts (accumulated, after drop) | Shows participated (e.g., 3/4)
   - Upcoming/blank shows display dashes

2. **Year-end standings view** (secondary, toggled)
   - Condensed: Rank | Rider/Horse | Total pts | Shows
   - Mirrors the condensed "second page" from the old Data Studio report

### Visual Design Details
- Rider name leads (larger/bolder), horse name below it in secondary style
- Alternating row shading (subtle) for readability across wide rows
- Vertical gridlines between columns
- Hover brightens slightly (filter: brightness) — implemented inline to avoid CSS specificity conflicts with host page
- Dropped scores display with **strikethrough on the actual numbers** (place, score, pts all struck) — visually distinct from non-participation dashes
- DNQ entries are dimmed (opacity) and sorted below qualified competitors
- Rank badges: gold (1st), silver (2nd), bronze (3rd), plain for all others
- Class navigation: button row at top
- Level navigation: secondary button row below class nav (hidden if class has only one level)
- Must be mobile-friendly / responsive

### Known CSS Considerations
- The prototype runs in a sandboxed iframe environment where host CSS can override styles
- Row background colors and hover effects must be applied as **inline styles** on `<tr>` elements, not via CSS classes, to ensure they render correctly
- Use `table-layout: fixed` with explicit column widths via `<colgroup>` to keep headers and data columns aligned

---

## Architecture Goals

### Near-Term
- Clean up and modularize the existing HTML/JS prototype into a proper file structure
- Maintain all scoring logic in JavaScript (it is correct and tested)
- Connect to Google Sheets as a data source via the Sheets public JSON API (no backend required initially)

### Long-Term
- Purpose-built web app that could be adopted by other associations
- Potential for a lightweight backend (Node.js or similar) if more data control is needed
- Show management ecosystem features (registration, score entry interface, etc.) — defer all of this; the leaderboard is the foundation

---

## What Has Been Validated

- Scoring logic (placement, tie-splitting, point calculation) is correctly implemented in JS
- Low-score drop and qualification logic work correctly
- The two-view toggle (detail / year-end) works
- Alternating rows, gridlines, hover, and strikethrough for dropped scores are all implemented
- Column header alignment is solved via fixed table layout with explicit colgroup widths

---

## What Comes Next

1. Port the prototype into a Claude Code project with clean file structure (HTML, CSS, JS separated)
2. Replace hardcoded sample data with a Google Sheets data connection
3. Continue UI refinement based on feedback
4. Eventual mobile layout optimization
