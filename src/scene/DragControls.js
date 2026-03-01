import * as THREE from 'three';

/**
 * Handles click-to-spawn and click-and-drag repositioning of objects.
 * Disables OrbitControls while dragging an object.
 */
export class DragControls {
  constructor(camera, domElement, objectManager, orbitControls) {
    this._camera = camera;
    this._domElement = domElement;
    this._objectManager = objectManager;
    this._orbitControls = orbitControls;

    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this._brush = 'box'; // current shape to spawn
    this._dragging = null; // { root, offset }
    this._dragPlane = new THREE.Plane();
    this._didDrag = false;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);

    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('pointermove', this._onPointerMove);
    domElement.addEventListener('pointerup', this._onPointerUp);
  }

  setBrush(type) {
    this._brush = type;
  }

  getBrush() {
    return this._brush;
  }

  _updateMouse(event) {
    const rect = this._domElement.getBoundingClientRect();
    this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _onPointerDown(event) {
    if (event.button !== 0) return; // left click only
    this._updateMouse(event);
    this._raycaster.setFromCamera(this._mouse, this._camera);

    // Check hit on existing objects
    const allMeshes = this._objectManager.getAllMeshes();
    const hits = this._raycaster.intersectObjects(allMeshes, false);

    if (hits.length > 0) {
      // Find the root group (direct child of scene) for this mesh
      const root = this._findRoot(hits[0].object);
      if (root) {
        // Start dragging
        this._dragPlane.setFromNormalAndCoplanarPoint(
          new THREE.Vector3(0, 1, 0),
          root.position
        );
        const intersection = new THREE.Vector3();
        this._raycaster.ray.intersectPlane(this._dragPlane, intersection);
        this._dragging = {
          root,
          offset: new THREE.Vector3().subVectors(root.position, intersection),
        };
        this._didDrag = false;
        this._orbitControls.enabled = false;
      }
      return;
    }

    // No hit — spawn a new object if brush is set
    if (this._brush) {
      const intersection = new THREE.Vector3();
      const hit = this._raycaster.ray.intersectPlane(this._groundPlane, intersection);
      if (hit && this._onSpawn) {
        this._onSpawn(this._brush, intersection);
      }
    }
  }

  _onPointerMove(event) {
    if (!this._dragging) return;
    this._didDrag = true;
    this._updateMouse(event);
    this._raycaster.setFromCamera(this._mouse, this._camera);

    const intersection = new THREE.Vector3();
    const hit = this._raycaster.ray.intersectPlane(this._dragPlane, intersection);
    if (hit) {
      this._dragging.root.position.copy(intersection.add(this._dragging.offset));
    }
  }

  _onPointerUp() {
    if (this._dragging) {
      this._dragging = null;
      this._orbitControls.enabled = true;
    }
  }

  /**
   * Walk up from a mesh to find the root group managed by ObjectManager.
   */
  _findRoot(object) {
    const allRoots = this._objectManager.getAll();
    let current = object;
    while (current) {
      if (allRoots.includes(current)) return current;
      current = current.parent;
    }
    return null;
  }

  /**
   * Register a callback for spawn events.
   * @param {(type: string, position: THREE.Vector3) => void} fn
   */
  onSpawn(fn) {
    this._onSpawn = fn;
  }

  dispose() {
    this._domElement.removeEventListener('pointerdown', this._onPointerDown);
    this._domElement.removeEventListener('pointermove', this._onPointerMove);
    this._domElement.removeEventListener('pointerup', this._onPointerUp);
  }
}
