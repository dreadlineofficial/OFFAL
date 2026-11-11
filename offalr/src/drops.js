// Things you've put down on the floor (G): small models of what's in the hotbar box, lying where you dropped them.
// Built from the materials every floor already has, so nothing new needs compiling when one appears.
import * as THREE from 'three';

const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = false; o.receiveShadow = true; return o; };

export function dropMesh(id, mats) {
  const g = new THREE.Group();
  const add = (o, x, y, z, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  const steel = mats.steel, dark = mats.darkMetal, brass = mats.brass;
  switch (id) {
    case 'tag': // a few brass tags on a bloody ring
      for (let i = 0; i < 3; i++) add(mesh(new THREE.BoxGeometry(0.045, 0.004, 0.07), brass), (i - 1) * 0.03, 0.004 + i * 0.002, i * 0.012, 0, i * 0.5 - 0.5, 0);
      add(mesh(new THREE.TorusGeometry(0.025, 0.003, 4, 12), steel), 0, 0.006, -0.04, Math.PI / 2, 0, 0);
      add(mesh(new THREE.CircleGeometry(0.06, 10), mats.blood), 0.01, 0.002, 0, -Math.PI / 2, 0, 0);
      break;
    case 'syringe':
      add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.09, 8), mats.bone), 0, 0.01, 0, 0, 0, Math.PI / 2);
      add(mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.05, 8), mats.blood), 0.015, 0.01, 0, 0, 0, Math.PI / 2);
      add(mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.04, 4), steel), -0.065, 0.01, 0, 0, 0, Math.PI / 2);
      add(mesh(new THREE.BoxGeometry(0.004, 0.03, 0.03), mats.bone), 0.047, 0.01, 0);
      break;
    case 'gun': // the captive-bolt gun on its side
      add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28, 10), dark), 0, 0.032, 0, 0, 0, Math.PI / 2);
      add(mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.06, 10), steel), -0.17, 0.032, 0, 0, 0, Math.PI / 2);
      add(mesh(new THREE.BoxGeometry(0.05, 0.035, 0.12), mats.rust), 0.06, 0.02, 0.07, 0, -0.3, 0);
      break;
    case 'fuse':
      add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.07, 10), mats.frost || steel), 0, 0.014, 0, 0, 0, Math.PI / 2);
      for (const s of [-1, 1]) add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.016, 10), brass), s * 0.04, 0.016, 0, 0, 0, Math.PI / 2);
      break;
    case 'meat': // a slab in a smear of its own blood
      add(mesh(new THREE.SphereGeometry(0.11, 10, 7), mats.meat), 0, 0.04, 0).scale.set(1.2, 0.45, 0.85);
      add(mesh(new THREE.SphereGeometry(0.06, 8, 6), mats.fat), 0.05, 0.06, 0.02).scale.set(1, 0.4, 0.7);
      add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 6), mats.bone), -0.06, 0.05, 0, 0, 0.4, Math.PI / 2);
      add(mesh(new THREE.CircleGeometry(0.16, 12), mats.blood), 0, 0.002, 0, -Math.PI / 2, 0, 0);
      break;
    case 'card':
      add(mesh(new THREE.BoxGeometry(0.086, 0.002, 0.054), mats.bone), 0, 0.002, 0);
      add(mesh(new THREE.BoxGeometry(0.086, 0.0025, 0.01), dark), 0, 0.002, -0.014);
      break;
    case 'crank':
      add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8), steel), 0, 0.014, 0, 0, 0, Math.PI / 2);
      add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), steel), 0.16, 0.014, 0.07, Math.PI / 2, 0, 0);
      add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), mats.rust), 0.16, 0.022, 0.15, Math.PI / 2, 0, 0);
      break;
    default: // a key
      add(mesh(new THREE.TorusGeometry(0.02, 0.005, 5, 12), brass), -0.03, 0.005, 0, Math.PI / 2, 0, 0);
      add(mesh(new THREE.BoxGeometry(0.06, 0.006, 0.01), brass), 0.018, 0.005, 0);
      add(mesh(new THREE.BoxGeometry(0.008, 0.006, 0.018), brass), 0.04, 0.005, 0.01);
  }
  return g;
}
