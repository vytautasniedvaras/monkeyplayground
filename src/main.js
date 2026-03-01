import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager.js';
import { CameraController } from './scene/CameraController.js';
import { ObjectManager } from './scene/ObjectManager.js';
import { DragControls } from './scene/DragControls.js';
import { createStreamMaterial, swapTexture } from './materials/StreamMaterial.js';
import { StreamManager } from './streams/StreamManager.js';
import { WorkerClient } from './api/WorkerClient.js';
import { StreamPanel } from './ui/StreamPanel.js';

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
  ctx.fillStyle = '#556'; ctx.fillRect(0, 0, 2, 2);
  const fallbackTexture = new THREE.CanvasTexture(fallbackCanvas);

  // ── Base material (used as template for cloning) ────────────────────────
  const defaultBox = new THREE.Box3(
    new THREE.Vector3(-1, -1, -1),
    new THREE.Vector3(1, 1, 1)
  );
  const streamMaterial = createStreamMaterial(fallbackTexture, defaultBox);

  // ── Object manager + drag controls ──────────────────────────────────────
  const objectManager = new ObjectManager(scene.scene);
  const dragControls = new DragControls(
    scene.camera,
    scene.renderer.domElement,
    objectManager,
    camera.controls
  );

  dragControls.onSpawn((type, position) => {
    objectManager.spawn(type, position, streamMaterial).catch((err) => {
      console.error('Failed to spawn:', err);
    });
  });

  // ── Shape palette ───────────────────────────────────────────────────────
  const shapeBtns = document.querySelectorAll('.shape-btn');
  shapeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      shapeBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      dragControls.setBrush(btn.dataset.shape);
    });
  });

  document.getElementById('clear-all').addEventListener('click', () => {
    objectManager.removeAll();
    dragControls.deselect();
  });

  // ── Selected object controls ──────────────────────────────────────────
  const selectedPanel = document.getElementById('selected-controls');
  const selectedNameEl = document.getElementById('selected-name');
  const selectedScaleSlider = document.getElementById('selected-scale');
  const selectedScaleVal = document.getElementById('selected-scale-val');
  const selectedPosXSlider = document.getElementById('selected-pos-x');
  const selectedPosXVal = document.getElementById('selected-pos-x-val');
  const selectedPosYSlider = document.getElementById('selected-pos-y');
  const selectedPosYVal = document.getElementById('selected-pos-y-val');
  const selectedPosZSlider = document.getElementById('selected-pos-z');
  const selectedPosZVal = document.getElementById('selected-pos-z-val');

  function updateSelectedUI(obj) {
    if (!obj) {
      selectedPanel.classList.remove('visible');
      return;
    }
    selectedPanel.classList.add('visible');
    selectedNameEl.textContent = obj.userData.shapeType || 'object';
    selectedScaleSlider.value = obj.scale.x;
    selectedScaleVal.textContent = obj.scale.x.toFixed(2);
    selectedPosXSlider.value = obj.position.x;
    selectedPosXVal.textContent = obj.position.x.toFixed(1);
    selectedPosYSlider.value = obj.position.y;
    selectedPosYVal.textContent = obj.position.y.toFixed(1);
    selectedPosZSlider.value = obj.position.z;
    selectedPosZVal.textContent = obj.position.z.toFixed(1);
  }

  dragControls.onSelect((obj) => updateSelectedUI(obj));

  selectedScaleSlider.addEventListener('input', (e) => {
    const obj = dragControls.getSelected();
    if (!obj) return;
    const v = parseFloat(e.target.value);
    obj.scale.setScalar(v);
    selectedScaleVal.textContent = v.toFixed(2);
  });

  for (const axis of ['x', 'y', 'z']) {
    document.getElementById(`selected-pos-${axis}`).addEventListener('input', (e) => {
      const obj = dragControls.getSelected();
      if (!obj) return;
      const v = parseFloat(e.target.value);
      obj.position[axis] = v;
      document.getElementById(`selected-pos-${axis}-val`).textContent = v.toFixed(1);
    });
  }

  document.getElementById('delete-selected').addEventListener('click', () => {
    const obj = dragControls.getSelected();
    if (!obj) return;
    objectManager.remove(obj);
    dragControls.deselect();
  });

  // ── Animation controls ──────────────────────────────────────────────────
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
    if (anim.playing) {
      for (const obj of objectManager.getAll()) {
        obj.rotation.x += dt * anim.speedX;
        obj.rotation.y += dt * anim.speedY;
        obj.rotation.z += dt * anim.speedZ;
      }
    }
  });

  // ── Shader controls ───────────────────────────────────────────────────────
  document.getElementById('tile-scale').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    document.getElementById('tile-scale-val').textContent = v.toFixed(2);
    streamMaterial.uniforms.uTileScale.value = v;
    for (const mat of objectManager.getMaterials()) {
      mat.uniforms.uTileScale.value = v;
    }
  });
  document.getElementById('blend-sharp').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    document.getElementById('blend-sharp-val').textContent = v.toFixed(1);
    streamMaterial.uniforms.uBlendSharp.value = v;
    for (const mat of objectManager.getMaterials()) {
      mat.uniforms.uBlendSharp.value = v;
    }
  });

  scene.onUpdate((dt) => {
    // Update time and video texture for base material
    streamMaterial.uniforms.uTime.value += dt;
    const tex = streamMaterial.uniforms.uVideoTexture.value;
    if (tex?.isVideoTexture) tex.needsUpdate = true;

    // Update time for all cloned materials
    for (const mat of objectManager.getMaterials()) {
      mat.uniforms.uTime.value = streamMaterial.uniforms.uTime.value;
      const t = mat.uniforms.uVideoTexture.value;
      if (t?.isVideoTexture) t.needsUpdate = true;
    }
  });

  // ── Stream manager ────────────────────────────────────────────────────────
  const client = new WorkerClient();
  const streamManager = new StreamManager(client);
  const streamPanel = new StreamPanel();

  streamManager.onTextureChange((texture) => {
    swapTexture(streamMaterial, texture);
    for (const mat of objectManager.getMaterials()) {
      swapTexture(mat, texture);
    }
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
  streamManager.startPolling();
  scene.start();
  loadingOverlay.classList.add('hidden');
}

main().catch((err) => {
  console.error('Fatal:', err);
  const o = document.getElementById('loading-overlay');
  if (o) {
    o.querySelector('.loading-text').textContent = 'Failed to load — check console';
    o.querySelector('.loading-spinner').style.display = 'none';
  }
});
