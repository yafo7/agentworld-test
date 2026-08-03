import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHII_EQUIPMENT_ITEMS,
  getEquipmentPlacement,
} from '../src/demos/chii-island/data/equipmentCatalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(root, 'public/generated/equipment');
const modelRoot = path.join(outputRoot, 'models');
const backendBase = process.env.CHII_VOXEL_BACKEND || 'https://voxel-studio-backend.zeabur.app';
const force = process.argv.includes('--force');
const forceModels = force || process.argv.includes('--force-models');
const forceMounts = force || process.argv.includes('--force-mounts');
const forceAnimations = force || process.argv.includes('--force-animations');
const modelsOnly = process.argv.includes('--models-only');
const requestedItem = process.argv.find(arg => arg.startsWith('--item='))?.split('=')[1] || null;
const requestedCharacter = process.argv.find(arg => arg.startsWith('--character='))?.split('=')[1] || null;
const mountTargets = Object.freeze([
  {
    id: 'nailong',
    name: '奶龙',
    variantId: 'default',
    modelPath: 'public/generated/models/nailong.json',
    outputPath: 'mounts/nailong/right-hand',
    animationOutputPath: 'animations/nailong/right-hand',
  },
  {
    id: 'phrolova',
    name: '弗洛洛',
    variantId: 'a',
    modelPath: 'public/generated/player-candidates/phrolova/classic-conductor/model.json',
    outputPath: 'mounts/phrolova/classic-conductor/right-hand',
    animationOutputPath: 'animations/phrolova/classic-conductor/right-hand',
  },
]);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function withAssetMetadata(modelJson, item, metadata) {
  return {
    ...modelJson,
    name: item.name,
    _meta: {
      ...(modelJson?._meta || {}),
      chiiAssetRole: 'equipment_prop',
      chiiEquipmentId: item.id,
      chiiPromptProfile: item.promptPacket.prompt_profile,
      chiiGenerationQuality: item.promptPacket.request_hints.quality,
      chiiBackendMetadata: metadata || null,
    },
  };
}

await mkdir(modelRoot, { recursive: true });
installBackendFetchProxy();

const { VoxelContentAdapter } = await import('../src/integrations/content/VoxelContentAdapter.js');
const content = new VoxelContentAdapter();
const selectedItems = requestedItem
  ? CHII_EQUIPMENT_ITEMS.filter(item => item.id === requestedItem)
  : CHII_EQUIPMENT_ITEMS;

if (selectedItems.length === 0) {
  throw new Error(`Unknown equipment item: ${requestedItem}`);
}

const itemModels = new Map();
for (const item of selectedItems) {
  const modelPath = path.join(modelRoot, `${item.id}.json`);
  let modelJson;
  if (!forceModels && await exists(modelPath)) {
    modelJson = await readJson(modelPath);
    console.log(`[Equipment:${item.id}] Reusing model`);
  } else {
    console.log(`[Equipment:${item.id}] Generating Voxel model: ${item.promptPacket.prompt}`);
    const result = await content.generateModel({
      description: item.promptPacket.prompt,
      quality: item.promptPacket.request_hints.quality,
    });
    modelJson = withAssetMetadata(result.modelJson, item, result.metadata);
    await writeJson(modelPath, modelJson);
    console.log(`[Equipment:${item.id}] Model saved`);
  }
  itemModels.set(item.id, modelJson);
}

if (!modelsOnly) {
  const selectedTargets = requestedCharacter
    ? mountTargets.filter(target => target.id === requestedCharacter)
    : mountTargets;
  if (selectedTargets.length === 0) throw new Error(`Unknown equipment character: ${requestedCharacter}`);

  for (const target of selectedTargets) {
    const baseModel = await readJson(path.join(root, target.modelPath));
    const mountRoot = path.join(outputRoot, target.outputPath);
    const animationRoot = path.join(outputRoot, target.animationOutputPath);
    await mkdir(mountRoot, { recursive: true });
    await mkdir(animationRoot, { recursive: true });
    let sharedShowcasePlan = null;
    for (const item of selectedItems) {
      const mountPath = path.join(mountRoot, `${item.id}.json`);
      let mountedModel;
      if (!forceMounts && await exists(mountPath)) {
        console.log(`[Equipment:${item.id}] Reusing ${target.name} right-hand mount`);
        mountedModel = await readJson(mountPath);
      } else {
        const placement = getEquipmentPlacement(item, 'rightHand');
        console.log(`[Equipment:${item.id}] Mounting on ${target.name}: ${placement}`);
        const result = await content.mountPart({
          primaryModelJson: baseModel,
          part: itemModels.get(item.id),
          placement,
        });
        mountedModel = {
          ...result.modelJson,
          name: `${target.name}手持${item.name}`,
          _meta: {
            ...(result.modelJson?._meta || {}),
            chiiAssetRole: 'equipped_character',
            chiiCharacterId: target.id,
            chiiCharacterVariantId: target.variantId,
            chiiEquipmentLoadout: { rightHand: item.id },
            chiiPromptProfile: item.promptPacket.prompt_profile,
          },
        };
        await writeJson(mountPath, mountedModel);
        console.log(`[Equipment:${item.id}] ${target.name} mount saved`);
      }

      const animationPath = path.join(animationRoot, `${item.id}.json`);
      if (!forceAnimations && await exists(animationPath)) {
        console.log(`[Equipment:${item.id}] Reusing ${target.name} showcase animation`);
        continue;
      }
      if (!sharedShowcasePlan) {
        const description = '双手把手中物品举过头顶展示';
        console.log(`[Equipment] Animating ${target.name}: ${description}`);
        const result = await content.generateAnimation({
          modelJson: mountedModel,
          description,
          duration: 2.8,
          emitParticles: false,
        });
        sharedShowcasePlan = result.plan;
      }
      await writeJson(animationPath, {
        ...sharedShowcasePlan,
        _duration: 2.8,
        _loop: false,
        _name: `${item.name}展示动作`,
      });
    }
  }
}

await writeJson(path.join(outputRoot, 'manifest.json'), {
  id: 'chii_equipment_v1',
  generatedAt: new Date().toISOString(),
  source: 'autonomous_backend',
  providerProfile: {
    quality: 'voxel',
    provider: 'gpt',
    model: 'gpt-5.6-sol-high',
    mode: 'voxel',
  },
  items: CHII_EQUIPMENT_ITEMS.map(item => ({
    id: item.id,
    name: item.name,
    category: item.category,
    kind: item.kind,
    promptPacket: item.promptPacket,
    model: item.model,
    allowedSlots: item.allowedSlots,
    presets: item.presets,
    showcaseAnimations: item.showcaseAnimations,
  })),
});

console.log(`[Equipment] Bundle ready at ${outputRoot}`);
