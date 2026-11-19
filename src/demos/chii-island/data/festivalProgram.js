import { RESIDENT_THEME_ROLES } from './residentThemes.js';

const roles = ['host', 'helper', 'dancer', 'spectator', 'participant'];
const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const requirePlan = (ok, message) => { if (!ok) throw new Error(message); };

// A planner sometimes borrows a clip from another resident. Translate recognizable
// stage directions into a Quick Motion request, never play a missing clip.
const stageGestures = [
  { key: 'wave', name: /挥手|挥臂|招手|指挥/, prompt: '抬起前肢左右挥动' },
  { key: 'dance', name: /跳舞|舞动|起舞|领舞|伴舞|独舞|舞步/, prompt: '跟随节拍左右踏步摆动身体' },
  { key: 'nod', name: /点头|颔首/, prompt: '身体前倾轻轻点头' },
  { key: 'jump', name: /跳跃|蹦跳/, prompt: '原地轻轻向上跳起' },
  { key: 'exercise', name: /体操|热身/, prompt: '原地舒展身体左右摆动' },
  { key: 'clap', name: /击掌|鼓掌|拍手/, prompt: '跟着节拍连续拍手' },
];

function bindMotion(step, base, resident) {
  const clip = typeof step.animation === 'string' ? step.animation.trim().toLowerCase() : '';
  const available = key => key !== 'walk' && resident.animations.includes(key);
  const play = key => ({ ...base, kind: key === 'idle' ? 'wait' : 'perform', animation: key });
  const generate = prompt => ({ ...base, kind: 'perform', generation: { prompt } });
  if (clip && available(clip)) return play(clip);
  const prompt = typeof step.prompt === 'string' ? step.prompt.trim().replace(/[，、。！\s]/g, '') : '';
  if (/^[\u3400-\u9fff]{3,12}$/.test(prompt)) return generate(prompt);
  const gesture = stageGestures.find(g => g.name.test(base.name)) || stageGestures.find(g => g.key === clip);
  if (gesture) return available(gesture.key) ? play(gesture.key) : generate(gesture.prompt);
  if (/^[\u3400-\u9fff]{3,12}$/.test(base.name) && /摇|踏|敲|举|抬|摆|拍|转身|展翅|跺脚|鞠躬/.test(base.name)) return generate(base.name);
  throw new Error(`${resident.id}「${base.name}」需要该居民已有的动画（${resident.animations.filter(available).join('、')}）或具体中文 prompt`);
}

// Compile AI data into a finite program. Bindings contain clips or a constrained
// generation request. Event and resident references are checked before any assets are requested.
export function compileFestivalProgram(raw, residents) {
  requirePlan(Array.isArray(raw.events) && raw.events.length > 0 && raw.events.length <= 5, '节日需要一至五项节目');
  const events = raw.events.map(e => ({ id: text(e.id, 32), name: text(e.name, 28) }));
  const ids = new Set(events.map(e => e.id));
  requirePlan(ids.size === events.length && events.every(e => /^[\w-]+$/.test(e.id) && e.name), '节目编号或名称无效');
  const cast = {};
  for (const resident of residents) {
    const entry = raw.cast?.[resident.id];
    requirePlan(entry && roles.includes(entry.role) && Array.isArray(entry.steps) && entry.steps.length > 0 && entry.steps.length <= 6, '缺少有效分工：' + resident.id);
    const steps = entry.steps.map(s => {
      requirePlan(ids.has(s.eventId) && text(s.name, 36), '居民动作需要对应已列出的节目');
      const seconds = Math.max(2, Math.min(12, Math.round(Number(s.seconds) || 4)));
      const base = { eventId: s.eventId, name: text(s.name, 36), seconds };
      return bindMotion(s, base, resident);
    });
    cast[resident.id] = { role: resident.id === 'fangk' ? 'host' : entry.role === 'host' ? 'participant' : entry.role, steps };
  }
  const links = [];
  for (const edge of (Array.isArray(raw.links) ? raw.links : []).slice(0, 18)) {
    if (Object.hasOwn(cast, edge.from) && Object.hasOwn(cast, edge.to) && edge.from !== edge.to && text(edge.label, 18)) {
      links.push({ from: edge.from, to: edge.to, label: text(edge.label, 18) });
    }
  }
  for (const event of events) {
    event.seconds = Math.max(...Object.values(cast).map(member => member.steps.filter(s => s.eventId === event.id).reduce((n, s) => n + s.seconds, 0)));
    requirePlan(event.seconds > 0, '每项节目都需要参与居民');
  }
  return { events, cast, links };
}

export function programAssignment(program, id) {
  const member = program.cast[id];
  const actions = [];
  for (const event of program.events) {
    const steps = member.steps.filter(s => s.eventId === event.id);
    actions.push(...steps);
    const spare = event.seconds - steps.reduce((n, s) => n + s.seconds, 0);
    if (spare > 0) actions.push({ eventId: event.id, kind: 'wait', name: '在场边观看' + event.name, seconds: spare });
  }
  return { themeId: 'festival', role: member.role, actions };
}

export function festivalNetwork(program) {
  const members = Object.entries(program.cast);
  const edges = [];
  for (let i = 0; i < members.length; i++) {
    const [a, first] = members[i];
    for (const [b, second] of members.slice(i + 1)) {
      const direct = program.links.find(l => (l.from === a && l.to === b) || (l.to === a && l.from === b));
      const shared = program.events.filter(e => first.steps.some(s => s.eventId === e.id) && second.steps.some(s => s.eventId === e.id));
      if (direct || shared.length) edges.push({ from: a, to: b, label: direct?.label || shared.map(e => e.name).join('、'), direct: Boolean(direct) });
    }
  }
  const nodes = members.map(([id, m]) => {
    const weight = (m.role === 'host' ? 4 : m.role === 'spectator' ? 0 : 1) + new Set(m.steps.map(s => s.eventId)).size +
      m.steps.reduce((n, s) => n + (s.kind === 'wait' ? 0.15 : 0.7), 0) + edges.filter(e => e.direct && (e.from === id || e.to === id)).length * 0.45;
    return { id, name: id === 'crab' ? '蟹蟹' : id, role: RESIDENT_THEME_ROLES[m.role], weight };
  }).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  nodes.forEach((node, index) => {
    const relative = node.weight / nodes[0].weight;
    const angle = 2 * Math.PI * (index - 1) / Math.max(1, nodes.length - 1) - Math.PI / 2;
    const radius = 1 - relative * 0.35;
    Object.assign(node, { x: index ? 50 + Math.cos(angle) * 44 * radius : 50,
      y: index ? 48 + Math.sin(angle) * 44 * radius : 48, size: 34 + 32 * relative });
  });
  return { nodes, edges };
}
