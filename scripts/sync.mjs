#!/usr/bin/env node
// Clones (or reuses) every Uno Space repository and extracts computed facts:
// project graph, NuGet dependencies, lines of code, toolchain, CI workflows,
// docs, screenshots, the README "NuGet packages" docs, nuget.org statistics and the
// latest GitHub release. Output: data/generated/<slug>.json + summary.json.
//
//   node scripts/sync.mjs              # clone into .cache/repos if missing
//   REPOS_DIR=/path node scripts/sync.mjs
//   node scripts/sync.mjs --pull       # refresh existing clones
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNugetSection } from './lib/nuget-readme.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog.json'), 'utf8'));
const reposDir = path.resolve(process.env.REPOS_DIR || path.join(root, '.cache/repos'));
const outDir = path.join(root, 'data/generated');
const shotsDir = path.join(root, 'site/static/shots');
const pull = process.argv.includes('--pull');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

fs.mkdirSync(reposDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function walk(dir, filter, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['bin', 'obj', 'node_modules', 'artifacts'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, acc);
    else if (filter(full)) acc.push(full);
  }
  return acc;
}

const lineCount = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  return text.length ? text.split('\n').filter((l) => l.trim().length).length : 0;
};

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`));
  return m ? m[1].trim() : '';
};

function readProps(repoDir) {
  const props = {};
  for (const file of ['Directory.Build.props', 'Directory.Packages.props']) {
    const p = path.join(repoDir, file);
    if (!fs.existsSync(p)) continue;
    const xml = fs.readFileSync(p, 'utf8');
    for (const m of xml.matchAll(/<([A-Za-z][\w.]*)(?:\s+Condition="[^"]*")?>([^<]*)<\/\1>/g)) {
      if (!(m[1] in props)) props[m[1]] = m[2].trim();
    }
    for (const m of xml.matchAll(/<PackageVersion\s+Include="([^"]+)"\s+Version="([^"]+)"/g)) props[`pkg:${m[1]}`] = m[2];
  }
  return props;
}

function resolve(value, props, depth = 0) {
  if (!value || depth > 5) return value;
  return value.replace(/\$\(([\w.]+)\)/g, (_, key) => (props[key] !== undefined ? resolve(props[key], props, depth + 1) : `$(${key})`));
}

function classify(rel, name) {
  if (rel.startsWith('tests/') || /\.Tests?$|Tests\b|Benchmarks?/.test(name)) return 'test';
  if (rel.startsWith('server/') || /\.Server$/.test(name)) return 'server';
  if (/\.App$/.test(name)) return 'app';
  if (rel.startsWith('src/')) return 'library';
  return 'tool';
}

const ghHeaders = { 'User-Agent': 'unospace-sync', Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

async function githubMeta(full) {
  try {
    const res = await fetch(`https://api.github.com/repos/${full}`, { headers: ghHeaders });
    if (!res.ok) return null;
    const j = await res.json();
    return { stars: j.stargazers_count, forks: j.forks_count, openIssues: j.open_issues_count, createdAt: j.created_at, pushedAt: j.pushed_at, homepage: j.homepage || '', license: j.license?.spdx_id || '' };
  } catch {
    return null;
  }
}

// Newest GitHub release (pre-releases included).
async function latestRelease(full) {
  try {
    const res = await fetch(`https://api.github.com/repos/${full}/releases?per_page=1`, { headers: ghHeaders });
    if (!res.ok) return null;
    const [r] = await res.json();
    return r ? { tag: r.tag_name, url: r.html_url, prerelease: r.prerelease, publishedAt: r.published_at } : null;
  } catch {
    return null;
  }
}

// Every package owned by the nuget.org account: latest version (pre-releases included) and downloads.
async function nugetStats(nugetOwner) {
  const stats = new Map();
  try {
    const index = await (await fetch('https://api.nuget.org/v3/index.json')).json();
    const search = index.resources.find((r) => r['@type'].startsWith('SearchQueryService'))['@id'];
    for (let skip = 0; ; skip += 100) {
      const j = await (await fetch(`${search}?q=owner:${encodeURIComponent(nugetOwner)}&prerelease=true&semVerLevel=2.0.0&take=100&skip=${skip}`)).json();
      for (const d of j.data) stats.set(d.id.toLowerCase(), { id: d.id, version: d.version, downloads: d.totalDownloads, verified: !!d.verified });
      if (j.data.length < 100) break;
    }
  } catch (e) {
    console.warn(`  nuget.org query failed: ${e.message}`);
  }
  return stats;
}

const nugetIndex = await nugetStats(catalog.nugetOwner || catalog.owner);
console.log(`nuget.org: ${nugetIndex.size} packages owned by ${catalog.nugetOwner || catalog.owner}`);

const summary = [];
for (const entry of catalog.projects) {
  const repo = entry.repo;
  const slug = repo.toLowerCase();
  const full = `${catalog.owner}/${repo}`;
  const dir = path.join(reposDir, repo);
  if (!fs.existsSync(dir)) {
    console.log(`clone ${full}`);
    execFileSync('git', ['clone', '--depth', '1', '-q', `https://github.com/${full}.git`, dir], { stdio: 'inherit' });
  } else if (pull) {
    console.log(`pull ${full}`);
    try { git(dir, 'pull', '--ff-only', '-q'); } catch (e) { console.warn(`  pull failed: ${e.message}`); }
  }

  const props = readProps(dir);
  const csprojs = walk(dir, (f) => f.endsWith('.csproj'));
  const projects = csprojs.map((file) => {
    const xml = fs.readFileSync(file, 'utf8');
    const rel = path.relative(dir, file).split(path.sep).join('/');
    const name = path.basename(file, '.csproj');
    const projDir = path.dirname(file);
    const sources = walk(projDir, (f) => /\.(cs|xaml)$/.test(f));
    const tfms = resolve(tag(xml, 'TargetFrameworks') || tag(xml, 'TargetFramework'), props);
    return {
      name,
      path: rel,
      kind: classify(rel, name),
      sdk: (xml.match(/<Project\s+Sdk="([^"]+)"/) || [])[1] || '',
      targetFrameworks: tfms.split(';').map((s) => s.trim()).filter(Boolean),
      packable: /<IsPackable>\s*true/i.test(xml),
      packageId: resolve(tag(xml, 'PackageId'), props) || name,
      description: resolve(tag(xml, 'Description'), props),
      unoFeatures: resolve(tag(xml, 'UnoFeatures'), props).split(';').map((s) => s.trim()).filter(Boolean),
      projectRefs: [...xml.matchAll(/<ProjectReference\s+Include="([^"]+)"/g)].map((m) => path.basename(m[1].replace(/\\/g, '/'), '.csproj')),
      packageRefs: [...xml.matchAll(/<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]*)")?/g)].map((m) => ({ id: m[1], version: resolve(m[2] || props[`pkg:${m[1]}`] || '', props) })),
      files: sources.length,
      loc: sources.reduce((n, f) => n + lineCount(f), 0),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  let globalJson = {};
  try { globalJson = JSON.parse(fs.readFileSync(path.join(dir, 'global.json'), 'utf8')); } catch {}
  const workflowsDir = path.join(dir, '.github/workflows');
  const workflows = fs.existsSync(workflowsDir)
    ? fs.readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f)).map((f) => {
        const y = fs.readFileSync(path.join(workflowsDir, f), 'utf8');
        return { file: f, name: (y.match(/^name:\s*(.+)$/m) || [])[1]?.replace(/['"]/g, '').trim() || f };
      })
    : [];
  const docs = fs.existsSync(path.join(dir, 'docs'))
    ? walk(path.join(dir, 'docs'), (f) => f.endsWith('.md')).map((f) => path.relative(dir, f).split(path.sep).join('/')).sort()
    : [];

  // Screenshots committed in the source repository.
  const images = [];
  const imgDir = path.join(dir, 'docs/images');
  if (fs.existsSync(imgDir)) {
    fs.mkdirSync(path.join(shotsDir, slug), { recursive: true });
    for (const f of fs.readdirSync(imgDir).filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f))) {
      fs.copyFileSync(path.join(imgDir, f), path.join(shotsDir, slug, f));
      images.push(`shots/${slug}/${f}`);
    }
  }

  let lastCommit = null;
  try {
    const [sha, date, subject] = git(dir, 'log', '-1', '--format=%h%x09%cI%x09%s').split('\t');
    lastCommit = { sha, date, subject };
  } catch {}

  const all = walk(dir, (f) => /\.(cs|xaml)$/.test(f));
  const loc = { total: 0, src: 0, tests: 0 };
  for (const f of all) {
    const n = lineCount(f);
    const rel = path.relative(dir, f);
    loc.total += n;
    if (rel.startsWith('src')) loc.src += n;
    else if (rel.startsWith('tests')) loc.tests += n;
  }

  const readme = fs.existsSync(path.join(dir, 'README.md')) ? fs.readFileSync(path.join(dir, 'README.md'), 'utf8') : '';
  const pinned = [];
  const toolchainTable = readme.match(/\|\s*Dependency\s*\|\s*Version\s*\|[\s\S]*?\n\n/);
  if (toolchainTable) {
    for (const row of toolchainTable[0].split('\n').slice(2)) {
      const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length === 2) pinned.push({ name: cells[0], version: cells[1].replace(/`/g, '') });
    }
  }

  // Published packages: README docs merged with nuget.org statistics, keyed by package ID.
  const docs0 = parseNugetSection(readme, `https://github.com/${full}`);
  const packages = (docs0?.packages || []).map((d) => {
    const project = projects.find((p) => p.packageId === d.id) || null;
    return { ...d, project: project?.name || null, nuget: nugetIndex.get(d.id.toLowerCase()) || null };
  });
  const nugetDocs = docs0 ? { intro: docs0.intro, install: docs0.install, notes: docs0.notes, packages } : null;
  if (nugetDocs) {
    const unpublished = packages.filter((x) => !x.nuget).map((x) => x.id);
    if (unpublished.length) console.warn(`  ${repo}: documented but not found on nuget.org: ${unpublished.join(', ')}`);
  }

  const libraries = projects.filter((p) => p.kind === 'library');
  const nuget = new Map();
  for (const p of projects) for (const r of p.packageRefs) if (r.version) nuget.set(r.id, r.version);

  const data = {
    slug,
    repo: full,
    version: props.Version || '',
    dotnetSdk: globalJson.sdk?.version || '',
    unoSdk: globalJson['msbuild-sdks']?.['Uno.Sdk'] || '',
    pinned,
    github: await githubMeta(full),
    release: await latestRelease(full),
    lastCommit,
    loc,
    projectCount: projects.length,
    libraryCount: libraries.length,
    testProjectCount: projects.filter((p) => p.kind === 'test').length,
    projects,
    nuget: [...nuget].map(([id, version]) => ({ id, version })).sort((a, b) => a.id.localeCompare(b.id)),
    workflows,
    docs,
    images,
    nugetDocs,
  };
  fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify(data, null, 2) + '\n');
  const published = packages.filter((x) => x.nuget);
  const downloads = published.reduce((n, x) => n + x.nuget.downloads, 0);
  summary.push({ slug, repo, version: data.version, loc: loc.total, libraries: libraries.length, projects: projects.length, workflows: workflows.length, stars: data.github?.stars ?? null, nugetPackages: published.length, nugetDownloads: downloads });
  console.log(`  ${repo.padEnd(18)} ${String(projects.length).padStart(2)} projects  ${String(loc.total).padStart(7)} LOC  ${workflows.length} workflows  ${published.length} on NuGet (${downloads} downloads)`);
}

fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), projects: summary }, null, 2) + '\n');
console.log(`wrote ${summary.length} project files to ${path.relative(root, outDir)}`);
