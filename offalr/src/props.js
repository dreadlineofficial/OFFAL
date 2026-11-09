// Procedural props: carcasses, corpses, body parts, butcher tables, lockers, lamps and the freight lift.
import * as THREE from 'three';
import { heart, liver, lung, stomach, guts } from './cutkit.js';
import { remasterBag } from './bagr.js';
import { WALL_H } from './config.js';
import { bakeLocal } from './bake.js';
import { FUSE, sculptedCarcass } from './sculpt.js';
import { patchFlesh } from './flesh.js';
import { derivePBR } from './pbr.js';

const cache = {};
// geometry shared between floors; the level teardown leaves these alone
export const geo = (key, make) => cache[key] || (cache[key] = Object.assign(make(), { userData: { shared: true } }));

export function mesh(g, m, cast = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast;
  o.receiveShadow = true;
  return o;
}
export const box = (w, h, d) => geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
export const sph = (r, s = 10) => geo(`s${r}_${s}`, () => new THREE.SphereGeometry(r, s, Math.max(6, s * 0.7 | 0)));
export const cyl = (r0, r1, h, s = 8) => geo(`c${r0}_${r1}_${h}_${s}`, () => new THREE.CylinderGeometry(r0, r1, h, s));
export const cap = (r, len) => geo(`k${r}_${len}`, () => new THREE.CapsuleGeometry(r, len, 3, 8));

// a turned (lathed) shape: profile is [[t, r], ...], t 0 at the joint .. 1 at the far end, hanging down -Y
export const turned = (key, len, profile, seg = 12) => geo(`t_${key}`, () => {
  const g = new THREE.LatheGeometry(profile.slice().reverse().map(([t, r]) => new THREE.Vector2(Math.max(0.001, r), -t * len)), seg);
  g.computeVertexNormals();
  return g;
});
// a limb with a real shape (thicker where the muscle is, thin at the joints) hanging from its joint
export function shapedLimb(mat, key, len, profile) {
  const g = new THREE.Group();
  g.add(mesh(turned(key, len, profile), mat));
  return g;
}
// a limb hanging from its joint: the group's origin is the joint, the limb runs down -Y
export function limb(mat, len, r) {
  const g = new THREE.Group();
  const m = mesh(cap(r, len), mat);
  m.position.y = -len / 2;
  g.add(m);
  return g;
}

// the remaster: an organ material the original made takes on the painted tissue (its maps, roughness and flesh light)
function dressGore(m, src) {
  if (!m || !src || m.userData.gore) return;
  m.userData.gore = true;
  for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'roughness', 'metalness']) m[k] = src[k];
  m.color.copy(src.color);
  if (src.normalScale) m.normalScale.copy(src.normalScale);
  patchFlesh(m, { tint: [1, 0.35, 0.28] });
  m.needsUpdate = true;
}

// the wet red cap on anything that was cut off
export function stump(mats, r) {
  const g = new THREE.Group();
  const flesh = mesh(cyl(r * 1.02, r * 1.02, 0.02, 10), mats.meat, false);
  const bone = mesh(cyl(r * 0.35, r * 0.35, 0.05, 6), mats.bone, false);
  bone.position.y = 0.02;
  g.add(flesh, bone);
  return g;
}

// bowel: a fat, wet, segmented rope that spills out of `start`, runs to the floor and heaps up in coils
// beside it (around `pile`, if given). The tube bulges every few centimetres so it reads as gut, not hose.
export function entrails(mats, rng, start, spread = 0.6, n = 9, pile = null) {
  const pts = [start.clone()];
  const c = pile ? pile.clone() : start.clone().add(new THREE.Vector3((rng() - 0.5) * spread * 0.5, 0, (rng() - 0.5) * spread * 0.5));
  const r0 = 0.035 + rng() * 0.01;
  if (start.y > 0.12) pts.push(new THREE.Vector3((start.x + c.x) / 2, Math.max(r0, start.y * 0.35), (start.z + c.z) / 2));
  let a = rng() * 6;
  const loops = 6 + n;
  for (let k = 0; k < loops; k++) {
    a += 1.2 + rng() * 0.9;
    const rad = spread * (0.1 + rng() * 0.16);
    c.x += (rng() - 0.5) * spread * 0.08;
    c.z += (rng() - 0.5) * spread * 0.08;
    pts.push(new THREE.Vector3(c.x + Math.cos(a) * rad, r0 + (k % 3) * r0 * 0.9 * rng(), c.z + Math.sin(a) * rad));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const seg = loops * 14, rs = 8, g = new THREE.TubeGeometry(curve, seg, r0, rs, false);
  // the segments: squeeze every ring toward the centre line on a short period
  const pos = g.attributes.position, P = new THREE.Vector3(), C = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(i / seg, C);
    const bulge = 0.72 + 0.4 * Math.abs(Math.sin(i * 0.9));
    for (let j = 0; j <= rs; j++) {
      const v = i * (rs + 1) + j;
      P.fromBufferAttribute(pos, v).sub(C).multiplyScalar(bulge).add(C);
      pos.setXYZ(v, P.x, P.y, P.z);
    }
  }
  g.computeVertexNormals();
  const grp = new THREE.Group();
  grp.add(mesh(g, mats.gut));
  return grp;
}

// the rest of what's inside a person: liver, stomach, a kidney, sometimes the heart
export function organs(mats, rng, n = 3) {
  mats.liver ||= new THREE.MeshPhongMaterial({ color: 0x3a0705, shininess: 140, specular: 0x884444 });
  mats.stomach ||= new THREE.MeshPhongMaterial({ color: 0xa65a50, map: mats.gut.map, shininess: 110, specular: 0x775555 });
  mats.heart ||= new THREE.MeshPhongMaterial({ color: 0x5a0a0a, map: mats.meat.map, shininess: 120, specular: 0x774444 });
  if (THREE.REMASTERED) for (const [k, K] of [['liver', 'goreLiver'], ['stomach', 'goreStomach'], ['heart', 'goreHeart']]) dressGore(mats[k], mats[K]);
  const g = new THREE.Group();
  const kinds = [
    () => { const o = new THREE.Group(); const l1 = mesh(sph(0.1, 12), mats.liver); l1.scale.set(1.3, 0.38, 0.85); const l2 = mesh(sph(0.07, 10), mats.liver); l2.scale.set(1.1, 0.4, 0.9); l2.position.set(0.12, -0.005, 0.03); o.add(l1, l2); return o; },
    () => { const o = mesh(sph(0.08, 12), mats.stomach); o.scale.set(1.35, 0.55, 0.8); return o; },
    () => { const o = mesh(sph(0.035, 10), mats.heart); o.scale.set(0.75, 0.6, 1.4); return o; },
    () => { const o = mesh(sph(0.055, 10), mats.heart); o.scale.set(0.9, 0.75, 1.1); const a = mesh(cyl(0.014, 0.012, 0.05, 6), mats.heart, false); a.position.set(0.01, 0.045, 0); a.rotation.z = 0.4; o.add(a); return o; },
  ];
  for (let i = 0; i < n; i++) {
    const o = kinds[i % kinds.length]();
    o.position.set((rng() - 0.5) * 0.3, 0.035, (rng() - 0.5) * 0.3);
    o.rotation.y = rng() * 6;
    g.add(o);
  }
  return g;
}

export function decal(mat, size, x, z, rot = 0, y = 0.012) {
  const m = new THREE.Mesh(geo(`d${size}`, () => new THREE.PlaneGeometry(size, size)), mat);
  m.rotation.set(-Math.PI / 2, 0, rot);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

// ---------- a person ----------
// One jointed human body, used for everything: the dead on the floor, the ones on hooks, the ones in drawers,
// and you, in the cutscenes. Built standing, facing +Z, origin at the pelvis; every joint is a group to pose.
export function makeBody(mats, rng, { cloth = null, skin = null, naked = false, bald = false, dead = true } = {}) {
  // the dead go grey and mottled; the bleach in the picture turns live-looking skin chalk white
  mats.skinDead ||= [mats.skin, mats.skinGrey].map((m, i) => new THREE.MeshPhongMaterial({ map: m.map, color: i ? 0xa8a49c : 0xb4a89a, shininess: 25, specular: 0x1a1a1a }));
  if (THREE.REMASTERED && !mats.skinDead[0].userData.flesh) THREE.ownRandom(() => mats.skinDead.forEach((m) => { if (mats.skin.normalMap) Object.assign(m, { normalMap: mats.skin.normalMap, roughnessMap: mats.skin.roughnessMap, roughness: 1 }); patchFlesh(m, { wrap: 0.35, amount: 0.5, tint: [1, 0.6, 0.5] }); }));
  skin ||= dead ? mats.skinDead[(rng() * 2) | 0] : rng() < 0.5 ? mats.skin : mats.skinGrey;
  cloth = naked ? skin : cloth || (rng() < 0.5 ? mats.coverall : mats.coverall2);
  const root = new THREE.Group();
  // the hips: a wide, flattened bowl the legs hang from
  const pelvis = mesh(turned('pelvis', 0.2, [[0, 0.135], [0.35, 0.16], [0.7, 0.155], [1, 0.1]], 14), cloth);
  pelvis.position.y = 0.09;
  pelvis.scale.set(1, 1, 0.68);
  root.add(pelvis);
  const torso = new THREE.Group();
  torso.position.y = 0.07;
  root.add(torso);
  // the trunk: a waist, the ribcage widening to the chest, the shoulders rounding off to the neck
  const belly = mesh(turned('belly', 0.24, [[0, 0.142], [0.45, 0.13], [1, 0.145]], 14), cloth);
  belly.rotation.x = Math.PI;
  belly.position.y = 0.0;
  belly.scale.z = 0.7;
  const chest = mesh(turned('chest', 0.3, [[0, 0.145], [0.35, 0.168], [0.7, 0.178], [0.9, 0.15], [1, 0.07]], 14), cloth);
  chest.rotation.x = Math.PI;
  chest.position.y = 0.235;
  chest.scale.set(1.08, 1, 0.64);
  torso.add(belly, chest);
  for (const sx of [-1, 1]) {
    const sh = mesh(sph(0.068, 10), cloth); sh.position.set(sx * 0.18, 0.455, 0); sh.scale.set(1, 0.9, 0.9); torso.add(sh); // deltoids
    const pec = mesh(sph(0.08, 10), cloth); pec.position.set(sx * 0.075, 0.4, 0.07); pec.scale.set(1.1, 0.7, 0.45); torso.add(pec);
  }
  const trap = mesh(sph(0.1, 10), cloth); trap.position.set(0, 0.49, -0.015); trap.scale.set(1.65, 0.45, 0.8); torso.add(trap);
  const neck = new THREE.Group();
  neck.position.y = 0.5;
  torso.add(neck);
  const neckM = mesh(cyl(0.045, 0.05, 0.11, 7), skin);
  neckM.position.y = 0.05;
  neck.add(neckM);
  const head = new THREE.Group();
  head.position.y = 0.11;
  neck.add(head);
  const skull = mesh(sph(0.1, 12), skin);
  skull.scale.set(0.86, 1.05, 1.0);
  skull.position.y = 0.1;
  head.add(skull);
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.06, 0.01);
  const jawM = mesh(sph(0.075, 10), skin);
  jawM.scale.set(0.85, 0.62, 1.0);
  jawM.position.set(0, -0.025, 0.025);
  jaw.add(jawM);
  head.add(jaw);
  const nose = mesh(geo('nose', () => new THREE.ConeGeometry(0.018, 0.045, 5)), skin, false);
  nose.position.set(0, 0.095, 0.1);
  nose.rotation.x = Math.PI / 2 - 0.3;
  head.add(nose);
  mats.sclera ||= new THREE.MeshPhongMaterial({ color: 0x8f8a7c, shininess: 80, specular: 0x333333 });
  mats.bruise ||= new THREE.MeshPhongMaterial({ color: 0x2a1512, shininess: 20, specular: 0x111111 });
  mats.mouthIn ||= new THREE.MeshPhongMaterial({ color: 0x1c0605, shininess: 60, specular: 0x331111 });
  for (const sx of [-1, 1]) {
    const ear = mesh(sph(0.026, 6), skin, false);
    ear.scale.set(0.4, 1, 0.7);
    ear.position.set(sx * 0.088, 0.095, -0.005);
    head.add(ear);
    // sunken, half open, looking at nothing
    const socket = mesh(sph(0.024, 8), mats.bruise, false);
    socket.scale.set(1.1, 0.8, 0.5);
    socket.position.set(sx * 0.035, 0.112, 0.08);
    const eye = mesh(sph(0.015, 8), mats.sclera, false);
    eye.position.set(sx * 0.035, 0.109, 0.084);
    const lid = mesh(sph(0.018, 8), skin, false);
    lid.scale.set(1.15, 0.62, 0.75);
    lid.position.set(sx * 0.035, 0.119, 0.087);
    head.add(socket, eye, lid);
  }
  // the mouth hangs open: a dark hole you see when the jaw drops, a few teeth at the top of it
  const hole = mesh(sph(0.026, 8), mats.mouthIn, false);
  hole.scale.set(0.95, 1.25, 0.55);
  hole.position.set(0, 0.04, 0.074);
  head.add(hole);
  const teeth = mesh(box(0.036, 0.011, 0.008), mats.tooth, false);
  teeth.position.set(0, 0.06, 0.088);
  head.add(teeth);
  const lip = mesh(box(0.05, 0.012, 0.014), skin, false);
  lip.position.set(0, 0.069, 0.09);
  head.add(lip);
  const trickle = mesh(box(0.008, 0.07, 0.004), mats.blood, false); // from the corner of the mouth
  trickle.position.set(0.022, 0.015, 0.082);
  trickle.rotation.z = 0.25;
  head.add(trickle);
  if (dead) {
    // the side of the head where it hit the floor, or something hit it
    const wound = mesh(geo('wound', () => new THREE.SphereGeometry(0.103, 10, 8, 0, 1.6, 0.2, 1.3)), mats.blood, false);
    wound.position.y = 0.1;
    wound.rotation.y = rng() * 6;
    head.add(wound);
  }
  if (!bald) {
    const hair = mesh(sph(0.104, 10), mats.hair || mats.darkMetal, false);
    hair.scale.set(0.9, 0.72, 1.04);
    hair.position.set(0, 0.14, -0.012);
    head.add(hair);
  }
  const arms = [-1, 1].map((sx) => {
    const sh = shapedLimb(cloth, 'uarm', 0.29, [[0, 0.052], [0.3, 0.05], [0.75, 0.039], [1, 0.035]]);
    sh.position.set(sx * 0.2, 0.44, 0);
    const el = shapedLimb(rng() < 0.5 ? skin : cloth, 'farm', 0.27, [[0, 0.037], [0.25, 0.042], [0.75, 0.029], [1, 0.024]]);
    el.position.y = -0.29;
    sh.add(el);
    el.add(mesh(sph(0.038, 8), el.children[0].material, false)); // the elbow
    const hand = new THREE.Group();
    hand.position.y = -0.27;
    const palm = mesh(sph(0.042, 8), skin, false);
    palm.scale.set(0.85, 1.15, 0.42);
    palm.position.y = -0.04;
    const thumb = mesh(cap(0.01, 0.035), skin, false);
    thumb.position.set(sx * -0.032, -0.035, 0.014);
    thumb.rotation.z = sx * 0.55;
    hand.add(palm, thumb);
    for (let f = 0; f < 4; f++) { const fg = mesh(cap(0.0085, 0.05 - Math.abs(f - 1.5) * 0.008), skin, false); fg.position.set((f - 1.5) * 0.017, -0.105, 0.004); fg.rotation.x = 0.25; hand.add(fg); } // fingers, slack
    el.add(hand);
    torso.add(sh);
    sh.userData = { el, hand };
    return sh;
  });
  const legs = [-1, 1].map((sx) => {
    const hip = shapedLimb(cloth, 'thigh', 0.42, [[0, 0.08], [0.15, 0.082], [0.55, 0.066], [0.88, 0.05], [1, 0.047]]);
    hip.position.set(sx * 0.09, -0.04, 0);
    const knee = shapedLimb(cloth, 'calf', 0.42, [[0, 0.05], [0.25, 0.057], [0.55, 0.045], [0.85, 0.031], [1, 0.03]]);
    knee.position.y = -0.42;
    hip.add(knee);
    knee.add(mesh(sph(0.05, 8), cloth, false)); // the knee
    // a bare foot (inside the boot when there is one)
    const foot = mesh(sph(0.045, 8), skin, false);
    foot.scale.set(0.85, 0.62, 1.95);
    foot.position.set(0, -0.445, 0.055);
    knee.add(foot);
    const boot = mesh(box(0.1, 0.09, 0.25), mats.bag, false);
    boot.position.set(0, -0.44, 0.055);
    knee.add(boot);
    root.add(hip);
    hip.userData = { knee, boot };
    return hip;
  });
  const res = { root, pelvis, torso, chest, belly, neck, head, jaw, arms, legs, skin, cloth };
  if (THREE.REMASTERED && dead) FUSE.set(root, res); // the remaster fuses its skin and clothes once it is posed (sculpt.js)
  return res;
}

// opened from the throat to the belt: a red cavity and the cage of ribs over it
export function openChest(b, mats) {
  // the remaster carves the opening into the fused chest and shows the inside of this as the pit
  if (THREE.REMASTERED) mats.meatPit ||= THREE.ownRandom(() => Object.assign(mats.meat.clone(), { side: THREE.BackSide }));
  const cav = mesh(sph(0.13, 10), THREE.REMASTERED ? mats.meatPit : mats.meat);
  if (THREE.REMASTERED) cav.userData.cavity = true;
  cav.scale.set(1.05, 1.75, 0.38);
  cav.position.set(0, 0.27, 0.085);
  b.torso.add(cav);
  mats.lung ||= new THREE.MeshPhongMaterial({ color: 0x9a5a5a, map: mats.gut.map, shininess: 60, specular: 0x553333 });
  if (THREE.REMASTERED) dressGore(mats.lung, mats.goreLung);
  for (const [x, y, r, m] of [[-0.06, 0.36, 0.06, mats.lung], [0.065, 0.35, 0.055, mats.lung], [0.0, 0.26, 0.045, mats.gut], [0.03, 0.17, 0.05, mats.gut], [-0.05, 0.19, 0.045, mats.gut]]) {
    const lump = mesh(sph(r, 9), m, false);
    lump.scale.set(1, 1.2, 0.6);
    lump.position.set(x, y, 0.11);
    if (THREE.REMASTERED) lump.visible = false; // (still made: the floor's random rolls must come out as in the original)
    b.torso.add(lump);
  }
  if (THREE.REMASTERED) THREE.ownRandom(() => b.torso.add(viscera(mats).clone())); // the real thing instead of the lumps
  for (let i = 0; i < 4; i++) {
    const rib = mesh(geo('chrib', () => new THREE.TorusGeometry(0.11, 0.011, 4, 10, Math.PI)), mats.bone, false);
    rib.rotation.x = Math.PI / 2;
    rib.scale.set(1.1, 1, 0.55);
    rib.position.set(0, 0.29 + i * 0.055, 0.075);
    b.torso.add(rib);
  }
  const sternum = mesh(box(0.025, 0.2, 0.012), mats.bone, false);
  sternum.position.set(0.11, 0.33, 0.13);
  sternum.rotation.z = 0.5;
  b.torso.add(sternum);
  return cav;
}

// the remaster's insides: lungs, heart, liver, stomach and a coil of gut packed into the open chest; made once, and
// every opened body gets a copy (sharing its shapes and materials)
function viscera(mats) {
  return (mats.viscera ||= THREE.ownRandom(() => {
    const g = new THREE.Group(), put = (o, x, y, z, s, rz = 0) => { o.position.set(x, y, z); o.scale.set(s, s, s * 0.62); o.rotation.z = rz; g.add(o); return o; };
    put(lung(mats), -0.068, 0.385, 0.1, 0.62, 0.12); put(lung(mats), 0.068, 0.385, 0.1, 0.62, -0.12).scale.x *= -1;
    put(heart(mats), 0.012, 0.345, 0.125, 0.62, 0.3);
    put(liver(mats), -0.035, 0.255, 0.112, 0.6, -0.15);
    put(stomach(mats), 0.055, 0.245, 0.115, 0.55, 0.4);
    put(guts(mats, 0.075, 3), 0, 0.15, 0.1, 0.9);
    g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    return g;
  }));
}

// ---------- hanging carcasses ----------
export function makeCarcass(mats, rng, human) {
  const root = new THREE.Group(); // origin at the ceiling rail; swings about it
  const chainLen = 0.5 + rng() * 0.4;
  for (let y = 0; y < chainLen; y += 0.07) {
    const link = mesh(geo('link', () => new THREE.TorusGeometry(0.03, 0.008, 4, 8)), mats.chain, false);
    link.position.y = -y;
    link.rotation.y = (y * 14.3) % 2 < 1 ? 0 : Math.PI / 2;
    root.add(link);
  }
  const hook = mesh(geo('hook', () => new THREE.TorusGeometry(0.09, 0.014, 5, 12, Math.PI * 1.4)), mats.darkMetal, false);
  hook.position.y = -chainLen - 0.08;
  hook.rotation.z = Math.PI * 0.8;
  root.add(hook);
  let body = new THREE.Group();
  body.position.y = -chainLen - 0.16;
  root.add(body);
  if (human) {
    // strung up by the ankles, opened down the front, no head
    const b = makeBody(mats, rng, { naked: true, bald: true });
    b.root.rotation.z = Math.PI; // upside down
    b.root.position.y = THREE.REMASTERED ? -0.89 : -0.95;
    // the remaster: ankles together and bound, the hook through the rope between them (not spread on either side of it)
    b.legs.forEach((l, i) => { l.rotation.z = THREE.REMASTERED ? (i ? -1 : 1) * 0.1 : (i ? -1 : 1) * 0.28; if (THREE.REMASTERED) l.userData.boot.visible = false; }); // (bare feet)
    if (THREE.REMASTERED) THREE.ownRandom(() => { mats.bindRope ||= new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 0.95 }); const r = mesh(new THREE.TorusGeometry(0.075, 0.016, 6, 14), mats.bindRope, false); r.rotation.x = Math.PI / 2; r.scale.set(1, 0.7, 1); r.position.y = -0.03; body.add(r); });
    b.arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * 0.15; a.userData.el.rotation.x = -0.1; });
    b.head.visible = false;
    const neck = stump(mats, 0.055);
    neck.position.y = 0.06;
    b.neck.add(neck);
    if (!(THREE.gore && THREE.gore.less)) openChest(b, mats); // (Less gore: shut)
    body.add(b.root);
    const stream = mesh(cyl(0.006, 0.01, 1, 4), mats.blood, false);
    stream.scale.y = Math.max(0.2, WALL_H - chainLen - 2.05);
    stream.position.y = -1.95 - stream.scale.y / 2;
    body.add(stream);
  } else {
    // the remaster shows its sculpted side (sculpt.js) instead; the original's parts are still made, unseen, so the
    // game's own random rolls after this come out exactly as in the original (three.js ids are drawn from them)
    const sculpted = THREE.REMASTERED && mats.carcassFat;
    const body0 = body;
    if (sculpted) body = { add() {} }; // not a Group: that would draw an id the original never draws
    // a split side: fat outside, meat and ribs in the cavity
    const prof = [[0.02, 0], [0.13, 0.1], [0.22, 0.32], [0.25, 0.65], [0.21, 0.95], [0.11, 1.12], [0.02, 1.18]].map(([r, y]) => new THREE.Vector2(r, y));
    const lg = geo('lathe', () => new THREE.LatheGeometry(prof, 10, 0, Math.PI));
    const outer = mesh(lg, mats.fat);
    mats.meatInside ||= new THREE.MeshPhongMaterial({ map: mats.meat.map, side: THREE.BackSide, shininess: 70, specular: 0x552222 });
    const inner = mesh(lg, mats.meatInside);
    inner.castShadow = false;
    for (const m of [outer, inner]) { m.position.y = -1.2; m.scale.z = 0.8; body.add(m); }
    for (let i = 0; i < 7; i++) {
      const rib = mesh(geo('prib', () => new THREE.TorusGeometry(0.2, 0.011, 4, 10, Math.PI)), mats.bone, false);
      rib.position.set(0, -0.95 + i * 0.09, 0);
      rib.rotation.x = Math.PI / 2;
      rib.scale.set(1, 0.7, 1);
      body.add(rib);
    }
    for (const s of [-1, 1]) {
      const leg = mesh(cap(0.05, 0.35), mats.fat);
      leg.position.set(s * 0.06, -0.15, 0.05);
      leg.rotation.z = s * 0.4;
      body.add(leg);
    }
    if (sculpted) { body = body0; THREE.ownRandom(() => body.add(sculptedCarcass(mats, dressRng()))); }
  }
  root.userData.swing = { a: (rng() - 0.5) * 0.15, v: 0, phase: rng() * 6 };
  return root;
}

// ---------- the dead workers you cut tags out of ----------
export function makeCorpse(mats, rng) {
  const g = new THREE.Group();
  const b = makeBody(mats, rng);
  const less = THREE.gore && THREE.gore.less;
  const cavity = less ? new THREE.Group() : openChest(b, mats); // (Less gore: the chest stays shut)
  // sprawled on its back where it fell: arms flung out, head lolled to one side, jaw hanging
  const lay = new THREE.Group();
  lay.rotation.x = -Math.PI / 2;
  lay.position.y = 0.125;
  lay.add(b.root);
  g.add(lay);
  b.arms.forEach((a, i) => {
    const sx = i ? 1 : -1;
    a.rotation.z = sx * (0.5 + rng() * 1.2);
    a.userData.el.rotation.z = sx * rng() * 0.9;
  });
  b.legs.forEach((l, i) => { l.rotation.z = (i ? 1 : -1) * (0.05 + rng() * 0.2); }); // (outward: legs[0] is the left, at -x; the old sign crossed them into an X)
  if (rng() < 0.35) { const l = b.legs[(rng() * 2) | 0]; l.rotation.x = -0.75; l.userData.knee.rotation.x = 1.35; } // one knee up
  b.head.rotation.y = (rng() < 0.5 ? -1 : 1) * (0.4 + rng() * 0.6);
  b.jaw.rotation.x = 0.25 + rng() * 0.35;
  const parts = [];
  if (rng() < 0.25) { // something taken
    const a = b.arms[(rng() * 2) | 0];
    a.userData.el.visible = false;
    const st = stump(mats, 0.04);
    st.position.y = -0.29;
    st.rotation.x = Math.PI;
    a.add(st);
    parts.push('forearm');
  }
  // what came out of the belly, onto the floor beside it
  const side = rng() < 0.5 ? -1 : 1;
  const guts = entrails(mats, rng, new THREE.Vector3(0.05 * side, 0.2, -0.2), 1.1, 6, new THREE.Vector3(0.42 * side, 0, -0.12));
  const org = organs(mats, rng, 1 + ((rng() * 3) | 0));
  org.position.set(0.5 * side, 0, -0.5);
  if (!less) g.add(guts, org); // (made either way, so the floor's rolls come out the same)
  const pool = decal(mats.pool[(rng() * 3) | 0], 2.4, 0.05, -0.35, rng() * 6);
  g.add(pool);
  // the brass tag, deep in the opened chest
  const tag = mesh(box(0.07, 0.004, 0.045), mats.brass, false);
  tag.position.set(0.03, 0.25, -0.38);
  tag.rotation.set(0.6, 0.3, 0.4);
  g.add(tag);
  const N = 24, fp = new Float32Array(N * 3);
  const flies = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(fp, 3)),
    mats.fly ||= new THREE.PointsMaterial({ color: 0x1a140c, size: 0.007, sizeAttenuation: true }));
  flies.userData.seeds = Array.from({ length: N }, () => [rng() * 6, rng() * 6, 0.5 + rng(), rng() * 6]);
  flies.position.z = -0.35;
  g.add(flies);
  return { group: g, tag, cavity, pool, flies, parts, body: b };
}

export function animateFlies(flies, t) {
  const p = flies.geometry.attributes.position, s = flies.userData.seeds;
  for (let i = 0; i < s.length; i++) {
    const [a, b, sp, c] = s[i];
    p.setXYZ(i, Math.sin(t * sp * 3 + a) * 0.45 + Math.sin(t * 9 + c) * 0.06, 0.35 + Math.sin(t * sp * 2 + b) * 0.28, Math.cos(t * sp * 2.5 + c) * 0.45 + Math.cos(t * 11 + a) * 0.05);
  }
  p.needsUpdate = true;
}

// ---------- loose body parts ----------
export function severedArm(mats, rng) {
  const g = new THREE.Group();
  const skin = rng() < 0.5 ? mats.skin : mats.skinGrey;
  if (THREE.REMASTERED) return THREE.ownRandom(() => hdArm(mats, skin)); // (the same one roll as the original)
  const a = mesh(cap(0.05, 0.5), skin);
  a.rotation.z = Math.PI / 2;
  g.add(a);
  const st = stump(mats, 0.05);
  st.position.x = 0.3;
  st.rotation.z = -Math.PI / 2;
  g.add(st);
  const hand = mesh(box(0.1, 0.03, 0.08), skin);
  hand.position.x = -0.33;
  g.add(hand);
  g.position.y = 0.05;
  return g;
}

export function severedHead(mats, rng) {
  const g = new THREE.Group();
  const skin = rng() < 0.5 ? mats.skin : mats.skinGrey;
  if (THREE.REMASTERED) return THREE.ownRandom(() => hdHead(mats, skin));
  const s = mesh(sph(0.11, 12), skin);
  s.scale.set(0.9, 1.1, 0.95);
  g.add(s);
  const hair = mesh(sph(0.115, 10), mats.hair || mats.darkMetal);
  hair.scale.set(0.95, 0.75, 1);
  hair.position.y = 0.04;
  hair.position.z = -0.01;
  g.add(hair);
  for (const x of [-1, 1]) {
    const e = mesh(sph(0.022, 6), mats.black, false);
    e.position.set(x * 0.04, 0.02, 0.09);
    g.add(e);
  }
  const m = mesh(sph(0.035, 6), mats.black, false);
  m.scale.set(1, 1.3, 0.6);
  m.position.set(0, -0.06, 0.085);
  g.add(m);
  const st = stump(mats, 0.06);
  st.position.y = -0.11;
  st.rotation.x = Math.PI;
  g.add(st);
  g.position.y = 0.11;
  return g;
}

// ---------- the remaster's severed parts ----------
// the torn end of anything: a ragged collar of meat, the bone standing out of it, a tendon or two hanging loose
function tornEnd(mats, r, boneR = r * 0.32) {
  const g = new THREE.Group();
  // the torn face: the limb's own section, its top pulled ragged (skin and muscle part at different heights)
  const geom = new THREE.CylinderGeometry(r * 0.97, r * 1.0, r * 0.5, 16, 2);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0) { const k = 1 - Math.random() * 0.25; pos.setXYZ(i, pos.getX(i) * k, y + Math.random() * r * 0.45, pos.getZ(i) * k); }
  }
  geom.computeVertexNormals();
  g.add(mesh(geom, mats.meat, false));
  // a few strands of muscle torn longer than the rest, lying back over the edge
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * Math.PI * 2, l = mesh(sph(r * (0.22 + Math.random() * 0.12), 7), mats.meat, false);
    l.position.set(Math.cos(a) * r * 0.55, r * 0.35, Math.sin(a) * r * 0.55); l.scale.set(0.7, 0.45, 1.4); l.rotation.y = -a; g.add(l);
  }
  const bone = mesh(cyl(boneR * 0.85, boneR, r * 1.1, 8), mats.bone, false); bone.position.y = r * 0.6; g.add(bone);
  const knob = mesh(sph(boneR * 1.05, 8), mats.bone, false); knob.scale.set(1, 0.55, 1); knob.position.y = r * 1.15; g.add(knob); // snapped, not cut
  const t = mesh(cyl(r * 0.05, r * 0.03, r * 1.4, 5), mats.meat, false); t.position.set(r * 0.3, r * 0.5, -r * 0.2); t.rotation.set(0.9, 0, 0.5); g.add(t); // a tendon, loose
  return g;
}
// a finger: three bones, each one curled further (they set like that, after)
function finger(skin, nail, len, r, curl) {
  const root = new THREE.Group();
  let at = root;
  [0.45, 0.32, 0.23].forEach((k, i) => {
    const seg = new THREE.Group(); seg.rotation.x = i ? curl : curl * 0.6; at.add(seg);
    const b = mesh(cap(r * (1 - i * 0.12), len * k), skin, false); b.position.y = -len * k / 2; seg.add(b);
    const next = new THREE.Group(); next.position.y = -len * k; seg.add(next);
    if (i === 2) { const n = mesh(box(r * 1.5, len * 0.12, r * 0.5), nail, false); n.position.set(0, -len * k * 0.7, r * 0.85); seg.add(n); }
    at = next;
  });
  return root;
}
function hdArm(mats, skin) {
  mats.nail ||= new THREE.MeshPhongMaterial({ color: 0xc8b8a0, shininess: 60, specular: 0x333333 });
  const arm = new THREE.Group(); // built hanging down -Y from the torn upper arm, then laid on the floor
  const up = shapedLimb(skin, 'sa_uarm', 0.17, [[0, 0.046], [0.4, 0.049], [1, 0.039]]);
  arm.add(up);
  const elbow = new THREE.Group(); elbow.position.y = -0.17; elbow.rotation.x = -0.35 - Math.random() * 0.5; up.add(elbow);
  elbow.add(mesh(sph(0.04, 10), skin, false));
  const fore = shapedLimb(skin, 'sa_farm', 0.27, [[0, 0.04], [0.22, 0.045], [0.7, 0.031], [1, 0.026]]); elbow.add(fore);
  const wrist = new THREE.Group(); wrist.position.y = -0.27; wrist.rotation.x = 0.3; elbow.add(wrist);
  const palm = mesh(sph(0.045, 10), skin, false); palm.scale.set(0.95, 1.2, 0.42); palm.position.y = -0.045; wrist.add(palm);
  const back = mesh(box(0.07, 0.06, 0.02), skin, false); back.position.set(0, -0.05, -0.008); wrist.add(back);
  for (let f = 0; f < 4; f++) {
    const fg = finger(skin, mats.nail, 0.085 - Math.abs(f - 1.4) * 0.012, 0.0085, 0.45 + Math.random() * 0.5);
    fg.position.set((f - 1.5) * 0.018, -0.095, 0.004); fg.rotation.z = (f - 1.5) * -0.06; wrist.add(fg);
  }
  const th = finger(skin, mats.nail, 0.065, 0.0095, 0.3); th.position.set(-0.038, -0.035, 0.016); th.rotation.set(0.5, 0, 0.75); wrist.add(th);
  // the torn end at the top of the upper arm
  const end = tornEnd(mats, 0.047, 0.014); arm.add(end);
  // lay it down: along the floor, turned onto its side at random
  arm.rotation.set(0, 0, Math.PI / 2); arm.position.set(-0.3, 0, 0); // (centred: it runs from -0.3 to +0.3)
  const g = new THREE.Group(); g.add(arm);
  g.rotation.x = (Math.random() - 0.5) * 0.6;
  g.position.y = 0.045;
  return g;
}
function hdHead(mats, skin) {
  const b = makeBody(mats, Math.random, { skin, dead: true, bald: Math.random() < 0.3 });
  const head = b.head; head.parent.remove(head);
  head.position.set(0, 0, 0); head.rotation.set(0, 0, 0);
  b.jaw.rotation.x = 0.3 + Math.random() * 0.3;
  // what's left of the neck, and the end of it
  const neck = mesh(cyl(0.048, 0.05, 0.06, 12), skin, false); neck.position.y = -0.01; head.add(neck);
  const end = tornEnd(mats, 0.05, 0.016); end.rotation.x = Math.PI; end.position.y = -0.04; head.add(end);
  const pipe = mesh(geo('trachea', () => new THREE.TorusGeometry(0.012, 0.004, 5, 10)), mats.bone, false); pipe.rotation.x = Math.PI / 2; pipe.position.set(0, -0.045, 0.028); head.add(pipe);
  // on its side, on the floor, the face half turned up
  const g = new THREE.Group(); g.add(head);
  head.rotation.set(0.2, Math.random() * 6, Math.PI / 2 - 0.25);
  g.position.y = 0.1;
  return g;
}

export function meatChunk(mats, rng) {
  const m = mesh(geo('chunk', () => new THREE.IcosahedronGeometry(0.1, 0)), rng() < 0.5 ? mats.meat : mats.gut);
  m.scale.set(0.6 + rng(), 0.4 + rng() * 0.4, 0.6 + rng());
  m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
  m.position.y = 0.04;
  return m;
}

export function cleaver(mats) {
  const g = new THREE.Group();
  const blade = mesh(box(0.28, 0.005, 0.13), mats.steel);
  const handle = mesh(cyl(0.015, 0.015, 0.14, 6), mats.darkMetal);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(-0.2, 0, -0.04);
  g.add(blade, handle);
  return g;
}

export function bucket(mats) {
  const g = new THREE.Group();
  const b = mesh(cyl(0.16, 0.13, 0.32, 10), mats.steel);
  b.position.y = 0.16;
  const fill = mesh(cyl(0.15, 0.15, 0.01, 10), mats.blood, false);
  fill.position.y = 0.3;
  g.add(b, fill);
  return g;
}

// ---------- furniture ----------
export function butcherTable(mats, rng) {
  const g = new THREE.Group();
  const top = mesh(box(1.8, 0.06, 0.8), mats.steel);
  top.position.y = 0.9;
  g.add(top);
  for (const x of [-0.82, 0.82]) for (const z of [-0.34, 0.34]) {
    const l = mesh(cyl(0.025, 0.025, 0.9, 6), mats.darkMetal);
    l.position.set(x, 0.45, z);
    g.add(l);
  }
  const shelf = mesh(box(1.7, 0.03, 0.7), mats.darkMetal);
  shelf.position.y = 0.25;
  g.add(shelf);
  // what's on it
  const n = 2 + ((rng() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const k = rng();
    let p;
    if (k < 0.25) p = severedArm(mats, rng);
    else if (k < 0.45) p = severedHead(mats, rng);
    else if (k < 0.7) p = entrails(mats, rng, new THREE.Vector3(0, 0.05, 0), 0.6, 8);
    else if (k < 0.85) p = cleaver(mats);
    else p = meatChunk(mats, rng);
    p.position.x += -0.6 + (i / Math.max(1, n - 1)) * 1.2;
    p.position.z += (rng() - 0.5) * 0.4;
    p.position.y += 0.93;
    p.rotation.y = rng() * 6;
    g.add(p);
  }
  for (let i = 0; i < 4; i++) { // runoff
    const s = mesh(cyl(0.004, 0.006, 0.9, 4), mats.blood, false);
    s.position.set((rng() - 0.5) * 1.6, 0.45, 0.4);
    g.add(s);
  }
  g.add(decal(mats.pool[(rng() * 3) | 0], 1.8, 0, 0.5, rng() * 6));
  return g;
}

// put something that's lying down fully on a surface: measures it, centres it on the rectangle x0..x1 / z0..z1,
// sets it down on top, and shrinks it a little if it's longer than the surface (only the length counts: an elbow
// over the edge of a narrow tray is fine). Call before the prop is placed.
export function layOn(obj, x0, x1, z0, z1, top, margin = 0.04) {
  obj.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(obj), size = bb.getSize(new THREE.Vector3());
  const fit = Math.min(1, x1 - x0 > z1 - z0 ? (x1 - x0 - margin * 2) / Math.max(1e-3, size.x) : (z1 - z0 - margin * 2) / Math.max(1e-3, size.z));
  if (fit < 1) { obj.scale.multiplyScalar(fit); obj.updateMatrixWorld(true); bb.setFromObject(obj); }
  const c = bb.getCenter(new THREE.Vector3());
  obj.position.x += (x0 + x1) / 2 - c.x;
  obj.position.z += (z0 + z1) / 2 - c.z;
  obj.position.y += top - bb.min.y;
  return obj;
}

export function gurney(mats, rng) {
  const g = new THREE.Group();
  const frame = mesh(box(1.9, 0.04, 0.65), mats.steel);
  frame.position.y = 0.75;
  g.add(frame);
  for (const x of [-0.85, 0.85]) for (const z of [-0.28, 0.28]) {
    const l = mesh(cyl(0.02, 0.02, 0.75, 5), mats.darkMetal);
    l.position.set(x, 0.375, z);
    g.add(l);
  }
  // somebody under a sheet that hangs down over the sides
  const body = shroud(mats, rng, 1.9, 0.65, 0.28);
  body.rotation.y = Math.PI / 2;
  body.position.y = 0.77;
  g.add(body);
  if (rng() < 0.6) { // an arm slipped out from under the sheet
    const arm = limb(mats.skinGrey, 0.5, 0.045);
    arm.position.set(0.25, 0.8, 0.3);
    arm.rotation.x = -0.2;
    g.add(arm);
  }
  g.add(decal(mats.splat[(rng() * 4) | 0], 1.2, 0.3, 0.35, rng() * 6));
  return g;
}

// a body bag: heavy black vinyl taking the shape of whoever's inside (feet up, shoulders, the head), a zip
// down the middle with its pull at the head, carrying handles down both sides, creased and filthy.
// userData.open() unzips it to show what's in there (the fuse puzzle searches them).
const BAG_L = 1.95;
const BAG_PROFILE = [[-1, 0.1, 0.09], [-0.88, 0.15, 0.17], [-0.72, 0.15, 0.1], [-0.42, 0.19, 0.11], [-0.05, 0.25, 0.13], [0.25, 0.24, 0.15], [0.5, 0.28, 0.16], [0.68, 0.17, 0.11], [0.84, 0.15, 0.15], [1, 0.09, 0.09]];
function bagAt(u) { // half-width and height of the bag at u (-1 feet .. 1 head)
  let i = 0;
  while (i < BAG_PROFILE.length - 2 && u > BAG_PROFILE[i + 1][0]) i++;
  const [u0, w0, h0] = BAG_PROFILE[i], [u1, w1, h1] = BAG_PROFILE[i + 1], t = Math.min(1, Math.max(0, (u - u0) / (u1 - u0))), k = t * t * (3 - 2 * t);
  return [w0 + (w1 - w0) * k, h0 + (h1 - h0) * k];
}
function bagMaterial(mats) {
  if (mats.bagV) return mats.bagV;
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#1a1d1f'; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 260; i++) { // creases: the vinyl folds where it has been lifted and dropped
    const x = Math.random() * 512, y = Math.random() * 256, l = 10 + Math.random() * 60, a = (Math.random() - 0.5) * 1.2 + (Math.random() < 0.5 ? 0 : Math.PI / 2);
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '120,128,132' : '0,0,0'},${0.08 + Math.random() * 0.22})`; g.lineWidth = 0.6 + Math.random() * 1.8;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (Math.random() - 0.5) * 6, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${70 + Math.random() * 40 | 0},${60 + Math.random() * 30 | 0},50,${Math.random() * 0.12})`; g.beginPath(); g.arc(Math.random() * 512, Math.random() * 256, 3 + Math.random() * 18, 0, 7); g.fill(); } // dust and grime
  for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(60,4,2,${0.5 + Math.random() * 0.4})`; const x = Math.random() * 512, y = Math.random() * 256; g.beginPath(); g.ellipse(x, y, 8 + Math.random() * 30, 4 + Math.random() * 12, Math.random() * 3, 0, 7); g.fill(); } // old blood
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  mats.bagV = {
    vinyl: new THREE.MeshPhongMaterial({ map: t, bumpMap: t, bumpScale: 2, shininess: 38, specular: 0x30363a }),
    zip: new THREE.MeshPhongMaterial({ color: 0x3a3c3e, shininess: 90, specular: 0x888888 }),
    strap: new THREE.MeshPhongMaterial({ color: 0x101112, shininess: 20 }),
  };
  return mats.bagV;
}
const bagGeo = () => geo('bodybag2', () => {
  const g = new THREE.SphereGeometry(1, 48, 22);
  g.rotateZ(Math.PI / 2); // the poles along x: feet at -x, head at +x
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = Math.max(-1, Math.min(1, p.getX(i))), ring = Math.sqrt(Math.max(0, 1 - u * u));
    const dy = ring > 1e-5 ? p.getY(i) / ring : 0, dz = ring > 1e-5 ? p.getZ(i) / ring : 0;
    const [w, h] = bagAt(u), e = Math.pow(ring, 0.3); // blunt, rounded ends
    let y = dy * h * e;
    if (y < 0) y *= 0.25; // it lies flat on the floor
    p.setXYZ(i, (u * BAG_L) / 2, y + 0.03, dz * w * e);
  }
  g.computeVertexNormals();
  return g;
});
export function bodyBag(mats, rng) {
  const g = new THREE.Group(), m = bagMaterial(mats);
  const bag = mesh(bagGeo(), m.vinyl);
  g.add(bag);
  // the zip, along the top from the shins to the head, and the pull
  const pts = [];
  for (let u = -0.74; u <= 0.86; u += 0.08) { const [, h] = bagAt(u); pts.push(new THREE.Vector3((u * BAG_L) / 2, h * Math.pow(Math.max(0, 1 - u * u), 0.15) + 0.033, 0)); }
  const zip = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.008, 5, false), m.zip, false);
  g.add(zip);
  const pull = mesh(box(0.05, 0.008, 0.022), m.zip, false); pull.position.copy(pts[pts.length - 1]).add(new THREE.Vector3(0.03, 0.004, 0.012)); pull.rotation.y = 0.5; g.add(pull);
  // carrying handles, three down each side
  for (const sd of [-1, 1]) for (const u of [-0.55, 0.05, 0.6]) {
    const [w] = bagAt(u);
    const hd = mesh(geo('baghandle', () => new THREE.TorusGeometry(0.04, 0.009, 4, 10, Math.PI)), m.strap, false);
    hd.position.set((u * BAG_L) / 2, 0.05, sd * (w + 0.005)); hd.rotation.set(sd * Math.PI / 2, 0, 0); g.add(hd);
  }
  if (rng() < 0.5) g.add(decal(mats.pool[(rng() * 3) | 0], 1.4, 0.2, 0, rng() * 6));
  // searched: the zip pulled most of the way open, and a grey face and a hand in the gap
  g.userData.open = () => {
    if (g.userData.opened) return;
    g.userData.opened = true;
    zip.visible = false; pull.visible = false;
    // the gap where the zip was, following the top of the bag, and its two edges peeled back
    const curve = new THREE.CatmullRomCurve3(pts.slice(2).map((v) => v.clone().add(new THREE.Vector3(0, -0.006, 0))));
    // a dark tube sunk into the top so only a strip of it shows: the opening
    const sunk = new THREE.CatmullRomCurve3(curve.points.map((v) => v.clone().add(new THREE.Vector3(0, -0.018, 0))));
    g.add(mesh(new THREE.TubeGeometry(sunk, 40, 0.034, 8, false), new THREE.MeshBasicMaterial({ color: 0x070404 }), false));
    for (const sd of [-1, 1]) {
      const edge = new THREE.CatmullRomCurve3(curve.points.map((v, i) => v.clone().add(new THREE.Vector3(0, 0.006, sd * (0.045 + Math.sin((i / curve.points.length) * Math.PI) * 0.03)))));
      g.add(mesh(new THREE.TubeGeometry(edge, 40, 0.013, 6, false), m.vinyl, false));
    }
    // a grey face showing through at the head end, and a hand
    const hp = pts[pts.length - 2];
    const face = mesh(sph(0.085, 12), mats.skinGrey, false); face.scale.set(1.15, 0.5, 0.8); face.position.set(hp.x, hp.y - 0.025, 0); g.add(face);
    const nose = mesh(sph(0.018, 6), mats.skinGrey, false); nose.position.set(hp.x + 0.01, hp.y + 0.012, 0); g.add(nose);
    const mp = pts[Math.floor(pts.length * 0.45)];
    const hand = mesh(box(0.11, 0.025, 0.06), mats.skinGrey, false); hand.position.set(mp.x, mp.y - 0.004, 0.02); hand.rotation.y = 0.35; g.add(hand);
    g.add(decal(mats.pool[0], 1.6, 0, 0, 1));
  };
  if (THREE.REMASTERED) {
    // the remaster's bag (bagr.js) in place of the lump: the original's parts are made (the game's dice stay the same) and set aside
    const pool = g.children.find((c) => c.material && mats.pool.includes(c.material));
    for (const c of g.children.slice()) if (c !== pool) g.remove(c);
    THREE.ownRandom(() => remasterBag(g, Math.random));
    const open0 = g.userData.open;
    g.userData.open = () => {
      if (g.userData.opened) return;
      const before = new Set(g.children);
      open0();
      for (const c of g.children.slice()) if (!before.has(c) && !(c.material && mats.pool.includes(c.material))) g.remove(c);
      THREE.ownRandom(() => g.userData.openR());
    };
  }
  return g;
}

export function makeLocker(mats, rng) {
  const g = new THREE.Group(); // origin on the floor at the front centre; faces +Z
  const mat = mats.rust[(rng() * 3) | 0];
  const body = mesh(box(0.62, 1.95, 0.5), mat);
  body.position.set(0, 0.975, -0.27);
  g.add(body);
  const hinge = new THREE.Group();
  hinge.position.set(-0.3, 0, -0.01);
  const door = mesh(box(0.6, 1.9, 0.025), mat);
  door.position.set(0.3, 0.975, 0);
  hinge.add(door);
  g.add(hinge);
  g.userData.hinge = hinge;
  g.userData.door = door;
  if (THREE.REMASTERED && mats.lockerPaint) THREE.ownRandom(() => dressLocker(g, body, door, hinge, mats, dressRng())); // its own random stream: the floor's must not move
  return g;
}

// the remaster's dressing draws from its own stream, never the floor's (that decides what goes where)
let dressSeed = 9001;
const dressRng = () => { let s = (dressSeed = (dressSeed * 48271) % 2147483647); return () => ((s = (s * 48271) % 2147483647) / 2147483647); };

// the remaster's locker: the same two boxes the game opens and hides you in, dressed as a real steel locker
function dressLocker(g, body, door, hinge, mats, rng) {
  const paint = mats.lockerPaint[(rng() * 3) | 0];
  body.material = door.material = paint;
  const dark = mats.darkMetal, add = (parent, m, x, y, z) => { m.position.set(x, y, z); parent.add(m); return m; };
  add(g, mesh(box(0.645, 0.035, 0.525), paint), 0, 1.965, -0.27); // the top cap
  add(g, mesh(box(0.63, 0.09, 0.51), dark), 0, 0.045, -0.27); // the plinth
  // the door (its own space: centre of the panel, front face at z = 0.0125)
  for (const [w, h, x, y] of [[0.6, 0.02, 0, 0.94], [0.6, 0.02, 0, -0.94], [0.02, 1.9, -0.29, 0], [0.02, 1.9, 0.29, 0]]) add(door, mesh(box(w, h, 0.008), paint, false), x, y, 0.014); // the folded edge
  for (const vy of [0.68, -0.68]) { // stamped louvres, top and bottom: a dark slot behind six angled slats
    add(door, mesh(box(0.34, 0.2, 0.004), mats.black, false), 0, vy, 0.004);
    for (let i = 0; i < 6; i++) { const s = add(door, mesh(box(0.34, 0.03, 0.006), paint, false), 0, vy - 0.075 + i * 0.03, 0.016); s.rotation.x = -0.65; }
  }
  const plate = add(door, mesh(box(0.05, 0.16, 0.008), dark, false), 0.235, 0, 0.017); // the handle: a plate, a lever, a hasp
  const lever = add(door, mesh(cyl(0.009, 0.009, 0.1, 12), mats.steel, false), 0.215, 0.04, 0.035); lever.rotation.z = Math.PI / 2;
  add(door, mesh(cyl(0.011, 0.011, 0.025, 12), mats.steel, false), 0.255, 0.04, 0.026).rotation.x = Math.PI / 2;
  if (rng() < 0.45) { // a padlock left hanging open
    const lock = add(door, new THREE.Group(), 0.235, -0.06, 0.03);
    add(lock, mesh(box(0.035, 0.04, 0.014), mats.brass, false), 0, -0.02, 0);
    const shackle = add(lock, mesh(new THREE.TorusGeometry(0.011, 0.0025, 8, 16, Math.PI), mats.steel, false), 0.004, 0.0, 0);
    shackle.rotation.z = 0.3;
  }
  add(door, mesh(box(0.08, 0.035, 0.003), mats.brass, false), 0, 0.42, 0.016); // the number plate
  const knuckles = add(hinge, new THREE.Group(), 0, 0, 0);
  for (const hy of [0.35, 1.0, 1.65]) add(knuckles, mesh(cyl(0.012, 0.012, 0.09, 12), dark, false), 0, hy, 0.005); // hinge knuckles
  // weld the dressing: the door's into the door, the knuckles into one, so a locker costs a handful of draws
  bakeLocal(door); bakeLocal(knuckles);
}

export function makeLamp(mats, kind) {
  const g = new THREE.Group();
  if (kind === 'tube') {
    const h = mesh(box(1.3, 0.06, 0.2), mats.darkMetal, false);
    const t = mesh(box(1.2, 0.04, 0.08), mats.lampOn, false);
    t.position.y = -0.04;
    g.add(h, t);
    g.position.y = WALL_H - 0.04;
    g.userData.bulb = t;
  } else {
    const wire = mesh(cyl(0.006, 0.006, 0.6, 4), mats.black, false);
    wire.position.y = -0.3;
    const shade = mesh(geo('shade', () => new THREE.ConeGeometry(0.2, 0.15, 10, 1, true)), mats.darkMetal, false);
    shade.position.y = -0.62;
    shade.material.side = THREE.DoubleSide;
    const b = mesh(sph(0.05, 8), mats.lampOn, false);
    b.position.y = -0.7;
    g.add(wire, shade, b);
    g.position.y = WALL_H;
    g.userData.bulb = b;
  }
  return g;
}

export function ceilingRail(mats, len) {
  const r = mesh(box(len, 0.06, 0.05), mats.darkMetal, false);
  r.position.y = WALL_H - 0.03;
  return r;
}

export function hangingChain(mats, rng) {
  const g = new THREE.Group();
  const len = 0.8 + rng() * 1.2;
  for (let y = 0; y < len; y += 0.07) {
    const link = mesh(geo('link', () => new THREE.TorusGeometry(0.03, 0.008, 4, 8)), mats.chain, false);
    link.position.y = -y;
    link.rotation.y = (y * 14.3) % 2 < 1 ? 0 : Math.PI / 2;
    g.add(link);
  }
  const hook = mesh(geo('hook', () => new THREE.TorusGeometry(0.09, 0.014, 5, 12, Math.PI * 1.4)), mats.darkMetal, false);
  hook.position.y = -len - 0.08;
  hook.rotation.z = Math.PI * 0.8;
  g.add(hook);
  if (rng() < 0.5) { // something is still on the hook
    const m = meatChunk(mats, rng);
    m.position.y = -len - 0.2;
    g.add(m);
  }
  g.position.y = WALL_H;
  g.userData.swing = { a: 0, v: 0, phase: rng() * 6 };
  return g;
}

// ---------- the freight lift ----------
// built in the alcove's local frame: origin at the alcove centre, the room opening at -Z
export function makeLift(mats, slots) {
  const g = new THREE.Group();
  const plate = mesh(box(1.9, 0.06, 1.9), mats.darkMetal);
  plate.position.y = 0.03;
  g.add(plate);
  const bars = new THREE.Group();
  for (let i = 0; i < 13; i++) {
    const b = mesh(cyl(0.012, 0.012, WALL_H - 0.2, 4), mats.chain, false);
    b.position.set(-0.95 + i * 0.158, (WALL_H - 0.2) / 2, 0);
    bars.add(b);
  }
  for (const y of [0.1, 1.2, WALL_H - 0.3]) {
    const r = mesh(box(1.95, 0.04, 0.03), mats.chain, false);
    r.position.y = y;
    bars.add(r);
  }
  bars.position.z = -0.98;
  g.add(bars);
  // caged bulb: the only light you can count on
  const bulb = mesh(sph(0.06, 8), mats.lampOn, false);
  bulb.position.set(0, WALL_H - 0.25, 0.2);
  g.add(bulb);
  const cage = mesh(sph(0.1, 6), new THREE.MeshBasicMaterial({ color: 0x111111, wireframe: true }), false);
  cage.position.copy(bulb.position);
  g.add(cage);
  // tag panel on the right-hand wall
  const panel = new THREE.Group();
  panel.position.set(0.94, 1.3, 0.1);
  panel.rotation.y = -Math.PI / 2;
  const back = mesh(box(0.5, 0.7, 0.06), mats.rust[0]);
  panel.add(back);
  const lights = [];
  for (let i = 0; i < slots; i++) {
    const l = mesh(sph(0.025, 6), new THREE.MeshBasicMaterial({ color: 0x220806 }), false);
    l.position.set(-0.18 + (i % 3) * 0.18, 0.2 - Math.floor(i / 3) * 0.12, 0.04);
    panel.add(l);
    lights.push(l);
  }
  const slot = mesh(box(0.12, 0.02, 0.02), mats.black, false);
  slot.position.set(0, -0.08, 0.035);
  panel.add(slot);
  const lever = new THREE.Group();
  lever.position.set(0, -0.22, 0.04);
  const arm = mesh(cyl(0.015, 0.015, 0.2, 5), mats.darkMetal, false);
  arm.position.y = 0.1;
  const knob = mesh(sph(0.03, 6), new THREE.MeshPhongMaterial({ color: 0x6a0a06 }), false);
  knob.position.y = 0.2;
  lever.add(arm, knob);
  lever.rotation.z = 0.6;
  panel.add(lever);
  g.add(panel);
  g.userData = { bars, lights, lever, panel, bulb };
  return g;
}

// a sheet over a body: the cloth drapes over a human shape (head, shoulders, chest, hips, two legs, arms at the
// sides, the feet tenting it up), lies flat between the peaks, and hangs down over the edges of whatever it's on.
// origin: the middle of the surface, on top of it; the head is toward -Z. len/wid: the size of the sheet;
// hang: how far it may fall below the surface past its edges (0 when it's narrower than what it lies on)
const SHROUD_FORM = (v) => [ // [x, z, rx, rz, height]: z from the crown (0) to the toes (1.8)
  [0, 0.12, 0.095, 0.12, 0.2 + v * 0.01], // head
  [0, 0.27, 0.06, 0.06, 0.12], // neck
  [0, 0.44, 0.23, 0.17, 0.21], // chest and shoulders
  [0, 0.66, 0.19, 0.17, 0.16], // belly
  [0, 0.88, 0.2, 0.14, 0.15], // hips
  [-0.09, 1.12, 0.085, 0.26, 0.12 + v * 0.02], [0.09, 1.12, 0.085, 0.26, 0.12], // thighs (one knee a little up)
  [-0.09 - v * 0.02, 1.48, 0.065, 0.22, 0.095], [0.09 + v * 0.02, 1.48, 0.065, 0.22, 0.095], // shins
  [-0.1 - v * 0.03, 1.74, 0.055, 0.07, 0.23], [0.1 + v * 0.03, 1.74, 0.055, 0.07, 0.23], // feet, toes up
  [-0.25, 0.62, 0.05, 0.3, 0.085], [0.25, 0.62, 0.05, 0.3, 0.085], // arms down the sides
];
// the cloth's shape: the original's (regular ripples), or the remaster's (fine: folds that don't repeat)
function shroudGeo(len, wid, hang, v, fine) {
  const NX = fine ? 64 : 36, NZ = fine ? 140 : 84, W = wid + hang * 2, Lz = len + hang * 2;
  const pg = new THREE.PlaneGeometry(W, Lz, NX, NZ);
  pg.rotateX(-Math.PI / 2);
  const p = pg.attributes.position, H = new Float32Array((NX + 1) * (NZ + 1));
  const form = SHROUD_FORM(v), z0 = -0.9; // the body is 1.8 long, centred
  // each part of the body pushes the cloth up with a soft, rounded falloff past its own edge (cloth doesn't
  // follow a body into every gap), and the parts blend into each other smoothly rather than meeting in creases
  const k = 0.025;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i) - z0;
    let sum = 0;
    for (const [fx, fz, rx, rz, fh] of form) {
      const d = Math.sqrt(((x - fx) / (rx * 1.35)) ** 2 + ((z - fz) / (rz * 1.25)) ** 2);
      const h = d < 1 ? fh * Math.pow(Math.cos((d * Math.PI) / 2), 0.8) : 0;
      sum += Math.exp(h / k);
    }
    let h = Math.max(0, k * Math.log(Math.max(1, sum - (form.length - 1)))); // a smooth max: 0 where nothing's under it, the tallest part where something is
    // the cloth runs straight across from toe to toe, and bridges the gap between the legs
    const fx = 0.1 + v * 0.03, fz = Math.abs(z - 1.74);
    if (fz < 0.09 && Math.abs(x) < fx) h = Math.max(h, 0.21 * Math.cos((fz / 0.09) * Math.PI / 2));
    if (z > 0.95 && z < 1.62 && Math.abs(x) < 0.09) h = Math.max(h, 0.075 - (z - 0.95) * 0.03);
    H[i] = h;
  }
  const at = (ix, iz) => iz * (NX + 1) + ix;
  // soften, then hang the edges over the side and add creases
  let S = H;
  for (let pass = 0; pass < 2; pass++) {
    const T = new Float32Array(S.length);
    for (let iz = 0; iz <= NZ; iz++) for (let ix = 0; ix <= NX; ix++) { let sum = 0, n = 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const jx = ix + dx, jz = iz + dz; if (jx < 0 || jz < 0 || jx > NX || jz > NZ) continue; sum += S[at(jx, jz)]; n++; } T[at(ix, iz)] = sum / n; }
    S = T;
  }
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const out = Math.max(0, Math.abs(x) - wid / 2, Math.abs(z) - len / 2);
    let y = S[i] + 0.006 + (fine ? fbm(x * 6 + v, z * 3.5) * 0.013 * Math.min(1, S[i] * 10) + fbm(x * 17 + 3, z * 12) * 0.003 : Math.sin(x * 40 + z * 9) * 0.004 * Math.min(1, S[i] * 12) + Math.sin(z * 23 + x * 5) * 0.003);
    if (out > 0 && fine) {
      // the remaster: the cloth rolls over the edge of what it lies on and falls straight down from it in soft
      // vertical folds that open out toward the hem (each side and each end separately; a corner does both)
      y = Math.min(y, 0.012);
      let nx = x, nz = z;
      const r = 0.03, q = (r * Math.PI) / 2;
      const over = (o, along, seed) => { // o: how far past the edge; returns [outward, down]
        if (o <= 0) return [0, 0];
        if (o < q) { const a = o / r; return [r * Math.sin(a) - o, r * (1 - Math.cos(a))]; }
        const d = o - q, fold = fbm(along * 4.2 + seed, 1.7 + v) * 0.05 + fbm(along * 11 + seed, 4.1) * 0.014;
        return [r - o + fold * Math.min(1, d * 6) * (0.5 + d * 3) + d * d * 0.35, r + d - Math.max(0, fold) * d * 0.25];
      };
      const ox = Math.abs(x) - wid / 2, oz = Math.abs(z) - len / 2;
      const [hx, dyx] = over(ox, z, 0), [hz, dyz] = over(oz, x, 9);
      nx = x + Math.sign(x) * hx; nz = z + Math.sign(z) * hz;
      y -= Math.max(dyx, dyz);
      p.setX(i, nx); p.setZ(i, nz);
    } else if (out > 0) y = Math.max(-hang, Math.min(y, 0.01) - out * 1.6) + Math.sin(z * 30) * 0.01 * Math.min(1, out * 8); // over the edge, in folds
    p.setY(i, y);
  }
  pg.computeVertexNormals();
  return pg;
}
// fold noise: smooth value noise, three octaves, roughly -1..1
function vn2(x, z) {
  const h = (i, j) => { let t = Math.imul(i, 374761393) + Math.imul(j, 668265263); t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
  return (a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz) * 2 - 1;
}
const fbm = (x, z) => vn2(x, z) * 0.6 + vn2(x * 2.1 + 5.2, z * 2.1 + 1.3) * 0.3 + vn2(x * 4.3 + 9.1, z * 4.3 + 7.7) * 0.1;
// the remaster's sheet: a woven cotton you can see the threads of, gone grey with washing, and what came through it
function sheetMatR(mats) {
  if (mats.sheetR) return mats.sheetR;
  const W = 1024, H = 2048, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  let s = 4242; const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  g.fillStyle = '#a39c8c'; g.fillRect(0, 0, W, H);
  // the cotton: no grid, just fibre: thousands of short faint strands, and the grey of a sheet washed a hundred times
  for (let i = 0; i < 26000; i++) {
    const x = r() * W, y = r() * H, l = 2 + r() * 7, a = r() < 0.5 ? 0 : Math.PI / 2;
    g.strokeStyle = r() < 0.5 ? `rgba(70,60,48,${0.05 + r() * 0.07})` : `rgba(235,228,214,${0.05 + r() * 0.08})`;
    g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const soft = (x, y, rx, ry, col, blur) => { g.save(); g.filter = `blur(${blur}px)`; g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, r() * 3, 0, Math.PI * 2); g.fill(); g.restore(); };
  for (let i = 0; i < 40; i++) soft(r() * W, r() * H, 40 + r() * 160, 30 + r() * 120, `rgba(120,104,80,${0.04 + r() * 0.05})`, 30); // washed-out old stains
  // what's soaked through from underneath: a wide diluted halo, wicked out unevenly along the threads, then the
  // darker blood nearer the wound, then the darkest where it pooled. All soft: blood in cloth has no outline
  const soak = (cx, cy, R) => {
    for (let k = 0; k < 26; k++) { const a = r() * Math.PI * 2, d = r() * R * 0.75; soft(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 1.2, R * (0.25 + r() * 0.4), R * (0.2 + r() * 0.35), `rgba(150,52,36,${0.05 + r() * 0.06})`, R * 0.12); }
    for (let k = 0; k < 18; k++) { const a = r() * Math.PI * 2, d = r() * R * 0.45; soft(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * (0.12 + r() * 0.25), R * (0.1 + r() * 0.2), `rgba(110,18,12,${0.1 + r() * 0.12})`, R * 0.06); }
    for (let k = 0; k < 7; k++) { const a = r() * Math.PI * 2, d = r() * R * 0.2; soft(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * (0.06 + r() * 0.12), R * (0.05 + r() * 0.1), `rgba(62,6,4,${0.22 + r() * 0.2})`, R * 0.03); }
  };
  soak(W * (0.5 + (r() - 0.5) * 0.1), H * 0.3, 210); // the chest
  soak(W * (0.5 + (r() - 0.5) * 0.12), H * 0.43, 150); // the belly
  soak(W * 0.5, H * 0.12, 90); // the head
  if (r() < 0.7) soak(W * (0.3 + r() * 0.4), H * (0.55 + r() * 0.2), 70);
  // seeping toward the edges where it hangs, tapering
  for (let i = 0; i < 5; i++) {
    const left = r() < 0.5, y0 = H * (0.25 + r() * 0.3); let x = W * (left ? 0.36 : 0.64), y = y0;
    for (let k = 0; k < 40; k++) { x += (left ? -1 : 1) * (6 + r() * 4); y += (r() - 0.5) * 5; soft(x, y, 9 - k * 0.18, 5 - k * 0.1, `rgba(105,20,12,${0.12 - k * 0.0025})`, 3); }
  }
  const pbr = derivePBR(c, { normal: 1.2, rough: 0.95, roughClean: 0.88, wet: 0.25, cavity: 0.15, micro: 0.04, seed: 77 });
  const t = (cv, srgb) => { const x = new THREE.CanvasTexture(cv); if (srgb) x.colorSpace = THREE.SRGBColorSpace; x.anisotropy = 8; return x; };
  mats.sheetR = new THREE.MeshStandardMaterial({ map: t(c, true), normalMap: t(pbr.normal), normalScale: new THREE.Vector2(0.5, 0.5), roughnessMap: t(pbr.orm), roughness: 1, side: THREE.DoubleSide });
  return mats.sheetR;
}
export function shroud(mats, rng, len = 1.95, wid = 0.62, hang = 0) {
  const v = (rng() * 3) | 0;
  const g = geo(`shroud${len}_${wid}_${hang}_${v}`, () => shroudGeo(len, wid, hang, v, false));
  const m = new THREE.Mesh(g, mats.sheetDS || (mats.sheetDS = Object.assign(mats.sheet.clone(), { side: THREE.DoubleSide })));
  m.castShadow = true; m.receiveShadow = true;
  if (THREE.REMASTERED) THREE.ownRandom(() => { m.geometry = geo(`shroudR${len}_${wid}_${hang}_${v}`, () => shroudGeo(len, wid, hang, v, true)); m.material = sheetMatR(mats); });
  return m;
}

// ---------- the morgue ----------
// a body on a drawer tray, feet toward you, the way they always come out
export function trayBody(mats, rng) {
  const g = new THREE.Group();
  if (rng() < 0.45) { // under a sheet
    const t = shroud(mats, rng, 1.95, 0.66, 0);
    t.position.set(0, 0, -0.5);
    g.add(t);
    if (rng() < 0.4) { const foot = mesh(box(0.08, 0.15, 0.1), mats.skinGrey, false); foot.position.set(0.12, 0.08, 0.5); g.add(foot); } // a foot out from under it
  } else {
    const b = makeBody(mats, rng, { naked: true, bald: rng() < 0.5 });
    b.legs.forEach((l) => { l.userData.boot.visible = false; });
    const lay = new THREE.Group();
    lay.rotation.x = -Math.PI / 2;
    lay.position.set(0, 0.12, -0.55);
    lay.add(b.root);
    b.arms.forEach((a, i) => (a.rotation.z = (i ? 1 : -1) * 0.12));
    b.jaw.rotation.x = 0.3;
    const cut = mesh(box(0.04, 0.42, 0.01), mats.meat, false); // the Y incision
    cut.position.set(0, 0.28, 0.12);
    b.torso.add(cut);
    g.add(lay);
  }
  const toe = mesh(box(0.05, 0.07, 0.003), mats.sheet, false);
  toe.position.set(0.09, 0.12, 0.42);
  g.add(toe);
  return g;
}

// a 3x3 bank of body drawers on a wall; origin on the wall at the bottom middle, facing +Z.
// labels: optional canvas texture for the plates. returns { group, drawers: [{ grp, local: Vector3, open }] }
export function drawerBank(mats, rng, labelTex, bodies = 0.6) {
  const group = new THREE.Group();
  const frame = mesh(box(2, 2.3, 0.26), mats.steel);
  frame.position.set(0, 1.15, 0.13);
  group.add(frame);
  if (labelTex) {
    const plate = new THREE.Mesh(geo('dbplate', () => new THREE.PlaneGeometry(2, 2.3)), new THREE.MeshBasicMaterial({ map: labelTex, transparent: true }));
    plate.position.set(0, 1.15, 0.262);
    group.add(plate);
  }
  const drawers = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const grp = new THREE.Group();
    const x = (c - 1) * 0.63, y = 0.42 + r * 0.66;
    grp.position.set(x, y, 0);
    const front = mesh(box(0.56, 0.5, 0.05), mats.steel);
    front.position.z = 0.27;
    const handle = mesh(box(0.22, 0.03, 0.04), mats.darkMetal, false);
    handle.position.set(0, -0.12, 0.31);
    const tray = mesh(box(0.5, 0.03, 1.8), mats.steel, false);
    tray.position.set(0, -0.2, -0.62);
    grp.add(front, handle, tray);
    if (rng() < bodies) { const b = trayBody(mats, rng); grp.add(b); layOn(b, -0.25, 0.25, -1.5, 0.22, -0.185, 0.02); }
    if (THREE.REMASTERED) THREE.ownRandom(() => bakeLocal(grp)); // the game only ever slides the drawer: weld what's in it
    group.add(grp);
    drawers.push({ grp, local: new THREE.Vector3(x, y, 0.3), open: 0, target: 0 });
  }
  return { group, drawers };
}

// the slab in the middle of the room
export function autopsyTable(mats, rng) {
  const g = new THREE.Group();
  const top = mesh(box(2, 0.06, 0.8), mats.steel);
  top.position.y = 0.92;
  const lip = mesh(box(2, 0.05, 0.05), mats.steel, false);
  lip.position.set(0, 0.97, 0.38);
  const lip2 = lip.clone();
  lip2.position.z = -0.38;
  const ped = mesh(cyl(0.12, 0.2, 0.9, 8), mats.steel);
  ped.position.y = 0.45;
  g.add(top, lip, lip2, ped);
  const body = trayBody(mats, rng);
  body.rotation.y = Math.PI / 2;
  g.add(body);
  layOn(body, -1, 1, -0.36, 0.36, 0.95);
  if (rng() < 0.6) { const guts = entrails(mats, rng, new THREE.Vector3(0.2, 1.05, 0.1), 0.5, 7); g.add(guts); }
  g.add(decal(mats.pool[(rng() * 3) | 0], 1.4, 0, 0, rng() * 6));
  return g;
}

// ---------- crouchways ----------
// a rusted steel frame round the mouth of a crawl tunnel, with strips of plastic curtain hanging in it.
// origin on the floor at the mouth, facing into the tunnel (+Z)
export function crawlMouth(mats, rng) {
  const g = new THREE.Group();
  const H = 1.2, Wd = 2;
  if (!mats.hazard) {
    // worn yellow-and-black stripes, the way anything low is painted in a plant
    const c = document.createElement('canvas');
    c.width = 128; c.height = 16;
    const g2 = c.getContext('2d', { willReadFrequently: true });
    g2.fillStyle = '#16120c'; g2.fillRect(0, 0, 128, 16);
    g2.fillStyle = '#9a7a1c';
    for (let x = -16; x < 140; x += 16) { g2.beginPath(); g2.moveTo(x, 16); g2.lineTo(x + 8, 16); g2.lineTo(x + 16, 0); g2.lineTo(x + 8, 0); g2.fill(); }
    for (let i = 0; i < 260; i++) { g2.fillStyle = `rgba(40,25,12,${Math.random() * 0.7})`; g2.fillRect(Math.random() * 128, Math.random() * 16, 1 + Math.random() * 4, 1 + Math.random() * 2); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    mats.hazard = new THREE.MeshPhongMaterial({ map: t, shininess: 10 });
  }
  const top = mesh(box(Wd, 0.12, 0.14), mats.hazard);
  top.position.y = H - 0.06;
  g.add(top);
  for (const sx of [-1, 1]) { const post = mesh(box(0.12, H, 0.14), mats.rust[2]); post.position.set(sx * (Wd / 2 - 0.06), H / 2, 0); g.add(post); }
  mats.strip ||= new THREE.MeshLambertMaterial({ color: 0x6a6656, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  for (let i = 0; i < 9; i++) {
    if (rng() < 0.3) continue; // torn away
    const len = 0.5 + rng() * 0.55;
    const st = mesh(geo('strip', () => new THREE.PlaneGeometry(0.2, 1).translate(0, -0.5, 0)), mats.strip, false);
    st.scale.y = len;
    st.position.set(-0.85 + i * 0.21, H - 0.12, 0.02);
    st.rotation.x = (rng() - 0.5) * 0.25;
    g.add(st);
  }
  if (rng() < 0.6) g.add(decal(mats.splat[(rng() * 4) | 0], 0.9, (rng() - 0.5) * 1.2, -0.4, rng() * 6, 0.014));
  return g;
}
export function crawlPipe(mats, rng) {
  const g = new THREE.Group();
  const p = mesh(cyl(0.06, 0.06, 2, 8), mats.rust[(rng() * 3) | 0], false);
  p.rotation.x = Math.PI / 2;
  p.position.set((rng() - 0.5) * 1.3, 1.2 - 0.09, 0);
  g.add(p);
  if (rng() < 0.4) { const d = mesh(cyl(0.004, 0.004, 0.3 + rng() * 0.4, 4), mats.blood, false); d.position.set(p.position.x, 0.9, (rng() - 0.5) * 1.5); g.add(d); }
  return g;
}
