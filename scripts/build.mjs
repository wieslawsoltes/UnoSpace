#!/usr/bin/env node
// Static site generator for Uno Space. Reads data/ and site/, writes dist/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { icon } from './lib/icons.mjs';
import { esc, highlight } from './lib/highlight.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.env.OUT_DIR || path.join(root, 'dist'));
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const catalog = read('data/catalog.json');
const { owner } = catalog;
const SITE = catalog.site;
const buildTime = new Date();
const sha = (process.env.GITHUB_SHA || '').slice(0, 7);

/* ------------------------------------------------------------------ data */
const APP_ICON = { VectorSpace: 'pen', ArtSpace: 'brush', TextSpace: 'text', GridSpace: 'table', PdfSpace: 'pdf', PresentationSpace: 'slides', ImageSpace: 'image', LightSpace: 'camera', VideoSpace: 'film', EffectsSpace: 'sparkles', CadSpace: 'cad', LabSpace: 'flask', ControlSpace: 'chip', CodeSpace: 'code', GitSpace: 'branch', DataSpace: 'database', NoteSpace: 'note' };
const LAYERS = [
  { id: 'model', label: 'Model', color: '#107c41', icon: 'cube', text: 'Immutable documents, geometry and domain types' },
  { id: 'engine', label: 'Engine', color: '#0f6cbd', icon: 'bolt', text: 'Layout, formulas, simulation and algorithms' },
  { id: 'io', label: 'I/O', color: '#ca5010', icon: 'download', text: 'Formats, persistence and interchange' },
  { id: 'rendering', label: 'Rendering', color: '#c239b3', icon: 'palette', text: 'SkiaSharp drawing, caching and export' },
  { id: 'controls', label: 'Controls', color: '#8764b8', icon: 'puzzle', text: 'Reusable Uno controls and iconography' },
  { id: 'editor', label: 'Editor', color: '#4f6bed', icon: 'pen', text: 'Interactive surfaces and direct manipulation' },
  { id: 'workbench', label: 'Workbench', color: '#038387', icon: 'layout', text: 'Complete embeddable application shells' },
  { id: 'service', label: 'Service', color: '#d13438', icon: 'plug', text: 'Hosts, workers and platform bridges' },
];
const layerOf = (id) => LAYERS.find((l) => l.id === id) || LAYERS[1];
const catOf = (id) => catalog.categories.find((c) => c.id === id);

const shotsRoot = path.join(root, 'site/static/shots');
const projects = catalog.projects.map((entry, index) => {
  const slug = entry.repo.toLowerCase();
  const cur = read(`data/projects/${slug}.json`);
  const gen = fs.existsSync(path.join(root, `data/generated/${slug}.json`)) ? read(`data/generated/${slug}.json`) : { projects: [], loc: { total: 0 }, workflows: [], docs: [], images: [], nuget: [] };
  const byName = new Map(gen.projects.map((p) => [p.name, p]));
  const packages = cur.packages.map((p) => {
    const g = byName.get(p.name);
    return { ...p, gen: g || null, npm: !g };
  });
  const live = fs.existsSync(path.join(shotsRoot, slug, 'live.jpg')) ? `static/shots/${slug}/live.jpg` : null;
  const docShot = (gen.images || [])[0] ? `static/${gen.images[0]}` : null;
  return {
    ...cur,
    ...entry,
    index,
    slug,
    name: cur.name || entry.repo,
    category: entry.category,
    icon: APP_ICON[entry.repo] || 'sparkles',
    url: `https://${owner}.github.io/${entry.repo}/`,
    repoUrl: `https://github.com/${owner}/${entry.repo}`,
    shot: live || docShot,
    extraShots: (gen.images || []).map((i) => `static/${i}`),
    gen,
    packages,
    app: gen.projects.find((p) => p.kind === 'app') || null,
    // Third-party packages shipped by libraries/app (test-only dependencies excluded).
    nuget: [...new Map(gen.projects.filter((x) => x.kind !== 'test').flatMap((x) => x.packageRefs).filter((r) => r.version).map((r) => [r.id, r])).values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
});

const totals = {
  apps: projects.length,
  libraries: projects.reduce((n, p) => n + p.packages.length, 0),
  loc: projects.reduce((n, p) => n + (p.gen.loc?.total || 0), 0),
  projects: projects.reduce((n, p) => n + (p.gen.projects?.length || 0), 0),
  workflows: projects.reduce((n, p) => n + (p.gen.workflows?.length || 0), 0),
  docs: projects.reduce((n, p) => n + (p.gen.docs?.length || 0), 0),
  features: projects.reduce((n, p) => n + p.featureGroups.reduce((m, g) => m + g.items.length, 0), 0),
  tests: projects.reduce((n, p) => n + (p.gen.testProjectCount || 0), 0),
};

/* --------------------------------------------------------------- helpers */
const vars = (p) => `--a1:${p.accent};--a2:${p.accent2}`;
const planet = (p, cls = '', size = 20) => `<span class="planet ${cls}" style="${vars(p)}" aria-hidden="true">${icon(p.icon, { size, stroke: 2 })}</span>`;
const n = (v) => Number(v || 0).toLocaleString('en-US');
const shortName = (full, prefix) => (full.startsWith(prefix + '.') ? full.slice(prefix.length + 1) : full);
const md = (s = '') => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const keys = (s = '') => esc(s).split(/\s*\/\s*/).map((part) => part.split(/\s+|\+/).filter(Boolean).map((k) => `<kbd>${k}</kbd>`).join(' ')).join(' <span class="dim">/</span> ');
const ghBlob = (p, file) => `${p.repoUrl}/blob/main/${file}`;
const ghTree = (p, dir) => `${p.repoUrl}/tree/main/${dir}`;

function writeFile(rel, content) {
  const f = path.join(out, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

/* ---------------------------------------------------------------- layout */
function layout({ R, title, description, body, active = '', style = '', image = 'static/og.jpg', canonical = '', extraHead = '' }) {
  const fullTitle = title ? `${title} · ${SITE.title}` : `${SITE.title} — ${SITE.tagline}`;
  const img = SITE.baseUrl + image;
  const navLink = (href, label, key) => `<a href="${R}${href}"${active === key ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#f3f3f3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#202020" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<script>try{var t=localStorage.getItem('unospace.theme');if(t=='light'||t=='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
<link rel="canonical" href="${SITE.baseUrl}${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE.title}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${SITE.baseUrl}${canonical}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${img}">
<link rel="icon" href="${R}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${R}assets/css/main.css">
${extraHead}
</head>
<body style="${style}">
<div class="mica" aria-hidden="true"></div>
<a class="sr-only" href="#main">Skip to content</a>
<header class="nav">
  <div class="wrap">
    <a class="brand" href="${R}index.html" aria-label="${SITE.title} home">${brandMark()}<span>Uno<span class="grad-text">Space</span></span></a>
    <button class="nav-toggle" aria-label="Menu">${icon('menu', { size: 22 })}</button>
    <nav class="nav-links" aria-label="Primary">
      <div class="menu"><button aria-expanded="false" aria-haspopup="true">Apps ${icon('arrow', { size: 14 })}</button>
        <div class="mega">${projects.map((p) => `<a href="${R}projects/${p.slug}/index.html">${planet(p, '', 18)}<span><b>${p.name}</b><small>${esc(catOf(p.category).label)}</small></span></a>`).join('')}</div>
      </div>
      ${navLink('playground/index.html', 'Playground', 'playground')}
      ${navLink('packages/index.html', 'Packages', 'packages')}
      ${navLink('compare/index.html', 'Compare', 'compare')}
      <a href="https://github.com/${owner}/UnoSpace" rel="noopener">${icon('github', { size: 16 })} GitHub</a>
      <button class="btn btn-subtle btn-icon theme-toggle" data-theme-toggle aria-label="Toggle light or dark theme" title="Toggle theme">${icon('sun', { size: 18 })}${icon('moon', { size: 18 })}</button>
      <a class="btn btn-primary btn-sm nav-cta" href="${R}playground/index.html">${icon('play', { size: 14 })} Launch apps</a>
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
${footer(R)}
<button class="to-top" aria-label="Back to top"><svg class="ring" width="42" height="42" viewBox="0 0 48 48"><circle cx="24" cy="24" r="23" stroke-dasharray="144.5" stroke-dashoffset="144.5"/></svg><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
<script src="${R}assets/js/main.js" defer></script>
</body>
</html>
`;
}

function brandMark(k = 'h') {
  return `<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="bm-${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f9ff0"/><stop offset="1" stop-color="#5b4fd9"/></linearGradient></defs><rect x="1" y="1" width="30" height="30" rx="8" fill="url(#bm-${k})"/><circle cx="16" cy="16" r="5.2" fill="#fff"/><ellipse class="orbit" cx="16" cy="16" rx="11.5" ry="4.4" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="1.6" transform="rotate(-30 16 16)"/><circle cx="25.6" cy="10.5" r="1.9" fill="#fff"/></svg>`;
}

function footer(R) {
  const col = (cat) => projects.filter((p) => p.category === cat);
  return `<footer class="footer">
  <div class="wrap">
    <div class="cols">
      <div>
        <a class="brand" href="${R}index.html">${brandMark('f')}<span>Uno<span class="grad-text">Space</span></span></a>
        <p style="margin-top:14px;max-width:340px">${esc(SITE.tagline)} Built with <a href="https://platform.uno" rel="noopener"><b>Uno Platform</b></a>, SkiaSharp and .NET WebAssembly.</p>
        <p class="dim" style="font-size:13px">Every app is original MIT-licensed work by Wiesław Šoltés. Product names mentioned for comparison belong to their owners.</p>
      </div>
      <div><h4>Design & Documents</h4><ul>${[...col('Design'), ...col('Documents')].map((p) => `<li><a href="${R}projects/${p.slug}/index.html">${p.name}</a></li>`).join('')}</ul></div>
      <div><h4>Media & Engineering</h4><ul>${[...col('Media'), ...col('Engineering')].map((p) => `<li><a href="${R}projects/${p.slug}/index.html">${p.name}</a></li>`).join('')}</ul></div>
      <div><h4>Developer & Data</h4><ul>${[...col('Developer'), ...col('Data')].map((p) => `<li><a href="${R}projects/${p.slug}/index.html">${p.name}</a></li>`).join('')}</ul>
        <h4 style="margin-top:26px">Explore</h4><ul><li><a href="${R}playground/index.html">Playground</a></li><li><a href="${R}packages/index.html">Package explorer</a></li><li><a href="${R}compare/index.html">Compare apps</a></li><li><a href="${R}data/apps.json">apps.json</a></li></ul></div>
    </div>
    <div class="base"><span>© ${buildTime.getUTCFullYear()} Wiesław Šoltés · MIT License</span><span class="mono">Built ${buildTime.toISOString().slice(0, 10)}${sha ? ` · <a href="https://github.com/${owner}/UnoSpace/commit/${sha}">${sha}</a>` : ''}</span></div>
  </div>
</footer>`;
}

/* ------------------------------------------------------------- components */
function appCard(p, R, i) {
  const search = [p.name, p.tagline, p.summary, p.category, p.inspiredBy, ...p.packages.map((x) => x.name)].join(' ').toLowerCase();
  return `<article class="app-card" data-reveal style="${vars(p)};--d:${i % 3}" data-cat="${p.category}" data-search="${esc(search)}">
  <div class="shot">${p.shot ? `<img src="${R}${p.shot}" alt="${esc(p.name)} running in the browser" loading="lazy" width="1600" height="1000">` : ''}</div>
  <span class="live"><span class="live-dot">LIVE</span></span>
  <div class="body">
    <div class="head">${planet(p, '', 26)}<div><div class="cat">${esc(catOf(p.category).label)}</div><h3>${p.name}</h3></div></div>
    <p>${esc(p.tagline)}</p>
    <div class="meta"><span><b>${p.packages.length}</b> libs</span><span><b>${n(p.gen.loc?.total)}</b> lines</span><span>v${esc(p.gen.version || p.version || '—')}</span><span class="go">${icon('arrow', { size: 18 })}</span></div>
  </div>
  <a class="cover" href="${R}projects/${p.slug}/index.html" aria-label="${esc(p.name)} details"></a>
</article>`;
}

function playground(p, R, { hub = false } = {}) {
  const tour = (p.playground?.tour || []).map((s) => `<li><label><input type="checkbox" aria-label="Mark step done"><div><b>${esc(s.title)}</b><span>${md(s.text)}</span></div></label></li>`).join('');
  const shortcuts = (p.shortcuts || []).slice(0, 12).map((s) => `<div><span>${esc(s.action)}</span><span>${keys(s.keys)}</span></div>`).join('');
  return `<div class="pg" data-pg data-url="${p.url}" data-slug="${p.slug}" data-name="${esc(p.name)}" style="${vars(p)}">
  <div class="pg-bar">
    <div class="grp" role="group" aria-label="Viewport">
      <button class="btn btn-icon is-on" data-device="desktop" title="Desktop" aria-label="Desktop viewport">${icon('desktop', { size: 17 })}</button>
      <button class="btn btn-icon" data-device="tablet" title="Tablet" aria-label="Tablet viewport">${icon('tablet', { size: 17 })}</button>
      <button class="btn btn-icon" data-device="phone" title="Phone" aria-label="Phone viewport">${icon('phone', { size: 17 })}</button>
    </div>
    <div class="url">${p.url}</div>
    <div class="grp">
      <button class="btn btn-icon" data-act="reload" title="Reload" aria-label="Reload app">${icon('reload', { size: 17 })}</button>
      <button class="btn btn-icon" data-act="full" title="Fullscreen" aria-label="Fullscreen">${icon('expand', { size: 17 })}</button>
      <a class="btn btn-icon" data-act="open" href="${p.url}" target="_blank" rel="noopener" title="Open in new tab" aria-label="Open in new tab">${icon('external', { size: 17 })}</a>
    </div>
  </div>
  <div class="pg-body">
    <div class="pg-stage">
      <div class="pg-device">
        <div class="pg-cover">
          ${p.shot ? `<img src="${R}${p.shot}" alt="${esc(p.name)} screenshot" loading="lazy">` : '<img alt="">'}
          <div>
            <button class="play" aria-label="Launch ${esc(p.name)}">${icon('play', { size: 34, stroke: 0 }).replace('fill="none"', 'fill="currentColor"')}</button>
            <h3>${hub ? esc(p.name) : `Try ${esc(p.name)} live`}</h3>
            <p>${esc(p.playground?.intro || 'Launch the real WebAssembly build right here.')}</p>
            <span class="chip">${icon('bolt', { size: 14 })} Real C# · Uno WebAssembly · runs locally in your browser</span>
          </div>
        </div>
        <div class="pg-loading"><div><div class="ring"></div>Booting .NET WebAssembly runtime…</div></div>
      </div>
    </div>
    ${hub ? '' : `<aside class="pg-side" data-tour-host>
      <div><h4>Guided tour <span class="tour-count"></span></h4><div class="progress"><i></i></div><ol class="tour">${tour}</ol></div>
      ${shortcuts ? `<div><h4>Keyboard</h4><div class="keys">${shortcuts}</div></div>` : ''}
      <p class="pg-note">${icon('info', { size: 15 })}<span>The playground embeds the production GitHub Pages build. Files stay in your browser; first load downloads the .NET runtime.</span></p>
    </aside>`}
  </div>
</div>`;
}

/* ----- dependency graph (layered DAG, build-time layout) ----- */
function depGraph(p) {
  const libs = p.packages.filter((x) => x.gen);
  const names = new Set(libs.map((x) => x.name));
  const nodes = libs.map((x) => ({ id: x.name, label: shortName(x.name, p.repo), loc: x.gen.loc, layer: x.layer, refs: x.gen.projectRefs.filter((r) => names.has(r)) }));
  if (p.app) nodes.push({ id: p.app.name, label: 'App', loc: p.app.loc, layer: 'app', refs: p.app.projectRefs.filter((r) => names.has(r)), app: true });
  const byId = new Map(nodes.map((x) => [x.id, x]));
  const depth = new Map();
  const dfs = (id, seen = new Set()) => {
    if (depth.has(id)) return depth.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    const node = byId.get(id);
    const d = node.refs.length ? 1 + Math.max(...node.refs.map((r) => dfs(r, seen))) : 0;
    depth.set(id, d);
    return d;
  };
  nodes.forEach((x) => dfs(x.id));
  const maxD = Math.max(0, ...nodes.map((x) => depth.get(x.id)));
  if (p.app) depth.set(p.app.name, maxD + (nodes.some((x) => !x.app && depth.get(x.id) === maxD) ? 1 : 0));
  const D = Math.max(...nodes.map((x) => depth.get(x.id)));
  const rows = Array.from({ length: D + 1 }, () => []);
  nodes.forEach((x) => rows[depth.get(x.id)].push(x));
  // order rows by barycenter of dependencies to reduce crossings
  const xpos = new Map();
  const nodeW = (x) => Math.max(96, x.label.length * 8.2 + 44);
  const gap = 18;
  const rowWidth = (r) => r.reduce((s, x) => s + nodeW(x), 0) + gap * (r.length - 1);
  const W = Math.max(960, ...rows.map(rowWidth)) + 80;
  rows.forEach((r, d) => {
    if (d > 0) r.sort((a, b) => {
      const bc = (x) => (x.refs.length ? x.refs.reduce((s, id) => s + (xpos.get(id) ?? W / 2), 0) / x.refs.length : W / 2);
      return bc(a) - bc(b);
    });
    let x = (W - rowWidth(r)) / 2;
    r.forEach((node) => { node.w = nodeW(node); node.x = x; xpos.set(node.id, x + node.w / 2); x += node.w + gap; });
  });
  const rowH = 92, nodeH = 46, top = 30;
  const H = top * 2 + (D + 1) * rowH - (rowH - nodeH);
  const yOf = (node) => top + (D - depth.get(node.id)) * rowH;
  // transitive relations
  const down = (id, acc = new Set()) => { for (const r of byId.get(id).refs) if (!acc.has(r)) { acc.add(r); down(r, acc); } return acc; };
  const upMap = new Map(nodes.map((x) => [x.id, []]));
  nodes.forEach((x) => x.refs.forEach((r) => upMap.get(r).push(x.id)));
  const up = (id, acc = new Set()) => { for (const r of upMap.get(id)) if (!acc.has(r)) { acc.add(r); up(r, acc); } return acc; };
  const maxLoc = Math.max(1, ...nodes.map((x) => x.loc));
  let edges = '';
  nodes.forEach((x) => x.refs.forEach((r) => {
    const t = byId.get(r);
    const x1 = x.x + x.w / 2, y1 = yOf(x) + nodeH, x2 = t.x + t.w / 2, y2 = yOf(t);
    const my = (y1 + y2) / 2;
    edges += `<path class="edge${x.app ? ' flow' : ''}" data-from="${x.id}" data-to="${r}" d="M${x1.toFixed(1)} ${y1}C${x1.toFixed(1)} ${my} ${x2.toFixed(1)} ${my} ${x2.toFixed(1)} ${y2}"/>`;
  }));
  const levelLines = rows.map((_, d) => `<line class="lvl-line" x1="0" x2="${W}" y1="${top + (D - d) * rowH + nodeH / 2}" y2="${top + (D - d) * rowH + nodeH / 2}"/>`).join('');
  const nodeSvg = nodes.map((x) => {
    const rel = [...down(x.id), ...up(x.id)].join(' ');
    const col = x.app ? p.accent : layerOf(x.layer).color;
    const y = yOf(x);
    const bw = Math.max(4, (x.loc / maxLoc) * (x.w - 24));
    return `<g class="node" tabindex="0" data-id="${x.id}" data-rel="${rel}" role="button" aria-label="${esc(x.id)}">
<rect x="${x.x.toFixed(1)}" y="${y}" width="${x.w.toFixed(1)}" height="${nodeH}" rx="12"/>
<rect class="bar" x="${(x.x + 12).toFixed(1)}" y="${y + nodeH - 8}" width="${bw.toFixed(1)}" height="3" rx="1.5" fill="${col}"/>
<circle cx="${(x.x + 16).toFixed(1)}" cy="${y + 19}" r="4" fill="${col}"/>
<text x="${(x.x + 28).toFixed(1)}" y="${y + 23}">${esc(x.label)}</text>
<text class="sub" x="${(x.x + 28).toFixed(1)}" y="${y + 35}">${n(x.loc)} lines</text></g>`;
  }).join('');
  return `<svg class="graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} project dependency graph">
<defs><linearGradient id="edgeGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.accent}"/><stop offset="1" stop-color="${p.accent2}"/></linearGradient></defs>
${levelLines}${edges}${nodeSvg}</svg>`;
}

function pkgCard(pk, p) {
  const L = layerOf(pk.layer);
  const g = pk.gen;
  const prefix = p.repo + '.';
  const nm = pk.name.startsWith(prefix) ? `<span class="ns">${esc(prefix)}</span>${esc(pk.name.slice(prefix.length))}` : esc(pk.name);
  const nuget = g ? g.packageRefs.filter((r) => r.version).map((r) => r.id) : [];
  const deps = g ? g.projectRefs : [];
  const search = [pk.name, pk.role, pk.ui, pk.layer, p.name, ...nuget].join(' ').toLowerCase();
  const href = g ? ghTree(p, path.posix.dirname(g.path)) : ghTree(p, `src/${pk.name}`);
  return `<a class="card pkg" id="pkg-${esc(pk.name)}" href="${href}" target="_blank" rel="noopener" style="${vars(p)};--lc:${L.color}" data-layer="${pk.layer}" data-proj="${p.slug}" data-search="${esc(search)}">
  <div class="row"><span class="layer-pill">${L.label}</span><span class="badge">${pk.npm ? 'npm' : g?.packable ? 'packable' : 'library'}</span></div>
  <h3>${nm}</h3>
  <p>${md(pk.role)}</p>
  <div class="tags"><span class="badge">${esc(pk.ui === 'None' ? 'No UI deps' : pk.ui)}</span>${g ? g.targetFrameworks.map((t) => `<span class="badge">${esc(t)}</span>`).join('') : ''}</div>
  ${deps.length ? `<div class="deps">refs → <span>${deps.map((d) => esc(shortName(d, p.repo))).join(', ')}</span></div>` : ''}
  ${nuget.length ? `<div class="deps">nuget → <span>${nuget.map(esc).join(', ')}</span></div>` : ''}
  ${g ? `<div class="nums"><span><b>${n(g.loc)}</b> lines</span><span><b>${g.files}</b> files</span><span><b>${deps.length}</b> refs</span></div>` : ''}
</a>`;
}

/* ================================================================= HOME */
function homePage() {
  const R = '';
  const orbitData = projects.map((p) => ({ name: p.name, tagline: p.tagline, accent: p.accent, accent2: p.accent2, glyph: icon(p.icon, { size: 24, stroke: 2 }).replace('stroke="currentColor"', 'stroke="#fff"').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), href: `projects/${p.slug}/index.html`, weight: Math.min(1, (p.gen.loc?.total || 0) / 20000) }));
  const metrics = {
    metrics: [
      { key: 'loc', label: 'Lines of C# & XAML', caption: 'Non-blank lines of C# and XAML per repository (src, tests, tools).' },
      { key: 'libs', label: 'Reusable libraries', caption: 'Independently reusable libraries shipped alongside each app.' },
      { key: 'features', label: 'Documented features', caption: 'Individual capabilities catalogued on each project page.' },
      { key: 'projects', label: '.NET projects', caption: 'All .csproj projects: libraries, app host, tests, tools and servers.' },
      { key: 'workflows', label: 'CI workflows', caption: 'GitHub Actions workflows gating builds, tests, Pages and releases.' },
    ],
    apps: projects.map((p) => ({ name: p.name, accent: p.accent, accent2: p.accent2, href: `projects/${p.slug}/index.html`, loc: p.gen.loc?.total || 0, libs: p.packages.length, projects: p.gen.projects?.length || 0, workflows: p.gen.workflows?.length || 0, features: p.featureGroups.reduce((m, g) => m + g.items.length, 0) })),
  };
  // Donut by category
  const cats = catalog.categories.map((c) => ({ ...c, count: projects.filter((p) => p.category === c.id).length }));
  const C = 2 * Math.PI * 80;
  let acc = 0;
  const donut = cats.map((c) => {
    const len = (c.count / projects.length) * C;
    const seg = `<circle class="seg" cx="110" cy="110" r="80" stroke="${c.color}" stroke-dasharray="${(len - 3).toFixed(2)} ${(C - len + 3).toFixed(2)}" data-len="${(-acc + len).toFixed(2)}" data-off="${(-acc).toFixed(2)}" style="stroke-dashoffset:${(-acc).toFixed(2)}"><title>${c.label}: ${c.count}</title></circle>`;
    acc += len;
    return seg;
  }).join('');
  // Layer distribution
  const layerRows = LAYERS.map((L) => {
    const segs = projects.map((p) => ({ p, k: p.packages.filter((x) => x.layer === L.id).length })).filter((x) => x.k);
    const total = segs.reduce((s, x) => s + x.k, 0);
    return { L, segs, total };
  }).filter((r) => r.total);
  // Shared NuGet matrix
  const nugetCount = new Map();
  projects.forEach((p) => new Set((p.nuget || []).map((x) => x.id.replace(/\.NativeAssets\..*$/, '').replace(/^Uno\.WinUI\..*$/, 'Uno.WinUI.*'))).forEach((id) => nugetCount.set(id, (nugetCount.get(id) || 0) + 1)));
  const topNuget = [...nugetCount].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 14).map(([id]) => id);
  let mi = 0;
  const matrix = `<table><thead><tr><th>Package</th>${projects.map((p) => `<th><span>${p.name}</span></th>`).join('')}</tr></thead><tbody>${topNuget.map((id) => `<tr><td>${esc(id)}</td>${projects.map((p) => {
    const has = (p.nuget || []).some((x) => x.id === id || x.id.startsWith(id.replace('*', '')) || x.id.replace(/\.NativeAssets\..*$/, '') === id);
    const ver = (p.nuget || []).find((x) => x.id === id)?.version || '';
    return `<td>${has ? `<div class="m" style="${vars(p)};--i:${mi++}" title="${p.name}${ver ? ' · ' + ver : ''}"></div>` : ''}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;

  const withShots = projects.filter((p) => p.shot);
  const pattern = [
    ['Core', 'cube', 'Immutable model', '#107c41'], ['Documents', 'download', 'Formats & storage', '#ca5010'], ['Engine', 'bolt', 'Layout · formulas · sim', '#0f6cbd'], ['Editing', 'history', 'Transactions & undo', '#4f6bed'],
    ['Skia', 'palette', 'Rendering & export', '#c239b3'], ['Controls', 'puzzle', 'Custom Uno controls', '#8764b8'], ['Workbench', 'layout', 'Embeddable shell', '#038387'], ['App', 'globe', 'Browser + desktop', '#d13438'],
  ];
  const body = `
<section class="hero">
  <div class="wrap">
    <div>
      <div class="pill"><b>${projects.length} apps</b>Uno Platform · SkiaSharp · .NET WebAssembly</div>
      <h1><span class="line"><span style="--i:0">Desktop‑class apps.</span></span><span class="line"><span style="--i:1">Written in C#.</span></span><span class="line"><span style="--i:2" class="grad-text">Running in your browser.</span></span></h1>
      <p class="lede">Uno Space is a constellation of ${projects.length} local‑first workspaces — vector design, word processing, spreadsheets, PDF, photo, video, CAD, PLC engineering, Git and more. Each one is real compiled C# running on Uno Platform WebAssembly, built from ${n(totals.libraries)} reusable libraries you can embed in your own apps.</p>
      <div class="actions">
        <a class="btn btn-primary" href="#apps">${icon('rocket', { size: 18 })} Explore the apps</a>
        <a class="btn" href="playground/index.html">${icon('play', { size: 16 })} Open playground</a>
      </div>
    </div>
    <div class="orbit-stage" aria-label="Interactive orbit of all Uno Space apps">
      <canvas id="orbit" role="img" aria-label="Orbit visualization: hover a planet to see the app, click to open it"></canvas>
      <div class="orbit-label"></div>
    </div>
  </div>
  <script type="application/json" id="orbit-data">${JSON.stringify(orbitData).replace(/</g, '\\u003c')}</script>
</section>


<section class="section-sm">
  <div class="wrap">
    <div class="stats" data-reveal>
      <div class="stat"><b data-count="${totals.apps}">0</b><span>browser apps, live on GitHub Pages</span></div>
      <div class="stat"><b data-count="${totals.libraries}">0</b><span>reusable .NET libraries</span></div>
      <div class="stat"><b data-count="${totals.loc}">0</b><span>lines of C# &amp; XAML</span></div>
      <div class="stat"><b data-count="${totals.features}">0</b><span>catalogued features</span></div>
      <div class="stat"><b data-count="${totals.workflows}">0</b><span>CI workflows gating every build</span></div>
      <div class="stat"><b data-count="${totals.docs}">0</b><span>engineering documents</span></div>
    </div>
  </div>
</section>

<section class="section" id="apps">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <div class="eyebrow">The constellation</div>
      <h2>Seventeen workspaces. <span class="grad-text">One C# codebase each.</span></h2>
      <p>Every app below is the real compiled application — not a mockup, WebView wrapper or embedded third‑party editor. Open any of them to explore features, packages, architecture and a live playground.</p>
    </div>
    <div class="toolbar" data-reveal>
      <button class="chip is-on" data-filter="all">All <span class="dim">${projects.length}</span></button>
      ${cats.map((c) => `<button class="chip" data-filter="${c.id}" style="--c:${c.color}"><span class="dot"></span>${esc(c.label)} <span class="dim">${c.count}</span></button>`).join('')}
      <label class="search">${icon('search', { size: 16 })}<span class="sr-only">Search apps</span><input id="app-search" type="search" placeholder="Search apps, features, packages…"></label>
    </div>
    <div class="apps" id="app-grid">${projects.map((p, i) => appCard(p, R, i)).join('')}</div>
    <p id="apps-empty" class="muted" hidden>No apps match that search.</p>
  </div>
</section>

<section class="section" style="padding-top:40px">
  <div class="wrap stack">
    <div data-reveal="left">
      <div class="eyebrow">One stack</div>
      <h2 style="font-size:clamp(34px,4.4vw,56px)">Write once in C#.<br><span class="grad-text">Ship everywhere.</span></h2>
      <p class="muted" style="font-size:18px">Each workspace is a single Uno Platform project rendered through SkiaSharp. The exact same controls, engines and editors run as WebAssembly in the browser and natively on Windows, macOS and Linux — pixel‑consistent, with no JavaScript UI framework in between.</p>
      <div class="targets" style="margin-top:30px">
        <div class="target on">${icon('globe', { size: 24 })}WebAssembly</div>
        <div class="target on">${icon('desktop', { size: 24 })}Windows</div>
        <div class="target on">${icon('desktop', { size: 24 })}macOS</div>
        <div class="target on">${icon('terminal', { size: 24 })}Linux</div>
      </div>
    </div>
    <div class="stack-layers" data-reveal="right">
      ${[
        ['Your workspace', 'Workbench, editors & custom controls', 'layout', '#d13438', `${projects.length} apps`],
        ['Uno Platform 6.7', 'WinUI API surface · single project · Skia renderer', 'layers', '#8764b8', 'UI'],
        ['SkiaSharp 3', 'GPU‑accelerated 2D graphics · HarfBuzz text shaping', 'palette', '#0f6cbd', 'Render'],
        ['.NET 10', 'C# 14 · engines · documents · algorithms', 'code', '#107c41', 'Runtime'],
        ['WebAssembly · Desktop', 'Browser, Win32, macOS, X11 hosts', 'globe', '#ca5010', 'Targets'],
      ].map(([b, s, ic, c, t], i) => `<div class="layer" style="--c:${c};--i:${i}">${icon(ic, { size: 26 })}<div><b>${b}</b><span>${s}</span></div><span class="tagline">${t}</span></div>`).join('')}
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head center" data-reveal>
      <div class="eyebrow">One architecture</div>
      <h2>Layered like a <span class="grad-text">planetary system</span></h2>
      <p>The apps share a disciplined, dependency‑ordered pattern: UI‑free engines at the core, Skia rendering in the middle, Uno controls and embeddable workbenches on top. Every layer is a package you can reuse on its own.</p>
    </div>
    <div class="pattern" data-reveal>
      ${pattern.map(([b, ic, s, c], i) => `<div class="pat" style="--c:${c}"><span class="n">0${i + 1}</span>${icon(ic, { size: 26 })}<b>${b}</b><small>${s}</small></div>`).join('')}
    </div>
    <div class="grid g2" style="margin-top:28px">
      <div class="card chart-card reveal-group" data-reveal>
        <h3 class="sub">Libraries by layer, across all apps</h3>
        <div class="layers-chart">${layerRows.map((r) => `<div class="lc-row" style="--lc:${r.L.color}"><span style="display:flex;gap:8px;align-items:center;color:${r.L.color}">${icon(r.L.icon, { size: 16 })}<span style="color:var(--text)">${r.L.label}</span></span><span class="segs">${r.segs.map((s, i) => `<span style="${vars(s.p)};--n:${s.k};--i:${i}" title="${s.p.name}: ${s.k}"></span>`).join('')}</span><b>${r.total}</b></div>`).join('')}</div>
        <p class="dim" style="font-size:13px;margin:18px 0 0">Each segment is one app, sized by how many of its libraries sit in that layer. Hover a segment to see the app.</p>
      </div>
      <div class="card chart-card" data-reveal>
        <h3 class="sub">Apps by domain</h3>
        <div class="donut-wrap">
          <svg class="donut" viewBox="0 0 220 220" width="220" height="220" role="img" aria-label="Apps by category">${donut}<text class="donut-num" x="110" y="112" text-anchor="middle">${projects.length}</text><text class="donut-cap" x="110" y="136" text-anchor="middle">apps</text></svg>
          <ul class="legend">${cats.map((c) => `<li style="--c:${c.color}"><i></i>${esc(c.label)}<b>${c.count}</b></li>`).join('')}</ul>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section" style="padding-top:20px">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <div class="eyebrow">By the numbers</div>
      <h2>Codebase <span class="grad-text">at a glance</span></h2>
      <p>Metrics are extracted straight from each repository by the CI pipeline on every deploy — project files, sources and workflows.</p>
    </div>
    <div class="card chart-card" data-reveal>
      <div class="chart-tabs">${metrics.metrics.map((m, i) => `<button class="chip${i ? '' : ' is-on'}" data-metric="${m.key}">${m.label}</button>`).join('')}</div>
      <div class="hbars" id="metric-bars"></div>
      <p class="dim" id="metric-caption" style="font-size:13px;margin:16px 0 0"></p>
      <script type="application/json" id="metric-data">${JSON.stringify(metrics).replace(/</g, '\\u003c')}</script>
    </div>
    <div class="card chart-card" data-reveal style="margin-top:20px">
      <h3 class="sub">Shared foundations — third‑party NuGet packages by app</h3>
      <div class="matrix">${matrix}</div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head center" data-reveal>
      <div class="eyebrow">Integrated playground</div>
      <h2>Don’t read about it. <span class="grad-text">Run it.</span></h2>
      <p>Every project page embeds its live WebAssembly build with viewport presets, fullscreen and a guided tour. Or jump between all ${projects.length} apps in the playground hub.</p>
    </div>
    <div class="grid g4" data-reveal="zoom">
      ${withShots.slice(0, 8).map((p, i) => `<a class="card" href="playground/index.html#${p.slug}" style="${vars(p)};padding:0;--d:${i}"><img src="${p.shot}" alt="${esc(p.name)}" loading="lazy" style="aspect-ratio:16/10;object-fit:cover;object-position:top left;width:100%"><div style="padding:14px 16px;display:flex;align-items:center;gap:10px">${planet(p, '', 14).replace('class="planet "', 'class="planet " ')}<b style="font-size:14.5px">${p.name}</b><span style="margin-left:auto" class="dim">${icon('play', { size: 14 })}</span></div></a>`).join('')}
    </div>
    <div style="text-align:center;margin-top:34px"><a class="btn btn-primary" href="playground/index.html">${icon('play', { size: 16 })} Open the playground hub</a></div>
  </div>
</section>

<section class="section-sm">
  <div class="wrap">
    <div class="cta" data-reveal="zoom">
      <div class="eyebrow">Build with the parts</div>
      <h2>${n(totals.libraries)} libraries.<br><span class="grad-text">Embed any of them.</span></h2>
      <p>Spreadsheet engines, PDF renderers, timeline editors, CAD geometry, diff algorithms, PLC simulation — browse every reusable package, its layer, dependencies and UI requirements.</p>
      <div class="actions"><a class="btn btn-primary" href="packages/index.html">${icon('package', { size: 18 })} Package explorer</a><a class="btn" href="compare/index.html">${icon('chart', { size: 16 })} Compare apps</a></div>
    </div>
  </div>
</section>`;
  return layout({ R, title: '', description: `${SITE.tagline} Explore ${projects.length} Uno Platform WebAssembly apps and ${totals.libraries} reusable .NET libraries.`, body, active: 'home' });
}

/* ========================================================= PROJECT PAGE */
function projectPage(p) {
  const R = '../../';
  const prev = projects[(p.index - 1 + projects.length) % projects.length];
  const next = projects[(p.index + 1) % projects.length];
  const g = p.gen;
  const cat = catOf(p.category);
  const heroStats = (p.heroStats || []).slice(0, 4).map((s) => {
    const num = String(s.value).replace(/,/g, '').match(/^~?(\d+(?:\.\d+)?)(×|%|\+)?$/);
    const val = num ? `<b data-count="${num[1]}" data-dec="${num[1].includes('.') ? num[1].split('.')[1].length : 0}" data-suffix="${num[2] || ''}" data-prefix="${String(s.value).startsWith('~') ? '~' : ''}">${esc(s.value)}</b>` : `<b>${esc(s.value)}</b>`;
    return `<div class="fact">${val}<span>${esc(s.label)}</span></div>`;
  }).join('');
  const featureCount = p.featureGroups.reduce((m, x) => m + x.items.length, 0);
  const sections = [
    ['overview', 'Overview'], ['features', 'Features'], ['playground', 'Playground'], ['packages', 'Packages'], ['architecture', 'Architecture'],
    ...(p.codeSamples?.length ? [['code', 'Code']] : []), ...(p.formats?.length || p.shortcuts?.length ? [['formats', 'Formats & keys']] : []), ['build', 'Build & CI'], ['boundaries', 'Boundaries'], ...(p.docs?.length ? [['docs', 'Docs']] : []),
  ];
  const nugetAll = p.nuget;
  const codeTabs = (p.codeSamples || []).map((c, i) => `<button class="chip${i ? '' : ' is-on'}" data-tab="c${i}">${esc(c.title)}</button>`).join('');
  const codePanes = (p.codeSamples || []).map((c, i) => `<div class="code-pane${i ? '' : ' on'}" data-pane="c${i}"><div class="code"><div class="code-head"><span class="badge">${esc(c.lang)}</span>${esc(c.title)}<button class="btn btn-sm" data-copy="code-${i}">${icon('copy', { size: 14 })} Copy</button></div><pre><code id="code-${i}">${highlight(c.code, c.lang)}</code></pre></div></div>`).join('');
  const toolchain = [
    ...(g.pinned?.length ? g.pinned : [
      g.dotnetSdk && { name: '.NET SDK', version: g.dotnetSdk },
      g.unoSdk && { name: 'Uno SDK', version: g.unoSdk },
    ].filter(Boolean)),
  ];
  const tfms = [...new Set(g.projects?.filter((x) => x.kind !== 'test').flatMap((x) => x.targetFrameworks) || [])];

  const body = `
<section class="p-hero" style="${vars(p)}">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb" data-reveal><a href="${R}index.html">Uno Space</a>›<a href="${R}index.html#apps">${esc(cat.label)}</a>›<span>${p.name}</span></nav>
    <div class="top">
      <div data-reveal>
        <div class="title">${planet(p, 'xl', 50)}<div><h1>${p.name}</h1><div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><span class="chip" style="--c:${cat.color}"><span class="dot"></span>${esc(cat.label)}</span>${g.version || p.version ? `<span class="chip mono">v${esc(g.version || p.version)}</span>` : ''}<span class="chip">${icon('shield', { size: 13 })} MIT</span>${g.github?.stars ? `<span class="chip">${icon('star', { size: 13 })} ${g.github.stars}</span>` : ''}</div></div></div>
        <p class="tagline">${esc(p.tagline)}</p>
        <p class="summary">${md(p.summary)}</p>
        <div class="actions">
          <a class="btn btn-primary" href="#playground">${icon('play', { size: 16 })} Try it live</a>
          <a class="btn" href="${p.url}" target="_blank" rel="noopener">${icon('external', { size: 16 })} Open full app</a>
          <a class="btn" href="${p.repoUrl}" target="_blank" rel="noopener">${icon('github', { size: 16 })} Source</a>
        </div>
      </div>
      <div class="facts" data-reveal="right">${heroStats}</div>
    </div>
    ${p.shot ? `<div class="frame"><div class="frame-bar">${planet(p, '', 10)}<span class="title">${p.name}</span><span class="url">${p.url.replace('https://', '')}</span><span class="caps" aria-hidden="true"><svg viewBox="0 0 10 10"><path d="M1 5h8"/></svg><svg viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" rx="1"/></svg><svg viewBox="0 0 10 10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/></svg></span></div><img src="${R}${p.shot}" alt="${esc(p.name)} running in a browser" width="1600" height="1000"></div>` : ''}
  </div>
</section>

<nav class="subnav" style="${vars(p)}" aria-label="Sections"><div class="wrap">${planet(p, '', 13)}${sections.map(([id, l]) => `<a href="#${id}">${l}</a>`).join('')}<span class="spacer"></span><a href="${p.url}" target="_blank" rel="noopener" class="nowrap">Open app ↗</a></div></nav>

<div style="${vars(p)}">
<section class="section" id="overview">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <div class="eyebrow">Highlights</div>
      <h2>What makes <span class="accent-text">${p.name}</span> special</h2>
      ${p.inspiredBy ? `<p>Familiar if you know ${esc(p.inspiredBy)} — but original, local‑first and written end‑to‑end in C#.</p>` : ''}
    </div>
    <div class="grid g4 hl">${p.highlights.map((h, i) => `<div class="card" data-reveal style="--d:${i % 4}"><div class="ico-orb">${icon(h.icon, { size: 22 })}</div><h3>${esc(h.title)}</h3><p>${md(h.text)}</p></div>`).join('')}</div>
    <div class="stats" data-reveal style="margin-top:28px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div class="stat"><b data-count="${p.packages.length}">0</b><span>reusable libraries</span></div>
      <div class="stat"><b data-count="${g.loc?.total || 0}">0</b><span>lines of C# &amp; XAML</span></div>
      <div class="stat"><b data-count="${featureCount}">0</b><span>features catalogued</span></div>
      <div class="stat"><b data-count="${g.projects?.length || 0}">0</b><span>.NET projects</span></div>
      <div class="stat"><b data-count="${g.workflows?.length || 0}">0</b><span>CI workflows</span></div>
      <div class="stat"><b data-count="${g.docs?.length || 0}">0</b><span>docs</span></div>
    </div>
    ${p.extraShots.length ? `<h3 class="sub" style="margin-top:44px">From the repository</h3><div class="grid ${p.extraShots.length > 2 ? 'g3' : 'g2'}">${p.extraShots.map((src, i) => `<a class="card" data-reveal style="padding:0;--d:${i}" href="${R}${src}" target="_blank" rel="noopener"><img src="${R}${src}" alt="${esc(p.name)} ${esc(path.basename(src, path.extname(src)).replace(/[-_]/g, ' '))}" loading="lazy" style="width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top left"><div style="padding:12px 16px;font-size:13.5px;color:var(--muted);text-transform:capitalize">${esc(path.basename(src, path.extname(src)).replace(/[-_]/g, ' '))}</div></a>`).join('')}</div>` : ''}
  </div>
</section>

<section class="section" id="features" style="padding-top:40px">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <div class="eyebrow">Feature tour</div>
      <h2>${featureCount} capabilities, <span class="accent-text">${p.featureGroups.length} areas</span></h2>
    </div>
    <div class="features" data-tabs data-reveal>
      <div class="f-tabs" role="tablist">${p.featureGroups.map((f, i) => `<button class="f-tab${i ? '' : ' on'}" role="tab" aria-selected="${!i}" data-tab="f${i}">${esc(f.area)}<span class="count">${f.items.length}</span></button>`).join('')}</div>
      <div>${p.featureGroups.map((f, i) => `<div class="f-panel${i ? '' : ' on'}" data-pane="f${i}" role="tabpanel"><h3>${esc(f.area)}</h3><ul class="f-list">${f.items.map((it, j) => `<li style="--i:${j}">${icon('check', { size: 18 })}<span>${md(it)}</span></li>`).join('')}</ul></div>`).join('')}</div>
    </div>
  </div>
</section>

<section class="section" id="playground" style="padding-top:40px">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <div class="eyebrow">Integrated playground</div>
      <h2>Run <span class="accent-text">${p.name}</span> right here</h2>
      <p>${esc(p.playground?.intro || '')} Switch viewports, go fullscreen and tick off the guided tour as you explore.</p>
    </div>
    <div data-reveal="zoom">${playground(p, R)}</div>
  </div>
</section>

<section class="section" id="packages" style="padding-top:40px">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <div class="eyebrow">Reusable packages</div>
      <h2>${p.packages.length} libraries <span class="accent-text">you can embed</span></h2>
      <p>${p.name} is assembled from independently reusable libraries. Hover the graph to trace dependencies; click a node to jump to its package.</p>
    </div>
    <div class="card graph-card" data-reveal>${depGraph(p)}<div class="graph-hint">${icon('info', { size: 14 })} Arrows point from a project to what it references. Bars show relative size. <span style="display:flex;gap:12px;flex-wrap:wrap;margin-left:auto">${[...new Set(p.packages.map((x) => x.layer))].map((l) => `<span style="display:inline-flex;gap:6px;align-items:center"><i style="width:8px;height:8px;border-radius:50%;background:${layerOf(l).color}"></i>${layerOf(l).label}</span>`).join('')}</span></div></div>
    <div class="pkg-grid" style="margin-top:22px">${p.packages.map((pk) => pkgCard(pk, p)).join('')}</div>
  </div>
</section>

<section class="section" id="architecture" style="padding-top:40px">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <div class="eyebrow">Architecture</div>
      <h2>From engine to <span class="accent-text">workbench</span></h2>
      <p>Layers build bottom‑up: each one depends only on those beneath it.</p>
    </div>
    <div class="arch">${(p.architecture || []).map((a, i) => `<div class="arch-layer" data-reveal style="--i:${i};--d:${i}"><b><small>L${i + 1}</small>${esc(a.name)}</b><div><p>${md(a.text)}</p><div class="pk">${(a.packages || []).map((x) => `<code>${esc(x)}</code>`).join('')}</div></div></div>`).join('')}</div>
  </div>
</section>

${p.codeSamples?.length ? `<section class="section" id="code" style="padding-top:40px">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <div class="eyebrow">Use it in code</div>
      <h2>Embed, script, <span class="accent-text">extend</span></h2>
    </div>
    <div data-tabs data-reveal><div class="code-tabs">${codeTabs}</div>${codePanes}</div>
  </div>
</section>` : ''}

${p.formats?.length || p.shortcuts?.length ? `<section class="section" id="formats" style="padding-top:40px">
  <div class="wrap split">
    ${p.formats?.length ? `<div data-reveal><h3 class="sub">File formats</h3><div class="formats">${p.formats.map((f) => `<div class="format"><b>${esc(f.name)}</b><span>${esc(f.support)}</span></div>`).join('')}</div></div>` : ''}
    ${p.shortcuts?.length ? `<div data-reveal><h3 class="sub">Keyboard essentials</h3><div class="keys card" style="padding:18px 22px">${p.shortcuts.map((s) => `<div><span>${esc(s.action)}</span><span>${keys(s.keys)}</span></div>`).join('')}</div></div>` : ''}
  </div>
</section>` : ''}

<section class="section" id="build" style="padding-top:40px">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <div class="eyebrow">Build &amp; CI</div>
      <h2>Continuously <span class="accent-text">verified</span></h2>
      <p>Each push runs through GitHub Actions. The public browser build is deployed only from successful pipelines.</p>
    </div>
    <div class="pipeline" data-reveal>${(g.workflows || []).map((w) => `<a class="stage" href="${p.repoUrl}/actions/workflows/${w.file}" target="_blank" rel="noopener"><b>${icon('workflow', { size: 16 })} ${esc(w.name)}</b><code>${esc(w.file)}</code><img src="${p.repoUrl}/actions/workflows/${w.file}/badge.svg" alt="${esc(w.name)} status" loading="lazy"></a>`).join('')}</div>
    <div class="split" style="margin-top:26px">
      <div data-reveal><h3 class="sub">Toolchain</h3><div class="tc">${toolchain.map((t) => `<div><span>${esc(t.name)}</span><span>${esc(t.version)}</span></div>`).join('')}${tfms.length ? `<div><span>Target frameworks</span><span>${tfms.map(esc).join(' · ')}</span></div>` : ''}</div></div>
      <div data-reveal><h3 class="sub">Third‑party NuGet packages</h3><div class="tc">${nugetAll.length ? nugetAll.map((x) => `<div><span>${esc(x.id)}</span><span>${esc(x.version)}</span></div>`).join('') : '<div><span>None beyond the Uno SDK</span><span>—</span></div>'}</div></div>
    </div>
    <div class="code" data-reveal style="margin-top:26px"><div class="code-head"><span class="badge">bash</span>Clone &amp; run the browser build locally<button class="btn btn-sm" data-copy="clone-cmd">${icon('copy', { size: 14 })} Copy</button></div><pre><code id="clone-cmd">${highlight(`git clone ${p.repoUrl}.git\ncd ${p.repo}\ndotnet workload install wasm-tools\ndotnet run --project ${p.app ? path.posix.dirname(p.app.path) : `src/${p.repo}.App`} -f net10.0-browserwasm`, 'bash')}</code></pre></div>
  </div>
</section>

<section class="section" id="boundaries" style="padding-top:40px">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <div class="eyebrow">Honest boundaries</div>
      <h2>What it <span class="accent-text">doesn’t</span> claim</h2>
      <p>The project documents its limits as carefully as its features.</p>
    </div>
    <ul class="list-clean" data-reveal>${(p.boundaries || []).map((b) => `<li>${icon('info', { size: 16 })}<span>${md(b)}</span></li>`).join('')}</ul>
  </div>
</section>

${p.docs?.length ? `<section class="section" id="docs" style="padding-top:40px">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <div class="eyebrow">Documentation</div>
      <h2>Go <span class="accent-text">deeper</span></h2>
    </div>
    <div class="docs">${p.docs.map((d, i) => `<a class="doc" data-reveal style="--d:${i % 4}" href="${ghBlob(p, d.path)}" target="_blank" rel="noopener">${icon('book', { size: 18 })}<div><b>${esc(d.title)}</b><span>${esc(d.blurb || d.path)}</span></div></a>`).join('')}<a class="doc" data-reveal href="${ghBlob(p, 'README.md')}" target="_blank" rel="noopener">${icon('github', { size: 18 })}<div><b>README</b><span>Build, run, publish and embed</span></div></a></div>
  </div>
</section>` : ''}

<section class="section-sm">
  <div class="wrap pager">
    <a href="../${prev.slug}/index.html" style="${vars(prev)}">${icon('arrowLeft', { size: 20 })}${planet(prev, '', 20)}<span><small>Previous</small><b>${prev.name}</b></span></a>
    <a class="next" href="../${next.slug}/index.html" style="${vars(next)}"><span><small>Next</small><b>${next.name}</b></span>${planet(next, '', 20)}${icon('arrow', { size: 20 })}</a>
  </div>
</section>
</div>`;
  return layout({ R, title: `${p.name} — ${p.tagline}`, description: p.summary, body, image: p.shot || 'static/og.jpg', canonical: `projects/${p.slug}/`, style: vars(p) });
}

/* ======================================================= PLAYGROUND HUB */
function playgroundPage() {
  const R = '../';
  const first = projects[0];
  const hubData = projects.map((p) => ({ slug: p.slug, name: p.name, url: p.url, accent: p.accent, accent2: p.accent2, shot: p.shot ? R + p.shot : '', intro: p.playground?.intro || p.tagline, tour: (p.playground?.tour || []).map((s) => ({ title: esc(s.title), text: md(s.text) })), href: `${R}projects/${p.slug}/index.html` }));
  const body = `
<section class="page-hero">
  <div class="wrap">
    <div class="eyebrow">Playground hub</div>
    <h1>All ${projects.length} apps. <span class="grad-text">One click away.</span></h1>
    <p>Pick an app to boot its production WebAssembly build inside this page. Nothing is uploaded — every app runs locally in your browser tab.</p>
  </div>
</section>
<section class="section-sm" style="padding-top:0">
  <div class="wrap hub" id="hub" style="${vars(first)}">
    <div class="hub-list" role="tablist" aria-label="Apps">${projects.map((p) => `<button data-slug="${p.slug}" role="tab">${planet(p, '', 16)}${p.name}</button>`).join('')}</div>
    <div>
      ${playground(first, R, { hub: true })}
      <div class="card" id="hub-tour" style="margin-top:18px"></div>
    </div>
  </div>
  <script type="application/json" id="hub-data">${JSON.stringify(hubData).replace(/</g, '\\u003c')}</script>
</section>`;
  return layout({ R, title: 'Playground', description: `Launch any of ${projects.length} Uno Platform WebAssembly apps inline with viewport presets and guided tours.`, body, active: 'playground', canonical: 'playground/' });
}

/* ===================================================== PACKAGES EXPLORER */
function packagesPage() {
  const R = '../';
  const all = projects.flatMap((p) => p.packages.map((pk) => ({ pk, p })));
  const layerCounts = LAYERS.map((L) => ({ L, n: all.filter((x) => x.pk.layer === L.id).length })).filter((x) => x.n);
  const noUi = all.filter((x) => /^None/.test(x.pk.ui)).length;
  const body = `
<section class="page-hero">
  <div class="wrap">
    <div class="eyebrow">Package explorer</div>
    <h1><span class="grad-text">${all.length}</span> reusable libraries</h1>
    <p>Every app is decomposed into packages you can reference on their own — ${noUi} of them have no UI dependency at all. Filter by architectural layer or app, or search by capability.</p>
  </div>
</section>
<section class="section-sm" style="padding-top:0" id="pkg-explorer">
  <div class="wrap">
    <div class="stats" data-reveal style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:30px">${layerCounts.map(({ L, n: c }) => `<div class="stat"><b data-count="${c}" style="color:${L.color}">0</b><span>${L.label}<br><small class="dim">${esc(L.text)}</small></span></div>`).join('')}</div>
    <div class="toolbar">
      <button class="chip is-on" data-layer-filter="all">All layers</button>
      ${layerCounts.map(({ L }) => `<button class="chip" data-layer-filter="${L.id}" style="--c:${L.color}"><span class="dot"></span>${L.label}</button>`).join('')}
      <select id="pkg-proj" class="chip" style="padding:8px 14px;color:var(--text)" aria-label="Filter by app"><option value="all">All apps</option>${projects.map((p) => `<option value="${p.slug}">${p.name}</option>`).join('')}</select>
      <label class="search">${icon('search', { size: 16 })}<span class="sr-only">Search packages</span><input id="pkg-search" type="search" placeholder="Search e.g. pdf, timeline, formula…"></label>
    </div>
    <p class="dim mono" style="font-size:13px"><span id="pkg-count">${all.length}</span> packages shown</p>
    ${projects.map((p) => `<div class="pkg-section" style="margin-top:34px">
      <h2 style="display:flex;align-items:center;gap:14px;font-size:26px">${planet(p, '', 20)}<a href="${R}projects/${p.slug}/index.html#packages">${p.name}</a><span class="dim" style="font:500 13px var(--mono)">${p.packages.length} packages</span></h2>
      <div class="pkg-grid">${p.packages.map((pk) => pkgCard(pk, p)).join('')}</div>
    </div>`).join('')}
  </div>
</section>`;
  return layout({ R, title: 'Package explorer', description: `Browse ${all.length} reusable .NET libraries across ${projects.length} Uno Platform apps, by layer and dependency.`, body, active: 'packages', canonical: 'packages/' });
}

/* ============================================================== COMPARE */
function comparePage() {
  const R = '../';
  const rows = projects.map((p) => ({
    p,
    loc: p.gen.loc?.total || 0,
    src: p.gen.loc?.src || 0,
    tests: p.gen.loc?.tests || 0,
    libs: p.packages.length,
    projects: p.gen.projects?.length || 0,
    workflows: p.gen.workflows?.length || 0,
    features: p.featureGroups.reduce((m, g) => m + g.items.length, 0),
    formats: p.formats?.length || 0,
    docs: p.gen.docs?.length || 0,
  }));
  const max = (k) => Math.max(1, ...rows.map((r) => r[k]));
  const cols = [['loc', 'Lines'], ['tests', 'Test lines'], ['libs', 'Libraries'], ['features', 'Features'], ['projects', 'Projects'], ['workflows', 'CI'], ['formats', 'Formats'], ['docs', 'Docs']];
  // bubble chart: x = codebase size, y = catalogued features, r = libraries
  const W = 1000, H = 540, pad = 64;
  const ext = (k, padFrac) => { const v = rows.map((r) => r[k]); const lo = Math.min(...v), hi = Math.max(...v); const d = (hi - lo) * padFrac; return [Math.max(0, lo - d), hi + d]; };
  const [x0, x1] = ext('loc', 0.08), [y0, y1] = ext('features', 0.18);
  const sx = (v) => pad + ((v - x0) / (x1 - x0)) * (W - pad * 2), sy = (v) => H - pad - ((v - y0) / (y1 - y0)) * (H - pad * 2);
  const nice = (lo, hi, n) => { const step = Math.pow(10, Math.floor(Math.log10((hi - lo) / n))); const m = [1, 2, 5, 10].find((k) => (hi - lo) / (step * k) <= n) * step; const out = []; for (let t = Math.ceil(lo / m) * m; t <= hi; t += m) out.push(t); return out; };
  const ticksX = nice(x0, x1, 7), ticksY = nice(y0, y1, 5);
  const labels = [];
  const placedDots = rows.map((r) => ({ x: sx(r.loc), y: sy(r.features), r: 8 + r.libs * 1.7 }));
  const bubbles = rows.slice().sort((a, b) => b.libs - a.libs).map((r) => {
    const x = sx(r.loc), y = sy(r.features), rad = 8 + r.libs * 1.7;
    const tw = r.p.name.length * 7.2;
    const options = [
      { lx: x + rad + 6, ly: y + 4, anchor: 'start', bx: x + rad + 6 },
      { lx: x - rad - 6, ly: y + 4, anchor: 'end', bx: x - rad - 6 - tw },
      { lx: x, ly: y - rad - 8, anchor: 'middle', bx: x - tw / 2 },
      { lx: x, ly: y + rad + 16, anchor: 'middle', bx: x - tw / 2 },
    ];
    const hit = (o) => o.bx < pad || o.bx + tw > W - 4 || labels.some((b) => o.bx < b.x + b.w && o.bx + tw > b.x && o.ly - 12 < b.y && o.ly > b.y - 12)
      || placedDots.some((d) => Math.hypot(Math.max(o.bx, Math.min(d.x, o.bx + tw)) - d.x, Math.max(o.ly - 11, Math.min(d.y, o.ly)) - d.y) < d.r);
    const o = options.find((c) => !hit(c)) || options[0];
    labels.push({ x: o.bx, y: o.ly, w: tw });
    return `<a href="${R}projects/${r.p.slug}/index.html"><g class="bub"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}" fill="${r.p.accent}" fill-opacity=".82"><title>${r.p.name}: ${n(r.loc)} lines, ${r.features} features, ${r.libs} libraries</title></circle><text x="${o.lx.toFixed(1)}" y="${o.ly.toFixed(1)}" text-anchor="${o.anchor}">${r.p.name}</text></g></a>`;
  }).join('');
  const defs = '';
  const body = `
<section class="page-hero">
  <div class="wrap">
    <div class="eyebrow">Compare</div>
    <h1>Side by side, <span class="grad-text">by the numbers</span></h1>
    <p>How the ${projects.length} workspaces stack up in size, modularity and documented capability. Click a column to sort.</p>
  </div>
</section>
<section class="section-sm" style="padding-top:0">
  <div class="wrap">
    <div class="card" data-reveal style="padding:20px">
      <h3 class="sub" style="margin:10px 10px 0">Size × capability — bubble size is the number of reusable libraries</h3>
      <svg class="bubble-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bubble chart of codebase size versus features">
        <defs>${defs}</defs>
        ${ticksY.map((t) => `<line class="axis" x1="${pad}" x2="${W - pad}" y1="${sy(t)}" y2="${sy(t)}" stroke-dasharray="2 6"/><text class="tick" x="${pad - 10}" y="${sy(t) + 4}" text-anchor="end">${t}</text>`).join('')}
        ${ticksX.map((t) => `<line class="axis" y1="${pad / 2}" y2="${H - pad}" x1="${sx(t)}" x2="${sx(t)}" stroke-dasharray="2 6"/><text class="tick" x="${sx(t)}" y="${H - pad + 22}" text-anchor="middle">${n(t)}</text>`).join('')}
        <text class="tick" x="${W / 2}" y="${H - 12}" text-anchor="middle">lines of C# &amp; XAML →</text>
        <text class="tick" x="16" y="${H / 2}" text-anchor="middle" transform="rotate(-90 16 ${H / 2})">catalogued features →</text>
        ${bubbles}
      </svg>
    </div>
    <div class="ptable-wrap" data-reveal style="margin-top:24px">
      <table class="ptable" data-sortable>
        <thead><tr><th data-key="name" data-type="text">App</th><th data-key="cat" data-type="text">Domain</th>${cols.map(([k, l]) => `<th data-key="${k}"${k === 'loc' ? ' class="sorted"' : ''}>${l}</th>`).join('')}<th data-key="ver" data-type="text">Version</th></tr></thead>
        <tbody>${rows.sort((a, b) => b.loc - a.loc).map((r) => `<tr style="${vars(r.p)}" data-name="${r.p.name}" data-cat="${r.p.category}" data-ver="${esc(r.p.gen.version || '')}" ${cols.map(([k]) => `data-${k}="${r[k]}"`).join(' ')}>
          <td><a class="app" href="${R}projects/${r.p.slug}/index.html">${planet(r.p, '', 15)}${r.p.name}</a></td><td class="muted">${esc(r.p.category)}</td>
          ${cols.map(([k]) => `<td><span class="cell-bar"><i style="--v:${(r[k] / max(k)).toFixed(3)}"></i>${n(r[k])}</span></td>`).join('')}
          <td class="mono dim">${esc(r.p.gen.version || '—')}</td></tr>`).join('')}</tbody>
      </table>
    </div>
  </div>
</section>`;
  return layout({ R, title: 'Compare apps', description: `Compare ${projects.length} Uno Platform apps by codebase size, libraries, features and CI.`, body, active: 'compare', canonical: 'compare/' });
}

function notFoundPage() {
  const R = '/UnoSpace/';
  const body = `<section class="page-hero" style="min-height:70vh;display:grid;place-items:center;text-align:center"><div class="wrap"><div class="eyebrow">404 · lost in space</div><h1><span class="grad-text">This orbit is empty.</span></h1><p style="margin:0 auto 30px">The page you were looking for drifted off. Try one of the apps instead.</p><a class="btn btn-primary" href="${R}index.html">${icon('rocket', { size: 16 })} Back to Uno Space</a></div></section>`;
  return layout({ R, title: 'Not found', description: 'Page not found.', body });
}

/* ================================================================ WRITE */
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
copyDir(path.join(root, 'site/assets'), path.join(out, 'assets'));
copyDir(path.join(root, 'site/static'), path.join(out, 'static'));
if (fs.existsSync(path.join(root, 'site/favicon.svg'))) fs.copyFileSync(path.join(root, 'site/favicon.svg'), path.join(out, 'favicon.svg'));

writeFile('index.html', homePage());
for (const p of projects) writeFile(`projects/${p.slug}/index.html`, projectPage(p));
writeFile('playground/index.html', playgroundPage());
writeFile('packages/index.html', packagesPage());
writeFile('compare/index.html', comparePage());
writeFile('404.html', notFoundPage());
writeFile('.nojekyll', '');
writeFile('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE.baseUrl}sitemap.xml\n`);
const urls = ['', 'playground/', 'packages/', 'compare/', ...projects.map((p) => `projects/${p.slug}/`)];
writeFile('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE.baseUrl}${u}</loc><lastmod>${buildTime.toISOString().slice(0, 10)}</lastmod></url>`).join('\n')}\n</urlset>\n`);
writeFile('data/apps.json', JSON.stringify({
  generatedAt: buildTime.toISOString(),
  totals,
  apps: projects.map((p) => ({ name: p.name, slug: p.slug, category: p.category, tagline: p.tagline, url: p.url, repo: p.repoUrl, version: p.gen.version, loc: p.gen.loc, packages: p.packages.map((x) => ({ name: x.name, layer: x.layer, ui: x.ui, role: x.role })) })),
}, null, 2));
writeFile('build-info.json', JSON.stringify({ builtAt: buildTime.toISOString(), commit: process.env.GITHUB_SHA || null, run: process.env.GITHUB_RUN_ID || null }, null, 2));
console.log(`built ${urls.length} pages → ${path.relative(root, out)} (${totals.apps} apps, ${totals.libraries} libraries, ${n(totals.loc)} lines)`);
