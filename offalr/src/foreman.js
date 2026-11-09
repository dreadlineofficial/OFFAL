// The Foreman: a flayed, too-tall thing in a butcher's apron, wearing a stitched face, dragging a meat hook.
// The body is the original one; what's here on top of it is surface detail, painted at a higher resolution
// than the rest of the plant because he's the thing you look at closest: somebody else's face sewn on with
// black cord and weeping from the eye holes, wet striated muscle, a leather apron soaked from the waist
// down, yellowed teeth in raw gums, and a hook and cleaver gone brown with rust and old blood.
import * as THREE from 'three';
import { remasterForeman, poseRemaster } from './foremanr.js';
import { limb, mesh } from './props.js';
import { canvas, splat, drip, handprint, smear, BLOOD } from './textures.js';
import { makeRng } from './rng.js';

const blotches = (g, w, h, n, rMin, rMax, rgb, aMax, rng) => {
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${rgb},${rng() * aMax})`; g.beginPath(); g.ellipse(rng() * w, rng() * h, rMin + rng() * (rMax - rMin), rMin + rng() * (rMax - rMin) * 0.7, rng() * 3, 0, 7); g.fill(); }
};
const grain = (g, w, h, n, rgb, a, rng) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${rgb},${rng() * a})`; g.fillRect(rng() * w, rng() * h, 1 + rng() * 1.5, 1 + rng() * 1.5); } };
const tex = (c, rep = [1, 1]) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.anisotropy = 4; return t; };

// somebody's face, gone grey-yellow, sewn on. The skull is a plain sphere, so the front of the face is at
// u = 0.25: the eye holes land at about (128 +- 34, 215) on this canvas and the mouth at y 332
function maskCanvas() {
  const S = 512, { c, g } = canvas(S, S), rng = makeRng(666);
  g.fillStyle = '#c7b49a'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 160, 8, 60, '150,120,100', 0.3, rng);
  blotches(g, S, S, 90, 6, 28, '100,60,50', 0.25, rng);
  blotches(g, S, S, 50, 10, 50, '110,90,120', 0.12, rng); // the blue-grey of skin that's been dead a while
  grain(g, S, S, 9000, '70,45,35', 0.3, rng); // pores
  for (let i = 0; i < 120; i++) { g.strokeStyle = `rgba(90,60,45,${rng() * 0.25})`; g.lineWidth = 0.8; g.beginPath(); const x = rng() * S, y = rng() * S; g.moveTo(x, y); g.quadraticCurveTo(x + (rng() - 0.5) * 30, y + (rng() - 0.5) * 8, x + (rng() - 0.5) * 50, y + (rng() - 0.5) * 12); g.stroke(); } // creases
  // the edges of each patch of skin: darker, drier, curling where the stitches pull
  const seams = [[40, 80, 460, 140], [256, 0, 240, 512], [60, 360, 440, 400], [120, 0, 80, 512], [380, 0, 420, 512]];
  for (const [x0, y0, x1, y1] of seams) {
    const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny), ux = nx / l, uy = ny / l;
    g.strokeStyle = 'rgba(90,40,30,.45)'; g.lineWidth = 12; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); // inflamed
    g.strokeStyle = 'rgba(60,20,14,.8)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); // the cut
    const n = Math.hypot(x1 - x0, y1 - y0) / 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t + (rng() - 0.5) * 2, y = y0 + (y1 - y0) * t + (rng() - 0.5) * 2, k = 9 + rng() * 3;
      g.fillStyle = 'rgba(70,10,8,.8)'; for (const sd of [-1, 1]) { g.beginPath(); g.arc(x + ux * k * sd, y + uy * k * sd, 2.2, 0, 7); g.fill(); } // puckered holes
      g.strokeStyle = '#120a06'; g.lineWidth = 3.2; g.beginPath(); g.moveTo(x - ux * k, y - uy * k); g.lineTo(x + ux * k, y + uy * k); g.stroke(); // the cord
      g.strokeStyle = 'rgba(120,100,80,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - ux * k + 1, y - uy * k - 1); g.lineTo(x + ux * k + 1, y + uy * k - 1); g.stroke(); // its sheen
    }
  }
  // the eye holes sink into bruised shadow, and it has wept blood out of both of them for a long time
  for (const ex of [128 - 34, 128 + 34]) {
    const sh = g.createRadialGradient(ex, 215, 10, ex, 215, 52); sh.addColorStop(0, 'rgba(40,10,12,.95)'); sh.addColorStop(0.6, 'rgba(70,30,40,.45)'); sh.addColorStop(1, 'rgba(70,30,40,0)'); g.fillStyle = sh; g.fillRect(ex - 60, 155, 120, 120);
    for (let k = 0; k < 4; k++) drip(g, ex - 14 + rng() * 28, 228, 60 + rng() * 110, 3 + rng() * 4, k % 2 ? BLOOD.dried : BLOOD.fresh, 0.9);
  }
  // round the mouth: smeared and crusted, fresh at the corners
  const mg = g.createLinearGradient(0, 300, 0, 380); mg.addColorStop(0, 'rgba(90,8,4,0)'); mg.addColorStop(0.5, 'rgba(90,8,4,.75)'); mg.addColorStop(1, 'rgba(60,4,2,.2)'); g.fillStyle = mg; g.fillRect(40, 300, 176, 80);
  for (let i = 0; i < 6; i++) drip(g, 50 + rng() * 156, 340, 40 + rng() * 80, 3 + rng() * 4, BLOOD.fresh, 0.85);
  for (let i = 0; i < 10; i++) splat(g, rng() * S, rng() * S, 4 + rng() * 12, rng, BLOOD.dark, 0.8);
  handprint(g, 400, 300, 34, 0.6, rng, BLOOD.dried, 40); // somebody tried to push it away
  return c;
}

// wet muscle: fibre bundles running down the limb, the grooves between them, fascia, fat, and a few rags of skin
function fleshCanvas() {
  const S = 512, { c, g } = canvas(S, S), rng = makeRng(31);
  g.fillStyle = '#6a120e'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 260, 6, 40, '130,24,20', 0.5, rng);
  blotches(g, S, S, 140, 4, 26, '50,4,4', 0.5, rng);
  for (let i = 0; i < 1800; i++) { // fibres
    const x = rng() * S, y = rng() * S, l = 30 + rng() * 120;
    g.strokeStyle = `rgba(${130 + rng() * 90 | 0},${14 + rng() * 30 | 0},${12 + rng() * 20 | 0},${0.2 + rng() * 0.45})`;
    g.lineWidth = 0.8 + rng() * 2;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (rng() - 0.5) * 10, y + l / 2, x + (rng() - 0.5) * 6, y + l); g.stroke();
  }
  for (let i = 0; i < 70; i++) { const x = rng() * S; g.strokeStyle = 'rgba(25,0,0,.55)'; g.lineWidth = 1.5 + rng() * 1.5; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 20, S / 3, x - 20, (2 * S) / 3, x + (rng() - 0.5) * 16, S); g.stroke(); } // grooves
  for (let i = 0; i < 18; i++) { const x = rng() * S, y = rng() * S; g.strokeStyle = `rgba(210,190,180,${0.15 + rng() * 0.25})`; g.lineWidth = 1 + rng() * 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 14, y + 40 + rng() * 80); g.stroke(); } // fascia
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(222,190,110,${rng() * 0.4})`; g.beginPath(); g.ellipse(rng() * S, rng() * S, 3 + rng() * 9, 1.5 + rng() * 4, rng() * 3, 0, 7); g.fill(); } // fat
  for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(255,210,200,${rng() * 0.2})`; g.fillRect(rng() * S, rng() * S, 1 + rng() * 3, 5 + rng() * 14); } // wet highlights
  for (let i = 0; i < 7; i++) { const x = rng() * S, y = rng() * S; g.fillStyle = 'rgba(176,150,124,.85)'; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 7; k++) g.lineTo(x + (rng() - 0.3) * 50, y + (rng() - 0.3) * 50); g.fill(); g.strokeStyle = 'rgba(90,20,14,.8)'; g.lineWidth = 2; g.stroke(); } // skin, not all gone
  return c;
}

// the apron: heavy dark leather, scuffed and cracked, soaked from the waist down, handprints and wipe marks
function apronCanvas() {
  const W = 256, H = 512, { c, g } = canvas(W, H), rng = makeRng(41);
  g.fillStyle = '#3a2a1e'; g.fillRect(0, 0, W, H);
  blotches(g, W, H, 200, 4, 30, '70,52,36', 0.35, rng);
  blotches(g, W, H, 120, 3, 20, '20,12,8', 0.4, rng);
  grain(g, W, H, 7000, '15,8,4', 0.4, rng);
  for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(120,95,70,${rng() * 0.35})`; g.lineWidth = 0.8; g.beginPath(); const x = rng() * W, y = rng() * H; g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 40, y + (rng() - 0.5) * 6); g.stroke(); } // cracks and scuffs
  // stitched hem round the edge
  g.strokeStyle = 'rgba(150,120,90,.6)'; g.setLineDash([6, 5]); g.lineWidth = 1.5; g.strokeRect(8, 8, W - 16, H - 16); g.setLineDash([]);
  // soaked from the waist down: darker, glossier, almost black at the hem
  const hem = g.createLinearGradient(0, H * 0.35, 0, H); hem.addColorStop(0, 'rgba(70,4,2,0)'); hem.addColorStop(0.5, 'rgba(70,4,2,.6)'); hem.addColorStop(1, 'rgba(30,1,1,.95)'); g.fillStyle = hem; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) drip(g, rng() * W, rng() * H * 0.6, 60 + rng() * 200, 3 + rng() * 6, rng() < 0.5 ? BLOOD.fresh : BLOOD.dark, 0.85);
  for (let i = 0; i < 8; i++) splat(g, rng() * W, rng() * H, 8 + rng() * 22, rng, BLOOD.dark, 0.85);
  for (let i = 0; i < 4; i++) smear(g, 20 + rng() * (W - 40), 120 + rng() * 200, 24, 80 + rng() * 80, (rng() - 0.5) * 0.6, rng, BLOOD.dried);
  handprint(g, 80 + rng() * 100, 160 + rng() * 120, 30, rng() * 2, rng, BLOOD.fresh, 60);
  handprint(g, 60 + rng() * 120, 260 + rng() * 120, 28, rng() * 2, rng, BLOOD.dark, 0);
  return c;
}

// old steel: dark, pitted, rust blooming, and the business end brown with what's dried on it
function steelCanvas() {
  const S = 256, { c, g } = canvas(S, S), rng = makeRng(77);
  g.fillStyle = '#6a6c6e'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,0,0'},.06)`; g.fillRect(0, rng() * S, S, 1); } // brushed
  blotches(g, S, S, 90, 2, 14, '110,55,20', 0.5, rng); // rust
  blotches(g, S, S, 40, 1, 6, '40,20,10', 0.7, rng); // pits
  for (let i = 0; i < 8; i++) splat(g, rng() * S, rng() * S, 10 + rng() * 24, rng, rng() < 0.5 ? BLOOD.dark : BLOOD.dried, 0.9);
  for (let i = 0; i < 5; i++) drip(g, rng() * S, rng() * S * 0.5, 50 + rng() * 80, 3 + rng() * 3, BLOOD.fresh, 0.8);
  return c;
}

function M(mats) {
  if (mats.fm) return mats.fm;
  const p = (o) => new THREE.MeshPhongMaterial(o);
  const mask = tex(maskCanvas()), flesh = tex(fleshCanvas(), [2, 1]), apron = tex(apronCanvas()), steel = tex(steelCanvas());
  mats.fm = {
    mask: p({ map: mask, bumpMap: mask, bumpScale: 2, color: 0xd8ccbc, shininess: 10, specular: 0x1a1410 }),
    flesh: p({ map: flesh, bumpMap: flesh, bumpScale: 4, color: 0xb89890, shininess: 45, specular: 0x4a2220 }),
    apron: p({ map: apron, bumpMap: apron, bumpScale: 1.2, shininess: 45, specular: 0x2a1a12 }),
    steel: p({ map: steel, bumpMap: steel, bumpScale: 0.8, shininess: 90, specular: 0x666666 }),
    gum: p({ map: flesh, color: 0xa07070, shininess: 110, specular: 0x662222 }),
    teeth: [0x9c8a62, 0x8a7448, 0xb0a07a, 0x6a5a38].map((color) => p({ color, shininess: 60, specular: 0x332a1a })),
  };
  return mats.fm;
}

// The apron as a cloth panel: a grid of points, NX across and rows down. Above the waist (UP rows) it lies on his
// chest in the torso's space, curved a little round him. Below, it hangs from the waist in the hips' space and
// falls straight down, except where a thigh or shin is in the way: there it's pushed out in front of the leg, and
// everything below that point hangs from there (the cloth tents over the knee). Rows keep their length, so a
// push lifts the hem rather than stretching it. update(f) runs after the pose is set.
const AP = { W: 0.27, NX: 9, UP: 7, DOWN: 14, top: 0.68, waist: 0.15, hang: 0.86 };
function apronCloth(fm) {
  fm.apronDS ||= Object.assign(fm.apron.clone(), { side: THREE.DoubleSide });
  const { NX, UP, DOWN } = AP, rows = UP + DOWN + 1, geo = new THREE.PlaneGeometry(AP.W * 2, AP.top - AP.waist + AP.hang, NX - 1, rows - 1);
  const mesh = new THREE.Mesh(geo, fm.apronDS);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; // it's moved every frame
  const pos = geo.attributes.position, v = new THREE.Vector3(), seg = AP.hang / DOWN;
  const curve = (x) => 0.165 - (x / AP.W) ** 2 * 0.07; // round the chest and belly, not round the back
  const legZ = new Float32Array(NX), prevZ = new Float32Array(NX), prevY = new Float32Array(NX);
  function update(f) {
    f.torso.updateMatrix();
    const floorY = -f.hips.position.y + 0.03;
    // the legs, as segments in the hips' space: hip to knee, knee to ankle, with their radii
    const segs = [];
    for (const l of f.legs) {
      const a = l.thigh.rotation.x, b = a + l.knee.rotation.x, hx = l.thigh.position.x;
      const k = [hx, -0.62 * Math.cos(a), -0.62 * Math.sin(a)], ft = [hx, k[1] - 0.56 * Math.cos(b), k[2] - 0.56 * Math.sin(b)];
      segs.push([[hx, 0, 0], k, 0.075], [k, ft, 0.06]);
    }
    // how far forward the cloth has to be at (x, y) to be in front of both legs
    const legNeed = (x, y, z0) => {
      let need = z0;
      for (const [p0, p1, rad] of segs) {
        const lo = Math.min(p0[1], p1[1]), hi = Math.max(p0[1], p1[1]);
        if (y < lo - rad || y > hi + rad) continue;
        const t = Math.abs(p1[1] - p0[1]) < 1e-4 ? 0.5 : Math.min(1, Math.max(0, (y - p0[1]) / (p1[1] - p0[1])));
        const zl = p0[2] + (p1[2] - p0[2]) * t, side = Math.max(0, Math.abs(x - p0[0]) - 0.07);
        need = Math.max(need, zl + rad + 0.03 - side * (THREE.REMASTERED ? 2.2 : 0.9)); // (the remaster: wrapped round the knee, not a board)
      }
      return need;
    };
    // above the waist: on the torso (and a thigh raised high pushes the lower part of the bib out too)
    for (let r = 0; r <= UP; r++) {
      const ty = AP.top - (AP.top - AP.waist) * (r / UP);
      for (let c = 0; c < NX; c++) {
        const x = -AP.W + (2 * AP.W * c) / (NX - 1);
        v.set(x, ty, curve(x)).applyMatrix4(f.torso.matrix);
        v.z = legNeed(x, v.y, v.z);
        pos.setXYZ(r * NX + c, v.x, v.y, v.z);
        if (r === UP) { prevZ[c] = v.z; prevY[c] = v.y; }
      }
    }
    // below the waist: row by row, each point as far forward as the rest position, the legs, and the row above
    for (let r = 1; r <= DOWN; r++) {
      for (let c = 0; c < NX; c++) {
        const x = -AP.W + (2 * AP.W * c) / (NX - 1);
        legZ[c] = legNeed(x, prevY[c] - seg, prevZ[c]);
      }
      for (let c = 0; c < NX; c++) {
        // keep the row's length: pushed forward, the cloth rises a little instead of stretching
        // (a knee swinging up fast can want more than the row can give: then the leather stretches over it)
        const want = Math.max(0, legZ[c] - prevZ[c]), dz = Math.min(seg * 0.95, want);
        let y = prevY[c] - Math.max(seg * 0.3, Math.sqrt(seg * seg - dz * dz)), z = prevZ[c] + want;
        if (y < floorY) { z += floorY - y; y = floorY; } // on its knees: the hem lies on the floor
        const x = -AP.W + (2 * AP.W * c) / (NX - 1);
        pos.setXYZ((UP + r) * NX + c, x, y, z);
        prevZ[c] = z; prevY[c] = y;
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return { mesh, update };
}

export function createForemanMesh(mats) {
  const fm = M(mats);
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 1.18;
  root.add(hips);
  const legs = [];
  for (const s of [-1, 1]) {
    const thigh = limb(fm.flesh, 0.55, 0.075);
    thigh.position.x = s * 0.13;
    const knee = limb(fm.flesh, 0.56, 0.055);
    knee.position.y = -0.62;
    thigh.add(knee);
    const foot = mesh(new THREE.BoxGeometry(0.1, 0.05, 0.24), mats.darkMetal);
    foot.position.set(0, -0.62, 0.06);
    knee.add(foot);
    hips.add(thigh);
    legs.push({ thigh, knee });
  }
  const torso = new THREE.Group();
  torso.position.y = 0.05;
  hips.add(torso);
  const chest = mesh(new THREE.CapsuleGeometry(0.2, 0.55, 3, 10), fm.flesh);
  chest.scale.set(1.15, 1, 0.72);
  chest.position.y = 0.42;
  torso.add(chest);
  for (let i = 0; i < 5; i++) {
    const rib = mesh(new THREE.TorusGeometry(0.17 - i * 0.008, 0.012, 4, 10, Math.PI), mats.bone, false);
    rib.position.set(0, 0.62 - i * 0.075, 0.07);
    rib.rotation.x = Math.PI / 2 + 0.25;
    rib.rotation.z = Math.PI;
    torso.add(rib);
  }
  const spine = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 5), mats.bone, false);
  spine.position.set(0, 0.45, -0.15);
  torso.add(spine);
  // the apron: one heavy leather panel, chest to just below the knee (see apronCloth). It lives in the hips' space
  // and is re-shaped every frame by poseForeman, so it leans with him above the waist and the legs push it out
  // in front of them below it instead of walking through it
  const apron = apronCloth(fm);
  hips.add(apron.mesh);
  for (const s of [-1, 1]) { // apron straps
    const st = mesh(new THREE.BoxGeometry(0.03, 0.4, 0.02), fm.apron, false);
    st.position.set(s * 0.12, 0.78, 0.12);
    st.rotation.x = -0.3;
    torso.add(st);
  }
  // neck and the stitched face
  const neck = new THREE.Group();
  neck.position.set(0, 0.8, 0.02);
  torso.add(neck);
  const neckM = mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.26, 6), fm.flesh);
  neckM.position.y = 0.12;
  neck.add(neckM);
  const head = new THREE.Group();
  head.position.set(0, 0.28, 0.03);
  neck.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.17, 24, 16), fm.mask);
  skull.scale.set(0.82, 1.18, 0.9);
  head.add(skull);
  const eyes = [];
  for (const s of [-1, 1]) {
    const hole = mesh(new THREE.SphereGeometry(0.038, 8, 6), mats.black, false);
    hole.scale.z = 0.45;
    hole.position.set(s * 0.055, 0.05, 0.135);
    head.add(hole);
    const pupil = mesh(new THREE.SphereGeometry(0.011, 6, 4), mats.eye, false);
    pupil.position.set(s * 0.055, 0.05, 0.152);
    head.add(pupil);
    eyes.push(pupil);
  }
  // the mouth is cut much wider than a mouth should be
  const mouth = mesh(new THREE.BoxGeometry(0.2, 0.1, 0.05), mats.black, false);
  mouth.position.set(0, -0.09, 0.11);
  head.add(mouth);
  const teeth = (y, down, group) => {
    const gum = mesh(new THREE.BoxGeometry(0.2, 0.025, 0.035), fm.gum, false);
    gum.position.set(0, y + (down ? 0.012 : -0.012), 0.13);
    group.add(gum);
    for (let i = 0; i < 13; i++) {
      const a = (i / 12 - 0.5) * 1.7;
      const len = 0.03 + Math.random() * 0.045;
      const t = mesh(new THREE.ConeGeometry(0.007 + Math.random() * 0.006, len, 4), fm.teeth[(Math.random() * fm.teeth.length) | 0], false);
      t.position.set(Math.sin(a) * 0.095, y - (down ? len / 2 : -len / 2), Math.cos(a) * 0.06 + 0.085);
      t.rotation.set(down ? Math.PI : 0, Math.random() * 3, (Math.random() - 0.5) * 0.5);
      group.add(t);
    }
  };
  teeth(-0.045, true, head);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.08, 0.02);
  head.add(jaw);
  const jawM = mesh(new THREE.BoxGeometry(0.2, 0.035, 0.16), fm.flesh);
  jawM.position.set(0, -0.045, 0.06);
  jaw.add(jawM);
  teeth(-0.03, false, jaw);
  // arms, much too long
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = limb(fm.flesh, 0.6, 0.05);
    sh.position.set(s * 0.3, 0.7, 0);
    const el = limb(fm.flesh, 0.62, 0.042);
    el.position.y = -0.66;
    sh.add(el);
    const hand = new THREE.Group();
    hand.position.y = -0.7;
    el.add(hand);
    const palm = mesh(new THREE.BoxGeometry(0.08, 0.1, 0.04), fm.flesh);
    hand.add(palm);
    for (let f = 0; f < 3; f++) {
      const finger = mesh(new THREE.CylinderGeometry(0.008, 0.005, 0.2, 4), fm.flesh, false);
      finger.position.set((f - 1) * 0.025, -0.14, 0.01);
      finger.rotation.x = 0.25;
      hand.add(finger);
    }
    torso.add(sh);
    arms.push({ sh, el, hand });
  }
  // right hand: the hook; left hand: a cleaver
  const hook = new THREE.Group();
  const curve = mesh(new THREE.TorusGeometry(0.13, 0.016, 5, 14, Math.PI * 1.35), fm.steel);
  curve.position.y = -0.25;
  curve.rotation.z = Math.PI * 0.85;
  const shaft = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.25, 5), fm.steel);
  shaft.position.y = -0.1;
  const grip = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6), fm.apron);
  hook.add(curve, shaft, grip);
  hook.position.y = -0.05;
  arms[1].hand.add(hook);
  const cleaverG = new THREE.Group();
  const blade = mesh(new THREE.BoxGeometry(0.01, 0.3, 0.16), fm.steel);
  blade.position.set(0, -0.2, 0.06);
  cleaverG.add(blade);
  arms[0].hand.add(cleaverG);

  if (THREE.REMASTERED) THREE.ownRandom(() => remasterForeman({ root, torso, head, jaw, legs, arms, hook, eyes, keep: [apron.mesh] }, fm, mats)); // the remaster's body on the same rig
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  apron.update({ torso, legs, hips }); // shaped once now, in case something shows him before posing him
  return { root, hips, torso, neck, head, jaw, legs, arms, eyes, hook, apron, poseR: THREE.REMASTERED ? poseRemaster : null };
}
