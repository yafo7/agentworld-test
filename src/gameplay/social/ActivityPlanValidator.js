const ACTIVITY_TYPES = new Set([
  'campfire',
  'apple_pick',
  'greeting',
  'custom_daily',
  'party',
  'birthday',
  'new_year',
  'custom_festival',
]);

const ACTIVITY_SCALES = new Set(['daily', 'festival']);
const LOCATION_IDS = new Set(['church_square', 'campfire', 'apple_tree']);
const PROP_OPERATIONS = new Set(['generate', 'library']);
const REQUIRED_DIALOGUE_INITIATORS = Object.freeze({
  campfire: 'fangk',
  apple_pick: 'mako',
  greeting: 'lingq',
  party: 'fangk',
  birthday: 'fangk',
  new_year: 'fangk',
  custom_festival: 'fangk',
});

function shortText(value, fallback, maxLength = 24) {
  const text = String(value || '').trim() || fallback;
  return Array.from(text).slice(0, maxLength).join('');
}

function uniqueStrings(values) {
  return [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];
}

function normalizeProps(props) {
  return (Array.isArray(props) ? props : []).slice(0, 3).map((prop, index) => ({
    id: shortText(prop?.id, `prop_${index + 1}`, 32),
    name: shortText(prop?.name, '活动道具', 16),
    operation: PROP_OPERATIONS.has(prop?.operation) ? prop.operation : 'generate',
    prompt: shortText(prop?.prompt, '彩色木制节日装饰', 20),
    footprint: {
      width: Math.max(1, Math.min(6, Math.ceil(Number(prop?.footprint?.width) || 2))),
      depth: Math.max(1, Math.min(6, Math.ceil(Number(prop?.footprint?.depth) || 2))),
    },
    lifetime: 'activity',
  }));
}

function normalizeDialogueLine(line) {
  if (!line || typeof line !== 'object') return null;
  return {
    speakerId: shortText(line.speakerId, 'fangk', 32),
    text: shortText(line.text, '大家玩得很开心。', 48),
  };
}

function normalizeBeats(beats, scale) {
  const defaults = scale === 'daily'
    ? ['invite', 'gather', 'perform', 'reaction', 'wind_down']
    : ['invite', 'gather', 'perform', 'festival_hold', 'host_exit'];
  return uniqueStrings(Array.isArray(beats) ? beats : defaults)
    .slice(0, 10)
    .map(beat => shortText(beat, 'perform', 24));
}

export function validateActivityPlan(plan, {
  availablePetIds = [],
  availableObjectIds = [],
} = {}) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new TypeError('Activity plan must be an object');
  }
  if (!ACTIVITY_TYPES.has(plan.type)) throw new TypeError(`Unsupported activity type: ${plan.type}`);

  const scale = ACTIVITY_SCALES.has(plan.scale)
    ? plan.scale
    : (['party', 'birthday', 'new_year', 'custom_festival'].includes(plan.type) ? 'festival' : 'daily');
  const participants = uniqueStrings(plan.participants);
  if (participants.length === 0) throw new TypeError('Activity plan requires participants');

  const knownPets = new Set(availablePetIds);
  if (knownPets.size > 0) {
    const missing = participants.filter(id => !knownPets.has(id));
    if (missing.length) throw new TypeError(`Unknown activity pets: ${missing.join(', ')}`);
  }

  const hostId = shortText(plan.hostId, 'fangk', 32);
  if (knownPets.size > 0 && !knownPets.has(hostId)) throw new TypeError(`Unknown activity host: ${hostId}`);
  if (hostId !== 'fangk') throw new TypeError('Town activities must be ended through fangk dialogue');
  const initiatorId = shortText(plan.initiatorId, hostId, 32);
  if (knownPets.size > 0 && !knownPets.has(initiatorId)) {
    throw new TypeError(`Unknown activity initiator: ${initiatorId}`);
  }
  const requiredInitiator = REQUIRED_DIALOGUE_INITIATORS[plan.type];
  if (requiredInitiator && initiatorId !== requiredInitiator) {
    throw new TypeError(`${plan.type} must start through ${requiredInitiator} dialogue`);
  }
  if (plan.type === 'custom_daily' && !participants.includes(initiatorId)) {
    throw new TypeError('Custom daily activity must include its dialogue initiator');
  }
  const locationId = LOCATION_IDS.has(plan.locationId) ? plan.locationId : 'church_square';
  const targetObjectIds = uniqueStrings(plan.targetObjectIds);
  const knownObjects = new Set(availableObjectIds);
  if (knownObjects.size > 0) {
    const missing = targetObjectIds.filter(id => !knownObjects.has(id));
    if (missing.length) throw new TypeError(`Unknown activity objects: ${missing.join(', ')}`);
  }

  const prompts = {};
  for (const petId of participants) {
    prompts[petId] = shortText(plan.actionPrompts?.[petId], '开心挥手互动', 12);
  }

  const autoEnd = plan.autoEnd === undefined ? scale === 'daily' : !!plan.autoEnd;
  const performanceDuration = autoEnd
    ? Math.max(2, Math.min(30, Number(plan.performanceDuration) || 4))
    : 0;
  const reaction = normalizeDialogueLine(plan.dialogue?.reaction);
  const ambient = (Array.isArray(plan.dialogue?.ambient) ? plan.dialogue.ambient : [])
    .map(normalizeDialogueLine)
    .filter(Boolean)
    .slice(0, 6);

  return {
    id: shortText(plan.id, `activity_${Date.now().toString(36)}`, 48),
    type: plan.type,
    scale,
    title: shortText(plan.title, scale === 'festival' ? '城镇小庆典' : '城镇小活动', 20),
    hostId,
    initiatorId,
    subjectId: plan.subjectId ? shortText(plan.subjectId, '', 32) : null,
    concept: plan.concept ? shortText(plan.concept, '', 80) : null,
    participants,
    locationId,
    targetObjectIds,
    actionPrompts: prompts,
    props: normalizeProps(plan.props),
    autoEnd,
    performanceDuration,
    beats: normalizeBeats(plan.beats, scale),
    dialogue: {
      proposal: shortText(plan.dialogue?.proposal, '要不要一起参加？', 48),
      accept: shortText(plan.dialogue?.accept || plan.dialogue?.start, '好，我们出发。', 48),
      start: shortText(plan.dialogue?.start, '好耶，大家一起动起来！', 48),
      ready: shortText(plan.dialogue?.ready, '准备完成，热闹马上开场！', 48),
      waiting: shortText(plan.dialogue?.waiting, '先别急着收工，我们还能再玩一会儿！', 48),
      reaction,
      ambient,
      end: shortText(plan.dialogue?.end, '今天就到这里，笑声记得带回家！', 48),
    },
    holdUntilHostExit: !autoEnd,
    cleanup: autoEnd ? 'automatic' : 'host_dialogue',
    entry: Object.freeze({ type: 'pet_dialogue', petId: initiatorId }),
    exit: autoEnd
      ? Object.freeze({ type: 'automatic' })
      : Object.freeze({ type: 'pet_dialogue', petId: 'fangk', confirmation: true }),
  };
}

export const SOCIAL_ACTIVITY_TYPES = Object.freeze([...ACTIVITY_TYPES]);
