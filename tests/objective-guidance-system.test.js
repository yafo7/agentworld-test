import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectiveGuidanceSystem } from '../src/demos/chii-island/systems/ObjectiveGuidanceSystem.js';

test('objective guidance uses the next path turn on the map and screen while preserving the final marker', () => {
  const projection = {
    id: 'visit-church',
    label: '去教堂门前',
    target: { type: 'position', position: { x: 10, y: 0, z: 0 } },
    trigger: 'proximity',
    radius: 7,
    progress: { current: 1, total: 3 },
  };
  const miniMap = {
    setPlayer() {},
    setObjective(value) { this.objective = value; },
    update() {},
    dispose() {},
  };
  const worldMarker = {
    show(value) { this.value = value; },
    update() {},
    hide() {},
    dispose() {},
  };
  const runtimeStatus = {
    setObjectiveNavigation(value) { this.value = value; },
  };
  const store = {
    subscribe(listener) { listener(projection); return () => {}; },
  };
  const system = new ObjectiveGuidanceSystem({
    projectionStore: store,
    player: { mesh: { position: { x: 0, y: 0, z: 0 } } },
    worldObjects: null,
    resolvePet: () => null,
    navigation: { findPath: () => [{ x: 4, y: 0, z: 2 }, { x: 10, y: 0, z: 0 }] },
    miniMap,
    worldMarker,
    runtimeStatus,
  });

  system.update(0.016);
  assert.equal(miniMap.objective.position.x, 4);
  assert.equal(miniMap.objective.finalPosition.x, 10);
  assert.equal(worldMarker.value.position.x, 10);
  assert.equal(worldMarker.value.guidancePosition.x, 4);
  assert.equal(runtimeStatus.value.distance, 10);
  assert.deepEqual(runtimeStatus.value.progress, { current: 1, total: 3 });
  system.dispose();
});
