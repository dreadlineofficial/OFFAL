// Floor generation: rooms joined by narrow corridors (with loops, so you can run circles around it),
// the freight lift in an alcove on the south wall, then geometry, props, collision, line of sight and A*.
import * as THREE from 'three';
import { TILE, WALL_H, difficulty } from './config.js';

export const CRAWL_H = 1.2; // the roof of a crouchway: you crouched fit (eyes at 1.0), he doesn't
import { makeRng } from './rng.js';
import * as P from './props.js';
import * as P2 from './props2.js';
import { themeMaterials, TEX } from './textures.js';
import { dressArchitecture } from './arch.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const tileCenter = (t) => t * TILE + TILE / 2;
export const toTile = (v) => Math.floor(v / TILE);
export const inCrawl = (L, x, z) => !!(L.crawl && L.crawl[toTile(z) * L.W + toTile(x)]);

// crawlOpen: the caller fits through a crouchway (you, crouched). Everything else (him, his eyes) treats one as rock.
export function isWall(L, tx, ty, crawlOpen = false) {
  if (tx < 0 || ty < 0 || tx >= L.W || ty >= L.H || L.grid[ty * L.W + tx] === 0) return true;
  if (!crawlOpen && L.crawl && L.crawl[ty * L.W + tx]) return true;
  const d = L.door;
  return !!(d && d.closed && d.x === tx && d.y === ty);
}

// a floor that needs a sealed wing (the keypad puzzle) retries seeds until the map has a chokepoint for it
export function makeLayout(depth, seed, D) {
  for (let i = 0; i < 40; i++) {
    const L = generateLayout(depth, seed + i * 7919, D);
    if (!D.puzzles.includes('keypad')) return L;
    const wing = findWing(L);
    if (!wing) continue;
    L.door = wing.door;
    L.wing = wing;
    L.block[wing.door.y * L.W + wing.door.x] = 1;
    return L;
  }
  // no chokepoint anywhere for a shutter: drop the keypad from this floor rather than fail
  D.puzzles = D.puzzles.filter((k) => k !== 'keypad');
  return generateLayout(depth, seed, D);
}

// a straight piece of corridor that, shut, cuts off a good chunk of the floor (but never the lift)
function findWing(L) {
  const { W, H, grid, corridor, rooms, alcove } = L;
  const start = alcove.y * W + alcove.x;
  const reach = (shut) => {
    const seen = new Uint8Array(W * H), q = [start];
    seen[start] = 1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], cx = c % W, cy = (c / W) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (!grid[n] || seen[n] || n === shut) continue;
        seen[n] = 1;
        q.push(n);
      }
    }
    return seen;
  };
  let best = null;
  for (let i = 0; i < W * H; i++) {
    if (!corridor[i]) continue;
    const x = i % W, y = (i / W) | 0;
    const ew = !isWall(L, x - 1, y) && !isWall(L, x + 1, y) && isWall(L, x, y - 1) && isWall(L, x, y + 1);
    const ns = !isWall(L, x, y - 1) && !isWall(L, x, y + 1) && isWall(L, x - 1, y) && isWall(L, x + 1, y);
    if (!ew && !ns) continue;
    const seen = reach(i);
    const cut = [];
    rooms.forEach((r, ri) => { if (ri > 0 && !seen[r.cy * W + r.cx]) cut.push(ri); });
    if (cut.length < 2 || cut.length > (rooms.length - 1) * 0.55) continue;
    const score = -Math.abs(cut.length - (rooms.length - 1) * 0.35);
    if (!best || score > best.score) best = { score, x, y, ns, seen, cut };
  }
  if (!best) return null;
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (grid[i] && !best.seen[i] && i !== best.y * W + best.x) mask[i] = 1;
  // which side of the shutter you arrive from
  const [sx, sy] = best.ns ? (best.seen[(best.y - 1) * W + best.x] ? [0, -1] : [0, 1]) : (best.seen[best.y * W + best.x - 1] ? [-1, 0] : [1, 0]);
  return { door: { x: best.x, y: best.y, ns: best.ns, side: [sx, sy], closed: true }, mask, rooms: best.cut };
}

// ---------- layout ----------
// ---------- layouts ----------
// rooms scattered and joined by a spanning tree plus a few loops: the meatworks, and (with other sizes and
// corridor styles) the offices, the drains and the deep freeze. The order of rng calls for the meatworks is
// exactly what it always was, so a saved floor comes back the same.
function standardRooms(c, nRooms, { size, wide = false, meander = false, extra = 0.45 }) {
  const { rng, W, H, grid, roomOf, corridor, rooms } = c;
  const lw = 4, lh = 3, lx = rng.int(2, W - lw - 2), ly = H - 2 - lh;
  rooms.push({ x: lx, y: ly, w: lw, h: lh, type: 'lift' });
  const ax = lx + rng.int(1, lw - 2), ay = H - 2;
  for (let tries = 0; rooms.length < nRooms + 1 && tries < 600; tries++) {
    const [w, h] = size(rooms.length - 1);
    const x = rng.int(1, W - w - 1), y = rng.int(1, H - h - 7);
    if (y < 1 || x < 1 || w < 2 || h < 2) continue;
    if (rooms.some((r) => x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y)) continue;
    rooms.push({ x, y, w, h, type: '' });
  }
  rooms.forEach((r, i) => {
    r.cx = r.x + (r.w >> 1);
    r.cy = r.y + (r.h >> 1);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { grid[y * W + x] = 1; roomOf[y * W + x] = i; }
  });
  const open = (x, y) => { if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return; const i = y * W + x; if (!grid[i]) { grid[i] = 1; corridor[i] = 1; } };
  const carve = (a, b) => {
    let x = a.cx, y = a.cy;
    const step = (tx, ty) => {
      while (x !== tx || y !== ty) {
        if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y);
        open(x, y);
      }
    };
    if (meander) {
      // the drains wander: pick an axis at random every step, so the tunnels come out ragged
      while (x !== b.cx || y !== b.cy) {
        if (x !== b.cx && (y === b.cy || rng() < 0.5)) x += Math.sign(b.cx - x); else y += Math.sign(b.cy - y);
        open(x, y);
      }
      return;
    }
    const horizFirst = rng() < 0.5;
    if (horizFirst) { step(b.cx, y); step(b.cx, b.cy); } else { step(x, b.cy); step(b.cx, b.cy); }
    if (wide) {
      // two tiles across: retrace the same route one tile over
      x = a.cx + (horizFirst ? 0 : 1); y = a.cy + (horizFirst ? 1 : 0);
      if (horizFirst) { step(b.cx + 1, y); step(b.cx + 1, b.cy); } else { step(x, b.cy + 1); step(b.cx, b.cy + 1); }
    }
  };
  const inTree = [0], dist2 = (a, b) => (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;
  const linked = new Set();
  while (inTree.length < rooms.length) {
    let best = null;
    for (const i of inTree) rooms.forEach((r, j) => {
      if (inTree.includes(j)) return;
      const d = dist2(rooms[i], r);
      if (!best || d < best[0]) best = [d, i, j];
    });
    carve(rooms[best[1]], rooms[best[2]]);
    linked.add(best[1] + ',' + best[2]).add(best[2] + ',' + best[1]);
    inTree.push(best[2]);
  }
  rooms.forEach((r, i) => {
    if (!rng.chance(extra)) return;
    const near = rooms.map((o, j) => [dist2(r, o), j]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]).slice(0, 3);
    const [, j] = rng.pick(near);
    if (!linked.has(i + ',' + j)) { carve(r, rooms[j]); linked.add(i + ',' + j).add(j + ',' + i); }
  });
  return { ax, ay };
}

// the morgue is a hospital wing, laid out on a plan: long two-tile halls running east-west, rows of rooms
// between them, each room off one hall by a single door, and narrow stairwell passages joining the halls
function wardRooms(c) {
  const { rng, W, H, grid, roomOf, corridor, rooms, keypad } = c;
  const set = (x, y, corr, ri = -1) => { if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return; const i = y * W + x; grid[i] = 1; if (corr) corridor[i] = 1; if (ri >= 0) roomOf[i] = ri; };
  const lw = 4, lh = 3, lx = Math.max(3, Math.min(W - lw - 3, (W >> 1) - 2 + rng.int(-4, 4))), ly = H - 2 - lh;
  rooms.push({ x: lx, y: ly, w: lw, h: lh, type: 'lift' });
  const ax = lx + rng.int(1, lw - 2), ay = H - 2;
  const halls = [];
  for (let y = ly - 2; y >= 2; y -= 9) {
    const x0 = rng.int(1, 4), x1 = W - 2 - rng.int(0, 3);
    halls.push({ y, x0: Math.min(x0, lx), x1: Math.max(x1, lx + lw - 1) });
  }
  for (const h of halls) for (let y = h.y; y <= h.y + 1; y++) for (let x = h.x0; x <= h.x1; x++) set(x, y, true);
  // bands of rooms: between each pair of halls, and above the top one
  const bands = [];
  for (let k = 0; k < halls.length; k++) {
    const lower = halls[k], upper = halls[k + 1] || null;
    if (upper) bands.push({ top: upper.y + 3, h: 5, up: upper, down: lower });
    else if (lower.y - 2 >= 3) bands.push({ top: Math.max(1, lower.y - 6), h: lower.y - 1 - Math.max(1, lower.y - 6), up: null, down: lower });
  }
  for (const b of bands) {
    if (b.h < 2) continue;
    // where the stairwells go up through this band (only between two halls)
    const stairs = [];
    if (b.up) {
      const n = keypad ? 1 : 1 + (rng() < 0.6 ? 1 : 0);
      const lo = Math.max(b.up.x0, b.down.x0) + 2, hi = Math.min(b.up.x1, b.down.x1) - 2;
      for (let i = 0; i < n; i++) stairs.push(rng.int(lo, hi));
    }
    let x = 2;
    while (x < W - 3) {
      if (stairs.some((sx) => sx >= x && sx <= x + 1)) {
        const sx = stairs.find((v) => v >= x && v <= x + 1);
        for (let y = b.top - 1; y <= b.top + b.h; y++) set(sx, y, true);
        x = sx + 2;
        continue;
      }
      let w = rng.int(3, 6);
      const nextStair = stairs.filter((sx) => sx > x).sort((p, q) => p - q)[0];
      if (nextStair !== undefined && x + w >= nextStair) w = nextStair - x - 1;
      if (x + w > W - 2) w = W - 2 - x;
      if (w < 2) { x += Math.max(1, w) + 1; continue; }
      const ri = rooms.length;
      const r = { x, y: b.top, w, h: b.h, type: '' };
      rooms.push(r);
      for (let y = r.y; y < r.y + r.h; y++) for (let xx = r.x; xx < r.x + r.w; xx++) set(xx, y, false, ri);
      // its door: onto the hall above or below, wherever there is one alongside
      const canUp = b.up && x + 1 >= b.up.x0 && x + w - 2 <= b.up.x1, canDown = x + 1 >= b.down.x0 && x + w - 2 <= b.down.x1;
      const doors = [];
      if (canUp && canDown) doors.push(rng() < 0.5 ? 'up' : 'down');
      else if (canUp) doors.push('up');
      else if (canDown) doors.push('down');
      if (!keypad && canUp && canDown && rng() < 0.3) doors.push(doors[0] === 'up' ? 'down' : 'up'); // a back way through
      for (const d of doors) {
        const dx = rng.int(x, x + w - 1), dy = d === 'up' ? r.y - 1 : r.y + r.h;
        set(dx, dy, true);
      }
      // and sometimes straight through into the next room along
      if (!keypad && rng() < 0.3 && x + w + 1 < W - 3) set(x + w, rng.int(r.y, r.y + r.h - 1), true);
      x += w + 1;
    }
  }
  rooms.forEach((r) => { r.cx = r.x + (r.w >> 1); r.cy = r.y + (r.h >> 1); });
  rooms[0].cx = rooms[0].x + (rooms[0].w >> 1); rooms[0].cy = rooms[0].y + (rooms[0].h >> 1);
  for (let y = rooms[0].y; y < rooms[0].y + rooms[0].h; y++) for (let x = rooms[0].x; x < rooms[0].x + rooms[0].w; x++) set(x, y, false, 0);
  // anything a room got cut off from (a door that landed off the end of a short hall): join it to the nearest hall
  const seen = new Uint8Array(W * H), q = [ay * W + ax];
  grid[q[0]] = 1;
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) { const cc = q[h], cx = cc % W, cy = (cc / W) | 0; for (const [dx, dy] of DIRS) { const n = (cy + dy) * W + cx + dx; if (grid[n] && !seen[n]) { seen[n] = 1; q.push(n); } } }
  rooms.forEach((r) => {
    if (seen[r.cy * W + r.cx]) return;
    // dig straight down (or up) until we hit something connected
    for (const dir of [1, -1]) {
      let y = dir > 0 ? r.y + r.h : r.y - 1;
      const path = [];
      while (y > 0 && y < H - 1 && !seen[y * W + r.cx]) { path.push(y); y += dir; }
      if (y > 0 && y < H - 1 && seen[y * W + r.cx]) { for (const py of path) set(r.cx, py, true); return; }
    }
  });
  return { ax, ay };
}

export function generateLayout(depth, seed, D = difficulty(depth)) {
  const rng = makeRng(seed);
  const W = D.size, H = D.size;
  const grid = new Uint8Array(W * H);
  const roomOf = new Int16Array(W * H).fill(-1);
  const corridor = new Uint8Array(W * H);
  const rooms = [];

  const theme = D.theme || 'plant';
  const c = { rng, W, H, grid, roomOf, corridor, rooms, keypad: !!(D.puzzles && D.puzzles.includes('keypad')) };
  const { ax, ay } = theme === 'morgue' ? wardRooms(c)
    : theme === 'offices' ? standardRooms(c, D.rooms, { size: (i) => (i < 3 ? [rng.int(8, 12), rng.int(6, 9)] : [rng.int(3, 5), rng.int(3, 4)]), wide: true, extra: 0.4 })
    : theme === 'sewer' ? standardRooms(c, D.rooms, { size: () => { const k = rng.int(3, 5); return [k, k + rng.int(-1, 1)]; }, meander: true, extra: 0.6 })
    : theme === 'processing' ? standardRooms(c, D.rooms, { size: (i) => (i < 4 ? [rng.int(9, 13), rng.int(5, 7)] : [rng.int(4, 6), rng.int(3, 5)]), wide: true, extra: 0.45 })
    : theme === 'freezer' ? standardRooms(c, Math.max(5, Math.round(D.rooms * 0.6)), { size: () => [rng.int(7, 11), rng.int(6, 9)], wide: true, extra: 0.5 })
    : standardRooms(c, D.rooms, { size: () => [rng.int(3, 7), rng.int(3, 6)], extra: c.keypad ? 0.2 : 0.45 });
  grid[ay * W + ax] = 1;

  // crouchways: low crawl tunnels through the rock, out of dead ends and as a few shortcuts. You fit; he doesn't.
  // (their own rng, so the rest of a floor comes out the same as it always did for a given seed)
  const crawl = new Uint8Array(W * H), crng = makeRng((seed ^ 0x6c3a91) >>> 0);
  const tunnel = (x, y, dx, dy, from) => {
    const tiles = [];
    for (let t = 1; t <= 8; t++) {
      const nx = x + dx * t, ny = y + dy * t;
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) return null;
      const n = ny * W + nx;
      if (grid[n]) {
        if (tiles.length < 2 || crawl[n] || roomOf[n] === 0 || (from >= 0 && roomOf[n] === from) || (nx === ax && ny === ay)) return null;
        return tiles;
      }
      // enclosed both sides, so it reads as a tunnel and doesn't open sideways into anything
      if (grid[(ny + dx) * W + nx + dy] || grid[(ny - dx) * W + nx - dy]) return null;
      tiles.push(n);
    }
    return null;
  };
  const carveCrawl = (tiles) => { for (const n of tiles) { grid[n] = 1; crawl[n] = 1; } };
  const roomTunnels = (r, ri) => {
    const out = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) for (const [dx, dy] of DIRS) {
      const ox = x + dx, oy = y + dy;
      if (roomOf[oy * W + ox] === ri) continue; // only from the room's edge, outward
      const t = tunnel(x, y, dx, dy, ri);
      if (t) out.push(t);
    }
    return out;
  };
  const exits = (r, ri) => {
    const seen = new Set();
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) for (const [dx, dy] of DIRS) {
      const n = (y + dy) * W + x + dx;
      if (grid[n] && roomOf[n] !== ri) seen.add(n);
    }
    return seen.size;
  };
  // every dead-end room gets a way out the back
  rooms.forEach((r, ri) => {
    if (ri === 0 || exits(r, ri) > 1) return;
    const c = roomTunnels(r, ri).sort((a, b) => a.length - b.length);
    if (c.length) carveCrawl(c[Math.min(c.length - 1, (crng() * 2) | 0)]);
  });
  // and so does every corridor that stops short
  for (let i = 0; i < W * H; i++) {
    if (!corridor[i] || crawl[i]) continue;
    const x = i % W, y = (i / W) | 0, open = DIRS.filter(([dx, dy]) => grid[(y + dy) * W + x + dx]);
    if (open.length !== 1) continue;
    const back = open[0];
    const c = DIRS.filter(([dx, dy]) => dx !== back[0] || dy !== back[1]).map(([dx, dy]) => tunnel(x, y, dx, dy, -1)).filter(Boolean).sort((a, b) => a.length - b.length);
    if (c.length) carveCrawl(c[0]);
  }
  // a few more, anywhere, as escape routes
  const extra = 2 + Math.floor(rooms.length / 5);
  for (let k = 0, tries = 0; k < extra && tries < 60; tries++) {
    const ri = 1 + Math.floor(crng() * (rooms.length - 1)), c = roomTunnels(rooms[ri], ri);
    if (!c.length) continue;
    carveCrawl(c[Math.floor(crng() * c.length)]);
    k++;
  }

  // room jobs: what each room is for depends on what kind of floor it is
  const others = rooms.slice(1);
  if (theme === 'plant') {
    const pool = D.pool || ['cold', 'butcher', 'lockers', 'morgue', 'pit']; // (some floors bring their own kinds of room)
    rng.shuffle(others);
    others.forEach((r, i) => {
      if (i < pool.length) r.type = pool[i];
      else r.type = D.pool ? rng.pick(D.pool) : r.w * r.h >= 16 ? rng.pick(['cold', 'cold', 'butcher', 'pit']) : rng.pick(['butcher', 'lockers', 'morgue']);
      if (r.type === 'cold' && r.w * r.h < 12) r.type = 'butcher';
      if (D.pool && ['hanging', 'line', 'pens'].includes(r.type) && r.w * r.h < 12) r.type = 'butcher';
    });
  } else {
    const jobs = {
      morgue: { first: ['freezer', 'autopsy', 'ward', 'records', 'freezer', 'lockers'], then: ['freezer', 'ward', 'autopsy', 'records', 'lockers', 'freezer'] },
      offices: { first: ['office', 'meeting', 'breakroom', 'copy', 'lockers'], then: ['office', 'office', 'meeting', 'copy', 'lockers'] },
      sewer: { first: ['cistern', 'pumproom', 'nest', 'lockers', 'junction'], then: ['junction', 'junction', 'cistern', 'pumproom', 'lockers'] },
      freezer: { first: ['racks', 'hanging', 'dock', 'blast', 'lockers'], then: ['racks', 'hanging', 'racks', 'blast'] },
      processing: { first: ['line', 'line', 'packing', 'mincer', 'wash', 'lockers'], then: ['line', 'packing', 'mincer', 'wash'] },
    }[theme];
    const shuffled = rng.shuffle(others.slice());
    let k = 0;
    for (const r of shuffled) {
      if (theme === 'offices' && r.w * r.h >= 40) { r.type = 'openplan'; continue; }
      r.type = k < jobs.first.length ? jobs.first[k] : rng.pick(jobs.then);
      k++;
    }
  }

  // walking distance from the lift: what's far away is where the tags (and the Foreman) are
  const dist = new Int32Array(W * H).fill(-1);
  const q = [ay * W + ax];
  dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy, n = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || !grid[n] || dist[n] >= 0) continue;
      dist[n] = dist[c] + 1;
      q.push(n);
    }
  }
  // the drains run with water: every tunnel, and the cisterns
  const water = new Uint8Array(W * H);
  if (theme === 'sewer') {
    for (let i = 0; i < W * H; i++) if (corridor[i] && !crawl[i]) water[i] = 1;
    rooms.forEach((r, ri) => { if (r.type === 'cistern') for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) water[y * W + x] = 1; });
  }
  return { depth, seed, W, H, grid, roomOf, corridor, crawl, water, theme, rooms, alcove: { x: ax, y: ay }, dist, block: new Uint8Array(W * H), D };
}

// ---------- geometry ----------
class Geo {
  constructor() { this.p = []; this.n = []; this.uv = []; this.i = []; }
  quad(p0, r, u, n, flip) {
    const b = this.p.length / 3;
    const v = [p0, [p0[0] + r[0], p0[1] + r[1], p0[2] + r[2]], [p0[0] + r[0] + u[0], p0[1] + r[1] + u[1], p0[2] + r[2] + u[2]], [p0[0] + u[0], p0[1] + u[1], p0[2] + u[2]]];
    const uv = flip ? [[1, 0], [0, 0], [0, 1], [1, 1]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let k = 0; k < 4; k++) { this.p.push(...v[k]); this.n.push(...n); this.uv.push(...uv[k]); }
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.i);
    return g;
  }
}

export function buildLevel(L, mats) {
  const rng = makeRng(L.seed * 7 + 3);
  const { W, H, grid, D } = L;
  const crawl = L.crawl || new Uint8Array(W * H);
  const group = new THREE.Group();
  const out = {
    group, colliders: [], lamps: [], corpses: [], pickups: [], lockers: [], swingers: [], screamers: [],
    bloodTiles: new Uint8Array(W * H), hunterSpawns: [],
  };
  const add = (o, x, z, yaw = 0) => { o.position.x = x; o.position.z = z; o.rotation.y = yaw; group.add(o); return o; };
  const collider = (x0, z0, x1, z1, solidForHunters = true) => out.colliders.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), hunters: solidForHunters });

  // shell
  const wallBufs = new Map(), floorBufs = new Map(), ceil = new Geo();
  const buf = (map, k) => map.get(k) || map.set(k, new Geo()).get(k);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!grid[i] || crawl[i]) continue;
    const room = L.rooms[L.roomOf[i]];
    const goreBoost = room && (room.type === 'butcher' || room.type === 'pit') ? 1 : 0;
    const style = room ? (L.roomOf[i] + L.depth) % 3 : L.depth % 3;
    const cx = tileCenter(x), cz = tileCenter(y);
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      const nb = ny * W + nx;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && grid[nb] && !crawl[nb]) continue; // geometry ignores the shutter
      const n = [-dx, 0, -dy];
      const r = [-dy, 0, dx]; // so that r x up points along n: the face is front-facing from inside the tile
      const p0 = [cx + dx * TILE / 2 - r[0] * TILE / 2, 0, cz + dy * TILE / 2 - r[2] * TILE / 2];
      let gore = D.intro ? 0 : rng() < 0.3 + 0.17 * D.gore + goreBoost * 0.2 ? Math.min(3, 1 + Math.floor(rng() * (D.gore + 1 + goreBoost))) : 0;
      const flip = rng() < 0.5;
      // a crouchway's mouth: only the wall above it
      if (crawl[nb]) buf(wallBufs, gore * 3 + style).quad([p0[0], CRAWL_H, p0[2]], [r[0] * TILE, 0, r[2] * TILE], [0, WALL_H - CRAWL_H, 0], n, flip);
      else buf(wallBufs, gore * 3 + style).quad(p0, [r[0] * TILE, 0, r[2] * TILE], [0, WALL_H, 0], n, flip);
    }
    let fk = 0;
    if (room && room.type === 'pit' && x === room.cx && y === room.cy) fk = 2;
    else if (!D.intro && rng() < 0.06 + D.gore * 0.05 + goreBoost * 0.1) fk = 1;
    else if (L.corridor[i] && rng() < 0.08) fk = 3;
    if (fk) out.bloodTiles[i] = 1;
    buf(floorBufs, fk).quad([x * TILE, 0, (y + 1) * TILE], [TILE, 0, 0], [0, 0, -TILE], [0, 1, 0], rng() < 0.5);
    ceil.quad([x * TILE, WALL_H, y * TILE], [TILE, 0, 0], [0, 0, TILE], [0, -1, 0], false);
  }
  // the crouchways themselves: their own rng, so the rest of the floor dresses the same as it always has
  {
    const crng = makeRng(L.seed * 13 + 5), cw = new Geo(), cf = new Geo(), cc = new Geo();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!crawl[i]) continue;
      const cx = tileCenter(x), cz = tileCenter(y);
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, nb = ny * W + nx;
        if (grid[nb]) {
          if (crawl[nb]) continue;
          // the mouth: a rusted frame, and strips of filthy plastic hanging in it
          const fr = P.crawlMouth(mats, crng);
          add(fr, cx + dx * TILE / 2, cz + dy * TILE / 2, Math.atan2(dx, dy));
          continue;
        }
        const n = [-dx, 0, -dy], r = [-dy, 0, dx];
        const p0 = [cx + dx * TILE / 2 - r[0] * TILE / 2, 0, cz + dy * TILE / 2 - r[2] * TILE / 2];
        cw.quad(p0, [r[0] * TILE, 0, r[2] * TILE], [0, CRAWL_H, 0], n, crng() < 0.5);
      }
      cf.quad([x * TILE, 0, (y + 1) * TILE], [TILE, 0, 0], [0, 0, -TILE], [0, 1, 0], crng() < 0.5);
      cc.quad([x * TILE, CRAWL_H, y * TILE], [TILE, 0, 0], [0, 0, TILE], [0, -1, 0], false);
      // pipes along the low roof
      if (crng() < 0.7) { const pipe = P.crawlPipe(mats, crng); add(pipe, cx, cz, crawl[i + 1] || crawl[i - 1] ? Math.PI / 2 : 0); }
    }
    if (cw.p.length) group.add(P.mesh(cw.build(), mats.rust[0], false));
    if (cf.p.length) group.add(P.mesh(cf.build(), mats.floors[3], false));
    if (cc.p.length) group.add(P.mesh(cc.build(), mats.rust[1], false));
  }
  // every kind of floor has its own surfaces; the meatworks keeps the originals
  const TM = themeMaterials(mats, L.depth === 0 && L.theme === 'offices' ? 'hiring' : L.theme || 'plant'); // (the hiring office: its own surfaces, not Administration's)
  for (const [k, g] of wallBufs) { const m = P.mesh(g.build(), TM ? TM.walls[Math.floor(k / 3)] : mats.walls[k], false); group.add(m); }
  for (const [k, g] of floorBufs) { const m = P.mesh(g.build(), TM ? TM.floors[k] : mats.floors[k], false); group.add(m); }
  group.add(P.mesh(ceil.build(), TM ? TM.ceil : mats.ceil, false));
  if (TEX.pbr) dressArchitecture(L, mats, group, L.theme || 'plant'); // the remaster's rails, pipes, beams and frames
  // the drains: dark water over every wet tile
  if (L.water && L.water.some((v) => v)) {
    const wet = [];
    for (let i = 0; i < W * H; i++) if (L.water[i]) wet.push([i % W, (i / W) | 0]);
    out.water = P2.waterSheet(mats, wet, TILE, L);
    group.add(out.water);
  }

  const lampAt = (x, z, kind, room) => {
    const r = rng();
    const state = D.intro ? 'ok' : r < D.deadLamps ? 'dead' : r < D.deadLamps + 0.3 ? 'flicker' : 'ok'; // the office: every light works
    const o = add(P.makeLamp(mats, kind), x, z, rng() < 0.5 ? 0 : Math.PI / 2);
    out.lamps.push({ pos: new THREE.Vector3(x, WALL_H - (kind === 'tube' ? 0.2 : 0.75), z), obj: o, state, phase: rng() * 100, room, on: 1 });
    if (state === 'dead') o.userData.bulb.material = mats.lampOff;
  };

  // which wall faces a tile has, for things that stand against walls
  // real walls only: the wing's shutter is not somewhere to hang a fuse box
  const solid = (x, y) => x < 0 || y < 0 || x >= W || y >= H || !grid[y * W + x];
  const wallSides = (x, y) => DIRS.filter(([dx, dy]) => solid(x + dx, y + dy));

  const lockerAt = (x, y, [dx, dy], off = 0) => {
    const cx = tileCenter(x), cz = tileCenter(y);
    const fx = -dx, fz = -dy, yaw = Math.atan2(fx, fz);
    const sx = -fz, sz = fx; // sideways along the wall
    const ox = cx + dx * (TILE / 2 - 0.53) + sx * off, oz = cz + dy * (TILE / 2 - 0.53) + sz * off;
    const o = add(P.makeLocker(mats, rng), ox, oz, yaw);
    const bx = ox + dx * 0.53, bz = oz + dy * 0.53;
    collider(ox - Math.abs(sx) * 0.31, oz - Math.abs(sz) * 0.31, bx + Math.abs(sx) * 0.31, bz + Math.abs(sz) * 0.31);
    out.lockers.push({ obj: o, pos: new THREE.Vector3(ox, 0, oz), facing: new THREE.Vector3(fx, 0, fz), yaw, camYaw: yaw + Math.PI, open: 0, target: 0 });
  };

  // a drawer bank against the wall of tile (x, y) on side s
  const placeBank = (x, y, [dx, dy], labelTex, bodies) => {
    const b = P.drawerBank(mats, rng, labelTex, bodies);
    const ox = tileCenter(x) + dx * TILE / 2, oz = tileCenter(y) + dy * TILE / 2, yaw = Math.atan2(-dx, -dy);
    add(b.group, ox, oz, yaw);
    const ax = Math.abs(dy) * 1, az = Math.abs(dx) * 1; // half-width along the wall
    collider(ox - ax - Math.abs(dx) * 0.0, oz - az, ox - dx * 0.28 + ax, oz - dy * 0.28 + az);
    // world positions of each drawer front
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (const d of b.drawers) d.pos = new THREE.Vector3(ox + d.local.x * cos + d.local.z * sin, d.local.y, oz - d.local.x * sin + d.local.z * cos);
    b.pos = new THREE.Vector3(ox - dx * 0.8, 1.2, oz - dy * 0.8);
    return b;
  };
  out.placeBank = placeBank;
  out.drawerBanks = [];
  const interior = (r) => {
    const t = [];
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) t.push([x, y]);
    return t;
  };
  const allTiles = (r) => {
    const t = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) t.push([x, y]);
    return t;
  };
  const used = new Set();
  // keep the way into every crouchway clear
  for (let i = 0; i < W * H; i++) if (crawl[i]) for (const [dx, dy] of DIRS) { const x = (i % W) + dx, y = ((i / W) | 0) + dy; if (grid[y * W + x] && !crawl[y * W + x]) used.add(x + ',' + y); }

  // a free stretch of wall in room r: [x, y, side]. Marks it used.
  const wallSpot = (r, pred = () => true) => {
    const opts = [];
    for (const [x, y] of allTiles(r)) for (const sd of wallSides(x, y)) if (!used.has(x + ',' + y + 'L' + sd) && !used.has(x + ',' + y) && pred(x, y, sd)) opts.push([x, y, sd]);
    if (!opts.length) return null;
    const t = rng.pick(opts);
    used.add(t[0] + ',' + t[1] + 'L' + t[2]);
    return t;
  };
  // put o against that wall, facing into the room; give it a collider depth d (in from the wall) and width w
  const onWall = (o, [x, y, [dx, dy]], d = 0.5, w = 1, solid = true) => {
    const ox = tileCenter(x) + dx * TILE / 2, oz = tileCenter(y) + dy * TILE / 2;
    add(o, ox, oz, Math.atan2(-dx, -dy));
    if (solid) { const ax = Math.abs(dy) * w / 2 + Math.abs(dx) * 0.001, az = Math.abs(dx) * w / 2 + Math.abs(dy) * 0.001; collider(ox - ax, oz - az, ox - dx * d + ax, oz - dy * d + az); }
    return o;
  };
  const centerOf = (x, y) => [tileCenter(x), tileCenter(y)];
  const blockTile = (x, y) => { L.block[y * W + x] = 1; used.add(x + ',' + y); };
  // Can furniture fill tile (x, y) without walling anything off? Never a doorway (a room tile touching anything
  // outside the room), and every walkable tile on the floor must still be reachable from the lift afterwards.
  const doorAt = L.door ? L.door.y * W + L.door.x : -1;
  const passable = (i) => grid[i] && (!L.block[i] || i === doorAt);
  const reachAll = () => {
    const seen = new Uint8Array(W * H), q = [L.alcove.y * W + L.alcove.x];
    seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) { const c = q[h], cx = c % W, cy = (c / W) | 0; for (const [dx, dy] of DIRS) { const n = (cy + dy) * W + cx + dx; if (!seen[n] && passable(n)) { seen[n] = 1; q.push(n); } } }
    return q.length;
  };
  const canBlock = (x, y) => {
    const i = y * W + x;
    if (!passable(i) || i === doorAt || crawl[i]) return false;
    const ri = L.roomOf[i];
    for (const [dx, dy] of DIRS) { const n = (y + dy) * W + x + dx; if (grid[n] && L.roomOf[n] !== ri) return false; }
    const before = reachAll();
    L.block[i] = 1;
    const ok = reachAll() === before - 1;
    L.block[i] = 0;
    return ok;
  };
  function furnish(r, ri) {
    const rx = r.x * TILE, rz = r.y * TILE, rw = r.w * TILE, rh = r.h * TILE;
    const inner = rng.shuffle(interior(r).filter(([x, y]) => !used.has(x + ',' + y)));
    switch (r.type) {
      // ---- the hospital wing ----
      case 'autopsy': {
        for (const [x, y] of inner.filter(([x, y]) => canBlock(x, y)).slice(0, r.w * r.h >= 15 ? 2 : 1)) {
          const [cx, cz] = centerOf(x, y);
          add(P.autopsyTable(mats, rng), cx, cz, 0);
          collider(cx - 1, cz - 0.42, cx + 1, cz + 0.42);
          blockTile(x, y);
          add(P2.instrumentCart(mats, rng), cx + (rng() - 0.5) * 0.6, cz + 0.85, rng() * 0.6);
          group.add(P.decal(mats.pool[(rng() * 3) | 0], 2.2, cx, cz + 0.3, rng() * 6));
        }
        const sp = wallSpot(r); if (sp) onWall(P2.sink(mats, rng), sp, 0.45, 0.6);
        const sh = wallSpot(r); if (sh) onWall(P2.specimenShelf(mats, rng), sh, 0.38, 1.45);
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (rng() < 0.3) out.bloodTiles[y * W + x] = 1;
        return true;
      }
      case 'ward': {
        // beds head-on to the walls, curtains between them, drips and a wheelchair
        let beds = 0;
        for (let k = 0; k < 6 && beds < Math.max(2, (r.w * r.h) / 4); k++) {
          const sp = wallSpot(r, (x, y) => wallSides(x, y).length === 1 && canBlock(x, y));
          if (!sp) break;
          const [x, y, [dx, dy]] = sp;
          blockTile(x, y);
          const b = P2.hospitalBed(mats, rng);
          const ox = tileCenter(x) + dx * (TILE / 2 - 1.02), oz = tileCenter(y) + dy * (TILE / 2 - 1.02);
          add(b, ox, oz, Math.atan2(-dx, -dy));
          collider(ox - (Math.abs(dy) * 0.5 + Math.abs(dx) * 1.0), oz - (Math.abs(dx) * 0.5 + Math.abs(dy) * 1.0), ox + (Math.abs(dy) * 0.5 + Math.abs(dx) * 1.0), oz + (Math.abs(dx) * 0.5 + Math.abs(dy) * 1.0));
          used.add(x + ',' + y);
          if (rng() < 0.7) add(P2.ivStand(mats, rng), ox + dy * 0.7, oz - dx * 0.7, rng() * 6);
          if (rng() < 0.6) add(P2.curtain(mats, rng), ox + dy * 1.0, oz - dx * 1.0, Math.atan2(-dy, dx) + Math.PI / 2);
          beds++;
        }
        if (inner.length && rng() < 0.6) { const [x, y] = inner[0]; add(P2.wheelchair(mats, rng), tileCenter(x) + (rng() - 0.5), tileCenter(y) + (rng() - 0.5), rng() * 6); }
        return true;
      }
      case 'records': {
        for (let k = 0; k < Math.min(6, r.w + r.h); k++) { const sp = wallSpot(r); if (!sp) break; const g = new THREE.Group(); for (const o of [-0.5, 0, 0.5]) { const fc = P2.filingCabinet(mats, rng); fc.position.set(o, 0, 0.32); g.add(fc); } onWall(g, sp, 0.62, 1.6); }
        const dk = inner.find(([x, y]) => canBlock(x, y));
        if (dk) { const [x, y] = dk, [cx, cz] = centerOf(x, y); add(P2.desk(mats, rng), cx, cz, rng() * 4); collider(cx - 0.8, cz - 0.8, cx + 0.8, cz + 0.8); blockTile(x, y); }
        for (let i = 0; i < 12; i++) { const p = P.mesh(new THREE.BoxGeometry(0.21, 0.003, 0.29), P2.p2mats(mats).paper, false); add(p, rx + 0.5 + rng() * (rw - 1), rz + 0.5 + rng() * (rh - 1), rng() * 6).position.y = 0.01; }
        return true;
      }
      // ---- offices ----
      case 'openplan': {
        // rows of cubicles: every third column and every other row left clear as a walkway
        for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
          if ((x - r.x) % 3 === 0 || (y - r.y) % 2 === 0 || used.has(x + ',' + y) || !canBlock(x, y)) continue;
          blockTile(x, y);
          const x0 = x * TILE, z0 = y * TILE;
          add(P2.partition(mats, TILE), x0 + TILE / 2, z0 + 0.05);
          collider(x0, z0, x0 + TILE, z0 + 0.1);
          const side = P2.partition(mats, 1.5);
          add(side, x0 + 0.05, z0 + 0.75, Math.PI / 2);
          collider(x0, z0, x0 + 0.1, z0 + 1.5);
          const d = P2.desk(mats, rng);
          d.scale.set(0.95, 1, 0.95);
          add(d, x0 + TILE / 2 + 0.05, z0 + 0.5);
          collider(x0 + 0.3, z0 + 0.1, x0 + TILE - 0.2, z0 + 0.88);
          used.add(x + ',' + y);
        }
        for (let i = 0; i < 2; i++) { const sp = wallSpot(r); if (sp) onWall(P2.waterCooler(mats), sp, 0.35, 0.4); }
        for (let i = 0; i < 3; i++) { const sp = wallSpot(r); if (sp) onWall(P2.deadPlant(mats, rng), sp, 0.3, 0.4); }
        return true;
      }
      case 'office': {
        const dk = inner.find(([x, y]) => canBlock(x, y));
        if (dk) {
          const [x, y] = dk, [cx, cz] = centerOf(x, y);
          add(P2.desk(mats, rng), cx, cz, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]));
          collider(cx - 0.8, cz - 0.8, cx + 0.8, cz + 0.8);
          blockTile(x, y);
        }
        const fc = wallSpot(r); if (fc) onWall(P2.filingCabinet(mats, rng, true), fc, 0.62, 0.5);
        const wb = wallSpot(r); if (wb) onWall(P2.whiteboard(mats), wb, 0, 1, false);
        const pl = wallSpot(r); if (pl) onWall(P2.deadPlant(mats, rng), pl, 0.3, 0.4);
        return true;
      }
      case 'meeting': {
        const len = Math.min(rw - 2.4, 4.5);
        if (len > 1.5) {
          const along = rw >= rh, cx = rx + rw / 2, cz = rz + rh / 2;
          add(P2.meetingTable(mats, rng, len), cx, cz, along ? 0 : Math.PI / 2);
          if (along) collider(cx - len / 2, cz - 0.55, cx + len / 2, cz + 0.55); else collider(cx - 0.55, cz - len / 2, cx + 0.55, cz + len / 2);
          for (const [x, y] of interior(r)) used.add(x + ',' + y);
        }
        const wb = wallSpot(r); if (wb) onWall(P2.whiteboard(mats), wb, 0, 1, false);
        return true;
      }
      case 'breakroom': {
        const v = wallSpot(r); if (v) onWall(P2.vending(mats), v, 0.78, 0.9);
        const f = wallSpot(r); if (f) onWall(P2.fridge(mats), f, 0.7, 0.7);
        const wc = wallSpot(r); if (wc) onWall(P2.waterCooler(mats), wc, 0.35, 0.4);
        const tb = inner.find(([x, y]) => canBlock(x, y));
        if (tb) { const [x, y] = tb, [cx, cz] = centerOf(x, y); add(P2.meetingTable(mats, rng, 1.6), cx, cz, 0); collider(cx - 0.8, cz - 0.55, cx + 0.8, cz + 0.55); blockTile(x, y); }
        return true;
      }
      case 'copy': {
        for (let i = 0; i < 2; i++) { const sp = wallSpot(r); if (sp) onWall(P2.copier(mats), sp, 0.68, 0.95); }
        for (let i = 0; i < 2; i++) { const sp = wallSpot(r); if (sp) onWall(P2.filingCabinet(mats, rng, true), sp, 0.62, 0.5); }
        for (let i = 0; i < 16; i++) { const p = P.mesh(new THREE.BoxGeometry(0.21, 0.003, 0.29), P2.p2mats(mats).paper, false); add(p, rx + 0.4 + rng() * (rw - 0.8), rz + 0.4 + rng() * (rh - 0.8), rng() * 6).position.y = 0.01; }
        return true;
      }
      // ---- the drains ----
      case 'cistern': case 'junction': case 'pumproom': case 'nest': {
        for (let i = 0; i < 2; i++) { const sp = wallSpot(r); if (sp) onWall(P2.pipeRun(mats, TILE, rng), sp, 0, 1, false); }
        if (r.type !== 'nest') { const sp = wallSpot(r); if (sp) onWall(P2.outflow(mats, rng), sp, 0.6, 0.8); }
        if (r.type === 'junction') { const sp = wallSpot(r); if (sp) onWall(P2.ladder(mats), sp, 0.15, 0.5, false); }
        const pt = r.type === 'pumproom' && inner.find(([x, y]) => canBlock(x, y));
        if (pt) { const [x, y] = pt, [cx, cz] = centerOf(x, y); add(P2.pump(mats, rng), cx - 0.4, cz, 0); collider(cx - 1.0, cz - 0.6, cx + 1.1, cz + 0.6); blockTile(x, y); }
        if (r.type === 'nest') {
          const [cx, cz] = [rx + rw / 2, rz + rh / 2];
          add(P2.nest(mats, rng), cx, cz, rng() * 6);
          for (let i = 0; i < 4; i++) group.add(P.decal(mats.splat[(rng() * 4) | 0], 1.6, cx + (rng() - 0.5) * rw * 0.6, cz + (rng() - 0.5) * rh * 0.6, rng() * 6));
          for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.bloodTiles[y * W + x] = 1;
        }
        return true;
      }
      // ---- the processing line ----
      case 'line': {
        // conveyors down the length of the hall in rows, broken every few metres so you can cut across; a band saw
        // at the head of each run; carcasses still hanging off the rail above
        const along = r.w >= r.h, len = along ? r.w : r.h, rows = along ? r.h : r.w;
        for (let k = 1; k < rows - 1; k += 2) {
          for (let s = 1; s < len - 1; s += 4) {
            const n = Math.min(3, len - 1 - s);
            const tiles = [];
            for (let t = 0; t < n; t++) tiles.push(along ? [r.x + s + t, r.y + k] : [r.x + k, r.y + s + t]);
            const ok = [];
            for (const [x, y] of tiles) { if (!canBlock(x, y)) break; blockTile(x, y); ok.push([x, y]); }
            if (!ok.length) continue;
            const L2 = ok.length * TILE - 0.2, [x0, y0] = ok[0], [x1, y1] = ok[ok.length - 1];
            const cx = (tileCenter(x0) + tileCenter(x1)) / 2, cz = (tileCenter(y0) + tileCenter(y1)) / 2;
            add(P2.conveyor(mats, rng, L2), cx, cz, along ? 0 : Math.PI / 2);
            if (along) collider(cx - L2 / 2, cz - 0.42, cx + L2 / 2, cz + 0.42); else collider(cx - 0.42, cz - L2 / 2, cx + 0.42, cz + L2 / 2);
            if (s === 1 && rng() < 0.7) {
              // the band saw at the head of the run, if there's room beside it
              const sx = along ? cx - L2 / 2 - 0.1 : cx, sz = along ? cz + 0.9 : cz - L2 / 2 - 0.1;
              const [tx, ty] = [toTile(sx), toTile(sz)];
              if (grid[ty * W + tx] && L.roomOf[ty * W + tx] === ri && !used.has(tx + ',' + ty) && canBlock(tx, ty)) { blockTile(tx, ty); add(P2.bandsaw(mats, rng), tileCenter(tx), tileCenter(ty), rng() * 6); collider(tileCenter(tx) - 0.5, tileCenter(ty) - 0.5, tileCenter(tx) + 0.5, tileCenter(ty) + 0.5); }
            }
          }
          // the overhead rail along the row, with what's still on it
          const [ax0, az0] = along ? [r.x * TILE + 0.3, tileCenter(r.y + k) + 1] : [tileCenter(r.x + k) + 1, r.y * TILE + 0.3];
          const railLen = len * TILE - 0.6;
          const rail = P2.overheadRail(mats, rng, railLen, WALL_H);
          add(rail, along ? ax0 + railLen / 2 : ax0, along ? az0 : az0 + railLen / 2, along ? 0 : Math.PI / 2);
          for (let d = 1.2; d < railLen - 0.6; d += 1.6 + rng() * 1.6) {
            if (rng() < 0.35) continue;
            const hx = along ? ax0 + d : ax0, hz = along ? az0 : az0 + d;
            const c2 = add(P.makeCarcass(mats, rng, rng() < 0.2), hx, hz, rng() * 6);
            c2.position.y = WALL_H - 0.25;
            out.swingers.push(c2);
            collider(hx - 0.26, hz - 0.26, hx + 0.26, hz + 0.26, false);
          }
        }
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (rng() < 0.25) out.bloodTiles[y * W + x] = 1;
        return true;
      }
      case 'pens': {
        // the stun pens: steel stalls down both long walls, gates of pipe between them, a knocking box in the room,
        // blood run into the floor. Never across a doorway: the way through the middle stays open
        const steelM = mats.steel || mats.darkMetal, along = r.w >= r.h;
        const isDoor = (x, y) => DIRS.some(([dx, dy]) => { const n = (y + dy) * W + x + dx; return grid[n] && L.roomOf[n] !== ri; });
        const pipe = (len, ax) => {
          const o = new THREE.Group();
          for (const h of [0.35, 0.75, 1.15]) { const c = P.mesh(new THREE.CylinderGeometry(0.028, 0.028, len, 8), steelM, false); c.rotation[ax === 'x' ? 'z' : 'x'] = Math.PI / 2; c.position.y = h; o.add(c); }
          for (const e of [-len / 2, len / 2]) { const post = P.mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 8), steelM, false); post.position.y = 0.62; post.position[ax] = e; o.add(post); }
          return o;
        };
        for (const [x, y] of allTiles(r)) {
          const ws = wallSides(x, y); if (ws.length !== 1) continue;
          const [dx, dy] = ws[0];
          if ((along && dx !== 0) || (!along && dy !== 0)) continue; // the long walls only
          const [nx, ny] = along ? [x + 1, y] : [x, y + 1]; // the next stall along
          if (L.roomOf[ny * W + nx] !== ri || wallSides(nx, ny).length !== 1 || isDoor(x, y) || isDoor(nx, ny)) continue;
          // a gate of pipe from the wall out into the room, on the line between this stall and the next
          const gx = along ? (x + 1) * TILE : tileCenter(x) + dx * 0.25, gz = along ? tileCenter(y) + dy * 0.25 : (y + 1) * TILE;
          add(pipe(1.5, along ? 'z' : 'x'), gx, gz);
          if (along) collider(gx - 0.05, gz - 0.75, gx + 0.05, gz + 0.75); else collider(gx - 0.75, gz - 0.05, gx + 0.75, gz + 0.05);
          group.add(P.decal(mats.splat[(rng() * 4) | 0], 0.7 + rng() * 0.6, tileCenter(x) + dx * 0.4, tileCenter(y) + dy * 0.4, rng() * 6));
          out.bloodTiles[y * W + x] = 1;
        }
        // the knocking box: a steel crate open at one end, where they stood them to be stunned
        const kb = inner.find(([x, y]) => canBlock(x, y));
        if (kb) {
          const [x, y] = kb, cx = tileCenter(x), cz = tileCenter(y); blockTile(x, y);
          const box = new THREE.Group();
          for (const [w2, h2, d2, px, py, pz] of [[1.7, 1.3, 0.06, 0, 0.65, -0.45], [1.7, 1.3, 0.06, 0, 0.65, 0.45], [0.06, 1.3, 0.96, -0.85, 0.65, 0], [1.7, 0.06, 0.96, 0, 0.03, 0]]) { const pnl = P.mesh(new THREE.BoxGeometry(w2, h2, d2), mats.rust[1] || steelM); pnl.position.set(px, py, pz); box.add(pnl); }
          add(box, cx, cz, along ? 0 : Math.PI / 2);
          collider(cx - 0.9, cz - 0.9, cx + 0.9, cz + 0.9);
          group.add(P.decal(mats.pool[0], 1.8, cx + 0.6, cz, rng() * 6));
        }
        for (let i = 0; i < 2; i++) out.swingers.push(add(P.hangingChain(mats, rng), rx + 1 + rng() * (rw - 2), rz + 1 + rng() * (rh - 2)));
        return true;
      }
      case 'packing': {
        for (const [x, y] of inner.filter(([x, y]) => canBlock(x, y)).slice(0, Math.max(1, Math.floor((r.w * r.h) / 8)))) {
          blockTile(x, y); const [cx, cz] = centerOf(x, y), yaw = rng() < 0.5 ? 0 : Math.PI / 2;
          add(P2.packTable(mats, rng), cx, cz, yaw);
          if (yaw) collider(cx - 0.45, cz - 0.95, cx + 0.45, cz + 0.95); else collider(cx - 0.95, cz - 0.45, cx + 0.95, cz + 0.45);
        }
        for (let k = 0; k < 2; k++) { const free = inner.find(([x, y]) => !used.has(x + ',' + y) && canBlock(x, y)); if (!free) break; const [x, y] = free, [cx, cz] = centerOf(x, y); blockTile(x, y); add(P2.crateStack(mats, rng), cx, cz, rng() * 0.3); collider(cx - 0.65, cz - 0.6, cx + 0.65, cz + 0.6); }
        return true;
      }
      case 'mincer': {
        const t = inner.find(([x, y]) => canBlock(x, y));
        if (t) { const [x, y] = t, [cx, cz] = centerOf(x, y); blockTile(x, y); add(P2.mincer(mats, rng), cx - 0.3, cz, 0); collider(cx - 0.9, cz - 0.55, cx + 1.0, cz + 0.55); }
        for (let i = 0; i < 6; i++) add(P.meatChunk(mats, rng), rx + 0.5 + rng() * (rw - 1), rz + 0.5 + rng() * (rh - 1), rng() * 6).userData.decor = 'chunk';
        const cu = wallSpot(r); if (cu) onWall(P2.coolerUnit(mats, rng), cu, 0, 1, false);
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (rng() < 0.45) out.bloodTiles[y * W + x] = 1;
        return true;
      }
      case 'wash': {
        for (let k = 0; k < 2; k++) { const sp = wallSpot(r, (x, y) => wallSides(x, y).length === 1); if (sp) onWall(P2.washStation(mats, rng), sp, 0.6, 1.8); }
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (rng() < 0.3) out.bloodTiles[y * W + x] = 1;
        return true;
      }
      // ---- the deep freeze ----
      case 'racks': {
        // long rows of racking with a gap every few bays to cut through
        for (let y = r.y + 1; y < r.y + r.h - 1; y += 2) {
          for (let x = r.x + 1; x < r.x + r.w - 1; x += 3) {
            if (x >= r.x + r.w - 1 || !canBlock(x, y)) continue;
            blockTile(x, y);
            let n = 1;
            if (x + 1 < r.x + r.w - 1 && canBlock(x + 1, y)) { blockTile(x + 1, y); n = 2; }
            const len = n * TILE - 0.3, cx = x * TILE + (n * TILE) / 2, cz = tileCenter(y);
            add(P2.palletRack(mats, rng, len), cx, cz);
            collider(cx - len / 2 - 0.05, cz - 0.55, cx + len / 2 + 0.05, cz + 0.55);
          }
        }
        return true;
      }
      case 'dock': {
        const free = inner.filter(([x, y]) => !used.has(x + ',' + y));
        const fk = free.find(([x, y]) => canBlock(x, y));
        if (fk) { const [x, y] = fk, [cx, cz] = centerOf(x, y); const yaw = rng() * 6; add(P2.forklift(mats, rng), cx, cz, yaw); collider(cx - 0.9, cz - 0.9, cx + 0.9, cz + 0.9); blockTile(x, y); }
        for (const [x, y] of free.filter(([x, y]) => !used.has(x + ',' + y)).slice(0, 3)) {
          if (!canBlock(x, y)) continue; const [cx, cz] = centerOf(x, y); add(P2.crateStack(mats, rng), cx + (rng() - 0.5) * 0.4, cz + (rng() - 0.5) * 0.4, rng() * 0.3); collider(cx - 0.65, cz - 0.6, cx + 0.65, cz + 0.6); blockTile(x, y); }
        const cu = wallSpot(r); if (cu) onWall(P2.coolerUnit(mats, rng), cu, 0, 1, false);
        return true;
      }
      case 'blast': {
        for (let i = 0; i < 2; i++) { const cu = wallSpot(r); if (cu) onWall(P2.coolerUnit(mats, rng), cu, 0, 1, false); }
        // people, left standing in here until they froze
        for (const [x, y] of inner.filter(([x, y]) => canBlock(x, y)).slice(0, 2)) {
          blockTile(x, y);
          const [cx, cz] = centerOf(x, y);
          const b = P.makeBody(mats, rng, { naked: rng() < 0.5 });
          b.arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * 0.2; a.rotation.x = -0.3; });
          b.root.position.set(cx, 0.95, cz);
          b.root.rotation.y = rng() * 6;
          b.jaw.rotation.x = 0.4;
          group.add(b.root);
          const frost = P.mesh(new THREE.CylinderGeometry(0.32, 0.36, 1.9, 8), P2.p2mats(mats).ice, false);
          add(frost, cx, cz).position.y = 0.95;
          collider(cx - 0.35, cz - 0.35, cx + 0.35, cz + 0.35);
          used.add(x + ',' + y);
        }
        return true;
      }
    }
    return false;
  }

  // rooms
  L.rooms.forEach((r, ri) => {
    const rx = r.x * TILE, rz = r.y * TILE, rw = r.w * TILE, rh = r.h * TILE;
    const themeLamp = { morgue: 'tube', offices: 'tube', freezer: 'tube', sewer: 'bulb' }[L.theme];
    if (r.type !== 'lift') lampAt(rx + rw / 2, rz + rh / 2, themeLamp || (r.w * r.h >= 12 ? 'tube' : 'bulb'), ri);
    else lampAt(rx + rw / 2, rz + rh / 2 - 1, 'tube', ri);
    if (furnish(r, ri)) { /* the other kinds of floor: see furnish() */ } else if (r.type === 'cold' || r.type === 'hanging') {
      // rails of meat on the tile corners, so there is always a way between them (if you can stand to)
      for (let y = r.y + 1; y < r.y + r.h; y += 2) {
        const z = y * TILE;
        add(P.ceilingRail(mats, rw - 0.6), rx + rw / 2, z);
        for (let tx = r.x + 1; tx < r.x + r.w; tx++) {
          const x = tx * TILE;
          if (rng() < 0.2) continue;
          const human = rng() < 0.25 + L.depth * 0.12;
          const c = add(P.makeCarcass(mats, rng, human), x, z, rng() * 6);
          c.position.y = WALL_H;
          out.swingers.push(c);
          collider(x - 0.26, z - 0.26, x + 0.26, z + 0.26, false);
          if (human && out.screamers.length < D.screamers && rng() < 0.5) out.screamers.push({ obj: c, pos: new THREE.Vector3(x, 1.5, z), used: false });
          group.add(P.decal(mats.splat[(rng() * 4) | 0], 1, x + (rng() - 0.5) * 0.3, z + (rng() - 0.5) * 0.3, rng() * 6));
        }
      }
    } else if (r.type === 'butcher') {
      const spots = rng.shuffle(interior(r)).slice(0, Math.min(3, Math.max(1, (r.w * r.h) / 8 | 0)));
      for (const [x, y] of spots) {
        const along = rng() < 0.5, cx = tileCenter(x), cz = tileCenter(y);
        add(P.butcherTable(mats, rng), cx, cz, along ? 0 : Math.PI / 2);
        if (along) collider(cx - 0.92, cz - 0.42, cx + 0.92, cz + 0.42); else collider(cx - 0.42, cz - 0.92, cx + 0.42, cz + 0.92);
        L.block[y * W + x] = 1;
        used.add(x + ',' + y);
      }
      for (let i = 0; i < 3; i++) out.swingers.push(add(P.hangingChain(mats, rng), rx + 1 + rng() * (rw - 2), rz + 1 + rng() * (rh - 2)));
      for (let i = 0; i < 2; i++) { const b = add(P.bucket(mats), rx + 0.5 + rng() * (rw - 1), rz + 0.5 + rng() * (rh - 1)); b.position.y = 0; }
    } else if (r.type === 'freezer') {
      // walls of body drawers, a couple left hanging open, and a slab in the middle
      const segs = [];
      for (const [x, y] of allTiles(r)) { const ws = wallSides(x, y); if (ws.length === 1) segs.push([x, y, ws[0]]); }
      rng.shuffle(segs);
      let banks = 0;
      for (const [x, y, s] of segs) {
        if (banks >= 2) break;
        if (used.has(x + ',' + y)) continue;
        used.add(x + ',' + y).add(x + ',' + y + 'L' + s);
        out.drawerBanks.push(placeBank(x, y, s, null, 0.7));
        banks++;
      }
      for (const b of out.drawerBanks.slice(-banks)) {
        for (let k = 0; k < 1 + (rng() * 2 | 0); k++) { const d = rng.pick(b.drawers); d.open = d.target = 0.5 + rng() * 0.9; d.grp.position.z = d.open; }
      }
      const inner = rng.shuffle(interior(r)).filter(([x, y]) => L.theme === 'plant' || canBlock(x, y));
      if (inner.length) {
        const [x, y] = inner[0], cx = tileCenter(x), cz = tileCenter(y);
        add(P.autopsyTable(mats, rng), cx, cz, 0);
        collider(cx - 1, cz - 0.42, cx + 1, cz + 0.42);
        L.block[y * W + x] = 1;
        used.add(x + ',' + y);
      }
    } else if (r.type === 'morgue') {
      for (const [x, y] of rng.shuffle(allTiles(r)).slice(0, 2 + (rng() * 3 | 0))) {
        if (used.has(x + ',' + y)) continue;
        used.add(x + ',' + y);
        add(P.bodyBag(mats, rng), tileCenter(x) + (rng() - 0.5) * 0.4, tileCenter(y) + (rng() - 0.5) * 0.4, rng() * 6).userData.decor = 'bag'; // (decor: the remaster's declutter pass)
      }
      for (const [x, y] of rng.shuffle(interior(r)).slice(0, 2)) {
        if (used.has(x + ',' + y)) continue;
        used.add(x + ',' + y);
        const cx = tileCenter(x), cz = tileCenter(y);
        add(P.gurney(mats, rng), cx, cz, 0).userData.decor = 'gurney';
        collider(cx - 0.96, cz - 0.34, cx + 0.96, cz + 0.34);
        L.block[y * W + x] = 1;
      }
    } else if (r.type === 'pit') {
      const cx = tileCenter(r.cx), cz = tileCenter(r.cy);
      for (let i = 0; i < 4; i++) group.add(P.decal(mats.pool[i % 3], 2.6 + rng() * 1.5, cx + (rng() - 0.5) * rw * 0.5, cz + (rng() - 0.5) * rh * 0.5, rng() * 6));
      for (let i = 0; i < 6; i++) out.swingers.push(add(P.hangingChain(mats, rng), rx + 0.8 + rng() * (rw - 1.6), rz + 0.8 + rng() * (rh - 1.6)));
      for (let i = 0; i < 10; i++) add(P.meatChunk(mats, rng), cx + (rng() - 0.5) * 2.5, cz + (rng() - 0.5) * 2.5, rng() * 6).userData.decor = 'chunk';
      add(P.entrails(mats, rng, new THREE.Vector3(0, 0.05, 0), 1.5, 14), cx + 0.4, cz - 0.3).visible = !THREE.gore.less;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.bloodTiles[y * W + x] = 1;
    }
    // lockers (the floors with lots of small rooms would otherwise be wall to wall with them)
    const lockerCap = L.theme && L.theme !== 'plant' ? 20 : Infinity;
    if (out.lockers.length < lockerCap && (r.type === 'lockers' || (r.type !== 'lift' && rng() < (L.theme === 'morgue' ? 0.12 : 0.4)))) {
      const sides = [];
      for (const [x, y] of allTiles(r)) for (const s of wallSides(x, y)) sides.push([x, y, s]);
      rng.shuffle(sides);
      const want = r.type === 'lockers' ? Math.min(6, sides.length) : 1;
      let placed = 0;
      for (const [x, y, s] of sides) {
        if (placed >= want) break;
        if (used.has(x + ',' + y + 'L' + s)) continue;
        // keep corners clear: two lockers meeting in a corner would overlap
        if (wallSides(x, y).length > 1) continue;
        used.add(x + ',' + y + 'L' + s).add(x + ',' + y);
        if (r.type === 'lockers') { lockerAt(x, y, s, -0.33); lockerAt(x, y, s, 0.33); } else lockerAt(x, y, s, 0);
        placed++;
      }
      if (r.type === 'lockers') {
        const [x, y] = rng.pick(interior(r).length ? interior(r) : allTiles(r));
        const b = add(P.mesh(new THREE.BoxGeometry(1.4, 0.06, 0.35), mats.darkMetal), tileCenter(x), tileCenter(y));
        b.position.y = 0.45;
      }
    }
  });

  // corridors: lamps every few metres, drag marks, and the odd locker to dive into
  const corridorTiles = [];
  for (let i = 0; i < W * H; i++) if (L.corridor[i]) corridorTiles.push([i % W, (i / W) | 0]);
  rng.shuffle(corridorTiles);
  const lampTiles = [];
  for (const [x, y] of corridorTiles) {
    if (lampTiles.some(([lx, ly]) => Math.abs(lx - x) + Math.abs(ly - y) < 5)) continue;
    lampTiles.push([x, y]);
    lampAt(tileCenter(x), tileCenter(y), 'bulb', -1);
  }
  let corridorLockers = 0;
  for (const [x, y] of corridorTiles) {
    if (L.door && Math.abs(L.door.x - x) + Math.abs(L.door.y - y) <= 1) continue; // keep the shutter clear
    const s = wallSides(x, y);
    const straight = s.length === 2 && s[0][0] === -s[1][0] && s[0][1] === -s[1][1];
    if (straight && corridorLockers < 3 + (L.depth > 2 ? 1 : 0) && rng() < 0.08) { lockerAt(x, y, s[0], 0); used.add(x + ',' + y); corridorLockers++; }
    else if (straight && rng() < 0.1) {
      const along = s[0][0] !== 0 ? Math.PI / 2 : 0;
      group.add(P.decal(mats.drag, 2, tileCenter(x), tileCenter(y), along + Math.PI / 2 + (rng() < 0.5 ? Math.PI : 0)));
    } else if (rng() < 0.05 + L.depth * 0.01) {
      const k = rng();
      const p = k < 0.3 ? P.severedArm(mats, rng) : k < 0.45 ? P.severedHead(mats, rng) : k < 0.7 ? P.meatChunk(mats, rng) : P.entrails(mats, rng, new THREE.Vector3(0, 0.04, 0), 0.8, 8);
      add(p, tileCenter(x) + (rng() - 0.5), tileCenter(y) + (rng() - 0.5), rng() * 6);
      if (THREE.gore.less && (k < 0.45 || k >= 0.7)) p.visible = false; // (Less gore: no arms, heads or guts; the blood stays)
      group.add(P.decal(mats.splat[(rng() * 4) | 0], 1.4, tileCenter(x), tileCenter(y), rng() * 6));
    }
  }

  // tagged corpses, spread far apart and far from the lift
  const inWing = (x, y) => !!(L.wing && L.wing.mask[y * W + x]);
  const candidates = L.rooms.slice(1).map((r) => ({ r, d: L.dist[r.cy * W + r.cx] })).filter((c) => c.d > 0);
  candidates.sort((a, b) => b.d - a.d);
  const chosen = [];
  const choose = (pool, n) => {
    for (let k = 0; k < n && pool.length; k++) {
      let best = null, bestScore = -1;
      for (const c of pool) {
        const sep = chosen.length ? Math.min(...chosen.map((o) => Math.abs(o.r.cx - c.r.cx) + Math.abs(o.r.cy - c.r.cy))) : 99;
        const score = Math.min(sep, 14) * 2 + c.d * 0.5 + rng() * 6;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      chosen.push(best);
      pool.splice(pool.indexOf(best), 1);
      candidates.splice(candidates.indexOf(best), 1);
    }
  };
  // behind a sealed shutter there is always something you need
  if (L.wing) choose(candidates.filter((c) => inWing(c.r.cx, c.r.cy)), Math.max(1, Math.round(D.tags * 0.4)));
  choose(candidates.filter((c) => !inWing(c.r.cx, c.r.cy)), D.tags - chosen.length);
  choose(candidates.slice(), D.tags - chosen.length);
  // more tags than rooms on tiny maps: use corridor dead ends
  while (chosen.length < D.tags) {
    const t = rng.pick(corridorTiles.filter(([x, y]) => !(L.door && L.door.x === x && L.door.y === y)));
    chosen.push({ r: { x: t[0], y: t[1], w: 1, h: 1, cx: t[0], cy: t[1], type: 'corridor' } });
  }
  for (const { r } of chosen) {
    const opts = allTiles(r).filter(([x, y]) => !used.has(x + ',' + y) && !L.block[y * W + x]);
    const [x, y] = opts.length ? rng.pick(opts) : [r.cx, r.cy];
    used.add(x + ',' + y);
    const c = P.makeCorpse(mats, rng);
    const px = tileCenter(x) + (rng() - 0.5) * 0.5, pz = tileCenter(y) + (rng() - 0.5) * 0.5;
    add(c.group, px, pz, rng() * 6).userData.decor = 'corpse';
    out.corpses.push({ ...c, pos: new THREE.Vector3(px, 0.25, pz), progress: 0, harvested: false, room: r });
    out.bloodTiles[y * W + x] = 1;
  }

  // placement for everything that comes after (pickups here, puzzles in puzzles.js)
  const freeTiles = [];
  L.rooms.forEach((r, ri) => { if (r.type !== 'lift') for (const [x, y] of allTiles(r)) if (!used.has(x + ',' + y) && !L.block[y * W + x]) freeTiles.push([x, y, ri]); });
  rng.shuffle(freeTiles);
  out.inWing = inWing;
  out.takeTile = (pred = () => true) => {
    const i = freeTiles.findIndex((t) => !used.has(t[0] + ',' + t[1]) && pred(t));
    if (i < 0) return null;
    const t = freeTiles.splice(i, 1)[0];
    used.add(t[0] + ',' + t[1]);
    return t;
  };
  // a bare stretch of wall: [x, y, [dx, dy] toward the wall, room]
  out.takeWall = (pred = () => true) => {
    for (const [x, y, ri] of freeTiles) {
      if (used.has(x + ',' + y)) continue;
      for (const s of wallSides(x, y)) {
        const k = x + ',' + y + 'L' + s;
        if (used.has(k) || !pred([x, y, s, ri])) continue;
        used.add(k).add(x + ',' + y);
        return [x, y, s, ri];
      }
    }
    return null;
  };

  // batteries and adrenaline
  const pickup = (type) => {
    const t = out.takeTile(([x, y]) => !crawl[y * W + x]); // out in the open, not down a crouchway
    if (!t) return;
    const g = new THREE.Group();
    if (type === 'battery') {
      const b = P.mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.13, 8), mats.darkMetal);
      b.rotation.z = Math.PI / 2;
      const tip = P.mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 6), new THREE.MeshBasicMaterial({ color: 0x9a7a30 }), false);
      tip.rotation.z = Math.PI / 2;
      tip.position.x = 0.075;
      const led = P.mesh(new THREE.SphereGeometry(0.008, 4, 3), new THREE.MeshBasicMaterial({ color: 0x40ff60, fog: false }), false);
      led.position.y = 0.04;
      g.add(b, tip, led);
    } else {
      // a syringe of something bright red
      const barrel = P.mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), new THREE.MeshPhongMaterial({ color: 0xd8e0e0, transparent: true, opacity: 0.7, shininess: 100 }), false);
      barrel.rotation.z = Math.PI / 2;
      const fill = P.mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 6), new THREE.MeshBasicMaterial({ color: 0xc01010, fog: false }), false);
      fill.rotation.z = Math.PI / 2;
      const needle = P.mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.07, 4), mats.steel, false);
      needle.rotation.z = Math.PI / 2;
      needle.position.x = 0.1;
      g.add(barrel, fill, needle);
    }
    const x = tileCenter(t[0]) + (rng() - 0.5) * 1.2, z = tileCenter(t[1]) + (rng() - 0.5) * 1.2;
    add(g, x, z, rng() * 6).position.y = 0.04;
    out.pickups.push({ type, obj: g, pos: new THREE.Vector3(x, 0.1, z), taken: false });
  };
  for (let i = 0; i < D.batteries; i++) pickup('battery');
  for (let i = 0; i < D.adrenaline; i++) pickup('adrenaline');
  // loot that depends on the run (gun parts, bolts, keepsakes): main.js asks for it once the floor is up
  out.addPickup = (type, meta = {}) => {
    const t = out.takeTile(([x, y]) => !L.crawl[y * W + x]);
    if (!t) return null;
    const g = P2.lootMesh(mats, type, meta, rng);
    const x = tileCenter(t[0]) + (rng() - 0.5) * 1.2, z = tileCenter(t[1]) + (rng() - 0.5) * 1.2;
    add(g, x, z, rng() * 6).position.y = 0.04;
    const p = { type, ...meta, obj: g, pos: new THREE.Vector3(x, 0.1, z), taken: false };
    out.pickups.push(p);
    return p;
  };

  // the lift
  const { x: ax, y: ay } = L.alcove;
  const lift = P.makeLift(mats, D.tags);
  add(lift, tileCenter(ax), tileCenter(ay));
  out.lift = { obj: lift, pos: new THREE.Vector3(tileCenter(ax), 0, tileCenter(ay)), inserted: 0, gate: 1, ...lift.userData };
  out.lamps.push({ pos: new THREE.Vector3(tileCenter(ax), WALL_H - 0.3, tileCenter(ay) + 0.2), obj: null, state: 'lift', phase: 0, room: 0, on: 1 });
  out.spawn = { x: tileCenter(ax), z: tileCenter(ay) + 0.3, yaw: 0 };

  // the Foreman starts in the room furthest from you
  const far = L.rooms.slice(1).filter((r) => !inWing(r.cx, r.cy)).sort((a, b) => L.dist[b.cy * W + b.cx] - L.dist[a.cy * W + a.cx]);
  // the first in the room furthest from you; each one after it as far from the others as it can get, out of
  // the furthest half of the floor
  const spawnRooms = [far[0]];
  const pool = far.slice(1, Math.max(2, Math.ceil(far.length / 2)));
  while (spawnRooms.length < D.hunters && pool.length) {
    let bi = 0, bd = -1;
    pool.forEach((r, i) => { const d = Math.min(...spawnRooms.map((s) => Math.hypot(s.cx - r.cx, s.cy - r.cy))); if (d > bd) { bd = d; bi = i; } });
    spawnRooms.push(pool.splice(bi, 1)[0]);
  }
  while (spawnRooms.length < D.hunters) spawnRooms.push(far[Math.min(spawnRooms.length, far.length - 1)]);
  for (const r of spawnRooms) out.hunterSpawns.push(new THREE.Vector3(tileCenter(r.cx), 0, tileCenter(r.cy)));
  // broken glass and bone in the passages (the floors that ask for it): loud underfoot unless you creep
  out.glass = new Uint8Array(W * H);
  if (D.glass) THREE.ownRandom(() => {
    const g2 = makeRng((L.seed ^ 0x5bd1e995) >>> 0), shard = new THREE.MeshStandardMaterial({ color: 0xc8d4d8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 });
    const geo = new THREE.BoxGeometry(0.06, 0.004, 0.04);
    for (let i = 0; i < W * H; i++) {
      if (!L.corridor[i] || L.crawl[i] || g2() > D.glass) continue;
      out.glass[i] = 1;
      const x = i % W, y = (i / W) | 0;
      const n = 26, inst = new THREE.InstancedMesh(geo, shard, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      for (let k = 0; k < n; k++) { e.set((g2() - 0.5) * 0.4, g2() * 6.28, (g2() - 0.5) * 0.4); q.setFromEuler(e); const sc = 0.4 + g2() * 1.4; m4.compose(new THREE.Vector3(tileCenter(x) + (g2() - 0.5) * 1.7, 0.006, tileCenter(y) + (g2() - 0.5) * 1.7), q, new THREE.Vector3(sc, 1, sc)); inst.setMatrixAt(k, m4); }
      group.add(inst);
      for (let k = 0; k < 3; k++) { const b = P.mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.08 + g2() * 0.1, 5), mats.bone, false); b.rotation.set(Math.PI / 2, 0, g2() * 6); b.position.set(tileCenter(x) + (g2() - 0.5) * 1.5, 0.01, tileCenter(y) + (g2() - 0.5) * 1.5); group.add(b); }
    }
  });
  return out;
}

// ---------- collision ----------
function pushOut(p, r, x0, z0, x1, z1) {
  const cx = Math.max(x0, Math.min(p.x, x1)), cz = Math.max(z0, Math.min(p.z, z1));
  const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 < 1e-9) {
    const l = p.x - x0, rr = x1 - p.x, t = p.z - z0, b = z1 - p.z, m = Math.min(l, rr, t, b);
    if (m === l) p.x = x0 - r; else if (m === rr) p.x = x1 + r; else if (m === t) p.z = z0 - r; else p.z = z1 + r;
    return true;
  }
  const d = Math.sqrt(d2);
  p.x = cx + (dx / d) * r;
  p.z = cz + (dz / d) * r;
  return true;
}

export function collide(L, B, p, r, hunter = false, crawlOpen = false) {
  let hit = false;
  for (let it = 0; it < 2; it++) {
    const tx0 = toTile(p.x - r), tx1 = toTile(p.x + r), tz0 = toTile(p.z - r), tz1 = toTile(p.z + r);
    for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++)
      if (isWall(L, tx, tz, crawlOpen && !hunter)) hit = pushOut(p, r, tx * TILE, tz * TILE, (tx + 1) * TILE, (tz + 1) * TILE) || hit;
    for (const c of B.colliders) {
      if (c.off || (hunter && !c.hunters)) continue;
      if (p.x + r < c.x0 || p.x - r > c.x1 || p.z + r < c.z0 || p.z - r > c.z1) continue;
      hit = pushOut(p, r, c.x0, c.z0, c.x1, c.z1) || hit;
    }
  }
  return hit;
}

// can something of radius r walk straight from a to b? walls and solid furniture (tables, gurneys) both count
export function pathClear(L, B, ax, az, bx, bz, r = 0.36) {
  if (!lineOfSight(L, ax, az, bx, bz)) return false;
  const dx = bx - ax, dz = bz - az;
  // his shoulders as well as his middle: the two edges of the strip he sweeps must miss the walls too
  const len = Math.hypot(dx, dz);
  if (len > 1e-6) {
    const nx = (-dz / len) * r, nz = (dx / len) * r;
    if (!lineOfSight(L, ax + nx, az + nz, bx + nx, bz + nz) || !lineOfSight(L, ax - nx, az - nz, bx - nx, bz - nz)) return false;
  }
  for (const c of B.colliders) {
    if (c.off || !c.hunters) continue;
    // slab test against the box grown by r
    let t0 = 0, t1 = 1;
    for (const [o, d, lo, hi] of [[ax, dx, c.x0 - r, c.x1 + r], [az, dz, c.z0 - r, c.z1 + r]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t0 = 2; break; } continue; }
      let a = (lo - o) / d, b = (hi - o) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) break;
    }
    if (t0 <= t1) return false;
  }
  return true;
}

export function lineOfSight(L, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, n = Math.ceil(Math.hypot(dx, dz) / 0.25);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (isWall(L, toTile(ax + dx * t), toTile(az + dz * t))) return false;
  }
  return true;
}

// ---------- A* over the tile grid (8-way, no cutting corners) ----------
export function findPath(L, sx, sz, ex, ez, crawlOpen = false) {
  const { W, H, grid, block, crawl } = L;
  const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] && !block[y * W + x] && (crawlOpen || !crawl || !crawl[y * W + x]);
  let s = [toTile(sx), toTile(sz)], e = [toTile(ex), toTile(ez)];
  if (!open(...e)) {
    const alt = DIRS.map(([dx, dy]) => [e[0] + dx, e[1] + dy]).find((t) => open(...t));
    if (!alt) return null;
    e = alt;
  }
  if (!open(...s)) {
    const alt = DIRS.map(([dx, dy]) => [s[0] + dx, s[1] + dy]).find((t) => open(...t));
    if (alt) s = alt;
  }
  const si = s[1] * W + s[0], ei = e[1] * W + e[0];
  const g = new Float32Array(W * H).fill(1e9), came = new Int32Array(W * H).fill(-1), closed = new Uint8Array(W * H);
  const heap = [];
  const push = (f, i) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  const hx = e[0], hy = e[1];
  const hfn = (x, y) => { const dx = Math.abs(x - hx), dy = Math.abs(y - hy); return dx + dy - 0.586 * Math.min(dx, dy); };
  g[si] = 0;
  push(hfn(s[0], s[1]), si);
  let found = false;
  while (heap.length) {
    const [, c] = pop();
    if (closed[c]) continue;
    if (c === ei) { found = true; break; }
    closed[c] = 1;
    const cx = c % W, cy = (c / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (!open(nx, ny)) continue;
      if (dx && dy && (!open(cx + dx, cy) || !open(cx, cy + dy))) continue;
      const n = ny * W + nx, ng = g[c] + (dx && dy ? 1.414 : 1);
      if (ng < g[n]) { g[n] = ng; came[n] = c; push(ng + hfn(nx, ny), n); }
    }
  }
  if (!found) return null;
  const path = [];
  for (let c = ei; c !== -1 && c !== si; c = came[c]) path.push(new THREE.Vector3(tileCenter(c % W), 0, tileCenter((c / W) | 0)));
  path.reverse();
  return path;
}

export function randomFloorNear(L, x, z, radiusTiles, rng = Math.random) {
  const tx = toTile(x), tz = toTile(z);
  for (let i = 0; i < 40; i++) {
    const nx = tx + Math.round((rng() * 2 - 1) * radiusTiles), nz = tz + Math.round((rng() * 2 - 1) * radiusTiles);
    if (!isWall(L, nx, nz) && !L.block[nz * L.W + nx] && L.roomOf[nz * L.W + nx] !== 0 && !(nx === L.alcove.x && nz === L.alcove.y)) return new THREE.Vector3(tileCenter(nx), 0, tileCenter(nz));
  }
  return null;
}

// ---------- the Foreman's own map: half-metre cells, with walls and furniture grown by his width ----------
// The tile grid is too coarse for him: a table in the middle of a tile is invisible to it, so he'd run his
// path straight into it. This one knows where everything solid is. It's rebuilt when the shutter or the lift
// gate changes.
const NAV_S = 0.5, NAV_R = 0.36;
export function navGrid(L, B) {
  const key = (L.door && L.door.closed ? 1 : 0) + ':' + B.colliders.map((c) => (c.off ? 1 : 0)).join('');
  if (L.nav && L.nav.key === key) return L.nav;
  const per = Math.round(TILE / NAV_S), NW = L.W * per, NH = L.H * per;
  const blocked = new Uint8Array(NW * NH);
  for (let cy = 0; cy < NH; cy++) for (let cx = 0; cx < NW; cx++) {
    const x = (cx + 0.5) * NAV_S, z = (cy + 0.5) * NAV_S;
    if (isWall(L, toTile(x), toTile(z)) || isWall(L, toTile(x - NAV_R), toTile(z - NAV_R)) || isWall(L, toTile(x + NAV_R), toTile(z - NAV_R)) ||
      isWall(L, toTile(x - NAV_R), toTile(z + NAV_R)) || isWall(L, toTile(x + NAV_R), toTile(z + NAV_R))) blocked[cy * NW + cx] = 1;
  }
  for (const c of B.colliders) {
    if (c.off || !c.hunters) continue;
    const x0 = Math.max(0, Math.floor((c.x0 - NAV_R) / NAV_S)), x1 = Math.min(NW - 1, Math.floor((c.x1 + NAV_R) / NAV_S));
    const z0 = Math.max(0, Math.floor((c.z0 - NAV_R) / NAV_S)), z1 = Math.min(NH - 1, Math.floor((c.z1 + NAV_R) / NAV_S));
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const x = (cx + 0.5) * NAV_S, z = (cz + 0.5) * NAV_S;
      const px = Math.max(c.x0, Math.min(x, c.x1)), pz = Math.max(c.z0, Math.min(z, c.z1));
      if ((x - px) ** 2 + (z - pz) ** 2 < NAV_R * NAV_R) blocked[cz * NW + cx] = 1;
    }
  }
  const N = NW * NH;
  L.nav = { key, NW, NH, blocked, g: new Float32Array(N), came: new Int32Array(N), stamp: new Uint32Array(N), shut: new Uint32Array(N), gen: 0 };
  return L.nav;
}
// nearest free cell to (cx, cy), spiralling out a few rings
function navFree(nav, cx, cy, rings = 4) {
  const { NW, NH, blocked } = nav;
  if (cx >= 0 && cy >= 0 && cx < NW && cy < NH && !blocked[cy * NW + cx]) return cy * NW + cx;
  for (let r = 1; r <= rings; r++) {
    let best = -1, bd = 1e9;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= NW || y >= NH || blocked[y * NW + x]) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = y * NW + x; }
    }
    if (best >= 0) return best;
  }
  return -1;
}
export function findPathNav(L, B, sx, sz, ex, ez) {
  const nav = navGrid(L, B), { NW, NH, blocked, g, came, stamp, shut } = nav;
  const si = navFree(nav, Math.floor(sx / NAV_S), Math.floor(sz / NAV_S)), ei = navFree(nav, Math.floor(ex / NAV_S), Math.floor(ez / NAV_S), 6);
  if (si < 0 || ei < 0) return findPath(L, sx, sz, ex, ez);
  const gen = ++nav.gen;
  const hx = ei % NW, hy = (ei / NW) | 0;
  const hfn = (x, y) => { const dx = Math.abs(x - hx), dy = Math.abs(y - hy); return dx + dy - 0.586 * Math.min(dx, dy); };
  const heap = [];
  const push = (f, i) => {
    heap.push(f, i);
    let k = heap.length / 2 - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (heap[p * 2] <= heap[k * 2]) break; const a = heap[p * 2], b = heap[p * 2 + 1]; heap[p * 2] = heap[k * 2]; heap[p * 2 + 1] = heap[k * 2 + 1]; heap[k * 2] = a; heap[k * 2 + 1] = b; k = p; }
  };
  const pop = () => {
    const top = heap[1], lf = heap[heap.length - 2], li = heap[heap.length - 1];
    heap.length -= 2;
    if (heap.length) {
      heap[0] = lf; heap[1] = li;
      let k = 0;
      const n = heap.length / 2;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < n && heap[l * 2] < heap[m * 2]) m = l;
        if (r < n && heap[r * 2] < heap[m * 2]) m = r;
        if (m === k) break;
        const a = heap[m * 2], b = heap[m * 2 + 1]; heap[m * 2] = heap[k * 2]; heap[m * 2 + 1] = heap[k * 2 + 1]; heap[k * 2] = a; heap[k * 2 + 1] = b;
        k = m;
      }
    }
    return top;
  };
  stamp[si] = gen; g[si] = 0; came[si] = -1;
  push(hfn(si % NW, (si / NW) | 0), si);
  let found = false, iter = 0;
  while (heap.length && iter++ < 60000) {
    const c = pop();
    if (shut[c] === gen) continue;
    if (c === ei) { found = true; break; }
    shut[c] = gen;
    const cx = c % NW, cy = (c / NW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= NW || ny >= NH) continue;
      const n = ny * NW + nx;
      if (blocked[n] || shut[n] === gen) continue;
      if (dx && dy && (blocked[cy * NW + nx] || blocked[ny * NW + cx])) continue;
      const ng = g[c] + (dx && dy ? 1.414 : 1);
      if (stamp[n] !== gen || ng < g[n]) { stamp[n] = gen; g[n] = ng; came[n] = c; push(ng + hfn(nx, ny), n); }
    }
  }
  if (!found) return findPath(L, sx, sz, ex, ez);
  const path = [];
  for (let c = ei; c !== -1 && c !== si; c = came[c]) path.push(new THREE.Vector3((c % NW + 0.5) * NAV_S, 0, (((c / NW) | 0) + 0.5) * NAV_S));
  path.reverse();
  return path;
}
