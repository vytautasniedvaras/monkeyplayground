import Hls from 'hls.js';
import * as THREE from 'three';
import { WhepPlayer } from './WhepPlayer.js';

const MAX_RETRIES = 6;
const RETRY_DELAY_MS = 3000;

export class StreamPlayer {
  constructor(streamUrl) {
    // Detect WHEP (WebRTC) vs HLS
    const url = new URL(streamUrl);
    url.searchParams.delete('protocol'); // strip LL-HLS beta param
    this._isWhep = url.pathname.includes('webRTC');
    this.hlsUrl = url.toString();

    if (this._isWhep) {
      this._whep = new WhepPlayer(this.hlsUrl);
    }
    this.texture = null;
    this._video = null;
    this._hls = null;
    this._readyPromise = null;
  }

  load() {
    if (this._readyPromise) return this._readyPromise;
    if (this._isWhep) {
      this._readyPromise = this._whep.load().then((tex) => {
        this.texture = tex;
        return tex;
      });
    } else {
      this._readyPromise = this._loadWithRetry(0);
    }
    return this._readyPromise;
  }

  async _loadWithRetry(attempt) {
    try {
      return await this._loadOnce();
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.warn(`StreamPlayer: retry ${attempt + 1}/${MAX_RETRIES} for ${this.hlsUrl}`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        // Tear down previous attempt before retrying
        this._destroyHls();
        return this._loadWithRetry(attempt + 1);
      }
      throw err;
    }
  }

  _loadOnce() {
    return new Promise((resolve, reject) => {
      // Reuse existing video element across retries
      if (!this._video) {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.style.display = 'none';
        document.body.appendChild(video);
        this._video = video;
      }

      const video = this._video;

      const onCanPlay = () => {
        video.removeEventListener('canplay', onCanPlay);
        video.play().catch(() => {});
        if (!this.texture) {
          this.texture = new THREE.VideoTexture(video);
          this.texture.colorSpace = THREE.SRGBColorSpace;
          this.texture.minFilter = THREE.LinearFilter;
          this.texture.magFilter = THREE.LinearFilter;
          this.texture.generateMipmaps = false;
        }
        resolve(this.texture);
      };

      video.addEventListener('canplay', onCanPlay);

      const onError = (err) => {
        video.removeEventListener('canplay', onCanPlay);
        reject(new Error(`StreamPlayer error for ${this.hlsUrl}: ${err}`));
      };

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 8,
        });
        hls.loadSource(this.hlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) onError(data.details);
        });
        this._hls = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = this.hlsUrl;
        video.addEventListener('error', () => onError(video.error?.message ?? 'unknown'));
      } else {
        reject(new Error('HLS is not supported in this browser'));
      }
    });
  }

  _destroyHls() {
    if (this._hls) {
      this._hls.destroy();
      this._hls = null;
    }
  }

  get isPlaying() {
    return this._video ? !this._video.paused && !this._video.ended : false;
  }

  dispose() {
    if (this._whep) {
      this._whep.dispose();
      this._whep = null;
    }
    this._destroyHls();
    if (this._video) {
      this._video.pause();
      this._video.src = '';
      this._video.remove();
      this._video = null;
    }
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
    this._readyPromise = null;
  }
}
