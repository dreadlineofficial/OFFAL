// Props for the floors that aren't the meatworks: the hospital wing (morgue), the offices, the drains and the
// deep freeze. Built from boxes and cylinders like everything else; materials are made the first time they're needed.
import * as THREE from 'three';
import { patchWet } from './wet.js';
import { keepsakeModel } from './keepsakes3d.js';
import { WALL_H } from './config.js';
import { mesh, geo, box, sph, cyl, cap, decal, makeBody, trayBody, meatChunk, severedArm, layOn } from './props.js';
import { canvas, BLOOD, wallSplat } from './textures.js';
import { vendingHD } from './vendr.js';
import { forkliftHD } from './forklift.js';

const phong = (o) => new THREE.MeshPhongMaterial(o);
function M(mats) {
  if (mats.p2) return mats.p2;
  const tex = (w, h, draw) => { const { c, g } = canvas(w, h); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const p = {
    porcelain: phong({ color: 0xd8d6cc, shininess: 120, specular: 0x666666 }),
    chrome: phong({ color: 0xa8b0b4, shininess: 140, specular: 0xaaaaaa }),
    greenMetal: phong({ color: 0x5e7262, shininess: 40, specular: 0x222222 }),
    beigeMetal: phong({ color: 0x8e8670, shininess: 30, specular: 0x222222 }),
    wood: phong({ color: 0x5a3a20, shininess: 20, specular: 0x111111 }),
    plastic: phong({ color: 0xb8b09a, shininess: 30, specular: 0x222222 }),
    black: phong({ color: 0x141414, shininess: 40, specular: 0x222222 }),
    fabric: phong({ color: 0x4a5464, shininess: 4 }),
    chairFabric: phong({ color: 0x3a2e2a, shininess: 4 }),
    curtain: phong({ color: 0x8aa294, side: THREE.DoubleSide, shininess: 6, transparent: true, opacity: 0.92 }),
    paper: phong({ color: 0xd8d2c0, side: THREE.DoubleSide, shininess: 2 }),
    glass: phong({ color: 0x9ab0a8, transparent: true, opacity: 0.35, shininess: 120, specular: 0x888888, depthWrite: false }),
    formalin: phong({ color: 0xb0a860, transparent: true, opacity: 0.55, shininess: 100, depthWrite: false }),
    rackOrange: phong({ color: 0xb0561a, shininess: 30, specular: 0x222222 }),
    rackBlue: phong({ color: 0x1e3a6a, shininess: 30, specular: 0x222222 }),
    cardboard: phong({ color: 0x8a6a42, shininess: 4 }),
    wrap: phong({ color: 0xd8dce0, transparent: true, opacity: 0.8, shininess: 110, specular: 0x999999 }),
    ice: phong({ color: 0xd8eef8, transparent: true, opacity: 0.75, shininess: 140, specular: 0xffffff }),
    yellow: phong({ color: 0xc89a1a, shininess: 40, specular: 0x333333 }),
    pipe: phong({ color: 0x3a3a30, shininess: 50, specular: 0x333333 }),
    slime: phong({ color: 0x1e2a10, shininess: 120, specular: 0x445533 }),
    rag: phong({ color: 0x4a3e30, shininess: 4 }),
    screen: new THREE.MeshBasicMaterial({ color: 0x0a120c }),
    screenOn: new THREE.MeshBasicMaterial({ color: 0x2a6a40 }),
    vend: new THREE.MeshBasicMaterial({ color: 0x9a3020 }),
    exitSign: new THREE.MeshBasicMaterial({ color: 0x30c050 }),
  };
  p.whiteboard = phong({ map: tex(256, 160, (g, w, h) => {
    g.fillStyle = '#d8d8d0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2a3a6a'; g.lineWidth = 3; g.font = 'bold 22px "Courier New", monospace'; g.fillStyle = '#2a3a6a';
    g.fillText('Q4 THROUGHPUT', 16, 32);
    g.strokeRect(16, 44, 140, 90);
    g.beginPath(); g.moveTo(20, 120); g.lineTo(60, 100); g.lineTo(90, 106); g.lineTo(150, 50); g.stroke(); // the line only goes up
    g.fillStyle = '#7a1010'; g.font = 'bold 18px "Courier New", monospace'; g.fillText('HEADCOUNT', 170, 60);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 5; k++) g.fillRect(172 + k * 12, 72 + i * 18, 3, 14); // tallies
    wallSplat(g, 200, 140, 14, Math.random, BLOOD.dark);
  }), shininess: 80, specular: 0x444444 });
  p.files = phong({ map: tex(64, 64, (g) => { g.fillStyle = '#c8b890'; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 8; i++) { g.fillStyle = ['#a08a5a', '#8a2a20', '#2a4a7a', '#c8c0a0'][i % 4]; g.fillRect(i * 8, 0, 6, 64); } }), shininess: 4 });
  p.boxes = phong({ map: tex(64, 64, (g) => { g.fillStyle = '#8a6a42'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#3a2a1a'; g.font = 'bold 9px monospace'; g.fillText('HOLLOW', 6, 22); g.fillText('PINES', 6, 34); g.fillText('-20°C', 6, 50); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, 28, 64, 4); }), shininess: 4 });
  // the water: murky, with scum drifting on it in patches, and a ripple normal map so the torch glints off it
  const wt = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#0e130a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 40; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${40 + Math.random() * 30},${44 + Math.random() * 20},${22},${0.25 + Math.random() * 0.3})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) g.fillRect(x - r + dx, y - r + dy, r * 2, r * 2); }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(90,96,60,${Math.random() * 0.35})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1); } // flecks of scum
  });
  wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
  p.water = phong({ map: wt, normalMap: rippleNormals(), normalScale: new THREE.Vector2(0.35, 0.35), color: 0x7a8466, transparent: true, opacity: 0.9, shininess: 260, specular: 0xd0d4c0, depthWrite: false });
  mats.p2 = p;
  return p;
}
export const p2mats = M;

const g0 = () => new THREE.Group();
const at = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; return o; };

// ---------- hospital wing ----------
export function ivStand(mats, rng) {
  const m = M(mats), g = g0();
  g.add(at(mesh(cyl(0.012, 0.012, 1.9, 6), m.chrome), 0, 0.95, 0));
  for (let i = 0; i < 5; i++) { const leg = mesh(box(0.32, 0.02, 0.03), m.chrome); leg.position.set(Math.cos(i * 1.257) * 0.15, 0.04, Math.sin(i * 1.257) * 0.15); leg.rotation.y = -i * 1.257; g.add(leg); }
  g.add(at(mesh(box(0.3, 0.012, 0.012), m.chrome, false), 0, 1.88, 0));
  const bag = mesh(cap(0.06, 0.12), rng() < 0.6 ? phong({ color: 0x701010, transparent: true, opacity: 0.8, shininess: 100 }) : m.glass, false);
  bag.scale.z = 0.4;
  g.add(at(bag, 0.12, 1.7, 0));
  const line = mesh(cyl(0.003, 0.003, 1.2, 4), m.glass, false);
  line.rotation.z = 0.15;
  g.add(at(line, 0.18, 1.05, 0));
  return g;
}
export function instrumentCart(mats, rng) {
  const m = M(mats), g = g0();
  for (const y of [0.35, 0.85]) g.add(at(mesh(box(0.8, 0.025, 0.45), m.chrome), 0, y, 0));
  for (const [x, z] of [[-0.38, -0.2], [0.38, -0.2], [-0.38, 0.2], [0.38, 0.2]]) { g.add(at(mesh(cyl(0.01, 0.01, 0.85, 5), m.chrome, false), x, 0.45, z)); g.add(at(mesh(sph(0.03, 6), m.black, false), x, 0.03, z)); }
  // the tools: blades, a saw, clamps, a rib spreader, and the towel they were wiped on
  for (let i = 0; i < 6; i++) { const t = mesh(box(0.16 + rng() * 0.1, 0.008, 0.015), mats.steel, false); t.position.set(-0.3 + i * 0.1, 0.875, (rng() - 0.5) * 0.25); t.rotation.y = (rng() - 0.5) * 0.4; g.add(t); }
  const saw = g0(); saw.add(mesh(box(0.28, 0.06, 0.006), mats.steel, false)); const h = mesh(box(0.08, 0.05, 0.03), m.black, false); h.position.x = -0.18; saw.add(h); g.add(at(saw, 0.15, 0.9, 0.1, 0.3));
  const towel = mesh(box(0.3, 0.02, 0.25), phong({ color: 0x7a1a14, shininess: 30 }), false);
  g.add(at(towel, -0.15, 0.37, 0.05, 0.4));
  g.add(at(mesh(cyl(0.1, 0.08, 0.06, 10), m.chrome, false), 0.22, 0.4, 0.02)); // a kidney dish
  return g;
}
// against a wall: origin at the wall, facing +Z
export function sink(mats, rng) {
  const m = M(mats), g = g0();
  const basin = mesh(box(0.55, 0.18, 0.42), m.porcelain);
  g.add(at(basin, 0, 0.82, 0.24));
  g.add(at(mesh(box(0.45, 0.02, 0.32), phong({ color: 0x3a1010, shininess: 90 }), false), 0, 0.915, 0.25)); // what's in it
  g.add(at(mesh(cyl(0.015, 0.015, 0.2, 6), m.chrome, false), 0, 1.0, 0.06));
  const tap = mesh(cyl(0.012, 0.012, 0.16, 6), m.chrome, false); tap.rotation.x = Math.PI / 2; g.add(at(tap, 0, 1.08, 0.13));
  g.add(at(mesh(cyl(0.03, 0.03, 0.7, 6), m.porcelain), 0, 0.37, 0.18)); // the pedestal
  const mirror = mesh(box(0.45, 0.6, 0.02), phong({ color: 0x3a4044, shininess: 140, specular: 0xbbbbbb }), false);
  g.add(at(mirror, 0, 1.55, 0.02));
  if (rng() < 0.5) { const crack = mesh(box(0.004, 0.5, 0.025), m.black, false); crack.rotation.z = 0.6; g.add(at(crack, 0.05, 1.55, 0.02)); }
  return g;
}
export function filingCabinet(mats, rng, beige = false) {
  const m = M(mats), g = g0(), body = beige ? m.beigeMetal : m.greenMetal;
  g.add(at(mesh(box(0.48, 1.32, 0.6), body), 0, 0.66, 0));
  for (let i = 0; i < 4; i++) {
    const open = rng() < 0.15 ? 0.25 + rng() * 0.2 : 0;
    const dr = g0();
    dr.add(mesh(box(0.44, 0.28, 0.02), body, false));
    dr.add(at(mesh(box(0.12, 0.02, 0.03), m.chrome, false), 0, 0.06, 0.02));
    if (open) { const f = mesh(box(0.4, 0.24, open), m.files, false); f.position.z = -open / 2; dr.add(f); }
    g.add(at(dr, 0, 0.18 + i * 0.32, 0.3 + open));
  }
  return g;
}
export function wheelchair(mats, rng) {
  const m = M(mats), g = g0();
  g.add(at(mesh(box(0.45, 0.05, 0.42), m.chairFabric), 0, 0.5, 0));
  const back = mesh(box(0.45, 0.45, 0.04), m.chairFabric); back.rotation.x = -0.15; g.add(at(back, 0, 0.75, -0.22));
  for (const sx of [-1, 1]) {
    const wh = mesh(geo('wheel', () => new THREE.TorusGeometry(0.29, 0.02, 5, 16)), m.black, false); wh.rotation.y = Math.PI / 2; g.add(at(wh, sx * 0.27, 0.3, -0.05));
    g.add(at(mesh(sph(0.05, 6), m.black, false), sx * 0.2, 0.05, 0.3));
    g.add(at(mesh(box(0.02, 0.02, 0.45), m.chrome, false), sx * 0.24, 0.65, 0.02));
  }
  return g;
}
// a curtain on a ceiling rail, drawn round a bed; origin on the floor at the middle of the rail
export function curtain(mats, rng, len = 1.9) {
  const m = M(mats), g = g0();
  g.add(at(mesh(box(len, 0.03, 0.04), m.chrome, false), 0, WALL_H - 0.6, 0));
  const pg = new THREE.PlaneGeometry(len, 2.1, 24, 1);
  const pos = pg.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 9) * 0.06);
  pg.computeVertexNormals();
  const cu = mesh(pg, m.curtain, false);
  g.add(at(cu, 0, WALL_H - 0.6 - 1.05, 0));
  if (rng() < 0.6) { // a hand dragged down it
    const { c, g: cg } = canvas(64, 128); cg.fillStyle = `rgba(${BLOOD.dark},.8)`; for (let k = 0; k < 4; k++) cg.fillRect(20 + k * 7, 10, 4, 100 + Math.random() * 18);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.floorOnly = true;
    const smear = mesh(new THREE.PlaneGeometry(0.3, 0.9), new THREE.MeshPhongMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide }), false);
    g.add(at(smear, (rng() - 0.5) * len * 0.6, 1.3, 0.07));
  }
  return g;
}
// a bed with somebody under the sheet (or on top of it)
export function hospitalBed(mats, rng) {
  const m = M(mats), g = g0();
  g.add(at(mesh(box(0.95, 0.12, 2.0), m.porcelain), 0, 0.55, 0));
  for (const [x, z] of [[-0.42, -0.95], [0.42, -0.95], [-0.42, 0.95], [0.42, 0.95]]) g.add(at(mesh(cyl(0.02, 0.02, 0.55, 5), m.chrome, false), x, 0.27, z));
  const head = mesh(box(0.95, 0.5, 0.04), m.chrome); g.add(at(head, 0, 0.85, -1.0));
  // head on the pillow end, the whole of it on the mattress
  const body = trayBody(mats, rng);
  g.add(body);
  layOn(body, -0.47, 0.47, -0.96, 1.0, 0.61);
  return g;
}
// specimen jars on a shelf: things kept in fluid that should not have been kept
export function specimenShelf(mats, rng) {
  const m = M(mats), g = g0();
  for (const y of [0.5, 1.1, 1.7]) g.add(at(mesh(box(1.4, 0.03, 0.35), m.greenMetal), 0, y, 0.18));
  for (const sx of [-1, 1]) g.add(at(mesh(box(0.03, 1.9, 0.35), m.greenMetal), sx * 0.7, 0.95, 0.18));
  for (const y of [0.5, 1.1, 1.7]) for (let i = 0; i < 4; i++) {
    if (rng() < 0.25) continue;
    const h = 0.22 + rng() * 0.12;
    g.add(at(mesh(cyl(0.08, 0.08, h, 10), m.formalin, false), -0.5 + i * 0.33, y + 0.015 + h / 2, 0.18));
    const thing = rng() < 0.5 ? mesh(sph(0.05, 8), mats.meatPale, false) : mesh(cap(0.025, 0.08), mats.gut, false);
    g.add(at(thing, -0.5 + i * 0.33, y + 0.05 + h * 0.4, 0.18));
    g.add(at(mesh(cyl(0.085, 0.085, 0.03, 10), m.black, false), -0.5 + i * 0.33, y + 0.03 + h, 0.18));
  }
  return g;
}

// ---------- offices ----------
export function officeChair(mats, rng) {
  const m = M(mats), g = g0();
  g.add(at(mesh(box(0.46, 0.08, 0.46), m.chairFabric), 0, 0.48, 0));
  const back = mesh(box(0.44, 0.55, 0.06), m.chairFabric); back.rotation.x = -0.12; g.add(at(back, 0, 0.82, -0.22));
  g.add(at(mesh(cyl(0.025, 0.025, 0.4, 6), m.black, false), 0, 0.26, 0));
  for (let i = 0; i < 5; i++) { const leg = mesh(box(0.3, 0.025, 0.03), m.black, false); leg.position.set(Math.cos(i * 1.257) * 0.14, 0.05, Math.sin(i * 1.257) * 0.14); leg.rotation.y = -i * 1.257; g.add(leg); }
  return g;
}
// a desk with a dead terminal on it; origin centre, facing +Z (the chair side)
export function desk(mats, rng) {
  const m = M(mats), g = g0();
  g.add(at(mesh(box(1.5, 0.05, 0.75), m.wood), 0, 0.74, 0));
  g.add(at(mesh(box(1.46, 0.6, 0.03), m.wood), 0, 0.42, -0.35));
  for (const sx of [-1, 1]) g.add(at(mesh(box(0.04, 0.72, 0.72), m.wood), sx * 0.72, 0.36, 0));
  const ped = mesh(box(0.42, 0.68, 0.66), m.beigeMetal); g.add(at(ped, 0.48, 0.36, 0));
  for (let i = 0; i < 3; i++) g.add(at(mesh(box(0.1, 0.015, 0.02), m.chrome, false), 0.48, 0.18 + i * 0.22, 0.34));
  // the terminal
  const mon = g0();
  mon.add(mesh(box(0.42, 0.36, 0.38), m.plastic));
  const scr = mesh(box(0.32, 0.25, 0.01), rng() < 0.15 ? m.screenOn : m.screen, false); scr.position.set(0, 0.02, 0.195); mon.add(scr);
  g.add(at(mon, -0.2 + (rng() - 0.5) * 0.2, 0.95, -0.12, (rng() - 0.5) * 0.4));
  g.add(at(mesh(box(0.45, 0.025, 0.15), m.plastic, false), -0.15, 0.78, 0.18, (rng() - 0.5) * 0.3));
  for (let i = 0; i < 3 + (rng() * 4 | 0); i++) { const p = mesh(box(0.21, 0.004, 0.29), m.paper, false); g.add(at(p, 0.35 + (rng() - 0.5) * 0.4, 0.768 + i * 0.004, (rng() - 0.5) * 0.4, rng() * 6)); }
  if (rng() < 0.6) g.add(at(mesh(cyl(0.04, 0.035, 0.1, 8), m.porcelain, false), 0.6, 0.82, 0.15)); // a mug
  if (rng() < 0.25) g.add(decal(mats.splat[(rng() * 4) | 0], 0.6, 0.1, 0.1, rng() * 6, 0.77)); // on the desk
  const ch = officeChair(mats, rng);
  g.add(at(ch, (rng() - 0.5) * 0.4, 0, 0.6 + rng() * 0.2, Math.PI + (rng() - 0.5) * 1.2));
  if (rng() < 0.35) ch.rotation.z = Math.PI / 2, ch.position.y = 0.25; // knocked over
  return g;
}
// a cubicle wall segment, len long, centred, 1.35 high
export function partition(mats, len) {
  const m = M(mats), g = g0();
  g.add(at(mesh(box(len, 1.35, 0.06), m.fabric), 0, 0.675, 0));
  g.add(at(mesh(box(len, 0.03, 0.08), m.chrome, false), 0, 1.36, 0));
  return g;
}
export function waterCooler(mats) {
  const m = M(mats), g = g0();
  g.add(at(mesh(box(0.32, 0.95, 0.32), m.plastic), 0, 0.475, 0));
  g.add(at(mesh(cyl(0.13, 0.13, 0.42, 10), phong({ color: 0x6a8a9a, transparent: true, opacity: 0.55, shininess: 120 }), false), 0, 1.16, 0));
  return g;
}
export function deadPlant(mats, rng) {
  const m = M(mats), g = g0();
  g.add(at(mesh(cyl(0.18, 0.13, 0.35, 8), m.plastic), 0, 0.175, 0));
  for (let i = 0; i < 7; i++) { const l = mesh(geo('leaf', () => new THREE.ConeGeometry(0.03, 0.5, 4)), phong({ color: 0x4a3a20 }), false); l.rotation.set((rng() - 0.5) * 1.6, rng() * 6, (rng() - 0.5) * 1.6); g.add(at(l, 0, 0.45, 0)); l.rotation.x += 0; }
  return g;
}
export function copier(mats) {
  const m = M(mats), g = g0();
  g.add(at(mesh(box(0.9, 0.95, 0.65), m.plastic), 0, 0.475, 0));
  g.add(at(mesh(box(0.9, 0.06, 0.65), m.black), 0, 0.98, 0));
  g.add(at(mesh(box(0.25, 0.04, 0.3), m.paper, false), 0.55, 0.7, 0));
  return g;
}
export function meetingTable(mats, rng, len = 3) {
  const m = M(mats), g = g0();
  g.add(at(mesh(box(len, 0.06, 1.1), m.wood), 0, 0.75, 0));
  for (const sx of [-1, 1]) g.add(at(mesh(box(0.08, 0.72, 0.8), m.wood), sx * (len / 2 - 0.3), 0.36, 0));
  for (let i = 0; i < Math.floor(len / 0.75); i++) for (const sz of [-1, 1]) {
    if (rng() < 0.2) continue;
    const ch = officeChair(mats, rng);
    g.add(at(ch, -len / 2 + 0.45 + i * 0.75, 0, sz * 0.8, sz > 0 ? Math.PI : 0));
  }
  return g;
}
// glowing: the only light in the break room some nights
export function vending(mats) {
  if (THREE.REMASTERED) return vendingHD();
  const m = M(mats), g = g0();
  g.add(at(mesh(box(0.9, 1.85, 0.75), m.black), 0, 0.925, 0));
  g.add(at(mesh(box(0.62, 1.3, 0.02), m.vend, false), -0.08, 1.1, 0.38));
  for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) g.add(at(mesh(box(0.1, 0.14, 0.02), new THREE.MeshBasicMaterial({ color: [0xd0c040, 0x4060c0, 0xc04040, 0x40a060][(x + y) % 4] }), false), -0.32 + x * 0.16, 0.62 + y * 0.24, 0.395));
  return g;
}
export function fridge(mats) {
  const m = M(mats), g = g0();
  g.add(at(mesh(box(0.7, 1.75, 0.68), m.porcelain), 0, 0.875, 0));
  g.add(at(mesh(box(0.03, 0.4, 0.03), m.chrome, false), 0.3, 1.2, 0.35));
  return g;
}
export function whiteboard(mats) {
  const m = M(mats), g = g0();
  g.add(at(mesh(box(1.6, 1.0, 0.03), m.whiteboard, false), 0, 1.5, 0.02));
  return g;
}

// ---------- the drains ----------
// a run of big pipe along a wall at head height; origin on the wall, along X
export function pipeRun(mats, len, rng) {
  const m = M(mats), g = g0();
  const p = mesh(cyl(0.2, 0.2, len, 10), m.pipe);
  p.rotation.z = Math.PI / 2;
  g.add(at(p, 0, 2.2, 0.25));
  for (let x = -len / 2 + 0.3; x < len / 2; x += 1.2) { const b = mesh(cyl(0.23, 0.23, 0.08, 10), mats.rust[1], false); b.rotation.z = Math.PI / 2; g.add(at(b, x, 2.2, 0.25)); }
  if (rng() < 0.5) { const drip1 = mesh(cyl(0.004, 0.004, 2.0, 4), m.slime, false); g.add(at(drip1, (rng() - 0.5) * len * 0.6, 1.1, 0.3)); }
  return g;
}
// a drain pipe coming out of the wall: a rusted lip a hand's width proud of the brick with a bolted flange where it
// meets it, a throat that goes back into the dark, and what runs out of it staining the wall and pooling below
export function outflow(mats, rng) {
  const g = g0(), R = 0.34, Y = 0.62;
  const rust = mats.rust[1].clone();
  rust.side = THREE.DoubleSide;
  const lip = mesh(new THREE.CylinderGeometry(R, R, 0.42, 18, 1, true), rust);
  lip.rotation.x = Math.PI / 2; g.add(at(lip, 0, Y, 0.21));
  const rim = mesh(new THREE.TorusGeometry(R, 0.022, 6, 22), mats.rust[2], false); g.add(at(rim, 0, Y, 0.42));
  const flange = mesh(new THREE.TorusGeometry(R + 0.06, 0.045, 6, 22), mats.rust[2]); g.add(at(flange, 0, Y, 0.02));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; const bolt = mesh(box(0.04, 0.04, 0.05), mats.rust[0], false); g.add(at(bolt, Math.cos(a) * (R + 0.07), Y + Math.sin(a) * (R + 0.07), 0.06)); }
  // the throat: lit only at the mouth, black a little way in (all of it in front of the wall, or the wall hides it)
  const throat = mesh(new THREE.CylinderGeometry(R - 0.015, R - 0.015, 0.4, 18, 1, true), phong({ color: 0x0e0c08, side: THREE.BackSide, shininess: 30 }), false);
  throat.rotation.x = Math.PI / 2; g.add(at(throat, 0, Y, 0.22));
  const back = mesh(new THREE.CircleGeometry(R, 18), new THREE.MeshBasicMaterial({ color: 0x010101 }), false); g.add(at(back, 0, Y, 0.03));
  // sludge in the bottom of it, and the trickle over the lip
  const wet = rng() < 0.5 ? 0x1e1a0c : 0x16140a;
  const sludge = mesh(box(R * 1.2, 0.03, 0.4), phong({ color: wet, shininess: 140, specular: 0x555544 }), false); g.add(at(sludge, 0, Y - R + 0.03, 0.22));
  const trickle = mesh(box(0.05, Y - R + 0.02, 0.012), phong({ color: wet, shininess: 160, specular: 0x666655, transparent: true, opacity: 0.85 }), false);
  g.add(at(trickle, 0, (Y - R) / 2, 0.43));
  // the stain it's left down the wall, and the puddle
  const stain = mesh(new THREE.PlaneGeometry(0.75, Y + 0.1), phong({ color: 0x1a1a0e, transparent: true, opacity: 0.55, depthWrite: false }), false); g.add(at(stain, 0, (Y + 0.1) / 2 - 0.05, 0.004));
  const pool = mesh(new THREE.CircleGeometry(0.42, 16), phong({ color: wet, shininess: 160, specular: 0x777766, transparent: true, opacity: 0.9, depthWrite: false }), false);
  pool.rotation.x = -Math.PI / 2; pool.scale.set(1, 1.4, 1); g.add(at(pool, 0, 0.006, 0.72));
  g.userData.outflow = true;
  return g;
}
export function ladder(mats) {
  const g = g0();
  for (const sx of [-1, 1]) g.add(at(mesh(box(0.04, WALL_H, 0.04), mats.rust[0]), sx * 0.22, WALL_H / 2, 0.08));
  for (let y = 0.3; y < WALL_H; y += 0.3) { const rung = mesh(cyl(0.015, 0.015, 0.44, 5), mats.rust[0], false); rung.rotation.z = Math.PI / 2; g.add(at(rung, 0, y, 0.08)); }
  const shaft = mesh(cyl(0.45, 0.45, 0.02, 14), new THREE.MeshBasicMaterial({ color: 0x020202 }), false);
  g.add(at(shaft, 0, WALL_H - 0.005, 0.4));
  return g;
}
export function pump(mats, rng) {
  const m = M(mats), g = g0();
  const tank = mesh(cyl(0.6, 0.6, 1.6, 14), mats.rust[2]); g.add(at(tank, 0, 0.8, 0));
  g.add(at(mesh(box(0.8, 0.6, 0.6), m.greenMetal), 1.0, 0.3, 0));
  const fly = mesh(cyl(0.35, 0.35, 0.1, 14), m.black); fly.rotation.z = Math.PI / 2; g.add(at(fly, 1.45, 0.4, 0));
  const pipe = mesh(cyl(0.12, 0.12, 2.2, 8), m.pipe); g.add(at(pipe, 0, 2.2 + 0.2, 0));
  return g;
}
// a long bone: a shaft swelling to a knuckle at each end (the joints), lying along X
function longBone(mat, len) {
  const g = g0();
  const shaft = mesh(new THREE.CylinderGeometry(0.016, 0.019, len, 6), mat, false);
  shaft.rotation.z = Math.PI / 2;
  g.add(shaft);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const k = mesh(sph(0.024, 6), mat, false); k.position.set(sx * len / 2, 0, sz * 0.014); g.add(k); }
  return g;
}
// a skull: the dome, the brow and the face under it, sockets and a nose hole, a few teeth; no jaw
function skull(mat, rng) {
  const g = g0();
  const dome = mesh(sph(0.09, 10), mat, false); dome.scale.set(0.8, 0.85, 1.05); dome.position.set(0, 0.02, -0.01); g.add(dome);
  const face = mesh(box(0.11, 0.07, 0.06), mat, false); face.position.set(0, -0.035, 0.065); g.add(face);
  const dark = phong({ color: 0x060404 });
  for (const sx of [-1, 1]) { const s = mesh(sph(0.022, 6), dark, false); s.scale.set(1, 0.85, 0.6); s.position.set(sx * 0.03, -0.01, 0.092); g.add(s); }
  const nose = mesh(box(0.016, 0.022, 0.01), dark, false); nose.position.set(0, -0.04, 0.096); g.add(nose);
  for (let i = 0; i < 6; i++) { if (rng() < 0.3) continue; const t = mesh(box(0.009, 0.014, 0.008), mat, false); t.position.set(-0.025 + i * 0.01, -0.075, 0.088); g.add(t); }
  return g;
}
// where he sleeps, if he sleeps: rags, bones, a mattress, what's left of people
export function nest(mats, rng) {
  const m = M(mats), g = g0();
  const mat = mesh(box(1.8, 0.15, 0.9), m.rag); g.add(at(mat, 0, 0.075, 0, rng()));
  g.add(decal(mats.pool[(rng() * 3) | 0], 2.6, 0, 0, rng() * 6));
  // the bones: a heap beside the mattress, lying on the floor (long bones, ribs, skulls), older ones darker
  const boneMats = [mats.bone, phong({ color: 0x9a8a6a, shininess: 18, specular: 0x222218 }), phong({ color: 0x6a5c44, shininess: 10, specular: 0x111111 })];
  const heap = () => { const r = Math.pow(rng(), 1.6) * 1.1, a = rng() * Math.PI * 2; return [1.25 + Math.cos(a) * r, Math.sin(a) * r * 0.8]; };
  for (let i = 0; i < 16; i++) { const [x, z] = heap(); g.add(at(longBone(boneMats[(rng() * 3) | 0], 0.22 + rng() * 0.26), x, 0.03 + rng() * 0.03 * (i % 3), z, rng() * 6)); }
  for (let i = 0; i < 7; i++) { const [x, z] = heap(); const rib = mesh(new THREE.TorusGeometry(0.13 + rng() * 0.05, 0.011, 4, 10, Math.PI * 0.85), boneMats[(rng() * 3) | 0], false); rib.rotation.set(-Math.PI / 2 + (rng() - 0.5) * 0.3, 0, rng() * 6); g.add(at(rib, x, 0.02, z)); }
  for (let i = 0; i < 3; i++) { const [x, z] = heap(); const sk = skull(boneMats[(rng() * 2) | 0], rng); sk.rotation.set((rng() - 0.5) * 0.5, rng() * 6, (rng() - 0.5) * 0.9); g.add(at(sk, x, 0.085, z, sk.rotation.y)); }
  for (let i = 0; i < 4; i++) g.add(at(meatChunk(mats, rng), (rng() - 0.5) * 2, 0.04, (rng() - 0.5) * 2, rng() * 6));
  g.add(at(severedArm(mats, rng), 0.6, 0.18, -0.2, rng() * 6)).children.at(-1).visible = !THREE.gore.less;
  for (let i = 0; i < 5; i++) { const r = mesh(box(0.3 + rng() * 0.4, 0.04, 0.2 + rng() * 0.3), m.rag, false); g.add(at(r, (rng() - 0.5) * 2.4, 0.03, (rng() - 0.5) * 2.4, rng() * 6)); }
  g.userData.nest = true;
  return g;
}
// a tiling normal map of small overlapping ripples, from a height field of a few wrapped sine waves and noise
function rippleNormals() {
  const N = 128, hgt = new Float32Array(N * N);
  const waves = [];
  for (let i = 0; i < 9; i++) waves.push([((Math.random() * 6) | 0) + 1, ((Math.random() * 6) | 0) - 3, Math.random() * 6, 0.3 + Math.random() * 0.7]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let v = 0; for (const [a, b, ph, amp] of waves) v += Math.sin(((a * x + b * y) / N) * Math.PI * 2 + ph) * amp; hgt[y * N + x] = v; }
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d', { willReadFrequently: true }), img = g.createImageData(N, N);
  const H = (x, y) => hgt[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 0.6, dy = (H(x, y + 1) - H(x, y - 1)) * 0.6, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  return t;
}
// the water: one sheet over every wet tile, scrolled each frame so it moves
export function waterSheet(mats, tiles, TILE, L) {
  const m = M(mats);
  const soft = THREE.REMASTERED && L; // the remaster's water replaces this one, but it is still made (the game's random rolls draw on it)
  const pos = [], uv = [], idx = [];
  for (const [x, y] of tiles) {
    const b = pos.length / 3, x0 = x * TILE, z0 = y * TILE;
    pos.push(x0, 0, z0, x0 + TILE, 0, z0, x0 + TILE, 0, z0 + TILE, x0, 0, z0 + TILE);
    uv.push(x0 / 3, z0 / 3, (x0 + TILE) / 3, z0 / 3, (x0 + TILE) / 3, (z0 + TILE) / 3, x0 / 3, (z0 + TILE) / 3);
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const w = new THREE.Mesh(g, m.water);
  w.position.y = 0.12;
  w.renderOrder = 1;
  if (soft) return THREE.ownRandom(() => softWater(m, tiles, TILE, L));
  return w;
}

// the remaster's water: the same wet tiles, but a shoreline instead of a cut edge (it thins to nothing over the last
// half metre wherever it meets dry floor), and a dark, still surface that mirrors the walls and lamps (wet.js) with
// slow, broad ripples instead of glitter
function softWater(m, tiles, TILE, L) {
  const { W, H, grid } = L, crawl = L.crawl || new Uint8Array(W * H), water = L.water;
  const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !!grid[y * W + x] && !crawl[y * W + x];
  // a tile corner is deep if none of the four tiles around it is dry, open floor
  const deep = (cx, cy) => { for (const [x, y] of [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]]) if (open(x, y) && !water[y * W + x]) return 0; return 1; };
  const N = 4, pos = [], uv = [], col = [], idx = [];
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (const [x, y] of tiles) {
    const a00 = deep(x, y), a10 = deep(x + 1, y), a01 = deep(x, y + 1), a11 = deep(x + 1, y + 1), b = pos.length / 3;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const u = i / N, v = j / N, px = (x + u) * TILE, pz = (y + v) * TILE;
      const a = (a00 * (1 - u) + a10 * u) * (1 - v) + (a01 * (1 - u) + a11 * u) * v;
      pos.push(px, 0, pz); uv.push(px / 3, pz / 3); col.push(1, 1, 1, ss(0.0, 0.3, a));
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const q = b + j * (N + 1) + i; idx.push(q, q + N + 1, q + 1, q + 1, q + N + 1, q + N + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (!m.waterR) {
    const n = m.water.normalMap.clone(); n.repeat.set(1.2, 1.2); n.needsUpdate = true;
    m.waterR = patchWet(new THREE.MeshStandardMaterial({ map: m.water.map, normalMap: n, normalScale: new THREE.Vector2(0.12, 0.12), color: 0x55604a, roughness: 0.04, metalness: 0,
      transparent: true, opacity: 0.94, depthWrite: false, vertexColors: true }), { gain: 1.6, distort: 0.025 });
  }
  const w = new THREE.Mesh(g, m.waterR);
  w.position.y = 0.12;
  w.renderOrder = 1;
  w.receiveShadow = true;
  return w;
}

// ---------- the deep freeze ----------
// a bay of pallet racking, len long (along X), with boxes and plastic-wrapped meat on its shelves
export function palletRack(mats, rng, len = 3.6) {
  const m = M(mats), g = g0();
  const D = 1.0, levels = [0.15, 1.05, 1.95];
  for (let x = -len / 2; x <= len / 2 + 0.01; x += len / 2) for (const z of [-D / 2, D / 2]) g.add(at(mesh(box(0.08, 2.8, 0.08), m.rackBlue), x, 1.4, z));
  for (const y of levels) for (const z of [-D / 2, D / 2]) g.add(at(mesh(box(len, 0.1, 0.06), m.rackOrange), 0, y, z));
  for (const y of levels) for (let x = -len / 2 + 0.5; x < len / 2; x += 0.9) {
    if (rng() < 0.2) continue;
    const k = rng();
    if (k < 0.55) { const h = 0.3 + rng() * 0.4; const b = mesh(box(0.8, h, 0.85), m.boxes); g.add(at(b, x, y + 0.05 + h / 2, 0, (rng() - 0.5) * 0.15)); }
    else { // a side of something, shrink-wrapped and frozen, red showing through the plastic
      const w = mesh(cap(0.22, 0.45), m.wrap); w.rotation.z = Math.PI / 2; g.add(at(w, x, y + 0.27, 0));
      const meat = mesh(cap(0.19, 0.4), mats.meat, false); meat.rotation.z = Math.PI / 2; g.add(at(meat, x, y + 0.27, 0));
    }
  }
  // frost on the top shelf
  g.add(at(mesh(box(len, 0.02, D), m.ice, false), 0, 2.81, 0));
  return g;
}
export function forklift(mats, rng) {
  const g = forkliftHD(mats);
  if (rng() < 0.5) { const b = makeBody(mats, rng, { dead: true }); b.root.rotation.set(-1.2, 0, 0.3); b.root.position.set(0, 1.22, -0.3); g.add(b.root); } // still at the wheel
  return g;
}
// a refrigeration unit high on a wall: fans, coils, icicles; origin on the wall facing +Z
export function coolerUnit(mats, rng) {
  const m = M(mats), g = g0();
  g.add(at(mesh(box(1.6, 0.55, 0.6), m.beigeMetal), 0, WALL_H - 0.45, 0.3));
  for (const x of [-0.45, 0.45]) { const f = mesh(cyl(0.22, 0.22, 0.02, 12), m.black, false); f.rotation.x = Math.PI / 2; g.add(at(f, x, WALL_H - 0.45, 0.61)); }
  for (let i = 0; i < 9; i++) { const ic = mesh(geo('icicle', () => new THREE.ConeGeometry(0.025, 0.3, 5)), m.ice, false); ic.rotation.x = Math.PI; ic.scale.y = 0.5 + rng(); g.add(at(ic, -0.75 + i * 0.19, WALL_H - 0.8 - ic.scale.y * 0.1, 0.55)); }
  return g;
}
export function crateStack(mats, rng) {
  const m = M(mats), g = g0();
  g.add(at(mesh(box(1.2, 0.14, 1.0), m.wood), 0, 0.07, 0));
  const n = 1 + (rng() * 3 | 0);
  for (let i = 0; i < n; i++) g.add(at(mesh(box(1.1, 0.5, 0.95), m.boxes), (rng() - 0.5) * 0.06, 0.39 + i * 0.5, (rng() - 0.5) * 0.06, (rng() - 0.5) * 0.1));
  return g;
}

// ---------- loot ----------
// on the floor: gun parts on a scrap of cloth, a box of bolts, or a keepsake (a small personal thing)
export function lootMesh(mats, type, meta, rng) {
  const m = M(mats), g = g0();
  const glint = new THREE.PointLight(type === 'keepsake' ? 0xffe0a0 : 0xd8e8ff, 0.6, 1.6, 2);
  glint.userData.glint = true;
  glint.position.y = 0.25;
  g.add(glint);
  if (type === 'ammo') {
    g.add(at(mesh(box(0.16, 0.07, 0.1), m.cardboard), 0, 0.035, 0));
    for (let i = 0; i < 3; i++) { const b = mesh(cyl(0.008, 0.008, 0.09, 6), phong({ color: 0xc8a040, shininess: 120 }), false); b.rotation.z = Math.PI / 2; g.add(at(b, 0.02, 0.08, -0.03 + i * 0.03)); }
  } else if (type === 'gun') { // the bolt gun, whole, on an oily rag
    g.add(at(mesh(box(0.42, 0.01, 0.32), m.rag, false), 0, 0.005, 0, 0.3));
    const body = mesh(cyl(0.035, 0.04, 0.34, 10), mats.steel, false); body.rotation.z = Math.PI / 2; g.add(at(body, 0, 0.045, 0));
    const capm = mesh(cyl(0.045, 0.045, 0.06, 10), phong({ color: 0x2a2826 }), false); capm.rotation.z = Math.PI / 2; g.add(at(capm, 0.17, 0.045, 0));
    const gr = mesh(box(0.045, 0.06, 0.14), phong({ color: 0x1a1612 }), false); g.add(at(gr, 0.08, 0.04, 0.08));
  } else { // a keepsake: the same model you turn over in the viewer, set down where it was dropped
    const k = meta.id ? keepsakeModel(meta.draw || meta.id, meta.id) : new THREE.Group(); // (built as the original's, shown as this)
    const upright = ['toy-bear', 'toy-car', 'tape-dictaphone', 'misc-lighter', 'tooth-milk'].includes(meta.id);
    if (!upright) k.rotation.x = -Math.PI / 2;
    if (upright) k.rotation.y = rng() * 6; else k.rotation.z = rng() * 6;
    const hold = new THREE.Group(); hold.add(k);
    hold.scale.setScalar(1.6); // a touch bigger than life, so it reads at the end of a torch beam
    const bb = new THREE.Box3().setFromObject(hold);
    k.position.y = -bb.min.y + 0.002;
    g.add(hold);
  }
  return g;
}

// ---------- the processing line ----------
// place, with a full rotation (rx, ry, rz)
const atr = (o, x, y, z, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };
// materials for the factory kit, made once
function F(mats) {
  if (mats.fac) return mats.fac;
  const tex = (w, h, draw, rep) => { const { c, g } = canvas(w, h); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(...rep); return t; };
  // the belt: black rubber in slats, crusted along the middle where the meat sits
  const belt = tex(64, 256, (g, w, h) => {
    g.fillStyle = '#161614'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 12) { g.fillStyle = '#26261f'; g.fillRect(0, y, w, 2); }
    for (let i = 0; i < 50; i++) { g.fillStyle = `rgba(${70 + Math.random() * 50 | 0},6,4,${Math.random() * 0.6})`; g.fillRect(12 + Math.random() * 40, Math.random() * h, 3 + Math.random() * 10, 2 + Math.random() * 8); }
  }, [1, 4]);
  // stainless that's been hosed down a thousand times and is still pink in the corners
  const ss = tex(128, 128, (g, w, h) => {
    g.fillStyle = '#9ca2a4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,40,40'},.05)`; g.fillRect(0, Math.random() * h, w, 1); }
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(110,20,14,${Math.random() * 0.35})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 18, 2 + Math.random() * 8, Math.random() * 3, 0, 7); g.fill(); }
  });
  const mince = tex(64, 64, (g, w, h) => { g.fillStyle = '#8a2418'; g.fillRect(0, 0, w, h); for (let i = 0; i < 500; i++) { g.fillStyle = Math.random() < 0.3 ? `rgba(230,200,180,${Math.random() * 0.6})` : `rgba(${60 + Math.random() * 80 | 0},10,8,.6)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
  const label = tex(128, 64, (g, w, h) => { g.fillStyle = '#e8e4d8'; g.fillRect(0, 0, w, h); g.fillStyle = '#7a1010'; g.font = 'bold 16px monospace'; g.fillText('HOLLOW PINES', 6, 22); g.fillStyle = '#222'; g.font = '11px monospace'; g.fillText('PRIME CUTS  1.2 KG', 6, 40); g.fillText('USE BY 03 / 12', 6, 56); });
  const panel = tex(128, 128, (g, w, h) => { g.fillStyle = '#c8a21a'; g.fillRect(0, 0, w, h); g.fillStyle = '#141410'; g.font = 'bold 14px monospace'; g.fillText('DANGER', 30, 24); g.font = '10px monospace'; g.fillText('KEEP HANDS', 30, 40); g.fillText('CLEAR', 46, 54); g.fillStyle = '#141410'; g.beginPath(); g.moveTo(64, 70); g.lineTo(96, 120); g.lineTo(32, 120); g.fill(); g.fillStyle = '#c8a21a'; g.fillRect(61, 86, 6, 20); g.fillRect(61, 110, 6, 5); });
  mats.fac = {
    belt: phong({ map: belt, shininess: 30, specular: 0x222222 }),
    ss: phong({ map: ss, shininess: 110, specular: 0x888888 }),
    frame: phong({ color: 0x2e4234, shininess: 30, specular: 0x222222 }), // the same green as the walls
    guard: phong({ color: 0xc8a21a, shininess: 40, specular: 0x333333 }),
    red: phong({ color: 0xa01a10, shininess: 60, specular: 0x442222 }),
    mince: phong({ map: mince, shininess: 70, specular: 0x441111 }),
    label: phong({ map: label, shininess: 20 }),
    panel: phong({ map: panel, shininess: 20 }),
    hose: phong({ color: 0x1a3a7a, shininess: 60, specular: 0x333333 }),
    rubber: phong({ color: 0xd8d4c4, shininess: 60, specular: 0x444444 }), // white rubber, aprons and boots
  };
  return mats.fac;
}

// a stretch of conveyor: a green steel frame on legs, a black belt between rollers, cuts riding along it.
// origin at the floor, centred; runs along x, len long
export function conveyor(mats, rng, len = 3.6) {
  const f = F(mats), g = g0();
  for (const sz of [-1, 1]) g.add(atr(mesh(box(len, 0.12, 0.05), f.frame), 0, 0.82, sz * 0.36)); // side rails
  for (let x = -len / 2 + 0.25; x <= len / 2 - 0.2; x += 1.1) for (const sz of [-1, 1]) g.add(atr(mesh(box(0.06, 0.8, 0.06), f.frame), x, 0.4, sz * 0.32)); // legs
  g.add(atr(mesh(box(len - 0.1, 0.03, 0.6), f.belt), 0, 0.86, 0));
  // underneath: cross braces and feet on every pair of legs, the return run of the belt, a drip tray, the drive
  for (let x = -len / 2 + 0.25; x <= len / 2 - 0.2; x += 1.1) {
    g.add(atr(mesh(box(0.04, 0.04, 0.64), f.frame), x, 0.22, 0));
    for (const sz of [-1, 1]) g.add(atr(mesh(cyl(0.05, 0.05, 0.02, 10), mats.darkMetal), x, 0.01, sz * 0.32));
  }
  g.add(atr(mesh(box(len - 0.3, 0.012, 0.56), f.belt), 0, 0.7, 0)); // the belt coming back underneath
  g.add(atr(mesh(box(len - 0.5, 0.05, 0.62), f.ss), 0, 0.42, 0)); // drip tray
  g.add(atr(mesh(box(len * 0.45, 0.006, 0.3), mats.blood), len * 0.1, 0.448, 0.05)); // what's in it
  for (const sz of [-1, 1]) g.add(atr(mesh(box(len - 0.2, 0.05, 0.012), f.ss), 0, 0.91, sz * 0.31)); // side skirts holding the meat on
  g.add(atr(mesh(cyl(0.11, 0.11, 0.3, 14), f.frame), -len / 2 + 0.35, 0.62, -0.18, Math.PI / 2)); // the motor
  g.add(atr(mesh(box(0.2, 0.22, 0.18), f.frame), -len / 2 + 0.35, 0.62, 0.08)); // gearbox
  for (let i = 0; i < 5; i++) g.add(atr(mesh(box(0.012, 0.2, 0.22), mats.darkMetal), -len / 2 + 0.27 + i * 0.04, 0.62, -0.18)); // cooling fins
  g.add(atr(mesh(cyl(0.012, 0.012, 0.6, 6), f.hose), -len / 2 + 0.35, 0.36, -0.3)); // its cable
  for (const ex of [-1, 1]) { const r = mesh(cyl(0.07, 0.07, 0.62, 10), f.ss); g.add(atr(r, ex * (len / 2 - 0.06), 0.84, 0, Math.PI / 2)); } // end rollers
  // the stop station: a yellow box on its own post, bolted to the frame, with the red mushroom and its collar
  const ex = len / 2 - 0.3;
  g.add(atr(mesh(box(0.05, 1.0, 0.05), f.frame), ex, 0.5, -0.46)); // post
  g.add(atr(mesh(box(0.2, 0.025, 0.2), f.frame), ex, 0.012, -0.46)); // foot plate
  g.add(atr(mesh(box(0.05, 0.05, 0.1), f.frame), ex, 0.8, -0.4)); // bracket to the side rail
  g.add(atr(mesh(box(0.22, 0.3, 0.16), f.guard), ex, 1.12, -0.46));
  g.add(atr(mesh(box(0.2, 0.01, 0.14), f.frame), ex, 1.275, -0.46)); // lid seam
  g.add(atr(mesh(cyl(0.05, 0.05, 0.015, 14), mats.darkMetal), ex, 1.15, -0.375, Math.PI / 2));
  g.add(atr(mesh(cyl(0.045, 0.035, 0.04, 14), f.red), ex, 1.15, -0.35, Math.PI / 2));
  g.add(atr(mesh(cyl(0.012, 0.012, 0.1, 6), f.hose), ex, 1.0, -0.46)); // the cable down the post
  // what's on it: cuts and offcuts, left where the line stopped
  for (let x = -len / 2 + 0.4; x < len / 2 - 0.3; x += 0.35 + rng() * 0.5) {
    if (rng() < 0.25) continue;
    const c = meatChunk(mats, rng); c.position.set(x, 0.9, (rng() - 0.5) * 0.35); c.scale.multiplyScalar(1.4); g.add(c);
  }
  g.add(decal(mats.pool[(rng() * 3) | 0], 1.2, (rng() - 0.5) * len * 0.6, 0.6, rng() * 6)); // what dripped off it
  return g;
}
// the band saw that cuts the carcasses into primals: a tall steel cabinet, the blade running between two wheels
export function bandsaw(mats, rng) {
  const f = F(mats), g = g0();
  g.add(atr(mesh(box(0.8, 0.9, 0.7), f.ss), 0, 0.45, 0)); // base
  g.add(atr(mesh(box(0.9, 0.04, 0.9), f.ss), 0, 0.92, 0)); // table
  g.add(atr(mesh(box(0.7, 1.0, 0.3), f.ss), 0, 1.5, -0.25)); // upper wheel housing
  const blade = mesh(box(0.012, 0.6, 0.03), mats.steel); g.add(atr(blade, 0.1, 1.2, 0.0));
  g.add(atr(mesh(box(0.1, 0.12, 0.12), f.guard), 0.1, 1.3, 0.0)); // the blade guard
  g.add(atr(mesh(box(0.25, 0.25, 0.01), f.panel), -0.2, 1.6, -0.09)); // DANGER - KEEP HANDS CLEAR
  for (let i = 0; i < 3; i++) { const c = meatChunk(mats, rng); c.position.set((rng() - 0.5) * 0.6, 0.97, 0.15 + rng() * 0.2); g.add(c); }
  g.add(decal(mats.pool[0], 1.4, 0, 0.5, rng() * 6));
  return g;
}
// the mincer: a hopper you could fit a man in, the auger body, and a tub of what came out
export function mincer(mats, rng) {
  const f = F(mats), g = g0();
  g.add(atr(mesh(box(1.1, 1.0, 0.9), f.ss), 0, 0.5, 0)); // body
  const hop = mesh(cyl(0.75, 0.3, 0.9, 4), f.ss); g.add(atr(hop, 0, 1.45, 0, 0, Math.PI / 4)); // hopper
  g.add(atr(mesh(box(1.0, 0.05, 1.0), f.mince), 0, 1.86, 0)); // what's still in it
  const tube = mesh(cyl(0.16, 0.16, 0.7, 12), f.ss); g.add(atr(tube, 0.85, 0.75, 0, 0, 0, Math.PI / 2)); // auger
  const plate = mesh(cyl(0.18, 0.18, 0.05, 12), mats.steel); g.add(atr(plate, 1.22, 0.75, 0, 0, 0, Math.PI / 2));
  const tub = mesh(cyl(0.32, 0.28, 0.35, 14), phong({ color: 0x3a5a8a, shininess: 40 })); g.add(atr(tub, 1.35, 0.18, 0));
  g.add(atr(mesh(cyl(0.3, 0.3, 0.04, 14), f.mince), 1.35, 0.34, 0)); // full
  g.add(atr(mesh(box(0.25, 0.35, 0.15), f.guard), -0.45, 1.25, 0.5)); // control box
  for (const [x, c] of [[-0.5, f.red], [-0.4, phong({ color: 0x1a8a2a, shininess: 60 })]]) g.add(atr(mesh(cyl(0.03, 0.03, 0.03, 10), c), x, 1.3, 0.58, Math.PI / 2));
  g.add(atr(mesh(box(0.3, 0.3, 0.01), f.panel), 0, 0.6, 0.455));
  if (rng() < 0.6) { const arm = severedArm(mats, rng); arm.position.set(0.1, 1.9, 0.1); arm.rotation.z = 2.2; arm.visible = !THREE.gore.less; g.add(arm); } // still going in
  g.add(decal(mats.pool[(rng() * 3) | 0], 1.8, 1.0, 0, rng() * 6));
  return g;
}
// a packing table: stainless, trays of cut meat in film, a roll of wrap, flat-pack cartons
export function packTable(mats, rng) {
  const f = F(mats), m = M(mats), g = g0();
  g.add(atr(mesh(box(1.8, 0.05, 0.8), f.ss), 0, 0.9, 0));
  for (const [x, z] of [[-0.82, -0.34], [0.82, -0.34], [-0.82, 0.34], [0.82, 0.34]]) g.add(atr(mesh(box(0.05, 0.9, 0.05), f.ss), x, 0.45, z));
  g.add(atr(mesh(box(1.7, 0.03, 0.7), f.ss), 0, 0.25, 0)); // under-shelf
  for (let i = 0; i < 6; i++) {
    const x = -0.7 + (i % 3) * 0.32, z = i < 3 ? -0.18 : 0.15;
    if (rng() < 0.2) continue;
    g.add(atr(mesh(box(0.26, 0.03, 0.2), phong({ color: 0x1a1a1a })), x, 0.94, z)); // the tray
    const cut = meatChunk(mats, rng); cut.position.set(x, 0.98, z); cut.scale.set(1.3, 0.6, 1.1); g.add(cut);
    g.add(atr(mesh(box(0.27, 0.06, 0.21), m.wrap, false), x, 0.97, z)); // film
    g.add(atr(mesh(box(0.1, 0.002, 0.06), f.label, false), x + 0.05, 1.0, z));
  }
  const roll = mesh(cyl(0.06, 0.06, 0.5, 12), m.wrap); g.add(atr(roll, 0.6, 0.98, 0.25, 0, 0, Math.PI / 2));
  for (let i = 0; i < 4; i++) g.add(atr(mesh(box(0.5, 0.012, 0.4), m.boxes), -0.3 + (rng() - 0.5) * 0.1, 0.27 + i * 0.013, 0, 0, rng() * 0.2, 0)); // flat cartons
  return g;
}
// wash-down: a long trough with taps, a hose on its reel, white aprons and boots on pegs. Against a wall, facing +z
export function washStation(mats, rng) {
  const f = F(mats), g = g0();
  g.add(atr(mesh(box(1.8, 0.35, 0.5), f.ss), 0, 0.75, 0.3)); // trough
  g.add(atr(mesh(box(1.7, 0.02, 0.4), phong({ color: 0x3a0806, shininess: 100, specular: 0x552222 })), 0, 0.88, 0.3)); // the water in it
  for (let i = 0; i < 3; i++) { const t = mesh(cyl(0.015, 0.015, 0.25, 6), mats.steel); g.add(atr(t, -0.6 + i * 0.6, 1.1, 0.12, Math.PI / 2)); }
  for (const x of [-0.75, 0.75]) g.add(atr(mesh(box(0.05, 0.6, 0.05), f.ss), x, 0.3, 0.45));
  // the hose reel
  const reel = mesh(geo('hosereel', () => new THREE.TorusGeometry(0.22, 0.05, 8, 20)), f.hose); g.add(atr(reel, 1.25, 1.2, 0.08));
  g.add(atr(mesh(cyl(0.08, 0.08, 0.1, 10), mats.steel), 1.25, 1.2, 0.05, Math.PI / 2));
  const hose = mesh(geo('hosedrop', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(1.25, 0.98, 0.1), new THREE.Vector3(1.3, 0.4, 0.3), new THREE.Vector3(1.1, 0.03, 0.8), new THREE.Vector3(0.6, 0.03, 1.1), new THREE.Vector3(0.2, 0.03, 0.9)]), 30, 0.025, 6, false)), f.hose);
  g.add(hose);
  // aprons and boots on pegs, as if their owners will be back
  for (let i = 0; i < 3; i++) {
    const x = -1.5 - i * 0.45;
    g.add(atr(mesh(cyl(0.012, 0.012, 0.12, 6), mats.steel), x, 1.7, 0.06, Math.PI / 2));
    const ap = mesh(box(0.38, 0.85, 0.02), f.rubber); g.add(atr(ap, x, 1.25, 0.08, 0, 0, (rng() - 0.5) * 0.1));
    if (rng() < 0.7) g.add(atr(mesh(box(0.2, 0.3, 0.01), phong({ color: 0x6a1008, shininess: 80 })), x + (rng() - 0.5) * 0.1, 1.1, 0.095)); // stained
    for (const bx of [-0.06, 0.06]) g.add(atr(mesh(box(0.1, 0.3, 0.2), f.rubber), x + bx, 0.15, 0.2));
  }
  return g;
}
// an overhead line: a rail at ceiling height with carcasses hanging off it on chains
export function overheadRail(mats, rng, len, H) {
  const f = F(mats), g = g0();
  g.add(atr(mesh(box(len, 0.08, 0.08), f.frame), 0, H - 0.25, 0));
  for (let x = -len / 2 + 0.3; x < len / 2; x += 1.6) g.add(atr(mesh(box(0.05, 0.25, 0.05), f.frame), x, H - 0.12, 0)); // hangers
  return g;
}
