// The family photo keepsake: a farmer and his two boys, Eddie and John, in front of the farmhouse. A little scene is
// built and photographed with the game's own renderer (once; the print is kept), then printed black and white. Before
// the renderer exists (or if anything fails) the print is painted instead.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let sd = 1931;
const r = () => ((sd = (Math.imul(sd, 1103515245) + 12345) >>> 0) / 4294967296);
function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
function tex(c, rep = 1) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); return t; }
const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85 }, o));

// ---------- cloth ----------
const plaid = () => tex(canvas(128, 128, (g) => {
  g.fillStyle = '#8c1c16'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(10,8,8,0.55)'; for (let i = 0; i < 128; i += 32) { g.fillRect(i, 0, 14, 128); g.fillRect(0, i, 128, 14); }
  g.fillStyle = 'rgba(220,200,180,0.25)'; for (let i = 20; i < 128; i += 32) { g.fillRect(i, 0, 2, 128); g.fillRect(0, i, 128, 2); }
}), 3);
const denim = (base) => tex(canvas(64, 64, (g) => {
  g.fillStyle = base; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.06})`; g.fillRect(r() * 64, r() * 64, 1, 3); }
}), 2);
const stripes = () => tex(canvas(64, 64, (g) => { g.fillStyle = '#d8d2c4'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#3a4a6a'; for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 6); }), 2);

// ---------- people ----------
// a person in the game's own blocky way: boots, legs, a body, arms hanging, a head with a face built on it
function person(o) {
  const s = o.h / 1.85, g = new THREE.Group(), add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x * s, y * s, z * s); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const skin = std({ color: o.skin, roughness: 0.7 }), lower = std({ map: o.legs, color: 0xffffff }), shirt = std({ map: o.shirt, color: 0xffffff, roughness: 0.9 }), boot = std({ color: 0x1a1410, roughness: 0.6 });
  if (o.dress) { // a dress to below the knee, stockinged shins, flat shoes
    for (const x of [-0.08, 0.08]) { add(new THREE.BoxGeometry(0.09 * s, 0.06 * s, 0.2 * s), boot, x, 0.03, 0.03); add(new THREE.CylinderGeometry(0.05 * s, 0.045 * s, 0.45 * s, 10), std({ color: 0xc8b4a0, roughness: 0.6 }), x, 0.28, 0); }
    add(new THREE.CylinderGeometry(0.2 * s, 0.34 * s, 0.7 * s, 18), shirt, 0, 0.84, 0); // the skirt
  } else {
    for (const x of [-0.11, 0.11]) {
      add(new THREE.BoxGeometry(0.13 * s, 0.1 * s, 0.26 * s), boot, x, 0.05, 0.04);
      add(new THREE.CylinderGeometry(0.075 * s, 0.07 * s, 0.82 * s, 10), lower, x, 0.5, 0);
    }
    add(new THREE.BoxGeometry(0.4 * s, 0.32 * s, 0.24 * s), lower, 0, 0.98, 0); // hips
  }
  add(new THREE.CylinderGeometry(0.19 * s, 0.2 * s, 0.56 * s, 14), shirt, 0, 1.38, 0); // body
  if (o.overalls) {
    add(new THREE.BoxGeometry(0.3 * s, 0.32 * s, 0.03 * s), lower, 0, 1.28, 0.19); // the bib
    for (const x of [-0.1, 0.1]) { add(new THREE.BoxGeometry(0.05 * s, 0.42 * s, 0.03 * s), lower, x, 1.5, 0.185, -0.12); add(new THREE.BoxGeometry(0.05 * s, 0.4 * s, 0.03 * s), lower, x, 1.5, -0.19, 0.12); } // straps, front and back
    for (const x of [-0.1, 0.1]) add(new THREE.CylinderGeometry(0.018 * s, 0.018 * s, 0.01 * s, 10), std({ color: 0x9a9890, metalness: 0.8, roughness: 0.3 }), x, 1.42, 0.21, Math.PI / 2); // buttons
  }
  const limb = (from, to, r0, r1, mat) => { // a tapered cylinder from one point to another (in unscaled units)
    const d = to.clone().sub(from), m = new THREE.Mesh(new THREE.CylinderGeometry(r1 * s, r0 * s, d.length() * s, 10), mat);
    m.position.copy(from.clone().add(to).multiplyScalar(0.5 * s)); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); m.castShadow = m.receiveShadow = true; g.add(m); return m;
  };
  for (const side of [-1, 1]) {
    const sh = V(side * 0.235, 1.6, 0);
    add(new THREE.SphereGeometry(0.07 * s, 10, 8), shirt, sh.x, sh.y, 0); // the shoulder
    if (o.clasp) { // hands together in front of her, at the waist
      const el = V(side * 0.25, 1.28, 0.08), hd = V(side * 0.035, 1.12, 0.27);
      limb(sh, el, 0.066, 0.06, shirt); limb(el, hd, 0.058, 0.045, shirt); add(new THREE.SphereGeometry(0.05 * s, 10, 8), skin, hd.x, hd.y, hd.z).scale.set(1, 0.8, 1.2);
    } else {
      const ang = o.arm || 0.08, dx = Math.sin(ang) * side, dy = -Math.cos(ang);
      add(new THREE.CylinderGeometry(0.066 * s, 0.058 * s, 0.6 * s, 10), shirt, sh.x + dx * 0.3, sh.y + 0.02 + dy * 0.3, 0, 0, 0, side * ang);
      add(new THREE.SphereGeometry(0.055 * s, 10, 8), skin, sh.x + dx * 0.64, sh.y + 0.02 + dy * 0.64, 0.02);
    }
  }
  if (o.apron) { // a plain apron over the dress, tied at the waist, and a white collar
    const ap = std({ color: 0xe6e2da, roughness: 0.95 });
    add(new THREE.BoxGeometry(0.34 * s, 0.66 * s, 0.015 * s), ap, 0, 0.86, 0.265, -0.2);
    add(new THREE.CylinderGeometry(0.205 * s, 0.205 * s, 0.05 * s, 18), ap, 0, 1.16, 0);
    add(new THREE.TorusGeometry(0.075 * s, 0.018 * s, 6, 18), ap, 0, 1.655, 0.01, Math.PI / 2 + 0.2);
  }
  add(new THREE.CylinderGeometry(0.06 * s, 0.065 * s, 0.1 * s, 10), skin, 0, 1.69, 0); // neck
  const head = add(new THREE.SphereGeometry(0.125 * s, 20, 16), skin, 0, 1.84, 0); head.scale.set(0.92, 1.12, 0.95);
  // the face: a brow, eyes set under it, a nose, a mouth, ears; the farmer's lines
  const dark = std({ color: 0x14100c, roughness: 0.5 });
  add(new THREE.BoxGeometry(0.17 * s, 0.025 * s, 0.04 * s), skin, 0, 1.885, 0.1);
  for (const x of [-0.045, 0.045]) { add(new THREE.SphereGeometry(0.016 * s, 8, 6), dark, x, 1.86, 0.104).scale.set(1.2, o.squint ? 0.5 : 0.85, 0.6); add(new THREE.SphereGeometry(0.022 * s, 8, 6), skin, x * 2.55, 1.84, 0).scale.set(0.5, 1, 0.8); }
  add(new THREE.ConeGeometry(0.02 * s, 0.06 * s, 6), skin, 0, 1.825, 0.12, Math.PI / 2);
  add(new THREE.BoxGeometry(0.07 * s, 0.009 * s, 0.01 * s), dark, 0, 1.775, 0.112, 0, 0, o.smile || 0);
  if (o.lines) for (const [x, y, w, rz] of [[0, 1.915, 0.1, 0], [0, 1.93, 0.08, 0], [-0.07, 1.81, 0.03, 1.2], [0.07, 1.81, 0.03, -1.2], [-0.04, 1.79, 0.03, 0.9], [0.04, 1.79, 0.03, -0.9]]) add(new THREE.BoxGeometry(w * s, 0.004 * s, 0.006 * s), std({ color: 0x5a3a2a }), x, y, 0.112 - Math.abs(x) * 0.3, 0, 0, rz);
  if (o.cap) {
    const cap = std({ color: o.cap, roughness: 0.8 });
    add(new THREE.SphereGeometry(0.135 * s, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), cap, 0, 1.9, -0.005).scale.set(0.98, 0.8, 1);
    add(new THREE.CylinderGeometry(0.11 * s, 0.11 * s, 0.012 * s, 16, 1, false, -Math.PI / 2, Math.PI), cap, 0, 1.91, 0.075).scale.set(1, 1, 0.85);
  } else {
    const hair = std({ color: o.hair || 0x3a2a1a, roughness: 0.95 });
    add(new THREE.SphereGeometry(0.135 * s, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), hair, 0, 1.86, -0.01).scale.set(1.02, 1, 1.05); // hair
    if (o.bun) add(new THREE.SphereGeometry(0.07 * s, 14, 10), hair, 0, 1.92, -0.12);
  }
  g.userData.head = head;
  g.position.x = o.x; g.position.z = o.z || 0; g.rotation.y = o.turn || 0;
  return g;
}

// ---------- the farm ----------
function farm(who = 'family') {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0xb8b4aa); s.fog = new THREE.Fog(0xb8b4aa, 9, 34);
  s.add(new THREE.HemisphereLight(0xf2eee6, 0x5a4a3a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.2); sun.position.set(-5, 8, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -2 }); sun.shadow.radius = 4; s.add(sun);
  const dirt = tex(canvas(256, 256, (g) => { g.fillStyle = '#6e5e48'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 2600; i++) { const v = 70 + r() * 90; g.fillStyle = `rgba(${v},${v * 0.85},${v * 0.6},0.5)`; g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 6); } }), 18);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), std({ map: dirt, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; s.add(ground);
  // dry grass in clumps
  const blade = new THREE.ConeGeometry(0.012, 0.42, 3), grass = std({ color: 0x9a8a5a, roughness: 1 });
  const clumps = new THREE.InstancedMesh(blade, grass, 2400), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < 2400; i++) {
    let x = (r() - 0.5) * 22, z = -1 - r() * 16; if (Math.abs(x) < 1.6 && z > -2.6) z -= 2.5;
    const k = 0.6 + r() * 1.1; e.set((r() - 0.5) * 0.5, r() * 6, (r() - 0.5) * 0.5); q.setFromEuler(e);
    m.compose(V(x, 0.2 * k, z), q, V(1, k, 1)); clumps.setMatrixAt(i, m);
  }
  s.add(clumps);
  // the farmhouse: white boards, a dark roof, dark windows, a porch
  const boards = tex(canvas(128, 128, (g) => { g.fillStyle = '#e8e4da'; g.fillRect(0, 0, 128, 128); for (let y = 0; y < 128; y += 12) { g.fillStyle = 'rgba(60,50,40,0.35)'; g.fillRect(0, y, 128, 2); } for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(90,80,70,${r() * 0.2})`; g.fillRect(r() * 128, r() * 128, 6 + r() * 20, 2); } }), 4);
  const house = new THREE.Group(); s.add(house); house.position.set(5.2, 0, -10); house.rotation.y = -0.35;
  const wall = std({ map: boards }), roofM = std({ color: 0x2a2622, roughness: 0.9 }), win = std({ color: 0x14161a, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 5), wall); body.position.y = 1.7; body.castShadow = body.receiveShadow = true; house.add(body);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 3.2, 2, 4, 1), roofM); roof.position.y = 4.35; roof.rotation.y = Math.PI / 4; roof.scale.set(1.62, 1, 1.15); house.add(roof);
  for (const [x, y] of [[-2.2, 2.3], [-0.6, 2.3], [1.2, 2.3], [-2.2, 0.9], [1.2, 0.9]]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.05), win); w.position.set(x, y, 2.51); house.add(w); for (const d of [-0.42, 0.42]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), wall); f.position.set(x + d, y, 2.53); house.add(f); } }
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.0, 0.05), std({ color: 0x3a3430 })); door.position.set(-1.4, 1.0, 2.51); house.add(door);
  const porch = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.12, 0.1), roofM); porch.position.set(0, 2.9, 3.6); porch.rotation.x = 0.3; house.add(porch);
  for (const x of [-3.4, -1, 1.4, 3.4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.8, 0.12), wall); p.position.set(x, 1.4, 3.6); house.add(p); }
  // a post-and-rail fence across the field
  const wood = std({ color: 0x6a5a48, roughness: 1 });
  for (let i = 0; i < 9; i++) {
    const x = -10 + i * 1.6, z = -6.5 - i * 0.12;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), wood); post.position.set(x, 0.6, z); post.rotation.z = (r() - 0.5) * 0.1; post.castShadow = true; s.add(post);
    if (i < 8) for (const y of [0.45, 0.95]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.07, 0.05), wood); rail.position.set(x + 0.8, y + (r() - 0.5) * 0.05, z - 0.06); rail.rotation.y = 0.075; s.add(rail); }
  }
  // a barn and a treeline far off, half lost in the haze
  const barn = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 4), std({ color: 0x4a3a32 })); barn.position.set(-9, 2, -24); s.add(barn);
  for (let i = 0; i < 26; i++) { const t = new THREE.Mesh(new THREE.SphereGeometry(1.4 + r() * 1.4, 8, 6), std({ color: 0x3a3a30 })); t.position.set(-22 + i * 1.8, 1.8 + r() * 1.2, -30 - r() * 3); s.add(t); }
  if (who === 'mother') { // her, at the top of the porch steps, under the porch roof; the house close behind her
    house.position.set(0.6, 0, -5.4); house.rotation.y = 0;
    for (const o of house.children.slice()) if (o !== body && o !== roof) house.remove(o); // a porch of its own, not the one from far off
    const lap = tex(canvas(256, 256, (g) => { g.fillStyle = '#ece8de'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 16) { const gr = g.createLinearGradient(0, y, 0, y + 16); gr.addColorStop(0, 'rgba(40,34,28,0.55)'); gr.addColorStop(0.18, 'rgba(40,34,28,0.08)'); gr.addColorStop(1, 'rgba(255,255,255,0.12)'); g.fillStyle = gr; g.fillRect(0, y, 256, 16); } for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(90,80,70,${r() * 0.18})`; g.fillRect(r() * 256, r() * 256, 4 + r() * 30, 1 + r() * 2); } }), 3);
    body.material = std({ map: lap, bumpMap: lap, bumpScale: 2 });
    const trim = std({ color: 0xf2efe8 }), deckM = std({ map: tex(canvas(128, 128, (g) => { g.fillStyle = '#8a7c6a'; g.fillRect(0, 0, 128, 128); for (let x = 0; x < 128; x += 11) { g.fillStyle = 'rgba(30,24,18,0.6)'; g.fillRect(x, 0, 1.5, 128); } for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '30,24,18' : '200,190,170'},${r() * 0.15})`; g.fillRect(r() * 128, r() * 128, 2, 6 + r() * 20); } }), 3) });
    const box = (w, h, d, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; s.add(o); return o; };
    const F = -2.9, Y = 0.5; // the house front, the porch floor
    box(6.4, 0.1, 1.75, deckM, 0.6, Y - 0.05, F + 0.875); box(6.4, Y - 0.1, 0.06, std({ color: 0x3a342c }), 0.6, (Y - 0.1) / 2, F + 1.72); // the deck, and the dark under it
    for (const [y, z] of [[Y * 2 / 3, F + 1.9], [Y / 3, F + 2.2]]) { box(1.7, y - 0.04, 0.3, std({ color: 0xd8d4cc }), 0.3, (y - 0.04) / 2, z); box(1.76, 0.05, 0.34, deckM, 0.3, y - 0.025, z + 0.02); } // two steps down: risers and treads
    box(6.6, 0.12, 2.1, trim, 0.6, 2.95, F + 1.0).rotation.x = -0.06; box(6.6, 0.22, 0.06, trim, 0.6, 2.86, F + 2.05); // the porch roof and its fascia
    for (const x of [-2.4, -0.7, 1.3, 3.6]) { box(0.13, 2.45, 0.13, trim, x, Y + 1.22, F + 1.65); box(0.2, 0.12, 0.2, trim, x, Y + 0.06, F + 1.65); box(0.2, 0.1, 0.2, trim, x, Y + 2.4, F + 1.65); } // turned posts, bases and caps
    for (const [x0, x1] of [[-2.4, -0.7], [1.3, 3.6]]) { // the railing, each side of the steps: two rails and the balusters between
      box(x1 - x0, 0.06, 0.07, trim, (x0 + x1) / 2, Y + 0.85, F + 1.65); box(x1 - x0, 0.05, 0.06, trim, (x0 + x1) / 2, Y + 0.12, F + 1.65);
      for (let x = x0 + 0.12; x < x1 - 0.06; x += 0.13) box(0.035, 0.72, 0.035, trim, x, Y + 0.48, F + 1.65);
    }
    const glass = std({ color: 0x0c0e10, roughness: 0.08, metalness: 0.4 }), lace = std({ color: 0xd8d4cc, roughness: 1, transparent: true, opacity: 0.7 });
    for (const x of [-1.55, 2.15]) { // two windows: trim, sashes, the lace behind
      box(0.95, 1.25, 0.04, glass, x, Y + 1.5, F + 0.01); box(0.86, 1.16, 0.02, lace, x, Y + 1.5, F - 0.02).scale.set(0.55, 1, 1); // (lace drawn back)
      for (const [w, h, dx, dy] of [[1.1, 0.1, 0, 0.67], [1.2, 0.08, 0, -0.67], [0.09, 1.34, 0.52, 0], [0.09, 1.34, -0.52, 0], [0.95, 0.05, 0, 0], [0.04, 1.25, 0, 0]]) box(w, h, 0.07, trim, x + dx, Y + 1.5 + dy, F + 0.04);
      for (const sx of [-1, 1]) box(0.32, 1.3, 0.04, std({ color: 0x4a4a46 }), x + sx * 0.7, Y + 1.5, F + 0.03); // the shutters
    }
    box(1.0, 2.1, 0.04, std({ color: 0x1c1a18, roughness: 0.6 }), 0.3, Y + 1.05, F + 0.01); // the door, open behind the screen
    for (const [w, h, dx, dy] of [[1.06, 0.07, 0, 2.08], [0.07, 2.12, 0.5, 1.05], [0.07, 2.12, -0.5, 1.05], [0.96, 0.06, 0, 1.0]]) box(w, h, 0.06, trim, 0.3 + dx, Y + dy, F + 0.12); // the screen door's frame
    box(0.94, 2.0, 0.01, std({ color: 0x2a2c2e, roughness: 1, transparent: true, opacity: 0.55 }), 0.3, Y + 1.04, F + 0.11); // its mesh
    // her rocking chair, a milk churn, a broom against the wall
    const oak = std({ color: 0x5a4632 }), cx = 2.5, cz = F + 0.75;
    box(0.5, 0.05, 0.45, oak, cx, Y + 0.45, cz, -0.5); for (let i = 0; i < 5; i++) box(0.04, 0.6, 0.03, oak, cx - 0.2 + i * 0.1, Y + 0.8, cz - 0.2, -0.5).rotation.x = -0.15;
    for (const sx of [-1, 1]) { const rk = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.02, 4, 16, 0.9), oak); rk.position.set(cx + sx * 0.2 * Math.cos(0.5), Y + 0.62, cz + sx * 0.2 * Math.sin(0.5)); rk.rotation.set(0, -0.5 + Math.PI / 2, -Math.PI / 2 - 0.45); rk.castShadow = true; s.add(rk); for (const dz of [-0.17, 0.17]) box(0.03, 0.42, 0.03, oak, cx + sx * 0.2 * Math.cos(0.5) + dz * Math.sin(0.5), Y + 0.22, cz + sx * 0.2 * Math.sin(0.5) - dz * Math.cos(0.5)); }
    const churn = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.6, 18), std({ color: 0x9a9a96, roughness: 0.4, metalness: 0.8 })); churn.position.set(-1.9, Y + 0.3, F + 0.4); churn.castShadow = true; s.add(churn);
    const neckC = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, 0.16, 18), churn.material); neckC.position.set(-1.9, Y + 0.68, F + 0.4); s.add(neckC);
    box(0.03, 1.3, 0.03, std({ color: 0x8a7a5a }), -1.05, Y + 0.62, F + 0.08).rotation.z = 0.12; box(0.24, 0.32, 0.06, std({ color: 0x9a8a5a, roughness: 1 }), -1.13, Y + 0.12, F + 0.08);
    const her = person({ h: 1.66, x: 0.3, z: F + 1.35, skin: 0xdcbca4, shirt: tex(canvas(64, 64, (g) => { g.fillStyle = '#4a5468'; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 50; i++) { g.fillStyle = r() < 0.5 ? '#9a9890' : '#2a3040'; g.beginPath(); g.arc(r() * 64, r() * 64, 1.2 + r() * 1.6, 0, 7); g.fill(); } }), 3), dress: true, apron: true, clasp: true, hair: 0x241a12, bun: true });
    her.position.y = Y; s.add(her);
    sun.position.set(-4, 7, 5); sun.intensity = 2.6; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -3 });
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100); cam.position.set(0.45, 1.35, 3.0); cam.lookAt(0.32, 1.6, -1.6);
    return { s, cam, face: her.userData.head };
  }
  // the three of them: John on the left, the farmer, Eddie on the right
  s.add(person({ h: 1.85, x: 0, skin: 0xd8b49a, shirt: plaid(), legs: denim('#26303e'), overalls: true, cap: 0x101010, squint: true, lines: true, arm: 0.1 }));
  s.add(person({ h: 1.3, x: -0.82, z: 0.25, turn: 0.12, skin: 0xe4c4aa, shirt: stripes(), legs: denim('#3a3a3a'), hair: 0x2a1c12, smile: 0, arm: 0.06 }));
  s.add(person({ h: 1.18, x: 0.8, z: 0.3, turn: -0.15, skin: 0xe6c6ac, shirt: tex(canvas(8, 8, (g) => { g.fillStyle = '#e8e4dc'; g.fillRect(0, 0, 8, 8); })), legs: denim('#2a3442'), overalls: true, cap: 0x8a8478, arm: 0.07 }));
  const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100); cam.position.set(0.15, 1.45, 4.6); cam.lookAt(0.1, 1.2, 0);
  return { s, cam, face: null };
}

// black and white, a little soft, grainy and darker at the corners, like an old print
function print(src, w, h, face = null) {
  return canvas(w, h, (g) => {
    g.filter = 'grayscale(1) contrast(1.12) brightness(0.98) blur(0.7px)'; g.drawImage(src, 0, 0, w, h); g.filter = 'none';
    const nt = canvas(256, 256, (x) => { const d = x.createImageData(256, 256), p = d.data; for (let i = 0; i < p.length; i += 4) { p[i] = p[i + 1] = p[i + 2] = 128 + (r() - 0.5) * 255; p[i + 3] = 255; } x.putImageData(d, 0, 0); });
    g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.7; g.fillStyle = g.createPattern(nt, 'repeat'); g.fillRect(0, 0, w, h); g.restore(); // grain (laid over: no reading back)
    const v = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.78); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
    if (face) { // her face scratched out with a nail: white gouges, back and forth, through the emulsion
      for (let i = 0; i < 110; i++) { g.strokeStyle = `rgba(240,236,228,${0.55 + r() * 0.4})`; g.lineWidth = 1 + r() * 2.5; g.beginPath(); const a0 = r() * 6.28, rr = face.r * (0.4 + r() * 0.7); g.moveTo(face.x + Math.cos(a0) * rr, face.y + Math.sin(a0) * rr); g.lineTo(face.x - Math.cos(a0 + (r() - 0.5)) * rr, face.y - Math.sin(a0 + (r() - 0.5)) * rr); g.stroke(); }
    }
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1; for (let i = 0; i < 5; i++) { g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 12, y + 20 + r() * 90); g.stroke(); } // a few scratches
  });
}

// painted instead, when there is no renderer to photograph it with
function painted(w, h) {
  return canvas(w, h, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.55); sky.addColorStop(0, '#c4c0b8'); sky.addColorStop(1, '#a8a49a'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6e6658'; g.fillRect(0, h * 0.52, w, h * 0.48);
    g.fillStyle = '#e2ded6'; g.fillRect(w * 0.66, h * 0.28, w * 0.3, h * 0.26); g.fillStyle = '#2a2622'; g.beginPath(); g.moveTo(w * 0.63, h * 0.29); g.lineTo(w * 0.81, h * 0.17); g.lineTo(w * 0.99, h * 0.29); g.fill();
    g.fillStyle = '#1a1816'; for (const x of [0.7, 0.8, 0.9]) g.fillRect(w * x, h * 0.34, w * 0.04, h * 0.06);
    g.strokeStyle = '#4a4238'; g.lineWidth = 4; for (const y of [0.45, 0.49]) { g.beginPath(); g.moveTo(0, h * y); g.lineTo(w * 0.6, h * (y + 0.01)); g.stroke(); }
    const man = (x, ht, cap) => {
      const top = h * 0.95 - ht; g.fillStyle = '#2a2a2e'; g.fillRect(x - ht * 0.1, top + ht * 0.45, ht * 0.2, ht * 0.55); // legs
      g.fillStyle = '#5a5050'; g.fillRect(x - ht * 0.12, top + ht * 0.16, ht * 0.24, ht * 0.34); // shirt
      g.fillStyle = '#c8b8a8'; g.beginPath(); g.ellipse(x, top + ht * 0.09, ht * 0.06, ht * 0.075, 0, 0, 7); g.fill();
      g.fillStyle = cap; g.beginPath(); g.ellipse(x, top + ht * 0.05, ht * 0.065, ht * 0.04, 0, Math.PI, 0); g.fill();
    };
    man(w * 0.5, h * 0.62, '#101010'); man(w * 0.33, h * 0.44, '#2a1c12'); man(w * 0.67, h * 0.4, '#8a8478');
  });
}

const kept = {};
export function farmPhoto(w, h) { return THREE.ownRandom(() => takePhoto(w, h, 'family')); } // (its own random numbers: making it never moves the game's)
export function motherPhoto(w, h) { return THREE.ownRandom(() => takePhoto(w, h, 'mother')); }
function takePhoto(w, h, who) {
  if (kept[who] && kept[who].width === w) return kept[who];
  const ren = THREE.studio && THREE.studio.renderer;
  let shot = null, face = null;
  if (ren) {
    try {
      const { s, cam, face: head } = farm(who), W = w * 2, H = h * 2;
      cam.aspect = W / H; cam.updateProjectionMatrix();
      if (head) { s.updateMatrixWorld(true); cam.updateMatrixWorld(true); const p = head.getWorldPosition(new THREE.Vector3()), q = p.clone().add(new THREE.Vector3(0, 0.13, 0)).project(cam); p.project(cam); face = { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h, r: Math.abs(q.y - p.y) / 2 * h * 1.5 }; }
      const rt = new THREE.WebGLRenderTarget(W, H); rt.texture.colorSpace = THREE.SRGBColorSpace;
      const was = ren.getRenderTarget(); ren.setRenderTarget(rt); ren.render(s, cam);
      const buf = new Uint8Array(W * H * 4); ren.readRenderTargetPixels(rt, 0, 0, W, H, buf); ren.setRenderTarget(was); rt.dispose();
      s.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      shot = canvas(W, H, (g) => { const d = g.createImageData(W, H); for (let y = 0; y < H; y++) d.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); g.putImageData(d, 0, 0); });
    } catch { shot = null; }
  }
  const out = print(shot || painted(w, h), w, h, face || (who === 'mother' ? { x: w * 0.5, y: h * 0.3, r: h * 0.06 } : null));
  if (shot) kept[who] = out;
  return out;
}
