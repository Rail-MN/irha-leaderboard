/* ============================================================
   serve.js — tiny local development server (no dependencies)
   ============================================================
   WHY THIS EXISTS: opening index.html by double-clicking loads
   it as a file:// URL. Browsers treat file:// pages as origin
   "null", and Google refuses cross-origin (CORS) requests from
   null origins — so the live data fetch fails locally even
   though it works fine when the page is hosted on a real site.

   Serving the folder over HTTP gives the page a real origin
   (http://localhost:8080) and the fetches work.

   Run from the project folder:

     node tools/serve.js

   then open  http://localhost:8080  in your browser.
   Stop the server with Ctrl+C in the terminal.
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT = path.join(__dirname, '..'); // the project folder

// Map file extensions to content types so the browser knows what it's getting
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  // Strip query strings and default to index.html
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // path.normalize + startsWith check prevents "../" escaping the folder
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(path.normalize(ROOT))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not found: ' + urlPath); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Serving the dashboard at  http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
