import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHII_CHARACTER_OUTFITS,
} from '../src/demos/chii-island/data/equipmentCatalog.js';
import { buildClothingRefinePrompt } from '../src/gameplay/equipment/CharacterEquipmentService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendBase = process.env.CHII_VOXEL_BACKEND || 'https://voxel-studio-backend.zeabur.app';
const force = process.argv.includes('--force');
const requestedCharacter = process.argv.find(arg => arg.startsWith('--character='))?.split('=')[1] || null;
const requestedOutfit = process.argv.find(arg => arg.startsWith('--outfit='))?.split('=')[1] || null;
const requestedVariant = process.argv.find(arg => arg.startsWith('--variant='))?.split('=')[1] || 'original';
const supportedVariants = new Set(['original', 'pro', 'voxel']);

if (!supportedVariants.has(requestedVariant)) {
  throw new Error(`Unknown outfit variant: ${requestedVariant}`);
}

const baseModelPath = characterId => (
  `public/generated/scenes/${requestedVariant}/models/${characterId}.json`
);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function installBackendFetchProxy() {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    let url = typeof input === 'string' ? input : input?.url;
    if (url?.startsWith('/api/voxel/')) {
      url = `${backendBase}/${url.slice('/api/voxel/'.length)}`;
    }
    return nativeFetch(url, init);
  };
}

function stageMetadata(modelJson, outfit) {
  return {
    ...modelJson,
    name: `${outfit.characterId} · ${outfit.name}`,
    _meta: {
      ...(modelJson?._meta || {}),
      chiiAssetRole: 'equipped_character',
      chiiCharacterId: outfit.characterId,
      chiiOutfitId: outfit.id,
      chiiBaseVariantId: requestedVariant,
      chiiEquipmentLoadout: { ...outfit.loadout },
      chiiPromptProfile: 'chii-v1',
    },
  };
}

installBackendFetchProxy();
const { VoxelContentAdapter } = await import('../src/integrations/content/VoxelContentAdapter.js');
const content = new VoxelContentAdapter();
const selectedOutfits = requestedCharacter
  ? CHII_CHARACTER_OUTFITS.filter(outfit => outfit.characterId === requestedCharacter)
  : CHII_CHARACTER_OUTFITS;
const filteredOutfits = requestedOutfit
  ? selectedOutfits.filter(outfit => outfit.id === requestedOutfit)
  : selectedOutfits;

if (filteredOutfits.length === 0) {
  throw new Error(`Unknown outfit selection: ${requestedCharacter || '*'} / ${requestedOutfit || '*'}`);
}

for (const outfit of filteredOutfits) {
  const basePath = baseModelPath(outfit.characterId);
  const baseModel = await readJson(path.join(root, basePath));
  const preset = outfit.presets.find(entry => entry.baseVariantId === requestedVariant)
    || {
      model: `generated/equipment/outfits/${outfit.characterId}/${outfit.id}/${requestedVariant}/full.json`,
    };
  const outputPath = path.join(root, 'public', preset.model);

  if (!force && await exists(outputPath)) {
    console.log(`[Outfit:${outfit.characterId}:${outfit.id}] Reusing ${requestedVariant}`);
    continue;
  }

  const entries = Object.entries(outfit.loadout).map(([slotId, itemId]) => ({ slotId, itemId }));
  const description = buildClothingRefinePrompt(entries);
  console.log(`[Outfit:${outfit.characterId}:${outfit.id}] Refining ${requestedVariant}`);
  const result = await content.refineModel({ modelJson: baseModel, description });
  await writeJson(outputPath, stageMetadata(result.modelJson, outfit));
  console.log(`[Outfit:${outfit.characterId}:${outfit.id}] Saved ${preset.model}`);
}

await writeJson(path.join(root, 'public/generated/equipment/outfits/manifest.json'), {
  id: 'chii_character_outfits_v2',
  generatedAt: new Date().toISOString(),
  source: 'autonomous_backend_refine',
  promptProfile: 'chii-v1',
  defaultVariant: 'original',
  generatedVariant: requestedVariant,
  outfits: CHII_CHARACTER_OUTFITS.map(outfit => ({
    id: outfit.id,
    characterId: outfit.characterId,
    name: outfit.name,
    loadout: outfit.loadout,
    presets: outfit.presets,
  })),
});

console.log('[Outfit] Character outfit presets ready');
