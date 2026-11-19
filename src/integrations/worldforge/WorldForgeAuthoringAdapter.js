import { WorldAuthoringPort } from '../../ports/WorldAuthoringPort.js';

async function responseJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `worldforge_http_${response.status}`);
    error.status = response.status;
    error.details = body;
    throw error;
  }
  return body;
}

export class WorldForgeAuthoringAdapter extends WorldAuthoringPort {
  constructor({ baseUrl = 'http://127.0.0.1:8797', fetcher = globalThis.fetch?.bind(globalThis) } = {}) {
    super();
    if (!fetcher) throw new TypeError('WorldForgeAuthoringAdapter requires fetch');
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.fetcher = fetcher;
  }

  async preview({ mapId, steps = [] }) {
    if (!mapId) throw new TypeError('WorldForge preview mapId is required');
    if (!Array.isArray(steps) || steps.length === 0) throw new TypeError('WorldForge preview steps are required');
    const suggestions = [];
    let operations = [];
    for (const step of steps) {
      const mode = step.mode === 'generate' ? 'generate' : 'refine';
      const body = {
        prompt: String(step.prompt || '').trim(),
        provider: 'gpt',
        ...(operations.length > 0 ? { baseOperations: operations } : {}),
      };
      const response = await this.fetcher(
        `${this.baseUrl}/api/editor/maps/${encodeURIComponent(mapId)}/${mode}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const result = await responseJson(response);
      const suggestion = result.suggestion || {};
      const nextOperations = Array.isArray(suggestion.operations) ? suggestion.operations : [];
      operations = mode === 'refine' && operations.length > 0
        ? [...operations, ...nextOperations]
        : [...nextOperations];
      suggestions.push(suggestion);
    }
    return Object.freeze({ mapId, operations: Object.freeze(operations), suggestions: Object.freeze(suggestions) });
  }

  async commit({ mapId, label = '奇异岛地图调整', operations = [] }) {
    if (!mapId) throw new TypeError('WorldForge commit mapId is required');
    if (!Array.isArray(operations) || operations.length === 0) throw new TypeError('WorldForge commit operations are required');
    const response = await this.fetcher(
      `${this.baseUrl}/api/editor/maps/${encodeURIComponent(mapId)}/transactions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ label, source: 'agent', operations }),
      },
    );
    return responseJson(response);
  }
}
