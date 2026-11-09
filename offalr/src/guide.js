// Telling you where to go without holding your hand: an objective line that always says what's next,
// Q to listen (the flies swell up and a red arrow shows the way through the maze), and a shift briefing
// that teaches each mechanic and each puzzle the first time it matters.
import { findPath, lineOfSight, tileCenter } from './level.js';
import * as UI from './ui.js';

const BRIEF = {
  notice: 'You answered an advertisement. They said there would be a tape waiting for you down here, in the office.\n\nFind it and play it on the television. Hold Q to listen: the red arrow shows the way.',
  start: 'Your shift has started. Somewhere on this floor are dead workers with brass ID tags inside them. The lift will not move without their tags.\n\nHold Q to listen. The flies get louder, and the red arrow shows the way to whatever you need next.',
  adrenaline: 'One hit from the hook kills you.\n\nIf you find a syringe, press R to use it: a few seconds of running that never runs out of breath.',
  near: 'That’s one of them. Look at the body and hold E to cut the tag out.\n\nIt takes a few seconds. It makes no sound he can hear, but keep an eye on the doors.',
  quiet: 'Keep moving. Crouch (C) to stay quiet. Running is the loudest thing you can do.\n\nHe sees the torch: switch it off (F) when he’s near. If you hear metal dragging on concrete, that’s him patrolling.',
  close: 'HE’S CLOSE.\n\nBreak his line of sight first, then get into a locker (E). When he comes near, hold SPACE to hold your breath. If he watches you climb in, it will not save you.',
  back: 'That’s every tag. Hold Q: the arrow points to whatever is still stopping the lift, or to the lift itself.\n\nWalk in, feed the panel (E), then pull the lever.',
  lever: 'Pull the lever and the gate comes down. It takes three seconds, and everything on this floor hears it.\n\nIf he gets in before it closes, he’s in the lift with you.',
  fuses: 'This floor has no power, and the lift won’t run without it.\n\nThe fuses were hidden in the body bags. Search the bags (hold E), then slot the fuses into the fuse box. Q shows the way.',
  keypad: 'A steel shutter seals off part of this floor, and some of the dead are behind it.\n\nThe workers scrawled the code on the walls before he got them. Find all four numbers, then type them into the keypad by the shutter. A wrong code sets off an alarm.',
  scale: 'The lift’s counterweight is jammed. The freight scale beside the lift needs enough weight on it.\n\nCuts of meat hang around the floor, each tagged in kilograms. You can carry two at a time. Load the scale until it reads the target or more.',
  valves: 'Steam pressure has locked the lift’s brake. Somewhere on this floor is a note with the release order.\n\nFind it, then turn the hissing valves in exactly that order. The wrong valve vents everything, very loudly.',
  drawers: 'This is the morgue. Some of the missing workers were filed away in the freezer banks.\n\nFind the intake log, then pull out the drawers it lists (look straight at the drawer and hold E). Leave every other drawer shut. Not everything in them is finished.',
  sluices: 'The drains. The lift sits in a flooded sump, and it will not move until it is drained.\n\nFind the three sluice gates and wrench them open (hold E). Wading is loud: every step in the water splashes. It gets quieter as the water goes down.',
  keycard: 'Administration. The lift up here only answers to management.\n\nOne of the managers’ desks has a keycard in it. Go through the drawers (hold E). Every desk you search rattles.',
  meatkey: 'The deep freeze. The lift cage is padlocked, and the key was hung up with the meat.\n\nCut open the wrapped carcasses (hold E) until you find it. It is cold enough down here that you get your breath back slower.',
  override: 'The line has stopped and the brake is off. One thing left: the master override in line control, at the far end of the floor.\n\nHold E on the lever. Everything will go off at once, and both of them will know where you are. Then run for the lift.',
  breakers: 'The power is on and the line is running again.\n\nPull the three kill switches to stop it. One of them is in the wing behind the shutter. The first one sets off the alarm, and they will hear every one.',
  hooks: 'The lift’s chain brake is wound on, and the crank that winds it off is gone.\n\nIt went up the line, pushed inside one of the bodies on the hooks. Search them (hold E). Then wind the brake off at the lift.',
  bottom: 'This is the bottom. The lift here goes UP, and nothing on this floor works.\n\nSeven jobs: power, the shutter, the counterweight, the line, the steam, the brake crank, the override. Each one needs the one before it. TAB lists them. Notes and writing on the walls can be read any time.',
};

// a puzzle's title cut down to its first clause and its count: 'LOAD THE SCALE — AT LEAST <b>32 KG</b>' -> 'LOAD THE SCALE <b>32 KG</b>'
function short(t) {
  const [head, tail = ''] = t.split(' \u2014 ');
  const b = tail.match(/<b>.*?<\/b>/);
  return head + (b ? ' ' + b[0] : '');
}

export class Guide {
  constructor(G) {
    this.G = G;
    this.shown = new Set();
    this.reset();
  }

  newRun() { this.shown.clear(); this.reset(); }

  reset() {
    this.queue = [];
    this.pathT = 0;
    this.way = null;
    this.briefT = 0;
    this.objKey = '';
    UI.$('brief').classList.remove('on');
    UI.$('compass').classList.remove('on');
  }

  brief(id) {
    if (!this.G.hints || this.shown.has(id)) return;
    this.shown.add(id);
    if (this.briefT > 0) { this.queue.push(id); return; }
    this.showBrief(id);
  }
  showBrief(id) {
    if (!BRIEF[id]) return;
    UI.$('brief').classList.add('on');
    UI.typewrite(UI.$('briefText'), BRIEF[id], 90);
    this.briefT = id === 'start' ? 20 : 15;
    this.G.audio.chime();
  }

  // the task sheet: every step of the floor in order, ticked off, the one you're on lit
  taskSheet(now) {
    const G = this.G, pl = G.player, B = G.B, pz = G.puzzles;
    const have = pl.tags, fed = B.lift.inserted, need = G.D.tags;
    const rows = [];
    if (need) rows.push({ text: 'CUT THE TAGS OUT OF THE DEAD', count: `${have + fed}/${need}`, done: have + fed >= need });
    for (const p of pz.list) rows.push({ text: short(p.title()).replace(/<[^>]+>/g, ''), sub: p.solved ? '' : (p.line() || ''), done: !!p.solved });
    if (G.D.finale) rows.push({ text: 'GET TO THE LIFT. GO UP.', done: false });
    else {
      if (need) rows.push({ text: 'FEED THE TAGS TO THE LIFT', count: `${fed}/${need}`, done: fed >= need });
      rows.push({ text: 'PULL THE LEVER IN THE LIFT', done: G.lift.phase === 'closing' || G.lift.phase === 'sealed' });
    }
    const first = rows.find((r) => !r.done);
    if (first) first.now = true;
    const extra = [];
    if (!G.inv.built && G.depth > 1) extra.push('OPTIONAL \u00B7 FIND THE BOLT GUN: IT IS ON THIS FLOOR SOMEWHERE');
    extra.push('<kbd>Q</kbd> HOLD TO LISTEN FOR THE WAY \u00B7 <kbd>F</kbd> TORCH \u00B7 <kbd>C</kbd> CROUCH');
    const key = now + rows.map((r) => r.text + r.count + r.done + r.sub).join('|') + extra.join('|');
    if (key === this.taskKey) return;
    this.taskKey = key;
    UI.tasks(`${G.info.label} \u00B7 ${G.info.name}`, rows, extra);
  }

  // the shortest walk to any of the goals
  route(goals) {
    const { L, player: pl } = this.G;
    let best = null;
    for (const g of goals) {
      const path = findPath(L, pl.pos.x, pl.pos.z, g.x, g.z, true); // you can use the crouchways
      if (!path) continue;
      let len = 0, px = pl.pos.x, pz = pl.pos.z;
      for (const p of path) { len += Math.hypot(p.x - px, p.z - pz); px = p.x; pz = p.z; }
      len += Math.hypot(g.x - px, g.z - pz);
      if (!best || len < best.len) best = { path, len, goal: g };
    }
    return best;
  }

  update(dt) {
    const G = this.G, pl = G.player, B = G.B, L = G.L, pz = G.puzzles;
    const have = pl.tags, fed = B.lift.inserted, need = G.D.tags, all = have + fed >= need;
    const blocker = pz.blocker(), done = all && !blocker;
    const lift = { x: tileCenter(L.alcove.x), z: tileCenter(L.alcove.y) };

    // listening
    const compass = UI.$('compass');
    if (G.listening) {
      this.pathT -= dt;
      if (this.pathT <= 0) {
        this.pathT = 0.35;
        let goals = done ? [lift] : [...(all ? [] : B.corpses.filter((c) => !c.harvested).map((c) => c.pos)), ...pz.goals()];
        if (have > 0 && all) goals.push(lift); // bank what you're carrying
        if (!goals.length) goals = [lift];
        this.way = this.route(goals);
      }
      const r = this.way;
      if (r) {
        // aim at the furthest waypoint you can actually see, so the arrow leads round corners
        let wp = r.goal;
        if (r.len > 2.5 && r.path.length) {
          wp = r.path[0];
          for (let i = Math.min(r.path.length - 1, 5); i >= 0; i--) if (lineOfSight(L, pl.pos.x, pl.pos.z, r.path[i].x, r.path[i].z)) { wp = r.path[i]; break; }
        }
        const dx = wp.x - pl.pos.x, dz = wp.z - pl.pos.z;
        const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw), rx = Math.cos(pl.yaw), rz = -Math.sin(pl.yaw);
        const a = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
        UI.$('needle').style.transform = `rotate(${a}rad)`;
        const what = r.goal === lift ? 'THE LIFT' : B.corpses.some((c) => c.pos === r.goal) ? 'A BODY' : 'THE JOB';
        UI.$('compassD').textContent = `${what} · ${Math.max(1, Math.round(r.len))} M`;
        compass.classList.add('on');
      }
    } else compass.classList.remove('on');

    // the objective line: only the one thing to do next. Everything else is on the task sheet (TAB).
    let obj;
    const phase = G.lift.phase;
    if (phase === 'closing' || phase === 'sealed') obj = '<b>HOLD ON</b>';
    else if (phase === 'opening') obj = 'THE GATE IS OPENING';
    else if (G.D.finale && !blocker) obj = '<b>GET TO THE LIFT. GO UP.</b>';
    else if (!blocker && fed >= need) obj = '<b>PULL THE LEVER</b>';
    else if (!blocker && all) obj = pl.inLift ? '<b>FEED THE TAGS</b> TO THE LIFT' : '<b>GET BACK TO THE LIFT</b>';
    else if (!all) obj = `CUT THE TAGS  <b>${have + fed}/${need}</b>`;
    else obj = short(blocker.title());
    const hint = phase === 'open' && G.floorTime < 20 ? '<small><kbd>TAB</kbd> TASKS</small>' : ''; // the first moments of a floor only
    const key = obj + hint;
    if (key !== this.objKey) { this.objKey = key; UI.$('objective').innerHTML = UI.keys(key); }
    if (G.tasksOpen) this.taskSheet(obj);

    // the briefing
    if (G.depth === 1 && G.floorTime > 2.5) this.brief('start');
    if (G.depth === 1 && G.floorTime > 3) this.brief('adrenaline');
    if (G.D.chain && G.floorTime > 2.5) this.brief('bottom');
    if (G.floorTime > 3) for (const p of pz.chain ? [pz.step].filter(Boolean) : pz.list) this.brief(p.kind); // (the finale: each job as you come to it)
    if (this.shown.has('start') && !this.shown.has('near')) {
      if (B.corpses.some((c) => !c.harvested && Math.hypot(c.pos.x - pl.pos.x, c.pos.z - pl.pos.z) < 5)) this.brief('near');
    }
    if (G.runTags >= 1 && !all) this.brief('quiet');
    if (G.hunters.some((h) => h.state === 'chase' || (h.pos.distanceTo(pl.pos) < 13 && lineOfSight(L, h.pos.x, h.pos.z, pl.pos.x, pl.pos.z)))) this.brief('close');
    if (all && fed < need && need > 0) this.brief('back');
    if (fed >= need && !blocker && phase === 'open' && !G.D.finale) this.brief('lever');
    if (this.briefT > 0) {
      this.briefT -= dt;
      if (this.briefT <= 0) {
        UI.$('brief').classList.remove('on');
        if (this.queue.length) setTimeout(() => { if (this.G.state === 'play' && this.queue.length && this.briefT <= 0) this.showBrief(this.queue.shift()); }, 600);
      }
    }
  }
}
