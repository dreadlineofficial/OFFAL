// The captive-bolt gun: the thing they stunned cattle with, found in one piece on one of the lower floors.
import { unlock } from './achievements.js';
// Bolts are scarce. A hit drops the Foreman where he stands for a while (how long depends on the
// difficulty). Firing it is the loudest thing you can do.
import * as THREE from 'three';
import { lineOfSight } from './level.js';

export const AMMO_MAX = 6;
// built: you have the gun (the name is older than the gun being found whole)
export const freshInv = () => ({ built: false, ammo: 0 });
export function cloneInv(inv) {
  const c = JSON.parse(JSON.stringify(inv || freshInv()));
  // a save from when the gun came in three parts: any part found counts as the gun found
  if (c.parts) { if (Object.values(c.parts).some(Boolean)) c.built = true; delete c.parts; }
  return c;
}

// the gun in your hand, bottom right of the view
export function makeViewmodel(mats) {
  const g = new THREE.Group();
  const steel = new THREE.MeshPhongMaterial({ color: 0x8a8e90, shininess: 90, specular: 0x777777 }), dark = new THREE.MeshPhongMaterial({ color: 0x2a2826, shininess: 40, specular: 0x333333 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.34, 10), steel);
  body.rotation.x = Math.PI / 2;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 10), dark);
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.17;
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.04, 10), dark);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.z = -0.18;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.06), new THREE.MeshPhongMaterial({ color: 0x1a1612, shininess: 20 }));
  grip.position.set(0, -0.08, 0.1);
  grip.rotation.x = 0.25;
  const trig = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.04, 0.012), dark);
  trig.position.set(0, -0.045, 0.04);
  const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.05, 10), new THREE.MeshPhongMaterial({ color: 0x2a2018 }));
  tape.rotation.x = Math.PI / 2;
  tape.position.z = 0.05;
  g.add(body, cap, muzzle, grip, trig, tape);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 5; } });
  g.scale.setScalar(0.55);
  g.position.set(0.17, -0.15, -0.34);
  g.rotation.y = 0.08;
  const flash = new THREE.PointLight(0xffd8a0, 0, 6, 2);
  flash.position.set(0, 0.02, -0.3);
  g.add(flash);
  g.userData = { flash, base: g.position.clone(), kick: 0 };
  g.visible = false;
  return g;
}

export class Gun {
  constructor(G, camera, mats, audio) {
    this.G = G;
    this.cam = camera;
    this.audio = audio;
    this.vm = makeViewmodel(mats);
    camera.add(this.vm);
    this.cool = 0;
  }
  get inv() { return this.G.inv; }
  update(dt, player) {
    const inv = this.inv, vm = this.vm, u = vm.userData;
    vm.visible = !!(inv && inv.built && !player.hidden && this.G.state === 'play');
    this.cool = Math.max(0, this.cool - dt);
    u.kick = Math.max(0, u.kick - dt * 5);
    const sway = Math.sin(player.bob) * 0.008;
    vm.position.set(u.base.x + sway, u.base.y + Math.abs(Math.cos(player.bob)) * 0.006 - (player.crouch ? 0.01 : 0), u.base.z + u.kick * 0.08);
    vm.rotation.x = u.kick * 0.5;
    u.flash.intensity = Math.max(0, u.flash.intensity - dt * 120);
  }
  // returns true if it went off
  fire(player) {
    const G = this.G, inv = this.inv;
    if (!inv || !inv.built || this.cool > 0 || player.hidden) return false;
    if (inv.ammo <= 0) { this.audio.click(player.pos); this.cool = 0.4; return false; }
    inv.ammo--;
    this.cool = 1.1;
    this.vm.userData.kick = 1;
    this.vm.userData.flash.intensity = 10;
    player.shake = Math.max(player.shake, 0.35);
    this.audio.boltShot();
    G.noise(player.pos, 20, true, 'other');
    // what's in front of the bolt: anything within ~0.5 m of the line of fire, the nearest first
    const from = this.cam.getWorldPosition(new THREE.Vector3()), dir = this.cam.getWorldDirection(new THREE.Vector3());
    let best = null, bd = 1e9;
    for (const h of G.hunters) {
      if (h.state === 'grab' || h.state === 'stunned') continue;
      for (const y of [1.0, 1.5, 2.0]) {
        const to = new THREE.Vector3(h.pos.x, y, h.pos.z).sub(from), d = to.length();
        if (d > 15) continue;
        const along = to.dot(dir);
        if (along <= 0) continue;
        const off = Math.sqrt(Math.max(0, d * d - along * along));
        if (off < 0.5 + d * 0.01 && d < bd && lineOfSight(G.L, from.x, from.z, h.pos.x, h.pos.z)) { bd = d; best = h; }
      }
    }
    if (best) {
      best.stun(G.D.stun || 15); unlock('bolt');
      this.audio.boltHit(best.pos);
      G.onStunned && G.onStunned(best);
    }
    return true;
  }
}
