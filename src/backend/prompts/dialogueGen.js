import { callAI } from '../chatApi.js';

/**
 * Generate dialogue between two pets.
 */
export async function generatePetDialogue(petA, petB) {
  const systemPrompt = `你是两只宠物的对话导演。根据它们的性格、tag和记忆，生成一段自然有趣的对话。

规则：
1. 对话共5轮，交替发言
2. 第一轮由${petA.name}先开始
3. 对话内容要体现它们各自的性格和tag特征
4. 可以参考它们的喜好、习惯来展开话题
5. 最后一轮以温暖的告别结束
6. 语言风格：温暖治愈，有宠物特色

请严格输出JSON格式：
{
  "lines": [
    {"speaker": "${petA.name}", "text": "..."},
    {"speaker": "${petB.name}", "text": "..."},
    {"speaker": "${petA.name}", "text": "..."},
    {"speaker": "${petB.name}", "text": "..."},
    {"speaker": "${petA.name}", "text": "..."}
  ]
}`;

  const userPrompt = `
${petA.name}：性格"${petA.personality}"，tag[${petA.tags.join('、')}]，喜欢[${petA.likes.join('、')}]，习惯[${petA.habits.join('、')}]
${petB.name}：性格"${petB.personality}"，tag[${petB.tags.join('、')}]，喜欢[${petB.likes.join('、')}]，习惯[${petB.habits.join('、')}]

请生成它们的对话。`;

  console.log(`[AI] Generating dialogue: ${petA.name} ↔ ${petB.name}`);
  const result = await callAI(systemPrompt, userPrompt);
  console.log(`[AI] Dialogue generated (${result.lines.length} lines)`);

  return result.lines.map((l) => ({ speaker: l.speaker, text: l.text }));
}

/**
 * Generate dialogue between a pet and the player (max intimacy scene).
 */
export async function generatePlayerDialogue(pet) {
  const systemPrompt = `你是一个宠物对玩家倾诉心声的场景编剧。宠物达到了最高亲密度，此刻它想对一直陪伴它的玩家说些心里话。

规则：
1. 宠物说3-5句话
2. 语气要温暖真挚，体现宠物的性格
3. 内容可以包含感谢、回忆、对未来的期待
4. 每句话不超过30字

请严格输出JSON格式：
{
  "lines": [
    {"speaker": "${pet.name}", "text": "..."},
    {"speaker": "${pet.name}", "text": "..."},
    {"speaker": "${pet.name}", "text": "..."}
  ]
}`;

  const userPrompt = `
${pet.name}：性格"${pet.personality}"，tag[${pet.tags.join('、')}]，习惯[${pet.habits.join('、')}]
亲密度：${pet.affection}/10
记忆：${pet.memories.slice(-3).join('；') || '这是它第一次如此信任一个人类。'}

请生成它想对玩家说的话。`;

  console.log(`[AI] Generating player dialogue for ${pet.name}`);
  const result = await callAI(systemPrompt, userPrompt);
  return result.lines.map((l) => ({ speaker: l.speaker, text: l.text }));
}
