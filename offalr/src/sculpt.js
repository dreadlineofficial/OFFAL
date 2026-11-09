// OFFAL: REMASTERED: bodies in one piece. The game builds a body from separate parts (a turned chest, spheres for
// shoulders, tubes for limbs) and poses them. Seen up close that is a mannequin: every join shows. Here, once a body
// is posed, its skin and its clothes each become one continuous surface: every part is turned into a soft distance
// field, the fields are blended where they meet (the neck flows into the shoulders, the buttocks into the thighs),
// the opened chest is carved out, and a smooth surface is drawn through the result (surface nets). Eyes, teeth, hair,
// boots, wounds and organs stay as they were. Bodies that never move are done once when the floor is built; the same
// pose is computed once and shared (a morgue's worth of bodies on trays costs one).
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();
const cache = new Map();
let VOX = 0.014; // voxel size in metres
let ON = true;
export function setSculptDetail(level) { ON = level > 0; VOX = level > 1 ? 0.011 : 0.014; }
// bodies waiting to be fused: root -> what makeBody returned (a WeakMap: userData gets cloned as JSON)
export const FUSE = new WeakMap();

// ---------- primitives, each in its own local space; distances scaled back by the smallest axis scale ----------
function roundCone(px, py, pz, ya, yb, r1, r2) {
  // iq's round cone, specialised to a segment along Y
  const h = yb - ya;
  if (Math.abs(h) < 1e-5) return Math.hypot(px, py - ya, pz) - Math.max(r1, r2);
  const l2 = h * h, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pay = py - ya, y = pay * h, z = y - l2;
  const x2 = (px * px + pz * pz) * l2 * l2, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

// the parts of a mesh as primitives: { e: inverse matrix elements, s: scale, kind, a.., box }
function primsOf(mesh, rootInv, out) {
  const g = mesh.geometry, p = g.parameters;
  if (!p) return false;
  _m.multiplyMatrices(rootInv, mesh.matrixWorld);
  _m.decompose(_p, _q, _s);
  const s = Math.min(Math.abs(_s.x), Math.abs(_s.y), Math.abs(_s.z));
  const inv = new THREE.Matrix4().copy(_m).invert().elements;
  const fwd = _m.clone();
  const parts = [];
  switch (g.type) {
    case 'SphereGeometry': parts.push({ k: 's', r: p.radius, ext: [p.radius, p.radius, p.radius] }); break;
    case 'CapsuleGeometry': parts.push({ k: 'c', r: p.radius, h: p.length / 2, ext: [p.radius, p.length / 2 + p.radius, p.radius] }); break;
    case 'CylinderGeometry': parts.push({ k: 'rc', ya: -p.height / 2, yb: p.height / 2, r1: p.radiusBottom, r2: p.radiusTop, ext: [Math.max(p.radiusTop, p.radiusBottom), p.height / 2 + 0.01, Math.max(p.radiusTop, p.radiusBottom)] }); break;
    case 'ConeGeometry': parts.push({ k: 'rc', ya: -p.height / 2, yb: p.height / 2, r1: p.radius, r2: 0.002, ext: [p.radius, p.height / 2, p.radius] }); break;
    case 'LatheGeometry': {
      const pts = p.points;
      let rmax = 0, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        parts.push({ k: 'rc', ya: a.y, yb: b.y, r1: Math.max(0.002, a.x), r2: Math.max(0.002, b.x) });
        rmax = Math.max(rmax, a.x, b.x); y0 = Math.min(y0, a.y, b.y); y1 = Math.max(y1, a.y, b.y);
      }
      for (const q of parts) { q.ext = [rmax, (y1 - y0) / 2 + rmax, rmax]; q.cy = (y0 + y1) / 2; }
      break;
    }
    default: return false;
  }
  for (const q of parts) {
    q.e = inv; q.s = s;
    // the part's box in the body's space (from its local box)
    const cy = q.cy || 0, [ex, ey, ez] = q.ext, box = new THREE.Box3();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) box.expandByPoint(_p.set(sx * ex, cy + sy * ey, sz * ez).applyMatrix4(fwd));
    q.box = box;
    out.push(q);
  }
  return true;
}

function evalPrim(q, x, y, z) {
  const e = q.e;
  const lx = e[0] * x + e[4] * y + e[8] * z + e[12], ly = e[1] * x + e[5] * y + e[9] * z + e[13], lz = e[2] * x + e[6] * y + e[10] * z + e[14];
  let d;
  if (q.k === 's') d = Math.hypot(lx, ly, lz) - q.r;
  else if (q.k === 'c') { const cy = Math.max(-q.h, Math.min(q.h, ly)); d = Math.hypot(lx, ly - cy, lz) - q.r; }
  else if (q.k === 'hs') d = -lz; // the half space z > 0 (a carver: everything in front of the saw)
  else d = roundCone(lx, ly, lz, q.ya, q.yb, q.r1, q.r2);
  return d * q.s;
}

const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

// parts belong to chains (0 the trunk, then each limb): a limb melts into itself and into the trunk, never into the
// other limbs (two legs side by side must stay two legs)
const chainD = new Float64Array(8);
function field(prims, carve, x, y, z, k) {
  let d = 1e9, used = 0;
  for (let c = 0; c < 8; c++) chainD[c] = 1e9;
  for (let i = 0; i < prims.length; i++) { const q = prims[i], c = q.chain || 0, v = evalPrim(q, x, y, z); chainD[c] = chainD[c] > 1e8 ? v : smin(chainD[c], v, k); used |= 1 << c; }
  const trunk = chainD[0];
  if (used === 1) d = trunk;
  else for (let c = 1; c < 8; c++) if (used & (1 << c)) { const v = trunk > 1e8 ? chainD[c] : smin(trunk, chainD[c], k); d = Math.min(d, v); }
  if (used & 1 && d > 1e8) d = trunk;
  for (let i = 0; i < carve.length; i++) { const c = -evalPrim(carve[i], x, y, z); const h = Math.max(0.012 - Math.abs(d - c), 0) / 0.012; d = Math.max(d, c) + h * h * 0.003; }
  return d;
}

// ---------- surface nets over a sampled field ----------
function surface(prims, carve, k, uvs = 3.2) {
  if (!prims.length) return null;
  const box = new THREE.Box3();
  for (const q of prims) box.union(q.box);
  box.expandByScalar(k + VOX * 2);
  const h = VOX, nx = Math.ceil((box.max.x - box.min.x) / h) + 1, ny = Math.ceil((box.max.y - box.min.y) / h) + 1, nz = Math.ceil((box.max.z - box.min.z) / h) + 1;
  if (nx * ny * nz > 2.5e6) return null;
  const ox = box.min.x, oy = box.min.y, oz = box.min.z, F = new Float32Array(nx * ny * nz), id = (i, j, l) => (l * ny + j) * nx + i;
  // blocks of B^3 samples: only the parts near a block are evaluated there, and blocks far from the surface are filled whole
  const B = 6, R = B * h * 0.9;
  const near = new Array(prims.length);
  for (let bl = 0; bl < nz; bl += B) for (let bj = 0; bj < ny; bj += B) for (let bi = 0; bi < nx; bi += B) {
    const cx = ox + (bi + B / 2) * h, cy = oy + (bj + B / 2) * h, cz = oz + (bl + B / 2) * h;
    let n = 0;
    for (const q of prims) { const b = q.box; if (cx > b.min.x - R - k && cx < b.max.x + R + k && cy > b.min.y - R - k && cy < b.max.y + R + k && cz > b.min.z - R - k && cz < b.max.z + R + k) near[n++] = q; }
    const list = near.slice(0, n);
    const i1 = Math.min(nx, bi + B + 1), j1 = Math.min(ny, bj + B + 1), l1 = Math.min(nz, bl + B + 1);
    const dc = n ? field(list, carve, cx, cy, cz, k) : 1;
    if (!n || dc > R + 0.01) { for (let l = bl; l < l1; l++) for (let j = bj; j < j1; j++) for (let i = bi; i < i1; i++) F[id(i, j, l)] = Math.max(dc, 0.001); continue; }
    for (let l = bl; l < l1; l++) for (let j = bj; j < j1; j++) for (let i = bi; i < i1; i++) F[id(i, j, l)] = field(list, carve, ox + i * h, oy + j * h, oz + l * h, k);
  }
  // one vertex per cell the surface passes through, at the mean of its edge crossings; normals from the field
  const cells = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), cid = (i, j, l) => (l * (ny - 1) + j) * (nx - 1) + i;
  const pos = [], nor = [], uv = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], v = new Float32Array(8);
  for (let l = 0; l < nz - 1; l++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let inside = 0;
    for (let c = 0; c < 8; c++) { v[c] = F[id(i + C[c][0], j + C[c][1], l + C[c][2])]; if (v[c] < 0) inside++; }
    if (!inside || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; n++;
    }
    const px = ox + (i + sx / n) * h, py = oy + (j + sy / n) * h, pz = oz + (l + sz / n) * h;
    const gx = v[1] + v[3] + v[5] + v[7] - v[0] - v[2] - v[4] - v[6], gy = v[2] + v[3] + v[6] + v[7] - v[0] - v[1] - v[4] - v[5], gz = v[4] + v[5] + v[6] + v[7] - v[0] - v[1] - v[2] - v[3];
    const gl = Math.hypot(gx, gy, gz) || 1, ax = Math.abs(gx), ay = Math.abs(gy), az = Math.abs(gz);
    cells[cid(i, j, l)] = pos.length / 3;
    pos.push(px, py, pz); nor.push(gx / gl, gy / gl, gz / gl);
    // box-projected texture coordinates: the skin and cloth textures are noise and stains, the seams don't show
    if (ax >= ay && ax >= az) uv.push(pz * uvs, py * uvs); else if (ay >= az) uv.push(px * uvs, pz * uvs); else uv.push(px * uvs, py * uvs);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let l = 1; l < nz - 1; l++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { // edges along x
    const a = F[id(i, j, l)], b = F[id(i + 1, j, l)];
    if ((a < 0) === (b < 0)) continue;
    quad(cells[cid(i, j - 1, l - 1)], cells[cid(i, j, l - 1)], cells[cid(i, j, l)], cells[cid(i, j - 1, l)], !(a < 0));
  }
  for (let l = 1; l < nz - 1; l++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { // edges along y
    const a = F[id(i, j, l)], b = F[id(i, j + 1, l)];
    if ((a < 0) === (b < 0)) continue;
    quad(cells[cid(i - 1, j, l - 1)], cells[cid(i - 1, j, l)], cells[cid(i, j, l)], cells[cid(i, j, l - 1)], !(a < 0));
  }
  for (let l = 0; l < nz - 1; l++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { // edges along z
    const a = F[id(i, j, l)], b = F[id(i, j, l + 1)];
    if ((a < 0) === (b < 0)) continue;
    quad(cells[cid(i - 1, j - 1, l)], cells[cid(i, j - 1, l)], cells[cid(i, j, l)], cells[cid(i - 1, j, l)], !(a < 0));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.userData.shared = true;
  return g;
}

// ---------- folds and pores ----------
// a cheap 3D value noise
function hash3(x, y, z) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), L(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    L(L(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), L(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w);
}
// cloth: creases (ridged noise: thin folds rather than lumps) at two sizes; skin: a fine unevenness
function displace(g, cloth) {
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let d;
    if (cloth) {
      const r1 = 1 - Math.abs(vnoise(x * 11, y * 4.5, z * 11) * 2 - 1), r2 = 1 - Math.abs(vnoise(x * 27 + 5, y * 13, z * 27) * 2 - 1);
      d = (r1 * r1 - 0.45) * 0.0075 + (r2 * r2 - 0.45) * 0.0025;
    } else d = (vnoise(x * 70, y * 70, z * 70) - 0.5) * 0.0018 + (vnoise(x * 18, y * 18, z * 18) - 0.5) * 0.002;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  g.computeVertexNormals();
}

// ---------- fusing a posed body ----------
// b: what makeBody returned. Its skin and its clothes each become one smooth mesh; the parts they replace are removed.
export function fuseBody(b) {
  const root = b.root;
  if (root.userData.fused) return;
  root.userData.fused = true;
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const sets = new Map(); // material -> { prims, meshes }
  const carve = [];
  // the face and the hands keep their own parts: they are finer than the sculpt (a nose, eyelids, fingers)
  const keep = new Set([b.head, ...b.arms.map((a) => a.userData.hand)].filter(Boolean));
  const kept = (o) => { for (let p = o; p && p !== root; p = p.parent) if (keep.has(p)) return true; return false; };
  const limbs = [...(b.legs || []), ...(b.arms || [])];
  const chainOf = (o) => { for (let p = o; p && p !== root; p = p.parent) { const i = limbs.indexOf(p); if (i >= 0) return i + 1; } return 0; };
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    if (o.userData.cavity) { primsOf(o, rootInv, carve); return; }
    if (kept(o)) return;
    if (o.material !== b.skin && o.material !== b.cloth) return;
    let set = sets.get(o.material);
    if (!set) sets.set(o.material, (set = { prims: [], meshes: [] }));
    const n0 = set.prims.length;
    if (primsOf(o, rootInv, set.prims)) { set.meshes.push(o); const c = chainOf(o); for (let i = n0; i < set.prims.length; i++) set.prims[i].chain = c; }
  });
  for (const [mat, set] of sets) {
    if (set.prims.length < 3) continue;
    const key = mat.uuid.slice(0, 4) + VOX + set.prims.map((q) => q.k + (q.r || 0).toFixed(3) + (q.r1 || 0).toFixed(3) + (q.r2 || 0).toFixed(3) + q.e.map((x) => x.toFixed(3)).join(',') + 'c' + (q.chain || 0)).join('|') + carve.map((q) => q.e.map((x) => x.toFixed(3)).join(',')).join('|');
    let g = cache.get(key);
    if (g === undefined) {
      const cloth = mat === b.cloth && b.cloth !== b.skin;
      g = surface(set.prims, carve, cloth ? 0.018 : 0.026);
      if (g) displace(g, cloth);
      cache.set(key, g);
    }
    if (!g) continue;
    for (const o of set.meshes) o.parent.remove(o);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true;
    root.add(m);
  }
}

// every body under root that asked to be fused (makeBody marks dead ones in the remaster)
export function fuseBodies(root) {
  if (!ON || !root) return 0;
  const todo = [];
  root.traverse((o) => { if (!o.userData.fused && FUSE.has(o)) todo.push(FUSE.get(o)); });
  if (todo.length) THREE.ownRandom(() => { for (const b of todo) fuseBody(b); });
  return todo.length;
}

// ---------- a split side hanging on a hook ----------
// One side of a pig or a calf, sawn down the spine: ham, loin, ribcage, shoulder and neck flowing into each other under
// the fat; the sawn face flat and red, the backbone showing along it, the body cavity hollowed out with the ribs inside
// it; the hind shank up on the hook and a foreleg hanging. Worked out once and shared by every carcass on a floor.
let carcassGeo = null;
function sculptCarcassGeometry() {
  const tmp = new THREE.Group(), parts = [];
  const ell = (x, y, z, rx, ry, rz) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6)); m.position.set(x, y, z); m.scale.set(rx, ry, rz); tmp.add(m); parts.push(m); };
  const cap = (x0, y0, x1, y1, r) => { const len = Math.hypot(x1 - x0, y1 - y0), m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 2, 6)); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); m.rotation.z = Math.atan2(-(x1 - x0), y1 - y0); tmp.add(m); parts.push(m); };
  ell(0.02, -0.26, 0, 0.19, 0.22, 0.16); // ham
  ell(0.06, -0.52, 0, 0.16, 0.25, 0.14); // loin
  ell(-0.02, -0.8, 0, 0.23, 0.3, 0.16); // ribs and belly
  ell(0.02, -1.04, 0, 0.18, 0.17, 0.14); // shoulder
  ell(0.0, -1.2, 0, 0.1, 0.09, 0.085); // neck
  cap(0.03, -0.12, 0.04, 0.06, 0.04); // hind shank, up to the hook
  cap(0.04, 0.04, -0.02, 0.2, 0.03); // the hind trotter past the hook
  cap(-0.07, -1.02, -0.13, -1.32, 0.042); // foreleg
  cap(-0.13, -1.3, -0.17, -1.46, 0.03); // and its trotter
  ell(-0.16, -0.76, 0, 0.1, 0.25, 0.09); // the belly flap, hanging
  ell(0.1, -0.3, 0, 0.12, 0.14, 0.11); // the rump over the ham
  const saw = new THREE.Mesh(new THREE.SphereGeometry(1, 4, 3)); tmp.add(saw); // its matrix only: the half space z > 0
  const pit = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6)); pit.position.set(-0.06, -0.78, 0.0); pit.scale.set(0.15, 0.27, 0.11); tmp.add(pit);
  tmp.updateMatrixWorld(true);
  const inv = new THREE.Matrix4(), prims = [], carve = [];
  for (const m of parts) primsOf(m, inv, prims);
  primsOf(pit, inv, carve);
  const hs = { k: 'hs', e: new THREE.Matrix4().elements, s: 1, box: new THREE.Box3() };
  carve.push(hs);
  const g = surface(prims, carve, 0.07, 1.1);
  if (!g) return null;
  displace(g, false);
  // split the faces: the sawn face and the cavity are meat, the outside is fat
  // and on the sawn face, the back fat: a white rim of it under the skin, the lean red inside it
  const p = g.attributes.position, idx = g.index.array, fat = [], meat = [], rim = [];
  const inPit = (x, y, z) => ((x + 0.06) / 0.17) ** 2 + ((y + 0.78) / 0.29) ** 2 + (z / 0.13) ** 2 < 1;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const cx = (p.getX(a) + p.getX(b) + p.getX(c)) / 3, cy = (p.getY(a) + p.getY(b) + p.getY(c)) / 3, cz = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
    if (!(cz > -0.012 || inPit(cx, cy, cz))) { fat.push(a, b, c); continue; }
    const depth = -field(prims, [], cx, cy, cz, 0.07); // how far in from the skin
    (depth < 0.026 + (cx > 0.05 ? 0.012 : 0) && !inPit(cx, cy, cz) ? rim : meat).push(a, b, c);
  }
  const part = (list) => { const q = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'uv']) q.setAttribute(k, g.attributes[k]); q.setIndex(list); q.computeBoundingSphere(); q.userData.shared = true; return q; };
  return { fat: part(fat), meat: part(meat), rim: part(rim) };
}
export function sculptedCarcass(mats, rng) {
  carcassGeo ||= THREE.ownRandom(sculptCarcassGeometry);
  const g = new THREE.Group();
  if (!carcassGeo) return g;
  // the sawn face wants the marbling at its true size (the fat's mapping is stretched for one stamp a side)
  mats.carcassMeat ||= THREE.ownRandom(() => { const m = mats.meat.clone(); for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap']) if (m[k]) { m[k] = m[k].clone(); m[k].repeat.set(3, 3); m[k].needsUpdate = true; } return m; });
  const fat = new THREE.Mesh(carcassGeo.fat, mats.pigSkin || mats.carcassFat || mats.fat), meat = new THREE.Mesh(carcassGeo.meat, mats.carcassMeat);
  const rim = new THREE.Mesh(carcassGeo.rim, mats.fat || mats.carcassFat);
  for (const m of [fat, meat, rim]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  // the cloven hooves at the ends of the trotters
  for (const [x, y, a] of [[-0.03, 0.235, 0.35], [-0.18, -1.5, 0.25]]) for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.055, 12), mats.hoof || mats.darkMetal); h.position.set(x, y, s * 0.012); h.rotation.z = y > 0 ? a : Math.PI + a; h.scale.set(1, 1, 0.8); g.add(h);
  }
  // the backbone down the sawn edge, and the ribs inside the cavity
  for (let i = 0; i < 15; i++) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.03), mats.bone); v.position.set(0.15 - i * 0.004, -0.12 - i * 0.072, -0.012); g.add(v);
    const disc = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.012, 0.028), mats.meatPale || mats.meat); disc.position.set(0.15 - i * 0.004, -0.152 - i * 0.072, -0.012); g.add(disc);
  }
  for (let i = 0; i < 8; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.17 - Math.abs(i - 3.5) * 0.012, 0.011, 8, 24, Math.PI * 0.62), mats.bone);
    r.position.set(0.12, -0.56 - i * 0.065, -0.07); r.rotation.set(0, 0, Math.PI * 0.62 + (rng() - 0.5) * 0.05); r.scale.set(1, 1, 0.7);
    g.add(r);
  }
  const s = 0.92 + rng() * 0.16;
  g.scale.set(s, s * (0.95 + rng() * 0.1), s);
  return g;
}
