import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

export const DEFAULT_LOCAL_LIBRARY_BODY_LIMIT = 8 * 1024 * 1024;
const ASSET_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

export class LocalLibraryError extends Error {
  constructor(message, { status = 400, code = 'INVALID_REQUEST' } = {}) {
    super(message);
    this.name = 'LocalLibraryError';
    this.status = status;
    this.code = code;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalText(value, field, maxLength) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new LocalLibraryError(`${field} must be a string of at most ${maxLength} characters`);
  }
  return value;
}

export function assertAssetId(value, field = 'id') {
  if (typeof value !== 'string' || !ASSET_ID_PATTERN.test(value)) {
    throw new LocalLibraryError(`${field} must contain only letters, numbers, underscores, or hyphens`);
  }
  return value;
}

export function validateModelRequest(body) {
  if (!isPlainObject(body)) throw new LocalLibraryError('Request body must be a JSON object');
  const id = assertAssetId(body.id);
  if (!isPlainObject(body.modelJson) || !Array.isArray(body.modelJson.nodes)) {
    throw new LocalLibraryError('modelJson must be a voxel model object with a nodes array');
  }
  return {
    id,
    name: optionalText(body.name, 'name', 200),
    description: optionalText(body.description, 'description', 4000),
    modelJson: body.modelJson,
  };
}

export function validateAnimationRequest(body) {
  if (!isPlainObject(body)) throw new LocalLibraryError('Request body must be a JSON object');
  const id = assertAssetId(body.id);
  const modelId = assertAssetId(body.modelId, 'modelId');
  if (!isPlainObject(body.plan) || Object.keys(body.plan).length === 0) {
    throw new LocalLibraryError('plan must be a non-empty animation object');
  }
  if (
    body.plan._duration != null
    && (!Number.isFinite(body.plan._duration) || body.plan._duration <= 0)
  ) {
    throw new LocalLibraryError('plan._duration must be a positive number');
  }
  return {
    id,
    modelId,
    name: optionalText(body.name, 'name', 200),
    type: optionalText(body.type, 'type', 64) || 'interaction',
    plan: body.plan,
  };
}

export function assertLocalLibraryWriteRequest(req) {
  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    throw new LocalLibraryError('Content-Type must be application/json', {
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
  }

  const fetchSite = String(req.headers?.['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    throw new LocalLibraryError('Cross-origin writes are not allowed', {
      status: 403,
      code: 'CROSS_ORIGIN_WRITE',
    });
  }

  const origin = req.headers?.origin;
  const host = req.headers?.host;
  if (origin && host) {
    let originHost = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new LocalLibraryError('Invalid Origin header', { status: 403, code: 'INVALID_ORIGIN' });
    }
    if (originHost !== host) {
      throw new LocalLibraryError('Cross-origin writes are not allowed', {
        status: 403,
        code: 'CROSS_ORIGIN_WRITE',
      });
    }
  }
}

export async function readJsonBody(req, { maxBytes = DEFAULT_LOCAL_LIBRARY_BODY_LIMIT } = {}) {
  const declaredLength = Number(req.headers?.['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new LocalLibraryError(`Request body exceeds ${maxBytes} bytes`, {
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  }

  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > maxBytes) {
      throw new LocalLibraryError(`Request body exceeds ${maxBytes} bytes`, {
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
      });
    }
    chunks.push(buffer);
  }

  try {
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new LocalLibraryError('Request body contains invalid JSON', {
      status: 400,
      code: 'INVALID_JSON',
    });
  }
}

async function atomicWriteJson(path, value) {
  await fs.mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, path);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

function assertWithin(root, candidate) {
  const relativePath = relative(root, candidate);
  if (relativePath.startsWith('..') || resolve(root, relativePath) !== candidate) {
    throw new LocalLibraryError('Resolved asset path is outside the generated library');
  }
  return candidate;
}

function activeLifecycle(existing, nextPath) {
  const prior = Array.isArray(existing?.lifecycle?.previousPaths)
    ? existing.lifecycle.previousPaths
    : [];
  if (existing?.path && existing.path !== nextPath) prior.unshift(existing.path);
  return {
    schemaVersion: 1,
    status: 'active',
    previousPaths: [...new Set(prior.filter((path) => path && path !== nextPath))],
  };
}

export class LocalLibraryStore {
  #writeQueue = Promise.resolve();

  constructor({ rootDir }) {
    if (!rootDir) throw new TypeError('LocalLibraryStore requires rootDir');
    this.generatedDir = resolve(rootDir, 'public/generated');
    this.modelsDir = resolve(this.generatedDir, 'models');
    this.animationsDir = resolve(this.generatedDir, 'animations');
    this.manifestPath = resolve(this.generatedDir, 'generated-library-manifest.json');
  }

  #enqueue(operation) {
    const result = this.#writeQueue.then(operation, operation);
    this.#writeQueue = result.catch(() => {});
    return result;
  }

  async #readManifest() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.manifestPath, 'utf8'));
      if (!Array.isArray(parsed)) throw new Error('manifest root must be an array');
      return parsed;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw new LocalLibraryError(`Generated library manifest is invalid: ${error.message}`, {
        status: 500,
        code: 'INVALID_MANIFEST',
      });
    }
  }

  async list() {
    return this.#enqueue(() => this.#readManifest());
  }

  async saveModel(input) {
    const request = validateModelRequest(input);
    return this.#enqueue(async () => {
      const manifest = await this.#readManifest();
      const existingIndex = manifest.findIndex((entry) => entry.assetId === request.id);
      const existing = existingIndex >= 0 ? manifest[existingIndex] : null;
      const path = `generated/models/${request.id}.json`;
      const modelToWrite = {
        ...request.modelJson,
        name: request.name || request.modelJson.name || request.id,
      };
      const now = Date.now();
      const animations = Array.isArray(existing?.animations) ? existing.animations : [];
      const entry = {
        assetId: request.id,
        name: request.name || modelToWrite.name,
        description: request.description,
        category: existing?.category || 'decor',
        tags: Array.isArray(modelToWrite.tags) ? modelToWrite.tags : [],
        hasIdleAnimation: animations.some((animation) => animation.type === 'idle'),
        animations,
        path,
        lifecycle: activeLifecycle(existing, path),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      const filePath = assertWithin(this.modelsDir, resolve(this.modelsDir, `${request.id}.json`));
      await atomicWriteJson(filePath, modelToWrite);
      if (existingIndex >= 0) manifest[existingIndex] = entry;
      else manifest.unshift(entry);
      await atomicWriteJson(this.manifestPath, manifest);
      return { ok: true, id: request.id, path };
    });
  }

  async saveAnimation(input) {
    const request = validateAnimationRequest(input);
    return this.#enqueue(async () => {
      const manifest = await this.#readManifest();
      const entry = manifest.find((item) => item.assetId === request.modelId);
      if (!entry) {
        throw new LocalLibraryError(`Model ${request.modelId} is not registered`, {
          status: 404,
          code: 'MODEL_NOT_FOUND',
        });
      }

      const path = `generated/animations/${request.id}.json`;
      const planToWrite = {
        ...request.plan,
        _modelId: request.modelId,
        _name: request.name || 'generated animation',
        _type: request.type,
      };
      const existingAnimations = Array.isArray(entry.animations) ? entry.animations : [];
      const existing = existingAnimations.find((animation) => animation.animId === request.id);
      entry.animations = existingAnimations.filter((animation) => animation.animId !== request.id);
      entry.animations.unshift({
        animId: request.id,
        name: request.name || 'generated animation',
        type: request.type,
        path,
        lifecycle: activeLifecycle(existing, path),
      });
      entry.hasIdleAnimation = entry.animations.some((animation) => animation.type === 'idle');
      entry.updatedAt = Date.now();

      const filePath = assertWithin(this.animationsDir, resolve(this.animationsDir, `${request.id}.json`));
      await atomicWriteJson(filePath, planToWrite);
      await atomicWriteJson(this.manifestPath, manifest);
      return { ok: true, id: request.id, path };
    });
  }
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function sendError(res, error) {
  const status = error instanceof LocalLibraryError ? error.status : 500;
  const code = error instanceof LocalLibraryError ? error.code : 'INTERNAL_ERROR';
  sendJson(res, status, { ok: false, code, error: error.message });
}

export function localLibraryPlugin({ rootDir, maxBodyBytes = DEFAULT_LOCAL_LIBRARY_BODY_LIMIT }) {
  const store = new LocalLibraryStore({ rootDir });
  return {
    name: 'local-library',
    configureServer(server) {
      server.middlewares.use('/api/local-library/save-model', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          assertLocalLibraryWriteRequest(req);
          const result = await store.saveModel(await readJsonBody(req, { maxBytes: maxBodyBytes }));
          sendJson(res, 200, result);
        } catch (error) {
          console.error('[LocalLibrary] save-model error:', error);
          sendError(res, error);
        }
      });

      server.middlewares.use('/api/local-library/save-animation', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          assertLocalLibraryWriteRequest(req);
          const result = await store.saveAnimation(await readJsonBody(req, { maxBytes: maxBodyBytes }));
          sendJson(res, 200, result);
        } catch (error) {
          console.error('[LocalLibrary] save-animation error:', error);
          sendError(res, error);
        }
      });

      server.middlewares.use('/api/local-library/list', async (req, res, next) => {
        if (req.method !== 'GET') return next();
        try {
          sendJson(res, 200, await store.list());
        } catch (error) {
          console.error('[LocalLibrary] list error:', error);
          sendError(res, error);
        }
      });
    },
  };
}
