const KINDS = new Set(['wait', 'visit', 'perform', 'stroll']);
const boundedText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

/** No scripts, arbitrary actions, coordinate injection or implicit world effects. */
export function validateResidentPlan(graph, { objects = [], animations = [] } = {}) {
  if (graph?.schemaVersion !== 1 || !Array.isArray(graph.states) || graph.states.length < 1 || graph.states.length > 12) throw new Error('行为图需要 1–12 个状态');
  const ids = new Set();
  const targets = new Map(objects.map(o => [o.id, o]));
  const states = graph.states.map(s => {
    if (!boundedText(s.id, 48) || ids.has(s.id) || !boundedText(s.name, 40) || !KINDS.has(s.kind)) throw new Error('行为状态不合法');
    ids.add(s.id);
    if (!Number.isFinite(s.seconds) || s.seconds < 1 || s.seconds > 120) throw new Error('状态时长需为 1–120 秒');
    const kind = s.kind === 'perform' && !s.generation && s.animation === 'walk' ? 'stroll' : s.kind;
    const result = { id: s.id, name: s.name, kind, seconds: s.seconds, onSuccess: s.onSuccess, onFailure: s.onFailure };
    if (kind === 'stroll' && s.pace === 'run') result.pace = 'run';
    if (s.kind === 'visit' || s.targetId != null) {
      const target = targets.get(s.targetId);
      if (!target) throw new Error('行为目标已不存在');
      result.targetId = target.id;
      result.targetVersion = target.version;
    }
    if (kind === 'perform') {
      if (s.generation) {
        if (!boundedText(s.generation.prompt, 12) || !/[\u3400-\u9fff]/.test(s.generation.prompt)) throw new Error('新动作需要 12 字以内中文表现指令');
        result.generation = { prompt: s.generation.prompt };
        if (s.generation.modelChange != null) {
          if (!boundedText(s.generation.modelChange, 32)) throw new Error('模型修改指令过长');
          result.generation.modelChange = s.generation.modelChange;
        }
      } else {
        if (!animations.includes(s.animation)) throw new Error(`行为引用了未提供的动作：${String(s.animation || '未指定').slice(0, 40)}`);
        result.animation = s.animation;
      }
    }
    return result;
  });
  if (!ids.has(graph.entryStateId)) throw new Error('行为图缺少入口');
  for (const s of states) if (!ids.has(s.onSuccess) || !ids.has(s.onFailure)) throw new Error('状态跳转不闭合');
  const reached = new Set();
  const queue = [graph.entryStateId];
  while (queue.length) {
    const id = queue.pop();
    if (reached.has(id)) continue;
    reached.add(id);
    const s = states.find(item => item.id === id);
    queue.push(s.onSuccess, s.onFailure);
  }
  if (reached.size !== states.length) throw new Error('行为图存在不可达状态');
  return { schemaVersion: 1, entryStateId: graph.entryStateId, states };
}

export function fallbackResidentPlan(runtime, world) {
  const candidates = world.objects.filter(o => o.affordances.includes('rest'));
  const prefs = runtime.profile.preferences?.objects || {};
  const target = [...candidates].sort((a, b) => {
    const score = o => (o.affordances.includes('shade') ? Number(prefs.tree || prefs.garden || 0) : Number(prefs.building || 0)) + o.tags.reduce((n, t) => n + Number(prefs[t] || 0), 0);
    return score(b) - score(a) || a.id.localeCompare(b.id);
  })[0];
  if (!target) return { graph: { schemaVersion: 1, entryStateId: 'wait', states: [{ id: 'wait', name: '在附近休息', kind: 'wait', seconds: 30, onSuccess: 'wait', onFailure: 'wait' }] }, reason: '暂时没有合适的休息地点，留在附近等待。' };
  return { reason: `目前可以在${target.name}附近休息。`, graph: { schemaVersion: 1, entryStateId: 'approach', states: [
    { id: 'approach', name: `前往${target.name}`, kind: 'visit', targetId: target.id, seconds: 120, onSuccess: 'rest', onFailure: 'pause' },
    { id: 'rest', name: '在这里休息', kind: 'wait', targetId: target.id, seconds: 45, onSuccess: 'rest', onFailure: 'pause' },
    { id: 'pause', name: '等待道路畅通', kind: 'wait', seconds: 30, onSuccess: 'approach', onFailure: 'approach' },
  ] } };
}
