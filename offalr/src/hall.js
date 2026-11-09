// B10, the factory floor: what makes one open hall under a 12 m roof read as a factory. Roof trusses, catwalks hung
// from them, high-bay lamps up in the dark, tall machines standing in the work areas, lockers against the columns,
// and drops from the roof for everything that used to hang off a 3 m ceiling (lamps, rails, chains). All of it is
// static (the baker welds it); the machines and lockers have colliders. Its own random stream.
import * as THREE from 'three';
import { TILE, WALL_H } from './config.js';
import { makeRng } from './rng.js';

const tc = (t) => (t + 0.5) * TILE;
const shared = new Map();
const geo = (k, f) => { if (!shared.has(k)) { const g = f(); g.userData.shared = true; shared.set(k, g); } return shared.get(k); };
const box = (w, h, d) => geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (a, b, h, s = 8) => geo(`c${a}_${b}_${h}_${s}`, () => new THREE.CylinderGeometry(a, b, h, s));

// a thin rod from height y0 up to the roof at (x, z)
function rod(mat, x, z, y0, y1, r = 0.02) {
  const m = new THREE.Mesh(cyl(r, r, 1, 5), mat);
  m.scale.y = Math.max(0.05, y1 - y0);
  m.position.set(x, (y0 + y1) / 2, z);
  return m;
}

export function dressHall(L, mats, group, out, h) {
  return THREE.ownRandom(() => dress(L, mats, group, out, h));
}

function dress(L, mats, group, out, h) {
  const rng = makeRng(L.seed * 17 + 9);
  const CEIL = L.ceil, hi = L.hallInfo, { W } = L;
  // the newest part of the plant: painted steel, not rust (the rest of the building is forty years older)
  const M = hallMats(mats), steel = M.galv, dark = M.grey, rust = M.paint, chain = mats.chain, red = M.red;
  const put = (o, x, y, z, yaw = 0) => { o.position.set(x, y, z); o.rotation.y = yaw; group.add(o); return o; };
  const mesh = (g, m, cast = false) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; return o; };

  // ---- drops: everything hung from where the old 3 m ceiling was now hangs from the roof ----
  const swing = new Set(out.swingers);
  const bb = new THREE.Box3();
  for (const o of group.children.slice()) {
    if (o.userData.hall) continue;
    if (swing.has(o)) { // a chain hanging free (the carcasses hang from rails, which get their own)
      if (o.userData.swing && !(L.low && L.low[Math.floor(o.position.z / TILE) * W + Math.floor(o.position.x / TILE)])) group.add(rod(chain, o.position.x, o.position.z, o.position.y, CEIL, 0.012));
      continue;
    }
    bb.setFromObject(o);
    const ti = Math.floor((bb.min.z + bb.max.z) / 2 / TILE) * W + Math.floor((bb.min.x + bb.max.x) / 2 / TILE);
    if (L.low && L.low[ti]) continue; // (a small room: it has its own ceiling)
    if (bb.isEmpty() || bb.max.y < WALL_H - 0.35 || bb.max.y > WALL_H + 0.05 || bb.min.y < 1.6) continue;
    const sx = bb.max.x - bb.min.x, sz = bb.max.z - bb.min.z, cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    const top = bb.max.y;
    if (Math.max(sx, sz) < 1.6) group.add(rod(chain, cx, cz, top, CEIL, 0.012));
    else {
      const along = sx > sz, len = along ? sx : sz, n = Math.max(2, Math.round(len / 4) + 1);
      for (let k = 0; k < n; k++) { const t = -len / 2 + 0.3 + (k * (len - 0.6)) / (n - 1); group.add(rod(dark, along ? cx + t : cx, along ? cz : cz + t, top, CEIL, 0.018)); }
    }
  }

  // ---- roof trusses, east-west across the hall every 6 m, and across the annex ----
  const x0 = hi.left * TILE, x1 = (hi.hallR + 1) * TILE;
  const truss = (xa, xb, z) => {
    const span = xb - xa, cx = (xa + xb) / 2, yT = CEIL - 0.2, yB = CEIL - 1.5;
    put(mesh(box(span, 0.24, 0.24), rust), cx, yT, z);
    put(mesh(box(span, 0.18, 0.2), rust), cx, yB, z);
    const step = 3, n = Math.floor(span / step);
    for (let k = 0; k <= n; k++) {
      const x = xa + (span - n * step) / 2 + k * step;
      put(mesh(box(0.1, yT - yB, 0.1), rust), x, (yT + yB) / 2, z);
      if (k < n) { const d = mesh(box(0.08, Math.hypot(step, yT - yB), 0.08), rust); d.rotation.z = (k % 2 ? 1 : -1) * Math.atan2(step, yT - yB); put(d, x + step / 2, (yT + yB) / 2, z); }
    }
    return yB;
  };
  const roofLamps = [];
  for (let z = (hi.top + 1) * TILE; z < (hi.bottom + 1) * TILE; z += 6) {
    const yB = truss(x0, x1, z);
    for (let x = x0 + 6; x < x1 - 3; x += 12) roofLamps.push([x + (rng() - 0.5) * 2, yB, z]);
  }
  for (let z = (hi.top + 1) * TILE; z < (hi.bottom + 1) * TILE; z += 6) truss(hi.ex0 * TILE, (hi.ex0 + hi.annexW) * TILE, z);

  // ---- high-bay lamps up in the roof: most of them long dead, a few still burning, far up in the fog ----
  const glow = new THREE.MeshBasicMaterial({ color: 0xeef4ff }), deadGlass = new THREE.MeshBasicMaterial({ color: 0x140c08 }), redGlow = new THREE.MeshBasicMaterial({ color: 0xff2410 });
  for (const [x, yB, z] of roofLamps) {
    const k = rng(), y = yB - 1.4 - rng() * 0.8;
    group.add(rod(chain, x, z, y + 0.35, yB, 0.012));
    const shade = mesh(geo('hbShade', () => new THREE.CylinderGeometry(0.12, 0.55, 0.45, 14, 1, true)), dark);
    shade.material.side = THREE.DoubleSide;
    put(shade, x, y + 0.15, z);
    put(mesh(geo('hbLamp', () => new THREE.CylinderGeometry(0.42, 0.42, 0.04, 14)), k < 0.6 ? glow : k < 0.68 ? redGlow : deadGlass), x, y - 0.08, z);
  }

  // ---- catwalks: over the open lane of every aisle with a column line, and one across the middle ----
  const deckY = 5.4;
  const catwalk = (xa, za, xb, zb) => {
    const along = Math.abs(xb - xa) > Math.abs(zb - za), len = along ? Math.abs(xb - xa) : Math.abs(zb - za);
    const g = new THREE.Group();
    g.add(mesh(box(len, 0.06, 1.3), steel));
    for (const s of [-1, 1]) {
      const toe = mesh(box(len, 0.14, 0.02), rust); toe.position.set(0, 0.1, s * 0.64); g.add(toe);
      for (const y of [0.55, 1.05]) { const r = mesh(box(len, 0.045, 0.045), red); r.position.set(0, y, s * 0.64); g.add(r); }
      for (let t = -len / 2; t <= len / 2; t += 2) { const p = mesh(box(0.05, 1.05, 0.05), red); p.position.set(t, 0.55, s * 0.64); g.add(p); }
    }
    for (let t = -len / 2; t <= len / 2; t += 1) { const c = mesh(box(0.05, 0.12, 1.3), dark); c.position.set(t, -0.08, 0); g.add(c); } // the joists under the grating
    put(g, (xa + xb) / 2, deckY, (za + zb) / 2, along ? 0 : Math.PI / 2);
    for (let t = -len / 2 + 1; t <= len / 2; t += 6) for (const s of [-1, 1]) {
      const px = along ? (xa + xb) / 2 + t : (xa + xb) / 2 + s * 0.64, pz = along ? (za + zb) / 2 + s * 0.64 : (za + zb) / 2 + t;
      group.add(rod(dark, px, pz, deckY + 1.05, CEIL - 1.5, 0.025));
    }
  };
  for (let x = hi.left + hi.zw; x < hi.hallR; x += hi.zw + hi.gap) catwalk(tc(x + 1), (hi.top + 0.5) * TILE, tc(x + 1), (hi.bottom + 0.5) * TILE);
  const midRow = hi.top + 2 * (hi.zh + hi.gap) - hi.gap;
  catwalk(x0 + 1, tc(midRow) + 1, x1 - 1, tc(midRow) + 1);

  // ---- red-and-white lane lines down both sides of every aisle, the way a new plant marks its walkways ----
  for (let x = hi.left + hi.zw; x < hi.hallR; x += hi.zw + hi.gap) for (const e of [x * TILE + 0.12, (x + hi.gap) * TILE - 0.12]) floorMark(group, M.lane, e, (hi.top + hi.bottom + 1) / 2 * TILE, 0.14, (hi.bottom - hi.top + 1) * TILE - 0.4, 0, 1);
  for (let y = hi.top + hi.zh; y < hi.bottom; y += hi.zh + hi.gap) for (const e of [y * TILE + 0.12, (y + hi.gap) * TILE - 0.12]) floorMark(group, M.lane, (hi.left + hi.hallR + 1) / 2 * TILE, e, 0.14, (hi.hallR - hi.left + 1) * TILE - 0.4, Math.PI / 2, 1);

  // ---- machines: a tall one in each work area that has the room, on four free floor tiles ----
  const machine = (kind) => {
    const g = new THREE.Group();
    if (kind === 'hopper') { // a mixing tank on legs, a cone below it, a chute, a ladder up the side, a pipe to the roof
      const tank = mesh(cyl(1.25, 1.25, 2.6, 20), steel, true); tank.position.y = 4.2; g.add(tank);
      const cone = mesh(cyl(1.25, 0.25, 1.4, 20), steel, true); cone.position.y = 2.2; g.add(cone);
      const lid = mesh(cyl(1.3, 1.3, 0.1, 20), dark); lid.position.y = 5.55; g.add(lid);
      for (const y of [3.2, 4.4, 5.3]) { const band = mesh(cyl(1.28, 1.28, 0.08, 20), rust); band.position.y = y; g.add(band); }
      for (const [lx, lz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const leg = mesh(box(0.16, 3.0, 0.16), rust, true); leg.position.set(lx * 0.95, 1.5, lz * 0.95); g.add(leg); }
      for (const [lx, lz] of [[1, 0], [0, 1]]) { const br = mesh(box(lx ? 1.9 : 0.08, 0.08, lz ? 1.9 : 0.08), rust); br.position.set(0, 0.8, 0); g.add(br); }
      const chute = mesh(box(0.35, 0.9, 0.35), dark); chute.position.set(0, 1.2, 0); chute.rotation.x = 0.4; g.add(chute);
      for (const s of [-0.2, 0.2]) { const rail = mesh(box(0.04, 5.6, 0.04), rust); rail.position.set(1.32, 2.8, s); g.add(rail); }
      for (let y = 0.3; y < 5.6; y += 0.3) { const rung = mesh(box(0.03, 0.03, 0.4), rust); rung.position.set(1.32, y, 0); g.add(rung); }
      const pipe = mesh(cyl(0.12, 0.12, 1, 10), mats.rust[1]); pipe.scale.y = CEIL - 5.6; pipe.position.set(-0.5, 5.6 + (CEIL - 5.6) / 2, 0.3); g.add(pipe);
      const motor = mesh(box(0.7, 0.5, 0.5), red, true); motor.position.set(0, 5.85, 0); g.add(motor);
    } else { // a stamping press: two great uprights, a crown, the ram half down, a bed stained dark
      for (const s of [-1, 1]) { const up = mesh(box(0.45, 4.6, 0.9), steel, true); up.position.set(s * 1.25, 2.3, 0); g.add(up); }
      const crown = mesh(box(3.2, 1.0, 1.2), steel, true); crown.position.y = 5.0; g.add(crown);
      const fly = mesh(cyl(0.75, 0.75, 0.25, 20), dark, true); fly.rotation.x = Math.PI / 2; fly.position.set(0, 5.1, -0.75); g.add(fly);
      const ram = mesh(box(2.0, 0.9, 0.8), dark, true); ram.position.y = 2.6; g.add(ram);
      const bed = mesh(box(2.4, 0.9, 1.1), steel, true); bed.position.y = 0.45; g.add(bed);
      const die = mesh(box(1.6, 0.08, 0.7), mats.rust[1]); die.position.y = 0.94; g.add(die);
      const warn = mesh(box(2.42, 0.12, 1.12), red); warn.position.y = 0.06; g.add(warn);
      for (const s of [-1, 1]) { const col = mesh(cyl(0.07, 0.07, 1.4, 8), mats.rust[1]); col.position.set(s * 0.8, 1.6, 0); g.add(col); }
    }
    g.userData.hall = true;
    return g;
  };
  for (let ri = 1; ri < L.rooms.length; ri++) {
    const r = L.rooms[ri];
    if (r.w * r.h < 40 || r.type === 'lift') continue;
    let placed = false;
    for (let y = r.y + 1; y < r.y + r.h - 2 && !placed; y++) for (let x = r.x + 1; x < r.x + r.w - 2 && !placed; x++) {
      const tiles = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
      if (tiles.some(([tx, ty]) => h.used.has(tx + ',' + ty))) continue;
      const done = [];
      for (const [tx, ty] of tiles) { if (!h.canBlock(tx, ty)) break; h.blockTile(tx, ty); done.push([tx, ty]); }
      if (done.length < 4) { for (const [tx, ty] of done) { L.block[ty * W + tx] = 0; h.used.delete(tx + ',' + ty); } continue; }
      const cx = (x + 1) * TILE, cz = (y + 1) * TILE;
      put(machine(rng() < 0.55 ? 'hopper' : 'press'), cx, 0, cz, rng() < 0.5 ? 0 : Math.PI / 2);
      h.collider(cx - 1.75, cz - 1.75, cx + 1.75, cz + 1.75);
      floorMark(group, M.hatch, cx, cz, 4.4, 4.4, 0);
      placed = true;
    }
  }

  // ---- clutter: pallets of boxes, drums, roll cages, a forklift or two, wherever it won't cut anything off ----
  const P2 = h.P2;
  const drum = (col) => { const g = new THREE.Group(); const b = mesh(cyl(0.29, 0.29, 0.88, 16), col); b.position.y = 0.44; g.add(b); for (const y of [0.3, 0.6]) { const r = mesh(cyl(0.3, 0.3, 0.03, 16), dark); r.position.y = y; g.add(r); } const lid = mesh(cyl(0.27, 0.27, 0.02, 16), dark); lid.position.y = 0.89; g.add(lid); return g; };
  const drums = () => { const g = new THREE.Group(); const n = 2 + ((rng() * 3) | 0); for (let i = 0; i < n; i++) { const d = drum(rng() < 0.5 ? red : dark); d.position.set((i % 2) * 0.62 - 0.3, 0, (i >> 1) * 0.62 - 0.3); d.rotation.y = rng() * 6; g.add(d); } if (rng() < 0.3) { const d = drum(red); d.rotation.z = Math.PI / 2; d.position.set(0.1, 0.3, 0.55); g.add(d); } return g; };
  const wrapped = () => { const g = new THREE.Group(); const pal = mesh(box(1.2, 0.14, 1.0), M.wood); pal.position.y = 0.07; g.add(pal); const hgt = [0.8, 1.1, 1.4, 1.7][(rng() * 4) | 0]; const st = mesh(box(1.12, hgt, 0.94), M.wrap); st.position.y = 0.14 + hgt / 2; g.add(st); return g; };
  const cage = () => { const g = new THREE.Group(); for (const [x, z] of [[-0.4, -0.35], [0.4, -0.35], [-0.4, 0.35], [0.4, 0.35]]) { const p = mesh(box(0.04, 1.7, 0.04), steel); p.position.set(x, 0.95, z); g.add(p); } for (const y of [0.15, 0.6, 1.05, 1.5]) for (const z of [-0.35, 0.35]) { const r = mesh(box(0.84, 0.03, 0.03), steel); r.position.set(0, y, z); g.add(r); } const base = mesh(box(0.86, 0.06, 0.74), dark); base.position.y = 0.12; g.add(base); for (let i = 0; i < 2; i++) { const c2 = mesh(box(0.6, 0.4, 0.5), M.wrap); c2.position.set(0, 0.36 + i * 0.42, 0); g.add(c2); } return g; };
  let forks = 0;
  for (let ri = 1; ri < L.rooms.length; ri++) {
    const r = L.rooms[ri];
    if (r.type === 'lift') continue;
    const tiles = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (!h.used.has(x + ',' + y)) tiles.push([x, y]);
    rng.shuffle(tiles);
    let n = 0;
    for (const [x, y] of tiles) {
      if (n >= (r.fixed ? 1 : 9)) break; // (the small rooms have their own furniture)
      if (!h.canBlock(x, y)) continue;
      h.blockTile(x, y);
      const cx = tc(x), cz = tc(y), k = rng();
      let o;
      if (k < 0.12 && forks < 3 && P2) { o = P2.forklift(mats, rng); forks++; h.collider(cx - 0.6, cz - 1.0, cx + 0.6, cz + 1.0); put(o, cx, 0, cz, rng() < 0.5 ? 0 : Math.PI); }
      else if (k < 0.45) { o = wrapped(); h.collider(cx - 0.62, cz - 0.52, cx + 0.62, cz + 0.52); put(o, cx, 0, cz, (rng() - 0.5) * 0.2); if (rng() < 0.5) { const o2 = wrapped(); put(o2, cx + (rng() - 0.5) * 0.1, 0, cz + 0, 0); o2.position.y = o.children[1].geometry.parameters.height + 0.14; } }
      else if (k < 0.75) { o = drums(); h.collider(cx - 0.65, cz - 0.65, cx + 0.65, cz + 0.65); put(o, cx, 0, cz, rng() * 6); }
      else { o = cage(); h.collider(cx - 0.45, cz - 0.4, cx + 0.45, cz + 0.4); put(o, cx, 0, cz, rng() * 6); }
      n++;
    }
  }

  // ---- the columns: bay numbers, an extinguisher, a junction box with its conduit to the roof, a beacon on some ----
  const beacons = [];
  let bay = 1;
  const cols = [];
  for (let x = hi.left; x <= hi.hallR; x++) for (let y = hi.top; y <= hi.bottom; y++) if (!L.grid[y * W + x]) cols.push([x, y]);
  // every bay number on one texture (one material for all of them: one draw per block, not one per column)
  const labels = cols.map(([x]) => `${String.fromCharCode(65 + ((x - hi.left) / (hi.zw + hi.gap) | 0))}-${String(bay++).padStart(2, '0')}`);
  const plateM = new THREE.MeshPhongMaterial({ map: atlasTex(labels, 128, 64, drawLabel), shininess: 20 });
  let nb = 0;
  cols.forEach(([x, y], ci) => {
    const cx = tc(x), cz = tc(y);
    const pg = cellGeo(new THREE.PlaneGeometry(0.9, 0.45), ci, plateM.map.userData.grid);
    for (const [dx, dz, yaw] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
      const plate = new THREE.Mesh(pg, plateM);
      put(plate, cx + dx * 1.01, 3.6, cz + dz * 1.01, yaw);
    }
    const [fx, fz, fyaw] = rng() < 0.5 ? [0, 1, 0] : [0, -1, Math.PI];
    const ext = new THREE.Group();
    const bottle = mesh(cyl(0.08, 0.08, 0.5, 12), red); bottle.position.y = 0.25; ext.add(bottle);
    const capm = mesh(cyl(0.035, 0.05, 0.08, 8), dark); capm.position.y = 0.54; ext.add(capm);
    const hose = mesh(cyl(0.012, 0.012, 0.42, 5), dark); hose.position.set(0.09, 0.32, 0); hose.rotation.z = 0.15; ext.add(hose);
    const bracket = mesh(box(0.2, 0.06, 0.08), dark); bracket.position.set(0, 0.35, -0.06); ext.add(bracket);
    put(ext, cx + fx * 1.11, 0.9, cz + fz * 1.11, fyaw);
    const jb = mesh(box(0.42, 0.55, 0.16), M.grey2); put(jb, cx + 0.45, 1.6, cz + fz * 1.08, fyaw);
    group.add(rod(M.grey2, cx + 0.45, cz + fz * 1.06, 1.88, CEIL, 0.025));
    if (nb < 6 && rng() < 0.4) { // a beacon, turning (a few: each one is drawn on its own)
      nb++;
      const b = new THREE.Group();
      const dome = mesh(geo('beacon', () => new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), M.beacon); b.add(dome);
      const base = mesh(cyl(0.14, 0.14, 0.08, 12), dark); base.position.y = -0.04; b.add(base);
      const refl = mesh(box(0.2, 0.1, 0.02), M.beaconHot); refl.position.y = 0.05; b.add(refl);
      put(b, cx, 4.3, cz + fz * 1.12, 0);
      beacons.push(b);
    }
  });

  // ---- signs high on the walls: the plant's name, and what it told its workers ----
  const SIGNS = [['HOLLOW PINES MEATWORKS', 'MAIN FLOOR · LINE 3'], ['SAFETY IS', 'EVERYONE’S JOB'], ['0', 'DAYS WITHOUT A LOST-TIME INJURY'], ['KEEP HANDS', 'CLEAR OF THE LINE'], ['HYGIENE ZONE', 'APRONS · GLOVES · HAIRNETS']];
  const walls = [];
  for (let x = hi.left + 2; x < hi.hallR - 4; x += 9) walls.push([tc(x) + 4, (hi.top) * TILE + 0.06, 0]); // the north wall, facing south
  for (let y = hi.top + 4; y < hi.bottom - 4; y += 11) walls.push([hi.left * TILE + 0.06, tc(y), Math.PI / 2]); // the west wall, facing east
  rng.shuffle(walls);
  const signM = new THREE.MeshPhongMaterial({ map: atlasTex(SIGNS, 1024, 250, drawSign), shininess: 15 });
  walls.slice(0, 6).forEach(([x, z, yaw], i) => {
    const sign = new THREE.Mesh(cellGeo(new THREE.BoxGeometry(9, 2.2, 0.06), i % SIGNS.length, signM.map.userData.grid), signM);
    put(sign, x + Math.sin(yaw) * 0.03, 7.8 + (i % 2) * 0.5, z + Math.cos(yaw) * 0.03, yaw); // (above the catwalks' rails)
  });

  // ---- pipe runs under the roof, the length of the hall, on hangers from the trusses ----
  for (const px of [tc(hi.left + (hi.zw >> 1)), tc(hi.left + hi.zw + hi.gap + (hi.zw >> 1)), tc(hi.left + 2 * (hi.zw + hi.gap) + (hi.zw >> 1))]) {
    const len = (hi.bottom - hi.top + 1) * TILE, cz = (hi.top + hi.bottom + 1) / 2 * TILE;
    for (const [off, r, m] of [[0, 0.22, M.grey2], [0.6, 0.12, red]]) { const p2 = mesh(cyl(r, r, len, 12), m); p2.rotation.x = Math.PI / 2; put(p2, px + off, CEIL - 2.6, cz); }
    for (let z = hi.top * TILE + 3; z < (hi.bottom + 1) * TILE; z += 6) group.add(rod(dark, px + 0.3, z, CEIL - 2.4, CEIL - 1.5, 0.02));
  }

  // ---- the overhead line: a chain conveyor of hooks round the middle of the hall, running until the line is stopped ----
  const xa = tc(hi.left + hi.zw + 1), xb = tc(hi.hallR), za = (hi.top + hi.zh + 1) * TILE, zb = (hi.top + 3 * (hi.zh + hi.gap) - hi.gap + 1) * TILE, railY = 4.6;
  const legs = [[xa, za, xb, za], [xb, za, xb, zb], [xb, zb, xa, zb], [xa, zb, xa, za]];
  let perim = 0;
  for (const [x1, z1, x2, z2] of legs) {
    const len = Math.hypot(x2 - x1, z2 - z1); perim += len;
    const r2 = mesh(box(len + 0.2, 0.12, 0.1), dark); put(r2, (x1 + x2) / 2, railY, (z1 + z2) / 2, Math.atan2(-(z2 - z1), x2 - x1));
    // hung from the catwalk where it runs under one (the north-south legs), from the roof where it doesn't
    for (let t = 0; t < len; t += 4) group.add(rod(dark, x1 + (x2 - x1) * t / len, z1 + (z2 - z1) * t / len, railY, x1 === x2 ? deckY - 0.15 : CEIL - 1.5, 0.02));
  }
  const step = 1.5, nHooks = Math.floor(perim / step);
  const hookG = geo('lineHook', () => { const g2 = new THREE.TorusGeometry(0.08, 0.012, 5, 10, Math.PI * 1.4); g2.rotateZ(Math.PI * 0.8); g2.translate(0, -0.72, 0); return g2; });
  const dropG = geo('lineDrop', () => new THREE.CylinderGeometry(0.008, 0.008, 0.62, 4).translate(0, -0.35, 0));
  const meatG = geo('lineMeat', () => new THREE.CapsuleGeometry(0.17, 0.75, 4, 10).translate(0, -1.32, 0));
  const meatN = Math.ceil(nHooks / 3);
  const iHook = new THREE.InstancedMesh(hookG, dark, nHooks), iDrop = new THREE.InstancedMesh(dropG, chain, nHooks), iMeat = new THREE.InstancedMesh(meatG, M.wrapMeat, meatN);
  for (const im of [iHook, iDrop, iMeat]) { im.frustumCulled = false; im.castShadow = false; group.add(im); } // (unculled: no shadow passes for them)
  const at2 = (d) => { d = ((d % perim) + perim) % perim; for (const [x1, z1, x2, z2] of legs) { const len = Math.hypot(x2 - x1, z2 - z1); if (d <= len) return [x1 + (x2 - x1) * d / len, z1 + (z2 - z1) * d / len, Math.atan2(x2 - x1, z2 - z1)]; d -= len; } return [xa, za, 0]; };
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const line = { off: 0, speed: 0, sway: 0, t: 0, beacons, hooks: [iHook, iDrop, iMeat] }; // (held here, so the baker leaves them alone)
  line.place = () => {
    let mi = 0;
    for (let i = 0; i < nHooks; i++) {
      const [x, z, yaw] = at2(i * step + line.off);
      e.set(Math.sin(line.t * 1.3 + i) * line.sway, yaw, 0); q.setFromEuler(e); pos.set(x, railY, z); mtx.compose(pos, q, one);
      iHook.setMatrixAt(i, mtx); iDrop.setMatrixAt(i, mtx);
      if (i % 3 === 0 && mi < meatN) iMeat.setMatrixAt(mi++, mtx);
    }
    iHook.instanceMatrix.needsUpdate = iDrop.instanceMatrix.needsUpdate = iMeat.instanceMatrix.needsUpdate = true;
  };
  line.place();
  // running: 0.45 m/s; stopped, it coasts to a halt and the hooks swing on
  line.update = (dt, running) => {
    line.t += dt;
    const want = running ? 0.45 : 0;
    line.speed += (want - line.speed) * Math.min(1, dt * (running ? 1 : 0.35));
    line.off += line.speed * dt;
    line.sway += ((running ? 0.03 : line.speed > 0.02 ? 0.14 : 0.04) - line.sway) * Math.min(1, dt * 0.5); // (stopping, they swing)
    for (let i = 0; i < beacons.length; i++) beacons[i].rotation.y = line.t * 4 + i;
    line.place();
  };
  out.hallLine = line;

  // ---- lockers against the columns and the outer walls: there's nowhere else to hide out here ----
  const spots = [];
  for (let y = hi.top; y <= hi.bottom; y++) for (let x = hi.left; x <= hi.hallR; x++) {
    const i = y * W + x;
    if (!L.grid[i] || L.block[i] || h.used.has(x + ',' + y) || L.roomOf[i] === 0) continue;
    if (L.door && Math.abs(L.door.x - x) + Math.abs(L.door.y - y) <= 2) continue;
    const s = h.wallSides(x, y);
    if (s.length === 1) spots.push([x, y, s[0]]);
  }
  rng.shuffle(spots);
  let n = 0;
  for (const [x, y, s] of spots) {
    if (n >= 4) break; // (only a few: out here you are meant to keep moving)
    if (h.used.has(x + ',' + y)) continue;
    // never two side by side (and never blocking an aisle's only lane: the tile beside a column stays walkable, the
    // locker stands in its back half)
    if (DIRS4.some(([dx, dy]) => h.used.has((x + dx) + ',' + (y + dy) + 'K'))) continue;
    h.lockerAt(x, y, s, 0);
    h.used.add(x + ',' + y).add(x + ',' + y + 'K');
    n++;
  }
}
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// a flat marking painted on the floor (lifted a few mm, drawn after the floor, never fighting it)
function floorMark(group, mat, x, z, w, d, yaw, alongZ = -1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.set(-Math.PI / 2, 0, yaw);
  m.position.set(x, 0.006, z);
  m.renderOrder = 1;
  m.receiveShadow = true;
  if (alongZ >= 0 && mat.map) { // the dashes keep their size whatever the length
    const uv = m.geometry.attributes.uv, k = (alongZ ? d : w) / 1.2;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, alongZ ? uv.getX(i) : uv.getX(i) * k, alongZ ? uv.getY(i) * k : uv.getY(i));
  }
  group.add(m);
  return m;
}
// several labels painted into one texture, one row each in a grid; cellGeo points a geometry's UVs at one of them
function atlasTex(items, cw, ch, draw) {
  const cols = Math.max(1, Math.floor(2048 / cw)), rows = Math.ceil(items.length / cols);
  const c = document.createElement('canvas'); c.width = cw * Math.min(cols, items.length); c.height = ch * rows;
  const g = c.getContext('2d');
  items.forEach((it, i) => { g.save(); g.translate((i % cols) * cw, ((i / cols) | 0) * ch); g.beginPath(); g.rect(0, 0, cw, ch); g.clip(); draw(g, it, i, cw, ch); g.restore(); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.userData.floorOnly = true;
  t.userData.grid = { cols: Math.min(cols, items.length), rows };
  return t;
}
function cellGeo(g, i, { cols, rows }) {
  const u0 = (i % cols) / cols, v0 = 1 - (((i / cols) | 0) + 1) / rows, uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / cols, v0 + uv.getY(k) / rows);
  return g;
}
// a stencilled bay number
function drawLabel(g, text) {
  g.fillStyle = '#e6e2da'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#9a1612'; g.fillRect(0, 0, 128, 8); g.fillRect(0, 56, 128, 8);
  g.fillStyle = '#1a1a18'; g.font = 'bold 34px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 33);
}
// a painted sign board: big red letters on white, one line of smaller black under it
function drawSign(g, [a, b], seed) {
  g.fillStyle = '#e8e4dc'; g.fillRect(0, 0, 1024, 250);
  g.fillStyle = '#9a1612'; g.fillRect(0, 0, 1024, 18); g.fillRect(0, 232, 1024, 18);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#a01812'; g.font = `bold ${a.length > 14 ? 78 : 96}px "Arial Black", Arial, sans-serif`; g.fillText(a, 512, 100);
  g.fillStyle = '#1c1c1a'; g.font = 'bold 44px Arial, sans-serif'; g.fillText(b, 512, 188);
  let s = seed * 9301 + 49297; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 24; i++) { g.fillStyle = `rgba(90,80,70,${r() * 0.18})`; g.fillRect(r() * 1024, r() * 250, 2 + r() * 6, 20 + r() * 120); } // weather running down it
}
let MATS = null;
function hallMats(mats) {
  if (MATS && MATS.src === mats) return MATS;
  const cv = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  const decal = (map) => new THREE.MeshPhongMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, shininess: 30 });
  MATS = {
    src: mats,
    galv: new THREE.MeshPhongMaterial({ color: 0x5a6266, shininess: 70, specular: 0x6a7074 }),
    grey: new THREE.MeshPhongMaterial({ color: 0x30363a, shininess: 45, specular: 0x45494c }),
    paint: new THREE.MeshPhongMaterial({ color: 0x40484c, shininess: 35, specular: 0x3a3e40 }),
    red: new THREE.MeshPhongMaterial({ color: 0x9a1812, shininess: 50, specular: 0x553330 }),
    grey2: new THREE.MeshPhongMaterial({ color: 0x5a6064, shininess: 40, specular: 0x45494c }),
    wood: new THREE.MeshPhongMaterial({ color: 0x6a5a44, shininess: 5 }),
    wrap: new THREE.MeshPhongMaterial({ color: 0xb4b0a8, shininess: 90, specular: 0x9a9a9a }), // (opaque: see-through film over every pallet cost too much)
    wrapMeat: new THREE.MeshPhongMaterial({ color: 0x8a2a24, shininess: 90, specular: 0x8a6a66 }),
    beacon: new THREE.MeshBasicMaterial({ color: 0xc81a10, transparent: true, opacity: 0.85 }),
    beaconHot: new THREE.MeshBasicMaterial({ color: 0xff6a50 }),
    // a lane: red and white dashes
    lane: decal(cv(16, 64, (g) => { g.fillStyle = '#b01a14'; g.fillRect(0, 0, 16, 32); g.fillStyle = '#e4e0d8'; g.fillRect(0, 32, 16, 32); g.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 16, Math.random() * 64, 2, 1); })),
    // a machine's bay: a hatched border round a clear middle
    hatch: decal(cv(128, 128, (g) => {
      g.strokeStyle = '#b01a14'; g.lineWidth = 7;
      g.save(); g.beginPath(); g.rect(0, 0, 128, 128); g.rect(14, 14, 100, 100); g.clip('evenodd');
      for (let k = -128; k < 256; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke(); }
      g.restore();
      g.strokeStyle = '#e4e0d8'; g.lineWidth = 2; g.strokeRect(14, 14, 100, 100);
    })),
  };
  return MATS;
}
