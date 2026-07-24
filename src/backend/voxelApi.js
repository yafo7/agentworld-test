// Voxel backend API client. Manual Studio sync is intentionally separate.

const API_BASE = '/api/voxel';
export const DEFAULT_VOXEL_TIMEOUT_MS = 300000;

export class VoxelApiError extends Error {
  constructor(message, {
    code = 'VOXEL_API_ERROR',
    status = null,
    detail = null,
    timing = null,
    operation = null,
    cause = null,
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'VoxelApiError';
    this.code = code;
    this.status = status;
    this.detail = detail;
    this.timing = timing;
    this.operation = operation;
  }
}

function timeoutSignal(timeoutMs) {
  return AbortSignal.timeout(Math.max(1, Number(timeoutMs) || DEFAULT_VOXEL_TIMEOUT_MS));
}

function errorFromData(data, { status = null, operation, fallback }) {
  const code = data?.errorCode || data?.error || fallback;
  const message = data?.message || data?.errorDetail?.message || code;
  return new VoxelApiError(message, {
    code,
    status,
    detail: data?.errorDetail || null,
    timing: data?.timing || data?.errorDetail?.timing || null,
    operation,
  });
}

async function responseError(response, operation, fallback) {
  const text = await response.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (data) return errorFromData(data, { status: response.status, operation, fallback });
  return new VoxelApiError(
    `HTTP ${response.status}${text ? `: ${text.slice(0, 240)}` : ''}`,
    { code: fallback, status: response.status, operation }
  );
}

async function request(url, init, operation) {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error instanceof VoxelApiError) throw error;
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new VoxelApiError(
      timedOut ? `${operation} timed out` : `${operation} request failed: ${error?.message || error}`,
      { code: timedOut ? 'VOXEL_API_TIMEOUT' : 'VOXEL_API_NETWORK_ERROR', operation, cause: error }
    );
  }
}

function jsonBody(value) {
  return { 'Content-Type': 'application/json', body: JSON.stringify(value) };
}

/** Generate one model via the backend SSE endpoint. */
export async function generateModel(
  description,
  provider = 'fireworks',
  mode = 'standard',
  { model = null, materialTags = null, timeoutMs = DEFAULT_VOXEL_TIMEOUT_MS } = {}
) {
  const operation = 'generateModel';
  const body = { description, provider, mode };
  if (model) body.model = model;
  if (materialTags) body.materialTags = materialTags;
  const payload = jsonBody(body);
  const response = await request(`${API_BASE}/api/generate/model`, {
    method: 'POST',
    headers: payload['Content-Type'] ? { 'Content-Type': payload['Content-Type'] } : {},
    body: payload.body,
    signal: timeoutSignal(timeoutMs),
  }, operation);
  if (!response.ok) throw await responseError(response, operation, 'MODEL_GENERATION_FAILED');

  const text = await response.text();
  let modelJson = null;
  let rawCode = '';
  let timing = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('data:')) continue;
    let event;
    try { event = JSON.parse(line.trim().replace(/^data:\s*/, '')); } catch { continue; }
    if (event.stage === 'error' || event.error || event.errorCode) {
      throw errorFromData(event, { operation, fallback: 'MODEL_GENERATION_FAILED' });
    }
    if (event.done || event.stage === 'result') {
      modelJson = event.modelJson;
      rawCode = event.rawCode || '';
      timing = event.timing || null;
    }
  }
  if (!modelJson) {
    throw new VoxelApiError('No modelJson in response', { code: 'MODEL_RESULT_MISSING', operation, timing });
  }
  return { modelJson, rawCode, metadata: { provider, model, mode, timing } };
}

/** Generate an animation motion plan for a model. */
export async function generateAnimation(
  modelJson,
  description,
  duration = 2,
  provider = 'fireworks',
  emitParticles = false,
  { timeoutMs = DEFAULT_VOXEL_TIMEOUT_MS } = {}
) {
  const operation = 'generateAnimation';
  const response = await request(`${API_BASE}/api/generate/animation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'quick', modelJson, description, duration, provider, emitParticles }),
    signal: timeoutSignal(timeoutMs),
  }, operation);
  if (!response.ok) throw await responseError(response, operation, 'ANIMATION_GENERATION_FAILED');
  const data = await response.json();
  if (!data.ok || !data.plan) throw errorFromData(data, { operation, fallback: 'ANIMATION_RESULT_MISSING' });
  return { plan: data.plan, timing: data.timing || null };
}

/** Batch model generation. Kept for legacy tools; gameplay uses semantic adapters. */
export async function generateBatch(
  descriptions,
  provider = 'fireworks',
  mode = 'standard',
  { model = null, timeoutMs = 600000 } = {}
) {
  const operation = 'generateBatch';
  const body = { descriptions, provider, mode };
  if (model) body.model = model;
  const response = await request(`${API_BASE}/api/generate/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: timeoutSignal(timeoutMs),
  }, operation);
  if (!response.ok) throw await responseError(response, operation, 'BATCH_GENERATION_FAILED');
  return response.json();
}

/** Refine an AI-generated model through /api/refine/model. */
export async function refineModel(
  modelJson,
  description,
  provider = 'fireworks',
  { refModelJson = null, materialTags = null, timeoutMs = DEFAULT_VOXEL_TIMEOUT_MS } = {}
) {
  const operation = 'refineModel';
  const body = { modelJson, description, provider };
  if (refModelJson) body.refModelJson = refModelJson;
  if (materialTags) body.materialTags = materialTags;
  const response = await request(`${API_BASE}/api/refine/model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: timeoutSignal(timeoutMs),
  }, operation);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw errorFromData(data, {
    status: response.status,
    operation,
    fallback: 'REFINE_FAILED',
  });
  return { modelJson: data.modelJson, rawCode: data.rawCode, timing: data.timing || null };
}

/** Mount a generated or existing part through /api/mount. */
export async function mountModel(
  primary,
  secondary,
  description,
  provider = 'deepseek',
  { timeoutMs = DEFAULT_VOXEL_TIMEOUT_MS } = {}
) {
  const operation = 'mountModel';
  const body = { primary, secondary, provider };
  if (description != null && description !== '') body.description = description;
  const response = await request(`${API_BASE}/api/mount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: timeoutSignal(timeoutMs),
  }, operation);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw errorFromData(data, {
    status: response.status,
    operation,
    fallback: 'MOUNT_FAILED',
  });
  return { modelJson: data.modelJson, mountPlan: data.mountPlan, timing: data.timing || null };
}
