import { StreamRegistry } from './StreamRegistry.js';

const POLL_MS = 10_000;

export class StreamManager {
  constructor(workerClient) {
    this._client = workerClient;
    this._streams = [];
    this._activeId = null;
    this._onTextureChange = null;
    this._onStreamsUpdate = null;
    this._pollTimer = null;

    this._registry = new StreamRegistry();
    this._registry.onDisconnect((streamId) => {
      if (streamId === this._activeId) {
        console.log('StreamManager: reconnecting', streamId);
        this._activeId = null;
        setTimeout(() => this.activate(streamId), 2000);
      }
    });
  }

  onTextureChange(fn) { this._onTextureChange = fn; }
  onStreamsUpdate(fn) { this._onStreamsUpdate = fn; }
  get streams()  { return this._streams; }
  get activeId() { return this._activeId; }

  startPolling() {
    this._poll();
    this._pollTimer = setInterval(() => this._poll(), POLL_MS);
  }

  async _poll() {
    try {
      const streams = await this._client.getLiveInputs();
      this._streams = streams;
      this._onStreamsUpdate?.(streams);

      // Auto-activate first connected stream if nothing is active
      if (!this._activeId) {
        const live = streams.find((s) => s.connected);
        if (live) this.activate(live.id);
      }
    } catch (err) {
      console.warn('StreamManager poll error:', err.message);
    }
  }

  async activate(streamId) {
    const stream = this._streams.find((s) => s.id === streamId);
    if (!stream) { console.warn('StreamManager: unknown id', streamId); return; }

    this._activeId = streamId;
    const url = stream.whepUrl ?? stream.hlsUrl;
    if (!url) { console.warn('StreamManager: no playback URL for', streamId); return; }

    try {
      const texture = await this._registry.getTexture(streamId, url);
      if (this._activeId === streamId) this._onTextureChange?.(texture, stream);
    } catch (err) {
      console.error('StreamManager: failed to load', streamId, err);
    }
  }

  dispose() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._registry.dispose();
  }
}
