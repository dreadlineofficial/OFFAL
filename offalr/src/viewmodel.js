// OFFAL: REMASTERED: the torch in your hand. A battered aluminium torch (no hand: just the torch), bottom left of the
// view (the bolt gun, when you have it, is bottom right). The torch's light comes out of its lens. It sways with your
// steps, lags a little behind fast turns, breathes when you stand still, and its lens glows while it is on.
// Also the torch's beam pattern: a hot core, the reflector's rings and a dim spill, painted in code.
import * as THREE from 'three';

// the light's falloff across the beam: one broad pool, a little brighter in the middle, nothing else on it
// (no rings, no dirt: on a wall it reads as light, not as a picture of light)
export function torchCookie() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), m = S / 2;
  const id = g.createImageData(S, S), d = id.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.hypot(x + 0.5 - m, y + 0.5 - m) / m;
    // a smooth bell for the hot middle plus a wide, gentle spill, faded to nothing at the edge of the cone
    const v = (r < 1 ? Math.pow(1 - r * r, 1.3) * 0.85 + 0.15 * Math.max(0, 1 - r) : 0) * 255; // one broad, gently domed pool
    const i = (y * S + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function knurlTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#3a3a3a'; g.lineWidth = 2;
  for (let i = -64; i < 128; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 3);
  return t;
}

export class TorchHand {
  constructor(camera, player, mats) {
    this.cam = camera;
    this.player = player;
    const alu = new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.38, metalness: 0.85 });
    const worn = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.3, metalness: 1 });
    const knurl = knurlTexture();
    const grip = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.55, metalness: 0.8, bumpMap: knurl, bumpScale: 1.2 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x0e0d0c, roughness: 0.85 });
    this.lens = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe8c8).multiplyScalar(6) });
    this.lensOff = new THREE.MeshStandardMaterial({ color: 0x1a1a18, roughness: 0.05, metalness: 0.2 });
    const g = this.root = new THREE.Group(); // the torch runs along -z, lens at the far end
    const tube = (r0, r1, len, mat, z, seg = 28) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, seg), mat); m.rotation.x = Math.PI / 2; m.position.z = z; g.add(m); return m; };
    tube(0.017, 0.017, 0.16, grip, 0.02); // the knurled barrel
    tube(0.0175, 0.0175, 0.012, worn, -0.064); // a worn band where the thumb rubs
    tube(0.028, 0.019, 0.05, alu, -0.095); // the head, flaring out
    tube(0.029, 0.029, 0.012, worn, -0.124); // the bezel
    this.lensMesh = tube(0.025, 0.025, 0.002, this.lens, -0.131);
    tube(0.018, 0.016, 0.03, alu, 0.115); // the tail cap
    const sw = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), rubber); sw.scale.set(1, 0.55, 1.3); sw.position.set(0, 0.017, -0.04); g.add(sw); // the switch boot
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.renderOrder = 5; } });
    this.base = new THREE.Vector3(-0.215, -0.2, -0.37);
    g.scale.setScalar(0.7);
    g.position.copy(this.base);
    g.rotation.set(0.04, -0.06, 0);
    camera.add(g);
    // the light leaves from the lens, aimed to cross the middle of the view about 2.5 m out
    this.lensLocal = new THREE.Vector3(0, 0, -0.14);
    player.torch.target.position.set(0.02, -0.02, -2.5);
    this.lastYaw = player.yaw; this.lastPitch = player.pitch;
    this.sway = new THREE.Vector2(); this.swayV = new THREE.Vector2(); this.t = 0;
  }

  update(dt, visible = true) {
    const p = this.player, g = this.root;
    g.visible = visible && !p.hidden;
    if (!g.visible) return;
    this.t += dt;
    // lag behind turns: a spring pulled by how fast the view is turning
    const dy = Math.atan2(Math.sin(p.yaw - this.lastYaw), Math.cos(p.yaw - this.lastYaw)), dp = p.pitch - this.lastPitch;
    this.lastYaw = p.yaw; this.lastPitch = p.pitch;
    const k = 60, damp = 11, inv = dt > 0 ? 1 / dt : 0;
    this.swayV.x += (-this.sway.x * k - this.swayV.x * damp) * dt + dy * inv * 0.0009;
    this.swayV.y += (-this.sway.y * k - this.swayV.y * damp) * dt + dp * inv * 0.0009;
    this.sway.addScaledVector(this.swayV, dt);
    this.sway.clampScalar(-0.05, 0.05);
    const v = Math.min(1, Math.hypot(p.vel ? p.vel.x : 0, p.vel ? p.vel.z : 0) / 2.6), bob = p.bob || 0;
    const breathe = Math.sin(this.t * 1.7) * 0.0025 * (1 - v);
    g.position.set(this.base.x + this.sway.x + Math.cos(bob) * 0.008 * v, this.base.y - this.sway.y + Math.abs(Math.sin(bob)) * 0.01 * v + breathe + (p.crouch ? 0.01 : 0), this.base.z);
    g.rotation.set(0.04 + this.sway.y * 1.5 + breathe * 2, -0.06 + this.sway.x * 2, Math.sin(bob) * 0.03 * v);
    const on = p.torch.intensity > 0.5;
    this.lensMesh.material = on ? this.lens : this.lensOff;
    // the light comes from your hand, not the lens tip: with the lens 35 cm out, a wall at arm's length would get a
    // tiny searing disc. It follows the hand's sway, so the beam still moves with the torch you see
    p.torch.position.set(-0.13 + this.sway.x * 0.5, -0.13 - this.sway.y * 0.5, 0.02);
  }
}
