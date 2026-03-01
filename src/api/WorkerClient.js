const BASE_URL = import.meta.env.VITE_WORKER_URL ?? 'http://localhost:8787';

export class WorkerClient {
  constructor(baseUrl = BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async getLiveInputs() {
    const resp = await fetch(`${this.baseUrl}/api/live`);
    if (!resp.ok) throw new Error(`GET /api/live failed: ${resp.status}`);
    const data = await resp.json();
    return data.streams ?? [];
  }
}
