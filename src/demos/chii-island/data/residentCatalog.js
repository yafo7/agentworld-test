import { getPetProfile } from './petProfiles.js';

function resident(definition) {
  return Object.freeze({
    gameplayId: definition.id,
    profileId: definition.gameplayId || definition.id,
    assetId: definition.gameplayId || definition.id,
    displayName: definition.gameplayId || definition.id,
    spawnKey: definition.gameplayId || definition.id,
    initialState: 'idle',
    region: 'pastoral',
    loader: 'pet_manager',
    ...definition,
    defaultSpawn: Object.freeze([...definition.defaultSpawn]),
    legacyIds: Object.freeze([...(definition.legacyIds || [])]),
  });
}

export const CHII_RESIDENTS = Object.freeze([
  resident({ id: 'momo', defaultSpawn: [-60, 0, 15], loader: 'manual' }),
  resident({
    id: 'mako',
    defaultSpawn: [-38, 0, -18],
    initialState: 'free_roam',
    region: 'church_town',
    legacyIds: ['horse_7'],
  }),
  resident({ id: 'yafo', defaultSpawn: [-30, 0, 30], legacyIds: ['sky_bird'] }),
  resident({
    id: 'lingq',
    defaultSpawn: [26, 0, -24],
    initialState: 'free_roam',
    region: 'church_town',
    legacyIds: ['peacock'],
  }),
  resident({
    id: 'fangk',
    defaultSpawn: [0, 0, 30],
    initialState: 'free_roam',
    region: 'church_town',
    loader: 'manual',
    legacyIds: ['fangke'],
  }),
  resident({ id: 'mok', defaultSpawn: [38, 0, 18], legacyIds: ['croc_axe'] }),
  resident({
    id: 'builder_crab',
    gameplayId: 'crab',
    profileId: 'crab',
    assetId: 'crab',
    displayName: '\u87f9\u87f9',
    spawnKey: 'crab',
    defaultSpawn: [14, 0, -34],
    initialState: 'free_roam',
    region: 'church_town',
    legacyIds: ['crab'],
  }),
]);

export const PET_MANAGER_RESIDENTS = Object.freeze(
  CHII_RESIDENTS.filter(definition => definition.loader === 'pet_manager'),
);

const RESIDENT_BY_ID = new Map();
for (const definition of CHII_RESIDENTS) {
  for (const id of [
    definition.id,
    definition.gameplayId,
    definition.profileId,
    definition.assetId,
    ...definition.legacyIds,
  ]) {
    if (!RESIDENT_BY_ID.has(id)) RESIDENT_BY_ID.set(id, definition);
  }
}

export function getResidentDefinition(id) {
  return RESIDENT_BY_ID.get(String(id || '').trim()) || null;
}

export function getResidentId(petOrId) {
  if (typeof petOrId === 'string') return getResidentDefinition(petOrId)?.id || petOrId;
  const candidate = petOrId?._residentId
    || petOrId?._profile?.id
    || petOrId?._petId
    || petOrId?._petName
    || petOrId?.mesh?.name;
  return getResidentDefinition(candidate)?.id || candidate || null;
}

export function getResidentGameplayId(petOrId) {
  const definition = getResidentDefinition(getResidentId(petOrId));
  return definition?.gameplayId || getResidentId(petOrId);
}

export function assignResidentIdentity(pet, id) {
  const definition = getResidentDefinition(id);
  if (!pet || !definition) throw new TypeError(`Unknown Chii resident: ${id}`);
  pet._residentId = definition.id;
  pet._petId = definition.id;
  pet._petName = definition.displayName;
  pet._assetId = definition.assetId;
  pet._profile = getPetProfile(definition.profileId);
  if (pet.mesh) pet.mesh.name = definition.gameplayId;
  return definition;
}
