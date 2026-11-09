// OFFAL: REMASTERED: flesh. Skin, meat and organs let light in: it wraps round past the edge of the lit side and
// comes back out reddened, instead of stopping at a hard line like on plastic. Done as a wrapped diffuse term with a
// blood-red tint where the wrap reaches past the terminator (the specular keeps the true angle).
import * as THREE from 'three';

const KEY = 'flesh';
export function patchFlesh(mat, { wrap = 0.5, tint = [1.0, 0.42, 0.32], amount = 0.65 } = {}) {
  if (!mat || mat.userData.flesh) return mat;
  mat.userData.flesh = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(
      'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
      `{ float nl = dot( geometryNormal, directLight.direction );
         float wrapped = saturate( ( nl + ${wrap.toFixed(3)} ) / ${(1 + wrap).toFixed(3)} );
         vec3 scatter = mix( vec3( wrapped ), vec3( wrapped ) * vec3( ${tint.map((x) => x.toFixed(3)).join(', ')} ), saturate( 1.0 - nl * 2.0 ) );
         reflectedLight.directDiffuse += mix( irradiance, scatter * directLight.color, ${amount.toFixed(3)} ) * BRDF_Lambert( material.diffuseColor ); }`));
  };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => prevKey() + KEY;
  return mat;
}
