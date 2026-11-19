import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createForgeWorldSpatialDescriptor } from '../src/integrations/worldforge/forgeTerrainLayout.js';
import { TerrainPathfinder } from '../src/world/navigation/TerrainPathfinder.js';
import { CHII_RESIDENTS } from '../src/demos/chii-island/data/residentCatalog.js';
import { createForgeResidentHabitat } from '../src/demos/chii-island/systems/createForgeResidentHabitat.js';
import { createChiiAnimalAgentActions } from '../src/demos/chii-island/systems/ChiiAnimalAgentActions.js';

const publicRoot = new URL('../public/generated/worlds/worldforge/', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('catalog.json', publicRoot), 'utf8'));
const residentIds = CHII_RESIDENTS.map(resident => resident.id);

for (const world of catalog.worlds) {
  test(`${world.id} gives every named resident a unique reachable habitat`, () => {
    const map = JSON.parse(readFileSync(new URL(`${world.packageRoot}/map.json`, publicRoot), 'utf8'));
    const spatial = createForgeWorldSpatialDescriptor(map);
    const habitat = createForgeResidentHabitat(map, spatial, residentIds);
    const pathfinder = new TerrainPathfinder({
      terrainLayout: spatial.terrainLayout,
      center: spatial.center,
      tileSize: spatial.tileSize,
    });
    const positions = Object.values(habitat.residents).map(resident => resident.spawn);

    assert.deepEqual(Object.keys(habitat.residents), residentIds);
    assert.equal(new Set(positions.map(position => `${position[0]},${position[2]}`)).size, residentIds.length);
    for (const resident of Object.values(habitat.residents)) {
      assert.equal(spatial.terrainLayout[resident.cell.z][resident.cell.x], 'grass');
      assert.equal(pathfinder.isWalkableWorld({ x: resident.spawn[0], z: resident.spawn[2] }), true);
      assert.ok(pathfinder.findPath(
        { x: spatial.playerSpawn[0], z: spatial.playerSpawn[2] },
        { x: resident.spawn[0], z: resident.spawn[2] },
      ).length > 0);
      assert.ok(Number.isFinite(resident.spawn[1]));
      assert.ok(resident.spawn[0] >= resident.bounds.minX && resident.spawn[0] <= resident.bounds.maxX);
      assert.ok(resident.spawn[2] >= resident.bounds.minZ && resident.spawn[2] <= resident.bounds.maxZ);
    }
  });
}

test('exploration-only Agent actions keep daily life but exclude island mutation proposals', () => {
  const actions = createChiiAnimalAgentActions({ explorationOnly: true });
  const ids = actions.list().map(action => action.id);
  assert.ok(ids.includes('routine.wander'));
  assert.ok(ids.includes('social.greet'));
  assert.ok(ids.includes('social.cooperate'));
  assert.equal(ids.includes('world.propose'), false);
  assert.equal(ids.includes('activity.propose'), false);
  assert.equal(ids.includes('building.propose'), false);
});
