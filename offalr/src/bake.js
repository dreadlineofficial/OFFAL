// Draw calls, not triangles, are what cost frames here: a floor is a few thousand small props, each its own
// mesh. Once a floor is built, everything on it that never moves is welded into one mesh per material per
// 12 m block (so the blocks behind you are still culled). Anything the game keeps a handle on (bodies,
// lockers, pickups, lamps, puzzle parts, swinging meat) is left alone, because it might move or vanish.
import * as THREE from 'three';

const CELL = 12;

// every Object3D reachable from the game's own bookkeeping is "live"
function liveSet(group, roots) {
  const live = new Set(), seen = new Set();
  const scan = (v, d) => {
    if (!v || typeof v !== 'object' || d > 8 || seen.has(v)) return;
    seen.add(v);
    if (v.isScene || v === group) return;
    if (v.isObject3D) { v.traverse((o) => live.add(o)); return; }
    if (v.isMaterial || v.isTexture || v.isBufferGeometry || v.isBufferAttribute || ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return;
    const A = globalThis;
    if (A.AudioNode && (v instanceof A.AudioNode || v instanceof A.AudioParam || v instanceof A.AudioBuffer)) return;
    if (v instanceof Map || v instanceof Set) { for (const x of v.values()) scan(x, d + 1); return; }
    if (Array.isArray(v)) { for (const x of v) scan(x, d + 1); return; }
    for (const k of Object.keys(v)) scan(v[k], d + 1);
  };
  for (const r of roots) scan(r, 0);
  return live;
}

function visibleChain(o, top) {
  for (let p = o; p && p !== top; p = p.parent) if (!p.visible) return false;
  return true;
}

// weld the meshes of one bucket into one; inv: put them in that object's local space (null: world space)
const _v = new THREE.Vector3(), _nm = new THREE.Matrix3(), _m = new THREE.Matrix4();
function merge(b, inv) {
  let nv = 0, ni = 0;
  for (const o of b.list) { const g = o.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const first = b.list[0].geometry.attributes, out = {};
  for (const n of b.names) out[n] = new Float32Array(nv * first[n].itemSize);
  const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const o of b.list) {
    const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal;
    const m = inv ? _m.multiplyMatrices(inv, o.matrixWorld) : o.matrixWorld;
    _nm.getNormalMatrix(m);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m); out.position.set([_v.x, _v.y, _v.z], (vo + i) * 3);
      _v.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize(); out.normal.set([_v.x, _v.y, _v.z], (vo + i) * 3);
    }
    for (const n of b.names) {
      if (n === 'position' || n === 'normal') continue;
      const src = g.attributes[n], s = src.itemSize;
      for (let i = 0; i < src.count; i++) for (let c = 0; c < s; c++) out[n][(vo + i) * s + c] = src.getComponent(i, c);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index[io++] = g.index.getX(i) + vo;
    else for (let i = 0; i < pos.count; i++) index[io++] = vo + i;
    vo += pos.count;
  }
  const geo = new THREE.BufferGeometry();
  for (const n of b.names) geo.setAttribute(n, new THREE.BufferAttribute(out[n], first[n].itemSize, first[n].normalized));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  const mesh = new THREE.Mesh(geo, b.mat);
  mesh.castShadow = b.cast;
  mesh.receiveShadow = b.recv;
  mesh.renderOrder = b.order;
  mesh.matrixAutoUpdate = false;
  mesh.userData.baked = true;
  return mesh;
}

// which bucket a mesh can go in, or null if it has to stay as it is
function bucketKey(o, extra) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.children.length || !o.frustumCulled) return null;
  if (Array.isArray(o.material) || o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return null;
  const g = o.geometry, a = g.attributes;
  // a single material draws the whole geometry whatever its groups say, so the remaster welds boxes and cylinders too
  if (!a.position || !a.normal || (g.groups.length > 1 && !THREE.REMASTERED) || Object.keys(g.morphAttributes).length) return null;
  if (Object.values(a).some((x) => x.isInterleavedBufferAttribute)) return null;
  const names = Object.keys(a).sort();
  if (names.some((n) => !['position', 'normal', 'uv', 'color'].includes(n))) return null;
  return { key: `${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}|${names.map((n) => n + a[n].itemSize).join(',')}|${extra}`, names };
}
function addTo(buckets, o, k) {
  let b = buckets.get(k.key);
  if (!b) buckets.set(k.key, (b = { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder, names: k.names, list: [] }));
  b.list.push(o);
}

// something that moves as one piece (a carcass on a hook): weld its own parts together, in its own space
export function bakeLocal(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  root.traverse((o) => { if (o === root || !visibleChain(o, root)) return; const k = bucketKey(o, ''); if (k) addTo(buckets, o, k); });
  let n = 0;
  for (const b of buckets.values()) {
    if (b.list.length < 2) continue;
    const m = merge(b, inv);
    for (const o of b.list) { o.parent.remove(o); n++; }
    root.add(m);
  }
  return n;
}

// cell: the block size welded together (the open hall on B10 shows most of itself at once: bigger blocks, fewer draws)
export function bakeStatic(group, roots, wholes = [], cell = CELL) {
  let local = 0;
  for (const w of wholes) local += bakeLocal(w);
  group.updateMatrixWorld(true);
  const live = liveSet(group, roots);
  const buckets = new Map();
  group.traverse((o) => {
    if (live.has(o) || !visibleChain(o, group)) return;
    const e = o.matrixWorld.elements;
    const k = bucketKey(o, `${Math.floor(e[12] / cell)},${Math.floor(e[14] / cell)}`);
    if (k) addTo(buckets, o, k);
  });
  let removed = 0, made = 0;
  for (const b of buckets.values()) {
    if (b.list.length < 2) continue;
    group.add(merge(b, null));
    for (const o of b.list) { o.parent.remove(o); removed++; }
    made++;
  }
  // what's left that the game never touches doesn't need its matrix rebuilt every frame either
  group.traverse((o) => { if (o !== group && !live.has(o)) { o.updateMatrix(); o.matrixAutoUpdate = false; } });
  return { removed, made, local };
}
