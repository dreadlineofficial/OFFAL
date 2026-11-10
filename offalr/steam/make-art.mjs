// Steam store and library art for OFFAL: REMASTERED, rendered with the remaster's own renderer (post.js/postrm.js:
// HDR, shadows, volumetric light, the wet-floor mirror, bloom, the OFFAL grade) and its models. Same shots as the
// original's art (offal/steam/make-art.mjs). Needs the dev server: node tools/serve.mjs 8090, then
//   node offalr/steam/make-art.mjs <outDir> [name-prefix] [scale]
// scale renders smaller for quick looks (0.5 = half size).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const out = process.argv[2] || 'offalr/steam', only = process.argv[3], SCALE = +(process.argv[4] || 1);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message + e.stack)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:8090/offalr/?look=remastered&gfx=low&dyn=0'); await p.waitForTimeout(1200);
await p.evaluate(async () => {
  document.querySelectorAll('.screen,#view,#blood,#fade').forEach((e) => (e.style.display = 'none'));
  const THREE = await import('three');
  const { createForemanMesh } = await import('/offalr/src/foreman.js');
  const { poseForeman } = await import('/offalr/src/monster.js');
  const { makeMaterials, configureTextures } = await import('/offalr/src/textures.js');
  const { Post } = await import('/offalr/src/post.js');
  const { makeEnvironment } = await import('/offalr/src/env.js');
  const { upgradeTree, setDetail } = await import('/offalr/src/detail.js');
  const { fuseBodies, setSculptDetail } = await import('/offalr/src/sculpt.js');
  const P = await import('/offalr/src/props.js');
  configureTextures({ k: 3, pbr: true, aniso: 16 });
  setDetail(2); setSculptDetail(2);
  const mats = makeMaterials();
  const rngOf = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const tiled = (m, rx, ry) => { const c = m.clone(); for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap']) if (c[k]) { c[k] = c[k].clone(); c[k].repeat.set(rx, ry); c[k].needsUpdate = true; } if (m.onBeforeCompile) { c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; } return c; };
  window.__art = async ({ w, h, fx, fz, camX, camY, camZ, lookY, fov, turn, jaw, mode, gait, twitch, seed, face, lookX, expo = 1 }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const r = new THREE.WebGLRenderer({ canvas: c, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1); r.setSize(w, h, false); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const s = new THREE.Scene(); s.background = new THREE.Color(0x050000); s.fog = new THREE.FogExp2(0x070101, 0.06);
    s.environment = makeEnvironment(r, { lamp: 0xff6a50, strength: 1 });
    const rng = rngOf(seed || 7);
    // a corridor on the kill floor: tiled walls, a wet floor, carcasses on hooks both sides, pipes and beams overhead
    const L = 30, W = 5, H = 3.2;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), tiled(mats.floors[1], W / 2, L / 2)); floor.rotation.x = -Math.PI / 2; floor.position.z = -L / 2 + 4; floor.receiveShadow = true; s.add(floor);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), mats.pool[0]); pool.rotation.x = -Math.PI / 2; pool.position.set(fx - 0.3, 0.006, fz + 0.4); s.add(pool);
    for (const sd of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(L, H), tiled(mats.walls[sd > 0 ? 10 : 7], L / 2, 1)); wall.rotation.y = -sd * Math.PI / 2; wall.position.set(sd * W / 2, H / 2, -L / 2 + 4); wall.receiveShadow = true; s.add(wall);
      const kick = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.16, L), mats.steel); kick.position.set(sd * (W / 2 - 0.008), 0.08, -L / 2 + 4); s.add(kick);
      for (const [r0, off, hh] of [[0.05, 0.12, H - 0.2], [0.032, 0.24, H - 0.36]]) { const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, L, 20), mats.rust[1]); pipe.rotation.x = Math.PI / 2; pipe.position.set(sd * (W / 2 - off), hh, -L / 2 + 4); pipe.castShadow = true; s.add(pipe); }
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, L), tiled(mats.ceil, W / 2, L / 2)); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, -L / 2 + 4); s.add(ceil);
    for (let z = 3; z > -L + 4; z -= 2.6) { const beam = new THREE.Group(); beam.add(new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, 0.012), mats.rust[0])); for (const fy of [-0.1, 0.1]) { const fl = new THREE.Mesh(new THREE.BoxGeometry(W, 0.014, 0.1), mats.rust[0]); fl.position.y = fy; beam.add(fl); } beam.position.set(0, H - 0.11, z); s.add(beam); }
    for (let i = 0; i < 9; i++) for (const sd of [-1, 1]) {
      const z = 2 - i * 2.6 + rng() * 0.8; if (z > camZ - 1.6) continue; if (Math.abs(z - fz) < 1.2 && sd === Math.sign(fx || 1) && Math.abs(fx) > 0.4) continue;
      const cc = P.makeCarcass(mats, rng, rng() < 0.4); cc.position.set(sd * (1.55 + rng() * 0.3), H, z); cc.rotation.y = rng() * 6; cc.rotation.z = (rng() - 0.5) * 0.12;
      s.add(cc);
    }
    // light: red emergency lamps deep behind him, a cold work lamp over him, and your torch
    s.add(new THREE.AmbientLight(0x2a1414, 0.25));
    const back = new THREE.PointLight(0xff2a10, 30, 18, 1.6); back.position.set(0.3, 2.6, fz - 4); s.add(back);
    const back2 = new THREE.PointLight(0xff3a1a, 26, 12, 1.6); back2.position.set(-0.6, 2.8, fz - 10); s.add(back2);
    const lamp = new THREE.SpotLight(0xc8d8e0, 18, 9, 0.8, 0.6, 1.5); lamp.position.set(fx + 0.2, H - 0.1, fz - 1.3); lamp.target.position.set(fx, 1.4, fz); s.add(lamp, lamp.target); lamp.castShadow = true; lamp.shadow.mapSize.set(2048, 2048);
    const bulb = P.makeLamp(mats, 'bulb'); bulb.position.set(fx + 0.2, H, fz - 1.3); s.add(bulb);
    const torch = new THREE.SpotLight(0xfff0d8, 60, 16, 0.45, 0.7, 1.2); torch.position.set(camX - 0.7, camY - 0.45, camZ - 0.2); torch.target.position.set(fx, 1.6, fz); torch.castShadow = true; torch.shadow.mapSize.set(2048, 2048); torch.shadow.radius = 3; s.add(torch, torch.target);
    // him
    const f = createForemanMesh(mats); f.root.position.set(fx, 0, fz); f.root.rotation.y = turn; s.add(f.root);
    poseForeman(f, { gait: gait || 0, speed: mode === 'chase' ? 4 : 0.6, mode: mode || 'walk', t: 1.3, swing: 0, jawOpen: jaw, twitch: twitch || { x: 0.15, y: 0, z: 0.3, r: 0.15 } });
    f.root.traverse((o) => { if (o.isMesh && o.material && o.material.metalness > 0.5) o.material.envMapIntensity = 4; }); // his steel catches the light
    const eyeGlow = new THREE.PointLight(0xff2010, 1.5, 0.8, 2); f.head.add(eyeGlow); eyeGlow.position.set(0, 0.05, 0.25);
    const cam = new THREE.PerspectiveCamera(fov, w / h, 0.05, 60); cam.position.set(camX, camY, camZ); cam.lookAt(lookX ?? fx * 0.6, lookY, fz);
    if (face) {
      f.root.updateMatrixWorld(true); const hp = new THREE.Vector3(); f.head.getWorldPosition(hp);
      cam.position.set(hp.x + face.dx, hp.y + face.dy, hp.z + face.dz); cam.lookAt(hp.x + (face.aimX || 0), hp.y + (face.aimY || 0), hp.z);
      torch.position.copy(cam.position).add(new THREE.Vector3(-0.45, 0.25, 0.1)); torch.target.position.copy(hp);
      torch.intensity *= face.torch ?? 0.15; // a torch at arm's length: much less of it, from the side, so the face models
    }
    s.add(cam);
    // the remaster's finishing: bodies in one piece, finer models, then the full pipeline at its best settings
    fuseBodies(s); upgradeTree(s);
    s.traverse((o) => { if (o.isMesh && o.material && !o.material.transparent) { o.castShadow = o.castShadow !== false; o.receiveShadow = true; } });
    const post = new Post(r);
    post.setLook('remastered');
    Object.assign(post.q, { ssao: true, vol: true, refl: true, bloom: true, fxaa: true, scale: 1, volScale: 0.5, aoScale: 0.5, reflScale: 0.5, autoExpo: false, aoSamples: 16, volSteps: 32 });
    post.u.expo.value = 0.8 * expo; post.u.grainAmt.value = 0.8; post.u.fear.value = 0.15; post.u.time.value = 3.7;
    post.lights = { torch, lamps: [back, back2] };
    post.resize(w, h); post.rm.applyQuality();
    for (let i = 0; i < 3; i++) { post.u.time.value += 0.05; post.render(s, cam); }
    const url = c.toDataURL('image/png');
    r.dispose();
    return url;
  };
});
// a page that lays out one piece: the render as the background, the title over it as the game draws it
const html = (bg, w, h, title) => `<!doctype html><html><head><style>
html,body{margin:0;background:transparent}
.a{position:relative;width:${w}px;height:${h}px;overflow:hidden;${bg ? `background:url(${bg}) center/cover` : ''}}
.t{position:absolute;left:${title?.x ?? 0}px;top:${title?.y ?? 0}px;font-family:'Liberation Serif','Times New Roman',serif;font-weight:400;font-size:${title?.size ?? 100}px;letter-spacing:.06em;line-height:.85;color:#b3120c;filter:url(#rough);text-shadow:0 0 ${(title?.size ?? 100) * 0.04}px #000,0 0 ${(title?.size ?? 100) * 0.3}px rgba(200,0,0,.45),0 ${(title?.size ?? 100) * 0.03}px 0 #1a0000;white-space:nowrap}
.r{position:absolute;font-family:'Liberation Serif','Times New Roman',serif;letter-spacing:.85em;color:#d8cdb8;opacity:.9;white-space:nowrap}
.shade{position:absolute;inset:0;background:${title?.shade || 'none'}}
</style></head><body><svg width="0" height="0" style="position:absolute"><filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="${0.04 * 210 / (title?.size ?? 210)}" numOctaves="3" seed="7"/><feDisplacementMap in="SourceGraphic" scale="${10 * (title?.size ?? 210) / 210}"/></filter></svg>
<div class="a" id="a">${title ? `<div class="shade"></div><div class="t" id="t">OFFAL</div>${title.noSub ? '' : `<div class="r" style="left:${title.x + title.size * 0.08}px;top:${title.y + title.size * 0.9}px;font-size:${title.size * 0.13}px">${title.sub || 'REMASTERED'}</div>`}` : ''}</div>
<script>document.fonts.ready.then(() => { window.done = true; });</script></body></html>`;
const LEFT = (a) => `linear-gradient(90deg, rgba(0,0,0,${a}) 0, rgba(0,0,0,${a * 0.6}) 42%, transparent 66%)`;
const BOTTOM = (a) => `linear-gradient(0deg, rgba(0,0,0,${a}) 0, rgba(0,0,0,${a * 0.6}) 22%, transparent 45%)`;
const LOW = (a) => `linear-gradient(15deg, rgba(0,0,0,${a}) 0, rgba(0,0,0,${a * 0.55}) 38%, transparent 62%)`;
const HERO = { fx: 0.9, fz: 0, camX: -0.35, camY: 1.4, camZ: 2.9, lookY: 1.7, lookX: -0.72, fov: 52, turn: -0.4, jaw: 0.75, mode: 'grab', twitch: { x: 0.25, y: 0, z: 0.35, r: 0.2 } };
const SPECS = {
  'library_hero_3840x1240': { w: 3840, h: 1240, scene: { ...HERO, fx: 0.75, camZ: 2.7, fov: 46, lookX: -0.1 }, title: null },
  'header_capsule_920x430': { w: 920, h: 430, scene: HERO, title: { x: 40, y: 230, size: 150, shade: LOW(0.85) } },
  // the Windows exe's unpacking splash (offalr-desktop/splash.bmp): the header, just the title (no subtitle, no text)
  'splash_640x299': { w: 640, h: 299, scene: HERO, title: { x: 28, y: 160, size: 104, shade: LOW(0.85), noSub: true } },
  'main_capsule_1232x706': { w: 1232, h: 706, scene: { ...HERO, camZ: 3.2, lookX: -0.5, fov: 52 }, title: { x: 56, y: 400, size: 215, shade: LOW(0.85) } },
  'library_capsule_600x900': { w: 600, h: 900, scene: { fx: 0, fz: 0, camX: 0.15, camY: 1.3, camZ: 3.1, lookY: 1.55, lookX: 0, fov: 62, turn: -0.08, jaw: 0.75, mode: 'grab', twitch: { x: 0.25, y: 0, z: 0.3, r: 0.15 } }, title: { x: 82, y: 680, size: 135, shade: BOTTOM(0.9) } },
  // GameJolt (the demo's page): the header is about 4:1 and phones crop its sides, so the title and him sit near the
  // middle; the thumbnail is 16:9
  'gamejolt_header_3000x750': { w: 3000, h: 750, scene: { ...HERO, fx: 0.75, camZ: 2.7, fov: 40, lookX: -0.3, lookY: 1.9 }, title: { x: 600, y: 330, size: 330, shade: `radial-gradient(ellipse 40% 70% at 32% 55%, rgba(0,0,0,.8), transparent)`, noSub: true } },
  'gamejolt_thumb_1280x720': { w: 1280, h: 720, scene: { ...HERO, camZ: 3.2, lookX: -0.5, fov: 52 }, title: { x: 58, y: 400, size: 222, shade: LOW(0.85), sub: 'DEMO' } },
  'icon_1024': { w: 1024, h: 1024, scene: { ...HERO, fx: 0, turn: 0.35, jaw: 0.55, face: { dx: 0.28, dy: 0.02, dz: 0.78, aimX: 0.02, aimY: -0.03, torch: 0.12 }, twitch: { x: 0.12, y: 0, z: 0.22, r: 0.08 }, expo: 0.9, fov: 40 }, title: null },
};
for (const [name, spec] of Object.entries(SPECS)) {
  if (only && !name.startsWith(only)) continue;
  const w = Math.round(spec.w * SCALE), h = Math.round(spec.h * SCALE);
  const bg = spec.scene ? await p.evaluate((a) => window.__art(a), { w, h, ...spec.scene }) : null;
  const t = spec.title && { ...spec.title, x: spec.title.x * SCALE, y: spec.title.y * SCALE, size: spec.title.size * SCALE };
  const q = await b.newPage({ viewport: { width: w, height: h } });
  await q.setContent(html(bg, w, h, t));
  await q.waitForFunction(() => window.done, null, { timeout: 30000 });
  await q.screenshot({ path: `${out}/${name}.png`, omitBackground: !spec.scene, clip: { x: 0, y: 0, width: w, height: h }, timeout: 300000 });
  await q.close();
  console.log('made', name, w + 'x' + h);
}
console.log(errs.slice(0, 4).join('\n') || 'no errors');
await b.close();
