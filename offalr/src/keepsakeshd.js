// OFFAL: REMASTERED: the keepsakes, modelled properly. Each is built for the close-up viewer (and shrunk for the
// floor): real shapes, painted at high resolution, the right materials (cloth with a sheen, brushed chrome, leather,
// paper with its folds). remodel(id) gives the model, or null for one that keeps the original's (refined) shape.
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../../vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { farmPhoto, motherPhoto } from './farmphoto.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let sd = 7;
const r = () => ((sd = (Math.imul(sd, 1103515245) + 12345) >>> 0) / 4294967296);
const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o; };
const at = (o, x, y, z, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };
function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); return c; }
function tex(c, srgb = true, rep = 1) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); return t; }
const std = (o) => new THREE.MeshStandardMaterial(o);
const phys = (o) => new THREE.MeshPhysicalMaterial(o);
const chrome = () => std({ color: 0xd0d4d8, roughness: 0.16, metalness: 1 });
const steel = () => std({ color: 0xb8bcc0, roughness: 0.3, metalness: 1 });
// film/paper grain laid over what's drawn, from a tile of noise: no reading the canvas back (a stall on the GPU)
let noiseTile = null;
function grain(g, w, h, a = 18) {
  if (!noiseTile) noiseTile = canvas(256, 256, (x) => { const d = x.createImageData(256, 256), p = d.data; for (let i = 0; i < p.length; i += 4) { const n = 128 + (r() - 0.5) * 255; p[i] = p[i + 1] = p[i + 2] = n; p[i + 3] = 255; } x.putImageData(d, 0, 0); });
  g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = Math.min(1, a / 40); g.fillStyle = g.createPattern(noiseTile, 'repeat'); g.fillRect(0, 0, w, h); g.restore();
}
function blob(g, x, y, rx, ry, c0, c1) { const gr = g.createRadialGradient(x - rx * 0.25, y - ry * 0.3, 1, x, y, Math.max(rx, ry)); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
// bend a flat sheet (a subdivided box) the way old paper bends
function curl(geo, w, h, amt) { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2); p.setZ(i, p.getZ(i) + (x * x * 0.6 + y * y * 0.25 + x * y * 0.15) * amt); } geo.computeVertexNormals(); return geo; }

// paper: fibres for a bump map, and a ragged outline (an alpha map) for paper that has been torn or nailed up
function fibres(w, h, n = 2600) { return canvas(w, h, (g) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { g.strokeStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 + r() * 0.12})`; g.lineWidth = 0.6 + r(); g.beginPath(); const x = r() * w, y = r() * h, a = r() * 6.28, l = 3 + r() * 12; g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.5, y + Math.sin(a + 0.5) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } }); }
function ragged(w, h, bites = 40, extra = null) {
  return canvas(w, h, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#000';
    for (let i = 0; i < bites; i++) { const side = i % 4, t = r(), d = 2 + r() * 7, x = side < 2 ? t * w : side === 2 ? 0 : w, y = side < 2 ? (side ? h : 0) : t * h; g.beginPath(); g.ellipse(x, y, d * (side < 2 ? 3 : 1), d * (side < 2 ? 1 : 3), 0, 0, 7); g.fill(); }
    if (extra) extra(g, w, h);
  });
}

// ---------- photographs ----------
function paintKid(g, w, h) {
  // a school photo: mottled studio blue, a red jumper, a gap-toothed grin
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#6f8cab'); bg.addColorStop(1, '#3d5b7a'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) blob(g, r() * w, r() * h, 30 + r() * 80, 30 + r() * 80, 'rgba(160,190,220,0.18)', 'rgba(160,190,220,0)');
  blob(g, w / 2, h * 1.02, w * 0.42, h * 0.3, '#b3443a', '#6e1e1a'); // jumper
  for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(80,20,16,0.25)'; g.lineWidth = 2; g.beginPath(); const x = w * 0.2 + r() * w * 0.6; g.moveTo(x, h * 0.8); g.lineTo(x + (r() - 0.5) * 20, h); g.stroke(); }
  blob(g, w / 2, h * 0.78, w * 0.08, h * 0.08, '#e2b495', '#b88466'); // neck
  // hair behind the face, then the face, then the fringe
  g.fillStyle = '#5a3418'; g.beginPath(); g.ellipse(w / 2, h * 0.42, w * 0.235, h * 0.21, 0, Math.PI, 0); g.fill(); // hair: over the top, down to the jaw each side
  for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(w / 2 + sx * w * 0.19, h * 0.52, w * 0.06, h * 0.14, sx * 0.15, 0, Math.PI * 2); g.fill(); }
  blob(g, w / 2, h * 0.5, w * 0.19, h * 0.23, '#f0c8a8', '#c99272');
  blob(g, w * 0.4, h * 0.56, w * 0.045, h * 0.03, 'rgba(230,120,110,0.45)', 'rgba(230,120,110,0)'); blob(g, w * 0.6, h * 0.56, w * 0.045, h * 0.03, 'rgba(230,120,110,0.45)', 'rgba(230,120,110,0)');
  for (const sx of [-1, 1]) { // eyes
    const x = w / 2 + sx * w * 0.07, y = h * 0.47;
    g.fillStyle = '#f4efe8'; g.beginPath(); g.ellipse(x, y, w * 0.032, h * 0.016, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5a3a1c'; g.beginPath(); g.arc(x, y, w * 0.016, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#100a06'; g.beginPath(); g.arc(x, y, w * 0.007, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(x - w * 0.006, y - h * 0.005, w * 0.004, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(90,50,30,0.7)'; g.lineWidth = 3; g.beginPath(); g.arc(x, y + h * 0.006, w * 0.035, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); // lid
    g.strokeStyle = '#4a2a12'; g.lineWidth = 5; g.beginPath(); g.arc(x, y + h * 0.03, w * 0.045, Math.PI * 1.25, Math.PI * 1.75); g.stroke(); // brow
  }
  g.strokeStyle = 'rgba(160,100,80,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, h * 0.5); g.quadraticCurveTo(w * 0.49, h * 0.55, w * 0.51, h * 0.56); g.stroke(); // nose
  g.fillStyle = '#7a2a28'; g.beginPath(); g.ellipse(w / 2, h * 0.615, w * 0.07, h * 0.03, 0, 0, Math.PI); g.fill(); // the grin
  g.fillStyle = '#f6f2ea'; g.fillRect(w * 0.455, h * 0.613, w * 0.03, h * 0.016); g.fillRect(w * 0.515, h * 0.613, w * 0.03, h * 0.016); // the teeth, with the gap
  for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(${70 + r() * 40 | 0},${40 + r() * 20 | 0},20,0.55)`; g.lineWidth = 1.5 + r() * 2; g.beginPath(); const a = Math.PI * (1.05 + r() * 0.9), x0 = w / 2 + Math.cos(a) * w * 0.05, y0 = h * 0.3; g.moveTo(x0, y0); g.quadraticCurveTo(w / 2 + Math.cos(a) * w * 0.2, h * 0.3 + r() * h * 0.05, w / 2 + Math.cos(a) * w * (0.15 + r() * 0.1), h * (0.33 + r() * 0.08)); g.stroke(); }
}
function develop(src) {
  return canvas(src.width, src.height, (g, w, h) => {
    g.filter = 'blur(1.5px) saturate(0.75) contrast(0.9) sepia(0.25)'; g.drawImage(src, 0, 0); g.filter = 'none';
    grain(g, w, h, 26);
    const v = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(40,24,8,0.5)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
  });
}
function photo(id) {
  const W = 768, H = 900, iw = W - 96, ih = 660;
  const farm = id === 'photo-wedding' || id === 'photo-mother'; // the farm: black and white prints
  const pic = id === 'photo-wedding' ? farmPhoto(iw, ih) : id === 'photo-mother' ? motherPhoto(iw, ih) : develop(canvas(iw, ih, paintKid));
  const front = canvas(W, H, (g) => {
    g.fillStyle = '#ece6d4'; g.fillRect(0, 0, W, H);
    if (!farm) g.drawImage(pic, 48, 48);
    g.fillStyle = 'rgba(120,90,40,0.1)'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(110,80,40,${r() * 0.08})`; g.beginPath(); g.arc(r() * W, r() * H, 4 + r() * 30, 0, Math.PI * 2); g.fill(); } // foxing
    if (farm) g.drawImage(pic, 48, 48); // (the picture itself stays black and white: the paper yellows round it)
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, H * 0.45); g.lineTo(W, H * 0.5); g.stroke(); // a crease
  });
  const back = canvas(W, H, (g) => {
    g.fillStyle = '#e4dcc6'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(80,70,60,0.22)'; g.font = 'bold 34px sans-serif'; for (let y = 60; y < H; y += 150) for (let x = 20; x < W; x += 300) { g.save(); g.translate(x, y); g.rotate(-0.3); g.fillText('KODAK PAPER', 0, 0); g.restore(); }
    g.fillStyle = 'rgba(40,40,60,0.85)'; g.font = 'italic 56px cursive'; g.fillText(id === 'photo-kid' ? 'Daddy’s girl' : id === 'photo-mother' ? 'Mother, on the porch' : 'Eddie & John', 70, 420);
    grain(g, W, H, 12);
  });
  const pw = 0.128, ph = 0.15, geo = curl(new THREE.BoxGeometry(pw, ph, 0.0015, 24, 28, 1), pw, ph, 0.006);
  const edge = std({ color: 0xe0d8c4, roughness: 0.85 });
  const g = new THREE.Group();
  g.add(mesh(geo, [edge, edge, edge, edge, phys({ map: tex(front), roughness: 0.28, clearcoat: 0.4, clearcoatRoughness: 0.3 }), std({ map: tex(back), roughness: 0.9 })]));
  return g;
}

// ---------- the letter ----------
function letter() {
  const W = 768, H = 1000;
  const face = canvas(W, H, (g) => {
    g.fillStyle = '#efe9d8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#7a1a10'; g.fillRect(60, 60, 70, 70); g.fillStyle = '#efe9d8'; g.font = 'bold 48px serif'; g.fillText('HP', 66, 112);
    g.fillStyle = '#2a2018'; g.font = 'bold 34px serif'; g.fillText('HOLLOW PINES MEATWORKS', 150, 92); g.font = '22px serif'; g.fillText('Personnel Office · Route 9 · Hollow Pines', 150, 124);
    g.fillRect(60, 150, W - 120, 2);
    g.font = '24px "Courier New", monospace';
    const lines = ['October 30, 1998', '', 'Dear employee,', '', 'Your employment is terminated', 'effective immediately.', '', 'Please report to the lower floors', 'to collect your final pay.', '', '', 'Management'];
    lines.forEach((l, i) => { for (let k = 0; k < l.length; k++) { g.fillStyle = `rgba(30,24,20,${0.7 + r() * 0.3})`; g.fillText(l[k], 70 + k * 14.4, 230 + i * 44 + (r() - 0.5) * 1.5); } });
    g.strokeStyle = 'rgba(30,40,90,0.85)'; g.lineWidth = 3; g.beginPath(); g.moveTo(80, 760); for (let i = 0; i < 12; i++) g.quadraticCurveTo(100 + i * 18, 730 + (i % 2) * 50, 110 + i * 18, 760); g.stroke(); // the signature
    g.save(); g.translate(500, 800); g.rotate(-0.25); g.strokeStyle = 'rgba(160,20,20,0.7)'; g.lineWidth = 6; g.strokeRect(-110, -40, 220, 80); g.fillStyle = 'rgba(160,20,20,0.7)'; g.font = 'bold 54px sans-serif'; g.fillText('FINAL', -80, 18); g.restore();
    g.strokeStyle = 'rgba(120,80,40,0.35)'; g.lineWidth = 10; g.beginPath(); g.arc(560, 330, 70, 0.3, Math.PI * 1.85); g.stroke(); // a coffee ring
    blob(g, 160, 880, 26, 34, 'rgba(110,10,6,0.75)', 'rgba(110,10,6,0.1)'); // a bloody thumb
    for (let i = 0; i < 18; i++) { g.strokeStyle = 'rgba(90,6,4,0.45)'; g.lineWidth = 2; g.beginPath(); g.arc(160, 880, 6 + i * 1.6, 0, Math.PI * (1 + r())); g.stroke(); }
    for (const y of [H / 3, (H * 2) / 3]) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, y - 2, W, 4); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, y + 2, W, 2); } // the folds
    grain(g, W, H, 10);
  });
  // three panels, folded in thirds and half opened out
  const w = 0.14, h = 0.19 / 3, g = new THREE.Group(), t = tex(face), paper = std({ color: 0xe8e2cc, roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const pg = new THREE.PlaneGeometry(w, h, 8, 4), uv = pg.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, (2 - i + uv.getY(k)) / 3);
    const front = mesh(pg, std({ map: t, roughness: 0.85, side: THREE.FrontSide })), back = mesh(pg, Object.assign(paper.clone(), { side: THREE.BackSide }));
    const p = new THREE.Group(); p.add(front, back);
    if (i === 1) g.add(p);
    else { const hinge = new THREE.Group(); hinge.position.y = (i === 0 ? 1 : -1) * h / 2; p.position.y = (i === 0 ? 1 : -1) * h / 2; hinge.rotation.x = (i === 0 ? -1 : 1) * 0.35; hinge.add(p); g.add(hinge); }
  }
  return g;
}

// ---------- the farm (OFFAL: Before) ----------
// the county's notice on the farm: typed, stamped, nailed to the door and torn off the nail; folded in half since
function notice() {
  const W = 768, H = 1000, NX = W / 2, NY = 46; // the nail
  const face = canvas(W, H, (g) => {
    g.fillStyle = '#e4dcc4'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 30; i++) blob(g, r() * W, r() * H, 20 + r() * 80, 16 + r() * 60, 'rgba(150,120,70,0.1)', 'rgba(150,120,70,0)');
    g.fillStyle = '#1e1810'; g.font = 'bold 30px serif'; g.textAlign = 'center';
    g.fillText('COUNTY OF HOLLOW PINES', W / 2, 110); g.font = '22px serif'; g.fillText('Department of Public Works', W / 2, 142);
    g.fillRect(80, 162, W - 160, 3); g.fillRect(80, 168, W - 160, 1); g.font = 'bold 46px serif'; g.fillText('NOTICE OF DEMOLITION', W / 2, 236); g.textAlign = 'left';
    g.font = '24px "Courier New", monospace';
    const lines = ['Property:  the farm and outbuildings,', '           Route 9, Lot 14', '', 'The above property has been condemned', 'and will be demolished on or after:', '', '', 'Any persons or property remaining on', 'the premises after this date will be', 'removed. No further notice will be', 'given.', '', '              By order of the County Board'];
    lines.forEach((l, i) => { for (let k = 0; k < l.length; k++) { g.fillStyle = `rgba(22,18,14,${0.75 + r() * 0.25})`; g.fillText(l[k], 70 + k * 14.4 + (r() - 0.5), 312 + i * 40 + (r() - 0.5) * 1.5); } });
    g.font = 'bold 30px "Courier New", monospace'; g.fillStyle = 'rgba(22,18,14,0.92)'; g.fillText('THE FIRST OF THE MONTH', 150, 552);
    g.strokeStyle = 'rgba(20,30,80,0.88)'; g.lineWidth = 3.5; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(140 + r() * 6, 564 + i * 9); g.bezierCurveTo(300, 568 + i * 9 + (r() - 0.5) * 6, 450, 560 + i * 9, 590 + r() * 10, 565 + i * 9); g.stroke(); } // gone over three times
    g.save(); g.translate(570, 860); g.rotate(-0.2); g.strokeStyle = 'rgba(150,20,20,0.78)'; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 88, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(0, 0, 68, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(150,20,20,0.78)'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.fillText('CONDEMNED', 0, 10); g.font = '16px sans-serif'; g.fillText('HOLLOW PINES CO.', 0, -36); g.fillText('PUBLIC WORKS', 0, 50); g.restore();
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.35})`; g.fillRect(470 + r() * 200, 770 + r() * 180, 2, 2); } // where the stamp didn't take
    // the nail: a hole, rust round it and run down the page in the rain
    blob(g, NX, NY + 6, 40, 34, 'rgba(120,52,14,0.65)', 'rgba(120,52,14,0)');
    for (let i = 0; i < 7; i++) { const x = NX - 18 + r() * 36, len = 60 + r() * 260, gr = g.createLinearGradient(0, NY, 0, NY + len); gr.addColorStop(0, 'rgba(120,52,14,0.55)'); gr.addColorStop(1, 'rgba(120,52,14,0)'); g.strokeStyle = gr; g.lineWidth = 2 + r() * 4; g.beginPath(); g.moveTo(x, NY + 10); g.lineTo(x + (r() - 0.5) * 8, NY + len); g.stroke(); }
    // the rain itself: tide marks
    for (let i = 0; i < 4; i++) { g.strokeStyle = `rgba(120,96,56,${0.2 + r() * 0.15})`; g.lineWidth = 2; g.beginPath(); g.ellipse(80 + r() * 600, 700 + r() * 260, 50 + r() * 80, 30 + r() * 50, r(), 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(0, H / 2 - 2, W, 4); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, H / 2 + 2, W, 2); // the fold
    g.strokeStyle = 'rgba(60,40,20,0.25)'; g.lineWidth = 10; g.strokeRect(0, 0, W, H); // grubby at the edges
    grain(g, W, H, 12);
  });
  // torn: off the nail (a slit up from the hole, and a bite), and ragged all round
  const alpha = ragged(W, H, 70, (g) => {
    g.beginPath(); g.arc(NX, NY, 9, 0, 7); g.fill();
    g.beginPath(); g.moveTo(NX - 7, NY); g.lineTo(NX - 22, 0); g.lineTo(NX + 26, 0); g.lineTo(NX + 6, NY - 3); g.fill();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(70, 0); g.lineTo(58, 14); g.lineTo(30, 22); g.lineTo(18, 50); g.lineTo(0, 64); g.fill(); // a corner gone
  });
  const w = 0.14, h = 0.19 / 2, g = new THREE.Group(), t = tex(face), am = tex(alpha, false), bump = tex(fibres(512, 512), false, 2);
  for (let i = 0; i < 2; i++) { // two halves, the top one tipped back along the fold
    const pg = new THREE.PlaneGeometry(w, h, 10, 6), uv = pg.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, (1 - i + uv.getY(k)) / 2);
    const pos = pg.attributes.position; for (let k = 0; k < pos.count; k++) { const x = pos.getX(k) / w; pos.setZ(k, x * x * 0.006 + (r() - 0.5) * 0.0008); } pg.computeVertexNormals(); // not quite flat
    const p = new THREE.Group();
    p.add(mesh(pg, std({ map: t, alphaMap: am, alphaTest: 0.5, bumpMap: bump, bumpScale: 0.6, roughness: 0.9 })), mesh(pg, std({ color: 0xd8d0b8, alphaMap: am, alphaTest: 0.5, bumpMap: bump, bumpScale: 0.6, roughness: 0.95, side: THREE.BackSide })));
    if (i === 1) { p.position.y = -h / 2; g.add(p); } else { const hinge = new THREE.Group(); p.position.y = h / 2; hinge.rotation.x = -0.4; hinge.add(p); g.add(hinge); }
  }
  return g;
}
// Eddie's business card: thick cotton card, letterpressed in two colours (you can feel the type), carried in a
// wallet for years: soft at the corners, a crease across it; a pencil note on the back
function bizCard() {
  const W = 1050, H = 600;
  const type = (g, ink) => { // everything printed, in the given ink (or one colour, for the press's bite)
    const c = (col) => ink || col;
    g.fillStyle = c('#7a1a10'); g.fillRect(0, 0, 44, H);
    g.font = 'bold 84px serif'; g.fillText('EDDIE’S', 100, 170); g.fillStyle = c('#1e1810'); g.font = 'bold 54px serif'; g.fillText('QUALITY MEATS', 104, 240);
    g.font = 'italic 34px serif'; g.fillText('Packed fresh. Shipped anywhere.', 104, 310);
    g.font = '25px "Courier New", monospace'; g.fillText('Across the county line, Route 9 East', 104, 430); g.fillText('Telephone: ask the operator for Eddie', 104, 478);
    g.fillStyle = c('#7a1a10'); g.fillRect(104, 345, 560, 4);
    g.save(); g.translate(850, 380); g.strokeStyle = c('#7a1a10'); g.lineWidth = 7; g.beginPath(); g.ellipse(0, 0, 112, 76, 0, 0, Math.PI * 2); g.stroke(); g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, 98, 62, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = c('#7a1a10'); g.font = 'bold 34px serif'; g.textAlign = 'center'; g.fillText('PRIME', 0, 12); g.font = 'bold 16px serif'; g.fillText('EST.  1961', 0, 44);
    // a cleaver over it
    g.save(); g.translate(0, -112); g.rotate(-0.35); g.fillRect(-60, -26, 92, 46); g.fillRect(32, -8, 58, 12); g.fillStyle = c('#1e1810'); g.beginPath(); g.arc(-44, -12, 6, 0, 7); g.fill(); g.restore();
    g.restore();
  };
  const front = canvas(W, H, (g) => {
    g.fillStyle = '#ece4cf'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) blob(g, r() * W, r() * H, 40 + r() * 120, 30 + r() * 90, 'rgba(140,110,70,0.1)', 'rgba(140,110,70,0)');
    type(g);
    blob(g, 930, 90, 40, 28, 'rgba(110,10,6,0.6)', 'rgba(110,10,6,0.05)'); for (let i = 0; i < 12; i++) { g.strokeStyle = 'rgba(90,6,4,0.35)'; g.lineWidth = 2; g.beginPath(); g.ellipse(930, 90, 8 + i * 2.6, 6 + i * 1.8, 0.3, 0, Math.PI * (1.2 + r() * 0.8)); g.stroke(); } // a thumb, in blood
    g.strokeStyle = 'rgba(70,50,30,0.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, H * 0.62); g.lineTo(W, H * 0.55); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, H * 0.62 + 3); g.lineTo(W, H * 0.55 + 3); g.stroke(); // the crease
    const e = g.createLinearGradient(0, 0, 0, H); e.addColorStop(0, 'rgba(70,50,30,0.25)'); e.addColorStop(0.06, 'rgba(70,50,30,0)'); e.addColorStop(0.94, 'rgba(70,50,30,0)'); e.addColorStop(1, 'rgba(70,50,30,0.3)'); g.fillStyle = e; g.fillRect(0, 0, W, H); // the edges, gone brown in a wallet
    grain(g, W, H, 10);
  });
  const back = canvas(W, H, (g) => {
    g.fillStyle = '#e8e0ca'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 10; i++) blob(g, r() * W, r() * H, 40 + r() * 120, 30 + r() * 90, 'rgba(140,110,70,0.1)', 'rgba(140,110,70,0)');
    g.fillStyle = 'rgba(60,60,70,0.8)'; g.font = 'italic 62px cursive'; g.fillText('You should have', 90, 240); g.fillText('listened to Dad.', 120, 330);
    g.font = 'italic 46px cursive'; g.fillText('— E.', 640, 440);
    g.strokeStyle = 'rgba(70,50,30,0.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(W, H * 0.62); g.lineTo(0, H * 0.55); g.stroke();
    grain(g, W, H, 10);
  });
  const bite = canvas(W, H, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); type(g, '#000'); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, H * 0.62 - 3, W, 6); }); // (pressed in: dark is low)
  const edge = std({ color: 0xd8ceb4, roughness: 0.9 }), pr = tex(bite, false), fb = tex(fibres(512, 300, 1800), false);
  const geo = curl(new THREE.BoxGeometry(0.089, 0.051, 0.0011, 24, 14, 1), 0.089, 0.051, 0.002);
  const g = new THREE.Group(); g.add(mesh(geo, [edge, edge, edge, edge, std({ map: tex(front), bumpMap: pr, bumpScale: 1.5, roughness: 0.85 }), std({ map: tex(back), bumpMap: fb, bumpScale: 0.5, roughness: 0.9 })]));
  g.scale.setScalar(1.5);
  return g;
}
// Dad's ledger: a cloth-bound book with leather corners, lying open; columns of meat sold by the pound in his hand;
// the right-hand page about the jar, with a drawing of it; a ribbon in the gutter
function ledger() {
  const W = 800, H = 1080;
  const page = (left) => canvas(W, H, (g) => {
    g.fillStyle = '#e2d6b4'; g.fillRect(0, 0, W, H);
    const gut = g.createLinearGradient(left ? W : 0, 0, left ? W - 140 : 140, 0); gut.addColorStop(0, 'rgba(90,70,40,0.35)'); gut.addColorStop(1, 'rgba(90,70,40,0)'); g.fillStyle = gut; g.fillRect(0, 0, W, H); // the gutter's shadow
    g.strokeStyle = 'rgba(70,100,150,0.45)'; g.lineWidth = 2; for (let y = 140; y < H - 50; y += 44) { g.beginPath(); g.moveTo(30, y); g.lineTo(W - 30, y); g.stroke(); }
    g.strokeStyle = 'rgba(170,40,40,0.55)'; for (const x of [120, 520, 640]) { g.beginPath(); g.moveTo(x, 70); g.lineTo(x, H - 40); g.stroke(); }
    const ink = (a = 0.9) => `rgba(24,22,44,${a})`;
    if (left) {
      g.fillStyle = ink(); g.font = 'italic bold 40px cursive'; g.fillText('October', 140, 100); g.font = 'italic 28px cursive'; g.fillText('lb', 545, 100); g.fillText('$', 668, 100);
      const cuts = ['Brisket', 'Chuck', 'Shank', 'Liver', 'Tongue', 'Sweetbreads', 'Tripe', 'Hock', 'Short rib', 'Kidneys', 'Hearts', 'Suet', 'Oxtail', 'Cheek', 'Lard', 'Blood (pail)', 'Bones', 'Hendry (on credit)', 'Mrs Kell'];
      g.font = 'italic 32px cursive';
      cuts.forEach((c, i) => { const y = 176 + i * 44; g.fillStyle = ink(0.75 + r() * 0.2); g.fillText(String(3 + i), 50, y); g.fillText(c, 135, y); g.fillText((r() * 60 + 4).toFixed(1), 535, y); g.fillText((r() * 9 + 1).toFixed(2), 655, y); });
      g.strokeStyle = ink(0.8); g.lineWidth = 2; g.beginPath(); g.moveTo(640, H - 100); g.lineTo(760, H - 100); g.stroke(); g.fillStyle = ink(); g.fillText('81.40', 655, H - 64);
    } else {
      g.fillStyle = ink(); g.font = 'italic 32px cursive';
      ['Sold to Hendry, 40 lb. Paid in full.', '', 'Found the jar where Grandfather said', 'it would be, under the floor of the', 'smokehouse. The seal is good.', 'The wire is good.'].forEach((l, i) => g.fillText(l, 50, 176 + i * 44));
      g.font = 'italic bold 38px cursive'; g.fillText('It does not get opened.', 50, 176 + 7 * 44); g.strokeStyle = ink(); g.lineWidth = 3; g.beginPath(); g.moveTo(50, 176 + 7 * 44 + 8); g.lineTo(450, 176 + 7 * 44 + 6); g.stroke(); g.beginPath(); g.moveTo(54, 176 + 7 * 44 + 15); g.lineTo(440, 176 + 7 * 44 + 14); g.stroke();
      g.font = 'italic 32px cursive'; g.fillText('Not by me, not by the boys. Not by anyone.', 50, 176 + 8 * 44);
      // the jar, drawn: a squat crock, a lid, the wire round it, the marks
      g.save(); g.translate(560, 700); g.strokeStyle = ink(0.85); g.lineWidth = 3;
      g.beginPath(); g.moveTo(-70, -80); g.bezierCurveTo(-110, -40, -110, 70, -70, 100); g.lineTo(70, 100); g.bezierCurveTo(110, 70, 110, -40, 70, -80); g.closePath(); g.stroke();
      g.beginPath(); g.ellipse(0, -84, 74, 14, 0, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(0, -92, 78, 14, 0, Math.PI, 0); g.stroke();
      for (const y of [-74, -66]) { g.beginPath(); g.ellipse(0, y, 80, 15, 0, 0, Math.PI); g.stroke(); }
      g.font = 'bold 34px serif'; g.fillStyle = ink(0.85); g.textAlign = 'center'; g.fillText('✝', -40, 20); g.fillText('✝', 40, 20); g.fillText('✝', 0, 70); g.textAlign = 'left';
      for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(-80 + i * 18, 100); g.lineTo(-90 + i * 18, 110); g.stroke(); } // the shading
      g.restore();
      g.font = 'italic 32px cursive'; g.fillStyle = ink(); g.fillText('She keeps asking about it.', 50, H - 120);
      blob(g, 230, 880, 54, 34, 'rgba(110,10,6,0.55)', 'rgba(110,10,6,0)'); for (let i = 0; i < 10; i++) { g.strokeStyle = 'rgba(90,6,4,0.4)'; g.lineWidth = 2; g.beginPath(); g.ellipse(230, 880, 10 + i * 3, 7 + i * 2, 0.2, 0, Math.PI * (1.1 + r())); g.stroke(); } // a thumb, in something
    }
    for (let i = 0; i < 26; i++) blob(g, r() * W, r() * H, 10 + r() * 40, 10 + r() * 30, 'rgba(140,110,60,0.12)', 'rgba(140,110,60,0)'); // foxing
    grain(g, W, H, 10);
  });
  const g = new THREE.Group(), pw = 0.1, ph = 0.135;
  const cloth = canvas(512, 512, (x, w, h) => {
    x.fillStyle = '#34261a'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '255,240,220' : '0,0,0'},${r() * 0.08})`; x.fillRect(r() * w, r() * h, 1, 3); x.fillRect(r() * w, r() * h, 3, 1); } // the weave
    x.fillStyle = '#1e140c'; for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) { x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + (cx ? -110 : 110), cy); x.lineTo(cx, cy + (cy ? -110 : 110)); x.fill(); } // leather corners
    for (let i = 0; i < 6; i++) blob(x, r() * w, r() * h, 30 + r() * 70, 20 + r() * 50, 'rgba(150,130,100,0.18)', 'rgba(150,130,100,0)'); // worn pale
  });
  const ct = tex(cloth), cover = std({ map: ct, bumpMap: tex(cloth, false), bumpScale: 1.2, roughness: 0.9 });
  const edges = tex(canvas(256, 64, (x, w, h) => { x.fillStyle = '#d4c6a0'; x.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { x.fillStyle = `rgba(90,70,40,${0.1 + r() * 0.2})`; x.fillRect(0, y, w, 1); } }), false);
  const block = std({ map: edges, roughness: 0.95 });
  for (const sd of [-1, 1]) {
    const leafG = new THREE.Group(); leafG.position.set(sd * 0.003, 0, 0); leafG.rotation.z = sd * 0.07; g.add(leafG);
    const board = mesh(new RoundedBoxGeometry(pw + 0.007, 0.0035, ph + 0.009, 2, 0.0012), cover); board.position.set(sd * (pw / 2 + 0.0005), 0, 0); leafG.add(board);
    const blk = mesh(new THREE.BoxGeometry(pw - 0.002, 0.009, ph - 0.002), block); blk.position.set(sd * (pw / 2), 0.0062, 0); leafG.add(blk);
    const pg = new THREE.PlaneGeometry(pw, ph, 20, 12), pp = pg.attributes.position; // the top leaf: up out of the gutter in a curve, flat across, a little lift at the edge
    for (let k = 0; k < pp.count; k++) { const u = (pp.getX(k) / pw + 0.5), uu = sd < 0 ? 1 - u : u; pp.setZ(k, Math.exp(-uu * 9) * 0.006 + uu * uu * 0.0015); }
    pg.computeVertexNormals(); pg.rotateX(-Math.PI / 2);
    const leaf = mesh(pg, std({ map: tex(page(sd < 0)), bumpMap: tex(fibres(512, 512), false), bumpScale: 0.4, roughness: 0.92 })); leaf.position.set(sd * (pw / 2), 0.0108, 0); leafG.add(leaf);
  }
  const spine = mesh(new THREE.CylinderGeometry(0.007, 0.007, ph + 0.009, 12, 1, false, 0, Math.PI), cover); spine.rotation.x = Math.PI / 2; spine.rotation.y = Math.PI; spine.position.y = -0.002; g.add(spine);
  // the ribbon: from the head of the gutter, across the right-hand page and over its bottom edge
  const rib = new THREE.PlaneGeometry(0.006, 0.17, 1, 24), rp = rib.attributes.position;
  for (let k = 0; k < rp.count; k++) { const v = rp.getY(k) / 0.17 + 0.5, z = -ph / 2 + v * (ph + 0.01); rp.setXYZ(k, rp.getX(k) + 0.004 + v * 0.01, 0.0135 + (z > ph / 2 ? -(z - ph / 2) * 2.2 : Math.exp(-v * 12) * 0.002), z); }
  rib.computeVertexNormals(); g.add(mesh(rib, std({ color: 0x6a1410, roughness: 0.5, side: THREE.DoubleSide })));
  g.rotation.x = 1.1; g.scale.setScalar(1.3);
  return g;
}

// ---------- the teddy bear ----------
function bear() {
  const fur = canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#7a5434'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const x = r() * w, y = r() * h, a = 1.2 + (r() - 0.5) * 0.8, l = 3 + r() * 6; g.strokeStyle = r() < 0.5 ? `rgba(${40 + r() * 40 | 0},${24 + r() * 20 | 0},10,0.55)` : `rgba(${150 + r() * 50 | 0},${110 + r() * 40 | 0},70,0.45)`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    for (let i = 0; i < 5; i++) blob(g, r() * w, r() * h, 20 + r() * 40, 16 + r() * 30, 'rgba(40,24,12,0.35)', 'rgba(40,24,12,0)'); // worn and grubby
    blob(g, w * 0.7, h * 0.6, 40, 30, 'rgba(70,8,6,0.6)', 'rgba(70,8,6,0)'); // and that
  });
  const ft = tex(fur, true, 2);
  const furM = phys({ map: ft, bumpMap: ft, bumpScale: 3, roughness: 0.95, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xc8a070) });
  const felt = phys({ color: 0xc8a888, roughness: 0.95, sheen: 0.6, sheenColor: new THREE.Color(0xffe0c0) });
  const thread = std({ color: 0x1a1008, roughness: 0.8 });
  const g = new THREE.Group();
  const ell = (rx, ry, rz, m = furM, seg = 28) => { const o = mesh(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)), m); o.scale.set(rx, ry, rz); return o; };
  g.add(at(ell(0.05, 0.062, 0.045), 0, -0.02, 0)); // body
  g.add(at(ell(0.03, 0.035, 0.012, felt), 0, -0.02, 0.038)); // a lighter belly patch
  g.add(at(ell(0.042, 0.04, 0.038), 0, 0.068, 0.004)); // head
  g.add(at(ell(0.02, 0.016, 0.018, felt), 0, 0.058, 0.036)); // muzzle
  const nose = mesh(new THREE.ConeGeometry(0.008, 0.008, 3), thread); nose.rotation.set(Math.PI / 2, 0, Math.PI); nose.position.set(0, 0.066, 0.052); g.add(nose);
  g.add(at(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0.061, 0.053), V(0, 0.054, 0.053), V(-0.007, 0.05, 0.05)]), 8, 0.0012, 4), thread), 0, 0, 0));
  g.add(at(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0.054, 0.053), V(0.007, 0.05, 0.05)]), 6, 0.0012, 4), thread), 0, 0, 0));
  for (const sx of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.0055, 16, 12), phys({ color: 0x060606, roughness: 0.05, clearcoat: 1 })); eye.scale.z = 0.6; eye.position.set(sx * 0.016, 0.078, 0.036); g.add(eye);
    const arm = ell(0.016, 0.034, 0.016); arm.position.set(sx * 0.055, -0.0, 0.012); arm.rotation.z = sx * 0.6; g.add(arm);
    const leg = ell(0.02, 0.024, 0.03); leg.position.set(sx * 0.03, -0.075, 0.022); g.add(leg);
    const pad = mesh(new THREE.CircleGeometry(0.013, 20), felt); pad.position.set(sx * 0.03, -0.077, 0.052); g.add(pad);
  }
  // ears: one whole, one chewed down to a stump with the stuffing coming out
  const ear = ell(0.017, 0.016, 0.007); ear.position.set(-0.032, 0.1, 0); g.add(ear);
  const inner = ell(0.01, 0.009, 0.003, felt); inner.position.set(-0.032, 0.1, 0.005); g.add(inner);
  const stub = ell(0.012, 0.007, 0.006); stub.position.set(0.032, 0.098, 0); g.add(stub);
  for (let i = 0; i < 6; i++) { const f = mesh(new THREE.IcosahedronGeometry(0.004 + r() * 0.003, 1), std({ color: 0xf0ece0, roughness: 1 })); f.position.set(0.032 + (r() - 0.5) * 0.012, 0.104 + r() * 0.005, (r() - 0.5) * 0.006); g.add(f); }
  // the seams: down the front of the head and the belly
  const seam = (pts) => g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => V(x, y, z))), 24, 0.0008, 4), thread));
  seam([[0, 0.105, 0.016], [0, 0.098, 0.03], [0, 0.085, 0.04]]);
  seam([[0, 0.02, 0.046], [0, -0.02, 0.05], [0, -0.06, 0.04]]);
  return g;
}

// ---------- the dictaphone ----------
function dictaphone() {
  const g = new THREE.Group();
  const body = phys({ color: 0x232527, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.5 });
  const face = canvas(256, 560, (x, w, h) => {
    x.fillStyle = '#232527'; x.fillRect(0, 0, w, h);
    for (let yy = 0; yy < 9; yy++) for (let xx = 0; xx < 9; xx++) { x.fillStyle = '#060606'; x.beginPath(); x.arc(56 + xx * 18, 40 + yy * 18, 5, 0, Math.PI * 2); x.fill(); } // the speaker grille
    x.fillStyle = '#c8c8c8'; x.font = 'bold 20px sans-serif'; x.fillText('MEMO-CORDER', 48, 230); x.font = '14px sans-serif'; x.fillText('M-41  MICROCASSETTE', 52, 252);
    x.fillStyle = '#9a9a9a'; x.font = '12px sans-serif'; x.fillText('REC        PLAY       STOP       REW', 26, 538);
    grain(x, w, h, 6);
  });
  g.add(mesh(new RoundedBoxGeometry(0.055, 0.12, 0.024, 4, 0.007), [body, body, body, body, std({ map: tex(face), roughness: 0.45 }), body]));
  // the window, and the little cassette behind it
  const win = mesh(new RoundedBoxGeometry(0.042, 0.03, 0.002, 2, 0.001), phys({ color: 0x2a3a3a, roughness: 0.05, transparent: true, opacity: 0.5, clearcoat: 1 })); win.position.set(0, -0.022, 0.0125); g.add(win);
  const cas = mesh(new THREE.BoxGeometry(0.038, 0.024, 0.004), std({ color: 0x1a1a1a, roughness: 0.6 })); cas.position.set(0, -0.022, 0.009); g.add(cas);
  for (const sx of [-1, 1]) {
    const reel = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.002, 16), std({ color: 0xe8e8e0, roughness: 0.5 })); reel.rotation.x = Math.PI / 2; reel.position.set(sx * 0.011, -0.022, 0.0115); g.add(reel);
    const tape = mesh(new THREE.CylinderGeometry(sx < 0 ? 0.009 : 0.0072, sx < 0 ? 0.009 : 0.0072, 0.0016, 24), std({ color: 0x3a2214, roughness: 0.35 })); tape.rotation.x = Math.PI / 2; tape.position.set(sx * 0.011, -0.022, 0.0108); g.add(tape);
  }
  // the buttons along the bottom edge, the volume wheel, the red light, the clip on the back
  const cols = [0xa01810, 0x3a3c3e, 0x3a3c3e, 0x3a3c3e];
  cols.forEach((c, i) => { const b = mesh(new RoundedBoxGeometry(0.01, 0.006, 0.008, 2, 0.002), std({ color: c, roughness: 0.5 })); b.position.set(-0.018 + i * 0.012, -0.0625, 0.004); g.add(b); });
  const wheel = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.004, 24), std({ color: 0x5a5c5e, roughness: 0.4, metalness: 0.6 })); wheel.rotation.z = Math.PI / 2; wheel.position.set(0.0285, 0.035, 0); g.add(wheel);
  const led = mesh(new THREE.SphereGeometry(0.0022, 12, 8), std({ color: 0xff2010, emissive: 0xff2010, emissiveIntensity: 2 })); led.position.set(-0.018, 0.052, 0.0122); g.add(led);
  const clip = mesh(new THREE.BoxGeometry(0.018, 0.07, 0.0015), steel()); clip.position.set(0, 0.02, -0.014); g.add(clip);
  return g;
}

// ---------- the car keys ----------
function keys() {
  const g = new THREE.Group();
  const keyShape = (len, head) => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.004); s.lineTo(len, -0.004);
    for (let i = 0; i < 6; i++) { const x = len - i * (len / 7); s.lineTo(x - len / 14, -0.004 + (i % 2 ? 0.0025 : 0.001)); s.lineTo(x - len / 7, -0.004); } // the cuts
    s.lineTo(0, 0.004); s.lineTo(len * 0.9, 0.004); s.lineTo(len, 0.002); s.lineTo(len, -0.004);
    return s;
  };
  // the car key: a black rubber head with a blue oval, a steel blade
  const head = mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.008, 32), std({ color: 0x141414, roughness: 0.75 })); head.scale.set(1, 1, 0.75); head.rotation.x = Math.PI / 2; head.position.set(-0.045, 0, 0); g.add(head);
  const oval = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.001, 24), phys({ color: 0x1a3a8a, roughness: 0.2, clearcoat: 1 })); oval.scale.set(1.5, 1, 0.8); oval.rotation.x = Math.PI / 2; oval.position.set(-0.045, 0, 0.0042); g.add(oval);
  const hole1 = mesh(new THREE.TorusGeometry(0.0035, 0.0012, 8, 16), chrome()); hole1.position.set(-0.058, 0, 0); g.add(hole1);
  const blade = mesh(new THREE.ExtrudeGeometry(keyShape(0.05), { depth: 0.002, bevelEnabled: true, bevelSize: 0.0004, bevelThickness: 0.0004, bevelSegments: 1 }), steel()); blade.position.set(-0.029, 0, -0.001); g.add(blade);
  // the house key, brass
  const brass = std({ color: 0xb8903a, roughness: 0.32, metalness: 1 });
  const hk = new THREE.Group();
  const bow = new THREE.Shape(); bow.absarc(0, 0, 0.012, 0, Math.PI * 2); const hole = new THREE.Path(); hole.absarc(-0.004, 0, 0.0035, 0, Math.PI * 2, true); bow.holes.push(hole);
  hk.add(mesh(new THREE.ExtrudeGeometry(bow, { depth: 0.0018, bevelEnabled: true, bevelSize: 0.0005, bevelThickness: 0.0005, bevelSegments: 2, curveSegments: 24 }), brass));
  const b2 = mesh(new THREE.ExtrudeGeometry(keyShape(0.038), { depth: 0.0018, bevelEnabled: false }), brass); b2.position.x = 0.011; hk.add(b2);
  hk.position.set(-0.07, -0.022, 0.003); hk.rotation.z = -2.1; g.add(hk);
  // the split ring they're on, and a leather tag
  const ring = mesh(new THREE.TorusGeometry(0.013, 0.0011, 10, 40), chrome()); ring.position.set(-0.068, -0.01, 0); ring.rotation.x = 0.4; g.add(ring);
  const tagS = new THREE.Shape(); tagS.moveTo(-0.012, -0.022); tagS.lineTo(0.012, -0.022); tagS.lineTo(0.012, 0.01); tagS.quadraticCurveTo(0, 0.022, -0.012, 0.01); tagS.lineTo(-0.012, -0.022);
  const leather = canvas(128, 160, (x, w, h) => { x.fillStyle = '#5a3218'; x.fillRect(0, 0, w, h); for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(20,10,4,${r() * 0.3})`; x.fillRect(r() * w, r() * h, 2, 1); } x.strokeStyle = '#d8c090'; x.setLineDash([6, 5]); x.lineWidth = 2; x.strokeRect(10, 10, w - 20, h - 20); x.fillStyle = '#2a1408'; x.font = 'bold 60px serif'; x.fillText('R', 44, 110); });
  const tag = mesh(new THREE.ExtrudeGeometry(tagS, { depth: 0.003, bevelEnabled: true, bevelSize: 0.0008, bevelThickness: 0.0008, bevelSegments: 2 }), std({ map: tex(leather), roughness: 0.7 }));
  const uv = tag.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + 0.012) / 0.024, (uv.getY(i) + 0.022) / 0.044);
  tag.position.set(-0.088, -0.03, -0.002); tag.rotation.z = 0.5; g.add(tag);
  g.scale.setScalar(1.5);
  return g;
}

// ---------- the Zippo ----------
function zippo() {
  const g = new THREE.Group();
  const brushed = canvas(512, 512, (x, w, h) => { x.fillStyle = '#d4d8dc'; x.fillRect(0, 0, w, h); for (let i = 0; i < 5000; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '90,90,90'},${r() * 0.05})`; x.fillRect(0, r() * h, w, 1); } });
  const eng = canvas(512, 512, (x, w, h) => { x.drawImage(brushed, 0, 0, w, h); x.fillStyle = 'rgba(40,40,40,0.85)'; x.font = 'italic 46px serif'; for (let i = 0; i < 60; i++) { x.strokeStyle = `rgba(30,30,30,${r() * 0.35})`; x.beginPath(); const a = r() * w, b = r() * h; x.moveTo(a, b); x.lineTo(a + r() * 60, b + (r() - 0.5) * 10); x.stroke(); } });
  const metal = std({ map: tex(brushed), roughness: 0.32, metalness: 1 });
  const front = std({ map: tex(eng), bumpMap: tex(eng, false), bumpScale: -1.5, roughness: 0.3, metalness: 1 });
  const caseG = new RoundedBoxGeometry(0.038, 0.04, 0.013, 4, 0.0035);
  g.add(at(mesh(caseG, [metal, metal, metal, metal, front, metal]), 0, -0.012, 0));
  // the lid, thrown open on its hinge
  const hinge = new THREE.Group(); hinge.position.set(-0.019, 0.008, 0); hinge.rotation.z = 1.9; g.add(hinge);
  hinge.add(at(mesh(new RoundedBoxGeometry(0.038, 0.017, 0.013, 4, 0.0035), metal), 0.019, 0.0085, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.009, 12), metal), -0.019, 0.008, 0));
  // the chimney with its holes, the flint wheel, the wick
  const holes = canvas(128, 128, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#000'; for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) { x.beginPath(); x.arc(20 + xx * 29, 22 + yy * 28, 7, 0, Math.PI * 2); x.fill(); } });
  const chim = mesh(new THREE.BoxGeometry(0.024, 0.016, 0.011, 1, 1, 1), std({ color: 0xc0c4c8, roughness: 0.3, metalness: 1, alphaMap: tex(holes, false), alphaTest: 0.5, side: THREE.DoubleSide })); chim.position.set(-0.001, 0.016, 0); g.add(chim);
  const wheel = mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 20), std({ color: 0x7a7c7e, roughness: 0.5, metalness: 1 })); wheel.rotation.x = Math.PI / 2; wheel.position.set(0.0085, 0.021, 0); g.add(wheel);
  const wick = mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.006, 8), std({ color: 0xe8e0c8, roughness: 1 })); wick.position.set(-0.003, 0.025, 0); g.add(wick);
  g.scale.setScalar(2);
  return g;
}

// ---------- the wristwatch ----------
function watch() {
  const g = new THREE.Group();
  const dial = canvas(1024, 1024, (x, w, h) => {
    const c = w / 2; x.fillStyle = '#ece6d6'; x.beginPath(); x.arc(c, c, c, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(160,140,100,0.15)'; for (let i = 0; i < 30; i++) { x.beginPath(); x.arc(r() * w, r() * h, 10 + r() * 60, 0, Math.PI * 2); x.fill(); } // the dial gone yellow at the edges
    for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2, big = i % 5 === 0; x.save(); x.translate(c, c); x.rotate(a); x.fillStyle = '#1a1410'; x.fillRect(-(big ? 5 : 2), -c * 0.92, big ? 10 : 4, big ? 44 : 20); x.restore(); }
    x.fillStyle = '#1a1410'; x.font = 'bold 84px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    ['12', '3', '6', '9'].forEach((n, i) => { const a = (i / 4) * Math.PI * 2; x.fillText(n, c + Math.sin(a) * c * 0.66, c - Math.cos(a) * c * 0.66); });
    x.font = '36px sans-serif'; x.fillText('QUARTZ', c, c + c * 0.35);
    x.strokeStyle = 'rgba(60,60,60,0.5)'; x.lineWidth = 3; x.beginPath(); x.moveTo(c * 0.4, c * 0.5); x.lineTo(c * 1.5, c * 1.3); x.stroke(); // the crack across it
  });
  const steelM = steel();
  // the case: a lathe of a rounded profile, the bezel, the crown, four lugs
  const prof = [[0, -0.004], [0.017, -0.004], [0.0195, -0.002], [0.02, 0.002], [0.0185, 0.0042], [0.0165, 0.0045]].map(([a, b]) => new THREE.Vector2(a, b));
  const cs = mesh(new THREE.LatheGeometry(prof, 48), steelM); cs.rotation.x = Math.PI / 2; g.add(cs);
  const face = mesh(new THREE.CircleGeometry(0.0165, 64), std({ map: tex(dial), roughness: 0.6 })); face.position.z = 0.0036; g.add(face);
  const crystal = mesh(new THREE.SphereGeometry(0.03, 48, 16, 0, Math.PI * 2, 0, 0.6), phys({ color: 0xffffff, roughness: 0.02, transmission: 1, thickness: 0.002, transparent: true, opacity: 0.25 })); crystal.rotation.x = Math.PI / 2; crystal.position.z = -0.0205; crystal.scale.set(0.58, 0.58, 0.4); g.add(crystal);
  const crown = mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.004, 16), steelM); crown.rotation.z = Math.PI / 2; crown.position.set(0.0215, 0, 0); g.add(crown);
  for (const sy of [-1, 1]) for (const sx of [-1, 1]) { const l = mesh(new RoundedBoxGeometry(0.0035, 0.008, 0.004, 2, 0.001), steelM); l.position.set(sx * 0.008, sy * 0.0205, -0.001); g.add(l); }
  // the hands at 3:12, and the second hand stopped
  const hand = (len, wid, a, z) => { const m = mesh(new THREE.BoxGeometry(wid, len, 0.0004), std({ color: 0x141414, roughness: 0.4 })); m.geometry.translate(0, len / 2 - 0.002, 0); m.rotation.z = -a; m.position.z = z; g.add(m); };
  hand(0.0095, 0.0016, ((3 + 12 / 60) / 12) * Math.PI * 2, 0.0039); hand(0.014, 0.0011, (12 / 60) * Math.PI * 2, 0.0041); hand(0.015, 0.0004, (41 / 60) * Math.PI * 2, 0.0043);
  g.add(at(mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.001, 10), steelM), 0, 0, 0.0045, Math.PI / 2));
  // the strap: leather, stitched, a buckle on one side and the holes on the other, curving round as if worn
  const lc = canvas(128, 512, (x, w, h) => { x.fillStyle = '#4a2a16'; x.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '20,10,4' : '120,80,50'},${r() * 0.2})`; x.fillRect(r() * w, r() * h, 2, 1); } x.strokeStyle = '#c8a878'; x.setLineDash([10, 8]); x.lineWidth = 3; x.beginPath(); x.moveTo(12, 0); x.lineTo(12, h); x.moveTo(w - 12, 0); x.lineTo(w - 12, h); x.stroke(); });
  const strapM = std({ map: tex(lc), roughness: 0.7 });
  for (const sy of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, a = t * 1.3; pts.push(V(0, sy * (0.024 + Math.sin(a) * 0.03), -Math.sin(a * 0.5) * 0.004 - (1 - Math.cos(a)) * 0.03)); }
    const curve = new THREE.CatmullRomCurve3(pts), seg = 24, P = [], UV = [], idx = [];
    for (let i = 0; i <= seg; i++) { const p = curve.getPointAt(i / seg); for (const s of [-1, 1]) { P.push(s * 0.0085, p.y, p.z); UV.push((s + 1) / 2, i / seg); } }
    for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); sg.setIndex(idx); sg.computeVertexNormals();
    g.add(mesh(sg, Object.assign(strapM.clone(), { side: THREE.DoubleSide })));
    if (sy > 0) { const end = curve.getPointAt(1); const buckle = mesh(new THREE.TorusGeometry(0.008, 0.0012, 8, 4), steelM); buckle.position.copy(end); buckle.rotation.set(Math.PI / 2 - 0.9, 0, Math.PI / 4); g.add(buckle); }
  }
  g.scale.setScalar(2);
  return g;
}

// ---------- the reading glasses ----------
function glasses() {
  const g = new THREE.Group();
  const tort = canvas(256, 256, (x, w, h) => { x.fillStyle = '#3a2210'; x.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) blob(x, r() * w, r() * h, 6 + r() * 26, 4 + r() * 16, `rgba(${150 + r() * 60 | 0},${90 + r() * 40 | 0},30,0.55)`, 'rgba(60,30,10,0)'); });
  const frame = phys({ map: tex(tort), roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const rim = (cx) => { const pts = []; for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a); pts.push(V(cx + c * 0.025, (s > 0 ? s * 0.016 : s * 0.019) + 0.0, 0)); } return pts; };
  const lensM = phys({ color: 0xe8f0f0, roughness: 0.02, transmission: 0.95, thickness: 0.002, transparent: true, opacity: 0.35 });
  const crack = canvas(256, 256, (x, w, h) => { x.clearRect(0, 0, w, h); x.strokeStyle = 'rgba(240,240,240,0.9)'; x.lineWidth = 1.2; for (let i = 0; i < 10; i++) { let px = 120, py = 140, a = r() * 7; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 6; k++) { a += (r() - 0.5) * 0.6; px += Math.cos(a) * 14; py += Math.sin(a) * 14; x.lineTo(px, py); } x.stroke(); } });
  for (const sx of [-1, 1]) {
    const pts = rim(sx * 0.031);
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 80, 0.0022, 10, true), frame));
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
    const lens = mesh(new THREE.ShapeGeometry(shape, 24), sx > 0 ? Object.assign(lensM.clone(), { map: tex(crack), transmission: 0.6 }) : lensM);
    if (sx > 0) { const uv = lens.geometry.attributes.uv, pp = lens.geometry.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (pp.getX(i) - 0.006) / 0.05, (pp.getY(i) + 0.02) / 0.04); }
    g.add(lens);
    // the temple arms, folded in behind the lenses, with the curve for the ear
    const hingeP = V(sx * 0.057, 0.006, -0.002);
    g.add(at(mesh(new RoundedBoxGeometry(0.006, 0.006, 0.006, 2, 0.0015), frame), hingeP.x, hingeP.y, hingeP.z));
    const arm = [hingeP.clone(), V(sx * 0.03, 0.006, -0.008 - (sx > 0 ? 0.004 : 0)), V(-sx * 0.02, 0.005, -0.01 - (sx > 0 ? 0.004 : 0)), V(-sx * 0.035, -0.006, -0.012 - (sx > 0 ? 0.004 : 0))];
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arm), 30, 0.0016, 8), frame));
    const pad = mesh(new THREE.SphereGeometry(0.003, 12, 8), phys({ color: 0xffffff, roughness: 0.1, transmission: 0.8, transparent: true, opacity: 0.6 })); pad.scale.set(0.6, 1, 0.5); pad.position.set(sx * 0.009, -0.006, 0.004); g.add(pad);
  }
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.007, 0.008, 0), V(0, 0.012, 0.002), V(0.007, 0.008, 0)]), 16, 0.0019, 8), frame)); // the bridge
  g.scale.setScalar(1.6);
  return g;
}

export function remodel(id) {
  switch (id) {
    case 'photo-wedding': case 'photo-kid': case 'photo-mother': return photo(id);
    case 'card-farm': return notice();
    case 'card-eddie': return bizCard();
    case 'misc-ledger': return ledger();
    case 'card-letter': return letter();
    case 'toy-bear': return bear();
    case 'tape-dictaphone': return dictaphone();
    case 'key-car': return keys();
    case 'misc-lighter': return zippo();
    case 'misc-watch': return watch();
    case 'misc-glasses': return glasses();
    default: return null;
  }
}
