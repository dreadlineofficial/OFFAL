// The tape in the hiring office: a VHS cassette left on a desk, an old television on an AV cart with a VCR under it,
// and what's on the tape, played as a worn 1998 company video (drawn here, frame by frame, on a 4:3 canvas). The same
// canvas is the television's screen in the room while it plays. Fullscreen from the button (or F).
import * as THREE from 'three';

const W = 640, H = 480;
const MESSAGE = [
  'Recently, workers have been going missing and ending up being found dead in the factory.',
  'The Foreman has changed over the past few days.',
  'He is not human anymore.',
  'If you ever see or come in contact with the Foreman, too bad.',
  'We advise you to get the f**k out of here before he rips out your intestines.',
  'Best of luck,',
  'Hollow Pines Meatworks',
];
// the tape is a run of plain static cards, white and red, cut hard from one to the next with a burst of snow between
// (no movement in them at all: just the tape's own wear over the top). Each line of the message is a card
const WHITE = '#f2efe8', RED = '#c4100c';
const CARDS = [
  { kind: 'slate', dur: 4.5 },
  { kind: 'title', dur: 4.2, tone: true },
  ...MESSAGE.slice(0, 5).map((text, i) => ({ kind: 'text', ids: [i], text, dur: Math.max(4, text.length / 11 + 2.2), red: i === 2, pic: ['', 'figure', '', 'warn', ''][i] })),
  { kind: 'text', ids: [5, 6], text: MESSAGE[5] + '\n' + MESSAGE[6], dur: 5, sign: true },
];
const T_CARDS = 1.6, GAP = 0.32; // (the VCR's blue first; snow between cards)
{ let at = T_CARDS; for (const c of CARDS) { c.at = at; at += c.dur + GAP; } }
const T_END = CARDS.at(-1).at + CARDS.at(-1).dur, T_STOP = T_END + 1.6;
export const TAPE_LENGTH = T_STOP;

const tex = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
};
const std = (o) => new THREE.MeshStandardMaterial(o);
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r0, r1, h, m, n = 16) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, n), m);
const put = (o, x, y, z, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };

// ---------- the cassette ----------
export function vhsTape() {
  const g = new THREE.Group();
  const shell = std({ color: 0x141414, roughness: 0.45, metalness: 0.05 });
  const label = std({ roughness: 0.85, map: tex(256, 64, (c, w, h) => {
    c.fillStyle = '#ece4cc'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#b04030'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 16); c.lineTo(w, 16); c.stroke();
    c.fillStyle = '#1a1a40'; c.font = 'italic bold 25px "Comic Sans MS", "Segoe Print", cursive'; c.fillText('STAFF - WATCH THIS', 10, 46);
    c.fillStyle = '#7a1010'; c.font = 'bold 11px monospace'; c.fillText('30.10.98', w - 66, 12);
  }) });
  g.add(put(box(0.188, 0.025, 0.103, shell), 0, 0.0125, 0));
  g.add(put(new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.04), label), 0, 0.0128, 0.0516));
  // the window onto the reels, and the reels
  g.add(put(box(0.09, 0.002, 0.04, std({ color: 0x2a2620, roughness: 0.1, transparent: true, opacity: 0.7 })), 0, 0.0255, -0.01));
  for (const x of [-0.045, 0.045]) g.add(put(cyl(0.017, 0.017, 0.004, std({ color: 0x3a2a1a, roughness: 0.6 })), x, 0.024, -0.01));
  return g;
}

// ---------- the television, on its cart, with the VCR ----------
export function tvSet(screenTex) {
  const g = new THREE.Group();
  const metal = std({ color: 0x3a3c3e, roughness: 0.5, metalness: 0.7 });
  const plastic = std({ color: 0x2a2724, roughness: 0.55 });
  const wood = std({ color: 0x4a3020, roughness: 0.7, map: tex(128, 128, (c, w, h) => {
    c.fillStyle = '#5a3a24'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { c.strokeStyle = `rgba(30,15,8,${0.15 + Math.random() * 0.25})`; c.lineWidth = 1 + Math.random() * 2; const y = Math.random() * h; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y + 3); c.stroke(); }
  }) });
  // the AV cart: two shelves on four posts, castors
  for (const y of [0.18, 0.72]) g.add(put(box(0.72, 0.03, 0.5, metal), 0, y, 0));
  for (const x of [-0.34, 0.34]) for (const z of [-0.23, 0.23]) {
    g.add(put(cyl(0.012, 0.012, 0.74, metal, 8), x, 0.45, z));
    g.add(put(cyl(0.03, 0.03, 0.025, std({ color: 0x111111, roughness: 0.8 }), 10), x, 0.035, z, Math.PI / 2));
  }
  // the VCR on the bottom shelf: slot, buttons, the clock that has always said 12:00
  const vcr = new THREE.Group(); put(vcr, 0, 0.235, 0.02); g.add(vcr);
  vcr.add(box(0.43, 0.08, 0.3, plastic));
  vcr.add(put(box(0.2, 0.025, 0.004, std({ color: 0x050505, roughness: 0.3 })), -0.07, 0.008, 0.151));
  const clock = std({ color: 0x000000, emissive: 0x30ff60, emissiveIntensity: 1.6, emissiveMap: tex(64, 16, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 14px monospace'; c.fillText('12:00', 8, 13); }) });
  vcr.add(put(new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.015), clock), 0.13, 0.01, 0.1515));
  for (let i = 0; i < 4; i++) vcr.add(put(box(0.018, 0.01, 0.006, std({ color: 0x555555, roughness: 0.4 })), 0.09 + i * 0.024, -0.02, 0.152));
  // the set: a deep wooden cabinet, a curved glass front, knobs and a speaker grille, rabbit ears
  const tv = new THREE.Group(); put(tv, 0, 0.735, 0); g.add(tv);
  tv.add(put(box(0.62, 0.48, 0.46, wood), 0, 0.24, 0));
  tv.add(put(box(0.5, 0.36, 0.3, plastic), 0, 0.23, -0.3)); // the tube's back
  const bezel = std({ color: 0x1a1816, roughness: 0.6 });
  // the bezel: a frame round the glass (the glass shows through it), and black behind the glass
  tv.add(put(box(0.46, 0.055, 0.03, bezel), -0.05, 0.24 + 0.1725, 0.24)); tv.add(put(box(0.46, 0.055, 0.03, bezel), -0.05, 0.24 - 0.1725, 0.24));
  tv.add(put(box(0.05, 0.29, 0.03, bezel), -0.255, 0.24, 0.24)); tv.add(put(box(0.05, 0.29, 0.03, bezel), 0.155, 0.24, 0.24));
  tv.add(put(box(0.37, 0.3, 0.01, std({ color: 0x020202, roughness: 0.9 })), -0.05, 0.24, 0.228));
  // the glass: a slice of a sphere, bulging out
  const glassGeo = new THREE.SphereGeometry(0.9, 24, 18, Math.PI / 2 - 0.2, 0.4, Math.PI / 2 - 0.16, 0.32);
  glassGeo.translate(0, 0, -0.9);
  const uv = glassGeo.attributes.uv, pos = glassGeo.attributes.position;
  glassGeo.computeBoundingBox(); const bb = glassGeo.boundingBox;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  const screen = std({ color: 0x000000, roughness: 0.08, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 1.3, emissiveMap: screenTex });
  const glass = new THREE.Mesh(glassGeo, screen);
  put(glass, -0.05, 0.24, 0.262); tv.add(glass);
  tv.userData.screen = screen;
  // the control strip down the right
  tv.add(put(box(0.1, 0.4, 0.02, bezel), 0.255, 0.24, 0.235));
  for (const y of [0.36, 0.28]) tv.add(put(cyl(0.022, 0.024, 0.025, std({ color: 0x8a8070, roughness: 0.4, metalness: 0.3 }), 14), 0.255, y, 0.255, Math.PI / 2));
  for (let i = 0; i < 6; i++) tv.add(put(box(0.06, 0.006, 0.004, std({ color: 0x080808 })), 0.255, 0.1 + i * 0.016, 0.246));
  // rabbit ears
  for (const s of [-1, 1]) {
    const ant = cyl(0.003, 0.004, 0.42, metal, 6); put(ant, 0.12 + s * 0.04, 0.68, -0.05, 0, 0, s * 0.55); tv.add(ant);
  }
  tv.add(put(cyl(0.035, 0.04, 0.03, plastic, 12), 0.12, 0.495, -0.05));
  // the cable down to the VCR
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.2, 0.86, -0.3), new THREE.Vector3(0.28, 0.6, -0.26), new THREE.Vector3(0.18, 0.4, -0.2), new THREE.Vector3(0.12, 0.26, -0.13)]), 12, 0.006, 5), std({ color: 0x0a0a0a, roughness: 0.6 }));
  g.add(cable);
  g.userData.screen = screen;
  return g;
}

// ---------- what's on the tape ----------
// draws one frame of the tape at time t (seconds) into g (W x H)
function noiseTile() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96;
  const g = c.getContext('2d'), d = g.createImageData(128, 96);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0);
  return c;
}
const NOISE = [];

// ---------- the cards ----------
function wrap(g, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    let l = '';
    for (const w of para.split(' ')) { const tl = l ? l + ' ' + w : w; if (g.measureText(tl).width > maxW && l) { out.push(l); l = w; } else l = tl; }
    out.push(l);
  }
  return out;
}
// the pictures: flat red shapes, like a safety poster
function figure(g, x, y, col) { // him: a hunched shape in an apron, a cleaver hanging from one hand
  g.fillStyle = col;
  g.beginPath(); g.arc(x + 14, y - 118, 20, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(x - 34, y - 96); g.lineTo(x + 40, y - 92); g.lineTo(x + 30, y - 20); g.lineTo(x - 28, y - 20); g.closePath(); g.fill();
  g.fillRect(x - 24, y - 22, 18, 22); g.fillRect(x + 8, y - 22, 18, 22);
  g.fillRect(x - 46, y - 92, 14, 78); g.fillRect(x + 36, y - 88, 14, 80);
  g.fillRect(x + 30, y - 10, 34, 22); // the cleaver
  g.fillStyle = WHITE; g.fillRect(x + 4, y - 124, 6, 4); g.fillRect(x + 18, y - 124, 6, 4); // two holes for eyes
}
function warn(g, x, y, s, col) {
  g.fillStyle = col; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 1.1, y + s * 0.8); g.lineTo(x - s * 1.1, y + s * 0.8); g.closePath(); g.fill();
  g.fillStyle = WHITE; g.beginPath(); g.moveTo(x, y - s * 0.62); g.lineTo(x + s * 0.76, y + s * 0.6); g.lineTo(x - s * 0.76, y + s * 0.6); g.closePath(); g.fill();
  g.fillStyle = col; g.fillRect(x - s * 0.08, y - s * 0.3, s * 0.16, s * 0.55); g.fillRect(x - s * 0.08, y + s * 0.34, s * 0.16, s * 0.15);
}
function pine(g, x, y, s, col) {
  g.fillStyle = col;
  for (let i = 0; i < 3; i++) { const w = (22 + i * 11) * s; g.beginPath(); g.moveTo(x, y + (-36 + i * 18) * s); g.lineTo(x - w, y + (-6 + i * 21) * s); g.lineTo(x + w, y + (-6 + i * 21) * s); g.closePath(); g.fill(); }
  g.fillRect(x - 5 * s, y + 52 * s, 10 * s, 13 * s);
}
function card(g, c) {
  g.textAlign = 'center';
  if (c.kind === 'slate') {
    g.fillStyle = WHITE; g.fillRect(0, 0, W, H);
    pine(g, W / 2, 130, 1.6, RED);
    g.fillStyle = RED; g.font = 'bold 44px Arial, Helvetica, sans-serif'; g.fillText('HOLLOW PINES', W / 2, 300);
    g.font = 'bold 22px Arial, Helvetica, sans-serif'; g.fillText('M E A T W O R K S', W / 2, 332);
    g.fillStyle = '#222'; g.font = '20px Arial, Helvetica, sans-serif'; g.fillText('1998, October 30th', W / 2, 400);
    return;
  }
  if (c.kind === 'title') {
    g.fillStyle = RED; g.fillRect(0, 0, W, H);
    g.fillStyle = WHITE; g.font = 'bold 64px Arial, Helvetica, sans-serif'; g.fillText('IMPORTANT', W / 2, 220); g.fillText('STAFF MESSAGE', W / 2, 292);
    g.fillRect(90, 320, W - 180, 6);
    return;
  }
  const bg = c.red ? RED : WHITE, fg = c.red ? WHITE : RED;
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = fg; g.fillRect(0, 0, W, 10); g.fillRect(0, H - 10, W, 10); // a band top and bottom
  let x = W / 2, maxW = W - 120;
  if (c.pic === 'figure') { figure(g, 150, 360, fg); x = 400; maxW = 330; }
  if (c.pic === 'warn') { warn(g, 140, 230, 80, fg); x = 400; maxW = 330; }
  g.font = c.sign ? 'bold 40px Arial, Helvetica, sans-serif' : c.red ? 'bold 46px Arial, Helvetica, sans-serif' : 'bold 30px Arial, Helvetica, sans-serif';
  const lines = wrap(g, c.text, maxW), lh = c.red || c.sign ? 54 : 40;
  g.fillStyle = fg;
  lines.forEach((l, i) => g.fillText(l, x, H / 2 + 10 + (i - (lines.length - 1) / 2) * lh));
  if (c.sign) pine(g, W / 2, 80, 0.7, fg);
}

function frame(g, t, seed) {
  const r = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233 + Math.floor(t * 30) * 3.13) * 43758.5453; return x - Math.floor(x); };
  if (!NOISE.length) for (let i = 0; i < 4; i++) NOISE.push(noiseTile());
  g.save();
  g.globalCompositeOperation = 'source-over';
  const noiseAll = (a) => { g.globalAlpha = a; g.drawImage(NOISE[(t * 30 | 0) % 4], 0, 0, W, H); g.globalAlpha = 1; };
  const cur = CARDS.find((c) => t >= c.at && t < c.at + c.dur);
  if (t < 0.5 || t > T_END || (t > T_CARDS - 0.3 && !cur)) { // snow: before, between the cards, after
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H); noiseAll(0.95);
    if (t > T_STOP - 1.2) { g.fillStyle = '#1830c8'; g.fillRect(0, 0, W, H); }
  } else if (!cur) {
    g.fillStyle = '#1830c8'; g.fillRect(0, 0, W, H); // the VCR's own blue
  } else card(g, cur);
  // the VCR's on-screen display and the camcorder's date stamp
  g.textAlign = 'left'; g.font = 'bold 22px "Courier New", monospace';
  g.fillStyle = '#f0f0f0'; g.shadowColor = '#000'; g.shadowBlur = 0;
  if (t < 3.5) g.fillText('▶ PLAY', 30, 44);
  if (t > T_STOP - 1.2) g.fillText('■ STOP', 30, 44);
  if (t < 3.5 || t > T_STOP - 1.2) { g.textAlign = 'right'; g.fillStyle = '#f0f0f0'; g.font = 'bold 22px "Courier New", monospace'; g.fillText('SP', W - 30, 44); }
  g.restore();
  // ---- the tape's wear, over everything ----
  // a little snow always; a band of it rolling up the picture now and then; the head-switching tear at the bottom
  g.globalAlpha = 0.1; g.drawImage(NOISE[(t * 30 + 1 | 0) % 4], 0, 0, W, H); g.globalAlpha = 1;
  const roll = (t * 0.23) % 1;
  if (roll < 0.18 || r(3) < 0.02) {
    const y = (1 - roll / 0.18) * H;
    g.globalAlpha = 0.55; g.drawImage(NOISE[(t * 30 + 2 | 0) % 4], 0, 0, 128, 10, 0, y - 18, W, 36); g.globalAlpha = 1;
  }
  const img = g.getImageData(0, H - 22, W, 22);
  g.putImageData(img, 8 + r(4) * 18, H - 22);
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, H - 22, 12, 22);
  // a line or two jumping sideways
  if (r(5) < 0.35) { const y = (r(6) * H) | 0, hh = 2 + (r(8) * 10 | 0); const strip = g.getImageData(0, y, W, hh); g.putImageData(strip, (r(9) - 0.5) * 30, y); }
  // scanlines
  g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
}

// ---------- the player: the overlay, its sound, the TV in the room ----------
export class TapePlayer {
  constructor({ el, cv, fsBtn, audio }) {
    this.el = el; this.cv = cv; this.audio = audio;
    cv.width = W; cv.height = H;
    this.g = cv.getContext('2d', { willReadFrequently: true });
    this.on = false;
    // the screen in the room shows the same picture (blue and idle until it plays)
    this.small = document.createElement('canvas'); this.small.width = 320; this.small.height = 240;
    this.sg = this.small.getContext('2d');
    this.idle();
    this.tex = new THREE.CanvasTexture(this.small); this.tex.colorSpace = THREE.SRGBColorSpace;
    fsBtn.addEventListener('click', (e) => { e.stopPropagation(); this.fullscreen(); });
  }
  idle() { this.sg.fillStyle = '#1830c8'; this.sg.fillRect(0, 0, 320, 240); this.sg.fillStyle = '#f0f0f0'; this.sg.font = 'bold 14px "Courier New", monospace'; this.sg.fillText('VIDEO 1', 16, 26); if (this.tex) this.tex.needsUpdate = true; }
  fullscreen() {
    try {
      if (document.fullscreenElement === this.el) document.exitFullscreen().catch(() => {});
      else this.el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    } catch {}
  }
  play(onEnd) {
    this.on = true; this.t = 0; this.seed = Math.random() * 100; this.onEnd = onEnd;
    this.el.classList.add('on');
    this.sound(true);
  }
  stop() {
    if (!this.on) return;
    this.on = false;
    this.el.classList.remove('on');
    try { if (document.fullscreenElement === this.el) document.exitFullscreen().catch(() => {}); } catch {}
    this.sound(false);
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch {}
    // the set in the room goes back to blue
    this.idle();
    const f = this.onEnd; this.onEnd = null; if (f) f();
  }
  update(dt) {
    if (!this.on) return;
    const was = this.t;
    this.t += dt;
    frame(this.g, this.t, this.seed);
    this.sg.drawImage(this.cv, 0, 0, 320, 240); this.tex.needsUpdate = true;
    // the tone under the title card; the voice reading each card as it comes up
    for (const c of CARDS) {
      if (was < c.at && this.t >= c.at) { if (c.tone) this.beep(true); if (c.ids) for (const id of c.ids) this.speak(id); }
      if (c.tone && was < c.at + c.dur && this.t >= c.at + c.dur) this.beep(false);
    }
    if (this.t >= T_STOP) this.stop();
  }
  // hiss and hum, the whole time it plays
  sound(on) {
    const a = this.audio, ctx = a && a.ctx;
    if (!ctx) return;
    if (on) {
      const hiss = ctx.createBufferSource(); hiss.buffer = a.white; hiss.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
      const hg = ctx.createGain(); hg.gain.value = 0.035;
      const hum = ctx.createOscillator(); hum.frequency.value = 60; hum.type = 'sawtooth';
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
      const mg = ctx.createGain(); mg.gain.value = 0.03;
      hiss.connect(hp).connect(hg).connect(a.dry); hum.connect(lp).connect(mg).connect(a.dry);
      hiss.start(); hum.start();
      this.nodes = [hiss, hum];
    } else if (this.nodes) { for (const n of this.nodes) try { n.stop(); } catch {} this.nodes = null; this.beep(false); }
  }
  // the long, flat tone of an emergency broadcast
  beep(on) {
    const a = this.audio, ctx = a && a.ctx;
    if (!ctx) return;
    if (on && !this.tone) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o1.frequency.value = 853; o2.frequency.value = 960; g.gain.value = 0;
      g.gain.setTargetAtTime(0.05, ctx.currentTime, 0.02);
      o1.connect(g); o2.connect(g); g.connect(a.dry); o1.start(); o2.start();
      this.tone = [o1, o2, g];
    } else if (!on && this.tone) {
      const [o1, o2, g] = this.tone; this.tone = null;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.03); setTimeout(() => { try { o1.stop(); o2.stop(); } catch {} }, 300);
    }
  }
  // a flat, slow voice reads each part as it types (where the system has a voice); the swear is bleeped
  speak(i) {
    try {
      const s = window.speechSynthesis; if (!s) return;
      const say = (text, then) => {
        const u = new window.SpeechSynthesisUtterance(text);
        u.rate = 0.8; u.pitch = 0.5; u.volume = Math.min(1, (this.audio && this.audio.volume) || 0.8);
        const vs = s.getVoices(), v = vs.find((x) => /^en/i.test(x.lang) && /\b(david|daniel|george|fred|mark|alex)\b/i.test(x.name)) || vs.find((x) => /^en/i.test(x.lang));
        if (v) u.voice = v;
        if (then) u.onend = then;
        s.speak(u);
      };
      const text = MESSAGE[i];
      if (text.includes('f**k')) {
        const [x, y] = text.split('f**k');
        say(x, () => { if (!this.on) return; this.bleep(); setTimeout(() => this.on && say(y), 380); });
      } else say(text);
    } catch {}
  }
  bleep() {
    const a = this.audio, ctx = a && a.ctx; if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 1000; g.gain.value = 0.06;
    o.connect(g).connect(a.dry); o.start(); o.stop(ctx.currentTime + 0.32);
  }
}
export { CARDS as TAPE_SCENES };
