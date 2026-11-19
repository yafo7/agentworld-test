import assert from 'node:assert/strict';
import test from 'node:test';
import { WorldForgeAuthoringAdapter } from '../src/integrations/worldforge/WorldForgeAuthoringAdapter.js';

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, async json() { return body; } };
}

test('WorldForge authoring composes generate and refine previews before one transaction', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    if (url.endsWith('/generate')) {
      return jsonResponse({ suggestion: { summary: 'base', operations: [{ type: 'terrain.generate' }] } });
    }
    if (url.endsWith('/refine')) {
      assert.deepEqual(body.baseOperations, [{ type: 'terrain.generate' }]);
      return jsonResponse({ suggestion: { summary: 'river', operations: [{ type: 'water.add' }] } });
    }
    if (url.endsWith('/transactions')) return jsonResponse({ ok: true, map: { id: 'map-1' } });
    throw new Error(`Unexpected URL: ${url}`);
  };
  const adapter = new WorldForgeAuthoringAdapter({ baseUrl: 'http://forge.test', fetcher });
  const preview = await adapter.preview({
    mapId: 'map-1',
    steps: [
      { mode: 'generate', prompt: '生成丘陵森林地形' },
      { mode: 'refine', prompt: '在东侧增加弯曲河流' },
    ],
  });
  assert.deepEqual(preview.operations, [{ type: 'terrain.generate' }, { type: 'water.add' }]);
  assert.equal(calls.length, 2);

  await adapter.commit({ mapId: 'map-1', label: '森林与河流', operations: preview.operations });
  assert.equal(calls.length, 3);
  assert.equal(calls[2].body.source, 'agent');
  assert.deepEqual(calls[2].body.operations, preview.operations);
});

test('WorldForge authoring reports structured HTTP failures', async () => {
  const adapter = new WorldForgeAuthoringAdapter({
    fetcher: async () => jsonResponse({ error: 'provider_unavailable' }, false, 400),
  });
  await assert.rejects(
    adapter.preview({ mapId: 'map-1', steps: [{ mode: 'refine', prompt: '增加树林' }] }),
    error => error.status === 400 && error.message === 'provider_unavailable',
  );
});
