import * as THREE from 'three';

export class WhepPlayer {
  constructor(whepUrl) {
    this.whepUrl = whepUrl;
    this.texture = null;
    this._pc = null;
    this._video = null;
    this._readyPromise = null;
  }

  /** Called when the peer connection drops unexpectedly. */
  onDisconnect(fn) { this._onDisconnect = fn; }

  load() {
    if (this._readyPromise) return this._readyPromise;
    this._readyPromise = this._connect();
    return this._readyPromise;
  }

  async _connect() {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
      bundlePolicy: 'max-bundle',
    });
    this._pc = pc;

    // Set up ontrack BEFORE anything else so we never miss it
    const trackPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('WHEP: timed out waiting for video track')),
        15000
      );
      pc.ontrack = (event) => {
        console.log('WHEP: got track', event.track.kind, event.streams.length);
        const stream = event.streams?.[0];
        if (stream) {
          clearTimeout(timeout);
          resolve(stream);
        }
      };
    });

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.oniceconnectionstatechange = () => {
      console.log('WHEP ICE state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        this._onDisconnect?.();
      }
    };
    pc.onconnectionstatechange = () => {
      console.log('WHEP connection state:', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this._onDisconnect?.();
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for ICE gathering (max 4 s)
    await new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') resolve();
      });
      setTimeout(resolve, 4000);
    });

    console.log('WHEP: sending offer to', this.whepUrl);

    const resp = await fetch(this.whepUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp', 'Accept': 'application/sdp' },
      body: pc.localDescription.sdp,
    });

    console.log('WHEP: response status', resp.status);

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`WHEP ${resp.status}: ${body}`);
    }

    const answerSdp = await resp.text();
    console.log('WHEP: got answer, setting remote description');
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    // Now wait for the track (listener was already attached above)
    const mediaStream = await trackPromise;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.style.display = 'none';
    video.srcObject = mediaStream;
    document.body.appendChild(video);
    this._video = video;

    await video.play().catch((e) => console.warn('WHEP play():', e));

    this.texture = new THREE.VideoTexture(video);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    // Stall detector — if currentTime stops advancing for 8s, reconnect
    this._lastTime = -1;
    this._stallCount = 0;
    this._healthTimer = setInterval(() => {
      if (!this._video) return;
      if (this._video.currentTime === this._lastTime && !this._video.paused) {
        this._stallCount++;
        if (this._stallCount >= 2) {
          console.warn('WHEP: video stalled, triggering reconnect');
          clearInterval(this._healthTimer);
          this._onDisconnect?.();
        }
      } else {
        this._stallCount = 0;
      }
      this._lastTime = this._video.currentTime;
    }, 4000);

    console.log('WHEP: texture ready');
    return this.texture;
  }

  get isPlaying() {
    return this._video ? !this._video.paused : false;
  }

  dispose() {
    if (this._healthTimer) { clearInterval(this._healthTimer); this._healthTimer = null; }
    if (this._pc) { this._pc.close(); this._pc = null; }
    if (this._video) {
      this._video.pause();
      this._video.srcObject = null;
      this._video.remove();
      this._video = null;
    }
    if (this.texture) { this.texture.dispose(); this.texture = null; }
    this._readyPromise = null;
  }
}
