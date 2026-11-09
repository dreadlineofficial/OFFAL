// All sound is synthesised with Web Audio: no files. Positional sounds use HRTF panners, so with
// headphones you can hear exactly where the Foreman's hook is scraping, and which way the flies are.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    // phones: half the sample rate (half the work for every sound) and bigger buffers, so it never runs dry and crackles
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)(this.lite ? { latencyHint: 'playback', sampleRate: 22050 } : undefined));
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 5;
    comp.knee.value = 8;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.connect(comp).connect(this.out).connect(ctx.destination);
    this.dry = this.gain(1, comp); // sounds made right at you (your own locker door): never muffled
    this.muffled = false;
    this.sfx = this.gain(1, this.muffle);
    this.amb = this.gain(0.9, this.muffle);
    this.mus = this.gain(0.75, this.muffle);
    // a long concrete reverb that everything bleeds into
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.lite ? this.impulse(1.1, 2.6) : this.impulse(3.2, 2.2); // a long reverb is the heaviest thing here; phones get a short one
    this.verb.connect(this.muffle);
    const send = this.gain(0.45, this.verb);
    this.sfx.connect(send);
    this.mus.connect(this.gain(0.25, this.verb));
    const len = ctx.sampleRate * (this.lite ? 1.5 : 3);
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0), b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
    }
    this.dist = this.curve(60);
    // jumpscares skip the compressor (it would soften them) and go through their own hard clipper
    this.shockClip = ctx.createWaveShaper();
    this.shockClip.curve = this.curve(4);
    this.shockOut = this.gain(this.volume, ctx.destination);
    this.shockClip.connect(this.shockOut);
    this.fliesBus = this.gain(1, this.sfx);
    this.startAmbience();
  }

  setVolume(v) {
    this.volume = v;
    if (this.out) { this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); this.shockOut.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  }
  // listening: the flies come up out of the mix
  setListen(on) { if (this.ctx) this.fliesBus.gain.setTargetAtTime(on ? 3.2 : 1, this.t, 0.15); }
  get t() { return this.ctx.currentTime; }

  // ---------- building blocks ----------
  gain(v, to) { const g = this.ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }
  filter(type, f, q = 1, to) { const n = this.ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; if (to) n.connect(to); return n; }
  osc(type, f, to) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; if (to) o.connect(to); return o; }
  noise(brown = false, to) {
    const s = this.ctx.createBufferSource();
    s.buffer = brown ? this.brown : this.white;
    s.loop = true;
    s.loopStart = 0;
    if (to) s.connect(to);
    return s;
  }
  curve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((3 + k) * x * 20 * Math.PI) / 180 / (Math.PI + k * Math.abs(x)); }
    return c;
  }
  impulse(dur, decay) {
    const rate = this.ctx.sampleRate, len = rate * dur, buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  env(g, t0, a, peak, d) {
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  pan(pos, ref = 1.5, roll = 1.1, to = this.sfx) {
    const p = this.ctx.createPanner();
    p.panningModel = this.lite ? 'equalpower' : 'HRTF'; // HRTF is too heavy for phones: it crackles
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = roll;
    p.maxDistance = 100;
    this.place(p, pos);
    p.connect(to);
    return p;
  }
  place(p, pos) {
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y || 1.2; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y || 1.2, pos.z);
  }
  listen(pos, fwd) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
      l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }
  setMuffle(on) {
    if (!this.ctx || this.muffled === !!on) return;
    this.muffled = !!on;
    const f = this.muffle.frequency;
    f.cancelScheduledValues(this.t);
    f.setValueAtTime(f.value, this.t);
    f.setTargetAtTime(on ? 700 : 20000, this.t + (on ? 0.25 : 0), on ? 0.15 : 0.05); // in: after the door shuts. out: at once
  }

  // a short noise burst through a filter
  burst(to, { type = 'bandpass', f = 1000, q = 1, dur = 0.1, vol = 0.2, a = 0.004, brown = false, sweep = null, at = 0 }) {
    const t = this.t + at, g = this.gain(0, to), fl = this.filter(type, f, q, g), n = this.noise(brown, fl);
    if (sweep) { fl.frequency.setValueAtTime(sweep[0], t); fl.frequency.exponentialRampToValueAtTime(sweep[1], t + dur); }
    this.env(g, t, a, vol, dur);
    n.start(t, Math.random() * 2);
    n.stop(t + a + dur + 0.05);
  }
  tone(to, { type = 'sine', f = 100, f2 = null, dur = 0.2, vol = 0.3, a = 0.005, at = 0 }) {
    const t = this.t + at, g = this.gain(0, to), o = this.osc(type, f, g);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    this.env(g, t, a, vol, dur);
    o.start(t);
    o.stop(t + a + dur + 0.05);
  }

  // ---------- ambience ----------
  startAmbience() {
    // the menu drone (the heavy one) on its own bus, so roaming can sit it right down
    this.droneBus = this.gain(1, this.amb);
    const lp = this.filter('lowpass', 150, 0.7, this.gain(0.12, this.droneBus));
    this.droneA = this.osc('sawtooth', 41.2, lp);
    this.droneB = this.osc('sawtooth', 41.75, lp);
    this.droneA.start();
    this.droneB.start();
    const lfo = this.osc('sine', 0.05), lg = this.gain(60);
    lfo.connect(lg).connect(lp.frequency);
    lfo.start();
    this.noise(true, this.filter('lowpass', 240, 0.5, this.gain(0.2, this.droneBus))).start();
    // the ringing in your ears
    const tin = this.gain(0.0035, this.droneBus);
    this.osc('sine', 1244, tin).start();
    this.osc('sine', 1251.5, tin).start();
    // roaming: a soft, slow pad (lighter than the menu drone) with a music box over it
    this.roamBus = this.gain(0, this.mus);
    const padF = this.filter('lowpass', 650, 0.5, this.gain(0.02, this.roamBus));
    this.pad = [110, 164.81, 261.63, 329.63].map((f, i) => {
      const o = this.osc('triangle', f, padF);
      o.detune.value = (Math.random() - 0.5) * 8;
      const sw = this.osc('sine', 0.05 + i * 0.023), sg = this.gain(0.4), og = this.gain(0.6);
      o.disconnect(); o.connect(og).connect(padF);
      sw.connect(sg).connect(og.gain);
      o.start(); sw.start();
      return o;
    });
    this.boxT = 3;
    this.mode = 'menu';
    // chase music: a bed of strings sawing away on a tremolo, under a pulse that main code drives (chaseTick)
    this.chaseBus = this.gain(0, this.mus);
    const strings = this.filter('bandpass', 1400, 0.9, this.gain(0.022, this.chaseBus));
    const trem = this.osc('sine', 11), tg = this.gain(0.5), sg = this.gain(0.5);
    trem.connect(tg).connect(sg.gain);
    sg.connect(strings);
    for (const f of [587.3, 622.3, 880, 932.3, 1244.5]) { const o = this.osc('sawtooth', f, sg); o.detune.value = (Math.random() - 0.5) * 18; o.start(); }
    trem.start();
    this.chaseStep = 0;
    this.chaseNext = 0;
    // your own breathing
    this.breathG = this.gain(0, this.sfx);
    this.noise(false, this.filter('bandpass', 900, 0.8, this.breathG)).start();
    this.nextAmb = 2;
  }
  setDepth(depth) {
    if (!this.ctx) return;
    const f = 41.2 * Math.pow(0.97, depth);
    this.droneA.frequency.setTargetAtTime(f, this.t, 2);
    this.droneB.frequency.setTargetAtTime(f * (1.012 + depth * 0.003), this.t, 2);
  }
  // menu: the heavy drone. roam: the drone far back, pad and music box up. ending: everything quiet
  setMode(mode) {
    if (!this.ctx) return;
    this.mode = mode;
    if (mode !== 'ending') this.stopDawn();
    this.chaseLevel = 0;
    const drone = { menu: 1, roam: 0.22, ending: 0 }[mode], roam = { menu: 0, roam: 1, ending: 0 }[mode];
    this.droneBus.gain.setTargetAtTime(drone, this.t, 1.2);
    this.roamBus.gain.setTargetAtTime(roam, this.t, 1.5);
  }
  // being chased: the music cuts out and it's just your heart (main.js beats it)
  setChase(level) {
    if (!this.ctx) return;
    if (this.mode !== 'roam') level = 0;
    if (level === this.chaseLevel) return;
    this.chaseLevel = level;
    this.chaseBus.gain.setTargetAtTime(level ? 1 : 0, this.t, level ? 0.06 : 1.6);
    if (level) { this.chaseNext = this.t + 0.02; this.chaseStep = 0; }
    if (this.mode !== 'roam') return;
    this.roamBus.gain.setTargetAtTime(level ? 0 : 1, this.t, level ? 0.08 : 2.5);
    this.droneBus.gain.setTargetAtTime(level ? 0.08 : 0.22, this.t, level ? 0.08 : 2.5);
  }
  // the chase pulse, scheduled a little ahead on a 160 bpm eighth-note grid
  chaseTick() {
    if (!this.ctx || !this.chaseLevel) return;
    const step = 60 / 160 / 2;
    // D minor, leaning on the flat second: it never resolves
    const bass = [73.4, 73.4, 77.8, 73.4, 73.4, 51.9, 73.4, 65.4];
    while (this.chaseNext < this.t + 0.15) {
      const at = this.chaseNext - this.t, k = this.chaseStep++;
      const bus = this.chaseBus;
      if (k % 2 === 0) { // the kick: on every beat
        this.tone(bus, { f: 95, f2: 38, dur: 0.16, vol: 0.55, at });
        this.burst(bus, { type: 'lowpass', f: 400, dur: 0.03, vol: 0.25, at });
      } else { // metal on the off-beat
        this.burst(bus, { type: 'bandpass', f: 3200 + Math.random() * 1500, q: 9, dur: 0.07, vol: 0.12, at });
      }
      if (k % 8 === 4) this.burst(bus, { type: 'bandpass', f: 900, q: 1.2, dur: 0.12, vol: 0.18, at }); // the snare-ish hit on 3
      // the bass line
      const f = bass[k % 8] * (k % 32 >= 24 ? 1.06 : 1); // and every fourth bar it slips up a semitone
      this.tone(this.filter('lowpass', 520, 3, bus), { type: 'sawtooth', f, dur: step * 0.8, vol: 0.13, at });
      // a stab every two bars
      if (k % 16 === 0) for (const sf of [587.3, 830.6, 1174.7]) this.tone(bus, { type: 'sawtooth', f: sf, f2: sf * 0.94, dur: 0.35, vol: 0.035, at });
      this.chaseNext += step;
    }
  }
  musicBox() {
    // A minor pentatonic, two octaves up, a little out of tune like an old box
    const scale = [880, 1046.5, 1174.7, 1318.5, 1568, 1760, 2093];
    const phrase = 1 + ((Math.random() * 3) | 0);
    let at = 0;
    for (let i = 0; i < phrase; i++) {
      const f = scale[(Math.random() * scale.length) | 0] * (1 + (Math.random() - 0.5) * 0.012);
      const g = this.gain(0, this.roamBus), h = this.gain(0.25, g), t0 = this.t + at;
      for (const o of [this.osc('sine', f, g), this.osc('sine', f * 2.01, h)]) { o.start(t0); o.stop(t0 + 2.4); }
      this.env(g, t0, 0.004, 0.035, 2.2);
      at += 0.35 + Math.random() * 0.5;
    }
  }
  setBreath(level, rate) {
    if (!this.ctx) return;
    const s = 0.5 + 0.5 * Math.sin(this.t * Math.PI * 2 * rate);
    this.breathG.gain.setTargetAtTime(level * 0.06 * s * s, this.t, 0.04);
  }
  // drips, distant metal, things moving in other rooms
  ambienceTick(dt, pos) {
    if (!this.ctx) return;
    this.chaseTick();
    if (this.mode === 'roam' && !this.chaseLevel) {
      this.boxT -= dt;
      if (this.boxT < 0) { this.boxT = 4 + Math.random() * 9; this.musicBox(); }
    }
    this.nextAmb -= dt;
    if (this.nextAmb > 0) return;
    this.nextAmb = 1.5 + Math.random() * 5;
    const r = Math.random(), a = Math.random() * Math.PI * 2;
    const at = (d) => ({ x: pos.x + Math.cos(a) * d, y: 2.6, z: pos.z + Math.sin(a) * d });
    if (r < 0.45) this.drip(at(2 + Math.random() * 6));
    else if (r < 0.7) this.clank(at(14 + Math.random() * 14), 0.5);
    else if (r < 0.88) this.creak(at(8 + Math.random() * 10));
    else this.distantThud(at(20 + Math.random() * 10));
  }

  // ---------- one-shots ----------
  step(kind, wet) {
    const v = kind === 'run' ? 0.22 : kind === 'crouch' ? 0.04 : 0.11;
    this.burst(this.sfx, { f: 700 + Math.random() * 500, q: 1.2, dur: 0.06, vol: v });
    this.tone(this.sfx, { f: 130, f2: 60, dur: 0.07, vol: v * 0.8 });
    if (wet) {
      this.burst(this.sfx, { type: 'lowpass', f: 1500, dur: 0.16, vol: v * 0.9, sweep: [1800, 200], at: 0.02 });
      this.burst(this.sfx, { type: 'highpass', f: 3000, dur: 0.01, vol: v * 0.5, at: 0.07 + Math.random() * 0.05 });
    }
  }
  thud(pos, v) {
    const p = this.pan(pos, 2.5, 1);
    this.tone(p, { f: 75, f2: 32, dur: 0.22, vol: 0.9 * v });
    this.burst(p, { type: 'lowpass', f: 500, dur: 0.09, vol: 0.5 * v });
  }
  squelch(i = 1) {
    const n = 2 + ((Math.random() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const at = k * (0.06 + Math.random() * 0.08);
      this.burst(this.sfx, { type: 'bandpass', f: 600, q: 2.5, dur: 0.15 + Math.random() * 0.2, vol: 0.35 * i, sweep: [300 + Math.random() * 500, 1500 + Math.random() * 1500], at });
      this.burst(this.sfx, { type: 'lowpass', f: 400, dur: 0.2, vol: 0.35 * i, brown: true, at });
    }
    if (Math.random() < 0.6) this.crackle(0.5 * i);
  }
  crackle(v = 0.6) {
    for (let k = 0; k < 4; k++) this.burst(this.sfx, { type: 'highpass', f: 2000 + Math.random() * 2000, dur: 0.008, vol: v * (0.3 + Math.random() * 0.7), at: Math.random() * 0.25 });
  }
  crack() {
    this.burst(this.sfx, { type: 'highpass', f: 1400, dur: 0.02, vol: 0.9 });
    this.burst(this.sfx, { type: 'highpass', f: 900, dur: 0.04, vol: 0.6, at: 0.03 });
    this.tone(this.sfx, { f: 160, f2: 50, dur: 0.12, vol: 0.6 });
  }
  // a foot coming down in standing water
  splash(v = 0.7) {
    this.burst(this.sfx, { type: 'bandpass', f: 900 + Math.random() * 600, q: 0.8, dur: 0.18, vol: 0.18 * v, sweep: [1400, 500] });
    this.burst(this.sfx, { type: 'highpass', f: 2500, dur: 0.08, vol: 0.1 * v, at: 0.04 });
    this.tone(this.sfx, { f: 180, f2: 90, dur: 0.1, vol: 0.06 * v });
  }
  // the captive bolt: a crack of powder, the bolt slamming out on its spring and back
  boltShot() {
    const t = this.t;
    this.burst(this.shockClip, { type: 'lowpass', f: 2400, dur: 0.12, vol: 1.2, a: 0.001 });
    this.burst(this.sfx, { type: 'highpass', f: 1800, dur: 0.05, vol: 0.9, a: 0.001 });
    this.tone(this.shockClip, { f: 140, f2: 45, dur: 0.22, vol: 0.9 });
    this.tone(this.sfx, { type: 'square', f: 900, f2: 300, dur: 0.06, vol: 0.2, at: 0.05 }); // the bolt going back in
    this.burst(this.sfx, { type: 'bandpass', f: 4200, q: 12, dur: 0.4, vol: 0.15, at: 0.02 }); // the barrel ringing
    void t;
  }
  // and what it sounds like when it goes in
  boltHit(pos) {
    const p = this.pan(pos, 3, 0.8);
    this.burst(p, { type: 'lowpass', f: 900, dur: 0.12, vol: 0.9 });
    this.tone(p, { f: 70, f2: 35, dur: 0.3, vol: 0.8 });
    this.growl(pos, 1.2);
  }
  tear() {
    this.burst(this.sfx, { type: 'bandpass', f: 300, q: 3, dur: 0.5, vol: 0.6, sweep: [250, 3200] });
    this.burst(this.sfx, { type: 'lowpass', f: 500, dur: 0.6, vol: 0.5, brown: true });
    this.crackle(0.8);
  }
  pickup() {
    this.tone(this.sfx, { type: 'square', f: 1400, dur: 0.03, vol: 0.05 });
    this.burst(this.sfx, { type: 'highpass', f: 2500, dur: 0.03, vol: 0.15, at: 0.04 });
  }
  tick() {
    this.burst(this.sfx, { type: 'highpass', f: 3000, dur: 0.012, vol: 0.25 });
  }
  heartbeat(v, chase = false) {
    if (chase) {
      // past the compressor, so it pounds; gap shortens as it gets faster
      const out = this.gain(1, this.shockClip);
      this.tone(out, { f: 62, f2: 34, dur: 0.14, vol: 0.9 * v });
      this.burst(out, { type: 'lowpass', f: 180, dur: 0.06, vol: 0.5 * v, brown: true });
      this.tone(out, { f: 55, f2: 30, dur: 0.16, vol: 0.65 * v, at: 0.2 });
      return;
    }
    this.tone(this.sfx, { f: 58, f2: 38, dur: 0.16, vol: v });
    this.tone(this.sfx, { f: 52, f2: 34, dur: 0.18, vol: v * 0.7, at: 0.26 });
  }
  gasp() {
    this.burst(this.sfx, { type: 'bandpass', f: 1100, q: 1.5, dur: 0.45, vol: 0.35, a: 0.05, sweep: [700, 1600] });
  }
  hurt() {
    const g = this.gain(0, this.sfx), bp = this.filter('bandpass', 750, 2, g), o = this.osc('sawtooth', 190, bp);
    o.frequency.exponentialRampToValueAtTime(85, this.t + 0.4);
    this.env(g, this.t, 0.01, 0.25, 0.4);
    o.start();
    o.stop(this.t + 0.5);
    this.squelch(1.4);
    this.crack();
  }
  // what you hear the moment it sees you
  stinger() {
    const t = this.t, g = this.gain(0, this.shockClip), hp = this.filter('highpass', 500, 0.7, g);
    const ws = this.ctx.createWaveShaper();
    ws.curve = this.curve(30);
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.volume * 0.2, t);
    this.out.gain.linearRampToValueAtTime(this.volume, t + 2);
    ws.connect(hp);
    for (const f of [1180, 1250, 1660, 1765, 2350]) {
      const o = this.osc('sawtooth', f, ws), vib = this.osc('sine', 5 + Math.random() * 3), vg = this.gain(f * 0.015);
      vib.connect(vg).connect(o.frequency);
      o.frequency.exponentialRampToValueAtTime(f * 0.72, t + 1.8);
      o.start(t); vib.start(t); o.stop(t + 2.2); vib.stop(t + 2.2);
    }
    this.env(g, t, 0.005, 0.5, 1.9);
    this.tone(this.shockClip, { f: 62, f2: 26, dur: 1.4, vol: 1.3 });
    this.burst(this.shockClip, { f: 3000, q: 0.6, dur: 0.35, vol: 0.9, a: 0.001 });
    this.burst(this.shockClip, { f: 5200, q: 14, dur: 1.2, vol: 1.4, a: 0.001, sweep: [5200, 2400] });
  }
  // the jumpscare
  scream() {
    const t = this.t, g = this.gain(0, this.sfx), ws = this.ctx.createWaveShaper();
    ws.curve = this.dist;
    const hp = this.filter('highpass', 250, 0.7, g);
    ws.connect(hp);
    for (const f of [320, 345, 470, 505, 690, 950]) {
      const o = this.osc('sawtooth', f * 0.7, ws), vib = this.osc('sine', 9 + Math.random() * 6), vg = this.gain(f * 0.05);
      vib.connect(vg).connect(o.frequency);
      o.frequency.exponentialRampToValueAtTime(f * 1.25, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 1.5);
      o.start(t); vib.start(t); o.stop(t + 1.7); vib.stop(t + 1.7);
    }
    const n = this.noise(false, this.filter('bandpass', 2500, 0.8, ws));
    n.start(t);
    n.stop(t + 1.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.015);
    g.gain.setValueAtTime(0.5, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    this.tone(this.sfx, { f: 90, f2: 30, dur: 0.8, vol: 1 });
  }
  // the shock: everything else drops out and this hits at full level with no attack at all
  jumpscare(v = 1) {
    if (!this.ctx) return;
    const t = this.t, len = 0.9 + v * 0.9;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.volume * 0.05, t);
    this.out.gain.setValueAtTime(this.volume * 0.05, t + len * 0.6);
    this.out.gain.linearRampToValueAtTime(this.volume, t + len + 1.5);
    const bus = this.gain(0, this.shockClip);
    bus.gain.setValueAtTime(2.4 * v, t);
    bus.gain.setValueAtTime(2.4 * v, t + len * 0.45);
    bus.gain.exponentialRampToValueAtTime(0.001, t + len);
    const stop = t + len + 0.05;
    // full-band blast
    const n = this.noise(false, this.gain(0.9, bus));
    n.start(t, Math.random());
    n.stop(t + 0.3);
    // the scream: a dissonant cluster of saws with a fast, sick vibrato, sliding down
    const scream = this.filter('highpass', 400, 0.7, this.gain(0.32, bus));
    for (const f of [740, 784, 1046, 1108, 1480, 1568, 2217]) {
      const o = this.osc('sawtooth', f * 1.15, scream), vib = this.osc('sine', 11 + Math.random() * 6), vg = this.gain(f * 0.045);
      vib.connect(vg).connect(o.frequency);
      o.frequency.exponentialRampToValueAtTime(f * 0.62, t + len);
      o.start(t); vib.start(t); o.stop(stop); vib.stop(stop);
    }
    // a throat in it
    const throat = this.gain(0.5, bus), f1 = this.filter('bandpass', 1150, 5, throat), f2 = this.filter('bandpass', 2900, 7, throat);
    const v1 = this.osc('sawtooth', 420);
    v1.connect(f1); v1.connect(f2);
    v1.frequency.linearRampToValueAtTime(610, t + 0.12);
    v1.frequency.exponentialRampToValueAtTime(260, t + len);
    v1.start(t); v1.stop(stop);
    // metal on metal
    const scr = this.filter('bandpass', 4200, 18, this.gain(1.4, bus));
    scr.frequency.exponentialRampToValueAtTime(2600, t + len);
    const sn = this.noise(false, scr);
    sn.start(t); sn.stop(stop);
    // the hit in your chest
    const sub = this.gain(0, bus);
    sub.gain.setValueAtTime(1.2, t);
    sub.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    const s1 = this.osc('sine', 62, sub), s2 = this.osc('square', 41, this.filter('lowpass', 180, 1, sub));
    s1.frequency.exponentialRampToValueAtTime(26, t + 1);
    s1.start(t); s2.start(t); s1.stop(t + 1.2); s2.stop(t + 1.2);
    // a voice: something with a throat shrieking at you from an inch away, its head shaking while it does
    const voice = this.gain(0, bus);
    voice.gain.setValueAtTime(0.0001, t);
    voice.gain.exponentialRampToValueAtTime(1.3, t + 0.02);
    voice.gain.setValueAtTime(1.3, t + len * 0.55);
    voice.gain.exponentialRampToValueAtTime(0.001, t + len);
    const trem = this.gain(0.6, voice), rat = this.osc('square', 23), rg = this.gain(0.4);
    rat.connect(rg).connect(trem.gain);
    rat.frequency.linearRampToValueAtTime(31, t + len);
    const ws = this.ctx.createWaveShaper();
    ws.curve = this.curve(14);
    for (const [f, q, a] of [[880, 5, 1], [1300, 7, 0.8], [2750, 9, 0.7], [3700, 12, 0.45]]) ws.connect(this.filter('bandpass', f, q, this.gain(a, trem)));
    for (const f0 of [415, 422, 640]) {
      const o = this.osc('sawtooth', f0, ws), vib = this.osc('sine', 6 + Math.random() * 3), vg = this.gain(f0 * 0.05);
      vib.connect(vg).connect(o.frequency);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.4, t + 0.14);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.66, t + len);
      o.start(t); vib.start(t); o.stop(stop); vib.stop(stop);
    }
    rat.start(t); rat.stop(stop);
    // and the crack of its jaw going too far
    for (let i = 0; i < 4; i++) this.burst(this.shockClip, { type: 'highpass', f: 1800, dur: 0.012, vol: 1.2 * v, at: 0.16 + i * 0.045 + Math.random() * 0.02 });
  }
  roar(pos) {
    const t = this.t, p = this.pan(pos, 3, 0.8), g = this.gain(0, p), ws = this.ctx.createWaveShaper();
    ws.curve = this.curve(30);
    const bp = this.filter('bandpass', 500, 0.8, g);
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.linearRampToValueAtTime(1100, t + 0.4);
    bp.frequency.linearRampToValueAtTime(350, t + 1.4);
    ws.connect(bp);
    for (const f of [88, 93, 141]) { const o = this.osc('sawtooth', f, ws); o.frequency.linearRampToValueAtTime(f * 0.8, t + 1.4); o.start(t); o.stop(t + 1.6); }
    const n = this.noise(true, ws);
    n.start(t);
    n.stop(t + 1.6);
    this.env(g, t, 0.06, 0.7, 1.4);
  }
  growl(pos, v = 1) {
    const t = this.t, p = this.pan(pos, 2, 1), g = this.gain(0, p), lp = this.filter('lowpass', 420, 2, g);
    const trem = this.osc('sine', 17), tg = this.gain(0.5);
    for (const f of [54, 57.5]) { const o = this.osc('sawtooth', f, lp); o.start(t); o.stop(t + 1.1); }
    const n = this.noise(true, lp);
    n.start(t);
    n.stop(t + 1.1);
    trem.connect(tg).connect(g.gain);
    trem.start(t);
    trem.stop(t + 1.1);
    this.env(g, t, 0.1, 0.5 * v, 0.9);
  }
  sniff(pos) {
    const p = this.pan(pos, 2, 1);
    for (let i = 0; i < 3; i++) this.burst(p, { f: 2600, q: 1.5, dur: 0.09, vol: 0.25, a: 0.03, at: i * 0.17 });
  }
  // the neck, when the head snaps round
  click(pos) {
    const p = this.pan(pos, 2, 1.2);
    for (let i = 0; i < 3; i++) this.burst(p, { type: 'highpass', f: 2500, dur: 0.006, vol: 0.5, at: i * 0.035 + Math.random() * 0.02 });
  }
  whoosh(pos) { this.burst(this.pan(pos), { f: 500, q: 1.5, dur: 0.3, vol: 0.4, sweep: [400, 2200] }); }
  whisper(pos) {
    const p = this.pan(pos, 0.6, 1.5);
    let at = 0;
    for (let i = 0; i < 7 + Math.random() * 6; i++) {
      const d = 0.06 + Math.random() * 0.14;
      this.burst(p, { f: 2000 + Math.random() * 2500, q: 2 + Math.random() * 3, dur: d, vol: 0.18, a: 0.02, at });
      at += d + Math.random() * 0.08;
    }
  }
  drip(pos) {
    const p = this.pan(pos, 1, 1.5);
    this.tone(p, { f: 1500 + Math.random() * 600, f2: 500, dur: 0.06, vol: 0.12 });
  }
  clank(pos, v = 0.5) {
    const p = this.pan(pos, 2, 0.9);
    for (const f of [210, 547, 891, 1340, 1820]) this.tone(p, { type: 'sine', f: f * (0.9 + Math.random() * 0.2), dur: 0.6 + Math.random() * 1.2, vol: v * 0.12, a: 0.002 });
    this.burst(p, { type: 'highpass', f: 1500, dur: 0.02, vol: v * 0.4 });
  }
  creak(pos) {
    const t = this.t, p = this.pan(pos, 2, 1), g = this.gain(0, p), bp = this.filter('bandpass', 700, 12, g);
    const o = this.osc('sawtooth', 35, bp);
    for (let i = 0; i < 12; i++) o.frequency.setValueAtTime(30 + Math.random() * 45, t + i * 0.1);
    this.env(g, t, 0.15, 0.5, 1.1);
    o.start(t);
    o.stop(t + 1.4);
  }
  distantThud(pos) {
    const p = this.pan(pos, 4, 0.6);
    this.tone(p, { f: 55, f2: 30, dur: 0.6, vol: 0.6 });
  }
  distantScream(pos) {
    const t = this.t, p = this.pan(pos, 4, 0.5), g = this.gain(0, p);
    const f1 = this.filter('bandpass', 1100, 5, g), f2 = this.filter('bandpass', 2600, 6, g);
    const o = this.osc('sawtooth', 520), vib = this.osc('sine', 6), vg = this.gain(18);
    o.connect(f1); o.connect(f2);
    vib.connect(vg).connect(o.frequency);
    o.frequency.linearRampToValueAtTime(880, t + 0.4);
    o.frequency.linearRampToValueAtTime(760, t + 1.4);
    o.frequency.linearRampToValueAtTime(380, t + 2.2);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.15);
    g.gain.setValueAtTime(0.35, t + 1.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    o.start(t); vib.start(t); o.stop(t + 2.4); vib.stop(t + 2.4);
  }
  // a body that is not quite finished
  moan(pos) {
    const t = this.t, p = this.pan(pos, 2, 1), g = this.gain(0, p), bp = this.filter('bandpass', 600, 4, g);
    const o = this.osc('sawtooth', 110), vib = this.osc('sine', 4), vg = this.gain(6);
    o.connect(bp);
    vib.connect(vg).connect(o.frequency);
    o.frequency.linearRampToValueAtTime(160, t + 0.3);
    o.frequency.linearRampToValueAtTime(90, t + 1.6);
    this.env(g, t, 0.08, 0.5, 1.6);
    o.start(t); vib.start(t); o.stop(t + 1.8); vib.stop(t + 1.8);
    this.squelch(0.5);
  }
  shriek(pos) { // the hanging thing, waking up
    const t = this.t, p = this.pan(pos, 3, 0.7), g = this.gain(0, p), ws = this.ctx.createWaveShaper();
    ws.curve = this.curve(20);
    ws.connect(this.filter('bandpass', 1500, 1.2, g));
    for (const f of [700, 742, 1050]) { const o = this.osc('sawtooth', f, ws); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.2); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 1.3); o.start(t); o.stop(t + 1.4); }
    this.env(g, t, 0.01, 0.6, 1.3);
    this.chainRattle(pos);
  }
  chainRattle(pos) {
    const p = this.pan(pos, 2, 1);
    for (let i = 0; i < 9; i++) this.tone(p, { type: 'square', f: 1800 + Math.random() * 2500, dur: 0.03, vol: 0.05, at: i * 0.04 + Math.random() * 0.03 });
  }
  bodyDrop(pos) {
    this.chainRattle(pos);
    const p = this.pan(pos, 3, 0.8);
    this.tone(p, { f: 70, f2: 30, dur: 0.4, vol: 1, at: 0.25 });
    this.burst(p, { type: 'lowpass', f: 900, dur: 0.3, vol: 0.8, brown: true, at: 0.25 });
    this.burst(p, { type: 'bandpass', f: 500, q: 2, dur: 0.3, vol: 0.5, sweep: [300, 1500], at: 0.3 });
  }
  lockerOpen(pos, mine = false) {
    if (!mine) { this.creak(pos); this.clank(pos, 0.4); return; }
    // your own door, an inch from your ear: dry, close, never muffled
    this.burst(this.dry, { f: 700, q: 6, dur: 0.45, vol: 0.35, sweep: [500, 900] });
    this.burst(this.dry, { type: 'highpass', f: 2200, dur: 0.05, vol: 0.5, at: 0.05 });
    this.tone(this.dry, { type: 'triangle', f: 320, f2: 180, dur: 0.18, vol: 0.25, at: 0.05 });
  }
  lockerClose(pos, mine = false) {
    if (!mine) { this.clank(pos, 0.6); this.distantThud(pos); return; }
    this.burst(this.dry, { type: 'highpass', f: 1800, dur: 0.06, vol: 0.7 });
    this.tone(this.dry, { type: 'triangle', f: 260, f2: 120, dur: 0.25, vol: 0.4 });
    this.tone(this.dry, { f: 80, f2: 45, dur: 0.3, vol: 0.5 });
    this.burst(this.dry, { type: 'bandpass', f: 3200, q: 10, dur: 0.35, vol: 0.2, at: 0.02 }); // the sheet metal ringing
  }
  gateRattle(pos) { for (let i = 0; i < 3; i++) setTimeout(() => this.clank(pos, 0.7), i * 90); }
  gateSlide(pos) {
    const p = this.pan(pos, 2, 1);
    this.burst(p, { f: 1300, q: 6, dur: 2.6, vol: 0.3, a: 0.2 });
    this.burst(p, { type: 'lowpass', f: 200, dur: 2.6, vol: 0.4, brown: true, a: 0.2 });
    setTimeout(() => this.clank(pos, 1), 2600);
  }
  liftMotor(on) {
    if (!this.ctx) return;
    if (on && !this.motor) {
      const g = this.gain(0, this.sfx), lp = this.filter('lowpass', 300, 1, g);
      const a = this.osc('sawtooth', 48, lp), b = this.osc('sawtooth', 96.5, lp), n = this.noise(true, lp);
      a.start(); b.start(); n.start();
      g.gain.setTargetAtTime(0.3, this.t, 0.4);
      this.motor = { g, nodes: [a, b, n] };
    } else if (!on && this.motor) {
      const m = this.motor;
      m.g.gain.setTargetAtTime(0, this.t, 0.3);
      m.nodes.forEach((n) => n.stop(this.t + 1.5));
      this.motor = null;
    }
  }
  chime() { // the PA system clearing its throat
    const bp = this.filter('bandpass', 1200, 0.7, this.gain(1, this.sfx));
    this.tone(bp, { f: 659, dur: 0.9, vol: 0.2, a: 0.01 });
    this.tone(bp, { f: 523, dur: 1.4, vol: 0.2, a: 0.01, at: 0.5 });
    this.burst(bp, { type: 'highpass', f: 2000, dur: 2, vol: 0.05, a: 0.1 });
  }
  steamLeak(pos) {
    const p = this.pan(pos, 1.2, 1.2), g = this.gain(0.09, p), bp = this.filter('highpass', 2500, 0.7, g);
    const n = this.noise(false, bp);
    n.start(this.t, Math.random() * 2);
    const lfo = this.osc('sine', 0.3 + Math.random() * 0.4), lg = this.gain(0.04);
    lfo.connect(lg).connect(g.gain);
    lfo.start();
    return { stop: () => { try { n.stop(); lfo.stop(); } catch {} p.disconnect(); } };
  }
  steamBurst(pos) {
    const out = this.gain(1, this.shockClip);
    this.burst(out, { type: 'highpass', f: 1500, dur: 2.4, vol: 1.1, a: 0.005 });
    this.burst(out, { f: 400, q: 0.8, dur: 1.2, vol: 0.6, a: 0.005, brown: true });
    this.clank(pos, 1);
  }
  powerOn(pos) {
    const p = this.pan(pos, 4, 0.5);
    this.tone(p, { type: 'sawtooth', f: 30, f2: 60, dur: 1.6, vol: 0.4, a: 0.3 });
    this.clank(pos, 1);
    this.distantThud(pos);
  }
  shutter(pos) {
    const p = this.pan(pos, 3, 0.7);
    this.burst(p, { f: 900, q: 4, dur: 2.6, vol: 0.6, a: 0.1, sweep: [700, 1600] });
    this.burst(p, { type: 'lowpass', f: 300, dur: 2.6, vol: 0.6, brown: true, a: 0.1 });
    for (let i = 0; i < 8; i++) setTimeout(() => this.clank(pos, 0.4), i * 300);
  }
  buzzer(pos) {
    const out = this.gain(0.6, this.shockClip);
    for (let i = 0; i < 3; i++) this.tone(out, { type: 'square', f: 196, dur: 0.22, vol: 0.5, a: 0.002, at: i * 0.3 });
    this.tone(this.pan(pos, 4, 0.5), { type: 'square', f: 98, dur: 0.9, vol: 0.3 });
  }
  breaker(pos) {
    const out = this.gain(1, this.shockClip);
    this.burst(out, { type: 'lowpass', f: 2500, dur: 0.25, vol: 1.2, a: 0.001 });
    this.tone(out, { f: 70, f2: 28, dur: 1.2, vol: 1.2 });
    this.clank(pos, 1);
  }
  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenN) {
      const g = this.gain(0, this.sfx), bp = this.filter('bandpass', 900, 2, g);
      const o = this.osc('sawtooth', 600, bp), lfo = this.osc('sine', 0.5), lg = this.gain(260);
      lfo.connect(lg).connect(o.frequency);
      o.start(); lfo.start();
      g.gain.setTargetAtTime(0.09, this.t, 0.5);
      this.sirenN = { g, nodes: [o, lfo] };
    } else if (!on && this.sirenN) {
      const s = this.sirenN;
      s.g.gain.setTargetAtTime(0, this.t, 0.3);
      s.nodes.forEach((n) => n.stop(this.t + 1.5));
      this.sirenN = null;
    }
  }
  // the line itself: chains and hooks going round, somewhere close
  lineRunning(on) {
    if (!this.ctx) return;
    if (on && !this.lineN) {
      const g = this.gain(0, this.amb), lp = this.filter('lowpass', 900, 1, g);
      const n = this.noise(true, lp), o = this.osc('sawtooth', 47, lp), am = this.osc('square', 1.6), ag = this.gain(0.05);
      am.connect(ag).connect(g.gain);
      n.start(); o.start(); am.start();
      g.gain.setTargetAtTime(0.1, this.t, 1);
      this.lineN = { g, nodes: [n, o, am] };
    } else if (!on && this.lineN) {
      const s = this.lineN;
      s.g.gain.setTargetAtTime(0, this.t, 0.6);
      s.nodes.forEach((n) => n.stop(this.t + 3));
      this.lineN = null;
    }
  }
  // the morning stops: the pad, and the birds still waiting to sing
  stopDawn() {
    if (this.dawnNodes) { this.dawnNodes.forEach((o) => o.stop(this.t + 0.5)); this.dawnNodes = null; }
    if (this.dawnBus) { const bus = this.dawnBus; bus.gain.setTargetAtTime(0, this.t, 0.15); setTimeout(() => bus.disconnect(), 800); this.dawnBus = null; }
  }
  // the very end: morning
  dawn() {
    if (!this.ctx) return;
    this.setMode('ending');
    this.stopDawn();
    this.dawnBus = this.gain(1, this.mus); // the pad and every bird go through it, so it can all be shut off at once
    const g = this.gain(0, this.dawnBus), lp = this.filter('lowpass', 1400, 0.5, g);
    this.dawnNodes = [130.81, 196, 261.63, 329.63, 392].map((f) => { const o = this.osc('sine', f, lp); o.start(); return o; });
    g.gain.setTargetAtTime(0.05, this.t, 3);
    const bird = (at) => {
      const b = this.gain(0, this.dawnBus), o = this.osc('sine', 3000, b), base = 2600 + Math.random() * 1400;
      const t = this.t + at;
      for (let k = 0; k < 5; k++) { o.frequency.setValueAtTime(base, t + k * 0.11); o.frequency.exponentialRampToValueAtTime(base * 1.35, t + k * 0.11 + 0.06); }
      b.gain.setValueAtTime(0, t);
      for (let k = 0; k < 5; k++) { b.gain.setValueAtTime(0.025, t + k * 0.11); b.gain.setValueAtTime(0, t + k * 0.11 + 0.07); }
      o.start(t);
      o.stop(t + 0.7);
    };
    for (let i = 0; i < 14; i++) bird(2 + i * 1.7 + Math.random() * 1.2);
  }
  // ---------- death cutscenes ----------
  loop(name, on, make) {
    this.loops ||= {};
    if (on && !this.loops[name]) this.loops[name] = make();
    else if (!on && this.loops[name]) {
      const l = this.loops[name];
      l.g.gain.setTargetAtTime(0, this.t, 0.15);
      l.nodes.forEach((n) => { try { n.stop(this.t + 1); } catch {} });
      this.loops[name] = null;
    }
  }
  // ---------- the remaster's films: the worst of it ----------
  // a pump shotgun racked: the fore-end back (a clack), and forward (a heavier clack)
  pump() {
    for (const [at, f] of [[0, 2600], [0.2, 1900]]) {
      this.burst(this.sfx, { type: 'bandpass', f, q: 5, dur: 0.035, vol: 0.7, a: 0.001, at });
      this.burst(this.sfx, { type: 'highpass', f: 3500, dur: 0.015, vol: 0.5, a: 0.001, at: at + 0.012 });
      this.tone(this.sfx, { type: 'square', f: 420, f2: 260, dur: 0.03, vol: 0.12, at });
    }
  }
  // a twelve-gauge in a tiled room: the blast, the boom under it, the room throwing it back
  shotgun() {
    this.burst(this.shockClip, { type: 'lowpass', f: 3200, dur: 0.3, vol: 1.6, a: 0.001 });
    this.burst(this.shockClip, { type: 'lowpass', f: 300, dur: 0.6, vol: 1.4, a: 0.001, brown: true });
    this.tone(this.shockClip, { f: 95, f2: 28, dur: 0.6, vol: 1.2 });
    this.burst(this.sfx, { type: 'highpass', f: 2200, dur: 0.06, vol: 1, a: 0.001 });
    for (const [at, v] of [[0.11, 0.35], [0.23, 0.18], [0.38, 0.08]]) this.burst(this.sfx, { type: 'bandpass', f: 900, q: 0.7, dur: 0.25, vol: v, at }); // the walls
    this.burst(this.sfx, { type: 'bandpass', f: 5200, q: 14, dur: 0.6, vol: 0.06, at: 0.02 }); // your ears
  }
  // something full of blood coming apart all at once: the wet burst, bone going in it, and it all landing
  gib(v = 1) {
    this.burst(this.shockClip, { type: 'lowpass', f: 700, dur: 0.45, vol: 1.1 * v, a: 0.002, brown: true });
    this.burst(this.sfx, { type: 'bandpass', f: 800, q: 1.2, dur: 0.35, vol: 0.8 * v, sweep: [400, 2600] });
    this.tone(this.shockClip, { f: 70, f2: 30, dur: 0.35, vol: 0.8 * v });
    this.crunch(0.8 * v);
    this.squelch(1.6 * v);
    this.spatter(v);
  }
  // bone breaking: a quick run of snaps with something low under them
  crunch(v = 1) {
    const n = 5 + ((Math.random() * 4) | 0);
    for (let k = 0; k < n; k++) this.burst(this.sfx, { type: 'highpass', f: 1200 + Math.random() * 2500, dur: 0.01 + Math.random() * 0.02, vol: v * (0.4 + Math.random() * 0.6), a: 0.001, at: k * 0.018 + Math.random() * 0.02 });
    this.burst(this.sfx, { type: 'bandpass', f: 500, q: 2, dur: 0.08, vol: 0.6 * v });
    this.tone(this.sfx, { f: 130, f2: 55, dur: 0.1, vol: 0.5 * v });
  }
  // and it coming down: wet drops and pieces on tile, for a second or more after
  spatter(v = 1) {
    for (let k = 0; k < 18; k++) {
      const at = 0.15 + Math.random() * Math.random() * 1.6;
      this.burst(this.sfx, { type: 'bandpass', f: 700 + Math.random() * 1800, q: 2.5, dur: 0.03 + Math.random() * 0.05, vol: v * (0.1 + Math.random() * 0.25), a: 0.001, at });
      if (Math.random() < 0.3) this.burst(this.sfx, { type: 'lowpass', f: 400, dur: 0.08, vol: v * 0.3, brown: true, at });
    }
  }
  // a fist into a body: the thump through it, the slap of skin, and by the end it's wet
  punch(v = 1, wet = 0) {
    this.tone(this.shockClip, { f: 85 + Math.random() * 20, f2: 38, dur: 0.16, vol: 1.0 * v });
    this.burst(this.shockClip, { type: 'lowpass', f: 380, dur: 0.1, vol: 1.0 * v, a: 0.001, brown: true });
    this.burst(this.sfx, { type: 'highpass', f: 1300, dur: 0.025, vol: 0.55 * v * (1 - wet * 0.6), a: 0.001 });
    if (wet > 0) { this.burst(this.sfx, { type: 'bandpass', f: 700, q: 2.5, dur: 0.18, vol: 0.5 * wet * v, sweep: [400, 1800] }); this.burst(this.sfx, { type: 'lowpass', f: 300, dur: 0.15, vol: 0.4 * wet * v, brown: true, at: 0.02 }); }
    if (wet > 0.5 && Math.random() < 0.6) this.crunch(0.6 * v);
  }
  // a gasp knocked out of someone, small and wet
  wheeze(v = 0.5) {
    this.burst(this.sfx, { type: 'bandpass', f: 1100, q: 1.5, dur: 0.25, vol: 0.3 * v, sweep: [1500, 600] });
    this.burst(this.sfx, { type: 'bandpass', f: 400, q: 3, dur: 0.2, vol: 0.2 * v, at: 0.05, brown: true });
  }

  // a film ending or skipped: every loop it started stops (fire, grinder, fan, saw, whatever else)
  cutLoops() { for (const k of Object.keys(this.loops || {})) this.loop(k, false); }
  // and what it had already queued (the rest of a scream, the crunches still to come) is silenced: the effects buses
  // dip to nothing for a moment and come back
  hush(secs = 1.2) {
    if (!this.ctx) return;
    const t = this.t;
    for (const [g, v] of [[this.sfx, 1], [this.shockOut, this.volume]]) {
      if (!g) continue;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.06);
      g.gain.setValueAtTime(0, t + secs); g.gain.linearRampToValueAtTime(v, t + secs + 0.15);
    }
  }
  fire(on) {
    this.loop('fire', on, () => {
      const g = this.gain(0.35, this.sfx), lp = this.filter('lowpass', 500, 0.7, g);
      const roar = this.noise(true, lp), hiss = this.noise(false, this.filter('highpass', 3000, 0.7, this.gain(0.05, g)));
      roar.start(); hiss.start();
      const crackle = setInterval(() => { if (!this.loops.fire) return clearInterval(crackle); this.burst(g, { type: 'highpass', f: 2500, dur: 0.01, vol: 0.4 + Math.random() * 0.6 }); }, 70);
      return { g, nodes: [roar, hiss] };
    });
  }
  ropeSnap() {
    this.burst(this.sfx, { type: 'highpass', f: 1800, dur: 0.05, vol: 1, a: 0.001 });
    this.tone(this.sfx, { type: 'sawtooth', f: 220, f2: 60, dur: 0.15, vol: 0.4 });
  }
  sizzle() {
    const out = this.gain(1, this.shockClip);
    this.burst(out, { type: 'highpass', f: 2000, dur: 2.5, vol: 1, a: 0.002 });
    this.burst(out, { type: 'lowpass', f: 600, dur: 1.5, vol: 0.8, brown: true, a: 0.002 });
  }
  windRush(dur, vol = 1) {
    const g = this.gain(0, this.sfx), lp = this.filter('lowpass', 300, 0.8, g), n = this.noise(false, lp);
    lp.frequency.exponentialRampToValueAtTime(4000, this.t + dur);
    g.gain.linearRampToValueAtTime(0.8 * vol, this.t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, this.t + dur);
    n.start(); n.stop(this.t + dur + 0.1);
  }
  drag() {
    for (let i = 0; i < 6; i++) this.burst(this.sfx, { type: 'lowpass', f: 700, dur: 0.35, vol: 0.4, a: 0.05, brown: true, at: i * 0.5 });
  }
  grinder(on) {
    this.loop('grinder', on, () => {
      const g = this.gain(0.25, this.sfx), lp = this.filter('lowpass', 900, 1.5, g);
      const a = this.osc('sawtooth', 52, lp), b = this.osc('square', 104.5, lp), n = this.noise(true, lp);
      a.start(); b.start(); n.start();
      return { g, nodes: [a, b, n] };
    });
  }
  grind() {
    const out = this.gain(1, this.shockClip);
    for (let i = 0; i < 14; i++) {
      this.burst(out, { type: 'bandpass', f: 400 + Math.random() * 600, q: 2, dur: 0.2, vol: 0.9, at: i * 0.17, sweep: [300, 2000] });
      this.burst(out, { type: 'highpass', f: 1500, dur: 0.02, vol: 0.8, at: i * 0.17 + 0.05 });
    }
    this.tone(out, { f: 70, f2: 30, dur: 1, vol: 1 });
    if (this.loops && this.loops.grinder) this.loops.grinder.g.gain.setTargetAtTime(0.5, this.t, 0.1);
  }
  // a tired car engine: a low four-cylinder burble; rev(k) opens it up (0 idle .. 1 pulling away hard)
  engine(on) {
    this.loop('engine', on, () => {
      const g = this.gain(0.0, this.sfx), lp = this.filter('lowpass', 420, 1.2, g);
      const a = this.osc('sawtooth', 38, lp), b = this.osc('square', 76.5, lp), n = this.noise(true, this.filter('lowpass', 300, 0.7, this.gain(0.4, lp)));
      a.start(); b.start(); n.start();
      g.gain.setTargetAtTime(0.28, this.t, 0.2);
      return { g, nodes: [a, b, n], a, b, lp };
    });
  }
  rev(k) {
    const l = this.loops && this.loops.engine;
    if (!l) return;
    l.a.frequency.setTargetAtTime(38 + k * 70, this.t, 0.15); l.b.frequency.setTargetAtTime(76.5 + k * 140, this.t, 0.15);
    l.lp.frequency.setTargetAtTime(420 + k * 900, this.t, 0.15);
  }
  // the band saw: a high, steady whine with the motor under it
  bandsaw(on) {
    this.loop('bandsaw', on, () => {
      const g = this.gain(0.2, this.sfx), bp = this.filter('bandpass', 2400, 2.5, g), lp = this.filter('lowpass', 700, 1, g);
      const a = this.osc('sawtooth', 1180, bp), b = this.osc('sawtooth', 1193, bp), m = this.osc('square', 58, lp), n = this.noise(true, bp);
      a.start(); b.start(); m.start(); n.start();
      return { g, nodes: [a, b, m, n] };
    });
  }
  // the teeth finding bone: the whine drops and screams
  sawBite(v = 1) {
    const out = this.gain(1, this.shockClip);
    for (let i = 0; i < 6; i++) this.burst(out, { type: 'bandpass', f: 1800 + Math.random() * 1600, q: 3, dur: 0.12, vol: 0.7 * v, at: i * 0.07, sweep: [2600, 900] });
    this.tone(out, { f: 900, f2: 420, dur: 0.5, vol: 0.4 * v });
    if (this.loops && this.loops.bandsaw) this.loops.bandsaw.g.gain.setTargetAtTime(0.32, this.t, 0.05);
  }
  fanLoop(on) {
    this.loop('fan', on, () => {
      const g = this.gain(0.3, this.sfx), bp = this.filter('bandpass', 500, 0.8, g), n = this.noise(false, bp);
      const am = this.osc('sine', 9.5), ag = this.gain(0.2);
      am.connect(ag).connect(g.gain);
      const hum = this.osc('sawtooth', 60, this.filter('lowpass', 200, 1, this.gain(0.3, g)));
      n.start(); am.start(); hum.start();
      return { g, nodes: [n, am, hum] };
    });
  }
  fanHit() {
    const out = this.gain(1, this.shockClip);
    for (let i = 0; i < 6; i++) this.burst(out, { type: 'highpass', f: 900, dur: 0.05, vol: 1, a: 0.001, at: i * 0.026 });
    this.tone(out, { type: 'square', f: 140, f2: 40, dur: 0.6, vol: 0.8 });
    this.squelch(2.5);
    this.crack();
  }
  chew() {
    this.burst(this.sfx, { type: 'bandpass', f: 500, q: 2, dur: 0.12, vol: 0.5, sweep: [300, 900] });
    if (Math.random() < 0.5) this.burst(this.sfx, { type: 'highpass', f: 2000, dur: 0.01, vol: 0.6, at: 0.05 });
  }
  flashlight() { this.burst(this.sfx, { type: 'highpass', f: 2200, dur: 0.015, vol: 0.3 }); }

  // ---------- loops ----------
  monsterVoice() {
    const p = this.pan({ x: 0, z: 0 }, 1.8, 1.0);
    const occ = this.filter('lowpass', 16000, 0.7, p);
    const sG = this.gain(0, occ), sBp = this.filter('bandpass', 2800, 7, sG), sN = this.noise(false, sBp);
    const bG = this.gain(0, occ), bBp = this.filter('bandpass', 480, 0.9, bG), bN = this.noise(true, bBp);
    const gG = this.gain(0, occ), gl = this.filter('lowpass', 380, 1.5, gG);
    const o1 = this.osc('sawtooth', 51, gl), o2 = this.osc('sawtooth', 54.7, gl);
    const nodes = [sN, bN, o1, o2];
    nodes.forEach((n) => n.start(this.t, n.buffer ? Math.random() * 2 : undefined));
    let breathPh = Math.random() * 6;
    return {
      update: (pos, { scrape, breath, growl, occluded }) => {
        const t = this.t;
        this.place(p, pos);
        sG.gain.setTargetAtTime(scrape * 0.4, t, 0.04);
        sBp.frequency.setTargetAtTime(2000 + Math.random() * 2200, t, 0.03);
        breathPh += 0.016 * Math.PI * 2 * (breath > 0.8 ? 0.75 : 0.32);
        const b = 0.5 + 0.5 * Math.sin(breathPh);
        bG.gain.setTargetAtTime(breath * 0.55 * b * b, t, 0.06);
        gG.gain.setTargetAtTime(growl * 0.28 * (0.7 + 0.3 * Math.sin(t * 23)), t, 0.05);
        occ.frequency.setTargetAtTime(occluded ? 650 : 16000, t, 0.12);
      },
      stop: () => { nodes.forEach((n) => { try { n.stop(); } catch {} }); p.disconnect(); },
    };
  }
  flies(pos) {
    if (this.lite) { // phones: one voice per body, not four
      const p = this.pan({ ...pos, y: 0.5 }, 1.2, 1.1, this.fliesBus), g = this.gain(0.04, p), bp = this.filter('bandpass', 420, 1.4, g), a = this.osc('sawtooth', 195, bp);
      a.start();
      return { stop: () => { a.stop(); p.disconnect(); } };
    }
    const p = this.pan({ ...pos, y: 0.5 }, 1.2, 1.1, this.fliesBus), g = this.gain(0.05, p), bp = this.filter('bandpass', 420, 1.4, g);
    const a = this.osc('sawtooth', 188, bp), b = this.osc('sawtooth', 203, bp);
    const lfo = this.osc('sine', 9 + Math.random() * 4), lg = this.gain(30);
    lfo.connect(lg); lg.connect(a.frequency); lg.connect(b.frequency);
    const am = this.osc('sine', 3.3), ag = this.gain(0.02);
    am.connect(ag).connect(g.gain);
    const nodes = [a, b, lfo, am];
    nodes.forEach((n) => n.start());
    return { stop: () => { nodes.forEach((n) => n.stop()); p.disconnect(); } };
  }
}
