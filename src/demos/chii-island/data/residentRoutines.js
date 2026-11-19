import { validateResidentPlan } from '../../../gameplay/agents/ResidentBehaviorPlan.js';

const routines = {
  momo: ['温和的 momo 爱照料花木，也喜欢向邻居打招呼。', ['端详花草', 'idle', 32], ['向邻居挥手', 'wave', 5], ['坐下来歇脚', 'idle', 24]],
  yafo: ['好奇的 yafo 爱活动翅膀，常在花丛旁停下来。', ['扑翅热身', 'run', 8], ['轻跳起飞', 'jump', 4], ['停下来望望花丛', 'idle', 18]],
  mok: ['mok 喜欢出力干活，收工后才肯歇脚。', ['踏步热身', 'run', 8], ['蹬地练腿', 'jump', 6], ['收工喘口气', 'idle', 20]],
  mako: ['mako 会把慢跑和跨步练习穿插在休息之间。', ['原地慢跑', 'run', 14], ['跨跳练习', 'jump', 6], ['放松呼吸', 'idle', 18]],
  lingq: ['lingq 爱展示羽色，习惯在演出前把舞步练熟。', ['调整站姿', 'idle', 8], ['排练舞步', 'dance', 16], ['轻跳谢幕', 'jump', 4]],
  fangk: ['fangk 喜欢把活动张罗妥当，开场前总要过一遍流程。', ['查看活动图纸', 'construct', 12], ['排练开场动作', 'dance', 8], ['等候居民集合', 'idle', 28]],
  builder_crab: ['螃蟹喜欢动手，常练习钳子的施工动作。', ['横步热身', 'walk', 8], ['练习双钳施工', 'construct', 15], ['停下检查手艺', 'idle', 12]],
};
export function residentRoutine(id, animations) {
  const routine = routines[id];
  if (!routine) return null;
  const [reason, ...steps] = routine;
  const states = steps.map(([name, animation, seconds], i) => ({
    id: 'step' + i, name, seconds, ...(animations.includes(animation) ? { kind: 'perform', animation } : { kind: 'wait' }),
    onSuccess: 'step' + ((i + 1) % steps.length), onFailure: 'step2',
  }));
  return { reason, graph: validateResidentPlan({ schemaVersion: 1, entryStateId: 'step0', states }, { animations }) };
}
export const directionKey = (scope, id) => 'chii-resident-direction-v1:' + scope + ':' + id;
export function getDirection(scope, id) {
  try { return JSON.parse(localStorage.getItem(directionKey(scope, id))); } catch { return null; }
}
