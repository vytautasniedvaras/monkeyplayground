import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager.js';
import { CameraController } from './scene/CameraController.js';
import { loadModel, loadObjModel, applyMaterialToModel, createFallbackBox } from './models/ModelLoader.js';
import { createStreamMaterial, swapTexture, updateBounds } from './materials/StreamMaterial.js';
import { StreamManager } from './streams/StreamManager.js';
import { WorkerClient } from './api/WorkerClient.js';
import { StreamPanel } from './ui/StreamPanel.js';
import { ModelSwitcher } from './ui/ModelSwitcher.js';

const MODELS = [
  { name: 'Box',       url: null },
  { name: 'Sphere',    url: null, geo: 'sphere' },
  { name: 'Torus',     url: null, geo: 'torus' },
  { name: 'Raspberry', url: '/models/raspberry_high.obj' },
  { name: 'Cone',      url: null, geo: 'cone' },
  { name: 'Tower',     url: null, geo: 'tower' },
  { name: 'Molecule',  url: null, geo: 'molecule' },
];

async function main() {
  const container = document.getElementById('canvas-container');
  const loadingOverlay = document.getElementById('loading-overlay');

  const scene = new SceneManager(container);
  const camera = new CameraController(scene.camera, scene.renderer.domElement);
  scene.onUpdate(() => camera.update());

  // ── Panel toggle ──────────────────────────────────────────────────────────
  const panel = document.getElementById('ui-panel');
  const toggleBtn = document.getElementById('panel-toggle');
  toggleBtn.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    toggleBtn.classList.toggle('collapsed', collapsed);
    toggleBtn.textContent = collapsed ? '▶' : '◀';
  });

  // ── Fallback texture ──────────────────────────────────────────────────────
  const fallbackCanvas = document.createElement('canvas');
  fallbackCanvas.width = 2; fallbackCanvas.height = 2;
  const ctx = fallbackCanvas.getContext('2d');
  ctx.fillStyle = '#222'; ctx.fillRect(0, 0, 2, 2);
  const fallbackTexture = new THREE.CanvasTexture(fallbackCanvas);

  // ── Model loading ─────────────────────────────────────────────────────────
  let currentModel = null;
  let streamMaterial = null;

  async function loadAndApplyModel(modelDef) {
    if (currentModel) scene.scene.remove(currentModel);

    let model, boundingBox;
    if (modelDef.url) {
      try {
        const isObj = modelDef.url.toLowerCase().endsWith('.obj');
        ({ model, boundingBox } = isObj
          ? await loadObjModel(modelDef.url)
          : await loadModel(modelDef.url));
      } catch {
        ({ model, boundingBox } = createFallbackBox());
      }
    } else {
      ({ model, boundingBox } = createProceduralModel(modelDef));
    }

    if (!streamMaterial) {
      streamMaterial = createStreamMaterial(fallbackTexture, boundingBox);
    } else {
      updateBounds(streamMaterial, boundingBox);
    }

    applyMaterialToModel(model, streamMaterial);
    scene.scene.add(model);
    currentModel = model;
  }

  // ── Model switcher ────────────────────────────────────────────────────────
  const switcher = new ModelSwitcher(MODELS);
  switcher.onChange((modelDef) => loadAndApplyModel(modelDef));

  // ── Animation controls ──────────────────────────────────────────────────────
  const anim = { playing: true, speedX: 0, speedY: 1, speedZ: 0 };

  document.getElementById('anim-playpause').addEventListener('click', (e) => {
    anim.playing = !anim.playing;
    e.currentTarget.textContent = anim.playing ? '⏸' : '▶';
  });

  for (const axis of ['x', 'y', 'z']) {
    document.getElementById(`anim-speed-${axis}`).addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      anim[`speed${axis.toUpperCase()}`] = v;
      document.getElementById(`anim-speed-${axis}-val`).textContent = v.toFixed(1);
    });
  }

  scene.onUpdate((dt) => {
    if (anim.playing && currentModel) {
      currentModel.rotation.x += dt * anim.speedX;
      currentModel.rotation.y += dt * anim.speedY;
      currentModel.rotation.z += dt * anim.speedZ;
    }
  });

  // ── Shader controls ───────────────────────────────────────────────────────
  document.getElementById('tile-scale').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    document.getElementById('tile-scale-val').textContent = v.toFixed(2);
    if (streamMaterial) streamMaterial.uniforms.uTileScale.value = v;
  });
  document.getElementById('blend-sharp').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    document.getElementById('blend-sharp-val').textContent = v.toFixed(1);
    if (streamMaterial) streamMaterial.uniforms.uBlendSharp.value = v;
  });
  scene.onUpdate((dt) => {
    if (streamMaterial) {
      streamMaterial.uniforms.uTime.value += dt;
      // VideoTexture in a ShaderMaterial doesn't auto-update — force it every frame
      const tex = streamMaterial.uniforms.uVideoTexture.value;
      if (tex?.isVideoTexture) tex.needsUpdate = true;
    }
  });

  // ── Stream manager ────────────────────────────────────────────────────────
  const client = new WorkerClient();
  const streamManager = new StreamManager(client);
  const streamPanel = new StreamPanel();

  streamManager.onTextureChange((texture) => {
    if (streamMaterial) swapTexture(streamMaterial, texture);
  });

  streamManager.onStreamsUpdate((streams) => {
    streamPanel.renderStreams(streams);
    if (streamManager.activeId) streamPanel.setActiveStream(streamManager.activeId);
  });

  streamPanel.onStreamSelect((stream) => {
    streamManager.activate(stream.id);
    streamPanel.setActiveStream(stream.id);
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  await loadAndApplyModel(MODELS[0]);
  streamManager.startPolling();
  scene.start();
  loadingOverlay.classList.add('hidden');
}

function createProceduralModel(modelDef) {
  const placeholder = new THREE.MeshStandardMaterial();
  const group = new THREE.Group();

  if (modelDef.geo === 'sphere') {
    group.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), placeholder));
  } else if (modelDef.geo === 'torus') {
    group.add(new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.35, 64, 64), placeholder));
  } else if (modelDef.geo === 'cone') {
    group.add(new THREE.Mesh(new THREE.ConeGeometry(1, 2, 64), placeholder));
  } else if (modelDef.geo === 'tower') {
    // Stacked tower: box base, cylinder middle, cone roof
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.6), placeholder);
    base.position.y = -0.6;
    group.add(base);
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 1.2, 32), placeholder);
    mid.position.y = 0.4;
    group.add(mid);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.8, 32), placeholder);
    roof.position.y = 1.4;
    group.add(roof);
  } else if (modelDef.geo === 'molecule') {
    // Central sphere with 6 smaller spheres on axes, connected by thin cylinders
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
  } else {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), placeholder));
  }

  return { model: group, boundingBox: new THREE.Box3().setFromObject(group) };
}

main().catch((err) => {
  console.error('Fatal:', err);
  const o = document.getElementById('loading-overlay');
  if (o) {
    o.querySelector('.loading-text').textContent = 'Failed to load — check console';
    o.querySelector('.loading-spinner').style.display = 'none';
  }
});
