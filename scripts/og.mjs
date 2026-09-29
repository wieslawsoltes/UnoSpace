#!/usr/bin/env node
// Renders the social preview image (site/static/og.jpg) from the built home page.
// Requires `npm run build` and `npm run serve` running on PORT (default 4173).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${port}/UnoSpace/`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '.nav,.scroll-cue,.to-top,.hero .actions{display:none!important}.hero{min-height:630px!important;padding:40px 0!important}.hero h1{font-size:56px!important}.hero .lede{font-size:17px!important;max-width:470px!important}' });
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(root, 'site/static/og.jpg'), type: 'jpeg', quality: 86 });
await browser.close();
console.log('wrote site/static/og.jpg');
