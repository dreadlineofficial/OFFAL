// The look: the scene renders at a low resolution into a float target, then one pass blows it up with
// nearest filtering. That pass adds a bleach grade that leaves only the reds saturated, crushed blacks,
// ordered dithering, grain, a vignette that closes in with fear, chromatic tearing and the red of being hurt.
//
// OFFAL: REMASTERED keeps that path exactly as it was ('classic') and adds the remastered pipeline (postrm.js), which
// shares these uniforms so the game code drives both alike.
import * as THREE from 'three';
import { RMPipeline } from './postrm.js';
import { upgradeTree } from './detail.js';
import { fuseBodies } from './sculpt.js';

const frag = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 res;
uniform float time, fear, damage, health, blackout, bright, tear, flash, hidden, warm, soft;
uniform vec3 tint;
varying vec2 vUv;
// a hash without sin(): phones run this at low precision, and the sin() kind turns to a blocky checker there
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float bayer(vec2 p){
  vec2 q = mod(p, 4.0);
  float i = q.x + q.y * 4.0;
  if (i < 1.0) return 0.0;   if (i < 2.0) return 8.0;  if (i < 3.0) return 2.0;  if (i < 4.0) return 10.0;
  if (i < 5.0) return 12.0;  if (i < 6.0) return 4.0;  if (i < 7.0) return 14.0; if (i < 8.0) return 6.0;
  if (i < 9.0) return 3.0;   if (i < 10.0) return 11.0; if (i < 11.0) return 1.0; if (i < 12.0) return 9.0;
  if (i < 13.0) return 15.0; if (i < 14.0) return 7.0; if (i < 15.0) return 13.0; return 5.0;
}
void main(){
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  uv = 0.5 + cc * (1.0 + 0.06 * r2 + fear * 0.08 * r2);
  vec2 px = floor(uv * res);
  // tracking tear: whole rows slip sideways when it is close
  float row = floor(uv.y * res.y * 0.25);
  float slip = step(1.0 - tear * 0.05, hash(vec2(row, floor(time * 24.0))));
  uv.x += slip * (hash(vec2(row, time)) - 0.5) * 0.08 * tear;
  uv.x += sin(uv.y * 40.0 + time * 5.0) * 0.0025 * fear;
  float ca = 0.0012 + fear * 0.006 + damage * 0.012;
  vec3 col;
  col.r = texture2D(tDiffuse, uv + cc * ca).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - cc * ca).b;
  col *= bright;
  col = col / (1.0 + col * 0.7);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  // bleach everything except blood
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  float red = clamp((col.r - max(col.g, col.b)) * 4.0, 0.0, 1.0);
  red = max(red, warm * clamp((col.r - col.b) * 2.2 - 0.1, 0.0, 1.0)); // fire: keep oranges and yellows too
  col = mix(vec3(l) * vec3(1.0, 0.96, 0.86), col, 0.3 + 0.7 * red);
  col *= mix(tint, vec3(1.0), red); // a floor's colour cast; blood stays red
  col = mix(col, vec3(dot(col, vec3(0.333))), (1.0 - health) * 0.6);
  col = smoothstep(0.02, 1.0, col);
  // vignette
  float v = smoothstep(0.95, 0.15, length(cc) * (1.1 + fear * 0.7 + (1.0 - health) * 0.5 + hidden * 0.6));
  col *= mix(0.12, 1.0, v);
  // hurt
  float pulse = (1.0 - health) * (0.5 + 0.5 * sin(time * 6.0));
  col = mix(col, vec3(0.45, 0.0, 0.0), clamp(damage * 0.7 + pulse * 0.35 * (1.0 - v), 0.0, 0.85));
  // grain + dither on the low-res grid
  col += (hash(px + fract(time * 13.0) * 100.0) - 0.5) * (0.07 + fear * 0.08);
  // soft (phones): no ordered dither and no scanlines; on a small screen at low resolution they read as a big checkerboard
  float d = (bayer(px) / 16.0 - 0.5) * (1.0 - soft);
  col = floor(col * 24.0 + d + 0.5) / 24.0;
  col *= mix(0.94 + 0.06 * sin(uv.y * res.y * 3.14159), 1.0, soft);
  col = mix(col, vec3(1.0, 0.92, 0.88), flash);
  col *= 1.0 - blackout;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.height = 300;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.u = {
      tDiffuse: { value: this.rt.texture }, res: { value: new THREE.Vector2(4, 4) }, time: { value: 0 }, soft: { value: 0 }, fear: { value: 0 }, damage: { value: 0 },
      health: { value: 1 }, blackout: { value: 0 }, bright: { value: 1 }, tear: { value: 0 }, flash: { value: 0 }, hidden: { value: 0 },
      tint: { value: new THREE.Vector3(1, 1, 1) }, warm: { value: 0 },
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: frag, depthTest: false, depthWrite: false });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // remastered path
    this.look = 'classic';
    this.w = 4; this.h = 4;
    this.lights = {}; // { torch, lamps }: what the volumetric pass lights the air with
    Object.assign(this.u, { expo: { value: 0.8 }, bloomAmt: { value: 0.3 }, bloomOn: { value: 1 }, grainAmt: { value: 1 }, caAmt: { value: 1 },
      // Customize: the colour grade, contrast, how red the blood stays, the vignette; a screen filter and its strength
      gradeMode: { value: 0 }, contrastAmt: { value: 1 }, bloodAmt: { value: 1 }, vigAmt: { value: 1 }, filterMode: { value: 0 }, filterAmt: { value: 1 } });
    this.rm = null;
    this.swept = null; this.sweepN = 0;
  }

  get scale() { return this._scale ?? 1; }
  set scale(v) { this._scale = v; if (this.rm) this.rm.q.scale = v; }
  // the remastered pipeline's quality switches (ssao, vol, bloom, fxaa, scale, ...); built the first time it is needed
  get q() { if (!this.rm) { this.rm = new RMPipeline(this.renderer, this.u); this.rm.q.scale = this.scale; } return this.rm.q; }

  setLook(look) {
    if (this.look === look) return;
    this.look = look;
    this.resize(this.w, this.h);
  }

  // let the eye adapt at once on the next frames (a new floor, a screenshot)
  snap() { if (this.rm) this.rm.snapFrames = 3; }

  resize(w, h) {
    this.w = w; this.h = h;
    if (this.look !== 'classic') { this.q; this.rm.size(w, h); return; }
    const lh = this.height, lw = Math.round((lh * w) / h);
    this.rt.setSize(lw, lh);
    this.u.res.value.set(lw, lh);
  }

  render(scene, camera) {
    if (this.look !== 'classic') {
      // anything new in the scene (a cutscene's set, the Foreman, a dropped item) gets the finer models within a few frames
      if (scene !== this.swept || ++this.sweepN % 20 === 0) { fuseBodies(scene); upgradeTree(scene); this.swept = scene; }
      this.rm.render(scene, camera, scene.userData.vol || this.lights); // a scene can name its own lights for the air (the menu's lamp)
      return;
    }
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
