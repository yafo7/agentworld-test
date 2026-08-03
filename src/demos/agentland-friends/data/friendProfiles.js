export const AGENTLAND_FRIEND_PROFILES = Object.freeze([
  Object.freeze({
    id: 'lolo_sample',
    name: '洛洛（样例）',
    role: '点子收集员',
    personality: '认真里带一点突然的浪漫',
    accent: '#b6536b',
    model: 'generated/player-candidates/phrolova/gpt-pro-ai-chibi/model.json',
    animations: Object.freeze({
      idle: 'generated/player-candidates/phrolova/gpt-pro-ai-chibi/idle.json',
      run: 'generated/player-candidates/phrolova/gpt-pro-ai-chibi/run.json',
      special: 'generated/player-candidates/phrolova/gpt-pro-ai-chibi/special.json',
    }),
    displayHeight: 3.4,
    initialPosition: Object.freeze([-6, 0, 1]),
    referenceStatus: '等待玩家设定图替换',
  }),
  Object.freeze({
    id: 'naitang_sample',
    name: '奶糖（样例）',
    role: '零食保管员',
    personality: '乐观，而且坚信点心不会自己消失',
    accent: '#dc9b3f',
    model: 'generated/models/nailong.json',
    animations: Object.freeze({
      idle: 'generated/animations/nailong_idle.json',
      run: 'generated/animations/nailong_run.json',
      special: 'generated/animations/nailong_wave_left.json',
    }),
    displayHeight: 3.1,
    initialPosition: Object.freeze([0, 0, -4]),
    referenceStatus: '等待玩家设定图替换',
  }),
  Object.freeze({
    id: 'fangke_sample',
    name: '方刻（样例）',
    role: '临时活动主持',
    personality: '很会安排流程，偶尔把休息也排进日程',
    accent: '#438c7a',
    model: 'generated/models/fangk.json',
    animations: Object.freeze({
      idle: 'generated/animations/fangk_idle.json',
      run: 'generated/animations/fangk_run.json',
      special: 'generated/animations/fangk_dance.json',
    }),
    displayHeight: 3.2,
    initialPosition: Object.freeze([6, 0, 2]),
    referenceStatus: '等待玩家设定图替换',
  }),
]);

export function getAgentlandFriendProfile(id) {
  return AGENTLAND_FRIEND_PROFILES.find(profile => profile.id === id) || null;
}
