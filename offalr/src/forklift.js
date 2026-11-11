// The plant's forklifts: a 1990s counterbalance truck, worn yellow paint over a cast-iron counterweight, a mast of
// channel steel with its chains and lift ram, the carriage and forks, an overhead guard, a vinyl seat, the steering
// wheel and the hydraulic levers, a gas bottle on the back. Origin on the floor under the middle of the truck, the
// forks pointing +Z. Parts the death film moves are on `userData`: carriage (raised on y), wheels (spun on x),
// steer (the steering wheel), seat (where the driver sits).
// Paint and stencils are drawn with their own seeded random, so building one never changes a floor's rolls.
import * as THREE from 'three';
import { mesh, box, cyl } from './props.js';
import { canvas } from './textures.js';

const phong = (o) => new THREE.MeshPhongMaterial(o);

function seeded(s) { return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function mats0(mats) {
  if (mats.fork) return mats.fork;
  const r = seeded(4242);
  const tex = (w, h, draw, rep) => { const { c, g } = canvas(w, h); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(...rep); t.anisotropy = 4; return t; };
  // yellow enamel gone chalky, scraped to grey primer and rust at every edge, grime climbing from the floor
  const paint = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#b08a1c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { const v = r(); g.fillStyle = `rgba(${v < 0.5 ? '70,52,10' : '210,180,90'},${0.03 + r() * 0.06})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    for (let i = 0; i < 70; i++) { // chips and scrapes, primer then rust inside
      const x = r() * w, y = r() * h, a = r() * 3, l = 4 + r() * 26;
      g.strokeStyle = 'rgba(96,92,84,.85)'; g.lineWidth = 1 + r() * 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      if (r() < 0.5) { g.strokeStyle = 'rgba(92,40,14,.8)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l * 0.6, y + Math.sin(a) * l * 0.6); g.stroke(); }
    }
    for (let i = 0; i < 18; i++) { const x = r() * w; const gr = g.createLinearGradient(0, h * 0.3, 0, h); gr.addColorStop(0, 'rgba(70,30,10,0)'); gr.addColorStop(1, `rgba(70,30,10,${0.2 + r() * 0.3})`); g.fillStyle = gr; g.fillRect(x, h * 0.3 + r() * h * 0.4, 1 + r() * 3, h); } // rust runs
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(20,16,10,0)'); gr.addColorStop(0.65, 'rgba(20,16,10,.1)'); gr.addColorStop(1, 'rgba(20,16,10,.6)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); // floor grime
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(80,8,6,${0.25 + r() * 0.35})`; g.beginPath(); g.ellipse(r() * w, h * 0.55 + r() * h * 0.45, 3 + r() * 10, 2 + r() * 5, r() * 3, 0, 7); g.fill(); } // what splashed up
  });
  // cast iron, black-grey, pitted
  const iron = tex(128, 128, (g, w, h) => {
    g.fillStyle = '#2c2b29'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '120,110,96'},${r() * 0.18})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(90,40,16,${r() * 0.4})`; g.fillRect(r() * w, r() * h, 2 + r() * 8, 1 + r() * 4); }
  });
  // the yellow-and-black band round the counterweight
  const stripe = tex(256, 32, (g, w, h) => {
    g.fillStyle = '#15130e'; g.fillRect(0, 0, w, h); g.fillStyle = '#a8841c';
    for (let x = -32; x < w + 32; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill(); }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(40,30,20,${r() * 0.7})`; g.fillRect(r() * w, r() * h, 1 + r() * 5, 1 + r() * 2); }
  });
  // tyre tread, wrapped round the cylinder's side
  const tread = tex(256, 32, (g, w, h) => {
    g.fillStyle = '#121211'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 10) { g.fillStyle = '#060606'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 4, 0); g.lineTo(x + 9, h / 2); g.lineTo(x + 4, h); g.lineTo(x, h); g.lineTo(x + 5, h / 2); g.fill(); }
    for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(90,86,80,${r() * 0.15})`; g.fillRect(r() * w, r() * h, 2, 1); }
  }, [1, 1]);
  // the plates: the truck's number on the counterweight, the capacity plate on the dash
  const plate = tex(256, 128, (g, w, h) => {
    g.fillStyle = '#a8841c'; g.fillRect(0, 0, w, 64);
    g.fillStyle = '#15130e'; g.font = 'bold 40px "Courier New", monospace'; g.fillText('HP-03', 52, 46);
    g.fillStyle = '#b8b4a6'; g.fillRect(0, 64, w, 64); g.strokeStyle = '#3a3a36'; g.lineWidth = 3; g.strokeRect(4, 68, w - 8, 56);
    g.fillStyle = '#26241e'; g.font = 'bold 15px "Courier New", monospace'; g.fillText('HOLLOW PINES MEATWORKS', 16, 88); g.font = '13px "Courier New", monospace'; g.fillText('CAP. 2500 KG @ 500 MM  1994', 16, 108);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(40,30,20,${r() * 0.4})`; g.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 2); }
  });
  const plateTop = plate.clone(); plateTop.repeat.set(1, 0.5); plateTop.offset.set(0, 0.5); plateTop.needsUpdate = true;
  const plateLow = plate.clone(); plateLow.repeat.set(1, 0.5); plateLow.offset.set(0, 0); plateLow.needsUpdate = true;
  const p = {
    paint: phong({ map: paint, shininess: 22, specular: 0x2a2a2a }),
    paintDS: phong({ map: paint, shininess: 22, specular: 0x2a2a2a, side: THREE.DoubleSide }),
    iron: phong({ map: iron, shininess: 14, specular: 0x1a1a1a }),
    stripe: phong({ map: stripe, shininess: 14 }),
    tyre: phong({ map: tread, shininess: 8, specular: 0x111111 }),
    rubber: phong({ color: 0x101010, shininess: 8 }),
    vinyl: phong({ color: 0x1a1816, shininess: 50, specular: 0x333333 }),
    tear: phong({ color: 0x6a5a3a, shininess: 2 }),
    chrome: phong({ color: 0xb8bcc0, shininess: 150, specular: 0xbbbbbb }),
    channel: phong({ color: 0x1c1c1b, shininess: 30, specular: 0x2a2a2a }),
    fork: phong({ color: 0x2a2826, shininess: 40, specular: 0x444444 }),
    lens: phong({ color: 0x5a0a06, emissive: 0x220202, shininess: 120, specular: 0x886666 }),
    glass: phong({ color: 0x9a988c, emissive: 0x1a1a14, shininess: 140, specular: 0xaaaaaa }),
    gas: phong({ color: 0xb0aca0, shininess: 40, specular: 0x333333 }),
    gauge: phong({ color: 0xd8d2c0, emissive: 0x0c0c0a, shininess: 60 }),
    knobR: phong({ color: 0x7a1008, shininess: 70, specular: 0x442222 }),
    plateTop: phong({ map: plateTop, shininess: 20 }),
    plateLow: phong({ map: plateLow, shininess: 30 }),
  };
  mats.fork = p;
  return p;
}

export function forkliftHD(mats) {
  const m = mats0(mats), g = new THREE.Group();
  const steel = mats.steel, dark = mats.darkMetal;
  const put = (o, x, y, z, rx = 0, ry = 0, rz = 0, to = g) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); to.add(o); return o; };
  const B = (w, h, d, mat, x, y, z, rx, ry, rz, to) => put(mesh(box(w, h, d), mat), x, y, z, rx, ry, rz, to);
  const C = (r0, r1, h, s, mat, x, y, z, rx, ry, rz, to) => put(mesh(cyl(r0, r1, h, s), mat), x, y, z, rx, ry, rz, to);

  // ---- chassis and body ----
  B(1.02, 0.26, 1.72, dark, 0, 0.3, -0.08); // frame
  B(1.1, 0.5, 1.02, m.paint, 0, 0.66, -0.12); // the sides
  B(1.12, 0.74, 0.44, m.iron, 0, 0.6, -0.84); // counterweight
  C(0.37, 0.37, 1.12, 20, m.iron, 0, 0.6, -0.9, 0, 0, Math.PI / 2).scale.set(1, 1, 0.55); // its rounded back
  B(1.14, 0.12, 0.46, m.stripe, 0, 0.36, -0.84); // the hazard band
  B(0.5, 0.18, 0.012, m.plateTop, 0, 0.78, -1.11, 0, Math.PI, 0); // HP-03
  for (const sx of [-1, 1]) { B(0.1, 0.08, 0.03, m.lens, sx * 0.42, 0.88, -1.1); B(0.13, 0.11, 0.02, dark, sx * 0.42, 0.88, -1.09); } // tail lights
  // engine hood with its grille, the seat on top
  B(0.98, 0.16, 0.8, m.paint, 0, 0.98, -0.42);
  for (let i = 0; i < 7; i++) B(0.7, 0.02, 0.025, dark, 0, 1.065, -0.72 + i * 0.05);
  B(0.84, 0.06, 0.06, dark, 0, 1.07, -0.08); // hinge
  // the operator's deck: diamond plate, the dash
  B(0.84, 0.04, 0.42, steel, 0, 0.92, 0.24);
  B(0.96, 0.42, 0.24, m.paint, 0, 1.12, 0.52); // cowl
  B(0.88, 0.08, 0.2, m.vinyl, 0, 1.36, 0.5, -0.25); // dash top
  for (const x of [-0.18, 0.18]) { C(0.045, 0.045, 0.03, 16, dark, x, 1.32, 0.405, Math.PI / 2 - 0.25); C(0.035, 0.035, 0.032, 16, m.gauge, x, 1.32, 0.403, Math.PI / 2 - 0.25); }
  B(0.3, 0.07, 0.006, m.plateLow, 0, 1.2, 0.398); // capacity plate
  // mudguards over the drive wheels, steps
  for (const sx of [-1, 1]) {
    const mg = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 18, 1, true, 0, Math.PI), m.paintDS); put(mg, sx * 0.5, 0.32, 0.55, 0, 0, Math.PI / 2);
    B(0.26, 0.03, 0.2, steel, sx * 0.62, 0.5, 0.15); // step
  }
  // the seat: a split vinyl cushion with a tear in it, a backrest, a seat belt hanging loose
  B(0.52, 0.1, 0.46, m.vinyl, 0, 1.13, -0.3);
  B(0.48, 0.03, 0.4, m.vinyl, 0, 1.19, -0.3);
  B(0.14, 0.005, 0.08, m.tear, 0.1, 1.208, -0.24, 0, 0.4, 0);
  B(0.5, 0.5, 0.1, m.vinyl, 0, 1.44, -0.56, -0.18);
  B(0.06, 0.32, 0.06, dark, 0, 1.22, -0.6); // seat post
  B(0.04, 0.4, 0.006, mats.coverall || dark, 0.27, 1.06, -0.3, 0, 0, 0.1); // the belt
  // steering: a column raked back, the wheel, the spinner knob everyone used
  const steer = new THREE.Group(); put(steer, 0, 1.45, 0.3, -0.55);
  C(0.028, 0.028, 0.42, 10, dark, 0, -0.2, 0, 0, 0, 0, steer);
  const rim = mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 28), m.vinyl); put(rim, 0, 0.02, 0, Math.PI / 2, 0, 0, steer);
  for (let i = 0; i < 3; i++) B(0.17, 0.016, 0.03, dark, Math.cos(i * 2.09) * 0.085, 0.02, Math.sin(i * 2.09) * 0.085, 0, -i * 2.09, 0, steer);
  C(0.016, 0.016, 0.06, 10, m.knobR, 0.15, 0.05, 0.06, 0, 0, 0, steer);
  // the hydraulic levers: lift, tilt, side-shift
  for (let i = 0; i < 3; i++) { C(0.009, 0.009, 0.24, 8, steel, 0.24 + i * 0.05, 1.46, 0.48, 0.25 - i * 0.15); put(mesh(new THREE.SphereGeometry(0.022, 10, 8), i ? dark : m.knobR), 0.24 + i * 0.05, 1.58, 0.51 - i * 0.02); }
  // the gas bottle on the back, strapped to its cradle
  C(0.15, 0.15, 0.72, 16, m.gas, 0, 1.28, -0.86, 0, 0, Math.PI / 2);
  for (const sx of [-1, 1]) put(mesh(new THREE.SphereGeometry(0.15, 14, 10), m.gas), sx * 0.36, 1.28, -0.86).scale.set(0.35, 1, 1);
  for (const sx of [-0.2, 0.2]) { const st = mesh(new THREE.TorusGeometry(0.155, 0.012, 6, 20), dark); put(st, sx, 1.28, -0.86, 0, Math.PI / 2, 0); }
  C(0.025, 0.025, 0.08, 8, steel, 0.4, 1.36, -0.86); C(0.04, 0.04, 0.012, 8, m.knobR, 0.4, 1.41, -0.86);
  B(0.8, 0.05, 0.3, dark, 0, 1.11, -0.86); // cradle
  // ---- overhead guard: four posts and a slatted roof ----
  const RY = 2.32;
  for (const sx of [-1, 1]) {
    B(0.06, RY - 1.0, 0.06, dark, sx * 0.47, (RY + 1.0) / 2, 0.58, 0.06); // front posts, leaning back
    B(0.06, RY - 1.05, 0.06, dark, sx * 0.47, (RY + 1.05) / 2, -0.66); // rear posts
    B(0.06, 0.06, 1.34, dark, sx * 0.47, RY, -0.04); // side rails
  }
  for (let i = 0; i < 8; i++) B(0.94, 0.025, 0.05, dark, 0, RY + 0.01, -0.62 + i * 0.165);
  // work light on the front post, the beacon on the roof, the exhaust up the back post, a mirror
  for (const sx of [-1, 1]) { C(0.05, 0.06, 0.08, 14, dark, sx * 0.47, 1.95, 0.66, Math.PI / 2); C(0.048, 0.048, 0.005, 14, m.glass, sx * 0.47, 1.95, 0.702, Math.PI / 2); }
  C(0.06, 0.07, 0.03, 14, dark, 0.3, RY + 0.04, -0.55); C(0.05, 0.05, 0.09, 14, m.lens, 0.3, RY + 0.1, -0.55);
  C(0.025, 0.025, 1.0, 10, mats.rust ? mats.rust[1] || dark : dark, -0.53, 1.6, -0.7);
  C(0.032, 0.025, 0.06, 10, dark, -0.53, 2.12, -0.7);
  B(0.012, 0.012, 0.2, dark, 0.55, 2.0, 0.52, 0, 0.4); B(0.11, 0.08, 0.012, m.chrome, 0.6, 2.0, 0.62, 0, 0.4);
  // ---- wheels: tyre, painted rim, hub, nuts ----
  const wheels = [];
  for (const [sx, z, R, W] of [[-1, 0.55, 0.3, 0.24], [1, 0.55, 0.3, 0.24], [-1, -0.62, 0.24, 0.2], [1, -0.62, 0.24, 0.2]]) {
    const wg = new THREE.Group(); put(wg, sx * 0.5, R, z);
    C(R, R, W, 24, m.tyre, 0, 0, 0, 0, 0, Math.PI / 2, wg);
    C(R * 0.62, R * 0.62, W + 0.01, 20, m.paint, 0, 0, 0, 0, 0, Math.PI / 2, wg);
    C(R * 0.3, R * 0.3, W + 0.03, 16, steel, 0, 0, 0, 0, 0, Math.PI / 2, wg);
    for (let i = 0; i < 6; i++) C(0.014, 0.014, W + 0.05, 6, dark, 0, Math.cos(i * 1.047) * R * 0.42, Math.sin(i * 1.047) * R * 0.42, 0, 0, Math.PI / 2, wg);
    g.add(wg); wheels.push(wg);
  }
  // ---- the mast ----
  for (const sx of [-1, 1]) {
    B(0.1, 2.32, 0.13, m.channel, sx * 0.38, 1.2, 0.9); // outer channels
    B(0.07, 2.2, 0.09, m.channel, sx * 0.3, 1.16, 0.97); // inner
    C(0.035, 0.035, 0.5, 10, dark, sx * 0.45, 0.82, 0.7, 1.35); // tilt rams
    C(0.022, 0.022, 0.3, 10, m.chrome, sx * 0.45, 0.86, 0.86, 1.35);
    B(0.035, 1.5, 0.02, mats.chain || dark, sx * 0.13, 1.35, 0.94); // lift chains
    C(0.05, 0.05, 0.03, 12, steel, sx * 0.13, 2.12, 0.94, 0, 0, Math.PI / 2); // their sheaves
    C(0.016, 0.016, 1.8, 6, m.rubber, sx * 0.06, 1.2, 0.9); // hoses
  }
  B(0.86, 0.08, 0.12, m.channel, 0, 2.33, 0.9); B(0.86, 0.1, 0.12, m.channel, 0, 0.14, 0.9); B(0.76, 0.06, 0.1, m.channel, 0, 1.25, 0.9);
  C(0.055, 0.055, 1.4, 14, dark, 0, 0.85, 0.92); C(0.035, 0.035, 0.7, 14, m.chrome, 0, 1.85, 0.92); // lift ram
  // the carriage (it rides up the mast) with the load backrest and the forks
  const car = new THREE.Group(); put(car, 0, 0, 0);
  B(0.92, 0.38, 0.06, m.paint, 0, 0.36, 1.06, 0, 0, 0, car);
  B(0.92, 0.04, 0.04, dark, 0, 0.53, 1.09, 0, 0, 0, car); B(0.92, 0.04, 0.04, dark, 0, 0.2, 1.09, 0, 0, 0, car);
  for (let i = 0; i < 7; i++) B(0.025, 0.72, 0.025, dark, -0.42 + i * 0.14, 0.9, 1.06, 0, 0, 0, car);
  B(0.92, 0.04, 0.04, dark, 0, 1.26, 1.06, 0, 0, 0, car);
  for (const sx of [-1, 1]) {
    B(0.11, 0.5, 0.045, m.fork, sx * 0.26, 0.29, 1.12, 0, 0, 0, car); // shank
    B(0.11, 0.045, 1.0, m.fork, sx * 0.26, 0.045, 1.62, 0, 0, 0, car); // blade
    B(0.11, 0.03, 0.14, m.fork, sx * 0.26, 0.035, 2.17, 0.12, 0, 0, car); // the tip, ground thin
    B(0.06, 0.004, 0.5, mats.blood, sx * 0.26 + 0.01, 0.069, 1.75, 0, 0.05, 0, car); // what's dried on them
  }
  g.add(car);
  g.userData = { carriage: car, wheels, steer, seat: new THREE.Vector3(0, 1.2, -0.3) };
  return g;
}
