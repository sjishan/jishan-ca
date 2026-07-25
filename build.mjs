#!/usr/bin/env node
// jishan.ca static build — zero dependencies (Node built-ins only).
//
// What it does on every run:
//   1. Reads the shared partials (head / header / footer / subscribe).
//   2. Scans src/visuals/* and pulls each page's metadata from its own <head>
//      and masthead (og:title, meta description, Published/Updated <time>).
//   3. Regenerates the homepage list, the /visuals list, and the sitemap from
//      that metadata (newest first).
//   4. Injects the chrome + subscribe partials into every page at their markers.
//   5. Writes the deployable site to dist/  (Cloudflare Pages serves this).
//
// Run:  npm run build      Preview:  npm run dev

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT      = dirname(fileURLToPath(import.meta.url));
const SRC       = join(ROOT, 'src');
const PARTIALS  = join(ROOT, 'partials');
const TEMPLATES = join(ROOT, 'templates');
const ASSETS    = join(ROOT, 'assets');
const DIST      = join(ROOT, 'dist');

const SITE        = 'https://jishan.ca';
const HOME_LATEST = 6; // how many pieces the homepage shows

const read = (p) => readFileSync(p, 'utf8');
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const pick = (html, re) => { const m = html.match(re); return m ? m[1].trim() : ''; };
const esc  = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function fmtDate(iso){
  if(!iso) return '';
  const [y,m,d] = iso.split('-').map(Number);
  return (y && m && d) ? `${MONTHS[m-1]} ${d}, ${y}` : iso;
}
function injectAll(html, map){
  for(const [marker, value] of Object.entries(map)) html = html.split(marker).join(value);
  return html;
}
function writeOut(rel, content){
  const out = join(DIST, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content);
}

// ---- shared partials ----
const partials = {
  '<!--CHROME:HEAD-->'  : read(join(PARTIALS, 'head.html')),
  '<!--CHROME:HEADER-->': read(join(PARTIALS, 'header.html')),
  '<!--CHROME:FOOTER-->': read(join(PARTIALS, 'footer.html')),
  '<!--SUBSCRIBE-->'    : read(join(PARTIALS, 'subscribe.html')),
};

// ---- discover + read each visual page ----
const visualsDir = join(SRC, 'visuals');
const slugs = existsSync(visualsDir)
  ? readdirSync(visualsDir).filter(d => existsSync(join(visualsDir, d, 'index.html')))
  : [];

const pieces = slugs.map(slug => {
  const html = read(join(visualsDir, slug, 'index.html'));
  return {
    slug,
    html,
    url      : `${SITE}/visuals/${slug}/`,
    title    : pick(html, /<meta property="og:title" content="([^"]+)"/) || pick(html, /<title>([^<]+)<\/title>/),
    desc     : pick(html, /<meta name="description" content="([^"]+)"/) || pick(html, /<meta property="og:description" content="([^"]+)"/),
    published: pick(html, /Published[\s\S]*?<time datetime="([^"]+)"/) || pick(html, /<time datetime="([^"]+)"/),
    updated  : pick(html, /Updated[\s\S]*?<time datetime="([^"]+)"/) || pick(html, /Published[\s\S]*?<time datetime="([^"]+)"/) || pick(html, /<time datetime="([^"]+)"/),
  };
}).sort((a, b) => (b.published || '').localeCompare(a.published || ''));

// ---- list rendering ----
const rowHTML = (p) => `        <li class="vrow">
          <a href="/visuals/${p.slug}/">
            <span class="t">${esc(p.title)} <span class="ar">&rsaquo;</span></span>
            <span class="dek">${esc(p.desc)}</span>
            <span class="date">${fmtDate(p.published)}</span>
          </a>
        </li>`;
const listHTML   = (items) => items.map(rowHTML).join('\n');
const countLabel = (n) => `${n} ${n === 1 ? 'piece' : 'pieces'}`;

// ---- clean output ----
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// ---- homepage ----
writeOut('index.html', injectAll(read(join(TEMPLATES, 'home.html')), {
  ...partials,
  '<!--VISUALS_LIST-->' : listHTML(pieces.slice(0, HOME_LATEST)),
  '<!--VISUALS_COUNT-->': countLabel(pieces.length),
}));

// ---- /visuals index ----
writeOut('visuals/index.html', injectAll(read(join(TEMPLATES, 'visuals-index.html')), {
  ...partials,
  '<!--VISUALS_LIST-->' : listHTML(pieces),
  '<!--VISUALS_COUNT-->': countLabel(pieces.length),
}));

// ---- 404 ----
if(existsSync(join(TEMPLATES, '404.html'))){
  writeOut('404.html', injectAll(read(join(TEMPLATES, '404.html')), partials));
}

// ---- each visual page ----
for(const p of pieces){
  writeOut(`visuals/${p.slug}/index.html`, injectAll(p.html, partials));
}

// ---- assets passthrough ----
if(existsSync(ASSETS)) cpSync(ASSETS, join(DIST, 'assets'), { recursive: true });

// Icons that crawlers probe at the site root by convention (Google's /favicon.ico,
// iOS /apple-touch-icon.png). Mirror them from assets/ to the dist root.
for(const f of ['favicon.ico', 'apple-touch-icon.png']){
  const src = join(ASSETS, f);
  if(existsSync(src)) cpSync(src, join(DIST, f));
}

// ---- sitemap.xml ----
const newest = pieces[0]?.updated || new Date().toISOString().slice(0, 10);
const urls = [
  { loc: `${SITE}/`, lastmod: newest },
  { loc: `${SITE}/visuals/`, lastmod: newest },
  ...pieces.map(p => ({ loc: p.url, lastmod: p.updated || p.published })),
];
writeOut('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`);

// ---- robots.txt ----
writeOut('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Built ${pieces.length} visual${pieces.length === 1 ? '' : 's'} -> dist/`);
pieces.forEach(p => console.log(`  • ${p.slug}  (${p.published || 'no date'})`));
