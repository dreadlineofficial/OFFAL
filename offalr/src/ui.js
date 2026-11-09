// DOM side of the game: screens, HUD, typed text, the time card, and blood on the lens.
import { BLOOD } from './textures.js';

// blood that hit the lens: an irregular wet body, satellite drops flung one way, a glint of light on top
function lensSplat(g, x, y, s, fresh = Math.random() < 0.5) {
  const dir = Math.random() * Math.PI * 2;
  const base = fresh ? [120, 4, 3] : [70, 2, 2];
  const col = (a, k = 1) => `rgba(${base[0] * k | 0},${base[1]},${base[2]},${a})`;
  for (let i = 0; i < 7; i++) {
    const ox = (Math.random() - 0.5) * s * 0.5 + Math.cos(dir) * s * 0.15 * i / 7, oy = (Math.random() - 0.5) * s * 0.5 + Math.sin(dir) * s * 0.15 * i / 7;
    g.fillStyle = col(0.55 + Math.random() * 0.35, 0.8 + Math.random() * 0.4);
    g.beginPath();
    g.ellipse(x + ox, y + oy, s * (0.15 + Math.random() * 0.35), s * (0.1 + Math.random() * 0.25), Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 26; i++) { // flung droplets, stretched along their flight
    const a = dir + (Math.random() - 0.5) * 1.3, d = s * (0.45 + Math.random() * 1.8), r = s * (0.012 + Math.random() * 0.05);
    g.fillStyle = col(0.6 + Math.random() * 0.35);
    g.beginPath();
    g.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (1.4 + d / s), r, a, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(255,190,180,0.12)';
  g.beginPath();
  g.ellipse(x - s * 0.1, y - s * 0.12, s * 0.12, s * 0.05, -0.6, 0, Math.PI * 2);
  g.fill();
}

export const $ = (id) => document.getElementById(id);

export function show(id, on = true) { $(id).classList.toggle('on', on); }
export function only(...ids) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', ids.includes(s.id));
}

const typing = new WeakMap();
// on a phone the prompts name the buttons on screen, not keyboard keys
let touchMode = false;
export function setTouch(on) { touchMode = on; }
const TOUCH_KEYS = { E: 'USE', Q: 'LISTEN', C: 'CROUCH', F: 'TORCH', R: 'SYRINGE', SPACE: 'BREATH', TAB: 'TASKS', ESC: 'PAUSE', P: 'PAUSE', CLICK: 'FIRE', LMB: 'FIRE' };
// with a controller, the buttons on it
let padMode = false;
export function setPad(on) { padMode = on; }
const PAD_KEYS = { E: 'A', Q: 'X', C: 'B', F: 'Y', R: 'D-PAD UP', SPACE: 'LT', TAB: 'VIEW', ESC: 'MENU', P: 'MENU', CLICK: 'RT', LMB: 'RT' };
export function keys(text) {
  if ((!touchMode && !padMode) || !text) return text;
  const K = padMode ? PAD_KEYS : TOUCH_KEYS;
  return text
    .replace(/<kbd>([A-Z~]+)<\/kbd>/g, (m, k) => `<kbd>${K[k] || k}</kbd>`)
    .replace(/\b([Hh]old|[Pp]ress|[Tt]ap|[Uu]se)\s+(E|Q|C|F|R|SPACE|TAB)\b/g, (m, v, k) => `${v} ${K[k]}`)
    .replace(/\((E|Q|C|F|R)\)/g, (m, k) => `(${K[k]})`)
    .replace(/\b[Cc]lick to fire\b/g, padMode ? 'RT to fire' : 'Tap FIRE').replace(/\bCLICK\b/g, K.CLICK);
}
export function typewrite(el, text, cps = 38, onTick) {
  text = keys(text);
  clearInterval(typing.get(el));
  el.textContent = '';
  let i = 0;
  const id = setInterval(() => {
    el.textContent = text.slice(0, ++i);
    if (onTick && text[i - 1] !== ' ') onTick();
    if (i >= text.length) { clearInterval(id); typing.delete(el); }
  }, 1000 / cps);
  typing.set(el, id);
  typed.set(el, text);
}
const typed = new WeakMap();
// a click: the text still typing out is shown whole at once. Returns whether anything was still typing
export function finishTyping(el) {
  if (!typing.has(el)) return false;
  clearInterval(typing.get(el));
  typing.delete(el);
  el.textContent = typed.get(el) ?? el.textContent;
  return true;
}

// Blood running off the bottom of the title. The letters are measured (drawn to a canvas in the same font)
// so every drip starts at the underside of a stroke that rests on the baseline: the feet of the F, the A
// and the L, the bottom of the O. The menu must be on screen to measure, so it waits until it is.
export function buildDrips() { $('drips').innerHTML = ''; } // the title used to drip; it doesn't any more
if (document.fonts) document.fonts.ready.then(() => buildDrips());

let msgTimer = 0;
export function message(text, secs = 3.5) {
  const m = $('msg');
  m.textContent = keys(text);
  m.classList.add('on');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => m.classList.remove('on'), secs * 1000);
}
// PA announcements were removed: kept as a no-op so callers don't break
export function pa() {}

let lastPrompt = null;
export function prompt(text, progress = 0) {
  const p = $('prompt');
  if (!text) { if (lastPrompt !== null) { p.classList.remove('on'); lastPrompt = null; } return; }
  if (text !== lastPrompt) { $('promptText').innerHTML = keys(text); p.classList.add('on'); lastPrompt = text; }
  $('ring').style.strokeDashoffset = String(100.5 * (1 - progress));
  p.querySelector('svg').style.display = progress > 0 ? '' : 'none';
}

let hudKey = '';
let stKey = '';
export function stamina(v, out, boost) {
  $('staminaFill').style.transform = `scaleX(${Math.max(0, v) / 100})`;
  const k = (boost ? 'b' : out ? 'o' : v >= 100 ? 'f' : 'n');
  if (k === stKey) return;
  stKey = k;
  const el = $('stamina');
  el.classList.toggle('boost', !!boost);
  el.classList.toggle('out', !!out && !boost);
  el.classList.toggle('full', k === 'f');
  $('staminaLabel').textContent = boost ? 'ADRENALINE' : out ? 'OUT OF BREATH' : 'STAMINA';
}

export function hud({ floor, battery, breath, hidden, breathUrgent, items = [] }) {
  const key = [floor, Math.ceil(battery / 20), battery < 20, items.map((it) => [it.id, it.n, it.sub, it.key].join(':')).join(',')].join('|');
  if (key !== hudKey) {
    hudKey = key;
    $('floorLabel').textContent = floor;
    const b = $('battery');
    b.innerHTML = '';
    const bars = Math.ceil(battery / 20);
    for (let i = 0; i < 5; i++) { const x = document.createElement('i'); if (i >= bars) x.className = 'off'; b.appendChild(x); }
    b.classList.toggle('low', battery < 20);
    hotbar(items);
  }
  const br = $('breath');
  br.classList.toggle('on', !!hidden);
  br.classList.toggle('urgent', !!breathUrgent);
  if (hidden) $('breathFill').style.transform = `scaleX(${breath / 100})`;
}

// ---------- what you carry: five boxes along the bottom of the screen ----------
// a box holds one kind of thing, as many of it as you like. items: [{ id, name, n, sub, key }]
export const SLOTS = 5;
const ICON = {
  tag: '<rect x="11" y="5" width="18" height="28" rx="7" fill="#b08a3a" stroke="#e0bc64"/><circle cx="20" cy="11" r="2.2" fill="#140a06"/><path d="M13 24c4-2 9 1 14-1v7c-5 2-10 0-14 1z" fill="#7a0604"/>',
  syringe: '<g transform="rotate(-40 20 20)"><rect x="16" y="9" width="8" height="20" rx="1.5" fill="none" stroke="#d8cdb8"/><rect x="17" y="17" width="6" height="11" fill="#b01008"/><path d="M14 9h12M20 9V4M18 4h4M20 29v8" stroke="#d8cdb8" stroke-width="1.6"/></g>',
  gun: '<rect x="6" y="13" width="24" height="8" rx="2" fill="#5a5a58" stroke="#a8a49a"/><rect x="29" y="15" width="6" height="4" fill="#8a8680"/><path d="M12 21l-3 12h7l2-12z" fill="#3a2a20" stroke="#8a7a6a"/>',
  parts: '<rect x="5" y="9" width="14" height="6" rx="1.5" fill="#5a5a58" stroke="#a8a49a"/><path d="M24 20l-3 12h6l2-12z" fill="#3a2a20" stroke="#8a7a6a"/><circle cx="12" cy="27" r="4" fill="none" stroke="#a8a49a" stroke-width="1.6"/><rect x="25" y="8" width="9" height="4" fill="#8a8680"/>',
  fuse: '<rect x="11" y="14" width="18" height="12" rx="3" fill="rgba(200,220,230,.25)" stroke="#c8d8e0"/><rect x="6" y="15" width="6" height="10" fill="#b08a3a"/><rect x="28" y="15" width="6" height="10" fill="#b08a3a"/><path d="M12 20h16" stroke="#ffb040"/>',
  meat: '<path d="M8 22c0-8 8-13 16-11s10 9 6 15-18 6-22-4z" fill="#8a1410" stroke="#c84a40"/><path d="M14 20c4-3 9-3 12 1" stroke="#e8c8a0" stroke-width="2" fill="none"/><circle cx="31" cy="12" r="3" fill="#e8dcc0"/>',
  card: '<rect x="6" y="10" width="28" height="20" rx="2" fill="#d8d2bc" stroke="#f0e8d0"/><rect x="6" y="14" width="28" height="4" fill="#2a2622"/><rect x="9" y="21" width="7" height="7" fill="#7a6a5a"/>',
  key: '<circle cx="12" cy="20" r="6" fill="none" stroke="#a8a49a" stroke-width="2.5"/><path d="M18 20h16M29 20v6M33 20v5" stroke="#a8a49a" stroke-width="2.5"/>',
};
function hotbar(items) {
  const host = $('hotbar');
  let html = '';
  for (let i = 0; i < SLOTS; i++) {
    const it = items[i];
    if (!it) { html += '<div class="slot empty"></div>'; continue; }
    html += `<div class="slot" data-id="${it.id}"><svg viewBox="0 0 40 40">${ICON[it.id] || ''}</svg>`
      + (it.n > 1 ? `<span class="n">\u00D7${it.n}</span>` : '')
      + (it.key ? `<kbd>${it.key}</kbd>` : '')
      + `<span class="nm">${it.name}${it.sub ? `<i>${it.sub}</i>` : ''}</span></div>`;
  }
  host.innerHTML = html;
}

// the task sheet (TAB): rows of { text, count, done, now, sub }, then the extras underneath
export function tasks(title, rows, extra) {
  $('tasksBody').innerHTML = keys(`<h3>${title}</h3><ol>${rows.map((r) => `<li class="${r.done ? 'done' : ''}${r.now ? ' now' : ''}"><span>${r.text}${r.sub ? `<small>${r.sub}</small>` : ''}</span>${r.count ? `<b>${r.count}</b>` : ''}</li>`).join('')}</ol>`
    + (extra.length ? `<ul>${extra.map((e) => `<li>${e}</li>`).join('')}</ul>` : ''));
}

// ---------- the shift log ----------
export function timecard(save) {
  const rows = save.runs.slice(-7).reverse();
  const fmt = (s) => `${(s / 60) | 0}:${String((s % 60) | 0).padStart(2, '0')}`;
  $('timecard').classList.toggle('stamped', save.deaths > 0);
  $('timecard').innerHTML = `
    <h3>HOLLOW PINES MEATWORKS</h3>
    <p class="tc-sub">EMPLOYEE TIME CARD · NIGHT SHIFT</p>
    <table>
      <tr><th>SHIFT</th><th>DEEPEST</th><th>TAGS</th><th>HOURS</th></tr>
      ${rows.length ? rows.map((r) => `<tr><td>#${r.n}</td><td class="r">B${r.floor}</td><td>${r.tags}</td><td>${fmt(r.time)}</td></tr>`).join('') : '<tr><td colspan="4"><i>no shifts worked yet</i></td></tr>'}
    </table>
    <div class="tc-tot"><span>STORY: <b>${save.story.active ? 'ON B' + save.story.floor : save.story.done ? 'FINISHED' : 'NOT STARTED'}</b></span><span>OVERTIME BEST: <b>${save.best ? 'B' + save.best : '\u2014'}</b></span></div>
    ${save.deaths ? `<div class="stamp">PROCESSED ×${save.deaths}</div>` : ''}`;
}

// ---------- notes you find, and the shutter keypad ----------
let noteTimer = 0;
export function note(title, big, small) {
  $('noteTitle').textContent = title;
  $('noteBig').textContent = big;
  $('noteSmall').textContent = small || '';
  $('note').classList.add('on');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => $('note').classList.remove('on'), 8000);
}

export const keypad = {
  isOpen: false,
  closedAt: 0,
  digits: [],
  cb: null,
  open(cb) {
    this.cb = cb;
    this.digits = [];
    this.isOpen = true;
    this.render();
    $('keypad').classList.add('on');
  },
  close() {
    this.isOpen = false;
    this.closedAt = performance.now();
    $('keypad').classList.remove('on');
  },
  render() {
    const slots = $('kpSlots');
    slots.innerHTML = '';
    for (let i = 0; i < 4; i++) { const s = document.createElement('i'); s.textContent = this.digits[i] ?? ''; slots.appendChild(s); }
  },
  key(e) {
    if (!this.isOpen) return false;
    const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
    if (m && this.digits.length < 4) { this.digits.push(+m[1]); this.render(); }
    else if (e.code === 'Backspace') { this.digits.pop(); this.render(); }
    else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && this.digits.length === 4) {
      if (!this.cb(this.digits.slice())) {
        const p = $('keypad');
        p.classList.remove('wrong');
        void p.offsetWidth;
        p.classList.add('wrong');
        this.digits = [];
        this.render();
      }
    } else if (e.code === 'KeyE') this.close();
    else return false;
    return true;
  },
};
addEventListener('keydown', (e) => { if (keypad.key(e)) e.preventDefault(); });

// ---------- blood on the lens ----------
export class ScreenBlood {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.drips = [];
    this.fadeAcc = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    this.c.width = Math.round(innerWidth / 2);
    this.c.height = Math.round(innerHeight / 2);
  }
  // amount 0..1; edgesOnly keeps the centre clear (flecks from cutting)
  splash(amount, edgesOnly = false) {
    const W = this.c.width, H = this.c.height, g = this.g;
    const n = Math.ceil(1 + amount * 9);
    for (let i = 0; i < n; i++) {
      let x = Math.random() * W, y = Math.random() * H;
      if (edgesOnly) {
        const a = Math.random() * Math.PI * 2, r = 0.42 + Math.random() * 0.25;
        x = W / 2 + Math.cos(a) * W * r;
        y = H / 2 + Math.sin(a) * H * r;
      }
      const s = (edgesOnly ? 6 + Math.random() * 14 : 20 + Math.random() * 60) * (0.5 + amount) * (W / 900);
      lensSplat(g, x, y, s);
    }
  }
  // everything goes red
  drown() {
    const g = this.g, W = this.c.width, H = this.c.height;
    const film = g.createRadialGradient(W / 2, H / 2, W * 0.1, W / 2, H / 2, W * 0.7);
    film.addColorStop(0, 'rgba(90,0,0,0.55)');
    film.addColorStop(1, 'rgba(40,0,0,0.9)');
    g.fillStyle = film;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 30; i++) lensSplat(g, Math.random() * W, Math.random() * H, (50 + Math.random() * 110) * (W / 900), i % 2 === 0);
  }
  clear() { this.g.clearRect(0, 0, this.c.width, this.c.height); this.drips.length = 0; }
  update(dt) {
    const g = this.g;
    this.fadeAcc += dt;
    if (this.fadeAcc > 0.08) { // slow wash-out; quantised so the alpha step never rounds to zero
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = `rgba(0,0,0,${0.02 + this.fadeAcc * 0.02})`;
      g.fillRect(0, 0, this.c.width, this.c.height);
      g.globalCompositeOperation = 'source-over';
      this.fadeAcc = 0;
    }
    for (let i = this.drips.length - 1; i >= 0; i--) {
      const d = this.drips[i];
      const ny = d.y + d.v * dt;
      g.strokeStyle = `rgba(${BLOOD.dark},0.9)`;
      g.lineWidth = d.w;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(d.x, d.y);
      g.lineTo(d.x + (Math.random() - 0.5) * 0.6, ny);
      g.stroke();
      d.y = ny;
      d.v *= 0.995;
      d.life -= dt;
      if (d.life < 0) this.drips.splice(i, 1);
    }
  }
}
