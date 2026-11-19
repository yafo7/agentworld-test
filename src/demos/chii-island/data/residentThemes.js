import { residentRoutine } from './residentRoutines.js';
import { residentDay } from './residentDay.js';

export const RESIDENT_THEME_ROLES = Object.freeze({
  host: '组织者', lead: '领操', helper: '筹备', dancer: '表演者', spectator: '观看者', participant: '参与者',
  guest: '寿星', initiator: '发起人',
});

const festivalRoles = { fangk: 'host', lingq: 'dancer', mako: 'dancer', builder_crab: 'helper', mok: 'helper', momo: 'spectator', yafo: 'spectator' };

function festivalGestures(role, animations) {
  const watch = { kind: 'wait', name: '在场边面向表演', seconds: 10 };
  if (role === 'spectator') return [watch];
  const helper = role === 'helper';
  const keys = helper ? ['construct', 'nod', 'exercise'] : ['dance', 'jump', 'run'];
  const animation = keys.find(key => animations.includes(key));
  if (!animation) return [helper ? watch : { kind: 'wait', name: '稍作休息', seconds: 6 }];
  const name = helper ? '检查场地布置' : role === 'host' ? '领着大家跳舞' : '跟着音乐跳舞';
  const action = { kind: 'perform', name, animation, seconds: 5 };
  return helper ? [action, watch] : [action];
}

export function residentThemeAnimations(model) {
  const ids = new Set(model?.nodes?.filter(node => !node.mesh).map(node => node.id));
  const body = ['body', 'pelvis', 'chest'].find(id => ids.has(id));
  if (!body) return {};
  const exercise = { _duration: 4, _loop: true, [body]: {
    bounce: { amplitude: 0.1, frequency: 2 }, swing: { axis: 'z', amplitude: 0.08, frequency: 1 },
  } };
  for (const side of ['left', 'right']) {
    const joint = [side + 'Arm_upperArm', side + 'Wing', side + '_arm', side === 'left' ? 'claw_0' : 'claw_1',
      'front' + side[0].toUpperCase() + side.slice(1) + 'Leg'].find(id => ids.has(id));
    if (joint) exercise[joint] = { swing: { axis: 'z', amplitude: side === 'left' ? 0.48 : -0.48, frequency: 1 } };
  }
  const nod = ids.has('head') ? { nod: { _duration: 1.5, _loop: false, head: { swing: { axis: 'x', amplitude: 0.19, frequency: 2 } } } } : {};
  return { exercise, ...nod };
}

export function describeResidentThemes(id, animations) {
  const motion = (name, ...keys) => {
    const animation = keys.find(key => animations.includes(key));
    return animation ? { kind: 'perform', name, animation, seconds: 5 } : { kind: 'wait', name: '稍作休息', seconds: 6 };
  };
  const routine = residentRoutine(id, animations)?.graph.states || [];
  const idle = { kind: 'wait', name: '停下来休息', seconds: 10 };
  const themes = {
    daily: { name: '日常休息', when: '岛上没有需要它参加的活动时', mode: 'choice', actions: [
      { kind: 'stroll', name: '到附近散步', seconds: 12 }, idle,
      ...routine.filter(state => state.kind === 'stroll' ||
        (state.animation && !['idle', 'construct'].includes(state.animation) && (id !== 'fangk' || state.animation !== 'dance')))
        .map(({ kind, name, animation, seconds }) => ({ kind, name, animation, seconds })),
      ...(id === 'fangk' ? [motion('原地热身', 'run', 'exercise')] : []),
    ] },
    chat: { name: '居民交谈', when: '遇到愿意停下来聊天的邻居时', mode: 'sequence', actions: [
      { name: '面向邻居', kind: 'social' }, { name: '打招呼、听对方回应', kind: 'social' },
      ...(animations.includes('nod') ? [motion('点头回应', 'nod')] : []),
    ] },
    exercise: { name: '集体体操', when: '清晨广场举行集体晨练时', mode: 'phase', role: id === 'fangk' ? 'lead' : 'participant', actions: [
      { name: '前往广场集合', kind: 'activity', phase: '集合' },
      { ...motion('跟着节拍活动身体', 'exercise', 'jump', 'run'), phase: '晨练' },
    ] },
    festival: { name: ({ host: '组织活动', helper: '筹备活动', dancer: '参与表演', spectator: '观看活动' })[festivalRoles[id]] || '参与节日',
      when: '岛上有节日且这位居民参加时', mode: 'phase', role: festivalRoles[id] || 'participant', actions: [
        { name: ({ host: '到场招呼大家', helper: '到场协助集合', spectator: '到场边找个位置' })[festivalRoles[id]] || '前往活动地点', kind: 'activity', phase: '集合' },
        ...festivalGestures(festivalRoles[id], animations).map(action => ({ ...action, phase: '开场' })),
      ] },
  };
  themes.outing = { name: id === 'mako' ? '外出采集' : '结伴外出', when: '岛上组织采集或日常小活动时', mode: 'phase', actions: [
    { name: '前往活动地点', kind: 'activity', phase: '集合' },
    { name: '和到场居民参加活动', kind: 'activity', phase: '活动' },
  ] };
  if (id === 'fangk' || id === 'builder_crab') {
    themes.work = { name: id === 'fangk' ? '工作巡查' : '查看工地', when: '有实际建筑需要查看时', mode: 'sequence', actions: [
      { kind: 'visit', name: '走到建筑旁', seconds: 35 },
      { kind: 'stroll', name: '绕到建筑另一侧', seconds: 15 },
      motion(id === 'fangk' ? '查看图纸' : '检查建筑接缝', 'construct'),
      { kind: 'wait', name: '抬头观察建筑', seconds: 7 },
    ] };
  }
  return { ...themes, ...residentDay(id, themes) };
}

export function editableThemeActions(theme) {
  return theme.actions.filter(action => ['perform', 'wait', 'stroll'].includes(action.kind));
}

// Saved clips can disappear after an outfit change. Keep compatible periods.
export function restoreThemeEdits(edits, themes, animations) {
  const restored = {};
  for (const edit of Array.isArray(edits) ? edits : []) {
    try { Object.assign(restored, validateThemeEdits([edit], themes, animations)); } catch { /* Unavailable clip or legacy theme. */ }
  }
  return restored;
}

export function editableResidentThemes(themes) {
  return Object.fromEntries(Object.entries(themes).map(([id, theme]) => [
    id, { ...theme, actions: editableThemeActions(theme) },
  ]));
}

export function validateThemeEdits(edits, themes, animations, scope) {
  if (!Array.isArray(edits) || edits.length < 1 || edits.length > Object.keys(themes).length) throw new Error('没有收到可用的行为调整');
  const result = {};
  for (const edit of edits) {
    const id = edit?.themeId;
    if (!Object.hasOwn(themes, id) || (scope && id !== scope) || Object.hasOwn(result, id)) throw new Error('行为主题不适用');
    const theme = themes[id];
    const phase = theme.mode === 'phase' ? theme.actions.at(-1).phase : undefined;
    const roleEdit = id === 'festival' && theme.role !== 'host' && ['helper', 'dancer', 'spectator'].includes(edit.role);
    const requested = roleEdit && (edit.actions == null || Array.isArray(edit.actions) && !edit.actions.length)
      ? festivalGestures(edit.role, animations) : edit.actions;
    if (!Array.isArray(requested) || !requested.length || requested.length > 5) throw new Error('每项主题需要 1–5 个动作');

    if (phase && requested.filter(action => action.generation).length > 2) throw new Error('一个活动最多准备两个新动作');
    const actions = requested.map(action => {
      const { name, animation, seconds, generation } = action;
      const kind = action.kind === 'perform' && animation === 'walk' ? 'stroll' : action.kind;
      if (typeof name !== 'string' || !name.trim() || name.length > 36 ||
          !Number.isFinite(seconds) || seconds < 1 || seconds > 120 ||
          !['wait', 'perform', 'stroll'].includes(kind)) throw new Error('动作格式不适用');
      if (kind === 'stroll' && (phase || id === 'chat')) throw new Error('活动进行时需要留在分配的站位');
      if (id === 'chat' && (generation || seconds > 8)) throw new Error('交谈动作请使用已有动画，每步至多八秒');
      const normalized = { name, kind, seconds, ...(phase ? { phase } : {}) };
      if (kind === 'stroll' && action.pace === 'run') normalized.pace = 'run';
      if (kind === 'perform') {
        if (animations.includes(animation)) normalized.animation = animation;
        else if (typeof generation?.prompt === 'string' && /^[一-鿿]{3,12}$/.test(generation.prompt)) {
          normalized.generation = { prompt: generation.prompt };
        } else throw new Error('找不到指定的动作');

      }
      return normalized;
    });
    const fixed = theme.actions.filter(action => ['activity', 'visit', 'social'].includes(action.kind));
    result[id] = { ...theme, actions: [...fixed, ...actions] };
    if (roleEdit) {
      result[id].role = edit.role;
      result[id].name = { helper: '筹备活动', dancer: '参与表演', spectator: '观看活动' }[edit.role];
      result[id].actions = result[id].actions.map(action => action.kind === 'activity'
        ? { ...action, name: { helper: '到场协助集合', dancer: '前往活动地点', spectator: '到场边找个位置' }[edit.role] } : action);
    }
  }
  return result;
}
