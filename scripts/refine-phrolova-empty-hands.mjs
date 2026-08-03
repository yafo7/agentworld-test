import { access, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelPath = path.join(root, 'public/generated/player-candidates/phrolova/classic-conductor/model.json');
const historyPath = path.join(root, 'public/generated/player-candidates/phrolova/classic-conductor/model-with-hand-prop.json');
const backendBase = process.env.CHII_VOXEL_BACKEND || 'https://voxel-studio-backend.zeabur.app';
const force = process.argv.includes('--force');

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
    if (url?.startsWith('/api/voxel/')) url = `${backendBase}/${url.slice('/api/voxel/'.length)}`;
    return nativeFetch(url, init);
  };
}

const current = JSON.parse(await readFile(modelPath, 'utf8'));
const history = await exists(historyPath)
  ? JSON.parse(await readFile(historyPath, 'utf8'))
  : null;
const identityMetadata = history?._meta || current._meta || {};

function restoreCandidateIdentity(modelJson) {
  return {
    ...modelJson,
    _meta: {
      ...identityMetadata,
      ...(modelJson?._meta || {}),
      chiiAssetRole: 'player_candidate',
      chiiCandidateId: 'a',
      chiiCandidateSlug: 'classic-conductor',
      chiiCharacterId: 'phrolova',
      chiiCharacterVariantId: 'a',
      chiiPromptProfile: identityMetadata.chiiPromptProfile || 'chii-v1',
      chiiGenerationQuality: identityMetadata.chiiGenerationQuality || 'voxel',
      chiiGenerationMode: identityMetadata.chiiGenerationMode || 'voxel',
    },
  };
}

if (!force && current._meta?.chiiHandsReset === true) {
  const repaired = restoreCandidateIdentity(current);
  if (JSON.stringify(repaired._meta) !== JSON.stringify(current._meta)) {
    await writeFile(modelPath, `${JSON.stringify(repaired, null, 2)}\n`, 'utf8');
    console.log('[Phrolova] Empty-hand base identity metadata repaired');
  }
  console.log('[Phrolova] Empty-hand base already prepared');
  process.exit(0);
}
if (!await exists(historyPath)) await copyFile(modelPath, historyPath);

installBackendFetchProxy();
const { VoxelContentAdapter } = await import('../src/integrations/content/VoxelContentAdapter.js');
const content = new VoxelContentAdapter();
const description = '保持角色身份、脸部、发型、礼裙和体型不变，移除右手彼岸花、指挥棒及所有手持物，双手空置自然下垂，保留头发和衣服装饰';
console.log(`[Phrolova] Refining empty hands: ${description}`);
const result = await content.refineModel({ modelJson: current, description });
const modelJson = restoreCandidateIdentity({
  ...result.modelJson,
  name: current.name,
  _meta: {
    ...identityMetadata,
    ...(current._meta || {}),
    ...(result.modelJson?._meta || {}),
    chiiHandsReset: true,
    chiiBaseAppearance: 'empty-hands',
    chiiRefinePrompt: description,
  },
});
await writeFile(modelPath, `${JSON.stringify(modelJson, null, 2)}\n`, 'utf8');
console.log(`[Phrolova] Saved empty-hand base (${modelJson.nodes?.length || 0} nodes)`);
