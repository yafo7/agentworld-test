import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AssetSemanticAudit,
  auditAnimationPlan,
  auditModelJson,
} from '../src/demos/chii-island/systems/AssetSemanticAudit.js';

test('asset audit reports model semantics without changing source data', () => {
  const model = {
    name: 'tagged prop',
    nodes: [
      { id: 'root', tags: [{ tag: 'base', value: 'wood' }] },
      { id: 'lamp', parent: 'root', mesh: { type: 'box', color: 0xffffff }, tags: [{ tag: 'emissive', value: 1 }] },
      { id: 'ice', parent: 'root', mesh: { type: 'sphere', color: 0xffffff }, tags: [{ tag: 'ice', value: 1 }] },
    ],
  };
  const before = JSON.stringify(model);
  const report = auditModelJson(model, 'prop');

  assert.equal(report.parts, 3);
  assert.equal(report.meshes, 2);
  assert.deepEqual(report.materialTags, { base: 1, emissive: 1, ice: 1 });
  assert.deepEqual(report.unsupportedTags, { ice: 1 });
  assert.equal(JSON.stringify(model), before);
});

test('asset audit reports unsupported animation operators and renderer counters', () => {
  const animation = auditAnimationPlan({
    _duration: 2,
    arm: { pointTo: {}, emit: {}, mysteryMotion: {} },
  }, 'wave');
  assert.deepEqual(animation.unsupportedOperators, { mysteryMotion: 1 });

  const audit = new AssetSemanticAudit({
    models: { empty: { nodes: [] } },
    renderer: {
      info: {
        render: { calls: 7, triangles: 12, points: 1, lines: 2 },
        memory: { geometries: 3, textures: 4 },
        programs: [{}, {}],
      },
    },
    runtime: { source: 'local', version: 'test', templates: [] },
  });
  audit.recordAnimations('pet', { wave: { arm: { mysteryMotion: {} } } });
  const report = audit.snapshot();
  assert.equal(report.render.calls, 7);
  assert.deepEqual(report.totals.unsupportedMotionOperators, { mysteryMotion: 1 });
});
