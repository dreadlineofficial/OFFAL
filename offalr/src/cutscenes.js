// Death cutscenes. After the grab, one of these plays at random (never the same one twice running):
//   rope    - (third person) tied to a post and set alight with a flare; cut loose, you run burning, and he shoots you
//   exit    - an EXIT door at last; he's just standing behind you; the door opens onto a sheer drop; he pushes
//   grinder - (third person) dragged by the ankle and fed into the meat grinder
//   fan     - (third person) held up by the throat into the blades of a ceiling fan
//   eaten   - (third person) he takes you apart on the floor and eats you, and then he looks at you
//   rack    - (third person) chained to a winch table; he cranks until your arms and legs come away
//   torn    - (third person) held across his body and pulled apart at the waist
//   minced  - (third person) pushed head first through the big mincer; it all comes out of the plate on the far side
//   packed  - (third person) opened on a table; your organs taken out one by one and packed on trays
//   beaten  - (third person) held up and beaten, then dropped and pounded until there's nothing left
//   brains  - (third person) the top of your skull taken off with the cleaver, and your brain drawn out by hand
//   smoke   - (third person) roped to a table, hit between the legs and set alight; he has a cigarette in the corner
//   forklift- (third person, B10 only) he runs you down with a forklift, backs over you, and parks on you
// Each one builds its own little stage, runs off a timeline, and throws gore around with a small physics pass.
import * as THREE from 'three';
import { createForemanMesh, poseForeman } from './monster.js';
import { makeBody, openChest, mesh, decal, severedArm, severedHead, meatChunk, makeLamp, stump, makeLift, makeCarcass, bucket, butcherTable } from './props.js';
import { pipeRun, conveyor, packTable, forklift, crateStack } from './props2.js';
import { heart, liver, lung, stomach, kidney, guts, eyeball, organSet, splitBody, BodyFire, shotgun, packTray, car } from './cutkit.js';
import { canvas, themeMaterials } from './textures.js';
import { makeRng } from './rng.js';

export const CUTSCENES = ['rope', 'exit', 'grinder', 'fan', 'eaten', 'rack', 'torn', 'minced', 'packed', 'beaten', 'brains', 'smoke', 'forklift'];
// films that only belong on one floor: the forklift is on the factory floor (B10)
export const FLOOR_FILM = { forklift: 'hall' };

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- the worker: you, from the outside ----------
function makeWorker(mats) {
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const b = makeBody(mats, rng, { cloth: mats.coverall, skin: mats.skin, dead: false });
  b.jaw.rotation.x = 0.35; // screaming, or trying to
  return b;
}

// point an object's local +Y along `y` with local +Z as close to `z` as possible
function orient(obj, y, z) {
  const Y = y.clone().normalize(), X = new THREE.Vector3().crossVectors(Y, z).normalize(), Z = new THREE.Vector3().crossVectors(X, Y);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}

// hanging by one ankle from `hand`: the hips a leg's length below it, head down. While the hand is too low for
// that, the body lies along the floor away from `away` instead, shoulders and head on the concrete, never through it
const LEG = 0.92, TRUNK = 0.85;
function hangFromHand(you, hand, away) {
  const hipY = Math.max(0.16, hand.y - LEG);
  const flat = Math.sqrt(Math.max(0, LEG * LEG - (hand.y - hipY) ** 2)); // how far the leg lies out sideways
  const a = away.clone().setY(0).normalize();
  you.root.position.set(hand.x + a.x * flat, hipY, hand.z + a.z * flat);
  const drop = Math.min(1, (hipY - 0.12) / TRUNK); // how far the head can hang below the hips
  const head = new THREE.Vector3(a.x * Math.sqrt(1 - drop * drop), -drop, a.z * Math.sqrt(1 - drop * drop));
  orient(you.root, head, drop > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0));
}

// ---------- gore ----------
class Gore {
  constructor(scene, mats) {
    this.scene = scene;
    this.mats = mats;
    this.chunks = [];
    this.decals = 0;
    const N = THREE.REMASTERED ? 2400 : 500;
    this.dp = new Float32Array(N * 3).fill(-999);
    this.dv = new Float32Array(N * 3);
    this.dl = new Float32Array(N);
    this.di = 0;
    this.points = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(this.dp, 3)),
      new THREE.PointsMaterial({ color: 0x8a0000, size: 0.035, sizeAttenuation: true }));
    if (THREE.REMASTERED) { // round drops, not squares
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.6, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
      Object.assign(this.points.material, { map: new THREE.CanvasTexture(c), alphaTest: 0.4, size: 0.026, color: new THREE.Color(0x6a0000) });
    }
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  // a spray of blood droplets
  spray(at, dir, n, speed, spread = 0.6) {
    if (THREE.gore.less) n = Math.ceil(n * 0.25); // (Less gore: a little blood)
    for (let k = 0; k < n; k++) {
      const i = this.di++ % this.dl.length;
      this.dp.set([at.x, at.y, at.z], i * 3);
      const v = dir.clone().normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8)).add(V((Math.random() - 0.5) * spread * speed, (Math.random() - 0.5) * spread * speed, (Math.random() - 0.5) * spread * speed));
      this.dv.set([v.x, v.y, v.z], i * 3);
      this.dl[i] = 1.5 + Math.random();
    }
  }
  // meat, bone and bits of you
  burst(at, n, speed, up = 0.6, extra = []) {
    if (THREE.gore.less) { n = 0; extra = []; } // (Less gore: nothing thrown about)
    const kinds = [() => meatChunk(this.mats, Math.random), () => meatChunk(this.mats, Math.random), () => mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12 + Math.random() * 0.2, 5), this.mats.bone, false)];
    const make = (o) => {
      o.position.copy(at);
      this.scene.add(o);
      const a = Math.random() * Math.PI * 2;
      this.chunks.push({ o, v: V(Math.cos(a) * speed * Math.random(), up * speed * (0.5 + Math.random()), Math.sin(a) * speed * Math.random()), w: V(Math.random() * 12, Math.random() * 12, Math.random() * 12), rest: false });
    };
    for (let k = 0; k < n; k++) make(kinds[(Math.random() * kinds.length) | 0]());
    extra.forEach(make);
    this.spray(at, V(0, 1, 0), n * 6, speed * 1.2, 1.2);
  }
  // things thrown one way (out of a machine, off a blow), tumbling
  fling(objs, at, dir, speed) {
    if (THREE.gore.less) return;
    for (const o of objs) {
      o.position.copy(at); this.scene.add(o);
      const v = dir.clone().normalize().multiplyScalar(speed * (0.6 + Math.random() * 0.6)).add(V((Math.random() - 0.5) * speed * 0.3, Math.random() * speed * 0.25, (Math.random() - 0.5) * speed * 0.3));
      this.chunks.push({ o, v, w: V(Math.random() * 12, Math.random() * 12, Math.random() * 12), rest: false });
    }
  }
  update(dt) {
    for (const c of this.chunks) {
      if (c.rest) continue;
      c.v.y -= 9.8 * dt;
      c.o.position.addScaledVector(c.v, dt);
      c.o.rotation.x += c.w.x * dt; c.o.rotation.y += c.w.y * dt; c.o.rotation.z += c.w.z * dt;
      if (c.o.position.y < 0.05 && c.v.y < 0) {
        c.o.position.y = 0.05;
        if (this.decals < 30 && Math.abs(c.v.y) > 2) { this.decals++; this.scene.add(decal(this.mats.splat[(Math.random() * 4) | 0], 0.5 + Math.random() * 0.8, c.o.position.x, c.o.position.z, Math.random() * 6, 0.01 + this.decals * 0.0004)); }
        c.v.y *= -0.25; c.v.x *= 0.5; c.v.z *= 0.5; c.w.multiplyScalar(0.5);
        if (Math.abs(c.v.y) < 0.4) c.rest = true;
      }
    }
    const p = this.dp, v = this.dv;
    for (let i = 0; i < this.dl.length; i++) {
      if (this.dl[i] <= 0) continue;
      this.dl[i] -= dt;
      v[i * 3 + 1] -= 9.8 * dt;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < 0.02) { p[i * 3 + 1] = 0.02; v[i * 3] = v[i * 3 + 1] = v[i * 3 + 2] = 0; }
      if (this.dl[i] <= 0) p[i * 3 + 1] = -999;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

// ---------- sets ----------
function room(scene, mats, w, d, wallIdx = 4) {
  const T = 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(T, T), mats.floors[1]);
  for (let x = -w / 2 + 1; x < w / 2; x += T) for (let z = -d / 2 + 1; z < d / 2; z += T) {
    const f = floor.clone();
    f.rotation.x = -Math.PI / 2;
    f.position.set(x, 0, z);
    f.receiveShadow = true;
    scene.add(f);
  }
  const wall = new THREE.PlaneGeometry(T, 3);
  const strip = (x0, z0, dx, dz, n, rotY) => {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(wall, mats.walls[(wallIdx + i) % mats.walls.length]);
      m.position.set(x0 + dx * (i + 0.5) * T, 1.5, z0 + dz * (i + 0.5) * T);
      m.rotation.y = rotY;
      m.receiveShadow = true;
      scene.add(m);
    }
  };
  strip(-w / 2, -d / 2, 1, 0, w / T, 0);
  strip(w / 2, d / 2, -1, 0, w / T, Math.PI);
  strip(-w / 2, d / 2, 0, -1, d / T, Math.PI / 2);
  strip(w / 2, -d / 2, 0, 1, d / T, -Math.PI / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mats.ceil);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 3;
  scene.add(ceil);
}

// ---------- fire ----------
// Flames are camera-facing quads running a noise shader: tongues that rise, split and lick, white-yellow at
// the root, through orange to a dull red at the tips. Under them a bed of coals with glowing cracks that
// breathe, charred logs, sparks spiralling up and dark smoke rolling off the top.
const flameFrag = `
uniform float time, seed, heat, fade;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return v; }
void main(){
  float y = vUv.y, x = (vUv.x - 0.5) * 2.0;
  float t = time * 2.2 + seed * 7.0;
  // turbulence: sideways licks that grow toward the top
  float n = fbm(vec2(x * 1.6 + seed, y * 2.6 - t));
  float m = fbm(vec2(x * 3.5 - seed, y * 5.0 - t * 1.6));
  float xs = x + (n - 0.5) * 1.1 * y + (m - 0.5) * 0.25;
  float width = mix(0.7, 0.1, pow(y, 0.75));
  float body = 1.0 - smoothstep(width * 0.55, width, abs(xs));
  // the top breaks up into separate tongues
  float top = smoothstep(0.95, 0.35, y + (n - 0.45) * 0.75 + (m - 0.5) * 0.3);
  float rx = abs(xs) / max(width, 0.05);
  float base = smoothstep(0.0, 0.16, y - rx * rx * 0.14 + (n - 0.5) * 0.05); // round at the root, not cut flat
  float f = body * top * base * smoothstep(1.0, 0.7, y) * (1.0 - smoothstep(0.7, 0.98, abs(x)));
  float hot = clamp(f * (1.05 - y) * heat * 0.9 + (m - 0.5) * 0.2, 0.0, 1.0);
  vec3 c = mix(vec3(0.45, 0.03, 0.0), vec3(1.0, 0.32, 0.02), smoothstep(0.08, 0.45, hot));
  c = mix(c, vec3(1.0, 0.72, 0.25), smoothstep(0.45, 0.75, hot));
  c = mix(c, vec3(1.0, 0.95, 0.8), smoothstep(0.78, 1.0, hot));
  float a = f * smoothstep(0.02, 0.25, hot);
  a *= fade;
  gl_FragColor = vec4(c * a * 0.75, a);
}`;
const crownFrag = `
uniform float time, seed;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return v; }
void main(){
  vec2 c = (vUv - 0.5) * 2.0;
  float r = length(c);
  // domain-warped noise drifting outward from the middle: no seams, no rays
  vec2 q = vec2(fbm(c * 2.0 + vec2(seed, time * 0.5)), fbm(c * 2.0 - vec2(time * 0.4, seed)));
  float n = fbm(c * 3.0 + q * 1.8 - normalize(c + 0.0001) * time * 0.6);
  float m = fbm(c * 5.0 + q * 2.5 + vec2(seed, -time * 1.6));
  float f = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.7) * smoothstep(0.35, 0.75, n * 0.7 + m * 0.5);
  float hot = clamp(f * (1.2 - r * 0.6), 0.0, 1.0);
  vec3 col = mix(vec3(0.45, 0.04, 0.0), vec3(1.0, 0.35, 0.03), smoothstep(0.1, 0.5, hot));
  col = mix(col, vec3(1.0, 0.75, 0.3), smoothstep(0.55, 0.9, hot));
  gl_FragColor = vec4(col * f * 0.7, f * 0.85);
}`;
function coalsTex() {
  const S = 256, { c, g } = canvas(S, S);
  g.fillStyle = '#050201';
  g.fillRect(0, 0, S, S);
  // glow under everything, showing through the gaps
  const gr = g.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,150,50,1)');
  gr.addColorStop(0.5, 'rgba(200,55,8,0.95)');
  gr.addColorStop(1, 'rgba(50,6,0,0.7)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.fill();
  // packed chunks of charcoal: small, angular, dark, with the glow coming through the seams between them
  for (let i = 0; i < 1700; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * S * 0.49, x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d, r = 3 + Math.random() * 6;
    const hotLump = Math.random() < 0.1, ash = Math.random() < 0.3, v = 10 + Math.random() * 25 | 0;
    g.fillStyle = hotLump ? `rgba(${170 + Math.random() * 80 | 0},${40 + Math.random() * 60 | 0},8,0.9)` : ash ? `rgba(${v + 30},${v + 22},${v + 18},0.9)` : `rgba(${v},${v * 0.45 | 0},${v * 0.3 | 0},0.93)`;
    g.beginPath();
    const k = 5 + (Math.random() * 3 | 0), r0 = Math.random() * 6;
    for (let j = 0; j < k; j++) { const aa = r0 + (j / k) * Math.PI * 2, rr = r * (0.6 + Math.random() * 0.5); g[j ? 'lineTo' : 'moveTo'](x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); }
    g.closePath();
    g.fill();
  }
  // white ash
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(150,140,130,${Math.random() * 0.25})`; g.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// charcoal: black, split into scales, with the burning showing through the splits
function logPaint(glow) {
  const { c, g } = canvas(64, 128);
  g.fillStyle = glow ? '#000' : '#141010';
  g.fillRect(0, 0, 64, 128);
  for (let y = 0; y < 128; y += 6 + Math.random() * 6) for (let x = 0; x < 64; x += 8 + Math.random() * 10) {
    if (glow) { if (Math.random() < 0.45) { g.fillStyle = `rgb(${160 + Math.random() * 90 | 0},${30 + Math.random() * 50 | 0},4)`; g.fillRect(x, y, 6 + Math.random() * 6, 1.5); } }
    else { const v = 12 + Math.random() * 30 | 0; g.fillStyle = `rgb(${v},${v * 0.8 | 0},${v * 0.7 | 0})`; g.fillRect(x + 1, y + 1, 7 + Math.random() * 6, 4 + Math.random() * 4); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const logTex = () => logPaint(false), logGlowTex = () => logPaint(true);
function softTex() {
  const { c, g } = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
export class Fire {
  constructor(scene, mats, radius = 1.5) {
    this.scene = scene;
    this.r = radius;
    this.t = 0;
    // the coal bed
    this.coalMat = new THREE.MeshBasicMaterial({ map: coalsTex(), color: 0xffffff });
    const coals = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.03, 28), this.coalMat);
    coals.rotation.x = -Math.PI / 2;
    coals.position.y = 0.1;
    scene.add(coals);
    // charred logs across it, glowing where they're burning through
    const logMat = new THREE.MeshLambertMaterial({ color: 0x777777, map: logTex(), emissive: 0xffffff, emissiveMap: logGlowTex() });
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05 + Math.random() * 0.03, 0.065, radius * (0.9 + Math.random() * 0.7), 7), logMat);
      log.rotation.order = 'YXZ';
      log.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.3, (i / 4) * Math.PI + Math.random() * 0.5, 0); // crossed every which way
      log.position.set((Math.random() - 0.5) * radius * 0.6, 0.16 + Math.random() * 0.06, (Math.random() - 0.5) * radius * 0.6);
      scene.add(log);
    }
    this.logMat = logMat;
    // the flames
    this.flames = [];
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    for (let i = 0; i < 40; i++) {
      const u = { time: { value: 0 }, seed: { value: Math.random() * 10 }, heat: { value: 0.9 + Math.random() * 0.4 }, fade: { value: 1 } };
      const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: flameFrag,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const q = new THREE.Mesh(geo, mat);
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius * 0.85;
      const big = 1 - d / radius;
      q.position.set(Math.cos(a) * d, 0.11, Math.sin(a) * d);
      q.userData = { u, h: 0.45 + big * 0.75 + Math.random() * 0.35, w: 0.25 + big * 0.35 + Math.random() * 0.2, ph: Math.random() * 6 };
      q.renderOrder = 2;
      scene.add(q);
      this.flames.push(q);
    }
    // looking down into it: flat sheets of churning flame just over the coals
    this.crowns = [0, 1, 2, 3].map((i) => {
      const u = { time: { value: 0 }, seed: { value: i * 3.7 } };
      const mat = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: crownFrag });
      const c = new THREE.Mesh(new THREE.CircleGeometry(radius * (0.98 - i * 0.16), 32), mat);
      c.rotation.x = -Math.PI / 2;
      c.rotation.z = i * 1.3;
      c.position.y = 0.14 + i * 0.16;
      c.renderOrder = 1;
      scene.add(c);
      return u;
    });
    // sparks
    const N = 160;
    this.sp = new Float32Array(N * 3);
    this.sv = new Float32Array(N * 3);
    this.sl = new Float32Array(N);
    for (let i = 0; i < N; i++) this.spawnSpark(i, Math.random() * 2);
    this.sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(this.sp, 3)),
      new THREE.PointsMaterial({ color: 0xffb050, size: 0.012, map: softTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.sparks.frustumCulled = false;
    scene.add(this.sparks);
    // smoke
    const st = softTex();
    this.smoke = [];
    for (let i = 0; i < 18; i++) {
      const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, color: 0x0c0806, transparent: true, depthWrite: false, opacity: 0 }));
      sm.userData = { life: Math.random(), x: 0, z: 0, rot: Math.random() * 6 };
      scene.add(sm);
      this.smoke.push(sm);
    }
    // the light: several sources flickering on smooth noise, not a strobe
    this.lights = [0, 1, 2].map((i) => {
      const l = new THREE.PointLight(i ? 0xff5a18 : 0xff8a30, 14, 16, 1.4);
      l.position.set(Math.cos(i * 2.1) * 0.5, 0.7 + i * 0.45, Math.sin(i * 2.1) * 0.5 - (i === 2 ? 0.8 : 0)); // the last one reaches up the far side, onto him
      scene.add(l);
      return l;
    });
  }
  spawnSpark(i, life = 0) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * this.r * 0.8;
    this.sp.set([Math.cos(a) * d, 0.2 + Math.random() * 0.4, Math.sin(a) * d], i * 3);
    this.sv.set([(Math.random() - 0.5) * 0.4, 1.2 + Math.random() * 2.2, (Math.random() - 0.5) * 0.4], i * 3);
    this.sl[i] = life || 0.6 + Math.random() * 1.8;
  }
  update(dt, cam) {
    const t = (this.t += dt);
    const flick = (k) => 0.75 + 0.12 * Math.sin(t * 7.3 + k) + 0.08 * Math.sin(t * 13.1 + k * 2) + 0.05 * Math.sin(t * 23.7 + k * 3);
    this.lights.forEach((l, i) => (l.intensity = (i ? 26 : 60) * flick(i * 2)));
    this.coalMat.color.setScalar(0.85 + 0.15 * flick(5));
    this.logMat.emissive.setScalar(0.7 + 0.3 * flick(7));
    for (const u of this.crowns) u.time.value = t;
    for (const q of this.flames) {
      const d = q.userData;
      d.u.time.value = t;
      // stand up and turn to face the camera: from overhead they foreshorten, as real flames do
      _z.subVectors(cam.position, q.position);
      // seen from straight above a tongue is edge-on: let it go and the sheets below carry the view
      d.u.fade.value = 1 - Math.min(1, Math.max(0, (Math.abs(_z.y) / _z.length() - 0.55) / 0.3));
      _z.setY(0);
      if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1);
      _z.normalize();
      _y.set(0, 1, 0);
      _x.crossVectors(_y, _z);
      q.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
      const s = 0.85 + 0.25 * Math.sin(t * 3.1 + d.ph) + 0.1 * Math.sin(t * 8.3 + d.ph * 2);
      q.scale.set(d.w * (0.9 + 0.1 * Math.sin(t * 5 + d.ph)), d.h * s, 1);
    }
    const p = this.sp, v = this.sv;
    for (let i = 0; i < this.sl.length; i++) {
      this.sl[i] -= dt;
      if (this.sl[i] <= 0) { this.spawnSpark(i); continue; }
      // rise, swirl, slow
      v[i * 3] += Math.sin(t * 3 + i) * dt * 1.5;
      v[i * 3 + 2] += Math.cos(t * 2.6 + i * 1.3) * dt * 1.5;
      v[i * 3 + 1] *= 1 - dt * 0.4;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    for (const sm of this.smoke) {
      const d = sm.userData;
      d.life += dt * 0.22;
      if (d.life > 1) { d.life = 0; d.x = (Math.random() - 0.5) * this.r; d.z = (Math.random() - 0.5) * this.r; }
      const k = d.life;
      sm.position.set(d.x + Math.sin(t * 0.7 + d.rot) * 0.3 * k, 1.6 + k * 2.2, d.z);
      sm.scale.setScalar(0.8 + k * 2.4);
      sm.material.opacity = Math.sin(k * Math.PI) * 0.55;
      sm.material.rotation = d.rot + t * 0.2;
    }
  }
}

function signTex(text, color) {
  const { c, g } = canvas(256, 96);
  g.fillStyle = '#0a0a0a';
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = color;
  g.font = 'bold 70px "Courier New", monospace';
  g.textAlign = 'center';
  g.fillText(text, 128, 72);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- the way out, for the ending ----------
// the dispatch bay: W wide, from the lift's wall at Z0 to the shutter's at Z1, H high; the door DW x DH
const YARD = { W: 14, Z0: -1, Z1: -26, H: 5.5, DW: 5.2, DH: 4.2 };
const HOLE = { x: 0.35, y: 1.3 }; // where the hook comes through
const FOG_OUT = new THREE.Color(0xa89a8c); // the haze over the yard at dawn

// a roller shutter that dents: a corrugated sheet whose ribs and dents are worked out from its flat rest shape.
// It faces the yard (turned round), so x here is the world's x and the dents push out toward you.
class Shutter {
  constructor(mat, w, h) {
    this.w = w;
    this.h = h;
    this.geo = new THREE.PlaneGeometry(w, h, 24, Math.round(h / 0.05));
    this.rest = this.geo.attributes.position.array.slice();
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.receiveShadow = true;
    this.dents = []; // [local x, y up from the bottom edge, depth, radius]
    this.kick = null; // the bulge of a blow, ringing out
    this.dirty = true;
  }
  dent(x, y, depth, r, kick) { this.dents.push([-x, y, depth, r]); this.kick = { x: -x, y, amp: kick, t: 0 }; this.dirty = true; }
  heightAt(x, y) { let z = 0; for (const [dx, dy, d, R] of this.dents) z += d * Math.exp(-((-x - dx) ** 2 + (y - dy) ** 2) / (R * R)); return z; }
  update(dt) {
    const k = this.kick;
    if (k) { k.t += dt; if (k.t > 0.8) this.kick = null; this.dirty = true; }
    if (!this.dirty) return;
    this.dirty = false;
    const p = this.geo.attributes.position.array, r = this.rest, h2 = this.h / 2;
    const ka = k ? k.amp * Math.exp(-k.t * 6) * Math.cos(k.t * 34) : 0;
    for (let i = 0; i < p.length; i += 3) {
      const x = r[i], y = r[i + 1] + h2;
      let z = (Math.abs(((y / 0.2) % 1) - 0.5) - 0.25) * 0.08; // the ribs
      for (const [dx, dy, d, R] of this.dents) { const q = ((x - dx) ** 2 + (y - dy) ** 2) / (R * R); if (q < 5) z += d * Math.exp(-q); }
      if (k) z += ka * Math.exp(-((x - k.x) ** 2 + (y - k.y) ** 2) / 1.4);
      p[i + 2] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

// a reefer trailer backed on to a dock: box, chassis, wheels at the dock end, legs at the front. zc: its middle
function trailer(m, x, zc) {
  const g = new THREE.Group();
  g.position.set(x, 0, zc);
  const body = mesh(new THREE.BoxGeometry(2.55, 2.7, 11), new THREE.MeshLambertMaterial({ map: yardTex('trailer') }));
  body.position.y = 2.65;
  const chassis = mesh(new THREE.BoxGeometry(1.2, 0.3, 10.6), m.darkMetal);
  chassis.position.y = 1.1;
  const unit = mesh(new THREE.BoxGeometry(2.0, 1.6, 0.6), new THREE.MeshLambertMaterial({ color: 0x8a8a86 }));
  unit.position.set(0, 3.0, -5.8);
  g.add(body, chassis, unit);
  const tyre = new THREE.MeshLambertMaterial({ color: 0x161616 });
  for (const z of [3.4, 4.5]) for (const sx of [-1, 1]) { const w = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 14), tyre); w.rotation.z = Math.PI / 2; w.position.set(sx * 0.95, 0.5, z); g.add(w); }
  for (const sx of [-1, 1]) { const leg = mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), m.darkMetal); leg.position.set(sx * 0.8, 0.5, -3.6); g.add(leg); }
  return g;
}

// the yard's canvases. kind picks one; rx, ry: how many times it repeats
function yardTex(kind, rx = 1, ry = 1) {
  const rng = makeRng(kind.length * 977 + rx * 31);
  const spots = (g, w, h, n, col, a, s0, s1) => { for (let i = 0; i < n; i++) { const s = s0 + rng() * (s1 - s0); g.fillStyle = `rgba(${col},${a * rng()})`; g.fillRect(rng() * w, rng() * h, s, s); } };
  const blots = (g, w, h, n, col, a, r0, r1) => { for (let i = 0; i < n; i++) { const R = r0 + rng() * (r1 - r0), x = rng() * w, y = rng() * h, gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2); } };
  const streaks = (g, w, y0, n, col, a, len) => { for (let i = 0; i < n; i++) { const x = rng() * w, l = len * (0.3 + rng()), gr = g.createLinearGradient(0, y0, 0, y0 + l); gr.addColorStop(0, `rgba(${col},${a * (0.4 + rng() * 0.6)})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x, y0, 1 + rng() * 4, l); } };
  let cv;
  if (kind === 'sky') {
    const { c, g } = canvas(1024, 512);
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#1c2640'); gr.addColorStop(0.2, '#34406a'); gr.addColorStop(0.34, '#6a6a90'); gr.addColorStop(0.43, '#c08a88');
    gr.addColorStop(0.48, '#f8b480'); gr.addColorStop(0.5, '#ffe0b0'); gr.addColorStop(0.52, '#c0a294'); gr.addColorStop(1, '#5a5450');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
    // the sun's side of the sky warmer (u 0.8 is where it is: see sunDir)
    const sx = 0.8 * 1024, glow = g.createRadialGradient(sx, 236, 0, sx, 236, 330);
    glow.addColorStop(0, 'rgba(255,214,150,0.9)'); glow.addColorStop(0.3, 'rgba(250,160,100,0.35)'); glow.addColorStop(1, 'rgba(250,150,100,0)');
    g.fillStyle = glow; g.fillRect(0, 0, 1024, 512);
    // long low clouds, lit from underneath
    g.filter = 'blur(5px)';
    for (let i = 0; i < 26; i++) {
      const y = 150 + rng() * 85, x = rng() * 1024, w = 40 + rng() * 140, hh = 2 + rng() * 5, near = Math.max(0, 1 - Math.abs(x - sx) / 420);
      g.fillStyle = `rgba(${(80 + near * 150) | 0},${(66 + near * 90) | 0},${(86 + near * 40) | 0},${0.2 + rng() * 0.3})`;
      g.beginPath(); g.ellipse(x, y, w, hh, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(255,${(150 + near * 80) | 0},120,${0.1 + near * 0.3})`;
      g.beginPath(); g.ellipse(x, y + hh * 0.6, w * 0.8, hh * 0.35, 0, 0, Math.PI * 2); g.fill();
    }
    g.filter = 'none';
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${rng() * 0.5})`; g.fillRect(rng() * 1024, rng() * 70, 1, 1); } // the last stars
    cv = c;
  } else if (kind === 'treeline') {
    const { c, g } = canvas(2048, 192);
    g.fillStyle = '#20242c';
    g.beginPath(); g.moveTo(0, 192);
    let y = 120;
    for (let x = 0; x <= 2048; x += 4) { y = Math.max(70, Math.min(150, y + (rng() - 0.5) * 14)); g.lineTo(x, y - (rng() < 0.3 ? rng() * 14 : 0)); }
    g.lineTo(2048, 192); g.fill();
    // pylons striding off across the fields
    g.strokeStyle = '#1a1d24'; g.lineWidth = 2;
    for (const px of [380, 700, 1010]) {
      g.beginPath(); g.moveTo(px - 16, 150); g.lineTo(px, 30); g.lineTo(px + 16, 150); g.moveTo(px - 26, 50); g.lineTo(px + 26, 50); g.moveTo(px - 20, 72); g.lineTo(px + 20, 72); g.stroke();
    }
    g.lineWidth = 1; g.beginPath(); g.moveTo(0, 60); g.quadraticCurveTo(220, 80, 380, 50); g.quadraticCurveTo(540, 74, 700, 50); g.quadraticCurveTo(860, 74, 1010, 50); g.quadraticCurveTo(1200, 80, 1400, 64); g.stroke();
    cv = c;
  } else if (kind === 'asphalt') {
    const { c, g } = canvas(256, 256);
    g.fillStyle = '#5e5c5a'; g.fillRect(0, 0, 256, 256);
    spots(g, 256, 256, 2600, '20,20,20', 0.5, 1, 2); spots(g, 256, 256, 1600, '120,116,108', 0.35, 1, 2);
    blots(g, 256, 256, 6, '12,12,14', 0.5, 10, 34); // oil
    g.strokeStyle = 'rgba(14,14,14,0.7)'; g.lineWidth = 1;
    for (let i = 0; i < 5; i++) { g.beginPath(); let x = rng() * 256, yy = rng() * 256; g.moveTo(x, yy); for (let k = 0; k < 9; k++) { x += (rng() - 0.5) * 30; yy += (rng() - 0.5) * 30; g.lineTo(x, yy); } g.stroke(); }
    cv = c;
  } else if (kind === 'slab') {
    const { c, g } = canvas(256, 256);
    g.fillStyle = '#76726a'; g.fillRect(0, 0, 256, 256);
    spots(g, 256, 256, 2000, '40,38,34', 0.35, 1, 2); spots(g, 256, 256, 900, '160,154,144', 0.3, 1, 2);
    blots(g, 256, 256, 5, '40,36,30', 0.35, 20, 60); blots(g, 256, 256, 2, '70,10,8', 0.35, 8, 20);
    g.fillStyle = 'rgba(30,28,26,0.9)'; g.fillRect(0, 0, 256, 2); g.fillRect(0, 0, 2, 256);
    cv = c;
  } else if (kind === 'facade') {
    // precast panels, 4 x 2 m, rain-streaked from every joint
    const { c, g } = canvas(256, 256);
    g.fillStyle = '#8c867c'; g.fillRect(0, 0, 256, 256);
    spots(g, 256, 256, 2400, '50,48,44', 0.3, 1, 2); spots(g, 256, 256, 1200, '170,164,152', 0.25, 1, 2);
    for (const y0 of [0, 128]) { streaks(g, 256, y0 + 3, 26, '40,38,34', 0.45, 90); streaks(g, 256, y0 + 3, 6, '90,50,30', 0.35, 60); }
    blots(g, 256, 256, 4, '60,70,50', 0.25, 10, 30);
    g.fillStyle = 'rgba(28,26,24,0.95)'; for (const y0 of [0, 128]) g.fillRect(0, y0, 256, 3); g.fillRect(0, 0, 3, 256);
    g.fillStyle = 'rgba(200,196,186,0.4)'; for (const y0 of [3, 131]) g.fillRect(3, y0, 253, 1);
    cv = c;
  } else if (kind === 'shutter') {
    // galvanised slats, scraped and rusted, the bottom one in hazard paint; KEEP CLEAR stencilled across
    const { c, g } = canvas(256, 256);
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#8e989e'); gr.addColorStop(1, '#6a706e');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    spots(g, 256, 256, 1800, '40,44,46', 0.3, 1, 2);
    const slat = 256 / 21.5;
    for (let y = 0; y < 256; y += slat) { g.fillStyle = 'rgba(20,22,24,0.55)'; g.fillRect(0, y, 256, 1.5); g.fillStyle = 'rgba(220,226,230,0.25)'; g.fillRect(0, y + 2, 256, 1); }
    streaks(g, 256, 0, 30, '110,50,20', 0.5, 160); blots(g, 256, 256, 10, '100,46,20', 0.4, 4, 16);
    const grime = g.createLinearGradient(0, 180, 0, 256); grime.addColorStop(0, 'rgba(40,30,24,0)'); grime.addColorStop(1, 'rgba(40,30,24,0.7)');
    g.fillStyle = grime; g.fillRect(0, 180, 256, 76);
    g.save(); g.beginPath(); g.rect(0, 256 - slat * 1.2, 256, slat * 1.2); g.clip(); g.fillStyle = '#c8a018'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#141210'; for (let x = -20; x < 280; x += 18) { g.beginPath(); g.moveTo(x, 256); g.lineTo(x + 9, 256); g.lineTo(x + 9 + 16, 256 - slat * 1.2); g.lineTo(x + 16, 256 - slat * 1.2); g.fill(); }
    g.restore();
    g.fillStyle = 'rgba(230,226,210,0.55)'; g.font = 'bold 22px "Courier New", monospace'; g.textAlign = 'center'; g.fillText('KEEP  CLEAR', 128, 196);
    spots(g, 256, 256, 400, '150,150,150', 0.4, 1, 3); // the paint scraped off
    cv = c;
  } else if (kind === 'trailer') {
    const { c, g } = canvas(256, 64);
    g.fillStyle = '#d4d0c6'; g.fillRect(0, 0, 256, 64);
    streaks(g, 256, 0, 40, '90,84,70', 0.35, 50); spots(g, 256, 64, 300, '60,56,50', 0.3, 1, 2);
    g.fillStyle = '#8a1a14'; g.fillRect(0, 44, 256, 4);
    cv = c;
  } else if (kind === 'hazard') {
    const { c, g } = canvas(64, 64);
    g.fillStyle = '#c9a21c'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#121110';
    for (let x = -64; x < 128; x += 32) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 16, 64); g.lineTo(x + 80, 0); g.lineTo(x + 64, 0); g.fill(); }
    spots(g, 64, 64, 160, '60,50,40', 0.5, 1, 3);
    cv = c;
  } else if (kind === 'number') {
    const { c, g } = canvas(128, 128);
    g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#d8b020'; g.font = 'bold 104px Arial, sans-serif'; g.textAlign = 'center'; g.fillText(String(rx), 64, 104);
    streaks(g, 128, 0, 10, '60,40,20', 0.5, 90);
    cv = c; rx = 1;
  } else if (kind === 'notice') {
    const { c, g } = canvas(192, 128);
    g.fillStyle = '#d8d2bc'; g.fillRect(0, 0, 192, 128);
    g.fillStyle = '#8a1a14'; g.fillRect(0, 0, 192, 26);
    g.fillStyle = '#f0e8d0'; g.font = 'bold 15px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('NOTICE TO ALL STAFF', 96, 18);
    g.fillStyle = '#2a2622'; g.font = '11px Arial, sans-serif';
    ['Every worker MUST clock out', 'before leaving the building.', 'No card, no pay.', 'Nobody leaves', 'before the shift is over.'].forEach((l, i) => g.fillText(l, 96, 46 + i * 16));
    blots(g, 192, 128, 3, '70,6,4', 0.6, 4, 12); streaks(g, 192, 0, 12, '90,70,40', 0.3, 80);
    cv = c;
  } else if (kind === 'clockface') {
    const { c, g } = canvas(64, 64);
    g.fillStyle = '#e8e0cc'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(32 + Math.sin(a) * 24, 32 - Math.cos(a) * 24); g.lineTo(32 + Math.sin(a) * 28, 32 - Math.cos(a) * 28); g.stroke(); }
    g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + 12, 32 + 7); g.moveTo(32, 32); g.lineTo(32 - 4, 32 - 22); g.stroke(); // ten to six
    cv = c;
  } else if (kind === 'cards') {
    const { c, g } = canvas(96, 144);
    g.fillStyle = '#3a3630'; g.fillRect(0, 0, 96, 144);
    for (let r = 0; r < 6; r++) for (let k = 0; k < 4; k++) {
      if (rng() < 0.12) continue; // somebody's never coming back for theirs
      g.fillStyle = rng() < 0.15 ? '#c8b880' : '#e0d8c0'; g.fillRect(4 + k * 23, 4 + r * 23, 19, 21);
      g.fillStyle = 'rgba(40,30,20,0.6)'; g.fillRect(6 + k * 23, 8 + r * 23, 12, 2);
      if (rng() < 0.2) { g.fillStyle = 'rgba(100,8,6,0.7)'; g.fillRect(8 + k * 23, 12 + r * 23, 8, 6); }
    }
    cv = c;
  } else if (kind === 'grate') {
    const { c, g } = canvas(64, 64);
    g.fillStyle = '#1a1816'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#4a4440'; for (let i = 2; i < 64; i += 8) g.fillRect(i, 2, 4, 60);
    g.fillRect(0, 0, 64, 3); g.fillRect(0, 61, 64, 3);
    blots(g, 64, 64, 2, '80,8,6', 0.7, 6, 16);
    cv = c;
  } else if (kind === 'chainlink') {
    const { c, g } = canvas(32, 32);
    g.strokeStyle = 'rgba(150,152,150,1)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 16); g.lineTo(16, 0); g.lineTo(32, 16); g.lineTo(16, 32); g.closePath(); g.stroke();
    cv = c;
  } else if (kind === 'hole') {
    // punched through from inside: torn black, the metal curled out round it
    const { c, g } = canvas(64, 64);
    const ring = (R, j, col) => { g.fillStyle = col; g.beginPath(); for (let i = 0; i <= 18; i++) { const a = (i / 18) * Math.PI * 2, r = R * (1 - j + rng() * j * 2); g.lineTo(32 + Math.cos(a) * r * 1.2, 32 + Math.sin(a) * r); } g.fill(); };
    ring(26, 0.35, 'rgba(170,176,180,0.95)');
    ring(21, 0.4, 'rgba(90,60,40,0.9)');
    ring(16, 0.45, '#050303');
    cv = c;
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  return t;
}

// build every shader a scene needs now, and call `done` once the GPU has them ready. (three's compileAsync does this
// too, but trips over a material freed while it waits, e.g. a floor torn down before its shaders finished)
export function compileSoon(renderer, scene, cam, done = () => {}) {
  let set;
  try { set = renderer.compile(scene, cam); } catch { done(); return; }
  const poll = () => {
    try { for (const m of set) { const p = renderer.properties.get(m).currentProgram; if (!p || p.isReady()) set.delete(m); } } catch { set.clear(); }
    if (set.size) setTimeout(poll, 10); else done();
  };
  setTimeout(poll, 0);
}

// ---------- the director of your death ----------
export class Cutscene {
  constructor(kind, { mats, audio, blood, aspect, env }) {
    this.kind = kind;
    this.mats = mats;
    this.audio = audio;
    this.blood = blood;
    this.t = 0;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.08);
    if (env) this.scene.environment = env; // (the remaster: metal and wet things have something to reflect)
    this.scene.add(new THREE.AmbientLight(0x3a2a26, 1.4));
    this.cam = new THREE.PerspectiveCamera(70, aspect, 0.05, 300);
    this.scene.add(this.cam);
    this.him = createForemanMesh(mats);
    this.scene.add(this.him.root);
    this.gore = new Gore(this.scene, mats);
    this.fired = new Set();
    this.blackout = 0;
    this.fear = 0.6;
    this.flash = 0;
    this.shake = 0;
    this.ready = true;
    // built ahead of time (during the grab): anything the build would play waits for the film to actually start
    const real = audio, held = [];
    this.audio = new Proxy(real, { get: (o, k) => (typeof o[k] === 'function' ? (...a) => { held.push([k, a]); } : o[k]) });
    this[kind + 'Build']();
    // one of every piece of the gore kit, parked: the organs and limbs the films throw about are made at the moment
    // they're needed, and the first of a kind used to build its shaders right then, mid-film
    for (const o of [...organSet(mats), eyeball(mats), guts(mats, 0.08, 4), meatChunk(mats, Math.random), severedArm(mats, Math.random), severedHead(mats, Math.random), mesh(new THREE.BoxGeometry(0.012, 0.016, 0.01), mats.bone, false), ...[...mats.splat, ...mats.pool].map((mt) => decal(mt, 0.5, 0, 0))]) this.park(o);
    { const spare = makeWorker(mats); openChest(spare, mats); this.park(spare.root); } // (and an opened chest: its pit and lungs)
    this.audio = real;
    this.queued = held;
    this.b0 = this.blackout;
  }
  // its shaders, compiled before the first frame (in parallel where the GPU allows); black until they are
  prepare(renderer) {
    this.ready = false;
    const go = () => { if (this.ready) return; this.warm(renderer); this.ready = true; };
    compileSoon(renderer, this.scene, this.cam, go);
    setTimeout(go, 5000);
  }
  // something the film needs later, made now and kept out of sight under the floor until then
  park(o) { o.position.set(0, -60, 0); this.scene.add(o); (this.parked || (this.parked = [])).push(o); return o; }
  // one draw while the screen is still black, with everything the film will show later in front of the camera (the
  // hidden things shown, the parked ones brought up): what compile() can't build (clipped materials, shadow depth
  // programs) is built here, not in the middle of the film
  warm(renderer) {
    try {
      const hidden = [], culled = []; this.scene.traverse((o) => { if (!o.visible && !o.isLight) { hidden.push(o); o.visible = true; } if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } }); // (off camera too: drawn once)
      this.cam.updateMatrixWorld(true);
      const at = this.cam.getWorldPosition(V()).addScaledVector(this.cam.getWorldDirection(V()), 2);
      const moved = (this.parked || []).map((o) => { const p = o.position.clone(); o.position.copy(at); return [o, p]; });
      const rt = new THREE.WebGLRenderTarget(64, 64, { type: THREE.HalfFloatType }), was = renderer.getRenderTarget();
      renderer.setRenderTarget(rt); renderer.render(this.scene, this.cam); renderer.setRenderTarget(was); rt.dispose();
      hidden.forEach((o) => { o.visible = false; }); culled.forEach((o) => { o.frustumCulled = true; }); moved.forEach(([o, p]) => o.position.copy(p));
    } catch { /* a warm-up that fails just means the film builds those shaders when it gets to them */ }
  }
  // first person: you're still holding the torch
  torch(i = 120) {
    const t = new THREE.SpotLight(0xffe4c4, i, 30, 0.6, 0.6, 1.5);
    t.position.set(0.2, -0.2, 0);
    t.target.position.set(0, -0.1, -3);
    this.cam.add(t, t.target);
    return t;
  }
  // run a callback once, the first frame the timeline passes `at`
  at(t, key, fn) { if (this.t >= t && !this.fired.has(key)) { this.fired.add(key); fn(); } }
  pose(o = {}) {
    poseForeman(this.him, { gait: o.gait || 0, speed: o.speed || 0, mode: o.mode || 'walk', t: this.t, swing: o.swing || 0, jawOpen: o.jaw ?? 0.2, twitch: o.twitch || { x: 0, y: 0, z: 0, r: 0 } });
  }
  twitch(big = 0.3) { return { x: (Math.random() - 0.5) * big, y: (Math.random() - 0.5) * big, z: (Math.random() - 0.5) * big * 1.5, r: (Math.random() - 0.5) * big * 2 }; }
  headPos(out = new THREE.Vector3()) { this.him.root.updateMatrixWorld(true); return this.him.head.getWorldPosition(out); }
  handPos(i, out = new THREE.Vector3()) { this.him.root.updateMatrixWorld(true); return this.him.arms[i].hand.getWorldPosition(out); }

  update(dt) {
    if (this.queued) { // the film starts now
      if (this.kind !== 'exit') this.blood.clear(); // the camera isn't you in these
      for (const [k, a] of this.queued) this.audio[k](...a);
      this.queued = null; this.blackout = this.b0;
    }
    this.t += dt * (this.rate ? this.rate(this.t) : 1); // (a film can run its slow stretches faster)
    this.flash = Math.max(0, this.flash - dt * 3);
    this.shake = Math.max(0, this.shake - dt * 2);
    this[this.kind + 'Update'](dt);
    this.gore.update(dt);
    if (this.shake > 0) {
      this.cam.position.x += (Math.random() - 0.5) * this.shake * 0.06;
      this.cam.position.y += (Math.random() - 0.5) * this.shake * 0.06;
    }
    return this.t >= this.dur;
  }

  dispose() {
    this.audio.cutLoops();
    this.audio.hush();
    this.scene.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  }

  // ---------- 2: the exit ----------
  exitBuild() {
    this.dur = 9;
    const s = this.scene, m = this.mats;
    s.fog.density = 0.014;
    this.torch(90);
    // corridor along -z, ending at a door at z = -10
    const T = 2, wall = new THREE.PlaneGeometry(T, 3);
    for (let z = 0; z > -10; z -= T) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(T, T), m.floors[0]);
      f.rotation.x = -Math.PI / 2;
      f.position.set(0, 0, z - 1);
      s.add(f);
      const c = new THREE.Mesh(new THREE.PlaneGeometry(T, T), m.ceil);
      c.rotation.x = Math.PI / 2;
      c.position.set(0, 3, z - 1);
      s.add(c);
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(wall, m.walls[3 + ((z / 2) & 3)]);
        w.position.set(sx, 1.5, z - 1);
        w.rotation.y = -sx * Math.PI / 2;
        s.add(w);
      }
    }
    const back = new THREE.Mesh(wall, m.walls[1]);
    back.position.set(0, 1.5, 1);
    back.rotation.y = Math.PI;
    s.add(back);
    // door frame wall with the doorway cut
    for (const [x, w] of [[-0.85, 0.3], [0.85, 0.3]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, 3), m.walls[2]); p.position.set(x, 1.5, -10); s.add(p); }
    const lintel = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), m.walls[2]);
    lintel.position.set(0, 2.6, -10);
    s.add(lintel);
    this.door = new THREE.Group();
    this.door.position.set(-0.7, 0, -10);
    const leaf = mesh(new THREE.BoxGeometry(1.4, 2.2, 0.06), m.rust[1]);
    leaf.position.set(0.7, 1.1, 0);
    this.door.add(leaf);
    s.add(this.door);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), new THREE.MeshBasicMaterial({ map: signTex('EXIT', '#ff3020'), fog: false }));
    sign.position.set(0, 2.6, -9.98);
    s.add(sign);
    const signLight = new THREE.PointLight(0xff3020, 3, 6, 2);
    signLight.position.set(0, 2.4, -9.5);
    s.add(signLight);
    const lamp = makeLamp(m, 'bulb');
    lamp.position.set(0, 3, -3);
    s.add(lamp);
    this.lampLight = new THREE.PointLight(0xffe0c0, 10, 12, 1.6);
    this.lampLight.position.set(0, 2.2, -3);
    s.add(this.lampLight);
    // light from the corridor behind him, so from below he's a shape in the doorway
    const backLight = new THREE.PointLight(0xfff0e0, 14, 8, 1.5);
    backLight.position.set(0, 2.4, -8.2);
    s.add(backLight);
    // beyond the door: the inside of the building, a stairwell eight storeys deep, and at the bottom the shredders.
    // The walls light themselves a little (emissive), so the shape of the place reads even out of the lamps' reach
    s.fog.density = 0.009;
    const SH = { x0: -5, x1: 5, z0: -10, z1: -20, top: 5, bot: -44 };
    const shaftMat = (map, rx, ry, tint) => { const t = map.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.needsUpdate = true; return new THREE.MeshLambertMaterial({ map: t, emissiveMap: t, emissive: tint, color: 0xb8aa98 }); };
    const brick = shaftMat(m.walls[3].map, 4, 18, 0x3a2e24), conc = shaftMat(m.walls[1].map, 4, 18, 0x2e2a26);
    const H = SH.top - SH.bot, cy = (SH.top + SH.bot) / 2;
    for (const [w, x, z, ry, mat] of [[10, 0, SH.z1, 0, brick], [10, SH.x0, -15, Math.PI / 2, conc], [10, SH.x1, -15, -Math.PI / 2, conc]]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, H), mat); pl.position.set(x, cy, z); pl.rotation.y = ry; s.add(pl); }
    // the door wall, from the shaft side (with the doorway left open)
    for (const [x, w] of [[-3, 4], [3, 4]]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, H), conc); pl.position.set(x, cy, SH.z0 - 0.02); pl.rotation.y = Math.PI; s.add(pl); }
    const under = new THREE.Mesh(new THREE.PlaneGeometry(2, -SH.bot), conc); under.position.set(0, SH.bot / 2, SH.z0 - 0.02); under.rotation.y = Math.PI; s.add(under);
    // every storey: a landing round three sides with a railing, doorways off it, a caged lamp and a pipe run
    const slab = new THREE.MeshLambertMaterial({ color: 0x6a645a, emissive: 0x1a1814 });
    const rail = new THREE.MeshLambertMaterial({ color: 0x8a6a2a, emissive: 0x2a1e0a });
    const doorDark = new THREE.MeshBasicMaterial({ color: 0x050404 });
    const lampM = new THREE.MeshBasicMaterial({ color: 0xffd8a0, fog: false });
    for (let y = -2; y > SH.bot + 6; y -= 5) {
      const back = mesh(new THREE.BoxGeometry(10, 0.25, 1.4), slab, false); back.position.set(0, y, SH.z1 + 0.7); s.add(back);
      for (const sx of [-1, 1]) { const side = mesh(new THREE.BoxGeometry(1.4, 0.25, 8.6), slab, false); side.position.set(sx * 4.3, y, -15.7); s.add(side); }
      const r1 = mesh(new THREE.BoxGeometry(7.2, 0.05, 0.05), rail, false); r1.position.set(0, y + 1, SH.z1 + 1.4); s.add(r1);
      for (let x = -3.5; x <= 3.5; x += 1) { const post = mesh(new THREE.BoxGeometry(0.04, 1, 0.04), rail, false); post.position.set(x, y + 0.5, SH.z1 + 1.4); s.add(post); }
      for (const sx of [-1, 1]) { const r2 = mesh(new THREE.BoxGeometry(0.05, 0.05, 7.2), rail, false); r2.position.set(sx * 3.6, y + 1, -15.4); s.add(r2); }
      for (const x of [-2.6, 2.4]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.1), doorDark); d.position.set(x, y + 1.18, SH.z1 + 0.01); s.add(d); }
      const lmp = mesh(new THREE.BoxGeometry(0.35, 0.18, 0.12), lampM, false); lmp.position.set(-0.2, y + 2.6, SH.z1 + 0.08); s.add(lmp);
      const pipe = mesh(new THREE.CylinderGeometry(0.12, 0.12, 10, 8), rail, false); pipe.rotation.z = Math.PI / 2; pipe.position.set(0, y + 3.4, SH.z1 + 0.2); s.add(pipe);
    }
    const mid = new THREE.PointLight(0xffd8b0, 40, 30, 1.2); mid.position.set(0, -14, -16); s.add(mid);
    // the bottom: the shredders. Two drums of teeth turning into each other, in a pit of what's gone before
    const floorB = mesh(new THREE.BoxGeometry(10, 0.4, 10), new THREE.MeshLambertMaterial({ color: 0x3a1410, emissive: 0x1a0604 }), false); floorB.position.set(0, SH.bot, -15); s.add(floorB);
    const steel = new THREE.MeshPhongMaterial({ color: 0x8a8a84, shininess: 90, specular: 0x888888, emissive: 0x141414 });
    const bloodSteel = new THREE.MeshPhongMaterial({ color: 0x6a1410, shininess: 60, specular: 0x552222, emissive: 0x1a0402 });
    this.shredders = [-1, 1].map((sz) => {
      const r = new THREE.Group();
      r.position.set(0, SH.bot + 1.6, -15 + sz * 1.15);
      const drum = mesh(new THREE.CylinderGeometry(1.0, 1.0, 8, 16), steel, false); drum.rotation.z = Math.PI / 2; r.add(drum);
      for (let k = 0; k < 7; k++) for (let a = 0; a < 10; a++) { const tooth = mesh(new THREE.BoxGeometry(0.16, 0.5, 0.22), (a + k) % 3 ? steel : bloodSteel, false); const ang = (a / 10) * Math.PI * 2 + k * 0.3; tooth.position.set(-3.4 + k * 1.13, Math.cos(ang) * 1.1, Math.sin(ang) * 1.1); tooth.rotation.x = ang; r.add(tooth); }
      s.add(r);
      return r;
    });
    for (const sx of [-1, 1]) { const hop = mesh(new THREE.BoxGeometry(0.3, 4, 5), bloodSteel, false); hop.position.set(sx * 4.2, SH.bot + 2, -15); hop.rotation.z = sx * 0.35; s.add(hop); }
    const glow = new THREE.PointLight(0xff6a30, 70, 40, 1.1); glow.position.set(0, SH.bot + 3.5, -15); s.add(glow);
    const glow2 = new THREE.PointLight(0xff2a10, 60, 25, 1.3); glow2.position.set(0, SH.bot + 0.8, -15); s.add(glow2);
    this.him.root.position.set(0, 0, 2.6);
    this.him.root.rotation.y = Math.PI;
  }
  exitUpdate() {
    const t = this.t;
    for (const [i, r] of this.shredders.entries()) r.rotation.x += (i ? -1 : 1) * 0.06; // turning into each other
    const head = this.headPos();
    if (t < 2) {
      // walking to the door. it's right there.
      const z = lerp(-1, -7.5, ease(t / 2));
      this.cam.position.set(0, 1.62 + Math.sin(t * 9) * 0.03, z);
      this.cam.lookAt(0, 1.7, -10);
      this.him.root.position.set(0, 0, z + 3.2);
      this.pose({ mode: 'walk', gait: t * 5, speed: 1.4 });
      this.at(0.4, 'steps', () => { for (let i = 0; i < 4; i++) setTimeout(() => this.audio.step('walk', false), i * 420); });
    } else if (t < 4.2) {
      // look behind you
      const turn = ease((t - 2) / 0.6) * (1 - ease((t - 3.5) / 0.6));
      this.cam.position.set(0, 1.62, -7.5);
      const target = V(0, 1.7, -10).lerp(head, turn);
      this.cam.lookAt(target);
      this.him.root.position.set(0, 0, -5.4);
      this.pose({ jaw: 0.15, twitch: { x: 0.3, y: 0, z: Math.sin(t * 2) * 0.4, r: 0.5 } });
      this.at(2.45, 'see', () => { this.audio.stinger(); this.flash = 0.2; });
    } else if (t < 5.6) {
      // the door opens on nothing
      this.door.rotation.y = -ease((t - 4.2) / 0.6) * 1.9;
      this.at(4.2, 'door', () => { this.audio.creak({ x: 0, y: 1.5, z: -10 }); this.audio.windRush(1.2, 0.25); });
      const z = lerp(-7.5, -9.6, ease((t - 4.4) / 0.6));
      this.cam.position.set(0, 1.62, z);
      const down = ease((t - 4.7) / 0.7);
      this.cam.lookAt(0, lerp(1.6, -40, down), lerp(-12, -14, down));
      // vertigo: the floor drops away
      this.cam.fov = lerp(70, 45, ease((t - 4.8) / 0.8));
      this.cam.updateProjectionMatrix();
      this.him.root.position.set(0, 0, lerp(-5.4, -8.4, ease((t - 4.4) / 1)));
      this.pose({ mode: 'chase', gait: t * 6, speed: 2 });
    } else {
      // the shove, and the fall, watching him in the doorway
      this.at(5.6, 'shove', () => { this.audio.thud({ x: 0, y: 1, z: -9 }, 1); this.audio.gasp(); this.shake = 1.2; });
      const ft = Math.max(0, t - 5.75);
      const y = 1.62 - 0.5 * 9.8 * ft * ft;
      this.cam.fov = 70;
      this.cam.updateProjectionMatrix();
      this.cam.position.set(Math.sin(t) * 0.5, y, -12.5 - Math.min(1.5, ft * 2));
      this.him.root.position.set(0, 0, -9.7);
      this.pose({ mode: 'grab', jaw: 0.4, twitch: { x: 0.6, y: 0, z: 0, r: 0 } });
      head.y += 0.1;
      // up at him in the doorway as you fall; then, the last second, down at what you're falling into
      const below = V(0, -42, -15), down2 = ease((t - 7.5) / 0.5);
      this.cam.lookAt(t < 5.9 ? V(0, -30, -15) : head.clone().lerp(below, down2));
      this.cam.rotation.z += Math.sin(t * 3) * 0.3 * (1 - down2);
      this.at(5.8, 'wind', () => { this.audio.windRush(3.2, 1); this.audio.scream(); });
      this.at(8.6, 'land', () => { this.audio.crack(); this.audio.squelch(2); this.blackout = 1; });
      this.fear = 0.9;
    }
  }

  // ---------- 3: the grinder (third person) ----------
  grinderBuild() {
    this.dur = 8.5;
    const s = this.scene, m = this.mats;
    room(s, m, 12, 12, 6);
    s.fog.density = 0.03;
    const g = new THREE.Group();
    g.position.set(0, 0, -3);
    const base = mesh(new THREE.BoxGeometry(1.8, 1.3, 1.8), m.darkMetal);
    base.position.y = 0.65;
    const hopperMat = m.steel.clone();
    hopperMat.side = THREE.DoubleSide;
    const hopper = mesh(new THREE.CylinderGeometry(1.35, 0.55, 1.1, 4, 1, true), hopperMat);
    hopper.rotation.y = Math.PI / 4;
    hopper.position.y = 1.85;
    g.add(base, hopper);
    this.rollers = [-1, 1].map((sx) => {
      const r = new THREE.Group();
      r.position.set(sx * 0.2, 1.35, 0);
      r.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.9, 10), m.darkMetal));
      for (let i = 0; i < 18; i++) { const tooth = mesh(new THREE.ConeGeometry(0.04, 0.12, 4), m.steel, false); const a = (i % 6) / 6 * Math.PI * 2; tooth.position.set(Math.cos(a) * 0.2, (Math.floor(i / 6) - 1) * 0.3, Math.sin(a) * 0.2); tooth.rotation.z = -Math.PI / 2 + a; r.add(tooth); }
      r.rotation.x = Math.PI / 2;
      g.add(r);
      return r;
    });
    const chute = mesh(new THREE.BoxGeometry(0.6, 0.1, 1.2), m.steel);
    chute.position.set(0, 0.55, 1.2);
    chute.rotation.x = 0.5;
    g.add(chute);
    s.add(g);
    s.add(decal(m.pool[0], 3, 0, -1.6, 0.4));
    this.grinder = g;
    const lamp = makeLamp(m, 'bulb');
    lamp.position.set(0.5, 3, -2);
    s.add(lamp);
    const l = new THREE.PointLight(0xffd0a0, 22, 14, 1.4);
    l.position.set(0.5, 2.3, -2);
    l.castShadow = true;
    s.add(l);
    const rim = new THREE.PointLight(0xff3020, 10, 10, 1.5);
    rim.position.set(-2, 1.5, -4);
    s.add(rim);
    const fill = new THREE.PointLight(0xc8d0ff, 6, 12, 1.5);
    fill.position.set(3, 2, 2);
    s.add(fill);
    this.you = makeWorker(m);
    s.add(this.you.root);
    // a work light that travels with the two of you down the room
    this.follow = new THREE.PointLight(0xffc8a0, 16, 7, 1.4);
    s.add(this.follow);
    this.key = new THREE.PointLight(0xffd8b8, 0, 9, 1.2); // on him at the hopper
    this.key.position.set(2.6, 2.3, -1.9);
    s.add(this.key);
    this.audio.grinder(true);
  }
  grinderUpdate(dt) {
    const t = this.t, you = this.you, him = this.him.root;
    for (const r of this.rollers) r.rotation.y += dt * (t > 4 ? 14 : 6) * (r.position.x > 0 ? 1 : -1);
    const hand = V();
    if (t < 3) {
      // dragging you by the ankle, feet first, your arms trailing over your head. The camera walks alongside.
      const z = lerp(3.2, -1.3, ease(t / 3));
      him.position.set(0.3, 0, z);
      him.rotation.y = Math.PI;
      this.pose({ mode: 'walk', gait: t * 5.5, speed: 1.4, jaw: 0.3 });
      this.him.arms[1].sh.rotation.set(0.55, 0, -0.15);
      this.him.arms[1].el.rotation.x = -0.2;
      this.handPos(1, hand);
      const leg = 0.92, lift = Math.asin(clamp01((hand.y - 0.13) / leg));
      you.root.position.set(hand.x, 0.13, hand.z + Math.cos(lift) * leg + Math.sin(t * 11) * 0.02);
      orient(you.root, V(0, 0, 1), V(0, 1, 0)); // on your back, head trailing
      you.legs.forEach((l, i) => { l.rotation.set(-lift + (i ? 0 : 0.25), 0, (i ? 0 : 0.18)); l.userData.knee.rotation.x = i ? 0 : 0.5; });
      you.arms.forEach((a, i) => { a.rotation.set(0, 0, (i ? 1 : -1) * (2.7 + Math.sin(t * 6 + i) * 0.1)); a.userData.el.rotation.z = 0; });
      you.head.rotation.set(0.3, Math.sin(t * 9) * 0.35, 0);
      const mid = V(0.3, 0.75, z + 0.75);
      this.cam.position.set(2.7, 1.05, mid.z + 1.1);
      this.cam.lookAt(mid);
      this.follow.position.set(1.2, 2.2, z + 0.8);
      this.at(0.2, 'drag', () => this.audio.drag());
      this.at(1.4, 'drag2', () => this.audio.drag());
      if (Math.random() < dt * 14) this.scene.add(decal(this.mats.drag || this.mats.splat[0], 0.5, you.root.position.x + (Math.random() - 0.5) * 0.15, you.root.position.z + 0.4, Math.PI / 2, 0.011));
      return;
    }
    you.legs.forEach((l) => { l.rotation.set(0, 0, 0); l.userData.knee.rotation.x = 0; });
    this.follow.intensity = Math.max(0, this.follow.intensity - dt * 30);
    // then: off to the side, him in profile at the lip of the hopper, the whole machine in shot
    const ct = (t - 3) / 5.5;
    this.cam.position.set(lerp(4.6, 4.2, ct), lerp(1.6, 1.9, ct), lerp(-3.4, -3.6, ct));
    this.cam.lookAt(0.9, 1.7, -2.0);
    this.key.intensity = 24;
    // a step back from the rim while he hoists you, then a step in to drop you over it
    const step = ease((t - 3.9) / 0.4);
    him.position.set(lerp(1.95, 1.34, step), 0, lerp(-0.85, -1.52, step));
    him.rotation.y = -2.41; // facing the mouth of it
    if (t < 4.2) {
      // up, by one leg, over the mouth of it
      const k = ease((t - 3) / 1);
      this.pose({ mode: 'walk', jaw: 0.5 });
      this.him.arms[1].sh.rotation.set(lerp(-0.2, -2.9, k), 0, -0.2);
      this.handPos(1, hand);
      hangFromHand(you, hand, V(1, 0, 1)); // off the floor as he lifts, lying back away from the machine till then
      // until he's high enough to go over the rim, keep him off the machine: nothing passes through the steel
      const over = clamp01((hand.y - 2.6) / 0.6);
      you.root.position.x = lerp(Math.max(you.root.position.x, 1.25), you.root.position.x, over);
      you.root.position.z = lerp(Math.max(you.root.position.z, -1.75), you.root.position.z, over);
      this.at(3.2, 'growl', () => this.audio.growl({ x: 0.9, y: 2, z: -2 }, 1));
    } else {
      // in
      const k = clamp01((t - 4.2) / 0.5);
      you.root.position.set(lerp(you.root.position.x, 0, k), lerp(2.6, 1.0, k), -3);
      orient(you.root, V(0, -1, 0), V(0, 0, 1));
      you.root.visible = t < 4.75;
      this.pose({ mode: 'walk', jaw: 0.8, twitch: this.twitch(0.2) });
      const mouth = V(0, 2.3, -3);
      this.at(4.45, 'crunch', () => {
        this.audio.grind();
        this.shake = 1.5;
        this.flash = 0.5;
        this.gore.burst(mouth, 40, 5, 0.9, [severedArm(this.mats, Math.random), severedHead(this.mats, Math.random), severedArm(this.mats, Math.random)]);
        this.gore.spray(V(0, 0.8, -1.8), V(0, 0.3, 1), 120, 6, 0.5);
      });
      if (t > 4.5 && t < 7 && Math.random() < dt * 14) { this.gore.burst(mouth, 3, 4, 1); this.gore.spray(V(0, 0.7, -1.7), V(0, 0.2, 1), 25, 5, 0.4); }
      this.at(7.6, 'black', () => (this.blackout = 1));
      this.fear = 0.9;
    }
  }

  // ---------- playing the Foreman: through his eyes, the worker hooked by the ankle and fed to the grinder ----------
  processBuild() {
    this.grinderBuild();
    this.dur = 9.5;
    // his arms, seen from behind his own eyes; the rest of him isn't there to see
    this.him.root.visible = false;
    for (const [i, a] of this.him.arms.entries()) { a.sh.position.set(i ? 0.34 : -0.34, -0.42, 0.05); this.cam.add(a.sh); }
    this.him.arms[0].sh.rotation.set(0.25, 0, 0.12);
    this.him.arms[0].el.rotation.x = -0.25;
    this.follow.intensity = 22;
    this.cam.fov = 78;
    this.cam.updateProjectionMatrix();
  }
  processUpdate(dt) {
    const t = this.t, you = this.you, arm = this.him.arms[1], hand = V();
    for (const r of this.rollers) r.rotation.y += dt * (t > 4.3 ? 14 : 6) * (r.position.x > 0 ? 1 : -1);
    const bob = (k) => Math.abs(Math.sin(k)) * 0.06;
    if (t < 3.4) {
      // walking backwards to the grinder, looking down at him: on his back, hooked by the ankle, clawing at the floor
      const k = ease(t / 3.4), z = lerp(3.8, 0.4, k);
      this.cam.position.set(0.05 + Math.sin(t * 2.6) * 0.04, 2.05 - bob(t * 2.6), z);
      this.cam.lookAt(0.15 + Math.sin(t * 1.3) * 0.15, 0.25, z + 2.6);
      arm.sh.rotation.set(0.9 + Math.sin(t * 5.2) * 0.05, 0, -0.1);
      arm.el.rotation.x = -0.25;
      this.cam.updateMatrixWorld(true);
      arm.hand.getWorldPosition(hand);
      const leg = 0.92, lift = Math.asin(clamp01((hand.y - 0.13) / leg));
      you.root.position.set(hand.x, 0.13, hand.z + Math.cos(lift) * leg + Math.sin(t * 11) * 0.02);
      orient(you.root, V(0, 0, 1), V(0, 1, 0));
      // the free leg kicks (up, off the floor); the arms claw at it and grab at the air, never down through it
      you.legs.forEach((l, i) => { l.rotation.set(-lift - (i ? 0 : 0.25 + Math.abs(Math.sin(t * 7)) * 0.35), 0, i ? 0 : 0.2); l.userData.knee.rotation.x = i ? 0 : 0.4 + Math.sin(t * 7) * 0.3; });
      you.arms.forEach((a, i) => { a.rotation.set(Math.abs(Math.sin(t * 8 + i * 2)) * 0.6, 0, (i ? 1 : -1) * (2.2 + Math.sin(t * 6 + i) * 0.45)); a.userData.el.rotation.z = 0; });
      you.head.rotation.set(0.45 + Math.sin(t * 4) * 0.15, Math.sin(t * 9) * 0.3, 0); // up off the floor, looking down himself at you
      you.jaw.rotation.x = 0.4 + Math.sin(t * 13) * 0.1;
      this.follow.position.set(0.8, 2.2, z + 1.6);
      this.at(0.15, 'scream', () => this.audio.distantScream({ x: you.root.position.x, y: 0.3, z: you.root.position.z }));
      this.at(0.3, 'drag', () => this.audio.drag());
      this.at(1.8, 'drag2', () => this.audio.drag());
      this.at(2.1, 'scream2', () => this.audio.distantScream({ x: you.root.position.x, y: 0.3, z: you.root.position.z }));
      if (Math.random() < dt * 14) this.scene.add(decal(this.mats.drag || this.mats.splat[0], 0.5, you.root.position.x + (Math.random() - 0.5) * 0.15, you.root.position.z + 0.4, Math.PI / 2, 0.011));
      this.fear = 0.6;
      return;
    }
    // turn round to the hopper and lift him up over it, upside down, by the leg
    const turn = ease((t - 3.4) / 0.7), up = ease((t - 3.6) / 0.9);
    const yaw = lerp(0, Math.PI, turn) + Math.sin(t * 17) * 0.004 * (t > 4.6 ? 1 : 0);
    const look = V(0, lerp(0.25, 2.1, turn), 0);
    this.cam.position.set(0.05, 2.05 - bob(t * 3) * (1 - turn), lerp(0.4, -0.55, turn));
    look.x = this.cam.position.x + Math.sin(yaw) * 2.6 * (1 - 0.3 * turn);
    look.z = this.cam.position.z + Math.cos(yaw) * 2.6;
    if (t > 4.6) look.y = lerp(2.1, 1.3, ease((t - 4.6) / 0.6)); // and down into it
    this.cam.lookAt(look);
    this.follow.intensity = Math.max(0, 22 - (t - 3.4) * 30);
    this.key.intensity = 24;
    const drop = clamp01((t - 4.55) / 0.35);
    arm.sh.rotation.set(lerp(0.9, 2.35, up) - drop * 0.6, 0, -0.1);
    arm.el.rotation.x = lerp(-0.25, -0.05, up);
    this.cam.updateMatrixWorld(true);
    arm.hand.getWorldPosition(hand);
    if (t < 4.55) {
      // hanging from the hook by one ankle, head down, swinging, arms reaching for the floor
      hangFromHand(you, hand, V(Math.sin(t * 5) * 0.15, 0, 1));
      const up2 = clamp01((hand.y - LEG - 0.16) / TRUNK); // the free leg only folds once he's off the floor
      you.legs.forEach((l, i) => { l.rotation.set(i ? 0 : 0.6 * up2, 0, 0); l.userData.knee.rotation.x = i ? 0 : 0.9 * up2; });
      you.arms.forEach((a, i) => { a.rotation.set((0.3 + Math.sin(t * 9 + i) * 0.4) * up2, 0, (i ? 1 : -1) * 0.4); a.userData.el.rotation.z = 0; });
      this.at(3.5, 'growl', () => this.audio.growl({ x: 0, y: 2, z: -1 }, 1));
      this.at(3.9, 'scream3', () => this.audio.distantScream({ x: hand.x, y: 1.5, z: hand.z }));
    } else {
      // let go: down into the rollers
      const k = clamp01((t - 4.55) / 0.4);
      you.root.position.set(lerp(hand.x, 0, k), lerp(hand.y - LEG, 0.9, k * k), lerp(hand.z, -3, k));
      orient(you.root, V(0, -1, 0), V(0, 0, 1));
      you.root.visible = t < 4.95;
      const mouth = V(0, 2.2, -3);
      this.at(4.85, 'crunch', () => {
        this.audio.grind();
        this.shake = 1.6;
        this.flash = 0.5;
        this.blood.splash(1, true); // it comes back up at you
        this.gore.burst(mouth, 40, 5, 0.9, [severedArm(this.mats, Math.random), severedHead(this.mats, Math.random), severedArm(this.mats, Math.random)]);
        this.gore.spray(V(0, 1.9, -2.4), V(0, 0.6, 1), 120, 6, 0.5);
      });
      if (t > 4.9 && t < 8 && Math.random() < dt * 14) { this.gore.burst(mouth, 3, 4, 1); this.gore.spray(V(0, 1.9, -2.4), V(0, 0.5, 1), 20, 5, 0.4); }
      this.at(6.4, 'breath', () => this.audio.growl({ x: 0, y: 2, z: -1 }, 0.6));
      this.at(9.0, 'black', () => (this.blackout = 1));
      this.fear = 0.85;
    }
  }

  // ---------- 4: the fan (third person) ----------
  fanBuild() {
    this.dur = 7.6;
    const s = this.scene, m = this.mats;
    room(s, m, 10, 10, 9);
    s.fog.density = 0.04;
    this.fanPos = V(0, 2.85, -0.4);
    this.fan = new THREE.Group();
    this.fan.position.copy(this.fanPos);
    this.fan.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.2, 10), m.darkMetal));
    this.bladeMat = m.steel.clone();
    for (let i = 0; i < 4; i++) {
      const b = mesh(new THREE.BoxGeometry(1.5, 0.025, 0.32), this.bladeMat);
      b.position.x = 0.85;
      const arm = new THREE.Group();
      arm.rotation.y = (i * Math.PI) / 2;
      arm.add(b);
      this.fan.add(arm);
    }
    const rod = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 5), m.darkMetal, false);
    rod.position.y = 0.1;
    this.fan.add(rod);
    s.add(this.fan);
    s.add(decal(m.pool[2], 2.2, 0, -0.4, 0.7));
    // a light above the blades: their shadows sweep the room
    this.light = new THREE.PointLight(0xfff0d0, 14, 14, 1.4);
    this.light.position.set(0, 2.97, -0.4);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(512, 512);
    s.add(this.light);
    const key = new THREE.PointLight(0xffd0b0, 16, 9, 1.3); // from the camera's side, on the two of you
    key.position.set(2.2, 1.7, -1.2);
    s.add(key);
    const rim = new THREE.PointLight(0xff3020, 8, 8, 1.5);
    rim.position.set(-2, 1.2, -2.5);
    s.add(rim);
    this.you = makeWorker(m);
    this.you.root.rotation.y = 1.2; // half turned to us
    s.add(this.you.root);
    this.him.root.position.set(0, 0, 0.35);
    this.him.root.rotation.y = Math.PI;
    this.fallV = 0;
    this.audio.fanLoop(true);
  }
  fanUpdate(dt) {
    const t = this.t, f = this.him, you = this.you;
    this.fan.rotation.y += dt * 14;
    // the camera: low in the corner of the room, looking up at it, creeping closer
    this.cam.position.set(lerp(3.3, 2.5, t / 7), lerp(1.0, 1.2, t / 7), lerp(-0.9, -0.6, t / 7));
    this.cam.lookAt(0, lerp(1.75, 2.0, clamp01(t / 3)), -0.15);
    // held just under the blades, then one hard shove up into them
    const lift = Math.min(ease((t - 0.7) / 2.2), 0.52) + (t > 3.0 ? 0.48 * ease((t - 3.0) / 0.12) : 0);
    if (t < 4.3) {
      // by the throat, then up over its head, into the blades
      this.pose({ mode: 'grab', jaw: 0.5 + lift * 0.4, twitch: this.twitch(0.25) });
      for (const a of f.arms) { a.sh.rotation.x = lerp(-1.5, -2.95, lift); a.el.rotation.x = lerp(-0.4, -0.05, lift); }
      f.neck.rotation.x = lerp(-0.2, -0.9, lift); // watching you go up
      // keep its hands right under the hub
      const h0 = this.handPos(0), h1 = this.handPos(1), hm = h0.add(h1).multiplyScalar(0.5);
      f.root.position.x += this.fanPos.x - hm.x;
      f.root.position.z += this.fanPos.z - hm.z;
      const top = this.handPos(0).add(this.handPos(1)).multiplyScalar(0.5);
      you.root.position.set(top.x, top.y - 0.6, top.z);
      // kicking, clawing at its arms
      you.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 13 + i * 2.5) * 0.55; l.userData.knee.rotation.x = 0.4 + Math.sin(t * 11 + i) * 0.4; });
      you.arms.forEach((a, i) => { a.rotation.set(-1.2 + Math.sin(t * 9 + i * 3) * 0.6, 0, (i ? 1 : -1) * (0.4 + Math.sin(t * 7 + i) * 0.3)); });
      you.head.rotation.set(-0.5 + Math.sin(t * 10) * 0.2, Math.sin(t * 8) * 0.4, 0);
      this.at(0.9, 'up', () => this.audio.growl({ x: 0, y: 2, z: 0 }, 1));
      this.fear = 0.5 + lift * 0.5;
    }
    const hub = V(this.fanPos.x, this.fanPos.y - 0.1, this.fanPos.z);
    const fling = () => { const a = Math.random() * 6.28; return V(Math.cos(a), -0.15 + Math.random() * 0.3, Math.sin(a)); };
    this.at(3.1, 'head', () => {
      // the head goes first
      this.audio.fanHit();
      this.flash = 0.6;
      this.shake = 2;
      you.head.visible = false;
      const st = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8), this.mats.meat, false);
      st.position.y = 0.05;
      you.neck.add(st);
      this.bladeMat.color.setHex(0x8a2a22);
      this.gore.burst(hub, 30, 7, 0.05, [severedHead(this.mats, Math.random)]);
      for (let i = 0; i < 6; i++) this.gore.spray(hub, fling(), 60, 9, 0.4);
    });
    this.at(3.6, 'arms', () => {
      this.audio.fanHit();
      this.audio.crack();
      this.shake = 2;
      you.arms.forEach((a) => (a.visible = false));
      openChest(you, this.mats);
      this.gore.burst(hub, 30, 7, 0.05, [severedArm(this.mats, Math.random), severedArm(this.mats, Math.random)]);
      for (let i = 0; i < 6; i++) this.gore.spray(hub, fling(), 60, 9, 0.4);
    });
    if (t > 3.1 && t < 4.3 && Math.random() < dt * 20) this.gore.spray(hub, fling(), 25, 9, 0.5);
    if (t > 3.1 && t < 6 && Math.random() < dt * 6) this.gore.spray(V((Math.random() - 0.5) * 1.6, 2.75, -0.4 + (Math.random() - 0.5) * 1.6), V(0, -1, 0), 6, 1, 0.2); // it rains off the blades
    if (t >= 4.3) {
      // it lets go of what's left
      this.at(4.3, 'drop', () => this.audio.squelch(1.5));
      this.fallV -= 9.8 * dt;
      you.root.position.y = Math.max(0.16, you.root.position.y + this.fallV * dt);
      if (you.root.position.y <= 0.16) {
        this.at(4.8, 'land', () => { this.audio.squelch(1.2); this.shake = 0.8; this.gore.spray(you.root.position.clone(), V(0, 1, 0), 60, 3, 1); });
        you.root.rotation.x = Math.max(-1.45, you.root.rotation.x - dt * 6);
      }
      // and then it looks at you
      const look = ease((t - 5.0) / 0.3);
      this.pose({ mode: 'walk', jaw: 0.4 + look * 0.5, twitch: t > 5.0 ? this.twitch(0.15) : { x: -0.6, y: 0, z: 0, r: 0 } });
      for (const a of f.arms) a.sh.rotation.x = lerp(-1.2, -0.6, ease((t - 4.3) / 0.6));
      f.root.rotation.y = lerp(Math.PI, Math.atan2(this.cam.position.x - f.root.position.x, this.cam.position.z - f.root.position.z), look);
      this.at(5.0, 'stare', () => { this.audio.jumpscare(0.7); this.flash = 0.4; });
      if (t > 5.1) { const hp = this.headPos(); this.cam.position.lerp(hp, ease((t - 5.1) / 1.4) * 0.55); this.cam.lookAt(hp); this.fear = 1; }
    }
    this.at(6.8, 'black', () => (this.blackout = 1));
  }

  // ---------- the ending: clocking out ----------
  // The lift brings you up into the dispatch bay. The shutter at the far end is jammed half up on the morning.
  // Halfway across, the cage clanks behind you: he came up with you. You run. You get out under the shutter, its
  // brake gives, and it comes down between you. He hits it from the inside until the hook comes through, and then
  // he looks at you through the hole. You walk away into the yard.
  endingBuild() {
    this.dur = 40.5;
    // no dead air: the stop and the gate, the walk across the bay and the stand before the roar run a little fast
    this.rate = (t) => (t < 6 ? 1.15 : t < 9.5 ? 1.5 : t < 17 ? 1.3 : t < 19 ? 1.35 : 1);
    const s = this.scene, m = this.mats, P = themeMaterials(m, 'processing'), rng = makeRng(1998), T = YARD;
    s.background = new THREE.Color(0x1a1612);
    s.fog = new THREE.FogExp2(0x3a2e26, 0.026);
    s.add(new THREE.AmbientLight(0x4a3c30, 0.9));
    const { W, Z0, Z1, H, DW, DH } = T, zi = Z1 + 0.2, zo = Z1 - 0.2;
    // a plane; walls tile their texture in world space (tw x th metres a repeat) so the pieces round a door line up
    const plane = (w, h, mat, x, y, z, ry = 0, rx = 0) => { const p = mesh(new THREE.PlaneGeometry(w, h), mat, false); p.position.set(x, y, z); p.rotation.set(rx, ry, 0); p.receiveShadow = true; s.add(p); return p; };
    const tiled = (mat, w, h, tw, th, x = 0, y = 0, flip = false) => {
      const c = mat.clone();
      if (mat.map) {
        c.map = mat.map.clone();
        c.map.repeat.set(w / tw, h / th);
        c.map.offset.set((flip ? -(x + w / 2) : x - w / 2) / tw, (y - h / 2) / th);
        c.map.needsUpdate = true;
        if (mat.bumpMap === mat.map) c.bumpMap = c.map;
      }
      return c;
    };
    const wall = (mat, w, h, x, y, z, ry, tw = 2, th = 3) => plane(w, h, tiled(mat, w, h, tw, th, x, y, Math.abs(ry) > 3), x, y, z, ry);

    // ---- the bay: the processing floor's tiles and walls, a long way across, low and dirty ----
    const L = Z0 - Z1, zm = (Z0 + Z1) / 2;
    plane(W, L, tiled(P.floors[1], W, L, 2, 2), 0, 0, zm, 0, -Math.PI / 2);
    plane(W, L, tiled(P.ceil, W, L, 2, 2), 0, H, zm, 0, Math.PI / 2);
    wall(P.walls[2], L, H, -W / 2, H / 2, zm, Math.PI / 2);
    wall(P.walls[1], L, H, W / 2, H / 2, zm, -Math.PI / 2);
    // the lift wall behind you, with the lift's mouth in it
    for (const sx of [-1, 1]) wall(P.walls[0], W / 2 - 1.1, H, sx * (W / 4 + 0.55), H / 2, Z0, Math.PI);
    wall(P.walls[0], 2.2, H - 3.2, 0, (H + 3.2) / 2, Z0, Math.PI);
    // the shutter wall in front, inside face
    for (const sx of [-1, 1]) wall(P.walls[3], W / 2 - DW / 2, H, sx * (W / 4 + DW / 4), H / 2, zi, 0);
    wall(P.walls[3], DW, H - DH, 0, (H + DH) / 2, zi, 0);
    // steel: the door's guides and lintel, the roller drum's housing, the hand chain
    const steel = m.darkMetal;
    for (const sx of [-1, 1]) { const gd = mesh(new THREE.BoxGeometry(0.18, DH, 0.5), steel); gd.position.set(sx * (DW / 2 - 0.05), DH / 2, Z1); s.add(gd); }
    const lintel = mesh(new THREE.BoxGeometry(DW + 0.2, 0.14, 0.5), steel); lintel.position.set(0, DH + 0.07, Z1); s.add(lintel);
    const drum = mesh(new THREE.BoxGeometry(DW + 0.6, 0.62, 0.62), m.rust[1]); drum.position.set(0, DH + 0.5, zi + 0.32); s.add(drum);
    this.handChain = new THREE.Group();
    this.handChain.position.set(DW / 2 + 0.25, DH + 0.3, zi + 0.12);
    for (const dx of [0, 0.07]) { const c = mesh(new THREE.CylinderGeometry(0.012, 0.012, 3.2, 4), m.chain, false); c.position.set(dx, -1.6, 0); this.handChain.add(c); }
    s.add(this.handChain);
    // the floor at the door: yellow and black, a drain, the ruts the pallet trucks wore
    const hz = new THREE.MeshLambertMaterial({ map: yardTex('hazard', DW * 2.5, 1) });
    plane(DW, 0.45, hz, 0, 0.006, zi + 0.4, 0, -Math.PI / 2);
    for (const sx of [-1, 1]) { const b = mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.1, 10), new THREE.MeshLambertMaterial({ map: yardTex('hazard', 1, 3) })); b.position.set(sx * (DW / 2 + 0.5), 0.55, zi + 0.45); s.add(b); }
    // signs over the door: the way out, lit green; and the bay's number
    plane(0.9, 0.34, new THREE.MeshBasicMaterial({ map: signTex('EXIT', '#40ff70') }), 0, DH + 1.0, zi + 0.66);
    plane(1.6, 0.6, new THREE.MeshLambertMaterial({ map: signTex('BAY 3', '#ffb030') }), -DW / 2 - 1.4, 3.3, zi + 0.01);
    plane(1.2, 0.8, new THREE.MeshLambertMaterial({ map: yardTex('notice') }), DW / 2 + 1.6, 1.7, zi + 0.01);
    // the clock you punch out on, by the lift; the cards in their rack
    const clock = mesh(new THREE.BoxGeometry(0.42, 0.55, 0.26), new THREE.MeshPhongMaterial({ color: 0x8a8068, shininess: 20 })); clock.position.set(-2.1, 1.45, Z0 - 0.13); s.add(clock);
    const face = plane(0.26, 0.26, new THREE.MeshLambertMaterial({ map: yardTex('clockface') }), -2.1, 1.55, Z0 - 0.27, Math.PI);
    void face;
    plane(0.6, 0.9, new THREE.MeshLambertMaterial({ map: yardTex('cards') }), -2.85, 1.4, Z0 - 0.01, Math.PI);
    // up top: steel beams across, pipes along both walls, lamps on chains
    for (let z = Z0 - 2; z > Z1 + 1; z -= 4) { const b = mesh(new THREE.BoxGeometry(W, 0.35, 0.22), steel); b.position.set(0, H - 0.18, z); s.add(b); }
    for (const [x, ry] of [[-W / 2, Math.PI / 2], [W / 2, -Math.PI / 2]]) { const p = pipeRun(m, L - 1, rng); p.position.set(x, 2.3, zm); p.rotation.y = ry; s.add(p); }
    this.tubes = [];
    for (const z of [-3.5, -9.5, -15.5, -21.5]) {
      const lamp = makeLamp(m, 'tube');
      lamp.position.set(0, H - 0.75, z);
      lamp.rotation.y = Math.PI / 2;
      for (const dx of [-0.5, 0.5]) { const c = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.72, 4), m.chain, false); c.position.set(dx, 0.38, 0); lamp.add(c); }
      s.add(lamp);
      const light = new THREE.PointLight(0xffcf90, 16, 15, 1.3);
      light.position.set(0, H - 0.95, z);
      s.add(light);
      this.tubes.push({ lamp, light, base: 16 });
    }
    // the one by the middle is dying
    const dying = this.tubes[1];
    dying.lamp.userData.bulb.material = dying.lamp.userData.bulb.material.clone();
    // the rail down the left, still carrying what was on it when the line stopped
    const railX = -4.3, railH = 4.4;
    const rail = mesh(new THREE.BoxGeometry(0.08, 0.1, L - 4), steel); rail.position.set(railX, railH, zm - 0.5); s.add(rail);
    for (let z = Z0 - 2; z > Z1 + 3; z -= 2) { const h = mesh(new THREE.BoxGeometry(0.05, H - railH, 0.05), steel); h.position.set(railX, (H + railH) / 2, z); s.add(h); }
    this.swing = [];
    for (let z = Z0 - 3; z > Z1 + 4; z -= 1.55 + rng() * 0.5) {
      const c = makeCarcass(m, rng, rng() < 0.18);
      c.position.set(railX, railH - 0.05, z);
      c.rotation.y = rng() * Math.PI;
      s.add(c);
      this.swing.push({ o: c, f: 0.6 + rng() * 0.5, p: rng() * 6, a: 0.02 + rng() * 0.03 });
    }
    // the right-hand wall: the end of the packing line, a table, crates waiting for a lorry that won't come
    const belt = conveyor(m, rng, 9); belt.position.set(W / 2 - 1.1, 0, -9.5); belt.rotation.y = Math.PI / 2; s.add(belt);
    const pt = packTable(m, rng); pt.position.set(W / 2 - 1.1, 0, -16.2); pt.rotation.y = Math.PI / 2; s.add(pt);
    const bt = butcherTable(m, rng); bt.position.set(-2.4, 0, -12.5); bt.rotation.y = Math.PI / 2; s.add(bt);
    for (const [x, z] of [[-2.0, -14.2], [2.2, -5.2], [-1.9, -20.8]]) { const bk = bucket(m); bk.position.set(x, 0, z); s.add(bk); }
    const fl = forklift(m, rng); fl.position.set(-4.4, 0, -22.4); fl.rotation.y = 0.7; s.add(fl);
    for (const [x, z, r] of [[4.6, -21.6, 0.1], [5.9, -21.9, -0.06], [5.4, -23.6, 0.2], [-5.6, -18.2, 0.05], [5.6, -3.2, 0.3]]) { const c = crateStack(m, rng); c.position.set(x, 0, z); c.rotation.y = r; s.add(c); }
    // where things were dragged to the door, and what they left
    for (let z = Z0 - 2.5; z > Z1 + 2; z -= 2.6) s.add(decal(m.drag, 2.8, 0.35 + Math.sin(z) * 0.3, z, Math.PI / 2 + Math.sin(z * 1.7) * 0.15, 0.012));
    for (const [x, z, sz] of [[-3.6, -7.6, 1.8], [-4.6, -14.6, 2.2], [1.4, -18.5, 1.2], [4.2, -10.2, 1.4], [-0.8, -24.2, 1.0]]) s.add(decal(m.pool[(rng() * 3) | 0], sz, x, z, rng() * 6, 0.013));
    for (let i = 0; i < 7; i++) s.add(decal(m.splat[(rng() * m.splat.length) | 0], 0.5 + rng() * 0.6, (rng() - 0.5) * 9, Z0 - 2 - rng() * 20, rng() * 6, 0.014));
    const drain = plane(0.6, 0.6, new THREE.MeshLambertMaterial({ map: yardTex('grate') }), 1.6, 0.008, -13.6, 0, -Math.PI / 2);
    void drain;

    // ---- the lift and its shaft: you start in the cage, in the dark, coming up ----
    this.lift = makeLift(m, 0);
    s.add(this.lift);
    this.bars = this.lift.userData.bars;
    const shaftM = P.walls[0];
    wall(shaftM, 2.2, 6, -1.05, 3, 0.05, Math.PI / 2);
    wall(shaftM, 2.2, 6, 1.05, 3, 0.05, -Math.PI / 2);
    wall(shaftM, 2.1, 6, 0, 3, 1.1, Math.PI);
    // the shaft's front wall slides down past the gate on the way up, until the bay's floor comes level
    this.shaftFront = plane(2.4, 20, tiled(shaftM, 2.4, 20, 2, 3), 0, 10, -1.06);
    this.pass = new THREE.PointLight(0xffc890, 0, 5, 1.5);
    s.add(this.pass);
    this.liftLamp = new THREE.PointLight(0xffd8b0, 2.5, 4, 1.5);
    this.liftLamp.position.set(0, 2.6, 0.3);
    s.add(this.liftLamp);

    // ---- the outside wall: precast panels, the dock doors, the canopy, the lamp over the door ----
    const FW = 80, FH = 11, facade = new THREE.MeshLambertMaterial({ map: yardTex('facade') });
    for (const sx of [-1, 1]) wall(facade, FW / 2 - DW / 2, FH, sx * (FW / 4 + DW / 4), FH / 2, zo, Math.PI, 4, 4);
    wall(facade, DW, FH - DH, 0, (FH + DH) / 2, zo, Math.PI, 4, 4);
    const plinth = new THREE.MeshLambertMaterial({ color: 0x4a4744 });
    for (const sx of [-1, 1]) plane(FW / 2 - DW / 2 - 0.2, 0.7, plinth, sx * (FW / 4 + DW / 4 + 0.1), 0.35, zo - 0.01, Math.PI);
    const canopy = mesh(new THREE.BoxGeometry(DW + 2.4, 0.16, 1.8), steel); canopy.position.set(0, DH + 0.9, zo - 0.9); s.add(canopy);
    for (const sx of [-1, 1]) { const rod = mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.1, 4), steel, false); rod.position.set(sx * (DW / 2 + 0.8), DH + 1.65, zo - 0.9); rod.rotation.x = 0.95; s.add(rod); }
    for (const sx of [-1, 1]) { const bump = mesh(new THREE.BoxGeometry(0.3, 0.55, 0.28), new THREE.MeshLambertMaterial({ color: 0x141414 })); bump.position.set(sx * (DW / 2 + 0.35), 0.75, zo - 0.14); s.add(bump); }
    for (const sx of [-1, 1]) { const b = mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.15, 10), new THREE.MeshLambertMaterial({ map: yardTex('hazard', 1, 3) })); b.position.set(sx * (DW / 2 + 1.0), 0.57, zo - 1.0); s.add(b); }
    plane(1.3, 1.3, new THREE.MeshLambertMaterial({ map: yardTex('number', 3) }), -DW / 2 - 1.5, 3.4, zo - 0.02, Math.PI);
    const pack = mesh(new THREE.BoxGeometry(0.5, 0.3, 0.25), steel); pack.position.set(0, DH + 1.35, zo - 0.14); s.add(pack);
    const packLens = plane(0.4, 0.18, new THREE.MeshBasicMaterial({ color: 0xffc070 }), 0, DH + 1.27, zo - 0.27, Math.PI, 0.5);
    void packLens;
    this.wallPack = new THREE.PointLight(0xffb060, 7, 12, 1.4);
    this.wallPack.position.set(0, DH + 1.0, zo - 0.6);
    s.add(this.wallPack);
    // the next docks along, shut, one with a trailer still backed on to it
    const shutM = new THREE.MeshPhongMaterial({ map: yardTex('shutter'), shininess: 30, specular: 0x333333, side: THREE.DoubleSide });
    for (const [x, n] of [[-10, 2], [10, 4]]) {
      plane(DW - 0.4, DH - 0.1, shutM, x, (DH - 0.1) / 2, zo - 0.02, Math.PI);
      plane(1.1, 1.1, new THREE.MeshLambertMaterial({ map: yardTex('number', n) }), x - DW / 2 - 0.9, 3.4, zo - 0.02, Math.PI);
      for (const sx of [-1, 1]) { const bump = mesh(new THREE.BoxGeometry(0.3, 0.55, 0.28), plinth); bump.position.set(x + sx * (DW / 2 + 0.1), 0.75, zo - 0.14); s.add(bump); }
    }
    s.add(trailer(m, 10, zo - 6.2));

    // ---- the shutter: corrugated, on a roll. It dents. ----
    this.shut = new Shutter(shutM, DW - 0.1, DH + 0.2);
    this.shutBottom = 3.35;
    this.shut.mesh.position.set(0, this.shutBottom + this.shut.h / 2, Z1);
    this.shut.mesh.rotation.y = Math.PI; // its face to the yard
    s.add(this.shut.mesh);
    // what the hook does to it
    this.hook = new THREE.Group();
    const hookArc = mesh(new THREE.TorusGeometry(0.2, 0.032, 6, 14, Math.PI * 1.25), m.darkMetal, false);
    hookArc.rotation.y = Math.PI / 2;
    this.hook.add(hookArc);
    const tip = mesh(new THREE.ConeGeometry(0.032, 0.13, 6), m.steel, false); tip.position.set(0, 0.04, -0.2); tip.rotation.x = -Math.PI / 2 - 0.5; this.hook.add(tip);
    this.hook.visible = false;
    s.add(this.hook);
    this.hole = plane(0.5, 0.42, new THREE.MeshBasicMaterial({ map: yardTex('hole'), transparent: true, depthWrite: false, side: THREE.DoubleSide }), 0, 0, 0, Math.PI);
    this.hole.visible = false;

    // ---- the yard: asphalt, the dock lane, lamp posts still on, the fence, trees, the morning ----
    const asphalt = new THREE.MeshLambertMaterial({ map: yardTex('asphalt') });
    plane(160, 140, tiled(asphalt, 160, 140, 4, 4), 0, -0.004, zo - 70, 0, -Math.PI / 2);
    const apron = new THREE.MeshLambertMaterial({ map: yardTex('slab') });
    plane(FW, 7, tiled(apron, FW, 7, 4, 4), 0, -0.002, zo - 3.5, 0, -Math.PI / 2);
    const paint = new THREE.MeshLambertMaterial({ color: 0xc8a020 });
    for (const sx of [-1, 1]) plane(0.14, 22, paint, sx * 3.1, 0.004, zo - 7 - 11, 0, -Math.PI / 2);
    for (let i = 0; i < 6; i++) plane(0.12, 5, new THREE.MeshLambertMaterial({ color: 0xb8b6ae }), -24 + i * 3, 0.004, zo - 22, 0, -Math.PI / 2);
    // a skip, pallets, a car somebody never came back out for
    const skip = mesh(new THREE.BoxGeometry(3.6, 1.5, 1.8), new THREE.MeshLambertMaterial({ color: 0x2e4a34 })); skip.position.set(-8, 0.75, -31.5); skip.rotation.y = 0.08; s.add(skip);
    const lid = mesh(new THREE.BoxGeometry(3.7, 0.06, 1.0), new THREE.MeshLambertMaterial({ color: 0x24382a })); lid.position.set(-8, 1.75, -31.1); lid.rotation.x = -0.9; s.add(lid);
    for (const [x, z, r] of [[7.2, -32.5, 0.2], [8.6, -33.6, -0.3]]) { const c = crateStack(m, rng); c.position.set(x, 0, z); c.rotation.y = r; s.add(c); }
    // your car, where you left it last night: nose out toward the gate
    this.car = car(0x5a2420);
    this.car.position.set(-6.5, 0, -40); this.car.rotation.y = -Math.PI / 2;
    s.add(this.car);
    this.headL = [-1, 1].map((sd) => { const l = new THREE.SpotLight(0xfff0d0, 0, 40, 0.45, 0.6, 1.2); l.position.set(-6.5 + sd * 0.62, 0.7, -42.3); l.target.position.set(-6.5 + sd * 0.8, 0, -60); s.add(l, l.target); return l; });
    this.exhaust = [];
    this.carLamp = new THREE.PointLight(0xffd0a0, 26, 16, 1.4); this.carLamp.position.set(-3.8, 4.6, -38.5); s.add(this.carLamp); // the last yard lamp still on over it
    const sodium = new THREE.MeshBasicMaterial({ color: 0xffb060 });
    this.posts = [];
    for (const [x, z] of [[-8, -38], [8.5, -49], [-8, -62]]) {
      const pole = mesh(new THREE.CylinderGeometry(0.08, 0.12, 8, 8), steel); pole.position.set(x, 4, z); s.add(pole);
      const arm = mesh(new THREE.BoxGeometry(1.4, 0.08, 0.1), steel); arm.position.set(x - Math.sign(x) * 0.65, 7.95, z); s.add(arm);
      const head = mesh(new THREE.BoxGeometry(0.6, 0.14, 0.3), steel); head.position.set(x - Math.sign(x) * 1.3, 7.9, z); s.add(head);
      const lens = mesh(new THREE.BoxGeometry(0.5, 0.02, 0.22), sodium, false); lens.position.set(x - Math.sign(x) * 1.3, 7.82, z); s.add(lens);
      this.posts.push(lens);
    }
    const fenceZ = -74, chain = new THREE.MeshLambertMaterial({ map: yardTex('chainlink', 1, 1), transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, depthWrite: false });
    for (const [x0, x1] of [[-60, -5], [5, 60]]) {
      const w = x1 - x0, f = plane(w, 2.6, chain, (x0 + x1) / 2, 1.3, fenceZ);
      f.material = chain.clone(); f.material.map = chain.map.clone(); f.material.map.repeat.set(w / 0.6, 2.6 / 0.6); f.material.map.needsUpdate = true;
      for (let x = x0; x <= x1; x += 3) { const p = mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.9, 5), steel, false); p.position.set(x, 1.45, fenceZ); s.add(p); }
      for (const y of [2.75, 2.88]) { const wire = mesh(new THREE.BoxGeometry(w, 0.015, 0.015), steel, false); wire.position.set((x0 + x1) / 2, y, fenceZ); s.add(wire); }
    }
    const leaf = plane(5, 2.6, chain, -5 - 0.6, 1.3, fenceZ - 2.4, 1.35); // the gate, left open
    void leaf;
    const trees = new THREE.MeshBasicMaterial({ map: yardTex('treeline'), transparent: true, alphaTest: 0.1 });
    plane(520, 46, trees, 0, 12, -170);
    for (const [x, z, w, h] of [[-46, -120, 14, 9], [-34, -128, 8, 16], [38, -116, 20, 7], [55, -130, 9, 12]]) { const b = mesh(new THREE.BoxGeometry(w, h, 8), new THREE.MeshLambertMaterial({ color: 0x3a3c44 })); b.position.set(x, h / 2, z); s.add(b); }
    const chimney = mesh(new THREE.CylinderGeometry(0.8, 1.1, 30, 10), new THREE.MeshLambertMaterial({ color: 0x40383a })); chimney.position.set(-30, 15, -150); s.add(chimney);
    // the sky: night going out of it at the top, the sun just over the trees
    const sky = mesh(new THREE.SphereGeometry(240, 32, 16), new THREE.MeshBasicMaterial({ map: yardTex('sky'), side: THREE.BackSide, fog: false, depthWrite: false }), false);
    sky.position.set(0, 0, Z1);
    sky.renderOrder = -1;
    s.add(sky);
    const sunDir = V(-0.32, 0.12, -1).normalize();
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0xffe0b0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sunDisc.position.copy(sunDir).multiplyScalar(220).add(V(0, 0, Z1));
    this.sunDisc.scale.setScalar(70);
    s.add(this.sunDisc);
    const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0xfff4dc, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    disc.position.copy(this.sunDisc.position);
    disc.scale.setScalar(13);
    s.add(disc);
    this.sun = new THREE.DirectionalLight(0xffc89a, 0);
    this.sun.position.copy(sunDir).multiplyScalar(60).add(V(0, 0, Z1));
    this.sun.target.position.set(0, 0, Z1);
    s.add(this.sun, this.sun.target);
    this.dayFill = new THREE.HemisphereLight(0xa8b8d8, 0x3a3228, 0);
    s.add(this.dayFill);
    // the morning coming in under the shutter: a spot across the floor, a shaft of it in the dust
    this.doorSpot = new THREE.SpotLight(0xffe0bc, 0, 30, 0.75, 0.7, 1);
    this.doorSpot.position.set(0, 2.2, Z1 - 3);
    this.doorSpot.target.position.set(0, 0, Z1 + 10);
    s.add(this.doorSpot, this.doorSpot.target);
    const shaftGeo = new THREE.BoxGeometry(1, 1, 1);
    const sp = shaftGeo.attributes.position, cols = [];
    for (let i = 0; i < sp.count; i++) {
      const k = sp.getZ(i) + 0.5, v = sp.getY(i) + 0.5; // k: 0 at the door, 1 deep in the bay
      sp.setXYZ(i, sp.getX(i) * lerp(DW - 0.3, DW + 1.6, k), lerp(lerp(0.05, this.shutBottom - 0.1, v), lerp(0, 0.5, v), k), Z1 + 0.25 + k * 11);
      cols.push(1 - k, 1 - k, 1 - k);
    }
    shaftGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.beam = new THREE.Mesh(shaftGeo, new THREE.MeshBasicMaterial({ color: 0xffe2c0, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    s.add(this.beam);
    // looking out from the dark, the doorway burns
    this.glare = plane(DW - 0.2, 3.4, new THREE.MeshBasicMaterial({ color: 0xffd8b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), 0, 1.7, Z1 - 0.35);
    const N = 260, dp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { dp[i * 3] = (rng() - 0.5) * DW; dp[i * 3 + 1] = rng() * 3.2; dp[i * 3 + 2] = Z1 + 0.4 + rng() * 10; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.motes = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffe8c8, size: 0.035, map: softTex(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.add(this.motes);
    // dust and rust knocked off the shutter
    const puffTex = softTex();
    this.puffs = [];
    for (let i = 0; i < 46; i++) {
      const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0x9a9088, transparent: true, opacity: 0, depthWrite: false }));
      p.visible = false;
      s.add(p);
      this.puffs.push({ s: p, v: V(0, 0, 0), life: 1 });
    }

    // him: in the lift behind you, when you look back
    this.him.root.position.set(0, 0, 0.35);
    this.him.root.rotation.y = Math.PI;
    this.him.root.visible = false;
    this.audio.liftMotor(true);
  }
  // kick dust off the shutter: n puffs from a line across it at height y
  puff(n, y, out = 1, spread = YARD.DW) {
    for (let i = 0; i < n; i++) {
      const p = this.puffs.find((q) => q.life >= 1);
      if (!p) return;
      p.life = 0;
      p.s.visible = true;
      p.s.position.set((Math.random() - 0.5) * spread, y, YARD.Z1 - 0.15 * out);
      p.v.set((Math.random() - 0.5) * 0.8, (Math.random() - 0.2) * 0.6, -(0.4 + Math.random() * 1.4) * out);
      p.size = 0.3 + Math.random() * 0.5;
      p.rate = 0.4 + Math.random() * 0.4;
    }
  }
  // he hits the shutter from inside: it bulges out at (x, y), keeps some of the dent, and everything rattles
  bang(x, y, depth, loud = 1) {
    this.shut.dent(x, y, depth, 0.22 + depth, 0.2 * loud);
    this.audio.thud(V(x, y, YARD.Z1), 1.2 * loud);
    this.audio.clank(V(x, y, YARD.Z1), 0.9 * loud);
    setTimeout(() => this.audio.clank(V(x, 3, YARD.Z1), 0.3), 120); // the rest of it rattling in its guides
    this.shake = Math.max(this.shake, 0.3 * loud);
    this.puff(10, this.shut.mesh.position.y + this.shut.h / 2 - 0.1, 1);
    this.puff(4, 0.05, 1);
    for (const sw of this.swing) sw.a += 0.01 * loud;
  }
  endingUpdate(dt) {
    const t = this.t, cam = this.cam, Z1 = YARD.Z1, ZOUT = -27; // ZOUT: where the run has you at 21.1, just out
    // the camera: where you are, and a yaw/pitch to look along (yaw 0 is out toward the door, PI back at the lift)
    const look = (yaw, pitch = 0) => cam.lookAt(cam.position.x - Math.sin(yaw) * 10, cam.position.y + pitch * 10, cam.position.z - Math.cos(yaw) * 10);
    const stride = (z, amp, rate, sway = 1) => cam.position.set(Math.sin(t * rate) * amp * sway, 1.62 + Math.abs(Math.sin(t * rate)) * amp * 1.3, z);

    // the bay's own life: carcasses turning on the rail, the dying tube, dust in the light
    for (const sw of this.swing) { sw.o.rotation.z = Math.sin(t * sw.f + sw.p) * sw.a; sw.o.rotation.x = Math.cos(t * sw.f * 0.7 + sw.p) * sw.a * 0.6; sw.a = Math.max(0.02, sw.a - dt * 0.004); }
    const d = this.tubes[1], on = Math.sin(t * 13) + Math.sin(t * 4.1 + 1) + Math.sin(t * 29) > -0.4;
    d.light.intensity = on ? d.base : 0.3;
    d.lamp.userData.bulb.material.color.setHex(on ? 0xffffff : 0x333333);
    const mp = this.motes.geometry.attributes.position;
    for (let i = 0; i < mp.count; i++) { mp.setY(i, (mp.getY(i) + dt * (0.03 + 0.02 * Math.sin(i))) % 3.2); mp.setX(i, mp.getX(i) + Math.sin(t * 0.6 + i) * dt * 0.05); }
    mp.needsUpdate = true;
    for (const p of this.puffs) {
      if (p.life >= 1) continue;
      p.life = Math.min(1, p.life + dt * p.rate);
      p.v.multiplyScalar(1 - dt * 1.6);
      p.v.y -= dt * 0.05;
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(p.size * (1 + p.life * 2.5));
      p.s.material.opacity = Math.sin(p.life * Math.PI) * 0.5;
      if (p.life >= 1) p.s.visible = false;
    }
    this.shut.update(dt);
    this.handChain.rotation.x = Math.sin(t * 1.3) * 0.02 + (this.chainKick || 0) * Math.sin(t * 9);
    this.chainKick = Math.max(0, (this.chainKick || 0) - dt * 0.25);

    // the morning: brighter as you get to it, and you get out into it
    const outside = clamp01((-cam.position.z + Z1 - 0.2) / 1.5);
    const dawn = clamp01((t - 6.6) / 2.5);
    this.sun.intensity = dawn * (1.2 + outside * 1.6);
    this.dayFill.intensity = dawn * (0.5 + outside * 3.2);
    this.doorSpot.intensity = dawn * 60 * (this.shutBottom / 3.35);
    this.beam.material.opacity = dawn * 0.075 * (this.shutBottom / 3.35) * (1 - outside);
    this.motes.material.opacity = dawn * 0.8 * (this.shutBottom / 3.35);
    this.scene.fog.color.setHex(0x3a2e26).lerp(FOG_OUT, outside);
    this.scene.fog.density = lerp(0.026, 0.0075, outside);
    this.glare.material.opacity = dawn * 0.32 * (this.shutBottom / 3.35) * clamp01((cam.position.z - Z1 - 2) / 6);
    this.scene.background.copy(this.scene.fog.color);
    this.wallPack.intensity = 7 * (1 - clamp01((t - 31) / 0.1) * 0.9);
    if (t > 31) for (const l of this.posts) l.material.color.setHex(0x553a20); // the timer: the yard lights go off on the morning

    // ---- him ----
    const him = this.him.root, H0 = 0.35, RUN0 = 19.4, SPEED = 5.4, STOP = Z1 + 1.3; // STOP: his reach is the shutter's
    if (t >= 16) {
      him.visible = true;
      let z = H0, mode = 'walk', speed = 0, jaw = 0.12, tw = { x: 0, y: 0, z: 0, r: 0 };
      if (t < 18.6) { tw = { x: -0.25, y: 0, z: 0.25, r: 0.1 }; } // in the cage, head on one side, looking at your back
      else if (t < RUN0) { const k = (t - 18.6) / (RUN0 - 18.6); z = H0 - k * 1.2; speed = 1.4; jaw = 0.2 + ease((t - 16.6) / 0.4) * 0.8; tw = { x: -0.3, y: 0, z: 0.25 * (1 - k), r: 0 }; } // out of it, and the roar
      else { const tt = t - RUN0; z = H0 - 1.2 - (tt < 0.7 ? tt * tt * SPEED / 1.4 : SPEED * 0.35 + (tt - 0.7) * SPEED); mode = 'chase'; speed = 5.5; jaw = 0.8; }
      if (z <= STOP) { z = STOP; this.hitDoor ??= t; }
      if (this.hitDoor !== undefined) { mode = 'attack'; speed = 0; jaw = 1; }
      this.gait = (this.gait || 0) + (him.position.z - z) * 2.6; // the stride follows the ground covered
      him.position.z = z;
      if (this.slammed || this.shutBottom < 0.7) him.visible = false; // behind the shutter now
      const sw = this.hitDoor !== undefined ? clamp01(Math.sin((t - this.hitDoor) * 3.2) * 1.2) : 0;
      poseForeman(this.him, { gait: this.gait, speed, mode, t, swing: sw, jawOpen: jaw, twitch: tw });
      if (t > 18.6 && t < 24) for (let i = 0; i < 12; i++) this.at(RUN0 + 0.08 + i * 0.37, 'hs' + i, () => this.audio.thud(this.headPos(), 0.5)); // his feet on the concrete
    } else this.pose({ mode: 'walk' });

    // ---- you ----
    if (t < 6) {
      // the ride up: the cage shaking, the shaft wall sliding down past the gate, a floor's light at a time
      stride(0.45, 0, 0);
      cam.position.x += Math.sin(t * 31) * 0.01; cam.position.y += Math.sin(t * 23) * 0.012;
      look(0, -0.03);
      const k = clamp01(t / 6);
      this.shaftFront.position.y = 2.6 * Math.pow(1 - k, 1.6) * 7 - 10; // its top edge: the bay's floor, coming level
      const floorK = (t * 1.6) % 1;
      this.pass.position.set(0, 4 - floorK * 6, -1.25);
      this.pass.intensity = t < 5 ? 6 * Math.sin(floorK * Math.PI) : 0;
      this.at(0.2, 'motor', () => this.audio.liftMotor(true));
      for (let i = 0; i < 9; i++) this.at(i * 0.62, 'f' + i, () => this.audio.click({ x: 0, y: 2, z: 0 }));
      this.fear = 0.25;
    } else if (t < 9.5) {
      // it stops; the gate goes up on the bay, and the morning at the far end of it
      this.shaftFront.position.y = -10;
      this.at(6, 'stop', () => { this.audio.liftMotor(false); this.audio.clank({ x: 0, y: 1, z: -1 }, 1); this.shake = 0.25; });
      this.at(6.6, 'gate', () => this.audio.gateSlide({ x: 0, y: 1, z: -1 }));
      const k = ease((t - 6.6) / 2.2);
      this.bars.position.y = k * 2.7;
      this.pass.intensity = 0;
      stride(0.45, 0, 0);
      look(0, -0.02 + k * 0.02);
      this.fear = 0.15;
    } else if (t < 17) {
      // out across the bay toward it, slowly. Halfway, the shutter slips a little on its chain.
      const k = (t - 9.5) / 7.5;
      stride(lerp(0.2, -10.5, k), 0.025, 3.6);
      look(Math.sin(t * 0.45) * 0.14, -0.01 + (t > 13 && t < 14.4 ? Math.sin((t - 13) / 1.4 * Math.PI) * 0.08 : 0)); // eyes up to the shutter when it slips
      this.at(13, 'slip', () => { this.audio.chainRattle({ x: 2.9, y: 4, z: Z1 }); this.audio.clank({ x: 0, y: 4, z: Z1 }, 0.8); this.chainKick = 0.15; this.puff(6, 4.1, -0.6); });
      if (t > 13) this.shutBottom = lerp(3.35, 2.95, ease((t - 13) / 0.25)); // it drops a hand's width and catches
      this.shut.mesh.position.y = this.shutBottom + this.shut.h / 2;
      this.at(16.3, 'cage', () => { this.audio.gateRattle({ x: 0, y: 1.5, z: 0 }); });
      this.liftLamp.intensity = t > 16.3 ? 2.5 * (Math.sin(t * 23) > 0 ? 1 : 0.1) : 2.5;
      this.fear = t > 16.3 ? 0.3 : 0;
    } else if (t < 19.6) {
      // you stop dead. Behind you the cage door goes, and he roars. You don't look
      stride(-10.5, 0, 0);
      look(Math.sin(t * 0.45) * 0.05, -0.01);
      this.at(17.9, 'click', () => this.audio.click(this.headPos()));
      this.at(19.0, 'roar', () => { this.audio.roar(this.headPos()); this.shake = 0.2; });
      this.liftLamp.intensity = 1.6;
      this.fear = 0.35 + clamp01(t - 18.6) * 0.15;
    } else if (t < 23.8) {
      // run. Once, a look back: he's close
      const tt = t - 19.6, z = -10.5 - (tt < 0.4 ? tt * tt * 6 : 0.96 + (tt - 0.4) * 4.6);
      stride(Math.max(z, ZOUT), 0.045, 10);
      // straight ahead, at the light, but once a look back over your shoulder: he's coming, and close
      const back = ease(clamp01((t - 21.05) / 0.3)) * (1 - ease(clamp01((t - 21.95) / 0.3)));
      look(Math.sin(t * 5) * 0.03 + back * (Math.PI - 0.35), -0.02 + back * 0.02);
      for (let i = 0; i < 12; i++) this.at(19.8 + i * 0.33, 'st' + i, () => this.audio.step('run'));
      for (let i = 0; i < 10; i++) this.at(19.6 + i * 0.4, 'hb' + i, () => this.audio.heartbeat(1, true));
      this.at(20.2, 'gasp', () => this.audio.gasp());
      this.at(21.4, 'roar2', () => { this.audio.roar(this.headPos()); this.shake = 0.25; }); // as you see him
      this.fear = 0.6;
    } else if (t < 25.6) {
      // out under it into the cold; you turn, and it comes down between you
      const tt = t - 23.8, z = ZOUT - 3 * (1 - Math.exp(-tt * 1.8));
      stride(z, 0.04 * (1 - clamp01(tt)), 9.5);
      look(0, -0.02); // it comes down behind you
      this.at(23.85, 'snap', () => { this.audio.ropeSnap(); this.audio.chainRattle({ x: 2.9, y: 4, z: Z1 }); this.chainKick = 0.5; });
      if (t > 23.85 && !this.slammed) {
        const ft = t - 23.85;
        this.shutBottom = Math.max(0, 2.95 - 14 * ft * ft); // the brake gone: it drops
        this.shut.mesh.position.y = this.shutBottom + this.shut.h / 2;
        if (this.shutBottom === 0) {
          this.slammed = true;
          this.audio.thud({ x: 0, y: 0.2, z: Z1 }, 1.4); this.audio.clank({ x: 0, y: 0.3, z: Z1 }, 1.2); this.audio.shutter({ x: 0, y: 2, z: Z1 });
          this.shake = 0.5; this.puff(18, 0.08, 1); this.puff(10, this.shut.h - 0.1, 1);
        }
      }
      this.at(24.9, 'bang1', () => this.bang(0.15, 1.6, 0.2, 1.3));
      this.fear = 0.45;
    } else if (t < 29.6) {
      // and you run for the car
      const k = (t - 25.6) / 4, from = V(0, 1.62, ZOUT - 3), door = V(-5.4, 1.62, -39.2);
      const p = V().lerpVectors(from, door, ease(k * 0.9 + 0.1 * k));
      cam.position.set(p.x + Math.sin(t * 10) * 0.04, 1.62 + Math.abs(Math.sin(t * 10)) * 0.05 * (1 - ease((k - 0.85) / 0.15)), p.z);
      const turn = ease((t - 25.6) / 0.8);
      const toCar = Math.atan2(-(door.x - from.x), -(door.z - from.z));
      look(lerp(0, toCar, turn), -0.04);
      for (let i = 0; i < 10; i++) this.at(25.8 + i * 0.36, 'cs' + i, () => this.audio.step('run'));
      this.at(26.2, 'bang2', () => this.bang(-0.7, 2.1, 0.16));
      this.at(27.6, 'bang3', () => { this.bang(0.6, 1.1, 0.13); this.audio.roar({ x: 0, y: 2, z: Z1 + 0.6 }); });
      this.at(29.3, 'handle', () => this.audio.lockerOpen({ x: -5.6, y: 1, z: -39.6 }, false));
      this.fear = 0.4;
    } else {
      // the door shuts; the engine turns over; the lights come on; and the car pulls away out of the yard.
      // Seen from outside now: from across the yard, then from the shutter, his hook through it, watching you go
      const c = this.car, ct = t - 31.4;
      this.at(29.65, 'door', () => { this.audio.lockerClose({ x: -6, y: 1, z: -40 }); this.shake = 0.1; });
      this.at(30.3, 'start', () => { this.audio.engine(true); this.audio.rev(0.6); });
      this.at(30.9, 'idle', () => this.audio.rev(0.1));
      if (t > 30.5) { c.userData.head.emissiveIntensity = 3; c.userData.tail.emissiveIntensity = 2; this.headL.forEach((l) => (l.intensity = 30)); }
      const d = ct > 0 ? 0.5 * 2.6 * ct * ct : 0; // pulling away, faster and faster
      // out of the space and over into the middle of the lane, so it goes out through the open gate (x -5 .. 5)
      const lane = (dd) => -6.5 + 6.5 * ease((dd - 3) / 18);
      c.position.set(lane(d), 0, -40 - d);
      const fx = lane(d + 0.5) - lane(d), fz = -0.5, fl = Math.hypot(fx, fz), fw = V(fx / fl, 0, fz / fl), rt = V(-fw.z, 0, fw.x);
      c.rotation.y = Math.atan2(fw.z, -fw.x);
      for (const w of c.userData.wheels) w.rotation.z = -d / 0.32; // (the wheels spin about the axle)
      this.headL.forEach((l, i) => { const sd = i ? 1 : -1; l.position.copy(c.position).addScaledVector(fw, 2.3).addScaledVector(rt, sd * 0.62).setY(0.7); l.target.position.copy(c.position).addScaledVector(fw, 20).addScaledVector(rt, sd * 0.8).setY(0); });
      if (ct > 0) this.audio.rev(Math.min(1, 0.3 + ct * 0.25));
      if (t > 30.3 && Math.random() < dt * 8) { // exhaust
        const sp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0x8a8580, transparent: true, opacity: 0.35, depthWrite: false }));
        sp.position.copy(c.position).add(V(0, 0.25, 0)).addScaledVector(fw, -2.35).addScaledVector(rt, -0.5); this.scene.add(sp); this.exhaust.push({ o: sp, life: 0 });
      }
      for (const e of this.exhaust) { e.life += dt; e.o.scale.setScalar(1 + e.life * 3); e.o.position.y += dt * 0.25; e.o.material.opacity = Math.max(0, 0.35 - e.life * 0.25); }
      if (t < 33.6) { // close on it, side on: the door, the engine catching, the lights; then, in one move, it pulls away and the camera turns to follow
        const k = ease((t - 29.6) / 4);
        cam.position.set(lerp(-2.2, -3.3, k), lerp(1.2, 1.55, k), lerp(-37.6, -36.5, k)); cam.lookAt(c.position.x, lerp(0.85, 0.9, k), c.position.z - lerp(0.4, 1, k));
        cam.fov = 50; cam.updateProjectionMatrix();
      } else if (t < 35.3) { // back at the shutter: his hook comes through it
        cam.position.set(-1.3, 1.45, -30.8); cam.lookAt(0.3, 1.45, Z1);
        cam.fov = 55; cam.updateProjectionMatrix();
        this.at(33.75, 'hook', () => { this.bang(HOLE.x, HOLE.y, 0.22, 1.4); this.hook.visible = true; this.hole.visible = true; this.audio.boltHit({ x: HOLE.x, y: HOLE.y, z: Z1 }); this.audio.roar({ x: 0, y: 2, z: Z1 + 0.5 }); this.shake = 0.3; });
        const hz = Z1 - this.shut.heightAt(HOLE.x, HOLE.y);
        this.hole.position.set(HOLE.x, HOLE.y, hz - 0.012);
        this.hook.position.set(HOLE.x + 0.02, HOLE.y, hz - 0.12 - Math.sin(Math.min(1, (t - 33.75) * 3)) * 0.14);
        this.hook.rotation.x = Math.sin(t * 5) * 0.1;
      } else { // from high over the yard: the car out through the gate and away down the road, into the morning
        const k = ease((t - 35.3) / 5);
        cam.position.set(lerp(12, 8, k), lerp(14, 23, k), lerp(-48, -76, k));
        cam.lookAt(c.position.x, 0, c.position.z - 6);
        cam.fov = 50; cam.updateProjectionMatrix();
      }
      this.at(31.0, 'dawn', () => this.audio.dawn());
      this.flash = Math.max(this.flash, clamp01((t - 38.4) / 2.0)); // into the white
      this.fear = Math.max(0, 0.3 - (t - 29.6) * 0.1);
    }
    if (t >= 6 && t < 9.5) this.shaftFront.position.y = -10;
    const fwd = V(0, 0, -1).applyQuaternion(cam.quaternion);
    this.audio.listen(cam.position, fwd);
  }

  // ---------- 12: smoke break (third person) ----------
  // Roped down on a steel table. He hits you between the legs, again and again, then puts a lighter to it. In the
  // corner of the room he takes out a cigarette, lights it, and smokes it while you burn.
  smokeBuild() {
    this.dur = 20.6;
    const s = this.scene, m = this.mats;
    this.stage(10, 10, V(0.3, 0, 0.5), V(0, 0.9, 0)).intensity = 45; // (softer: full, it burns a white spot onto you)
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a8c8e, roughness: 0.35, metalness: 0.8 });
    const top = mesh(new THREE.BoxGeometry(2.1, 0.08, 0.8), steel); top.position.set(0, 0.86, 0); s.add(top);
    for (const [x, z] of [[-0.95, -0.33], [0.95, -0.33], [-0.95, 0.33], [0.95, 0.33]]) { const l = mesh(new THREE.BoxGeometry(0.06, 0.82, 0.06), steel); l.position.set(x, 0.41, z); s.add(l); }
    this.you = makeWorker(m);
    const you = this.you;
    you.root.position.set(0.1, 0.99, 0);
    orient(you.root, V(-1, 0, 0), V(0, 1, 0)); // on your back, head toward -x
    you.arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * 0.12; });
    s.add(you.root);
    // the ropes, over you and round the table
    const rope = new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 0.95 });
    for (const x of [-0.42, 0.08, 0.5, 0.86]) { // a loop of rope over you and under the table top: over, down each side, under
      const y = x < 0 ? 1.12 : x < 0.3 ? 1.09 : 1.03, w = x < 0 ? 0.36 : 0.3;
      const over = mesh(new THREE.CylinderGeometry(0.011, 0.011, 2 * w, 8), rope); over.rotation.x = Math.PI / 2; over.position.set(x, y, 0); s.add(over);
      for (const z of [-1, 1]) { const sd = mesh(new THREE.CylinderGeometry(0.011, 0.011, y - 0.82, 8), rope); sd.position.set(x, (y + 0.82) / 2, z * w); sd.rotation.x = z * (w - 0.4) * 0.6; s.add(sd); }
      const under = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.82, 8), rope); under.rotation.x = Math.PI / 2; under.position.set(x, 0.81, 0); s.add(under);
    }
    // the fire: on you, between the legs
    this.fire = new BodyFire(s, you.pelvis);
    // the lighter (a brass Zippo, lid open), the pack, the cigarette, the smoke
    const brass = new THREE.MeshStandardMaterial({ color: 0xb8a070, roughness: 0.3, metalness: 1 });
    this.lighter = new THREE.Group(); this.lighter.visible = false; this.him.arms[0].hand.add(this.lighter); this.lighter.position.set(0, -0.09, 0.03);
    const zb = mesh(new THREE.BoxGeometry(0.038, 0.046, 0.013), brass); zb.position.y = -0.01; this.lighter.add(zb);
    const lid = mesh(new THREE.BoxGeometry(0.038, 0.016, 0.013), brass); lid.position.set(0.026, 0.02, 0); lid.rotation.z = -1.9; this.lighter.add(lid);
    const chim = mesh(new THREE.BoxGeometry(0.02, 0.014, 0.011), new THREE.MeshStandardMaterial({ color: 0x9a9890, roughness: 0.4, metalness: 1 })); chim.position.set(-0.004, 0.019, 0); this.lighter.add(chim);
    const fc = document.createElement('canvas'); fc.width = 32; fc.height = 64; const fg = fc.getContext('2d'), gr = fg.createRadialGradient(16, 44, 1, 16, 38, 26);
    gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.35, 'rgba(255,180,60,0.9)'); gr.addColorStop(1, 'rgba(120,30,0,0)'); fg.fillStyle = gr; fg.fillRect(0, 0, 32, 64);
    this.flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(fc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flame.scale.set(0.03, 0.06, 1); this.flame.position.set(-0.004, 0.05, 0); this.flame.visible = false; this.lighter.add(this.flame);
    this.flameLight = new THREE.PointLight(0xffa048, 0, 1.6, 2); s.add(this.flameLight); // lights his face when it catches
    // the pack: paper and foil, the lid flipped back, one cigarette standing up out of it
    const pc = document.createElement('canvas'); pc.width = 64; pc.height = 128; const pg = pc.getContext('2d');
    pg.fillStyle = '#a8a294'; pg.fillRect(0, 0, 64, 128); pg.fillStyle = '#7a1410'; pg.fillRect(0, 0, 64, 62); pg.beginPath(); pg.moveTo(0, 62); pg.lineTo(32, 86); pg.lineTo(64, 62); pg.fill();
    pg.fillStyle = '#2a2420'; pg.fillRect(10, 96, 44, 3); pg.fillRect(16, 104, 32, 2);
    this.pack = new THREE.Group(); this.pack.visible = false; s.add(this.pack);
    const ptex = new THREE.CanvasTexture(pc); ptex.colorSpace = THREE.SRGBColorSpace;
    this.pack.add(mesh(new THREE.BoxGeometry(0.056, 0.084, 0.022), new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.85 })));
    const plid = mesh(new THREE.BoxGeometry(0.056, 0.026, 0.022), new THREE.MeshStandardMaterial({ color: 0x8c1a14, roughness: 0.7 })); plid.position.set(0, 0.05, -0.02); plid.rotation.x = -1.3; this.pack.add(plid);
    const foil = mesh(new THREE.BoxGeometry(0.05, 0.006, 0.018), new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.3, metalness: 1 })); foil.position.y = 0.043; this.pack.add(foil);
    const paper = new THREE.MeshStandardMaterial({ color: 0xd6d0c4, roughness: 0.85 }), cork = new THREE.MeshStandardMaterial({ color: 0xc48a4a, roughness: 0.75 });
    const stick = () => { const g = new THREE.Group(); const w = mesh(new THREE.CylinderGeometry(0.0078, 0.0078, 0.066, 10), paper); w.position.y = 0.017; const fl = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.026, 10), cork); fl.position.y = -0.03; g.add(w, fl); return g; };
    this.packCig = stick(); this.packCig.position.set(0.012, 0.06, 0.002); this.pack.add(this.packCig);
    this.cig = stick(); this.cig.visible = false; s.add(this.cig);
    this.ember = mesh(new THREE.CylinderGeometry(0.0079, 0.0079, 0.006, 10), new THREE.MeshBasicMaterial({ color: 0x3a3430 })); this.ember.position.y = 0.052; this.cig.add(this.ember);
    this.emberGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flame.material.map, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xff6a20, opacity: 0 })); this.ember.add(this.emberGlow);
    const sc = document.createElement('canvas'); sc.width = sc.height = 64; const sg = sc.getContext('2d'), sgr = sg.createRadialGradient(32, 32, 2, 32, 32, 32);
    sgr.addColorStop(0, 'rgba(170,166,160,0.6)'); sgr.addColorStop(1, 'rgba(120,116,110,0)'); sg.fillStyle = sgr; sg.fillRect(0, 0, 64, 64);
    const smokeTex = new THREE.CanvasTexture(sc);
    this.smokes = Array.from({ length: 28 }, () => { const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 })); p.userData.life = 9; s.add(p); return p; });
    // his corner: a bare bulb of its own over it, so he isn't only lit by the red
    this.cornerKey = new THREE.SpotLight(0xffe6c8, 0, 8, 0.75, 0.6, 1.2); this.cornerKey.position.set(-1.9, 3.1, -1.8); this.cornerKey.target.position.set(-3.0, 1.5, -3.0); s.add(this.cornerKey, this.cornerKey.target);
    this.rimLight = s.children.find((o) => o.isPointLight && o.color.r > 0.9 && o.color.g < 0.3);
    this.him.root.position.set(0.15, 0, -0.62); this.him.root.rotation.y = 0;
    this.cleaver(false);
  }
  smokePuff(at, dir, size) { const p = this.smokes.find((q) => q.userData.life > 3) || this.smokes[0]; p.position.copy(at); p.userData = { life: 0, v: dir.clone(), size }; }
  smokeUpdate(dt) {
    const t = this.t, you = this.you, f = this.him, cam = this.cam;
    // the table: three blows, the lighter, the fire, your face. Then the corner (c: seconds since he got there):
    // he takes out the pack, holds it up, takes one with his lips, puts the pack away; the lighter: one flick, a
    // spark; another, a flame; he holds it to the end and draws until it catches; snaps it shut; smoke; another drag
    const P = [1.7, 2.8, 3.8], LIT = 4.9, FIRE = 5.8, FACE = 6.2, CORNER = 9.2;
    const c = t - CORNER, POCKET = 1.0, UP = 1.8, HOLD = 2.6, LIPS = 3.5, AWAY = 3.7, ZIP = 4.3, FLICK = 5.0, FLAME = 5.6, CATCH = 6.2, SHUT = 7.0, OUT = 7.9, DRAG2 = 9.4;
    const r = Math.max(0, (this.recoil || 0) - dt * 4); this.recoil = r;
    const burning = t > FIRE ? 1 : 0;
    // you: against the ropes; jolting with each blow; then thrashing as it burns
    const thrash = t < FIRE ? 0.35 : 1;
    you.root.position.set(0.1, 0.99 + r * 0.04, 0);
    you.root.quaternion.copy(this.q0 || (this.q0 = you.root.quaternion.clone())); you.root.rotateY(Math.sin(t * (burning ? 21 : 8)) * 0.03 * thrash); you.root.rotateX(-r * 0.12);
    you.neck.rotation.set(0.25 + Math.sin(t * (burning ? 13 : 6)) * 0.3 * thrash - r * 0.4, Math.sin(t * 5) * 0.25 * thrash, 0);
    you.jaw.rotation.x = 0.4 + Math.abs(Math.sin(t * (burning ? 9 : 5))) * 0.45 + r * 0.3;
    you.arms.forEach((a, i) => a.rotation.set(Math.sin(t * (11 + i)) * 0.12 * thrash, 0, (i ? 1 : -1) * (0.12 + Math.abs(Math.sin(t * (9 + i))) * 0.1 * thrash)));
    you.legs.forEach((l, i) => l.rotation.set(Math.sin(t * (12 + i * 3)) * 0.18 * thrash + r * 0.3, 0, (i ? -1 : 1) * 0.04));
    you.root.updateMatrixWorld(true);
    const groin = you.root.localToWorld(V(0, -0.07, 0.12));
    // the fire, and the smoke off it
    this.fire.amount = burning ? Math.min(1, (t - FIRE) * 3) : 0; this.fire.update(dt, groin);
    if (burning && Math.random() < dt * 3) this.smokePuff(groin.clone().add(V(0, 0.15, 0)), V((Math.random() - 0.5) * 0.08, 0.32, (Math.random() - 0.5) * 0.08), 0.22);
    for (const p of this.smokes) { const u = p.userData; if (u.life > 3) { p.material.opacity = 0; continue; } u.life += dt; p.position.addScaledVector(u.v, dt); u.v.multiplyScalar(Math.exp(-dt * 0.4)); const k = u.life / 3; p.scale.setScalar(u.size * (0.4 + k * 1.6)); p.material.opacity = (u.size > 0.18 ? 0.22 : 0.55) * (1 - k) * Math.min(1, u.life * 4); }
    // him
    const atTable = t < CORNER;
    if (atTable) { f.root.position.set(0.15, 0, -0.5); f.root.rotation.y = 0; } else { f.root.position.set(-3.0, 0, -3.0); f.root.rotation.y = 0.8; }
    const exhale = !atTable && ((c > OUT - 0.1 && c < OUT + 0.8) || (c > DRAG2 + 1.2 && c < DRAG2 + 2));
    this.pose({ mode: 'walk', jaw: atTable ? 0.4 : c >= LIPS - 0.15 ? (exhale ? 0.12 : 0.02) : 0.1, twitch: this.twitch(atTable ? 0.05 : c >= LIPS - 0.15 ? 0 : 0.015) }); // (the teeth close on the cigarette)
    f.torso.rotation.x = atTable ? 0.55 : 0.05; // over the table, close enough to reach you without stretching
    // in the corner he looks at you, then down at what his hands are doing, then at you again
    const down = atTable ? 0 : Math.max(ease((c - UP + 0.3) / 0.5) * (1 - ease((c - LIPS - 0.2) / 0.5)) * 0.25, ease((c - ZIP) / 0.6) * (1 - ease((c - SHUT) / 0.6)) * 0.3);
    f.neck.rotation.x = atTable ? -0.1 : -0.12 + down;
    f.root.updateMatrixWorld(true);
    let hand = null;
    if (t < P[2] + 0.4) { // the blows: the fist up high, and down
      let i = P.findIndex((p) => t < p + 0.5); if (i < 0) i = P.length - 1; // (the next wind-up starts once this fist is back up)
      const up = groin.clone().add(V(0.05, 0.8, -0.28)), k = t - (P[i] - 0.7);
      this.striking = k > 0.58 && k < 0.75;
      hand = k < 0 ? up : k < 0.6 ? up.clone().lerp(groin.clone().add(V(0, 0.35, -0.1)), ease(k / 0.6) * 0.3) : k < 0.7 ? up.clone().lerp(groin.clone().add(V(0, 0.05, 0)), ease((k - 0.6) / 0.1)) : groin.clone().add(V(0, 0.05, 0)).lerp(up, ease((k - 0.7) / 0.5));
    } else if (t < FIRE + 0.3) { // the lighter out, lit, down to you
      this.lighter.visible = t > P[2] + 0.7; this.flame.visible = t > LIT && t < FIRE + 0.3;
      const sx = Math.sign(f.arms[0].sh.getWorldPosition(V()).x - f.root.position.x) || 1; // (out to his side, over the table: not against his chest)
      hand = t < LIT ? V(f.root.position.x + sx * 0.42, 1.5, -0.02) : groin.clone().add(V(0, 0.55, -0.1)).lerp(groin.clone().add(V(0, 0.1, -0.02)), ease((t - LIT) / (FIRE - LIT)));
    } else if (atTable) { this.lighter.visible = false; this.flame.visible = false; const sx = Math.sign(f.arms[0].sh.getWorldPosition(V()).x - f.root.position.x) || 1; hand = V(f.root.position.x + sx * 0.48, 1.3, -0.08); }
    else {
      const fwd = V(Math.sin(0.8), 0, Math.cos(0.8)), face = f.head.getWorldPosition(V());
      const sh0 = f.arms[0].sh.getWorldPosition(V()), out0 = sh0.clone().sub(V(f.root.position.x, sh0.y, f.root.position.z)).normalize();
      const pocket = sh0.clone().add(V(0, -0.72, 0)).addScaledVector(fwd, 0.5).addScaledVector(out0, 0.02); // in front of the apron, clear of the belly
      const show = face.clone().add(V(0, -0.3, 0)).addScaledVector(fwd, 0.4); // held up in front of him
      const lips = f.head.localToWorld(V(0.05, -0.045, 0.27));
      const tip = this.cig.parent === f.head ? this.cig.localToWorld(V(0, 0.056, 0)) : f.head.localToWorld(V(0.068, -0.01, 0.35));
      const under = tip.clone().add(V(0, -0.085, 0)); this.lipsW = lips; this.underW = under; // where the lighter's body sits for the flame to reach the end
      // the cigarette: in the pack until his lips take it, then in the corner of his mouth, out and down
      this.at(CORNER, 'cs', () => { this.scene.add(this.lighter); this.lighter.visible = false; this.lighter.scale.setScalar(1.35); this.pack.scale.setScalar(1.35); this.cornerKey.intensity = 45; if (this.rimLight) this.rimLight.intensity = 0; });
      if (c >= LIPS) { if (this.cig.parent !== f.head) { f.head.add(this.cig); this.cig.position.set(0.05, -0.045, 0.3); this.cig.rotation.set(Math.PI / 2 - 0.3, 0, -0.25); this.cig.scale.setScalar(1.35); } this.cig.visible = true; this.packCig.visible = false; }
      // the hand, and what's in it
      let held = null;
      if (c < POCKET) hand = pocket.clone().add(V(0, -0.05, 0));
      else if (c < UP) { hand = pocket; held = c > POCKET + 0.4 ? this.pack : null; }
      else if (c < HOLD) { hand = pocket.clone().lerp(show, ease((c - UP) / (HOLD - UP))); held = this.pack; }
      else if (c < LIPS - 0.5) { hand = show; held = this.pack; }
      else if (c < AWAY) { hand = show.clone().lerp(lips.clone().add(V(0, -0.11, 0)).addScaledVector(fwd, 0.03), ease((c - LIPS + 0.5) / 0.5)); held = this.pack; }
      else if (c < ZIP) { hand = lips.clone().add(V(0, -0.11, 0)).lerp(pocket, ease((c - AWAY) / (ZIP - AWAY - 0.1))); held = c < ZIP - 0.2 ? this.pack : null; }
      const grip = under.clone().add(V(0, -0.13, 0)).addScaledVector(fwd, -0.03).add(this.gripFix || (this.gripFix = V())); // the lighter sits up out of his fingers (corrected by where it really ended up)
      if (c < FLICK - 0.1) { if (c >= ZIP) { hand = pocket.clone().lerp(grip, ease((c - ZIP) / (FLICK - 0.1 - ZIP))); held = this.lighter; } }
      else if (c < SHUT) { hand = grip; held = this.lighter; }
      else if (c < SHUT + 0.7) { hand = grip.clone().lerp(pocket, ease((c - SHUT) / 0.7)); held = c < SHUT + 0.55 ? this.lighter : null; }
      else if (c < DRAG2 - 0.5) hand = pocket;
      else if (c < DRAG2 + 0.8) hand = pocket.clone().lerp(lips.clone().add(V(0, -0.02, 0)).addScaledVector(fwd, 0.04), ease((c - DRAG2 + 0.5) / 0.45)); // two fingers to it
      else hand = lips.clone().add(V(0, -0.02, 0)).addScaledVector(fwd, 0.04).lerp(pocket, ease((c - DRAG2 - 0.8) / 0.5));
      this.pack.visible = held === this.pack; this.lighter.visible = held === this.lighter;
      this.heldNow = held; // (put in his fingers below, once the arm has actually moved)
      // the lighter: a flick that only sparks, then the flame; it lights his face
      this.at(ZIP + 0.4, 'clink', () => this.audio.click?.(this.lighter.position));
      this.at(FLICK, 'flick1', () => { this.audio.flashlight?.(); this.spark = 0.12; });
      this.at(FLAME, 'flick2', () => { this.audio.flashlight?.(); });
      this.at(SHUT, 'shut', () => this.audio.click?.(this.lighter.position));
      this.spark = Math.max(0, (this.spark || 0) - dt);
      const lit = c > FLAME && c < SHUT;
      this.flame.visible = lit || this.spark > 0;
      const fl = lit ? 0.85 + Math.sin(t * 37) * 0.08 + Math.sin(t * 23) * 0.07 : this.spark > 0 ? 0.4 : 0;
      this.flame.scale.set(0.045 * fl, 0.09 * fl * (c > CATCH - 0.4 && c < SHUT ? 1.25 : 1), 1); // it leans up into the end as he draws
      this.flameLight.intensity = fl * 4; this.flame.getWorldPosition(this.flameLight.position);
      // the ember: grey, then catching, glowing with each drag
      const drag = (tt) => Math.max(0, 1 - Math.abs(c - tt) / 0.7);
      const glow = c > CATCH ? 0.35 + drag(CATCH + 0.4) * 0.65 + drag(DRAG2 + 0.4) * 0.65 : 0;
      this.ember.material.color.setRGB(0.23 + glow * 0.77, 0.2 * (1 - glow) + glow * 0.3, 0.19 * (1 - glow) + glow * 0.05);
      this.emberGlow.material.opacity = glow; this.emberGlow.scale.setScalar(0.03 + glow * 0.05);
      const mo = f.head.localToWorld(V(0, -0.07, 0.19)), out = (n) => { for (let k = 0; k < n; k++) this.smokePuff(mo, fwd.clone().multiplyScalar(0.2 + k * 0.04).add(V(0, 0.05 + k * 0.02, 0)), 0.13); };
      this.at(OUT, 'out1', () => out(5));
      this.at(DRAG2 + 1.3, 'out2', () => out(6));
      if (c > CATCH && Math.random() < dt * 3) this.smokePuff(this.ember.getWorldPosition(V()), V(0, 0.08, 0), 0.05); // the thread off the tip
    }
    // his hand follows where it's meant to be a little behind, so one move runs into the next; the blow itself is instant,
    // and so is the cut to the corner
    if (t >= P[2] + 0.4) this.striking = false;
    if (hand) { const fresh = !this.hs || this.striking || (!atTable && !this.hsCorner); if (!atTable) this.hsCorner = true; this.hs = fresh ? hand.clone() : this.hs.lerp(hand, 1 - Math.exp(-dt * 9)); hand = this.hs; }
    if (hand) this.reach(0, hand, atTable ? V(f.arms[0].sh.getWorldPosition(V()).x - f.root.position.x > 0 ? 0.7 : -0.7, 0.55, -0.6) : V(0, -1, 0).addScaledVector(V(Math.sin(0.8), 0, Math.cos(0.8)), -0.45)); // in the corner: elbow down and back, by his side (not out like a hand on the hip)
    if (atTable) this.reach(1, you.root.localToWorld(V(0, 0.2, 0.13)).add(V(0, 0.06, 0))); // the hook pinning you down by the belly
    else { // down at his side, a little out from it (not into his hip)
      const sh1 = f.arms[1].sh.getWorldPosition(V()), out1 = sh1.clone().sub(V(f.root.position.x, sh1.y, f.root.position.z)).normalize();
      this.reach(1, sh1.clone().add(V(0, -1.3, 0)).addScaledVector(out1, 0.22).addScaledVector(V(Math.sin(0.8), 0, Math.cos(0.8)), 0.1), V(0, -1, 0).addScaledVector(V(Math.sin(0.8), 0, Math.cos(0.8)), -0.5)); // hanging straight
    }
    // in the corner his forearm comes up steeply to his mouth, and his long fingers would carry straight on up past his
    // face, fanned out: the wrist turns them forward over what he's holding
    // face, fanned out: the wrist turns them forward, and they close round what he's holding
    f.arms[0].hand.rotation.x = atTable ? 0 : 0.5 * ease((t - CORNER) / 0.3);
    const grips = atTable ? (t > P[2] + 0.6 && t < FIRE + 0.3 ? 1 : 0.15) : this.heldNow ? 1 : 0.55;
    this.fk = this.fk === undefined ? grips : this.fk + (grips - this.fk) * Math.min(1, dt * 8);
    this.fist(0, this.fk);
    f.root.updateMatrixWorld(true);
    // what he's holding goes where his fingers really are, every frame: it never moves ahead of the hand
    if (!atTable && this.heldNow) {
      const held = this.heldNow, fwd = V(Math.sin(0.8), 0, Math.cos(0.8));
      f.root.updateMatrixWorld(true);
      const palm = f.arms[0].hand.localToWorld(V(0, -0.075, 0.03));
      held.position.copy(palm).add(V(0, held === this.pack ? 0.02 : 0.045, 0)).addScaledVector(fwd, 0.02);
      held.rotation.set(held === this.pack ? -0.25 : 0, 0.8, 0);
      if (held === this.lighter && this.underW && t - CORNER > 4.4 && t - CORNER < 7.0) { // steer the hand so the flame meets the end of the cigarette
        const miss = this.underW.clone().sub(held.position);
        this.gripFix.addScaledVector(miss, Math.min(1, dt * 5)).clampLength(0, 0.25);
      }
    }
    // the blows land
    P.forEach((tt, i) => this.at(tt, 'p' + i, () => {
      const w = (i + 1) / P.length;
      this.audio.punch(1.3 + w * 0.3, 0.6 + w * 0.4); this.audio.crunch(0.7 + w * 0.5); this.audio.squelch(0.8 + w); this.audio.scream();
      this.shake = 0.6 + w * 0.7; this.recoil = 1;
      for (const d of [V(0, 1, 0.2), V(0.5, 0.6, 0.4), V(-0.5, 0.6, 0.4), V(0, 0.5, 1)]) this.gore.spray(groin, d, 70 + i * 70, 1.8 + w * 1.6, 0.6);
      this.scene.add(decal(this.mats.splat[i % 4], 0.6 + w * 0.8, groin.x + (Math.random() - 0.5) * 1.2, groin.z + 0.5 + Math.random() * 0.8, Math.random() * 6, 0.0115 + i * 0.0004));
    }));
    this.at(FIRE, 'fire', () => { this.audio.fire(true); this.audio.scream(); this.flash = 0.25; this.shake = 0.5; });
    for (const tt of [FACE + 0.9, FACE + 2.1, CORNER + 3.2, CORNER + 6.6]) this.at(tt, 'scr' + tt, () => this.audio.scream());
    // the camera: the table; in on the blows; down to the lighter; then you, burning; then him, in the corner
    if (atTable) {
      this.shots([[0, V(1.9, 2.4, 2.5), V(0.1, 1.25, -0.2)], [0.9, V(1.45, 1.95, 1.95), V(0.15, 1.55, -0.3)], [P[2] + 0.4, V(0.85, 1.55, 1.3), V(0.2, 1.1, 0)],
        [FACE - 0.01, V(0.8, 1.5, 1.2), V(0.2, 1.05, 0)], [FACE, V(-0.95, 1.28, 0.6), V(-0.72, 1.07, 0)], [CORNER - 0.01, V(-0.85, 1.32, 0.55), V(-0.7, 1.06, 0)]]);
      this.fear = 1;
    } else { // a tilted frame on him for each step, close enough to see what's in his hand
      const fwd = V(Math.sin(0.8), 0, Math.cos(0.8)), side = V(Math.cos(0.8), 0, -Math.sin(0.8)), face = f.head.getWorldPosition(V());
      const F = (d, dy, sd) => face.clone().addScaledVector(fwd, d).addScaledVector(side, sd).add(V(0, dy, 0));
      let pos, look, roll;
      if (c < UP) { const k = ease(c / UP); pos = F(lerp(2.7, 2.2, k), -0.2, -0.7); look = face.clone().add(V(0, -0.35, 0)); roll = 0.12; }
      else if (c < ZIP) { const k = ease((c - UP) / (ZIP - UP)); pos = F(lerp(0.95, 0.8, k), -0.12, 0.3); look = face.clone().lerp(this.pack.position, c < AWAY ? 0.55 : 0.2).add(V(0, -0.03, 0)); roll = -0.13; }
      else if (c < SHUT + 0.6) { const k = ease((c - ZIP) / (SHUT + 0.6 - ZIP)); pos = F(lerp(0.78, 0.66, k), -0.2, lerp(-0.26, -0.18, k)); look = this.lipsW.clone().lerp(this.underW, 0.55); roll = 0.09; }
      else if (c < DRAG2 - 0.6) { const k = ease((c - SHUT - 0.6) / (DRAG2 - 0.6 - SHUT - 0.6)); pos = V(lerp(1.75, 1.2, k), 1.45, lerp(1.35, 0.85, k)); look = face.clone().add(V(0, -0.25, 0)); roll = 0.07; }
      else { const k = ease((c - DRAG2 + 0.6) / 2.5); pos = F(lerp(1.5, 1.15, k), -0.05, 0.25); look = face.clone().add(V(0, -0.06, 0)); roll = -0.1; }
      cam.position.copy(pos); cam.lookAt(look); cam.rotateZ(roll);
      this.fear = 0.2;
    }
    this.at(this.dur - 0.5, 'black', () => (this.blackout = 1));
  }

  // ---------- 6: the rack (third person) ----------
  // Spread out in the air on four ropes, wrists to the posts at your head, ankles to the posts at your feet. He turns
  // the wheel; the drums wind; you stretch, and stretch, until your arms come off, and then your legs.
  rackBuild() {
    this.dur = 10;
    const s = this.scene, m = this.mats;
    this.stage(10, 10, V(0.2, 0, 0.6), V(0, 1.0, 0));
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.85 });
    this.ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a7a58, roughness: 0.95 });
    this.ropeGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 6); this.ropeGeo.userData.shared = true;
    // four posts, each with a drum the rope winds on
    this.posts = [[-2.1, -1.0], [-2.1, 1.0], [2.15, -0.8], [2.15, 0.8]].map(([x, z]) => {
      const post = mesh(new THREE.BoxGeometry(0.18, 1.6, 0.18), m.darkMetal); post.position.set(x, 0.8, z); s.add(post);
      const drum = new THREE.Group(); drum.position.set(x, 1.18, z); s.add(drum);
      const d = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.26, 12), m.rust[2]); d.rotation.x = Math.PI / 2; drum.add(d);
      for (let i = 0; i < 4; i++) { const peg = mesh(new THREE.BoxGeometry(0.03, 0.28, 0.03), wood, false); peg.rotation.z = (i * Math.PI) / 2; peg.position.z = 0.15; drum.add(peg); }
      return drum;
    });
    for (const x of [-2.1, 2.15]) { const l = new THREE.PointLight(0xffe2c8, 6, 4.5, 1.4); l.position.set(x, 2.6, 0); s.add(l); } // a lamp over each end
    // the wheel he turns, on a stand by the head end
    this.wheel = new THREE.Group(); this.wheel.position.set(-1.25, 1.15, -1.35); s.add(this.wheel);
    const rimM = mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 28), m.rust[2]); this.wheel.add(rimM);
    for (let i = 0; i < 6; i++) { const sp = mesh(new THREE.BoxGeometry(0.03, 0.84, 0.03), m.darkMetal, false); sp.rotation.z = (i * Math.PI) / 6; this.wheel.add(sp); }
    const stand = mesh(new THREE.BoxGeometry(0.14, 1.15, 0.14), m.darkMetal); stand.position.set(-1.25, 0.57, -1.5); s.add(stand);
    // you, spread in the air on your back, head toward the wheel end
    this.you = makeWorker(m);
    const you = this.you;
    you.root.position.set(0.15, 1.05, 0);
    orient(you.root, V(-1, 0, 0), V(0, 1, 0));
    s.add(you.root);
    this.ropes = this.posts.map(() => { const r = new THREE.Mesh(this.ropeGeo, this.ropeMat); r.castShadow = true; s.add(r); return r; });
    // the stumps, ready under your clothes
    this.stumps = [...you.arms, ...you.legs].map((limb, i) => { const st = stump(m, i < 2 ? 0.05 : 0.075); st.visible = false; limb.parent.add(st); st.position.copy(limb.position); st.rotation.x = Math.PI; return st; });
    this.off = [false, false, false, false];
    this.him.root.position.set(-1.25, 0, -2.05); this.him.root.rotation.y = 0;
    this.cleaver(false);
  }
  rackUpdate(dt) {
    const t = this.t, you = this.you, f = this.him;
    const CRANK = 0.8, TEAR = [4.3, 4.65, 5.35, 5.6], FALL = 5.75;
    const pull = ease(clamp01((t - CRANK) / (TEAR[0] - CRANK))), alive = t < TEAR[1] ? 1 : 0.2;
    // the drums wind (and the wheel turns) while he cranks
    const turn = t < TEAR[3] ? pull * 9 + Math.max(0, t - TEAR[0]) * 2 : 9 + (TEAR[3] - TEAR[0]) * 2;
    this.posts.forEach((d) => { d.rotation.z = -turn; }); this.wheel.rotation.z = turn * 0.6;
    // you: spread, stretching; screaming, thrashing what's left
    if (t < FALL) {
      you.root.position.set(0.15, 1.05 + Math.sin(t * 17) * 0.004 * pull, 0);
      you.torso.scale.y = 1 + pull * 0.12;
      you.arms.forEach((a, i) => { if (this.off[i]) return; a.rotation.set(0, 0, (i ? 1 : -1) * (2.35 + pull * 0.15) + Math.sin(t * (8 + i)) * 0.05 * alive); a.scale.y = 1 + pull * 0.3; });
      you.legs.forEach((l, i) => { if (this.off[2 + i]) return; l.rotation.set(0, 0, (i ? -1 : 1) * (0.42 + pull * 0.08)); l.scale.y = 1 + pull * 0.22; });
      you.neck.rotation.set(0.3 + Math.sin(t * 7) * 0.25 * alive, 0, 0); you.jaw.rotation.x = 0.35 + Math.abs(Math.sin(t * 6)) * 0.45 * alive + pull * 0.2;
    } else { // nothing left to hold you up
      const k = clamp01((t - FALL) / 0.45);
      you.root.position.set(0.15, lerp(1.05, 0.12, k * k), 0);
      this.at(FALL + 0.45, 'down', () => { this.audio.bodyDrop({ x: 0.15, y: 0, z: 0 }); this.audio.splash(1.3); this.gore.spray(V(0.15, 0.2, 0), V(0, 0.5, 0.3), 160, 2, 0.9); this.scene.add(decal(this.mats.pool[0], 2.2, 0.15, 0.1, 0.8, 0.0125)); });
    }
    you.root.updateMatrixWorld(true);
    // the ropes: from each wrist or ankle (or what's on the end of it) to its drum
    const limbs = [...you.arms, ...you.legs];
    const end = (i) => (i < 2 ? limbs[i].userData.hand.getWorldPosition(V()) : limbs[i].userData.knee.localToWorld(V(0, -0.42, 0.02)));
    limbs.forEach((limb, i) => {
      const a = end(i), b = this.posts[i].getWorldPosition(V()), d = b.clone().sub(a), L = d.length();
      const r = this.ropes[i]; r.position.copy(a).addScaledVector(d, 0.5); r.scale.set(1, L, 1); r.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    });
    // seeping at the joints as they go
    if (pull > 0.6 && t < TEAR[3]) for (let i = 0; i < 4; i++) if (!this.off[i] && Math.random() < dt * (pull - 0.5) * 10) this.gore.spray(limbs[i].getWorldPosition(V()), V(0, -1, 0), 4, 0.6, 0.3);
    // and then they come off, one after another, and go to the posts on their ropes
    TEAR.forEach((tt, i) => this.at(tt, 'tear' + i, () => {
      const limb = limbs[i], at = limb.getWorldPosition(V());
      this.scene.attach(limb); this.off[i] = true; this.stumps[i].visible = true;
      const to = this.posts[i].getWorldPosition(V()).sub(at).normalize();
      this.flyLimb = this.flyLimb || []; this.flyLimb[i] = { v: to.multiplyScalar(5.5), spin: (Math.random() - 0.5) * 8 };
      this.audio.tear(); this.audio.gib(0.8 + i * 0.15); this.audio.squelch(1.4); if (i === 0) this.audio.scream();
      this.shake = 0.8 + i * 0.15; this.flash = 0.18;
      for (const d of [to.clone().negate().add(V(0, 0.6, 0)), V(0, 1, 0), V(0, -0.3, 1), V(0, -0.3, -1)]) this.gore.spray(at, d, 110, 2.6, 0.6);
      this.drop([meatChunk(this.mats, Math.random), meatChunk(this.mats, Math.random)], at, 1.4, 0.4);
    }));
    // the torn-off limbs: snapped toward the posts by the ropes, then hanging off them, dripping
    if (this.flyLimb) this.flyLimb.forEach((F, i) => {
      if (!F) return;
      const limb = limbs[i], post = this.posts[i].getWorldPosition(V());
      limb.position.addScaledVector(F.v, dt); F.v.multiplyScalar(Math.exp(-dt * 3)); F.v.y -= 6 * dt;
      const off = limb.position.clone().sub(post); if (off.length() > 0.6) { off.setLength(0.6); limb.position.copy(post).add(off); F.v.multiplyScalar(0.4); }
      limb.rotation.x += F.spin * dt; F.spin *= Math.exp(-dt * 2);
      if (Math.random() < dt * 12) this.gore.spray(limb.getWorldPosition(V()), V(0, -1, 0), 5, 0.5, 0.3);
    });
    // him: both hands on the wheel, turning it
    const staring = this.stare(7.4, this.dur - 7.8);
    if (!staring) {
      this.pose({ mode: 'walk', jaw: 0.4, twitch: this.twitch(0.05) }); f.torso.rotation.x = 0.3; f.neck.rotation.x = -0.15;
      const w = this.wheel.position, ang = this.wheel.rotation.z;
      this.reach(0, V(w.x + Math.cos(ang + 2.4) * 0.4, w.y + Math.sin(ang + 2.4) * 0.4, w.z - 0.05));
      this.reach(1, V(w.x + Math.cos(ang + 2.4 + Math.PI) * 0.4, w.y + Math.sin(ang + 2.4 + Math.PI) * 0.4, w.z - 0.05));
    }
    this.at(0.3, 'start', () => { this.audio.scream(); this.audio.creak({ x: 0, y: 1, z: 0 }); });
    for (const c of [1.4, 2.4, 3.3, 3.9]) this.at(c, 'creak' + c, () => { this.audio.creak({ x: -2.5, y: 1.2, z: 0 }); if (c > 2) this.audio.scream(); });
    // the camera: high over all of it; in along your body as you stretch; on your shoulder as it goes; wide as the rest goes; you, down
    if (!staring) this.shots([[0, V(2.6, 3.3, 3.6), V(0, 0.9, 0)], [CRANK + 0.6, V(1.9, 2.0, 2.5), V(-0.2, 1.05, 0)], [TEAR[0] - 0.7, V(-0.4, 1.9, 1.9), V(-0.9, 1.1, 0)], [TEAR[1] + 0.25, V(2.4, 2.4, 3.0), V(0.2, 1.0, 0)],
      [FALL + 0.4, V(1.6, 1.8, 2.4), V(0.1, 0.2, 0)], [7.0, V(1.5, 2.0, 2.6), V(-1.0, 1.2, -1.5)]]);
    this.fear = 0.6 + pull * 0.4;
    this.at(this.dur - 0.5, 'black', () => (this.blackout = 1));
  }

  // ---------- 5: eaten (third person) ----------
  eatenBuild() {
    this.dur = 9;
    const s = this.scene, m = this.mats;
    room(s, m, 10, 10, 7);
    s.fog.density = 0.06;
    s.add(decal(m.pool[1], 2.6, 0, 0, 1));
    this.you = makeWorker(m);
    this.you.root.position.set(0, 0.16, 0);
    orient(this.you.root, V(1, 0, 0), V(0, 1, 0));
    this.you.arms[0].rotation.z = -1.2;
    this.you.arms[1].rotation.z = 1.2;
    s.add(this.you.root);
    this.him.root.position.set(0.3, 0, -0.75);
    const lamp = makeLamp(m, 'bulb');
    lamp.position.set(0.2, 3, 0);
    s.add(lamp);
    const l = new THREE.PointLight(0xffc8a0, 18, 10, 1.4);
    l.position.set(0.2, 2.2, 0);
    l.castShadow = true;
    s.add(l);
    const rim = new THREE.PointLight(0xff3020, 8, 8, 1.5);
    rim.position.set(-1.5, 1, -1.8);
    s.add(rim);
    this.held = null;
  }
  eatenUpdate(dt) {
    const t = this.t, f = this.him;
    // the camera circles slowly, low, like it's trying not to be seen
    const a = 0.9 + t * 0.12;
    this.cam.position.set(Math.cos(a) * 2.6, 0.9 + t * 0.03, Math.sin(a) * 2.6);
    this.cam.lookAt(0.2, 0.55, -0.2);
    // kneeling over you
    this.pose({ mode: 'walk', jaw: 0.3, twitch: this.twitch(0.15) });
    f.hips.position.y = 0.62;
    f.legs.forEach((lg) => { lg.thigh.rotation.x = -1.25; lg.knee.rotation.x = 2.1; });
    f.torso.rotation.x = 1.0;
    const chopArm = f.arms[0], holdArm = f.arms[1];
    const chop = (t0) => clamp01((t - t0) / 0.18);
    holdArm.sh.rotation.set(-0.6, 0, -0.2);
    if (t < 3.6) {
      const k = t < 2.5 ? chop(1.4) : chop(2.5);
      const raise = t < 1.4 ? ease(t / 1.2) : t < 2.5 ? 1 - k + (t > 2 ? ease((t - 1.8) / 0.6) : 0) : 1 - k;
      chopArm.sh.rotation.set(lerp(-0.4, -2.6, clamp01(raise)), 0, 0.2);
      this.at(1.55, 'chop1', () => {
        this.audio.crack(); this.audio.squelch(1.5);
        this.you.arms[1].visible = false;
        const arm = severedArm(this.mats, Math.random);
        arm.position.set(0.2, 0.2, 0.3);
        this.scene.add(arm);
        this.held = arm;
        this.gore.spray(V(0.15, 0.25, 0.2), V(0.3, 1, 0.4), 80, 3, 0.6);
        this.shake = 0.6;
      });
      this.at(2.65, 'chop2', () => {
        this.audio.crack(); this.audio.squelch(1.5);
        this.you.legs[0].visible = false;
        openChest(this.you, this.mats);
        this.gore.burst(V(-0.4, 0.2, 0.05), 8, 2, 0.8, [severedArm(this.mats, Math.random)]);
        this.gore.spray(V(-0.35, 0.2, 0), V(-0.2, 1, 0), 80, 3, 0.6);
        this.shake = 0.6;
      });
    } else {
      // and then he eats
      const lift = ease((t - 3.6) / 0.8);
      chopArm.sh.rotation.set(-0.5, 0, 0.3);
      holdArm.sh.rotation.set(lerp(-0.6, -2.3, lift), 0, lerp(-0.2, 0.35, lift));
      holdArm.el.rotation.x = lerp(-0.2, -1.6, lift);
      const hand = this.handPos(1);
      if (this.held) { this.held.position.copy(hand); this.held.rotation.set(t, 0.6, 1.2); }
      const chewing = t > 4.4 && t < 6.6;
      f.jaw.rotation.x = chewing ? 0.2 + Math.abs(Math.sin(t * 9)) * 0.7 : 0.4;
      if (chewing && Math.random() < dt * 5) { this.audio.chew(); this.gore.spray(this.headPos(), V(0, -1, 0.3), 12, 1.2, 0.5); }
      // and then it looks right at you
      if (t > 6.6) {
        const look = ease((t - 6.6) / 0.25);
        f.torso.rotation.x = lerp(1.0, 0.45, look);
        f.neck.rotation.x = lerp(-0.5, -0.1, look);
        f.root.rotation.y = lerp(0, Math.atan2(this.cam.position.x - f.root.position.x, this.cam.position.z - f.root.position.z), look);
        f.jaw.rotation.x = 0.9;
        this.at(6.6, 'stare', () => { this.audio.jumpscare(0.8); this.flash = 0.5; });
        this.cam.position.lerp(this.headPos(), ease((t - 6.7) / 1.4) * 0.6);
        this.cam.lookAt(this.headPos());
        this.fear = 1;
      }
    }
    this.at(8.3, 'black', () => (this.blackout = 1));
  }

  // ---------- shared by the remaster's films ----------
  // bend arm `j` so its hand comes to `target`: two-bone IK, worked out exactly each frame (no searching, so the arm
  // can't wander or flail). The elbow bends forward and points out, down and back, the way an elbow does
  reach(j, target, poleW = null) { // poleW: a world direction for the elbow to point, when the default won't do
    const f = this.him, a = f.arms[j];
    f.root.updateMatrixWorld(true);
    const S = a.sh.getWorldPosition(V()), E = a.el.getWorldPosition(V()), H = a.hand.getWorldPosition(V());
    const L1 = S.distanceTo(E), L2 = E.distanceTo(H), to = target.clone().sub(S);
    const d = Math.max(Math.abs(L1 - L2) + 1e-3, Math.min((L1 + L2) * 0.995, to.length()));
    const bend = Math.PI - Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
    a.el.rotation.set(-bend, 0, 0);
    const e0 = a.el.position.clone(), h0 = a.hand.position.clone().applyEuler(a.el.rotation).add(e0);
    const Qi = a.sh.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    const tp = to.applyQuaternion(Qi).normalize();
    const R = new THREE.Quaternion().setFromUnitVectors(h0.normalize(), tp);
    // the pole: out to his side, down, and a little behind
    const tq = f.torso.getWorldQuaternion(new THREE.Quaternion());
    const pole = poleW ? poleW.clone().applyQuaternion(Qi) : V(j ? 1 : -1, 0, 0).applyQuaternion(tq).add(V(0, -0.7, 0)).add(V(0, 0, -0.4).applyQuaternion(tq)).applyQuaternion(Qi);
    const e1 = e0.applyQuaternion(R);
    e1.addScaledVector(tp, -e1.dot(tp)); pole.addScaledVector(tp, -pole.dot(tp));
    if (e1.lengthSq() > 1e-8 && pole.lengthSq() > 1e-8) R.premultiply(new THREE.Quaternion().setFromAxisAngle(tp, Math.atan2(tp.dot(e1.clone().cross(pole)), e1.dot(pole))));
    a.sh.quaternion.copy(R);
    f.root.updateMatrixWorld(true);
  }
  // his fingers (the remastered hand: four long ones off the palm) closed by k (0 open as built, 1 a fist)
  fist(j, k) {
    for (const c of this.him.arms[j].hand.children) {
      if (!c.isGroup || Math.abs(c.position.y + 0.07) > 0.002) continue;
      if (c.userData.curl0 === undefined) c.userData.curl0 = c.rotation.x;
      c.rotation.x = c.userData.curl0 + k * 1.45;
    }
  }
  // the cleaver in his hand, when the film needs that hand for something else
  cleaver(on) {
    const hand = this.him.arms[0].hand;
    if (!this.clv) { let best = null, size = 0; for (const c of hand.children) { if (!c.isGroup && !c.isMesh) continue; const b = new THREE.Box3().setFromObject(c), d = b.getSize(V()).length(); if (d > size) { size = d; best = c; } } this.clv = best; }
    if (this.clv) this.clv.visible = on;
  }
  // a plain, well-lit stage: concrete, tiles, one hard lamp over the action, red from behind, a cold fill
  stage(w, d, keyAt, aim) {
    const s = this.scene, m = this.mats;
    room(s, m, w, d, 2);
    s.fog.density = 0.05;
    const lamp = makeLamp(m, 'bulb'); lamp.position.set(keyAt.x, 3.1, keyAt.z); s.add(lamp);
    const key = new THREE.SpotLight(0xfff0dc, 55, 9, 0.8, 0.5, 1.2); key.position.set(keyAt.x, 3.0, keyAt.z); key.target.position.copy(aim); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); s.add(key, key.target);
    const rim = new THREE.PointLight(0xff2a18, 10, 9, 1.5); rim.position.set(aim.x - 2, 1.8, aim.z - 2.5); s.add(rim);
    const fill = new THREE.PointLight(0xb8c4ff, 5, 10, 1.5); fill.position.set(aim.x + 2.5, 1.6, aim.z + 3); s.add(fill);
    s.userData.vol = [key];
    return key;
  }
  // camera on a path of shots: [[time, position, target], ...], easing between them
  shots(list) {
    const t = this.t;
    let i = 0; while (i < list.length - 1 && t >= list[i + 1][0]) i++;
    const [t0, p0, l0] = list[i], n = list[i + 1] || list[i], k = n === list[i] ? 0 : ease((t - t0) / Math.max(0.01, n[0] - t0));
    this.cam.position.lerpVectors(p0, n[1], k);
    this.cam.lookAt(V().lerpVectors(l0, n[2], k));
  }
  // the end of every film: he turns to look at you, and the camera comes in on his face
  stare(from, dur, lift = 0) { // lift: how high the camera arcs on its way in (to clear what's between)
    const t = this.t - from, f = this.him;
    if (t < 0) return false;
    const k = ease(t / 0.6);
    if (this.stareRy === undefined) this.stareRy = f.root.rotation.y;
    const want = Math.atan2(this.cam.position.x - f.root.position.x, this.cam.position.z - f.root.position.z);
    let d = want - this.stareRy; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    f.root.rotation.y = this.stareRy + d * k;
    this.pose({ mode: 'walk', jaw: 0.9, twitch: this.twitch(0.12) });
    f.torso.rotation.x = 0.4; f.neck.rotation.x = -0.15;
    this.at(from + 0.05, 'stare', () => { this.audio.jumpscare(0.7); this.flash = 0.3; });
    const hp = this.headPos();
    if (!this.stareFrom) this.stareFrom = this.cam.position.clone();
    const to = hp.clone().add(this.stareFrom.clone().sub(hp).setY(0).normalize().multiplyScalar(1.0)).add(V(0, -0.08, 0));
    const kk = ease((t - 0.2) / Math.max(0.5, dur - 0.4));
    this.cam.position.lerpVectors(this.stareFrom, to, kk); this.cam.position.y += lift * Math.sin(Math.PI * Math.min(1, kk * 1.15));
    this.cam.lookAt(hp);
    return true;
  }
  // organs and the like dropping and rolling to rest (gore's own little physics)
  drop(objs, at, speed = 1, up = 0.3) { this.gore.burst(at, 0, speed, up, objs); }

  // ---------- 1: burned (third person) ----------
  // Tied to a post. He lights you with a road flare, and you burn. He cuts the rope; you run, on fire, and he takes
  // the shotgun off his back and shoots you, and there is nothing left to run.
  ropeBuild() {
    this.dur = 12.5;
    const s = this.scene, m = this.mats;
    this.stage(18, 12, V(0.3, 0, 1.2), V(0, 1, 0));
    const far = makeLamp(m, 'bulb'); far.position.set(4.2, 3.1, 1.6); s.add(far); // over where you'll run to
    const farL = new THREE.SpotLight(0xffe8d0, 40, 9, 0.9, 0.5, 1.2); farL.position.set(4.2, 3.0, 1.6); farL.target.position.set(4.2, 0.5, 1.4); s.add(farL, farL.target);
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.85 });
    const post = mesh(new THREE.CylinderGeometry(0.11, 0.13, 2.6, 16), wood); post.position.set(0, 1.3, -0.2); s.add(post);
    s.add(decal(m.pool[1] || m.pool[0], 1.4, 0, 0.2, 0.4));
    this.you = makeWorker(m);
    const you = this.you;
    you.root.position.set(0, 0.92, 0);
    you.arms.forEach((a, i) => a.rotation.set(0.3, 0, (i ? 1 : -1) * 0.15)); // hands behind the post
    s.add(you.root);
    // the rope: turns round the post and the body, chest and thighs
    const rope = new THREE.MeshStandardMaterial({ color: 0x8a7650, roughness: 0.9 });
    this.ropes = [];
    for (const [y, r] of [[1.42, 0.24], [1.3, 0.24], [0.62, 0.2]]) { const t = mesh(new THREE.TorusGeometry(r, 0.012, 8, 32), rope); t.rotation.x = Math.PI / 2; t.scale.set(1, 1.35, 1); t.position.set(0, y, -0.06); s.add(t); this.ropes.push(t); }
    // him, at your side, a lit flare in his hand
    this.him.root.position.set(-1.05, 0, 0.85); this.him.root.rotation.y = 2.3;
    this.cleaver(false);
    this.flare = new THREE.Group();
    const stick = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 10), new THREE.MeshStandardMaterial({ color: 0xa01810, roughness: 0.5 })); this.flare.add(stick); this.flareStick = stick; this.flareOn = true;
    this.flareLight = new THREE.PointLight(0xff4a20, 6, 5, 1.6); this.flareLight.position.y = -0.15; this.flare.add(this.flareLight);
    this.flareFire = new BodyFire(s, stick);
    this.him.arms[0].hand.add(this.flare); this.flare.position.set(0, -0.12, 0.02);
    this.gun = shotgun(m); s.add(this.gun); // slung across his back until he wants it
    this.gunBack = new THREE.Matrix4().compose(V(0.06, 0.42, -0.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0.55)), V(1, 1, 1));
    this.fire = new BodyFire(s, you.root);
    this.burnMats = []; you.root.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); this.burnMats.push({ m: o.material, c: o.material.color.clone() }); } });
    // the shot, made now: a light or a material that first turns up mid-film makes every shader in the scene rebuild,
    // and that was the hitch just as he fired. Parked under the floor (still 'visible', so prepare() compiles them)
    const park = (o) => this.park(o);
    this.muzzle = new THREE.PointLight(0xffd0a0, 0, 10, 1.5); s.add(this.muzzle);
    this.shotBits = [...organSet(m), eyeball(m), eyeball(m), severedArm(m, Math.random), severedArm(m, Math.random), severedHead(m, Math.random), guts(m, 0.08, 4), guts(m, 0.07, 3)];
    for (let i = 0; i < 12; i++) this.shotBits.push(meatChunk(m, Math.random));
    this.shotBits.forEach(park);
    this.shotGuts = park(guts(m, 0.18));
    this.shotSplit = splitBody(you, V(0, 1, 0), -0.16); park(this.shotSplit.b.holder);
    this.audio.creak({ x: 0, y: 2, z: 0 });
  }
  // where the gun is: on his back, or up and aimed at `tgt` from his shoulder (k between), plus the kick of a shot
  gunPose(k, tgt, kick) {
    const f = this.him, g = this.gun;
    f.root.updateMatrixWorld(true);
    const bp = V(), bq = new THREE.Quaternion(), bs = V();
    new THREE.Matrix4().multiplyMatrices(f.torso.matrixWorld, this.gunBack).decompose(bp, bq, bs);
    const sh = f.arms[0].sh.getWorldPosition(V()), dir = tgt.clone().sub(sh).normalize();
    const aq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(V(0, 0, 0), dir, V(0, 1, 0)));
    if (kick) aq.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), kick * 0.5));
    const grip = sh.clone().addScaledVector(dir, 0.3).add(V(0, -0.1, 0));
    const ap = grip.clone().sub(V(0, -0.035, 0.15).applyQuaternion(aq)).addScaledVector(dir, -kick * 0.12);
    g.position.lerpVectors(bp, ap, k); g.quaternion.slerpQuaternions(bq, aq, k); g.scale.setScalar(1);
    g.updateMatrixWorld(true);
  }
  ropeUpdate(dt) {
    const t = this.t, you = this.you, f = this.him;
    const LIGHT = 2.2, CUT = 5.4, RUN = 6.0, DRAW = 7.0, PUMP = 8.05, SHOT = 9.1;
    // the fire: from the feet up, until it's all of you; the body blackens under it
    this.fire.amount = this.blown ? 0 : clamp01((t - LIGHT) / 2.4);
    const root = you.root.getWorldPosition(V());
    this.fire.update(dt, root);
    for (const b of this.burnMats) b.m.color.copy(b.c).multiplyScalar(1 - 0.75 * clamp01((t - LIGHT - 0.5) / 4));
    this.flareFire.amount = this.flareOn ? 0.5 : 0; this.flareFire.update(dt, null);
    this.flareLight.intensity = this.flareOn ? 5 + Math.sin(t * 31) * 2 : 0;
    // you: tied, fighting it; then loose, and running
    const burning = t > LIGHT ? 1 : 0.4;
    if (!this.blown) {
      if (t < CUT) {
        you.root.position.set(Math.sin(t * 13) * 0.015 * burning, 0.92, 0);
        you.neck.rotation.set(Math.sin(t * 9) * 0.3 * burning, Math.sin(t * 5) * 0.4 * burning, 0);
        you.jaw.rotation.x = 0.3 + Math.abs(Math.sin(t * 7)) * 0.5 * burning;
        you.legs.forEach((l, i) => l.rotation.x = Math.sin(t * 11 + i * 2) * 0.15 * burning);
      } else {
        const r = clamp01((t - RUN) / 0.4), run = Math.max(0, t - RUN);
        const d = Math.min(4.6, run * 1.45 * r); // across the room toward the far lamp (and no further: the wall)
        you.root.position.set(d, 0.92 + Math.abs(Math.sin(run * 9)) * 0.05 * r, d * 0.32);
        you.root.rotation.y = 1.25 * r; you.root.rotation.z = Math.sin(run * 9) * 0.06;
        you.legs.forEach((l, i) => l.rotation.x = Math.sin(run * 9 + i * Math.PI) * 0.8 * r);
        you.arms.forEach((a, i) => a.rotation.set(-1.6 + Math.sin(run * 14 + i * 2) * 0.8, 0, (i ? 1 : -1) * 0.5)); // flailing at the flames
        you.jaw.rotation.x = 0.8;
      }
    }
    const tgt = this.blown ? this.blown.clone() : you.root.getWorldPosition(V()).add(V(0, 0.4, 0));
    let gunK = 0, kick = 0;
    if (t < LIGHT + 0.4) {
      // a step toward you, the flare held low, then down to your legs
      const k = ease((t - 0.8) / 1.2);
      f.root.position.set(lerp(-1.05, -0.9, k), 0, lerp(0.85, 0.72, k));
      this.pose({ mode: 'walk', gait: t * 2, speed: t > 0.8 && t < 2 ? 0.6 : 0, jaw: 0.3, twitch: this.twitch(0.1) });
      f.torso.rotation.x = lerp(0.3, 0.75, ease((t - 1.6) / 0.6));
      const kn = you.legs[1].userData.knee.getWorldPosition(V()).add(V(-0.12, 0, 0.16));
      this.reach(0, t < 1.6 ? V(-0.75, 1.35, 0.9) : kn);
      this.reach(1, V(-1.1, 0.95, 0.6));
      this.at(LIGHT, 'light', () => { this.audio.fire(true); this.audio.scream(); this.flash = 0.2; });
    } else if (t < RUN) {
      // the flare dropped; the cleaver out; one swing across the back of the post and the rope parts
      // (the stick goes, its light only goes dark: a light leaving the scene would make every shader rebuild)
      this.flareOn = false; this.flareStick.visible = false;
      this.cleaver(true);
      f.root.position.set(-0.75, 0, 0.32); f.root.rotation.y = lerp(2.3, 1.6, ease((t - LIGHT - 0.4) / 0.8));
      this.pose({ mode: 'walk', jaw: 0.4, twitch: this.twitch(0.1) });
      f.torso.rotation.x = 0.35;
      const sw = clamp01((t - (CUT - 0.35)) / 0.3);
      this.reach(0, V().lerpVectors(V(-0.45, 1.85, 0.1), V(0.0, 1.25, -0.35), ease(sw)));
      this.reach(1, V(-0.9, 1.0, 0.5));
      this.at(CUT, 'cut', () => { this.audio.ropeSnap(); this.ropes.forEach((r) => { r.userData.fall = 0; }); });
    } else {
      // he watches you go. Then the cleaver goes in his belt, his hand goes over his shoulder for the shotgun on his
      // back, he brings it round, racks it, and aims
      this.cleaver(false);
      f.root.position.set(-0.75, 0, 0.32);
      const want = Math.atan2(tgt.x - f.root.position.x, tgt.z - f.root.position.z);
      f.root.rotation.y = lerp(1.6, want, ease((t - RUN) / 0.8));
      this.pose({ mode: 'walk', jaw: 0.5, twitch: this.twitch(0.06) });
      f.torso.rotation.x = 0.15;
      gunK = ease((t - DRAW - 0.45) / 0.6);
      kick = t > SHOT ? Math.exp(-(t - SHOT) * 6) : 0;
      if (!(t > SHOT + 2.2)) {
        this.gunPose(gunK, tgt, kick);
        const grip = this.gun.localToWorld(V(0, -0.035, 0.15)), fore = this.gun.localToWorld(V(0, -0.03, -0.22));
        const rack = t > PUMP && t < PUMP + 0.45 ? Math.sin(((t - PUMP) / 0.45) * Math.PI) * 0.12 : 0;
        if (rack) fore.add(this.gun.localToWorld(V(0, 0, 0.1)).sub(this.gun.localToWorld(V(0, 0, 0))).normalize().multiplyScalar(rack));
        const restA = f.torso.localToWorld(V(-0.35, 0.05, 0.25)), restB = f.torso.localToWorld(V(0.35, 0.05, 0.2));
        const toGun = ease((t - DRAW) / 0.45); // the hand up over his shoulder to the grip
        this.reach(0, t < DRAW + 0.45 ? restA.lerp(grip, toGun) : grip);
        this.reach(1, restB.lerp(fore, ease((t - DRAW - 0.7) / 0.4)));
        this.at(DRAW + 0.45, 'unsling', () => this.audio.clank(f.root.position, 0.4));
        this.at(PUMP, 'pump', () => this.audio.pump());
      }
      if (t > SHOT + 2.2 && this.stare(SHOT + 2.2, this.dur - SHOT - 2.6)) { this.gun.visible = false; }
    }
    if (t < RUN) this.gunPose(0, tgt, 0); // still on his back
    // the rope, cut: slack and falling
    for (const r of this.ropes) if (r.userData.fall !== undefined) { r.userData.fall += dt; r.position.y = Math.max(0.02, r.position.y - r.userData.fall * 4 * dt * 10); r.rotation.x = Math.PI / 2 + r.userData.fall * 0.5; }
    // the shot: everything above your belt goes, all at once; your legs stand a moment, then fold
    this.at(SHOT, 'shot', () => {
      you.root.updateMatrixWorld(true);
      const waist = you.torso.localToWorld(V(0, 0.16, 0)), chest = you.torso.localToWorld(V(0, 0.42, 0.05));
      this.blown = chest.clone();
      const muzzle = this.gun.localToWorld(V(0, 0, -0.62));
      this.muzzle.position.copy(muzzle); this.muzzle.intensity = 60;
      this.audio.shotgun(); this.audio.gib(1.5); this.audio.splash(1.4);
      this.shake = 1.6; this.flash = 0.5;
      this.legs = this.shotSplit;
      // the legs carry on burnt the way you were: their materials take the colour yours had reached
      const src = []; you.root.traverse((o) => src.push(o));
      this.legs.b.nodes.forEach((d, i) => { if (d.isMesh && src[i] && src[i].isMesh) d.material.color.copy(src[i].material.color); });
      this.legs.pivot(waist); this.legs.sync();
      you.root.visible = false; this.fire.amount = 0;
      const away = chest.clone().sub(muzzle).setY(0).normalize();
      this.drop(this.shotBits, chest, 4, 0.55);
      this.gore.burst(chest, 22, 4.5, 0.6);
      for (const d of [away.clone().add(V(0, 0.5, 0)), away.clone().add(V(0, 1.2, 0)), V(0, 1, 0), away.clone().add(V(0.6, 0.2, 0.6)), away.clone().add(V(-0.6, 0.2, -0.6))]) this.gore.spray(chest, d, 300, 5.5, 0.8);
      for (let i = 0; i < 10; i++) this.scene.add(decal(this.mats.splat[(Math.random() * 4) | 0], 1 + Math.random() * 1.6, chest.x + away.x * Math.random() * 2.5 + (Math.random() - 0.5) * 1.6, chest.z + away.z * Math.random() * 2.5 + (Math.random() - 0.5) * 1.6, Math.random() * 6, 0.011 + i * 0.0005));
      this.shotGuts.position.set(chest.x + away.x * 0.9, 0, chest.z + away.z * 0.9);
    });
    this.at(SHOT + 0.3, 'rain', () => this.audio.spatter(1.4));
    if (this.legs) {
      // what's left: blood pumping out of the top of it; the knees go, and it drops
      const lt = t - SHOT, H = this.legs.b.holder, base = this.legs.b.base;
      const buckle = ease((lt - 0.5) / 0.3), fall = ease((lt - 0.8) / 0.55);
      H.position.set(base.x + fall * 0.35, lerp(base.y - buckle * 0.12, 0.16, fall * fall), base.z + fall * 0.1);
      H.rotation.set(0, 0, -fall * 1.45);
      this.legs.sync();
      if (lt < 2.2 && Math.random() < dt * 30) this.gore.spray(H.localToWorld(V(0, 0.02, 0)).add(V(0, 0.02, 0)), V(Math.sin(lt * 3) * 0.2, 1, 0), 10, 1.6 * (1 - lt / 2.4), 0.25);
      this.at(SHOT + 1.35, 'legsdown', () => { this.audio.bodyDrop({ x: base.x, y: 0, z: base.z }); this.scene.add(decal(this.mats.pool[0], 1.4, base.x + 0.4, base.z + 0.1, 1, 0.0125)); });
    }
    if (this.muzzle) this.muzzle.intensity *= Math.exp(-dt * 18);
    // the camera
    const yr = you.root.getWorldPosition(V()), fp = this.him.root.position;
    if (t < CUT - 0.6) this.shots([[0, V(2.8, 1.75, 3.2), V(-0.2, 1.1, 0)], [LIGHT - 0.4, V(1.7, 1.35, 2.2), V(-0.1, 0.9, 0)], [LIGHT + 0.4, V(1.4, 1.2, 1.9), V(0, 1.0, 0)], [CUT - 0.6, V(1.2, 1.4, 1.6), V(0, 1.25, 0)]]);
    else if (t < RUN) this.shots([[CUT - 0.6, V(-1.8, 1.6, -1.2), V(-0.1, 1.3, -0.25)], [RUN, V(-1.7, 1.5, -1.0), V(0, 1.2, -0.2)]]);
    else if (t < DRAW - 0.1) { // alongside you as you run, burning
      this.cam.position.lerp(V(yr.x - 0.6, 1.45, yr.z + 3.0), 1 - Math.exp(-dt * 5));
      this.cam.lookAt(yr.clone().add(V(0, 0.2, 0)));
    } else if (t < PUMP + 0.5) { // on him: the hand over the shoulder, the gun brought round, racked
      if (!this.drawCam) { this.drawCam = true; this.cam.position.set(fp.x + 2.3, 1.9, fp.z + 1.9); }
      this.cam.position.lerp(V(fp.x + 2.0, 1.95, fp.z + 1.6), 1 - Math.exp(-dt * 2));
      this.cam.lookAt(V(fp.x, 1.75, fp.z));
    } else if (t < SHOT) { // over his shoulder, the gun on you
      this.cam.position.lerp(V(fp.x - 0.9, 2.2, fp.z - 0.6), 1 - Math.exp(-dt * 10));
      this.cam.lookAt(yr.clone().add(V(0, 0.3, 0)));
    } else if (t < SHOT + 2.2) { // what's left of you
      const b = this.blown;
      this.cam.position.lerp(V(b.x - 1.4, 1.35, b.z + 2.9), 1 - Math.exp(-dt * 6));
      this.cam.lookAt(b.clone().add(V(0, -0.7, 0)));
    }
    this.fear = 1;
    this.at(this.dur - 0.5, 'black', () => (this.blackout = 1));
  }

  // ---------- 7: torn in two (third person) ----------
  // He holds you up across his body, his hook in your chest and his hand on your thigh, and pulls until you come
  // apart at the waist. Everything inside you falls out between the halves.
  tornBuild() {
    this.dur = 10;
    const s = this.scene, m = this.mats;
    this.stage(9, 9, V(0.4, 0, 1.0), V(0, 1, 0.2));
    s.add(decal(m.pool[0], 2.2, 0.1, 0.4, 0.3));
    this.you = makeWorker(m);
    const you = this.you;
    orient(you.root, V(-1, 0, 0), V(0, 0, 1)); // across his body, face to the camera
    you.root.position.set(0.28, 1.32, 0.32);
    s.add(you.root);
    this.split = splitBody(you, V(0, 1, 0), -0.16);
    you.root.updateMatrixWorld(true);
    this.split.pivot(you.torso.localToWorld(V(0, 0.16, 0))); // the halves turn about the tear
    you.root.visible = false; // drawn as its two halves
    s.add(this.split.a.holder, this.split.b.holder);
    this.him.root.position.set(0, 0, -0.42);
    this.cleaver(false);
    this.strand = null;
  }
  tornUpdate(dt) {
    const t = this.t, you = this.you, f = this.him, sp = this.split, A = sp.a.holder, B = sp.b.holder;
    const PULL = 1.6, RIP = 3.6;
    const alive = t < RIP ? 1 : 0;
    // your arms thrash, but toward the camera, never back through him
    you.arms.forEach((a, i) => a.rotation.set((-0.5 + Math.sin(t * (7 + i)) * 0.45) * alive - 0.15 * (1 - alive), 0, (i ? 1 : -1) * (0.15 + Math.abs(Math.sin(t * 5 + i)) * 0.35 * alive)));
    you.legs.forEach((l, i) => l.rotation.set(Math.sin(t * 9 + i * 2) * 0.4 * alive, 0, (i ? -1 : 1) * 0.1));
    you.neck.rotation.x = (0.3 + Math.sin(t * 8) * 0.25) * alive; you.jaw.rotation.x = 0.35 + Math.abs(Math.sin(t * 6)) * 0.5 * alive;
    const strain = clamp01((t - PULL) / (RIP - PULL));
    you.root.updateMatrixWorld(true);
    const P0 = sp.a.base;
    // it starts to give before it goes: drips from the waist, heavier as he pulls, then spurts, and wet sounds
    if (t > PULL && t < RIP) {
      const tear = V(P0.x + (Math.random() - 0.5) * 0.06, P0.y - 0.04, P0.z + 0.06);
      if (Math.random() < dt * (6 + strain * 50)) this.gore.spray(tear, V(0, -1, 0.1), 2 + Math.round(strain * 8), 0.5 + strain * 1.2, 0.25);
      if (strain > 0.45 && Math.random() < dt * strain * 6) this.gore.spray(tear.add(V(0, 0.05, 0.03)), V((Math.random() - 0.5) * 0.6, 0.3, 1), 14 + Math.round(strain * 20), 1.2 + strain * 1.6, 0.4);
      this.at(PULL + 0.9, 'give1', () => { this.audio.squelch(0.6); });
      this.at(PULL + 1.5, 'give2', () => { this.audio.tear(); this.audio.squelch(0.9); this.scene.add(decal(this.mats.splat[1], 0.7, P0.x, P0.z + 0.2, 1.3, 0.0115)); });
    }
    if (t < RIP) {
      // held across him, stretched, shaking with it
      const shake = Math.sin(t * 40) * 0.008 * strain;
      A.position.set(P0.x - 0.03 * strain + shake, P0.y, P0.z); A.rotation.set(0, 0, -0.06 * strain);
      B.position.set(P0.x + 0.03 * strain - shake, P0.y, P0.z); B.rotation.set(0, 0, 0.06 * strain);
    } else {
      // it gives all at once: the two halves thrown apart, end over end, and down on the tiles
      if (!this.fly) this.fly = [{ h: A, v: V(-2.6, 1.6, 0.9), w: -5, lie: -Math.PI / 2 }, { h: B, v: V(2.4, 1.3, 0.8), w: 4.4, lie: Math.PI / 2 }];
      for (const q of this.fly) {
        if (q.rest) continue;
        q.v.y -= 9.8 * dt; q.h.position.addScaledVector(q.v, dt); q.h.rotation.z += q.w * dt;
        if (q.h.position.y < 0.13 && q.v.y < 0) { // landed: a bounce, then flat
          q.h.position.y = 0.13; q.v.multiplyScalar(0.25); q.v.y *= -0.6; q.w *= 0.3;
          this.audio.bodyDrop({ x: q.h.position.x, y: 0, z: q.h.position.z }); this.audio.splash(1.4);
          this.scene.add(decal(this.mats.pool[0], 1.2, q.h.position.x, q.h.position.z, Math.random() * 6, 0.012));
          if (Math.abs(q.v.y) < 0.6) q.rest = true;
        }
        if (q.rest) q.h.rotation.z = q.lie;
      }
      for (const w of [A, B]) w.position.x = Math.max(-3.6, Math.min(3.6, w.position.x)); // the walls
    }
    sp.sync();
    // his hands: the hook in your chest, the hand round your thigh; when you go, flung wide with the halves, then down
    const onA = (lp) => you.torso.localToWorld(lp.clone()).applyMatrix4(A.matrixWorld);
    const onB = (lp) => you.legs[1].localToWorld(lp.clone()).applyMatrix4(B.matrixWorld);
    const fling = ease((t - RIP) / 0.3), lower = ease((t - RIP - 1.6) / 1.2);
    const staring = this.stare(7.6, 1.8);
    if (!staring) { this.pose({ mode: 'walk', jaw: t < RIP ? 0.3 + strain * 0.5 : 1.1, twitch: this.twitch(0.08) }); f.torso.rotation.x = t < RIP ? 0.22 + strain * 0.12 : 0.1; f.neck.rotation.x = t < RIP ? -0.25 : -0.5 * (1 - lower); }
    // each hand on the half on its own side (no crossing over), thrown out with it, then hanging at his sides:
    // every target within the arm's reach, so the arm bends instead of locking out straight
    f.root.updateMatrixWorld(true);
    const sA = f.arms[0].sh.getWorldPosition(V()), sB = f.arms[1].sh.getWorldPosition(V());
    const [ja, jb] = sA.x < sB.x ? [0, 1] : [1, 0], shA = ja ? sB : sA, shB = jb ? sB : sA;
    // the grips: on top of each half, a hand's width either side of the tear, on his side of the body
    A.updateMatrixWorld(true); B.updateMatrixWorld(true);
    // under each half, elbows down, the way you'd carry something heavy across you
    if (t < RIP || !this.holdA) { this.holdA = A.localToWorld(V(-0.3, -0.09, -0.04)); this.holdB = B.localToWorld(V(0.36, -0.08, -0.04)); }
    if (!staring && lower < 1) {
      // thrown out with the halves, then his arms come back down into his own stance: the IK hands over to the pose
      const rest = f.arms.map((a) => ({ q: a.sh.quaternion.clone(), e: a.el.rotation.x }));
      const hA = t < RIP ? this.holdA : this.holdA.clone().lerp(shA.clone().add(V(-0.5, 0.22, 0.3)), fling);
      const hB = t < RIP ? this.holdB : this.holdB.clone().lerp(shB.clone().add(V(0.5, 0.22, 0.3)), fling);
      this.reach(ja, hA); this.reach(jb, hB);
      if (lower > 0) f.arms.forEach((a, j) => { a.sh.quaternion.slerp(rest[j].q, lower); a.el.rotation.set(lerp(a.el.rotation.x, rest[j].e, lower), 0, 0); });
    }
    // the rip: it all comes out of you at once, up and out over everything
    this.at(RIP, 'rip', () => {
      const gap = onA(V(0, 0.16, 0)).lerp(onB(V(0, 0.42, 0)), 0.5);
      this.audio.tear(); this.audio.gib(1.3); this.audio.roar({ x: 0, y: 2, z: 0 });
      this.shake = 1.6; this.flash = 0.35;
      for (const d of [V(0, 1, 0.6), V(-1, 0.6, 0.5), V(1, 0.6, 0.5), V(0, 0.2, 1), V(0, -0.5, 0.8)]) this.gore.spray(gap, d, 260, 4.5, 0.7);
      const bits = [...organSet(this.mats), eyeball(this.mats), guts(this.mats, 0.08, 4), guts(this.mats, 0.07, 3)];
      for (let i = 0; i < 8; i++) bits.push(meatChunk(this.mats, Math.random));
      this.drop(bits, gap, 3.2, 0.6);
      this.gore.burst(gap, 16, 4, 0.7);
      this.scene.add(guts(this.mats, 0.22).translateX(gap.x).translateZ(gap.z + 0.3));
      for (let i = 0; i < 7; i++) this.scene.add(decal(this.mats.splat[(Math.random() * 4) | 0], 0.8 + Math.random() * 1.4, gap.x + (Math.random() - 0.5) * 3, gap.z + Math.random() * 1.6, Math.random() * 6, 0.011 + i * 0.0005));
    });
    this.at(RIP + 0.35, 'rain', () => this.audio.spatter(1.2));
    // the camera: in front of you both; in closer as it gives; pulled back by the burst, down over the mess; him
    if (!staring) this.shots([[0, V(0.5, 1.55, 2.7), V(0.15, 1.3, 0)], [PULL, V(0.7, 1.45, 2.1), V(0.15, 1.25, 0.1)], [RIP, V(0.85, 1.35, 1.8), V(0.1, 1.2, 0.2)], [RIP + 0.5, V(0.7, 1.7, 4.3), V(0.1, 1.15, 0.2)], [RIP + 2.4, V(1.3, 1.6, 2.9), V(0.3, 0.35, 0.4)], [7.6, V(0.9, 1.5, 2.6), V(0.0, 0.6, 0.3)]]);
    this.fear = 1;
    this.at(this.dur - 0.5, 'black', () => (this.blackout = 1));
  }

  // ---------- 8: minced (third person) ----------
  // On your back in the feed trough of the big mincer, head first. He has you by the ankles and pushes, and keeps
  // pushing; on the far side of the machine you come out of the plate, and everything else that was you comes with it.
  mincedBuild() {
    this.dur = 12.8;
    const s = this.scene, m = this.mats;
    this.stage(11, 8, V(-1.1, 0, 0.7), V(-0.8, 1, 0));
    const out = new THREE.PointLight(0xffe0c8, 9, 6, 1.5); out.position.set(1.6, 2.2, 1.0); s.add(out); // over the outlet side
    const steelM = new THREE.MeshStandardMaterial({ color: 0x8a9094, roughness: 0.4, metalness: 0.85 });
    const paint = new THREE.MeshStandardMaterial({ color: 0x3a4a3e, roughness: 0.6, metalness: 0.4 }); // old machine green
    const gore = new THREE.MeshStandardMaterial({ color: 0x4a0a06, roughness: 0.3, metalness: 0.3 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x050101 });
    const box = (w, h, d, mat, x, y, z) => { const b = mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); s.add(b); return b; };
    // the machine: a block with a mouth on this side and the plate on the other; the motor on top
    box(1.2, 0.88, 1.0, paint, 0, 0.44, 0); box(1.2, 0.25, 1.0, paint, 0, 1.445, 0); box(0.8, 0.44, 1.0, paint, 0.2, 1.1, 0);
    for (const z of [-1, 1]) box(0.4, 0.44, 0.19, paint, -0.4, 1.1, z * 0.405);
    box(0.02, 0.44, 0.62, dark, -0.21, 1.1, 0); // the dark inside
    const motor = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 24), paint); motor.rotation.x = Math.PI / 2; motor.position.set(0.15, 1.85, 0); s.add(motor);
    for (const z of [-0.42, 0.42]) { const cap = mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.04, 24), steelM); cap.rotation.x = Math.PI / 2; cap.position.set(0.15, 1.85, z); s.add(cap); }
    // the mouth's steel lip, stained
    box(0.08, 0.06, 0.78, steelM, -0.62, 1.35, 0); box(0.08, 0.04, 0.78, steelM, -0.62, 0.86, 0);
    for (const z of [-1, 1]) box(0.08, 0.5, 0.08, steelM, -0.62, 1.1, z * 0.35);
    box(0.01, 0.28, 0.5, gore, -0.205, 1.02, 0);
    // the rollers, teeth turning in
    this.rollers = [1.0, 1.22].map((y, k) => {
      const r = new THREE.Group(); r.position.set(-0.36, y, 0); s.add(r);
      r.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.6, 16), k ? steelM : gore));
      for (let i = 0; i < 24; i++) { const a = (i % 8) / 8 * Math.PI * 2, tooth = mesh(new THREE.ConeGeometry(0.02, 0.06, 4), steelM, false); tooth.position.set(Math.cos(a) * 0.09, (Math.floor(i / 8) - 1) * 0.2, Math.sin(a) * 0.09); tooth.rotation.z = -Math.PI / 2 + a; r.add(tooth); }
      r.rotation.x = Math.PI / 2;
      return r;
    });
    // the outlet and its plate, this side of the machine
    const neck = mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.32, 24), steelM); neck.rotation.z = Math.PI / 2; neck.position.set(0.76, 0.78, 0); s.add(neck);
    const plate = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 24), gore); plate.rotation.z = Math.PI / 2; plate.position.set(0.93, 0.78, 0); s.add(plate);
    const ring = mesh(new THREE.TorusGeometry(0.145, 0.02, 8, 24), steelM); ring.rotation.y = Math.PI / 2; ring.position.set(0.94, 0.78, 0); s.add(ring);
    this.nozzle = V(0.96, 0.78, 0);
    // the panel: a lamp lit red, a big stop button nobody pressed
    box(0.3, 0.4, 0.04, steelM, 0.25, 1.05, 0.52);
    const lampR = mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1a08, emissiveIntensity: 3 })); lampR.position.set(0.18, 1.17, 0.55); s.add(lampR);
    const stop = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0xb01008, roughness: 0.4 })); stop.rotation.x = Math.PI / 2; stop.position.set(0.3, 1.0, 0.55); s.add(stop);
    // the feed trough: a steel channel up to the mouth, on legs
    box(2.1, 0.03, 0.62, steelM, -1.66, 0.87, 0);
    for (const z of [-1, 1]) box(2.1, 0.12, 0.02, steelM, -1.66, 0.94, z * 0.31);
    for (const [x, z] of [[-2.6, -0.25], [-2.6, 0.25], [-0.8, -0.25], [-0.8, 0.25]]) box(0.04, 0.86, 0.04, steelM, x, 0.43, z);
    s.add(decal(m.pool[0], 1.2, -0.9, 0, 0.5));
    // you, on your back, head to the mouth; everything past the lip is gone into it
    this.you = makeWorker(m);
    const you = this.you;
    orient(you.root, V(1, 0, 0), V(0, 1, 0)); you.root.position.set(-1.55, 1.0, 0);
    this.lip = new THREE.Plane(V(-1, 0, 0), -0.42);
    const red = new THREE.MeshStandardMaterial({ color: 0x3a0503, roughness: 0.4, side: THREE.BackSide, clippingPlanes: [this.lip] });
    const ms = []; you.root.traverse((o) => { if (o.isMesh) ms.push(o); });
    for (const o of ms) { o.material = Object.assign(o.material.clone(), { clippingPlanes: [this.lip] }); o.add(new THREE.Mesh(o.geometry, red)); }
    s.add(you.root);
    // him, at your feet, facing the machine
    this.him.root.position.set(-3.25, 0, 0); this.him.root.rotation.y = Math.PI / 2;
    this.cleaver(false);
    this.audio.grinder(true);
  }
  mincedUpdate(dt) {
    const t = this.t, you = this.you, f = this.him;
    const PUSH = 1.6, GRIND = 2.8, LAST = 8.8, X0 = -1.55, X1 = 0.45;
    const grinding = t > GRIND && t < LAST + 0.3;
    for (const [k, r] of this.rollers.entries()) r.rotation.y += dt * (grinding ? 16 : 7) * (k ? -1 : 1);
    // you: fighting it, until your head's in
    const alive = t < GRIND + 0.3 ? 1 : t < 6 ? 0.25 : 0;
    const p = clamp01((t - PUSH) / (LAST - PUSH)), jerk = grinding ? Math.abs(Math.sin(t * 11)) * 0.012 : 0;
    you.root.position.set(lerp(X0, X1, p) - jerk, 1.0 + (grinding ? Math.sin(t * 37) * 0.006 : 0), 0);
    you.arms.forEach((a, i) => a.rotation.set(-2.6 + Math.sin(t * (8 + i)) * 0.6 * alive, 0, (i ? 1 : -1) * (0.2 + Math.abs(Math.sin(t * 6 + i)) * 0.5 * alive))); // up over your head, clawing at the lip
    you.legs.forEach((l, i) => l.rotation.set(Math.sin(t * 9 + i * 2) * 0.35 * alive, 0, (i ? -1 : 1) * 0.08));
    you.jaw.rotation.x = 0.4 + Math.abs(Math.sin(t * 6)) * 0.5 * alive;
    you.root.updateMatrixWorld(true);
    // him: a hand round each ankle, leaning in, a step at a time after you
    const ankle = (i) => { const h = you.legs[i].getWorldPosition(V()), k = you.legs[i].userData.knee.getWorldPosition(V()); return k.clone().add(k.clone().sub(h).normalize().multiplyScalar(0.4)); };
    const a0 = ankle(0), a1 = ankle(1), mid = a0.clone().lerp(a1, 0.5);
    const staring = this.stare(LAST + 1.6, this.dur - LAST - 2, 1.1); // up and over the machine, not through it
    if (!staring) {
      // from the end of the trough, then round to its far side once you're in it: he walks beside the steel, never in it
      if (t < LAST + 0.3) {
        const side = ease(clamp01((mid.x + 2.6) / 0.45));
        f.root.position.x = lerp(Math.min(-3.05, mid.x - 0.82), Math.min(-1.05, mid.x - 0.45), side);
        f.root.position.z = -0.8 * side;
        f.root.rotation.y = lerp(Math.PI / 2, 0.55, side);
      }
      this.pose({ mode: 'walk', gait: t * 1.5, speed: t > PUSH && t < LAST ? 0.4 : 0, jaw: 0.35, twitch: this.twitch(0.05) });
      f.torso.rotation.x = 0.55; f.neck.rotation.x = -0.2;
    }
    if (t < LAST + 0.3) { this.reach(0, a0.clone().add(V(0, 0.06, 0))); this.reach(1, a1.clone().add(V(0, 0.06, 0))); }
    else if (!staring) { const k = ease((t - LAST - 0.3) / 0.6); this.reach(0, a0.clone().add(V(-0.3, 0.3 * k, -0.3 * k))); this.reach(1, a1.clone().add(V(-0.3, 0.3 * k, 0.3 * k))); }
    // into the rollers: the bite, the screaming stops
    this.at(GRIND, 'bite', () => { this.audio.crunch(1.2); this.audio.squelch(2); this.audio.scream(); this.shake = 0.8; this.gore.spray(V(-0.62, 1.15, 0), V(-1, 0.6, 0), 120, 2.4, 0.6); });
    if (grinding) {
      this.shake = Math.max(this.shake, 0.18);
      if (Math.random() < dt * 4) this.audio.grind();
      if (Math.random() < dt * 3) this.audio.crunch(0.7);
      if (t > GRIND + 0.3) { // out of the plate, all of it
        this.gore.spray(this.nozzle, V(1, 0.15, 0), Math.ceil(dt * 520), 3.2, 0.35);
        this.mince = (this.mince || 0) + dt;
        if (this.mince > 0.12) { this.mince = 0; this.gore.fling([meatChunk(this.mats, Math.random)], this.nozzle, V(1, 0.3, 0), 2.6); }
      }
      if (Math.random() < dt * 6) this.gore.spray(V(-0.62, 1.1, 0), V(-1, 0.4, 0), 12, 1.4, 0.5); // and back out of the mouth
    }
    const o = (at, key, make, sp = 3) => this.at(at, key, () => { this.gore.fling([].concat(make()), this.nozzle, V(1, 0.35, 0), sp); this.audio.squelch(1.4); this.audio.splash(1); });
    o(3.5, 'eye1', () => eyeball(this.mats), 3.6); o(3.65, 'eye2', () => eyeball(this.mats), 3.2);
    o(4.3, 'heart', () => heart(this.mats)); o(4.9, 'lung', () => lung(this.mats)); o(5.5, 'liver', () => liver(this.mats), 2.6);
    o(6.1, 'kid', () => [kidney(this.mats), kidney(this.mats)]); o(6.8, 'guts', () => guts(this.mats, 0.09, 4), 2.4); o(7.4, 'stom', () => stomach(this.mats), 2.8);
    for (let i = 0; i < 4; i++) o(4 + i * 1.2, 'bone' + i, () => mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.12 + Math.random() * 0.15, 8), this.mats.bone), 3.4);
    this.at(LAST, 'last', () => { // the end of you goes through, and the machine coughs out the rest in one go
      this.audio.gib(1.3); this.shake = 1.1;
      for (const d of [V(1, 0.5, 0), V(1, 0.2, 0.4), V(1, 0.2, -0.4)]) this.gore.spray(this.nozzle, d, 220, 4, 0.5);
      const bits = []; for (let i = 0; i < 10; i++) bits.push(meatChunk(this.mats, Math.random));
      this.gore.fling(bits, this.nozzle, V(1, 0.5, 0), 3.2);
      for (let i = 0; i < 6; i++) this.scene.add(decal(this.mats.splat[(Math.random() * 4) | 0], 0.8 + Math.random(), 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.6, Math.random() * 6, 0.011 + i * 0.0005));
      this.scene.add(guts(this.mats, 0.16).translateX(2.0).translateZ(0.2));
      this.audio.grinder(false);
    });
    this.at(LAST + 0.4, 'rain', () => this.audio.spatter(1.2));
    // the camera: the two of you and the machine; your face at the mouth; then the far side, where it comes out;
    // him, still pushing; the whole of it; the plate's last cough; him
    if (!staring) this.shots([[0, V(-1.1, 2.0, 4.2), V(-1.0, 1.1, 0)], [PUSH, V(-1.0, 1.45, 1.35), V(-0.7, 1.05, 0)], [GRIND + 0.2, V(-0.95, 1.4, 1.25), V(-0.6, 1.05, 0)],
      [GRIND + 0.25, V(2.3, 1.15, 2.1), V(1.4, 0.6, 0)], [5.6, V(2.0, 1.1, 1.8), V(1.5, 0.5, 0)], [5.65, V(-2.6, 1.8, 2.5), V(-1.6, 1.25, 0)], [7.3, V(-2.2, 1.9, 2.6), V(-1.2, 1.2, 0)],
      [7.35, V(0.0, 2.4, 4.8), V(-0.3, 1.0, 0)], [LAST - 0.1, V(0.2, 2.3, 4.6), V(-0.2, 1.0, 0)], [LAST - 0.05, V(2.1, 1.0, 1.7), V(1.5, 0.45, 0)], [LAST + 1.6, V(1.9, 1.1, 1.9), V(1.4, 0.3, 0)]]);
    this.fear = 1;
    this.at(this.dur - 0.5, 'black', () => (this.blackout = 1));
  }

  // ---------- 13: run down (third person, B10 only) ----------
  // On the factory floor. You're on your back on the concrete, pushing yourself away. Down the aisle the work lights
  // of a forklift come on; he's folded into the seat, knees up round the wheel. He drives straight at you. The forks
  // knock you down and the wheel goes over you; he stops, backs up over you again, and parks with the wheel on you.
  // Then he turns his head and looks at you.
  forkliftBuild() {
    this.dur = 11;
    const s = this.scene, m = this.mats;
    this.stage(10, 34, V(0.6, 0, 0.6), V(0.4, 0.4, 0.2));
    s.fog.density = 0.07;
    // the aisle: a conveyor down one side, crates and drums on the other, a pipe run overhead
    for (const z of [-12, -7.8, -3.6, 0.6]) { const c = conveyor(m, Math.random, 3.6); c.position.set(-2.6, 0, z); c.rotation.y = Math.PI / 2; s.add(c); }
    for (const z of [-10, -4, 3.5]) { const c = crateStack(m, Math.random); c.position.set(3.7, 0, z); s.add(c); }
    const pr = pipeRun(m, 30, Math.random); pr.position.set(-1.6, 3.1, -6); pr.rotation.y = Math.PI / 2; s.add(pr);
    // lamps down the aisle, most of them dead: he drives through what light there is
    for (const z of [-5.5, -11]) { const lp = makeLamp(m, 'bulb'); lp.position.set(0.2, 3.1, z); s.add(lp); const sp = new THREE.SpotLight(0xfff0dc, 30, 8, 0.9, 0.6, 1.3); sp.position.set(0.2, 3.0, z); sp.target.position.set(0.2, 0, z); s.add(sp, sp.target); }
    // the truck, his seat, and his own lights
    const fk = forklift(m, () => 0.9); // (0.9: nobody else at the wheel)
    fk.position.set(0, 0, -14); s.add(fk);
    this.fk = fk; this.fkU = fk.userData;
    this.fkU.carriage.position.y = 0.22; // forks carried just off the floor
    this.lights = [];
    for (const sx of [-1, 1]) {
      const l = new THREE.SpotLight(0xfff2dc, 0, 16, 0.45, 0.5, 1.3); l.position.set(sx * 0.47, 1.95, 0.72); l.target.position.set(sx * 0.3, 0, 7); fk.add(l, l.target); this.lights.push(l);
    }
    const dash = new THREE.PointLight(0xff5030, 0, 1.6, 2); dash.position.set(0, 1.5, 0.25); fk.add(dash); this.dash = dash; // the dash lights his face from below
    // him, folded into the seat: knees up either side of the wheel
    const f = this.him;
    fk.add(f.root); f.root.position.set(0, 0.07, -0.33); f.root.rotation.y = 0;
    // you
    this.you = makeWorker(m);
    const you = this.you; s.add(you.root);
    this.youX = 0.48; // in line with his right front wheel
    const tmp = new THREE.Object3D();
    orient(tmp, V(0, 0.5, 1), V(0, 1, -0.5)); this.propQ = tmp.quaternion.clone(); // up on your elbows, feet toward him
    orient(tmp, V(0.1, 0.02, 1), V(0, 1, 0)); this.flatQ = tmp.quaternion.clone(); // flat on your back
    orient(tmp, V(0, 1, 0.35), V(0, 0.35, -1)); this.upQ = tmp.quaternion.clone(); // halfway up
    this.squash = 1;
  }
  forkliftUpdate(dt) {
    const t = this.t, f = this.him, fk = this.fk, U = this.fkU, you = this.you;
    const START = 1.4, HIT = 4.2, STOP = 5.6, BACK = 6.3, PARK = 7.6, LOOK = 8.0;
    // where the truck is: idling; flat out at you; rolling on over you; a stop; back over you; parked on you
    let z;
    if (t < START) z = -14;
    else if (t < HIT) z = -14 + 13.7 * Math.pow((t - START) / (HIT - START), 1.5);
    else if (t < STOP) z = -0.3 + 3.8 * (1 - Math.pow(1 - (t - HIT) / (STOP - HIT), 2));
    else if (t < BACK) z = 3.5;
    else if (t < PARK) z = 3.5 - 3.3 * ease((t - BACK) / (PARK - BACK));
    else z = 0.2;
    const dz = z - fk.position.z;
    fk.position.z = z;
    for (const w of U.wheels) w.rotation.x += dz / (w.position.y || 0.3);
    // the right side rides up over you, and drops
    const yz = 0.75, bump = (wz) => { const d = Math.abs(wz - yz); return d < 0.35 && t > HIT ? (1 - d / 0.35) * 0.12 : 0; };
    const lift = Math.max(bump(z + 0.55), bump(z - 0.62));
    fk.rotation.z = -lift * 0.9; fk.position.y = lift * 0.45;
    U.steer.rotation.y = Math.sin(t * 2.3) * 0.15 * (t > START && t < PARK ? 1 : 0);
    // lights and engine
    this.at(1.0, 'lights', () => { for (const l of this.lights) l.intensity = 60; this.dash.intensity = 3; this.flash = 0.25; this.audio.clank(V(0, 1, -14), 1); });
    this.at(1.15, 'engine', () => { this.audio.engine(true); this.audio.rev(0.3); this.audio.roar(V(0, 2, -14)); });
    this.at(START, 'go', () => this.audio.rev(1));
    this.at(STOP - 0.3, 'brake', () => { this.audio.rev(0.1); this.audio.creak(V(0, 0.5, 3.5)); });
    this.at(BACK, 'rev2', () => { this.audio.rev(0.8); this.audio.growl(V(0, 2, 3.5), 1); });
    this.at(PARK - 0.2, 'idle', () => this.audio.rev(0.05));
    // him at the wheel: hunched under the roof, knees up, hands on the rim
    const staring = t > LOOK;
    this.pose({ mode: 'walk', jaw: staring ? 0.95 : 0.3 + Math.sin(t * 6) * 0.15, twitch: staring ? { x: 0, y: 0, z: 0, r: 0 } : this.twitch(0.05) });
    f.hips.position.y = 1.15; f.hips.rotation.y = 0;
    f.legs.forEach((l, i) => { l.thigh.rotation.set(-1.85, 0, (i ? -1 : 1) * 0.42); l.knee.rotation.x = 2.05; });
    f.torso.rotation.set(0.55, 0, 0);
    f.neck.rotation.x = -0.45;
    if (staring) { // his head comes round, too far, to look back at you
      const k = ease((t - LOOK) / 0.5);
      f.head.rotation.set(-0.1 * k, 1.15 * k, 0.3 * k);
      this.at(LOOK + 0.1, 'stare', () => { this.audio.jumpscare(0.7); this.flash = 0.3; });
    }
    if (f.apron) f.apron.update(f);
    fk.updateMatrixWorld(true);
    const rimAt = (a) => U.steer.localToWorld(V(Math.cos(a) * 0.17, 0.02, Math.sin(a) * 0.17));
    this.reach(0, rimAt(Math.PI + 0.5 + U.steer.rotation.y)); this.reach(1, rimAt(-0.5 + U.steer.rotation.y));
    if (f.poseR) {} // (the remastered motion is part of pose())
    // you: pushing yourself back along the floor, trying to get up, knocked flat, run over
    const crawl = Math.min(t, HIT) * 0.15;
    if (t < 3.5) {
      you.root.quaternion.copy(this.propQ); you.root.position.set(this.youX, 0.3, crawl);
      you.legs.forEach((l, i) => l.rotation.set(-0.4 + Math.sin(t * 8 + i * 3) * 0.45, 0, (i ? -1 : 1) * 0.15));
      you.arms.forEach((a, i) => a.rotation.set(0.9 + Math.sin(t * 8 + i * 3) * 0.2, 0, (i ? 1 : -1) * 0.5));
      you.neck.rotation.set(0.5, 0, 0); you.jaw.rotation.x = 0.5;
    } else if (t < HIT) { // up on one knee, too late
      const k = ease((t - 3.5) / 0.6);
      you.root.quaternion.slerpQuaternions(this.propQ, this.upQ, k); you.root.position.set(this.youX, lerp(0.3, 0.7, k), crawl);
      you.arms.forEach((a, i) => a.rotation.set(-1.6, 0, (i ? 1 : -1) * 0.4)); // hands up at the lights
      you.jaw.rotation.x = 0.7;
    } else { // down, under it
      const k = ease((t - HIT) / 0.25);
      you.root.quaternion.slerpQuaternions(this.upQ, this.flatQ, k); you.root.position.set(this.youX, lerp(0.7, 0.13, k), lerp(crawl, 0.75, k));
      you.legs.forEach((l, i) => l.rotation.set(0.1, 0, (i ? -1 : 1) * 0.3)); you.arms.forEach((a, i) => a.rotation.set(-0.4, 0, (i ? 1 : -1) * 1.1));
      you.neck.rotation.set(-0.2, 0, 0.4); you.jaw.rotation.x = 0.6;
      if (lift > 0.06 && !this.flat) this.flatten(); // what the wheel does
      you.root.position.y -= (1 - this.squash) * 0.08;
    }
    this.at(0.25, 'scream', () => this.audio.scream());
    this.at(HIT, 'hit', () => { this.audio.punch(1.4, 0.6); this.audio.clank(V(this.youX, 0.6, 0.6), 1.2); this.shake = 1.2; this.audio.wheeze(0.8); });
    this.at(HIT + 0.35, 'over1', () => this.crush(1));
    this.at(STOP - 0.35, 'over2', () => this.crush(0.7));
    this.at(PARK - 0.6, 'over3', () => this.crush(0.9));
    this.at(PARK + 0.3, 'rain', () => this.audio.spatter(1));
    // the camera: down the aisle from behind you; the lights coming on; him coming, from the side; your eyes; under the
    // wheel; from above as he backs over you; and his face
    if (!staring && t >= START && t < 3.05) { // riding alongside him as he comes
      const k = ease((t - START) / 1.65);
      this.cam.position.set(lerp(2.0, 1.5, k), lerp(1.3, 1.7, k), z + lerp(2.8, 1.6, k));
      this.cam.lookAt(V(0, 1.55, z + 0.1));
    } else if (!staring) this.shots([[0, V(this.youX + 0.5, 0.55, 2.4), V(0, 0.9, -10)], [START - 0.1, V(this.youX + 0.45, 0.6, 2.2), V(0, 1.3, -10)], [3.05, V(this.youX + 0.75, 0.75, 1.7), V(0, 1.7, -2.5)], [HIT - 0.05, V(this.youX + 0.8, 0.8, 1.6), V(0, 1.8, -0.8)],
      [HIT, V(2.0, 0.45, 1.8), V(this.youX, 0.3, 0.6)], [STOP, V(2.2, 0.5, 2.2), V(this.youX, 0.3, 1.0)], [STOP + 0.05, V(2.4, 3.4, 3.2), V(0.3, 0.3, 1.2)], [PARK, V(2.0, 3.6, 2.6), V(0.3, 0.6, 0.8)]]);
    else {
      const hp = this.headPos(); if (!this.stareFrom) this.stareFrom = hp.clone().add(V(1.9, 0.1, 1.5)); // (a cut: outside the cab, beside him)
      const to = hp.clone().add(V(0.95, -0.05, 0.75)); const k = ease((t - LOOK - 0.2) / 1.6);
      this.cam.position.lerpVectors(this.stareFrom, to, k); this.cam.lookAt(hp);
    }
    this.fear = 1;
    this.at(this.dur - 0.5, 'black', () => (this.blackout = 1));
  }
  // the wheel going over you
  crush(w) {
    const you = this.you, at = you.torso.getWorldPosition(V());
    this.audio.crunch(1.2 * w); this.audio.gib(0.6 * w); this.shake = 0.8 + w * 0.5;
    this.gore.spray(at, V(1, 0.3, 0), 160 * w, 3 * w, 0.8); this.gore.spray(at, V(-1, 0.3, 0.2), 120 * w, 2.5 * w, 0.7);
    this.scene.add(decal(this.mats.splat[(Math.random() * 4) | 0], 1.0 + w, at.x + (Math.random() - 0.5) * 0.6, at.z + (Math.random() - 0.5) * 0.6, Math.random() * 6, 0.011 + Math.random() * 0.001));
  }
  flatten() {
    this.flat = true;
    const you = this.you, at = you.torso.getWorldPosition(V());
    if (THREE.gore.less) return;
    this.squash = 0.35;
    you.torso.scale.z *= 0.4; you.torso.scale.x *= 1.25; you.head.scale.set(1.3, 0.85, 0.45);
    this.drop([...organSet(this.mats), guts(this.mats, 0.08, 4), meatChunk(this.mats, Math.random), meatChunk(this.mats, Math.random)], at.clone().add(V(0.3, 0.1, 0)), 1.4, 0.3);
    this.scene.add(guts(this.mats, 0.16).translateX(at.x + 0.35).translateZ(at.z));
    this.scene.add(decal(this.mats.pool[0], 2.4, at.x, at.z, 0.4, 0.0125));
  }

  // ---------- 10: beaten (third person) ----------
  // He holds you up by the collar on his hook and hits you, and keeps hitting you. Then he drops you, and kneels over
  // you, and brings both fists down until there's nothing there to hit.
  beatenBuild() {
    this.dur = 12;
    const s = this.scene, m = this.mats;
    this.stage(9, 9, V(0.6, 0, 1.0), V(0, 1.2, 0.3));
    const face = new THREE.PointLight(0xffd8c0, 5, 5, 1.6); face.position.set(1.0, 2.4, 1.0); s.add(face);
    s.add(decal(m.pool[1] || m.pool[0], 1.4, 0.3, 0.6, 0.3));
    this.you = makeWorker(m);
    const you = this.you;
    you.root.position.set(0.05, 1.2, 0.35); you.root.rotation.y = Math.PI; // facing him, off the floor
    this.bruise = []; you.root.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); this.bruise.push({ m: o.material, c: o.material.color.clone(), r: o.material.roughness }); } });
    s.add(you.root);
    this.him.root.position.set(0, 0, -0.45); this.him.root.rotation.y = 0;
    this.cleaver(false);
    // where you end up: on your back on the floor at his feet, head to his left
    const tmp = new THREE.Object3D(); orient(tmp, V(1, 0, 0), V(0, 1, 0)); this.lieQ = tmp.quaternion.clone(); this.standQ = you.root.quaternion.clone();
    this.hits = 0;
  }
  beatenUpdate(dt) {
    const t = this.t, you = this.you, f = this.him;
    const P0 = 1.2, EACH = 0.68, NP = 6, DROP = P0 + NP * EACH + 0.2, POUND = [DROP + 1.0, DROP + 1.65, DROP + 2.2, DROP + 2.65, DROP + 3.0, DROP + 3.3], GONE = POUND[POUND.length - 1];
    const hurt = (k) => { this.hits++; const d = Math.min(1, this.hits / 9); for (const b of this.bruise) { b.m.color.copy(b.c).lerp(new THREE.Color(0x4a0705), d * 0.85); b.m.roughness = lerp(b.r, 0.3, d); } this.recoil = k; };
    this.recoil = Math.max(0, (this.recoil || 0) - dt * 5);
    const r = this.recoil;
    const alive = t < DROP ? 1 - clamp01((t - P0) / (NP * EACH)) * 0.8 : 0;
    if (t < DROP) { // held up by the collar, kicking, head snapped back with each one
      you.root.position.set(0.05, 1.2, 0.35 + r * 0.08); you.root.quaternion.copy(this.standQ);
      you.root.rotateX(-r * 0.25);
      you.neck.rotation.set(-r * 0.8 + Math.sin(t * 7) * 0.1 * alive, Math.sin(t * 3) * 0.2, 0);
      you.legs.forEach((l, i) => l.rotation.set(Math.sin(t * 9 + i * 2) * 0.5 * alive, 0, (i ? -1 : 1) * 0.06));
      you.arms.forEach((a, i) => a.rotation.set(-1.0 + Math.sin(t * (7 + i)) * 0.5 * alive, 0, (i ? 1 : -1) * 0.3)); // hands at his arm
      you.jaw.rotation.x = 0.3 + Math.abs(Math.sin(t * 5)) * 0.4 * alive + r * 0.4;
    } else if (!this.gone) { // dropped
      const k = clamp01((t - DROP) / 0.45), kk = k * k;
      you.root.position.set(lerp(0.05, -0.4, k), lerp(1.2, 0.14, kk), lerp(0.35, 0.6, k));
      you.root.quaternion.slerpQuaternions(this.standQ, this.lieQ, ease(k));
      you.neck.rotation.set(0.1 + r * 0.6, 0, 0.4); you.jaw.rotation.x = 0.5;
      you.arms.forEach((a, i) => a.rotation.set(-0.3, 0, (i ? 1 : -1) * 0.5)); you.legs.forEach((l) => l.rotation.set(0, 0, 0));
      you.root.position.y += r * 0.04 * Math.sin(t * 40);
    }
    you.root.updateMatrixWorld(true);
    const staring = this.stare(GONE + 1.3, this.dur - GONE - 1.7);
    if (!staring) { this.pose({ mode: 'walk', jaw: 0.4 + r * 0.4, twitch: this.twitch(0.06) }); f.neck.rotation.x = -0.2; }
    if (t < DROP) {
      // the hook through your collar; the other hand drawn back and driven in, face, gut, face
      f.torso.rotation.x = 0.25;
      this.reach(1, you.torso.localToWorld(V(0, 0.5, 0.13)).add(V(0, 0.05, 0)));
      const n = Math.floor((t - P0) / EACH), ph = (t - P0) / EACH - n;
      const tgt = n % 3 === 1 ? you.torso.localToWorld(V(0, 0.2, 0.16)) : you.head.localToWorld(V(0, 0.02, 0.12));
      const back = f.arms[0].sh.getWorldPosition(V()).add(V(-0.25, -0.15, -0.35));
      const k = t < P0 ? 0 : ph < 0.6 ? ease(ph / 0.6) * 0.15 : ph < 0.75 ? 0.15 + ease((ph - 0.6) / 0.15) * 0.85 : 1 - ease((ph - 0.75) / 0.25);
      this.reach(0, back.lerp(tgt, k));
      if (t > P0 && n < NP && ph > 0.75 && !this['h' + n]) {
        this['h' + n] = true;
        const wet = n / NP;
        this.audio.punch(1.1, wet); if (n % 2) this.audio.wheeze(0.6); if (n > 2) this.audio.crunch(0.5 + wet * 0.5);
        this.shake = 0.5 + wet * 0.6; hurt(1);
        this.gore.spray(tgt, V(0.3, 0.4, 1), 30 + n * 25, 2 + wet * 2, 0.6);
        if (n === 3 || n === 5) this.gore.fling([mesh(new THREE.BoxGeometry(0.012, 0.016, 0.01), this.mats.bone, false), mesh(new THREE.BoxGeometry(0.012, 0.016, 0.01), this.mats.bone, false)], tgt, V(0.4, 0.5, 1), 2.2); // teeth
        if (n === 4) this.drop([eyeball(this.mats)], tgt, 1.2, 0.3);
      }
    } else {
      // down on you: bent over, both fists up and down together
      const chest = this.gone ? this.goneAt : you.torso.localToWorld(V(0, 0.25, 0.1));
      f.root.position.set(0, 0, lerp(-0.45, -0.15, ease((t - DROP) / 0.6)));
      if (!staring) f.torso.rotation.x = lerp(0.25, 0.85, ease((t - DROP - 0.3) / 0.5));
      let i = POUND.findIndex((p) => t < p); if (i < 0) i = POUND.length;
      const prev = i ? POUND[i - 1] : DROP + 0.4, next = POUND[i] ?? prev, ph = i < POUND.length ? clamp01((t - prev) / (next - prev)) : 1;
      const up = (sx) => chest.clone().add(V(sx * 0.16, 0.95, -0.35)), down = (sx) => chest.clone().add(V(sx * 0.12, 0.14, 0));
      const k = i >= POUND.length ? 1 - ease((t - GONE) / 0.8) * 0.6 : ph < 0.7 ? 1 - ease(ph / 0.7) : ease((ph - 0.7) / 0.3);
      if (!staring) { this.reach(0, down(-1).lerp(up(-1), 1 - k)); this.reach(1, down(1).lerp(up(1), 1 - k)); }
      for (let j = 0; j < POUND.length; j++) this.at(POUND[j], 'p' + j, () => {
        const last = j === POUND.length - 1, w = (j + 1) / POUND.length;
        this.audio.punch(1.4, 1); this.audio.crunch(0.8 + w * 0.4); if (j > 2) this.audio.gib(0.5 + w * 0.5);
        this.shake = 0.8 + w; hurt(1.5);
        this.gore.spray(chest, V(0, 1, 0.3), 120 + j * 60, 2.5 + w * 2, 0.9);
        if (!last && !THREE.gore.less) { you.torso.scale.z *= 0.86; you.head.scale.y *= 0.9; this.drop([meatChunk(this.mats, Math.random), meatChunk(this.mats, Math.random)], chest, 1.6, 0.6); }
        this.scene.add(decal(this.mats.splat[(Math.random() * 4) | 0], 0.8 + w, chest.x + (Math.random() - 0.5) * 1.2, chest.z + (Math.random() - 0.5) * 1.2, Math.random() * 6, 0.011 + j * 0.0005));
        if (last && !THREE.gore.less) { // and then there isn't anything there
          this.gone = true; this.goneAt = chest.clone(); you.root.visible = false;
          const bits = [...organSet(this.mats), eyeball(this.mats), severedHead(this.mats, Math.random), guts(this.mats, 0.08, 4)];
          for (let n = 0; n < 10; n++) bits.push(meatChunk(this.mats, Math.random));
          this.drop(bits, chest.clone().add(V(0, 0.1, 0)), 1.6, 0.5);
          this.gore.burst(chest, 14, 2.5, 0.5);
          for (const d of [V(1, 0.4, 0), V(-1, 0.4, 0), V(0, 0.4, 1), V(0, 1, 0)]) this.gore.spray(chest, d, 200, 3.5, 0.7);
          this.scene.add(guts(this.mats, 0.18).translateX(chest.x).translateZ(chest.z));
          this.scene.add(decal(this.mats.pool[0], 2.6, chest.x, chest.z, 0.4, 0.0125));
        }
      });
      this.at(GONE + 0.3, 'rain', () => this.audio.spatter(1.3));
    }
    this.at(0.3, 'grab', () => { this.audio.scream(); this.audio.growl(f.root.position, 1); });
    // the camera: the two of you; close on your face for the blows; down with you; low, under his fists; the mess; him
    if (!staring) this.shots([[0, V(1.7, 1.8, 2.4), V(0, 1.6, 0)], [P0 - 0.2, V(1.15, 1.75, 1.0), V(0.05, 1.68, 0.2)], [DROP - 0.1, V(1.25, 1.7, 1.15), V(0.05, 1.55, 0.2)], [DROP + 0.5, V(1.5, 1.2, 2.0), V(-0.1, 0.5, 0.5)],
      [POUND[0] - 0.3, V(1.3, 0.55, 1.8), V(-0.1, 0.9, 0.3)], [GONE, V(1.2, 0.6, 1.8), V(-0.1, 0.8, 0.4)], [GONE + 0.4, V(1.0, 1.6, 1.9), V(-0.1, 0.1, 0.6)], [GONE + 1.3, V(1.0, 1.7, 2.0), V(-0.1, 0.3, 0.5)]]);
    this.fear = 1;
    this.at(this.dur - 0.5, 'black', () => (this.blackout = 1));
  }

  // ---------- 11: emptied (third person) ----------
  // The hook through your collar. Two blows of the cleaver and the top of your skull comes off. He puts the cleaver
  // away, reaches in, and draws your brain out of your head, slowly, until the stem gives. He looks at it.
  brainsBuild() {
    this.dur = 10.5;
    const s = this.scene, m = this.mats;
    this.stage(9, 9, V(0.6, 0, 1.0), V(0, 1.4, 0.3));
    const face = new THREE.PointLight(0xffd8c0, 6, 5, 1.6); face.position.set(0.9, 2.7, 0.9); s.add(face);
    s.add(decal(m.pool[1] || m.pool[0], 1.2, 0.2, 0.6, 0.3));
    this.you = makeWorker(m);
    const you = this.you;
    you.root.position.set(0.05, 0.95, 0.38); you.root.rotation.y = Math.PI; // facing him
    this.standQ = you.root.quaternion.clone();
    const tmp = new THREE.Object3D(); orient(tmp, V(1, 0.05, 0), V(0, 1, 0)); this.lieQ = tmp.quaternion.clone();
    s.add(you.root);
    // the skull, cut where the blade goes: everything on the head above the plane (bone, skin, hair) is the cap,
    // a copy of it clipped the other way, which comes away whole
    this.cutY = 2; // (well above the head until the second blow)
    this.skullLow = new THREE.Plane(); this.capHigh = new THREE.Plane();
    you.head.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(you.head.matrixWorld).invert(), top = [];
    you.head.traverse((o) => { if (o.isMesh && new THREE.Box3().setFromObject(o).applyMatrix4(inv).max.y > 0.165) top.push(o); });
    this.cap = new THREE.Group(); this.cap.visible = false; you.head.add(this.cap);
    for (const o of top) {
      const keep = (mt, plane) => Object.assign(mt.clone(), { clippingPlanes: [plane] });
      const copy = new THREE.Mesh(o.geometry, Array.isArray(o.material) ? o.material.map((mt) => keep(mt, this.capHigh)) : keep(o.material, this.capHigh));
      o.updateMatrixWorld(true); copy.matrix.copy(inv).multiply(o.matrixWorld); copy.matrix.decompose(copy.position, copy.quaternion, copy.scale); this.cap.add(copy);
      o.material = Array.isArray(o.material) ? o.material.map((mt) => keep(mt, this.skullLow)) : keep(o.material, this.skullLow);
    }
    let skull = null; for (const c of you.head.children) if (c.isMesh && Math.abs(c.position.y - 0.1) < 0.02 && (!skull || c.geometry.boundingSphere?.radius > skull.geometry.boundingSphere?.radius)) skull = c;
    const inner = mesh(skull.geometry, new THREE.MeshStandardMaterial({ color: 0x8a2018, roughness: 0.3, side: THREE.BackSide, clippingPlanes: [this.skullLow] }));
    inner.position.copy(skull.position); inner.scale.copy(skull.scale); you.head.add(inner); // the wet inside of the bone
    const capIn = mesh(skull.geometry, new THREE.MeshStandardMaterial({ color: 0xd8ccb4, roughness: 0.6, side: THREE.BackSide, clippingPlanes: [this.capHigh] }));
    capIn.position.copy(skull.position); capIn.scale.copy(skull.scale); this.cap.add(capIn);
    const rim = mesh(new THREE.TorusGeometry(1, 0.06, 6, 28), m.bone); rim.rotation.x = Math.PI / 2; rim.visible = false; you.head.add(rim); this.rim = rim;
    // the brain: two halves of folds, the cerebellum under them, the stem
    this.brain = this.makeBrain(); this.brain.position.set(0, 0.112, 0.0); you.head.add(this.brain);
    this.stem = mesh(new THREE.CylinderGeometry(0.012, 0.016, 1, 8), new THREE.MeshStandardMaterial({ color: 0xb87878, roughness: 0.35 })); this.stem.visible = false; s.add(this.stem);
    this.him.root.position.set(0, 0, -0.44); this.him.root.rotation.y = 0;
    this.cleaver(true);
  }
  makeBrain() {
    const g = new THREE.SphereGeometry(1, 64, 40), p = g.attributes.position, v = V(0, 0, 0);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      // the folds: ridges that wander; a deep groove down the middle; flatter underneath
      const fold = Math.abs(Math.sin(v.x * 9 + Math.sin(v.z * 7) * 1.6 + Math.sin(v.y * 11) * 0.7)) * 0.07 + Math.abs(Math.sin(v.z * 13 + v.y * 5)) * 0.035;
      const mid = Math.exp(-((v.x / 0.08) ** 2)) * (v.y > -0.3 ? 0.22 : 0.05);
      v.multiplyScalar(1 - fold - mid); if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.4;
      p.setXYZ(i, v.x * 0.072, v.y * 0.058, v.z * 0.088);
    }
    g.computeVertexNormals();
    const pink = new THREE.MeshStandardMaterial({ color: 0xa86a66, roughness: 0.45 });
    const b = new THREE.Group(); b.add(mesh(g, pink));
    const cb = mesh(new THREE.SphereGeometry(0.034, 20, 14), new THREE.MeshStandardMaterial({ color: 0x9a605c, roughness: 0.45 })); cb.position.set(0, -0.028, -0.055); cb.scale.set(1.4, 0.7, 0.9); b.add(cb);
    return b;
  }
  brainsUpdate(dt) {
    const t = this.t, you = this.you, f = this.him;
    const CHOP1 = 1.5, CHOP2 = 2.9, IN = 3.8, PULL = 4.1, SNAP = 5.2, LET = 5.7, CRUSH = 6.9;
    const r = Math.max(0, (this.recoil || 0) - dt * 5); this.recoil = r;
    const alive = t < CHOP2 ? 1 : Math.max(0, 0.35 - (t - CHOP2) * 0.2);
    // you
    if (t < LET) {
      you.root.position.set(0.05, 0.95 + (t > PULL && t < SNAP ? 0.04 * ease((t - PULL) / 0.8) : 0), 0.38 + r * 0.05); you.root.quaternion.copy(this.standQ);
      you.root.rotateX(-r * 0.15);
      you.neck.rotation.set(t < CHOP2 ? -0.1 + r * 0.4 + Math.sin(t * 6) * 0.08 : 0.32 + (t > PULL && t < SNAP ? -0.25 * ease((t - PULL) / 0.8) : 0), Math.sin(t * 3) * 0.15 * alive, 0);
      you.jaw.rotation.x = t < CHOP2 ? 0.35 + Math.abs(Math.sin(t * 6)) * 0.4 : 0.55;
      you.arms.forEach((a, i) => a.rotation.set(t < CHOP2 ? -1.0 + Math.sin(t * (7 + i)) * 0.4 : lerp(-1.0, -0.15, ease((t - CHOP2) / 0.5)) + Math.sin(t * 13 + i) * 0.05 * alive, 0, (i ? 1 : -1) * 0.3));
      you.legs.forEach((l, i) => l.rotation.set(Math.sin(t * 9 + i * 2) * 0.4 * alive, 0, (i ? -1 : 1) * 0.06));
    } else { // let go: the knees, then down on your side
      const k = clamp01((t - LET) / 0.55), kk = k * k;
      you.root.position.set(lerp(0.05, -0.35, k), lerp(0.95, 0.15, kk), lerp(0.38, 0.55, k));
      you.root.quaternion.slerpQuaternions(this.standQ, this.lieQ, ease(k));
      you.arms.forEach((a, i) => a.rotation.set(-0.2, 0, (i ? 1 : -1) * 0.6)); you.legs.forEach((l, i) => l.rotation.set(i ? 0.5 : 0.1, 0, 0));
      this.at(LET + 0.5, 'thud', () => { this.audio.bodyDrop({ x: -0.35, y: 0, z: 0.55 }); this.scene.add(decal(this.mats.pool[0], 1.3, -0.35, 0.55, 2, 0.0125)); });
    }
    you.root.updateMatrixWorld(true);
    // the cut: the planes follow the head (the cap's follows the cap once it's off)
    const H = you.head;
    this.skullLow.set(V(0, -1, 0), this.cutY).applyMatrix4(H.matrixWorld);
    this.cap.updateMatrixWorld(true);
    this.capHigh.set(V(0, 1, 0), -this.cutY).applyMatrix4(this.cap.matrixWorld); // (the cap carries the head's frame with it)
    const crown = H.localToWorld(V(0, 0.2, 0)), side = H.localToWorld(V(0.13, 0.17, 0.02));
    // him: the hook through your collar until he lets you go; the cleaver up and down, twice; then his hand, in
    const staring = this.stare(7.7, this.dur - 8.1);
    if (!staring) { this.pose({ mode: 'walk', jaw: 0.35 + (t > CHOP2 ? 0.3 : 0), twitch: this.twitch(0.05) }); f.torso.rotation.x = 0.22; f.neck.rotation.x = -0.25; }
    const shF = f.arms[0].sh.getWorldPosition(V());
    if (!staring) {
      if (t < LET) this.reach(1, you.torso.localToWorld(V(0, 0.5, 0.13)).add(V(0, 0.05, 0)));
      let hand;
      const up = crown.clone().add(V(0.25, 0.55, -0.15));
      const swing = (t0) => { const k = t - (t0 - 0.85); return k < 0.6 ? shF.clone().add(V(0.1, -0.4, 0.2)).lerp(up, ease(k / 0.6)) : k < 0.85 ? up.clone().lerp(t0 === CHOP2 ? side.clone().add(V(-0.2, 0, 0)) : crown.clone().add(V(0, 0.02, 0)), ease((k - 0.6) / 0.25)) : null; };
      if (t < CHOP1 + 0.4) hand = swing(CHOP1) || crown.clone().add(V(0, 0.05, 0)).lerp(shF.clone().add(V(0.1, -0.4, 0.2)), ease((t - CHOP1) / 0.4));
      else if (t < CHOP2 + 0.3) hand = swing(CHOP2) || side.clone().add(V(-0.25, 0, 0));
      else if (t < IN) hand = side.clone().add(V(-0.25, 0, 0)).lerp(crown.clone().add(V(0, 0.12, 0.02)), ease((t - CHOP2 - 0.3) / (IN - CHOP2 - 0.3)));
      else if (t < PULL) hand = crown.clone().add(V(0, 0.12 - 0.13 * ease((t - IN) / 0.3), 0.02));
      else if (t < SNAP) hand = crown.clone().add(V(0, -0.01 + 0.32 * ease((t - PULL) / (SNAP - PULL)), 0.04)); // drawing it up out of you
      else if (t < CRUSH) hand = shF.clone().add(V(0.2, 0.3, 0.38)); // up by his face, to look at
      else hand = shF.clone().add(V(0.1, -0.45, 0.2));
      this.reach(0, hand);
      if (t > SNAP && t < CRUSH) { f.neck.rotation.y = 0.4 * ease((t - SNAP) / 0.5); f.neck.rotation.x = 0.05; }
    }
    // the blows
    this.at(CHOP1, 'chop1', () => { this.audio.chop?.(); this.audio.crunch(1.0); this.audio.scream(); this.shake = 0.8; this.recoil = 1; this.gore.spray(crown, V(0.3, 1, 0.3), 120, 2.4, 0.6); this.scene.add(decal(this.mats.splat[0], 0.8, 0.3, 0.6, 1, 0.0118)); });
    this.at(CHOP2, 'chop2', () => {
      this.audio.crunch(1.4); this.audio.gib(0.8); this.audio.squelch(1.2); this.shake = 1.1; this.recoil = 1; this.flash = 0.25;
      this.cutY = 0.165; this.cap.visible = true; this.rim.visible = true;
      this.rim.position.set(0, this.cutY, 0); this.rim.scale.set(0.068, 0.079, 0.08);
      this.scene.attach(this.cap);
      this.gore.fling([this.cap], crown, V(-0.6, 1, 0.3), 2.6);
      for (const d of [V(0, 1, 0), V(-0.6, 0.8, 0.3), V(0.4, 0.9, 0.5)]) this.gore.spray(crown, d, 150, 2.6, 0.5);
    });
    this.at(IN - 0.1, 'away', () => { this.cleaver(false); this.audio.clank(f.root.position, 0.4); });
    // the brain comes out with his hand; the stem stretches from your skull to it until it goes
    const hand = f.arms[0].hand;
    this.at(PULL, 'grip', () => { hand.attach(this.brain); this.audio.squelch(1.4); this.stem.visible = true; });
    if (t > PULL && t < SNAP) {
      const top = H.localToWorld(V(0, 0.07, -0.01)), bot = this.brain.localToWorld(V(0, -0.03, -0.03)), d = bot.clone().sub(top), L = d.length();
      this.stem.position.copy(top).addScaledVector(d, 0.5); this.stem.scale.set(1 - ease((t - PULL) / (SNAP - PULL)) * 0.6, L, 1 - ease((t - PULL) / (SNAP - PULL)) * 0.6);
      this.stem.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
      if (Math.random() < dt * 25) this.gore.spray(bot, V(0, -1, 0), 6, 0.5, 0.3);
      if (Math.random() < dt * 3) this.audio.squelch(0.5);
    }
    this.at(SNAP, 'snap', () => { this.stem.visible = false; this.audio.tear(); this.audio.squelch(1.0); this.gore.spray(crown, V(0, 1, 0.2), 80, 1.8, 0.5); this.shake = 0.4; });
    if (t > SNAP && t < CRUSH && Math.random() < dt * 10) this.gore.spray(this.brain.getWorldPosition(V()).add(V(0, -0.05, 0)), V(0, -1, 0), 4, 0.4, 0.3); // dripping in his hand
    if (t > CRUSH - 0.6 && t < CRUSH) this.brain.scale.setScalar(1 - 0.25 * ease((t - CRUSH + 0.6) / 0.6)); // he squeezes it
    this.at(CRUSH, 'drop', () => { this.scene.attach(this.brain); this.drop([this.brain], this.brain.getWorldPosition(V()), 0.3, 0.05); this.audio.squelch(1.3); this.gore.spray(this.brain.getWorldPosition(V()), V(0, 0.2, 0.3), 60, 1.6, 0.8); });
    this.at(0.3, 'grab', () => { this.audio.scream(); this.audio.growl(f.root.position, 0.8); });
    // the camera: the two of you; in on your head for the blows; down into it; him and what's in his hand; you, down
    if (!staring) this.shots([[0, V(1.8, 1.8, 2.0), V(0, 1.6, 0.2)], [CHOP1 - 0.8, V(1.1, 1.9, 1.05), V(0.05, 1.75, 0.3)], [CHOP2 + 0.3, V(0.72, 2.12, 0.82), V(0.05, 1.72, 0.35)], [PULL, V(0.9, 2.05, 0.95), V(0.05, 1.8, 0.3)],
      [SNAP + 0.1, V(1.3, 2.0, 1.5), V(0.1, 1.95, 0.05)], [LET + 0.3, V(1.5, 1.6, 2.1), V(-0.1, 0.8, 0.4)], [CRUSH + 0.1, V(1.3, 1.5, 1.9), V(-0.2, 0.3, 0.4)], [7.6, V(1.4, 1.75, 2.4), V(0, 1.4, 0.3)]]);
    this.fear = 1;
    this.at(this.dur - 0.5, 'black', () => (this.blackout = 1));
  }

  // ---------- 9: packed (third person) ----------
  // On your back on a steel table, opened. He takes out what's useful one piece at a time and packs it: a tray, the
  // film, a label, and along the bench to the others.
  packedBuild() {
    this.dur = 13.6;
    const s = this.scene, m = this.mats;
    this.stage(9, 9, V(0, 0, 0.3), V(-0.2, 1, -0.3));
    const face = new THREE.PointLight(0xffd8c0, 12, 6, 1.5); face.position.set(0.8, 2.6, 0.6); s.add(face); // on him
    const steelM = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.35, metalness: 0.9 });
    const top = mesh(new THREE.BoxGeometry(2.0, 0.06, 0.78), steelM); top.position.set(-0.1, 0.88, 0.05); s.add(top);
    for (const [x, z] of [[-1.0, -0.28], [0.8, -0.28], [-1.0, 0.38], [0.8, 0.38]]) { const l = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.86, 10), steelM); l.position.set(x, 0.43, z); s.add(l); }
    // the packing cart at his left hand, four empty trays laid out on it
    const cart = mesh(new THREE.BoxGeometry(0.8, 0.05, 0.55), steelM); cart.position.set(-0.75, 0.92, -0.73); s.add(cart);
    for (const [x, z] of [[-1.1, -0.98], [-0.4, -0.98], [-1.1, -0.48], [-0.4, -0.48]]) { const l = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.9, 10), steelM); l.position.set(x, 0.45, z); s.add(l); }
    this.trays = [[-0.58, -0.6], [-0.9, -0.6], [-0.58, -0.86], [-0.9, -0.86]].map(([x, z]) => { const tr = packTray(m); tr.position.set(x, 0.945, z); s.add(tr); return tr; });
    // you, on your back, head toward the light, opened
    this.you = makeWorker(m);
    const you = this.you;
    orient(you.root, V(1, 0, 0), V(0, 1, 0)); you.root.position.set(-0.3, 1.03, 0.05);
    you.arms.forEach((a, i) => a.rotation.set(0, 0, (i ? 1 : -1) * 0.12));
    s.add(you.root);
    openChest(you, m);
    s.add(decal(m.pool[0], 1.8, 0, 0.3, 0.6));
    // him: across the table from the camera, leaning over you
    this.him.root.position.set(0.2, 0, -0.95); this.him.root.rotation.y = 0;
    this.cleaver(false);
    this.organs = [heart(m), liver(m), lung(m), kidney(m)];
    this.organs.forEach((o) => { o.visible = false; s.add(o); });
    // the blasts: glossy globs that catch the lamp and a red mist that bursts out of you (made now: no stall mid-film)
    this.globMat = new THREE.MeshStandardMaterial({ color: 0x5a0303, roughness: 0.12, metalness: 0 });
    this.globGeo = new THREE.IcosahedronGeometry(1, 1); this.globGeo.userData.shared = true;
    const mc = document.createElement('canvas'); mc.width = mc.height = 64;
    const mg = mc.getContext('2d'), gr = mg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(120,4,2,0.95)'); gr.addColorStop(0.5, 'rgba(90,2,1,0.6)'); gr.addColorStop(1, 'rgba(60,0,0,0)');
    mg.fillStyle = gr; mg.fillRect(0, 0, 64, 64);
    this.mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mc), transparent: true, depthWrite: false, opacity: 0 }));
    this.park(this.mist); this.mistT = 9;
    this.park(new THREE.Mesh(this.globGeo, this.globMat)).scale.setScalar(0.02);
  }
  packedUpdate(dt) {
    const t = this.t, f = this.him, you = this.you;
    const START = 1.6, EACH = 2.4, N = this.organs.length, END = START + N * EACH;
    const alive = 1 - clamp01((t - START) / 3.5);
    you.neck.rotation.x = 0.25 + Math.sin(t * 6) * 0.15 * alive; you.jaw.rotation.x = 0.3 + Math.abs(Math.sin(t * 5)) * 0.4 * alive;
    you.arms.forEach((a, i) => a.rotation.set(Math.sin(t * (5 + i)) * 0.25 * alive, 0, (i ? 1 : -1) * 0.12));
    you.legs.forEach((l, i) => l.rotation.set(Math.sin(t * 7 + i * 2) * 0.15 * alive, 0, 0));
    you.root.updateMatrixWorld(true);
    const cavity = you.torso.localToWorld(V(0, 0.3, 0.1)), inHand = cavity.clone().add(V(0, 0.16, 0)), overCav = cavity.clone().add(V(-0.1, 0.5, -0.1));
    const staring = this.stare(END + 0.4, this.dur - END - 0.9);
    if (!staring) {
      this.pose({ mode: 'walk', jaw: 0.3, twitch: this.twitch(0.05) });
      f.torso.rotation.x = 0.5; f.neck.rotation.x = -0.15;
    }
    // the hook arm: on your shoulder, holding you down
    this.reach(1, you.torso.localToWorld(V(0.12, 0.45, 0.08)).add(V(0, 0.1, 0)));
    // the other hand: in, out with it, over to its tray, down; the film over it, the label on
    const i = Math.floor((t - START) / EACH), ph = (t - START) / EACH - i;
    let hand;
    const tray = this.trays[Math.min(N - 1, Math.max(0, i))], overTray = tray.position.clone().add(V(0, 0.42, 0)), onTray = tray.position.clone().add(V(0, 0.2, 0));
    const rest = V(-0.35, 1.45, -0.45);
    if (t < START) hand = rest.clone().lerp(overCav, ease((t - 0.6) / 1.0));
    else if (i >= N) hand = this.trays[N - 1].position.clone().add(V(0, 0.42, 0)).lerp(rest, ease((t - END) / 0.6));
    else {
      const from = i === 0 ? overCav : this.trays[i - 1].position.clone().add(V(0, 0.42, 0));
      if (ph < 0.1) hand = from.clone().lerp(overCav, ease(ph / 0.1));
      else if (ph < 0.2) hand = overCav.clone().lerp(inHand, ease((ph - 0.1) / 0.1));
      else if (ph < 0.36) hand = inHand.clone().lerp(overCav, ease((ph - 0.2) / 0.16));
      else if (ph < 0.58) hand = overCav.clone().lerp(overTray, ease((ph - 0.36) / 0.22));
      else if (ph < 0.68) hand = overTray.clone().lerp(onTray, ease((ph - 0.58) / 0.1));
      else hand = onTray.clone().lerp(overTray, ease((ph - 0.68) / 0.12)).add(V(0, ph > 0.76 && ph < 0.86 ? -0.15 * Math.sin((ph - 0.76) / 0.1 * Math.PI) : 0, 0)); // presses the film down, the label on
      const o = this.organs[i];
      if (ph >= 0.2 && ph < 0.68) { o.visible = true; this.him.arms[0].hand.getWorldPosition(o.position); o.position.y -= 0.15; if (Math.random() < dt * 14) this.gore.spray(o.position, V(0, -1, 0), 4, 0.5, 0.2); }
      else if (ph >= 0.68) { o.visible = true; o.position.copy(tray.position).add(V(0, 0.06, 0)); }
      // every one comes out in a blast: up, at the camera, both ways along the table, and a spatter of bits
      this.at(START + i * EACH + 0.2 * EACH, 'pull' + i, () => {
        this.audio.tear(); this.audio.squelch(1.8); this.audio.gib(0.9); this.audio.splash(1.0);
        this.flash = 0.22; this.shake = 0.7;
        for (const d of [V(0, 1, 0.15), V(0.3, 0.8, 0.9), V(-0.3, 0.8, 0.9), V(1, 0.5, 0.2), V(-1, 0.5, 0.2), V(0, 0.9, -0.6)]) this.gore.spray(cavity, d, 260, 5.0, 0.55);
        this.gore.burst(cavity, 5, 2.2, 0.9);
        const globs = []; for (let k = 0; k < 22; k++) { const g = new THREE.Mesh(this.globGeo, this.globMat); g.scale.setScalar(0.012 + Math.random() * 0.022); globs.push(g); }
        this.gore.burst(cavity, 0, 3.2, 1.1, globs);
        this.mist.position.copy(cavity).add(V(0, 0.1, 0.05)); this.mistT = 0;
        for (let k = 0; k < 3; k++) this.scene.add(decal(this.mats.splat[(Math.random() * 4) | 0], 0.6 + Math.random() * 0.9, cavity.x + (Math.random() - 0.5) * 2.4, cavity.z + 0.4 + Math.random() * 1.2, Math.random() * 6, 0.011 + (i * 3 + k) * 0.0003));
      });
      if (ph >= 0.2 && ph < 0.36 && Math.random() < dt * 40) this.gore.spray(cavity, V((Math.random() - 0.5) * 0.6, 1, 0.3), 18, 2.2 * (1 - (ph - 0.2) / 0.16), 0.4); // still pumping as it comes clear
      this.at(START + i * EACH + 0.68 * EACH, 'down' + i, () => this.audio.squelch(0.5));
      this.at(START + i * EACH + 0.76 * EACH, 'wrap' + i, () => { tray.userData.film.visible = true; this.audio.burst(this.audio.sfx, { type: 'highpass', f: 3000, dur: 0.3, vol: 0.14 }); });
      this.at(START + i * EACH + 0.86 * EACH, 'label' + i, () => { tray.userData.label.visible = true; this.audio.click(tray.position); });
    }
    this.reach(0, hand);
    if (this.mistT < 0.6) { this.mistT += dt; const k = this.mistT / 0.6; this.mist.scale.setScalar(0.25 + k * 1.2); this.mist.material.opacity = 0.85 * (1 - k) ** 1.5; } else this.mist.material.opacity = 0;
    // the camera: across the table; in on your open chest as each comes out; over to the cart; him
    const c = START + EACH * 0.6;
    if (!staring) this.shots([[0, V(1.3, 2.25, 3.5), V(-0.2, 1.5, -0.4)], [START, V(1.0, 2.05, 2.7), V(-0.1, 1.35, -0.3)], [c, V(0.8, 1.95, 2.1), V(-0.1, 1.3, -0.3)], [START + EACH * 1.3, V(0.8, 1.95, 2.1), V(-0.2, 1.3, -0.35)], [START + EACH * 1.8, V(0.5, 2.05, 1.7), V(-0.6, 1.25, -0.6)], [START + EACH * 2.8, V(0.6, 2.05, 1.8), V(-0.55, 1.25, -0.6)], [END, V(1.1, 2.15, 2.9), V(-0.3, 1.45, -0.5)]]);
    this.fear = 0.9;
    this.at(this.dur - 0.5, 'black', () => (this.blackout = 1));
  }
}
