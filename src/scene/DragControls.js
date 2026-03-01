import * as THREE from 'three';

/**
 * Handles click-to-spawn, click-and-drag repositioning, selection, and
 * scroll-to-scale of objects. Uses capture-phase listeners to fire before
 * OrbitControls so object drags aren't hijacked by the orbit handler.
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

    this._brush = 'box';
    this._dragging = null; // { root, offset }
    this._dragPlane = new THREE.Plane();
    this._pointerDownPos = new THREE.Vector2();
    this._selected = null;

    this._onSpawn = null;
    this._onSelect = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);

    // Capture phase so we fire BEFORE OrbitControls (registered in bubble phase)
    domElement.addEventListener('pointerdown', this._onPointerDown, true);
    domElement.addEventListener('pointermove', this._onPointerMove, true);
    domElement.addEventListener('pointerup', this._onPointerUp, true);
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
  }

  setBrush(type) {
    this._brush = type;
  }

  getBrush() {
    return this._brush;
  }

  getSelected() {
    return this._selected;
  }

  deselect() {
    this._selected = null;
    this._onSelect?.(null);
  }

  _updateMouse(event) {
    const rect = this._domElement.getBoundingClientRect();
    this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _hitTest() {
    this._raycaster.setFromCamera(this._mouse, this._camera);
    const allMeshes = this._objectManager.getAllMeshes();
    const hits = this._raycaster.intersectObjects(allMeshes, false);
    if (hits.length > 0) {
      return { hit: hits[0], root: this._findRoot(hits[0].object) };
    }
    return null;
  }

  _onPointerDown(event) {
    if (event.button !== 0) return;
    this._updateMouse(event);
    this._pointerDownPos.set(event.clientX, event.clientY);

    const result = this._hitTest();

    if (result?.root) {
      // Hit an existing object — start drag, block OrbitControls
      event.stopImmediatePropagation();
      this._orbitControls.enabled = false;

      const root = result.root;
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
      return;
    }

    // No object hit — spawn on ground plane immediately
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
    event.stopImmediatePropagation();
    this._updateMouse(event);
    this._raycaster.setFromCamera(this._mouse, this._camera);

    const intersection = new THREE.Vector3();
    const hit = this._raycaster.ray.intersectPlane(this._dragPlane, intersection);
    if (hit) {
      this._dragging.root.position.copy(intersection.add(this._dragging.offset));
    }
  }

  _onPointerUp(event) {
    const dx = event.clientX - this._pointerDownPos.x;
    const dy = event.clientY - this._pointerDownPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const wasClick = dist < 5;

    if (this._dragging) {
      if (wasClick) {
        // Pointer barely moved → select the object
        this._selected = this._dragging.root;
        this._onSelect?.(this._selected);
      }
      this._dragging = null;
      this._orbitControls.enabled = true;
      return;
    }

    // Click on empty space → deselect
    if (wasClick) {
      this._updateMouse(event);
      const result = this._hitTest();
      if (!result) {
        this._selected = null;
        this._onSelect?.(null);
      }
    }
  }

  _onWheel(event) {
    if (!this._selected) return;

    this._updateMouse(event);
    const result = this._hitTest();
    if (result?.root === this._selected) {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY > 0 ? 0.95 : 1.05;
      this._selected.scale.multiplyScalar(delta);
      this._onSelect?.(this._selected); // refresh UI
    }
  }

  _findRoot(object) {
    const allRoots = this._objectManager.getAll();
    let current = object;
    while (current) {
      if (allRoots.includes(current)) return current;
      current = current.parent;
    }
    return null;
  }

  onSpawn(fn) {
    this._onSpawn = fn;
  }

  onSelect(fn) {
    this._onSelect = fn;
  }

  dispose() {
    this._domElement.removeEventListener('pointerdown', this._onPointerDown, true);
    this._domElement.removeEventListener('pointermove', this._onPointerMove, true);
    this._domElement.removeEventListener('pointerup', this._onPointerUp, true);
    this._domElement.removeEventListener('wheel', this._onWheel);
  }
}
