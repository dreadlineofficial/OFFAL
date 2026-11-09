// OFFAL: REMASTERED surface maps. Every texture in the game is still painted in code; this turns a painted albedo
// canvas into the rest of a PBR set: a tangent-space normal map (Sobel over the painted height, plus a fine grain so
// close-ups never go soft), a packed ORM map (R ambient occlusion, G roughness, B metalness) and a cavity-darkened
// albedo. Blood and wet paint come out glossy, dust and grout come out rough, without hand-painting a map per texture.
import { makeRng } from './rng.js';

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// separable box blur with wrap-around (the textures tile)
function blur(src, w, h, r) {
  if (r < 1) return src;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), n = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let k = -r; k <= r; k++) s += src[row + ((k + w) % w)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / n;
      s += src[row + ((x + r + 1) % w)] - src[row + ((x - r + w) % w)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[((k + h) % h) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[((y + r + 1) % h) * w + x] - tmp[((y - r + h) % h) * w + x];
    }
  }
  return out;
}

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/**
 * @param src  the painted albedo canvas (modified in place: cavity darkening and grain are baked into it)
 * @param o    normal: relief strength; rough/roughClean: roughness of dirt and of clean surface; wet: how much red/dark
 *             stains gloss up; metal: metalness; micro: grain amplitude; cavity: how hard crevices darken; seed
 * @returns {{normal: HTMLCanvasElement, orm: HTMLCanvasElement}}
 */
export function derivePBR(src, o = {}) {
  const w = src.width, h = src.height, g = src.getContext('2d', { willReadFrequently: true });
  const id = g.getImageData(0, 0, w, h), d = id.data, N = w * h;
  const rng = makeRng(o.seed ?? 7);
  const strength = o.normal ?? 3, micro = o.micro ?? 0.05, cavity = o.cavity ?? 0.5;
  const lum = new Float32Array(N), red = new Float32Array(N);
  let redMean = 0;
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const r = d[p] / 255, gg = d[p + 1] / 255, b = d[p + 2] / 255;
    lum[i] = 0.299 * r + 0.587 * gg + 0.114 * b;
    red[i] = clamp((r - Math.max(gg, b)) * 4);
    redMean += red[i];
  }
  // wet is redder than the surface around it: on flesh or meat (red all over) only the blood on it shines
  redMean /= N;
  if (redMean > 0.15) for (let i = 0; i < N; i++) red[i] = clamp((red[i] - redMean) * 2.5);
  // height: the painting itself, softened a touch, plus grain at the pixel scale and a little at twice that
  const hgt = blur(lum, w, h, 1);
  // a film of blood or paint over a surface: the relief is its alpha, not its colour
  if (o.alphaHeight) for (let i = 0; i < N; i++) hgt[i] = d[i * 4 + 3] / 255 * 0.8 + lum[i] * 0.15;
  else for (let i = 0; i < N; i++) hgt[i] += (rng() - 0.5) * micro;
  const hs = blur(hgt, w, h, 1); // a second, coarser grain layer
  if (!o.alphaHeight) for (let i = 0; i < N; i++) hgt[i] = hgt[i] * 0.6 + hs[i] * 0.4 + (rng() - 0.5) * micro * 0.5;

  const nc = mk(w, h), ng = nc.getContext('2d'), nid = ng.createImageData(w, h), nd = nid.data;
  const oc = mk(w, h), og = oc.getContext('2d'), oid = og.createImageData(w, h), od = oid.data;
  const bigBlur = blur(lum, w, h, Math.max(2, Math.round(w / 64)));
  // wet patches: a soft low-frequency field, thresholded; glossy and a little darker, with the relief flattened under them
  let puddle = null;
  if (o.puddles) {
    const f = new Float32Array(N);
    for (let i = 0; i < N; i++) f[i] = rng();
    let pf = blur(blur(f, w, h, Math.max(3, Math.round(w / 20))), w, h, Math.max(2, Math.round(w / 40)));
    let lo = 1, hi = 0;
    for (let i = 0; i < N; i++) { if (pf[i] < lo) lo = pf[i]; if (pf[i] > hi) hi = pf[i]; }
    puddle = new Float32Array(N);
    const cut = 1 - o.puddles;
    for (let i = 0; i < N; i++) puddle[i] = smooth(cut - 0.07, cut + 0.07, (pf[i] - lo) / (hi - lo + 1e-6));
    for (let i = 0; i < N; i++) hgt[i] = hgt[i] * (1 - puddle[i] * 0.85) + 0.5 * puddle[i] * 0.85;
  }
  const dirty = o.rough ?? 0.92, clean = o.roughClean ?? 0.6, wet = o.wet ?? 0.9, metal = o.metal ?? 0;
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w, yp = ((y + 1) % h) * w, yr = y * w;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w, xp = (x + 1) % w, i = yr + x, p = i * 4;
      const dx = (hgt[yr + xp] - hgt[yr + xm]) * strength, dy = (hgt[yp + x] - hgt[ym + x]) * strength;
      const il = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      nd[p] = (-dx * il * 0.5 + 0.5) * 255;
      nd[p + 1] = (dy * il * 0.5 + 0.5) * 255;
      nd[p + 2] = (il * 0.5 + 0.5) * 255;
      nd[p + 3] = 255;
      // cavities (darker than their surroundings) get less ambient light and a little less albedo
      const cav = clamp(1 - (bigBlur[i] - lum[i]) * 2.4 * cavity * 2, 0.45, 1);
      let rough = dirty + (clean - dirty) * smooth(0.22, 0.7, lum[i]);
      rough += (rng() - 0.5) * 0.08;
      // blood and wet paint: red, or very dark and red-leaning
      const wetness = Math.max(red[i], (lum[i] < 0.12 ? 0.35 : 0) * (d[p] > d[p + 2] ? 1 : 0)) * wet;
      rough = rough + (0.1 - rough) * wetness;
      if (puddle) { rough = rough + (0.05 - rough) * puddle[i]; }
      if (o.fixedRough !== undefined) rough = o.fixedRough;
      od[p] = cav * 255;
      od[p + 1] = clamp(rough, 0.04, 1) * 255;
      od[p + 2] = metal * 255 * (o.metalByLum ? smooth(0.15, 0.6, lum[i]) : 1);
      od[p + 3] = 255;
      if (!o.alphaHeight) { const k = (0.78 + 0.22 * cav) * (puddle ? 1 - puddle[i] * 0.15 : 1); d[p] *= k; d[p + 1] *= k; d[p + 2] *= k; }
    }
  }
  ng.putImageData(nid, 0, 0);
  og.putImageData(oid, 0, 0);
  g.putImageData(id, 0, 0);
  return { normal: nc, orm: oc };
}
