// OFFAL: REMASTERED: architecture. The original floors are bare tiled boxes; this dresses the same walls with what a
// 1970s meatworks actually has: steel kick plates, a bumper rail at trolley height, pipe runs under the ceiling with
// flanges and brackets, I-beams across the rooms, and steel frames where a corridor meets a room. Everything is static
// (the baker welds it per block) and drawn only: no colliders, nothing the game knows about. It has its own random
// stream, so the floor's layout and the original dressing come out exactly as they always did.
import * as THREE from 'three';
import { TILE, WALL_H } from './config.js';
import { makeRng } from './rng.js';
import * as P from './props.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function dressArchitecture(L, mats, group, theme = 'plant') {
  THREE.ownRandom(() => dress(L, mats, group, theme));
}

function dress(L, mats, group, theme) {
  const rng = makeRng(L.seed * 31 + 7);
  const CH = L.ceil || WALL_H; // (the factory floor's roof is higher: its pipes run up there)
  const { W, H, grid } = L;
  const crawl = L.crawl || new Uint8Array(W * H);
  const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !!grid[y * W + x] && !crawl[y * W + x];
  const offices = theme === 'offices';
  const kickMat = offices ? mats.darkMetal : mats.steel, railMat = mats.steel, pipeMat = theme === 'sewer' ? mats.rust[2] : mats.rust[1], beamMat = mats.rust[0];
  const put = (o, x, y, z, yaw = 0) => { o.position.set(x, y, z); o.rotation.y = yaw; group.add(o); return o; };
  const runs = new Map(); // one decision per room side (or corridor side), so a pipe runs the whole wall, not in bits
  const runOf = (i, k, p) => {
    const key = (L.roomOf[i] ?? -1) + ':' + (L.corridor && L.corridor[i] ? 'c' + i : 'r') + ':' + k;
    if (!runs.has(key)) runs.set(key, rng() < p);
    return runs.get(key);
  };
  const along = (len, r, mat, seg = 16) => { // a horizontal cylinder along the wall
    const g = new THREE.Group();
    const c = P.mesh(P.cyl(r, r, len, seg), mat, true);
    c.rotation.z = Math.PI / 2;
    g.add(c);
    return g;
  };

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!open(x, y)) continue;
    const i = y * W + x, cx = (x + 0.5) * TILE, cz = (y + 0.5) * TILE;
    const corridor = !!(L.corridor && L.corridor[i]);
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = DIRS[k];
      if (open(x + dx, y + dy)) continue;
      if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && crawl[(y + dy) * W + x + dx]) continue; // a crouchway's mouth
      // this tile has a wall on side k: (fx, fz) is the middle of the wall face, n points back into the tile
      const fx = cx + dx * TILE / 2, fz = cz + dy * TILE / 2, nx = -dx, nz = -dy, yaw = Math.atan2(dx, dy); // the part's local x runs along the wall
      const ax = -nz, az = nx; // along the wall
      // kick plate: brushed steel, the bottom 16 cm, standing 1.5 cm proud of the tiles
      put(P.mesh(P.box(TILE, 0.16, 0.015), kickMat, false), fx + nx * 0.0075, 0.08, fz + nz * 0.0075, yaw);
      if (offices) continue;
      // bumper rail at trolley height, on brackets
      if (runOf(i, k, corridor ? 0.55 : 0.7)) {
        put(along(TILE, 0.025, railMat), fx + nx * 0.075, 0.92, fz + nz * 0.075, yaw);
        for (const s of [-0.5, 0.5]) put(P.mesh(P.box(0.03, 0.05, 0.075), railMat, false), fx + nx * 0.037 + ax * s * TILE * 0.9, 0.92, fz + nz * 0.037 + az * s * TILE * 0.9, yaw);
      }
      // pipe runs up under the ceiling: one or two pipes, a flange at every joint, a bracket holding them to the wall
      if (runOf(i, k + 8, corridor ? 0.6 : 0.45)) {
        const two = runOf(i, k + 16, 0.5);
        const ch = L.low && L.low[i] ? WALL_H : CH; // (under a small room's own 3 m ceiling)
        for (let p = 0; p < (two ? 2 : 1); p++) {
          const r = p ? 0.032 : 0.05, off = p ? 0.24 : 0.12, h = ch - (p ? 0.36 : 0.2);
          put(along(TILE, r, pipeMat), fx + nx * off, h, fz + nz * off, yaw);
          put(along(0.035, r * 1.45, pipeMat, 16), fx + nx * off - ax * TILE / 2, h, fz + nz * off - az * TILE / 2, yaw);
          if (rng() < 0.35) put(along(0.03, r * 1.3, mats.chain, 12), fx + nx * off + ax * 0.2, h, fz + nz * off + az * 0.2, yaw); // a band clamp
        }
        put(P.mesh(P.box(0.04, 0.04, two ? 0.28 : 0.15), pipeMat, false), fx + nx * (two ? 0.14 : 0.075), ch - 0.14, fz + nz * (two ? 0.14 : 0.075), yaw);
      }
    }
    // steel frames where a corridor opens into a room
    for (let k = 0; k < 4; k++) {
      const [dx, dy] = DIRS[k];
      if (!open(x + dx, y + dy)) continue;
      const j = (y + dy) * W + x + dx;
      if (!(L.corridor && L.corridor[i] && !L.corridor[j] && L.roomOf[j] !== undefined && L.roomOf[j] >= 0)) continue;
      const fx = cx + dx * TILE / 2, fz = cz + dy * TILE / 2, ax = -dy, az = dx, yaw = Math.atan2(dx, dy); // the part's local x runs along the wall
      for (const s of [-1, 1]) {
        if (open(x + ax * s, y + az * s)) continue; // the corridor is wider here: no jamb
        put(P.mesh(P.box(0.12, WALL_H, 0.16), mats.darkMetal, true), fx + ax * s * (TILE / 2 - 0.06), WALL_H / 2, fz + az * s * (TILE / 2 - 0.06), yaw);
      }
      put(P.mesh(P.box(TILE, 0.22, 0.16), mats.darkMetal, false), fx, WALL_H - 0.11, fz, yaw);
    }
  }
  // I-beams across every room: a web and two flanges, on the tile lines so they never meet a lamp (lamps hang mid-tile)
  if (!offices && !L.hall) for (const r of L.rooms) { // (the factory floor has its own roof trusses: hall.js)
    const alongX = r.w <= r.h; // span the short way
    const n = alongX ? r.h : r.w, span = (alongX ? r.w : r.h) * TILE;
    for (let s = 2; s < n; s += 2) {
      const g = new THREE.Group();
      g.add(P.mesh(P.box(span, 0.2, 0.012), beamMat, false));
      for (const fy of [-0.1, 0.1]) { const f = P.mesh(P.box(span, 0.014, 0.1), beamMat, false); f.position.y = fy; g.add(f); }
      if (alongX) put(g, (r.x + r.w / 2) * TILE, WALL_H - 0.11, (r.y + s) * TILE, 0);
      else put(g, (r.x + s) * TILE, WALL_H - 0.11, (r.y + r.h / 2) * TILE, Math.PI / 2);
    }
  }
}
