import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const objLoader = new OBJLoader();

/** URL map for model types that need file loading */
const MODEL_URLS = {
  raspberry: '/models/raspberry_high.obj',
};

/**
 * Manages spawned 3D objects in the scene.
 * Each object gets its own cloned material so triplanar bounds work per-object.
 */
export class ObjectManager {
  constructor(scene) {
    this._scene = scene;
    this._objects = []; // { mesh: THREE.Object3D, type: string }
    this._geometryCache = new Map(); // type → { model, boundingBox }
    this._modelCache = new Map();    // url → Promise<{ model, boundingBox }>
  }

  /**
   * Spawn a shape at the given world position.
   * @param {string} type - Shape type: 'box','sphere','torus','cone','tower','molecule','raspberry'
   * @param {THREE.Vector3} position - World position to place the object
   * @param {THREE.ShaderMaterial} baseMaterial - Material to clone for this object
   * @returns {Promise<THREE.Object3D>}
   */
  async spawn(type, position, baseMaterial) {
    const { model: template, boundingBox } = await this._getTemplate(type);
    const model = template.clone();
    const material = baseMaterial.clone();

    // Copy uniform values from base (clone doesn't deep-copy uniform objects)
    material.uniforms.uVideoTexture = { value: baseMaterial.uniforms.uVideoTexture.value };
    material.uniforms.uTileScale = { value: baseMaterial.uniforms.uTileScale.value };
    material.uniforms.uBlendSharp = { value: baseMaterial.uniforms.uBlendSharp.value };
    material.uniforms.uTime = { value: baseMaterial.uniforms.uTime.value };
    material.uniforms.uBoundsMin = { value: boundingBox.min.clone() };
    material.uniforms.uBoundsSize = { value: new THREE.Vector3() };
    boundingBox.getSize(material.uniforms.uBoundsSize.value);

    model.traverse((child) => {
      if (child.isMesh) child.material = material;
    });

    model.position.copy(position);
    model.userData.shapeType = type;
    model.userData.streamMaterial = material;

    this._scene.add(model);
    this._objects.push({ mesh: model, type });
    return model;
  }

  remove(mesh) {
    this._scene.remove(mesh);
    this._objects = this._objects.filter((o) => o.mesh !== mesh);
  }

  removeAll() {
    for (const { mesh } of this._objects) {
      this._scene.remove(mesh);
    }
    this._objects = [];
  }

  getAll() {
    return this._objects.map((o) => o.mesh);
  }

  getAllMeshes() {
    const meshes = [];
    for (const { mesh } of this._objects) {
      mesh.traverse((child) => {
        if (child.isMesh) meshes.push(child);
      });
    }
    return meshes;
  }

  getMaterials() {
    return this._objects
      .map((o) => o.mesh.userData.streamMaterial)
      .filter(Boolean);
  }

  async _getTemplate(type) {
    if (MODEL_URLS[type]) {
      const url = MODEL_URLS[type];
      if (!this._modelCache.has(url)) {
        this._modelCache.set(url, this._loadObjModel(url));
      }
      return this._modelCache.get(url);
    }
    if (!this._geometryCache.has(type)) {
      this._geometryCache.set(type, this._createGeometry(type));
    }
    return this._geometryCache.get(type);
  }

  _createGeometry(type) {
    const placeholder = new THREE.MeshStandardMaterial();
    const group = new THREE.Group();

    switch (type) {
      case 'sphere':
        group.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), placeholder));
        break;
      case 'torus':
        group.add(new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.35, 64, 64), placeholder));
        break;
      case 'cone':
        group.add(new THREE.Mesh(new THREE.ConeGeometry(1, 2, 64), placeholder));
        break;
      case 'tower': {
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.6), placeholder);
        base.position.y = -0.6;
        group.add(base);
        const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 1.2, 32), placeholder);
        mid.position.y = 0.4;
        group.add(mid);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.8, 32), placeholder);
        roof.position.y = 1.4;
        group.add(roof);
        break;
      }
      case 'molecule': {
        group.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 16), placeholder));
        const armDirs = [
          [1, 0, 0], [-1, 0, 0],
          [0, 1, 0], [0, -1, 0],
          [0, 0, 1], [0, 0, -1],
        ];
        for (const [x, y, z] of armDirs) {
          const orb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 12), placeholder);
          orb.position.set(x * 1.1, y * 1.1, z * 1.1);
          group.add(orb);
          const bond = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.85, 8), placeholder);
          bond.position.set(x * 0.55, y * 0.55, z * 0.55);
          if (x !== 0) bond.rotation.z = Math.PI / 2;
          if (z !== 0) bond.rotation.x = Math.PI / 2;
          group.add(bond);
        }
        break;
      }
      default: // box
        group.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), placeholder));
        break;
    }

    return { model: group, boundingBox: new THREE.Box3().setFromObject(group) };
  }

  _loadObjModel(url) {
    return new Promise((resolve, reject) => {
      objLoader.load(
        url,
        (loaded) => {
          const box = new THREE.Box3().setFromObject(loaded);
          const center = new THREE.Vector3();
          const size = new THREE.Vector3();
          box.getCenter(center);
          box.getSize(size);

          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = maxDim > 0 ? 2.0 / maxDim : 1;
          loaded.position.sub(center.multiplyScalar(scale));
          loaded.scale.setScalar(scale);

          // Wrap in a group so centering offset is on the inner object,
          // keeping the root group's position free for spawn placement
          const group = new THREE.Group();
          group.add(loaded);
          group.updateMatrixWorld(true);

          const boundingBox = new THREE.Box3().setFromObject(group);
          resolve({ model: group, boundingBox });
        },
        undefined,
        reject
      );
    });
  }
}
