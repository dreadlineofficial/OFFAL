// Play as the Foreman: a worker who knows the floor does the shift without you. He goes body to body cutting
// tags, feeds the lift and pulls the lever. He knows the Foreman's out there: torch off and crouched when
// you're close, a sprint for the nearest crouchway when he sees you, back to work when he thinks you're gone.
import * as THREE from 'three';
import { findPath, findPathNav, lineOfSight, collide, tileCenter, toTile } from './level.js';
import { makeBody } from './props.js';
import { makeRng } from './rng.js';

const RUN = 5.1, WALK = 2.6, CROUCH = 1.35, SIZE = 1.06, LEGS = 0.935; // a little taller than the dead; LEGS: the body is built round its hips, this far above its soles

export class Survivor {
  constructor(G, mats, at) {
    this.G = G;
    this.pos = new THREE.Vector3(at.x, 0, at.z);
    this.yaw = 0;
    this.obj = new THREE.Group();
    this.body = makeBody(mats, makeRng(77), { dead: false });
    this.body.root.position.y = LEGS * SIZE; // feet on the floor
    this.obj.add(this.body.root);
    // his torch: a cone you can see from across the floor
    this.torch = new THREE.SpotLight(0xffe4c4, 60, 22, 0.55, 0.6, 1.5);
    this.torch.position.set(0.2, 1.4, -0.2);
    this.torch.target.position.set(0, 1.0, -4);
    this.obj.add(this.torch, this.torch.target);
    // what the Foreman makes out of him in the dark, from 20 m in plain sight (see main.js updateHunt)
    this.mark = new THREE.PointLight(0xffd8c0, 0, 3.5, 1.2);
    this.mark.position.set(0, 1.3, 0.6);
    this.obj.add(this.mark);
    this.tags = 0;
    this.fed = 0;
    this.stamina = 100;
    this.mode = 'work';
    this.path = null;
    this.repath = 0;
    this.alarm = 0;
    this.cutT = 0;
    this.leverT = 0;
    this.phase = 0;
    this.stepAcc = 0;
    this.crouch = false;
    this.done = null; // 'caught' or 'escaped'
  }

  // where to go: a body, the lift, or (running) somewhere he can't be followed
  goal() {
    const { B, L, D, player } = this.G;
    if (this.mode === 'flee') {
      // the nearest crouchway tile that isn't toward you, else the free spot furthest from you
      let best = null, bs = -1e9;
      for (let i = 0; i < 60; i++) {
        const x = (Math.random() * L.W) | 0, y = (Math.random() * L.H) | 0;
        if (!L.grid[y * L.W + x]) continue;
        const gx = tileCenter(x), gz = tileCenter(y);
        const dme = Math.hypot(gx - this.pos.x, gz - this.pos.z), dhim = Math.hypot(gx - player.pos.x, gz - player.pos.z);
        const s = dhim - dme * 0.6 + (L.crawl && L.crawl[y * L.W + x] ? 12 : 0);
        if (s > bs) { bs = s; best = { x: gx, z: gz }; }
      }
      return best;
    }
    if (this.tags + this.fed >= D.tags) return B.lift.pos;
    let best = null, bd = 1e9;
    for (const c of B.corpses) if (!c.harvested) { const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z); if (d < bd) { bd = d; best = c; } }
    this.target = best;
    return best ? best.pos : B.lift.pos;
  }

  update(dt) {
    const G = this.G, { L, B, D, player } = G;
    if (this.done) return;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    const sees = dist < 20 && lineOfSight(L, this.pos.x, this.pos.z, player.pos.x, player.pos.z);
    if (sees) this.alarm = dist < 10 ? 7 : 4;
    this.alarm -= dt;
    const was = this.mode;
    this.mode = this.alarm > 0 && dist < 20 ? 'flee' : dist < 12 ? 'sneak' : 'work';
    if (this.mode !== was) this.repath = 0;
    this.crouch = this.mode === 'sneak' || (this.mode === 'work' && dist < 16);
    this.torch.visible = this.mode === 'work' && dist > 20; // torch off when you're anywhere near

    // working: cutting a tag, feeding the lift, pulling the lever
    const working = this.mode !== 'flee';
    if (working && this.target && !this.target.harvested && Math.hypot(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z) < 1.6) {
      this.cutT += dt / 2.6;
      // the saw on the tag: you hear it wherever you are on the floor
      this.sawT = (this.sawT || 0) - dt;
      if (this.sawT <= 0) { this.sawT = 0.9; G.botNoise(this.target.pos, 999, 'cut'); }
      this.anim(dt, 0, true);
      if (this.cutT >= 1) { this.cutT = 0; this.tags++; G.botHarvest(this.target); this.target = null; this.repath = 0; }
      return;
    }
    this.cutT = 0;
    this.sawT = 0;
    if (working && this.tags + this.fed >= D.tags && Math.hypot(B.lift.pos.x - this.pos.x, B.lift.pos.z - this.pos.z) < 1.2) {
      this.fed += this.tags;
      this.tags = 0;
      this.leverT += dt;
      this.anim(dt, 0, true);
      if (this.leverT > 3) { this.done = 'escaped'; G.huntOver('escaped'); }
      return;
    }
    this.leverT = 0;

    // moving
    this.repath -= dt;
    if (this.repath <= 0 || !this.path || !this.path.length) {
      this.repath = this.mode === 'flee' ? 1 : 2;
      const g = this.goal();
      // to work he goes round the furniture (the Foreman's own pathfinding); running, the crouchways count
      this.path = g ? (this.mode === 'flee' ? findPath(L, this.pos.x, this.pos.z, g.x, g.z, true) : findPathNav(L, B, this.pos.x, this.pos.z, g.x, g.z)) || [] : [];
      if (g) this.path.push({ x: g.x, z: g.z });
    }
    const run = this.mode === 'flee' && this.stamina > 5;
    if (run) this.stamina = Math.max(0, this.stamina - dt * 10.5); else this.stamina = Math.min(100, this.stamina + dt * 12);
    const speed = run ? RUN : this.crouch ? CROUCH : WALK;
    let wp = this.path[0];
    while (wp && Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 0.4) { this.path.shift(); wp = this.path[0]; }
    let v = 0;
    if (wp) {
      const ax = wp.x - this.pos.x, az = wp.z - this.pos.z, d = Math.hypot(ax, az);
      const step = Math.min(d, speed * dt);
      this.pos.x += (ax / d) * step;
      this.pos.z += (az / d) * step;
      v = step / dt;
      const want = Math.atan2(-ax, -az);
      let dy = want - this.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 8);
    }
    collide(L, B, this.pos, 0.3, false, true);
    // wedged on something: step aside and think again
    this.stuckT = (this.stuckT || 0) + dt;
    if (this.stuckT > 1.5) {
      if (wp && Math.hypot(this.pos.x - (this.lastX ?? 0), this.pos.z - (this.lastZ ?? 0)) < 0.3) { this.pos.x += (Math.random() - 0.5) * 0.8; this.pos.z += (Math.random() - 0.5) * 0.8; collide(L, B, this.pos, 0.3, false, true); this.repath = 0; }
      this.stuckT = 0; this.lastX = this.pos.x; this.lastZ = this.pos.z;
    }
    // his footsteps carry the way yours would
    this.stepAcc += v * dt;
    const stride = run ? 1.05 : this.crouch ? 0.6 : 0.75;
    if (this.stepAcc > stride && v > 0.3) {
      this.stepAcc = 0;
      const kind = run ? 'run' : this.crouch ? 'crouch' : 'walk';
      G.botNoise(this.pos, run ? 15 : this.crouch ? 1.8 : 5.5, kind);
    }
    this.anim(dt, v, false);
    // you're in the crouchway with him? you can't be: he's safe in there
    this.safe = !!(L.crawl && L.crawl[toTile(this.pos.z) * L.W + toTile(this.pos.x)]);
  }

  // legs and arms swing with the pace; crouched he folds down; working he bends over
  anim(dt, v, work) {
    this.phase += dt * (2 + v * 2.4);
    const b = this.body, k = Math.min(1, v / 2.6), s = Math.sin(this.phase);
    b.legs.forEach((l, i) => (l.rotation.x = (i ? s : -s) * 0.6 * k));
    b.arms.forEach((a, i) => (a.rotation.x = (i ? -s : s) * 0.5 * k - (work ? 1.1 : 0)));
    if (THREE.REMASTERED) {
      // the remaster: a real run. Longer strides, the knee folding as the leg comes through, the forearms pumping
      // bent at the elbow, the body leaning into it. The same phase and pace as before
      const c = Math.cos(this.phase), run = Math.min(1, v / 3.5);
      b.legs.forEach((l, i) => {
        l.rotation.x = (i ? s : -s) * (0.6 + 0.25 * run) * k - 0.12 * run;
        const kn = l.userData && l.userData.knee;
        if (kn) kn.rotation.x = (this.crouch ? 0.6 : 0.08) + Math.max(0, i ? -c : c) * (0.5 + 1.1 * run) * k;
      });
      b.arms.forEach((a) => { const el = a.userData && a.userData.el; if (el) el.rotation.x = work ? -0.6 : -(0.25 + 1.1 * run) * k; });
      if (b.torso) b.torso.rotation.x = work ? 0 : 0.22 * run;
    }
    const sy = SIZE * (this.crouch || work ? 0.72 : 1);
    b.root.scale.set(SIZE, sy, SIZE);
    b.root.position.y = LEGS * sy;
    b.root.rotation.x = work ? 0.5 : this.crouch ? 0.25 : 0;
    this.obj.position.set(this.pos.x, Math.abs(Math.sin(this.phase)) * 0.04 * k, this.pos.z);
    this.obj.rotation.y = this.yaw;
  }
}
