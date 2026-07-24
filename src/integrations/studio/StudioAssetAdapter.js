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

  async loadOriginal(commit, folder) {
    const response = await this.fetch(`${this.baseUrl}/api/model/${encodeURIComponent(commit)}/${encodeURIComponent(folder)}`);
    return readJson(response);
  }

  async loadEdit(commit, folder) {
    const response = await this.fetch(`${this.baseUrl}/api/load-edited/${encodeURIComponent(commit)}/${encodeURIComponent(folder)}`);
    return readJson(response);
  }

  async saveEdit(commit, folder, modelJson, undoStack) {
    const response = await this.fetch(`${this.baseUrl}/api/save-edited`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commit, folder, modelJson, undoStack }),
    });
    return readJson(response);
  }

  async loadAnimations(commit, folder) {
    const response = await this.fetch(`${this.baseUrl}/api/animations/${encodeURIComponent(commit)}/${encodeURIComponent(folder)}`);
    return readJson(response);
  }
}
