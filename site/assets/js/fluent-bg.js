/* Uno Space — Fluent "bloom" wallpaper.
   A slow, domain-warped silk field rendered on the GPU (WebGPU → WebGL2 → CSS fallback).
   Rendered at reduced resolution and a capped frame rate; paused when hidden or prerendering. */
const canvas = document.getElementById('wallpaper');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SCALE = 0.4;           // render resolution relative to CSS pixels (the field is low-frequency)
const MAX_W = 960;           // hard cap on backing width

const WGSL = /* wgsl */ `
struct U { res: vec2f, time: f32, scroll: f32, focus: vec2f, intensity: f32, dark: f32,
           c0: vec4f, c1: vec4f, c2: vec4f, c3: vec4f, base: vec4f };
@group(0) @binding(0) var<uniform> u: U;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn noise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1.0, 0.0)), w.x), mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), w.x), w.y);
}
fn fbm(p0: vec2f) -> f32 {
  var p = p0; var a = 0.5; var s = 0.0;
  for (var k = 0; k < 4; k++) { s += a * noise(p); p = mat2x2f(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; }
  return s;
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / u.res;
  let asp = u.res.x / u.res.y;
  let t = u.time;
  let p = vec2f(uv.x * asp, uv.y + u.scroll * 0.35) * 1.5;
  let q = vec2f(fbm(p + vec2f(0.0, t * 0.04)), fbm(p + vec2f(5.2, 1.3) - vec2f(t * 0.03, 0.0)));
  let r = vec2f(fbm(p + 3.0 * q + vec2f(1.7, 9.2) + t * 0.05), fbm(p + 3.0 * q + vec2f(8.3, 2.8) - t * 0.035));
  let f = fbm(p + 2.2 * r);
  let dd = (uv - u.focus) * vec2f(asp, 1.0);
  let glow = exp(-dot(dd, dd) * 3.2);
  let k = u.intensity * (0.6 + 0.4 * glow);
  var col = u.base.rgb;
  col = mix(col, u.c0.rgb, smoothstep(0.25, 0.85, f) * k);
  col = mix(col, u.c1.rgb, smoothstep(0.3, 0.9, length(q)) * k * 0.85);
  col = mix(col, u.c2.rgb, smoothstep(0.38, 0.95, r.x) * k * 0.7);
  col = mix(col, u.c3.rgb, smoothstep(0.35, 1.0, r.y * q.x * 1.7) * k * 0.65);
  let band = 1.0 - abs(sin(f * 5.0 + r.x * 2.5 + t * 0.12));
  col += vec3f(smoothstep(0.55, 1.0, band) * (0.05 + 0.14 * glow) * u.intensity * mix(0.9, 0.55, u.dark));
  col = mix(col, mix(u.c1.rgb, vec3f(1.0), 0.45 * (1.0 - u.dark)), glow * 0.3 * u.intensity);
  col += (hash(pos.xy + fract(t)) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}`;

const GLSL_VS = `#version 300 es
void main() { vec2 p[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0)); gl_Position = vec4(p[gl_VertexID], 0.0, 1.0); }`;
const GLSL_FS = `#version 300 es
precision highp float;
uniform vec2 res; uniform float time, scroll, intensity, dark; uniform vec2 focus;
uniform vec3 c0, c1, c2, c3, base;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p), w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), w.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), w.x), w.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 4; k++) { s += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
void main() {
  vec2 uv = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y) / res;
  float asp = res.x / res.y, t = time;
  vec2 p = vec2(uv.x * asp, uv.y + scroll * 0.35) * 1.5;
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.04)), fbm(p + vec2(5.2, 1.3) - vec2(t * 0.03, 0.0)));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 0.05), fbm(p + 3.0 * q + vec2(8.3, 2.8) - t * 0.035));
  float f = fbm(p + 2.2 * r);
  vec2 dd = (uv - focus) * vec2(asp, 1.0);
  float glow = exp(-dot(dd, dd) * 3.2), k = intensity * (0.6 + 0.4 * glow);
  vec3 col = base;
  col = mix(col, c0, smoothstep(0.25, 0.85, f) * k);
  col = mix(col, c1, smoothstep(0.3, 0.9, length(q)) * k * 0.85);
  col = mix(col, c2, smoothstep(0.38, 0.95, r.x) * k * 0.7);
  col = mix(col, c3, smoothstep(0.35, 1.0, r.y * q.x * 1.7) * k * 0.65);
  float band = 1.0 - abs(sin(f * 5.0 + r.x * 2.5 + t * 0.12));
  col += vec3(smoothstep(0.55, 1.0, band) * (0.05 + 0.14 * glow) * intensity * mix(0.9, 0.55, dark));
  col = mix(col, mix(c1, vec3(1.0), 0.45 * (1.0 - dark)), glow * 0.3 * intensity);
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`;

const hex = (s) => { const v = s.trim().replace('#', ''); const n = parseInt(v.length === 3 ? v.replace(/./g, '$&$&') : v, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

function readPalette() {
  const cs = getComputedStyle(document.body);
  const get = (k, d) => { const v = cs.getPropertyValue(k).trim(); return /^#[0-9a-f]{3,6}$/i.test(v) ? v : d; };
  return {
    base: hex(get('--bloom-base', '#eef2fb')), c0: hex(get('--bloom-1', '#4f9ff0')), c1: hex(get('--bloom-2', '#8c7cf0')),
    c2: hex(get('--bloom-3', '#f28ad0')), c3: hex(get('--bloom-4', '#50d0c8')),
    intensity: parseFloat(cs.getPropertyValue('--bloom-intensity')) || 0.6,
    dark: cs.getPropertyValue('color-scheme').includes('dark') ? 1 : 0,
  };
}

async function createRenderer() {
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
      if (adapter) {
        const device = await adapter.requestDevice();
        const ctx = canvas.getContext('webgpu');
        const format = navigator.gpu.getPreferredCanvasFormat();
        ctx.configure({ device, format, alphaMode: 'opaque' });
        const module = device.createShaderModule({ code: WGSL });
        const pipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
        const ubo = device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }] });
        const data = new Float32Array(28);
        return {
          kind: 'webgpu',
          draw(s) {
            data.set([canvas.width, canvas.height, s.time, s.scroll, s.focus[0], s.focus[1], s.pal.intensity, s.pal.dark], 0);
            data.set([...s.pal.c0, 1, ...s.pal.c1, 1, ...s.pal.c2, 1, ...s.pal.c3, 1, ...s.pal.base, 1], 8);
            device.queue.writeBuffer(ubo, 0, data);
            const enc = device.createCommandEncoder();
            const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
            pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.draw(3); pass.end();
            device.queue.submit([enc.finish()]);
          },
        };
      }
    } catch { /* fall through to WebGL2 */ }
  }
  const gl = canvas.getContext('webgl2', { antialias: false, depth: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, GLSL_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, GLSL_FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const loc = Object.fromEntries(['res', 'time', 'scroll', 'intensity', 'dark', 'focus', 'c0', 'c1', 'c2', 'c3', 'base'].map((n) => [n, gl.getUniformLocation(prog, n)]));
  return {
    kind: 'webgl2',
    draw(s) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(loc.res, canvas.width, canvas.height); gl.uniform1f(loc.time, s.time); gl.uniform1f(loc.scroll, s.scroll);
      gl.uniform1f(loc.intensity, s.pal.intensity); gl.uniform1f(loc.dark, s.pal.dark); gl.uniform2f(loc.focus, s.focus[0], s.focus[1]);
      for (const k of ['c0', 'c1', 'c2', 'c3', 'base']) gl.uniform3fv(loc[k], s.pal[k]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

async function start() {
  if (!canvas) return;
  const renderer = await createRenderer();
  if (!renderer) return; // CSS wallpaper stays visible
  document.documentElement.dataset.wallpaper = renderer.kind;
  let pal = readPalette();
  const focusEl = document.querySelector('[data-bloom-focus]');
  const state = { time: 13.7, scroll: 0, focus: [0.72, 0.42], pal };
  const resize = () => {
    const w = Math.min(MAX_W, Math.max(240, Math.round(innerWidth * SCALE)));
    canvas.width = w; canvas.height = Math.max(160, Math.round(w * innerHeight / innerWidth));
  };
  const measure = () => {
    state.scroll = scrollY / Math.max(1, innerHeight);
    if (focusEl) { const r = focusEl.getBoundingClientRect(); state.focus = [(r.left + r.width / 2) / innerWidth, (r.top + r.height / 2) / innerHeight]; }
    else state.focus = [0.7, 0.35 - state.scroll * 0.6];
  };
  resize(); measure();
  let dirty = true, running = true, last = 0, raf = 0, shown = false;
  const frame = (now) => {
    raf = 0;
    if (!running) return;
    const fps = state.scroll < 1 ? 30 : 20;
    if (!reduced && now - last >= 1000 / fps) { state.time += Math.min(0.1, (now - last) / 1000) || 0; last = now; dirty = true; }
    if (dirty) {
      renderer.draw(state); dirty = false;
      if (!shown) { shown = true; canvas.classList.add('on'); }
    }
    if (!reduced) raf = requestAnimationFrame(frame);
  };
  const kick = () => { dirty = true; if (!raf && running) raf = requestAnimationFrame(frame); };
  addEventListener('resize', () => { resize(); measure(); kick(); });
  addEventListener('scroll', () => { measure(); if (reduced) kick(); }, { passive: true });
  document.addEventListener('themechange', () => { requestAnimationFrame(() => { state.pal = pal = readPalette(); kick(); }); });
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { last = performance.now(); kick(); } });
  kick();
}

if (document.prerendering) document.addEventListener('prerenderingchange', start, { once: true });
else start();
