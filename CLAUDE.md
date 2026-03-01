# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stream Playground — a Three.js app that projects live video streams (from Cloudflare Stream) onto 3D models using triplanar mapping. It has two independently deployed parts: a Vite frontend and a Cloudflare Worker backend.

## Commands

- `npm run dev` — Start Vite dev server on port 5173
- `npm run build` — Production build to `dist/`
- `npm run worker:dev` — Start Cloudflare Worker locally on port 8787
- `npm run worker:deploy` — Deploy worker to Cloudflare

Both dev servers should run simultaneously during development. The frontend talks to the worker at `VITE_WORKER_URL` (defaults to `http://localhost:8787`).

## Architecture

### Frontend (Vite + Three.js)

Entry: `index.html` → `src/main.js`. All UI is vanilla JS (no framework). Styles are inline in `index.html`.

**Scene layer** (`src/scene/`): `SceneManager` owns the Three.js renderer, scene, camera, lights, and render loop. `CameraController` handles orbit controls. The render loop uses `onUpdate(fn)` callbacks for per-frame logic.

**Materials/Shaders** (`src/materials/`, `src/shaders/`): Custom `ShaderMaterial` with triplanar projection. GLSL files (`.vert`, `.frag`) are imported via `vite-plugin-glsl`. The shader maps a video texture onto any geometry using world-space normals for blending, with `uTileScale` and `uBlendSharp` uniforms exposed as UI sliders.

**Streaming layer** (`src/streams/`): Three-tier design:
- `StreamManager` — orchestrates polling, auto-activation, texture change events
- `StreamRegistry` — caches `StreamPlayer` instances per stream ID, handles disconnect/eviction
- `StreamPlayer` — protocol adapter: detects WHEP (WebRTC) vs HLS from the URL, delegates to `WhepPlayer` or uses hls.js directly

WHEP playback (`WhepPlayer`) does SDP exchange with Cloudflare's WebRTC endpoint and creates a `VideoTexture` from the received MediaStream. Includes stall detection (8s timeout) and automatic reconnection.

**API client** (`src/api/WorkerClient.js`): Single method `getLiveInputs()` that fetches `GET /api/live` from the worker. Base URL is configured via `VITE_WORKER_URL` env var.

**UI** (`src/ui/`): `StreamPanel` renders the stream list, `ModelSwitcher` cycles through procedural geometries (box, sphere, torus) or custom GLB models.

### Worker (Cloudflare Workers)

Entry: `worker/index.js`. Single route: `GET /api/live` → `worker/routes/liveInputs.js`.

Calls Cloudflare Stream API to list all live inputs with status and playback URLs. Requires `CF_ACCOUNT_ID` and `CF_STREAM_TOKEN` secrets (set via `wrangler secret put`). Uses KV namespace `STREAMS_KV` (bound in `wrangler.toml`).

## Key Conventions

- ES modules throughout (`"type": "module"`)
- No TypeScript, no build step for the worker
- Shader files use `.vert`/`.frag` extensions, imported as strings via vite-plugin-glsl
- Video textures require manual `needsUpdate = true` each frame in ShaderMaterial (unlike MeshStandardMaterial)
- Frontend deploys to Vercel (`vercel.json`), worker deploys to Cloudflare (`wrangler.toml`)
