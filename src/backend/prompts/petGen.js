import { callAI } from '../chatApi.js';
import { ENVIRONMENT_TAGS, ITEM_TAGS } from '../../engine/data/tagLibrary.js';

const SYSTEM_PROMPT = `你是一个创意宠物设计师。你会根据环境tag和物品tag组合，生成一只独特的生物。

规则：
1. 名字要有诗意，2-4个字，例如：雨灯绒、霜牙、焰尾蝶、石心菇、风语者
2. tags选5个最能描述这只宠物特征的词，从可用tag库中选择
3. 性格描述一句话（10-20字）
4. 喜好和讨厌各列2-3项
5. 习惯列2-3个独特行为
6. originSignature是从环境和物品tag中挑选5-7个最能吸引它的tag
7. color用描述性的颜色名（如"淡金""深紫""翠绿""琥珀"等）

可用环境tag库：${ENVIRONMENT_TAGS.join('、')}
可用物品tag库：${ITEM_TAGS.join('、')}

请严格输出以下JSON格式：
{
  "name": "生物名",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "personality": "性格描述",
  "likes": ["喜欢1", "喜欢2"],
  "dislikes": ["讨厌1", "讨厌2"],
  "habits": ["习惯1", "习惯2", "习惯3"],
  "originSignature": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "color": "颜色描述"
}`;

/**
 * Generate a pet from environment and item tags.
 * @param {string[]} envTags
 * @param {string[]} itemTags
 * @returns {Promise<object>} pet config object
 */
export async function generatePet(envTags, itemTags) {
  const userPrompt = `环境tag：${envTags.join('、') || '无'}
物品tag：${itemTags.join('、') || '无'}

请根据这些tag创造一只独特的宠物。宠物必须与这些tag有逻辑关联（例如潮湿+微光可能吸引夜行发光生物）。`;

  console.log('[AI] Generating pet from tags...', { envTags, itemTags });
  const result = await callAI(SYSTEM_PROMPT, userPrompt);
  console.log('[AI] Pet generated:', result.name);

  // Map color description to hex (simple mapping)
  const colorHex = _colorToHex(result.color || '蓝色');

  return {
    name: result.name,
    tags: result.tags.slice(0, 7),
    personality: result.personality,
    likes: result.likes,
    dislikes: result.dislikes,
    habits: result.habits,
    originSignature: result.originSignature.slice(0, 7),
    color: colorHex,
  };
}

/** Simple color name → hex mapping. Falls back to random nice color. */
function _colorToHex(name) {
  const map = {
    '红': 0xff4444, '深红': 0xcc2222, '粉红': 0xffaacc, '淡粉': 0xffccee,
    '橙': 0xff8844, '橘': 0xff9944, '琥珀': 0xffbb44, '金': 0xffcc00, '淡金': 0xffdd66, '金黄': 0xffaa00,
    '黄': 0xffff44, '淡黄': 0xffffee,
    '绿': 0x44cc44, '翠绿': 0x22aa44, '草绿': 0x66bb44, '深绿': 0x225522, '薄荷': 0x88ffaa,
    '青': 0x44dddd, '浅青': 0xaaffee, '蓝绿': 0x44ccaa,
    '蓝': 0x4488ff, '淡蓝': 0x88ccff, '天蓝': 0x66aaff, '深蓝': 0x2233aa, '靛': 0x4444cc,
    '紫': 0x9944ff, '淡紫': 0xcc99ff, '深紫': 0x6622aa, '薰衣草': 0xcc88ff,
    '白': 0xeeeeff, '纯白': 0xffffff, '雪白': 0xf0f0ff,
    '黑': 0x333333, '深黑': 0x111111, '灰': 0x999999, '浅灰': 0xcccccc, '银': 0xccccdd,
    '棕': 0x885544, '褐': 0x664422, '咖啡': 0x774433,
  };
  const lower = name.toLowerCase();
  for (const [key, hex] of Object.entries(map)) {
    if (lower.includes(key)) return hex;
  }
  // Random nice color
  const niceColors = [0x44ddff, 0xff8844, 0xaadd44, 0xff6699, 0x66ccaa, 0xcc88ff, 0xffcc44, 0x88aadd];
  return niceColors[Math.floor(Math.random() * niceColors.length)];
}
