// Keepsakes as objects you can turn over in your hands: each one modelled and painted on its own canvas,
// about 15-25 cm across, centred on the origin. The floor pickup is the same model, scaled down.
// keepsakeModel(id) builds one; KeepsakeViewer shows one big, lit, to drag round and zoom into.
import * as THREE from 'three';
import { canvas } from './textures.js';
import { refineKeepsake, studioEnvironment } from './keepsakesr.js';
import { remodel } from './keepsakeshd.js';
import { farmPhoto, motherPhoto } from './farmphoto.js';

const phong = (o) => new THREE.MeshPhongMaterial(o);
const K = THREE.REMASTERED ? 4 : 1; // the remaster paints them at 4x: sharp print, sharp handwriting
const tex = (w, h, draw) => { const { c, g } = canvas(w * K, h * K); if (K > 1) g.scale(K, K); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; return o; };
const at = (o, x, y, z, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };
const age = (g, w, h, n = 120) => { // grime, creases, foxing
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${90 + Math.random() * 40 | 0},${60 + Math.random() * 30 | 0},30,${Math.random() * 0.12})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 8, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, h * (0.3 + Math.random() * 0.4)); g.lineTo(w, h * (0.3 + Math.random() * 0.4)); g.stroke();
};
const blood = (g, w, h, n = 3) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${80 + Math.random() * 40 | 0},6,4,${0.5 + Math.random() * 0.4})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 10, 0, 7); g.fill(); } };
// (userData: what the remaster makes of them: a metal and how rough it is, paper, a glossy print)
const tag = (m, u) => Object.assign(m, { userData: u });
const gold = () => tag(phong({ color: 0xd8a840, shininess: 150, specular: 0xffeeaa }), { metal: 0.22 });
const steel = () => tag(phong({ color: 0xa8acae, shininess: 120, specular: 0xcccccc }), { metal: 0.3 });

// ---------- photographs ----------
const PHOTOS = {
  'photo-wedding': (g, w, h) => g.drawImage(farmPhoto(w, h), 0, 0), // the farmer and his two boys, in black and white
  'photo-mother': (g, w, h) => g.drawImage(motherPhoto(w, h), 0, 0), // her, on the porch, her face scratched out
  'photo-team': (g, w, h) => { // night shift, white coats, one face scratched off
    g.fillStyle = '#6a6a5a'; g.fillRect(0, 0, w, h); g.fillStyle = '#4a4a40'; g.fillRect(0, h * 0.7, w, h * 0.3);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) { const x = 20 + i * 38 + r * 18, y = 70 + r * 40; g.fillStyle = '#ddd8c8'; g.fillRect(x - 12, y, 24, 70); g.fillStyle = '#b8a088'; g.beginPath(); g.arc(x, y - 8, 9, 0, 7); g.fill(); }
    g.fillStyle = '#ddd8c8'; g.fillRect(w * 0.84 - 14, 30, 28, 110); // the tall one at the back
    g.strokeStyle = '#1a1410'; g.lineWidth = 2; for (let i = 0; i < 26; i++) { g.beginPath(); g.moveTo(w * 0.84 - 12 + Math.random() * 24, 8 + Math.random() * 30); g.lineTo(w * 0.84 - 12 + Math.random() * 24, 8 + Math.random() * 30); g.stroke(); }
    g.fillStyle = '#2a2018'; g.font = 'bold 11px monospace'; g.fillText('NIGHT SHIFT 1994', 10, h - 10);
  },
  'photo-kid': (g, w, h) => { // school photo: a girl, gap-toothed
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6a8aa8'); gr.addColorStop(1, '#3a5a78'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8a3a3a'; g.beginPath(); g.ellipse(w / 2, h * 0.95, 70, 60, 0, 0, 7); g.fill();
    g.fillStyle = '#e0b898'; g.beginPath(); g.ellipse(w / 2, h * 0.48, 44, 54, 0, 0, 7); g.fill();
    g.fillStyle = '#6a3a1a'; g.beginPath(); g.ellipse(w / 2, h * 0.36, 52, 40, 0, Math.PI, 0); g.fill(); g.fillRect(w / 2 - 54, h * 0.36, 16, 70); g.fillRect(w / 2 + 38, h * 0.36, 16, 70);
    g.fillStyle = '#1a1410'; g.beginPath(); g.arc(w / 2 - 16, h * 0.46, 4, 0, 7); g.arc(w / 2 + 16, h * 0.46, 4, 0, 7); g.fill();
    g.strokeStyle = '#7a2a2a'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h * 0.55, 16, 0.2, Math.PI - 0.2); g.stroke();
    g.fillStyle = '#fff'; g.fillRect(w / 2 - 6, h * 0.58, 4, 5); g.fillRect(w / 2 + 3, h * 0.58, 4, 5);
  },
  'photo-dog': (g, w, h) => { // Biscuit on the porch
    g.fillStyle = '#9a8a6a'; g.fillRect(0, 0, w, h); g.fillStyle = '#7a5a3a'; for (let i = 0; i < 8; i++) g.fillRect(0, h * 0.6 + i * 10, w, 7);
    g.fillStyle = '#c89848'; g.beginPath(); g.ellipse(w * 0.5, h * 0.62, 70, 34, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(w * 0.28, h * 0.48, 30, 26, 0, 0, 7); g.fill();
    g.fillStyle = '#8a6020'; g.beginPath(); g.ellipse(w * 0.22, h * 0.5, 9, 18, 0.4, 0, 7); g.fill(); g.fillStyle = '#1a1410'; g.beginPath(); g.arc(w * 0.18, h * 0.5, 4, 0, 7); g.arc(w * 0.28, h * 0.44, 3, 0, 7); g.fill();
  },
  'photo-you': (g, w, h) => { // a recent staff photo, and you're at the end of the row
    g.fillStyle = '#5a5a52'; g.fillRect(0, 0, w, h); g.fillStyle = '#3a3a34'; g.fillRect(0, h * 0.72, w, h);
    for (let i = 0; i < 6; i++) { const x = 26 + i * 40; g.fillStyle = i === 5 ? '#4a5a6a' : '#ddd8c8'; g.fillRect(x - 13, 70, 26, 80); g.fillStyle = '#b8a088'; g.beginPath(); g.arc(x, 60, 10, 0, 7); g.fill(); }
    g.strokeStyle = '#a01008'; g.lineWidth = 3; g.beginPath(); g.ellipse(26 + 5 * 40, 95, 26, 58, 0, 0, 7); g.stroke(); // somebody circled you in red
    g.fillStyle = '#a01008'; g.font = 'bold 13px monospace'; g.fillText('NEXT', 26 + 5 * 40 - 20, 172);
  },
};
// the remaster: the drawn picture made photographic: out of focus, grainy, the colours gone, the corners dark
function developed(cg, x, y, w, h) {
  const c = cg.canvas, k = K, t = document.createElement('canvas'); t.width = w * k; t.height = h * k;
  const tg = t.getContext('2d');
  tg.filter = `blur(${4 * k / 4}px) saturate(0.65) contrast(0.9) sepia(0.25)`;
  tg.drawImage(c, x * k, y * k, w * k, h * k, 0, 0, w * k, h * k);
  tg.filter = 'none';
  const d = tg.getImageData(0, 0, t.width, t.height), px = d.data;
  let s = 99991;
  for (let i = 0; i < px.length; i += 4) { s = (Math.imul(s, 48271) + 11) >>> 0; const n = ((s >>> 8) / 16777216 - 0.5) * 46; px[i] += n; px[i + 1] += n; px[i + 2] += n; }
  tg.putImageData(d, 0, 0);
  const v = tg.createRadialGradient(t.width / 2, t.height / 2, t.height * 0.25, t.width / 2, t.height / 2, t.width * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(30,18,6,0.55)');
  tg.fillStyle = v; tg.fillRect(0, 0, t.width, t.height);
  cg.save(); cg.setTransform(1, 0, 0, 1, 0, 0); cg.drawImage(t, x * k, y * k); cg.restore();
}
function photo(id) {
  const g = new THREE.Group();
  const t = tex(256, 300, (cg, w, h) => {
    cg.fillStyle = '#e8e2d2'; cg.fillRect(0, 0, w, h); // the white border of a print
    cg.save(); cg.beginPath(); cg.rect(16, 16, w - 32, 220); cg.clip(); cg.translate(16, 16); (PHOTOS[id] || PHOTOS['photo-dog'])(cg, w - 32, 220); cg.restore();
    if (K > 1) developed(cg, 16, 16, w - 32, 220);
    // sepia and fade
    if (id !== 'photo-wedding' && id !== 'photo-mother') { cg.fillStyle = 'rgba(140,100,40,.25)'; cg.fillRect(16, 16, w - 32, 220); }
    cg.fillStyle = '#4a3a2a'; cg.font = 'italic 16px serif'; cg.fillText({ 'photo-wedding': 'Eddie & John', 'photo-mother': 'Mother', 'photo-kid': "Daddy's girl", 'photo-dog': 'Biscuit', 'photo-team': '', 'photo-you': '' }[id] || '', 22, 270);
    age(cg, w, h, 160); if (id !== 'photo-dog') blood(cg, w, h, 2);
  });
  const back = tex(64, 64, (cg) => { cg.fillStyle = '#d8d0b8'; cg.fillRect(0, 0, 64, 64); age(cg, 64, 64, 40); });
  const card = mesh(new THREE.BoxGeometry(0.128, 0.15, 0.002), [...[0, 1, 2, 3].map(() => tag(phong({ map: back }), { paper: 1 })), tag(phong({ map: t, shininess: 30 }), { gloss: 0.32 }), tag(phong({ map: back }), { paper: 1 })]);
  // curled slightly, as old photos do
  card.rotation.x = -0.05;
  g.add(card);
  return g;
}

// ---------- printed cards and papers ----------
const CARDS = {
  'card-farm': { w: 0.14, h: 0.19, bg: '#e6e0cc', draw: (g, w) => { g.fillStyle = '#2a2018'; g.font = 'bold 15px serif'; g.fillText('COUNTY OF HOLLOW PINES', 30, 30); g.font = 'bold 20px serif'; g.fillText('NOTICE OF DEMOLITION', 18, 70); g.font = '12px monospace'; ['The farm on Route 9', 'is condemned and will', 'be demolished on:', '', 'THE FIRST OF THE MONTH'].forEach((l, i) => g.fillText(l, 22, 110 + i * 18)); g.strokeStyle = '#203070'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(20, 186 + i * 4); g.lineTo(w - 40, 186 + i * 4); g.stroke(); } g.strokeStyle = 'rgba(150,20,20,.8)'; g.lineWidth = 3; g.beginPath(); g.arc(w - 60, 300, 36, 0, 7); g.stroke(); } },
  'card-eddie': { w: 0.089, h: 0.051, bg: '#efe8d6', draw: (g) => { g.fillStyle = '#7a1a10'; g.fillRect(0, 0, 10, 160); g.font = 'bold 30px serif'; g.fillText('EDDIE’S', 24, 48); g.fillStyle = '#2a2018'; g.font = 'bold 20px serif'; g.fillText('QUALITY MEATS', 24, 76); g.font = '12px monospace'; g.fillText('Route 9 East. Ask for Eddie.', 24, 110); } },
  'card-union': { w: 0.09, h: 0.056, bg: '#c8b890', draw: (g, w, h) => { g.fillStyle = '#7a1a10'; g.fillRect(0, 0, w, 40); g.fillStyle = '#f0e8d0'; g.font = 'bold 18px serif'; g.fillText('LOCAL 112', 12, 27); g.fillStyle = '#2a2018'; g.font = '13px monospace'; g.fillText('MEAT CUTTERS & ALLIED', 12, 64); g.fillText('DUES PAID: MAR', 12, 84); g.fillStyle = '#1a1410'; g.fillRect(150, 100, 90, 30); g.fillStyle = '#c8b890'; g.fillRect(155, 105, 80, 20); g.fillStyle = '#2a2018'; g.font = '10px monospace'; g.fillText('SIGNATURE', 12, 120); } },
  'card-time': { w: 0.08, h: 0.16, bg: '#d8ccaa', draw: (g, w, h) => { g.fillStyle = '#2a2018'; g.font = 'bold 15px monospace'; g.fillText('HOLLOW PINES', 10, 22); g.font = '12px monospace'; g.fillText('TIME CARD  No. 0451', 10, 40); for (let i = 0; i < 14; i++) { g.strokeStyle = 'rgba(40,30,20,.4)'; g.beginPath(); g.moveTo(8, 56 + i * 30); g.lineTo(w - 8, 56 + i * 30); g.stroke(); g.fillStyle = '#5a1a10'; g.font = '13px monospace'; g.fillText('IN  22:00', 14, 76 + i * 30); g.fillStyle = 'rgba(40,30,20,.5)'; g.fillText('OUT  ----', 120, 76 + i * 30); } } },
  'card-id': { w: 0.07, h: 0.1, bg: '#e8e4d8', draw: (g, w, h) => { g.fillStyle = '#c8a020'; g.fillRect(0, 0, w, 60); g.fillStyle = '#1a1410'; g.font = 'bold 30px sans-serif'; g.fillText('VISITOR', 18, 42); g.font = '16px monospace'; g.fillText('INSPECTION', 20, 100); g.fillText('DEPT. OF AGRIC.', 20, 124); g.fillStyle = '#9a9a92'; g.fillRect(70, 150, 110, 130); g.fillStyle = '#5a4a3a'; g.beginPath(); g.arc(125, 200, 30, 0, 7); g.fill(); } },
  'card-letter': { w: 0.14, h: 0.19, bg: '#e8e2cc', draw: (g, w, h) => { g.fillStyle = '#2a2018'; g.font = 'bold 15px serif'; g.fillText('HOLLOW PINES MEATWORKS', 16, 30); g.font = '12px serif'; ['Dear employee,', '', 'Your employment is terminated', 'effective immediately.', '', 'Please report to the lower', 'floors to collect your', 'final pay.', '', 'Management'].forEach((l, i) => g.fillText(l, 16, 70 + i * 22)); } },
  'card-contract': { w: 0.14, h: 0.19, bg: '#e0d8c0', draw: (g, w, h) => { g.fillStyle = '#2a2018'; g.font = '11px serif'; ['4.', '', '...the Employee agrees to', 'remain on the premises until', 'the Quota is met, and', 'acknowledges that the Quota', 'is not fixed.', '', '5.', '', 'The Employee consents to', 'reassignment at the discretion', 'of the Foreman.'].forEach((l, i) => g.fillText(l, 16, 30 + i * 20)); g.fillStyle = '#7a1a10'; g.font = 'bold 12px serif'; g.fillText('page 4 of 11', 150, h - 14); } },
};
function card(id) {
  const c = CARDS[id];
  const front = tex(256, Math.round(256 * c.h / c.w), (g, w, h) => { g.fillStyle = c.bg; g.fillRect(0, 0, w, h); c.draw(g, w, h); age(g, w, h, 90); blood(g, w, h, 2); });
  const side = tag(phong({ color: 0xc8bc9c }), { paper: 1 });
  const m = mesh(new THREE.BoxGeometry(c.w, c.h, 0.0015), [side, side, side, side, tag(phong({ map: front, shininess: 10 }), { paper: 1 }), side]);
  const g = new THREE.Group(); g.add(m);
  if (id === 'card-id') { const clip = mesh(new THREE.BoxGeometry(0.02, 0.012, 0.004), steel()); clip.position.set(0, c.h / 2 + 0.004, 0.002); g.add(clip); }
  return g;
}

// ---------- the rest, one by one ----------
function bear() {
  const g = new THREE.Group(), fur = phong({ color: 0x7a5a3a, shininess: 4, map: tex(64, 64, (cg) => { cg.fillStyle = '#7a5a3a'; cg.fillRect(0, 0, 64, 64); for (let i = 0; i < 600; i++) { cg.fillStyle = `rgba(${40 + Math.random() * 60 | 0},${30 + Math.random() * 40 | 0},20,.5)`; cg.fillRect(Math.random() * 64, Math.random() * 64, 1, 3); } }) });
  const body = mesh(new THREE.SphereGeometry(0.05, 16, 12), fur); body.scale.set(1, 1.2, 0.85); g.add(at(body, 0, -0.02, 0));
  const head = mesh(new THREE.SphereGeometry(0.04, 16, 12), fur); g.add(at(head, 0, 0.065, 0.005));
  const ear = mesh(new THREE.SphereGeometry(0.014, 10, 8), fur); g.add(at(ear, -0.03, 0.098, 0));
  const stub = mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.01, 8), phong({ color: 0x5a3a20 })); g.add(at(stub, 0.03, 0.095, 0, 0, 0, -0.6)); // the chewed one
  const snout = mesh(new THREE.SphereGeometry(0.016, 10, 8), phong({ color: 0xa88a6a })); snout.scale.z = 0.8; g.add(at(snout, 0, 0.055, 0.04));
  const black = phong({ color: 0x080808, shininess: 120 });
  g.add(at(mesh(new THREE.SphereGeometry(0.006, 8, 6), black), 0, 0.06, 0.054));
  for (const s of [-1, 1]) { g.add(at(mesh(new THREE.SphereGeometry(0.0055, 8, 6), black), s * 0.015, 0.075, 0.036)); const arm = mesh(new THREE.SphereGeometry(0.018, 10, 8), fur); arm.scale.set(0.8, 1.6, 0.8); g.add(at(arm, s * 0.05, 0.0, 0.01, 0, 0, s * 0.5)); const leg = mesh(new THREE.SphereGeometry(0.02, 10, 8), fur); leg.scale.set(0.9, 0.9, 1.4); g.add(at(leg, s * 0.028, -0.07, 0.025)); }
  const stain = mesh(new THREE.SphereGeometry(0.02, 10, 8), phong({ color: 0x3a0806, shininess: 40 })); stain.scale.set(1.2, 0.5, 0.4); g.add(at(stain, 0.01, -0.02, 0.04));
  return g;
}
function truck() {
  const g = new THREE.Group(), tin = phong({ color: 0xa82a1a, shininess: 90, specular: 0x886666 }), cream = phong({ color: 0xd8ccaa, shininess: 80 });
  const side = tex(128, 48, (cg, w, h) => { cg.fillStyle = '#d8ccaa'; cg.fillRect(0, 0, w, h); cg.fillStyle = '#7a1a10'; cg.font = 'bold 16px sans-serif'; cg.fillText('HOLLOW', 8, 20); cg.fillText('PINES', 8, 40); for (let i = 0; i < 40; i++) { cg.fillStyle = `rgba(110,60,20,${Math.random() * 0.5})`; cg.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
  const box = mesh(new THREE.BoxGeometry(0.11, 0.05, 0.05), [cream, cream, cream, cream, phong({ map: side }), phong({ map: side })]); g.add(at(box, -0.02, 0.035, 0));
  g.add(at(mesh(new THREE.BoxGeometry(0.04, 0.04, 0.048), tin), 0.06, 0.03, 0));
  g.add(at(mesh(new THREE.BoxGeometry(0.02, 0.02, 0.046), phong({ color: 0x4a6a7a, shininess: 140 })), 0.07, 0.042, 0));
  for (const [x, z] of [[-0.05, 0.026], [-0.05, -0.026], [0.06, 0.026], [0.06, -0.026]]) g.add(at(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.008, 12), phong({ color: 0x1a1a1a })), x, 0.012, z, Math.PI / 2));
  return g;
}
function cassette(label, sub) {
  const g = new THREE.Group(), shell = phong({ color: 0x1a1a1a, shininess: 70, specular: 0x444444 });
  const lt = tex(256, 160, (cg, w, h) => { cg.fillStyle = '#1a1a1a'; cg.fillRect(0, 0, w, h); cg.fillStyle = '#e8e0c8'; cg.fillRect(14, 12, w - 28, 80); cg.fillStyle = '#7a1a10'; cg.fillRect(14, 12, w - 28, 10); cg.fillStyle = '#1a1410'; cg.font = 'bold 16px monospace'; cg.fillText(label, 22, 50); cg.font = '12px monospace'; cg.fillText(sub, 22, 74); cg.fillStyle = '#0a0a0a'; cg.fillRect(60, 100, 136, 40); cg.fillStyle = '#3a2a1a'; cg.beginPath(); cg.arc(95, 120, 14, 0, 7); cg.arc(160, 120, 14, 0, 7); cg.fill(); cg.fillStyle = '#ddd'; cg.beginPath(); cg.arc(95, 120, 5, 0, 7); cg.arc(160, 120, 5, 0, 7); cg.fill(); blood(cg, w, h, 1); });
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.064, 0.012), [shell, shell, shell, shell, phong({ map: lt, shininess: 60 }), shell]));
  return g;
}
function dictaphone() {
  const g = new THREE.Group(), body = phong({ color: 0x2a2a2a, shininess: 60, specular: 0x555555 });
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.11, 0.022), body));
  const grille = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.003, 16), phong({ color: 0x555555, shininess: 90 })); g.add(at(grille, 0, 0.032, 0.012, Math.PI / 2));
  const win = mesh(new THREE.BoxGeometry(0.036, 0.022, 0.002), phong({ color: 0x1a2a2a, shininess: 140, specular: 0x88aaaa, transparent: true, opacity: 0.8 })); g.add(at(win, 0, -0.012, 0.012));
  for (let i = 0; i < 4; i++) g.add(at(mesh(new THREE.BoxGeometry(0.008, 0.012, 0.004), phong({ color: [0x8a1a10, 0x2a2a2a, 0x2a2a2a, 0x2a2a2a][i] })), 0.026, 0.03 - i * 0.016, 0));
  g.add(at(mesh(new THREE.SphereGeometry(0.0025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2010 })), -0.016, 0.048, 0.012));
  return g;
}
function key(kind) {
  const g = new THREE.Group(), brass = tag(phong({ color: 0xb0903a, shininess: 120, specular: 0xffeeaa }), { metal: 0.32 });
  if (kind === 'key-tag') { // a blank brass ID tag, punched, on a loop of wire
    const t = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.002, 28), brass); g.add(at(t, 0, 0, 0, Math.PI / 2));
    g.add(at(mesh(new THREE.TorusGeometry(0.012, 0.0012, 6, 16), steel()), 0, 0.04, 0));
    g.add(at(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.003, 10), phong({ color: 0x111111 })), 0, 0.024, 0, Math.PI / 2));
    return g;
  }
  const bow = mesh(new THREE.TorusGeometry(0.014, 0.004, 8, 18), brass); g.add(at(bow, -0.04, 0, 0));
  const blade = mesh(new THREE.BoxGeometry(0.06, 0.008, 0.0025), brass); g.add(at(blade, 0.002, 0, 0));
  for (let i = 0; i < 4; i++) g.add(at(mesh(new THREE.BoxGeometry(0.005, 0.006 + Math.random() * 0.005, 0.0025), brass), 0.012 + i * 0.007, -0.006, 0));
  const ring = mesh(new THREE.TorusGeometry(0.02, 0.0015, 6, 20), steel()); g.add(at(ring, -0.06, 0, 0));
  if (kind === 'key-locker') { const t = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.002, 20), phong({ map: tex(64, 64, (cg) => { cg.fillStyle = '#c8a040'; cg.fillRect(0, 0, 64, 64); cg.fillStyle = '#2a1a0a'; cg.font = 'bold 26px monospace'; cg.fillText('41', 16, 42); }) })); g.add(at(t, -0.085, -0.01, 0, Math.PI / 2)); }
  else { const fob = mesh(new THREE.BoxGeometry(0.03, 0.045, 0.012), phong({ color: 0x1a1a1a, shininess: 50 })); g.add(at(fob, -0.085, -0.015, 0)); const bl = mesh(new THREE.BoxGeometry(0.04, 0.007, 0.0025), steel()); g.add(at(bl, -0.04, -0.03, 0.006, 0, 0, 0.5)); }
  return g;
}
function ring() { const g = new THREE.Group(); const r = mesh(new THREE.TorusGeometry(0.0105, 0.0014, 12, 40), gold()); r.scale.z = 2.6; /* a thin flat band, not a doughnut */ g.add(r); g.scale.setScalar(2.2); return g; }
function tooth(kind) {
  const g = new THREE.Group(), enamel = phong({ color: 0xe8e0c8, shininess: 80 }), root = phong({ color: 0xa88866, shininess: 30 });
  if (kind === 'tooth-milk') { // a matchbox, open, with the tooth in it
    const box = mesh(new THREE.BoxGeometry(0.05, 0.012, 0.035), phong({ color: 0xc8b890 })); g.add(at(box, 0, -0.006, 0));
    const lid = mesh(new THREE.BoxGeometry(0.052, 0.014, 0.037), phong({ map: tex(128, 96, (cg) => { cg.fillStyle = '#c8402a'; cg.fillRect(0, 0, 128, 96); cg.fillStyle = '#f0e0b0'; cg.font = 'bold 16px serif'; cg.fillText('SAFETY', 30, 40); cg.fillText('MATCHES', 22, 64); }) })); g.add(at(lid, 0.035, 0.008, 0));
    const t = mesh(new THREE.SphereGeometry(0.006, 10, 8), enamel); t.scale.y = 1.4; g.add(at(t, -0.008, 0.004, 0));
    const note = mesh(new THREE.BoxGeometry(0.03, 0.001, 0.02), phong({ map: tex(96, 64, (cg) => { cg.fillStyle = '#f0ece0'; cg.fillRect(0, 0, 96, 64); cg.fillStyle = '#2a2a8a'; cg.font = '11px cursive'; cg.fillText('for the tooth', 6, 24); cg.fillText('fairy - Danny', 6, 44); }) })); g.add(at(note, 0.008, 0.001, 0.004, 0, 0.3));
    g.scale.setScalar(1.8);
    return g;
  }
  const crown = mesh(new THREE.CylinderGeometry(0.0105, 0.009, 0.011, 14), gold()); g.add(at(crown, 0, 0.012, 0));
  const cusp = mesh(new THREE.SphereGeometry(0.0105, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold()); cusp.scale.y = 0.35; g.add(at(cusp, 0, 0.0175, 0));
  for (const s of [-1, 1]) { const r = mesh(new THREE.ConeGeometry(0.0042, 0.024, 8), root); g.add(at(r, s * 0.0045, -0.005, 0, Math.PI, 0, s * 0.12)); }
  g.add(at(mesh(new THREE.SphereGeometry(0.0028, 8, 6), phong({ color: 0x5a0806, shininess: 60 })), 0.004, -0.013, 0.002));
  g.scale.setScalar(2.4);
  return g;
}
function misc(id) {
  const g = new THREE.Group();
  if (id === 'misc-ledger') { // a cloth-bound book
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.135, 0.03), phong({ color: 0x3a2a1e, shininess: 8 })));
    g.add(at(mesh(new THREE.BoxGeometry(0.094, 0.13, 0.031), phong({ color: 0xd8ccaa, shininess: 4 })), 0.004, 0, 0));
    g.add(at(mesh(new THREE.BoxGeometry(0.05, 0.02, 0.002), phong({ color: 0xc8b890 })), 0, 0.03, 0.016));
    g.scale.setScalar(1.4); return g;
  }
  if (id === 'misc-rosary') {
    const wood = phong({ color: 0x5a3a1e, shininess: 30 });
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; const b = mesh(new THREE.SphereGeometry(i % 10 === 0 ? 0.0055 : 0.004, 8, 6), wood); g.add(at(b, Math.cos(a) * 0.05, Math.sin(a) * 0.035 + 0.02, 0)); }
    const cr = phong({ color: 0x8a7a5a, shininess: 60 });
    g.add(at(mesh(new THREE.BoxGeometry(0.006, 0.04, 0.004), cr), 0, -0.04, 0)); g.add(at(mesh(new THREE.BoxGeometry(0.024, 0.006, 0.004), cr), 0, -0.032, 0));
    return g;
  }
  if (id === 'misc-lighter') {
    const chrome = tag(phong({ color: 0xc8ccd0, shininess: 160, specular: 0xffffff, map: tex(128, 160, (cg) => { cg.fillStyle = '#c8ccd0'; cg.fillRect(0, 0, 128, 160); cg.strokeStyle = '#5a5e62'; cg.font = 'italic 13px serif'; cg.fillStyle = '#4a4e52'; for (let i = 0; i < 40; i++) { cg.strokeStyle = `rgba(80,80,80,${Math.random() * 0.4})`; cg.beginPath(); const x = Math.random() * 128, y = Math.random() * 160; cg.moveTo(x, y); cg.lineTo(x + Math.random() * 20, y + Math.random() * 4); cg.stroke(); } }) }), { metal: 0.26 });
    g.add(at(mesh(new THREE.BoxGeometry(0.038, 0.04, 0.013), chrome), 0, -0.012, 0));
    const lid = mesh(new THREE.BoxGeometry(0.038, 0.018, 0.013), chrome); g.add(at(lid, -0.012, 0.022, 0, 0, 0, 1.0)); // flipped open
    g.add(at(mesh(new THREE.BoxGeometry(0.014, 0.012, 0.008), phong({ color: 0x6a6e72, shininess: 80 })), 0.005, 0.014, 0));
    g.scale.setScalar(2);
    return g;
  }
  if (id === 'misc-glasses') {
    const frame = phong({ color: 0x2a2018, shininess: 80 }), lens = phong({ color: 0xd8e8e8, transparent: true, opacity: 0.3, shininess: 160, specular: 0xffffff });
    for (const s of [-1, 1]) { g.add(at(mesh(new THREE.TorusGeometry(0.022, 0.0025, 8, 24), frame), s * 0.028, 0, 0)); g.add(at(mesh(new THREE.CircleGeometry(0.021, 24), lens), s * 0.028, 0, 0)); g.add(at(mesh(new THREE.BoxGeometry(0.003, 0.003, 0.06), frame), s * 0.05, 0.004, -0.03, 0, s * 0.2, 0)); }
    g.add(at(mesh(new THREE.TorusGeometry(0.006, 0.002, 6, 10, Math.PI), frame), 0, 0.006, 0));
    // the crack: a star of dark lines across one lens
    const crack = mesh(new THREE.CircleGeometry(0.021, 24), phong({ map: tex(64, 64, (cg) => { cg.clearRect(0, 0, 64, 64); cg.strokeStyle = 'rgba(40,40,40,.9)'; cg.lineWidth = 1; for (let i = 0; i < 9; i++) { const a = Math.random() * 7; cg.beginPath(); cg.moveTo(30, 34); cg.lineTo(30 + Math.cos(a) * 40, 34 + Math.sin(a) * 40); cg.stroke(); } }), transparent: true }));
    g.add(at(crack, 0.028, 0, 0.0005));
    g.scale.setScalar(1.6);
    return g;
  }
  if (id === 'misc-watch') {
    const face = tex(128, 128, (cg) => { cg.fillStyle = '#e8e2d0'; cg.beginPath(); cg.arc(64, 64, 62, 0, 7); cg.fill(); cg.fillStyle = '#1a1410'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; cg.fillRect(64 + Math.sin(a) * 50 - 2, 64 - Math.cos(a) * 50 - 5, 4, 10); } cg.lineWidth = 5; cg.strokeStyle = '#1a1410'; cg.beginPath(); cg.moveTo(64, 64); const ha = (3 + 12 / 60) / 12 * Math.PI * 2; cg.lineTo(64 + Math.sin(ha) * 30, 64 - Math.cos(ha) * 30); cg.stroke(); cg.lineWidth = 3; cg.beginPath(); cg.moveTo(64, 64); const ma = 12 / 60 * Math.PI * 2; cg.lineTo(64 + Math.sin(ma) * 46, 64 - Math.cos(ma) * 46); cg.stroke(); cg.strokeStyle = 'rgba(40,40,40,.8)'; cg.lineWidth = 1; cg.beginPath(); cg.moveTo(20, 30); cg.lineTo(100, 90); cg.stroke(); });
    const caseM = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.008, 28), steel()); g.add(at(caseM, 0, 0, 0, Math.PI / 2));
    const dial = mesh(new THREE.CircleGeometry(0.018, 28), phong({ map: face, shininess: 140, specular: 0xffffff })); g.add(at(dial, 0, 0, 0.0042));
    const strap = phong({ color: 0x3a2414, shininess: 20 });
    for (const s of [-1, 1]) g.add(at(mesh(new THREE.BoxGeometry(0.016, 0.05, 0.003), strap), 0, s * 0.042, -0.002, s * 0.2));
    g.scale.setScalar(2);
    return g;
  }
  if (id === 'misc-cross') {
    const tin = tag(phong({ color: 0x8a8e90, shininess: 90, map: tex(64, 128, (cg) => { cg.fillStyle = '#8a8e90'; cg.fillRect(0, 0, 64, 128); cg.fillStyle = '#2a2a2a'; cg.font = 'bold 8px monospace'; cg.save(); cg.translate(36, 10); cg.rotate(Math.PI / 2); cg.fillText("IT DOESN'T SLEEP", 0, 0); cg.fillText("IT DOESN'T NEED TO", 0, 12); cg.restore(); }) }), { metal: 0.45 });
    g.add(mesh(new THREE.BoxGeometry(0.014, 0.08, 0.003), tin));
    g.add(at(mesh(new THREE.BoxGeometry(0.05, 0.014, 0.003), tin), 0, 0.015, 0));
    g.add(at(mesh(new THREE.TorusGeometry(0.005, 0.001, 6, 12), steel()), 0, 0.045, 0));
    g.scale.setScalar(1.6);
    return g;
  }
  return g;
}

// buildId: what the original would have built here (built the same, so the game's dice don't move); id: what it is
export function keepsakeModel(buildId, id = buildId) {
  const g = buildKeepsake(buildId);
  THREE.ownRandom(() => {
    if (THREE.REMASTERED) { // the remaster's own model where it has one (keepsakeshd.js), the original refined where not
      const hd = remodel(id);
      if (hd) { g.clear(); g.add(hd); return; }
      if (id !== buildId) { g.clear(); g.add(...buildKeepsake(id).children); }
      refineKeepsake(g, id);
    } else if (id !== buildId) { g.clear(); g.add(...buildKeepsake(id).children); }
  });
  return g;
}
function buildKeepsake(id) {
  const kind = id.split('-')[0];
  if (kind === 'photo') return photo(id);
  if (kind === 'card') return card(id);
  if (id === 'toy-bear') return bear();
  if (id === 'toy-car') return truck();
  if (id === 'tape-msg') return cassette("DON'T TAPE OVER", 'messages - M.');
  if (id === 'tape-radio') return cassette('NIGHT SHIFT MIX', 'KEEP AWAKE  side A/B');
  if (id === 'tape-dictaphone') return dictaphone();
  if (kind === 'key') return key(id);
  if (id === 'ring-plain') return ring();
  if (kind === 'tooth') return tooth(id);
  return misc(id);
}

// ---------- the viewer ----------
// a separate little renderer on its own canvas, so it can sit over the game (or the menu)
export class KeepsakeViewer {
  constructor(canvasEl) {
    this.c = canvasEl;
    this.r = null;
    this.open = false;
    this.cache = new Map();
  }
  // build a keepsake and its shaders ahead of time (the ones lying on the floor, at the floor's load), so picking one
  // up shows it at once instead of stalling on its textures and programs
  preload(id) {
    if (this.cache.has(id)) return;
    this.init();
    const m = keepsakeModel(id);
    const bb = new THREE.Box3().setFromObject(m), size = bb.getSize(new THREE.Vector3()), mid = bb.getCenter(new THREE.Vector3());
    m.position.sub(mid);
    this.cache.set(id, { m, span: Math.max(size.x, size.y, size.z) });
    this.pivot.add(m); this.cam.position.set(0, 0, 1); this.cam.lookAt(0, 0, 0);
    try { this.r.compile(this.scene, this.cam); } catch {}
    this.pivot.remove(m);
  }
  init() {
    if (this.r) return;
    this.r = new THREE.WebGLRenderer({ canvas: this.c, antialias: true, alpha: true });
    this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.shadowMap.enabled = true;
    const s = (this.scene = new THREE.Scene());
    if (THREE.REMASTERED) THREE.ownRandom(() => { // a studio for them: filmic tone, reflections, soft shadows
      this.r.setPixelRatio(Math.min(2.5, window.devicePixelRatio || 1));
      this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.15;
      this.r.shadowMap.type = THREE.PCFSoftShadowMap;
      s.environment = studioEnvironment(this.r);
    });
    s.add(new THREE.HemisphereLight(0xd8d0c8, 0x1a1010, 1.1));
    const key = new THREE.SpotLight(0xfff0dc, 6, 3, 0.7, 0.6, 1.2); key.position.set(0.35, 0.45, 0.5); key.castShadow = true; s.add(key);
    if (THREE.REMASTERED) { key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 4; key.shadow.bias = -0.0004; }
    const rim = new THREE.PointLight(0xff4030, 2.2, 2, 1.5); rim.position.set(-0.4, 0.1, -0.35); s.add(rim);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
    this.pivot = new THREE.Group();
    s.add(this.pivot);
    let drag = null;
    this.c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; this.auto = false; this.c.setPointerCapture(e.pointerId); });
    this.c.addEventListener('pointermove', (e) => { if (!drag) return; this.ry += (e.clientX - drag.x) * 0.01; this.rx = Math.max(-1.4, Math.min(1.4, this.rx + (e.clientY - drag.y) * 0.01)); drag = { x: e.clientX, y: e.clientY }; });
    this.c.addEventListener('pointerup', () => (drag = null));
    this.c.addEventListener('wheel', (e) => { e.preventDefault(); this.dist = Math.max(0.12, Math.min(0.8, this.dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
  }
  show(id) {
    this.init();
    this.pivot.clear();
    this.preload(id); // (centred and fitted there; usually done already)
    const { m, span } = this.cache.get(id);
    this.pivot.add(m);
    this.dist = Math.max(0.16, span * 3.2);
    this.rx = 0.15; this.ry = -0.4; this.auto = true;
    this.open = true;
    const run = (this.run = (this.run || 0) + 1); // a second show() takes over from the first loop
    const loop = () => {
      if (!this.open || run !== this.run) return;
      requestAnimationFrame(loop);
      const w = this.c.clientWidth, h = this.c.clientHeight;
      if (this.c.width !== w || this.c.height !== h) { this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
      if (this.auto) this.ry += 0.006;
      this.pivot.rotation.set(this.rx, this.ry, 0);
      this.cam.position.set(0, 0, this.dist);
      this.cam.lookAt(0, 0, 0);
      this.r.render(this.scene, this.cam);
    };
    loop();
  }
  hide() { this.open = false; if (this.pivot) this.pivot.clear(); }
}
