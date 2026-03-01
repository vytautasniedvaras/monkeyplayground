/**
 * Cycles through a list of model definitions and fires a callback when the
 * selected model changes.
 *
 * Each model entry: { name: string, url: string | null }
 * url === null means "use the procedural fallback box".
 */
export class ModelSwitcher {
  constructor(models) {
    this._models = models;
    this._index = 0;
    this._onChange = null;

    this._nameEl = document.getElementById('model-name');
    this._prevBtn = document.getElementById('model-prev');
    this._nextBtn = document.getElementById('model-next');

    this._prevBtn.addEventListener('click', () => this._step(-1));
    this._nextBtn.addEventListener('click', () => this._step(1));

    this._updateLabel();
  }

  onChange(fn) {
    this._onChange = fn;
  }

  get current() {
    return this._models[this._index];
  }

  _step(dir) {
    this._index = (this._index + dir + this._models.length) % this._models.length;
    this._updateLabel();
    this._onChange?.(this.current);
  }

  _updateLabel() {
    if (this._nameEl) {
      this._nameEl.textContent = this._models[this._index]?.name ?? '—';
    }
  }
}
