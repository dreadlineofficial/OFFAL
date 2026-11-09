// OFFAL: REMASTERED: wet floors. The pipeline renders the scene again from a camera mirrored in the floor (postrm.js) and
// parks the result in REFL; any floor-like material patched with patchWet() mixes it in by its own roughness map and a
// Fresnel term, so puddles, blood and wet tile mirror the lamps and walls while dry concrete only glints.
import * as THREE from 'three';

export const REFL = { tReflect: { value: null }, reflMat: { value: new THREE.Matrix4() }, reflGain: { value: 0 } };

export function patchWet(mat, { gain = 1, distort = 0.04 } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tReflect: REFL.tReflect, reflMat: REFL.reflMat, reflGain: REFL.reflGain, reflDistort: { value: distort }, reflK: { value: gain } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 reflMat; varying vec4 vRefl; varying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wp_ = modelMatrix * vec4(transformed, 1.0); vRefl = reflMat * wp_; vWPos = wp_.xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tReflect; uniform float reflGain, reflDistort, reflK; varying vec4 vRefl; varying vec3 vWPos;')
      .replace('#include <opaque_fragment>', `
      if (reflGain > 0.0) {
        vec3 V = normalize(cameraPosition - vWPos);
        float cosT = clamp(V.y, 0.0, 1.0);
        float F = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
        float gloss = clamp(1.0 - roughnessFactor, 0.0, 1.0);
        vec3 nW = inverseTransformDirection(normal, viewMatrix);
        vec4 rc = vRefl; rc.xy += nW.xz * reflDistort * rc.w;
        float blur = roughnessFactor * 0.035 * rc.w;
        vec3 rf = texture2DProj(tReflect, rc).rgb * 0.4
                + texture2DProj(tReflect, rc + vec4( blur, 0.0, 0.0, 0.0)).rgb * 0.15 + texture2DProj(tReflect, rc + vec4(-blur, 0.0, 0.0, 0.0)).rgb * 0.15
                + texture2DProj(tReflect, rc + vec4(0.0,  blur, 0.0, 0.0)).rgb * 0.15 + texture2DProj(tReflect, rc + vec4(0.0, -blur, 0.0, 0.0)).rgb * 0.15;
        outgoingLight += rf * F * gloss * gloss * reflGain * reflK * 2.2 * (0.4 + 0.6 * gloss);
      }
      #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'wet';
  return mat;
}
