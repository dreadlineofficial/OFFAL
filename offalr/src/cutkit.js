// The death films' kit (OFFAL: REMASTERED): organs that look like organs, eyes, a body cut in two along a plane
// (two clipped copies, solid red where they're cut), the flayed body under the skin, flames that cling to a body,
// the Foreman's shotgun, a meat tray with film and a label, and the car in the yard.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let seed = 91;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
function vnoise(x, y, z) {
  const h = (i, j, k) => { let t = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 2147483647); t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(i, j, k), h(i + 1, j, k), sx), l(h(i, j + 1, k), h(i + 1, j + 1, k), sx), sy), l(l(h(i, j, k + 1), h(i + 1, j, k + 1), sx), l(h(i, j + 1, k + 1), h(i + 1, j + 1, k + 1), sx), sy), sz) * 2 - 1;
}
// push every vertex out along its normal by a little noise: organs are never smooth spheres
function lumpy(g, amp, freq) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), d = vnoise(x * freq, y * freq, z * freq) * amp + vnoise(x * freq * 2.3 + 7, y * freq * 2.3, z * freq * 2.3) * amp * 0.4;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  g.computeVertexNormals();
  return g;
}
const mesh = (g, m, cast = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; return o; };
const M = (mats, k, f) => mats[k] || mats[f] || mats.meat;

// ---------- organs ----------
export function heart(mats) {
  const g = new THREE.Group();
  const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(Math.sin(t * Math.PI) * 0.055 * (1 - t * 0.35) + 0.004, -0.06 + t * 0.12)); }
  const body = mesh(lumpy(new THREE.LatheGeometry(pts, 24), 0.005, 30), M(mats, 'goreHeart', 'meat'));
  body.rotation.z = 0.35; g.add(body);
  const vessel = M(mats, 'goreHeart', 'meat');
  const aorta = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.01, 0.05, 0), V(0.02, 0.1, 0), V(-0.025, 0.12, 0), V(-0.05, 0.08, 0)]), 16, 0.014, 10), vessel); g.add(aorta);
  for (const [x, z] of [[0.03, 0.02], [-0.01, -0.025]]) g.add(mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.05, 10), vessel).translateX(x).translateY(0.08).translateZ(z));
  const fat = mesh(lumpy(new THREE.SphereGeometry(0.03, 12, 8), 0.004, 40), M(mats, 'carcassFat', 'fat')); fat.position.set(0.01, 0.04, 0.03); fat.scale.set(1.3, 0.5, 0.6); g.add(fat);
  return g;
}
export function liver(mats) {
  const g = new THREE.Group(), mt = M(mats, 'goreLiver', 'meat');
  const a = mesh(lumpy(new THREE.SphereGeometry(1, 28, 18), 0.04, 3), mt); a.scale.set(0.12, 0.045, 0.08); g.add(a);
  const b = mesh(lumpy(new THREE.SphereGeometry(1, 24, 16), 0.04, 3), mt); b.scale.set(0.075, 0.038, 0.06); b.position.set(-0.1, -0.004, 0.03); g.add(b);
  return g;
}
export function lung(mats) {
  const g = new THREE.Group();
  const l = mesh(lumpy(new THREE.SphereGeometry(1, 28, 20), 0.06, 4), M(mats, 'goreLung', 'meatPale')); l.scale.set(0.06, 0.12, 0.05); g.add(l);
  const br = mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.06, 10), M(mats, 'bone', 'meatPale')); br.position.set(0.035, 0.1, 0); br.rotation.z = 0.6; g.add(br);
  return g;
}
export function stomach(mats) {
  const g = new THREE.Group();
  const s = mesh(lumpy(new THREE.TorusGeometry(0.055, 0.036, 16, 28, Math.PI * 1.3), 0.004, 30), M(mats, 'goreStomach', 'gut'));
  s.rotation.z = 0.4; g.add(s);
  return g;
}
export function kidney(mats) {
  const g = new THREE.Group();
  const k = mesh(lumpy(new THREE.SphereGeometry(1, 20, 14), 0.06, 5), M(mats, 'goreLiver', 'meat')); k.scale.set(0.034, 0.055, 0.024); g.add(k);
  const fat = mesh(lumpy(new THREE.SphereGeometry(0.022, 10, 8), 0.004, 40), M(mats, 'carcassFat', 'fat')); fat.position.set(0.022, 0, 0); g.add(fat);
  return g;
}
// a coil of bowel, heaped
export function guts(mats, r = 0.12, turns = 7) {
  const pts = [];
  for (let i = 0; i <= turns * 12; i++) { const a = i / 12 * Math.PI * 2 * 0.6 + rnd() * 0.3, rr = r * (0.4 + 0.6 * ((i * 37) % 11) / 11); pts.push(V(Math.cos(a) * rr, 0.03 + (i % 5) * 0.012 + rnd() * 0.01, Math.sin(a) * rr)); }
  const curve = new THREE.CatmullRomCurve3(pts), n = pts.length * 4, rs = 10, tg = new THREE.TubeGeometry(curve, n, 0.022, rs, false);
  const p = tg.attributes.position, c = V(0, 0, 0), q = V(0, 0, 0);
  for (let i = 0; i <= n; i++) { curve.getPointAt(i / n, c); const b = 0.75 + 0.35 * Math.abs(Math.sin(i * 0.8)); for (let j = 0; j <= rs; j++) { const v = i * (rs + 1) + j; q.fromBufferAttribute(p, v).sub(c).multiplyScalar(b).add(c); p.setXYZ(v, q.x, q.y, q.z); } }
  tg.computeVertexNormals();
  return mesh(tg, M(mats, 'gut', 'meat'));
}
// an eye, out of its socket: veined white, a brown iris, a black pupil, a tail of nerve
let eyeTex = null;
export function eyeball(mats) {
  if (!eyeTex) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#e8e2d6'; g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(170,30,24,${0.25 + rnd() * 0.4})`; g.lineWidth = 0.6 + rnd(); g.beginPath(); let x = rnd() * 256, y = rnd() < 0.5 ? 0 : 128; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 30; y += (y < 64 ? 1 : -1) * (6 + rnd() * 8); g.lineTo(x, y); } g.stroke(); }
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 26); gr.addColorStop(0, '#2a1a10'); gr.addColorStop(0.35, '#5a3a1e'); gr.addColorStop(0.9, '#3a2614'); gr.addColorStop(1, 'rgba(40,30,20,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(64, 64, 26, 30, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#050505'; g.beginPath(); g.ellipse(64, 64, 9, 10, 0, 0, Math.PI * 2); g.fill();
    eyeTex = new THREE.CanvasTexture(c); eyeTex.colorSpace = THREE.SRGBColorSpace;
  }
  const g = new THREE.Group();
  const e = mesh(new THREE.SphereGeometry(0.012, 24, 16), new THREE.MeshStandardMaterial({ map: eyeTex, roughness: 0.15 }));
  e.rotation.y = -Math.PI / 2; g.add(e);
  const nerve = mesh(new THREE.ConeGeometry(0.004, 0.03, 8), M(mats, 'goreHeart', 'meat')); nerve.rotation.z = Math.PI / 2; nerve.position.x = -0.022; g.add(nerve);
  return g;
}
// a skin, peeled off whole and dropped: a crumpled heap, raw red where it was inside
export function skinHeap(mats) {
  const g = new THREE.Group();
  const outer = mats.skin.clone(); outer.color = new THREE.Color(0xc89a88);
  const a = mesh(lumpy(new THREE.SphereGeometry(0.2, 32, 20), 0.07, 8), outer); a.scale.set(1.5, 0.32, 1.0); g.add(a);
  const b = mesh(lumpy(new THREE.SphereGeometry(0.12, 24, 16), 0.05, 10), outer); b.scale.set(1.2, 0.5, 0.8); b.position.set(0.18, 0.03, 0.08); g.add(b);
  const raw = mesh(lumpy(new THREE.SphereGeometry(0.14, 20, 14), 0.05, 9), mats.meat); raw.scale.set(1.3, 0.25, 0.8); raw.position.set(-0.08, 0.02, -0.05); g.add(raw);
  return g;
}
export function organSet(mats) { return [heart(mats), liver(mats), lung(mats), lung(mats), stomach(mats), kidney(mats), kidney(mats)]; }

// ---------- a body cut along a plane ----------
// Two copies of the body (they share its pose: call sync() each frame after posing the original), each clipped to
// one side of a plane given in the body's own space, and solid dark red where they're cut. The original is hidden.
const CUT_RED = () => new THREE.MeshStandardMaterial({ color: 0x3a0503, roughness: 0.4, side: THREE.BackSide });
export function splitBody(body, normal, constant) {
  const make = (sign) => {
    const copy = body.root.clone(true), local = new THREE.Plane(normal.clone().multiplyScalar(sign), constant * sign), plane = local.clone();
    const meshes = []; copy.traverse((o) => { if (o.isMesh) meshes.push(o); });
    meshes.forEach((o) => {
      const clip = (m) => Object.assign(m.clone(), { clippingPlanes: [plane] });
      o.material = Array.isArray(o.material) ? o.material.map(clip) : clip(o.material);
      const inside = new THREE.Mesh(o.geometry, Object.assign(CUT_RED(), { clippingPlanes: [plane] })); inside.userData.cut = true; o.add(inside);
    });
    const nodes = []; copy.traverse((o) => { if (!o.userData.cut) nodes.push(o); });
    const holder = new THREE.Group(), inner = new THREE.Group(); holder.add(inner);
    return { copy, local, plane, nodes, holder, inner };
  };
  const src = []; body.root.traverse((o) => src.push(o));
  const a = make(1), b = make(-1);
  for (const h of [a, b]) h.inner.add(h.copy);
  return {
    a, b,
    // where the halves turn about (in the world): their holders sit there and move from there
    pivot(p) { for (const h of [a, b]) { h.holder.position.copy(p); h.inner.position.copy(p).negate(); h.base = p.clone(); } },
    // copy the original's pose into both halves; each half sits in its holder (moved and turned freely)
    sync() {
      for (const h of [a, b]) {
        for (let i = 0; i < h.nodes.length; i++) { const s = src[i], d = h.nodes[i]; if (s && d) { d.position.copy(s.position); d.quaternion.copy(s.quaternion); d.scale.copy(s.scale); } }
        h.holder.updateMatrixWorld(true);
        h.plane.copy(h.local).applyMatrix4(h.copy.matrixWorld);
      }
    },
  };
}

// ---------- flames on a body ----------
let flameTex = null;
export class BodyFire {
  constructor(scene, root) {
    if (!flameTex) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 92, 2, 32, 80, 46); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.3, 'rgba(255,170,60,0.9)'); gr.addColorStop(0.7, 'rgba(200,60,10,0.45)'); gr.addColorStop(1, 'rgba(80,10,0,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(32, 80, 26, 46, 0, 0, Math.PI * 2); g.fill();
      flameTex = new THREE.CanvasTexture(c);
    }
    this.parts = []; root.traverse((o) => { if (o.isMesh && !o.userData.cut && o.geometry.attributes.position) this.parts.push(o); });
    this.sprites = [];
    for (let i = 0; i < 170; i++) {
      // each lick of flame sits on a point of the body's surface (a vertex of one of its parts), not at a part's centre
      const part = this.parts[(rnd() * this.parts.length) | 0], pos = part.geometry.attributes.position, vi = (rnd() * pos.count) | 0;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: new THREE.Color().setHSL(0.06 + rnd() * 0.04, 1, 0.55) }));
      s.userData = { part, local: V(pos.getX(vi), pos.getY(vi), pos.getZ(vi)), ph: rnd() * 6, life: rnd(), k: 0.6 + rnd() * 0.8 };
      s.visible = false; scene.add(s); this.sprites.push(s);
    }
    this.light = new THREE.PointLight(0xff7a2a, 0, 10, 1.4); scene.add(this.light);
    this.amount = 0; this.t = 0;
  }
  // amount: 0..1, how much of him is burning (from the feet up)
  update(dt, centre) {
    this.t += dt;
    const p = V(0, 0, 0);
    let lowest = Infinity, highest = -Infinity;
    for (const s of this.sprites) { s.userData.part.localToWorld(p.copy(s.userData.local)); s.userData.at = s.userData.at || V(); s.userData.at.copy(p); lowest = Math.min(lowest, p.y); highest = Math.max(highest, p.y); }
    const reach = lowest + (highest - lowest + 0.3) * this.amount;
    for (const s of this.sprites) {
      const u = s.userData;
      u.life += dt * 2.4 * u.k; if (u.life > 1) u.life -= 1;
      s.visible = this.amount > 0.01 && u.at.y <= reach && u.part.visible;
      s.position.copy(u.at).add(V(Math.sin(this.t * 7 + u.ph) * 0.02, u.life * 0.22, 0));
      const sc = (0.1 + 0.12 * u.k) * Math.sin(u.life * Math.PI) * (0.5 + 0.5 * this.amount);
      s.scale.set(sc * 0.55, sc * 1.3, 1);
      s.material.opacity = 0.75 * Math.sin(u.life * Math.PI);
    }
    if (centre) this.light.position.copy(centre).add(V(0, 0.5, 0));
    this.light.intensity = this.amount * (18 + Math.sin(this.t * 23) * 4 + Math.sin(this.t * 7.3) * 3);
  }
  dispose() { for (const s of this.sprites) s.parent && s.parent.remove(s); }
}

// ---------- the shotgun ----------
export function shotgun(mats) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.35, metalness: 1 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a2a16, roughness: 0.55 });
  for (const x of [-0.013, 0.013]) { const b = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 14), steel); b.rotation.x = Math.PI / 2; b.position.set(x, 0, -0.3); g.add(b); }
  const rib = mesh(new THREE.BoxGeometry(0.008, 0.006, 0.6), steel); rib.position.set(0, 0.013, -0.3); g.add(rib);
  const fore = mesh(new THREE.BoxGeometry(0.045, 0.035, 0.22), wood); fore.position.set(0, -0.022, -0.22); g.add(fore);
  const recv = mesh(new THREE.BoxGeometry(0.05, 0.06, 0.12), steel); recv.position.set(0, -0.01, 0.04); g.add(recv);
  const grip = mesh(new THREE.BoxGeometry(0.04, 0.05, 0.14), wood); grip.position.set(0, -0.035, 0.15); grip.rotation.x = 0.35; g.add(grip);
  const stock = mesh(new THREE.BoxGeometry(0.045, 0.1, 0.26), wood); stock.position.set(0, -0.07, 0.33); stock.rotation.x = 0.12; g.add(stock);
  const trig = mesh(new THREE.TorusGeometry(0.018, 0.003, 6, 12, Math.PI), steel); trig.position.set(0, -0.045, 0.08); g.add(trig);
  return g;
}

// ---------- a tray of meat for the shelf ----------
let labelN = 0;
export function packTray(mats, w = 0.26, d = 0.18) {
  const g = new THREE.Group();
  const foam = mesh(new THREE.BoxGeometry(w, 0.025, d), new THREE.MeshStandardMaterial({ color: 0xe6e6e0, roughness: 0.9 }));
  foam.position.y = 0.0125; g.add(foam);
  const pad = mesh(new THREE.BoxGeometry(w * 0.8, 0.004, d * 0.8), new THREE.MeshStandardMaterial({ color: 0xd8c8c0, roughness: 0.8 })); pad.position.y = 0.027; g.add(pad);
  // the film: clear, with a sheen, stretched tight over whatever's on the tray
  const film = mesh(new THREE.BoxGeometry(w * 1.01, 0.09, d * 1.01), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, transmission: 0, transparent: true, opacity: 0.22, depthWrite: false }), false);
  film.position.y = 0.05; film.visible = false; g.add(film);
  // the label: price, weight, the plant's name
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#f2efe4'; x.fillRect(0, 0, 256, 128); x.fillStyle = '#8a1a10'; x.fillRect(0, 0, 256, 26);
  x.fillStyle = '#fff'; x.font = 'bold 18px sans-serif'; x.fillText('HOLLOW PINES', 10, 19);
  x.fillStyle = '#222'; x.font = 'bold 22px monospace'; x.fillText(['HEART', 'LIVER', 'LUNG', 'KIDNEY', 'MIXED OFFAL'][labelN++ % 5], 10, 56);
  x.font = '16px monospace'; x.fillText(`NET ${(0.3 + (labelN * 0.37) % 1.2).toFixed(2)} kg`, 10, 82); x.fillText('PACKED 06:12  USE BY —', 10, 104);
  for (let i = 0; i < 26; i++) x.fillRect(170 + i * 3, 36 + (i % 3), i % 2 ? 1 : 2, 70);
  const lab = mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: 0.6 }), false);
  lab.rotation.x = -Math.PI / 2; lab.position.set(w * 0.22, 0.096, d * 0.18); lab.visible = false; g.add(lab);
  g.userData = { film, label: lab };
  return g;
}

// ---------- the car ----------
// a tired 80s saloon: one body from a side profile, bevelled; the glasshouse inset; chrome bumpers and trim; real
// wheels (tyre, rim, spokes, hub); lights that light; the dust and rust of a car parked in a meat plant's yard
export function car(color = 0x5a2420) {
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#' + new THREE.Color(color).getHexString(); x.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(${120 + rnd() * 50 | 0},${100 + rnd() * 40 | 0},80,${rnd() * 0.12})`; x.beginPath(); x.ellipse(rnd() * 512, 150 + rnd() * 106, 4 + rnd() * 30, 2 + rnd() * 10, 0, 0, Math.PI * 2); x.fill(); } // road dirt up the sills
  for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(110,52,24,${0.3 + rnd() * 0.4})`; x.beginPath(); x.arc(rnd() * 512, 200 + rnd() * 56, 2 + rnd() * 7, 0, Math.PI * 2); x.fill(); } // rust
  const paintTex = new THREE.CanvasTexture(c); paintTex.colorSpace = THREE.SRGBColorSpace;
  const paint = new THREE.MeshPhysicalMaterial({ map: paintTex, roughness: 0.38, metalness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.15, metalness: 1 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0e0f10, roughness: 0.7 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x141a20, roughness: 0.05, metalness: 0.2, clearcoat: 1 });
  // the body: a side profile (x along the car, y up), extruded across it
  const L = 4.4, W = 1.72;
  const sh = new THREE.Shape();
  sh.moveTo(-2.2, 0.32); sh.lineTo(-2.22, 0.62); sh.quadraticCurveTo(-2.2, 0.78, -2.0, 0.8); // the front, under the bumper to the hood's lip
  sh.lineTo(-0.85, 0.88); // the hood
  sh.lineTo(-0.3, 1.32); // the windscreen
  sh.quadraticCurveTo(-0.2, 1.38, 0.1, 1.38); sh.lineTo(0.85, 1.36); // the roof
  sh.lineTo(1.35, 0.98); // the rear screen
  sh.lineTo(2.1, 0.94); sh.quadraticCurveTo(2.22, 0.92, 2.22, 0.8); sh.lineTo(2.2, 0.32); // the boot and the tail
  sh.lineTo(1.75, 0.32); sh.absarc(1.35, 0.32, 0.4, 0, Math.PI, false); // the rear arch
  sh.lineTo(-0.95, 0.32); sh.absarc(-1.35, 0.32, 0.4, 0, Math.PI, false); // the front arch
  sh.lineTo(-2.2, 0.32);
  const bg = new THREE.ExtrudeGeometry(sh, { depth: W - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 4, curveSegments: 20 });
  bg.translate(0, 0, -(W - 0.12) / 2);
  // taper the glasshouse inward above the waist line, as a real car's is
  const bp = bg.attributes.position;
  for (let i = 0; i < bp.count; i++) { const y = bp.getY(i); if (y > 0.92) bp.setZ(i, bp.getZ(i) * (1 - (y - 0.92) * 0.32)); }
  bg.computeVertexNormals();
  const body = mesh(bg, paint); g.add(body);
  // windows: dark glass set just proud of the body on both sides, and the screens front and back
  const win = (pts, side) => { const s = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))); const m = mesh(new THREE.ShapeGeometry(s), glass, false); m.position.z = side * (W / 2 - 0.08 - 0.02); if (side < 0) m.rotation.y = Math.PI, m.scale.x = -1; return m; };
  for (const sd of [-1, 1]) {
    g.add(win([[-0.7, 0.94], [-0.3, 1.27], [0.32, 1.3], [0.32, 0.94]], sd));
    g.add(win([[0.4, 0.94], [0.4, 1.3], [0.82, 1.3], [1.2, 0.97]], sd));
  }
  const screen = (x0, y0, x1, y1) => { const len = Math.hypot(x1 - x0, y1 - y0), m = mesh(new THREE.PlaneGeometry(W - 0.32, len * 0.9), glass, false); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); m.rotation.set(0, (x1 > x0 ? -1 : 1) * Math.PI / 2, 0); m.rotateX(-Math.atan2(y1 - y0, Math.abs(x1 - x0)) + Math.PI / 2 * 0); return m; };
  const ws = screen(-0.84, 0.9, -0.31, 1.31); ws.lookAt(-3, 1.6, 0); ws.position.x -= 0.03; g.add(ws);
  const rs = screen(1.33, 0.99, 0.86, 1.34); rs.lookAt(3, 1.8, 0); rs.position.x += 0.03; g.add(rs);
  // chrome bumpers, a grille, lamps, the plate
  for (const sx of [-1, 1]) { const b = mesh(new THREE.BoxGeometry(0.12, 0.14, W + 0.04), chrome); b.position.set(sx * 2.25, 0.46, 0); g.add(b); }
  const grille = mesh(new THREE.BoxGeometry(0.03, 0.16, 0.9), black); grille.position.set(-2.24, 0.66, 0); g.add(grille);
  for (let i = 0; i < 5; i++) { const bar = mesh(new THREE.BoxGeometry(0.035, 0.012, 0.9), chrome); bar.position.set(-2.245, 0.6 + i * 0.03, 0); g.add(bar); }
  const head = new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xfff2d8, emissiveIntensity: 0, roughness: 0.1 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x8a0a06, emissive: 0xff1a0a, emissiveIntensity: 0, roughness: 0.2 });
  for (const sz of [-1, 1]) {
    const h = mesh(new THREE.BoxGeometry(0.04, 0.12, 0.3), head); h.position.set(-2.23, 0.67, sz * 0.62); g.add(h);
    const t = mesh(new THREE.BoxGeometry(0.04, 0.12, 0.34), tail); t.position.set(2.23, 0.72, sz * 0.6); g.add(t);
    const mir = mesh(new THREE.BoxGeometry(0.1, 0.07, 0.04), black); mir.position.set(-0.75, 1.0, sz * (W / 2 + 0.03)); g.add(mir);
    const strip = mesh(new THREE.BoxGeometry(3.0, 0.03, 0.02), chrome); strip.position.set(0.05, 0.62, sz * (W / 2 - 0.0)); g.add(strip);
    const handle = mesh(new THREE.BoxGeometry(0.12, 0.025, 0.02), chrome); handle.position.set(0.2, 0.86, sz * (W / 2 - 0.0)); g.add(handle);
    const seam = mesh(new THREE.BoxGeometry(0.008, 0.5, 0.006), black, false); seam.position.set(0.36, 0.68, sz * (W / 2 - 0.0)); g.add(seam);
  }
  const pc = document.createElement('canvas'); pc.width = 256; pc.height = 64; const px = pc.getContext('2d');
  px.fillStyle = '#e8e4d8'; px.fillRect(0, 0, 256, 64); px.strokeStyle = '#222'; px.lineWidth = 4; px.strokeRect(3, 3, 250, 58); px.fillStyle = '#1a1a1a'; px.font = 'bold 40px monospace'; px.fillText('HPM 198', 20, 46);
  const plate = mesh(new THREE.PlaneGeometry(0.42, 0.11), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(pc), roughness: 0.5 }), false);
  plate.position.set(2.29, 0.5, 0); plate.rotation.y = Math.PI / 2; g.add(plate);
  // wheels: a tyre (lathe of a rounded profile), a steel rim, five spokes, a hub cap
  const tyreP = []; for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + (i / 16) * Math.PI; tyreP.push(new THREE.Vector2(0.24 + Math.cos(a) * 0.08, Math.sin(a) * 0.1)); }
  const tyreG = new THREE.LatheGeometry(tyreP, 32); tyreG.rotateX(Math.PI / 2);
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-1.35, -1], [-1.35, 1], [1.35, -1], [1.35, 1]]) {
    const w = new THREE.Group(); w.position.set(wx, 0.32, wz * (W / 2 - 0.12));
    w.add(mesh(tyreG, rubber));
    const rim = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 24), chrome); rim.rotation.x = Math.PI / 2; w.add(rim);
    for (let k = 0; k < 5; k++) { const sp = mesh(new THREE.BoxGeometry(0.03, 0.17, 0.02), chrome); sp.rotation.z = (k / 5) * Math.PI * 2; sp.position.z = wz * 0.08; w.add(sp); }
    const hub = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16), chrome); hub.rotation.x = Math.PI / 2; hub.position.z = wz * 0.085; w.add(hub);
    g.add(w); wheels.push(w);
  }
  // under it, in the arches: shadow
  const under = mesh(new THREE.BoxGeometry(L - 0.3, 0.12, W - 0.2), black, false); under.position.y = 0.26; g.add(under);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { wheels, head, tail };
  return g;
}
