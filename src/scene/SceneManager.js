import * as THREE from 'three';

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this._initRenderer();
    this._initCamera();
    this._initLights();
    this._initResize();
    this._animationId = null;
    this._updateCallbacks = [];
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);
  }

  _initCamera() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(0, 1.5, 4);
    this.camera.lookAt(0, 0, 0);
  }

  _initLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 8, 5);
    this.scene.add(dirLight);

    // Subtle fill from below
    const fillLight = new THREE.DirectionalLight(0x6366f1, 0.2);
    fillLight.position.set(-3, -2, -3);
    this.scene.add(fillLight);
  }

  _initResize() {
    this._onResize = () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);
  }

  onUpdate(fn) {
    this._updateCallbacks.push(fn);
  }

  start() {
    const loop = (time) => {
      this._animationId = requestAnimationFrame(loop);
      const dt = 0.016; // approximate, good enough for uniforms
      this._updateCallbacks.forEach((fn) => fn(dt, time));
      this.renderer.render(this.scene, this.camera);
    };
    this._animationId = requestAnimationFrame(loop);
  }

  stop() {
    if (this._animationId !== null) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
