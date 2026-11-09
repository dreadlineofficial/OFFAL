// OFFAL: REMASTERED: model detail. The game builds everything from primitives (boxes, cylinders, spheres, capsules,
// tori, lathes) at the original's low polygon counts. This pass walks a built scene graph and swaps each plain
// primitive for a finer one: boxes get real bevelled edges (the light catches every edge of a table, a locker, a
// crate), round things get two to three times the segments. The shapes, sizes and positions stay exactly the same.
// Hex nuts and other deliberately faceted parts (6 sides or fewer) are left faceted.
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../../vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';

const done = new WeakMap(); // original geometry -> its finer replacement (or itself when it is left alone)
const seen = new WeakSet();
const _s = new THREE.Vector3();
let level = 1; // 0 off, 1 normal, 2 high

export function setDetail(l) { level = l; }

// only untouched primitives: nothing with vertex colours, morphs or vertices the game moves itself
function plain(g) {
  const k = Object.keys(g.attributes).sort().join(',');
  return k === 'normal,position,uv' && !Object.keys(g.morphAttributes).length;
}

function finer(g) {
  const p = g.parameters, up = (n, max) => Math.min(max, Math.max(n, Math.round(n * (level > 1 ? 2.5 : 2))));
  switch (g.type) {
    case 'BoxGeometry': {
      const m = Math.min(p.width, p.height, p.depth);
      if (m < 0.03 && level < 2) return null; // slats, plates, tags: a bevel too small to see is just triangles
      const r = Math.min(level > 1 ? 0.025 : 0.018, m * 0.2);
      return new RoundedBoxGeometry(p.width, p.height, p.depth, level > 1 ? 3 : 2, r);
    }
    case 'CylinderGeometry':
    case 'ConeGeometry': {
      if (p.radialSegments <= 6) return null;
      const r0 = g.type === 'ConeGeometry' ? 0 : p.radiusTop, r1 = g.type === 'ConeGeometry' ? p.radius : p.radiusBottom;
      return new THREE.CylinderGeometry(r0, r1, p.height, up(p.radialSegments, 40), p.heightSegments, p.openEnded, p.thetaStart, p.thetaLength);
    }
    case 'SphereGeometry':
      if (p.widthSegments <= 6) return null;
      return new THREE.SphereGeometry(p.radius, up(p.widthSegments, 40), up(p.heightSegments, 28), p.phiStart, p.phiLength, p.thetaStart, p.thetaLength);
    case 'CapsuleGeometry':
      return new THREE.CapsuleGeometry(p.radius, p.length, up(p.capSegments, 10), up(p.radialSegments, 28));
    case 'TorusGeometry':
      if (p.radialSegments <= 3) return null;
      return new THREE.TorusGeometry(p.radius, p.tube, up(p.radialSegments, 20), up(p.tubularSegments, 64), p.arc);
    case 'LatheGeometry': {
      if (p.segments <= 6) return null;
      const lg = new THREE.LatheGeometry(p.points, up(p.segments, 40), p.phiStart, p.phiLength);
      lg.computeVertexNormals();
      return lg;
    }
    default:
      return null;
  }
}

// a primitive the game reshaped after making it (the body bag is a sphere pulled into a bag) must be left alone: its
// bounds no longer match a fresh primitive of the same parameters
function reshaped(g, n) {
  if (!g.boundingBox) g.computeBoundingBox();
  if (!n.boundingBox) n.computeBoundingBox();
  const a = g.boundingBox, b = n.boundingBox, size = a.getSize(new THREE.Vector3()).length() || 1;
  return a.min.distanceTo(b.min) + a.max.distanceTo(b.max) > size * 0.03;
}

function upgradeGeometry(g) {
  let n = done.get(g);
  if (n) return n;
  n = (plain(g) && THREE.ownRandom(() => finer(g))) || g;
  if (n !== g && reshaped(g, n)) { n.dispose(); n = g; }
  if (n !== g) n.userData.shared = true; // the level teardown leaves shared geometry alone
  done.set(g, n);
  return n;
}

// upgrade every mesh under root that has not been seen yet; cheap to call again on the same tree
export function upgradeTree(root) {
  if (!level || !root) return;
  root.traverse((o) => {
    if (o.isLight) { o.layers.enable(1); return; } // lights must be seen by the mirror's camera too
    if (!o.isMesh || seen.has(o) || o.isSkinnedMesh) return;
    seen.add(o);
    if (o.geometry && o.geometry.parameters) o.geometry = upgradeGeometry(o.geometry);
    // small parts throw no shadow worth drawing: every caster is drawn again for the torch and each lamp's six faces
    if (o.castShadow && o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const s = o.getWorldScale(_s); if (o.geometry.boundingSphere.radius * Math.max(s.x, s.y, s.z) < 0.09) o.castShadow = false; }
    // the floor's mirror shows the big shapes (walls, the Foreman, lockers, bodies), not every bolt
    if (o.geometry && o.geometry.boundingSphere) { const s = o.getWorldScale(_s); if (o.geometry.boundingSphere.radius * Math.max(s.x, s.y, s.z) >= 0.25) o.layers.enable(1); }
  });
}
