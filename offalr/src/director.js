// The scare director: when nothing is chasing you, something still has to happen. It never lets
// the floor go quiet for long: lights die, things whisper behind you, he is standing at the end of
// the corridor and then he isn't, bodies come down from the ceiling.
import * as THREE from 'three';
import { createForemanMesh, poseForeman } from './monster.js';
import { makeCarcass } from './props.js';
import { lineOfSight, isWall, toTile, tileCenter } from './level.js';
import { WALL_H } from './config.js';

const PA_LINES = [
  'LINE WORKER. RETURN TO YOUR STATION.',
  'REMINDER: ID TAGS ARE COMPANY PROPERTY.',
  'THE FOREMAN IS ON THE FLOOR. LOOK BUSY.',
  'WORKERS FOUND HIDING WILL BE DOCKED.',
  'THE SHIFT ENDS WHEN THE LINE IS EMPTY.',
  'PLEASE KEEP SCREAMING TO A MINIMUM.',
  'THERE IS NO OVERTIME. THERE IS ONLY THE SHIFT.',
  'HAS ANYONE SEEN WORKER 0451? HE IS NEEDED ON THE LINE.',
];

export class Director {
  constructor(G, mats) {
    this.G = G;
    this.mats = mats;
    this.phantom = createForemanMesh(mats);
    this.phantom.root.visible = false;
    this.drops = [];
    this.reset();
  }

  reset() {
    this.t = 16 + Math.random() * 10;
    this.ph = null;
    this.phantom.root.visible = false;
    this.drops.length = 0;
    this.paUsed = new Set();
    this.face = null;
    this.queued = null;
  }

  queue(kind, delay) { this.queued = { kind, t: delay }; }

  // a floor spot straight ahead, in view, at a distance
  ahead(min, max) {
    const { player: pl, L } = this.G;
    const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
    for (let d = max; d >= min; d -= 0.5) {
      const x = pl.pos.x + fx * d, z = pl.pos.z + fz * d;
      if (isWall(L, toTile(x), toTile(z)) || L.block[toTile(z) * L.W + toTile(x)]) continue;
      if (!lineOfSight(L, pl.pos.x, pl.pos.z, x, z)) continue;
      return new THREE.Vector3(tileCenter(toTile(x)), 0, tileCenter(toTile(z)));
    }
    return null;
  }

  run(kind) {
    const G = this.G, pl = G.player, a = G.audio;
    const back = new THREE.Vector3(Math.sin(pl.yaw), 1.6, Math.cos(pl.yaw));
    switch (kind) {
      case 'flicker':
        G.lampKill = 2 + Math.random() * 2;
        G.torchKill = 0.8 + Math.random();
        for (let i = 0; i < 4; i++) setTimeout(() => a.tick(), i * 120 + Math.random() * 80);
        return true;
      case 'whisper': {
        const side = Math.random() < 0.5 ? 1 : -1;
        a.whisper({ x: pl.pos.x + back.x * 0.6 + Math.cos(pl.yaw) * 0.4 * side, y: 1.7, z: pl.pos.z + back.z * 0.6 - Math.sin(pl.yaw) * 0.4 * side });
        G.scare = Math.max(G.scare, 0.35);
        return true;
      }
      case 'distant': {
        const ang = Math.random() * Math.PI * 2;
        a.distantScream({ x: pl.pos.x + Math.cos(ang) * 22, y: 1.5, z: pl.pos.z + Math.sin(ang) * 22 });
        return true;
      }
      case 'steps': { // right behind you. then nothing.
        for (let i = 0; i < 3; i++) setTimeout(() => {
          if (G.state === 'play') a.thud({ x: pl.pos.x + Math.sin(pl.yaw) * (5 - i), y: 0.2, z: pl.pos.z + Math.cos(pl.yaw) * (5 - i) }, 0.7 + i * 0.15);
        }, i * 650);
        setTimeout(() => { if (G.state === 'play') G.scare = Math.max(G.scare, 0.6); }, 1900);
        return true;
      }
      case 'phantom': {
        const p = this.ahead(7, 14);
        if (!p) return false;
        const f = this.phantom;
        f.root.position.copy(p);
        f.root.rotation.y = Math.atan2(pl.pos.x - p.x, pl.pos.z - p.z);
        poseForeman(f, { gait: 0, speed: 0, mode: 'walk', t: 0, jawOpen: 0.2, twitch: { x: 0.3, y: 0, z: 0.6, r: 0.9 } });
        f.root.visible = true;
        if (!f.root.parent) G.scene.add(f.root);
        this.ph = { t: 0, pos: p };
        return true;
      }
      case 'drop': {
        const p = this.ahead(3, 5);
        if (!p) return false;
        const c = makeCarcass(this.mats, Math.random, true);
        c.position.set(p.x, WALL_H + 2.2, p.z);
        c.userData.swing.v = 3;
        G.B.group.add(c);
        G.B.swingers.push(c);
        this.drops.push({ obj: c, t: 0 });
        a.bodyDrop(new THREE.Vector3(p.x, 1.5, p.z));
        setTimeout(() => a.jumpscare(0.5), 230);
        G.noise(p, 14, true);
        G.scare = 1;
        G.player.shake = Math.max(G.player.shake, 0.6);
        return true;
      }
      case 'face': { // not him. not really. it doesn't matter.
        if (pl.inLift) return false;
        const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
        const px = pl.pos.x + fx * 1.3, pz = pl.pos.z + fz * 1.3;
        if (!lineOfSight(G.L, pl.pos.x, pl.pos.z, px, pz)) return false;
        const f = this.phantom;
        f.root.position.set(px, pl.crouch ? -1.0 : -0.5, pz); // sunk so the face is level with yours
        f.root.rotation.y = Math.atan2(-fx, -fz);
        f.root.visible = true;
        if (!f.root.parent) G.scene.add(f.root);
        this.ph = null;
        this.face = { t: 0 };
        a.jumpscare(0.75);
        G.flash = 1;
        G.scare = 1;
        G.torchKill = 0;
        pl.shake = 1.4;
        return true;
      }
      case 'pa': {
        const lines = PA_LINES.filter((l) => !this.paUsed.has(l));
        const line = lines[(Math.random() * lines.length) | 0] || PA_LINES[0];
        this.paUsed.add(line);
        a.chime();
        setTimeout(() => G.ui.pa(line), 1300);
        return true;
      }
    }
    return false;
  }

  update(dt) {
    const G = this.G, pl = G.player;
    // the phantom: gone the moment you look properly, or get close
    if (this.ph) {
      const ph = this.ph, f = this.phantom;
      ph.t += dt;
      const d = pl.pos.distanceTo(ph.pos);
      const stare = pl.flatFacing(ph.pos) > 0.985;
      if (ph.t > 0.25 && ph.t < 0.4) f.head.rotation.z = 1.2;
      if (d < 5 || ph.t > 2.6 || (stare && ph.t > 1.2 && pl.lightOn)) {
        f.root.visible = false;
        G.torchKill = 0.2;
        if (d < 9) G.audio.click(ph.pos);
        this.ph = null;
      }
    }
    if (this.face) {
      const fc = this.face, f = this.phantom;
      fc.t += dt;
      poseForeman(f, { gait: 0, speed: 0, mode: 'grab', t: fc.t, jawOpen: 1, twitch: { x: (Math.random() - 0.5) * 0.4, y: (Math.random() - 0.5) * 0.3, z: (Math.random() - 0.5) * 0.5, r: (Math.random() - 0.5) * 0.7 } });
      if (fc.t < 0.15) G.flash = Math.floor(fc.t * 40) % 2 ? 0.9 : 0.1;
      if (fc.t > 0.42) { f.root.visible = false; G.torchKill = 0.9; this.face = null; }
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const dr = this.drops[i];
      dr.t += dt;
      dr.obj.position.y = Math.max(WALL_H, WALL_H + 2.2 - dr.t * dr.t * 30);
      if (dr.t > 0.5) this.drops.splice(i, 1);
    }
    // the hanging ones that aren't dead
    for (const s of G.B.screamers) {
      if (s.used || pl.pos.distanceTo(s.pos) > 2.3 || pl.hidden) continue;
      s.used = true;
      s.obj.userData.swing.v += 4;
      G.audio.shriek(s.pos);
      G.audio.jumpscare(0.4);
      G.noise(s.pos, 16, true);
      G.scare = 1;
      pl.shake = Math.max(pl.shake, 0.5);
    }

    if (pl.hidden) return;
    const chasing = G.hunters.some((h) => h.state === 'chase');
    if (this.queued && !chasing) {
      this.queued.t -= dt;
      if (this.queued.t <= 0) { if (this.run(this.queued.kind)) this.queued = null; else this.queued.t = 1.5; }
      return;
    }
    this.t -= dt;
    if (this.t > 0 || chasing) return;
    const near = Math.min(...G.hunters.map((h) => h.pos.distanceTo(pl.pos)));
    const opts = ['flicker', 'whisper', 'distant'];
    if (near > 16) opts.push('steps', 'phantom', 'phantom');
    if (near > 10 && G.depth >= 2) opts.push('drop');
    if (near > 12 && G.depth >= 2 && G.floorTime > 45) opts.push('face');
    const kind = opts[(Math.random() * opts.length) | 0];
    this.t = this.run(kind) ? Math.max(14, 34 + Math.random() * 26 - G.depth * 2.5) : 3;
  }
}
