// Voxel Studio Backend — API client for 3D model + animation generation.

const API_BASE = 'https://voxel-studio-backend.zeabur.app';
const PROVIDERS = ['fireworks', 'glm', 'gpt', 'deepseek'];

/**
 * Generate a single 3D model via SSE streaming.
 * Tries providers in fallback order on failure.
 *
 * @param {string} description — text description of the model
 * @param {string} [provider='fireworks']
 * @returns {Promise<{modelJson: object, rawCode: string}>}
 */
export async function generateModel(description, provider = 'fireworks') {
  const fallback = [...PROVIDERS];
  if (fallback[0] !== provider) fallback.unshift(provider);

  let lastError = null;
  for (const p of fallback) {
    try {
      const resp = await fetch(`${API_BASE}/api/generate/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, provider: p }),
      });

      if (resp.status === 429) {
        console.warn(`[Voxel] ${p} rate limited, trying next...`);
        continue;
      }
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${errText}`);
      }

      const text = await resp.text();
      let modelJson = null;
      let rawCode = '';

      for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        const event = JSON.parse(line.slice(5).trim());
        if (event.stage === 'error' || event.error) {
          throw new Error(event.error || 'Unknown generation error');
        }
        if (event.done || event.stage === 'result') {
          modelJson = event.modelJson;
          rawCode = event.rawCode || '';
        }
      }

      if (!modelJson) throw new Error('No modelJson in response');
      return { modelJson, rawCode };
    } catch (err) {
      lastError = err;
      if (err.message.includes('rate') || err.message.includes('429')) continue;
      console.warn(`[Voxel] ${p} failed: ${err.message}, trying next...`);
    }
  }

  throw lastError || new Error('All providers failed');
}

/**
 * Generate an animation motion plan for a model.
 *
 * @param {object} modelJson
 * @param {string} description — animation description
 * @param {number} [duration=2.0]
 * @param {string} [provider='fireworks']
 * @returns {Promise<{plan: object}>}
 */
export async function generateAnimation(modelJson, description, duration = 2.0, provider = 'fireworks') {
  const fallback = [...PROVIDERS];
  if (fallback[0] !== provider) fallback.unshift(provider);

  let lastError = null;
  for (const p of fallback) {
    try {
      const resp = await fetch(`${API_BASE}/api/generate/animation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelJson, description, duration, provider: p }),
      });

      if (resp.status === 429) {
        console.warn(`[Voxel] ${p} anim rate limited, trying next...`);
        continue;
      }
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${errText}`);
      }

      const data = await resp.json();
      if (!data.ok || !data.plan) {
        throw new Error('No plan in animation response');
      }
      return { plan: data.plan };
    } catch (err) {
      lastError = err;
      if (err.message.includes('rate') || err.message.includes('429')) continue;
      console.warn(`[Voxel] ${p} anim failed: ${err.message}, trying next...`);
    }
  }

  throw lastError || new Error('All animation providers failed');
}

/**
 * Batch generate multiple models (JSON, not SSE).
 */
export async function generateBatch(descriptions, provider = 'fireworks') {
  const resp = await fetch(`${API_BASE}/api/generate/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descriptions, provider }),
  });

  if (!resp.ok) {
    throw new Error(`Batch generation failed: HTTP ${resp.status}`);
  }

  const data = await resp.json();
  return data;
}
