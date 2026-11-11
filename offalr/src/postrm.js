// OFFAL: REMASTERED: the render pipeline. One frame is:
//   scene -> HDR target (half float, with a depth texture)
//   SSAO (half res, from depth)  ->  blur
//   volumetric light (half res): a ray march through dusty air lit by the torch (with its shadow map) and the nearest lamps
//   bloom chain, and the eye's adaptation (average brightness of the HDR image, smoothed over time)
//   composite: tonemap + the OFFAL bleach-except-red grade + vignette/fear/hurt effects -> LDR
//   FXAA + film grain + dither -> screen
// The game drives it through the same uniforms the classic path has (fear, damage, health, ...), see post.js.
import * as THREE from 'three';
import { REFL } from './wet.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const SAFE = /* glsl */ `
// a bad value (a NaN or an infinity from one pixel of some shader on some GPU) would be spread over the whole frame by
// the bloom and the exposure meter and turn the screen white: every pass reads its inputs through this
vec3 safe3(vec3 c){ return (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : clamp(c, 0.0, 2000.0); }
float safe1(float c){ return (isnan(c) || isinf(c)) ? 0.0 : c; }
`;
const common = /* glsl */ `
// a bad value (a NaN or an infinity from one pixel of some shader on some GPU) would be spread over the whole frame by
// the bloom and the exposure meter and turn the screen white: every pass reads its inputs through this
vec3 safe3(vec3 c){ return (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : clamp(c, 0.0, 2000.0); }
float safe1(float c){ return (isnan(c) || isinf(c)) ? 0.0 : c; }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// interleaved gradient noise: a stable, evenly spread dither for ray marching
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

// ---------- SSAO ----------
const fragAO = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 proj, invProj;
uniform vec2 texel;
uniform float radius, bias, strength, frame;
varying vec2 vUv;
${common}
vec3 viewPos(vec2 uv){
  float d = texture2D(tDepth, uv).x;
  vec4 p = invProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
void main(){
  float d0 = texture2D(tDepth, vUv).x;
  if (d0 >= 1.0) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  vec3 Pr = viewPos(vUv + vec2(texel.x, 0.0)), Pl = viewPos(vUv - vec2(texel.x, 0.0));
  vec3 Pu = viewPos(vUv + vec2(0.0, texel.y)), Pd = viewPos(vUv - vec2(0.0, texel.y));
  // the shorter difference on each axis: no smeared normals across a depth edge
  vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
  vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
  vec3 N = normalize(cross(dx, dy));
  if (dot(N, P) > 0.0) N = -N;
  float ang = ign(gl_FragCoord.xy + frame * 5.588238) * 6.2831853;
  vec3 T = normalize(abs(N.y) < 0.95 ? cross(N, vec3(0.0, 1.0, 0.0)) : cross(N, vec3(1.0, 0.0, 0.0)));
  vec3 B = cross(N, T);
  float occ = 0.0;
  const int S = AO_S;
  for (int i = 0; i < S; i++) {
    float fi = (float(i) + 0.5) / float(S);
    float r = sqrt(fi), phi = float(i) * 2.399963 + ang;
    vec3 h = vec3(r * cos(phi), r * sin(phi), sqrt(max(0.0, 1.0 - fi)));
    float sc = mix(0.12, 1.0, fi * fi) * radius;
    vec3 sp = P + (T * h.x + B * h.y + N * h.z) * sc;
    vec4 pp = proj * vec4(sp, 1.0);
    vec2 suv = pp.xy / pp.w * 0.5 + 0.5;
    float sz = viewPos(suv).z;
    float range = smoothstep(0.0, 1.0, radius / max(abs(P.z - sz), 1e-3));
    occ += (sz >= sp.z + bias ? 1.0 : 0.0) * range;
  }
  float ao = 1.0 - occ / float(S) * strength;
  gl_FragColor = vec4(vec3(clamp(ao, 0.0, 1.0)), 1.0);
}`;

// a depth-aware blur that also lifts the half-res AO and volumetric buffers back towards full res
const fragBlur = /* glsl */ `
uniform sampler2D tSrc, tDepth;
uniform vec2 texel;
varying vec2 vUv;
void main(){
  float dc = texture2D(tDepth, vUv).x;
  vec4 sum = texture2D(tSrc, vUv); float wsum = 1.0;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    if (x == 0 && y == 0) continue;
    vec2 o = vec2(float(x), float(y)) * texel;
    float d = texture2D(tDepth, vUv + o).x;
    float w = exp(-abs(d - dc) * 4000.0) * (1.0 - length(vec2(float(x), float(y))) * 0.18);
    sum += texture2D(tSrc, vUv + o) * w; wsum += w;
  }
  gl_FragColor = sum / wsum;
}`;

// ---------- volumetric light ----------
const fragVol = /* glsl */ `
uniform sampler2D tDepth, tShadow;
uniform mat4 invProj, camWorld, shadowMat;
uniform vec3 camPos, tPos, tDir, tCol;
uniform float tCosOuter, tCosInner, tOn, shadowBias;
uniform vec3 lPos[6], lCol[6];
uniform float time, density, gain, maxDist, frame;
varying vec2 vUv;
${common}
float unpackDepth(vec4 v){ return dot(v, vec4(255.0 / 256.0) / vec4(256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0)); }
float hg(float c, float g){ float g2 = g * g; return (1.0 - g2) / (12.566371 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i.xy + i.z * 37.0), b = hash12(i.xy + vec2(1.0, 0.0) + i.z * 37.0), c = hash12(i.xy + vec2(0.0, 1.0) + i.z * 37.0), d = hash12(i.xy + vec2(1.0, 1.0) + i.z * 37.0);
  float a2 = hash12(i.xy + (i.z + 1.0) * 37.0), b2 = hash12(i.xy + vec2(1.0, 0.0) + (i.z + 1.0) * 37.0), c2 = hash12(i.xy + vec2(0.0, 1.0) + (i.z + 1.0) * 37.0), d2 = hash12(i.xy + vec2(1.0, 1.0) + (i.z + 1.0) * 37.0);
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(a2, b2, f.x), mix(c2, d2, f.x), f.y), f.z);
}
void main(){
  float d = texture2D(tDepth, vUv).x;
  vec4 vp = invProj * vec4(vUv * 2.0 - 1.0, (d >= 1.0 ? 1.0 : d) * 2.0 - 1.0, 1.0);
  vp.xyz /= vp.w;
  float dist = d >= 1.0 ? maxDist : min(length(vp.xyz), maxDist);
  vec3 wd = normalize((camWorld * vec4(normalize(vp.xyz), 0.0)).xyz);
  const int STEPS = VOL_STEPS;
  float jit = ign(gl_FragCoord.xy + frame * 5.588238);
  float stepL = dist / float(STEPS);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    float t = (float(i) + jit) * stepL;
    vec3 wp = camPos + wd * t;
    float dust = 0.55 + 0.45 * vnoise(wp * 1.9 + vec3(0.0, time * 0.04, time * 0.025));
    dust *= 0.7 + 0.3 * vnoise(wp * 5.3 - vec3(time * 0.03, 0.0, 0.0));
    vec3 inL = vec3(0.0);
    if (tOn > 0.0) {
      vec3 toL = tPos - wp; float dl = length(toL); vec3 L = toL / dl;
      float cone = smoothstep(tCosOuter, tCosInner, dot(-L, tDir));
      if (cone > 0.0) {
        vec4 sc = shadowMat * vec4(wp, 1.0); sc.xyz /= sc.w;
        float vis = 1.0;
        if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) vis = sc.z - shadowBias <= unpackDepth(texture2D(tShadow, sc.xy)) ? 1.0 : 0.0;
        inL += tCol * cone * vis * hg(dot(L, wd), 0.45) / (dl * dl + 0.6);
      }
    }
    for (int k = 0; k < 6; k++) {
      vec3 toL = lPos[k] - wp; float dl = length(toL);
      float fall = clamp(1.0 - dl / 9.0, 0.0, 1.0);
      inL += lCol[k] * fall * fall * fall * 0.03 / (dl * dl + 0.5);
    }
    acc += inL * dust * stepL;
  }
  gl_FragColor = vec4(acc * density * gain, 1.0);
}`;

// ---------- bloom ----------
const fragPick = /* glsl */ `
uniform sampler2D tSrc, tExpo; uniform vec2 texel; uniform float threshold, knee, expo, autoExpo;
varying vec2 vUv;
${SAFE}
// thresholded against the picture as the eye sees it (after exposure), so a lamp blooms but a lit wall up close does not
vec3 pick(vec3 c){
  c = safe3(c) * expo * mix(1.0, clamp(safe1(texture2D(tExpo, vec2(0.5)).r), 0.05, 2.0), autoExpo);
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  return c * (max(soft, br - threshold) / max(br, 1e-4));
}
void main(){
  vec3 c = pick(texture2D(tSrc, vUv + texel * vec2(-1.0, -1.0)).rgb) + pick(texture2D(tSrc, vUv + texel * vec2(1.0, -1.0)).rgb)
         + pick(texture2D(tSrc, vUv + texel * vec2(-1.0, 1.0)).rgb) + pick(texture2D(tSrc, vUv + texel * vec2(1.0, 1.0)).rgb);
  gl_FragColor = vec4(min(c * 0.25, vec3(8.0)), 1.0);
}`;
const fragDown = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 texel;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + texel * vec2(1.0, -1.0)).rgb
     + texture2D(tSrc, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + texel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}`;
const fragUp = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 texel; uniform float gain;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv + texel * vec2(-1.0, 0.0)).rgb + texture2D(tSrc, vUv + texel * vec2(1.0, 0.0)).rgb
         + texture2D(tSrc, vUv + texel * vec2(0.0, -1.0)).rgb + texture2D(tSrc, vUv + texel * vec2(0.0, 1.0)).rgb;
  c *= 2.0;
  c += texture2D(tSrc, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + texel * vec2(1.0, -1.0)).rgb
     + texture2D(tSrc, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + texel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c / 12.0 * gain, 1.0);
}`;

// ---------- eye adaptation ----------
// the HDR target has mips: its smallest level is the average brightness. The exposure chases what it wants, quicker
// when the world gets brighter (a flash, the torch on a near wall) than when it gets darker (the eyes open slowly).
// metering image: 32 x 18 texels, each the average luminance of its patch of the frame (r) and of its square (g)
const fragLum = /* glsl */ `
uniform sampler2D tHdr;
uniform vec2 cell;
varying vec2 vUv;
${SAFE}
void main(){
  vec2 o0 = vUv - cell * 0.5;
  float s = 0.0, s4 = 0.0;
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    float l = min(dot(safe3(texture2D(tHdr, o0 + (vec2(float(x), float(y)) + 0.5) / 4.0 * cell).rgb), vec3(0.2126, 0.7152, 0.0722)), 30.0);
    s += l; s4 += l * l;
  }
  gl_FragColor = vec4(s / 16.0, s4 / 16.0, 0.0, 1.0);
}`;

const fragAdapt = /* glsl */ `
uniform sampler2D tLum, tPrev;
uniform float dt, snap, key, lo, hi, brightKey;
varying vec2 vUv;
${SAFE}
void main(){
  // two readings: the centre-weighted mean (how dark the place is) and the root mean square, which follows the bright part of
  // the frame (a torch-lit face, a near wall). The eye takes whichever exposure is lower, so the dark opens up while
  // nothing the torch is on burns out to white
  float sum = 0.0, s4 = 0.0, wsum = 0.0;
  for (int y = 0; y < 18; y++) for (int x = 0; x < 32; x++) {
    vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(32.0, 18.0);
    float w = 1.0 - 0.7 * length(uv - 0.5);
    vec2 m = max(vec2(0.0), vec2(safe1(texture2D(tLum, uv).r), safe1(texture2D(tLum, uv).g)));
    sum += m.r * w; s4 += m.g * w; wsum += w;
  }
  float mean = sum / wsum, bright = sqrt(s4 / wsum); // root mean square: follows the bright part without one hot spot ruling
  float want = clamp(min(key / (mean + 1e-3), brightKey / (bright + 1e-3)), lo, hi);
  float prev = safe1(texture2D(tPrev, vec2(0.5)).r);
  if (prev <= 0.0 || prev > hi * 1.01) prev = want;
  float speed = want < prev ? 2.2 : 0.7; // brighter world: shut quickly; darker: open slowly
  float k = max(snap, 1.0 - exp(-dt * speed));
  gl_FragColor = vec4(clamp(mix(prev, want, k), lo, hi), 0.0, 0.0, 1.0);
}`;

// ---------- composite ----------
const fragComp = /* glsl */ `
uniform sampler2D tDiffuse, tBloom, tAO, tVol, tExpo;
uniform vec2 res;
uniform float time, fear, damage, health, blackout, bright, tear, flash, hidden, warm;
uniform float expo, bloomAmt, bloomOn, caAmt, aoOn, volOn, autoExpo;
uniform float gradeMode, contrastAmt, bloodAmt, vigAmt;
uniform vec3 tint;
varying vec2 vUv;
${common}
// ACES (Narkowicz fit): a filmic toe and shoulder
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  uv = 0.5 + cc * (1.0 + 0.06 * r2 + fear * 0.08 * r2);
  // tracking tear: whole rows slip sideways when it is close (the same 75 bands whatever the resolution)
  float row = floor(uv.y * 75.0);
  float slip = step(1.0 - tear * 0.05, hash12(vec2(row, floor(time * 24.0))));
  uv.x += slip * (hash12(vec2(row, time)) - 0.5) * 0.08 * tear;
  uv.x += sin(uv.y * 40.0 + time * 5.0) * 0.0025 * fear;
  // lens fringing: nothing at the centre, growing to the edges; fear and pain add to it
  float ca = (0.0006 + 0.0088 * r2) * caAmt + fear * 0.004 + damage * 0.012;
  vec3 col;
  col.r = texture2D(tDiffuse, uv + cc * ca).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - cc * ca).b;
  col = safe3(col);
  // dirt in every corner
  float ao = mix(1.0, clamp(safe1(texture2D(tAO, uv).r), 0.0, 1.0), aoOn);
  col *= ao * ao;
  col += safe3(texture2D(tVol, uv).rgb) * volOn;
  float e = mix(1.0, clamp(safe1(texture2D(tExpo, vec2(0.5)).r), 0.05, 2.0), autoExpo);
  col *= bright * expo * e;
  col += safe3(texture2D(tBloom, uv).rgb) * bloomAmt * bloomOn * bright; // already exposed
  col = aces(col);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  // bleach everything except blood (the same grade as the original), or one of the Customize grades
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  float red = clamp((col.r - max(col.g, col.b)) * 4.0, 0.0, 1.0);
  red = max(red, warm * clamp((col.r - col.b) * 2.2 - 0.1, 0.0, 1.0));
  int gm = int(gradeMode + 0.5);
  vec3 g = mix(vec3(l) * vec3(1.0, 0.96, 0.86), col, 0.3); // 0: Remastered
  if (gm == 1) g = vec3(l) * vec3(1.0, 0.97, 0.9); // 1998: the bleach, harder
  else if (gm == 2) g = vec3(l); // noir
  else if (gm == 3) g = vec3(l) * vec3(1.08, 0.86, 0.62); // sepia
  else if (gm == 4) g = mix(vec3(l) * vec3(0.76, 0.9, 1.1), col * vec3(0.8, 0.92, 1.1), 0.25); // cold steel
  else if (gm == 5) g = vec3(l) * vec3(0.74, 1.04, 0.58); // sick green
  else if (gm == 6) g = col; // natural colour
  else if (gm == 7) g = vec3(l) * vec3(1.15, 0.52, 0.46); // crimson
  else if (gm == 8) { g = vec3(0.12, 1.0, 0.3) * pow(l, 0.85) * 1.35; red = 0.0; } // night vision: even the blood goes green
  float keep = clamp(red * bloodAmt, 0.0, 1.0);
  col = mix(g, mix(g, col, 0.3 + 0.7 * bloodAmt), keep);
  col *= mix(tint, vec3(1.0), red);
  col = clamp((col - 0.5) * contrastAmt + 0.5, 0.0, 1.0);
  col = mix(col, vec3(dot(col, vec3(0.333))), (1.0 - health) * 0.6);
  col = smoothstep(0.01, 1.0, col);
  // lens vignette that closes in with fear
  float v = smoothstep(0.95, 0.15, length(cc) * (1.1 + fear * 0.7 + (1.0 - health) * 0.5 + hidden * 0.6));
  col *= mix(1.0, mix(0.12, 1.0, v), vigAmt);
  // hurt
  float pulse = (1.0 - health) * (0.5 + 0.5 * sin(time * 6.0));
  col = mix(col, vec3(0.45, 0.0, 0.0), clamp(damage * 0.7 + pulse * 0.35 * (1.0 - v), 0.0, 0.85));
  col = mix(col, vec3(1.0, 0.92, 0.88), flash);
  col *= 1.0 - blackout;
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------- FXAA + film grain + dither ----------
const fragFinal = /* glsl */ `
uniform sampler2D tLdr;
uniform vec2 texel, res;
uniform float time, fear, grainAmt, fxaa, filterMode, filterAmt, sharpen;
varying vec2 vUv;
${common}
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 fxaaPass(vec2 uv){
  vec3 rgbM = texture2D(tLdr, uv).rgb;
  vec3 rgbNW = texture2D(tLdr, uv + texel * vec2(-1.0, -1.0)).rgb, rgbNE = texture2D(tLdr, uv + texel * vec2(1.0, -1.0)).rgb;
  vec3 rgbSW = texture2D(tLdr, uv + texel * vec2(-1.0, 1.0)).rgb, rgbSE = texture2D(tLdr, uv + texel * vec2(1.0, 1.0)).rgb;
  float lM = luma(rgbM), lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0 / 128.0);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * texel;
  vec3 rgbA = 0.5 * (texture2D(tLdr, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tLdr, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tLdr, uv + dir * -0.5).rgb + texture2D(tLdr, uv + dir * 0.5).rgb);
  float lB = luma(rgbB);
  return (lB < lMin || lB > lMax) ? rgbA : rgbB;
}
// the Customize screen filters: 1 VHS, 2 old film, 3 CRT, 4 security camera, 5 retro (340 lines, few colours)
vec2 barrel(vec2 uv, float k){ vec2 c = uv - 0.5; return 0.5 + c * (1.0 + k * dot(c, c)); }
void main(){
  int fm = int(filterMode + 0.5);
  float k = filterAmt;
  vec2 uv = vUv;
  float fr = floor(time * 24.0);
  if (fm == 1) { // VHS: the picture wanders, a tracking band rolls down it, the bottom lines tear
    uv.x += (sin(uv.y * 220.0 + time * 9.0) * 0.0006 + (hash12(vec2(floor(uv.y * 240.0), fr)) - 0.5) * 0.0012) * k;
    float y0 = fract(time * 0.06), band = smoothstep(0.035, 0.0, abs(uv.y - y0));
    uv.x += band * (hash12(vec2(floor(uv.y * 120.0), fr)) - 0.5) * 0.03 * k;
    float bot = smoothstep(0.035, 0.0, uv.y);
    uv.x += bot * (hash12(vec2(floor(uv.y * 300.0), fr)) - 0.3) * 0.05 * k;
  } else if (fm == 2) { // old film: the frame weaves in the gate
    uv += (vec2(hash12(vec2(fr, 1.0)), hash12(vec2(fr, 2.0))) - 0.5) * 0.0003 * k; // (barely: the owner found more than this a shake)
  } else if (fm == 3) { // CRT: a curved tube
    uv = barrel(uv, 0.18 * k);
  } else if (fm == 4) { // security camera: a wide cheap lens
    uv = barrel(uv, 0.32 * k);
  } else if (fm == 5) { // retro: 340 lines
    vec2 px = vec2(res.x / res.y * 340.0, 340.0);
    uv = mix(uv, (floor(uv * px) + 0.5) / px, k);
  }
  vec3 col = fxaa > 0.5 && fm != 5 ? fxaaPass(uv) : texture2D(tLdr, uv).rgb;
  // contrast-adaptive sharpening: the picture is drawn below screen resolution and smoothed by FXAA, and far
  // surfaces went to mush; this brings their edges back without ringing on the hard ones
  if (sharpen > 0.0 && fm != 5) {
    vec3 a = texture2D(tLdr, uv + vec2(0.0, -texel.y)).rgb, b = texture2D(tLdr, uv + vec2(-texel.x, 0.0)).rgb;
    vec3 d = texture2D(tLdr, uv + vec2(texel.x, 0.0)).rgb, e = texture2D(tLdr, uv + vec2(0.0, texel.y)).rgb;
    vec3 mn = min(col, min(min(a, b), min(d, e))), mx = max(col, max(max(a, b), max(d, e)));
    vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
    vec3 w = -amp * mix(0.08, 0.2, sharpen);
    col = clamp((col + (a + b + d + e) * w) / (1.0 + 4.0 * w), 0.0, 1.0);
  }
  if (fm == 1) {
    // colour smears sideways (the chroma is a fraction of the picture's resolution), blacks lift, lines show
    vec3 sm = vec3(0.0);
    for (int i = -3; i <= 3; i++) sm += texture2D(tLdr, uv + vec2(float(i) * 0.0025 + 0.003, 0.0) * k).rgb;
    sm /= 7.0;
    float y = luma(col);
    vec3 chroma = sm - luma(sm);
    vec3 v = vec3(y) + chroma * 1.25;
    v = v * 0.9 + vec3(0.035, 0.03, 0.055);
    v *= 0.94 + 0.06 * sin(gl_FragCoord.y * 3.14159);
    float y0 = fract(time * 0.06), band = smoothstep(0.035, 0.0, abs(vUv.y - y0));
    v += band * step(0.82, hash12(gl_FragCoord.xy * 0.5 + fr)) * 0.5;
    v += step(0.9985, hash12(vec2(floor(gl_FragCoord.y / 2.0), fr))) * hash12(gl_FragCoord.xy + fr) * 0.6; // dropouts
    col = mix(col, v, k);
  } else if (fm == 2) {
    float l = luma(col);
    vec3 f = vec3(l) * vec3(1.06, 0.95, 0.78);
    f *= 0.985 + 0.015 * hash12(vec2(fr, 5.0)); // the lamp flickers, faintly
    for (int i = 0; i < 3; i++) { // scratches down the frame
      float sx = hash12(vec2(fr, float(i) * 7.1)), on = step(0.55, hash12(vec2(fr, float(i) * 3.3)));
      f *= 1.0 - on * smoothstep(0.0012, 0.0, abs(uv.x - sx)) * 0.6;
    }
    float dust = step(0.9993, hash12(floor(gl_FragCoord.xy / 3.0) + fr * 1.7));
    f *= 1.0 - dust * 0.8;
    vec2 c = uv - 0.5; f *= smoothstep(0.85, 0.3, length(c * vec2(1.1, 1.3)));
    col = mix(col, f, k);
  } else if (fm == 3) {
    vec3 m = vec3(0.75);
    int t = int(mod(gl_FragCoord.x, 3.0));
    if (t == 0) m.r = 1.25; else if (t == 1) m.g = 1.25; else m.b = 1.25; // the shadow mask
    vec3 c3 = col * mix(vec3(1.0), m, 0.5 * k);
    c3 *= 1.0 - 0.28 * k * (0.5 + 0.5 * cos(gl_FragCoord.y * 3.14159)); // scanlines
    vec2 e = abs(uv - 0.5) * 2.0; float edge = smoothstep(1.0, 0.96, max(e.x, e.y));
    col = c3 * edge * 1.12;
  } else if (fm == 4) {
    float l = luma(col);
    vec3 s = vec3(l) * vec3(0.86, 1.0, 0.9);
    s = (s - 0.5) * 0.85 + 0.5; // flat, cheap
    s *= 0.92 + 0.08 * step(0.5, fract(gl_FragCoord.y * 0.5)); // interlaced
    s += (hash12(gl_FragCoord.xy * 0.7 + fr) - 0.5) * 0.12;
    vec2 e = abs(uv - 0.5) * 2.0;
    col = mix(col, s, k) * smoothstep(1.02, 0.97, max(e.x, e.y));
  } else if (fm == 5) {
    vec2 cell = mod(floor(gl_FragCoord.xy / max(1.0, res.y / 340.0)), 4.0); // a 4x4 ordered dither, like the old consoles
    float bay = mod(cell.x * 3.0 + cell.y * 7.0 + cell.x * cell.y * 5.0, 16.0) / 16.0;
    vec3 q = floor(pow(col, vec3(0.8)) * 10.0 + bay * 0.85) / 10.0; q = pow(q, vec3(1.25)); // few colours
    col = mix(col, q, k);
  }
  // film grain: luminance only, a fresh triangular-distributed pattern every frame, heavier in the shadows
  float gs = max(1.0, res.y / 540.0);
  vec2 gp = floor(gl_FragCoord.xy / gs);
  float f = fract(time * 24.0) * 97.0;
  float n = hash12(gp + f) + hash12(gp * 1.37 + f + 17.0) - 1.0;
  float lum = luma(col);
  col += n * (0.045 + fear * 0.07) * grainAmt * (1.0 - 0.55 * lum);
  // 8-bit output of a dark picture bands; a hair of triangular noise hides it
  col += (hash12(gl_FragCoord.xy + 3.7) + hash12(gl_FragCoord.xy + 11.3) - 1.0) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const tgt = (w, h, o = {}) => new THREE.WebGLRenderTarget(Math.max(2, w | 0), Math.max(2, h | 0), { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, ...o });

export class RMPipeline {
  constructor(renderer, u) {
    this.r = renderer;
    this.u = u; // the game-facing uniforms (shared with the classic path)
    this.q = { ssao: true, vol: true, bloom: true, fxaa: true, refl: true, scale: 1, volScale: 0.5, aoScale: 0.5, reflScale: 0.5, autoExpo: true };
    this.vcam = new THREE.PerspectiveCamera();
    this.tmpV = new THREE.Vector3(); this.tmpU = new THREE.Vector3(); this.tmpT = new THREE.Vector3();
    this.frame = 0; this.snapFrames = 3; this.last = performance.now();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const sm = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false, ...extra });
    const V2 = () => ({ value: new THREE.Vector2() }), M4 = () => ({ value: new THREE.Matrix4() }), V3 = () => ({ value: new THREE.Vector3() });
    this.m = {
      ao: sm(fragAO, { tDepth: { value: null }, proj: M4(), invProj: M4(), texel: V2(), radius: { value: 0.55 }, bias: { value: 0.025 }, strength: { value: 1.35 }, frame: { value: 0 } }),
      blur: sm(fragBlur, { tSrc: { value: null }, tDepth: { value: null }, texel: V2() }),
      vol: sm(fragVol, {
        tDepth: { value: null }, tShadow: { value: null }, invProj: M4(), camWorld: M4(), shadowMat: M4(), camPos: V3(), tPos: V3(), tDir: V3(), tCol: V3(),
        tCosOuter: { value: 0.8 }, tCosInner: { value: 0.9 }, tOn: { value: 0 }, shadowBias: { value: 0.002 }, lPos: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
        lCol: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) }, time: { value: 0 }, density: { value: 0.18 }, gain: { value: 1 }, maxDist: { value: 22 }, frame: { value: 0 },
      }),
      pick: sm(fragPick, { tSrc: { value: null }, tExpo: { value: null }, expo: u.expo, texel: V2(), threshold: { value: 1.6 }, knee: { value: 0.6 } }),
      down: sm(fragDown, { tSrc: { value: null }, texel: V2() }),
      up: sm(fragUp, { tSrc: { value: null }, texel: V2(), gain: { value: 0.9 } }, { blending: THREE.AdditiveBlending, transparent: true }),
      lum: sm(fragLum, { tHdr: { value: null }, cell: { value: new THREE.Vector2(1 / 32, 1 / 18) } }),
      adapt: sm(fragAdapt, { tLum: { value: null }, tPrev: { value: null }, dt: { value: 0.016 }, snap: { value: 0 }, key: { value: 0.12 }, brightKey: { value: 0.3 }, lo: { value: 0.07 }, hi: { value: 1.8 } }),
      comp: sm(fragComp, { ...u, tDiffuse: { value: null }, tBloom: { value: null }, tAO: { value: null }, tVol: { value: null }, tExpo: { value: null }, aoOn: { value: 1 }, volOn: { value: 1 }, autoExpo: { value: 1 } }),
      fin: sm(fragFinal, { tLdr: { value: null }, texel: V2(), res: u.res, time: u.time, fear: u.fear, grainAmt: u.grainAmt, fxaa: { value: 1 }, sharpen: { value: 0.7 }, filterMode: u.filterMode, filterAmt: u.filterAmt }),
    };
    this.m.pick.uniforms.autoExpo = this.m.comp.uniforms.autoExpo;
    this.m.ao.defines = { AO_S: 14 };
    this.m.vol.defines = { VOL_STEPS: 28 };
    this.key = '';
  }

  // sample and step counts are compiled into the shaders; the target sizes follow the scales (see gfx.js)
  applyQuality() {
    const q = this.q, setDef = (m, k, v) => { if (m.defines[k] !== v) { m.defines[k] = v; m.needsUpdate = true; } };
    setDef(this.m.ao, 'AO_S', q.aoSamples || 14);
    setDef(this.m.vol, 'VOL_STEPS', q.volSteps || 28);
    if (this.w) this.size(this.w, this.h);
  }

  size(w, h) {
    const s = this.q.scale, bw = Math.round(w * s), bh = Math.round(h * s), key = [bw, bh, this.q.volScale, this.q.aoScale, this.q.reflScale].join('x');
    this.w = w; this.h = h;
    if (key === this.key) return;
    this.key = key;
    for (const k of ['hdr', 'lumRT', 'ao', 'aoB', 'vol', 'volB', 'ldr', 'adA', 'adB', 'reflRT']) if (this[k]) this[k].dispose();
    if (this.mips) for (const m of this.mips) m.dispose();
    const depth = new THREE.DepthTexture(bw, bh);
    depth.type = THREE.UnsignedIntType;
        this.hdr = tgt(bw, bh, { depthBuffer: true, depthTexture: depth });
    this.lumRT = tgt(32, 18, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const aw = bw * this.q.aoScale, ah = bh * this.q.aoScale, vw = bw * this.q.volScale, vh = bh * this.q.volScale;
    this.ao = tgt(aw, ah, { type: THREE.UnsignedByteType }); this.aoB = tgt(aw, ah, { type: THREE.UnsignedByteType });
    this.vol = tgt(vw, vh); this.volB = tgt(vw, vh);
    this.ldr = tgt(bw, bh, { type: THREE.UnsignedByteType });
    this.adA = tgt(1, 1); this.adB = tgt(1, 1);
    this.reflRT = tgt(bw * this.q.reflScale, bh * this.q.reflScale, { depthBuffer: true });
    REFL.tReflect.value = this.reflRT.texture;
    this.snapFrames = 3;
    this.mips = [];
    let mw = bw >> 1, mh = bh >> 1;
    for (let i = 0; i < 5 && mw >= 8 && mh >= 8; i++, mw >>= 1, mh >>= 1) this.mips.push(tgt(mw, mh));
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.black.needsUpdate = true;
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); this.white.needsUpdate = true;
  }

  blit(mat, target, clear = true) {
    const r = this.r;
    this.quad.material = mat;
    r.setRenderTarget(target);
    r.autoClear = clear;
    r.render(this.scene, this.cam);
    r.autoClear = true;
  }

  // torch: the SpotLight (with a shadow map), lamps: the PointLights the game hands to the nearest ceiling lamps
  render(scene, camera, { torch, lamps = [] } = {}) {
    const r = this.r, q = this.q, m = this.m, u = this.u;
    const now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    this.frame++;
    camera.updateMatrixWorld();
    // 0. the floor's mirror image: the same scene from a camera reflected in y = 0, kept at half resolution
    if (q.refl) {
      const vc = this.vcam, p = this.tmpV.setFromMatrixPosition(camera.matrixWorld), up = this.tmpU.set(0, 1, 0).transformDirection(camera.matrixWorld);
      const fw = camera.getWorldDirection(this.tmpT);
      vc.projectionMatrix.copy(camera.projectionMatrix); vc.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      vc.position.set(p.x, -p.y, p.z);
      vc.up.set(up.x, -up.y, up.z);
      vc.lookAt(p.x + fw.x, -(p.y + fw.y), p.z + fw.z);
      vc.updateMatrixWorld();
      vc.matrixWorldInverse.copy(vc.matrixWorld).invert();
      vc.layers.set(1); // only the big shapes and the lights (detail.js marks them)
      REFL.reflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
      REFL.reflGain.value = 0; // the floor must not sample the mirror while it is being drawn (nor even have it bound)
      REFL.tReflect.value = this.black;
      r.setRenderTarget(this.reflRT);
      r.render(scene, vc);
      REFL.tReflect.value = this.reflRT.texture;
      REFL.reflGain.value = 1;
    } else REFL.reflGain.value = 0;
    // 1. the scene
    r.setRenderTarget(this.hdr);
    r.render(scene, camera);
    const bw = this.hdr.width, bh = this.hdr.height;
    // 2. ambient occlusion
    if (q.ssao) {
      const a = m.ao.uniforms;
      a.tDepth.value = this.hdr.depthTexture; a.proj.value.copy(camera.projectionMatrix); a.invProj.value.copy(camera.projectionMatrixInverse);
      a.texel.value.set(1 / this.ao.width, 1 / this.ao.height); a.frame.value = this.frame % 8;
      this.blit(m.ao, this.ao);
      const b = m.blur.uniforms;
      b.tSrc.value = this.ao.texture; b.tDepth.value = this.hdr.depthTexture; b.texel.value.set(1 / this.ao.width, 1 / this.ao.height);
      this.blit(m.blur, this.aoB);
    }
    // 3. volumetric light
    let volOn = 0;
    if (q.vol && (torch || lamps.length)) {
      const v = m.vol.uniforms;
      v.tDepth.value = this.hdr.depthTexture; v.invProj.value.copy(camera.projectionMatrixInverse); v.camWorld.value.copy(camera.matrixWorld);
      v.camPos.value.setFromMatrixPosition(camera.matrixWorld);
      const on = torch && torch.intensity > 0.5 && torch.shadow.map ? 1 : 0;
      v.tOn.value = on;
      if (on) {
        torch.getWorldPosition(v.tPos.value);
        v.tDir.value.setFromMatrixPosition(torch.target.matrixWorld).sub(v.tPos.value).normalize();
        v.tCol.value.set(torch.color.r, torch.color.g, torch.color.b).multiplyScalar(torch.intensity * 0.0105);
        v.tCosOuter.value = Math.cos(torch.angle); v.tCosInner.value = Math.cos(torch.angle * (1 - torch.penumbra));
        v.tShadow.value = torch.shadow.map.texture; v.shadowMat.value.copy(torch.shadow.matrix);
      } else v.tShadow.value = this.black;
      for (let i = 0; i < 6; i++) {
        const l = lamps[i];
        if (l && l.visible && l.intensity > 0.01) { l.getWorldPosition(v.lPos.value[i]); v.lCol.value[i].set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity); } else v.lCol.value[i].set(0, 0, 0);
      }
      v.time.value = u.time.value; v.frame.value = this.frame % 16;
      this.blit(m.vol, this.vol);
      const b = m.blur.uniforms;
      b.tSrc.value = this.vol.texture; b.tDepth.value = this.hdr.depthTexture; b.texel.value.set(1 / this.vol.width, 1 / this.vol.height);
      this.blit(m.blur, this.volB);
      volOn = 1;
    }
    // 4. bloom
    const mips = this.mips, bloomOn = q.bloom && u.bloomAmt.value > 0 && mips.length > 1;
    if (bloomOn) {
      m.pick.uniforms.tExpo.value = this.adA.texture;
      let src = this.hdr.texture, mat = m.pick;
      for (let i = 0; i < mips.length; i++) {
        mat.uniforms.tSrc.value = src;
        mat.uniforms.texel.value.set(1 / (i ? mips[i - 1].width : bw), 1 / (i ? mips[i - 1].height : bh));
        this.blit(mat, mips[i]);
        src = mips[i].texture; mat = m.down;
      }
      for (let i = mips.length - 1; i > 0; i--) {
        m.up.uniforms.tSrc.value = mips[i].texture;
        m.up.uniforms.texel.value.set(1 / mips[i].width, 1 / mips[i].height);
        this.blit(m.up, mips[i - 1], false);
      }
    }
    // 5. the eye
    if (q.autoExpo) {
      m.lum.uniforms.tHdr.value = this.hdr.texture;
      this.blit(m.lum, this.lumRT);
      const a = m.adapt.uniforms;
      a.tLum.value = this.lumRT.texture; a.tPrev.value = this.adA.texture; a.dt.value = dt;
      a.snap.value = this.snapFrames > 0 ? 1 : 0;
      this.blit(m.adapt, this.adB);
      const t = this.adA; this.adA = this.adB; this.adB = t;
      if (this.snapFrames > 0) this.snapFrames--;
    }
    // 6. composite to LDR, then FXAA + grain to the screen
    const c = m.comp.uniforms;
    c.tDiffuse.value = this.hdr.texture;
    c.tBloom.value = bloomOn ? mips[0].texture : this.black;
    c.tAO.value = q.ssao ? this.aoB.texture : this.white; c.aoOn.value = q.ssao ? 1 : 0;
    c.tVol.value = volOn ? this.volB.texture : this.black; c.volOn.value = volOn;
    c.tExpo.value = this.adA.texture; c.autoExpo.value = q.autoExpo ? 1 : 0;
    c.bloomOn.value = bloomOn ? 1 : 0;
    c.res.value.set(this.w, this.h);
    this.blit(m.comp, this.ldr);
    const f = m.fin.uniforms;
    f.tLdr.value = this.ldr.texture; f.texel.value.set(1 / this.ldr.width, 1 / this.ldr.height); f.fxaa.value = q.fxaa ? 1 : 0;
    this.blit(m.fin, null);
  }
}
