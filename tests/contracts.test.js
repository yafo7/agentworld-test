import assert from 'node:assert/strict';
import test from 'node:test';
import { assertContentGenerationPort, ContentGenerationPort } from '../src/ports/ContentGenerationPort.js';
import { assertRuntimeAssetRepository, RuntimeAssetRepository } from '../src/ports/RuntimeAssetRepository.js';

test('content generation port exposes the stable gameplay contract', () => {
  const port = new ContentGenerationPort();
  assert.equal(assertContentGenerationPort(port), port);
  assert.throws(() => assertContentGenerationPort({}), /generateModel/);
});

test('runtime asset repository exposes model, animation and bundle operations', () => {
  const repository = new RuntimeAssetRepository();
  assert.equal(assertRuntimeAssetRepository(repository), repository);
  assert.throws(() => assertRuntimeAssetRepository({}), /getModel/);
});

