/* Uno Space — interactions, animations and infographics. No dependencies. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
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

  /* ---------------- Pointer glow & tilt ---------------- */
  if (fine && !reduced) {
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest?.('.card, .app-card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
      if (card.classList.contains('app-card')) {
        const px = (e.clientX - r.left) / r.width - 0.5; const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(1000px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) translateY(-6px)`;
      }
    }, { passive: true });
    $$('.app-card').forEach((c) => c.addEventListener('pointerleave', () => { c.style.transform = ''; }));
  }

  /* ---------------- Starfield ---------------- */
  const cosmos = $('#cosmos');
  if (cosmos) {
    const ctx = cosmos.getContext('2d');
    let w, h, dpr, stars = [], shooting = null, last = 0;
    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1); w = innerWidth; h = innerHeight;
      cosmos.width = w * dpr; cosmos.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(420, (w * h) / 4200));
      stars = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h * 1.6, z: Math.random() ** 2, t: Math.random() * 6.28, s: 0.4 + Math.random() * 1.4,
        c: Math.random() < 0.12 ? (Math.random() < 0.5 ? '160,150,255' : '120,200,255') : '255,255,255' }));
    };
    resize(); addEventListener('resize', resize);
    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);
      const sy = scrollY;
      for (const s of stars) {
        const y = ((s.y - sy * (0.05 + s.z * 0.25)) % (h * 1.6) + h * 1.6) % (h * 1.6);
        if (y > h) continue;
        const a = 0.25 + s.z * 0.6 + Math.sin(t / 900 + s.t) * 0.22 * (reduced ? 0 : 1);
        ctx.fillStyle = `rgba(${s.c},${Math.max(0.05, a)})`;
        const r = s.s * (0.4 + s.z * 0.9);
        ctx.beginPath(); ctx.arc(s.x, y, r, 0, 6.283); ctx.fill();
        if (s.z > 0.85) { ctx.fillStyle = `rgba(${s.c},${a * 0.12})`; ctx.beginPath(); ctx.arc(s.x, y, r * 4, 0, 6.283); ctx.fill(); }
      }
      if (!reduced) {
        if (!shooting && t - last > 5200 && Math.random() < 0.02) {
          last = t; shooting = { x: Math.random() * w * 0.8 + w * 0.2, y: Math.random() * h * 0.4, vx: -(6 + Math.random() * 5), vy: 2.5 + Math.random() * 2, life: 1 };
        }
        if (shooting) {
          const s = shooting; const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 16, s.y - s.vy * 16);
          g.addColorStop(0, `rgba(255,255,255,${s.life})`); g.addColorStop(1, 'rgba(120,160,255,0)');
          ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 16, s.y - s.vy * 16); ctx.stroke();
          s.x += s.vx; s.y += s.vy; s.life -= 0.012;
          if (s.life <= 0 || s.x < -200 || s.y > h + 200) shooting = null;
        }
      }
    };
    let raf; const loop = (t) => { draw(t); raf = requestAnimationFrame(loop); };
    if (reduced) draw(0); else raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else if (!reduced) raf = requestAnimationFrame(loop); });
    if (reduced) addEventListener('scroll', () => draw(0), { passive: true });
  }

  /* ---------------- Orbit system (home hero) ---------------- */
  const orbit = $('#orbit');
  const orbitData = $('#orbit-data');
  if (orbit && orbitData) {
    const apps = JSON.parse(orbitData.textContent);
    const ctx = orbit.getContext('2d');
    const label = $('.orbit-label');
    const rings = [
      { r: 0.36, speed: 0.00016, n: 4 },
      { r: 0.6, speed: -0.00011, n: 6 },
      { r: 0.86, speed: 0.00007, n: 7 },
    ];
    let k = 0;
    const bodies = [];
    rings.forEach((ring, ri) => {
      for (let i = 0; i < ring.n && k < apps.length; i++, k++) {
        bodies.push({ ...apps[k], ring: ri, a: (i / ring.n) * Math.PI * 2 + ri * 0.7, size: 0.05 - ri * 0.006 + (apps[k].weight || 0) * 0.02, ringed: k % 5 === 2 });
      }
    });
    let size, dpr, hover = null, mx = 0, my = 0, tmx = 0, tmy = 0, slow = 1, lastT = 0, visible = true;
    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1); const r = orbit.getBoundingClientRect(); size = r.width;
      orbit.width = size * dpr; orbit.height = size * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize(); addEventListener('resize', resize);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(orbit);
    const hex = (c, a) => { const n = parseInt(c.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
    const tiltBase = 0.36;
    const project = (b, R, cx, cy) => {
      const tilt = tiltBase + tmy * 0.18; const rot = -0.32 + tmx * 0.2;
      const x0 = Math.cos(b.a) * R * rings[b.ring].r; const y0 = Math.sin(b.a) * R * rings[b.ring].r;
      const x1 = x0 * Math.cos(rot) - y0 * tilt * Math.sin(rot); const y1 = x0 * Math.sin(rot) + y0 * tilt * Math.cos(rot);
      const z = Math.sin(b.a); // -1 back … 1 front
      return { x: cx + x1, y: cy + y1, z, s: 1 + z * 0.22 };
    };
    const draw = (t) => {
      const dt = Math.min(50, t - (lastT || t)); lastT = t;
      tmx += (mx - tmx) * 0.05; tmy += (my - tmy) * 0.05;
      slow += ((hover ? 0.12 : 1) - slow) * 0.08;
      if (!visible) return;
      const S = size, cx = S / 2, cy = S / 2, R = S * 0.46;
      ctx.clearRect(0, 0, S, S);
      // orbit paths
      const tilt = tiltBase + tmy * 0.18; const rot = -0.32 + tmx * 0.2;
      rings.forEach((ring, i) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(1, tilt);
        ctx.beginPath(); ctx.arc(0, 0, R * ring.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(160,170,255,${0.1 + i * 0.02})`; ctx.lineWidth = 1 / tilt * 0.9; ctx.setLineDash([2, 7]); ctx.stroke();
        ctx.restore();
      });
      if (!reduced) bodies.forEach((b) => { b.a += rings[b.ring].speed * dt * slow * 6; });
      const placed = bodies.map((b) => ({ b, p: project(b, R, cx, cy) })).sort((a, c) => a.p.z - c.p.z);
      const drawCore = () => {
        const pulse = 1 + Math.sin(t / 900) * 0.04;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.34 * pulse);
        g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.12, 'rgba(180,170,255,0.9)'); g.addColorStop(0.35, 'rgba(122,103,248,0.45)'); g.addColorStop(0.7, 'rgba(21,155,255,0.12)'); g.addColorStop(1, 'rgba(21,155,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.34 * pulse, 0, Math.PI * 2); ctx.fill();
        // core sphere
        const cg = ctx.createRadialGradient(cx - R * 0.03, cy - R * 0.04, R * 0.01, cx, cy, R * 0.11);
        cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.35, '#b9b0ff'); cg.addColorStop(0.75, '#7a67f8'); cg.addColorStop(1, '#3b2fb8');
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, R * 0.11, 0, Math.PI * 2); ctx.fill();
        // rotating arcs (Uno palette)
        const cols = ['#7a67f8', '#159bff', '#67e5ad', '#f85977'];
        cols.forEach((c, i) => {
          ctx.beginPath(); ctx.strokeStyle = c; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
          const a0 = t / 1400 * (i % 2 ? -1 : 1) + i * 1.57;
          ctx.arc(cx, cy, R * (0.15 + i * 0.012), a0, a0 + 0.9); ctx.stroke();
        });
        ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = `700 ${Math.round(R * 0.07)}px "Space Grotesk", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('UNO', cx, cy + 1);
      };
      let coreDrawn = false;
      for (const { b, p } of placed) {
        if (!coreDrawn && p.z > 0) { drawCore(); coreDrawn = true; }
        const r = R * b.size * p.s * (hover === b ? 1.35 : 1);
        const dim = 0.55 + (p.z + 1) * 0.225;
        // glow
        const gl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2);
        gl.addColorStop(0, hex(b.accent, 0.45 * dim)); gl.addColorStop(1, hex(b.accent, 0));
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2); ctx.fill();
        if (b.ringed) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-0.4); ctx.scale(1, 0.3); ctx.beginPath(); ctx.arc(0, 0, r * 1.8, Math.PI, 0); ctx.strokeStyle = hex(b.accent2, 0.7 * dim); ctx.lineWidth = r * 0.35; ctx.stroke(); ctx.restore(); }
        const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, b.accent2); g.addColorStop(0.75, b.accent); g.addColorStop(1, hex(b.accent, 0.6));
        ctx.globalAlpha = dim; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        if (b.ringed) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-0.4); ctx.scale(1, 0.3); ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, Math.PI); ctx.strokeStyle = hex(b.accent2, 0.85 * dim); ctx.lineWidth = r * 0.35; ctx.stroke(); ctx.restore(); }
        if (hover === b) { ctx.beginPath(); ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]); }
        b._p = p; b._r = r;
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
      for (const b of bodies) { if (!b._p) continue; const d = Math.hypot(b._p.x - x, b._p.y - y); if (d < Math.max(18, b._r * 1.6) && d < bd) { bd = d; best = b; } }
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
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { links.forEach((l) => l.classList.remove('on')); const a = map.get(e.target.id); if (a) { a.classList.add('on'); a.scrollIntoView({ block: 'nearest', inline: 'center' }); } } });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }
  const frame = $('.frame');
  if (frame && !reduced) {
    const upd = () => {
      const r = frame.getBoundingClientRect(); const p = Math.min(1, Math.max(0, 1 - (r.top - innerHeight * 0.15) / (innerHeight * 0.7)));
      frame.style.setProperty('--tilt', `${(14 * (1 - p)).toFixed(2)}deg`); frame.style.setProperty('--sc', (0.94 + 0.06 * p).toFixed(3));
    };
    addEventListener('scroll', upd, { passive: true }); upd();
  } else if (frame) { frame.style.setProperty('--tilt', '0deg'); frame.style.setProperty('--sc', '1'); }

  /* ---------------- Tabs (features, code) ---------------- */
  $$('[data-tabs]').forEach((group) => {
    const tabs = $$('[data-tab]', group);
    tabs.forEach((t) => t.addEventListener('click', () => {
      tabs.forEach((x) => { const on = x === t; x.classList.toggle('on', on); x.classList.toggle('is-on', on); x.setAttribute('aria-selected', String(on)); });
      $$('[data-pane]', group).forEach((p) => p.classList.toggle('on', p.dataset.pane === t.dataset.tab));
    }));
  });

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
