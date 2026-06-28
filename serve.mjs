// Minimal static server for local preview (zero dependencies).
//   node serve.mjs   ->   http://localhost:8080
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = process.env.PORT || 8080;
const TYPES = {
  '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp',
  '.xml':'application/xml', '.txt':'text/plain', '.ico':'image/x-icon', '.woff2':'font/woff2',
};

async function resolve(urlPath){
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if(p.endsWith('/')) p += 'index.html';
  let file = join(DIST, p);
  try { const s = await stat(file); if(s.isDirectory()) file = join(file, 'index.html'); } catch {}
  return file;
}

createServer(async (req, res) => {
  const file = await resolve(req.url);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    try {
      const body = await readFile(join(DIST, '404.html'));
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(body);
    } catch { res.writeHead(404); res.end('Not found'); }
  }
}).listen(PORT, () => console.log(`Serving dist/ at http://localhost:${PORT}`));
