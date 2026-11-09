// OFFAL: night shift at the Hollow Pines Meatworks.
// The loop: drop into a floor, find the dead, cut their tags out, solve whatever else is keeping the lift
// shut, get back to it alive, go deeper. Story mode is ten floors with a checkpoint on each and an ending
// at the bottom; Overtime is the endless version where dying sends you back to B1.
import * as THREE from 'three';
import { makeMaterials, configureTextures } from './textures.js';
import { makeEnvironment } from './env.js';
import { upgradeTree, setDetail } from './detail.js';
import { fuseBodies, setSculptDetail } from './sculpt.js';
import { TorchHand, torchCookie } from './viewmodel.js';
import { Motes } from './motes.js';
import { detectTier, resolveGfx, applyGfx, renderScale, DynRes, PRESETS, OPTS, LOAD_TIME } from './gfx.js';
import { makeLayout, buildLevel, lineOfSight, toTile, findPath, collide } from './level.js';
import { Puzzles } from './puzzles.js';
import { Survivor } from './survivor.js';
import { Cinema, SHOTS } from './cinema.js';
import { initTouch, tapKey } from './touch.js';
const TOUCH = !!window.OFFAL_ANDROID || /[?&]android=1/.test(window.location.search) || matchMedia('(pointer: coarse)').matches; // the Android app, or any touch screen
import { Hunter, createForemanMesh, poseForeman } from './monster.js';
import { Player, keys, tapped, endFrame } from './player.js';
import { AudioEngine } from './audio.js';
import { Post } from './post.js';
import { Director } from './director.js';
import { Guide } from './guide.js';
import { Cutscene, CUTSCENES, compileSoon } from './cutscenes.js';
import * as UI from './ui.js';
import * as P from './props.js';
import { floorInfo, difficulty, WALL_H, STORY_FLOORS, DIFFS, THEMES } from './config.js';
import { animateFlies } from './props.js';
import { Gun, AMMO_MAX, freshInv, cloneInv } from './gun.js';
import { KEEPSAKES, KEEPSAKE_DRAW, keepsakeFor, CUTSCENE_INFO } from './collection.js';
import { KeepsakeViewer } from './keepsakes3d.js';
import { TapePlayer } from './tape.js';
import { initGamepad } from './gamepad.js';
import { ACHIEVEMENTS, initAchievements, unlock as ach } from './achievements.js';
import { bakeStatic } from './bake.js';
import { BEATS, ENDING } from './story.js';

// ---------- save ----------
const SAVE_KEY = 'offalr-save-v1'; // the remaster's own save; the first time, it picks up the original's (offal-save-v1)
const save = (() => {
  const fresh = { v: 1, runs: [], best: 0, deaths: 0, totalTags: 0, shifts: 0,
    story: { active: false, floor: 1, seed: 0, deaths: 0, time: 0, tags: 0, done: 0, bestTime: 0, inv: null }, collection: { keep: [], cuts: [] }, settings: { look: 'remastered', dynRes: true, gfx: 'auto', res: 'preset', grain: 1, ca: true, eyeAdapt: true, dev: false, devPresolve: true, sens: 1, vol: 0.8, gamma: 1, pix: 300, draw: 1, fps: 0, tsens: 1, uiMenu: 100, uiGame: 100, shake: true, fov: 75, invert: false, bob: true, beam: 0.55, power: 160, hints: true, fullscreen: true, grade: 0, blood: 1, contrast: 1, vignette: 1, filter: 0, filterAmt: 1, dust: 1 } };
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  try {
    const s = read(SAVE_KEY) || read(SAVE_KEY + '.bak') || read('offal-save-v1'); // (a broken save falls back to the copy before it)
    if (s && s.v === 1) return { ...fresh, ...s, story: { ...fresh.story, ...s.story }, collection: { ...fresh.collection, ...s.collection }, settings: { ...fresh.settings, ...s.settings } };
  } catch {}
  return fresh;
})();
const writeSave = () => {
  try { const old = localStorage.getItem(SAVE_KEY); if (old) localStorage.setItem(SAVE_KEY + '.bak', old); localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
};
const VERSION = '1.0.0';

// ---------- renderer ----------
const canvas = UI.$('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
THREE.studio.renderer = renderer;
renderer.localClippingEnabled = true; // (the band saw film cuts a body in two with clipping planes)
renderer.setPixelRatio(1);
renderer.info.autoReset = false; // reset once a frame instead (see frame), so F3 counts every pass
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const post = new Post(renderer);
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 60);
const scene = new THREE.Scene();
scene.add(camera);
scene.fog = new THREE.FogExp2(0x000000, 0.09);
scene.background = new THREE.Color(0x000000);
scene.add(new THREE.AmbientLight(0x2a1c1a, 0.4));
// the look is chosen at load: Classic paints 256 px Phong surfaces, Remastered paints PBR sets at 2x and lights with an environment
{ const q = new URLSearchParams(window.location.search).get('look'); if (q === 'classic' || q === 'remastered') save.settings.look = q; } // ?look= for testing
const REMASTER = save.settings.look !== 'classic';
// the graphics card decides the Auto preset; ?gfx=low|medium|high|ultra overrides it (for testing)
const GPU = detectTier(renderer, TOUCH);
{ const q = new URLSearchParams(window.location.search).get('gfx'); if (PRESETS[q]) save.settings.gfx = q; }
let GFX = resolveGfx(save.settings, GPU.tier);
// dynamic resolution (remastered): ?dyn=0 turns it off for testing
const dynres = new DynRes();
const NO_DYN = new URLSearchParams(window.location.search).get('dyn') === '0';
const LOADED = { ...GFX }; // texture quality, anisotropy and model detail as painted for this run
if (REMASTER) configureTextures({ k: [1, 1, 2, 3][GFX.texQ] || 2, pbr: true, aniso: Math.min(GFX.aniso, renderer.capabilities.getMaxAnisotropy()) });
const tMats = performance.now();
const mats = makeMaterials();
const matsMs = Math.round(performance.now() - tMats); // shown on the F3 line
if (REMASTER) scene.environment = makeEnvironment(renderer);
setDetail(REMASTER ? GFX.detailQ : 0);
setSculptDetail(REMASTER ? GFX.detailQ : 0);
const audio = new AudioEngine();
const player = new Player(camera);
if (REMASTER) {
  // the torch: a big soft shadow map; everything it touches throws a shadow
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  player.torch.shadow.camera.near = 0.1;
  player.torch.shadow.bias = -0.0003;
  player.torch.shadow.normalBias = 0.02;
  player.torch.shadow.radius = 3;
  player.torch.decay = 1; // gentler up close, the same reach: a wall at arm's length doesn't sear
  player.torchGain = 0.2;
  player.torch.map = torchCookie(); // the reflector's rings and the dirt on the lens, thrown on the walls
}
// the torch in your left hand (remastered); its light leaves from its lens
const _buf = new THREE.Vector2();
const torchHand = REMASTER ? new TorchHand(camera, player, mats) : null;
const motes = REMASTER ? THREE.ownRandom(() => new Motes(scene)) : null; // dust in the torch beam
let gun = null; // made once G exists
const blood = new UI.ScreenBlood(UI.$('blood'));

// a small pool of real lights handed to whichever ceiling lamps are nearest
const lampLights = [];
let lampTurn = 0;
for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffffff, 0, 9, 2); scene.add(l); lampLights.push(l); }
post.lights = { torch: player.torch, lamps: lampLights };
// Remastered: the nearest ceiling lamps can cast real shadows (a cube map each, refreshed only while they are lit);
// how many, and how sharp, is the graphics setting (gfx.js)
if (REMASTER) lampLights.forEach((l) => {
  l.shadow.camera.near = 0.15; l.shadow.camera.far = 11;
  l.shadow.bias = -0.002; l.shadow.normalBias = 0.03; l.shadow.radius = 3;
});

// ---------- game state (also the "world" the AI and director see) ----------
const G = {
  state: 'warn', scene, audio, player, ui: UI, mats,
  depth: 1, L: null, B: null, D: null, info: null, hunters: [], flies: [],
  runTime: 0, runTags: 0, floorTime: 0,
  fear: 0, scare: 0, damage: 0, flash: 0, blackout: 0, torchKill: 0, lampKill: 0, slowT: 0,
  hb: 0, holdT: 0, cutT: 0, lift: { phase: 'arrive', t: 0 }, liftSealed: true, shakeScale: 1,
  // kind: walk / crouch / run / cut / locker / work / other. The difficulty decides how far each carries (0 = silent)
  noise(pos, radius, loud, kind = 'other') {
    const n = (DIFFS[G.diff] || DIFFS.normal).noise, m = n[kind] ?? n.other ?? 1;
    if (m <= 0) return;
    // with two of them, only the nearer one comes to look (unless it was loud): they don't move as a pair
    const at = pos.clone ? pos.clone() : new THREE.Vector3(pos.x, 0, pos.z);
    const order = G.hunters.slice().sort((a, b) => a.pos.distanceTo(at) - b.pos.distanceTo(at));
    order.forEach((h, i) => { if (i === 0 || loud || h.state === 'chase') h.hear({ pos: at.clone(), radius: radius * m, loud }); });
  },
  // sprinting: he hears it wherever he is, seven times in ten, and comes running to where it was
  sprinting(pos) {
    if (Math.random() < 0.3) return;
    for (const h of G.hunters) h.hear({ pos: pos.clone(), radius: 9999, loud: true, rush: true });
  },
  say(text, secs) { UI.message(text, secs); },
  gasp() {
    audio.gasp();
    UI.message('You can’t hold your breath any longer.', 2.5);
    for (const h of G.hunters) if (h.pos.distanceTo(player.pos) < 8 && player.hidden) { h.lockerTarget = player.hidden; h.setState('locker'); }
  },
  onSpotted() { G.scare = 1; },
  onHit(h) { hurt(h); },
  onGrab(h, lk) { startDeath(h, 'locker', lk); },
};
G.inv = freshInv();
gun = new Gun(G, camera, mats, audio);
const director = new Director(G, mats);
const guide = new Guide(G);

// OFFAL: REMASTERED: the original drops body bags on any free tile of a morgue room, so two or three can end up
// side by side, and meat scraps in heaps. With life-size models that reads as crammed. Decoration only (the bodies
// you cut tags from, and anything you can walk into, stay exactly where they are): a bag too close to another body is
// taken away, and so is a scrap lying on top of another. Nothing the game rolls depends on these.
function declutter(group) {
  // footprints: half length along the object's own x, half width along z (a bag lies along x; a gurney and a corpse too)
  const HALF = { bag: [1.1, 0.45], gurney: [0.96, 0.34], corpse: [0.95, 0.35] };
  const rect = (o, pad) => { const [hx, hz] = HALF[o.userData.decor], c = Math.cos(o.rotation.y), sn = Math.sin(o.rotation.y); return { x: o.position.x, z: o.position.z, ax: [c, -sn], az: [sn, c], hx: hx + pad, hz: hz + pad }; };
  const overlap = (A, B) => { // separating axes of two rectangles
    for (const ax of [A.ax, A.az, B.ax, B.az]) {
      const d = Math.abs((B.x - A.x) * ax[0] + (B.z - A.z) * ax[1]);
      const ra = A.hx * Math.abs(A.ax[0] * ax[0] + A.ax[1] * ax[1]) + A.hz * Math.abs(A.az[0] * ax[0] + A.az[1] * ax[1]);
      const rb = B.hx * Math.abs(B.ax[0] * ax[0] + B.ax[1] * ax[1]) + B.hz * Math.abs(B.az[0] * ax[0] + B.az[1] * ax[1]);
      if (d > ra + rb) return false;
    }
    return true;
  };
  const kept = group.children.filter((o) => o.userData.decor === 'gurney' || o.userData.decor === 'corpse').map((o) => rect(o, 0.2));
  const chunks = [];
  for (const o of group.children.slice()) {
    const k = o.userData.decor;
    if (k === 'bag') { const r = rect(o, 0.2); if (kept.some((q) => overlap(r, q))) group.remove(o); else kept.push(r); }
    else if (k === 'chunk') { if (chunks.some((q) => Math.hypot(q.position.x - o.position.x, q.position.z - o.position.z) < 0.45)) group.remove(o); else chunks.push(o); }
  }
}
function applySettings() {
  const s = save.settings;
  THREE.gore.less = !!s.lessGore;
  player.sens = s.sens;
  player.invertY = s.invert;
  player.torchPower = s.power;
  player.torch.angle = s.beam;
  player.torch.penumbra = 0.55 + (s.beam - 0.3) * 0.3;
  camera.fov = s.fov;
  camera.updateProjectionMatrix();
  audio.setVolume(s.vol);
  post.u.bright.value = s.gamma;
  post.height = +s.pix;
  post.setLook(s.look === 'classic' ? 'classic' : 'remastered');
  dynres.on = REMASTER && s.dynRes !== false && !NO_DYN;
  if (REMASTER) { GFX = resolveGfx(s, GPU.tier); applyGfx(GFX, { post, player, lampLights, bufH: renderer.getDrawingBufferSize(new THREE.Vector2()).y, dyn: dynres.k }); }
  if (REMASTER) { // Customize
    post.u.gradeMode.value = +s.grade || 0; post.u.bloodAmt.value = s.blood ?? 1; post.u.contrastAmt.value = s.contrast ?? 1;
    post.u.vigAmt.value = s.vignette ?? 1; post.u.filterMode.value = +s.filter || 0; post.u.filterAmt.value = s.filterAmt ?? 1;
    if (motes) motes.setAmount(s.dust ?? 1);
    osdTick();
  }
  G.shakeScale = s.shake ? 1 : 0.15;
  G.bobScale = s.bob ? 1 : 0;
  G.hints = s.hints;
  resize();
  scaleUI();
  const show = { padSens: (s.padSens ?? 1).toFixed(2) + '\u00D7', tsens: (s.tsens ?? 1).toFixed(2) + '\u00D7', sens: s.sens.toFixed(2) + '\u00D7', fov: s.fov + '\u00B0', gamma: Math.round(s.gamma * 100) + '%', vol: Math.round(s.vol * 100) + '%', beam: Math.round(s.beam * 114.6) + '\u00B0', power: Math.round(s.power / 1.6) + '%', uiMenu: (s.uiMenu ?? 100) + '%', uiGame: (s.uiGame ?? 100) + '%', blood: Math.round((s.blood ?? 1) * 100) + '%', contrast: Math.round((s.contrast ?? 1) * 100) + '%', vignette: Math.round((s.vignette ?? 1) * 100) + '%', filterAmt: Math.round((s.filterAmt ?? 1) * 100) + '%', dust: Math.round((s.dust ?? 1) * 100) + '%' };
  for (const k in show) UI.$(k + 'V').textContent = show[k];
}
function resize() {
  const w = innerWidth, h = innerHeight;
  // the remaster draws at the display's own pixels (up to 2x); Classic keeps the original 1x canvas
  const pr = post.look === 'classic' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  if (REMASTER) post.q.scale = renderScale(GFX, Math.round(h * pr)) * dynres.k; // 720p .. 4K, whatever the window is, less when frames run long
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  menu.cam.aspect = w / h;
  menu.cam.updateProjectionMatrix();
  post.resize(Math.round(w * pr), Math.round(h * pr));
}
addEventListener('resize', () => { resize(); scaleUI(); });
// the interface size: everything on the screens (menus, panels, the HUD) scales together. Auto fits it to the
// screen it's on: full size on a monitor, smaller on a phone held sideways.
function scaleUI() {
  const s = save.settings, menu = (s.uiMenu ?? 100) / 100, game = (s.uiGame ?? 100) / 100;
  for (const el of document.querySelectorAll('.screen > *')) el.style.zoom = el.parentElement.id === 'hud' ? game : menu;
  // the touch buttons are sized for a phone already; the HUD setting scales them relative to where it started
  const t = document.getElementById('touch');
  if (t) for (const el of t.children) el.style.zoom = game / ((s.touchBase || 100) / 100);
}
// how big the interface starts on a screen this size: full on a monitor, smaller on a phone held sideways
const fitUI = () => Math.max(1, Math.min(100, Math.round(100 * Math.min(1, innerHeight / 760, innerWidth / 1280))));

// ---------- menu backdrop: a swinging lamp, meat on hooks, and sometimes him ----------
const menu = (() => {
  const s = new THREE.Scene();
  s.fog = new THREE.FogExp2(0x000000, 0.13);
  s.background = new THREE.Color(0);
  s.add(new THREE.AmbientLight(0x2a1a18, 0.25));
  const pg = new THREE.PlaneGeometry(2, 2);
  for (let x = -5; x <= 5; x++) for (let z = -5; z <= 2; z++) {
    const f = new THREE.Mesh(pg, mats.floors[(x * 7 + z * 3) % 5 === 0 ? 1 : 0]);
    f.rotation.x = -Math.PI / 2;
    f.position.set(x * 2, 0, z * 2);
    f.receiveShadow = true;
    s.add(f);
  }
  const wg = new THREE.PlaneGeometry(2, WALL_H);
  for (let x = -5; x <= 5; x++) {
    const w = new THREE.Mesh(wg, mats.walls[3 * ((x + 7) % 4) + 0]);
    w.position.set(x * 2, WALL_H / 2, -6);
    w.receiveShadow = true;
    s.add(w);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), mats.ceil);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = WALL_H;
  s.add(ceil);
  const rng = Math.random;
  const meat = [[0.2, -1.2, true], [-1.7, -2.6, true], [1.9, -2.3, false], [-0.6, -4.2, false], [3.2, -4, true]].map(([x, z, h]) => {
    const c = P.makeCarcass(mats, rng, h);
    c.position.set(x, WALL_H, z);
    c.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    s.add(c);
    return c;
  });
  const lampPivot = new THREE.Group();
  lampPivot.position.set(1.0, WALL_H, -0.2);
  const lamp = P.makeLamp(mats, 'bulb');
  lamp.position.set(0, 0, 0);
  lampPivot.add(lamp);
  const light = new THREE.PointLight(0xffd8b0, 6, 12, 1.6);
  light.position.y = -0.75;
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.bias = -0.003;
  lampPivot.add(light);
  s.add(lampPivot);
  const him = createForemanMesh(mats);
  him.root.position.set(1.1, 0, -3.4);
  him.root.rotation.y = -0.25;
  him.root.visible = false;
  s.add(him.root);
  const cam = new THREE.PerspectiveCamera(62, 1, 0.05, 40);
  if (THREE.REMASTERED) { light.shadow.mapSize.set(1024, 1024); s.userData.vol = { torch: null, lamps: [light] }; } // the remaster's menu: a brighter bulb, its light in the dust
  return { scene: s, cam, meat, lampPivot, light, him, lamp, t: 0, reveal: 6 + Math.random() * 5, showing: 0 };
})();

function updateMenu(dt) {
  const m = menu;
  m.t += dt;
  m.lampPivot.rotation.z = Math.sin(m.t * 0.8) * 0.3;
  m.lampPivot.rotation.x = Math.sin(m.t * 0.53) * 0.12;
  m.meat.forEach((c, i) => { c.rotation.y = Math.sin(m.t * 0.3 + i) * 0.4; c.rotation.z = Math.sin(m.t * 0.7 + i * 2) * 0.03; });
  let on = Math.sin(m.t * 17) + Math.sin(m.t * 5.3) > -1.5 ? 1 : 0.05;
  m.reveal -= dt;
  if (m.reveal < 0 && m.showing <= 0) { m.showing = 1.4; m.reveal = 8 + Math.random() * 7; }
  if (m.showing > 0) {
    // he's standing there only while the light can't decide
    m.showing -= dt;
    on = Math.random() < 0.5 ? 1 : 0.02;
    m.him.root.visible = on > 0.5 && m.showing < 1.2;
    poseForeman(m.him, { gait: 0, speed: 0, mode: 'walk', t: m.t, jawOpen: 0.3, twitch: { x: 0.2, y: 0, z: Math.sin(m.t * 20) * 0.4, r: 0.6 } });
    if (m.showing <= 0) m.him.root.visible = false;
  }
  m.light.intensity = (THREE.REMASTERED ? 14 : 6) * on;
  m.lamp.userData.bulb.material = on > 0.5 ? mats.lampOn : mats.lampOff;
  m.cam.position.set(Math.sin(m.t * 0.07) * 0.6 + 0.5, 1.55 + Math.sin(m.t * 0.13) * 0.05, 3.1);
  m.cam.lookAt(0.2, 1.45, -1.8);
  post.u.fear.value = m.showing > 0 ? 0.6 : 0.12;
  post.u.tear.value = m.showing > 0 ? 0.7 : 0;
  post.u.damage.value = 0;
  post.u.health.value = 1;
  post.u.hidden.value = 0;
  post.u.blackout.value = 0;
  post.u.flash.value = 0;
  post.u.tint.value.set(1, 1, 1);
}

// ---------- floors ----------
function disposeLevel() {
  if (!G.B) return;
  scene.remove(G.B.group);
  for (const l of G.offLights || []) scene.remove(l);
  G.offLights = [];
  // textures painted for this floor alone (puzzle faces, blood smears) are marked floorOnly; they and the materials
  // built round them go too. Nothing else is touched: shared surfaces live on in mats and other caches
  G.B.group.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) {
      let own = false;
      for (const k in m) if (m[k] && m[k].isTexture && m[k].userData.floorOnly) { m[k].dispose(); own = true; }
      if (own) m.dispose();
    }
  });
  for (const h of G.hunters) { scene.remove(h.obj); h.dispose(); }
  for (const f of G.flies) f && f.stop();
  if (G.puzzles) G.puzzles.dispose();
  G.hunters = [];
  G.flies = [];
  G.puzzles = null;
  if (UI.keypad.isOpen) UI.keypad.close();
}

function loadFloor(depth, seed) {
  disposeLevel();
  const D = difficulty(depth, G.mode, Math.random, G.diff);
  if (G.mode === 'hunt') Object.assign(D, { hunters: 0, puzzles: [], tags: Math.min(D.tags, 5), screamers: 0 }); // you are what hunts on this floor
  const L = makeLayout(depth, seed, D);
  G.floorSeed = seed;
  const B = buildLevel(L, mats);
  Object.assign(G, { L, B, D, depth, info: floorInfo(depth, G.mode), chased: false, closeCall: false, floorTime: 0, lampKill: 0, torchKill: 0, frenzy: false, frenzyT: 0 });
  G.puzzles = new Puzzles(G, D.puzzles, seed + 17);
  placeLoot(depth, seed);
  scene.add(B.group);
  // each kind of floor brings its own light and colour (overtime picks kinds at random)
  const TH = THEMES[D.theme] || THEMES.plant;
  if (D.theme !== 'plant' && G.info.theme !== D.theme) Object.assign(G.info, { lamp: TH.lamp, fog: TH.fog, theme: D.theme, name: G.mode === 'overtime' ? TH.label : G.info.name });
  scene.fog.color.setHex(G.info.fog);
  scene.background.setHex(G.info.fog);
  post.u.tint.value.set(...TH.tint);
  scene.fog.density = 0.085 + D.fogBoost + Math.min(depth, 10) * 0.003;
  // the hiring office is just an office: lit, clean, nothing wrong with it yet. The torch can stay off.
  G.officeLight ||= scene.add(new THREE.HemisphereLight(0xfff2dc, 0x5a5044, 0)) && scene.children[scene.children.length - 1];
  G.officeLight.intensity = D.intro ? 3.2 : 0;
  if (D.intro) { scene.fog.density = 0.022; player.lightOn = false; }
  // playing the Foreman: you see what he sees, in red, a good way off
  if (G.mode === 'hunt') scene.fog.density = 0.035;
  for (const l of lampLights) l.color.setHex(G.info.lamp);
  G.hunters = B.hunterSpawns.slice(0, D.hunters).map((p, i) => { const h = new Hunter(G, mats, p, i); scene.add(h.obj); return h; });
  G.flies = B.corpses.map((c) => audio.flies(c.pos));
  // a locker or two has someone in it already, on some floors
  if (!D.intro && B.lockers.length > 2) { const n = B.lockers.length > 6 && Math.random() < 0.5 ? 2 : 1; const pick = B.lockers.slice().sort(() => Math.random() - 0.5).slice(0, n); if (depth % 3 === 2) for (const lk of pick) lk.filled = true; } // (only every third floor: B2, B5, B8, B11)
  // the gate across the lift mouth, as a collider that can be switched off
  const lp = B.lift.pos;
  B.gate = { x0: lp.x - 1, x1: lp.x + 1, z0: lp.z - 1.06, z1: lp.z - 0.9, hunters: true, off: false };
  B.colliders.push(B.gate);
  B.lift.bars.position.y = 0;
  player.spawn(B.spawn);
  player.hidden = null;
  player.inLift = true;
  G.lift = { phase: 'arrive', t: 0 };
  G.liftSealed = true;
  G.waterLevel = 1;
  director.reset();
  guide.reset();
  if (G.mode === 'hunt') setupHunt();
  audio.setDepth(depth);
  // weld everything that never moves into a few big meshes (see bake.js), and stop drawing past the fog
  if (REMASTER) {
    declutter(B.group); // no bodies crammed up against each other
    fuseBodies(B.group); // every dead body on the floor in one piece (sculpt.js)
    upgradeTree(B.group); // finer primitives before the static parts are welded
  }
  if (!window.__noBake) G.bake = bakeStatic(B.group, [B, G.puzzles, G.hunters, director], B.swingers);
  // the locker scare's body, fused now so opening the locker can't stall. Last, and only on floors with corpses: by then
  // every cache it touches is already filled exactly as in the original, so nothing the game rolls later can shift
  if (REMASTER && B.corpses.length) prewarmLockerBody();
  camera.far = Math.min(60, 2.4 / scene.fog.density) * (save.settings.draw || 1); // the draw distance setting
  // the remaster's exposure lifts what the fog leaves of far walls into sight, so the fog must reach solid black before
  // the far plane (fog_fragment closes it by 2.35 / density): a short draw distance thickens it to fit
  if (REMASTER && scene.fog.density * camera.far < 2.4) scene.fog.density = 2.4 / camera.far;
  camera.updateProjectionMatrix();
  warmShaders(scene, camera);
  prepDeathFilm();
}
// every shader the floor needs, built now behind the load (in parallel where the GPU allows) rather than the first
// time each thing comes into view, which is a stall in the middle of play
// the film you'll see if he gets you on this floor, chosen and built now, behind the load. Built at the moment he
// grabbed you, it stalled the grab halfway (the scream carried on, then the picture caught up: it looked like a replay)
function deathPool() { return (save.settings.lessGore ? ['exit', 'beaten', 'smoke'] : CUTSCENES).filter((c) => c !== save.lastCut); }
function prepDeathFilm() {
  if (G.nextCs) { G.nextCs.dispose(); G.nextCs = null; }
  if (!REMASTER || !G.D || G.D.intro || !G.D.hunters) return;
  const pool = deathPool();
  G.nextCut = THREE.ownRandom(() => pool[(Math.random() * pool.length) | 0]);
  try {
    G.nextCs = THREE.ownRandom(() => new Cutscene(G.nextCut, { mats, audio, blood, aspect: camera.aspect, env: scene.environment }));
    G.nextCs.prepare(renderer);
  } catch { G.nextCs = null; }
}
function blank() { renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1); renderer.clear(); }
function warmShaders(s, c) { // (until they're built the floor isn't drawn behind the lift card: drawing it would wait on every one of them at once)
  const id = (G.warmId = (G.warmId || 0) + 1); G.warming = true;
  const done = () => { if (G.warmId === id) G.warming = false; };
  compileSoon(renderer, s, c, done); setTimeout(done, 8000);
}

// what lies about on a floor that depends on the run: the next gun part you're missing, a few bolts, keepsakes
function placeLoot(depth, seed) {
  const B = G.B;
  if (depth >= 2) {
    if (!G.inv.built) B.addPickup('gun'); // on every floor from B2 until you've picked one up
    if (G.inv.built) for (let i = 0; i < ({ easy: 3, normal: 2, hard: 2, extreme: 1 }[G.diff] || 2); i++) B.addPickup('ammo');
  }
  // keepsakes you haven't found yet (a resumed floor gets back exactly the ones it had)
  let keeps = G.floorKeeps;
  if (!keeps) {
    // (drawn from the original's list, exactly as the original draws; what you find is one of the ten: keepsakeFor)
    const left = KEEPSAKE_DRAW.filter((id) => !save.collection.keep.includes(keepsakeFor(id)));
    keeps = [];
    const n = Math.min(left.length, 1 + (seed % 2));
    for (let i = 0; i < n; i++) keeps.push(left.splice((seed + i * 7) % left.length, 1)[0]);
  }
  G.floorKeeps = keeps;
  for (const draw of keeps) { const id = keepsakeFor(draw), k = KEEPSAKES.find((x) => x.id === id); if (k) { B.addPickup('keepsake', { id, draw, kind: k.kind }); if (REMASTER) try { THREE.ownRandom(() => viewer.preload(id)); } catch {} } }
}

function inAlcove() {
  const a = G.L.alcove;
  return toTile(player.pos.x) === a.x && toTile(player.pos.z) === a.y;
}

// ---------- run flow ----------
// mode: 'story' (continue from the saved floor, or fresh) or 'overtime' (endless, from B1)
// opts.resume: a snapshot to pick up exactly where you left off. opts.floor: overtime's starting floor
function startRun(mode = 'story', fresh = false, diff = null, opts = {}) {
  if (G.cutscene) { G.cutscene.dispose(); G.cutscene = null; } // a film still waiting on its shaders when the run starts
  audio.init();
  applySettings();
  player.reset();
  blood.clear();
  G.mode = mode;
  const st = save.story;
  if (mode === 'story' && (fresh || !st.active)) Object.assign(st, { active: true, floor: opts.floor ?? 0, seed: 0, deaths: 0, time: 0, tags: 0, diff: diff || 'normal', inv: freshInv(), lockerScared: false });
  // what you're carrying: a story shift keeps it from floor to floor (as it was when you started the floor)
  G.inv = mode === 'story' ? cloneInv(st.inv) : freshInv();
  // the first locker you open on a shift is never empty (see openFilled)
  G.lockerScare = mode !== 'hunt' && !(mode === 'story' && st.lockerScared);
  G.diff = mode === 'story' ? st.diff || 'normal' : diff || G.diff || 'normal';
  if (diff && mode !== 'hunt') save.settings.lastDiff = diff;
  // dev mode: chosen on the difficulty screen, it stays with you until you turn it off there
  G.dev = save.settings.dev ? { noclip: false, ghost: false, presolve: save.settings.devPresolve !== false } : null;
  UI.$('devBadge').classList.toggle('on', !!G.dev);
  if (mode === 'story' && (fresh || st.floor <= 1)) guide.newRun();
  if (mode === 'overtime') guide.newRun();
  save.shifts++;
  G.shift = save.shifts;
  G.runTime = mode === 'story' ? st.time : 0;
  G.runTags = mode === 'story' ? st.tags : 0;
  G.fear = G.scare = G.damage = G.flash = G.blackout = 0;
  writeSave();
  const snap = opts.resume || null;
  if (snap) { G.diff = snap.diff; G.runTime = snap.runTime; G.runTags = snap.runTags; }
  else save.snap = null;
  G.trans = { t: 0.8, loaded: false, next: snap ? snap.depth : mode === 'story' ? st.floor : opts.floor || 1, snap };
  G.state = 'transition';
  UI.$('fade').classList.add('on');
  UI.only();
  lockPointer();
}

// ---------- the tannoy ----------
// story only: a line of its own once you've been on the floor a while
function storyBeats() {
  if (G.mode !== 'story' || !G.beat) return;
  const b = BEATS[G.depth - 1];
  if (b && !G.beat.pa && G.floorTime > 55 && b.pa) { G.beat.pa = true; UI.pa(b.pa); }
}

// raw mouse input where the browser supports it: no OS acceleration, and none of Chrome's lock jitter
function lockPointer() {
  const plain = () => { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch {} };
  try {
    const r = canvas.requestPointerLock({ unadjustedMovement: true });
    if (r && r.catch) r.catch(plain); else if (!r) plain();
  } catch { plain(); }
}

function updateTransition(dt) {
  const tr = G.trans;
  tr.t += dt;
  if (tr.t >= 0.8 && !tr.loaded) {
    tr.loaded = true;
    audio.liftMotor(true);
    // story: the floor keeps its seed until you clear it, so a retry is the same floor you learned
    let seed = tr.snap ? tr.snap.seed : (Math.random() * 2 ** 30) | 0;
    if (G.mode === 'story') {
      if (tr.snap) save.story.seed = seed;
      const st = save.story;
      if (st.floor !== tr.next || !st.seed) { st.floor = tr.next; st.seed = seed; }
      seed = st.seed;
      st.time = Math.round(G.runTime);
      st.tags = G.runTags;
      writeSave();
    }
    if (tr.snap) { G.inv = cloneInv(tr.snap.invStart); G.floorKeeps = tr.snap.keeps || []; } else G.floorKeeps = null;
    loadFloor(tr.next, seed);
    player.tags = 0;
    G.invStart = cloneInv(G.inv);
    G.tasksOpen = false;
    UI.$('tasks').classList.remove('on');
    if (G.mode === 'story' && !tr.snap) { save.story.inv = cloneInv(G.inv); writeSave(); }
    if (tr.snap) restoreSnapshot(tr.snap);
    if (G.dev && G.dev.presolve) devComplete();
    const info = G.info;
    UI.$('cardB').textContent = info.label;
    UI.$('cardName').textContent = info.name;
    UI.$('cardQuote').textContent = '';
    UI.only('card');
    setTimeout(() => UI.typewrite(UI.$('cardQuote'), info.quote, 30, () => Math.random() < 0.5 && audio.tick()), 900);
  }
  if (tr.loaded && tr.skip) { tr.skip = false; tr.t = Math.max(tr.t, 6); }
  if (tr.loaded) {
    player.shake = Math.max(player.shake, 0.25);
    player.applyCamera(dt, G);
    audio.listen(camera.position, player.forward());
  }
  if (tr.t > 6) {
    UI.only('hud');
    UI.$('fade').classList.remove('on');
    audio.liftMotor(false);
    audio.clank(G.B.lift.pos, 1);
    if (tr.snap && tr.snap.lift.phase === 'open') {
      // back exactly where you were: the gate already up
      G.lift = { phase: 'open', t: 0 };
      G.B.lift.bars.position.y = WALL_H - 0.25;
      G.B.gate.off = true;
      G.liftSealed = false;
      setTimeout(() => G.state === 'play' && UI.message('Back where you left off.', 3.5), 600);
    } else {
      G.lift = { phase: 'opening', t: 0 };
      audio.gateSlide(G.B.lift.pos);
    }
    G.state = 'play';
    G.saveT = 5;
    audio.setMode('roam');
    // a resumed floor doesn't replay what you already heard on it
    G.beat = { pa: G.floorTime > 55 };
    if (G.depth > 1 && G.D.tags && G.mode !== 'hunt') setTimeout(() => G.state === 'play' && UI.message(`The lift needs ${G.D.tags} tags. Hold Q to listen.`, 4.5), 2500);
  }
}

function nextFloor() {
  // what getting off this floor earns
  if (G.mode === 'story') { if (G.depth === 0) ach('hired'); for (const d of [2, 3, 5, 8]) if (G.depth === d) ach('b' + d); }
  if (G.depth > 0 && G.hunters.length && !G.chased) ach('unseen');
  if (G.mode !== 'story' && G.depth + 1 >= 12) ach('overtime');
  if (G.mode === 'story') { save.story.floor = G.depth + 1; save.story.seed = 0; }
  save.snap = null; // the new floor's start is the checkpoint now
  writeSave();
  G.trans = { t: 0, loaded: false, next: G.depth + 1 };
  G.state = 'transition';
  UI.$('fade').classList.add('on');
  UI.prompt(null);
}

// ---------- hurting and dying ----------
// one hit is all it takes
function hurt(h) {
  if (G.state !== 'play') return;
  player.hp = 0;
  startDeath(h, 'hook');
  return;
}

function startDeath(h, kind, locker) {
  if (G.state === 'dying' || G.state === 'dead') return;
  G.state = 'dying';
  save.deathsAll = (save.deathsAll || 0) + 1; ach('processed'); if (save.deathsAll >= 25) ach('regular');
  // which death: any of the five, but never the same one twice in a row
  // (Less gore: only the films with next to none in them: the fall, the beating, the smoke break)
  const pool = deathPool();
  const ready = G.nextCs && pool.includes(G.nextCut) && (!window.__forceCut || window.__forceCut === G.nextCut);
  const sceneKind = ready ? G.nextCut : window.__forceCut || pool[(Math.random() * pool.length) | 0];
  save.lastCut = sceneKind;
  G.death = { t: 0, h, kind, scene: sceneKind, eye: camera.position.clone(), floorPos: player.pos.clone(), cs: ready ? G.nextCs : null };
  if (ready) G.nextCs = null; else if (G.nextCs) { G.nextCs.dispose(); G.nextCs = null; }
  audio.jumpscare(1);
  audio.setChase(0);
  audio.setBreath(0, 1);
  audio.setListen(false);
  G.listening = false;
  guide.reset();
  UI.prompt(null);
  UI.only();
  UI.$('slits').classList.remove('on');
  h.setState('grab');
  for (const o of G.hunters) if (o !== h) o.obj.visible = false;
  // put it right in your face
  // it starts back where it was (a few steps off at most) and closes the gap in a blink
  let dir, from;
  if (kind === 'locker') {
    dir = locker.facing.clone();
    from = 2.4;
    locker.target = 1;
    locker.obj.userData.door.visible = true;
  } else {
    dir = new THREE.Vector3(h.pos.x - player.pos.x, 0, h.pos.z - player.pos.z);
    from = Math.min(3.2, Math.max(1.6, dir.length() + 0.6));
    if (dir.lengthSq() < 0.01) dir.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    dir.normalize();
  }
  G.death.from = from;
  G.death.dir = dir;
  h.yaw = Math.atan2(-dir.x, -dir.z);
  audio.setMuffle(false);
}

const _head = new THREE.Vector3();
const faceLight = new THREE.PointLight(0xff5a40, 0, 3, 2);
scene.add(faceLight);
const LUNGE = 0.13, GRAB = 1.5;
function updateDeath(dt) {
  const d = G.death, h = d.h, t = (d.t += dt);
  const grab = t < GRAB, hit = t >= LUNGE;
  const base = d.kind === 'locker' ? 1.25 : 1.3;
  if (grab) {
    // the lunge: from where it stood to a hand's width from your face, in an eighth of a second
    const k = Math.min(1, t / LUNGE), lunge = 1 - (1 - k) ** 3;
    const dist = d.from + (base - 0.38 - d.from) * lunge;
    h.pos.copy(d.kind === 'locker' ? player.hidden.pos : d.floorPos).addScaledVector(d.dir, dist);
  }
  // once it has you, its head shakes like something's trying to get out of it
  const rattle = hit ? (t < 0.7 ? 1 : 0.55) : 0.15;
  const jitter = { x: (Math.random() - 0.5) * 1.1 * rattle, y: (Math.random() - 0.5) * 0.9 * rattle, z: (Math.random() - 0.5) * 1.2 * rattle, r: (Math.random() - 0.5) * 1.6 * rattle };
  let swing = 0;
  if (!grab) swing = t < 2.0 ? 0 : Math.min(1, (t - 2.0) / 0.13);
  // the jaw keeps going past where a jaw should stop
  const jaw = grab ? (hit ? Math.min(1.75, 0.6 + (t - LUNGE) * 4.5) + Math.random() * 0.12 : 0.6) : 0.7;
  poseForeman(h.body, { gait: 0, speed: 0, mode: grab ? 'grab' : 'attack', t, swing, jawOpen: jaw, twitch: grab ? jitter : { x: 0.3, y: 0, z: 0.4, r: 0.5 } });
  h.obj.position.copy(h.pos);
  h.obj.rotation.y = h.yaw;
  h.obj.updateMatrixWorld(true);
  h.body.head.getWorldPosition(_head);
  if (t > 0.5 && !d.cs) { d.cs = new Cutscene(d.scene, { mats, audio, blood, aspect: camera.aspect, env: scene.environment }); d.cs.prepare(renderer); }
  if (!grab && camera.fov !== save.settings.fov) {
    camera.fov = save.settings.fov;
    camera.updateProjectionMatrix();
  }
  if (grab) {
    // it lifts you off the floor by the throat, up to its face
    camera.position.copy(d.eye);
    const after = Math.max(0, t - LUNGE);
    camera.position.y += 0.45 * Math.min(1, after / 0.1);
    camera.lookAt(_head);
    // the hit: the view punches in on its face, then breathes
    const fov0 = save.settings.fov;
    camera.fov = hit ? fov0 * (after < 0.05 ? 0.5 : 0.62 + 0.06 * Math.sin(after * 31)) : fov0;
    camera.updateProjectionMatrix();
    const shake = hit ? Math.max(0.25, 1 - after * 1.2) : 0.05;
    camera.rotation.z += (Math.random() - 0.5) * 0.35 * shake;
    camera.position.x += (Math.random() - 0.5) * 0.09 * shake;
    camera.position.y += (Math.random() - 0.5) * 0.09 * shake;
    // white, red, black, white: the strobe of being taken
    // set outright every frame so nothing smears: single hard frames over a clean, close face
    const ph = Math.floor(after * 24) % 4;
    const strobe = hit && after < 0.45;
    G.flash = !hit ? 0 : after < 0.03 || (strobe && ph === 0) ? 0.85 : 0;
    G.damage = strobe && ph === 2 ? 1.1 : hit && !strobe && Math.random() < dt * 5 ? 0.9 : 0;
    G.blackout = strobe && ph === 3 && after > 0.1 ? 0.9 : 0;
    faceLight.position.lerpVectors(camera.position, _head, 0.5);
    faceLight.color.setHex(Math.random() < 0.5 ? 0xff2a14 : 0xffe0c8);
    faceLight.intensity = hit ? 4 + Math.random() * 4 : 1.5;
    player.torch.intensity = Math.random() < 0.3 ? 0 : 20 + Math.random() * 35; // shaking in your hand
    G.fear = 1;
    G.scare = 1;
  } else {
    // hard cut from its face to how you die
    if (!G.cutscene) {
      faceLight.intensity = 0;
      camera.fov = save.settings.fov;
      camera.updateProjectionMatrix();
      G.flash = 1;
      G.cutscene = d.cs || new Cutscene(d.scene, { mats, audio, blood, aspect: camera.aspect, env: scene.environment });
      G.cutscene.cam.aspect = camera.aspect; G.cutscene.cam.updateProjectionMatrix(); // (built at the floor's load: the window may have changed since)
      noteCutscene(d.scene);
      audio.setMode('ending');
    }
    const cs = G.cutscene;
    const done = cs.update(dt);
    G.fear = cs.fear;
    G.flash = Math.max(G.flash, cs.flash);
    G.blackout = cs.blackout;
    const skippable = cs.t > 1.2;
    UI.$('skip').classList.toggle('on', skippable && cs.blackout < 1);
    if (done || (skippable && (tapped('Space') || tapped('Enter')))) {
      UI.$('skip').classList.remove('on');
      cs.dispose();
      G.cutscene = null;
      showDeath();
    }
  }
}

const DEATH_TITLES = ['PROCESSED', 'TENDERIZED', 'HUNG TO BLEED', 'DEBONED', 'RENDERED DOWN', 'PUT ON THE LINE', 'OPENED UP'];
function showDeath() {
  const d = G.death;
  G.state = 'dead';
  try { document.exitPointerLock(); } catch {}
  audio.setMuffle(false);
  // the menu drone comes back under the death screen, the way it always was
  audio.setMode('menu');
  audio.setDepth(0);
  const floor = G.depth, story = G.mode === 'story';
  const record = !story && floor > save.best;
  save.deaths++;
  // where dying sends you: easy/normal this floor, hard one floor back, extreme the very top
  const back = { easy: floor, normal: floor, hard: Math.max(1, floor - 1), extreme: 1 }[G.diff] || floor;
  G.retryFloor = back;
  save.snap = null;
  if (story) {
    // easy/normal: same floor, same layout. the time you spent dying still counts
    save.story.deaths++;
    save.story.time = Math.round(G.runTime);
    if (back !== floor) { save.story.floor = back; save.story.seed = 0; }
    // back to B1 is not a checkpoint: the shift is over, and the next one starts from scratch
    if (back === 1) Object.assign(save.story, { active: false, floor: 1, seed: 0, tags: 0 });
  } else {
    save.best = Math.max(save.best, floor);
    save.totalTags += G.runTags;
    save.runs.push({ n: G.shift, floor, tags: G.runTags, time: Math.round(G.runTime) });
    if (save.runs.length > 30) save.runs.splice(0, save.runs.length - 30);
  }
  writeSave();
  const where = `${G.info.label} — ${G.info.name}`;
  const cause = d.kind === 'locker' ? `Dragged out of a locker on ${where}.` : d.kind === 'lift' ? `He got into the lift with you on ${where}.` : `Hooked and opened on ${where}.`;
  const fmt = (s) => `${(s / 60) | 0}:${String((s | 0) % 60).padStart(2, '0')}`;
  UI.$('deathTitle').textContent = DEATH_TITLES[(Math.random() * DEATH_TITLES.length) | 0];
  UI.$('deathCause').textContent = cause;
  UI.$('deathStats').innerHTML = story ? `
    <span>FLOOR</span><b>${G.info.label} OF B${STORY_FLOORS}</b>
    <span>DEATHS THIS SHIFT</span><b>${save.story.deaths}</b>
    <span>TIME ON SHIFT</span><b>${fmt(G.runTime)}</b>
    <span>CHECKPOINT</span><b>${back === 1 ? 'NONE \u2014 A NEW SHIFT' : 'START OF B' + back}</b>` : `
    <span>DEEPEST FLOOR</span><b class="${record ? 'rec' : ''}">B${floor}${record ? ' \u2014 NEW RECORD' : ''}</b>
    <span>TAGS CUT</span><b>${G.runTags}</b>
    <span>TIME ON SHIFT</span><b>${fmt(G.runTime)}</b>
    <span>SHIFT</span><b>#${G.shift}</b>
    <span>WORKERS PROCESSED</span><b>${save.deaths}</b>`;
  UI.$('btnRetry').textContent = story && back === 1 ? 'Start a new shift' : back === floor ? `Try ${G.info.label} again` : back === 1 ? 'Back to B1' : `Back to B${back}`;
  UI.$('deathStats').insertAdjacentHTML('beforeend', `<span>DIFFICULTY</span><b>${(DIFFS[G.diff] || DIFFS.normal).label}</b>`);
  UI.only('death');
  blood.clear();
  disposeLevel();
  G.B = null;
}

// the remaster's locker body: dark, bloodied overalls, so it doesn't melt into the pale paint of the locker around it
function lockerClothes(b) {
  mats.lockerCloth ||= THREE.ownRandom(() => { const m = b.cloth.clone(); m.color = new THREE.Color(0x3a4250); return m; });
  b.root.traverse((o) => { if (o.isMesh && o.material === b.cloth) o.material = mats.lockerCloth; });
  b.cloth = mats.lockerCloth;
}

// ---------- the end ----------
// the locker scare's body, posed exactly as openFilled poses it, fused once so the real one is ready in the cache
let lockerWarm = false;
function prewarmLockerBody() {
  if (lockerWarm) return;
  lockerWarm = true;
  THREE.ownRandom(() => {
    let s = 1; const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const b = P.makeBody(mats, rng, { dead: true });
    b.root.rotation.y = Math.PI; b.root.scale.setScalar(0.96); b.root.position.y = 0.935 * 0.96;
    b.head.rotation.set(0.7, 0.3, 0.2); b.jaw.rotation.x = 0.5;
    lockerClothes(b);
    const pivot = new THREE.Group(); pivot.position.set(0, 0, -0.42); pivot.add(b.root);
    fuseBodies(pivot);
  });
}

function startEnding() {
  try { document.exitPointerLock(); } catch {}
  const st = save.story;
  const time = Math.round(G.runTime);
  st.done = (st.done || 0) + 1;
  st.bestTime = st.bestTime ? Math.min(st.bestTime, time) : time;
  st.active = false;
  save.snap = null;
  G.endInfo = { time, deaths: st.deaths, tags: G.runTags };
  ach('out'); if (G.diff === 'hard' || G.diff === 'extreme') ach('hard'); if (G.diff === 'extreme') ach('extreme'); if (!st.deaths) ach('clean');
  noteCutscene('ending');
  writeSave();
  UI.prompt(null);
  audio.siren(false);
  audio.lineRunning(false);
  // the way out, as a film: see cutscenes.js endingBuild
  G.state = 'endcine';
  setTimeout(() => {
    if (G.state !== 'endcine') return;
    disposeLevel();
    G.B = null;
    audio.liftMotor(false);
    G.cutscene = new Cutscene('ending', { mats, audio, blood, aspect: camera.aspect, env: scene.environment });
    G.cutscene.prepare(renderer);
    UI.$('fade').classList.remove('on');
    UI.only();
  }, 1500);
  UI.$('fade').classList.add('on');
}
function updateEndCine(dt) {
  const cs = G.cutscene;
  if (!cs) return;
  const done = cs.update(dt);
  const u = post.u;
  u.fear.value = cs.fear; u.flash.value = cs.flash; u.blackout.value = cs.blackout; u.damage.value = 0; u.health.value = 1; u.hidden.value = 0;
  u.tear.value = Math.max(0, cs.fear - 0.55) * 2;
  u.tint.value.set(1, 1, 1);
  u.warm.value = 0;
  if (cs.ready) post.render(cs.scene, cs.cam); else blank();
  const skippable = cs.t > 1.5;
  UI.$('skip').classList.toggle('on', skippable);
  if (done || (skippable && (tapped('Space') || tapped('Enter')))) {
    cs.dispose();
    G.cutscene = null;
    UI.$('skip').classList.remove('on');
    endingText();
  }
}
// after the film: the card, white, with the last lines and what it cost
function endingText() {
  G.state = 'ending';
  const { time, deaths, tags } = G.endInfo;
  const fmt = (s) => `${(s / 3600) | 0}h ${String(((s / 60) | 0) % 60).padStart(2, '0')}m`;
  const lines = ENDING;
  UI.$('endStamp').classList.remove('on');
  UI.$('endStats').classList.remove('on');
  UI.$('endNav').classList.remove('on');
  UI.only('ending');
  const host = UI.$('endLines');
  host.innerHTML = '';
  lines.forEach((l, i) => setTimeout(() => {
    if (G.state !== 'ending') return;
    const p = document.createElement('p');
    host.appendChild(p);
    UI.typewrite(p, l, 32, () => Math.random() < 0.4 && audio.tick());
  }, 800 + i * 4200));
  const tEnd = 800 + lines.length * 4200;
  setTimeout(() => { if (G.state === 'ending') { UI.$('endStamp').classList.add('on'); audio.clank({ x: 0, z: 0 }, 1); } }, tEnd);
  setTimeout(() => {
    if (G.state !== 'ending') return;
    UI.$('endStats').innerHTML = `<span>TIME ON SHIFT</span><b>${fmt(time)}</b><span>TIMES PROCESSED</span><b>${deaths}</b><span>TAGS CUT</span><b>${tags}</b><span>KEEPSAKES</span><b>${save.collection.keep.length}/${KEEPSAKES.length}</b><span>NEXT SHIFT</span><b class="rec">TONIGHT, 22:00</b>`;
    UI.$('endStats').classList.add('on');
    UI.$('endNav').classList.add('on');
  }, tEnd + 2500);
}

function refreshMenu() {
  const st = save.story;
  UI.$('btnStory').textContent = st.active ? `Continue \u2014 ${floorInfo(st.floor).label} \u00B7 ${floorInfo(st.floor).name} (${(DIFFS[st.diff] || DIFFS.normal).label.toLowerCase()})` : st.done ? 'Clock in again' : 'Clock in';
  UI.$('btnNew').hidden = !st.active;
  const ot = save.snap && save.snap.mode === 'overtime' ? save.snap : null;
  UI.$('btnOvertimeContinue').hidden = !ot;
  if (ot) UI.$('btnOvertimeContinue').textContent = `Continue overtime \u2014 B${ot.depth}`;
  UI.timecard(save);
}

// ---------- saving the exact moment ----------
// Everything that isn't rebuilt from the floor's seed: where you are and what you've done, what each
// puzzle is up to, where they are, the clocks. Written every few seconds, on pause, and as the window goes.
function snapshot() {
  if (!G.B || G.mode === 'hunt' || !['play', 'paused'].includes(G.state) || ['closing', 'sealed'].includes(G.lift.phase)) return null;
  const B = G.B;
  return {
    v: 1, mode: G.mode, diff: G.diff, depth: G.depth, seed: G.floorSeed, at: Date.now(),
    runTime: G.runTime, runTags: G.runTags, floorTime: G.floorTime,
    p: { x: player.pos.x, z: player.pos.z, yaw: player.yaw, pitch: player.pitch, tags: player.tags, battery: player.battery, stamina: player.stamina,
      adrenaline: player.adrenaline, light: player.lightOn, crouch: player.crouch, locker: player.hidden ? B.lockers.indexOf(player.hidden) : -1 },
    lift: { inserted: B.lift.inserted, phase: G.lift.phase === 'opening' ? 'open' : G.lift.phase },
    corpses: B.corpses.map((c) => (c.harvested ? -1 : c.progress)),
    pickups: B.pickups.map((p) => (p.taken ? 1 : 0)),
    hunters: G.hunters.map((h) => [h.pos.x, h.pos.z, h.yaw]),
    puzzles: G.puzzles.save(),
    shown: [...guide.shown],
    inv: cloneInv(G.inv), invStart: cloneInv(G.invStart), keeps: G.floorKeeps || [],
  };
}
function saveSnapshot() {
  const s = snapshot();
  if (!s) return;
  save.snap = s;
  writeSave();
}
function restoreSnapshot(s) {
  const B = G.B;
  G.runTime = s.runTime;
  G.runTags = s.runTags;
  G.floorTime = s.floorTime;
  s.corpses.forEach((v, i) => {
    const c = B.corpses[i];
    if (!c) return;
    if (v === -1) {
      c.harvested = true;
      c.tag.visible = false;
      c.cavity.scale.multiplyScalar(1.35);
      c.pool.scale.setScalar(1.4);
      c.flies.visible = false;
      if (G.flies[i]) { G.flies[i].stop(); G.flies[i] = null; }
    } else c.progress = v;
  });
  s.pickups.forEach((t, i) => { const p = B.pickups[i]; if (p && t) { p.taken = true; hidePickup(p); } });
  B.lift.inserted = s.lift.inserted;
  B.lift.lights.forEach((l, i) => { if (i < B.lift.inserted) l.material.color.setHex(0xff3a10); });
  G.puzzles.load(s.puzzles);
  Object.assign(player, { yaw: s.p.yaw, pitch: s.p.pitch, tags: s.p.tags, battery: s.p.battery, stamina: s.p.stamina, adrenaline: s.p.adrenaline, lightOn: s.p.light, crouch: s.p.crouch });
  player.pos.set(s.p.x, 0, s.p.z);
  const lk = B.lockers[s.p.locker];
  if (lk) player.pos.set(lk.pos.x + lk.facing.x * 0.75, 0, lk.pos.z + lk.facing.z * 0.75); // you were hiding: you're right outside it
  s.hunters.forEach(([x, z, yaw], i) => { const h = G.hunters[i]; if (h) { h.pos.set(x, 0, z); h.yaw = yaw; h.obj.position.copy(h.pos); } });
  guide.shown = new Set(s.shown);
  if (s.inv) G.inv = cloneInv(s.inv);
  player.inLift = inAlcove();
}
addEventListener('pagehide', saveSnapshot);
addEventListener('beforeunload', saveSnapshot);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveSnapshot(); });

function toMenu() {
  G.asForeman = false;
  if (G.sight) G.sight.visible = G.sightAmb.visible = false;
  UI.$('hud').classList.remove('foreman');
  if (G.bot) { scene.remove(G.bot.obj); G.bot = null; }
  G.state = 'menu';
  if (inspectFrom) { viewer.hide(); inspectFrom = null; }
  refreshMenu();
  audio.setMode('menu');
  audio.setDepth(0); // the menu drone at its own pitch, however deep you got
  audio.siren(false);
  audio.lineRunning(false);
  UI.only('menu');
  audio.setChase(0);
  audio.setBreath(0, 1);
  audio.setMuffle(false);
  audio.liftMotor(false);
  UI.$('fade').classList.remove('on');
  UI.$('slits').classList.remove('on');
  blood.clear();
  if (G.B) { disposeLevel(); G.B = null; }
}

// ---------- interaction ----------

function findInteract() {
  const B = G.B, D = G.D;
  if (player.hidden) return { type: 'unhide' };
  if (inAlcove() && G.lift.phase === 'open') {
    if (player.tags > 0) return { type: 'feed' };
    if (B.lift.inserted >= D.tags && G.puzzles.ready) return { type: 'lever' };
    return { type: 'liftInfo' };
  }
  // whatever you're looking at most directly wins
  let best = null, bs = -1e9;
  const consider = (it, pos, d, range, minFacing, bonus = 0) => {
    if (d > range) return;
    const f = it.p && it.p.aim ? player.facingDot(pos) : d < 0.6 && it.type !== 'locker' ? 1 : player.flatFacing(pos);
    if (f < minFacing) return;
    const score = f * 2 - d * 0.4 + bonus;
    if (score > bs) { bs = score; best = it; }
  };
  for (const c of B.corpses) if (!c.harvested) consider({ type: 'corpse', c }, c.pos, Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z), 1.8, 0.4, 0.6);
  for (const p of B.pickups) if (!p.taken && !AUTO[p.type]) consider({ type: p.type, p }, p.pos, Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z), 1.5, 0.6);
  for (const lk of B.lockers) {
    const fx = lk.pos.x + lk.facing.x * 0.6, fz = lk.pos.z + lk.facing.z * 0.6;
    consider({ type: 'locker', lk }, lk.pos, Math.hypot(fx - player.pos.x, fz - player.pos.z), 0.95, 0.4);
  }
  for (const p of G.puzzles.interactables()) consider({ type: 'puzzle', p }, p.pos, Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z), p.range, p.minFacing, 0.3);
  return best;
}

// batteries and bolts aren't things you hold: walk over them and they're in the torch, or in the box of bolts
const AUTO = {
  battery: () => {
    if (player.battery >= 99) return false;
    player.battery = Math.min(100, player.battery + 45);
    UI.message('A battery.', 2);
    return true;
  },
  ammo: () => {
    if (G.inv.ammo >= AMMO_MAX) return false;
    const got = Math.min(2, AMMO_MAX - G.inv.ammo);
    G.inv.ammo += got;
    UI.message(`Bolts for the gun: ${G.inv.ammo}/${AMMO_MAX}.`, 2.5);
    return true;
  },
};
// a taken pickup goes, but its little light stays in the scene switched off: the number of lights in the scene is
// part of every shader, and one fewer would have every material rebuild at once (a stall), for no difference you'd see
function hidePickup(p) {
  p.obj.visible = false;
  const ls = []; p.obj.traverse((o) => { if (o.isLight && o.userData.glint) ls.push(o); });
  for (const l of ls) { scene.attach(l); l.intensity = 0; (G.offLights ||= []).push(l); }
}
function autoPickup() {
  for (const p of G.B.pickups) {
    if (p.taken || !AUTO[p.type] || Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z) > 1.1) continue;
    if (!AUTO[p.type](p)) continue;
    p.taken = true;
    hidePickup(p);
    audio.pickup();
  }
}

function handleInteract(dt) {
  // the E that closes the keypad mustn't also reopen it
  if (UI.keypad.isOpen) G.kpCool = 0.3; else G.kpCool = (G.kpCool || 0) - dt;
  if (UI.keypad.isOpen || G.kpCool > 0) { UI.prompt(null); G.holdT = 0; return; }
  const it = findInteract(), B = G.B, D = G.D;
  const holdE = keys.has('KeyE'), tapE = tapped('KeyE');
  if (!it) { UI.prompt(null); G.holdT = 0; G.holdId = null; return; }
  // holding E on one thing and drifting onto another must not carry the progress over
  const id = (it.type === 'puzzle' ? it.p.pos : it.c || it.p || it.lk) || it.type; // puzzle entries are rebuilt each frame; their positions aren't
  if (id !== G.holdId) { G.holdId = id; G.holdT = 0; }
  const hold = (secs, label, done) => {
    if (holdE) G.holdT += dt / secs; else G.holdT = Math.max(0, G.holdT - dt * 2);
    UI.prompt(label, Math.min(1, G.holdT));
    if (G.holdT >= 1) { G.holdT = 0; done(); }
  };
  switch (it.type) {
    case 'corpse': {
      const c = it.c;
      if (holdE) {
        c.progress += dt / 2.6;
        // cutting a tag out carries right across the floor (Normal and harder): he comes to see
        if (!c.heard && c.progress > 0.2 && G.diff !== 'easy') { c.heard = true; for (const h of G.hunters) h.hear({ pos: player.pos.clone(), radius: 9999, loud: true }); }
        G.cutT -= dt;
        if (G.cutT < 0) {
          G.cutT = 0.32 + Math.random() * 0.25;
          audio.squelch(0.9);
          blood.splash(0.25, true);
          player.shake = Math.max(player.shake, 0.22);
        }
        player.vel.multiplyScalar(0.8);
      }
      UI.prompt('<kbd>E</kbd>&nbsp; HOLD — CUT OUT THE TAG', Math.min(1, c.progress));
      if (c.progress >= 1) harvest(c);
      break;
    }
    case 'adrenaline':
      if (!hasRoom('syringe')) { UI.prompt(FULL); break; }
      UI.prompt('<kbd>E</kbd>&nbsp; TAKE THE SYRINGE');
      if (tapE) {
        it.p.taken = true;
        hidePickup(it.p);
        player.adrenaline++;
        audio.pickup();
        UI.message('A syringe. Press R to use it when you need to run.', 3);
      }
      break;
    case 'gun':
      if (!hasRoom('gun')) { UI.prompt(FULL); break; }
      UI.prompt('<kbd>E</kbd>&nbsp; TAKE THE BOLT GUN');
      if (tapE) {
        it.p.taken = true;
        hidePickup(it.p);
        G.inv.built = true;
        audio.clank(player.pos, 0.6);
        UI.message(G.inv.ammo ? 'A captive-bolt gun, the kind they stunned cattle with. It is loaded. Click to fire.' : 'A captive-bolt gun, the kind they stunned cattle with. Empty. Bolts turn up on the floors below.', 4.5);
      }
      break;
    case 'keepsake': {
      const k = KEEPSAKES.find((x) => x.id === it.p.id);
      UI.prompt(`<kbd>E</kbd>&nbsp; PICK UP THE ${k.name.toUpperCase()}`);
      if (tapE) {
        it.p.taken = true;
        hidePickup(it.p);
        if (!save.collection.keep.includes(k.id)) save.collection.keep.push(k.id);
        if (save.collection.keep.length >= 5) ach('keeper');
        if (KEEPSAKES.every((x) => save.collection.keep.includes(x.id))) ach('collector');
        writeSave();
        audio.tick();
        inspectKeepsake(k.id, 'play');
      }
      break;
    }
    case 'puzzle': {
      const p = it.p;
      if (p.hold) {
        if (holdE && p.tick) {
          G.cutT -= dt;
          if (G.cutT < 0) {
            G.cutT = 0.35 + Math.random() * 0.2;
            if (p.tick === 'squelch') { audio.squelch(0.7); blood.splash(0.15, true); }
            else if (p.tick === 'screech') audio.creak(p.pos);
            else audio.clank(p.pos, 0.4);
            if (p.noise) G.noise(p.pos, p.noise, false, 'work');
          }
        }
        hold(p.hold, '<kbd>E</kbd>&nbsp; ' + p.label, p.use);
      } else if (p.use && p.tap !== false) {
        UI.prompt('<kbd>E</kbd>&nbsp; ' + p.label);
        if (tapE) p.use();
      } else UI.prompt(p.label);
      break;
    }
    case 'locker':
      if (it.lk.filled === 'open') { UI.prompt('SOMEONE GOT IN THIS ONE FIRST'); break; }
      UI.prompt('<kbd>E</kbd>&nbsp; HIDE');
      if (tapE && performance.now() > (G.lockerCool || 0)) { G.lockerCool = performance.now() + 350; if (it.lk.filled || G.lockerScare) openFilled(it.lk); else hide(it.lk); } // real time, so a slow frame rate can't swallow the key
      break;
    case 'unhide':
      UI.prompt('<kbd>E</kbd>&nbsp; GET OUT');
      if (tapE && performance.now() > (G.lockerCool || 0)) { G.lockerCool = performance.now() + 350; unhide(); }
      break;
    case 'feed':
      hold(1, '<kbd>E</kbd>&nbsp; HOLD — FEED THE TAGS TO THE LIFT', () => {
        B.lift.inserted += player.tags;
        player.tags = 0;
        B.lift.lights.forEach((l, i) => { if (i < B.lift.inserted) l.material.color.setHex(0xff3a10); });
        audio.clank(B.lift.pos, 0.8);
        audio.squelch(0.6);
        UI.message(B.lift.inserted >= D.tags ? 'The slot swallows them with a wet, hungry sound. The lever unlocks.' : `The slot swallows them. It wants ${D.tags - B.lift.inserted} more.`, 3.5);
      });
      break;
    case 'lever':
      hold(0.8, G.D.finale ? '<kbd>E</kbd>&nbsp; HOLD \u2014 PULL THE LEVER. GO UP.' : '<kbd>E</kbd>&nbsp; HOLD \u2014 PULL THE LEVER', () => {
        G.lift = { phase: 'closing', t: 0 };
        B.lift.lever.rotation.z = -0.6;
        B.gate.off = false;
        audio.gateSlide(B.lift.pos);
        G.noise(B.lift.pos, 26, true); // everything on the floor hears that
        UI.message('The gate’s coming down.', 3);
      });
      break;
    case 'liftInfo': {
      const left = D.tags - B.lift.inserted, blocker = G.puzzles.blocker();
      UI.prompt(left > 0 ? `THE LIFT WANTS ${left} MORE TAG${left === 1 ? '' : 'S'}` : blocker ? blocker.liftMsg() : '');
      break;
    }
  }
}

// ---------- play as the Foreman: a worker does the floor, and you hunt him ----------
function setupHunt() {
  const B = G.B;
  if (G.bot) scene.remove(G.bot.obj);
  G.bot = new Survivor(G, mats, B.spawn);
  scene.add(G.bot.obj);
  // you start out on the floor, where he'd have started; the worker starts in the lift
  const at = B.hunterSpawns[0] || B.spawn;
  player.pos.set(at.x, 0, at.z);
  player.inLift = false;
  G.lift = { phase: 'open', t: 0 };
  B.gate.off = true;
  B.lift.bars.position.y = 2.6;
  G.asForeman = true;
  G.hearT = 0;
  // he knows these floors in the dark: you see them plainly
  if (!G.sight) { G.sight = new THREE.PointLight(0xfff0e0, 60, 26, 0.8); camera.add(G.sight); G.sightAmb = new THREE.HemisphereLight(0xe8e4dc, 0x40403c, 4); scene.add(G.sightAmb); }
  G.sight.visible = G.sightAmb.visible = true;
  UI.$('hud').classList.add('foreman');
  UI.message('You’re the Foreman. A worker is cutting the tags on your floor. Catch him before he reaches the lift.', 6);
}
function updateHunt(dt) {
  const bot = G.bot;
  G.runTime += dt;
  G.floorTime += dt;
  player.update(dt, G);
  if (torchHand) torchHand.update(dt, false); // the Foreman carries no torch
  bot.update(dt);
  // within 20 m and nothing in the way, you can make him out, dark or not
  const seen = !bot.done && Math.hypot(bot.pos.x - player.pos.x, bot.pos.z - player.pos.z) < 20 && lineOfSight(G.L, player.pos.x, player.pos.z, bot.pos.x, bot.pos.z);
  bot.mark.intensity += ((seen ? 7 : 0) - bot.mark.intensity) * Math.min(1, dt * 4);
  // what you heard, and which way
  G.hearT -= dt;
  const comp = UI.$('compass');
  if (G.hearT > 0 && G.heard) {
    const dx = G.heard.x - player.pos.x, dz = G.heard.z - player.pos.z;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
    UI.$('needle').style.transform = `rotate(${Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz)}rad)`;
    UI.$('compassD').textContent = `YOU HEAR HIM \u00B7 ${Math.round(Math.hypot(dx, dz))} M`;
    comp.classList.add('on');
  } else comp.classList.remove('on');
  const obj = `FIND HIM. PROCESS HIM.  <b>HIS TAGS ${bot.tags + bot.fed}/${G.D.tags}</b>`;
  if (G.huntObj !== obj) { G.huntObj = obj; UI.$('objective').innerHTML = obj + (TOUCH ? '<small>FIRE TO SWING THE HOOK \u00B7 PUSH THE STICK ALL THE WAY TO CHASE</small>' : '<small>CLICK TO SWING THE HOOK \u00B7 SHIFT TO CHASE</small>'); }
  UI.hud({ floor: `${G.info.label} \u00B7 ${G.info.name}`, battery: 100, breath: 100, hidden: false, items: [] });
  audio.listen(camera.position, player.forward(_fwd));
}
// his footsteps reach you the way yours reach the Foreman: by the same rules of noise
G.botNoise = (pos, base, kind) => {
  const n = (DIFFS[G.diff] || DIFFS.normal).noise, m = n[kind] ?? n.other ?? 1;
  const r = base * m * (G.D.hearing || 1), d = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);
  // running, or cutting a tag, carries right across the floor; anything quieter has to be close
  const far = kind === 'run' || kind === 'cut';
  if (!far && (m <= 0 || d > r)) return;
  if (kind === 'cut') audio.squelch(Math.max(0.15, 0.6 - d / 80)); else audio.thud(pos, kind === 'run' ? 0.45 : 0.2);
  G.heard = { x: pos.x, z: pos.z };
  G.hearT = 1.6;
};
G.botHarvest = (c) => {
  G.botNoise(c.pos, 999, 'cut');
  c.harvested = true;
  c.tag.visible = false;
  c.flies.visible = false;
  const i = G.B.corpses.indexOf(c);
  if (G.flies[i]) { G.flies[i].stop(); G.flies[i] = null; }
  audio.tear();
};
function huntSwing() {
  if ((G.swingT || 0) > T) return;
  G.swingT = T + 0.9;
  audio.whoosh(player.pos);
  const bot = G.bot, dx = bot.pos.x - player.pos.x, dz = bot.pos.z - player.pos.z, d = Math.hypot(dx, dz);
  const facing = (-Math.sin(player.yaw) * dx - Math.cos(player.yaw) * dz) / (d || 1);
  if (d < (G.D.reach || 2.1) + 0.3 && facing > 0.6 && !bot.safe) {
    audio.squelch(1); audio.crack();
    bot.done = 'caught';
    // you have him: through your own eyes, the drag to the grinder
    G.state = 'huntcine';
    try { document.exitPointerLock(); } catch {}
    G.flash = 1;
    G.cutscene = new Cutscene('process', { mats, audio, blood, aspect: camera.aspect, env: scene.environment });
    G.cutscene.prepare(renderer);
    UI.$('compass').classList.remove('on');
    UI.prompt(null);
  }
}
function updateHuntCine(dt) {
  const cs = G.cutscene;
  const done = cs.update(dt);
  G.fear = cs.fear;
  G.flash = Math.max(G.flash, cs.flash);
  G.blackout = cs.blackout;
  const skippable = cs.t > 1.2;
  UI.$('skip').classList.toggle('on', skippable && cs.blackout < 1);
  if (done || (skippable && (tapped('Space') || tapped('Enter')))) {
    UI.$('skip').classList.remove('on');
    cs.dispose();
    G.cutscene = null;
    G.blackout = 0;
    blood.clear();
    G.huntOver('caught');
  }
}
G.huntOver = (how) => {
  if (G.state !== 'play' && G.state !== 'huntcine') return;
  G.state = 'huntend';
  try { document.exitPointerLock(); } catch {}
  UI.message(how === 'caught' ? 'You got him. He goes on the rail with the others.' : 'The gate comes down. He got away with the tags. He will tell someone.', 5);
  if (how === 'escaped') audio.clank(G.B.lift.pos, 1);
  setTimeout(() => { if (G.state === 'huntend') toMenu(); }, 5000);
};

function harvest(c) {
  c.harvested = true;
  c.tag.visible = false;
  c.cavity.scale.multiplyScalar(1.35);
  c.pool.scale.setScalar(1.4);
  c.flies.visible = false;
  const i = G.B.corpses.indexOf(c);
  if (G.flies[i]) { G.flies[i].stop(); G.flies[i] = null; }
  audio.tear();
  audio.crack();
  blood.splash(0.7, true);
  player.shake = 0.5;
  player.tags++;
  G.runTags++;
  ach('firsttag');
  if (G.runTags === 1) director.queue('face', 6 + Math.random() * 5);
  const got = G.B.lift.inserted + player.tags;
  if (got >= G.D.tags) {
    // the last one: and now he knows exactly where you are
    UI.message('Pulled out a tag. That’s all of them. Get back to the lift.', 4);
    setTimeout(() => {
      if (G.state !== 'play') return;
      // the nearer one comes for you; any other goes to stand between you and the lift
      const order = G.hunters.slice().sort((a, b) => a.pos.distanceTo(player.pos) - b.pos.distanceTo(player.pos));
      order.forEach((h, i) => { if (h.state !== 'chase') h.hear({ pos: i === 0 ? player.pos.clone() : G.B.lift.pos.clone().setY(0).add(new THREE.Vector3(0, 0, -2.5)), radius: 999, loud: false }); });
    }, 2500);
  } else UI.message('Pulled out a tag.', 3);
}

function hide(lk) {
  player.hidden = lk;
  lk.uses = (lk.uses || 0) + 1; // (he learns which lockers you like: see monster.js, search)
  player.hiddenSeenBy = new Set(G.hunters.filter((h) => h.seesPlayer || (h.state === 'chase' && h.pos.distanceTo(player.pos) < 4)));
  player.lockerMove = { from: camera.position.clone(), t: 0 }; // the camera slides in rather than jumping
  player.vel.set(0, 0, 0);
  player.yaw = lk.camYaw;
  player.pitch = 0;
  player.breath = 100;
  lk.obj.userData.door.visible = false;
  lk.target = 0;
  UI.$('slits').classList.add('on');
  audio.lockerClose(lk.pos, true);
  audio.setMuffle(true);
  G.noise(lk.pos, 2.5, false, 'locker');
}
// a locker with someone already in it: the door swings open and he comes out at you, face first
function openFilled(lk) {
  const first = G.lockerScare;
  G.lockerScare = false;
  if (first && G.mode === 'story') { save.story.lockerScared = true; writeSave(); }
  lk.filled = 'open';
  lk.target = 1;
  const b = P.makeBody(mats, Math.random, { dead: true });
  const pivot = new THREE.Group(); // at his feet, at the back of the locker: he tips out from there
  pivot.position.set(0, 0, -0.42);
  b.root.rotation.y = Math.PI;
  b.root.scale.setScalar(0.96);
  b.root.position.y = 0.935 * 0.96; // the body is built round its hips: stand him on his feet
  b.head.rotation.set(0.7, 0.3, 0.2);
  b.jaw.rotation.x = 0.5;
  pivot.add(b.root);
  if (REMASTER) { lockerClothes(b); fuseBodies(pivot); } // already worked out at floor load (prewarmLockerBody): no stall
  lk.obj.add(pivot);
  lk.slump = { pivot, t: 0, fall: REMASTER }; // the remaster: he doesn't just slump, he falls out on you
  audio.lockerOpen(lk.pos, true);
  if (first) {
    audio.jumpscare(1);
    G.flash = 0.6;
    player.shake = Math.max(player.shake, 1);
    UI.message('Somebody got here first.', 3);
  } else {
    audio.stinger();
    player.shake = Math.max(player.shake, 0.4);
  }
  setTimeout(() => audio.bodyDrop(lk.pos), REMASTER ? 600 : 380);
  G.scare = 1;
  G.noise(lk.pos, 6, false, 'locker');
}
function unhide() {
  const lk = player.hidden;
  player.hidden = null;
  // step out to a clear spot in front of it (the first that isn't in a wall or a prop)
  const out = new THREE.Vector3();
  for (const [d, side] of [[0.75, 0], [0.9, 0.3], [0.9, -0.3], [1.1, 0], [0.6, 0]]) {
    out.set(lk.pos.x + lk.facing.x * d - lk.facing.z * side, 0, lk.pos.z + lk.facing.z * d + lk.facing.x * side);
    const probe = out.clone();
    collide(G.L, G.B, probe, 0.3);
    if (probe.distanceToSquared(out) < 1e-4) break;
    out.copy(probe);
  }
  player.lockerMove = { from: camera.position.clone(), t: 0 };
  player.pos.copy(out);
  player.vel.set(0, 0, 0);
  player.crouch = false;
  lk.obj.userData.door.visible = true;
  lk.open = 1;
  lk.target = 0;
  UI.$('slits').classList.remove('on');
  audio.setMuffle(false);
  audio.lockerOpen(lk.pos, true);
  G.noise(lk.pos, 5, false, 'locker');
}

// ---------- the lift ----------
function updateLift(dt) {
  const B = G.B, lf = G.lift, lift = B.lift, top = WALL_H - 0.25;
  lf.t += dt;
  player.inLift = inAlcove();
  switch (lf.phase) {
    case 'opening':
      lift.bars.position.y = Math.min(1, lf.t / 2.4) * top;
      if (lf.t > 1.6) { B.gate.off = true; G.liftSealed = false; }
      if (lf.t > 2.4) lf.phase = 'open';
      break;
    case 'closing': {
      lift.bars.position.y = (1 - Math.min(1, lf.t / 3)) * top;
      // anything that gets in before the gate is down is in here with you
      for (const h of G.hunters) {
        if (Math.hypot(h.pos.x - lift.pos.x, h.pos.z - lift.pos.z) < 1.15) { startDeath(h, 'lift'); return; }
        if (h.pos.z < lift.pos.z - 0.9 && h.pos.distanceTo(lift.pos) < 2.3 && lf.t < 2.4) {
          h.pos.z = Math.max(h.pos.z, lift.pos.z - 0.5); // squeezed under the gate
        }
      }
      if (!inAlcove()) player.pos.set(lift.pos.x, 0, lift.pos.z + 0.2);
      if (lf.t >= 3) { lf.phase = 'sealed'; lf.t = 0; G.liftSealed = true; audio.clank(lift.pos, 1); }
      break;
    }
    case 'sealed':
      if (lf.t > 0.8 && !lf.motor) {
        lf.motor = true;
        audio.liftMotor(true);
        UI.message(G.D.finale ? 'It\u2019s moving. It\u2019s going UP.' : 'It\u2019s moving. You\u2019re going down.', 3);
      }
      if (lf.t > 0.8) player.shake = Math.max(player.shake, 0.3);
      if (lf.t > 2.2) { if (G.D.finale && G.mode === 'story') startEnding(); else nextFloor(); }
      break;
  }
}

// ---------- per-frame world ----------
const _fwd = new THREE.Vector3();
function updateLamps(t) {
  const B = G.B, pp = player.pos;
  const live = [];
  for (const l of B.lamps) {
    let on = 1;
    if (l.state === 'dead') on = 0;
    else if (l.state === 'flicker') {
      const n = Math.sin(t * 13 + l.phase) + Math.sin(t * 7.3 + l.phase * 2) + Math.sin(t * 31 + l.phase * 3);
      on = n > -1.1 ? 1 : 0.04;
    } else if (l.state === 'lift') on = G.lift.phase === 'sealed' ? (Math.random() < 0.7 ? 1 : 0.1) : 0.92 + Math.sin(t * 40) * 0.05;
    if (G.lampKill > 0 && l.state !== 'lift' && Math.abs(l.pos.x - pp.x) + Math.abs(l.pos.z - pp.z) < 28) on = Math.random() < 0.08 ? 1 : 0;
    l.on = on;
    if (l.obj) l.obj.userData.bulb.material = on > 0.5 ? mats.lampOn : mats.lampOff;
    if (on > 0.01) live.push(l);
  }
  live.sort((a, b) => a.pos.distanceToSquared(pp) - b.pos.distanceToSquared(pp));
  player.lit = false;
  lampTurn++;
  lampLights.forEach((light, i) => {
    const l = live[i];
    // a lamp's shadow cube is six renders: redrawn when the lamp changes, otherwise one lamp per frame in turn
    if (light.castShadow) {
      light.shadow.autoUpdate = false;
      if (l && (light.userData.lamp !== l || lampTurn % Math.max(1, GFX.lampShadows) === i)) light.shadow.needsUpdate = true;
      light.userData.lamp = l;
    }
    if (!l) { light.intensity = 0; return; }
    light.position.copy(l.pos);
    light.intensity = l.on * (l.state === 'lift' ? 6 : 13);
    if (l.on > 0.5 && Math.hypot(l.pos.x - pp.x, l.pos.z - pp.z) < 3) player.lit = true;
  });
}

function updateSwingers(dt, t) {
  for (const o of G.B.swingers) {
    const s = o.userData.swing;
    if (s.still) continue;
    // anything big walking past sets them moving
    for (const h of G.hunters) {
      const d = Math.hypot(h.pos.x - o.position.x, h.pos.z - o.position.z);
      if (d < 0.8 && h.speed > 0.5) { s.v += dt * 3 * Math.sign(Math.sin(h.yaw)); if (Math.random() < dt * 0.8) audio.creak({ x: o.position.x, y: 2.4, z: o.position.z }); }
    }
    const dp = Math.hypot(player.pos.x - o.position.x, player.pos.z - o.position.z);
    if (dp < 0.7) s.v += dt * 2;
    s.v += (-s.a * 4 - s.v * 0.4) * dt + Math.sin(t * 0.7 + s.phase) * 0.004;
    s.a += s.v * dt;
    o.rotation.z = s.a;
    o.rotation.x = s.a * 0.4 * Math.sin(s.phase);
  }
}

function updateWater(dt) {
  const w = G.B && G.B.water;
  // the scum drifts one way, the ripples run another, so the surface never looks painted on
  if (w) { w.material.map.offset.x += dt * 0.012; w.material.map.offset.y += dt * 0.02; const n = w.material.normalMap; if (n) { n.offset.x -= dt * 0.05; n.offset.y += dt * 0.031; } }
}
function updateLockers(dt) {
  for (const lk of G.B.lockers) {
    lk.open += (lk.target - lk.open) * Math.min(1, dt * (lk.target ? 10 : 6));
    lk.obj.userData.hinge.rotation.y = -lk.open * 1.8;
    // the one inside falls forward against the open door frame and stops there, half out
    if (lk.slump && lk.slump.fall && lk.slump.t < 1.6) {
      // tipping out, slowly and then all at once; he lands across your feet with a jolt and settles
      const sl = lk.slump; sl.t += dt;
      const k = Math.min(1, sl.t / 0.62), land = Math.max(0, sl.t - 0.62);
      sl.pivot.rotation.x = 1.42 * k * k * k + (land > 0 ? Math.sin(Math.min(1, land / 0.35) * Math.PI) * 0.06 * Math.exp(-land * 4) : 0);
      if (land > 0 && !sl.hit) { sl.hit = true; player.shake = Math.max(player.shake, 1.2); G.flash = Math.max(G.flash || 0, 0.25); }
    } else if (lk.slump && !lk.slump.fall && lk.slump.t < 1) { lk.slump.t += dt * 2.2; const k = Math.min(1, lk.slump.t); lk.slump.pivot.rotation.x = 0.42 * k * k + Math.sin(k * Math.PI) * 0.05; }
  }
}

function updateGame(dt, t) {
  if (G.mode === 'hunt') { updateHunt(dt); return; }
  const B = G.B;
  G.runTime += dt;
  G.floorTime += dt;
  storyBeats();
  updateWater(dt);
  audio.setMuffle(!!player.hidden); // follows you in and out, whatever path got you there
  G.saveT -= dt;
  if (G.saveT < 0) { G.saveT = 4; saveSnapshot(); }
  G.lampKill -= dt;
  G.torchKill -= dt;
  G.slowT -= dt;
  G.frozen = UI.keypad.isOpen;
  const listen = keys.has('KeyQ') && !player.hidden && !G.frozen;
  if (listen !== !!G.listening) { G.listening = listen; audio.setListen(listen); }
  player.update(dt, G);
  if (torchHand) torchHand.update(dt);
  if (motes) { camera.updateMatrixWorld(); motes.update(dt, camera, player.torch, renderer.getDrawingBufferSize(_buf).y * post.q.scale); }
  for (const h of G.hunters) h.update(dt, t);
  if (G.state !== 'play') return; // a hunter may have just killed you
  updateLift(dt);
  if (G.state !== 'play') return;
  autoPickup();
  handleInteract(dt);
  G.puzzles.update(dt);
  guide.update(dt);
  director.update(dt);
  updateLamps(t);
  updateSwingers(dt, t);
  updateLockers(dt);
  for (const c of B.corpses) if (!c.harvested && c.pos.distanceToSquared(player.pos) < 200) animateFlies(c.flies, t);

  // fear: how close it is, whether it can see you, whether it's running
  let near = 99, chase = false, nearH = null;
  for (const h of G.hunters) {
    const d = h.pos.distanceTo(player.pos);
    if (d < near) { near = d; nearH = h; }
    if (h.state === 'chase') chase = true;
  }
  let f = Math.max(0, Math.min(1, 1 - (near - 2) / 16));
  if (nearH && !lineOfSight(G.L, nearH.pos.x, nearH.pos.z, player.pos.x, player.pos.z)) f *= 0.55;
  if (chase && !G.wasChase && nearH) caption('heavy footsteps, running at you', nearH.pos);
  G.wasChase = chase;
  if (chase) { f = Math.max(f, 0.75); G.chased = true; }
  // in a locker, breath held, with him right outside: if he walks away, that's an achievement
  if (player.hidden && player.holding && near < 2.4) G.closeCall = true;
  if (G.closeCall && (!player.hidden || near > 9)) { if (player.hidden) ach('breath'); G.closeCall = false; }
  G.scare = Math.max(0, G.scare - dt * 0.35);
  G.fear += (Math.max(f, G.scare) - G.fear) * Math.min(1, dt * 2.5);
  audio.setChase(chase ? 1 : 0);
  // the line has stopped: they know exactly where you are, all the time
  if (G.frenzy) {
    G.frenzyT -= dt;
    if (G.frenzyT < 0) {
      G.frenzyT = 0.7;
      for (const h of G.hunters) if (!['chase', 'attack', 'recover', 'grab', 'locker'].includes(h.state)) h.hear({ pos: player.pos.clone(), radius: 999, loud: true });
    }
  }

  // hiding: it can hear you breathe
  if (player.hidden) {
    const close = G.hunters.filter((h) => h.pos.distanceTo(player.pos) < 7 && h.state !== 'grab');
    player.breathUrgent = close.length > 0;
    for (const h of close) {
      if (!player.holding && h.pos.distanceTo(player.pos) < 4.5 && h.state !== 'locker' && Math.random() < dt * 0.45 * (DIFFS[G.diff] || DIFFS.normal).hear) {
        h.lockerTarget = player.hidden;
        h.setState('locker');
        audio.sniff(h.pos);
      }
    }
    audio.setBreath(player.holding ? 0 : 0.5 + G.fear * 0.5, 0.7);
  }

  // heartbeat
  G.hb -= dt;
  // the closer he is, the louder and faster your heart, whether or not he's after you
  const close = Math.max(0, Math.min(1, 1 - (near - 1.5) / 14));
  if (G.hb < 0 && (chase || close > 0 || G.fear > 0.12)) {
    if (chase || close > 0.35) { audio.heartbeat(0.45 + 0.55 * Math.max(close, chase ? 0.6 : 0), true); G.hb = 60 / (90 + close * 80 + (chase ? 30 : 0)); }
    else { audio.heartbeat((0.12 + Math.max(G.fear, close) * 0.6) * (player.hidden ? 1.5 : 1)); G.hb = 60 / (62 + Math.max(G.fear, close) * 60); }
  }

  audio.ambienceTick(dt, player.pos);
  audio.listen(camera.position, player.forward(_fwd));
  UI.stamina(player.stamina, player.exhausted, player.boostT > 0);
  gun.update(dt, player);
  UI.hud({
    floor: `${G.info.label} · ${G.info.name}`, battery: player.battery,
    breath: player.breath, hidden: !!player.hidden, breathUrgent: player.breathUrgent, items: carried(),
  });
}

// ---------- input ----------
addEventListener('mousemove', (e) => {
  // drag to look if the browser won't give us pointer lock
  if (G.state === 'play' && (document.pointerLockElement === canvas || e.buttons)) player.look(e.movementX, e.movementY);
});
canvas.addEventListener('click', () => { if (G.state === 'play' && document.pointerLockElement !== canvas) lockPointer(); });
addEventListener('blur', () => { if (G.state === 'play') pause(); }); // alt-tabbed away: the shift waits
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && G.state === 'play') pause();
});
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && G.state === 'paused' && !UI.$('settings').classList.contains('on')) resume();
  if (e.code === 'KeyP' && G.state === 'play') pause();
});

// Ctrl+W, Ctrl+R and friends close or reload the window. In fullscreen we can claim the keyboard so they
// can't; otherwise the browser at least asks before throwing a shift away.
addEventListener('beforeunload', (e) => { if (['play', 'paused', 'transition', 'dying'].includes(G.state)) { e.preventDefault(); e.returnValue = ''; } });
addEventListener('offal-fullscreen', () => { syncFullscreenUI(); setTimeout(resize, 50); });
document.addEventListener('fullscreenchange', () => {
  // only the letter keys: Ctrl+W/R/T/N/Q can't close the window, but Alt+Tab, the Windows key and Esc stay yours
  const LOCK = ['KeyW', 'KeyR', 'KeyT', 'KeyN', 'KeyQ', 'KeyF', 'KeyS', 'KeyP', 'KeyH', 'KeyD', 'KeyG', 'KeyA', 'KeyE', 'KeyC'];
  try { if (document.fullscreenElement && navigator.keyboard) navigator.keyboard.lock(LOCK); else if (navigator.keyboard) navigator.keyboard.unlock(); } catch {}
});
// fullscreen: F11, or the setting (which also puts you there on your first click)
// the desktop app's window goes fullscreen itself (preload.cjs): Escape can never take you out of it
const NATIVE = window.offalNative || null;
function setFullscreen(on) {
  if (NATIVE) { NATIVE.setFullscreen(!!on); return; }
  try {
    if (on && !document.fullscreenElement) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch {}
}
function syncFullscreenUI() {
  const on = NATIVE ? NATIVE.isFullscreen() : !!document.fullscreenElement;
  document.querySelectorAll('[data-act=fullscreen]').forEach((b) => (b.textContent = on ? 'Exit fullscreen' : 'Fullscreen'));
  UI.$('fullscreen').checked = on;
}
document.addEventListener('fullscreenchange', () => {
  syncFullscreenUI();
  setTimeout(resize, 50);
});
addEventListener('keydown', (e) => {
  if (e.code === 'F11') { e.preventDefault(); setFullscreen(NATIVE ? !NATIVE.isFullscreen() : !document.fullscreenElement); }
  // browser shortcuts we can still swallow outside fullscreen (find, save, print, history)
  if ((e.ctrlKey || e.metaKey) && ['KeyF', 'KeyS', 'KeyP', 'KeyH', 'KeyD', 'KeyG'].includes(e.code) && G.state === 'play') e.preventDefault();
});

function pause() {
  G.state = 'paused';
  saveSnapshot();
  G.listening = false;
  audio.setListen(false);
  UI.only('pause', 'hud');
  audio.setChase(0);
  audio.setBreath(0, 1);
  if (audio.ctx) audio.ctx.suspend();
}
function resume() {
  UI.only('hud');
  if (player.hidden) UI.$('slits').classList.add('on');
  G.state = 'play';
  if (audio.ctx) audio.ctx.resume();
  lockPointer();
}

let settingsFrom = 'menu';
let diffIntent = { mode: 'story', fresh: true };
function drawFloorPick() {
  const floors = [0, ...Array.from({ length: STORY_FLOORS }, (_, i) => i + 1)];
  UI.$('floorPickBtns').innerHTML = floors.map((f) => { const i = floorInfo(f); return `<button data-act="floorpick" data-floor="${f}" class="${f === diffIntent.floor ? 'sel' : ''}">${f ? i.label : 'START'}<small>${f ? i.name : 'THE HIRING OFFICE'}</small></button>`; }).join('');
}
function pickDifficulty(mode, fresh) {
  UI.$('devMode').checked = !!save.settings.dev;
  diffIntent = { mode, fresh, floor: 0 };
  // once you've clocked out, you can start a new shift from any floor
  const pick = mode === 'story' && fresh && (save.story.done > 0 || !!save.settings.dev);
  UI.$('floorPick').hidden = !pick;
  if (pick) drawFloorPick();
  UI.$('diffTitle').textContent = mode === 'story' ? 'HOW HARD IS THIS SHIFT?' : 'OVERTIME: HOW HARD?';
  for (const el of document.querySelectorAll('[data-diff]')) el.classList.toggle('last', el.dataset.diff === (save.settings.lastDiff || 'normal'));
  UI.only('difficulty');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  audio.tick();
  const act = b.dataset.act;
  if (act === 'story') {
    if (save.story.active) startRun('story', false, null, { resume: save.snap && save.snap.mode === 'story' && save.snap.depth === save.story.floor ? save.snap : null });
    else pickDifficulty('story', true);
  }
  else if (act === 'newstory') pickDifficulty('story', true);
  else if (act === 'overtime') pickDifficulty('overtime', false);
  else if (act === 'cinema') openCinema();
  else if (act === 'cineShot') playShot(b.dataset.id);
  else if (act === 'diff') startRun(diffIntent.mode, diffIntent.fresh, b.dataset.diff, diffIntent.mode === 'story' ? { floor: diffIntent.floor } : {});
  else if (act === 'floorpick') { diffIntent.floor = +b.dataset.floor; drawFloorPick(); }
  else if (act === 'retry') {
    if (G.mode === 'story' && !save.story.active) startRun('story', true, G.diff, { floor: 1 }); // a brand new shift, same difficulty (you've been hired already)
    else startRun(G.mode, false, G.mode === 'overtime' ? G.diff : null, { floor: G.retryFloor });
  }
  else if (act === 'overtimeContinue' && save.snap) startRun('overtime', false, save.snap.diff, { resume: save.snap });
  else if (act === 'howto') UI.only('howto');
  else if (act === 'collection') openCollection();
  else if (act === 'replay') startReplay(b.dataset.cut);
  else if (act === 'keep') readKeepsake(b.dataset.id, b);
  else if (act === 'devsolve' && G.dev && G.puzzles) { devComplete(); UI.message('Dev: floor complete. Pull the lever.', 3); }
  else if (act === 'settings') { settingsFrom = G.state === 'paused' ? 'pause' : 'menu'; fillSettings(); UI.only('settings', ...(settingsFrom === 'pause' ? ['hud'] : [])); }
  else if (act === 'back' && G.state === 'menu' && (UI.$('collection').classList.contains('on') || UI.$('cinema').classList.contains('on'))) UI.only('menu');
  else if (act === 'back') { if (settingsFrom === 'pause' && G.state === 'paused') UI.only('pause', 'hud'); else if (G.state === 'menu' || G.state === 'warn') UI.only('menu'); else toMenu(); settingsFrom = 'menu'; }
  else if (act === 'resume') resume();
  else if (act === 'fullscreen') setFullscreen(NATIVE ? !NATIVE.isFullscreen() : !document.fullscreenElement);
  else if (act === 'quit') { if (audio.ctx) audio.ctx.resume(); toMenu(); }
  else if (act === 'menu') toMenu();
});
document.addEventListener('mouseover', (e) => { if (e.target.closest && e.target.closest('.menu-nav button') && audio.ctx) audio.tick(); });

function fillSettings() {
  const s = save.settings;
  UI.$('sens').value = s.sens;
  UI.$('tsens').value = s.tsens ?? 1;
  UI.$('padSens').value = s.padSens ?? 1;
  UI.$('vol').value = s.vol;
  UI.$('gamma').value = s.gamma;
  UI.$('pix').value = String(s.pix);
  UI.$('look').value = s.look === 'classic' ? 'classic' : 'remastered';
  if (REMASTER) fillGfx();
  UI.$('looksetsC').hidden = s.look !== 'classic';
  UI.$('looksetsR').hidden = s.look === 'classic';
  UI.$('draw').value = String(s.draw ?? 1);
  UI.$('uiMenu').value = String(s.uiMenu ?? 100);
  UI.$('uiGame').value = String(s.uiGame ?? 100);
  UI.$('fps').value = String(s.fps ?? 0);
  UI.$('devMode2').checked = !!s.dev;
  for (const id of ['grade', 'blood', 'contrast', 'vignette', 'filter', 'filterAmt', 'dust']) UI.$(id).value = String(s[id] ?? (id === 'grade' || id === 'filter' ? 0 : 1));
  UI.$('shake').checked = s.shake;
  for (const id of ['fov', 'beam', 'power']) UI.$(id).value = s[id];
  for (const id of ['invert', 'bob', 'hints', 'captions', 'lessGore']) UI.$(id).checked = !!s[id];
  syncFullscreenUI();
}
// settings tabs, and a line that says what the option under the pointer (or in focus) does
UI.$('setTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  for (const t of UI.$('setTabs').children) t.classList.toggle('on', t === b);
  for (const p of document.querySelectorAll('#settings .set-page')) p.classList.toggle('on', p.dataset.page === b.dataset.tab);
  if (audio.ctx) audio.tick();
});
for (const ev of ['mouseover', 'focusin']) UI.$('settings').addEventListener(ev, (e) => {
  const l = e.target.closest && e.target.closest('[data-tip]');
  if (l) UI.$('setTip').textContent = l.dataset.tip;
});
document.body.classList.toggle('remaster', REMASTER);
UI.$('fullscreen').addEventListener('input', () => {
  save.settings.fullscreen = UI.$('fullscreen').checked;
  writeSave();
  setFullscreen(save.settings.fullscreen);
});
const CHECKS = ['shake', 'invert', 'bob', 'hints', 'captions', 'lessGore'];
// ---------- remastered graphics settings (gfx.js) ----------
// the preset fills every option in; touching one option makes the set Custom, starting from what was showing
function fillGfx() {
  const s = save.settings;
  UI.$('gfx').value = s.gfx || 'auto';
  UI.$('gfxAuto').textContent = 'Auto (' + GPU.tier[0].toUpperCase() + GPU.tier.slice(1) + ')';
  UI.$('gpuName').textContent = GPU.name ? 'Detected: ' + GPU.name : '';
  UI.$('res').value = String(s.res ?? 'preset');
  for (const k of OPTS) if (k !== 'scale') { const el = UI.$(k); if (el.type === 'checkbox') el.checked = !!GFX[k]; else el.value = String(GFX[k]); }
  UI.$('grain').value = String(GFX.grain); UI.$('grainV').textContent = Math.round(GFX.grain * 100) + '%';
  UI.$('ca').checked = !!GFX.ca; UI.$('eyeAdapt').checked = !!GFX.eyeAdapt; UI.$('dynRes').checked = save.settings.dynRes !== false;
  UI.$('restartNote').hidden = LOAD_TIME.every((k) => GFX[k] === LOADED[k]);
}
function setGfx(change) {
  const s = save.settings;
  change(s);
  applySettings();
  fillGfx();
  writeSave();
}
if (REMASTER) {
  UI.$('gfx').addEventListener('input', () => setGfx((s) => { s.gfx = UI.$('gfx').value; }));
  UI.$('res').addEventListener('input', () => setGfx((s) => { s.res = UI.$('res').value; }));
  for (const k of OPTS) if (k !== 'scale') UI.$(k).addEventListener('input', () => setGfx((s) => {
    const el = UI.$(k);
    s.custom = Object.fromEntries(OPTS.map((o) => [o, GFX[o]]));
    s.custom[k] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : +el.value;
    s.gfx = 'custom';
  }));
  UI.$('grain').addEventListener('input', () => setGfx((s) => { s.grain = +UI.$('grain').value; }));
  UI.$('ca').addEventListener('input', () => setGfx((s) => { s.ca = UI.$('ca').checked; }));
  UI.$('eyeAdapt').addEventListener('input', () => setGfx((s) => { s.eyeAdapt = UI.$('eyeAdapt').checked; }));
  UI.$('dynRes').addEventListener('input', () => setGfx((s) => { s.dynRes = UI.$('dynRes').checked; dynres.k = 1; }));
}
// Classic look: the original 300p dithered renderer, exact. Remastered: native resolution, HDR, bloom, filmic grade.
UI.$('look').addEventListener('input', () => { save.settings.look = UI.$('look').value; writeSave(); window.location.reload(); }); // surfaces are painted for one look or the other at load
for (const id of ['sens', 'tsens', 'padSens', 'vol', 'gamma', 'pix', 'draw', 'fps', 'uiMenu', 'uiGame', 'fov', 'beam', 'power', 'grade', 'blood', 'contrast', 'vignette', 'filter', 'filterAmt', 'dust', ...CHECKS]) {
  UI.$(id).addEventListener('input', () => {
    const s = save.settings, el = UI.$(id);
    s[id] = CHECKS.includes(id) ? el.checked : +el.value;
    applySettings();
    writeSave();
  });
}

// everything that changes the picture, back to how the remaster comes
function lookReset() {
  const s = save.settings, wasClassic = s.look === 'classic';
  Object.assign(s, { look: 'remastered', gfx: 'auto', res: 'preset', dynRes: true, grain: 1, ca: true, eyeAdapt: true, gamma: 1, draw: 1, beam: 0.55, power: 160, grade: 0, blood: 1, contrast: 1, vignette: 1, filter: 0, filterAmt: 1, dust: 1 });
  delete s.custom;
  dynres.k = 1;
  writeSave();
  if (wasClassic) { window.location.reload(); return; }
  applySettings(); fillSettings(); fillGfx(); resize();
}
UI.$('customReset').addEventListener('click', lookReset);
UI.$('lookReset').addEventListener('click', lookReset);
// the filters' on-screen text: a VHS deck's PLAY and tape counter, the security camera's number, REC and the night's clock
var osdT0 = performance.now(); // (var: applySettings may run before this line)
function osdTick() {
  const f = REMASTER ? +save.settings.filter || 0 : 0, el = UI.$('filterOsd');
  el.classList.toggle('on', (f === 1 || f === 4) && G.state === 'play'); // the tape's text over play only: never over a menu or a film
  el.classList.toggle('cam', f === 4);
  if (f !== 1 && f !== 4) return;
  const t = (performance.now() - osdT0) / 1000, two = (n) => String(n | 0).padStart(2, '0'), blink = (t * 1.6 | 0) % 2 === 0;
  const [tl, bl, tr] = el.children;
  if (f === 1) {
    tl.textContent = t < 6 && blink ? 'PLAY \u25B6' : t < 6 ? '' : 'PLAY \u25B6';
    bl.textContent = `SP  ${(t / 3600) | 0}:${two((t / 60) % 60)}:${two(t % 60)}`;
    tr.textContent = '';
  } else {
    const night = 22 * 3600 + (G.runTime || 0) + t * 0.0;
    tl.textContent = 'CAM 0' + Math.max(1, Math.min(9, G.depth || 1)) + '  B' + (G.depth || 1);
    tr.innerHTML = (blink ? '<span class="rec">\u25CF</span>' : '<span style="opacity:0">\u25CF</span>') + ' REC';
    bl.textContent = `10-31-1998  ${two((night / 3600) % 24)}:${two((night / 60) % 60)}:${two(night % 60)}`;
  }
}
setInterval(osdTick, 250);

// ---------- inventory and the bolt gun ----------
// what's in the five boxes along the bottom: one kind of thing to a box, as many of it as you like. Each kind keeps
// the box it first went into until you've none of it left.
const FULL = 'YOUR HANDS ARE FULL \u00B7 FIVE THINGS AT A TIME';
function carried() {
  const out = [], inv = G.inv;
  if (player.tags) out.push({ id: 'tag', name: 'TAGS', n: player.tags });
  if (player.adrenaline) out.push({ id: 'syringe', name: 'SYRINGE', n: player.adrenaline, key: 'R' });
  if (inv.built) out.push({ id: 'gun', name: 'BOLT GUN', sub: `${inv.ammo}/${AMMO_MAX} BOLTS`, key: 'LMB' });
  for (const p of G.puzzles ? G.puzzles.list : []) {
    if (p.kind === 'fuses' && p.carry) out.push({ id: 'fuse', name: 'FUSES', n: p.carry });
    if (p.kind === 'scale' && p.carry.length) out.push({ id: 'meat', name: 'MEAT', n: p.carry.length, sub: p.carry.map((c) => c.w).join('+') + ' KG' });
    if (p.kind === 'keycard' && p.found) out.push({ id: 'card', name: 'KEYCARD' });
    if (p.kind === 'meatkey' && p.found) out.push({ id: 'key', name: 'CAGE KEY' });
  }
  const ids = out.map((it) => it.id);
  G.slotOrder = (G.slotOrder || []).filter((id) => ids.includes(id));
  for (const id of ids) if (!G.slotOrder.includes(id)) G.slotOrder.push(id);
  return G.slotOrder.map((id) => out.find((it) => it.id === id));
}
// room for one more of this kind: it stacks on its own box, or there's an empty one
function hasRoom(id) { const c = carried(); return c.some((it) => it.id === id) || c.length < UI.SLOTS; }
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || G.state !== 'play' || document.pointerLockElement !== canvas) return;
  if (G.mode === 'hunt') { huntSwing(); return; }
  if (gun.fire(player) === false && G.inv.built && G.inv.ammo <= 0) UI.message('Empty.', 1.2);
});
G.onStunned = (h) => {
  if (!G.stunTold) { G.stunTold = true; UI.message(`He’s down. You’ve got about ${G.D.stun} seconds.`, 4); }
  else UI.message('He drops.', 1.5);
  void h;
};
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    if (G.state === 'play') { G.tasksOpen = !G.tasksOpen; UI.$('tasks').classList.toggle('on', G.tasksOpen); }
  }
});


// ---------- cinema: staged shots for trailers (see cinema.js) ----------
// Only in the OFFAL Cinema app (its build sets window.OFFAL_CINEMA): players never see it. A shot loads a story
// floor without touching the story save, then holds it while the shot plays.
const CINEMA_APP = !!window.OFFAL_CINEMA;
const cinema = new Cinema({ G, camera, scene, post });
function openCinema() {
  if (!CINEMA_APP) return;
  UI.$('cinema').querySelector('.back').hidden = true; // the app is only this list
  UI.$('cineList').innerHTML = SHOTS.map((s) => `<button data-act="cineShot" data-id="${s.id}">${s.name.toUpperCase()}<small>${s.note}</small></button>`).join('');
  UI.only('cinema');
}
function playShot(id) {
  const shot = SHOTS.find((s) => s.id === id);
  G.cineKeep ||= { story: JSON.parse(JSON.stringify(save.story)), snap: save.snap, shifts: save.shifts };
  G.cine = { shot, on: false };
  startRun('story', true, 'normal', { floor: shot.floor });
  G.dev = { noclip: false, ghost: true, presolve: false };
}
function endCinema() {
  if (G.cine && G.cine.on) cinema.end();
  G.cine = null;
  if (G.cineKeep) { Object.assign(save, { story: G.cineKeep.story, snap: G.cineKeep.snap, shifts: G.cineKeep.shifts }); G.cineKeep = null; writeSave(); }
  disposeLevel(); G.B = null;
  toMenu();
  openCinema();
}
addEventListener('beforeunload', () => { if (G.cineKeep) { Object.assign(save, { story: G.cineKeep.story, snap: G.cineKeep.snap, shifts: G.cineKeep.shifts }); writeSave(); } }); // closed mid-shot: the real save comes back
addEventListener('keydown', (e) => { if ((e.code === 'Escape' || e.code === 'KeyE') && (G.state === 'cinema' || (G.cine && G.state === 'transition'))) endCinema(); });

// the launcher opened us with safe graphics (no GPU): say so on the menu
if (/[?&]safe=1/.test(window.location.search)) UI.$('safeNote').hidden = false;

// ---------- dev mode ----------
// the whole floor done at once: every worker's tag cut and already fed to the lift, and every puzzle solved.
// All that's left is to walk to the lift and pull the lever
function devComplete() {
  if (!G.B || !G.puzzles) return;
  G.puzzles.solveAll();
  const B = G.B;
  B.corpses.forEach((c, i) => {
    if (c.harvested) return;
    c.harvested = true;
    c.tag.visible = false;
    c.cavity.scale.multiplyScalar(1.35);
    c.pool.scale.setScalar(1.4);
    c.flies.visible = false;
    if (G.flies[i]) { G.flies[i].stop(); G.flies[i] = null; }
    G.runTags++;
  });
  player.tags = 0;
  B.lift.inserted = Math.max(B.lift.inserted, G.D.tags);
  B.lift.lights.forEach((l, i) => { if (i < B.lift.inserted) l.material.color.setHex(0xff3a10); });
}

UI.$('devMode').addEventListener('change', (e) => { save.settings.dev = e.target.checked; UI.$('devMode2').checked = e.target.checked; writeSave(); refreshMenu(); pickDifficulty(diffIntent.mode, diffIntent.fresh); });
UI.$('devMode2').addEventListener('change', (e) => { save.settings.dev = e.target.checked; UI.$('devMode').checked = e.target.checked; writeSave(); refreshMenu(); });
function openDevMenu() {
  if (!G.dev || G.state !== 'play') return;
  G.state = 'devmenu';
  try { document.exitPointerLock(); } catch {}
  UI.$('devNoclip').checked = G.dev.noclip;
  UI.$('devGhost').checked = G.dev.ghost;
  UI.$('devPresolve').checked = G.dev.presolve;
  UI.prompt(null);
  UI.only('devmenu', 'hud');
}
function closeDevMenu() {
  if (G.state !== 'devmenu') return;
  G.state = 'play';
  G.kpCool = 0.3;
  UI.only('hud');
  lockPointer();
}
for (const [id, key] of [['devNoclip', 'noclip'], ['devGhost', 'ghost'], ['devPresolve', 'presolve']]) {
  UI.$(id).addEventListener('change', (e) => {
    if (!G.dev) return;
    G.dev[key] = e.target.checked;
    if (key === 'presolve') { save.settings.devPresolve = e.target.checked; writeSave(); if (e.target.checked && G.puzzles) devComplete(); }
    // made invisible mid-chase: he loses you on the spot
    if (key === 'ghost' && e.target.checked) for (const h of G.hunters) if (['chase', 'attack', 'alert', 'heard', 'investigate'].includes(h.state)) { h.awareness = 0; h.setState('patrol'); }
  });
}
addEventListener('keydown', (e) => {
  if (e.code !== 'Backquote' && !(e.code === 'Escape' && G.state === 'devmenu')) return;
  if (G.state === 'play' && e.code === 'Backquote') { e.preventDefault(); openDevMenu(); }
  else if (G.state === 'devmenu') { e.preventDefault(); closeDevMenu(); }
});

// ---------- the collection ----------
function openCollection() {
  const c0 = save.collection, dev = !!save.settings.dev; // dev mode: every keepsake and every film is open
  const c = dev ? { keep: KEEPSAKES.map((k) => k.id), cuts: Object.keys(CUTSCENE_INFO) } : c0;
  UI.$('collCount').textContent = `${c.keep.length}/${KEEPSAKES.length}`;
  UI.$('collKeep').innerHTML = KEEPSAKES.map((k) => c.keep.includes(k.id)
    ? `<button class="coll-item" data-act="keep" data-id="${k.id}">${k.name}</button>`
    : '<button class="coll-item locked">not yet found</button>').join('');
  UI.$('collRead').textContent = c.keep.length ? 'Pick one to read it.' : 'Nothing yet. Things the workers left behind turn up on the floors.';
  const got = save.ach || {};
  UI.$('achCount').textContent = `${ACHIEVEMENTS.filter((a) => got[a.id]).length}/${ACHIEVEMENTS.length}`;
  UI.$('collAch').innerHTML = ACHIEVEMENTS.map((a) => `<div class="ach${got[a.id] ? ' got' : ''}"><b>${a.name}</b><span>${a.text}</span></div>`).join('');
  UI.$('collCuts').innerHTML = Object.keys(CUTSCENE_INFO).map((id) => c.cuts.includes(id)
    ? `<button class="coll-cut" data-act="replay" data-cut="${id}"><b>${CUTSCENE_INFO[id].name}</b>${CUTSCENE_INFO[id].text}</button>`
    : `<button class="coll-cut locked"><b>? ? ?</b>${id === 'ending' ? 'Finish the shift.' : 'Not yet.'}</button>`).join('');
  UI.only('collection');
}
function readKeepsake(id, btn) {
  const k = KEEPSAKES.find((x) => x.id === id);
  document.querySelectorAll('.coll-item.sel').forEach((b) => b.classList.remove('sel'));
  btn.classList.add('sel');
  UI.$('collRead').innerHTML = `<b>${k.name}.</b> ${k.text}`;
  inspectKeepsake(id, 'menu');
}
// picking one up (or choosing one in the collection) puts it in your hands: a lit 3D model to turn over
const viewer = new KeepsakeViewer(UI.$('inspCv'));
// the tape in the hiring office (tape.js): played over the game, on the TV in the room at the same time
G.tape = new TapePlayer({ el: UI.$('tape'), cv: UI.$('tapeCv'), fsBtn: UI.$('tapeFs'), audio });
G.playTape = (done) => {
  G.state = 'tape';
  G.tapeT = 0;
  UI.prompt(null);
  try { document.exitPointerLock(); } catch {}
  UI.only('tape');
  UI.$('brief').classList.remove('on');
  audio.setMuffle(true); // (the floor's own sound drops back under the tape)
  G.tape.play(() => {
    audio.setMuffle(false);
    done();
    if (G.state !== 'tape') return;
    G.state = 'play';
    G.kpCool = 0.35;
    UI.only('hud');
    lockPointer();
    UI.message('The lift behind the office is unlocked.', 4.5);
  });
};
const skipTape = () => { if (G.state === 'tape' && G.tapeT > 1.5) G.tape.stop(); };
addEventListener('keydown', (e) => {
  if (G.state !== 'tape' || e.repeat) return;
  if (e.code === 'KeyF') G.tape.fullscreen();
  else if (e.code === 'KeyE' || e.code === 'Escape' || e.code === 'Space') skipTape();
});
UI.$('tapeSkip').addEventListener('click', (e) => { e.stopPropagation(); skipTape(); });
// its renderer (a second WebGL context: slow to make) made while the menu is up, not the first time you pick something up
if (REMASTER) setTimeout(() => { try { THREE.ownRandom(() => viewer.init()); } catch {} }, 2500);
let inspectFrom = null;
// a letter on the floor (the hiring notice): read it on paper, the shift waits
G.openLetter = (l) => {
  UI.$('letterTitle').textContent = l.title;
  UI.$('letterHead').textContent = l.head;
  UI.$('letterBody').innerHTML = l.body.map((p) => `<p>${p}</p>`).join('');
  UI.$('letterSign').textContent = l.sign;
  UI.$('letterFrom').textContent = l.from;
  G.state = 'letter';
  G.letterT = 0;
  UI.prompt(null);
  try { document.exitPointerLock(); } catch {}
  UI.only('letter', 'hud');
  UI.$('brief').classList.remove('on');
};
function closeLetter() {
  if (G.state !== 'letter' || G.letterT < 0.4) return;
  G.state = 'play';
  G.kpCool = 0.35;
  UI.only('hud');
  lockPointer();
  UI.message('The lift behind the office is unlocked.', 4.5);
}
addEventListener('keydown', (e) => { if (G.state === 'letter' && !e.repeat && (e.code === 'KeyE' || e.code === 'Escape' || e.code === 'Space')) closeLetter(); });
addEventListener('mousedown', () => { if (G.state === 'letter') closeLetter(); });
addEventListener('touchend', () => { if (G.state === 'letter') closeLetter(); else if (G.state === 'inspect' && inspectFrom === 'play' && G.inspT > 0.4) closeInspect(); }); // a tap puts it away
// the shutter keypad's own buttons, for a phone
for (const b of document.querySelectorAll('[data-kp]')) b.addEventListener('click', () => UI.keypad.key({ code: b.dataset.kp }));

function inspectKeepsake(id, from) {
  const k = KEEPSAKES.find((x) => x.id === id);
  inspectFrom = from;
  UI.$('inspName').textContent = k.name.toUpperCase();
  UI.$('inspText').textContent = k.text;
  UI.$('inspCount').textContent = `KEEPSAKE ${save.collection.keep.length} OF ${KEEPSAKES.length}${from === 'play' ? '' : ''}`;
  UI.$('inspClose').textContent = TOUCH ? (from === 'menu' ? 'TAP OUTSIDE TO PUT IT BACK' : 'TAP TO POCKET IT') : from === 'menu' ? 'ESC OR CLICK OUTSIDE TO PUT IT BACK' : 'E OR ESC TO POCKET IT';
  if (from === 'play') {
    G.state = 'inspect';
    G.inspT = 0;
    UI.prompt(null);
    try { document.exitPointerLock(); } catch {}
    UI.only('inspect', 'hud');
    UI.$('brief').classList.remove('on');
  } else UI.only('inspect');
  viewer.show(id);
}
function closeInspect() {
  if (!inspectFrom) return;
  viewer.hide();
  if (inspectFrom === 'play' && G.state === 'inspect') { G.state = 'play'; G.kpCool = 0.35; UI.only('hud'); lockPointer(); }
  else UI.only('collection');
  inspectFrom = null;
}
addEventListener('keydown', (e) => {
  if (!inspectFrom || e.repeat) return;
  // E only once the pickup press has let go, so the same tap doesn't put it straight back down
  if (e.code === 'Escape' || (e.code === 'KeyE' && inspectFrom === 'play' && G.inspT > 0.25)) { e.preventDefault(); closeInspect(); }
});
UI.$('inspect').addEventListener('click', (e) => { if (inspectFrom === 'menu' && e.target.id !== 'inspCv' && !e.target.closest('.insp-text')) closeInspect(); });
function noteCutscene(id) {
  if (!save.collection.cuts.includes(id)) { save.collection.cuts.push(id); writeSave(); }
  if (CUTSCENES.every((c) => save.collection.cuts.includes(c))) ach('films');
}
// watching one again from the collection
function startReplay(id) {
  audio.init();
  audio.setMode('ending');
  G.replay = new Cutscene(id, { mats, audio, blood, aspect: camera.aspect, replay: true, env: scene.environment });
  G.replay.prepare(renderer);
  G.state = 'replay';
  blood.clear();
  UI.only();
}
function updateReplay(dt) {
  const cs = G.replay;
  const done = cs.update(dt);
  const u = post.u;
  u.fear.value = cs.fear; u.flash.value = cs.flash; u.blackout.value = cs.blackout; u.damage.value = 0; u.health.value = 1; u.hidden.value = 0;
  u.tear.value = Math.max(0, cs.fear - 0.55) * 2;
  u.tint.value.set(1, 1, 1);
  u.warm.value = cs.fire && !(cs.kind === 'smoke' && !(cs.fire.amount > 0)) ? 1 : 0;
  if (cs.ready) post.render(cs.scene, cs.cam); else blank();
  const skippable = cs.t > 0.15;
  UI.$('skip').classList.toggle('on', skippable && cs.blackout < 1);
  if (done || (skippable && (tapped('Space') || tapped('Escape') || tapped('Enter')))) {
    cs.dispose();
    audio.stopDawn(); // the ending's birds were scheduled to go on singing
    G.replay = null;
    UI.$('skip').classList.remove('on');
    blood.clear();
    G.state = 'menu';
    audio.setMode('menu');
    audio.setDepth(0);
    openCollection();
  }
}

// ---------- boot ----------
UI.buildDrips();
refreshMenu();
// phones and tablets: touch controls, and lighter graphics the first time
if (TOUCH) {
  document.body.classList.add('touch');
  audio.lite = true;
  UI.setTouch(true);
  post.u.soft.value = 1;
  initTouch({
    look: (dx, dy) => { const k = (save.settings.tsens ?? 1) / (player.sens || 1); player.look(dx * k, dy * k); }, active: () => G.state === 'play', // touch has its own sensitivity
    show: () => ({ fire: G.mode === 'hunt' || G.inv.built, breath: !!player.hidden }),
    tap: (id) => { if (id === 'syringe') tapKey('KeyR'); }, // a syringe tapped in the hotbar goes in
    fire: () => {
    if (G.mode === 'hunt') { huntSwing(); return; }
    if (gun.fire(player) === false && G.inv.built && G.inv.ammo <= 0) UI.message('Empty.', 1.2);
  } });
  if (!save.settings.touchDefaults) { const f = fitUI(); Object.assign(save.settings, { pix: 200, draw: 0.6, fps: 30, uiMenu: f, uiGame: f, touchBase: f, touchDefaults: true }); writeSave(); applySettings(); }
  scaleUI();
}
// achievements: a card in the corner when one comes (never in dev mode, where everything is open anyway)
initAchievements(save, writeSave, (a) => {
  const t = document.createElement('div'); t.className = 'ach-toast'; t.innerHTML = `<small>ACHIEVEMENT</small><b>${a.name}</b><span>${a.text}</span>`;
  document.body.appendChild(t); audio.tick(); setTimeout(() => t.classList.add('out'), 4200); setTimeout(() => t.remove(), 5200);
}, () => !!save.settings.dev);
// captions: what you hear, written at the bottom of the screen, and which way it is (Settings, Captions)
const CAPTION = { growl: 'a growl', roar: 'a roar', sniff: 'sniffing', lockerOpen: 'a locker wrenched open', gateRattle: 'a gate rattling', thud: 'something heavy hits the floor', shriek: 'a scream, somewhere', whoosh: 'something moving fast' };
function caption(text, pos) {
  if (!save.settings.captions || G.state !== 'play') return;
  let where = '';
  if (pos && pos.x !== undefined) {
    const dx = pos.x - player.pos.x, dz = pos.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
    if (d > 32) return;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), ahead = (dx * fx + dz * fz) / d, right = (dx * -fz + dz * fx) / d;
    where = (d < 6 ? ', close' : d > 18 ? ', far off' : '') + (ahead > 0.7 ? ', ahead' : ahead < -0.7 ? ', behind you' : right > 0 ? ', to the right' : ', to the left');
  }
  const box = UI.$('captionBox'), line = document.createElement('div');
  line.textContent = `[${text}${where}]`; box.appendChild(line);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => line.remove(), 3200);
}
for (const k in CAPTION) { const f = audio[k]; if (typeof f === 'function') audio[k] = function (...a) { caption(CAPTION[k], a[0]); return f.apply(this, a); }; }
G.caption = caption;
UI.$('version').textContent = 'v' + VERSION;
// controllers: the sticks walk and look, the buttons press the keys (see gamepad.js); prompts name the buttons
initGamepad({
  look: (dx, dy) => player.look(dx * (save.settings.padSens ?? 1), dy * (save.settings.padSens ?? 1)),
  fire: () => { if (gun.fire(player) === false && G.inv.built && G.inv.ammo <= 0) UI.message('Empty.', 1.2); },
  playing: () => G.state === 'play',
  onUse: (on) => { if (document.body.classList.contains('pad') === on) return; document.body.classList.toggle('pad', on); UI.setPad(on); UI.prompt(null); },
});
UI.typewrite(UI.$('warnText'), 'This game contains graphic gore, mutilated bodies, sudden loud noises and flashing images.\n\nPlay it in the dark. Wear headphones.\n\nIf you need to stop, press ESC. The plant will wait for you.', 45);
// the floor's card (B1 .. B10 and its quote) between floors: one click, or Space/Enter, skips it
function skipCard() {
  const tr = G.trans;
  if (G.state !== 'transition' || !tr) return;
  if (!tr.loaded) { tr.skip = true; return; } // still loading the floor: skip the moment it's ready
  UI.finishTyping(UI.$('cardQuote'));
  if (tr.t < 6) tr.t = 6;
}
document.addEventListener('pointerdown', skipCard);
window.addEventListener('keydown', (e) => { if ((e.code === 'Space' || e.code === 'Enter') && G.state === 'transition') skipCard(); });
// the ending: a click shows the lines typing out whole
UI.$('ending').addEventListener('pointerdown', () => { for (const p of UI.$('endLines').children) UI.finishTyping(p); });
UI.$('warn').addEventListener('click', () => {
  if (save.settings.fullscreen) setFullscreen(true);
  audio.init();
  applySettings();
  audio.setDepth(0);
  audio.chime();
  audio.setMode('menu');
  G.state = 'menu';
  if (CINEMA_APP) openCinema(); else UI.only('menu');
});
applySettings();

let last = performance.now(), T = 0, lastDraw = 0;
// F3: frames per second, and draw calls, top right
const fps = { on: false, n: 0, t: 0, el: null };
// the graphics driver reset under us (Chromium restores WebGL and every texture re-uploads); counted on the F3 line
let gpuResets = 0;
canvas.addEventListener('webglcontextlost', () => { gpuResets++; window.console.warn('OFFAL: WebGL context lost'); });
addEventListener('keydown', (e) => {
  if (e.code !== 'F3') return;
  e.preventDefault();
  fps.on = !fps.on;
  if (!fps.el) { fps.el = document.createElement('div'); fps.el.id = 'fps'; document.body.appendChild(fps.el); }
  fps.el.style.display = fps.on ? 'block' : 'none';
});
function countFrame(now) {
  if (!fps.on) return;
  fps.n++;
  if (now - fps.t > 500) {
    const rmi = REMASTER && post.rm && post.rm.hdr ? ` · ${post.rm.hdr.width}\u00D7${post.rm.hdr.height}${dynres.on ? ' DYN ' + Math.round(dynres.k * 100) + '%' : ''} · ${(G.state === 'play' ? dynres.ema : 0).toFixed(1)} MS · ${(GFX && save.settings.gfx) || ''}` : '';
    fps.el.textContent = `${Math.round((fps.n * 1000) / (now - fps.t))} FPS · ${renderer.info.render.calls} DRAWS${rmi}${gpuResets ? ` · GPU RESETS ${gpuResets}` : ''}`;
    fps.n = 0;
    fps.t = now;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const cap = save.settings.fps; // the frame rate setting: skip frames that come too soon
  if (cap && now - lastDraw < 1000 / cap - 2) return;
  lastDraw = now;
  countFrame(now);
  renderer.info.reset();
  const dt = Math.min(0.05, (now - last) / 1000);
  // dynamic resolution follows how long frames take while you play (the frame cap, or 60 fps)
  if (dynres.on && G.state === 'play' && dynres.update(now - last, 1000 / Math.min(save.settings.fps || 60, 60))) resize();
  last = now;
  T += dt;
  post.u.time.value = T;
  // a film whose shaders are still being built waits, in black, rather than stalling on its first frame
  const film = G.state === 'replay' ? G.replay : G.state === 'dying' || G.state === 'huntcine' || G.state === 'endcine' ? G.cutscene : null;
  const hold = !!(film && !film.ready);
  if (hold && (G.state === 'replay' || G.state === 'endcine')) blank();
  switch (G.state) {
    case 'warn':
    case 'menu':
      updateMenu(dt);
      post.render(menu.scene, menu.cam);
      break;
    case 'play':
      if (G.cine && !G.cine.on) { G.cine.on = true; cinema.begin(G.cine.shot); G.state = 'cinema'; UI.only(); UI.prompt(null); break; }
      updateGame(dt, T);
      break;
    case 'cinema':
      if (cinema.update(dt)) cinema.begin(G.cine.shot); // a moving shot plays again from the top
      break;
    case 'transition':
      updateTransition(dt);
      break;
    case 'huntcine':
      if (!hold) updateHuntCine(dt);
      break;
    case 'dying':
      if (!hold) updateDeath(dt);
      break;
    case 'replay':
      if (!hold) updateReplay(dt);
      break;
    case 'endcine':
      if (!hold) updateEndCine(dt);
      break;
  }
  if (G.state === 'inspect') G.inspT += dt;
  if (G.state === 'letter') G.letterT += dt;
  if (G.state === 'tape') { G.tapeT += dt; G.tape.update(dt); }
  if (G.state === 'play' || G.state === 'cinema' || G.state === 'paused' || G.state === 'inspect' || G.state === 'letter' || G.state === 'tape' || G.state === 'huntend' || G.state === 'huntcine' || G.state === 'devmenu' || G.state === 'transition' || G.state === 'dying') {
    G.damage = Math.max(0, G.damage - dt * 1.2);
    G.flash = Math.max(0, G.flash - dt * 3);
    const u = post.u;
    u.fear.value = G.fear;
    u.damage.value = G.damage;
    u.health.value = Math.max(0, player.hp) / 100;
    u.tear.value = Math.max(0, G.fear - 0.55) * 2 + G.scare * 0.6;
    u.flash.value = G.flash;
    u.hidden.value = player.hidden ? 1 : 0;
    u.blackout.value = G.state === 'dying' || G.state === 'huntcine' ? G.blackout : 0;
    u.warm.value = G.cutscene && G.cutscene.fire && !(G.cutscene.kind === 'smoke' && !(G.cutscene.fire.amount > 0)) ? 1 : 0; // (Smoke Break: only once he's set it alight)
    u.health.value = G.state === 'dying' || G.state === 'huntcine' ? 1 : u.health.value;
    if (G.cutscene) { if (G.cutscene.ready) post.render(G.cutscene.scene, G.cutscene.cam); else blank(); }
    else if (G.B) { if (G.state === 'transition' && G.warming) blank(); else post.render(scene, camera); }
  }
  blood.update(dt);
  endFrame();
}
requestAnimationFrame(frame);

// debug handle for automated checks
window.__offal = {
  poseForeman, matsMs, motes, P, mats, GPU, applySettings, G, player, save, audio, gun, renderer, scene, updateEndCine, openFilled, huntSwing, carried, openCollection, startReplay, startRun, KEEPSAKES, camera, startDeath, harvest, hide, director, post, keys, findPath, updateTransition, updateDeath, findInteract, handleInteract, nextFloor, startEnding, UI,
  step(dt, n) { for (let i = 0; i < n && G.state === 'play'; i++) { T += dt; updateGame(dt, T); endFrame(); } return G.state; },
};
