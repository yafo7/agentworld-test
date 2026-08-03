import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import {
  generatedAssetPathCandidates,
  normalizeGeneratedAssetEntry,
} from '../src/assets/generatedAssetManifest.js';
import {
  assertAssetId,
  assertLocalLibraryWriteRequest,
  LocalLibraryStore,
  readJsonBody,
  validateAnimationRequest,
  validateModelRequest,
} from '../vite/localLibraryPlugin.js';

const publicRoot = new URL('../public/', import.meta.url);
const manifestUrl = new URL('generated/generated-library-manifest.json', publicRoot);

test('legacy generated paths retain a deterministic archive fallback', () => {
  assert.deepEqual(generatedAssetPathCandidates({
    path: 'generated/models/legacy.json',
  }), [
    'generated/models/legacy.json',
    'generated/_archive/models/legacy.json',
  ]);

  assert.deepEqual(generatedAssetPathCandidates({
    path: 'generated/_archive/animations/legacy.json',
    lifecycle: {
      schemaVersion: 1,
      status: 'archived',
      previousPaths: ['generated/animations/legacy.json'],
    },
  }), [
    'generated/_archive/animations/legacy.json',
    'generated/animations/legacy.json',
  ]);

  assert.deepEqual(generatedAssetPathCandidates({ path: '../private.json' }), []);
  assert.deepEqual(generatedAssetPathCandidates({
    path: 'generated/models/%2e%2e%2fprivate.json',
  }), []);
  assert.deepEqual(generatedAssetPathCandidates({
    path: 'generated/models/removed.json',
    lifecycle: { status: 'tombstone' },
  }), []);
});

test('legacy animation metadata normalizes without mutating the source entry', () => {
  const legacy = {
    assetId: 'gen_legacy',
    path: 'generated/models/gen_legacy.json',
    animId: 'anim_legacy',
    animPath: 'generated/animations/anim_legacy.json',
  };
  const normalized = normalizeGeneratedAssetEntry(legacy);

  assert.equal(legacy.animations, undefined);
  assert.equal(normalized.lifecycle.status, 'active');
  assert.equal(normalized.animations.length, 1);
  assert.equal(normalized.animations[0].animId, 'anim_legacy');
  assert.equal(normalized.animations[0].lifecycle.status, 'active');
});

test('generated library restores old local metadata from archived files after a missing active path', async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const calls = [];
  const metadata = [{
    assetId: 'gen_archive_fallback_fixture',
    path: 'generated/models/gen_archive_fallback_fixture.json',
    animations: [{
      animId: 'anim_archive_fallback_fixture',
      type: 'idle',
      path: 'generated/animations/anim_archive_fallback_fixture.json',
    }],
  }];
  const storage = new Map([['chii_generated_assets_meta', JSON.stringify(metadata)]]);

  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (url === '/api/local-library/list') {
      return { ok: false, status: 404, json: async () => null };
    }
    if (url === '/generated/_archive/models/gen_archive_fallback_fixture.json') {
      return { ok: true, json: async () => ({ format: 2, nodes: [{ id: 'body' }] }) };
    }
    if (url === '/generated/_archive/animations/anim_archive_fallback_fixture.json') {
      return { ok: true, json: async () => ({ _duration: 1, body: { bounce: {} } }) };
    }
    return { ok: false, status: 404, json: async () => null };
  };

  try {
    const { getGeneratedAsset } = await import('../src/assets/generatedLibrary.js');
    const result = await getGeneratedAsset('gen_archive_fallback_fixture');
    assert.equal(result.modelJson.nodes[0].id, 'body');
    assert.equal(result.animations[0].plan._duration, 1);
    assert.deepEqual(calls, [
      '/api/local-library/list',
      '/generated/models/gen_archive_fallback_fixture.json',
      '/generated/_archive/models/gen_archive_fallback_fixture.json',
      '/generated/animations/anim_archive_fallback_fixture.json',
      '/generated/_archive/animations/anim_archive_fallback_fixture.json',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
  }
});

test('server lifecycle metadata overrides a stale local asset path', async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const calls = [];
  const assetId = 'gen_canonical_archive_fixture';
  const activePath = `generated/models/${assetId}.json`;
  const archivePath = `generated/_archive/models/${assetId}.json`;
  const storage = new Map([['chii_generated_assets_meta', JSON.stringify([{ assetId, path: activePath }])]]);
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (url === '/api/local-library/list') {
      return {
        ok: true,
        json: async () => [{
          assetId,
          path: archivePath,
          lifecycle: { status: 'archived', previousPaths: [activePath] },
          animations: [],
        }],
      };
    }
    if (url === `/${archivePath}`) {
      return { ok: true, json: async () => ({ format: 2, nodes: [{ id: 'canonical' }] }) };
    }
    return { ok: false, status: 404, json: async () => null };
  };

  try {
    const { getGeneratedAsset } = await import('../src/assets/generatedLibrary.js');
    const result = await getGeneratedAsset(assetId);
    assert.equal(result.modelJson.nodes[0].id, 'canonical');
    assert.deepEqual(calls, ['/api/local-library/list', `/${archivePath}`]);
    const persisted = JSON.parse(storage.get('chii_generated_assets_meta'));
    assert.equal(persisted[0].lifecycle.status, 'archived');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
  }
});

test('generated library manifest points to available active or archived JSON', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  const resources = manifest.flatMap((entry) => [entry, ...(entry.animations || [])]);
  const archived = resources.filter((resource) => resource.lifecycle?.status === 'archived');

  assert.equal(manifest.length, 47);
  assert.equal(archived.length, 31);
  for (const resource of resources) {
    assert.ok(resource.path, `Missing path for ${resource.assetId || resource.animId}`);
    await readFile(new URL(resource.path, publicRoot), 'utf8');
    if (resource.path.includes('/_archive/')) {
      assert.equal(resource.lifecycle.status, 'archived');
      assert.equal(resource.lifecycle.schemaVersion, 1);
      assert.ok(resource.lifecycle.previousPaths.length > 0);
    }
  }
});

test('local library rejects traversal, invalid schemas, oversized bodies, and cross-origin writes', async () => {
  assert.throws(() => assertAssetId('../escape'), /letters, numbers/);
  assert.throws(() => validateModelRequest({
    id: 'gen_valid',
    modelJson: { format: 2 },
  }), /nodes array/);
  assert.throws(() => validateAnimationRequest({
    id: 'anim_valid',
    modelId: 'gen_valid',
    plan: {},
  }), /non-empty/);

  const body = Readable.from([Buffer.alloc(17)]);
  await assert.rejects(
    readJsonBody(body, { maxBytes: 16 }),
    (error) => error.code === 'PAYLOAD_TOO_LARGE' && error.status === 413,
  );

  assert.throws(() => assertLocalLibraryWriteRequest({ headers: {
    'content-type': 'application/json',
    host: 'localhost:5173',
    origin: 'https://example.com',
  } }), (error) => error.code === 'CROSS_ORIGIN_WRITE' && error.status === 403);
});

test('local library serializes concurrent model and animation manifest writes', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'chii-local-library-'));
  try {
    const store = new LocalLibraryStore({ rootDir });
    const modelIds = Array.from({ length: 12 }, (_, index) => `gen_concurrent_${index}`);
    await Promise.all(modelIds.map((id, index) => store.saveModel({
      id,
      name: `Model ${index}`,
      description: 'concurrency fixture',
      modelJson: { format: 2, nodes: [{ id: `node_${index}` }] },
    })));
    await Promise.all(modelIds.map((modelId, index) => store.saveAnimation({
      id: `anim_concurrent_${index}`,
      modelId,
      name: `Animation ${index}`,
      type: index === 0 ? 'idle' : 'interaction',
      plan: { _duration: 1, [`node_${index}`]: { bounce: { amplitude: 0.1 } } },
    })));

    const manifest = await store.list();
    assert.equal(manifest.length, modelIds.length);
    assert.deepEqual(new Set(manifest.map((entry) => entry.assetId)), new Set(modelIds));
    assert.ok(manifest.every((entry) => entry.animations.length === 1));
    assert.ok(manifest.every((entry) => entry.lifecycle.status === 'active'));

    const generatedDir = join(rootDir, 'public', 'generated');
    const manifestOnDisk = JSON.parse(await readFile(
      join(generatedDir, 'generated-library-manifest.json'),
      'utf8',
    ));
    assert.equal(manifestOnDisk.length, modelIds.length);
    assert.equal((await readdir(join(generatedDir, 'models'))).length, modelIds.length);
    assert.equal((await readdir(join(generatedDir, 'animations'))).length, modelIds.length);
    assert.equal((await readdir(generatedDir)).filter((name) => name.endsWith('.tmp')).length, 0);

    const originalCreatedAt = manifest.find((entry) => entry.assetId === modelIds[0]).createdAt;
    await store.saveModel({
      id: modelIds[0],
      name: 'Updated model',
      modelJson: { format: 2, nodes: [{ id: 'updated_node' }] },
    });
    const updated = (await store.list()).find((entry) => entry.assetId === modelIds[0]);
    assert.equal(updated.createdAt, originalCreatedAt);
    assert.equal(updated.animations.length, 1);

    await assert.rejects(
      store.saveAnimation({
        id: 'anim_orphan',
        modelId: 'gen_missing',
        plan: { _duration: 1 },
      }),
      (error) => error.code === 'MODEL_NOT_FOUND' && error.status === 404,
    );
    await assert.rejects(readFile(
      join(generatedDir, 'animations', 'anim_orphan.json'),
      'utf8',
    ), (error) => error.code === 'ENOENT');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('local library refuses to overwrite a malformed manifest', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'chii-invalid-manifest-'));
  try {
    const generatedDir = join(rootDir, 'public', 'generated');
    await mkdir(generatedDir, { recursive: true });
    const manifestPath = join(generatedDir, 'generated-library-manifest.json');
    await writeFile(manifestPath, '{ invalid json', 'utf8');
    const store = new LocalLibraryStore({ rootDir });

    await assert.rejects(store.saveModel({
      id: 'gen_should_not_write',
      modelJson: { format: 2, nodes: [{ id: 'body' }] },
    }), (error) => error.code === 'INVALID_MANIFEST' && error.status === 500);
    assert.equal(await readFile(manifestPath, 'utf8'), '{ invalid json');
    await assert.rejects(readFile(
      join(generatedDir, 'models', 'gen_should_not_write.json'),
      'utf8',
    ), (error) => error.code === 'ENOENT');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
