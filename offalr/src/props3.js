// B9, the Quiet Line, as the smokehouse: what's made down here once the line's done with it. Smoke chambers hung
// with meat gone black, the fireboxes still banked, the rendering vats where the fat goes, the bunk room where the last
// of the night shift slept because they weren't allowed up, and the shrine they made for the ones who went missing.
// (Phong everywhere: the remaster turns it into its own materials; Classic keeps it as it is.)
import * as THREE from 'three';
import { canvas } from './textures.js';

const phong = (o) => new THREE.MeshPhongMaterial(o);
const tex = (w, h, draw) => { const { c, g } = canvas(w, h); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const mk = (geo, mat, cast = true) => { const o = new THREE.Mesh(geo, mat); o.castShadow = cast; o.receiveShadow = true; return o; };
const at = (o, x, y, z, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, n = 12) => new THREE.CylinderGeometry(r0, r1, h, n);

function M(mats) {
  if (mats.p3) return mats.p3;
  mats.p3 = {
    soot: phong({ color: 0x1a1612, shininess: 12, specular: 0x111111 }),
    iron: phong({ color: 0x2a2826, shininess: 50, specular: 0x333333 }),
    steel: phong({ color: 0x6a6e70, shininess: 90, specular: 0x666666 }),
    smoked: phong({ color: 0x1e120a, shininess: 70, specular: 0x332211 }), // meat smoked black-red, a lacquer of fat on it
    sausage: phong({ color: 0x2e1a0e, shininess: 80, specular: 0x443322 }),
    fat: phong({ color: 0x9a8a60, shininess: 110, specular: 0x887755 }),
    ember: new THREE.MeshBasicMaterial({ color: 0xff5a10 }),
    ash: phong({ color: 0x4a4440, shininess: 2 }),
    brick: phong({ shininess: 6, map: tex(128, 128, (g, w, h) => {
      g.fillStyle = '#2a1a14'; g.fillRect(0, 0, w, h);
      for (let y = 0, r = 0; y < h; y += 16, r++) for (let x = r % 2 ? -16 : 0; x < w; x += 32) { g.fillStyle = `rgb(${70 + Math.random() * 30 | 0},${30 + Math.random() * 14 | 0},${20 + Math.random() * 10 | 0})`; g.fillRect(x + 1, y + 1, 30, 14); }
      const s = g.createLinearGradient(0, 0, 0, h); s.addColorStop(0, 'rgba(0,0,0,.85)'); s.addColorStop(0.6, 'rgba(0,0,0,.35)'); s.addColorStop(1, 'rgba(0,0,0,.1)'); g.fillStyle = s; g.fillRect(0, 0, w, h); // soot up the front
    }) }),
    mattress: phong({ shininess: 4, map: tex(64, 128, (g, w, h) => {
      g.fillStyle = '#9a9070'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(60,50,30,.5)'; for (let x = 4; x < w; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(${90 + Math.random() * 40 | 0},50,20,${0.2 + Math.random() * 0.3})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * 14, 6 + Math.random() * 18, 0, 0, 7); g.fill(); }
    }) }),
    blanket: phong({ color: 0x3a4038, shininess: 2 }),
    wood: phong({ color: 0x4a3420, shininess: 10 }),
    hat: phong({ color: 0xd8a820, shininess: 60, specular: 0x444422 }),
    wax: phong({ color: 0xe8e0c8, shininess: 30 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffc860 }),
    paper: phong({ color: 0xd8d0b8, shininess: 2, side: THREE.DoubleSide }),
  };
  return mats.p3;
}

// a smoking rack: a steel frame two metres long with three rails, hung with joints and strings of sausage, all of it
// gone black in the smoke. Origin at the floor, along X
export function smokeRack(mats, rng) {
  const m = M(mats), g = new THREE.Group();
  for (const x of [-0.95, 0.95]) for (const z of [-0.35, 0.35]) g.add(at(mk(box(0.05, 2.2, 0.05), m.iron), x, 1.1, z));
  for (const z of [-0.3, 0, 0.3]) { const rail = mk(cyl(0.015, 0.015, 1.95, 6), m.iron); rail.rotation.z = Math.PI / 2; g.add(at(rail, 0, 2.05, z, 0, 0, Math.PI / 2)); }
  for (const z of [-0.3, 0, 0.3]) for (let x = -0.8; x <= 0.81; x += 0.2 + rng() * 0.12) {
    const hook = mk(cyl(0.004, 0.004, 0.12, 4), m.iron, false); g.add(at(hook, x, 1.98, z));
    if (rng() < 0.55) { // a joint: a fat, tapered lump, the string still round it
      const j = mk(new THREE.SphereGeometry(0.09 + rng() * 0.05, 9, 7), m.smoked); j.scale.set(0.8, 1.6 + rng() * 0.6, 0.7); g.add(at(j, x, 1.72 - rng() * 0.12, z, 0, rng() * 3, (rng() - 0.5) * 0.15));
    } else { // a string of links
      let y = 1.9; const n = 4 + ((rng() * 4) | 0);
      for (let k = 0; k < n; k++) { const s = mk(new THREE.CapsuleGeometry(0.022, 0.09, 3, 6), m.sausage, false); g.add(at(s, x + (k % 2 ? 0.012 : -0.012), y - 0.06, z, 0, 0, (k % 2 ? 0.12 : -0.12))); y -= 0.13; }
    }
  }
  // the drip tray underneath, set solid with fat
  g.add(at(mk(box(1.95, 0.05, 0.75), m.iron), 0, 0.06, 0));
  g.add(at(mk(box(1.85, 0.02, 0.65), m.fat, false), 0, 0.09, 0));
  return g;
}

// a firebox in the wall: a brick hearth, an iron door hanging open on the embers. Origin on the wall, facing +Z
export function firebox(mats) {
  const m = M(mats), g = new THREE.Group();
  g.add(at(mk(box(1.3, 1.1, 0.6), m.brick), 0, 0.55, 0.3));
  g.add(at(mk(box(0.6, 0.45, 0.02), new THREE.MeshBasicMaterial({ color: 0x080302 }), false), 0, 0.42, 0.605)); // the mouth
  const coals = new THREE.Group();
  for (let i = 0; i < 14; i++) { const c = mk(new THREE.IcosahedronGeometry(0.04 + Math.random() * 0.03, 0), i % 3 ? m.ember : m.ash, false); c.position.set((Math.random() - 0.5) * 0.48, 0.24 + Math.random() * 0.05, 0.5 + (Math.random() - 0.5) * 0.1); coals.add(c); }
  g.add(coals);
  const door = mk(box(0.6, 0.45, 0.03), m.iron); g.add(at(door, -0.52, 0.42, 0.88, 0, -1.9, 0));
  g.add(at(mk(cyl(0.12, 0.12, 2.0, 10), m.soot), 0.4, 2.1, 0.25)); // the flue, up into the dark
  g.userData.glow = new THREE.Vector3(0, 0.45, 0.8);
  return g;
}

// a rendering vat: a riveted steel tank as tall as a man, a ladder up its side, a pipe off the top, the lip crusted
// with fat. Origin at the floor, centred
export function renderVat(mats, rng) {
  const m = M(mats), g = new THREE.Group();
  const r = 0.75 + rng() * 0.15;
  g.add(at(mk(cyl(r, r, 2.0, 20), m.steel), 0, 1.0, 0));
  for (const y of [0.3, 1.0, 1.7]) g.add(at(mk(new THREE.TorusGeometry(r + 0.01, 0.025, 5, 24), m.iron, false), 0, y, 0, Math.PI / 2)); // bands
  g.add(at(mk(new THREE.TorusGeometry(r, 0.05, 6, 24), m.fat, false), 0, 2.0, 0, Math.PI / 2)); // the crust round the lip
  g.add(at(mk(cyl(r - 0.04, r - 0.04, 0.02, 20), m.fat, false), 0, 1.92, 0)); // the surface, set
  for (let i = 0; i < 8; i++) { const a = rng() * 6.28, d = mk(cyl(0.03, 0.01, 0.2 + rng() * 0.5, 5), m.fat, false); g.add(at(d, Math.cos(a) * (r + 0.02), 1.85 - rng() * 0.3, Math.sin(a) * (r + 0.02))); } // runs down the side
  const lad = new THREE.Group(); // the ladder
  for (const s of [-0.18, 0.18]) lad.add(at(mk(box(0.03, 2.2, 0.03), m.iron), s, 1.1, 0));
  for (let y = 0.25; y < 2.1; y += 0.28) lad.add(at(mk(cyl(0.012, 0.012, 0.36, 5), m.iron, false), 0, y, 0, 0, 0, Math.PI / 2));
  g.add(at(lad, 0, 0, r + 0.06));
  const pipe = mk(cyl(0.08, 0.08, 1.6, 10), m.iron); g.add(at(pipe, -0.3, 2.6, 0, 0, 0, 0.5));
  g.add(at(mk(cyl(0.18, 0.18, 0.05, 12), m.fat, false), r + 0.4, 0.03, -0.2)); // a spill
  return g;
}

// a bunk bed: steel frame, two thin mattresses, a blanket thrown back, boots under it. Origin at the floor, along X
export function bunkBed(mats, rng) {
  const m = M(mats), g = new THREE.Group();
  for (const x of [-0.95, 0.95]) for (const z of [-0.42, 0.42]) g.add(at(mk(box(0.04, 1.75, 0.04), m.iron), x, 0.875, z));
  for (const y of [0.4, 1.35]) {
    g.add(at(mk(box(1.95, 0.04, 0.9), m.iron), 0, y, 0));
    g.add(at(mk(box(1.85, 0.1, 0.82), m.mattress), 0, y + 0.07, 0));
    if (rng() < 0.8) { const b = mk(box(1.1, 0.04, 0.86), m.blanket, false); g.add(at(b, 0.35 + rng() * 0.2, y + 0.14, 0, 0, 0, (rng() - 0.5) * 0.06)); }
    g.add(at(mk(box(0.35, 0.08, 0.5), m.paper), -0.72, y + 0.16, 0)); // a pillow, more or less
  }
  for (const s of [-0.1, 0.1]) g.add(at(mk(box(0.12, 0.14, 0.28), m.soot), 0.4 + s, 0.07, 0.62)); // boots, side by side
  return g;
}

// the shrine: a trestle table against the wall, candles burned down to stubs, hard hats in a row, and above it the
// photographs of the missing, pinned up with whatever was to hand. Origin on the wall, facing +Z
export function shrine(mats, rng) {
  const m = M(mats), g = new THREE.Group();
  g.add(at(mk(box(1.5, 0.05, 0.5), m.wood), 0, 0.8, 0.3));
  for (const x of [-0.65, 0.65]) g.add(at(mk(box(0.05, 0.8, 0.45), m.wood), x, 0.4, 0.3));
  for (let i = 0; i < 9; i++) {
    const h = 0.04 + rng() * 0.14, x = (rng() - 0.5) * 1.3, z = 0.15 + rng() * 0.3;
    g.add(at(mk(cyl(0.022, 0.025, h, 8), m.wax, false), x, 0.825 + h / 2, z));
    g.add(at(mk(new THREE.ConeGeometry(0.01, 0.035, 6), m.flame, false), x, 0.84 + h + 0.015, z));
    g.add(at(mk(cyl(0.035, 0.04, 0.008, 8), m.wax, false), x, 0.83, z)); // the wax run out round it
  }
  for (let i = 0; i < 4; i++) { const hat = mk(new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.hat); g.add(at(hat, -0.55 + i * 0.37, 0, 0.75 + (i % 2) * 0.08)); } // on the floor in front
  // the photographs: faded faces, a name under each, a line through some of them
  const names = ['D. HOLT', 'R. MARSH', 'T. KEANE', 'J. ODDIE', 'L. PRYCE', 'M. VOSS', 'S. BRANDT', 'C. ELLERY', 'P. NUNN', 'A. CRANE'];
  for (let i = 0; i < 10; i++) {
    const n = names[i], crossed = rng() < 0.5;
    const ph = tex(64, 80, (c, w, h) => {
      c.fillStyle = '#e8e2d0'; c.fillRect(0, 0, w, h);
      c.fillStyle = `rgb(${110 + rng() * 40 | 0},${100 + rng() * 30 | 0},${80 + rng() * 30 | 0})`; c.fillRect(5, 5, w - 10, h - 26);
      c.fillStyle = '#4a3a2a'; c.beginPath(); c.ellipse(w / 2, 30, 12, 15, 0, 0, 7); c.fill(); c.fillRect(w / 2 - 18, 44, 36, 14);
      c.fillStyle = '#1a1a1a'; c.font = 'bold 9px monospace'; c.textAlign = 'center'; c.fillText(n, w / 2, h - 8);
      if (crossed) { c.strokeStyle = '#7a0a06'; c.lineWidth = 3; c.beginPath(); c.moveTo(4, 4); c.lineTo(w - 4, h - 20); c.stroke(); }
    });
    const p = mk(new THREE.PlaneGeometry(0.16, 0.2), phong({ map: ph, shininess: 20 }), false);
    g.add(at(p, -0.62 + (i % 5) * 0.31 + (rng() - 0.5) * 0.05, 1.35 + Math.floor(i / 5) * 0.27 + (rng() - 0.5) * 0.04, 0.012, 0, 0, (rng() - 0.5) * 0.25));
  }
  // and over them, painted on the wall by hand
  const sign = tex(256, 48, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(150,12,8,0.9)'; c.font = 'bold 34px "Comic Sans MS", "Segoe Print", cursive'; c.textAlign = 'center'; c.fillText('WHERE ARE THEY', w / 2, 36); });
  g.add(at(mk(new THREE.PlaneGeometry(1.4, 0.26), phong({ map: sign, transparent: true, shininess: 2 }), false), 0, 2.0, 0.011));
  g.userData.glow = new THREE.Vector3(0, 1.0, 0.35);
  return g;
}
