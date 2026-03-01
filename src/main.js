import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager.js';
import { CameraController } from './scene/CameraController.js';
import { loadModel, applyMaterialToModel, createFallbackBox } from './models/ModelLoader.js';
import { createStreamMaterial, swapTexture, updateBounds } from './materials/StreamMaterial.js';
import { StreamManager } from './streams/StreamManager.js';
import { WorkerClient } from './api/WorkerClient.js';
import { StreamPanel } from './ui/StreamPanel.js';
import { ModelSwitcher } from './ui/ModelSwitcher.js';

const MODELS = [
  { name: 'Box',    url: null },
  { name: 'Sphere', url: null, geo: 'sphere' },
  { name: 'Torus',  url: null, geo: 'torus' },
  { name: 'Cone',   url: null, geo: 'cone' },
  // { name: 'Custom', url: '/models/my-model.glb' },
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
      try { ({ model, boundingBox } = await loadModel(modelDef.url)); }
      catch { ({ model, boundingBox } = createFallbackBox()); }
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
  let geometry;
  if (modelDef.geo === 'sphere') geometry = new THREE.SphereGeometry(1, 64, 32);
  else if (modelDef.geo === 'torus') geometry = new THREE.TorusGeometry(0.8, 0.35, 64, 64);
  else if (modelDef.geo === 'cone') geometry = new THREE.ConeGeometry(1, 2, 64);
  else geometry = new THREE.BoxGeometry(2, 2, 2);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
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
