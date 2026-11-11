// The puzzles that stand between you and the lift, on top of the tags:
//   fuses    - no power: search body bags for fuses, slot them into the fuse box
//   keypad   - a shutter seals off a wing (with some of the dead in it); the code is scrawled on the walls
//   scale    - the counterweight is jammed: load enough meat on the freight scale
//   valves   - steam has locked the brake: find the release order, turn the hissing valves in it
//   breakers - the finale: pull three kill switches to stop the line, then run for the lift
//   sluices  - the drains: the lift sump is flooded; open three sluice gates to drain it (and the floor)
//   keycard  - administration: the lift is locked to management; search the managers' desks for a keycard
//   meatkey  - the deep freeze: the cage key was hung up with the meat; search the wrapped carcasses for it
//   bolts    - stunning: the lift's latch is jammed; of the bolt guns on their hooks one is still warm (it works):
//              find it and put a bolt through the latch (loud)
//   hooks    - the quiet line: the chain brake on the lift has no crank; it went up the line on one of the bodies
//   override - the finale's last job: the master override in line control, which unlocks the lift to go up
// On the finale (D.chain) the jobs are one chain: each one is dead until the one before it is done (the notes and the
// writing on the walls can still be read early).
// Every puzzle gives main.js its interactions, the Q-listen arrow its targets, and the HUD its lines.
import * as THREE from 'three';
import { TILE, WALL_H } from './config.js';
import { tileCenter } from './level.js';
import { makeRng } from './rng.js';
import * as P from './props.js';
import * as P2 from './props2.js';
import { canvas, BLOOD, drip, wallSplat, handprint } from './textures.js';
import * as UI from './ui.js';
import { vhsTape, tvSet } from './tape.js';

const SYMBOLS = [
  { name: 'CIRCLE', glyph: '●' },
  { name: 'TRIANGLE', glyph: '▲' },
  { name: 'SQUARE', glyph: '■' },
  { name: 'DIAMOND', glyph: '◆' },
  { name: 'CROSS', glyph: '✖' },
];
const ORD = ['FIRST', 'SECOND', 'THIRD', 'LAST'];

// ---------- painted textures ----------
function texOf(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.userData.floorOnly = true; // made for one floor's puzzle: freed with the floor (main.js disposeLevel)
  return t;
}
function drawSymbol(g, kind, x, y, r, fill) {
  g.fillStyle = fill;
  g.strokeStyle = fill;
  g.beginPath();
  if (kind === 'CIRCLE') g.arc(x, y, r, 0, Math.PI * 2);
  else if (kind === 'TRIANGLE') { g.moveTo(x, y - r); g.lineTo(x + r * 0.95, y + r * 0.75); g.lineTo(x - r * 0.95, y + r * 0.75); g.closePath(); }
  else if (kind === 'SQUARE') g.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
  else if (kind === 'DIAMOND') { g.moveTo(x, y - r); g.lineTo(x + r * 0.8, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.8, y); g.closePath(); }
  else { g.lineWidth = r * 0.45; g.moveTo(x - r * 0.75, y - r * 0.75); g.lineTo(x + r * 0.75, y + r * 0.75); g.moveTo(x + r * 0.75, y - r * 0.75); g.lineTo(x - r * 0.75, y + r * 0.75); g.stroke(); return; }
  g.fill();
}
// words written in blood by somebody who was running out of time
function scrawlTex(lines, seed) {
  const { c, g } = canvas(256, 256), rng = makeRng(seed);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = lines.length > 3 ? 38 : 46;
  lines.forEach((ln, i) => {
    const y = 128 + (i - (lines.length - 1) / 2) * size * 1.05;
    g.save();
    g.translate(128 + (rng() - 0.5) * 10, y);
    g.rotate((rng() - 0.5) * 0.12);
    g.font = `bold ${size}px "Courier New", monospace`;
    g.fillStyle = `rgba(${BLOOD.fresh},0.92)`;
    g.fillText(ln, 0, 0);
    g.restore();
    for (let k = 0; k < 3; k++) drip(g, 40 + rng() * 176, y + size * 0.3, 10 + rng() * 40, 2 + rng() * 2, BLOOD.fresh, 0.8);
  });
  if (rng() < 0.7) handprint(g, 30 + rng() * 40, 200, 20, 0.3, rng, BLOOD.dark, 30);
  return texOf(c);
}
function paperTex(lines, opts = {}) {
  const { c, g } = canvas(256, 320), rng = makeRng(opts.seed || 5);
  g.fillStyle = '#cdbf9f';
  g.fillRect(0, 0, 256, 320);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,60,20,${rng() * 0.08})`; g.beginPath(); g.arc(rng() * 256, rng() * 320, rng() * 40, 0, 7); g.fill(); }
  g.fillStyle = '#2a2017';
  g.textAlign = 'center';
  g.font = 'bold 22px "Courier New", monospace';
  g.fillText(opts.title || '', 128, 44);
  g.font = '18px "Courier New", monospace';
  lines.forEach((l, i) => g.fillText(l, 128, 84 + i * 26));
  if (opts.symbols) opts.symbols.forEach((s, i) => drawSymbol(g, s, 48 + i * (160 / Math.max(1, opts.symbols.length - 1)), 220, 18, '#7a0a06'));
  wallSplat(g, 40 + rng() * 170, 270, 16, rng, BLOOD.dark);
  return texOf(c);
}
function plainTex(w, h, draw) {
  const { c, g } = canvas(w, h);
  draw(g);
  return { tex: texOf(c), c, g };
}

// a flat thing on a wall: position just off the surface, turned to face into the room
function onWall(x, y, [dx, dy], h, off = 0.02) {
  return {
    pos: new THREE.Vector3(tileCenter(x) + dx * (TILE / 2 - off), h, tileCenter(y) + dy * (TILE / 2 - off)),
    yaw: Math.atan2(-dx, -dy),
  };
}
const plane = (w, h, mat) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);

// ---------- the puzzles ----------
class Fuses {
  constructor(ctx, n) {
    const { B, mats, rng, add, G } = ctx;
    this.kind = 'fuses';
    this.gates = true;
    this.ctx = ctx;
    this.n = n;
    this.carry = 0;
    this.inserted = 0;
    const far = (t) => G.L.dist[t[1] * G.L.W + t[0]] > ctx.maxDist * 0.3;
    const spot = B.takeWall(([x, y, , ri]) => far([x, y]) && !B.inWing(x, y)) || B.takeWall();
    const w = onWall(spot[0], spot[1], spot[2], 1.3);
    const box = new THREE.Group();
    const back = P.mesh(new THREE.BoxGeometry(0.7, 0.8, 0.12), mats.rust[1]);
    box.add(back);
    this.sockets = [];
    for (let i = 0; i < n; i++) {
      const s = P.mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }), false);
      s.rotation.z = Math.PI / 2;
      s.position.set(0, 0.25 - i * (0.5 / Math.max(1, n - 1)), 0.07);
      box.add(s);
      this.sockets.push(s);
    }
    this.lamp = P.mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x601008, fog: false }), false);
    this.lamp.position.set(0.25, 0.32, 0.07);
    box.add(this.lamp);
    box.position.copy(w.pos);
    box.position.y = 1.3;
    box.rotation.y = w.yaw;
    add(box);
    this.box = w.pos.clone();
    // the fuses were hidden in the dead
    this.bags = [];
    for (let i = 0; i < n + 1; i++) { // one spare bag: one of them is empty
      if (G.L.hall) { // the factory floor: laid out against a wall where somebody left them, cold rooms first, never in an aisle
        const cold = (ri) => ['morgue', 'freezer', 'butcher', 'bunks'].includes(G.L.rooms[ri].type);
        const w = B.takeWall(([x, y, , ri]) => !B.inWing(x, y) && cold(ri)) || B.takeWall(([x, y]) => !B.inWing(x, y));
        if (!w) break;
        const [tx, ty, [dx, dy]] = w, x = tileCenter(tx) + dx * 0.42, z = tileCenter(ty) + dy * 0.42;
        const bag = add(P.bodyBag(mats, rng), x, z, Math.atan2(-dx, -dy) + (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.12);
        B.group.add(P.decal(mats.pool[(rng() * 3) | 0], 1.1 + rng() * 0.5, x - dx * 0.2, z - dy * 0.2, rng() * 6)); // what seeped out
        if (rng() < 0.7) B.group.add(P.decal(mats.drag, 2, x - dx * 1.4, z - dy * 1.4, Math.atan2(dx, dy) + Math.PI / 2)); // how it got here
        this.bags.push({ obj: bag, pos: new THREE.Vector3(x, 0.15, z), searched: false, hasFuse: i < n });
        continue;
      }
      const t = ctx.chain ? B.takeTile(([x, y, ri]) => !B.inWing(x, y) && (G.L.rooms[ri].type === 'morgue' || rng() < 0.5)) || B.takeTile(([x, y]) => !B.inWing(x, y))
        : B.takeTile(([x, y, ri]) => G.L.rooms[ri].type === 'morgue' || rng() < 0.5) || B.takeTile();
      if (!t) break;
      const x = tileCenter(t[0]) + (rng() - 0.5) * 0.6, z = tileCenter(t[1]) + (rng() - 0.5) * 0.6;
      const bag = add(P.bodyBag(mats, rng), x, z, rng() * 6);
      this.bags.push({ obj: bag, pos: new THREE.Vector3(x, 0.15, z), searched: false, hasFuse: i < n });
    }
    rng.shuffle(this.bags);
    this.bags.forEach((b, i) => (b.hasFuse = i < n));
  }
  get solved() { return this.inserted >= this.n; }
  interactables() {
    const out = [];
    for (const b of this.bags) {
      if (b.searched) continue;
      out.push({ pos: b.pos, range: 1.6, minFacing: 0.4, hold: 2.2, label: 'HOLD — SEARCH THE BODY BAG', tick: 'squelch', noise: 8,
        use: () => {
          b.searched = true;
          b.obj.userData.open();
          if (!THREE.gore.less) b.obj.add(P.entrails(this.ctx.mats, this.ctx.rng, new THREE.Vector3(0.2, 0.08, 0.1), 0.8, 9));
          this.ctx.G.audio.tear();
          if (b.hasFuse) { this.carry++; UI.message(['There’s a fuse in here, under the ribs. Wiped clean of nothing.', 'Your hand closes on glass. A fuse, still in one piece.'][this.carry % 2], 3); }
          else UI.message('Just a body. Nothing on him.', 3);
        } });
    }
    if (!this.solved) {
      if (this.carry > 0) out.push({ pos: this.box, range: 1.7, minFacing: 0.3, hold: 1, label: `HOLD — SLOT THE FUSES (${this.carry})`, use: () => this.slot() });
      else out.push({ pos: this.box, range: 1.7, minFacing: 0.3, label: `FUSE BOX — ${this.inserted}/${this.n} FUSES` });
    }
    return out;
  }
  slot() {
    const G = this.ctx.G;
    for (; this.carry > 0; this.carry--) this.sockets[this.inserted++].material = new THREE.MeshBasicMaterial({ color: 0xffb040, fog: false });
    G.audio.clank(this.box, 0.8);
    if (this.solved) {
      this.lamp.material.color.setHex(0x40ff60);
      G.audio.powerOn(this.box);
      G.noise(this.box, 35, true);
      G.scare = Math.max(G.scare, 0.5);
      for (const l of G.B.lamps) if (l.state === 'dead') l.state = 'flicker';
      UI.message('The power’s back on. That was loud.', 4.5);
    } else UI.message(`${this.n - this.inserted} more.`, 2);
  }
  goals() {
    if (this.solved) return [];
    if (this.carry + this.inserted >= this.n) return [this.box];
    return [...this.bags.filter((b) => !b.searched).map((b) => b.pos), ...(this.carry ? [this.box] : [])];
  }
  line() { return this.solved ? null : `FUSES ${this.inserted + this.carry}/${this.n}`; }
  title() { return `RESTORE POWER — FUSES <b>${this.inserted}/${this.n}</b>`; }
  liftMsg() { return 'NO POWER — THE FUSE BOX IS EMPTY'; }
  // dev mode: as if you'd found and slotted every fuse
  solve() { this.load({ ...this.save(), carry: 0, inserted: this.n, searched: this.bags.map(() => true) }); }
  save() { return { carry: this.carry, inserted: this.inserted, searched: this.bags.map((b) => b.searched) }; }
  load(s) {
    s.searched.forEach((v, i) => { const b = this.bags[i]; if (v && b) { b.searched = true; b.obj.userData.open(); } });
    this.carry = s.carry;
    for (let i = 0; i < s.inserted; i++) this.sockets[i].material = new THREE.MeshBasicMaterial({ color: 0xffb040, fog: false });
    this.inserted = s.inserted;
    if (this.solved) { this.lamp.material.color.setHex(0x40ff60); for (const l of this.ctx.G.B.lamps) if (l.state === 'dead') l.state = 'flicker'; }
  }
}

class Keypad {
  constructor(ctx) {
    const { G, B, mats, rng, add } = ctx;
    this.kind = 'keypad';
    this.gates = false;
    this.ctx = ctx;
    const d = G.L.door;
    this.door = d;
    this.code = [0, 1, 2, 3].map(() => (rng() * 10) | 0);
    this.known = [null, null, null, null];
    this.opened = false;
    this.lift = 0;
    // the shutter
    const cx = tileCenter(d.x), cz = tileCenter(d.y);
    const sh = new THREE.Group();
    const slats = P.mesh(new THREE.BoxGeometry(TILE, WALL_H, 0.14), mats.rust[2]);
    slats.position.y = WALL_H / 2;
    sh.add(slats);
    for (let i = 0; i < 14; i++) {
      const rib = P.mesh(new THREE.BoxGeometry(TILE, 0.03, 0.17), mats.darkMetal, false);
      rib.position.y = 0.1 + i * 0.21;
      sh.add(rib);
    }
    sh.position.set(cx, 0, cz);
    sh.rotation.y = d.ns ? 0 : Math.PI / 2; // spans across the corridor
    add(sh);
    this.shutter = sh;
    // keypad on the side you come from
    const [sx, sy] = d.side;
    this.pad = new THREE.Vector3(cx + sx * 0.12 + (d.ns ? 0.65 : 0), 1.35, cz + sy * 0.12 + (d.ns ? 0 : 0.65));
    const padM = P.mesh(new THREE.BoxGeometry(0.2, 0.3, 0.05), mats.darkMetal, false);
    padM.position.copy(this.pad);
    padM.rotation.y = Math.atan2(sx, sy);
    this.padLed = P.mesh(new THREE.SphereGeometry(0.015, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2010, fog: false }), false);
    this.padLed.position.set(0.06, 0.11, 0.03);
    padM.add(this.padLed);
    add(padM);
    // where you stand to use it: in front of the pad, in the tile before the shutter (not the shutter's own)
    this.stand = new THREE.Vector3(cx + sx * 1.25 + (d.ns ? 0.5 : 0), 0, cz + sy * 1.25 + (d.ns ? 0 : 0.5));
    // four digits, written in blood in four different places on this side of the shutter
    this.notes = [];
    const usedRooms = new Set();
    for (let i = 0; i < 4; i++) {
      const spot = B.takeWall(([x, y, , ri]) => !B.inWing(x, y) && !usedRooms.has(ri)) || B.takeWall(([x, y]) => !B.inWing(x, y));
      if (!spot) continue;
      usedRooms.add(spot[3]);
      const w = onWall(spot[0], spot[1], spot[2], 1.55);
      const m = plane(1, 1, new THREE.MeshPhongMaterial({ map: scrawlTex([ORD[i], 'NUMBER', 'IS ' + this.code[i]], 900 + i + G.depth * 10), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, shininess: 80, specular: 0x441111 }));
      m.position.copy(w.pos);
      m.rotation.y = w.yaw;
      add(m);
      this.notes.push({ i, pos: w.pos, read: false });
    }
  }
  get solved() { return this.opened; }
  interactables() {
    const out = [];
    for (const n of this.notes) {
      if (n.read) continue;
      out.push({ pos: n.pos, range: 2.2, minFacing: 0.55, label: 'READ THE WRITING ON THE WALL', tap: true, use: () => {
        n.read = true;
        this.known[n.i] = this.code[n.i];
        this.ctx.G.audio.tick();
        UI.note('WRITTEN IN BLOOD', `${ORD[n.i]} NUMBER IS ${this.code[n.i]}`, 'The shutter code. Somebody wrote it here so the next one would have a chance.');
      } });
    }
    if (!this.opened) out.push({ pos: this.pad, range: 2.4, minFacing: 0.25, label: 'USE THE KEYPAD', tap: true, use: () => UI.keypad.open((code) => this.submit(code)) });
    return out;
  }
  submit(code) {
    const G = this.ctx.G;
    if (code.join('') === this.code.join('')) {
      this.opened = true;
      G.audio.shutter(this.pad);
      G.noise(this.pad, 25, true);
      this.padLed.material.color.setHex(0x30ff50);
      UI.keypad.close();
      UI.message('The shutter’s open.', 4);
      return true;
    }
    G.audio.buzzer(this.pad);
    G.noise(this.pad, 22, true);
    G.scare = Math.max(G.scare, 0.5);
    return false;
  }
  update(dt) {
    if (!this.opened || this.lift >= 1) return;
    this.lift = Math.min(1, this.lift + dt / 2.6);
    this.shutter.position.y = this.lift * (WALL_H - 0.15);
    if (this.lift > 0.6 && this.door.closed) {
      this.door.closed = false;
      const L = this.ctx.G.L;
      L.block[this.door.y * L.W + this.door.x] = 0;
    }
  }
  goals() {
    if (this.opened) return [];
    const unread = this.notes.filter((n) => !n.read);
    return unread.length && this.known.includes(null) ? unread.map((n) => n.pos) : [this.stand];
  }
  line() { return this.opened ? null : `SHUTTER CODE ${this.known.map((k) => (k === null ? '_' : k)).join(' ')}`; }
  title() { return 'FIND THE SHUTTER CODE'; }
  liftMsg() { return this.ctx.chain ? 'IT WON\u2019T MOVE' : null; }
  solve() { this.load({ ...this.save(), read: this.notes.map(() => true), opened: true }); }
  save() { return { read: this.notes.map((n) => n.read), opened: this.opened }; }
  load(s) {
    s.read.forEach((r, i) => { const n = this.notes[i]; if (r && n) { n.read = true; this.known[n.i] = this.code[n.i]; } });
    if (s.opened) {
      this.opened = true;
      this.lift = 1;
      this.shutter.position.y = WALL_H - 0.15;
      this.padLed.material.color.setHex(0x30ff50);
      this.door.closed = false;
      const L = this.ctx.G.L;
      L.block[this.door.y * L.W + this.door.x] = 0;
    }
  }
}

class Scale {
  constructor(ctx) {
    const { G, B, mats, rng, add } = ctx;
    this.kind = 'scale';
    this.gates = true;
    this.ctx = ctx;
    // the scale stands in the lift room, next to the lift mouth
    const L = G.L, a = L.alcove;
    const spots = [[a.x - 1, a.y - 1], [a.x + 1, a.y - 1], [a.x, a.y - 2]].filter(([x, y]) => L.roomOf[y * L.W + x] === 0);
    const [sx, sy] = spots[0];
    this.pos = new THREE.Vector3(tileCenter(sx), 0, tileCenter(sy));
    const g = new THREE.Group();
    const plate = P.mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), mats.steel);
    plate.position.y = 0.06;
    const post = P.mesh(new THREE.BoxGeometry(0.08, 1.3, 0.08), mats.darkMetal);
    post.position.set(0, 0.7, -0.4);
    g.add(plate, post);
    this.dial = plainTex(256, 128, () => {});
    const face = plane(0.6, 0.3, new THREE.MeshBasicMaterial({ map: this.dial.tex, fog: false }));
    face.position.set(0, 1.45, -0.36);
    g.add(face);
    const housing = P.mesh(new THREE.BoxGeometry(0.66, 0.36, 0.06), mats.darkMetal, false);
    housing.position.set(0, 1.45, -0.4);
    g.add(housing);
    this.pile = new THREE.Group();
    this.pile.position.y = 0.14;
    g.add(this.pile);
    add(g, this.pos.x, this.pos.z, 0);
    B.colliders.push({ x0: this.pos.x - 0.45, z0: this.pos.z - 0.45, x1: this.pos.x + 0.45, z1: this.pos.z + 0.45, hunters: false });
    // weights: three or four cuts that make the target, and some spares; anything at or over it will do
    const k = G.depth >= 6 ? 4 : 3;
    const pool = [];
    for (let w = 4; w <= 31; w++) pool.push(w);
    rng.shuffle(pool);
    const answer = pool.slice(0, k), decoys = pool.slice(k, k + 4);
    this.target = answer.reduce((s, w) => s + w, 0);
    this.answer = answer;
    this.cuts = [];
    for (const w of rng.shuffle([...answer, ...decoys])) {
      const t = B.takeTile(([x, y]) => !B.inWing(x, y)) || B.takeTile();
      if (!t) continue;
      const x = tileCenter(t[0]) + (rng() - 0.5) * 0.6, z = tileCenter(t[1]) + (rng() - 0.5) * 0.6;
      const hook = P.hangingChain(mats, () => 0.9); // no extra meat on it; the cut goes on below
      hook.position.set(x, WALL_H, z);
      const cut = P.meatChunk(mats, rng);
      cut.scale.multiplyScalar(1.4 + w / 20);
      cut.position.y = -(hook.children.length * 0.07) - 0.35;
      const tagTex = plainTex(128, 64, (g2) => { g2.fillStyle = '#d8ccb0'; g2.fillRect(0, 0, 128, 64); g2.fillStyle = '#5a0805'; g2.font = 'bold 38px "Courier New", monospace'; g2.textAlign = 'center'; g2.fillText(w + 'KG', 64, 46); });
      const label = plane(0.26, 0.13, new THREE.MeshBasicMaterial({ map: tagTex.tex, side: THREE.DoubleSide }));
      label.position.set(0, cut.position.y + 0.32, 0.05);
      hook.add(cut, label);
      add(hook);
      hook.userData.swing.still = true; // hangs dead still, so the cut is where you reach for it
      ctx.B.swingers.push(hook);
      this.cuts.push({ w, obj: hook, cut, label, pos: new THREE.Vector3(x, 1.5, z), where: 'hook' });
    }
    this.carry = [];
    this.on = [];
    this.done = false;
    this.paint();
  }
  get total() { return this.on.reduce((s, c) => s + c.w, 0); }
  get solved() { return this.done; }
  paint() {
    const g = this.dial.g, t = this.total;
    g.fillStyle = '#0d0a08';
    g.fillRect(0, 0, 256, 128);
    g.font = 'bold 48px "Courier New", monospace';
    g.textAlign = 'center';
    g.fillStyle = t >= this.target ? '#40ff60' : '#ffb040';
    g.fillText(`${t}/${this.target}`, 128, 66);
    g.font = '20px "Courier New", monospace';
    g.fillText(t >= this.target ? 'ENOUGH' : 'KG', 128, 104);
    this.dial.tex.needsUpdate = true;
  }
  restack() {
    this.pile.clear();
    this.on.forEach((c, i) => { const m = P.meatChunk(this.ctx.mats, this.ctx.rng); m.scale.multiplyScalar(1.6); m.position.set((i % 2 - 0.5) * 0.3, 0.05 + Math.floor(i / 2) * 0.12, 0); this.pile.add(m); });
  }
  interactables() {
    if (this.done) return [];
    const out = [];
    for (const c of this.cuts) {
      if (c.where !== 'hook') continue;
      const full = this.carry.length >= 2;
      out.push({ pos: c.pos, range: 1.6, minFacing: 0.5, tap: !full, label: full ? `${c.w} KG — YOUR HANDS ARE FULL` : `TAKE THE ${c.w} KG CUT`, use: () => {
        c.where = 'hand';
        c.cut.visible = false;
        c.label.visible = false; // (by reference: the remaster adds children to the hook after the label)
        this.carry.push(c);
        this.ctx.G.audio.squelch(0.5);
      } });
    }
    const t = this.total;
    if (this.carry.length) out.push({ pos: this.pos, range: 1.7, minFacing: 0.2, tap: true, label: `PUT ${this.carry.map((c) => c.w).join(' + ')} KG ON THE SCALE`, use: () => this.put() });
    else if (this.on.length && t < this.target) out.push({ pos: this.pos, range: 1.7, minFacing: 0.2, hold: 0.6, label: `HOLD — TAKE THE ${this.on[this.on.length - 1].w} KG CUT BACK OFF`, use: () => {
      const c = this.on.pop();
      c.where = 'hand';
      this.carry.push(c);
      this.restack();
      this.paint();
    } });
    else out.push({ pos: this.pos, range: 1.7, minFacing: 0.2, label: `THE SCALE READS ${t} — IT NEEDS ${this.target} KG` });
    return out;
  }
  put() {
    const G = this.ctx.G;
    this.on.push(...this.carry);
    this.carry.forEach((c) => (c.where = 'scale'));
    this.carry = [];
    this.restack();
    this.paint();
    G.audio.squelch(0.8);
    G.audio.clank(this.pos, 0.5);
    const t = this.total;
    if (t >= this.target) {
      this.done = true;
      G.audio.powerOn(this.pos);
      G.noise(this.pos, 22, true);
      UI.message('That’s the weight. The counterweight’s free.', 4);
    } else UI.message(`${t} kg. It needs at least ${this.target}.`, 3);
  }
  goals() {
    if (this.done) return [];
    if (this.carry.length >= 2 || (this.carry.length && this.total + this.carry.reduce((s, c) => s + c.w, 0) >= this.target)) return [this.pos];
    const hanging = this.cuts.filter((c) => c.where === 'hook').map((c) => c.pos);
    return this.carry.length || !hanging.length ? [this.pos, ...hanging] : hanging;
  }
  line() {
    if (this.done) return null;
    const hands = this.carry.length ? ` · CARRYING ${this.carry.map((c) => c.w).join('+')} KG` : '';
    return `SCALE ${this.total}/${this.target} KG${hands}`;
  }
  title() { return `LOAD THE SCALE — AT LEAST <b>${this.target} KG</b>`; }
  liftMsg() { return `THE COUNTERWEIGHT IS JAMMED — THE SCALE NEEDS ${this.target} KG`; }
  solve() { this.load({ on: [], carry: [], done: true }); }
  save() { return { on: this.on.map((c) => this.cuts.indexOf(c)), carry: this.carry.map((c) => this.cuts.indexOf(c)), done: this.done }; }
  load(s) {
    const take = (c) => { c.cut.visible = false; c.obj.children[c.obj.children.length - 1].visible = false; };
    this.on = s.on.map((i) => this.cuts[i]).filter(Boolean);
    this.carry = s.carry.map((i) => this.cuts[i]).filter(Boolean);
    this.on.forEach((c) => { c.where = 'scale'; take(c); });
    this.carry.forEach((c) => { c.where = 'hand'; take(c); });
    this.done = s.done;
    this.restack();
    this.paint();
  }
}

class Valves {
  constructor(ctx) {
    const { G, B, mats, rng, add } = ctx;
    this.kind = 'valves';
    this.gates = true;
    this.ctx = ctx;
    const n = G.depth >= 8 ? 5 : 4;
    const syms = rng.shuffle(SYMBOLS.slice()).slice(0, n);
    this.valves = [];
    const usedRooms = new Set();
    for (const s of syms) {
      const spot = B.takeWall(([x, y, , ri]) => !B.inWing(x, y) && !usedRooms.has(ri)) || B.takeWall(([x, y]) => !B.inWing(x, y));
      if (!spot) continue;
      usedRooms.add(spot[3]);
      const w = onWall(spot[0], spot[1], spot[2], 1.25, 0.12);
      const g = new THREE.Group();
      const pipe = P.mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 8), mats.darkMetal);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.z = -0.05;
      const wheel = new THREE.Group();
      wheel.add(P.mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16), new THREE.MeshPhongMaterial({ color: 0x7a1a10, shininess: 40 })));
      for (let k = 0; k < 3; k++) { const sp = P.mesh(new THREE.BoxGeometry(0.4, 0.025, 0.025), mats.darkMetal, false); sp.rotation.z = (k * Math.PI) / 3; wheel.add(sp); }
      wheel.position.z = 0.09;
      const sign = plainTex(64, 64, (g2) => { g2.fillStyle = '#cdbf9f'; g2.fillRect(0, 0, 64, 64); drawSymbol(g2, s.name, 32, 32, 20, '#7a0a06'); });
      const plaque = plane(0.22, 0.22, new THREE.MeshBasicMaterial({ map: sign.tex }));
      plaque.position.set(0, 0.42, -0.08);
      g.add(pipe, wheel, plaque);
      g.position.copy(w.pos);
      g.rotation.y = w.yaw;
      add(g);
      this.valves.push({ sym: s, wheel, pos: w.pos, turned: false, hiss: G.audio.steamLeak(w.pos) });
      if (ctx.parts) wheel.visible = false; // (B10: the handwheels have been taken off; see Parts)
    }
    this.order = rng.shuffle(this.valves.map((_, i) => i));
    this.progress = 0;
    this.known = false;
    const spot = B.takeWall(([x, y]) => !B.inWing(x, y)) || B.takeWall();
    const w = onWall(spot[0], spot[1], spot[2], 1.45);
    const paper = plane(0.4, 0.5, new THREE.MeshPhongMaterial({ map: paperTex(['PRESSURE RELEASE', 'TURN IN THIS', 'ORDER ONLY:'], { title: 'MAINTENANCE', symbols: this.order.map((i) => this.valves[i].sym.name), seed: 77 }), shininess: 5 }));
    paper.position.copy(w.pos);
    paper.rotation.y = w.yaw;
    add(paper);
    this.note = w.pos;
  }
  fitted() { for (const v of this.valves) v.wheel.visible = true; }
  get solved() { return this.progress >= this.valves.length; }
  glyphs() { return this.order.map((i, k) => (k < this.progress ? '✓' : this.valves[i].sym.glyph)).join(' '); }
  interactables() {
    if (this.solved) return [];
    const out = [];
    if (!this.known) out.push({ pos: this.note, range: 1.8, minFacing: 0.5, tap: true, label: 'READ THE MAINTENANCE NOTE', use: () => {
      this.known = true;
      this.ctx.G.audio.tick();
      UI.note('MAINTENANCE — PRESSURE RELEASE', this.order.map((i) => this.valves[i].sym.glyph).join('  '), 'Turn the valves in this order only. Any other order vents the whole system.');
    } });
    this.valves.forEach((v, i) => {
      if (v.turned) return;
      out.push({ pos: v.pos, range: 1.7, minFacing: 0.4, hold: 1.6, tick: 'screech', noise: 12, label: `HOLD — TURN THE ${v.sym.glyph} ${v.sym.name} VALVE`, use: () => this.turn(i) });
    });
    return out;
  }
  turn(i) {
    const G = this.ctx.G, v = this.valves[i];
    if (this.order[this.progress] === i) {
      v.turned = true;
      v.wheel.rotation.z += Math.PI * 1.5;
      v.hiss.stop();
      this.progress++;
      G.audio.clank(v.pos, 0.6);
      if (this.solved) {
        G.audio.powerOn(v.pos);
        G.noise(v.pos, 22, true);
        if (!this.ctx.chain) UI.message('Pressure’s down. The lift brake is off.', 4);
      } else UI.message('That one’s off.', 2);
      return;
    }
    // wrong: everything vents at once
    G.audio.steamBurst(v.pos);
    G.noise(v.pos, 28, true);
    G.flash = 0.9;
    G.scare = 1;
    G.player.shake = 1;
    this.progress = 0;
    for (const o of this.valves) if (o.turned) { o.turned = false; o.wheel.rotation.z = 0; o.hiss = G.audio.steamLeak(o.pos); }
    UI.message('Wrong valve. It’s all reset, and he heard that.', 4.5);
  }
  goals() {
    if (this.solved) return [];
    if (!this.known) return [this.note];
    return [this.valves[this.order[this.progress]].pos];
  }
  line() { return this.solved ? null : this.known ? `VALVES ${this.glyphs()}` : 'VALVES: FIND THE RELEASE ORDER'; }
  title() { return 'RELEASE THE STEAM PRESSURE'; }
  liftMsg() { return 'THE BRAKE IS LOCKED BY STEAM — TURN THE VALVES IN ORDER'; }
  solve() { if (!this.solved) this.load({ ...this.save(), progress: this.valves.length }); }
  save() { return { known: this.known, progress: this.progress }; }
  load(s) {
    this.known = s.known;
    for (let k = 0; k < s.progress; k++) { const v = this.valves[this.order[k]]; v.turned = true; v.wheel.rotation.z = Math.PI * 1.5; v.hiss.stop(); }
    this.progress = s.progress;
  }
  dispose() { for (const v of this.valves) v.hiss.stop(); }
}

class Breakers {
  constructor(ctx) {
    const { G, B, mats, add } = ctx;
    this.kind = 'breakers';
    this.gates = true;
    this.ctx = ctx;
    const L = G.L;
    const far = L.rooms.map((r, ri) => [L.dist[r.cy * L.W + r.cx], ri]).filter(([, ri]) => ri > 0).sort((a, b) => b[0] - a[0]);
    const want = [far[0], far[Math.floor(far.length / 3)], far[Math.floor(far.length / 2)]].map((f) => f[1]);
    // the finale: one of them is behind the shutter, and the others well apart
    if (ctx.chain && L.wing) {
      const inW = far.filter(([, ri]) => L.wing.rooms.includes(ri)), out = far.filter(([, ri]) => !L.wing.rooms.includes(ri));
      if (inW.length && out.length > 2) want.splice(0, 3, inW[0][1], out[0][1], out[Math.floor(out.length / 2)][1]);
    }
    this.switches = [];
    for (const ri of want) {
      const spot = B.takeWall(([, , , r]) => r === ri) || B.takeWall();
      const w = onWall(spot[0], spot[1], spot[2], 1.3);
      const g = new THREE.Group();
      g.add(P.mesh(new THREE.BoxGeometry(0.6, 0.9, 0.15), mats.rust[0]));
      const lever = new THREE.Group();
      lever.position.set(0, 0, 0.1);
      const arm = P.mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), mats.darkMetal, false);
      arm.position.y = 0.2;
      const knob = P.mesh(new THREE.BoxGeometry(0.22, 0.07, 0.07), new THREE.MeshPhongMaterial({ color: 0x8a0a06 }), false);
      knob.position.y = 0.42;
      lever.add(arm, knob);
      lever.rotation.z = 0.5;
      const lamp = P.mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2010, fog: false }), false);
      lamp.position.set(0.22, 0.36, 0.08);
      const warn = plainTex(128, 64, (g2) => { g2.fillStyle = '#c8a020'; g2.fillRect(0, 0, 128, 64); g2.fillStyle = '#111'; g2.font = 'bold 18px "Courier New", monospace'; g2.textAlign = 'center'; g2.fillText('LINE', 64, 26); g2.fillText('KILL SWITCH', 64, 50); });
      const sign = plane(0.4, 0.2, new THREE.MeshBasicMaterial({ map: warn.tex }));
      sign.position.set(0, -0.32, 0.08);
      g.add(lever, lamp, sign);
      g.position.copy(w.pos);
      g.rotation.y = w.yaw;
      add(g);
      this.switches.push({ pos: w.pos, lever, lamp, pulled: false });
    }
    this.pulled = 0;
    G.audio.lineRunning(true);
  }
  get solved() { return this.pulled >= this.switches.length; }
  interactables() {
    return this.switches.filter((s) => !s.pulled).map((s) => ({ pos: s.pos, range: 1.7, minFacing: 0.4, hold: 3, tick: 'clank', noise: 14, label: 'HOLD — PULL THE KILL SWITCH', use: () => this.pull(s) }));
  }
  pull(s) {
    const G = this.ctx.G;
    s.pulled = true;
    s.lever.rotation.z = -0.6;
    s.lamp.material.color.setHex(0x30ff50);
    this.pulled++;
    G.audio.breaker(s.pos);
    G.noise(s.pos, 45, true);
    G.scare = 1;
    G.player.shake = 0.8;
    if (this.pulled === 1) {
      G.audio.siren(true);
      setTimeout(() => G.state === 'play' && UI.pa('UNAUTHORISED STOPPAGE ON THE LINE. ALL STAFF TO THE KILLING FLOOR.'), 1500);
    }
    if (this.solved) {
      G.audio.lineRunning(false);
      if (this.ctx.chain) { /* the line winds down: you hear it */ }
      else { G.frenzy = true; UI.message('The line stops. They both heard that. GET TO THE LIFT.', 5); }
    } else UI.message(`${this.switches.length - this.pulled} more. The alarm is screaming.`, 3);
  }
  goals() { return this.switches.filter((s) => !s.pulled).map((s) => s.pos); }
  line() { return this.solved ? null : `KILL SWITCHES ${this.pulled}/${this.switches.length}`; }
  title() { return `STOP THE LINE — KILL SWITCHES <b>${this.pulled}/${this.switches.length}</b>`; }
  liftMsg() { return 'THE LIFT WON’T MOVE WHILE THE LINE IS RUNNING'; }
  solve() {
    const G = this.ctx.G;
    for (const s of this.switches) if (!s.pulled) { s.pulled = true; s.lever.rotation.z = -0.6; s.lamp.material.color.setHex(0x30ff50); this.pulled++; }
    G.audio.siren(true); G.audio.lineRunning(false); if (!this.ctx.chain) G.frenzy = true;
  }
  save() { return { pulled: this.switches.map((s) => s.pulled) }; }
  load(st) {
    const G = this.ctx.G;
    st.pulled.forEach((p, i) => { const s = this.switches[i]; if (p && s) { s.pulled = true; s.lever.rotation.z = -0.6; s.lamp.material.color.setHex(0x30ff50); this.pulled++; } });
    if (this.pulled > 0) G.audio.siren(true);
    if (this.solved) { G.audio.lineRunning(false); if (!this.ctx.chain) G.frenzy = true; }
  }
  dispose() { this.ctx.G.audio.lineRunning(false); this.ctx.G.audio.siren(false); }
}

// the morgue: an intake log says which drawers the missing workers are in
class Drawers {
  constructor(ctx) {
    const { G, B, rng } = ctx;
    this.kind = 'drawers';
    this.gates = true;
    this.ctx = ctx;
    const letters = ['A', 'B', 'C', 'D'];
    this.banks = [];
    const usedRooms = new Set();
    const freezer = (ri) => G.L.rooms[ri] && G.L.rooms[ri].type === 'freezer';
    for (const letter of letters) {
      const spot = B.takeWall(([x, y, , ri]) => !B.inWing(x, y) && freezer(ri) && !usedRooms.has(ri))
        || B.takeWall(([x, y, , ri]) => !B.inWing(x, y) && freezer(ri))
        || B.takeWall(([x, y]) => !B.inWing(x, y));
      if (!spot) continue;
      usedRooms.add(spot[3]);
      const tex = plainTex(256, 294, (g) => {
        g.font = 'bold 34px "Courier New", monospace';
        g.textAlign = 'center';
        g.fillStyle = '#1a2026';
        g.fillText('BANK ' + letter, 128, 30);
        g.font = 'bold 15px "Courier New", monospace';
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
          const num = (2 - r) * 3 + c + 1, x = (c - 1) * 0.63, y = 0.42 + r * 0.66;
          const px = (x + 1) * 128, py = (2.3 - (y + 0.33)) * 128;
          g.fillStyle = '#d8dde0';
          g.fillRect(px - 18, py - 11, 36, 15);
          g.fillStyle = '#1a2026';
          g.fillText(letter + '-' + num, px, py + 1);
        }
      }).tex;
      const bank = B.placeBank(spot[0], spot[1], spot[2], tex, 1);
      bank.letter = letter;
      bank.drawers.forEach((d, i) => { const r = Math.floor(i / 3), c = i % 3; d.num = (2 - r) * 3 + c + 1; d.tried = false; });
      this.banks.push(bank);
    }
    const n = Math.min(this.banks.length * 2, G.depth >= 6 ? 4 : 3);
    const all = this.banks.flatMap((b) => b.drawers.map((d) => ({ b, d })));
    rng.shuffle(all);
    // spread the answers across banks where we can
    this.answers = [];
    for (const pick of all) {
      if (this.answers.length >= n) break;
      if (this.answers.some((a) => a.b === pick.b) && this.answers.length < this.banks.length) continue;
      this.answers.push({ ...pick, id: String(1000 + ((rng() * 8999) | 0)).padStart(4, '0'), found: false });
    }
    for (const pick of all) if (this.answers.length < n && !this.answers.some((a) => a.d === pick.d)) this.answers.push({ ...pick, id: String((rng() * 9999) | 0).padStart(4, '0'), found: false });
    this.known = false;
    const spot = B.takeWall(([x, y]) => !B.inWing(x, y)) || B.takeWall();
    const w = onWall(spot[0], spot[1], spot[2], 1.45);
    this.lines = this.answers.map((a) => `#${a.id} .... ${a.b.letter}-${a.d.num}`);
    const paper = plane(0.4, 0.5, new THREE.MeshPhongMaterial({ map: paperTex(['WORKERS ON ICE', ...this.lines], { title: 'INTAKE LOG', seed: 91 }), shininess: 5 }));
    paper.position.copy(w.pos);
    paper.rotation.y = w.yaw;
    ctx.add(paper);
    this.log = w.pos;
  }
  get found() { return this.answers.filter((a) => a.found).length; }
  get solved() { return this.found >= this.answers.length; }
  interactables() {
    if (this.solved) return [];
    const out = [];
    if (!this.known) out.push({ pos: this.log, range: 1.8, minFacing: 0.5, tap: true, label: 'READ THE INTAKE LOG', use: () => {
      this.known = true;
      this.ctx.G.audio.tick();
      UI.note('INTAKE LOG \u2014 WORKERS ON ICE', this.lines.map((l) => l.replace(/ \.+ /, ' \u2192 ')).join('   '), 'Find their drawers in the freezer banks and pull them out. Leave the others shut.');
    } });
    for (const b of this.banks) for (const d of b.drawers) {
      if (d.tried) continue;
      out.push({ pos: d.pos, range: 2, minFacing: 0.95, aim: true, hold: 0.9, tick: 'clank', noise: 6, label: `HOLD \u2014 PULL OUT DRAWER ${b.letter}-${d.num}`, use: () => this.pull(b, d) });
    }
    return out;
  }
  pull(b, d) {
    const G = this.ctx.G, a = this.answers.find((x) => x.d === d);
    d.tried = true;
    d.target = 1.35;
    G.audio.clank(d.pos, 0.7);
    G.audio.burst(G.audio.sfx, { type: 'highpass', f: 3000, dur: 0.6, vol: 0.15, a: 0.05 }); // the cold coming out
    if (a) {
      a.found = true;
      G.audio.squelch(0.5);
      UI.message(this.solved ? 'That\u2019s every name on the log. The release is signed in somebody\u2019s blood.' : `Worker #${a.id}. The toe tag matches. ${this.answers.length - this.found} more on the log.`, 3.5);
      if (this.solved) { G.audio.powerOn(d.pos); G.noise(d.pos, 22, true, 'work'); }
      return;
    }
    // the wrong drawer. whoever is in it isn't finished
    setTimeout(() => {
      if (G.state !== 'play') return;
      G.audio.jumpscare(0.45);
      G.audio.moan(d.pos);
      G.scare = 1;
      G.flash = 0.4;
      G.player.shake = 0.8;
      d.target = 0;
      setTimeout(() => G.audio.clank(d.pos, 1), 250);
      G.noise(d.pos, 18, true, 'other');
      UI.message('Wrong drawer. Something in there moved.', 3.5);
    }, 650);
  }
  update(dt) {
    for (const b of this.banks) for (const d of b.drawers) {
      d.open += (d.target - d.open) * Math.min(1, dt * (d.target ? 5 : 14));
      d.grp.position.z = d.open;
    }
  }
  goals() {
    if (this.solved) return [];
    if (!this.known) return [this.log];
    return this.answers.filter((a) => !a.found).map((a) => a.d.pos);
  }
  line() {
    if (this.solved) return null;
    if (!this.known) return 'DRAWERS: FIND THE INTAKE LOG';
    return 'DRAWERS ' + this.answers.map((a) => (a.found ? '\u2713' : `${a.b.letter}-${a.d.num}`)).join(' ');
  }
  title() { return `FIND THE WORKERS ON ICE \u2014 <b>${this.found}/${this.answers.length}</b>`; }
  liftMsg() { return 'THE MORGUE RELEASE ISN\u2019T SIGNED \u2014 FIND THE WORKERS IN THE INTAKE LOG'; }
  solve() { this.load({ ...this.save(), found: this.answers.map(() => true) }); }
  save() { return { known: this.known, found: this.answers.map((a) => a.found), tried: this.banks.map((b) => b.drawers.map((d) => d.tried)) }; }
  load(s) {
    this.known = s.known;
    s.tried.forEach((row, bi) => row.forEach((t, di) => { const d = this.banks[bi] && this.banks[bi].drawers[di]; if (d) d.tried = t; }));
    s.found.forEach((f, i) => { const a = this.answers[i]; if (f && a) { a.found = true; a.d.target = a.d.open = 1.35; a.d.grp.position.z = 1.35; } });
  }
}

// ---------- the drains: three sluice gates ----------
class Sluices {
  constructor(ctx) {
    const { G, B, mats, add } = ctx;
    this.kind = 'sluices';
    this.gates = true;
    this.ctx = ctx;
    this.wheels = [];
    const usedRooms = new Set();
    for (let i = 0; i < 3; i++) {
      const spot = B.takeWall(([x, y, , ri]) => !B.inWing(x, y) && !usedRooms.has(ri) && G.L.dist[y * G.L.W + x] > ctx.maxDist * 0.25) || B.takeWall(([x, y]) => !B.inWing(x, y));
      if (!spot) continue;
      usedRooms.add(spot[3]);
      const w = onWall(spot[0], spot[1], spot[2], 1.2, 0.15);
      const g = new THREE.Group();
      const gate = P.mesh(new THREE.BoxGeometry(1.1, 1.4, 0.12), mats.rust[0]);
      gate.position.set(0, -0.5, -0.1);
      const wheel = new THREE.Group();
      const rim = P.mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 18), mats.rust[2]);
      wheel.add(rim);
      for (let k = 0; k < 3; k++) { const sp = P.mesh(new THREE.BoxGeometry(0.56, 0.035, 0.035), mats.rust[2], false); sp.rotation.z = (k * Math.PI) / 3; wheel.add(sp); }
      wheel.position.z = 0.1;
      g.add(gate, wheel);
      const lbl = plane(0.4, 0.14, new THREE.MeshBasicMaterial({ map: plainTex(128, 44, (gg) => { gg.fillStyle = '#c8b030'; gg.fillRect(0, 0, 128, 44); gg.fillStyle = '#111'; gg.font = 'bold 22px "Courier New", monospace'; gg.textAlign = 'center'; gg.fillText('SLUICE ' + (i + 1), 64, 30); }).tex }));
      lbl.position.set(0, 0.48, 0.02);
      g.add(lbl);
      g.position.copy(w.pos);
      g.rotation.y = w.yaw;
      add(g);
      this.wheels.push({ obj: wheel, pos: w.pos.clone(), open: false });
    }
    this.level = 1;
  }
  get opened() { return this.wheels.filter((w) => w.open).length; }
  get solved() { return this.opened >= this.wheels.length; }
  update(dt) {
    // the water goes down as the gates open
    const want = 1 - this.opened / Math.max(1, this.wheels.length);
    this.level += (want - this.level) * Math.min(1, dt * 0.4);
    const B = this.ctx.B;
    this.ctx.G.waterLevel = this.level;
    if (B.water) { B.water.position.y = 0.02 + 0.1 * this.level; B.water.material.opacity = 0.25 + 0.63 * this.level; B.water.visible = this.level > 0.03; }
    for (const w of this.wheels) if (w.turning > 0) { w.turning -= dt; w.obj.rotation.z -= dt * 4; }
  }
  interactables() {
    return this.wheels.filter((w) => !w.open).map((w) => ({ pos: w.pos, range: 1.7, minFacing: 0.4, hold: 3, label: 'HOLD — WRENCH THE SLUICE OPEN', tick: 'clank', noise: 11,
      use: () => {
        w.open = true;
        w.turning = 1.2;
        const G = this.ctx.G;
        G.audio.gateSlide(w.pos);
        G.noise(w.pos, 16, true);
        if (this.solved) UI.message('Last gate open. The water under the lift is draining.', 4.5);
        else UI.message(`The gate’s open. ${this.wheels.length - this.opened} more.`, 3);
      } }));
  }
  goals() { return this.solved ? [] : this.wheels.filter((w) => !w.open).map((w) => w.pos); }
  line() { return this.solved ? null : `SLUICES ${this.opened}/${this.wheels.length}`; }
  title() { return `DRAIN THE SUMP — SLUICES <b>${this.opened}/${this.wheels.length}</b>`; }
  liftMsg() { return 'THE LIFT SUMP IS FLOODED — OPEN THE SLUICES'; }
  solve() { this.load({ open: this.wheels.map(() => true) }); }
  save() { return { open: this.wheels.map((w) => w.open) }; }
  load(s) { s.open.forEach((v, i) => { if (this.wheels[i]) this.wheels[i].open = v; }); this.level = 1 - this.opened / Math.max(1, this.wheels.length); }
}

// ---------- administration: a manager's keycard, in one of the managers' desks ----------
const DESK_JUNK = [
  'A drawer full of signed overtime slips. Nobody was ever paid for them.',
  'A bottle, nearly empty, and a framed photo turned face down.',
  'Staff files. Every one is stamped REASSIGNED in red.',
  'A box of brass tags, blank, waiting to be stamped with names.',
  'A memo: HEADCOUNT MUST BE MAINTAINED. It is signed by the Foreman.',
  'Nothing but a cheap pen and a lot of dried blood in the corners.',
];
class Keycard {
  constructor(ctx) {
    const { G, B, mats, rng, add } = ctx;
    this.kind = 'keycard';
    this.gates = true;
    this.ctx = ctx;
    this.desks = [];
    const n = 5;
    for (let i = 0; i < n; i++) {
      const t = B.takeTile(([x, y, ri]) => G.L.rooms[ri].type === 'office' && !B.inWing(x, y)) || B.takeTile(([x, y]) => !B.inWing(x, y));
      if (!t) break;
      const x = tileCenter(t[0]), z = tileCenter(t[1]);
      const d = P2.desk(mats, rng);
      const yaw = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      add(d, x, z, yaw);
      B.colliders.push({ x0: x - 0.8, z0: z - 0.8, x1: x + 0.8, z1: z + 0.8, hunters: true });
      // a brass nameplate: MANAGER
      const plate = plane(0.3, 0.07, new THREE.MeshBasicMaterial({ map: plainTex(128, 30, (g) => { g.fillStyle = '#9a7a30'; g.fillRect(0, 0, 128, 30); g.fillStyle = '#201408'; g.font = 'bold 18px "Courier New", monospace'; g.textAlign = 'center'; g.fillText('MANAGER', 64, 22); }).tex }));
      plate.position.set(0, 0.8, 0.36);
      plate.rotation.x = -0.4;
      d.add(plate);
      this.desks.push({ obj: d, pos: new THREE.Vector3(x, 0.8, z), searched: false, has: false, junk: DESK_JUNK[i % DESK_JUNK.length] });
    }
    rng.pick(this.desks).has = true;
    this.found = false;
  }
  get solved() { return this.found; }
  interactables() {
    if (this.found) return [];
    return this.desks.filter((d) => !d.searched).map((d) => ({ pos: d.pos, range: 1.6, minFacing: 0.35, hold: 2, label: 'HOLD — GO THROUGH THE DRAWERS', tick: 'clank', noise: 7,
      use: () => {
        d.searched = true;
        this.ctx.G.audio.clank(d.pos, 0.5);
        if (d.has) { this.found = true; this.ctx.G.audio.pickup(); UI.message('A keycard, under some letters. MANAGEMENT — ALL FLOORS.', 5); }
        else UI.message(d.junk, 3.5);
      } }));
  }
  goals() { return this.found ? [] : this.desks.filter((d) => !d.searched).map((d) => d.pos); }
  line() { return this.found ? 'KEYCARD ✓' : `DESKS ${this.desks.filter((d) => d.searched).length}/${this.desks.length}`; }
  title() { return this.found ? 'KEYCARD FOUND — THE LIFT WILL TAKE IT' : 'FIND THE MANAGER’S KEYCARD — SEARCH THE DESKS'; }
  liftMsg() { return 'LOCKED — MANAGEMENT KEYCARD REQUIRED'; }
  solve() { this.load({ ...this.save(), found: true }); }
  save() { return { found: this.found, searched: this.desks.map((d) => d.searched), has: this.desks.findIndex((d) => d.has) }; }
  load(s) { this.found = s.found; s.searched.forEach((v, i) => { if (this.desks[i]) this.desks[i].searched = v; }); this.desks.forEach((d, i) => (d.has = i === s.has)); }
}

// ---------- the deep freeze: the cage key, hung up with the meat ----------
class MeatKey {
  constructor(ctx) {
    const { G, B, mats, rng, add } = ctx;
    this.kind = 'meatkey';
    this.gates = true;
    this.ctx = ctx;
    this.sides = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t = B.takeTile(([x, y, ri]) => ['racks', 'hanging', 'blast', 'dock'].includes(G.L.rooms[ri].type) && !B.inWing(x, y)) || B.takeTile(([x, y]) => !B.inWing(x, y));
      if (!t) break;
      const x = tileCenter(t[0]) + (rng() - 0.5) * 0.5, z = tileCenter(t[1]) + (rng() - 0.5) * 0.5;
      const c = P.makeCarcass(mats, rng, rng() < 0.6);
      c.position.set(x, WALL_H, z);
      add(c);
      // wrapped in plastic, with a paper tag
      const wrap = P.mesh(new THREE.CapsuleGeometry(0.3, 0.9, 3, 8), P2.p2mats(mats).wrap, false);
      wrap.position.set(x, WALL_H - 1.55, z);
      add(wrap);
      const tag = plane(0.12, 0.16, new THREE.MeshBasicMaterial({ map: plainTex(48, 64, (g) => { g.fillStyle = '#d8d0b0'; g.fillRect(0, 0, 48, 64); g.fillStyle = '#300'; g.font = 'bold 14px monospace'; g.fillText('#' + (100 + ((rng() * 900) | 0)), 4, 30); }).tex, side: THREE.DoubleSide }));
      tag.position.set(x + 0.32, 1.3, z);
      add(tag);
      B.swingers.push(c);
      B.colliders.push({ x0: x - 0.32, z0: z - 0.32, x1: x + 0.32, z1: z + 0.32, hunters: false });
      this.sides.push({ obj: c, wrap, pos: new THREE.Vector3(x, 1.1, z), searched: false, has: false, alive: false });
    }
    const order = rng.shuffle(this.sides.slice());
    if (order[0]) order[0].has = true;
    if (order[1]) order[1].alive = true; // one of them is not what it looks like
    this.found = false;
  }
  get solved() { return this.found; }
  interactables() {
    if (this.found) return [];
    return this.sides.filter((c) => !c.searched).map((c) => ({ pos: c.pos, range: 1.5, minFacing: 0.35, hold: 2.5, label: 'HOLD — CUT OPEN THE WRAPPING', tick: 'squelch', noise: 6,
      use: () => {
        c.searched = true;
        c.wrap.visible = false;
        const G = this.ctx.G;
        G.audio.tear();
        if (c.has) { this.found = true; G.audio.pickup(); UI.message('A key, frozen inside it. CAGE — LIFT 2.', 4.5); }
        else if (c.alive) {
          // it was never meat
          G.audio.shriek(c.pos);
          G.scare = Math.max(G.scare, 1);
          G.flash = 0.6;
          c.obj.userData.swing.v += 1.2;
          G.noise(c.pos, 22, true);
          UI.message('Something under the plastic moves. A man, frozen blue. He’s still alive.', 4.5);
        } else UI.message(['Frozen meat. Just meat. You think.', 'Ribs, fat, ice. No key.', 'Somebody wrote a name on the inside of the plastic.'][(Math.random() * 3) | 0], 3);
      } }));
  }
  goals() { return this.found ? [] : this.sides.filter((c) => !c.searched).map((c) => c.pos); }
  line() { return this.found ? 'CAGE KEY ✓' : `CARCASSES ${this.sides.filter((c) => c.searched).length}/${this.sides.length}`; }
  title() { return this.found ? 'CAGE KEY FOUND — THE LIFT WILL OPEN' : 'FIND THE CAGE KEY — IT WAS HUNG UP WITH THE MEAT'; }
  liftMsg() { return 'THE LIFT CAGE IS PADLOCKED — FIND THE KEY'; }
  solve() { this.load({ ...this.save(), found: true }); }
  save() { return { found: this.found, searched: this.sides.map((c) => c.searched), has: this.sides.findIndex((c) => c.has) }; }
  load(s) { this.found = s.found; s.searched.forEach((v, i) => { const c = this.sides[i]; if (c && v) { c.searched = true; c.wrap.visible = false; } }); this.sides.forEach((c, i) => (c.has = i === s.has)); }
}

// ---------- stunning: the warm bolt gun ----------
// a captive-bolt gun on a hook on the wall: the steel barrel, the black cap, the grip, the chain it hangs by
function boltGun(mats) {
  const g = new THREE.Group(), steel = mats.steel || mats.darkMetal;
  const body = P.mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.36, 12), steel, false); g.add(body);
  const cap = P.mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.07, 12), new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.6 }), false); cap.position.y = 0.2; g.add(cap);
  const muzzle = P.mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.05, 10), steel, false); muzzle.position.y = -0.2; g.add(muzzle);
  const grip = P.mesh(new THREE.BoxGeometry(0.04, 0.14, 0.05), new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.8 }), false); grip.position.set(0, 0.08, 0.06); grip.rotation.x = 0.4; g.add(grip);
  for (let i = 0; i < 4; i++) { const l = P.mesh(new THREE.TorusGeometry(0.018, 0.005, 4, 8), mats.chain, false); l.position.y = 0.27 + i * 0.03; l.rotation.y = i % 2 ? Math.PI / 2 : 0; g.add(l); }
  return g;
}
class Bolts {
  constructor(ctx) {
    const { B, mats, rng, add, G } = ctx;
    this.kind = 'bolts';
    this.gates = true;
    this.ctx = ctx;
    this.guns = [];
    for (let i = 0; i < 5; i++) {
      const spot = B.takeWall(([x, y]) => G.L.dist[y * G.L.W + x] > ctx.maxDist * 0.2 && !B.inWing(x, y)) || B.takeWall();
      if (!spot) break;
      const w = onWall(spot[0], spot[1], spot[2], 1.45);
      const gun = boltGun(mats); gun.position.copy(w.pos); gun.position.y = 1.45; gun.rotation.y = w.yaw; add(gun);
      const hook = P.mesh(new THREE.TorusGeometry(0.03, 0.007, 5, 10, Math.PI * 1.3), mats.darkMetal, false); hook.position.copy(w.pos); hook.position.y = 1.82; hook.rotation.y = w.yaw; add(hook);
      this.guns.push({ obj: gun, pos: new THREE.Vector3(w.pos.x, 1.45, w.pos.z), felt: false, warm: false });
    }
    const pick = this.guns[Math.floor(rng() * this.guns.length)]; if (pick) pick.warm = true;
    this.carry = false;
    this.fired = false;
    this.latch = B.lift.pos.clone().setY(1.1);
  }
  get solved() { return this.fired; }
  interactables() {
    if (this.fired) return [];
    const out = [];
    for (const g of this.guns) {
      if (g.felt || this.carry) continue;
      out.push({ pos: g.pos, range: 1.5, minFacing: 0.35, hold: 0.9, label: 'HOLD — FEEL THE BOLT GUN', use: () => {
        g.felt = true;
        const G = this.ctx.G;
        if (g.warm) { this.carry = true; g.obj.visible = false; G.audio.pickup(); UI.message('This one is warm. Someone has used it tonight. It still has a bolt in it.', 4.5); }
        else { G.audio.clank(g.pos, 0.3); UI.message(['Cold. The cap is seized.', 'Cold, and the barrel is full of rust.', 'Cold. Someone has filed the bolt down to nothing.', 'Cold.'][(Math.random() * 4) | 0], 2.5); }
      } });
    }
    if (this.carry) out.push({ pos: this.latch, range: 2.2, minFacing: 0.3, hold: 0.8, label: 'HOLD — PUT A BOLT THROUGH THE LATCH', use: () => this.fire() });
    else out.push({ pos: this.latch, range: 2.2, minFacing: 0.3, label: 'THE LATCH IS JAMMED SOLID' });
    return out;
  }
  fire() {
    const G = this.ctx.G;
    this.fired = true; this.carry = false;
    G.audio.boltHit(this.latch); G.audio.clank(this.latch, 1);
    G.flash = Math.max(G.flash, 0.4); G.scare = Math.max(G.scare, 0.4);
    G.noise(this.latch, 40, true); // everyone on the floor heard that
    UI.message('The bolt goes through the latch with a crack like a gunshot. The gate is free. And he heard it.', 5);
  }
  goals() { return this.fired ? [] : this.carry ? [this.latch] : this.guns.filter((g) => !g.felt).map((g) => g.pos); }
  line() { return this.fired ? null : this.carry ? 'BOLT GUN ✓ — THE LATCH' : `BOLT GUNS ${this.guns.filter((g) => g.felt).length}/${this.guns.length}`; }
  title() { return this.carry ? 'PUT A BOLT THROUGH THE LIFT LATCH' : 'FIND THE BOLT GUN THAT STILL WORKS'; }
  liftMsg() { return this.carry ? 'THE LATCH IS JAMMED — USE THE BOLT GUN ON IT' : 'THE LIFT LATCH IS JAMMED — ONE OF THE BOLT GUNS STILL WORKS'; }
  solve() { this.load({ ...this.save(), fired: true, carry: false }); }
  save() { return { felt: this.guns.map((g) => g.felt), warm: this.guns.findIndex((g) => g.warm), carry: this.carry, fired: this.fired }; }
  load(s) {
    this.guns.forEach((g, i) => { g.warm = i === s.warm; g.felt = !!s.felt[i]; if (g.felt && g.warm) g.obj.visible = false; });
    this.carry = s.carry; this.fired = s.fired;
  }
}

// ---------- the quiet line: the crank went up the line ----------
class Hooks {
  constructor(ctx) {
    const { G, B, mats, rng, add } = ctx;
    this.kind = 'hooks';
    this.gates = true;
    this.ctx = ctx;
    this.bodies = [];
    for (let i = 0; i < 5; i++) {
      const t = B.takeTile(([x, y, ri]) => ['line', 'hanging', 'pit'].includes(G.L.rooms[ri].type) && !B.inWing(x, y)) || B.takeTile(([x, y]) => !B.inWing(x, y));
      if (!t) break;
      const x = tileCenter(t[0]) + (rng() - 0.5) * 0.5, z = tileCenter(t[1]) + (rng() - 0.5) * 0.5;
      const c = P.makeCarcass(mats, rng, true);
      c.position.set(x, WALL_H, z);
      add(c);
      B.swingers.push(c);
      B.colliders.push({ x0: x - 0.3, z0: z - 0.3, x1: x + 0.3, z1: z + 0.3, hunters: false });
      this.bodies.push({ obj: c, pos: new THREE.Vector3(x, 1.3, z), searched: false, has: false });
    }
    const pick = this.bodies[Math.floor(rng() * this.bodies.length)]; if (pick) pick.has = true;
    this.carry = false;
    this.done = false;
    this.brake = B.lift.pos.clone().setY(1.1);
  }
  get solved() { return this.done; }
  interactables() {
    if (this.done) return [];
    const out = [];
    if (!this.carry) for (const b of this.bodies) {
      if (b.searched) continue;
      out.push({ pos: b.pos, range: 1.5, minFacing: 0.35, hold: 2.0, label: 'HOLD — SEARCH THE BODY ON THE HOOK', tick: 'squelch', noise: 7, use: () => {
        b.searched = true;
        const G = this.ctx.G;
        G.audio.tear(); b.obj.userData.swing.v += 0.6;
        if (b.has) { this.carry = true; G.audio.pickup(); UI.message('Pushed up inside him, under the ribs: the crank handle off the lift brake.', 4.5); }
        else UI.message(['Nothing. He is still warm.', 'Nothing in him but what should be.', 'Empty pockets. Empty everything.'][(Math.random() * 3) | 0], 2.5);
      } });
    }
    if (this.carry) out.push({ pos: this.brake, range: 2.2, minFacing: 0.3, hold: 2.2, label: 'HOLD — WIND THE CHAIN BRAKE OFF', tick: 'screech', noise: 9, use: () => this.wind() });
    else out.push({ pos: this.brake, range: 2.2, minFacing: 0.3, label: 'THE CHAIN BRAKE IS ON — THE CRANK IS GONE' });
    return out;
  }
  wind() {
    const G = this.ctx.G;
    this.done = true; this.carry = false;
    G.audio.clank(this.brake, 1); G.audio.chainRattle?.(this.brake);
    UI.message(this.ctx.chain ? 'The brake comes off with a bang that runs up the shaft.' : 'The brake comes off with a bang that runs up the shaft. The lift is free.', 4.5);
  }
  goals() { return this.done ? [] : this.carry ? [this.brake] : this.bodies.filter((b) => !b.searched).map((b) => b.pos); }
  line() { return this.done ? null : this.carry ? 'CRANK ✓ — THE BRAKE' : `BODIES ${this.bodies.filter((b) => b.searched).length}/${this.bodies.length}`; }
  title() { return this.carry ? 'WIND THE BRAKE OFF THE LIFT' : 'FIND THE CRANK — IT WENT UP THE LINE ON ONE OF THEM'; }
  liftMsg() { return this.carry ? 'THE CHAIN BRAKE IS ON — USE THE CRANK' : 'THE CHAIN BRAKE IS ON AND THE CRANK IS MISSING'; }
  solve() { this.load({ ...this.save(), done: true, carry: false }); }
  save() { return { searched: this.bodies.map((b) => b.searched), has: this.bodies.findIndex((b) => b.has), carry: this.carry, done: this.done }; }
  load(s) { this.bodies.forEach((b, i) => { b.has = i === s.has; b.searched = !!s.searched[i]; }); this.carry = s.carry; this.done = s.done; }
}

// ---------- the hiring office: the notice that was left for you ----------
export const NOTICE = {
  title: 'NOTICE OF EMPLOYMENT',
  head: 'HOLLOW PINES MEATWORKS \u00B7 NIGHT SHIFT \u00B7 NEW HIRE',
  body: [
    'To the new hire.',
    'Workers have been going missing at Hollow Pines. Night shift, every one of them. The company says they quit. Their families say they never came home. Nobody has been down to look. That is why you were hired: find out what happened to them.',
    'You start tonight. Take the service lift behind this office all the way up to the top of the building: RECEIVING. That is where the line begins.',
    'The line runs downward, and so will you. On every floor there are workers who did not finish their shift. Each of them swallowed a brass ID tag. The lift will not go down a floor until it has been fed their tags. Cut them out. Feed the lift. Go down. Do it again.',
    'Some floors will have other work for you: power, pressure, paperwork. See to it.',
    'You will not be alone on the floors. The Foreman is still on shift. Do not let him see you.',
    'When the line at the bottom has stopped, you may clock out.',
  ],
  sign: 'Your employer,',
  from: 'UNKNOWN',
};
// the hiring office: a tape left on a desk, and the old television to play it on (tape.js). The lift won't go until
// you've watched it. (Still 'notice' inside, so saves and the guide carry on as before.)
class Notice {
  constructor(ctx) {
    const { G, B, mats, rng, add, maxDist } = ctx;
    this.kind = 'notice';
    this.gates = true;
    this.ctx = ctx;
    this.read = false;
    this.got = false;
    // the tape: as far from the lift as the office goes, on a desk under the only lamp still working
    const W = G.L.W;
    const t = B.takeTile(([x, y]) => G.L.dist[y * W + x] > maxDist * 0.65 && !B.inWing(x, y)) || B.takeTile(([x, y]) => !B.inWing(x, y));
    const x = tileCenter(t[0]), z = tileCenter(t[1]);
    const d = P2.desk(mats, rng);
    add(d, x, z, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]));
    B.colliders.push({ x0: x - 0.8, z0: z - 0.8, x1: x + 0.8, z1: z + 0.8, hunters: true });
    const tape = vhsTape();
    tape.rotation.y = 0.35;
    tape.position.set(0.1, 0.765, 0.05);
    d.add(tape);
    this.tape = tape;
    const lamp = new THREE.PointLight(0xffe0a0, 3, 4, 1.6);
    lamp.position.set(0, 1.8, 0);
    d.add(lamp);
    this.pos = new THREE.Vector3(x, 0.8, z);
    // the television: on its cart, somewhere between the desk and the lift, glowing blue
    const tt = B.takeTile(([tx, ty]) => { const k = G.L.dist[ty * W + tx]; return k > maxDist * 0.2 && k < maxDist * 0.6 && !B.inWing(tx, ty) && Math.hypot(tx - t[0], ty - t[1]) > 2; }) || B.takeTile(([tx, ty]) => !B.inWing(tx, ty));
    const tx = tileCenter(tt[0]), tz = tileCenter(tt[1]);
    const player = G.tape;
    const tv = tvSet(player ? player.tex : null);
    add(tv, tx, tz, rng() * Math.PI * 2);
    tv.userData.live = true; // (its screen changes: keep it out of the static bake)
    B.colliders.push({ x0: tx - 0.45, z0: tz - 0.45, x1: tx + 0.45, z1: tz + 0.45, hunters: true });
    const glow = new THREE.PointLight(0x6080ff, 1.2, 3.5, 1.8);
    glow.position.set(0, 1.0, 0.6);
    tv.add(glow);
    this.tv = tv;
    this.tvPos = new THREE.Vector3(tx, 1.0, tz);
  }
  get solved() { return this.read; }
  interactables() {
    if (this.read) return [];
    const G = this.ctx.G;
    if (!this.got) return [{ pos: this.pos, range: 1.6, minFacing: 0.3, tap: true, label: 'PICK UP THE TAPE', use: () => {
      this.got = true;
      this.tape.visible = false;
      G.audio.pickup();
      UI.message('A video tape. STAFF - WATCH THIS. There was a television back there.', 4);
    } }];
    return [{ pos: this.tvPos, range: 1.8, minFacing: 0.3, tap: true, label: 'PUT THE TAPE IN THE TV', use: () => {
      G.audio.clank(this.tvPos, 0.25);
      const done = () => { this.read = true; };
      if (G.playTape) G.playTape(done); else done();
    } }];
  }
  goals() { return this.read ? [] : [this.got ? this.tvPos : this.pos]; }
  line() { return null; }
  title() { return this.read ? 'TAPE WATCHED' : this.got ? 'PLAY THE TAPE ON THE TELEVISION' : 'FIND THE TAPE LEFT FOR YOU'; }
  liftMsg() { return 'THE LIFT IS LOCKED UNTIL YOU HAVE WATCHED THE TAPE'; }
  solve() { this.load({ read: true, got: true }); }
  save() { return { read: this.read, got: this.got }; }
  load(s) { this.read = !!s.read; this.got = !!s.got || this.read; this.tape.visible = !this.got; }
}

// the finale's last job: the master override in line control. Everything before it in the chain has to be done; it
// unlocks the lift, and every light and siren on the floor comes on with it: both of them know where you are now
// ---------- B10: what's been taken off the machines, hidden round the three storeys ----------
// Tool chests on the factory floor and below, filing cabinets upstairs: one of each part in one of them. You carry
// one thing at a time: pick up another and you put down what you had (and he hears it hit the floor).
export const PARTS = {
  wheel: { name: 'HANDWHEEL', job: 'valves', fit: 'FIT THE HANDWHEEL', gone: 'THE HANDWHEEL IS GONE', found: 'A valve handwheel. Somebody took it off on purpose.', at: [0, 1] },
  bkey: { name: 'ISOLATOR KEY', job: 'breakers', fit: 'TURN THE KEY', gone: 'A KEY SWITCH. NO KEY IN IT', found: 'A key on a brass tag: ISOLATORS.', at: [1] },
  skey: { name: 'DESK KEY', job: 'override', fit: 'UNLOCK THE DESK', gone: 'THE DESK IS LOCKED', found: 'A key on a leather fob: LINE SUPERVISOR.', at: [1, 2] },
  cutters: { name: 'BOLT CUTTERS', job: 'chained', fit: 'CUT THE CHAIN', gone: 'THE LEVER IS CHAINED DOWN', found: 'Bolt cutters. The jaws are sticky.', at: [2] },
};
const JUNK = ['Invoices. A dead mouse.', 'Rags and a jar of screws.', 'Time sheets, every one signed in the same hand.', 'A photograph of the line, 1971. Everyone is smiling.', 'Empty.', 'Rubber gloves. Something has dried in the fingers.', 'Fuse wire, a torch with no batteries.', 'A lunch box. Still full.'];
function toolChest(mats) {
  const g = new THREE.Group(), red = new THREE.MeshPhongMaterial({ color: 0x4a1612, shininess: 25, specular: 0x222222 });
  const body = P.mesh(new THREE.BoxGeometry(0.72, 1.0, 0.46), red); body.position.y = 0.5; g.add(body);
  for (let i = 0; i < 5; i++) { const d = P.mesh(new THREE.BoxGeometry(0.66, 0.012, 0.01), mats.darkMetal, false); d.position.set(0, 0.2 + i * 0.17, 0.235); g.add(d); const hd = P.mesh(new THREE.BoxGeometry(0.3, 0.025, 0.03), mats.darkMetal, false); hd.position.set(0, 0.26 + i * 0.17, 0.245); g.add(hd); }
  const lid = P.mesh(new THREE.BoxGeometry(0.74, 0.06, 0.48), mats.darkMetal); lid.position.y = 1.03; g.add(lid);
  return g;
}
function partMesh(id, mats) {
  const g = new THREE.Group(), red = new THREE.MeshPhongMaterial({ color: 0x8a1a10, shininess: 40 }), brass = new THREE.MeshPhongMaterial({ color: 0xb08a3a, shininess: 80, specular: 0x886622 });
  if (id === 'wheel') { const w = P.mesh(new THREE.TorusGeometry(0.17, 0.022, 6, 16), red); w.rotation.x = Math.PI / 2; g.add(w); for (let k = 0; k < 3; k++) { const sp = P.mesh(new THREE.BoxGeometry(0.34, 0.02, 0.02), mats.darkMetal, false); sp.rotation.y = (k * Math.PI) / 3; g.add(sp); } g.position.y = 0.03; }
  else if (id === 'cutters') { for (const s of [-1, 1]) { const h = P.mesh(new THREE.BoxGeometry(0.62, 0.03, 0.03), red); h.position.set(0.1, 0.02, s * 0.05); h.rotation.y = s * 0.12; g.add(h); } const jaw = P.mesh(new THREE.BoxGeometry(0.14, 0.04, 0.09), mats.darkMetal); jaw.position.set(-0.26, 0.02, 0); g.add(jaw); }
  else { const ring = P.mesh(new THREE.TorusGeometry(0.03, 0.007, 5, 10), brass, false); ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; g.add(ring); const bit = P.mesh(new THREE.BoxGeometry(0.09, 0.01, 0.018), brass, false); bit.position.set(0.07, 0.01, 0); g.add(bit); const tag = P.mesh(new THREE.BoxGeometry(0.07, 0.006, 0.045), id === 'skey' ? new THREE.MeshPhongMaterial({ color: 0x3a2014 }) : brass, false); tag.position.set(-0.06, 0.006, 0); g.add(tag); g.scale.setScalar(1.6); }
  return g;
}
class Parts {
  constructor(ctx) {
    const { G, B, mats, rng, add } = ctx;
    this.kind = 'parts'; this.gates = false; this.ctx = ctx; ctx.parts = this;
    const L = G.L, reg = (x, y) => (L.region ? L.region[y * L.W + x] : 0);
    this.boxes = []; this.items = []; this.hand = null; this.fitted = new Set();
    for (const [r, n] of [[0, 4], [1, 5], [2, 4]]) for (let i = 0; i < n; i++) {
      const spot = B.takeWall(([x, y]) => reg(x, y) === r && !B.inWing(x, y));
      if (!spot) break;
      const cab = r === 1, w = onWall(spot[0], spot[1], spot[2], 0, cab ? 0.31 : 0.24);
      const o = cab ? P2.filingCabinet(mats, rng, rng() < 0.5) : toolChest(mats);
      add(o, w.pos.x, w.pos.z, w.yaw);
      B.colliders.push({ x0: w.pos.x - 0.38, z0: w.pos.z - 0.38, x1: w.pos.x + 0.38, z1: w.pos.z + 0.38, hunters: false });
      const fx = -Math.sin(w.yaw + Math.PI), fz = -Math.cos(w.yaw + Math.PI); // (out from the wall)
      this.boxes.push({ pos: new THREE.Vector3(w.pos.x, 0.9, w.pos.z), drop: new THREE.Vector3(w.pos.x + fx * 0.6, 0, w.pos.z + fz * 0.6), cab, region: r, searched: false, item: null, junk: JUNK[(rng() * JUNK.length) | 0] });
    }
    for (const id of Object.keys(PARTS)) {
      const free = this.boxes.filter((b) => !b.item), ok = free.filter((b) => PARTS[id].at.includes(b.region));
      const b = (ok.length ? ok : free)[(rng() * (ok.length || free.length)) | 0];
      if (!b) continue;
      b.item = id;
      const m = partMesh(id, mats); m.visible = false; add(m, b.drop.x, b.drop.z); m.userData.y0 = m.position.y;
      this.items.push({ id, mesh: m, state: 'hidden', pos: b.drop.clone() });
    }
  }
  get solved() { return true; }
  item(id) { return this.items.find((it) => it.id === id); }
  place(it, pos) { it.pos.copy(pos); it.pos.y = 0; it.mesh.position.set(pos.x, it.mesh.userData.y0, pos.z); it.mesh.visible = true; it.state = 'out'; }
  take(it) {
    const G = this.ctx.G;
    if (this.hand) { // what you had goes down where you stand
      const pl = G.player, d = new THREE.Vector3(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw)).multiplyScalar(0.5).add(pl.pos);
      this.place(this.hand, d);
      G.audio.clank(d, 0.9); G.noise(d, 11, false, 'other');
    }
    it.state = 'hand'; it.mesh.visible = false; this.hand = it;
    G.audio.pickup();
  }
  // a job that needed a part has it now
  fit(kind) {
    const it = this.hand;
    if (!it || PARTS[it.id].job !== kind) return;
    it.state = 'used'; this.hand = null; this.fitted.add(kind);
    this.ctx.G.audio.clank(this.ctx.G.player.pos, 0.7);
    this.show(kind);
  }
  show(kind) { const p = this.ctx.G.puzzles && this.ctx.G.puzzles.get(kind); if (p && p.fitted) p.fitted(); }
  interactables() {
    const out = [];
    for (const b of this.boxes) if (!b.searched) out.push({ pos: b.pos, range: 1.6, minFacing: 0.35, hold: 1.6, label: b.cab ? 'HOLD \u2014 GO THROUGH THE CABINET' : 'HOLD \u2014 GO THROUGH THE TOOL CHEST', tick: 'clank', noise: 6,
      use: () => {
        b.searched = true;
        const it = b.item && this.item(b.item);
        if (it && it.state === 'hidden') { this.place(it, b.drop); UI.message(PARTS[it.id].found, 4); }
        else UI.message(b.junk, 3);
      } });
    for (const it of this.items) if (it.state === 'out') out.push({ pos: new THREE.Vector3(it.pos.x, 0.3, it.pos.z), range: 1.7, minFacing: 0.3, label: (this.hand ? 'SWAP FOR THE ' : 'PICK UP THE ') + PARTS[it.id].name, use: () => this.take(it) });
    return out;
  }
  goals() { return []; }
  line() { return ''; }
  title() { return ''; }
  liftMsg() { return ''; }
  update(dt) { for (const it of this.items) if (it.state === 'out') it.mesh.rotation.y += dt * 0.0; }
  save() { return { hand: this.hand ? this.hand.id : null, boxes: this.boxes.map((b) => b.searched), items: this.items.map((it) => [it.id, it.state, +it.pos.x.toFixed(2), +it.pos.z.toFixed(2)]), fitted: [...this.fitted] }; }
  load(s) {
    s.boxes.forEach((v, i) => { if (this.boxes[i]) this.boxes[i].searched = v; });
    for (const [id, state, x, z] of s.items) { const it = this.item(id); if (!it) continue; it.state = state; it.mesh.visible = false; if (state === 'out') this.place(it, new THREE.Vector3(x, 0, z)); }
    this.hand = s.hand ? this.item(s.hand) : null;
    this.fitted = new Set(s.fitted);
    for (const k of this.fitted) this.show(k);
  }
}
// ---------- B10: the lift's lever, chained down and padlocked ----------
class Chained {
  constructor(ctx) {
    const { B, mats } = ctx;
    this.kind = 'chained'; this.gates = true; this.ctx = ctx; this.cut = false;
    const lever = B.lift.lever, at = lever ? lever.getWorldPosition(new THREE.Vector3()) : B.lift.pos.clone().setY(1.2);
    this.pos = at.clone();
    const g = new THREE.Group(), steel = mats.darkMetal;
    for (let i = 0; i < 9; i++) { const l = P.mesh(new THREE.TorusGeometry(0.035, 0.009, 5, 10), mats.chain || steel, false); l.position.set(Math.sin(i * 0.7) * 0.07, -0.05 - i * 0.045, Math.cos(i * 0.7) * 0.07); l.rotation.set(i % 2 ? Math.PI / 2 : 0, i * 0.7, 0); g.add(l); }
    const lock = P.mesh(new THREE.BoxGeometry(0.07, 0.08, 0.03), new THREE.MeshPhongMaterial({ color: 0xb08a3a, shininess: 80 })); lock.position.set(0.05, -0.42, 0.06); g.add(lock);
    const shackle = P.mesh(new THREE.TorusGeometry(0.025, 0.006, 5, 10, Math.PI), steel, false); shackle.position.set(0.05, -0.38, 0.06); g.add(shackle);
    g.position.copy(at); B.group.add(g);
    this.obj = g;
  }
  get solved() { return this.cut; }
  fitted() { this.cut = true; this.obj.visible = false; this.ctx.G.audio.clank(this.pos, 1); UI.message('The chain drops off the lever.', 3); }
  interactables() { return []; }
  goals() { return this.cut ? [] : [this.pos]; }
  line() { return this.cut ? 'THE LEVER \u2713' : 'THE LEVER'; }
  title() { return this.cut ? '' : 'THE LIFT LEVER IS CHAINED DOWN'; }
  liftMsg() { return 'THE LEVER IS CHAINED DOWN'; }
  solve() { if (!this.cut) { this.cut = true; this.obj.visible = false; } }
  save() { return { cut: this.cut }; }
  load(s) { if (s.cut) this.solve(); }
}

class Override {
  constructor(ctx) {
    const { G, B, mats, add } = ctx;
    this.kind = 'override';
    this.gates = true;
    this.ctx = ctx;
    this.done = false;
    const L = G.L;
    // the room furthest from the lift (not behind the shutter, so it's the long way back)
    const far = L.rooms.map((r, ri) => [L.dist[r.cy * L.W + r.cx], ri]).filter(([d, ri]) => ri > 0 && d > 0 && !(L.wing && L.wing.rooms.includes(ri))).sort((a, b) => b[0] - a[0]);
    const room = far.length ? far[0][1] : -1;
    const spot = B.takeWall(([, , , ri]) => ri === room) || B.takeWall(([x, y]) => !B.inWing(x, y)) || B.takeWall();
    const w = onWall(spot[0], spot[1], spot[2], 0, 0.36);
    const g = new THREE.Group();
    // a control desk against the wall: steel cabinet, sloped panel, gauges, three dead lamps, and the big lever
    const steel = mats.darkMetal, paint = new THREE.MeshPhongMaterial({ color: 0x3a3f36, shininess: 25, specular: 0x222222 });
    const cab = P.mesh(new THREE.BoxGeometry(1.5, 0.95, 0.6), paint); cab.position.set(0, 0.475, 0); g.add(cab);
    const top = P.mesh(new THREE.BoxGeometry(1.5, 0.06, 0.5), steel); top.position.set(0, 1.06, -0.06); top.rotation.x = 0.45; g.add(top);
    const back = P.mesh(new THREE.BoxGeometry(1.5, 0.8, 0.12), paint); back.position.set(0, 1.45, -0.26); g.add(back);
    const kick = P.mesh(new THREE.BoxGeometry(1.46, 0.08, 0.04), steel, false); kick.position.set(0, 0.05, 0.3); g.add(kick);
    for (let i = 0; i < 3; i++) {
      const gauge = P.mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 20), steel, false);
      gauge.rotation.x = Math.PI / 2; gauge.position.set(-0.5 + i * 0.25, 1.52, -0.19); g.add(gauge);
      const face = P.mesh(new THREE.CircleGeometry(0.075, 20), new THREE.MeshPhongMaterial({ color: 0xd8d0b8 }), false);
      face.position.set(-0.5 + i * 0.25, 1.52, -0.173); g.add(face);
      const needle = P.mesh(new THREE.BoxGeometry(0.006, 0.065, 0.004), new THREE.MeshBasicMaterial({ color: 0x8a0a06 }), false);
      needle.position.set(-0.5 + i * 0.25, 1.52, -0.17); needle.rotation.z = -1.1 + i * 0.6; g.add(needle);
    }
    this.lamps = [];
    for (let i = 0; i < 4; i++) {
      const l = P.mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x401008, fog: false }), false);
      l.position.set(-0.55 + i * 0.12, 1.09, 0.03); g.add(l); this.lamps.push(l);
    }
    const sign = plainTex(256, 64, (g2) => {
      g2.fillStyle = '#c8a020'; g2.fillRect(0, 0, 256, 64);
      for (let k = -2; k < 18; k++) { g2.fillStyle = '#111'; g2.beginPath(); g2.moveTo(k * 16, 0); g2.lineTo(k * 16 + 8, 0); g2.lineTo(k * 16 - 4, 12); g2.lineTo(k * 16 - 12, 12); g2.fill(); }
      g2.fillStyle = '#111'; g2.font = 'bold 22px "Courier New", monospace'; g2.textAlign = 'center';
      g2.fillText('LINE CONTROL', 128, 34); g2.font = 'bold 15px "Courier New", monospace'; g2.fillText('MASTER OVERRIDE \u00B7 LIFT', 128, 54);
    });
    const plate = plane(0.7, 0.175, new THREE.MeshBasicMaterial({ map: sign.tex })); plate.position.set(0, 1.78, -0.195); g.add(plate);
    // the lever: up (locked) to down (unlocked)
    const lever = new THREE.Group(); lever.position.set(0.45, 1.12, 0.02);
    const pivot = P.mesh(new THREE.BoxGeometry(0.14, 0.1, 0.1), steel, false); lever.add(pivot);
    const arm = P.mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 8), steel, false); arm.position.y = 0.21; lever.add(arm);
    const grip = P.mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), new THREE.MeshPhongMaterial({ color: 0x8a0a06, shininess: 40 }), false);
    grip.rotation.z = Math.PI / 2; grip.position.y = 0.43; lever.add(grip);
    lever.rotation.x = -0.5; g.add(lever);
    this.lever = lever;
    g.position.set(w.pos.x, 0, w.pos.z);
    g.rotation.y = w.yaw;
    add(g);
    this.pos = new THREE.Vector3(w.pos.x, 1.1, w.pos.z);
  }
  get solved() { return this.done; }
  interactables() {
    if (this.done) return [];
    return [{ pos: this.pos, range: 2, minFacing: 0.35, hold: 5, tick: 'clank', noise: 16, label: 'HOLD \u2014 MASTER OVERRIDE: UNLOCK THE LIFT', use: () => this.fire() }];
  }
  show() {
    this.lever.rotation.x = 0.9;
    for (const l of this.lamps) l.material.color.setHex(0x30ff50);
  }
  fire() {
    const G = this.ctx.G;
    this.done = true;
    this.show();
    G.audio.breaker(this.pos);
    G.audio.powerOn(this.pos);
    G.audio.siren(true);
    G.noise(this.pos, 999, true);
    G.scare = 1;
    G.flash = 0.5;
    G.player.shake = 1;
    G.frenzy = true;
    G.frenzyT = 4; // a head start: then they know where you are
    for (const l of G.B.lamps) if (l.state === 'dead') l.state = 'flicker';
    // (no line: every light comes on, every alarm goes off, and they come)
  }
  goals() { return this.done ? [] : [this.pos]; }
  line() { return this.done ? null : 'MASTER OVERRIDE: LINE CONTROL'; }
  title() { return 'UNLOCK THE LIFT \u2014 THE MASTER OVERRIDE'; }
  liftMsg() { return 'LOCKED \u2014 THE MASTER OVERRIDE IS IN LINE CONTROL'; }
  solve() { this.done = true; this.show(); this.ctx.G.frenzy = true; }
  save() { return { done: this.done }; }
  load(s) { if (s.done) { this.done = true; this.show(); this.ctx.G.frenzy = true; this.ctx.G.audio.siren(true); } }
}

const KINDS = { parts: Parts, chained: Chained, override: Override, notice: Notice, fuses: Fuses, keypad: Keypad, scale: Scale, valves: Valves, breakers: Breakers, drawers: Drawers, sluices: Sluices, keycard: Keycard, meatkey: MeatKey, bolts: Bolts, hooks: Hooks };

export class Puzzles {
  constructor(G, kinds, seed) {
    const rng = makeRng(seed);
    const B = G.B;
    let maxDist = 0;
    for (const d of G.L.dist) if (d > maxDist) maxDist = d;
    const add = (o, x, z, yaw) => { if (x !== undefined) { o.position.x = x; o.position.z = z; } if (yaw !== undefined) o.rotation.y = yaw; B.group.add(o); return o; };
    const ctx = { G, B, mats: G.mats, rng, add, maxDist, chain: !!G.D.chain };
    // keypad first: it needs walls on its own side of the shutter before anything else takes them
    const order = kinds.slice().sort((a, b) => (a === 'keypad' ? -1 : b === 'keypad' ? 1 : 0)).sort((a, b) => (a === 'parts' ? -1 : b === 'parts' ? 1 : 0)); // (the parts first: the jobs look them up)
    this.list = order.map((k) => new KINDS[k](ctx, k === 'fuses' ? (G.depth >= 5 ? 4 : 3) : undefined));
    // the finale's chain: listed (and done) in the floor's own order, and every one of them holds the lift
    this.chain = ctx.chain;
    if (this.chain) { this.list.sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind)); for (const p of this.list) if (p.kind !== 'parts') p.gates = true; }
  }
  // the job you're on (the chain only): the first one not done
  get step() { return this.chain ? this.list.find((p) => p.gates && !p.solved) || null : null; }
  // a job whose machine is missing a part (B10): until it's fitted, that's all there is to do there
  need(p) {
    const parts = this.get('parts');
    if (!parts) return null;
    const id = Object.keys(PARTS).find((k) => PARTS[k].job === p.kind);
    if (!id || parts.fitted.has(p.kind)) return null;
    const its = p.interactables(), pos = its.length ? its[0].pos : p.goals()[0];
    if (!pos) return null;
    const has = parts.hand && parts.hand.id === id;
    return [{ pos, range: 2.2, minFacing: 0.3, hold: has ? 1.4 : undefined, tick: 'clank', label: has ? 'HOLD \u2014 ' + PARTS[id].fit : PARTS[id].gone, use: has ? () => parts.fit(p.kind) : undefined }];
  }
  get ready() { return this.list.every((p) => !p.gates || p.solved); }
  interactables() {
    if (!this.chain) return this.list.flatMap((p) => p.interactables());
    const cur = this.step;
    let past = false;
    return this.list.flatMap((p) => {
      if (!p.gates) return p.interactables();
      if (p === cur) { past = true; return this.need(p) || p.interactables(); }
      if (!past) return p.interactables();
      // a job further down the chain: what's written can be read now; the rest is dead, and says what comes first
      const why = cur.kind === 'fuses' ? 'NO POWER' : 'IT WON\u2019T BUDGE'; // (it doesn't say why: you work that out)
      return p.interactables().map((it) => (/^READ /.test(it.label) ? it : { pos: it.pos, range: it.range, minFacing: it.minFacing, label: why }));
    });
  }
  goals() {
    if (!this.chain) return this.list.flatMap((p) => p.goals());
    const st = this.step, parts = this.get('parts');
    if (!st) return [];
    const id = parts && Object.keys(PARTS).find((k) => PARTS[k].job === st.kind);
    if (id && !parts.fitted.has(st.kind) && !(parts.hand && parts.hand.id === id)) { const it = parts.item(id); return it && it.state === 'out' ? [it.pos] : parts.boxes.filter((b) => !b.searched).map((b) => b.pos); }
    return st.goals();
  }
  lines() { return (this.chain ? [this.step].filter(Boolean) : this.list).map((p) => p.line()).filter(Boolean); }
  get parts() { return this.get('parts'); }
  blocker() { return this.chain ? this.step : this.list.find((p) => p.gates && !p.solved) || null; }
  update(dt) { for (const p of this.list) if (p.update) p.update(dt); }
  dispose() { for (const p of this.list) if (p.dispose) p.dispose(); }
  get(kind) { return this.list.find((p) => p.kind === kind); }
  // dev mode: every job on the floor done at once
  solveAll() { for (const p of this.list) if (!p.solved && p.solve) p.solve(); }
  save() { return this.list.map((p) => ({ kind: p.kind, s: p.save() })); }
  load(arr) { for (const { kind, s } of arr || []) { const p = this.get(kind); if (p && s) p.load(s); } }
}
