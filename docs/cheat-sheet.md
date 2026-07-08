# Command-Line Cheat Sheet

Quick reference for every command in the project, plus PowerShell
survival skills and fixes for every problem we've actually hit.

## Getting a terminal in the project folder

Three ways, easiest first:

1. **File Explorer address bar:** open the project folder, click the
   address bar, type `powershell`, press Enter. Terminal opens already
   in the folder — no `cd` needed.
2. **Shift + right-click** empty space inside the folder → "Open
   PowerShell window here."
3. The manual way from any terminal:

   ```
   cd "C:\Users\micha\Desktop\IRHA Dashboard v1"
   ```

   The quotes are required — the folder name has spaces, and without
   quotes PowerShell reads `cd C:\Users\micha\Desktop\IRHA` and chokes
   on the rest.

## PowerShell survival skills

- **Tab completes names.** Type `node tools\imp` then press Tab —
  PowerShell finishes the filename, quotes included. With this
  project's long filenames, Tab is your best friend. Press Tab again
  to cycle through alternatives.
- **↑ (up arrow) recalls previous commands.** Ran the importer an hour
  ago? Press ↑ until it reappears, Enter. No retyping.
- **Right-click pastes** into most terminals (Ctrl+V works in newer
  PowerShell).
- **Ctrl+C cancels** a running command — including stopping the dev
  server.
- A running server "freezes" the terminal on purpose — it's listening,
  not stuck. Open a second terminal if you need to run something else
  at the same time.
- `.\` before a path means "in this folder" — `node .\tools\serve.js`
  and `node tools/serve.js` both work; PowerShell accepts `/` or `\`.

## The commands

| Command | What it does | When |
|---|---|---|
| `node tools/serve.js` | Local web server at http://localhost:8080 — needed because file:// pages can't fetch Google data. Ctrl+C stops it. | Testing dashboard/arena changes locally |
| `node tools/import-draws.js incoming` | Converts every secretary CSV in `incoming/` into `tools/draws-import.tsv`, validated, in run order. | Show mornings |
| `node tools/check-names.js` | Report of likely duplicate/misspelled rider & horse names, incl. GaG tracker cross-check. Writes `tools/name-report.txt`. Changes nothing. | After entering a show's scores; before publishing standings |
| `node tools/make-snapshot.js` | Refreshes the dashboard's offline fallback from the live sheet. Commit the result. | After each show's scores are final |
| `node tools/transfer-report.js` | Evening checklist: the day's scores grouped by season class, alphabetized, new rider+horse combos flagged. | Show evenings, before typing scores into the entry sheet |
| `node tests/scoring.test.js` | Tests every scoring rule (ties, drop, GaG, qualification…). | After any change to scoring rules |
| `node tests/data.test.js` | Tests CSV parsing and sheet reading. | After any change to data handling |

## Show-morning routine (the short version)

1. Empty `incoming/`, drop in the day's CSVs
2. `node tools/import-draws.js incoming`
3. Read the summary — fix flagged names, note unknown class codes
4. Open `tools/draws-import.tsv` → copy rows below the header → paste
   once into the Draws tab
5. Add DRAG rows where breaks fall

Full detail: `docs/show-day-setup.md`.

## Git routine

- **Desktop (this machine):** edit → GitHub Desktop → review diffs →
  Commit → **Push origin** (commit alone doesn't upload — push is the
  second step)
- **Stream laptop:** GitHub Desktop → Fetch/**Pull** before each show.
  Never edit code on the laptop — pull only, and you'll never see a
  merge conflict.
- GitHub Pages redeploys automatically ~1–2 minutes after each push.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `node : not recognized` | Terminal opened before Node was installed | Open a NEW terminal window (old ones don't see the updated PATH) |
| `localhost refused to connect` | The server isn't running | Run `node tools/serve.js` and leave that window open |
| Importer: "No CSV files found" | Wrong folder, typo, or empty `incoming/` | Check you're in the project folder (`cd` above) and files are in `incoming/` |
| TSV contains yesterday's groups | Old CSVs still in `incoming/` | Empty the folder before dropping new files — the importer processes everything it finds |
| `EACCES` / permission denied writing the TSV | The TSV is open in Excel | Close it and rerun |
| Arena display stuck on one rider | A RIDER row above has an empty Score | The NOW card names the row it's waiting on — give it a score or `SC` |
| Arena display shows DEMO note | `DATA_URL` is empty in arena.html | Set it to the Apps Script `/exec` URL, push |
| Dashboard shows "LIVE FETCH FAILED" | Browser blocked the sheet fetch, or you opened index.html from disk | Use the server/Pages URL; the red banner lists the exact errors |
| Pages site doesn't show your change | Not pushed, or browser cache | Push in GitHub Desktop; then hard-refresh with **Ctrl+F5** |
| GitHub Desktop: "lock file exists" | A Git operation was interrupted | Close other Git tools; if it persists, delete `.git\index.lock` (safe when nothing Git-related is running) |
| Apps Script shows an orange dot | Unsaved changes in the editor | Ctrl+S; code changes also need Deploy → Manage deployments → new version to go live |
| Fetch works on desktop, fails at venue | Venue internet | The arena display keeps showing its last good data and says so in the corner — fix the connection, it recovers on its own |
