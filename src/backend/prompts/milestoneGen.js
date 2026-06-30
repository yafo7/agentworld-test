import { callAI } from '../chatApi.js';
import { ITEM_TAGS, ENVIRONMENT_TAGS } from '../../engine/data/tagLibrary.js';

/**
 * Generate a new item when pet reaches intimacy 5.
 */
export async function generateMilestoneItem(pet) {
  const systemPrompt = `你是一个游戏物品设计师。宠物与玩家建立了信任，它想送玩家一件礼物。

规则：
1. 物品名2-3字，与宠物的特征相关，名字要有逻辑（如雨灯绒→荧光石、火系宠物→暖玉）
2. tags选3-4个，从可用物品tag库中选择
3. 这些tag暗示这件物品对环境的附加效果

可用物品tag库：${ITEM_TAGS.join('、')}

请严格输出JSON格式：
{
  "name": "物品名",
  "tags": ["tag1", "tag2", "tag3"],
  "color": "颜色描述"
}`;

  const userPrompt = `
宠物：${pet.name}
性格：${pet.personality}
宠物tag：[${pet.tags.join('、')}]
习惯：[${pet.habits.join('、')}]
亲密度：${pet.affection}/10

请设计它送给玩家的礼物。物品名必须与宠物特征有逻辑关联。`;

  console.log(`[AI] Generating milestone item for ${pet.name}`);
  const result = await callAI(systemPrompt, userPrompt);
  console.log(`[AI] Item generated: ${result.name}`);

  return {
    name: result.name,
    tags: result.tags.slice(0, 4),
    color: _colorToHex(result.color || '淡金'),
  };
}

/**
 * Generate a new environment when pet reaches intimacy 10.
 */
export async function generateMilestoneEnv(pet) {
  const systemPrompt = `你是一个游戏环境设计师。宠物与玩家达到最高羁绊，它将召唤一个新环境。

规则：
1. 环境名2-3字，与宠物的tag强相关
2. 选4-5个环境tag描述这个环境
3. 环境名要有画面感（如池塘、花田、熔岩池、星光台、风谷、蘑菇圈）

可用环境tag库：${ENVIRONMENT_TAGS.join('、')}

请严格输出JSON格式：
{
  "name": "环境名",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "color": "颜色描述"
}`;

  const userPrompt = `
宠物：${pet.name}
宠物tag：[${pet.tags.join('、')}]
起源签名：[${pet.originSignature.join('、')}]
亲密度：${pet.affection}/10

请设计这个宠物创造的新环境。环境必须与宠物的特征逻辑一致（如潮湿宠物→池塘、沙漠宠物→绿洲）。`;

  console.log(`[AI] Generating milestone environment for ${pet.name}`);
  const result = await callAI(systemPrompt, userPrompt);
  console.log(`[AI] Environment generated: ${result.name}`);

  return {
    name: result.name,
    tags: result.tags.slice(0, 5),
    color: _colorToHex(result.color || '绿色'),
  };
}

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
    '棕': 0x885544, '褐': 0x664422, '咖啡': 0x774433, '珊瑚': 0xff7766,
  };
  const lower = name.toLowerCase();
  for (const [key, hex] of Object.entries(map)) {
    if (lower.includes(key)) return hex;
  }
  const niceColors = [0x44ddff, 0xff8844, 0xaadd44, 0xff6699, 0x66ccaa, 0xcc88ff, 0xffcc44, 0x88aadd];
  return niceColors[Math.floor(Math.random() * niceColors.length)];
}
