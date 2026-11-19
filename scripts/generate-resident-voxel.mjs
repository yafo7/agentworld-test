import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { VoxelContentAdapter } from '../src/integrations/content/VoxelContentAdapter.js';
import { PromptCompiler } from '../src/gameplay/ai/prompts/PromptCompiler.js';
import { createChiiAssetCatalog } from '../src/demos/chii-island/data/assetCatalog.js';

const base = process.env.CHII_VOXEL_BACKEND || 'https://voxelstudio.site';
const root = process.env.CHII_MODEL_OUTPUT || 'public/generated/residents/voxel-20261118';
const prompts = {
  momo: '一只粉色圆滚滚的小熊，圆耳短臂，乳白色鼻口',
  mako: '一匹棕色小马，黑鬃毛，穿红色七号球衣',
  yafo: '一只天蓝色小鸟，金黄尖喙，展开双翼，短尾翘起',
  lingq: '一只蓝绿孔雀，金色冠羽，扇尾带蓝金眼斑',
  mok: '一只直立的深绿鳄鱼，宽嘴白腹，双手各握一把斧头',
  fangk: '一位黑色西装建筑设计师，短黑发，手握蓝色图纸卷',
  crab: '一只橙色建筑工匠螃蟹，宽背圆眼，两只大钳八条步足',
};
const adapter = new VoxelContentAdapter({
  materialTagVocabulary: () => null,
  api: {
    async generateModel(description, provider, mode, { timeoutMs }) {
      const response = await fetch(base + '/api/generate/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, provider, mode, forceProvider: true }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw Error('HTTP ' + response.status);
      for (const line of (await response.text()).split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        const event = JSON.parse(line.slice(5));
        if (event.error || event.errorCode) throw Error(event.message || event.error || event.errorCode);
        if (!event.modelJson?.nodes?.length) continue;
        if (event.modelJson._meta?.ai?.provider !== provider) throw Error('模型生成者与请求不符');
        return event.modelJson;
      }
      throw Error('后端未返回模型');
    },
  },
});

async function build(id, inputDirectory) {
  if (!Object.hasOwn(prompts, id)) throw Error('未知居民 ' + id);
  const original = createChiiAssetCatalog('original')[id];
  let model;
  if (inputDirectory) {
    model = JSON.parse(await readFile(inputDirectory + '/' + id + '.json', 'utf8'));
  } else {
    const source = JSON.parse(await readFile('public/' + original.model, 'utf8'));
    const groups = source.nodes.filter(node => !node.mesh).map(node => node.id);
    const packet = new PromptCompiler().compile({
      operation: 'pet.generate', source: { text: prompts[id] }, constraints: { qualityProfile: 'voxel' },
    });
    const description = packet.payload.description + '。保留每个可动组的英文id（大小写完全相同，不翻译，不改名）：' + groups.join(', ');
    model = await adapter.generateModel({ description, quality: 'voxel' });
  }

  if (model._meta?.ai?.provider !== 'gpt' || !model.nodes.some(node => node.mesh)) throw Error('需要带 GPT 来源的可见模型');
  const joints = new Set(model.nodes.map(node => node.id));
  const aliases = { left_arm: 'leftArm', right_arm: 'rightArm', left_leg: 'leftLeg', right_leg: 'rightLeg' };
  const clips = [];
  for (const [action, path] of Object.entries(original.animations)) {
    const plan = JSON.parse(await readFile('public/' + path, 'utf8'));
    const bound = {};
    for (const [track, motion] of Object.entries(plan)) {
      const joint = track.startsWith('_') || joints.has(track) ? track : aliases[track];
      if (!joint || (!joint.startsWith('_') && !joints.has(joint)) || Object.hasOwn(bound, joint)) {
        throw Error(`动作 ${action} 缺少独立骨骼 ${track}`);
      }
      bound[joint] = motion;
    }
    clips.push([action, bound]);
  }
  await mkdir(root + '/animations', { recursive: true });
  for (const [action, plan] of clips) {
    await writeFile(`${root}/animations/${id}_${action}.json`, JSON.stringify(plan));
  }
  await writeFile(`${root}/${id}.json`, JSON.stringify(model));
  console.log(id, model._meta.ai.provider, model.nodes.length, 'nodes,', clips.length, 'clips');
}

const ids = process.argv.slice(2);
const queue = ids.length ? ids : Object.keys(prompts);
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const id = queue.shift();
    try { await build(id, process.env.CHII_MODEL_INPUT); }
    catch (error) { console.error(id, error.message); process.exitCode = 1; }
  }
}));
