/**
 * Client-side store mapping streamId → THREE.VideoTexture (or null while loading).
 * Keeps track of which StreamPlayer instances are alive so they can be reused
 * and properly disposed.
 */
import { StreamPlayer } from './StreamPlayer.js';

export class StreamRegistry {
  constructor() {
    // streamId → { player: StreamPlayer, texture: VideoTexture|null }
    this._players = new Map();
    this._onDisconnect = null;
  }

  /** Called with streamId when a player's connection drops. */
  onDisconnect(fn) { this._onDisconnect = fn; }

  async getTexture(streamId, url) {
    if (this._players.has(streamId)) {
      const entry = this._players.get(streamId);
      if (entry.texture) return entry.texture;
      return entry.player.load();
    }

    const player = new StreamPlayer(url);

    // Hook WHEP disconnect so we can evict the dead entry and reconnect
    if (player._whep) {
      player._whep.onDisconnect(() => {
        console.warn('StreamRegistry: player disconnected, evicting', streamId);
        this.release(streamId);
        this._onDisconnect?.(streamId);
      });
    }

    this._players.set(streamId, { player, texture: null });

    const texture = await player.load();

    // Re-attach disconnect hook after load (WhepPlayer._connect creates _pc inside load)
    if (player._whep) {
      player._whep.onDisconnect(() => {
        console.warn('StreamRegistry: player disconnected, evicting', streamId);
        this.release(streamId);
        this._onDisconnect?.(streamId);
      });
    }

    if (this._players.has(streamId)) {
      this._players.get(streamId).texture = texture;
    }
    return texture;
  }

  /**
   * Stop and remove a single player.
   */
  release(streamId) {
    const entry = this._players.get(streamId);
    if (entry) {
      entry.player.dispose();
      this._players.delete(streamId);
    }
  }

  /**
   * Stop all players except the one with keepId.
   */
  releaseAllExcept(keepId) {
    for (const [id, entry] of this._players) {
      if (id !== keepId) {
        entry.player.dispose();
        this._players.delete(id);
      }
    }
  }

  dispose() {
    for (const entry of this._players.values()) {
      entry.player.dispose();
    }
    this._players.clear();
  }
}
