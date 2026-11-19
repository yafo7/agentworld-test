import { CHII_RESIDENTS, getResidentId } from '../data/residentCatalog.js';
import { getChiiCharacterVariants } from '../data/characterVariants.js';

// Portraits are baked from the same model files as the character showcase.
// Look up the loaded variant, so a failed appearance change keeps its original face.
export function createResidentPortraits(pets = []) {
  const active = new Map(pets.map(pet => [getResidentId(pet), pet._appearanceVariantId]));
  const urls = { fallback: '/ui/resident-portraits/unknown.svg' };
  for (const resident of CHII_RESIDENTS) {
    const variants = getChiiCharacterVariants(resident.id);
    const variant = variants.find(v => v.id === active.get(resident.id)) || variants[0];
    urls[resident.id] = `/ui/resident-portraits/${variant.id}/${variant.assetId}.png`;
  }
  return urls;
}

export const DEFAULT_RESIDENT_PORTRAITS = Object.freeze(createResidentPortraits());

export function residentPortraitUrl(id, portraits = DEFAULT_RESIDENT_PORTRAITS) {
  const key = getResidentId(id);
  return Object.hasOwn(portraits, key) ? portraits[key] : portraits.fallback;
}
