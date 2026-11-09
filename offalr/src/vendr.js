// The remaster's vending machine (the break rooms in the offices): a real 1990s snack machine. Painted steel cabinet,
// a glass front onto five shelves of coils and what's left on them, the selection panel with its LED price, the coin
// slot and bill acceptor, the delivery flap. Built once and copied (it shares every shape and material).
import * as THREE from 'three';

const std = (o) => new THREE.MeshStandardMaterial(o);
const can = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
};
const put = (o, x, y, z, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };
const m = (g, mat, cast = true) => { const o = new THREE.Mesh(g, mat); o.castShadow = cast; o.receiveShadow = true; return o; };

let made = null;
export function vendingHD() {
  if (!made) made = THREE.ownRandom(build);
  return made.clone();
}

function build() {
  const g = new THREE.Group();
  const W = 0.9, H = 1.85, D = 0.75, F = D / 2; // the front is at z = F
  // the paint: deep red, chipped and scuffed at the edges, a faded logo down the side
  const paintOf = (logo) => can(256, 512, (c, w, h) => {
    c.fillStyle = '#7a1612'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,220,200' : '20,0,0'},${Math.random() * 0.05})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    if (logo) { c.save(); c.translate(w * 0.5, h * 0.5); c.rotate(-Math.PI / 2); c.textAlign = 'center';
    c.fillStyle = 'rgba(240,230,210,0.75)'; c.font = 'italic bold 64px "Arial Black", Impact, sans-serif'; c.fillText('PINE FRESH', 0, -10);
    c.font = 'bold 26px Arial, sans-serif'; c.fillText('SNACKS  ·  ICE COLD', 0, 34); c.restore(); }
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(150,140,130,${0.3 + Math.random() * 0.5})`; const x = Math.random() < 0.5 ? Math.random() * 8 : w - Math.random() * 8; c.fillRect(x, Math.random() * h, 2 + Math.random() * 6, 1 + Math.random() * 4); } // chips on the edges
    const gr = c.createLinearGradient(0, h * 0.8, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(30,20,10,0.6)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); // kicked and mopped round the bottom
  });
  const body = std({ map: paintOf(false), roughness: 0.45, metalness: 0.35 }), side = std({ map: paintOf(true), roughness: 0.45, metalness: 0.35 });
  const dark = std({ color: 0x18181a, roughness: 0.5, metalness: 0.4 });
  const chrome = std({ color: 0xc8ccd0, roughness: 0.2, metalness: 1 });
  const inside = std({ color: 0x2a2826, roughness: 0.8, emissive: 0x2a2620, emissiveIntensity: 0.6 });
  // the cabinet: back and sides in one, the front a frame round the window, the panel and the flap
  const winW = 0.6, winH = 1.18, winX = -0.1, winY = 1.17, top = winY + winH / 2, bot = winY - winH / 2;
  const back = 0.38, fz = -D / 2 + back; // the solid back half; the front half is hollow behind the glass
  g.add(put(m(new THREE.BoxGeometry(W, H, back), body), 0, H / 2, -D / 2 + back / 2));
  for (const sx of [-1, 1]) g.add(put(m(new THREE.BoxGeometry(0.03, H, D), side), sx * (W / 2 - 0.015), H / 2, 0));
  g.add(put(m(new THREE.BoxGeometry(W, H - top, D), body), 0, (H + top) / 2, 0));
  g.add(put(m(new THREE.BoxGeometry(W, bot, D), body), 0, bot / 2, 0));
  g.add(put(m(new THREE.BoxGeometry(0.05, winH, 0.06), body), -W / 2 + 0.025, winY, F - 0.03));
  // the panel to the right of the window, a solid block
  const pw = W / 2 - (winX + winW / 2), px = winX + winW / 2 + pw / 2;
  g.add(put(m(new THREE.BoxGeometry(pw, winH, D - back), dark), px, winY, (F + fz) / 2));
  // the window: the inside is a lit box of shelves; the glass over it
  g.add(put(m(new THREE.BoxGeometry(winW, winH, 0.02), inside, false), winX, winY, F - 0.36));
  for (const sx of [-1, 1]) g.add(put(m(new THREE.BoxGeometry(0.02, winH, 0.34), inside, false), winX + sx * winW / 2, winY, F - 0.19));
  g.add(put(m(new THREE.BoxGeometry(winW, 0.02, 0.34), std({ color: 0xffffff, emissive: 0xf0f4ff, emissiveIntensity: 2.2 }), false), winX, winY + winH / 2 - 0.012, F - 0.19)); // the tube along the top
  // what's for sale: cans, crisps, bars, mints; one design per kind, painted once
  const brands = [
    ['#c81818', '#ffffff', 'COLA'], ['#1a5aa8', '#ffe040', 'FIZZ'], ['#e0b020', '#7a1010', 'CHIPS'], ['#2a7a2a', '#ffffff', 'MINT'], ['#3a2010', '#e8c890', 'CHOC'], ['#e86010', '#ffffff', 'CHEESE'],
  ].map(([bg, fg, name]) => std({ roughness: 0.35, metalness: name === 'COLA' || name === 'FIZZ' ? 0.6 : 0.1, map: can(128, 128, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = fg; c.font = 'bold 30px "Arial Black", Impact, sans-serif'; c.textAlign = 'center'; c.fillText(name, w / 2, h / 2 + 10);
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, 12, w, 6); c.fillRect(0, h - 18, w, 6);
  }) }));
  const coil = new THREE.TorusGeometry(0.035, 0.0025, 4, 12);
  const canGeo = new THREE.CylinderGeometry(0.031, 0.031, 0.115, 14), bagGeo = new THREE.BoxGeometry(0.1, 0.15, 0.035), barGeo = new THREE.BoxGeometry(0.11, 0.035, 0.03);
  const shelfMat = std({ color: 0x8a8c8e, roughness: 0.4, metalness: 0.8 });
  for (let s = 0; s < 5; s++) {
    const y = winY - winH / 2 + 0.08 + s * 0.225;
    g.add(put(m(new THREE.BoxGeometry(winW - 0.02, 0.012, 0.33), shelfMat, false), winX, y, F - 0.19));
    // a price strip on the front of the shelf
    g.add(put(m(new THREE.BoxGeometry(winW - 0.02, 0.025, 0.004), std({ color: 0xe8e4d8, roughness: 0.7 }), false), winX, y - 0.006, F - 0.02));
    const kind = s < 2 ? 'can' : s < 4 ? 'bag' : 'bar';
    for (let k = 0; k < 4; k++) {
      const x = winX - winW / 2 + 0.08 + k * 0.145;
      for (let r = 0; r < 4; r++) g.add(put(m(coil, chrome, false), x, y + 0.04, F - 0.05 - r * 0.075, 0, Math.PI / 2, 0)); // the spiral, turn by turn
      const left = (s * 7 + k * 3) % 5; // how many are still in this row (some rows are empty)
      const mat = brands[(s * 2 + k) % brands.length];
      for (let r = 0; r < Math.min(left, 3); r++) {
        const z = F - 0.06 - r * 0.075;
        if (kind === 'can') g.add(put(m(canGeo, mat, false), x, y + 0.064, z));
        else if (kind === 'bag') g.add(put(m(bagGeo, mat, false), x, y + 0.082, z, -0.12 + Math.random() * 0.1, 0, (Math.random() - 0.5) * 0.12));
        else g.add(put(m(barGeo, mat, false), x, y + 0.03, z, 0.5, 0, 0));
      }
    }
  }
  const glass = std({ color: 0xb8c8c8, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false });
  g.add(put(m(new THREE.PlaneGeometry(winW, winH), glass, false), winX, winY, F + 0.001));
  // a smear on the glass, low down, where somebody put their hand
  const smear = std({ transparent: true, depthWrite: false, roughness: 0.6, map: can(128, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(90,6,4,0.75)';
    c.beginPath(); c.ellipse(64, 70, 18, 22, 0, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(40 + i * 15, 36 - (i === 1 || i === 2 ? 8 : 0), 5, 16, (i - 1.5) * 0.15, 0, Math.PI * 2); c.fill(); }
    c.beginPath(); c.ellipse(88, 70, 5, 13, -0.8, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 5; i++) c.fillRect(52 + i * 6, 88, 3, 20 + Math.random() * 30); // and it ran
  }) });
  g.add(put(m(new THREE.PlaneGeometry(0.2, 0.2), smear, false), winX + 0.12, winY - 0.32, F + 0.003));
  // the selection panel: the price, the keypad, the coins, the bills
  const pz = F + 0.001;
  const led = std({ color: 0x000000, emissive: 0xff2010, emissiveIntensity: 1.8, emissiveMap: can(128, 40, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 28px "Courier New", monospace'; c.fillText('$0.75', 14, 30); }) });
  g.add(put(m(new THREE.PlaneGeometry(0.12, 0.04), led, false), px, winY + 0.47, pz));
  const keys = std({ roughness: 0.5, map: can(128, 128, (c, w, h) => {
    c.fillStyle = '#202022'; c.fillRect(0, 0, w, h);
    const L = ['A', 'B', 'C', '1', 'D', 'E', 'F', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    c.font = 'bold 18px Arial, sans-serif'; c.textAlign = 'center';
    L.forEach((l, i) => { const x = 16 + (i % 4) * 32, y = 16 + ((i / 4) | 0) * 32; c.fillStyle = '#c8c4b8'; c.fillRect(x - 12, y - 12, 24, 24); c.fillStyle = '#1a1a1a'; c.fillText(l, x, y + 7); });
  }) });
  g.add(put(m(new THREE.BoxGeometry(0.12, 0.12, 0.012), keys, false), px, winY + 0.32, pz + 0.004));
  const sticker = std({ roughness: 0.8, map: can(128, 48, (c, w, h) => { c.fillStyle = '#f0d020'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = 'bold 15px Arial, sans-serif'; c.textAlign = 'center'; c.fillText('EXACT CHANGE', w / 2, 21); c.fillText('ONLY', w / 2, 40); }) });
  g.add(put(m(new THREE.PlaneGeometry(0.11, 0.04), sticker, false), px, winY + 0.2, pz));
  g.add(put(m(new THREE.BoxGeometry(0.06, 0.08, 0.012), chrome, false), px - 0.025, winY + 0.08, pz + 0.004)); // the coin plate
  g.add(put(m(new THREE.BoxGeometry(0.004, 0.035, 0.014), std({ color: 0x050505 }), false), px - 0.025, winY + 0.09, pz + 0.006)); // its slot
  g.add(put(m(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 10), chrome, false), px + 0.035, winY + 0.08, pz + 0.015, Math.PI / 2)); // coin return
  g.add(put(m(new THREE.BoxGeometry(0.09, 0.05, 0.02), std({ color: 0x0a0a0a, roughness: 0.3 }), false), px, winY - 0.05, pz + 0.008)); // the bill acceptor
  g.add(put(m(new THREE.BoxGeometry(0.06, 0.004, 0.022), std({ color: 0x000000, emissive: 0x30ff40, emissiveIntensity: 1.4 }), false), px, winY - 0.035, pz + 0.009));
  g.add(put(m(new THREE.BoxGeometry(0.07, 0.04, 0.03), dark, false), px, winY - 0.42, pz + 0.01)); // the coin cup
  // the delivery flap, low down
  g.add(put(m(new THREE.BoxGeometry(0.52, 0.2, 0.02), std({ color: 0x050505, roughness: 0.9 }), false), winX, 0.35, F + 0.001));
  const flap = std({ color: 0x2a2a2c, roughness: 0.4, metalness: 0.2, map: can(128, 48, (c, w, h) => { c.fillStyle = '#2a2a2c'; c.fillRect(0, 0, w, h); c.fillStyle = '#9a9a9a'; c.font = 'bold 18px Arial, sans-serif'; c.textAlign = 'center'; c.fillText('PUSH', w / 2, 30); }) });
  g.add(put(m(new THREE.BoxGeometry(0.5, 0.18, 0.012), flap, false), winX, 0.35, F + 0.012, -0.08));
  // feet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(put(m(new THREE.CylinderGeometry(0.025, 0.03, 0.03, 8), dark, false), sx * (W / 2 - 0.06), 0.015, sz * (D / 2 - 0.06)));
  g.position.y = 0.02;
  const out = new THREE.Group(); out.add(g);
  return out;
}
