/**
 * Creates and manages status badge DOM elements.
 * Statuses: 'checking' | 'live' | 'offline' | 'error' | 'unknown'
 */
export class StatusIndicator {
  constructor() {
    this._badges = new Map(); // streamId → element
  }

  /**
   * Create (or update) a badge element for a stream.
   * Returns the DOM element to be inserted into the parent.
   */
  getOrCreate(streamId) {
    if (!this._badges.has(streamId)) {
      const el = document.createElement('span');
      el.className = 'status-badge checking';
      el.textContent = '…';
      this._badges.set(streamId, el);
    }
    return this._badges.get(streamId);
  }

  setStatus(streamId, status) {
    const el = this._badges.get(streamId);
    if (!el) return;

    el.className = `status-badge ${status}`;
    el.textContent =
      status === 'live'     ? 'LIVE'    :
      status === 'offline'  ? 'OFFLINE' :
      status === 'error'    ? 'ERROR'   :
      status === 'checking' ? '…'       : '?';
  }

  remove(streamId) {
    this._badges.delete(streamId);
  }

  dispose() {
    this._badges.clear();
  }
}
