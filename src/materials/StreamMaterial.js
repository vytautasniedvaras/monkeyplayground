import * as THREE from 'three';
import vertexShader from '../shaders/triplanar.vert';
import fragmentShader from '../shaders/triplanar.frag';

/**
 * Factory for the triplanar stream ShaderMaterial.
 *
 * @param {THREE.VideoTexture|THREE.Texture} texture  - The video (or fallback) texture
 * @param {THREE.Box3} boundingBox                    - World-space AABB of the model
 * @returns {THREE.ShaderMaterial}
 */
export function createStreamMaterial(texture, boundingBox) {
  const boundsMin = boundingBox.min.clone();
  const boundsSize = new THREE.Vector3();
  boundingBox.getSize(boundsSize);

  // Prevent division by zero on flat geometries
  if (boundsSize.x < 0.001) boundsSize.x = 1;
  if (boundsSize.y < 0.001) boundsSize.y = 1;
  if (boundsSize.z < 0.001) boundsSize.z = 1;

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uVideoTexture: { value: texture },
      uTileScale:    { value: 1.0 },
      uBlendSharp:   { value: 4.0 },
      uBoundsMin:    { value: boundsMin },
      uBoundsSize:   { value: boundsSize },
      uTime:         { value: 0.0 },
    },
    side: THREE.FrontSide,
  });

  return material;
}

/**
 * Update a StreamMaterial's texture in-place (no shader recompile needed).
 */
export function swapTexture(material, newTexture) {
  newTexture.colorSpace = THREE.SRGBColorSpace;
  newTexture.minFilter = THREE.LinearFilter;
  newTexture.magFilter = THREE.LinearFilter;
  newTexture.generateMipmaps = false;
  material.uniforms.uVideoTexture.value = newTexture;
  material.uniforms.uVideoTexture.needsUpdate = true;
}

/**
 * Update bounds uniforms when a new model is loaded.
 */
export function updateBounds(material, boundingBox) {
  material.uniforms.uBoundsMin.value.copy(boundingBox.min);
  const size = new THREE.Vector3();
  boundingBox.getSize(size);
  if (size.x < 0.001) size.x = 1;
  if (size.y < 0.001) size.y = 1;
  if (size.z < 0.001) size.z = 1;
  material.uniforms.uBoundsSize.value.copy(size);
}
