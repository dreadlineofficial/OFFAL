// OFFAL: REMASTERED: the keepsakes, close up. keepsakes3d.js builds each one as the original did (its canvases now
// painted at 4x, so print and handwriting are sharp); this pass then finishes it: every round part gets several
// times the segments, every box real rounded edges, metals become metal (gold, brass, chrome and steel, reflecting
// a studio around them), paper and photo prints get their own sheen, prints curl, the ring is a real band.
// Runs inside THREE.ownRandom, so the game's own dice never see it.
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../../vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';

function finer(g) {
  const p = g.parameters;
  if (!p) return null;
  const up = (n, k, max) => Math.min(max, Math.max(n, Math.round(n * k)));
  switch (g.type) {
    case 'BoxGeometry': {
      const m = Math.min(p.width, p.height, p.depth);
      return new RoundedBoxGeometry(p.width, p.height, p.depth, 3, Math.max(m * 0.22, 0.0002));
    }
    case 'CylinderGeometry':
      return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, up(p.radialSegments, 3, 64), Math.max(1, p.heightSegments), p.openEnded, p.thetaStart, p.thetaLength);
    case 'ConeGeometry':
      return new THREE.ConeGeometry(p.radius, p.height, up(p.radialSegments, 3, 48), Math.max(4, p.heightSegments), p.openEnded, p.thetaStart, p.thetaLength);
    case 'SphereGeometry':
      return new THREE.SphereGeometry(p.radius, up(p.widthSegments, 3, 64), up(p.heightSegments, 3, 48), p.phiStart, p.phiLength, p.thetaStart, p.thetaLength);
    case 'TorusGeometry':
      return new THREE.TorusGeometry(p.radius, p.tube, up(p.radialSegments, 3, 24), up(p.tubularSegments, 3, 96), p.arc);
    case 'CircleGeometry':
      return new THREE.CircleGeometry(p.radius, up(p.segments, 3, 64));
    default:
      return null;
  }
}

// a print or a card: many quads across, bent a little the way old paper bends
function curled(g, amt) {
  const p = g.parameters, n = new THREE.BoxGeometry(p.width, p.height, p.depth, 24, 28, 1), pos = n.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (p.width / 2), y = pos.getY(i) / (p.height / 2);
    pos.setZ(i, pos.getZ(i) + (x * x * 0.6 + y * y * 0.25 + x * y * 0.15) * amt);
  }
  n.computeVertexNormals();
  return n;
}

// the ring: a D-shaped band, flat inside and domed outside
function band(r, w) {
  const pts = [];
  for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + (i / 16) * Math.PI; pts.push(new THREE.Vector2(r + Math.cos(a) * r * 0.2, Math.sin(a) * w / 2)); }
  pts.push(new THREE.Vector2(r, -w / 2));
  const g = new THREE.LatheGeometry(pts, 96);
  g.computeVertexNormals();
  return g;
}

function material(m) {
  const u = m.userData || {};
  if (u.metal != null) { m.metalness = 1; m.roughness = u.metal; m.envMapIntensity = 1.3; }
  else if (u.paper) { m.roughness = 0.82; }
  else if (u.gloss != null) { m.roughness = u.gloss; }
  else if (m.roughness > 0.7) m.roughness = Math.max(0.55, m.roughness * 0.9);
  if (m.map) { m.map.anisotropy = 16; m.map.needsUpdate = true; }
  m.needsUpdate = true;
}

export function refineKeepsake(root, id) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(material);
    const g = o.geometry;
    if ((id.startsWith('photo') || id.startsWith('card')) && g.type === 'BoxGeometry' && g.parameters.depth < 0.003) { o.geometry = curled(g, id.startsWith('photo') ? 0.006 : 0.003); return; }
    if (id === 'ring-plain' && g.type === 'TorusGeometry') { o.geometry = band(0.0105, 0.0072); o.rotation.x = Math.PI / 2; o.scale.set(1, 1, 1); return; }
    const n = finer(g);
    if (n) o.geometry = n;
    o.castShadow = o.receiveShadow = true;
  });
  return root;
}

// the studio the viewer lights them in: a dark room with two big soft panels and a warm strip, for metals to reflect
export function studioEnvironment(renderer) {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), new THREE.MeshBasicMaterial({ color: 0x2c2722, side: THREE.BackSide }));
  s.add(room);
  const panel = (w, h, c, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); };
  panel(3, 2, new THREE.Color(0xfff0e0).multiplyScalar(5), 1.8, 1.4, 1.6);
  panel(2.4, 1.2, new THREE.Color(0xfff4ea).multiplyScalar(2.5), 0.3, 1.9, -1.8);
  panel(1.4, 2.4, new THREE.Color(0xd8e0ff).multiplyScalar(1.6), -2.4, 0.4, 0.6);
  panel(3, 0.25, new THREE.Color(0xff5030).multiplyScalar(3), -0.5, 0.8, -2.6);
  panel(4, 4, new THREE.Color(0x4a4038), 0, -1.9, 0);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02);
  pm.dispose();
  s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt.texture;
}
