// OFFAL: REMASTERED: the body bag. Heavy black vinyl, the size of a man, lying on the floor with one inside it: the
// sheet drapes over the head, the chest, the feet tenting it up at the end, and falls from them to a flat welted rim,
// pulled into creases between the high points. A J-shaped zip down the middle and round the head, a pull with a toe
// tag tied to it, webbing handles down both sides. Searched, the zip is open down its length and the edges are
// peeled back over a grey face. Built from the original's place in the game (props.js bodyBag), which stays as it was.
import * as THREE from 'three';
import { derivePBR } from './pbr.js';

const LX = 1.1, WZ = 0.45; // half length (feet at -x, head at +x) and half width
const NX = 112, NZ = 48;

// the body under the sheet, lying on its back: its height above the floor at (x, z)
const PARTS = [
  // [x0, z0, x1, z1, radius, height]: capsules seen from above, each a rounded ridge
  [0.8, 0, 0.82, 0, 0.105, 0.23], // head
  [0.66, 0, 0.66, 0, 0.06, 0.12], // chin and neck
  [0.5, -0.17, 0.5, 0.17, 0.08, 0.17], // shoulders
  [0.45, 0, 0.0, 0, 0.17, 0.215], // chest and belly
  [0.02, 0, -0.12, 0, 0.18, 0.19], // hips
  [-0.15, -0.09, -0.82, -0.08, 0.075, 0.13], // legs
  [-0.15, 0.09, -0.82, 0.08, 0.075, 0.13],
  [-0.86, -0.08, -0.87, -0.08, 0.045, 0.21], // feet, toes up
  [-0.86, 0.08, -0.87, 0.08, 0.045, 0.21],
  [0.45, -0.24, -0.05, -0.23, 0.05, 0.1], // arms down the sides
  [0.45, 0.24, -0.05, 0.23, 0.05, 0.1],
];
function bodyHeight(x, z) {
  let h = 0;
  x /= 0.9; // a body of 1.7 m in a bag of 2.2
  for (const [x0, z0, x1, z1, r, top] of PARTS) {
    const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2)) : 0;
    const d = Math.hypot(x - x0 - dx * t, z - z0 - dz * t);
    if (d < r * 1.35) h = Math.max(h, top * Math.max(0, 1 - (d / (r * 1.35)) ** 2)); // rounded, soft: flesh under vinyl
  }
  return h;
}
// the outline: a long rounded rectangle (superellipse)
const halfW = (u) => WZ * Math.pow(Math.max(0, 1 - Math.abs(u) ** 7), 1 / 7);

function zipCurve() {
  // down the middle from the shins, then hooking round the head on one side
  const pts = [];
  for (let x = -0.62; x <= 0.62; x += 0.08) pts.push([x, 0]);
  pts.push([0.7, 0.01], [0.8, 0.05], [0.9, 0.13], [0.95, 0.24], [0.94, 0.31]);
  return new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
}

// the sheet's height field: the body, the vinyl falling from it at the angle it can hold, down to the welt at the rim
function sheet(open) {
  const H = new Float32Array((NX + 1) * (NZ + 1)), X = new Float32Array(H.length), Z = new Float32Array(H.length);
  const id = (i, j) => j * (NX + 1) + i;
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const u = (i / NX) * 2 - 1, v = (j / NZ) * 2 - 1, x = u * LX, z = v * halfW(u);
    X[id(i, j)] = x; Z[id(i, j)] = z;
    H[id(i, j)] = bodyHeight(x, z);
  }
  // drape: nowhere lower than a neighbour minus the slope the vinyl hangs at (sweeps both ways, 8 neighbours)
  const k = 0.7;
  for (let pass = 0; pass < 3; pass++) {
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) relax(i, j);
    for (let j = NZ; j >= 0; j--) for (let i = NX; i >= 0; i--) relax(i, j);
  }
  function relax(i, j) {
    const a = id(i, j);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if ((!di && !dj) || ii < 0 || jj < 0 || ii > NX || jj > NZ) continue;
      const b = id(ii, jj), d = Math.hypot(X[a] - X[b], Z[a] - Z[b]);
      if (H[b] - k * d > H[a]) H[a] = H[b] - k * d;
    }
  }
  // pulled taut: the sheet bridges the hollows between the legs, the arms and the body instead of sinking into them
  const tmp = new Float32Array(H.length), R = 3;
  for (let it = 0; it < 2; it++) {
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      let sum = 0, n = 0;
      for (let dj = -R; dj <= R; dj += 1) for (let di = -R; di <= R; di += 1) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii > NX || jj > NZ) continue; sum += H[id(ii, jj)]; n++; }
      tmp[id(i, j)] = Math.max(H[id(i, j)], sum / n);
    }
    H.set(tmp);
  }
  // the rim: the sheet comes down to the welt, flat on the floor round the edge
  const zc = zipCurve(), zp = zc.getSpacedPoints(80);
  const P = new Float32Array(H.length * 3), C = new Float32Array(H.length * 3), UV = new Float32Array(H.length * 2);
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const a = id(i, j), u = (i / NX) * 2 - 1, v = (j / NZ) * 2 - 1;
    const edge = Math.min(LX - Math.abs(X[a]), halfW(u) - Math.abs(Z[a]), (1 - Math.abs(v)) * halfW(u));
    let y = Math.min(H[a], 0.006 + Math.max(0, edge) * 1.0) + 0.016;
    // creases: the vinyl gathers in folds running from the high points down to the rim
    const slope = Math.max(0, Math.min(1, (H[a] - bodyHeight(X[a], Z[a])) / 0.08));
    const ang = Math.atan2(Z[a], X[a] * 0.35);
    y += (Math.sin(ang * 4 + X[a] * 6 + Math.sin(X[a] * 3.1 + Z[a] * 7) * 2.2) * 0.0022 + Math.sin(X[a] * 13 + Z[a] * 17 + Math.sin(Z[a] * 9) * 1.5) * 0.001) * slope * Math.min(1, edge * 12);
    let col = 1;
    if (open) {
      // the zip parted: a trench along it, the edges rolled up, something grey at the bottom of it at the head
      let d = 1e9, tAt = 0;
      for (let q = 0; q < zp.length; q++) { const e = Math.hypot(X[a] - zp[q].x, Z[a] - zp[q].z); if (e < d) { d = e; tAt = q / (zp.length - 1); } }
      const gap = 0.035 + Math.sin(tAt * Math.PI) * 0.03;
      if (d < gap) {
        const s = 1 - d / gap;
        y -= 0.09 * Math.sqrt(s);
        col = tAt > 0.72 && tAt < 0.93 ? 1 + 22 * s * s : Math.max(0.05, 1 - s * 2); // a grey face at the head, dark elsewhere
      } else if (d < gap + 0.03) y += 0.012 * Math.sin(((d - gap) / 0.03) * Math.PI);
    }
    P[a * 3] = X[a]; P[a * 3 + 1] = y; P[a * 3 + 2] = Z[a];
    C[a * 3] = C[a * 3 + 1] = C[a * 3 + 2] = col;
    UV[a * 2] = (X[a] / LX + 1) * 2; UV[a * 2 + 1] = (Z[a] / WZ + 1) * 0.8;
  }
  const idx = [];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = id(i, j), b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  if (open) g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.height = (x, z) => { // the sheet's height at (x, z), for laying the zip and handles on it
    const u = Math.max(-1, Math.min(1, x / LX)), i = Math.round((u + 1) / 2 * NX), hw = halfW(u) || 1e-3;
    const j = Math.round((Math.max(-1, Math.min(1, z / hw)) + 1) / 2 * NZ);
    return P[id(i, j) * 3 + 1];
  };
  return g;
}

// a flat band along a path (webbing, zip tape, the welt)
function band(pts, width, up = (p) => new THREE.Vector3(0, 1, 0), thick = 0.004) {
  const n = pts.length, P = [], idx = [], UV = [];
  const T = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    T.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    N.copy(up(pts[i]));
    B.crossVectors(T, N).normalize(); N.crossVectors(B, T).normalize();
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      P.push(pts[i].x + B.x * a * width / 2 + N.x * b * thick / 2, pts[i].y + B.y * a * width / 2 + N.y * b * thick / 2, pts[i].z + B.z * a * width / 2 + N.z * b * thick / 2);
      UV.push(i / (n - 1), (a + 1) / 2);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < 4; k++) { const a = i * 4 + k, b = i * 4 + ((k + 1) % 4); idx.push(a, a + 4, b, b, a + 4, b + 4); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

let MATS = null;
function materials() {
  if (MATS) return MATS;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#0b0c0d'; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 500; i++) { // scuffs and fine creases in the vinyl
    const x = Math.random() * 1024, y = Math.random() * 512, l = 6 + Math.random() * 50, a = Math.random() * Math.PI * 2;
    g.strokeStyle = `rgba(${Math.random() < 0.4 ? '60,64,66' : '0,0,0'},${0.1 + Math.random() * 0.25})`; g.lineWidth = 0.5 + Math.random() * 1.5;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (Math.random() - 0.5) * 8, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(70,64,56,${Math.random() * 0.12})`; g.beginPath(); g.ellipse(Math.random() * 1024, Math.random() * 512, 10 + Math.random() * 60, 5 + Math.random() * 25, Math.random() * 3, 0, 7); g.fill(); } // dried dust and floor grime
  for (let i = 0; i < 5; i++) { // old blood, smeared where it was dragged
    const x = Math.random() * 1024, y = Math.random() * 512;
    for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(${50 + Math.random() * 30 | 0},3,2,${0.15 + Math.random() * 0.3})`; g.beginPath(); g.ellipse(x + k * 6, y + Math.random() * 6, 6 + Math.random() * 14, 3 + Math.random() * 5, 0.1, 0, 7); g.fill(); }
  }
  const pbr = derivePBR(c, { normal: 2.5, rough: 0.7, roughClean: 0.2, wet: 0.6, cavity: 0.3, micro: 0.02, seed: 41 });
  const tx = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  MATS = {
    // (a lamp overhead glancing off it must not turn it white: half the usual specular, and a satin finish)
    vinyl: new THREE.MeshPhysicalMaterial({ map: tx(c, true), normalMap: tx(pbr.normal), normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.5, metalness: 0, specularIntensity: 0.4, envMapIntensity: 0.25 }),
    tape: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.8 }),
    teeth: new THREE.MeshStandardMaterial({ color: 0x8a8c8e, roughness: 0.3, metalness: 1 }),
    web: new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.85 }),
    tag: new THREE.MeshStandardMaterial({ color: 0xc8c2b0, roughness: 0.9 }),
  };
  MATS.open = MATS.vinyl.clone(); MATS.open.vertexColors = true; MATS.open.color.setScalar(1);
  MATS.inside = new THREE.MeshStandardMaterial({ color: 0x8c8b80, roughness: 0.6 });
  return MATS;
}

// the bag; g: the original's group (its children already taken out), rng: a stream of its own
export function remasterBag(g, rng) {
  const M = materials();
  const closed = sheet(false), surf = new THREE.Mesh(closed, M.vinyl);
  surf.castShadow = surf.receiveShadow = true;
  g.add(surf);
  const hAt = closed.userData.height;
  // the welt round the edge, where the top is sewn to the floor of the bag
  const rim = [];
  for (let k = 0; k <= 140; k++) { const t = (k / 140) * Math.PI * 2, u = Math.cos(t), s = Math.sin(t); rim.push(new THREE.Vector3(u * LX * 0.995, 0.016, Math.sign(s) * halfW(u) * Math.abs(s) ** (1 / 7) * 0.995)); }
  const welt = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 140, 0.011, 6, true), M.vinyl);
  welt.receiveShadow = true; g.add(welt);
  // the zip: a dark tape on the sheet, the teeth down its middle, the slider and its pull, a toe tag on a string
  const zc = zipCurve(), zpts = zc.getSpacedPoints(90).map((p) => new THREE.Vector3(p.x, hAt(p.x, p.z) + 0.004, p.z));
  const zipParts = new THREE.Group();
  zipParts.add(new THREE.Mesh(band(zpts, 0.034), M.tape));
  const teeth = [];
  for (let i = 0; i < zpts.length - 1; i++) {
    const a = zpts[i], b = zpts[i + 1];
    for (let k = 0; k < 3; k++) {
      const p = a.clone().lerp(b, k / 3), tb = new THREE.BoxGeometry(0.009, 0.004, 0.014);
      tb.rotateY(-Math.atan2(b.z - a.z, b.x - a.x)); tb.translate(p.x, p.y + 0.002, p.z + (k % 2 ? 0.003 : -0.003));
      teeth.push(tb);
    }
  }
  const tg = mergeBoxes(teeth);
  zipParts.add(new THREE.Mesh(tg, M.teeth));
  const sp = zpts[zpts.length - 4];
  const slider = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.022), M.teeth); slider.position.set(sp.x, sp.y + 0.007, sp.z); slider.rotation.y = -0.9;
  const pull = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.003, 0.012), M.teeth); pull.position.set(sp.x + 0.03, sp.y + 0.004, sp.z - 0.028); pull.rotation.set(0, -0.4, 0.15);
  zipParts.add(slider, pull);
  g.add(zipParts);
  // the toe tag, tied to the foot end
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.002, 0.055), M.tag);
  const tx0 = -LX + 0.04, ty = 0.02;
  tag.position.set(tx0 - 0.03, ty, 0.12 + rng() * 0.1); tag.rotation.y = 0.3 + rng() * 0.6; tag.castShadow = true;
  g.add(tag);
  // webbing handles: three down each side, the loops lying slack on the floor
  for (const s of [-1, 1]) for (const u of [-0.55, 0.0, 0.55]) {
    const x = u * LX, z0 = s * halfW(u), loop = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, a = t * Math.PI;
      loop.push(new THREE.Vector3(x + Math.cos(a) * 0.06, 0.012 + Math.sin(a) * 0.006, z0 + s * (Math.sin(a) * 0.055 - 0.01)));
    }
    const h = new THREE.Mesh(band(loop, 0.03, () => new THREE.Vector3(0, 1, 0), 0.003), M.web);
    h.receiveShadow = true; g.add(h);
  }
  // searched: the zip open down its length, the edges rolled back, a grey face and a hand in the gap
  g.userData.openR = () => {
    surf.geometry = sheet(true); surf.material = M.open;
    zipParts.visible = false;
    const hp = zc.getPointAt(0.83);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), M.inside);
    face.scale.set(1.2, 0.55, 0.85); face.position.set(hp.x, 0.13, hp.z); g.add(face);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), M.inside); nose.scale.set(1.3, 1, 0.8); nose.position.set(hp.x + 0.015, 0.165, hp.z); g.add(nose);
    for (const s of [-1, 1]) { // shut eyes sunk into the sockets
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 6), new THREE.MeshStandardMaterial({ color: 0x4a443e, roughness: 0.7 }));
      lid.scale.set(1, 0.5, 1.4); lid.position.set(hp.x + 0.045, 0.152, hp.z + s * 0.03); g.add(lid);
    }
    const mp = zc.getPointAt(0.45);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.05), M.inside); hand.position.set(mp.x, 0.17, mp.z + 0.012); hand.rotation.y = 0.3; g.add(hand);
  };
}

function mergeBoxes(list) {
  let n = 0, ni = 0;
  for (const b of list) { n += b.attributes.position.count; ni += b.index.count; }
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2), I = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const b of list) {
    P.set(b.attributes.position.array, o * 3); N.set(b.attributes.normal.array, o * 3); UV.set(b.attributes.uv.array, o * 2);
    for (let i = 0; i < b.index.count; i++) I[oi + i] = b.index.array[i] + o;
    o += b.attributes.position.count; oi += b.index.count; b.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  return g;
}
