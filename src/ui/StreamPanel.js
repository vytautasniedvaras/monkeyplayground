import { StatusIndicator } from './StatusIndicator.js';

export class StreamPanel {
  constructor() {
    this._indicator = new StatusIndicator();
    this._onSelect = null;
    this._activeId = null;
    this._listEl = document.getElementById('stream-list');
  }

  onStreamSelect(fn) { this._onSelect = fn; }

  setActiveStream(id) {
    this._activeId = id;
    this._listEl.querySelectorAll('.stream-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.id === id);
    });
  }

  renderStreams(streams) {
    if (!streams.length) {
      this._listEl.innerHTML = '<p style="color:#444;font-size:12px;">No live inputs found. Start streaming in OBS.</p>';
      return;
    }

    this._listEl.innerHTML = '';

    streams.forEach((stream) => {
      const item = document.createElement('div');
      item.className = 'stream-item';
      item.dataset.id = stream.id;
      if (stream.id === this._activeId) item.classList.add('active');

      const badge = this._indicator.getOrCreate(stream.id);
      this._indicator.setStatus(stream.id, stream.connected ? 'live' : 'offline');

      item.innerHTML = `
        <div class="stream-item-name">${escHtml(stream.name)}</div>
        <div class="stream-item-url">${escHtml(stream.whepUrl ?? stream.hlsUrl ?? '')}</div>
        <div class="stream-item-status"></div>
      `;
      item.querySelector('.stream-item-status').appendChild(badge);

      item.addEventListener('click', () => {
        if (!stream.connected) return;
        this._onSelect?.(stream);
        this.setActiveStream(stream.id);
      });

      this._listEl.appendChild(item);
    });
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
