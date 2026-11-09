// Cinema: staged shots for trailers and thumbnails, played live (record them with OBS). The game loads a floor,
// then holds it while a camera of our own moves and the Foreman does what the shot needs. No HUD, no torch,
// full resolution. Esc or E goes back to the list.
import * as THREE from 'three';
import { findPath } from './level.js';
import { poseForeman } from './monster.js';

export const SHOTS = [
  { id: 'desk', name: 'Office desk', note: 'Slow push in on the papers', floor: 0, secs: 6 },
  { id: 'doorway', name: 'Doorway reveal', note: 'Left to right past a wall; he stands in the gap', floor: 4, secs: 7 },
  { id: 'walkFront', name: 'Walking: front', note: 'He comes down the corridor at a low camera', floor: 7, secs: 7 },
  { id: 'walkBehind', name: 'Walking: behind', note: 'Following him into the dark', floor: 3, secs: 7 },
  { id: 'walkLow', name: 'Walking: low angle', note: 'Looking up at him as he passes', floor: 5, secs: 7 },
  { id: 'thumb', name: 'In the aisle', note: 'Down the carcass aisle, him on the right, arms out; holds still', floor: 7, secs: 9999 },
  { id: 'rise', name: 'Legs to face', note: 'Low at his boots, rising slowly up to his face', floor: 7, secs: 9 },
  { id: 'face', name: 'Face close-up', note: 'His face on the right, black beside it; holds still', floor: 7, secs: 9999 },
];

const ease = (k) => k * k * (3 - 2 * k);

export class Cinema {
  constructor(ctx) {
    this.ctx = ctx; // { G, camera, scene, post }
    this.shot = null;
  }
  // called once the shot's floor has loaded
  begin(shot) {
    const { G, camera, scene, post } = this.ctx;
    this.shot = shot;
    this.t = 0;
    this.hold = post.height;
    post.height = innerHeight; // full resolution: the low-res look is for playing, not for the trailer
    post.resize(innerWidth, innerHeight);
    for (const c of camera.children) if (c.isLight) c.visible = false; // nobody's holding a torch
    if (!this.fill) { this.fill = new THREE.PointLight(0xffe8d0, 6, 14, 1.2); this.rim = new THREE.PointLight(0xff5030, 0, 9, 1.2); }
    scene.add(this.fill, this.rim);
    this.rim.intensity = 0;
    for (const h of G.hunters) { h.pos.set(-50, 0, -50); h.obj.position.copy(h.pos); }
    this.h = G.hunters[0];
    const L = G.L, h = this.h;
    this.fill.distance = 14; this.rim.distance = 9;
    if (shot.id === 'desk') this.n = G.puzzles.get('notice');
    if (shot.id === 'doorway') {
      // a doorway: an edge tile of a big room with open floor straight through and solid wall either side
      const open = (x, y) => x >= 0 && y >= 0 && x < L.W && y < L.H && L.grid[y * L.W + x] !== 0;
      for (const r of L.rooms.slice(1).sort((a, b) => b.w * b.h - a.w * a.h)) {
        for (let y = r.y + 2; y < r.y + r.h - 2 && !this.door; y++) for (const [x, dx] of [[r.x, -1], [r.x + r.w - 1, 1]]) {
          if (!this.door && r.w >= 4 && open(x + dx, y) && !open(x + dx, y - 1) && !open(x + dx, y + 1)) this.door = { x: (x + dx) * 2 + 1, z: y * 2 + 1, dx };
        }
        if (this.door) break;
      }
      const d = this.door || { x: L.rooms[1].cx * 2 + 1, z: L.rooms[1].cy * 2 + 1, dx: -1 };
      this.door = d;
      h.pos.set(d.x, 0, d.z); h.yaw = d.dx < 0 ? Math.PI / 2 : -Math.PI / 2; // facing back into the room, at the camera
    }
    if (shot.id.startsWith('walk')) {
      // a long walk: room to room, always to the furthest one not yet visited, until there's plenty of route
      const rooms = L.rooms.slice(1), seen = new Set([rooms[0]]);
      let at = rooms[0], path = [{ x: at.cx * 2 + 1, z: at.cy * 2 + 1 }], len = 0;
      while (len < 40 && seen.size < rooms.length) {
        const b = rooms.filter((r) => !seen.has(r)).sort((p, q) => Math.hypot(q.cx - at.cx, q.cy - at.cy) - Math.hypot(p.cx - at.cx, p.cy - at.cy))[0];
        seen.add(b);
        const leg = findPath(L, at.cx * 2 + 1, at.cy * 2 + 1, b.cx * 2 + 1, b.cy * 2 + 1);
        if (!leg || !leg.length) continue;
        for (const q of leg) { const last = path[path.length - 1]; len += Math.hypot(q.x - last.x, q.z - last.z); path.push(q); }
        at = b;
      }
      let s = 0;
      this.route = path.map((q, i) => { if (i) s += Math.hypot(q.x - path[i - 1].x, q.z - path[i - 1].z); return { x: q.x, z: q.z, s }; });
      this.s = 3.5;
      this.gait = 0;
    }
    if (shot.id === 'thumb') {
      // down the long axis of the processing line: you at one end, him five metres down it, right of centre
      const r = L.rooms.find((q) => q.type === 'line') || L.rooms.slice(1).sort((p, q) => q.w * q.h - p.w * p.h)[0], long = r.w >= r.h;
      const f = long ? [1, 0] : [0, 1], right = [-f[1], f[0]], half = (long ? r.w : r.h);
      const cam = { x: (r.x + r.w / 2) * 2 - f[0] * (half - 0.8), z: (r.y + r.h / 2) * 2 - f[1] * (half - 0.8) };
      this.c = { cam, f, him: { x: cam.x + f[0] * 5 + right[0] * 1.35, z: cam.z + f[1] * 5 + right[1] * 1.35 } };
      h.pos.set(this.c.him.x, 0, this.c.him.z); h.yaw = Math.atan2(cam.x - this.c.him.x, cam.z - this.c.him.z);
    }
    if (shot.id === 'face') {
      const r = L.rooms.slice(1).sort((p, q) => q.w * q.h - p.w * p.h)[0];
      h.pos.set(r.cx * 2 + 1, 0, r.cy * 2 + 1); h.yaw = 0;
      // everything but his face goes to black
      this.fog = { c: scene.fog.color.getHex(), d: scene.fog.density };
      scene.fog.color.setHex(0x000000); scene.fog.density = 0.55;
    }
    if (shot.id === 'rise') {
      const r = L.rooms.slice(1).sort((p, q) => q.w * q.h - p.w * p.h)[0];
      h.pos.set(r.cx * 2 + 1, 0, r.cy * 2 + 1); h.yaw = 0; // facing +z, where the camera is
    }
    if (h) { h.obj.position.copy(h.pos); h.obj.rotation.y = h.yaw; } // the office has nobody in it
  }
  at(d) {
    const pts = this.route;
    d = Math.max(0, Math.min(pts[pts.length - 1].s, d));
    for (let i = 1; i < pts.length; i++) if (pts[i].s >= d) { const a = pts[i - 1], b = pts[i], f = (d - a.s) / Math.max(1e-6, b.s - a.s); return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }; }
    return pts[pts.length - 1];
  }
  end() {
    const { camera, scene, post } = this.ctx;
    post.height = this.hold;
    post.resize(innerWidth, innerHeight);
    scene.remove(this.fill, this.rim);
    if (this.fog) { scene.fog.color.setHex(this.fog.c); scene.fog.density = this.fog.d; this.fog = null; }
    for (const c of camera.children) if (c.isLight) c.visible = true;
    this.shot = null;
    this.door = null;
  }
  // returns true when the shot is over
  update(dt) {
    const { camera: c } = this.ctx, h = this.h, sh = this.shot, fill = this.fill, rim = this.rim;
    this.t += dt;
    const k = Math.min(1, this.t / sh.secs), e = ease(k);
    if (sh.id === 'desk') {
      const n = this.n.pos;
      c.position.set(n.x + 2.6 - e * 1.9, 1.75 - e * 0.65, n.z + 1.9 - e * 1.45);
      c.lookAt(n.x + 0.05, 0.76, n.z + 0.03);
      c.fov = 45;
      fill.position.set(c.position.x, c.position.y + 0.5, c.position.z); fill.intensity = 2.5;
    } else if (sh.id === 'doorway') {
      const d = this.door, side = (e - 0.5) * 7.5;
      this.stand(0.2, Math.sin(this.t * 0.6) * 0.35); // only his head moves: nothing swings through the door frame
      c.position.set(d.x - d.dx * 5.2, 1.55, d.z + side);
      c.lookAt(d.x - d.dx * 0.5, 1.45, d.z + side * 0.85);
      c.fov = 52;
      fill.position.set(d.x - d.dx * 2.5, 2.7, d.z); fill.intensity = 6;
      rim.position.set(d.x + d.dx * 1.6, 2.6, d.z); rim.intensity = 16;
    } else if (sh.id.startsWith('walk')) {
      this.s += 1.25 * dt;
      const p0 = this.at(this.s), p1 = this.at(this.s + 0.6);
      if (this.s > this.route[this.route.length - 1].s - 5) this.s = 3.5; // the end of the route: round again
      this.gait += 1.25 * dt * 2.6;
      poseForeman(h.body, { gait: this.gait, speed: 1.25, mode: 'walk', t: this.t, jawOpen: 0.15, twitch: { x: 0, y: 0, z: 0, r: 0 } });
      h.pos.set(p0.x, 0, p0.z); h.yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z); // facing the way he walks
      h.obj.position.copy(h.pos); h.obj.rotation.y = h.yaw;
      if (sh.id === 'walkFront') {
        const q = this.at(this.s + 3.2), r = this.at(this.s - 1.4);
        c.position.set(q.x, 0.95, q.z); c.lookAt(p0.x, 1.75, p0.z); c.fov = 50;
        fill.position.set(q.x, 2.6, q.z); fill.intensity = 7; rim.position.set(r.x, 2.7, r.z); rim.intensity = 16;
      } else if (sh.id === 'walkBehind') {
        const q = this.at(this.s - 2.6), f = this.at(this.s + 4);
        c.position.set(q.x, 2.0, q.z); c.lookAt(f.x, 1.4, f.z); c.fov = 55;
        fill.position.set(p0.x, 2.8, p0.z); fill.intensity = 5; rim.intensity = 0;
      } else {
        const q = this.at(this.s + 1.6), r = this.at(this.s - 1.2);
        c.position.set(q.x + 0.5, 0.35, q.z + 0.5); c.lookAt(p0.x, 2.0, p0.z); c.fov = 62;
        fill.position.set(q.x, 1.2, q.z); fill.intensity = 5; rim.position.set(r.x, 2.6, r.z); rim.intensity = 18;
      }
    } else if (sh.id === 'thumb') {
      const { cam, f, him } = this.c;
      this.stand(0.8, 0);
      h.yaw = Math.atan2(cam.x - him.x, cam.z - him.z); h.obj.rotation.y = h.yaw;
      h.body.head.rotation.set(0.12, 0, 0.1); h.body.neck.rotation.y = 0; h.body.jaw.rotation.x = 0.8;
      h.body.arms.forEach((a, i) => { a.sh.rotation.set(-0.35, 0, i ? -1.25 : 1.25); a.el.rotation.x = -0.35; }); // arms out wide
      if (h.body.apron) h.body.apron.update(h.body);
      c.position.set(cam.x, 1.6, cam.z); c.lookAt(cam.x + f[0] * 10, 1.45, cam.z + f[1] * 10); c.fov = 62;
      fill.position.set(him.x - f[0] * 1.8, 2.2, him.z - f[1] * 1.8); fill.intensity = 16;
      rim.position.set(him.x + f[0] * 1.6, 2.7, him.z + f[1] * 1.6); rim.intensity = 26;
    } else if (sh.id === 'face') {
      this.stand(0.55, 0);
      h.yaw = 0; h.obj.rotation.y = 0;
      h.body.head.rotation.set(0.08, 0, -0.06); h.body.neck.rotation.set(-0.35, 0, 0); h.body.jaw.rotation.x = 0.55;
      h.obj.updateMatrixWorld(true);
      const hp = h.body.head.getWorldPosition(c.position.clone());
      // close in, his face cut by the right of the frame; one hard light from the left
      c.position.set(hp.x - 0.3, hp.y - 0.02, hp.z + 0.78); c.lookAt(hp.x - 0.3, hp.y - 0.02, hp.z); c.fov = 40;
      fill.position.set(hp.x - 0.95, hp.y + 0.3, hp.z + 0.4); fill.intensity = 10; fill.distance = 3.2; rim.distance = 1.6;
      rim.position.set(hp.x + 0.5, hp.y + 0.3, hp.z - 0.5); rim.intensity = 1.5;
    } else if (sh.id === 'rise') {
      // from his boots up to his face; at the top his head comes down to look at you
      const look = ease(Math.max(0, (this.t - sh.secs * 0.7) / (sh.secs * 0.25)));
      this.stand(0.15 + look * 0.5, 0);
      h.body.neck.rotation.x += look * 0.35;
      h.obj.position.copy(h.pos); h.obj.rotation.y = h.yaw;
      h.obj.updateMatrixWorld(true);
      const hp = h.body.head.getWorldPosition(c.position.clone());
      const r = ease(Math.min(1, this.t / (sh.secs * 0.85)));
      c.position.set(hp.x + 0.15, 0.25 + r * (hp.y - 0.35), hp.z + 1.7 - r * 0.45);
      c.lookAt(hp.x, 0.3 + r * (hp.y - 0.3), hp.z); c.fov = 50;
      fill.position.set(hp.x - 0.6, c.position.y + 0.4, hp.z + 1.2); fill.intensity = 6; fill.distance = 5;
      rim.position.set(hp.x + 0.6, 2.6, hp.z - 1.0); rim.intensity = 14; rim.distance = 5;
    }
    c.updateProjectionMatrix();
    return this.t >= sh.secs;
  }
  // standing his ground: breathing, the jaw where the shot wants it, his head turned by look
  stand(jaw, look) {
    poseForeman(this.h.body, { gait: 0, speed: 0, mode: 'walk', t: this.t, jawOpen: jaw, twitch: { x: 0, y: 0, z: look, r: 0 } });
  }
}
