import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

/**
 * Load a GLTF/GLB model, compute its world-space bounding box, centre it at
 * the origin and normalise its scale to fit inside a unit cube.
 *
 * @param {string} url   - Path or URL to the .glb/.gltf file
 * @returns {Promise<{ model: THREE.Object3D, boundingBox: THREE.Box3 }>}
 */
export function loadModel(url) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;

        // Centre + normalise scale
        const box = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);

        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = maxDim > 0 ? 2.0 / maxDim : 1;
        model.position.sub(center.multiplyScalar(scale));
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);

        // Recompute bounding box after transform
        const boundingBox = new THREE.Box3().setFromObject(model);

        resolve({ model, boundingBox });
      },
      undefined,
      reject
    );
  });
}

/**
 * Replace every mesh material in the model with the provided material.
 * Preserves double-side flag based on original material.
 */
export function applyMaterialToModel(model, material) {
  model.traverse((child) => {
    if (child.isMesh) {
      child.material = material;
    }
  });
}

/**
 * Create a simple fallback box model (no file load needed).
 * @returns {{ model: THREE.Object3D, boundingBox: THREE.Box3 }}
 */
export function createFallbackBox() {
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  // Placeholder material; will be replaced by StreamMaterial
  const material = new THREE.MeshStandardMaterial({ color: 0x444444 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'FallbackBox';

  const group = new THREE.Group();
  group.add(mesh);

  const boundingBox = new THREE.Box3().setFromObject(group);
  return { model: group, boundingBox };
}
