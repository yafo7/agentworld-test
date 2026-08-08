import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Chii player starts above the ground so Rapier can settle the capsule safely', async () => {
  const source = await readFile(
    new URL('../src/demos/chii-island/main.js', import.meta.url),
    'utf8',
  );

  assert.match(source, /const PLAYER_INITIAL_SPAWN_HEIGHT = 1\.25;/);
  assert.match(
    source,
    /player\.initPhysics\(physics, demoSpawn\.x, PLAYER_INITIAL_SPAWN_HEIGHT, demoSpawn\.z\);/,
  );
});
