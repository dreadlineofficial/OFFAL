// Every texture in the game is painted here on 2D canvases at startup: tiles, concrete, meat, skin,
// rust, and a lot of blood. The blood painters are also used by the HUD to splatter the screen.
import * as THREE from 'three';
import { makeRng } from './rng.js';
import { derivePBR } from './pbr.js';
import { patchWet } from './wet.js';
import { patchFlesh } from './flesh.js';

// OFFAL: REMASTERED: surface painters draw at k times their design size, and every surface becomes a PBR material
// (albedo + normal + occlusion/roughness/metal). Classic keeps k = 1, nearest filtering and Phong, as the original.
export const TEX = { k: 1, pbr: false, aniso: 2 };
export function configureTextures(o) { Object.assign(TEX, o); }
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d', { willReadFrequently: true }) }; // kept in memory, not on the GPU: a GPU reset blanks GPU-backed canvases, and every texture re-uploads from these
}

// the surface painters draw in their own design units (256 px per 2 m) on a canvas k times larger
function hq(w, h) {
  const o = canvas(w * TEX.k, h * TEX.k);
  if (TEX.k !== 1) o.g.scale(TEX.k, TEX.k);
  return o;
}

function toTex(c, { srgb = true, nearest = !TEX.pbr } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (nearest) t.magFilter = THREE.NearestFilter;
  t.anisotropy = TEX.pbr ? TEX.aniso : 2;
  t.userData.src = c;
  return t;
}

// a Phong material description becomes a PBR one. p: normal strength, rough / roughClean (dirt, clean), wet, metal,
// metalByLum, cavity, micro, fixedRough; `plain` skips map derivation (the map stays as painted)
function stdMat(o, p = {}) {
  const { map, bumpMap, bumpScale, shininess = 30, specular, ...rest } = o;
  const sp = specular !== undefined ? new THREE.Color(specular) : null;
  const gloss = shininess * (0.6 + (sp ? (sp.r + sp.g + sp.b) / 3 * 1.6 : 0));
  const roughness = p.fixedRough ?? clamp01(0.95 - gloss * 0.0065);
  const m = new THREE.MeshStandardMaterial({ ...rest, ...(map ? { map } : {}), roughness, metalness: p.metal && !map ? p.metal : 0 });
  if (map && map.userData.src && !p.plain) {
    let pb = map.userData.pbr;
    if (!pb) pb = THREE.ownRandom(() => {
      const r = derivePBR(map.userData.src, { normal: p.normal ?? 2.2 + (bumpScale ?? 1) * 1.4, rough: p.rough ?? 0.92, roughClean: p.roughClean ?? clamp01(roughness + 0.05), wet: p.wet ?? 0.9, metal: p.metal ?? 0, metalByLum: p.metalByLum, cavity: p.cavity ?? 0.5, micro: p.micro ?? 0.05, alphaHeight: p.alphaHeight, fixedRough: p.fixedRough, puddles: p.puddles, seed: (map.id | 0) + 5 });
      const lin = (c) => { const t = new THREE.CanvasTexture(c); t.wrapS = map.wrapS; t.wrapT = map.wrapT; t.anisotropy = TEX.aniso; t.repeat.copy(map.repeat); return t; };
      return (map.userData.pbr = { normal: lin(r.normal), orm: lin(r.orm) });
    });
    m.normalMap = pb.normal;
    m.aoMap = m.roughnessMap = pb.orm;
    if (p.metal) { m.metalnessMap = pb.orm; m.metalness = 1; }
    m.roughness = 1;
  }
  return m;
}
const wetFloor = (m) => (TEX.pbr ? patchWet(m) : m);
const lamb = (o) => (TEX.pbr ? new THREE.MeshStandardMaterial({ ...o, roughness: 0.85, metalness: 0 }) : new THREE.MeshLambertMaterial(o));

const TAU = Math.PI * 2;
// PBR descriptions of the big surfaces: glazed tile and painted plaster are rough where dirty and glossy where clean;
// floors drink blood and water, so dark stains come out wet
const WALL_P = { rough: 0.93, roughClean: 0.62, wet: 0.95, cavity: 0.7, normal: 3.4 };
const FLOOR_P = { rough: 0.88, roughClean: 0.5, wet: 1, cavity: 0.55, normal: 2.8, puddles: 0.22 };
const CEIL_P = { rough: 0.95, roughClean: 0.8, cavity: 0.5 };
function blob(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, Math.max(0.4, r), 0, TAU);
  g.fill();
}

// ---------- blood painters ----------
export const BLOOD = { fresh: '112,3,3', dark: '62,2,2', dried: '42,8,5', black: '18,2,2' };

export function splat(g, x, y, s, rng, col = BLOOD.fresh, a = 0.92) {
  // the core: a lobed, uneven stain, darker where it landed thickest
  g.fillStyle = `rgba(${col},${a})`;
  lobed(g, x, y, s * 0.42, rng, 5, 0.45);
  g.fill();
  g.fillStyle = `rgba(${BLOOD.black},${a * 0.45})`;
  lobed(g, x + (rng() - 0.5) * s * 0.1, y + (rng() - 0.5) * s * 0.1, s * 0.22, rng, 4, 0.4);
  g.fill();
  // spines thrown off it, each ending in a bead
  const spikes = 10 + ((rng() * 16) | 0);
  g.fillStyle = `rgba(${col},${a})`;
  for (let i = 0; i < spikes; i++) {
    const ang = rng() * TAU, len = s * (0.45 + rng() * 1.2), w = s * (0.02 + rng() * 0.06);
    g.beginPath();
    g.moveTo(x + Math.cos(ang + 1.57) * w, y + Math.sin(ang + 1.57) * w);
    g.quadraticCurveTo(x + Math.cos(ang) * len * 0.6 + Math.cos(ang + 1.57) * w * 0.3, y + Math.sin(ang) * len * 0.6 + Math.sin(ang + 1.57) * w * 0.3, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.quadraticCurveTo(x + Math.cos(ang) * len * 0.6 + Math.cos(ang - 1.57) * w * 0.3, y + Math.sin(ang) * len * 0.6 + Math.sin(ang - 1.57) * w * 0.3, x + Math.cos(ang - 1.57) * w, y + Math.sin(ang - 1.57) * w);
    g.fill();
    blob(g, x + Math.cos(ang) * len, y + Math.sin(ang) * len, w * 1.4);
  }
  // the spray: droplets stretched along their flight, tails pointing back at where it came from
  for (let i = 0; i < 46; i++) {
    const ang = rng() * TAU, d = s * (0.6 + rng() * 1.8), r = s * 0.012 + rng() * s * 0.045;
    const px = x + Math.cos(ang) * d, py = y + Math.sin(ang) * d;
    g.fillStyle = `rgba(${col},${a * (0.6 + rng() * 0.4)})`;
    g.beginPath();
    g.ellipse(px, py, r * (1.2 + d / s * 0.6), r, ang, 0, TAU);
    g.fill();
  }
}

export function drip(g, x, y, len, w, col = BLOOD.fresh, a = 0.85) {
  g.fillStyle = `rgba(${col},${a})`;
  g.beginPath();
  g.moveTo(x - w / 2, y);
  g.quadraticCurveTo(x - w * 0.2, y + len * 0.5, x - w * 0.25, y + len);
  g.lineTo(x + w * 0.25, y + len);
  g.quadraticCurveTo(x + w * 0.2, y + len * 0.5, x + w / 2, y);
  g.fill();
  blob(g, x, y + len, w * 0.55);
}

// a lobed, wobbling outline: blood finds the low spots, so a pool is never round
function lobed(g, x, y, R, rng, lobes = 7, wob = 0.35) {
  const ph = Array.from({ length: 4 }, () => rng() * TAU), k = [lobes, lobes * 2 + 1, 3, 13];
  g.beginPath();
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * TAU;
    const r = R * (1 + wob * (0.5 * Math.sin(k[0] * a + ph[0]) + 0.25 * Math.sin(k[1] * a + ph[1]) + 0.35 * Math.sin(k[2] * a + ph[2]) + 0.12 * Math.sin(k[3] * a + ph[3])));
    if (i) g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}
// a pool of blood on the floor: almost black where it's deep, a thin redder film at the edges, a dried
// rim where it has started to set, clots, a few fingers running off, satellite drops, and wet highlights
export function bloodPool(g, x, y, R, rng) {
  // the dried outer stain first, a little bigger than the wet pool
  g.fillStyle = 'rgba(48,6,4,0.55)';
  lobed(g, x, y, R * 1.08, rng, 6, 0.32);
  g.fill();
  // fingers running off along the floor
  for (let i = 0, n = 2 + ((rng() * 3) | 0); i < n; i++) {
    const a = rng() * TAU, len = R * (0.7 + rng() * 0.7), w = R * (0.08 + rng() * 0.1);
    g.fillStyle = 'rgba(70,4,3,0.85)';
    g.beginPath();
    g.moveTo(x + Math.cos(a + 0.25) * R * 0.7, y + Math.sin(a + 0.25) * R * 0.7);
    g.quadraticCurveTo(x + Math.cos(a) * (R + len * 0.6) + (rng() - 0.5) * w * 4, y + Math.sin(a) * (R + len * 0.6) + (rng() - 0.5) * w * 4, x + Math.cos(a) * (R + len), y + Math.sin(a) * (R + len));
    g.quadraticCurveTo(x + Math.cos(a) * (R + len * 0.5), y + Math.sin(a) * (R + len * 0.5), x + Math.cos(a - 0.25) * R * 0.7, y + Math.sin(a - 0.25) * R * 0.7);
    g.fill();
    blob(g, x + Math.cos(a) * (R + len), y + Math.sin(a) * (R + len), w * 0.9);
  }
  // the wet body: thick and dark in the middle, thinning to red at the edge
  const gr = g.createRadialGradient(x, y, R * 0.1, x, y, R * 1.05);
  gr.addColorStop(0, 'rgba(26,0,0,0.98)');
  gr.addColorStop(0.55, 'rgba(46,1,1,0.97)');
  gr.addColorStop(0.85, 'rgba(84,4,3,0.92)');
  gr.addColorStop(1, 'rgba(118,10,6,0.8)');
  g.fillStyle = gr;
  lobed(g, x, y, R, rng, 6, 0.3);
  g.fill();
  // the meniscus: a thin bright line where the surface curves down to the floor
  g.strokeStyle = 'rgba(140,16,10,0.55)';
  g.lineWidth = 1.2;
  g.stroke();
  // clots
  for (let i = 0; i < 7; i++) {
    const a = rng() * TAU, d = rng() * R * 0.6;
    g.fillStyle = `rgba(14,0,0,${0.45 + rng() * 0.4})`;
    lobed(g, x + Math.cos(a) * d, y + Math.sin(a) * d, R * (0.04 + rng() * 0.09), rng, 4, 0.4);
    g.fill();
  }
  // satellite drops
  for (let i = 0; i < 18; i++) {
    const a = rng() * TAU, d = R * (1.1 + rng() * 0.7), r = 0.8 + rng() * R * 0.05;
    g.fillStyle = `rgba(${60 + rng() * 40 | 0},3,2,${0.6 + rng() * 0.35})`;
    blob(g, x + Math.cos(a) * d, y + Math.sin(a) * d, r);
  }
  // wet highlights: the light catching the surface
  for (let i = 0; i < 5; i++) {
    const a = rng() * TAU, d = rng() * R * 0.55, hx = x + Math.cos(a) * d, hy = y + Math.sin(a) * d;
    const hl = g.createRadialGradient(hx, hy, 0, hx, hy, R * (0.08 + rng() * 0.1));
    hl.addColorStop(0, 'rgba(150,40,34,0.35)');
    hl.addColorStop(1, 'rgba(150,40,34,0)');
    g.fillStyle = hl;
    g.fillRect(hx - R * 0.2, hy - R * 0.2, R * 0.4, R * 0.4);
  }
}

// a splatter that runs: the default for anything on a wall
export function wallSplat(g, x, y, s, rng, col = BLOOD.fresh) {
  splat(g, x, y, s, rng, col, 0.9);
  const n = 3 + ((rng() * 6) | 0);
  for (let i = 0; i < n; i++) drip(g, x + (rng() - 0.5) * s * 1.2, y + rng() * s * 0.3, s * (0.8 + rng() * 3.5), 2 + rng() * 4, col, 0.8);
}

// the row of shrinking drops a cut artery leaves across a wall
export function arterial(g, x, y, len, ang, rng, col = BLOOD.fresh) {
  const n = 22 + ((rng() * 20) | 0);
  g.fillStyle = `rgba(${col},0.9)`;
  for (let i = 0; i < n; i++) {
    const t = i / n, w = Math.sin(t * 9 + rng()) * 6;
    const px = x + Math.cos(ang) * len * t - Math.sin(ang) * w, py = y + Math.sin(ang) * len * t + Math.cos(ang) * w;
    const r = (1 - t) * 6 + rng() * 3;
    blob(g, px, py, r);
    if (rng() < 0.4) drip(g, px, py, 10 + rng() * 60, r * 0.7, col, 0.75);
  }
}

export function handprint(g, x, y, s, rot, rng, col = BLOOD.dark, smearLen = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  for (let k = smearLen > 0 ? 6 : 1; k > 0; k--) {
    const off = (k - 1) * smearLen / 6;
    g.fillStyle = `rgba(${col},${k === 1 ? 0.85 : 0.18})`;
    g.beginPath();
    g.ellipse(0, off, s * 0.45, s * 0.5, 0, 0, TAU);
    g.fill();
    const fingers = [[-0.38, -0.62, 0.42], [-0.15, -0.78, 0.5], [0.1, -0.8, 0.52], [0.33, -0.68, 0.44], [0.58, -0.1, 0.36]];
    for (const [fx, fy, fl] of fingers) {
      g.save();
      g.translate(fx * s, fy * s * 0.6 + off);
      g.rotate(fx * 0.5 + (fx > 0.5 ? 0.9 : 0));
      g.beginPath();
      g.ellipse(0, -fl * s * 0.5, s * 0.1, fl * s * 0.55, 0, 0, TAU);
      g.fill();
      g.restore();
    }
  }
  g.restore();
}

export function smear(g, x, y, w, len, ang, rng, col = BLOOD.dried) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  for (let i = 0; i < 60; i++) {
    const t = i / 60;
    g.fillStyle = `rgba(${col},${0.08 + (1 - t) * 0.12})`;
    g.beginPath();
    g.ellipse((rng() - 0.5) * w * 0.3, t * len, w * (0.5 - t * 0.3) * (0.7 + rng() * 0.5), w * 0.25, 0, 0, TAU);
    g.fill();
  }
  // streaks from the fingers dragging through it
  for (let i = 0; i < 5; i++) {
    g.strokeStyle = `rgba(${col},0.35)`;
    g.lineWidth = 1 + rng() * 2;
    g.beginPath();
    g.moveTo((i / 4 - 0.5) * w * 0.7, 0);
    g.lineTo((i / 4 - 0.5) * w * 0.5 + (rng() - 0.5) * 6, len * (0.7 + rng() * 0.3));
    g.stroke();
  }
  g.restore();
}

function blotches(g, w, h, n, rMin, rMax, rgb, aMax, rng) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${rgb},${rng() * aMax})`;
    blob(g, rng() * w, rng() * h, rMin + rng() * (rMax - rMin));
  }
}

function speckle(g, w, h, amt, rng) {
  const id = g.getImageData(0, 0, g.canvas.width, g.canvas.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(id, 0, 0);
}

function streaks(g, w, h, n, rgb, aMax, rng, fromTop = true) {
  for (let i = 0; i < n; i++) {
    const x = rng() * w, len = h * (0.1 + rng() * 0.6), y0 = fromTop ? 0 : h - len;
    const gr = g.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(fromTop ? 0 : 1, `rgba(${rgb},${aMax * rng()})`);
    gr.addColorStop(fromTop ? 1 : 0, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(x, y0, 1 + rng() * 5, len);
  }
}

// ---------- surfaces ----------
// wall: 2 m wide x 3 m tall, one face per canvas. gore 0 (grimy) .. 3 (soaked)
function wallCanvas(gore, style) {
  const W = 256, H = 384, { c, g } = hq(W, H), rng = makeRng(101 + gore * 17 + style * 131);
  const band = H - 128; // lower metre is painted
  const tileCol = style === 1 ? [150, 170, 172] : style === 2 ? [178, 160, 130] : [186, 182, 164];
  g.fillStyle = '#4e4a41';
  g.fillRect(0, 0, W, H);
  const ts = 16;
  for (let y = 0; y < band; y += ts)
    for (let x = 0; x < W; x += ts) {
      const v = rng() * 26 - 13;
      if (rng() < 0.025) { g.fillStyle = '#26221d'; g.fillRect(x + 1, y + 1, ts - 2, ts - 2); continue; } // missing tile
      g.fillStyle = `rgb(${tileCol[0] + v | 0},${tileCol[1] + v | 0},${tileCol[2] + v | 0})`;
      g.fillRect(x + 1, y + 1, ts - 2, ts - 2);
      if (rng() < 0.05) { g.strokeStyle = 'rgba(40,30,20,.6)'; g.beginPath(); g.moveTo(x + 2, y + rng() * ts); g.lineTo(x + ts - 2, y + rng() * ts); g.stroke(); }
    }
  g.fillStyle = style === 1 ? '#2b3a3c' : style === 2 ? '#4a2a1c' : '#2f3c31';
  g.fillRect(0, band, W, 128);
  g.fillStyle = '#151311';
  g.fillRect(0, band - 4, W, 5);
  blotches(g, W, 128, 120, 1, 6, '190,180,150', 0.25, rng); // paint chips
  g.save(); g.translate(0, band); blotches(g, W, 128, 70, 1, 5, '150,140,120', 0.3, rng); g.restore();
  streaks(g, W, H, 26, '70,40,15', 0.5, rng, true); // rust/water from the ceiling
  const gr = g.createLinearGradient(0, H, 0, H - 200);
  gr.addColorStop(0, 'rgba(25,15,8,.8)');
  gr.addColorStop(1, 'rgba(25,15,8,0)');
  g.fillStyle = gr;
  g.fillRect(0, H - 200, W, 200);
  blotches(g, W, H, 60, 6, 40, '30,24,14', 0.12, rng);
  // blood
  const n = [0, 2, 4, 7][gore];
  for (let i = 0; i < n; i++) {
    const kind = rng();
    const col = rng() < 0.4 ? BLOOD.dried : rng() < 0.5 ? BLOOD.dark : BLOOD.fresh;
    if (kind < 0.35) wallSplat(g, rng() * W, 60 + rng() * 220, 14 + rng() * 30, rng, col);
    else if (kind < 0.55) arterial(g, rng() * W * 0.5, 40 + rng() * 140, 120 + rng() * 120, rng() * 0.8 - 0.2, rng, col);
    else if (kind < 0.8) handprint(g, rng() * W, 160 + rng() * 170, 18 + rng() * 6, (rng() - 0.5) * 0.8, rng, col, rng() < 0.6 ? 40 + rng() * 80 : 0);
    else smear(g, rng() * W, 250 + rng() * 40, 40 + rng() * 30, 90 + rng() * 40, (rng() - 0.5) * 0.4, rng, col);
  }
  if (gore >= 2) for (let i = 0; i < 8 * gore; i++) drip(g, rng() * W, 0, 20 + rng() * 120, 1.5 + rng() * 3, BLOOD.dark, 0.7);
  speckle(g, W, H, 22, rng);
  return c;
}

// the morgue: big glazed tiles gone blue with cold, frost creeping down from the ceiling
function morgueWallCanvas(gore) {
  const W = 256, H = 384, { c, g } = hq(W, H), rng = makeRng(501 + gore * 29);
  g.fillStyle = '#3a4650';
  g.fillRect(0, 0, W, H);
  const ts = 32, band = H - 96;
  for (let y = 0; y < band; y += ts)
    for (let x = 0; x < W; x += ts) {
      const v = rng() * 18 - 9;
      g.fillStyle = `rgb(${168 + v | 0},${190 + v | 0},${206 + v | 0})`;
      g.fillRect(x + 1.5, y + 1.5, ts - 3, ts - 3);
      g.fillStyle = 'rgba(255,255,255,.18)'; // glaze
      g.fillRect(x + 3, y + 3, ts - 10, 3);
      if (rng() < 0.04) { g.strokeStyle = 'rgba(30,40,50,.7)'; g.beginPath(); g.moveTo(x + 2, y + rng() * ts); g.lineTo(x + ts - 2, y + rng() * ts); g.stroke(); }
    }
  // stainless kick band
  const gr = g.createLinearGradient(0, band, 0, H);
  gr.addColorStop(0, '#8a949c');
  gr.addColorStop(1, '#4a5258');
  g.fillStyle = gr;
  g.fillRect(0, band, W, 96);
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${rng() * 0.05})`; g.fillRect(0, band + rng() * 96, W, 1); }
  g.fillStyle = '#1a2026';
  g.fillRect(0, band - 3, W, 4);
  // frost and condensation
  for (let i = 0; i < 26; i++) {
    const x = rng() * W, len = 30 + rng() * 160;
    const fr = g.createLinearGradient(0, 0, 0, len);
    fr.addColorStop(0, 'rgba(235,245,255,.5)');
    fr.addColorStop(1, 'rgba(235,245,255,0)');
    g.fillStyle = fr;
    g.fillRect(x, 0, 2 + rng() * 6, len);
  }
  blotches(g, W, 60, 70, 4, 22, '240,248,255', 0.2, rng);
  blotches(g, W, H, 40, 6, 30, '20,30,40', 0.12, rng);
  const n = [0, 1, 3, 5][gore];
  for (let i = 0; i < n; i++) {
    const k = rng(), col = rng() < 0.5 ? BLOOD.dried : BLOOD.dark;
    if (k < 0.4) handprint(g, rng() * W, 150 + rng() * 150, 18, (rng() - 0.5) * 0.6, rng, col, 60 + rng() * 60);
    else if (k < 0.7) wallSplat(g, rng() * W, 80 + rng() * 180, 14 + rng() * 20, rng, col);
    else smear(g, rng() * W, 260, 50, 100, (rng() - 0.5) * 0.3, rng, col);
  }
  speckle(g, W, H, 14, rng);
  return c;
}

function floorCanvas(kind) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(707 + kind * 33);
  g.fillStyle = '#3d3a35';
  g.fillRect(0, 0, S, S);
  blotches(g, S, S, 260, 4, 30, '20,18,15', 0.14, rng);
  blotches(g, S, S, 160, 2, 16, '95,90,80', 0.08, rng);
  g.strokeStyle = 'rgba(15,12,10,.6)';
  for (let i = 0; i < 6; i++) {
    g.lineWidth = 0.6 + rng();
    g.beginPath();
    let x = rng() * S, y = rng() * S;
    g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (rng() - 0.5) * 40; y += (rng() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  g.strokeStyle = 'rgba(0,0,0,.5)'; // expansion joints on the 2 m grid
  g.lineWidth = 2;
  g.strokeRect(0, 0, S, S);
  if (kind === 1) { splat(g, S / 2, S / 2, 46, rng, BLOOD.dark, 0.85); splat(g, S / 2 + 10, S / 2 - 6, 28, rng, BLOOD.fresh, 0.7); }
  if (kind === 2) {
    const gr = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, 90);
    gr.addColorStop(0, 'rgba(40,0,0,.95)');
    gr.addColorStop(1, 'rgba(40,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#0b0908';
    g.fillRect(S / 2 - 22, S / 2 - 22, 44, 44);
    g.fillStyle = '#4a3a30';
    for (let i = 0; i < 6; i++) g.fillRect(S / 2 - 20, S / 2 - 18 + i * 7, 40, 3);
  }
  if (kind === 3) {
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(${BLOOD.dried},${0.25 + rng() * 0.3})`;
      g.beginPath();
      g.ellipse(S / 2 + (rng() - 0.5) * 30, i * 10, 26 + rng() * 10, 9, 0, 0, TAU);
      g.fill();
    }
  }
  speckle(g, S, S, 26, rng);
  return c;
}

function ceilingCanvas() {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(9);
  g.fillStyle = '#26231f';
  g.fillRect(0, 0, S, S);
  blotches(g, S, S, 140, 6, 50, '60,45,25', 0.12, rng);
  blotches(g, S, S, 80, 3, 20, '8,6,4', 0.3, rng);
  speckle(g, S, S, 18, rng);
  return c;
}

// ---------- the other kinds of floor ----------
// blood on a wall, at a gore level 0..3 (shared by every theme's walls)
function wallBlood(g, W, H, gore, rng, scale = 1) {
  const n = [0, 2, 4, 7][gore];
  for (let i = 0; i < n; i++) {
    const kind = rng(), col = rng() < 0.4 ? BLOOD.dried : rng() < 0.5 ? BLOOD.dark : BLOOD.fresh;
    if (kind < 0.35) wallSplat(g, rng() * W, 60 + rng() * 220, (14 + rng() * 30) * scale, rng, col);
    else if (kind < 0.55) arterial(g, rng() * W * 0.5, 40 + rng() * 140, 120 + rng() * 120, rng() * 0.8 - 0.2, rng, col);
    else if (kind < 0.8) handprint(g, rng() * W, 160 + rng() * 170, 18 + rng() * 6, (rng() - 0.5) * 0.8, rng, col, rng() < 0.6 ? 40 + rng() * 80 : 0);
    else smear(g, rng() * W, 250 + rng() * 40, 40 + rng() * 30, 90 + rng() * 40, (rng() - 0.5) * 0.4, rng, col);
  }
  if (gore >= 2) for (let i = 0; i < 6 * gore; i++) drip(g, rng() * W, 0, 20 + rng() * 120, 1.5 + rng() * 3, BLOOD.dark, 0.7);
}
// a drop ceiling: square panels in a metal grid, water stains, a panel or two missing
function dropCeiling(seed, base, grid) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(seed);
  g.fillStyle = grid;
  g.fillRect(0, 0, S, S);
  const n = 4, ps = S / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (rng() < 0.06) { g.fillStyle = '#060504'; g.fillRect(x * ps + 2, y * ps + 2, ps - 4, ps - 4); continue; } // a hole into the dark
    const v = rng() * 14 - 7;
    g.fillStyle = `rgb(${base[0] + v | 0},${base[1] + v | 0},${base[2] + v | 0})`;
    g.fillRect(x * ps + 2, y * ps + 2, ps - 4, ps - 4);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(0,0,0,${rng() * 0.12})`; g.fillRect(x * ps + 2 + rng() * (ps - 6), y * ps + 2 + rng() * (ps - 6), 1.5, 1.5); } // the pinholes
    if (rng() < 0.3) { const gr = g.createRadialGradient(x * ps + ps / 2, y * ps + ps / 2, 2, x * ps + ps / 2, y * ps + ps / 2, ps * 0.6); gr.addColorStop(0, 'rgba(110,80,30,.55)'); gr.addColorStop(0.7, 'rgba(110,80,30,.25)'); gr.addColorStop(1, 'rgba(110,80,30,0)'); g.fillStyle = gr; g.fillRect(x * ps, y * ps, ps, ps); }
  }
  speckle(g, S, S, 14, rng);
  return c;
}

// hospital: small white tiles above a band of green paint, a steel kick plate, and decades of mould
function wardWallCanvas(gore) {
  const W = 256, H = 384, { c, g } = hq(W, H), rng = makeRng(901 + gore * 31);
  g.fillStyle = '#6c706a';
  g.fillRect(0, 0, W, H);
  const band = 210, tw = 16, th = 8;
  for (let y = 0, row = 0; y < band; y += th, row++)
    for (let x = row % 2 ? -tw / 2 : 0; x < W; x += tw) {
      const v = rng() * 16 - 8, yel = rng() * 10;
      g.fillStyle = `rgb(${214 + v | 0},${212 + v - yel * 0.3 | 0},${198 + v - yel | 0})`;
      g.fillRect(x + 1, y + 1, tw - 2, th - 2);
      g.fillStyle = 'rgba(255,255,255,.22)';
      g.fillRect(x + 2, y + 1.5, tw - 6, 1);
    }
  // the stripe and the painted lower wall
  g.fillStyle = '#1f4a46'; g.fillRect(0, band, W, 10);
  const gr = g.createLinearGradient(0, band + 10, 0, H);
  gr.addColorStop(0, '#7f9c8a'); gr.addColorStop(1, '#5d7566');
  g.fillStyle = gr; g.fillRect(0, band + 10, W, H - band - 10);
  blotches(g, W, H, 50, 2, 8, '230,240,225', 0.15, rng); // paint gone chalky
  // the stainless kick plate
  g.fillStyle = '#8c9294'; g.fillRect(0, H - 34, W, 34);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${rng() * 0.08})`; g.fillRect(0, H - 34 + rng() * 34, W, 1); }
  g.fillStyle = '#2c3030'; g.fillRect(0, H - 35, W, 2);
  // mould, damp, rust from the fixings
  blotches(g, W, H, 34, 4, 26, '40,50,30', 0.18, rng);
  streaks(g, W, H, 16, '120,90,40', 0.35, rng, true);
  wallBlood(g, W, H, gore, rng);
  speckle(g, W, H, 14, rng);
  return c;
}
// hospital floor: a cream and grey-green chequerboard of lino tiles, worn through in the walkways
function wardFloorCanvas(kind) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(931 + kind * 7);
  const n = 8, ts = S / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = rng() * 10 - 5, dark = (x + y) % 2;
    g.fillStyle = dark ? `rgb(${104 + v | 0},${116 + v | 0},${104 + v | 0})` : `rgb(${196 + v | 0},${190 + v | 0},${170 + v | 0})`;
    g.fillRect(x * ts, y * ts, ts, ts);
    for (let k = 0; k < 20; k++) { g.fillStyle = `rgba(${dark ? '60,70,60' : '120,110,90'},${rng() * 0.5})`; g.fillRect(x * ts + rng() * ts, y * ts + rng() * ts, 1.5, 1.5); } // the fleck in it
  }
  g.strokeStyle = 'rgba(30,30,25,.35)';
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * ts, 0); g.lineTo(i * ts, S); g.moveTo(0, i * ts); g.lineTo(S, i * ts); g.stroke(); }
  blotches(g, S, S, 90, 6, 34, '40,36,26', 0.12, rng); // grime
  if (kind === 2) { // a floor drain: everything ran down here
    const gr = g.createRadialGradient(S / 2, S / 2, 6, S / 2, S / 2, 80); gr.addColorStop(0, 'rgba(50,0,0,.9)'); gr.addColorStop(1, 'rgba(50,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.fillStyle = '#111'; g.beginPath(); g.arc(S / 2, S / 2, 18, 0, TAU); g.fill();
    g.strokeStyle = '#777'; g.lineWidth = 2; for (let i = -12; i <= 12; i += 6) { g.beginPath(); g.moveTo(S / 2 + i, S / 2 - 15); g.lineTo(S / 2 + i, S / 2 + 15); g.stroke(); }
  }
  if (kind === 1) { splat(g, S / 2, S / 2, 40, rng, BLOOD.dark, 0.85); smear(g, S * 0.3, S * 0.8, 40, 120, -0.6, rng, BLOOD.dried); }
  if (kind === 3) for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(20,20,20,.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(S * 0.42 + i * 2, 0); g.lineTo(S * 0.44 + i * 2, S); g.stroke(); } // gurney wheel tracks
  speckle(g, S, S, 12, rng);
  return c;
}

// offices: faded wallpaper above a dado rail, wood panelling below, nicotine and water damage
function officeWallCanvas(gore) {
  const W = 256, H = 384, { c, g } = hq(W, H), rng = makeRng(611 + gore * 13);
  g.fillStyle = '#9e9472';
  g.fillRect(0, 0, W, H);
  const dado = 250;
  for (let x = 0; x < W; x += 32) { g.fillStyle = 'rgba(80,70,40,.18)'; g.fillRect(x, 0, 12, dado); g.fillStyle = 'rgba(255,250,220,.08)'; g.fillRect(x + 14, 0, 4, dado); } // the stripe
  for (let y = 16; y < dado; y += 48) for (let x = 16; x < W; x += 32) { g.fillStyle = 'rgba(90,70,40,.2)'; g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 5, y); g.lineTo(x, y + 7); g.lineTo(x - 5, y); g.fill(); } // a little diamond motif
  const ny = g.createLinearGradient(0, 0, 0, dado); ny.addColorStop(0, 'rgba(110,80,30,.35)'); ny.addColorStop(1, 'rgba(110,80,30,0)');
  g.fillStyle = ny; g.fillRect(0, 0, W, dado); // nicotine from the ceiling down
  // the paper peeling in places
  for (let i = 0; i < 3; i++) { const x = rng() * W, y = rng() * dado * 0.8, w = 20 + rng() * 30, h = 30 + rng() * 60; g.fillStyle = '#5e5a4c'; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(200,190,150,.6)'; g.fillRect(x + w - 4, y, 4, h); }
  // dado rail and panelling
  g.fillStyle = '#3a2614'; g.fillRect(0, dado, W, 10);
  g.fillStyle = '#5a3c22'; g.fillRect(0, dado + 10, W, H - dado - 10);
  for (let x = 0; x < W; x += 64) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, dado + 10, 3, H); g.strokeStyle = 'rgba(0,0,0,.25)'; g.strokeRect(x + 10, dado + 24, 44, H - dado - 50); }
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(30,18,8,${rng() * 0.3})`; g.fillRect(rng() * W, dado + 10 + rng() * (H - dado), 30 + rng() * 40, 1); } // grain
  g.fillStyle = '#20150b'; g.fillRect(0, H - 14, W, 14); // skirting
  streaks(g, W, H, 10, '90,70,40', 0.4, rng, true);
  blotches(g, W, H, 30, 6, 30, '40,40,30', 0.12, rng);
  wallBlood(g, W, H, gore, rng);
  speckle(g, W, H, 16, rng);
  return c;
}
// the hiring office (the sub-level under it all): painted cinder block, institutional green over a darker band,
// a strip light's worth of yellowing on the paint. Not the wallpaper of the offices upstairs
function hiringWallCanvas(gore) {
  const W = 256, H = 384, { c, g } = hq(W, H), rng = makeRng(911 + gore * 7);
  const band = 250;
  g.fillStyle = '#8fa48e'; g.fillRect(0, 0, W, band);
  g.fillStyle = '#3e5444'; g.fillRect(0, band, W, H - band);
  // the blocks: 64 x 32, staggered, the mortar showing through the paint as shallow grooves
  for (let y = 0, row = 0; y < H; y += 32, row++) {
    const off = row % 2 ? 32 : 0;
    g.fillStyle = 'rgba(30,40,30,.35)'; g.fillRect(0, y, W, 3);
    for (let x = -off; x < W; x += 64) { g.fillRect(x, y, 3, 32); g.fillStyle = `rgba(${rng() < 0.5 ? '255,255,240' : '20,30,20'},${rng() * 0.07})`; g.fillRect(x + 3, y + 3, 61, 29); g.fillStyle = 'rgba(30,40,30,.35)'; }
  }
  // the paint: pitted, a pinhole in every block, rolled on thick
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(20,30,20,${rng() * 0.3})`; g.fillRect(rng() * W, rng() * H, 1 + rng() * 2, 1 + rng() * 2); }
  g.fillStyle = '#2a3a2e'; g.fillRect(0, band - 4, W, 8); // the line where the two greens meet
  const ny = g.createLinearGradient(0, 0, 0, band); ny.addColorStop(0, 'rgba(120,110,50,.3)'); ny.addColorStop(1, 'rgba(120,110,50,0)'); g.fillStyle = ny; g.fillRect(0, 0, W, band);
  g.fillStyle = '#1a1e1a'; g.fillRect(0, H - 12, W, 12); // rubber skirting
  streaks(g, W, H, 8, '60,70,40', 0.35, rng, true);
  blotches(g, W, H, 24, 6, 26, '40,50,30', 0.14, rng);
  wallBlood(g, W, H, gore, rng);
  speckle(g, W, H, 14, rng);
  return c;
}
// linoleum: oxblood and cream squares, waxed to a shine once and walked dull since, cracked at the seams
function hiringFloorCanvas(kind) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(931 + kind * 5);
  const n = 4, ts = S / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = rng() * 10 - 5, dark = (x + y) % 2;
    g.fillStyle = dark ? `rgb(${92 + v | 0},${34 + v | 0},${28 + v | 0})` : `rgb(${196 + v | 0},${184 + v | 0},${156 + v | 0})`;
    g.fillRect(x * ts, y * ts, ts, ts);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${dark ? '40,10,8' : '120,110,90'},${rng() * 0.25})`; g.beginPath(); g.ellipse(x * ts + rng() * ts, y * ts + rng() * ts, 1 + rng() * 6, 1 + rng() * 2, rng() * 3, 0, TAU); g.fill(); } // the marbling
  }
  g.strokeStyle = 'rgba(20,10,5,.5)'; g.lineWidth = 1.5;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * ts, 0); g.lineTo(i * ts, S); g.moveTo(0, i * ts); g.lineTo(S, i * ts); g.stroke(); }
  for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(20,14,10,.6)'; g.fillRect(((rng() * n) | 0) * ts + rng() * ts, ((rng() * n) | 0) * ts, 2, ts * rng()); } // a cracked tile or two
  const path = g.createLinearGradient(0, 0, S, 0); path.addColorStop(0, 'rgba(60,50,40,0)'); path.addColorStop(0.5, 'rgba(60,50,40,.18)'); path.addColorStop(1, 'rgba(60,50,40,0)'); g.fillStyle = path; g.fillRect(0, 0, S, S); // walked dull down the middle
  blotches(g, S, S, 20, 6, 24, '50,40,20', 0.16, rng);
  if (kind === 1) bloodPool(g, S / 2, S / 2, 40, rng);
  if (kind === 2) splat(g, S / 2, S / 2, 34, rng, BLOOD.dried, 0.7);
  speckle(g, S, S, 16, rng);
  return c;
}
// B9, the smokehouse: old brick blackened to the ceiling, fat run down it and set, the plaster long gone
function smokeWallCanvas(gore) {
  const W = 256, H = 384, { c, g } = hq(W, H), rng = makeRng(1201 + gore * 9);
  g.fillStyle = '#1e1410'; g.fillRect(0, 0, W, H);
  for (let y = 0, row = 0; y < H; y += 20, row++) for (let x = row % 2 ? -20 : 0; x < W; x += 40) {
    const v = rng(); g.fillStyle = `rgb(${62 + v * 34 | 0},${30 + v * 14 | 0},${20 + v * 10 | 0})`; g.fillRect(x + 2, y + 2, 36, 16);
  }
  const soot = g.createLinearGradient(0, 0, 0, H); soot.addColorStop(0, 'rgba(6,4,2,.92)'); soot.addColorStop(0.55, 'rgba(10,6,4,.55)'); soot.addColorStop(1, 'rgba(10,6,4,.25)');
  g.fillStyle = soot; g.fillRect(0, 0, W, H); // black from the top down, where the smoke sat
  for (let i = 0; i < 26; i++) { const x = rng() * W, y = rng() * H * 0.5, len = 40 + rng() * 160; const gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, 'rgba(200,170,90,.35)'); gr.addColorStop(1, 'rgba(200,170,90,0)'); g.fillStyle = gr; g.fillRect(x, y, 2 + rng() * 4, len); } // fat, run down and set
  blotches(g, W, H, 40, 6, 30, '0,0,0', 0.3, rng);
  g.fillStyle = '#0c0806'; g.fillRect(0, H - 16, W, 16);
  wallBlood(g, W, H, gore, rng);
  speckle(g, W, H, 14, rng);
  return c;
}
// its floor: black concrete under ash and a skin of tallow, a drain channel, footprints where it's been walked
function smokeFloorCanvas(kind) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(1221 + kind * 7);
  g.fillStyle = '#262220'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 120, 4, 30, '60,56,50', 0.35, rng); // ash
  for (let i = 0; i < 7; i++) { const x = rng() * S, y = rng() * S, r = 20 + rng() * 50; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(190,170,110,${0.1 + rng() * 0.12})`); gr.addColorStop(1, 'rgba(190,170,110,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } // tallow, set in thin pools that fade at the edges
  for (let i = 0; i < 10; i++) { const y = 20 + i * 24, x = S * 0.62 + (i % 2 ? 9 : -9); g.fillStyle = 'rgba(10,8,6,.35)'; g.beginPath(); g.ellipse(x, y, 4, 9, 0, 0, TAU); g.fill(); } // one line of footprints through it
  if (kind === 2) { g.fillStyle = '#121010'; g.fillRect(S / 2 - 10, 0, 20, S); g.fillStyle = '#060404'; for (let y = 0; y < S; y += 10) g.fillRect(S / 2 - 8, y, 16, 5); }
  if (kind === 1) bloodPool(g, S / 2, S / 2, 40, rng);
  g.fillStyle = 'rgba(255,230,180,.05)'; for (let i = 0; i < 50; i++) g.fillRect(rng() * S, rng() * S, 2 + rng() * 12, 1); // greasy sheen
  speckle(g, S, S, 14, rng);
  return c;
}
// carpet tiles: blue-grey, each laid at right angles to the next, trodden into paths
function officeFloorCanvas(kind) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(641 + kind * 3);
  const n = 4, ts = S / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = rng() * 8 - 4;
    g.fillStyle = `rgb(${62 + v | 0},${68 + v | 0},${78 + v | 0})`;
    g.fillRect(x * ts, y * ts, ts, ts);
    const across = (x + y) % 2;
    for (let k = 0; k < 120; k++) { g.fillStyle = `rgba(${rng() < 0.5 ? '20,24,30' : '110,118,130'},${rng() * 0.35})`; if (across) g.fillRect(x * ts + rng() * ts, y * ts + rng() * ts, 4, 1); else g.fillRect(x * ts + rng() * ts, y * ts + rng() * ts, 1, 4); }
  }
  g.strokeStyle = 'rgba(0,0,0,.4)';
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * ts, 0); g.lineTo(i * ts, S); g.moveTo(0, i * ts); g.lineTo(S, i * ts); g.stroke(); }
  blotches(g, S, S, 30, 8, 30, '40,30,20', 0.18, rng); // coffee, and worse
  if (kind === 1) { bloodPool(g, S / 2, S / 2, 46, rng); }
  if (kind === 2) { splat(g, S / 2, S / 2, 40, rng, BLOOD.dried, 0.8); }
  if (kind === 3) for (let i = 0; i < 20; i++) { g.fillStyle = `rgba(${BLOOD.dried},${0.2 + rng() * 0.3})`; g.beginPath(); g.ellipse(S / 2 + (rng() - 0.5) * 30, i * 13, 22, 7, 0, 0, TAU); g.fill(); }
  speckle(g, S, S, 20, rng);
  return c;
}

// the drains: Victorian brick, black slime up to the high-water line, salt bleeding out of the joints
function sewerWallCanvas(gore) {
  const W = 256, H = 384, { c, g } = hq(W, H), rng = makeRng(711 + gore * 11);
  g.fillStyle = '#2a1e18';
  g.fillRect(0, 0, W, H);
  const bw = 32, bh = 12;
  for (let y = 0, row = 0; y < H; y += bh, row++)
    for (let x = row % 2 ? -bw / 2 : 0; x < W; x += bw) {
      const v = rng() * 30 - 15;
      g.fillStyle = `rgb(${128 + v | 0},${72 + v * 0.6 | 0},${54 + v * 0.4 | 0})`;
      g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      if (rng() < 0.3) { g.fillStyle = `rgba(0,0,0,${rng() * 0.3})`; g.fillRect(x + 2, y + bh - 5, bw - 4, 3); }
    }
  streaks(g, W, H, 40, '210,210,190', 0.25, rng, true); // efflorescence
  // the high-water line: everything below is black-green and wet
  const hw = H - 110;
  const gr = g.createLinearGradient(0, hw - 20, 0, H);
  gr.addColorStop(0, 'rgba(14,20,8,0)'); gr.addColorStop(0.12, 'rgba(14,20,8,.85)'); gr.addColorStop(1, 'rgba(6,10,4,.95)');
  g.fillStyle = gr; g.fillRect(0, hw - 20, W, H - hw + 20);
  g.save(); g.translate(0, hw); blotches(g, W, 150, 60, 3, 18, '50,80,24', 0.3, rng); g.restore(); // algae
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(150,170,120,${rng() * 0.25})`; g.fillRect(rng() * W, hw + rng() * 150, 1, 6 + rng() * 20); } // the wet catching the light
  streaks(g, W, H, 14, '30,40,15', 0.5, rng, true);
  wallBlood(g, W, H, gore, rng);
  speckle(g, W, H, 22, rng);
  return c;
}
function sewerFloorCanvas(kind) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(741 + kind * 5);
  g.fillStyle = '#1a1712';
  g.fillRect(0, 0, S, S);
  // stone setts
  const n = 8, ts = S / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = rng() * 20 - 10;
    g.fillStyle = `rgb(${84 + v | 0},${78 + v | 0},${66 + v | 0})`;
    g.beginPath(); g.ellipse(x * ts + ts / 2 + (y % 2 ? ts / 2 : 0) % S, y * ts + ts / 2, ts * 0.46, ts * 0.42, rng() * 0.3, 0, TAU); g.fill();
  }
  blotches(g, S, S, 60, 6, 30, '20,30,10', 0.5, rng); // muck
  for (let i = 0; i < 5; i++) { const gr = g.createRadialGradient(rng() * S, rng() * S, 2, rng() * S, rng() * S, 40); gr.addColorStop(0, 'rgba(10,14,8,.8)'); gr.addColorStop(1, 'rgba(10,14,8,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); } // puddles
  if (kind === 1 || kind === 2) bloodPool(g, S / 2, S / 2, 40, rng);
  if (kind === 3) smear(g, S / 2, 0, 50, S, 0, rng, BLOOD.dried);
  speckle(g, S, S, 24, rng);
  return c;
}
function sewerCeilCanvas() {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(777);
  g.fillStyle = '#1c1410';
  g.fillRect(0, 0, S, S);
  for (let y = 0, row = 0; y < S; y += 12, row++) for (let x = row % 2 ? -16 : 0; x < S; x += 32) { const v = rng() * 16; g.fillStyle = `rgb(${50 + v | 0},${30 + v * 0.5 | 0},${24 + v * 0.3 | 0})`; g.fillRect(x + 1.5, y + 1.5, 29, 9); }
  blotches(g, S, S, 50, 6, 30, '10,14,6', 0.5, rng);
  streaks(g, S, S, 20, '200,200,180', 0.2, rng, true);
  speckle(g, S, S, 20, rng);
  return c;
}

// the deep freeze: insulated panels a metre wide, frost growing out of every seam, the lower half dented by forklifts
function freezeWallCanvas(gore) {
  const W = 256, H = 384, { c, g } = hq(W, H), rng = makeRng(811 + gore * 17);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#b8c4cc'); gr.addColorStop(1, '#8e9aa2');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 128) {
    g.fillStyle = '#4a5258'; g.fillRect(x, 0, 3, H); // seam
    for (let y = 20; y < H; y += 48) { g.fillStyle = '#5a6268'; g.beginPath(); g.arc(x + 8, y, 2, 0, TAU); g.arc(x + 120, y, 2, 0, TAU); g.fill(); } // rivets
    for (let y = 0; y < H; y += 6) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(x + 4, y, 124, 1); } // the fine ribbing
  }
  // frost: white crust thick at the top and along every seam
  for (let i = 0; i < 60; i++) { const x = (rng() < 0.5 ? Math.round(rng() * 2) * 128 : rng() * W), len = 20 + rng() * 200; const fr = g.createLinearGradient(0, 0, 0, len); fr.addColorStop(0, 'rgba(245,250,255,.75)'); fr.addColorStop(1, 'rgba(245,250,255,0)'); g.fillStyle = fr; g.fillRect(x - 3, 0, 4 + rng() * 10, len); }
  blotches(g, W, 50, 80, 4, 20, '250,252,255', 0.5, rng);
  // forklift scuffs and a black-and-yellow guard
  g.fillStyle = '#1a1a14'; g.fillRect(0, H - 60, W, 26);
  g.fillStyle = '#b08a1a'; for (let x = -26; x < W; x += 26) { g.beginPath(); g.moveTo(x, H - 34); g.lineTo(x + 13, H - 34); g.lineTo(x + 26, H - 60); g.lineTo(x + 13, H - 60); g.fill(); }
  for (let i = 0; i < 20; i++) { g.fillStyle = `rgba(30,30,30,${rng() * 0.4})`; g.fillRect(rng() * W, H - 110 + rng() * 40, 20 + rng() * 40, 2); }
  g.fillStyle = '#6e767c'; g.fillRect(0, H - 34, W, 34);
  streaks(g, W, H, 10, '120,90,50', 0.3, rng, false);
  wallBlood(g, W, H, gore, rng);
  speckle(g, W, H, 10, rng);
  return c;
}
function freezeFloorCanvas(kind) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(841 + kind * 9);
  g.fillStyle = '#7a8086'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 160, 4, 30, '60,64,70', 0.15, rng);
  blotches(g, S, S, 50, 10, 50, '235,242,250', 0.35, rng); // frost
  if (kind === 3) { g.fillStyle = '#b8901c'; g.fillRect(S / 2 - 8, 0, 16, S); } // a painted aisle line
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.strokeRect(0, 0, S, S);
  if (kind === 1 || kind === 2) { const r = makeRng(kind); bloodPool(g, S / 2, S / 2, 38, r); blotches(g, S, S, 30, 4, 14, '240,245,255', 0.4, rng); } // frozen into it
  speckle(g, S, S, 12, rng);
  return c;
}
// ---- the processing line: a meat factory floor ----
// painted blockwork: grubby cream above, a dark green dado, a black-and-yellow guard band at knee height where the
// carts hit it, conduit and a pipe run along the top
function factoryWallCanvas(gore) {
  const W = 256, H = 384, { c, g } = hq(W, H), rng = makeRng(911 + gore * 13);
  g.fillStyle = '#b8b29a'; g.fillRect(0, 0, W, H);
  // the blocks, each a slightly different shade, with mortar lines
  for (let y = 0; y < H; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < W; x += 64) { g.fillStyle = `rgba(${90 + rng() * 40 | 0},${85 + rng() * 35 | 0},${60 + rng() * 30 | 0},${0.06 + rng() * 0.1})`; g.fillRect(x + 1, y + 1, 62, 30); }
  g.fillStyle = 'rgba(60,56,44,.45)'; for (let y = 0; y < H; y += 32) g.fillRect(0, y, W, 2);
  for (let y = 0; y < H; y += 32) for (let x = (y / 32) % 2 ? 32 : 0; x < W; x += 64) g.fillRect(x, y, 2, 32);
  blotches(g, W, H * 0.6, 120, 4, 26, '90,80,50', 0.18, rng);
  streaks(g, W, H, 18, '110,80,40', 0.35, rng, true); // rust running down from the pipes
  // pipe and conduit along the top
  const pipe = g.createLinearGradient(0, 14, 0, 34); pipe.addColorStop(0, '#5a5e5a'); pipe.addColorStop(0.5, '#9aa09a'); pipe.addColorStop(1, '#3a3e3a');
  g.fillStyle = pipe; g.fillRect(0, 14, W, 20);
  for (let x = 20; x < W; x += 96) { g.fillStyle = '#2a2c2a'; g.fillRect(x, 10, 10, 28); } // brackets
  g.fillStyle = '#4a4e4a'; g.fillRect(0, 44, W, 5);
  // the dado: dark green paint, scuffed through to the block in places
  g.fillStyle = '#2e4234'; g.fillRect(0, H - 150, W, 150);
  blotches(g, W, H, 40, 3, 12, '140,135,110', 0.35, rng);
  // guard band at knee height
  g.fillStyle = '#141410'; g.fillRect(0, H - 96, W, 28);
  g.fillStyle = '#c8a21a'; for (let x = -28; x < W; x += 28) { g.beginPath(); g.moveTo(x, H - 68); g.lineTo(x + 14, H - 68); g.lineTo(x + 28, H - 96); g.lineTo(x + 14, H - 96); g.fill(); }
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(20,20,16,${rng() * 0.5})`; g.fillRect(rng() * W, H - 100 + rng() * 34, 10 + rng() * 40, 2); } // cart scrapes
  g.fillStyle = '#1e2a22'; g.fillRect(0, H - 14, W, 14); // the cove at the floor
  streaks(g, W, H, 14, '70,10,6', 0.4, rng, false); // splash-back from the line
  wallBlood(g, W, H, gore, rng);
  speckle(g, W, H, 12, rng);
  return c;
}
// the factory floor: red-brown resin, worn grey in the walkways, yellow lane lines, a steel drain; kind 1 blood,
// kind 2 a grated drain with the floor running into it, kind 3 the walkway
function factoryFloorCanvas(kind) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(931 + kind * 7);
  g.fillStyle = '#5a4038'; g.fillRect(0, 0, S, S); // oxblood resin, mostly worn down to the concrete
  blotches(g, S, S, 140, 4, 34, '40,24,18', 0.3, rng);
  blotches(g, S, S, 110, 6, 44, '130,118,106', 0.3, rng); // worn through to the concrete
  for (let i = 0; i < 30; i++) { g.strokeStyle = `rgba(20,8,4,${rng() * 0.4})`; g.lineWidth = 1; g.beginPath(); const x = rng() * S, y = rng() * S; g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 60, y + (rng() - 0.5) * 60); g.stroke(); } // cracks
  if (kind === 3) { g.fillStyle = '#c8a21a'; g.fillRect(18, 0, 12, S); g.fillRect(S - 30, 0, 12, S); blotches(g, S, S, 40, 2, 8, '30,24,10', 0.6, rng); }
  if (kind === 2) {
    g.fillStyle = '#2a2a28'; g.fillRect(S / 2 - 40, S / 2 - 40, 80, 80);
    g.fillStyle = '#0a0a08'; for (let y = S / 2 - 36; y < S / 2 + 36; y += 8) g.fillRect(S / 2 - 36, y, 72, 4);
    const r = makeRng(77); bloodPool(g, S / 2, S / 2, 52, r);
  }
  if (kind === 1) { const r = makeRng(kind + 3); bloodPool(g, S / 2, S / 2, 44, r); }
  g.fillStyle = 'rgba(255,230,210,.06)'; for (let i = 0; i < 40; i++) g.fillRect(rng() * S, rng() * S, 2 + rng() * 10, 1); // wet sheen
  speckle(g, S, S, 12, rng);
  return c;
}
// the ceiling: open steel decking with the ducting and cable trays left exposed
function factoryCeilCanvas() {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(951);
  for (let x = 0; x < S; x += 32) { const gr = g.createLinearGradient(x, 0, x + 32, 0); gr.addColorStop(0, '#2c2e2c'); gr.addColorStop(0.5, '#4a4e4a'); gr.addColorStop(1, '#262826'); g.fillStyle = gr; g.fillRect(x, 0, 32, S); }
  g.fillStyle = '#5a5e5a'; g.fillRect(0, 100, S, 26); g.fillStyle = '#3a3c3a'; g.fillRect(0, 104, S, 3); g.fillRect(0, 120, S, 3); // a duct
  g.fillStyle = '#1e201e'; for (let x = 0; x < S; x += 12) g.fillRect(x, 190, 3, 18); g.fillRect(0, 190, S, 3); // a cable tray
  blotches(g, S, S, 60, 4, 24, '20,16,10', 0.4, rng);
  speckle(g, S, S, 10, rng);
  return c;
}

// ---- B10, the main factory floor: the newest part of the plant (1994 on the plaque). Pale steel cladding on a
// concrete plinth, a safety-red kick band, sealed concrete floors with red-and-white lanes, a galvanised roof deck ----
const ribs = (g, x0, w, y0, h, base, rib = 16) => { // standing-seam cladding: a light face, a shadowed rib
  for (let x = x0; x < x0 + w; x += rib) {
    const gr = g.createLinearGradient(x, 0, x + rib, 0);
    gr.addColorStop(0, `rgb(${base.map((v) => v - 26)})`); gr.addColorStop(0.18, `rgb(${base.map((v) => v + 14)})`);
    gr.addColorStop(0.55, `rgb(${base})`); gr.addColorStop(0.85, `rgb(${base.map((v) => v - 8)})`); gr.addColorStop(1, `rgb(${base.map((v) => v - 34)})`);
    g.fillStyle = gr; g.fillRect(x, y0, rib, h);
  }
};
function plant98WallCanvas(gore) {
  const W = 256, H = 384, { c, g } = hq(W, H), rng = makeRng(1994 + gore * 13);
  const plinth = H - 154; // the bottom 1.2 m is poured concrete
  ribs(g, 0, W, 0, plinth, [116, 122, 126]); // (dark steel)
  g.fillStyle = 'rgba(60,64,66,.5)'; g.fillRect(0, plinth - 6, W, 6); // the flashing over the plinth
  g.fillStyle = '#8a9094'; g.fillRect(0, plinth - 10, W, 4);
  for (let x = 6; x < W; x += 32) { g.fillStyle = '#7a8084'; g.fillRect(x, 20, 3, 3); g.fillRect(x, plinth - 30, 3, 3); } // fixings
  streaks(g, W, plinth, 10, '90,84,76', 0.18, rng, true); // a little weather off the fixings: it's newer, not new
  g.fillStyle = '#9c9e9a'; g.fillRect(0, plinth, W, H - plinth);
  blotches(g, W, H, 60, 3, 18, '120,122,118', 0.3, rng);
  for (const x of [64, 192]) { g.fillStyle = '#5c5e5a'; g.beginPath(); g.arc(x, plinth + 60, 4, 0, 7); g.fill(); } // form-tie holes
  g.fillStyle = 'rgba(70,72,68,.6)'; g.fillRect(0, plinth + 1, W, 2);
  g.fillStyle = '#9a1612'; g.fillRect(0, H - 34, W, 34); // safety-red kick band
  g.fillStyle = '#e8e4dc'; g.fillRect(0, H - 40, W, 6);
  for (let i = 0; i < 22; i++) { g.fillStyle = `rgba(30,28,26,${rng() * 0.45})`; g.fillRect(rng() * W, H - 44 + rng() * 40, 8 + rng() * 40, 2); } // trolley scuffs
  wallBlood(g, W, H, gore, rng);
  speckle(g, W, H, 8, rng);
  return c;
}
function plant98UpperCanvas() { // the cladding all the way up to the roof
  const W = 256, H = 384, { c, g } = hq(W, H), rng = makeRng(1995);
  ribs(g, 0, W, 0, H, [100, 106, 110]);
  g.fillStyle = 'rgba(50,54,56,.55)'; g.fillRect(0, H - 4, W, 4); // the panel lap
  for (let x = 6; x < W; x += 32) { g.fillStyle = '#7a8084'; g.fillRect(x, 10, 3, 3); g.fillRect(x, H - 14, 3, 3); }
  streaks(g, W, H, 12, '80,74,66', 0.16, rng, true);
  blotches(g, W, H, 30, 6, 30, '120,124,126', 0.2, rng);
  speckle(g, W, H, 6, rng);
  return c;
}
function plant98FloorCanvas(kind) { // sealed concrete: pale, a soft gloss, trowel swirls, tyre marks
  const S = 256, { c, g } = hq(S, S), rng = makeRng(1996 + kind * 7);
  g.fillStyle = '#8e908c'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 120, 8, 46, '120,122,118', 0.22, rng);
  blotches(g, S, S, 90, 6, 40, '96,98,94', 0.2, rng);
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(160,162,158,${rng() * 0.12})`; g.lineWidth = 2 + rng() * 4; g.beginPath(); g.arc(rng() * S, rng() * S, 20 + rng() * 50, rng() * 6, rng() * 6 + 1.5); g.stroke(); } // trowel
  for (let i = 0; i < 4; i++) { g.strokeStyle = `rgba(40,40,38,${0.08 + rng() * 0.1})`; g.lineWidth = 7; g.beginPath(); const y = rng() * S; g.moveTo(0, y); g.bezierCurveTo(S * 0.3, y + (rng() - 0.5) * 60, S * 0.7, y + (rng() - 0.5) * 60, S, y + (rng() - 0.5) * 30); g.stroke(); } // forklift tyres
  g.fillStyle = 'rgba(60,62,58,.5)'; g.fillRect(0, 0, S, 2); // a saw-cut joint on one edge (a 2 m grid, the way they cut slabs)
  if (kind === 2) {
    g.fillStyle = '#6a6e70'; g.fillRect(S / 2 - 42, S / 2 - 42, 84, 84);
    g.fillStyle = '#1a1c1c'; for (let y = S / 2 - 36; y < S / 2 + 36; y += 7) g.fillRect(S / 2 - 36, y, 72, 3);
    bloodPool(g, S / 2, S / 2, 56, makeRng(78));
  }
  if (kind === 1) bloodPool(g, S / 2, S / 2, 46, makeRng(9));
  if (kind === 3) { g.fillStyle = 'rgba(20,20,18,.18)'; for (let i = 0; i < 6; i++) g.fillRect(rng() * S, 0, 3, S); } // the drag of pallets
  speckle(g, S, S, 7, rng);
  return c;
}
function plant98CeilCanvas() { // a galvanised trapezoidal deck, seen from below
  const S = 256, { c, g } = hq(S, S), rng = makeRng(1997);
  for (let x = 0; x < S; x += 32) {
    const gr = g.createLinearGradient(x, 0, x + 32, 0);
    gr.addColorStop(0, '#3e4446'); gr.addColorStop(0.25, '#646a6c'); gr.addColorStop(0.5, '#52585a'); gr.addColorStop(0.75, '#33393b'); gr.addColorStop(1, '#3e4446');
    g.fillStyle = gr; g.fillRect(x, 0, 32, S);
  }
  blotches(g, S, S, 50, 6, 30, '60,58,52', 0.25, rng);
  speckle(g, S, S, 8, rng);
  return c;
}

function freezeCeilCanvas() {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(877);
  for (let x = 0; x < S; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#5c646a'); gr.addColorStop(0.5, '#8a949a'); gr.addColorStop(1, '#4a5258'); g.fillStyle = gr; g.fillRect(x, 0, 16, S); } // corrugated
  blotches(g, S, S, 70, 6, 30, '240,245,255', 0.4, rng);
  speckle(g, S, S, 10, rng);
  return c;
}

// one set of surfaces per kind of floor, built the first time that kind of floor comes up
export function themeMaterials(mats, theme) {
  mats.themes ||= {};
  if (mats.themes[theme]) return mats.themes[theme];
  const phong = (o, p) => (TEX.pbr ? stdMat(o, p) : new THREE.MeshPhongMaterial(o));
  const tx = (c) => toTex(c);
  const wall = (fn, shine, spec, bump = 1.2) => [0, 1, 2, 3].map((gore) => { const t = tx(fn(gore)); return phong({ map: t, bumpMap: t, bumpScale: bump, shininess: shine, specular: spec }, WALL_P); });
  const floor = (fn, shine, spec) => [0, 1, 2, 3].map((k) => { const t = tx(fn(k)); return wetFloor(phong({ map: t, bumpMap: t, bumpScale: 0.8, shininess: shine, specular: spec }, FLOOR_P)); });
  let m;
  if (theme === 'morgue') m = { walls: wall(wardWallCanvas, 60, 0x445048, 0.8), floors: floor(wardFloorCanvas, 70, 0x333833), ceil: phong({ map: tx(dropCeiling(951, [190, 188, 172], '#4e4c44')), shininess: 4 }, CEIL_P) };
  else if (theme === 'offices') m = { walls: wall(officeWallCanvas, 8, 0x111111), floors: floor(officeFloorCanvas, 2, 0x000000), ceil: phong({ map: tx(dropCeiling(661, [168, 160, 136], '#3e3a30')), shininess: 4 }, CEIL_P) };
  else if (theme === 'smokehouse') m = { walls: wall(smokeWallCanvas, 70, 0x3a2a18, 1.4), floors: floor(smokeFloorCanvas, 100, 0x3a3020), ceil: phong({ map: tx(factoryCeilCanvas()), shininess: 20, specular: 0x111111 }, CEIL_P) };
  else if (theme === 'hiring') m = { walls: wall(hiringWallCanvas, 30, 0x222a22, 1.0), floors: floor(hiringFloorCanvas, 90, 0x333028), ceil: phong({ map: tx(dropCeiling(977, [150, 156, 140], '#2e3430')), shininess: 4 }, CEIL_P) };
  else if (theme === 'sewer') m = { walls: wall(sewerWallCanvas, 70, 0x334422, 2), floors: floor(sewerFloorCanvas, 110, 0x445533), ceil: phong({ map: tx(sewerCeilCanvas()), shininess: 30, specular: 0x222222 }, CEIL_P) };
  else if (theme === 'processing') m = { walls: wall(factoryWallCanvas, 30, 0x2a2a22, 1.4), floors: floor(factoryFloorCanvas, 90, 0x4a2a22), ceil: phong({ map: tx(factoryCeilCanvas()), shininess: 30, specular: 0x222222 }, CEIL_P) };
  else if (theme === 'plant98') m = { walls: wall(plant98WallCanvas, 55, 0x777b7d, 0.7), upper: phong({ map: tx(plant98UpperCanvas()), bumpMap: tx(plant98UpperCanvas()), bumpScale: 0.6, shininess: 60, specular: 0x8a8e90 }, { ...WALL_P, metal: 0.55, roughClean: 0.4 }),
    floors: floor(plant98FloorCanvas, 70, 0x5a5c5a), ceil: phong({ map: tx(plant98CeilCanvas()), shininess: 50, specular: 0x666a6c }, { ...CEIL_P, metal: 0.6 }) };
  else if (theme === 'freezer') m = { walls: wall(freezeWallCanvas, 50, 0x8899aa, 0.6), floors: floor(freezeFloorCanvas, 60, 0x99aabb), ceil: phong({ map: tx(freezeCeilCanvas()), shininess: 40, specular: 0x666666 }, CEIL_P) };
  else m = null;
  mats.themes[theme] = m;
  return m;
}

// raw muscle with fat marbling
function meatCanvas(seed = 3, pale = false) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(seed);
  g.fillStyle = pale ? '#b0544c' : '#7a1612';
  g.fillRect(0, 0, S, S);
  blotches(g, S, S, 220, 4, 26, pale ? '170,70,60' : '120,20,18', 0.5, rng);
  blotches(g, S, S, 120, 3, 18, '50,4,4', 0.5, rng);
  for (let i = 0; i < 40; i++) { // fat
    g.strokeStyle = `rgba(232,${200 + rng() * 30 | 0},170,${0.25 + rng() * 0.5})`;
    g.lineWidth = 1 + rng() * 4;
    g.beginPath();
    let x = rng() * S, y = rng() * S;
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (rng() - 0.5) * 50; y += rng() * 30; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 30; i++) { // sinew
    g.strokeStyle = `rgba(230,220,210,${rng() * 0.3})`;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(rng() * S, rng() * S);
    g.lineTo(rng() * S, rng() * S);
    g.stroke();
  }
  speckle(g, S, S, 24, rng);
  return c;
}

function skinCanvas(seed, base = [168, 150, 128]) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(seed);
  g.fillStyle = `rgb(${base})`;
  g.fillRect(0, 0, S, S);
  blotches(g, S, S, 120, 6, 40, '110,120,95', 0.18, rng); // lividity
  blotches(g, S, S, 50, 6, 30, '80,40,70', 0.18, rng); // bruising
  for (let i = 0; i < 30; i++) { // veins
    g.strokeStyle = `rgba(60,70,90,${0.15 + rng() * 0.2})`;
    g.lineWidth = 0.7;
    g.beginPath();
    let x = rng() * S, y = rng() * S;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rng() - 0.5) * 30; y += (rng() - 0.5) * 30; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 6; i++) splat(g, rng() * S, rng() * S, 6 + rng() * 14, rng, BLOOD.dark, 0.8);
  speckle(g, S, S, 20, rng);
  return c;
}

// the Foreman's mask is somebody's face, stitched on
function maskCanvas() {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(666);
  g.fillStyle = '#c7b49a';
  g.fillRect(0, 0, S, S);
  blotches(g, S, S, 100, 4, 30, '150,120,100', 0.3, rng);
  blotches(g, S, S, 50, 3, 14, '100,60,50', 0.3, rng);
  g.strokeStyle = '#2a1a12';
  g.lineWidth = 2;
  for (const [x0, y0, x1, y1] of [[20, 40, 230, 70], [128, 0, 120, 256], [30, 180, 220, 200], [60, 0, 40, 256]]) {
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    const n = 18;
    for (let i = 0; i <= n; i++) { // cross stitches
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny);
      g.beginPath(); g.moveTo(x - nx / l * 5, y - ny / l * 5); g.lineTo(x + nx / l * 5, y + ny / l * 5); g.stroke();
    }
  }
  for (let i = 0; i < 4; i++) drip(g, 70 + rng() * 120, 100 + rng() * 30, 60 + rng() * 90, 4 + rng() * 4, BLOOD.fresh, 0.85);
  speckle(g, S, S, 22, rng);
  return c;
}

// paint over steel, decades old: worn through at the edges and round anything handled, rust blooming under it in
// small chips and pits, running down in streaks from every seam
function paintOverRust(g, W, H, rng) {
  for (let i = 0; i < 260; i++) { // chips: small and many, sometimes clustered
    const cx = rng() * W, cy = rng() * H, n = rng() < 0.2 ? 4 : 1;
    for (let k = 0; k < n; k++) { g.fillStyle = `rgba(${96 + rng() * 30 | 0},${44 + rng() * 14 | 0},${16 + rng() * 8 | 0},${0.35 + rng() * 0.45})`; blob(g, cx + (rng() - 0.5) * 8, cy + (rng() - 0.5) * 8, 0.4 + rng() * rng() * 3.2); }
  }
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(40,18,8,${0.4 + rng() * 0.4})`; blob(g, rng() * W, rng() * H, 0.3 + rng() * 1.1); } // pits
  for (let i = 0; i < 14; i++) { // streaks running down from seams and bolts
    const x = rng() * W, y = rng() * H * 0.8, len = 20 + rng() * 90;
    const gr = g.createLinearGradient(0, y, 0, y + len);
    gr.addColorStop(0, `rgba(105,50,18,${0.3 + rng() * 0.3})`); gr.addColorStop(1, 'rgba(105,50,18,0)');
    g.fillStyle = gr; g.fillRect(x, y, 0.8 + rng() * 2.2, len);
  }
  const gr = g.createLinearGradient(0, H, 0, H * 0.75); // the bottom, where the mop water sat
  gr.addColorStop(0, 'rgba(70,32,12,0.55)'); gr.addColorStop(1, 'rgba(70,32,12,0)');
  g.fillStyle = gr; g.fillRect(0, H * 0.75, W, H * 0.25);
  g.strokeStyle = 'rgba(200,190,170,0.12)'; g.lineWidth = 0.5; // scratches through the paint
  for (let i = 0; i < 22; i++) { const x = rng() * W, y = rng() * H, a = rng() * 6.28, l = 6 + rng() * 24; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
}

// a remastered locker's sheet steel: chipped paint, a bloody handprint by the handle more often than not
function lockerCanvas(seed, paint) {
  const W = 128, H = 256, { c, g } = hq(W, H), rng = makeRng(seed);
  g.fillStyle = paint; g.fillRect(0, 0, W, H);
  paintOverRust(g, W, H, rng);
  if (rng() < 0.7) handprint(g, 96, 128, 15, 0.3, rng, BLOOD.dark, 40);
  speckle(g, W, H, 14, rng);
  return c;
}

function rustCanvas(seed, paint = '#3e4a3c') {
  const W = 128, H = 256, { c, g } = hq(W, H), rng = makeRng(seed);
  g.fillStyle = paint;
  g.fillRect(0, 0, W, H);
  if (TEX.pbr) { paintOverRust(g, W, H, rng); speckle(g, W, H, 14, rng); return c; } // remastered: plain chipped paint; lockers, pipes and beams get real shapes
  blotches(g, W, H, 90, 2, 16, '110,55,20', 0.45, rng);
  blotches(g, W, H, 50, 1, 8, '60,25,10', 0.6, rng);
  streaks(g, W, H, 20, '90,40,15', 0.5, rng, true);
  g.fillStyle = '#121212'; // vents
  for (let i = 0; i < 6; i++) g.fillRect(28, 22 + i * 7, 72, 3);
  for (let i = 0; i < 6; i++) g.fillRect(28, 200 + i * 7, 72, 3);
  g.fillStyle = '#1a1a1a';
  g.fillRect(104, 110, 8, 30); // latch
  if (rng() < 0.7) handprint(g, 64, 130, 16, 0.2, rng, BLOOD.dark, 50);
  speckle(g, W, H, 24, rng);
  return c;
}

function steelCanvas() {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(55);
  g.fillStyle = '#7c7f80';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,0,0'},.05)`; g.fillRect(0, rng() * S, S, 1); }
  for (let i = 0; i < 5; i++) splat(g, rng() * S, rng() * S, 14 + rng() * 26, rng, rng() < 0.5 ? BLOOD.dark : BLOOD.fresh, 0.9);
  smear(g, rng() * S, 20, 50, 160, 0.1, rng, BLOOD.dark);
  speckle(g, S, S, 16, rng);
  return c;
}

function clothCanvas(seed, base, bloody) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${rng() * 0.06})`; g.fillRect(rng() * S, 0, 1, S); }
  blotches(g, S, S, 60, 5, 30, '40,30,20', 0.18, rng);
  for (let i = 0; i < bloody; i++) splat(g, rng() * S, rng() * S, 16 + rng() * 34, rng, rng() < 0.5 ? BLOOD.dark : BLOOD.fresh, 0.85);
  speckle(g, S, S, 16, rng);
  return c;
}

// transparent decals laid over floors and props
function decalCanvas(kind, seed) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(seed);
  if (kind === 'pool') {
    bloodPool(g, S / 2, S / 2, 70, rng);
  } else if (kind === 'splat') {
    splat(g, S / 2, S / 2, 40, rng, rng() < 0.5 ? BLOOD.fresh : BLOOD.dark, 0.92);
  } else if (kind === 'drag') {
    for (let i = 0; i < 40; i++) {
      const y = i * 6.4;
      g.fillStyle = `rgba(${BLOOD.dark},${0.3 + rng() * 0.4})`;
      g.beginPath();
      g.ellipse(S / 2 + Math.sin(i * 0.3) * 8, y, 34 + rng() * 14, 10, 0, 0, TAU);
      g.fill();
    }
    for (let i = 0; i < 4; i++) { handprint(g, S / 2 + (rng() - 0.5) * 120, 30 + rng() * 200, 18, Math.PI + (rng() - 0.5), rng, BLOOD.dark, 30); }
  }
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}


// ---------- the remaster's gore: tissue that looks like tissue ----------
// intestine: a pink-grey membrane with darker loops of colour, fine branching vessels and fat
function vessels(g, W, H, n, rng, rgb, a, w0) {
  for (let i = 0; i < n; i++) {
    let x = rng() * W, y = rng() * H, ang = rng() * TAU, w = w0 * (0.6 + rng());
    for (let s = 0; s < 14 && w > 0.25; s++) {
      const nx = x + Math.cos(ang) * (6 + rng() * 10), ny = y + Math.sin(ang) * (6 + rng() * 10);
      g.strokeStyle = `rgba(${rgb},${a})`; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      if (rng() < 0.25) { const b = ang + (rng() < 0.5 ? 0.7 : -0.7); let bx = nx, by = ny, bw = w * 0.6; for (let k = 0; k < 5; k++) { const ex = bx + Math.cos(b) * 7, ey = by + Math.sin(b) * 7; g.lineWidth = bw; g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke(); bx = ex; by = ey; bw *= 0.8; } }
      x = nx; y = ny; ang += (rng() - 0.5) * 0.9; w *= 0.9;
    }
  }
}
function gutCanvas(seed) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(seed);
  g.fillStyle = '#a7766d'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 60, 10, 40, '150,62,62', 0.28, rng);
  blotches(g, S, S, 40, 8, 30, '115,86,100', 0.22, rng);
  blotches(g, S, S, 30, 3, 10, '214,190,140', 0.3, rng); // fat
  vessels(g, S, S, 22, rng, '92,12,18', 0.55, 1.6);
  blotches(g, S, S, 14, 6, 22, BLOOD.dark, 0.4, rng);
  speckle(g, S, S, 10, rng);
  return c;
}
function liverCanvas(seed) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(seed);
  g.fillStyle = '#4a1411'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 120, 4, 24, '78,26,22', 0.35, rng);
  blotches(g, S, S, 80, 2, 12, '26,5,5', 0.35, rng);
  speckle(g, S, S, 8, rng);
  return c;
}
function lungCanvas(seed) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(seed);
  g.fillStyle = '#9a6a68'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 50, 10, 34, '130,70,74', 0.3, rng);
  for (let i = 0; i < 420; i++) { g.fillStyle = `rgba(40,22,26,${0.2 + rng() * 0.45})`; blob(g, rng() * S, rng() * S, 0.6 + rng() * 2.2); } // soot in the lobules
  g.strokeStyle = 'rgba(70,40,44,.35)'; g.lineWidth = 0.8;
  for (let i = 0; i < 40; i++) { const x = rng() * S, y = rng() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 30, y + (rng() - 0.5) * 30); g.stroke(); }
  return c;
}
function heartCanvas(seed) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(seed);
  g.fillStyle = '#5e1212'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 160; i++) { g.strokeStyle = `rgba(${90 + rng() * 40 | 0},18,18,${0.25 + rng() * 0.3})`; g.lineWidth = 1 + rng() * 2; const y = rng() * S; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(S * 0.3, y + (rng() - 0.5) * 30, S * 0.6, y + (rng() - 0.5) * 30, S, y + (rng() - 0.5) * 20); g.stroke(); } // muscle fibre
  const fat = g.createLinearGradient(0, 0, 0, S * 0.35); fat.addColorStop(0, 'rgba(206,180,110,.85)'); fat.addColorStop(1, 'rgba(206,180,110,0)');
  g.fillStyle = fat; g.fillRect(0, 0, S, S * 0.35);
  vessels(g, S, S, 6, rng, '40,6,10', 0.6, 2.4);
  return c;
}
function boneCanvas(seed) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(seed);
  g.fillStyle = '#c9bb9f'; g.fillRect(0, 0, S, S);
  streaks(g, S, S, 50, '150,130,100', 0.3, rng, true);
  blotches(g, S, S, 40, 4, 22, '170,150,120', 0.3, rng);
  for (let i = 0; i < 10; i++) smear(g, rng() * S, rng() * S, 10 + rng() * 20, 30 + rng() * 60, rng() * 3, rng, rng() < 0.5 ? BLOOD.dark : BLOOD.dried);
  blotches(g, S, S, 20, 6, 20, BLOOD.fresh, 0.35, rng);
  speckle(g, S, S, 12, rng);
  return c;
}
// the outside of a sawn side: cream fat under a pink membrane, bruising, dried runs of blood, an inspector's stamp
function carcassFatCanvas(seed) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(seed);
  g.fillStyle = '#c4a47e'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 70, 8, 34, '220,196,150', 0.3, rng);
  blotches(g, S, S, 70, 10, 44, '168,92,82', 0.32, rng); // membrane, meat showing through
  blotches(g, S, S, 30, 4, 16, '96,24,18', 0.3, rng); // blood soaked in
  blotches(g, S, S, 12, 6, 18, '110,60,80', 0.25, rng); // bruising
  streaks(g, S, S, 22, '90,20,14', 0.45, rng, true);
  vessels(g, S, S, 8, rng, '150,60,60', 0.3, 1);
  g.save(); g.translate(S * 0.62, S * 0.42); g.rotate(-0.3); // the stamp, in purple ink, smudged
  g.strokeStyle = 'rgba(84,46,120,.6)'; g.lineWidth = 2.2; g.beginPath(); g.ellipse(0, 0, 30, 20, 0, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(84,46,120,.55)'; g.font = 'bold 9px monospace'; g.textAlign = 'center'; g.fillText('HOLLOW PINES', 0, -4); g.fillText('INSP. 47', 0, 8);
  g.restore();
  speckle(g, S, S, 10, rng);
  return c;
}

// a pig's skin, scalded and scraped: pale pink, mottled, the follicles, a scrape or two, the inspector's stamps
function pigSkinCanvas(seed) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(seed);
  g.fillStyle = '#c99c88'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 90, 10, 40, '222,186,166', 0.35, rng);
  blotches(g, S, S, 70, 8, 30, '196,120,108', 0.35, rng); // flushed
  blotches(g, S, S, 40, 14, 50, '160,110,92', 0.25, rng); // grime off the rail
  blotches(g, S, S, 14, 6, 18, '150,92,110', 0.18, rng); // bruising from the rail
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(120,70,60,${0.08 + rng() * 0.18})`; g.fillRect(rng() * S, rng() * S, 0.9, 0.9); } // follicles
  for (let i = 0; i < 10; i++) { // scraper marks
    g.strokeStyle = `rgba(250,226,212,${0.15 + rng() * 0.2})`; g.lineWidth = 2 + rng() * 5; const x = rng() * S, y = rng() * S;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 40, y + 40 + rng() * 60); g.stroke();
  }
  streaks(g, S, S, 6, '120,24,16', 0.3, rng, false);
  for (let k = 0; k < 2; k++) { // the stamps, in purple ink, smudged
    g.save(); g.translate(S * (0.3 + k * 0.4), S * (0.3 + k * 0.35)); g.rotate((rng() - 0.5) * 0.8);
    g.strokeStyle = 'rgba(84,46,120,.55)'; g.lineWidth = 2.2; g.beginPath(); g.ellipse(0, 0, 28, 19, 0, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(84,46,120,.5)'; g.font = 'bold 8px monospace'; g.textAlign = 'center'; g.fillText("INSP'D & P'S'D", 0, -3); g.fillText('EST. 47', 0, 8);
    g.restore();
  }
  speckle(g, S, S, 6, rng);
  return c;
}

function hairCanvas(seed) {
  const S = 256, { c, g } = hq(S, S), rng = makeRng(seed);
  g.fillStyle = '#17110c'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1600; i++) { // strands
    const x = rng() * S, y = rng() * S, len = 10 + rng() * 30, a = Math.PI / 2 + (rng() - 0.5) * 0.5;
    g.strokeStyle = rng() < 0.5 ? `rgba(58,44,32,${0.25 + rng() * 0.4})` : `rgba(4,3,2,${0.3 + rng() * 0.4})`;
    g.lineWidth = 0.5 + rng() * 0.6; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (rng() - 0.5) * 6, y + len / 2, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  blotches(g, S, S, 10, 6, 20, BLOOD.dried, 0.35, rng); // matted
  return c;
}

// ---------- materials ----------
// the remaster's organs, bone and hair. The organ materials themselves are still made where the original makes them
// (organs(), openChest()): these lend them their maps, so nothing is created that the original didn't create
function goreMaterials(phong, tx) {
  const fl = (m, o) => patchFlesh(m, o);
  return {
    gut: fl(phong({ map: tx(gutCanvas(12)), shininess: 120, specular: 0x664444 }, { rough: 0.38, roughClean: 0.16, wet: 0.6, normal: 2.6 })),
    goreLiver: fl(phong({ map: tx(liverCanvas(13)), shininess: 140, specular: 0x884444 }, { fixedRough: 0.14, normal: 1.8 }), { tint: [1, 0.3, 0.25] }),
    goreStomach: fl(phong({ map: tx(gutCanvas(14)), color: 0xd8c0b8, shininess: 110, specular: 0x775555 }, { rough: 0.4, roughClean: 0.2, normal: 2.2 })),
    goreHeart: fl(phong({ map: tx(heartCanvas(15)), shininess: 120, specular: 0x774444 }, { rough: 0.35, roughClean: 0.18, normal: 3 })),
    goreLung: fl(phong({ map: tx(lungCanvas(16)), shininess: 40, specular: 0x553333 }, { rough: 0.55, roughClean: 0.35, normal: 2.4 })),
    bone: phong({ map: tx(boneCanvas(17)), color: 0x9a8c78, shininess: 40, specular: 0x333333 }, { rough: 0.72, roughClean: 0.45, normal: 2.5 }),
    pigSkin: patchFlesh(phong({ map: tx(pigSkinCanvas(23)), shininess: 45, specular: 0x333333 }, { rough: 0.58, roughClean: 0.4, wet: 0.5, normal: 2.2 }), { wrap: 0.3, amount: 0.45, tint: [1, 0.5, 0.4] }),
    hoof: phong({ color: 0x2a2420, shininess: 60, specular: 0x333333 }),
    carcassFat: patchFlesh(phong({ map: tx(carcassFatCanvas(19)), shininess: 50, specular: 0x333333 }, { rough: 0.6, roughClean: 0.32, wet: 0.5, normal: 2.6 }), { wrap: 0.4, amount: 0.55, tint: [1, 0.7, 0.55] }),
    hair: phong({ map: tx(hairCanvas(18)), shininess: 20, specular: 0x222222 }, { rough: 0.92, roughClean: 0.78, wet: 0.3, normal: 3.4 }),
  };
}

export function makeMaterials() {
  const m = makeMaterials0();
  // the remaster: light gets into skin and meat (flesh.js)
  if (TEX.pbr) for (const k of ['meat', 'meatPale', 'flesh', 'skin', 'skinGrey', 'fat']) patchFlesh(m[k], k === 'skin' || k === 'skinGrey' || k === 'fat' ? { wrap: 0.35, amount: 0.5, tint: [1, 0.6, 0.5] } : {});
  return m;
}

function makeMaterials0() {
  const phong = (o, p) => (TEX.pbr ? stdMat(o, p) : new THREE.MeshPhongMaterial(o));
  const tx = (c, rx = 1, ry = 1) => { const t = toTex(c); t.repeat.set(rx, ry); return t; };

  const walls = [];
  for (let gore = 0; gore < 4; gore++) for (let style = 0; style < 3; style++) {
    const t = tx(wallCanvas(gore, style));
    walls.push(phong({ map: t, bumpMap: t, bumpScale: 1.5, shininess: 18, specular: 0x222222 }, WALL_P));
  }
  const floors = [0, 1, 2, 3].map((k) => { const t = tx(floorCanvas(k)); return wetFloor(phong({ map: t, bumpMap: t, bumpScale: 1.2, shininess: k ? 50 : 10, specular: k ? 0x331111 : 0x111111 }, FLOOR_P)); });
  const ceil = phong({ map: tx(ceilingCanvas()), shininess: 4 }, CEIL_P);
  const meatTex = tx(meatCanvas(3));
  const decalOpts = (kind, seed, extra = {}) => ({
    map: decalCanvas(kind, seed), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    color: 0x5c5c5c, shininess: 140, specular: 0x6a2e2a, ...extra, // dark: blood soaks up the torch and only the wet surface shines
  });
  // blood on a surface is a raised, glossy film: relief from the alpha, nearly mirror-smooth
  const decalMat = (kind, seed, extra = {}) => { const o = decalOpts(kind, seed, extra); return TEX.pbr ? stdMat(o, { alphaHeight: true, fixedRough: 0.14 }) : new THREE.MeshPhongMaterial(o); };

  return {
    walls, // [gore*3 + style]
    morgueWalls: [0, 1, 2, 3].map((gore) => { const t = tx(morgueWallCanvas(gore)); return phong({ map: t, bumpMap: t, bumpScale: 1, shininess: 70, specular: 0x556677 }, WALL_P); }),
    frost: phong({ color: 0xcfe0ee, shininess: 90, specular: 0x8899aa }),
    floors,
    ceil,
    meat: phong({ map: meatTex, shininess: 70, specular: 0x552222 }, { rough: 0.55, roughClean: 0.28, wet: 0.5, normal: 3 }),
    meatPale: phong({ map: tx(meatCanvas(8, true)), shininess: 40, specular: 0x332222 }, { rough: 0.6, roughClean: 0.35, wet: 0.5 }),
    gut: phong({ color: 0x8e4844, map: tx(meatCanvas(12, true)), shininess: 130, specular: 0x7a4a46 }, { fixedRough: 0.18 }),
    blood: phong({ color: 0x2a0000, shininess: 120, specular: 0x662222 }, { fixedRough: 0.1 }),
    bone: lamb({ color: 0xd9ceb2 }),
    skin: phong({ map: tx(skinCanvas(21)), shininess: 12, specular: 0x111111 }, { rough: 0.7, roughClean: 0.5, normal: 2 }),
    skinGrey: phong({ map: tx(skinCanvas(22, [140, 140, 125])), shininess: 12, specular: 0x111111 }),
    fat: phong({ map: tx(skinCanvas(23, [214, 184, 160])), shininess: 30, specular: 0x222222 }),
    mask: phong({ map: tx(maskCanvas()), shininess: 8 }),
    flesh: phong({ map: tx(meatCanvas(31)), shininess: 80, specular: 0x552222 }),
    apron: phong({ map: tx(clothCanvas(41, '#3a2a1e', 10)), shininess: 40, specular: 0x221111 }, { rough: 0.8, roughClean: 0.45, wet: 0.7 }),
    coverall: phong({ map: tx(clothCanvas(42, '#2c3440', 4)), shininess: 6 }),
    coverall2: phong({ map: tx(clothCanvas(43, '#4a4232', 5)), shininess: 6 }),
    sheet: phong({ map: tx(clothCanvas(44, '#bdb8aa', 3)), shininess: 6 }),
    bag: phong({ color: 0x0b0b0c, shininess: 90, specular: 0x444444 }, { fixedRough: 0.28 }),
    steel: phong({ map: tx(steelCanvas()), shininess: 70, specular: 0x777777 }, { metal: 0.9, metalByLum: true, rough: 0.6, roughClean: 0.32, normal: 2 }),
    darkMetal: phong({ color: 0x2a2826, shininess: 40, specular: 0x333333 }, { metal: 0.8, fixedRough: 0.5 }),
    chain: phong({ color: 0x3a3330, shininess: 60, specular: 0x555555 }, { metal: 0.85, fixedRough: 0.4 }),
    rust: [0, 1, 2].map((i) => phong({ map: tx(rustCanvas(61 + i, ['#3e4a3c', '#3c4450', '#4f4636'][i])), shininess: 20, specular: 0x222222 }, { metal: 0.45, metalByLum: true, rough: 0.9, roughClean: 0.55, normal: 3 })),
    lockerPaint: TEX.pbr ? [0, 1, 2].map((i) => phong({ map: tx(lockerCanvas(71 + i, ['#3e4a3c', '#3c4450', '#4f4636'][i])), shininess: 25, specular: 0x333333 }, { metal: 0.25, metalByLum: true, rough: 0.85, roughClean: 0.45, normal: 3.2 })) : null,
    brass: phong({ color: 0xb08a3a, emissive: 0x2a1a04, shininess: 100, specular: 0xffdd88 }, { metal: 1, fixedRough: 0.3 }),
    lampOn: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf2f6e8).multiplyScalar(TEX.pbr ? 9 : 1) }), // remastered: HDR, so the tube blooms
    lampOff: lamb({ color: 0x2a2a28 }),
    eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a10).multiplyScalar(TEX.pbr ? 7 : 1), fog: false }), // remastered: his eyes bloom
    black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    tooth: lamb({ color: 0x9c8a62 }),
    ...(TEX.pbr ? goreMaterials(phong, tx) : {}),
    pool: [decalMat('pool', 1), decalMat('pool', 2), decalMat('pool', 3)].map(wetFloor),
    splat: [decalMat('splat', 4), decalMat('splat', 5), decalMat('splat', 6), decalMat('splat', 7)],
    drag: wetFloor(decalMat('drag', 8)),
  };
}
