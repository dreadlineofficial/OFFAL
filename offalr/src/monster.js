// The Foreman: a flayed, too-tall thing in a butcher's apron, wearing a stitched face, dragging a meat hook.
// It hunts by sound and by light, searches where it lost you, and opens lockers.
import { unlock } from './achievements.js';
import * as THREE from 'three';
import { lineOfSight, pathClear, findPathNav, collide, randomFloorNear, inCrawl, groundAt, crossPortal, routeTo, travelDist } from './level.js';

const V = new THREE.Vector3();

export { createForemanMesh } from './foreman.js';
import { createForemanMesh } from './foreman.js';

// pose the body; `t` is time, `gait` the walk phase, `mode` one of walk/chase/attack/idle/grab
export function poseForeman(f, s) {
  const { gait, speed, mode, t, swing = 0, jawOpen = 0, twitch } = s;
  const stride = Math.min(1, speed / 2.2);
  const run = mode === 'chase';
  const sinP = Math.sin(gait);
  f.hips.position.y = 1.18 + Math.abs(Math.cos(gait)) * 0.05 * stride;
  f.hips.rotation.y = sinP * 0.12 * stride;
  f.legs.forEach((l, i) => {
    const p = gait + i * Math.PI;
    l.thigh.rotation.x = Math.sin(p) * 0.45 * stride;
    l.knee.rotation.x = Math.max(0, Math.cos(p)) * 0.7 * stride + 0.08;
  });
  const hunch = run ? 0.95 : mode === 'grab' ? 0.35 : 0.5;
  f.torso.rotation.x = hunch + Math.sin(t * 1.3) * 0.03;
  f.torso.rotation.z = Math.sin(gait) * 0.06 * stride;
  f.neck.rotation.x = -hunch * 0.7 + (twitch ? twitch.x : 0);
  if (run) {
    // the run: a low, lunging lope. Hips dropped, chest thrown forward over long strides, the trailing foot
    // kicked up high behind as it comes through, the body bouncing twice a stride, head up and locked on you
    f.hips.rotation.y = sinP * 0.2 * stride;
    let reach = 0;
    f.legs.forEach((l, i) => {
      const p = gait + i * Math.PI;
      l.thigh.rotation.x = (Math.sin(p) * 0.6 - 0.2) * stride;
      l.knee.rotation.x = (0.2 + Math.max(0, -Math.cos(p)) * 1.6) * stride + 0.08; // folds as it swings through
      reach = Math.max(reach, 0.62 * Math.cos(l.thigh.rotation.x) + 0.56 * Math.cos(l.thigh.rotation.x + l.knee.rotation.x));
    });
    f.hips.position.y = reach + 0.01; // the lowest foot stays on the floor, so the body rises and drops with the stride
    f.torso.rotation.x = hunch + Math.sin(gait * 2) * 0.06 * stride;
    f.torso.rotation.z = sinP * 0.1 * stride;
    f.neck.rotation.x = -hunch * 0.9 + (twitch ? twitch.x * 0.5 : 0);
  }
  f.head.rotation.set(twitch ? twitch.y : 0, twitch ? twitch.z : 0, twitch ? twitch.r : 0);
  f.jaw.rotation.x = 0.1 + jawOpen * 0.9;
  if (mode === 'stunned') {
    // on his knees, folded over, arms hanging, head lolling
    f.hips.position.y = 0.62;
    f.legs.forEach((l) => { l.thigh.rotation.x = -1.3; l.knee.rotation.x = 2.2; });
    f.torso.rotation.x = 1.1;
    if (f.apron) f.apron.update(f);
    f.neck.rotation.x = 0.6 + (twitch ? twitch.x * 0.3 : 0);
    f.jaw.rotation.x = 0.9;
    f.arms.forEach((a, i) => { a.sh.rotation.set(-1.1 + Math.sin(t * 7 + i) * 0.05, 0, (i ? -1 : 1) * 0.15); a.el.rotation.x = -0.1; });
    return;
  }
  f.arms.forEach((a, i) => {
    const p = gait + (i ? 0 : Math.PI);
    let sh = -hunch + Math.sin(p) * 0.35 * stride;
    let el = -0.15 - Math.max(0, Math.sin(p)) * 0.3 * stride;
    let side = (i ? -1 : 1) * 0.12;
    if (run && i === 0) { sh = -hunch - 0.7 + Math.sin(p) * 0.95; el = -0.55 - Math.max(0, Math.sin(p)) * 0.7; side = 0.3; } // the free hand claws forward
    if (run && i === 1) { sh = -hunch + 0.35 + Math.sin(p) * 0.45; el = -0.3; side = -0.35; } // the hook swung low and back
    if (mode === 'attack' && i === 1) { sh = -hunch - 2.6 + swing * 3.2; el = -0.6 + swing * 0.5; }
    if (mode === 'grab') { sh = -hunch - 1.35; el = -0.35; side = (i ? 1 : -1) * 0.2; }
    a.sh.rotation.set(sh, 0, side);
    a.el.rotation.x = el;
  });
  if (f.poseR) f.poseR(f, s); // OFFAL: REMASTERED's movement, laid over this pose (foremanr.js)
  if (f.apron) f.apron.update(f); // the apron follows the pose: leans with the chest, pushed out by the legs
}

// ---------- the AI ----------
export class Hunter {
  constructor(world, mats, pos, id) {
    this.w = world;
    this.id = id;
    this.body = createForemanMesh(mats);
    this.obj = this.body.root;
    this.pos = pos.clone();
    this.spawn = pos.clone();
    this.obj.position.copy(this.pos);
    this.yaw = Math.random() * 6;
    this.state = 'patrol';
    this.path = null;
    this.pathT = 0;
    this.target = null;
    this.awareness = 0;
    this.lastSeen = null;
    this.lostT = 0;
    this.stateT = 0;
    this.gait = 0;
    this.speed = 0;
    this.stepAcc = 0;
    this.twitch = { x: 0, y: 0, z: 0, r: 0 };
    this.twitchT = 1;
    this.sinceContact = 0;
    this.stuck = { t: 0, x: pos.x, z: pos.z };
    this.checked = new Set();
    this.lockerTarget = null;
    this.swing = 0;
    this.seesPlayer = false;
    this.voice = world.audio.monsterVoice();
    this.growlT = 3;
  }

  dispose() { this.voice.stop(); }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
    this.path = null;
    this.pathT = 0;
  }

  // a bolt in the head: he drops where he stands
  stun(secs) {
    this.setState('stunned');
    this.stunFor = secs;
    this.awareness = 0;
    this.swing = 0;
    this.struck = false;
    this.opening = false;
    this.speed = 0;
  }

  // anything loud: footsteps, cutting, a scream from a carcass
  hear(n) {
    if (this.state === 'stunned' || (this.w.dev && this.w.dev.ghost)) return;
    if (inCrawl(this.w.L, n.pos.x, n.pos.z)) return; // in a crouchway you're somewhere he can't go: he doesn't care
    if (this.state === 'chase' && (this.w.L.stairs ? travelDist(this.w.L, this.pos, n.pos) : this.pos.distanceTo(n.pos)) < n.radius * this.w.D.hearing) { this.lastSeen = n.pos.clone(); this.lastVel = null; this.cast = null; return; } // still hunting: he follows the sound
    if (this.state === 'chase' || this.state === 'attack' || this.state === 'recover' || this.state === 'locker' || this.state === 'grab') return;
    const d = this.w.L.stairs ? travelDist(this.w.L, this.pos, n.pos) : this.pos.distanceTo(n.pos); // (from another storey: up or down the stairwell)
    const los = lineOfSight(this.w.L, this.pos.x, this.pos.z, n.pos.x, n.pos.z);
    const r = n.radius * this.w.D.hearing * (los ? 1 : 0.6);
    if (d > r) return;
    this.target = n.pos.clone();
    this.lastSeen = n.pos.clone();
    if (this.state === 'patrol') this.w.audio.sniff(this.pos);
    this.awareness = Math.max(this.awareness, n.loud && d < r * 0.4 ? 0.7 : 0.3);
    // he stops dead and turns toward it for a few seconds before he goes to look (less long the harder it is, and the closer and louder it was)
    if (n.rush) this.rushT = 9;
    if (this.state !== 'heard' && this.state !== 'alert') {
      this.setState('heard');
      this.heardFor = n.rush ? 0.35 : (1.2 + this.w.D.alert * 1.6) * (this.awareness >= 0.7 ? 0.55 : 1) * (0.85 + Math.random() * 0.3);
    } else if (n.rush && this.state === 'heard') this.heardFor = Math.min(this.heardFor, this.stateT + 0.35);
  }

  canSee() {
    const pl = this.w.player;
    if (this.w.dev && this.w.dev.ghost) return false; // dev mode: you're not there
    if (pl.hidden || pl.inLift && this.w.liftSealed || pl.inCrawl || this.state === 'stunned') return false;
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d > 26) return false;
    if (!lineOfSight(this.w.L, this.pos.x, this.pos.z, pl.pos.x, pl.pos.z)) return false;
    if (d < 2.2) return true;
    if (pl.crouch && !pl.lightOn) return d < 2.6; // crouched, torch off: only right up close
    const facing = (Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) / d;
    // the torch in its eyes gives you away from anywhere
    const lookAt = pl.lightOn && pl.facingDot(this.pos, 1.9) > 0.94 && d < 16;
    if (lookAt) return true;
    let vis = pl.lightOn ? 1 : 0.38;
    if (pl.crouch) vis *= 0.65;
    if (pl.lit) vis = Math.max(vis, 0.75);
    const range = 3 + 15 * vis;
    const cone = this.state === 'chase' ? -0.2 : 0.45;
    return facing > cone && d < range;
  }

  pathTo(target) {
    target = routeTo(this.w.L, this.pos, target); // (on another storey: the stairs first)
    this.path = findPathNav(this.w.L, this.w.B, this.pos.x, this.pos.z, target.x, target.z);
    this.pathT = 0;
    // the route starts in the cell he's standing in, often a step behind him: don't turn back for it
    const p = this.path;
    while (p && p.length > 1 && (this.pos.distanceTo(p[0]) < 0.7 || (p[1].x - p[0].x) * (p[0].x - this.pos.x) + (p[1].z - p[0].z) * (p[0].z - this.pos.z) < 0)) p.shift();
  }

  // rooms nearer this one's start than any other's: with two of them on a floor, each keeps to its own half
  home() {
    const L = this.w.L, hs = this.w.hunters;
    if (this._home && this._homeN === hs.length) return this._home;
    const mine = (r) => { const p = [(r.cx + 0.5) * 2, (r.cy + 0.5) * 2], d = (h) => Math.hypot(h.spawn.x - p[0], h.spawn.z - p[1]); return hs.every((h) => h === this || d(this) <= d(h)); };
    this._homeN = hs.length;
    this._home = L.rooms.slice(1).filter(mine);
    if (!this._home.length) this._home = L.rooms.slice(1);
    return this._home;
  }
  pickPatrol() {
    const L = this.w.L, pl = this.w.player, others = this.w.hunters.filter((h) => h !== this);
    let t = null;
    // the other one is chasing you: this one comes round the far side of you to cut you off
    const chaser = others.find((h) => h.state === 'chase');
    if (!this.avoidT && chaser && Math.random() < 0.6) {
      const ax = pl.pos.x - chaser.pos.x, az = pl.pos.z - chaser.pos.z, d = Math.hypot(ax, az) || 1;
      t = randomFloorNear(L, pl.pos.x + (ax / d) * 8, pl.pos.z + (az / d) * 8, 4);
    }
    // it drifts back toward you eventually, but only one of them at a time: the one nearer you
    const nearest = others.every((h) => h.pos.distanceTo(pl.pos) >= this.pos.distanceTo(pl.pos));
    if (!t && !this.avoidT && nearest && (this.sinceContact > 35 || Math.random() < 0.3)) t = randomFloorNear(L, pl.pos.x, pl.pos.z, 5);
    if (!t && this.avoidT) {
      // just lost you down a crouchway: somewhere well away from it
      const far = L.rooms.slice(1).map((r) => [Math.hypot(r.cx * 2 + 1 - pl.pos.x, r.cy * 2 + 1 - pl.pos.z), r]).sort((a, b) => b[0] - a[0]);
      const r = far[Math.floor(Math.random() * Math.min(3, far.length))][1];
      t = randomFloorNear(L, (r.cx + 0.5) * 2, (r.cy + 0.5) * 2, 1);
    }
    if (!t) {
      // somewhere in its own half (now and then anywhere), and never right on top of the other one
      const rooms = others.length && Math.random() < 0.8 ? this.home() : L.rooms.slice(1);
      for (let k = 0; k < 6 && !t; k++) {
        const r = rooms[(Math.random() * rooms.length) | 0], c = { x: (r.cx + 0.5) * 2, z: (r.cy + 0.5) * 2 };
        if (k < 5 && others.some((h) => Math.hypot(h.pos.x - c.x, h.pos.z - c.z) < 9 || (h.target && Math.hypot(h.target.x - c.x, h.target.z - c.z) < 9))) continue;
        t = randomFloorNear(L, c.x, c.z, 1);
      }
    }
    this.target = t;
    if (t) this.pathTo(t);
  }

  update(dt, t) {
    const w = this.w, pl = w.player, L = w.L;
    this.stateT += dt;
    this.pathT += dt;
    this.sinceContact += dt;
    this.rushT = Math.max(0, (this.rushT || 0) - dt);
    const toP = V.set(pl.pos.x - this.pos.x, 0, pl.pos.z - this.pos.z);
    const dP = toP.length();

    // you went where he can't follow: he gives up and goes off somewhere else
    if (pl.inCrawl && ['chase', 'attack', 'recover', 'alert', 'heard', 'investigate', 'listen', 'search', 'locker'].includes(this.state)) {
      if (['chase', 'attack', 'recover'].includes(this.state)) { w.audio.growl(this.pos, 1); unlock('crawl'); }
      this.awareness = 0;
      this.lastSeen = null;
      this.lockerTarget = null;
      this.opening = false;
      this.avoidT = 25;
      this.setState('patrol');
      this.pickPatrol();
    }
    this.avoidT = Math.max(0, (this.avoidT || 0) - dt);

    // touching him is the end: walk into him (even while he's wandering and hasn't noticed you) and he has you
    if (dP < 0.95 && !pl.hidden && !pl.inCrawl && this.state !== 'stunned' && this.state !== 'grab' && !(w.dev && w.dev.ghost)) { w.onHit(this); return; }

    // perception
    const sees = this.state !== 'grab' && this.canSee();
    this.seesPlayer = sees;
    if (sees) {
      this.awareness = Math.min(1.2, this.awareness + dt * (1.2 + 7 / (dP + 0.6)) * (pl.lightOn ? 1.4 : 1));
      this.lastSeen = pl.pos.clone();
      this.lastVel = pl.vel.clone();
      this.lostT = 0;
      this.cast = null;
      this.sinceContact = 0;
    } else if (this.state !== 'chase') this.awareness = Math.max(0, this.awareness - dt * 0.2);
    if (this.awareness >= 1 && !['chase', 'attack', 'recover', 'locker', 'grab'].includes(this.state)) {
      this.setState('chase');
      w.audio.stinger();
      w.audio.roar(this.pos);
      w.onSpotted(this);
    } else if (sees && this.state === 'patrol' && this.awareness > 0.3) {
      this.target = pl.pos.clone();
      this.setState('alert');
      w.audio.sniff(this.pos);
    }

    let speed = 0, goal = null, turn = 3;
    const D = w.D;
    switch (this.state) {
      case 'patrol':
        speed = 1.25 * D.speedMul;
        if (!this.path || !this.path.length || this.pathT > 25) this.pickPatrol();
        break;
      case 'alert': // stops dead, head twitching toward you
        speed = 0;
        goal = this.target;
        turn = 2;
        if (this.stateT > D.alert) { this.setState('investigate'); }
        break;
      case 'heard': // stock still, turned toward the sound, listening
        speed = 0;
        goal = this.target;
        turn = 2.2;
        if (this.stateT > this.heardFor) this.setState('investigate');
        break;
      case 'investigate': // going to a noise: half his running speed (flat out, when it was you sprinting)
        speed = D.chaseSpeed * (this.rushT > 0 ? 0.95 : 0.5);
        if (!this.path || this.pathT > 2) this.pathTo(this.target);
        if (this.pos.distanceTo(this.target) < 1.2 || (this.path && !this.path.length)) {
          this.setState('listen');
          this.lookBase = this.yaw;
          this.listenFor = 3 + Math.random() * 1.5;
          w.audio.sniff(this.pos);
        }
        break;
      case 'listen': { // where the sound was: stands there, the head going slowly left and right
        speed = 0;
        turn = 1.6;
        const a = this.lookBase + Math.sin(this.stateT * 1.15) * 1.3;
        goal = { x: this.pos.x + Math.sin(a), z: this.pos.z + Math.cos(a) };
        if (this.stateT > this.listenFor) this.setState('search');
        break;
      }
      case 'search':
        speed = 1.7 * D.speedMul;
        if (this.stateT > 14) { this.setState('patrol'); this.awareness = 0; this.checked.clear(); break; }
        if (!this.path || !this.path.length) {
          // check a locker near where it lost you
          const near = w.B.lockers.filter((lk) => !this.checked.has(lk) && lk.pos.distanceTo(this.lastSeen || this.pos) < 7);
          // and the ones you keep using, he gets to know: a locker you've hidden in twice is the first he opens
          const known = near.filter((lk) => lk.uses >= 2), pick = known.length ? known : near;
          if (near.length && Math.random() < (known.length ? 0.75 : 0.4)) { this.lockerTarget = pick[(Math.random() * pick.length) | 0]; this.setState('locker'); break; }
          const c = this.lastSeen || this.pos;
          const tgt = randomFloorNear(L, c.x, c.z, 3);
          if (tgt) this.pathTo(tgt);
        }
        break;
      case 'chase': {
        speed = D.chaseSpeed;
        turn = 8;
        if (pl.hidden) {
          // it watched you climb in
          if (pl.hiddenSeenBy.has(this)) { this.lockerTarget = pl.hidden; this.setState('locker'); break; }
          this.awareness = 0.4;
          this.setState('search');
          break;
        }
        if (pl.inLift && w.liftSealed) { this.setState('gate'); break; }
        if (!sees) {
          this.lostT += dt;
          // fifteen seconds without a sight of you and he gives it up
          if (this.lostT > 15) { this.awareness = 0.4; w.audio.growl(this.pos, 0.8); this.setState('search'); break; }
        }
        let tgt = this.lastSeen || pl.pos;
        if (!sees && this.lastVel) tgt = tgt.clone().addScaledVector(this.lastVel, Math.min(this.lostT, 1.2));
        // got to where you were and you're not there: cast about nearby, still running
        if (!sees && this.pos.distanceTo(tgt) < 1.2) {
          if (!this.cast || this.pos.distanceTo(this.cast) < 1) this.cast = randomFloorNear(L, tgt.x, tgt.z, 3);
          if (this.cast) tgt = this.cast;
        }
        if (sees && this.unstickT <= 0 && pathClear(L, w.B, this.pos.x, this.pos.z, pl.pos.x, pl.pos.z)) { goal = pl.pos; this.path = null; }
        else if (!this.path || this.pathT > 0.35) this.pathTo(tgt);
        if (sees && dP < D.reach * 0.75) { this.setState('attack'); w.audio.growl(this.pos, 1); }
        break;
      }
      case 'attack':
        // he keeps coming while he winds up; the harder the shift, the shorter the windup and the longer the reach
        goal = pl.pos;
        turn = 8;
        speed = D.chaseSpeed * 0.85;
        this.swing = Math.min(1, Math.max(0, (this.stateT - D.windup * 0.8) / (D.windup * 0.3)));
        if (this.stateT > D.windup && !this.struck) {
          this.struck = true;
          if (dP < D.reach && !pl.hidden && lineOfSight(L, this.pos.x, this.pos.z, pl.pos.x, pl.pos.z)) w.onHit(this);
          else w.audio.whoosh(this.pos);
        }
        if (this.stateT > D.windup + 0.2) { this.struck = false; this.swing = 0; this.setState(D.recover > 0 ? 'recover' : 'chase'); }
        break;
      case 'recover': // a beat to let you run (none at all on extreme)
        speed = 0;
        if (this.stateT > D.recover) this.setState('chase');
        break;
      case 'locker': {
        const lk = this.lockerTarget;
        const front = lk.pos.clone().addScaledVector(lk.facing, 0.9);
        speed = pl.hidden === lk && pl.hiddenSeenBy.has(this) ? D.chaseSpeed * 0.8 : 1.9 * D.speedMul;
        turn = 5;
        if (this.pos.distanceTo(front) > 0.5) {
          if (!this.path || this.pathT > 1) this.pathTo(front);
          if (this.path && !this.path.length) goal = front;
        } else {
          speed = 0;
          goal = lk.pos;
          if (!this.opening) { this.opening = true; this.openT = 0; w.audio.lockerOpen(lk.pos); }
          this.openT += dt;
          lk.target = 1;
          if (this.openT > 0.35 && pl.hidden === lk) { this.opening = false; this.setState('grab'); w.onGrab(this, lk); break; }
          if (this.openT > 1.6) {
            lk.target = 0;
            this.opening = false;
            this.checked.add(lk);
            this.lockerTarget = null;
            this.setState('search');
            this.stateT = 6;
          }
        }
        break;
      }
      case 'gate': // you made it in. it is not happy about that
        speed = 2.5;
        goal = w.B.lift.pos.clone().add(new THREE.Vector3(0, 0, -1.6));
        if (this.pos.distanceTo(goal) < 0.6) { speed = 0; goal = w.B.lift.pos; if (Math.random() < dt * 3) w.audio.gateRattle(w.B.lift.pos); }
        else if (!this.path || this.pathT > 1) this.pathTo(goal);
        break;
      case 'grab':
        speed = 0;
        break;
      case 'stunned': // down on his knees, twitching, until it wears off; then he comes looking
        speed = 0;
        if (this.stateT > this.stunFor) {
          this.w.audio.roar(this.pos);
          this.lastSeen = pl.pos.clone();
          this.awareness = 0.5;
          this.setState('search');
        }
        break;
    }

    // steering
    if (!goal && this.path && this.path.length) {
      // cut corners wherever the straight line is clear
      // (not while he's working himself loose from something: then he keeps to the grid)
      if (!(this.unstickT > 0)) for (let k = 0; k < 16 && this.path.length > 1 && pathClear(L, w.B, this.pos.x, this.pos.z, this.path[1].x, this.path[1].z); k++) this.path.shift();
      goal = this.path[0];
      if (this.pos.distanceTo(goal) < 0.3) { this.path.shift(); goal = this.path[0] || null; }
    }
    // walking, he goes where he faces. hunting, he goes straight at you and the body catches up
    const hunting = this.state === 'chase' || this.state === 'attack' || this.state === 'gate' || this.state === 'locker';
    let moveSpeed = 0, mx = Math.sin(this.yaw), mz = Math.cos(this.yaw);
    if (goal) {
      const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z, dist = Math.hypot(dx, dz);
      if (dist > 0.05) {
        const want = Math.atan2(dx, dz);
        let diff = ((want - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        this.yaw += Math.max(-turn * dt, Math.min(turn * dt, diff));
        // he always moves toward where he's going, never sideways along where he happens to face; walking,
        // he slows right down for a sharp turn so the body has time to come round
        mx = dx / dist; mz = dz / dist;
        moveSpeed = hunting ? speed : speed * Math.max(0.2, Math.cos(diff));
      }
    }
    this.speed += (moveSpeed - this.speed) * Math.min(1, dt * (hunting ? 10 : 5));
    this.pos.x += mx * this.speed * dt;
    this.pos.z += mz * this.speed * dt;
    collide(L, w.B, this.pos, 0.34, true);
    if (L.stairs && crossPortal(L, this.pos)) { this.path = null; this.stuck = { t: 0, x: this.pos.x, z: this.pos.z }; } // up or down a storey

    // unstick
    this.stuck.t += dt;
    this.unstickT = (this.unstickT || 0) - dt;
    if (this.stuck.t > 1.5) {
      const moved = Math.hypot(this.pos.x - this.stuck.x, this.pos.z - this.stuck.z);
      // wedged on something: follow the grid path for a bit instead of pushing straight
      if (moved < 0.15 && speed > 0.5) {
        // wedged: back off a step, then follow the grid cell by cell for a while instead of cutting the corner again
        this.pos.x -= Math.sin(this.yaw) * 0.3; this.pos.z -= Math.cos(this.yaw) * 0.3;
        collide(L, w.B, this.pos, 0.34, true);
        this.path = null; this.unstickT = 2.5;
        if (this.state === 'patrol') this.pickPatrol();
      }
      this.stuck = { t: 0, x: this.pos.x, z: this.pos.z };
    }

    // animation
    this.gait += dt * this.speed * (this.state === 'chase' ? 3.1 : 2.6); // a quicker cadence running
    this.twitchT -= dt;
    if (this.twitchT < 0) {
      // the head snaps to odd angles, too fast
      const big = Math.random() < 0.3;
      this.twitch = { x: (Math.random() - 0.5) * (big ? 1.2 : 0.3), y: (Math.random() - 0.5) * 0.5, z: (Math.random() - 0.5) * (big ? 1.4 : 0.4), r: (Math.random() - 0.5) * (big ? 1.6 : 0.3) };
      this.twitchT = this.state === 'chase' ? 0.15 + Math.random() * 0.3 : 0.4 + Math.random() * 2.5;
      if (big && this.state !== 'chase' && dP < 14) w.audio.click(this.pos);
    }
    const mode = this.state === 'chase' ? 'chase' : this.state === 'attack' ? 'attack' : this.state === 'grab' ? 'grab' : this.state === 'stunned' ? 'stunned' : this.state === 'investigate' ? 'stalk' : 'walk';
    const jaw = this.state === 'chase' ? 0.35 + Math.sin(t * 9) * 0.25 : this.state === 'attack' ? 0.8 : 0.05;
    poseForeman(this.body, { gait: this.gait, speed: this.speed, mode, t, swing: this.swing, jawOpen: jaw, twitch: this.twitch });
    this.obj.position.copy(this.pos);
    if (L.stairs) this.obj.position.y = groundAt(L, this.pos.x, this.pos.z);
    this.obj.rotation.y = this.yaw;

    // sound: heavy steps, the hook dragging behind it, wet breathing
    this.stepAcc += this.speed * dt;
    const stride = this.state === 'chase' ? 1.1 : 0.85;
    if (this.stepAcc > stride) { this.stepAcc = 0; w.audio.thud(this.pos, this.state === 'chase' ? 1 : 0.6); }
    const occluded = !lineOfSight(L, this.pos.x, this.pos.z, pl.pos.x, pl.pos.z);
    this.voice.update(this.pos, {
      scrape: this.state === 'chase' ? 0 : Math.min(1, this.speed / 1.2) * (0.5 + Math.random() * 0.5),
      breath: this.state === 'chase' ? 1 : 0.55,
      growl: this.state === 'chase' ? 0.8 : this.state === 'gate' ? 0.6 : 0,
      occluded,
    });
    this.growlT -= dt;
    if (this.growlT < 0) {
      this.growlT = 5 + Math.random() * 9;
      if (this.state !== 'chase' && dP < 20) w.audio.growl(this.pos, 0.6);
    }
  }
}
