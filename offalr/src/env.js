// OFFAL: REMASTERED: a small image-based-lighting environment, built in code: a dark concrete box with a few strip
// lamps. It gives metals something to reflect and surfaces a touch of bounce, so the world is not lit by the torch alone.
import * as THREE from 'three';

export function makeEnvironment(renderer, { lamp = 0xffe8c8, strength = 1 } = {}) {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(20, 6, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x201c18).multiplyScalar(0.55 * strength), side: THREE.BackSide }));
  room.position.y = 3;
  s.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x0c0a08) }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01;
  s.add(floor);
  const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(lamp).multiplyScalar(14 * strength) });
  for (const [x, z, rot] of [[-5, -4, 0], [5, 3, 0], [0, 6, 1], [-6, 5, 1], [6, -6, 1]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(rot ? 0.2 : 3, 0.06, rot ? 3 : 0.2), strip);
    m.position.set(x, 5.9, z);
    s.add(m);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.04);
  pm.dispose();
  s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt.texture;
}
