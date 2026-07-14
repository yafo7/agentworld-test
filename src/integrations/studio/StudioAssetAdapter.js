const DEFAULT_BASE_URL = '/studio';

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Studio HTTP ${response.status}`);
  return data;
}

export class StudioAssetAdapter {
  constructor({ baseUrl = DEFAULT_BASE_URL, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
  }

  async loadRuntime(assetId) {
    const response = await this.fetch(`${this.baseUrl}/api/assets/${encodeURIComponent(assetId)}/runtime`);
    return readJson(response);
  }

  async loadEdit(assetId) {
    const response = await this.fetch(`${this.baseUrl}/api/assets/${encodeURIComponent(assetId)}/edit`);
    return readJson(response);
  }

  async saveEdit(assetId, modelJson) {
    const response = await this.fetch(`${this.baseUrl}/api/assets/${encodeURIComponent(assetId)}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelJson }),
    });
    return readJson(response);
  }

  async publish(assetId) {
    const response = await this.fetch(`${this.baseUrl}/api/assets/${encodeURIComponent(assetId)}/publish`, {
      method: 'POST',
    });
    return readJson(response);
  }

  async history(assetId) {
    const response = await this.fetch(`${this.baseUrl}/api/assets/${encodeURIComponent(assetId)}/history`);
    return readJson(response);
  }
}

