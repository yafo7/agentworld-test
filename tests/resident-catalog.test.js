import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignResidentIdentity,
  CHII_RESIDENTS,
  getResidentDefinition,
  getResidentGameplayId,
  getResidentId,
  PET_MANAGER_RESIDENTS,
} from '../src/demos/chii-island/data/residentCatalog.js';

test('resident catalog owns unique stable identities and legacy aliases', () => {
  assert.equal(new Set(CHII_RESIDENTS.map(resident => resident.id)).size, CHII_RESIDENTS.length);
  assert.equal(getResidentId('horse_7'), 'mako');
  assert.equal(getResidentId('fangke'), 'fangk');
  assert.equal(getResidentId('crab'), 'builder_crab');
  assert.equal(getResidentGameplayId('builder_crab'), 'crab');
  assert.equal(getResidentDefinition('croc_axe').assetId, 'mok');
  assert.deepEqual(
    PET_MANAGER_RESIDENTS.map(resident => resident.id),
    ['mako', 'yafo', 'lingq', 'mok', 'builder_crab'],
  );
});

test('resident assignment exposes canonical, gameplay, asset and profile identities', () => {
  const pet = { mesh: { name: '' } };
  const definition = assignResidentIdentity(pet, 'crab');

  assert.equal(definition.id, 'builder_crab');
  assert.equal(pet._residentId, 'builder_crab');
  assert.equal(pet._petId, 'builder_crab');
  assert.equal(pet._assetId, 'crab');
  assert.equal(pet._profile.id, 'crab');
  assert.equal(pet.mesh.name, 'crab');
});
