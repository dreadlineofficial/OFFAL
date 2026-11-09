// OFFAL: REMASTERED's "three": the real three.js, except that in the Remastered look the old shading models the game
// creates all over the place (MeshPhongMaterial, MeshLambertMaterial) are physically based materials that take the
// same parameters. Shininess and specular become a roughness. Classic gets the real classes, so it renders exactly
// as the original. The look is read here, at load, the same way main.js reads it (a Look change reloads the page).
import * as T from '../../vendor/three/build/three.module.min.js';
import { derivePBR } from './pbr.js';

export * from '../../vendor/three/build/three.module.min.js';

// every painted surface in the game is a 2D canvas, and every one must live in ordinary memory, not on the GPU:
// a GPU-backed canvas can be blanked by the browser (memory pressure, a driver reset), and the next upload of it
// is a black or see-through texture (walls going dark, normal/AO maps zeroed); reading one back to derive its
// PBR maps also stalled each floor's build for seconds (getImageData waits on the GPU). Set before anything paints
try {
  const P = HTMLCanvasElement.prototype, get = P.getContext;
  P.getContext = function (type, opts) {
    return type === '2d' ? get.call(this, type, { ...(opts || {}), willReadFrequently: true }) : get.call(this, type, opts);
  };
  if (globalThis.OffscreenCanvas) {
    const O = OffscreenCanvas.prototype, oget = O.getContext;
    O.getContext = function (type, opts) { return type === '2d' ? oget.call(this, type, { ...(opts || {}), willReadFrequently: true }) : oget.call(this, type, opts); };
  }
} catch {}

// the game's renderer, for things that photograph a little scene of their own (the family photo keepsake)
export const studio = {};

// Settings, Less gore: read wherever gore is made (props, level, death films); set by main.js applySettings
export const gore = { less: false };

export const REMASTERED = (() => {
  try {
    const q = new URLSearchParams(window.location.search).get('look');
    if (q === 'classic' || q === 'remastered') return q !== 'classic';
    const s = JSON.parse(localStorage.getItem('offalr-save-v1') || localStorage.getItem('offal-save-v1'));
    return !(s && s.settings && s.settings.look === 'classic');
  } catch { return true; }
})();

// fog: the remaster's exposure and gamma would lift the last 0.3% the fog leaves of a far wall into sight, and rooms
// would pop at the far plane (read as textures vanishing). The fog closes to solid black by 2.35 / density
if (REMASTERED) T.ShaderChunk.fog_fragment = T.ShaderChunk.fog_fragment.replace(
  'float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',
  'float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );\n\tfogFactor = max( fogFactor, smoothstep( 1.85, 2.35, fogDensity * vFogDepth ) );');

// the remaster's own objects draw their ids (and anything random) from their own stream: three.js makes every object's
// uuid with Math.random, and the game's own rolls (which locker holds a body) must come out exactly as the original's
let ownSeed = 0x2545f491;
const ownRng = () => { ownSeed = (Math.imul(ownSeed, 1103515245) + 12345) >>> 0; return ownSeed / 4294967296; };
export function ownRandom(fn) {
  const keep = Math.random;
  Math.random = ownRng;
  try { return fn(); } finally { Math.random = keep; }
}

const roughFrom = (shininess = 30, specular = 0x111111) => {
  const sp = new T.Color(specular), gloss = shininess * (0.6 + ((sp.r + sp.g + sp.b) / 3) * 1.6);
  return Math.max(0.12, Math.min(0.95, 0.95 - gloss * 0.0065));
};

// a painted surface (its map doubles as its bump map) gets a real normal map and a roughness map from its own canvas
const derived = new WeakMap();
function surfaceMaps(map, bumpScale, rough) {
  if (derived.has(map)) return derived.get(map);
  return ownRandom(() => {
  const img = map.image;
  let out = null;
  if (img && img.getContext && img.width >= 32) {
    const r = derivePBR(img, { normal: 2.2 + (bumpScale ?? 1) * 1.1, rough: Math.min(0.97, rough + 0.12), roughClean: Math.max(0.1, rough - 0.12), wet: 0.9, cavity: 0.5, seed: map.id + 11 });
    const lin = (c) => { const t = new T.CanvasTexture(c); t.wrapS = map.wrapS; t.wrapT = map.wrapT; t.repeat.copy(map.repeat); t.anisotropy = 8; return t; };
    out = { normal: lin(r.normal), orm: lin(r.orm) };
    map.needsUpdate = true;
    map.anisotropy = 8;
  }
  derived.set(map, out);
  return out;
  });
}

class PhongPBR extends T.MeshStandardMaterial {
  constructor(p = {}) {
    const { shininess, specular, combine, reflectivity, refractionRatio, specularMap, ...rest } = p;
    const roughness = roughFrom(shininess, specular);
    const sm = rest.map && rest.bumpMap === rest.map ? surfaceMaps(rest.map, rest.bumpScale, roughness) : null;
    if (sm) { delete rest.bumpMap; delete rest.bumpScale; Object.assign(rest, { normalMap: sm.normal, roughnessMap: sm.orm, aoMap: sm.orm }); }
    super({ roughness: sm ? 1 : roughness, metalness: 0, ...rest });
    this.specular = new T.Color(specular ?? 0x111111); // kept so nothing that sets it breaks; not used for shading
    this.shininess = shininess ?? 30;
  }
}
class LambertPBR extends T.MeshStandardMaterial {
  constructor(p = {}) {
    const { combine, reflectivity, refractionRatio, specularMap, ...rest } = p;
    super({ roughness: 0.9, metalness: 0, ...rest });
  }
}

export const MeshPhongMaterial = REMASTERED ? PhongPBR : T.MeshPhongMaterial;
export const MeshLambertMaterial = REMASTERED ? LambertPBR : T.MeshLambertMaterial;
