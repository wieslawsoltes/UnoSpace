#!/usr/bin/env node
// Validates curated data and the built site: schema essentials, internal links,
// anchors, asset references and duplicate ids. Exits non-zero on any problem.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { iconNames } from './lib/icons.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const errors = [];
const err = (m) => errors.push(m);

/* ---- data ---- */
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog.json'), 'utf8'));
const layers = new Set(['model', 'engine', 'io', 'rendering', 'controls', 'editor', 'workbench', 'service']);
const cats = new Set(catalog.categories.map((c) => c.id));
for (const { repo, category, accent, accent2 } of catalog.projects) {
  const slug = repo.toLowerCase();
  const f = path.join(root, `data/projects/${slug}.json`);
  if (!fs.existsSync(f)) { err(`missing data/projects/${slug}.json`); continue; }
  let d;
  try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { err(`${slug}: invalid JSON (${e.message})`); continue; }
  if (!cats.has(category)) err(`${slug}: unknown catalog category ${category}`);
  if (!/^#[0-9a-f]{6}$/i.test(accent) || !/^#[0-9a-f]{6}$/i.test(accent2)) err(`${slug}: accent colors must be #rrggbb`);
  for (const k of ['name', 'tagline', 'summary']) if (!d[k]) err(`${slug}: missing ${k}`);
  for (const k of ['highlights', 'featureGroups', 'packages', 'architecture', 'boundaries']) if (!Array.isArray(d[k]) || !d[k].length) err(`${slug}: ${k} must be a non-empty array`);
  if (!d.playground?.tour?.length) err(`${slug}: playground.tour is empty`);
  d.highlights?.forEach((h) => { if (!iconNames.includes(h.icon)) err(`${slug}: unknown icon "${h.icon}"`); });
  d.packages?.forEach((p) => { if (!layers.has(p.layer)) err(`${slug}: package ${p.name} has unknown layer "${p.layer}"`); });
  if (!fs.existsSync(path.join(root, `data/generated/${slug}.json`))) err(`${slug}: missing generated data (run npm run sync)`);
}

/* ---- site ---- */
if (!fs.existsSync(dist)) err('dist/ missing — run npm run build first');
const pages = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith('.html')) pages.push(f); } };
if (fs.existsSync(dist)) walk(dist);
const idsOf = new Map();
for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  for (const id of ids) { if (seen.has(id)) err(`${path.relative(dist, page)}: duplicate id "${id}"`); seen.add(id); }
  idsOf.set(page, seen);
  if (!/<title>[^<]+<\/title>/.test(html)) err(`${path.relative(dist, page)}: missing <title>`);
}
let links = 0;
for (const page of pages) {
  if (page.endsWith('404.html')) continue;
  const html = fs.readFileSync(page, 'utf8').replace(/<script type="application\/json"[\s\S]*?<\/script>/g, '');
  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^(https?:|mailto:|data:|javascript:)/.test(ref) || ref.startsWith('//')) continue;
    links++;
    const [file, hash] = ref.split('#');
    const target = file ? path.resolve(path.dirname(page), file) : page;
    const resolved = fs.existsSync(target) && fs.statSync(target).isDirectory() ? path.join(target, 'index.html') : target;
    if (!fs.existsSync(resolved)) { err(`${path.relative(dist, page)}: broken link ${ref}`); continue; }
    if (hash && resolved.endsWith('.html') && idsOf.has(resolved) && !idsOf.get(resolved).has(hash) && !(resolved.includes('playground') || resolved.includes('packages'))) err(`${path.relative(dist, page)}: missing anchor ${ref}`);
  }
}
if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log(`✓ ${catalog.projects.length} projects valid · ${pages.length} pages · ${links} internal references checked`);
