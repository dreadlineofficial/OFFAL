// OFFAL: REMASTERED: dust in the air. A cloud of motes in a box that travels with you (they wrap around its edges),
// drifting and settling, invisible in the dark and lit only where the torch beam crosses them, so the beam has
// something in it. One draw call.
import * as THREE from 'three';

const vert = /* glsl */ `
uniform float time, size;
uniform vec3 camPos, boxSize, tPos, tDir;
uniform float tCos, tOn, tGain;
attribute vec3 seed;
varying float vB;
void main(){
  vec3 p = position + vec3(sin(time * 0.13 + seed.x * 6.28) * 0.25, -time * 0.025 * (0.4 + seed.y), cos(time * 0.11 + seed.z * 6.28) * 0.25);
  p = camPos + mod(p - camPos + boxSize * 0.5, boxSize) - boxSize * 0.5;
  vec3 toP = p - tPos; float d = max(length(toP), 0.05);
  float inBeam = smoothstep(tCos, tCos + 0.05, dot(toP / d, tDir));
  vB = inBeam * tOn * tGain / (0.6 + d * d) * (0.35 + seed.y);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vB = min(vB * 0.7, 0.18) * smoothstep(0.45, 1.1, -mv.z); // none blazing right in front of the lens
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * (0.5 + seed.x) / max(-mv.z, 0.1);
}`;
const frag = /* glsl */ `
varying float vB;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c));
  if (vB * a < 0.002) discard;
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * vB * a, 1.0);
}`;

export class Motes {
  constructor(scene, n = 800, box = new THREE.Vector3(9, 4, 9)) {
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 3);
    let s = 12345;
    const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rnd() - 0.5) * box.x; pos[i * 3 + 1] = (rnd() - 0.5) * box.y; pos[i * 3 + 2] = (rnd() - 0.5) * box.z;
      seed[i * 3] = rnd(); seed[i * 3 + 1] = rnd(); seed[i * 3 + 2] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    this.u = {
      time: { value: 0 }, size: { value: 22 }, camPos: { value: new THREE.Vector3() }, boxSize: { value: box.clone() },
      tPos: { value: new THREE.Vector3() }, tDir: { value: new THREE.Vector3(0, 0, -1) }, tCos: { value: 0.85 }, tOn: { value: 0 }, tGain: { value: 2.2 },
    };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
  }

  // how much dust there is (the Customize setting): 0 none .. 1 all of it
  setAmount(a) {
    const n = this.points.geometry.attributes.position.count;
    this.points.visible = a > 0.01;
    this.points.geometry.setDrawRange(0, Math.round(n * Math.max(0, Math.min(1, a))));
    this.u.tGain.value = 2.2 * (0.6 + 0.4 * a);
  }

  // scale: how many pixels a mote is at 1 m, for this resolution
  update(dt, camera, torch, pixH) {
    const u = this.u;
    u.time.value += dt;
    u.size.value = 0.016 * pixH;
    camera.getWorldPosition(u.camPos.value);
    torch.getWorldPosition(u.tPos.value);
    u.tDir.value.setFromMatrixPosition(torch.target.matrixWorld).sub(u.tPos.value).normalize();
    u.tCos.value = Math.cos(torch.angle);
    u.tOn.value = torch.intensity > 0.5 ? 1 : 0;
  }
}
