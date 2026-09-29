#!/usr/bin/env node
// Captures a screenshot of every live GitHub Pages deployment once the Uno
// WebAssembly runtime has finished booting. Output: site/static/shots/<slug>/live.jpg
//
//   node scripts/shots.mjs                 # all projects
//   node scripts/shots.mjs vectorspace     # a subset
//   PW_CHANNEL=chrome node scripts/shots.mjs   # use an installed Chrome
//   SHOT_SCHEME=dark node scripts/shots.mjs    # emulate a dark OS theme (default: light)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog.json'), 'utf8'));
const only = process.argv.slice(2).map((s) => s.toLowerCase());
const settle = Number(process.env.SHOT_SETTLE_MS || 6000);

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
// Light OS theme by default: several apps only partially adapt to prefers-color-scheme: dark.
// One shared context so the .NET runtime assets stay in the HTTP cache across retries.
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, colorScheme: process.env.SHOT_SCHEME || 'light' });
const attempts = Number(process.env.SHOT_ATTEMPTS || 3);
let failures = 0;
for (const { repo } of catalog.projects) {
  const slug = repo.toLowerCase();
  if (only.length && !only.includes(slug)) continue;
  const url = `https://${catalog.owner}.github.io/${repo}/`;
  for (let attempt = 1; attempt <= attempts; attempt++) {
  const page = await context.newPage();
  const started = Date.now();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 90_000 });
    // The Uno bootstrapper removes its splash/loader once the managed app is running.
    // Poll defensively: the page may swap documents (service worker) while booting.
    const deadline = Date.now() + 90_000;
    for (;;) {
      const ready = await page.evaluate(() => {
        const loader = document.querySelector('.uno-loader, #uno-loading, .uno-persistent-loader');
        const hidden = !loader || loader.offsetParent === null || getComputedStyle(loader).opacity === '0';
        return hidden && document.querySelectorAll('canvas, [xamltype]').length > 0;
      }).catch(() => false);
      if (ready) break;
      if (Date.now() > deadline) throw new Error('Uno runtime did not finish booting within 90s');
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(settle);
    const dir = path.join(root, 'site/static/shots', slug);
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'live.jpg'), type: 'jpeg', quality: 84 });
    console.log(`✓ ${repo.padEnd(18)} ${((Date.now() - started) / 1000).toFixed(1)}s`);
    break;
  } catch (e) {
    if (attempt === attempts) failures++;
    console.warn(`${attempt === attempts ? '✗' : '↻'} ${repo.padEnd(18)} attempt ${attempt}: ${e.message.split('\n')[0]}`);
  } finally {
    await page.close();
  }
  }
}
await browser.close();
process.exitCode = failures ? 1 : 0;
