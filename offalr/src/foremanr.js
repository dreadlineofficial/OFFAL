// OFFAL: REMASTERED: the Foreman's body, rebuilt inside the original rig. The joints (hips, torso, neck, head, jaw,
// thighs, knees, shoulders, elbows, hands) are the same groups at the same places, so poseForeman, the AI, the
// cutscenes and the apron cloth drive him exactly as before. Only what hangs off each joint changes: muscled,
// wasted limbs turned on real profiles instead of capsules, a gaunt chest with the spine standing out, five long
// fingers with black nails, boots, a stitched mask with thread you can see, torn lips, wet sockets, a proper cleaver.
import * as THREE from 'three';
import { turned, mesh } from './props.js';
import { bakeLocal } from './bake.js';

const swapLimb = (group, mat, key, len, profile) => {
  for (const c of group.children.slice()) if (c.isMesh && c.geometry.type === 'CapsuleGeometry') group.remove(c);
  const m = mesh(turned('fr_' + key, len, profile, 20), mat);
  group.add(m);
  return m;
};

// a run of stitches along a path on the head: each stitch is a short dark thread crossing the seam
function seam(head, mat, pts, every = 0.016) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const n = Math.max(2, Math.round(curve.getLength() / every));
  const g = new THREE.CylinderGeometry(0.0022, 0.0022, 0.026, 5);
  const ridge = new THREE.Mesh(new THREE.TubeGeometry(curve, n * 2, 0.0035, 5, false), mat.ridge);
  head.add(ridge);
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    const s = new THREE.Mesh(g, mat.thread);
    s.position.copy(p);
    const nrm = p.clone().normalize();
    const across = new THREE.Vector3().crossVectors(tan, nrm).normalize();
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), across);
    s.rotateZ((i % 2 ? 0.35 : -0.35));
    head.add(s);
  }
}

// a point on the skull's surface (the skull is a sphere of 0.17 scaled 0.82 x 1.18 x 0.9), pushed out a hair
const onSkull = (u, v, out = 1.006) => {
  const R = 0.17 * out;
  return new THREE.Vector3(Math.sin(u) * Math.cos(v) * R * 0.82, Math.sin(v) * R * 1.18, Math.cos(u) * Math.cos(v) * R * 0.9);
};

// weld the plain mesh children of a joint (not its child joints, not anything the game holds) into one mesh per material
function weldLeaves(joint, keep) {
  const g = new THREE.Group();
  for (const c of joint.children.slice()) if (c.isMesh && !c.children.length && !keep.has(c)) { joint.remove(c); g.add(c); }
  if (!g.children.length) return;
  joint.add(g);
  bakeLocal(g);
}

// a flat leather strap along a path round the body: a thin band, its face turned out from the body's axis
function strap(pts, width, mat, thick = 0.006) {
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)), false, 'centripetal');
  const n = Math.max(24, pts.length * 10), P = [], UV = [], idx = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    curve.getPointAt(u, q); curve.getTangentAt(u, T);
    c.set(0, Math.min(0.68, Math.max(0.2, q.y)), -0.01);
    N.subVectors(q, c).normalize();
    B.crossVectors(T, N).normalize(); N.crossVectors(B, T).normalize();
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) UV.push(u * curve.getLength() * 3, (a + 1) * 0.06), P.push(q.x + B.x * a * width / 2 + N.x * b * thick / 2, q.y + B.y * a * width / 2 + N.y * b * thick / 2, q.z + B.z * a * width / 2 + N.z * b * thick / 2);
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
    const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), c2 = a + 4, d = b + 4;
    idx.push(a, c2, b, b, c2, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = mesh(g, mat);
  m.castShadow = true;
  return m;
}

export function remasterForeman(F, fm, mats) {
  F.root.userData.poseR = true;
  const { torso, head, jaw, legs, arms, hook } = F;
  const mat = {
    thread: new THREE.MeshStandardMaterial({ color: 0x1e140e, roughness: 0.75 }),
    ridge: new THREE.MeshStandardMaterial({ color: 0x8a5a50, roughness: 0.45 }),
    nail: new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.3 }),
    wet: new THREE.MeshStandardMaterial({ color: 0x3a0806, roughness: 0.08 }),
    boot: new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.55, metalness: 0 }),
  };

  // ---------- legs: heavy thighs, stringy calves, boots ----------
  for (const { thigh, knee } of legs) {
    swapLimb(thigh, fm.flesh, 'thigh', 0.62, [[0, 0.09], [0.08, 0.104], [0.3, 0.098], [0.55, 0.082], [0.8, 0.064], [0.95, 0.055], [1, 0.05]]);
    swapLimb(knee, fm.flesh, 'shin', 0.6, [[0, 0.052], [0.06, 0.06], [0.22, 0.068], [0.42, 0.058], [0.7, 0.042], [0.9, 0.036], [1, 0.04]]);
    const cap = mesh(new THREE.SphereGeometry(0.05, 16, 12), fm.flesh);
    cap.scale.set(0.9, 1, 0.8); cap.position.set(0, 0.01, 0.03);
    knee.add(cap);
    for (const c of knee.children.slice()) if (c.isMesh && c.geometry.type === 'BoxGeometry') knee.remove(c);
    const boot = new THREE.Group();
    boot.position.set(0, -0.62, 0.06);
    const shaft = mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.16, 18), mat.boot); shaft.position.set(0, 0.06, -0.05);
    const sole = mesh(new THREE.BoxGeometry(0.11, 0.035, 0.27), mats.darkMetal); sole.position.set(0, -0.025, 0);
    const vamp = mesh(new THREE.BoxGeometry(0.1, 0.06, 0.2), mat.boot); vamp.position.set(0, 0.015, 0.02);
    const toe = mesh(new THREE.SphereGeometry(0.052, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat.boot); toe.scale.set(1, 0.9, 1.3); toe.position.set(0, -0.005, 0.1);
    boot.add(shaft, sole, vamp, toe);
    knee.add(boot);
  }

  // ---------- torso: a gaunt barrel, the breastbone and collarbones under the skin, the spine standing out ----------
  for (const c of torso.children.slice()) if (c.isMesh && c.geometry.type === 'CapsuleGeometry') torso.remove(c);
  const prof = [[0.0, 0.15], [0.12, 0.145], [0.25, 0.155], [0.42, 0.19], [0.58, 0.215], [0.7, 0.215], [0.8, 0.19], [0.88, 0.13], [0.94, 0.07], [0.97, 0.045]];
  const tg = new THREE.LatheGeometry(prof.map(([t, r]) => new THREE.Vector2(r, t * 0.86)), 28);
  tg.computeVertexNormals();
  const body = mesh(tg, fm.flesh);
  body.scale.set(1.12, 1, 0.7);
  body.position.y = 0.0;
  torso.add(body);
  for (const s of [-1, 1]) {
    const pec = mesh(new THREE.SphereGeometry(0.085, 20, 14), fm.flesh); pec.scale.set(1.15, 0.7, 0.45); pec.position.set(s * 0.085, 0.6, 0.085); pec.rotation.z = s * 0.25;
    const clav = mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.19, 10), fm.flesh); // collarbones under the skin clav.rotation.z = Math.PI / 2 + s * 0.18; clav.position.set(s * 0.1, 0.735, 0.08);
    const trap = mesh(new THREE.SphereGeometry(0.09, 16, 12), fm.flesh); trap.scale.set(1.3, 0.55, 0.7); trap.position.set(s * 0.1, 0.75, -0.03);
    const delt = mesh(new THREE.SphereGeometry(0.072, 18, 14), fm.flesh); delt.scale.set(1, 1.1, 1); delt.position.set(s * 0.29, 0.69, 0);
    torso.add(pec, clav, trap, delt);
  }
  const sternum = mesh(new THREE.BoxGeometry(0.03, 0.22, 0.02), fm.flesh); sternum.position.set(0, 0.58, 0.135); sternum.rotation.x = -0.1;
  torso.add(sternum);
  for (let i = 0; i < 11; i++) { // vertebrae down the back
    const v = mesh(new THREE.SphereGeometry(0.022, 10, 8), mats.bone); v.scale.set(1, 0.7, 0.8);
    v.position.set(0, 0.12 + i * 0.058, -0.125 + Math.sin(i / 10 * Math.PI) * -0.02);
    torso.add(v);
  }
  // a belly wound: a dark wet slit with stitches across it
  const slit = mesh(new THREE.CapsuleGeometry(0.012, 0.16, 4, 10), mat.wet); slit.rotation.z = 0.3; slit.position.set(-0.03, 0.26, 0.125); slit.scale.z = 0.4;
  torso.add(slit);

  // ---------- the apron's straps: up from the bib, over each shoulder, crossed down the back to the waist tie ----------
  for (const c of torso.children.slice()) if (c.isMesh && c.geometry.type === 'BoxGeometry' && c.geometry.parameters.height === 0.4) torso.remove(c);
  // heavy oiled-tan leather, wide enough to read from across a room, a buckle where each one meets the bib
  const strapM = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.55, metalness: 0 });
  const buckleM = new THREE.MeshStandardMaterial({ color: 0x8a7650, roughness: 0.35, metalness: 1 });
  for (const s of [-1, 1]) {
    const o = s > 0 ? 0.006 : 0; // one lies over the other where they cross
    torso.add(strap([[s * 0.235, 0.672, 0.118], [s * 0.205, 0.74, 0.106], [s * 0.172, 0.8, 0.062], [s * 0.162, 0.835, -0.008], [s * 0.156, 0.805, -0.09],
      [s * 0.138, 0.7, -0.155 - o], [s * 0.06, 0.52, -0.185 - o], [-s * 0.06, 0.36, -0.178 - o], [-s * 0.17, 0.2, -0.135 - o], [-s * 0.215, 0.16, -0.1]], 0.046, strapM, 0.011));
    const bk = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0045, 8, 4), buckleM); // a square buckle
    bk.rotation.set(-0.25, 0, Math.PI / 4); bk.position.set(s * 0.235, 0.672, 0.124); torso.add(bk);
  }
  torso.add(strap([[0.272, 0.15, 0.1], [0.255, 0.15, 0.01], [0.2, 0.15, -0.09], [0.1, 0.15, -0.135], [0, 0.15, -0.143], [-0.1, 0.15, -0.135], [-0.2, 0.15, -0.09], [-0.255, 0.15, 0.01], [-0.272, 0.15, 0.1]], 0.04, strapM, 0.01));
  const knot = mesh(new THREE.SphereGeometry(0.026, 12, 8), strapM); knot.scale.set(1.3, 0.9, 0.7); knot.position.set(0, 0.15, -0.152); torso.add(knot);
  for (const s of [-1, 1]) torso.add(strap([[0, 0.15, -0.155], [s * 0.025, 0.08, -0.157], [s * 0.035, -0.02, -0.152], [s * 0.03, -0.1, -0.148]], 0.032, strapM, 0.008));

  // ---------- arms: long, wasted, tendons standing out on the forearms ----------
  for (const { sh, el, hand } of arms) {
    swapLimb(sh, fm.flesh, 'uarm', 0.64, [[0, 0.062], [0.12, 0.066], [0.32, 0.06], [0.5, 0.05], [0.75, 0.04], [0.92, 0.036], [1, 0.04]]);
    swapLimb(el, fm.flesh, 'farm', 0.66, [[0, 0.042], [0.08, 0.05], [0.25, 0.046], [0.5, 0.036], [0.8, 0.027], [0.95, 0.026], [1, 0.03]]);
    const elbow = mesh(new THREE.SphereGeometry(0.043, 14, 10), fm.flesh); el.add(elbow);
    for (const [x, z] of [[0.022, 0.025], [-0.018, 0.028]]) {
      const t = mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.42, 6), fm.flesh); t.position.set(x, -0.3, z); t.rotation.x = 0.04;
      el.add(t);
    }
    // the hand: a bony palm, four long fingers in two joints each, a thumb, black nails
    for (const c of hand.children.slice()) if (c.isMesh) hand.remove(c);
    const palm = mesh(new THREE.BoxGeometry(0.085, 0.1, 0.035), fm.flesh); palm.position.y = -0.02; hand.add(palm);
    for (let f = 0; f < 4; f++) {
      const x = (f - 1.5) * 0.021, curl = 0.25 + f * 0.05;
      const base = new THREE.Group(); base.position.set(x, -0.07, 0.005); base.rotation.x = curl; hand.add(base);
      const p1 = mesh(new THREE.CylinderGeometry(0.0085, 0.0075, 0.1, 8), fm.flesh); p1.position.y = -0.05; base.add(p1);
      const k1 = mesh(new THREE.SphereGeometry(0.0095, 8, 6), fm.flesh); base.add(k1);
      const mid = new THREE.Group(); mid.position.y = -0.1; mid.rotation.x = curl * 0.9; base.add(mid);
      const p2 = mesh(new THREE.CylinderGeometry(0.0072, 0.0055, 0.1, 8), fm.flesh); p2.position.y = -0.05; mid.add(p2);
      const k2 = mesh(new THREE.SphereGeometry(0.008, 8, 6), fm.flesh); mid.add(k2);
      const nail = mesh(new THREE.ConeGeometry(0.0062, 0.035, 8), mat.nail); nail.position.y = -0.115; nail.rotation.x = Math.PI; mid.add(nail);
    }
    const th = new THREE.Group(); th.position.set(0.045, -0.02, 0.012); th.rotation.set(0.4, 0, -0.7); hand.add(th);
    const tp = mesh(new THREE.CylinderGeometry(0.009, 0.007, 0.09, 8), fm.flesh); tp.position.y = -0.045; th.add(tp);
    const tn = mesh(new THREE.ConeGeometry(0.006, 0.03, 8), mat.nail); tn.position.y = -0.1; tn.rotation.x = Math.PI; th.add(tn);
  }

  // ---------- the hook: a point, a wrapped grip ----------
  if (hook) {
    const tip = mesh(new THREE.ConeGeometry(0.016, 0.06, 12), fm.steel);
    tip.position.set(0.128, -0.31, 0); tip.rotation.z = -0.6;
    hook.add(tip);
    for (let i = 0; i < 6; i++) { const w = mesh(new THREE.TorusGeometry(0.031, 0.006, 6, 16), fm.apron); w.rotation.x = Math.PI / 2; w.position.y = 0.05 - i * 0.02; hook.add(w); }
  }
  // ---------- the cleaver: a real blade with a hanging hole and a riveted handle ----------
  const clv = arms[0].hand.children.find((c) => c.isGroup && c.children.some((m) => m.isMesh && m.geometry.type === 'BoxGeometry'));
  if (clv) {
    for (const c of clv.children.slice()) if (c.isMesh) clv.remove(c);
    const sh = new THREE.Shape();
    sh.moveTo(-0.08, 0.15); sh.lineTo(0.06, 0.15); sh.quadraticCurveTo(0.085, 0.15, 0.085, 0.12); sh.lineTo(0.08, -0.14); sh.quadraticCurveTo(0.075, -0.155, 0.05, -0.155); sh.lineTo(-0.08, -0.15); sh.lineTo(-0.08, 0.15);
    const hole = new THREE.Path(); hole.absarc(0.045, 0.11, 0.014, 0, Math.PI * 2, true); sh.holes.push(hole);
    const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 16 });
    bg.translate(0, 0, -0.003);
    const blade = mesh(bg, fm.steel);
    blade.rotation.y = Math.PI / 2; blade.position.set(0, -0.2, 0.06);
    const handle = mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.13, 14), fm.apron); handle.position.set(0, -0.03, -0.03); handle.rotation.x = 0.15;
    clv.add(blade, handle);
    for (const y of [-0.06, 0.0]) { const r = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.042, 8), fm.steel); r.rotation.z = Math.PI / 2; r.position.set(0, y - 0.0, -0.03); clv.add(r); }
  }

  // ---------- the face: stitched seams, torn lips, wet sockets ----------
  const lines = [
    [[0, 1.25], [0, 0.95], [0, 0.65], [0.02, 0.35]], // down the middle of the forehead
    [[-1.1, 0.15], [-0.7, 0.4], [-0.3, 0.55], [0.3, 0.55], [0.7, 0.4], [1.1, 0.15]], // across the brow
    [[0.95, -0.15], [0.75, -0.45], [0.55, -0.7]], // down the cheeks
    [[-0.95, -0.15], [-0.75, -0.45], [-0.55, -0.7]],
    [[-1.4, 0.6], [-1.6, 0.1], [-1.5, -0.4]], // round the sides of the mask
    [[1.4, 0.6], [1.6, 0.1], [1.5, -0.4]],
  ];
  for (const l of lines) seam(head, mat, l.map(([u, v]) => onSkull(u, v)));
  for (const s of [-1, 1]) { // a raw wet rim inside each eye hole
    const rim = mesh(new THREE.TorusGeometry(0.036, 0.007, 8, 24), mat.wet);
    rim.scale.set(1, 1, 0.5); rim.position.set(s * 0.055, 0.05, 0.13);
    head.add(rim);
  }
  for (const [y, g] of [[-0.044, head], [-0.035, jaw]]) { // lips cut back from the teeth
    const lip = mesh(new THREE.CapsuleGeometry(0.012, 0.17, 4, 12), fm.gum);
    lip.rotation.z = Math.PI / 2; lip.scale.set(1, 1, 0.6);
    lip.position.set(0, y + (g === head ? 0.018 : -0.02), 0.132);
    g.add(lip);
  }

  // a draw call per part is a lot when he is drawn again for the torch's shadow and every lamp's: weld each joint's parts
  const keep = new Set([...(F.eyes || []), ...(F.keep || [])]);
  for (const j of [torso, head, jaw, ...legs.flatMap((l) => [l.thigh, l.knee]), ...arms.flatMap((a) => [a.sh, a.el, a.hand])]) weldLeaves(j, keep);
  for (const a of arms) for (const c of a.hand.children) if (c.isGroup && c !== hook && !c.children.some((m) => m.isGroup && m === hook)) bakeLocal(c); // fingers, thumb, the cleaver
  for (const l of legs) for (const c of l.knee.children) if (c.isGroup) bakeLocal(c); // boots
}

// ---------- the remaster's movement ----------
// Laid over the original pose (monster.js poseForeman) after it has run: the same gait phase, speed and modes the AI
// drives, so he moves at exactly the same pace; only how his body moves changes. Attacks, grabs and the stunned pose
// are the original's.
export function poseRemaster(f, s) {
  const { gait, speed, mode, t, jawOpen = 0, twitch } = s;
  // what the original pose never sets, back to rest before anything else (or it would stick between modes)
  f.hips.rotation.z = 0; f.torso.rotation.y = 0; f.neck.rotation.y = 0;
  for (const l of f.legs) l.thigh.rotation.z = 0;
  if (mode === 'stunned' || mode === 'attack' || mode === 'grab') return;
  const tw = twitch || { x: 0, y: 0, z: 0, r: 0 };
  const legs = f.legs, arms = f.arms;
  const run = mode === 'chase', stalk = mode === 'stalk'; // stalk: going to a noise at half his running speed, a hunched jog
  // how much of a stride there is: a body barely moving stands, it doesn't run on the spot
  const w = Math.min(1, speed / (run ? 1.6 : stalk ? 1 : 0.5));
  if (w > 0.02) {
    // Feet planted: the AI turns the gait phase at a fixed rate per metre (3.1 rad/m running, 2.6 walking), so a
    // foot on the floor has to slide back under him at exactly 1/rate metres per radian, and then it stays put on
    // the ground while he passes over it. Each foot follows a path (on the floor, then lifted and carried forward),
    // the hips ride at the height that path allows, and the two leg joints are solved to reach it.
    const perRad = 1 / (run ? 3.1 : 2.6), duty = run ? 0.32 : stalk ? 0.42 : 0.5; // the share of a stride a foot is on the floor
    const stanceLen = duty * Math.PI * 2 * perRad, ahead = run ? 0.27 : stalk ? 0.44 : stanceLen * 0.5;
    const feet = legs.map((l, i) => {
      const u = (((gait + i * Math.PI) / (Math.PI * 2)) % 1 + 1) % 1;
      if (u < duty) return { z: ahead - (u / duty) * stanceLen, lift: 0, stance: u / duty, u };
      const s2 = (u - duty) / (1 - duty);
      // swing: the heel kicks up behind, the knee drives through high, the foot reaches out and claws back to land
      const reach = ahead + (run ? 0.12 : stalk ? 0.06 : 0.04);
      const k = s2 < 0.85 ? (1 - Math.cos(Math.PI * s2 / 0.85)) / 2 : 1;
      let z = (ahead - stanceLen) + (reach - ahead + stanceLen) * k;
      if (s2 > 0.85) z = reach - (reach - ahead) * ((s2 - 0.85) / 0.15);
      const bad = !run && i === 0; // the walk's dragged leg barely leaves the floor
      const peak = run ? (i === 0 ? 0.46 : 0.58) : stalk ? (i === 0 ? 0.16 : 0.3) : bad ? 0.05 : 0.2;
      const lift = peak * Math.pow(Math.sin(Math.PI * Math.pow(s2, run || stalk ? 0.6 : 1)), run ? 1.2 : 1);
      return { z, lift, stance: -1, u };
    });
    // the hips: running, lowest as the leg loads, thrown up between steps; walking, vaulting over the planted leg
    let H;
    if (run || stalk) { // crouched low, a predator's run: the hips drop as each leg loads and are thrown up between steps
      const x = ((gait / Math.PI) % 1 + 1) % 1, st = duty * 2;
      H = (run ? 1.12 : 1.08) + (x < st ? -0.05 * Math.sin(Math.PI * x / st) : 0.04 * Math.sin(Math.PI * (x - st) / (1 - st)));
    } else {
      const pl = feet.find((p) => p.stance >= 0) || feet[0];
      H = Math.min(1.15, Math.sqrt(1.235 ** 2 - pl.z * pl.z)) - Math.max(0, -Math.sin(gait)) * 0.035; // drops onto the good leg
    }
    H = 1.18 + (H - 1.18) * w;
    f.hips.position.y = H;
    const L1 = 0.62, L2 = 0.645;
    legs.forEach((l, i) => {
      const p = feet[i];
      const y = -H + p.lift * w, z = p.z * w;
      let d = Math.hypot(y, z);
      d = Math.min(d, L1 + L2 - 0.004);
      const inner = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
      const alpha = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
      l.thigh.rotation.x = Math.atan2(-z, -y) - alpha;
      l.knee.rotation.x = Math.PI - inner;
      l.thigh.rotation.z = (i ? 1 : -1) * 0.025 * w; // the feet land under him, not out at the hips
    });
    // the pelvis turns with the swinging leg, the chest turns back against it
    const fwd = feet.map((p) => p.z / 0.4);
    const sw = (fwd[0] - fwd[1]) * 0.5;
    f.hips.rotation.y = -sw * (run ? 0.16 : 0.1) * w;
    f.hips.rotation.z = (run || stalk ? Math.sin(gait + 0.4) * 0.06 : Math.sin(gait) * 0.08) * w;
    const shud = Math.sin(t * 29) * Math.sin(t * 7.7); // a shudder through him that never settles
    if (run) {
      // hunched almost flat, the back heaving twice a stride; the head up and cocked, locked on you, jaw hanging open;
      // both arms reaching for you, clawing at the air every stride
      const lean = 0.98 + Math.sin(gait * 2 + 0.9) * 0.07 * w;
      f.torso.rotation.x = lean;
      f.torso.rotation.y = sw * 0.25 * w;
      f.torso.rotation.z = -Math.sin(gait) * 0.07 * w + shud * 0.03 + tw.r * 0.08;
      f.neck.rotation.x = -lean * 0.92 + tw.x * 0.3;
      f.neck.rotation.y = -f.torso.rotation.y * 0.9;
      f.head.rotation.set(tw.y * 0.4, tw.z * 0.4, 0.32 + tw.r * 0.4 + Math.sin(t * 23) * 0.04);
      f.jaw.rotation.x = 0.1 + Math.max(jawOpen, 0.82 + Math.sin(t * 11) * 0.12) * 0.95;
      arms.forEach((a, i) => {
        const o = fwd[1 - i];
        // both reach out for you, grabbing in turn: the hand clawing, the hook held out in front, low
        if (i === 0) {
          a.sh.rotation.set(-1.5 - o * 0.32 * w - lean, -0.12, 0.2 + shud * 0.05);
          a.el.rotation.x = -0.25 - Math.max(0, -o) * 0.8 * w;
        } else {
          a.sh.rotation.set(-1.18 - o * 0.28 * w - lean, 0.1, -0.26);
          a.el.rotation.x = -0.35 - Math.max(0, -o) * 0.4 * w;
        }
      });
    } else if (stalk) {
      // going to a noise: a hunched, quick jog, head craned forward and turning to find it, the hook trailing
      const lean = 0.78 + Math.sin(gait * 2 + 0.9) * 0.04 * w;
      f.torso.rotation.x = lean;
      f.torso.rotation.y = sw * 0.18 * w;
      f.torso.rotation.z = -Math.sin(gait) * 0.08 * w + shud * 0.02;
      f.neck.rotation.x = -lean * 0.85 + tw.x * 0.5;
      f.neck.rotation.y = -f.torso.rotation.y * 0.8 + tw.y * 0.5;
      f.head.rotation.set(tw.y * 0.5, tw.z * 0.6, 0.22 + tw.r * 0.6);
      f.jaw.rotation.x = 0.1 + Math.max(jawOpen, 0.35 + Math.sin(t * 5) * 0.1) * 0.9;
      arms.forEach((a, i) => {
        const o = fwd[1 - i];
        if (i === 0) { a.sh.rotation.set(-0.85 - o * 0.35 * w - lean, -0.1, 0.18); a.el.rotation.x = -0.5 - Math.max(0, -o) * 0.4 * w; }
        else { a.sh.rotation.set(0.25 - o * 0.2 * w - lean, 0, -0.18); a.el.rotation.x = -0.1; }
      });
    } else {
      // the walk: a heavy limp, the left leg swung stiff and dragged, the head cocked over to one side
      f.torso.rotation.x = 0.6 + Math.sin(t * 1.3) * 0.03;
      f.torso.rotation.y = sw * 0.12 * w;
      f.torso.rotation.z = -Math.sin(gait) * 0.1 * w;
      f.neck.rotation.x = -0.35 + tw.x;
      f.head.rotation.set(tw.y, tw.z, 0.28 + tw.r); // cocked, listening
      arms.forEach((a, i) => {
        const o = fwd[1 - i], hang = -f.torso.rotation.x;
        if (i === 0) a.sh.rotation.set(hang + 0.1 - o * 0.35 * w, 0, 0.16);
        else a.sh.rotation.set(hang + 0.12 - o * 0.12 * w, 0, -0.12); // the hook arm hangs dead, swinging a little
        a.el.rotation.x = i === 0 ? -0.25 - Math.max(0, o) * 0.3 * w : -0.06;
      });
    }
    return;
  }
  // standing: the shoulders heave with each breath, the fingers of the free hand flex
  const br = Math.sin(t * 1.15);
  f.torso.rotation.x += br * 0.05;
  arms.forEach((a, i) => { a.sh.rotation.z += (i ? -1 : 1) * br * 0.04; });
}
