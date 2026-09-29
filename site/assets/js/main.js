/* Uno Space — interactions, animations and infographics. No dependencies. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const toast = (msg) => {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1800);
  };

  /* ---------------- Navigation ---------------- */
  const nav = $('.nav');
  const onScroll = () => {
    const y = scrollY;
    nav && nav.classList.toggle('scrolled', y > 10);
    const top = $('.to-top');
    if (top) {
      top.classList.toggle('on', y > 800);
      const h = document.documentElement.scrollHeight - innerHeight;
      const c = $('circle', top);
      if (c) c.style.strokeDashoffset = String(144.5 * (1 - Math.min(1, y / Math.max(1, h))));
    }
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  $('.nav-toggle')?.addEventListener('click', () => { nav.classList.toggle('open'); });
  $$('.menu > button').forEach((b) => b.addEventListener('click', () => {
    const m = b.parentElement; const open = !m.classList.contains('open');
    m.classList.toggle('open', open); b.setAttribute('aria-expanded', String(open));
  }));
  document.addEventListener('click', (e) => { $$('.menu.open').forEach((m) => { if (!m.contains(e.target)) m.classList.remove('open'); }); });
  $('.to-top')?.addEventListener('click', () => scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }));

  /* ---------------- Reveal & counters ---------------- */
  const fmt = (n, dec = 0) => n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const count = (el) => {
    const target = parseFloat(el.dataset.count); const dec = +(el.dataset.dec || 0);
    const suffix = el.dataset.suffix || ''; const prefix = el.dataset.prefix || '';
    if (reduced || !isFinite(target)) { el.textContent = prefix + fmt(target, dec) + suffix; return; }
    const dur = 1600 + Math.min(900, target / 60); const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - p, 4);
      el.textContent = prefix + fmt(target * e, dec) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      en.target.classList.add('in');
      $$('[data-count]', en.target).concat(en.target.matches('[data-count]') ? [en.target] : []).forEach((c) => { if (!c._done) { c._done = 1; count(c); } });
      io.unobserve(en.target);
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  $$('[data-reveal], [data-count], .reveal-group').forEach((el) => io.observe(el));

  /* ---------------- Reveal light (pointer-following highlight on materials) ---------------- */
  const REVEAL = '.card, .app-card, .fact, .f-list li, .pat, .target, .format, .doc, .stage, .pager a, .list-clean li, .arch-layer, .btn, .chip, .pkg, .ng-hero, .ng-panel, .ng-notes, .ng-strip';
  if (matchMedia('(pointer: fine)').matches) {
    let lit = null, px = 0, py = 0, queued = false;
    const paint = () => {
      queued = false;
      if (!lit) return;
      const r = lit.getBoundingClientRect();
      lit.style.setProperty('--mx', `${px - r.left}px`); lit.style.setProperty('--my', `${py - r.top}px`);
    };
    document.addEventListener('pointermove', (e) => {
      const el = e.target.closest?.(REVEAL);
      if (el !== lit) { lit?.style.removeProperty('--mx'); lit?.style.removeProperty('--my'); lit = el; }
      px = e.clientX; py = e.clientY;
      if (lit && !queued) { queued = true; requestAnimationFrame(paint); }
    }, { passive: true });
    document.addEventListener('pointerleave', () => { lit?.style.removeProperty('--mx'); lit?.style.removeProperty('--my'); lit = null; });
  }

  /* ---------------- Hero depth parallax (floating acrylic cards) ---------------- */
  const stage = $('.orbit-stage');
  if (stage && !reduced && matchMedia('(pointer: fine)').matches) {
    const cards = $$('.float-card', stage);
    $('.hero')?.addEventListener('pointermove', (e) => {
      const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
      cards.forEach((c) => { const d = +c.dataset.depth || 20; c.style.setProperty('--px', `${(-x * d).toFixed(1)}px`); c.style.setProperty('--py', `${(-y * d).toFixed(1)}px`); });
    }, { passive: true });
  }

  /* ---------------- Theme (light / dark, follows system until chosen) ---------------- */
  const sysDark = matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : sysDark.matches;
  const themeChanged = () => document.dispatchEvent(new CustomEvent('themechange'));
  $$('[data-theme-toggle]').forEach((b) => b.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('unospace.theme', next); } catch {}
    themeChanged();
  }));
  sysDark.addEventListener?.('change', themeChanged);

  /* ---------------- Orbit system (home hero) ---------------- */
  const orbit = $('#orbit');
  const orbitData = $('#orbit-data');
  if (orbit && orbitData) {
    const apps = JSON.parse(orbitData.textContent);
    const ctx = orbit.getContext('2d');
    const label = $('.orbit-label');
    const rings = [
      { r: 0.46, speed: 0.00012, n: 4 },
      { r: 0.7, speed: -0.00008, n: 6 },
      { r: 0.94, speed: 0.00005, n: 7 },
    ];
    let k = 0;
    const bodies = [];
    rings.forEach((ring, ri) => {
      for (let i = 0; i < ring.n && k < apps.length; i++, k++) {
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(apps[k].glyph);
        bodies.push({ ...apps[k], img, ring: ri, a: (i / ring.n) * Math.PI * 2 + ri * 0.7 });
      }
    });
    const logo = new Image();
    logo.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="5.2" fill="#fff"/><ellipse cx="16" cy="16" rx="11.5" ry="4.4" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="1.6" transform="rotate(-30 16 16)"/><circle cx="25.6" cy="10.5" r="1.9" fill="#fff"/></svg>');
    let size, dpr, hover = null, mx = 0, my = 0, tmx = 0, tmy = 0, slow = 1, lastT = 0, visible = true, colors;
    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      colors = { ring: cs.getPropertyValue('--stroke-2').trim(), surface: cs.getPropertyValue('--surface').trim(), fg: cs.getPropertyValue('--fg').trim(), dark: isDark() };
    };
    readColors(); document.addEventListener('themechange', () => requestAnimationFrame(readColors));
    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1); const r = orbit.getBoundingClientRect(); size = r.width;
      orbit.width = size * dpr; orbit.height = size * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize(); addEventListener('resize', resize);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(orbit);
    const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
    const tile = (x, y, s, c1, c2, img, alpha, lift) => {
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.shadowColor = colors.dark ? 'rgba(0,0,0,0.5)' : c1 + '66'; ctx.shadowBlur = lift * 1.6; ctx.shadowOffsetY = lift / 2;
      const g = ctx.createLinearGradient(x - s / 2, y - s / 2, x + s / 2, y + s / 2);
      g.addColorStop(0, c2); g.addColorStop(0.7, c1); g.addColorStop(1, c1);
      rr(x - s / 2, y - s / 2, s, s, s * 0.24); ctx.fillStyle = g; ctx.fill();
      ctx.shadowColor = 'transparent';
      const gl = ctx.createRadialGradient(x - s * 0.22, y - s * 0.46, 0, x - s * 0.22, y - s * 0.46, s * 0.75);
      gl.addColorStop(0, 'rgba(255,255,255,0.5)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gl; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
      if (img.complete && img.naturalWidth) ctx.drawImage(img, x - s * 0.27, y - s * 0.27, s * 0.54, s * 0.54);
      ctx.restore();
    };
    const tiltBase = 0.46;
    const project = (b, R, cx, cy) => {
      const tilt = tiltBase + tmy * 0.12; const rot = -0.28 + tmx * 0.14;
      const x0 = Math.cos(b.a) * R * rings[b.ring].r; const y0 = Math.sin(b.a) * R * rings[b.ring].r;
      const x1 = x0 * Math.cos(rot) - y0 * tilt * Math.sin(rot); const y1 = x0 * Math.sin(rot) + y0 * tilt * Math.cos(rot);
      const z = Math.sin(b.a);
      return { x: cx + x1, y: cy + y1, z, s: 1 + z * 0.16 };
    };
    const draw = (t) => {
      const dt = Math.min(50, t - (lastT || t)); lastT = t;
      tmx += (mx - tmx) * 0.06; tmy += (my - tmy) * 0.06;
      slow += ((hover ? 0 : 1) - slow) * 0.1;
      if (!visible || !colors) return;
      const S = size, cx = S / 2, cy = S / 2, R = S * 0.46;
      ctx.clearRect(0, 0, S, S);
      const tilt = tiltBase + tmy * 0.12; const rot = -0.28 + tmx * 0.14;
      rings.forEach((ring) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(1, tilt);
        ctx.beginPath(); ctx.arc(0, 0, R * ring.r, 0, Math.PI * 2);
        ctx.restore(); ctx.strokeStyle = colors.ring; ctx.lineWidth = 1; ctx.stroke();
      });
      if (!reduced) bodies.forEach((b) => { b.a += rings[b.ring].speed * dt * slow * 6; });
      const placed = bodies.map((b) => ({ b, p: project(b, R, cx, cy) })).sort((a, c) => a.p.z - c.p.z);
      const tileBase = R * 0.13;
      let coreDrawn = false;
      const drawCore = () => { tile(cx, cy, R * 0.24, '#5b4fd9', '#4f9ff0', logo, 1, 18); };
      for (const { b, p } of placed) {
        if (!coreDrawn && p.z > 0) { drawCore(); coreDrawn = true; }
        const s = tileBase * p.s * (hover === b ? 1.18 : 1);
        const alpha = 0.55 + (p.z + 1) * 0.225;
        tile(p.x, p.y, s, b.accent, b.accent2, b.img, alpha, hover === b ? 16 : 6 + (p.z + 1) * 2);
        if (hover === b) { ctx.save(); rr(p.x - s / 2 - 4, p.y - s / 2 - 4, s + 8, s + 8, s * 0.3); ctx.strokeStyle = colors.fg; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); }
        b._p = p; b._r = s / 2;
      }
      if (!coreDrawn) drawCore();
      if (hover && label) {
        const rect = orbit.getBoundingClientRect(); const stage = orbit.parentElement.getBoundingClientRect();
        label.style.left = `${rect.left - stage.left + hover._p.x}px`; label.style.top = `${rect.top - stage.top + hover._p.y - hover._r}px`;
      }
    };
    let raf; const loop = (t) => { draw(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else raf = requestAnimationFrame(loop); });
    orbit.addEventListener('pointermove', (e) => {
      const r = orbit.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
      mx = (x / r.width - 0.5); my = (y / r.height - 0.5);
      let best = null, bd = 1e9;
      for (const b of bodies) { if (!b._p) continue; const d = Math.hypot(b._p.x - x, b._p.y - y); if (d < Math.max(18, b._r * 1.3) && d < bd) { bd = d; best = b; } }
      hover = best; orbit.style.cursor = best ? 'pointer' : 'default';
      if (label) { label.classList.toggle('on', !!best); if (best) label.innerHTML = `${best.name}<small>${best.tagline}</small>`; }
    });
    orbit.addEventListener('pointerleave', () => { hover = null; mx = my = 0; label?.classList.remove('on'); });
    orbit.addEventListener('click', () => { if (hover) location.href = hover.href; });
  }

  /* ---------------- Home: filter & search ---------------- */
  const appGrid = $('#app-grid');
  if (appGrid) {
    const cards = $$('.app-card', appGrid); let cat = 'all', q = '';
    const apply = () => {
      let shown = 0;
      cards.forEach((c) => {
        const ok = (cat === 'all' || c.dataset.cat === cat) && (!q || c.dataset.search.includes(q));
        c.classList.toggle('hide', !ok); if (ok) shown++;
      });
      const e = $('#apps-empty'); if (e) e.hidden = shown > 0;
    };
    $$('[data-filter]').forEach((b) => b.addEventListener('click', () => {
      cat = b.dataset.filter; $$('[data-filter]').forEach((x) => x.classList.toggle('is-on', x === b)); apply();
    }));
    $('#app-search')?.addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); apply(); });
  }

  /* ---------------- Home: metric bar chart ---------------- */
  const metricData = $('#metric-data');
  if (metricData) {
    const data = JSON.parse(metricData.textContent); const box = $('#metric-bars'); const host = box.closest('.chart-card');
    const render = (key) => {
      const m = data.metrics.find((x) => x.key === key);
      const rows = data.apps.map((a) => ({ ...a, v: a[key] })).sort((a, b) => b.v - a.v);
      const max = Math.max(...rows.map((r) => r.v), 1);
      box.innerHTML = rows.map((r, i) => `<a class="hbar" href="${r.href}" style="--a1:${r.accent};--a2:${r.accent2};--v:${(r.v / max).toFixed(4)};--i:${i}"><span class="name"><i></i>${r.name}</span><span class="track"><span class="fill" style="display:block"></span></span><span class="val">${fmt(r.v)}</span></a>`).join('');
      const cap = $('#metric-caption'); if (cap) cap.textContent = m.caption;
      host.classList.remove('in'); void host.offsetWidth; requestAnimationFrame(() => host.classList.add('in'));
    };
    $$('[data-metric]').forEach((b) => b.addEventListener('click', () => {
      $$('[data-metric]').forEach((x) => x.classList.toggle('is-on', x === b)); render(b.dataset.metric);
    }));
    render(data.metrics[0].key);
    host.classList.remove('in'); io.observe(host);
  }
  $$('.donut circle.seg').forEach((c) => { c.style.strokeDashoffset = c.dataset.len; });
  $$('.donut').forEach((d) => new IntersectionObserver(([e], o) => { if (e.isIntersecting) { $$('circle.seg', d).forEach((c) => { c.style.strokeDashoffset = c.dataset.off; }); o.disconnect(); } }, { threshold: 0.3 }).observe(d));

  /* ---------------- Project page: scrollspy & parallax ---------------- */
  const sub = $('.subnav');
  if (sub) {
    const links = $$('a[href^="#"]', sub); const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const strip = $('.wrap', sub);
    // Only scroll the sub-nav strip horizontally. Element.scrollIntoView() would also
    // scroll the page itself and fight the user's wheel/touch scrolling.
    const centerLink = (a) => {
      if (strip.scrollWidth <= strip.clientWidth) return;
      const left = a.offsetLeft - strip.offsetLeft - (strip.clientWidth - a.offsetWidth) / 2;
      strip.scrollTo({ left: Math.max(0, left), behavior: reduced ? 'auto' : 'smooth' });
    };
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { links.forEach((l) => l.classList.remove('on')); const a = map.get(e.target.id); if (a) { a.classList.add('on'); centerLink(a); } } });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }
  const frame = $('.frame');
  if (frame && !reduced) {
    const upd = () => {
      const r = frame.getBoundingClientRect(); const p = Math.min(1, Math.max(0, 1 - (r.top - innerHeight * 0.15) / (innerHeight * 0.7)));
      frame.style.setProperty('--sc', (0.97 + 0.03 * p).toFixed(4));
    };
    addEventListener('scroll', upd, { passive: true }); upd();
  } else if (frame) { frame.style.setProperty('--sc', '1'); }

  /* ---------------- Tabs (features, code) ---------------- */
  $$('[data-tabs]').forEach((group) => {
    const tabs = $$('[data-tab]', group);
    tabs.forEach((t) => t.addEventListener('click', () => {
      tabs.forEach((x) => { const on = x === t; x.classList.toggle('on', on); x.classList.toggle('is-on', on); x.setAttribute('aria-selected', String(on)); });
      $$('[data-pane]', group).forEach((p) => p.classList.toggle('on', p.dataset.pane === t.dataset.tab));
    }));
  });

  /* ---------------- NuGet package browser: #nuget-<PackageId> deep links ---------------- */
  const ngBrowser = $('.ng-browser');
  if (ngBrowser) {
    const openPkg = (hash, scroll) => {
      if (!hash.startsWith('#nuget-')) return false;
      const pane = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!pane || !ngBrowser.contains(pane)) return false;
      const tab = $(`[data-tab="${pane.dataset.pane}"]`, ngBrowser);
      if (tab && !tab.classList.contains('on')) tab.click();
      const list = tab?.parentElement; // horizontal strip on narrow screens
      if (list && list.scrollWidth > list.clientWidth) list.scrollTo({ left: tab.offsetLeft - 12 });
      if (scroll) pane.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      return true;
    };
    $$('[data-tab]', ngBrowser).forEach((t) => t.addEventListener('click', () => {
      const pane = $(`[data-pane="${t.dataset.tab}"]`, ngBrowser);
      if (pane) history.replaceState(null, '', `#${pane.id}`);
    }));
    document.addEventListener('click', (e) => {
      const a = e.target.closest?.('a[href^="#nuget-"]');
      if (a && openPkg(a.getAttribute('href'), true)) { e.preventDefault(); history.replaceState(null, '', a.getAttribute('href')); }
    });
    addEventListener('hashchange', () => openPkg(location.hash, true));
    if (location.hash) requestAnimationFrame(() => openPkg(location.hash, true));
  }

  /* ---------------- Copy buttons ---------------- */
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const src = b.dataset.copy ? document.getElementById(b.dataset.copy) : null;
    const text = src ? src.textContent : b.dataset.text;
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch { toast('Copy failed — select and copy manually'); }
  }));

  /* ---------------- Dependency graph ---------------- */
  $$('.graph').forEach((svg) => {
    const nodes = $$('.node', svg); const edges = $$('.edge', svg);
    const clear = () => { svg.classList.remove('focus'); nodes.forEach((n) => n.classList.remove('on', 'rel')); edges.forEach((e) => e.classList.remove('rel')); $$('.pkg').forEach((p) => p.classList.remove('hot', 'dim')); };
    const focus = (n) => {
      clear(); svg.classList.add('focus'); n.classList.add('on');
      const rel = new Set((n.dataset.rel || '').split(' ').filter(Boolean));
      nodes.forEach((m) => { if (rel.has(m.dataset.id)) m.classList.add('rel'); });
      edges.forEach((e) => { if ((e.dataset.from === n.dataset.id || rel.has(e.dataset.from)) && (e.dataset.to === n.dataset.id || rel.has(e.dataset.to))) e.classList.add('rel'); });
      const card = document.getElementById(`pkg-${n.dataset.id}`); if (card) card.classList.add('hot');
    };
    nodes.forEach((n) => {
      n.addEventListener('pointerenter', () => focus(n));
      n.addEventListener('focus', () => focus(n));
      n.addEventListener('click', () => { const c = document.getElementById(`pkg-${n.dataset.id}`); if (c) c.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); });
    });
    svg.addEventListener('pointerleave', clear);
  });

  /* ---------------- Playground ---------------- */
  const initPlayground = (pg) => {
    const device = $('.pg-device', pg); const cover = $('.pg-cover', pg); let frameEl = null;
    const slug = () => pg.dataset.slug;
    const launch = () => {
      if (frameEl) return;
      pg.classList.add('loading');
      frameEl = document.createElement('iframe');
      frameEl.src = pg.dataset.url; frameEl.title = `${pg.dataset.name} live playground`;
      frameEl.allow = 'clipboard-read; clipboard-write; fullscreen; cross-origin-isolated; autoplay; camera; microphone';
      frameEl.addEventListener('load', () => setTimeout(() => pg.classList.remove('loading'), 300));
      device.append(frameEl); if (cover) cover.hidden = true;
    };
    pg._launch = launch;
    pg._reset = () => { frameEl?.remove(); frameEl = null; if (cover) cover.hidden = false; pg.classList.remove('loading'); };
    $('.play', pg)?.addEventListener('click', launch);
    $$('[data-device]', pg).forEach((b) => b.addEventListener('click', () => {
      device.classList.remove('tablet', 'phone'); if (b.dataset.device !== 'desktop') device.classList.add(b.dataset.device);
      $$('[data-device]', pg).forEach((x) => x.classList.toggle('is-on', x === b));
    }));
    $('[data-act="reload"]', pg)?.addEventListener('click', () => { if (frameEl) { pg.classList.add('loading'); frameEl.src = pg.dataset.url; } else launch(); });
    $('[data-act="full"]', pg)?.addEventListener('click', () => { if (!frameEl) launch(); (pg.requestFullscreen || pg.webkitRequestFullscreen)?.call(pg); });
    const tour = $('.tour', pg.closest('[data-tour-host]') || pg);
    if (tour) {
      const items = $$('li', tour); const key = () => `unospace.tour.${slug()}`;
      const sync = () => {
        const done = items.filter((li) => $('input', li).checked).length;
        items.forEach((li) => li.classList.toggle('done', $('input', li).checked));
        const bar = $('.progress i', tour.parentElement); if (bar) bar.style.width = `${(done / Math.max(1, items.length)) * 100}%`;
        const lab = $('.tour-count', tour.parentElement); if (lab) lab.textContent = `${done}/${items.length}`;
      };
      const saved = store.get(key(), []);
      items.forEach((li, i) => { const cb = $('input', li); cb.checked = saved.includes(i); cb.addEventListener('change', () => { store.set(key(), items.map((x, j) => ($('input', x).checked ? j : -1)).filter((j) => j >= 0)); sync(); }); });
      sync();
    }
  };
  $$('[data-pg]').forEach(initPlayground);

  /* ---------------- Playground hub ---------------- */
  const hub = $('#hub');
  if (hub) {
    const pg = $('[data-pg]', hub); const apps = JSON.parse($('#hub-data').textContent);
    const url = $('.pg-bar .url', pg); const open = $('[data-act="open"]', pg); const coverImg = $('.pg-cover img', pg);
    const title = $('.pg-cover h3', pg); const blurb = $('.pg-cover p', pg); const tourBox = $('#hub-tour');
    const select = (slug, autoLaunch) => {
      const a = apps.find((x) => x.slug === slug) || apps[0];
      pg.dataset.url = a.url; pg.dataset.slug = a.slug; pg.dataset.name = a.name;
      pg.style.setProperty('--a1', a.accent); pg.style.setProperty('--a2', a.accent2);
      hub.style.setProperty('--a1', a.accent); hub.style.setProperty('--a2', a.accent2);
      url.textContent = a.url; open.href = a.url; if (coverImg) { coverImg.src = a.shot; coverImg.alt = `${a.name} screenshot`; }
      title.textContent = a.name; blurb.textContent = a.intro;
      $$('#hub .hub-list button').forEach((b) => b.classList.toggle('on', b.dataset.slug === a.slug));
      if (tourBox) {
        tourBox.innerHTML = `<h4>Guided tour <span class="tour-count"></span></h4><div class="progress"><i></i></div><ol class="tour">${a.tour.map((s) => `<li><label><input type="checkbox"><div><b>${s.title}</b><span>${s.text}</span></div></label></li>`).join('')}</ol><p class="pg-note"><a class="btn btn-sm" href="${a.href}">${a.name} details →</a></p>`;
        tourBox.setAttribute('data-tour-host', '');
      }
      pg._reset();
      const t = $('.tour', tourBox);
      if (t) { // rebind tour persistence for the new app
        const items = $$('li', t); const key = `unospace.tour.${a.slug}`; const saved = store.get(key, []);
        const sync = () => { const d = items.filter((li) => $('input', li).checked).length; items.forEach((li) => li.classList.toggle('done', $('input', li).checked)); $('.progress i', tourBox).style.width = `${(d / items.length) * 100}%`; $('.tour-count', tourBox).textContent = `${d}/${items.length}`; };
        items.forEach((li, i) => { const cb = $('input', li); cb.checked = saved.includes(i); cb.addEventListener('change', () => { store.set(key, items.map((x, j) => ($('input', x).checked ? j : -1)).filter((j) => j >= 0)); sync(); }); });
        sync();
      }
      if (autoLaunch) pg._launch();
      if (location.hash.slice(1) !== a.slug) history.replaceState(null, '', `#${a.slug}`);
    };
    $$('.hub-list button', hub).forEach((b) => b.addEventListener('click', () => select(b.dataset.slug, true)));
    select(location.hash.slice(1), false);
    addEventListener('hashchange', () => select(location.hash.slice(1), true));
  }

  /* ---------------- Packages explorer ---------------- */
  const pkgRoot = $('#pkg-explorer');
  if (pkgRoot) {
    const cards = $$('.pkg', pkgRoot); let layer = 'all', proj = 'all', q = '';
    const apply = () => {
      let n = 0;
      cards.forEach((c) => { const ok = (layer === 'all' || c.dataset.layer === layer) && (proj === 'all' || c.dataset.proj === proj) && (!q || c.dataset.search.includes(q)); c.hidden = !ok; if (ok) n++; });
      $('#pkg-count').textContent = n; $$('.pkg-section', pkgRoot).forEach((s) => { s.hidden = !$$('.pkg:not([hidden])', s).length; });
    };
    $$('[data-layer-filter]').forEach((b) => b.addEventListener('click', () => { layer = b.dataset.layerFilter; $$('[data-layer-filter]').forEach((x) => x.classList.toggle('is-on', x === b)); apply(); }));
    $('#pkg-proj')?.addEventListener('change', (e) => { proj = e.target.value; apply(); });
    $('#pkg-search')?.addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); apply(); });
    const h = location.hash.slice(1); if (h && $('#pkg-proj option[value="' + h + '"]')) { $('#pkg-proj').value = h; proj = h; }
    apply();
  }

  /* ---------------- Sortable table ---------------- */
  $$('.ptable[data-sortable]').forEach((table) => {
    const body = $('tbody', table); const ths = $$('th[data-key]', table);
    ths.forEach((th, idx) => th.addEventListener('click', () => {
      const asc = th.classList.contains('sorted') ? !th.classList.contains('asc') : th.dataset.type === 'text';
      ths.forEach((x) => x.classList.remove('sorted', 'asc')); th.classList.add('sorted'); th.classList.toggle('asc', asc);
      const rows = $$('tr', body); const k = th.dataset.key;
      rows.sort((a, b) => { const va = a.dataset[k], vb = b.dataset[k]; const na = parseFloat(va), nb = parseFloat(vb); const c = isNaN(na) || isNaN(nb) ? va.localeCompare(vb) : na - nb; return asc ? c : -c; });
      rows.forEach((r) => body.append(r));
    }));
  });
})();
