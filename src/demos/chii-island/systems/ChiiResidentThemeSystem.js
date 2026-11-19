import { IslandWorldInformation, behaviorFingerprint, entityPosition } from '../../../gameplay/agents/IslandWorldInformation.js';
import { parseResidentBehaviorResponse, withPlanningTimeout } from '../../../gameplay/agents/ResidentBehaviorSystem.js';
import { ResidentBehaviorRuntime } from '../../../gameplay/agents/ResidentBehaviorRuntime.js';
import { validateResidentPlan, fallbackResidentPlan } from '../../../gameplay/agents/ResidentBehaviorPlan.js';
import { describeResidentThemes, editableResidentThemes, editableThemeActions, restoreThemeEdits, validateThemeEdits } from '../data/residentThemes.js';
import { dayPeriod, dayThemesOnly, residentDay } from '../data/residentDay.js';
import { themeForActivity } from '../data/activityParticipation.js';
import { getDirection } from '../data/residentRoutines.js';

const animationsOf = runtime => Object.keys(runtime.pet._animPlans || {}).filter(key => !/^(behavior_|social_|registered_)/.test(key));
const idOf = runtime => runtime.profile.identity.residentId;
const isBuilding = object => object.tags.some(tag => /building|church|windmill|temple|建筑/.test(tag));

function executionGraph(theme, object, actionIndex) {
  const actions = theme.mode === 'choice' ? [theme.actions[actionIndex]] : theme.actions;
  const states = actions.map((action, index) => ({
    ...action, id: 'action-' + index,
    ...(object && (theme.mode === 'sequence' || action.kind === 'wait') ? { targetId: object.id } : {}),
    onSuccess: 'action-' + ((index + 1) % actions.length),
    onFailure: 'action-0',
  }));
  return { schemaVersion: 1, entryStateId: 'action-0', states };
}

/** The island selects the theme; the existing graph runner executes its local actions. */
export class ChiiResidentThemeSystem {
  constructor({ coordinator, registry, body, social, town, generationController, getClimate, getStory, scope }) {
    Object.assign(this, { coordinator, body, social, town, generationController, scope });
    this.world = new IslandWorldInformation({ registry, getClimate, getStory, scope });
    this.intervalSeconds = 300;
    this.records = new Map();
    this.elapsed = 0;
    this.poll = 0;
    this.planIn = 2;
    this.serial = 0;
    this.unsubscribe = registry.onChange(({ entity }) => {
      const fact = this.world.describe(entity);
      if (!fact && !this.world.snapshot?.objects.some(object => this.world.resolve(object.id) === entity)) return;
      const { changed } = this.world.refresh('objects_changed');
      if (changed) this.schedule();
    });
    this.world.refresh('startup');
  }

  schedule() {
    this.serial += 1;
    this.planIn = 2;
  }

  attach(runtime) {
    const id = idOf(runtime);
    const behavior = new ResidentBehaviorRuntime({ runtime, world: this.world, body: this.body });
    const record = { runtime, behavior, index: 0, chatAfter: 12 };
    this.records.set(id, record);
    const restore = behavior.restore.bind(behavior);
    behavior.restore = saved => {
      restore(null);
      Object.assign(record, { key: null, live: null, restId: null, preparation: null, proposal: null, edits: null, reason: null, error: null });
      this.loadEdits(record, saved);
    };
    const snapshot = behavior.snapshot.bind(behavior);
    behavior.snapshot = () => ({
      ...snapshot(), schemaVersion: 2, themes: this.themes(record),
      edits: Object.entries(record.edits || {}).map(([themeId, theme]) => ({
        themeId, role: theme.role, actions: editableThemeActions(theme),
      })), live: record.live, directionRevision: record.directionRevision,
      observedAt: Date.now(), notice: record.reason, error: record.error,
    });
    runtime.behavior = behavior;
    behavior.restore(runtime.savedBehavior);
    this.schedule();
  }

  loadEdits(record, saved) {
    const { runtime } = record;
    const direction = getDirection(this.scope, idOf(runtime));
    record.directionRevision = null;
    const base = describeResidentThemes(idOf(runtime), animationsOf(runtime));
    for (const data of [saved, direction]) {
      if (!data?.edits) continue;
      const edits = restoreThemeEdits(data.edits, base, animationsOf(runtime));
      record.edits = { ...record.edits, ...edits };
      record.directionRevision = data.directionRevision || data.revision || null;
    }
    record.reason = direction?.reason || null;
  }

  themes(record) {
    const id = idOf(record.runtime), animations = animationsOf(record.runtime);
    const legacy = { ...describeResidentThemes(id, animations), ...record.edits };
    return { ...legacy, ...residentDay(id, legacy), ...record.edits };
  }

  resolveActivity(id, type) {
    const record = this.records.get(id);
    if (!record) return null;
    const key = themeForActivity(type);
    return { ...this.themes(record)[key], edited: Boolean(record.edits?.[key]) };
  }

  directionChanged(id) {
    const record = this.records.get(id);
    if (!record) return;
    this.loadEdits(record, record.behavior.snapshot());
    this.schedule();
    this.coordinator.flush();
  }

  reset() {
    this.world.refresh('restore');
    this.schedule();
    for (const record of this.records.values()) record.behavior.restore(null);
  }

  update(dt) {
    this.elapsed += dt;
    this.simulatedTime = this.now + dt;
    this.planIn -= dt;
    this.poll -= dt;
    if (this.poll <= 0) {
      this.poll = 0.4;
      const hour = this.world.getClimate()?.time?.hour ?? 12;
      const story = this.world.getStory();
      this.town.updateMorningExercise?.({ hour, day: story?.islandDay || 1, date: this.world.getClimate()?.time?.date || null });
      const activity = this.town.residentActivity?.();
      const key = behaviorFingerprint({ hour: Math.floor(hour), day: story?.islandDay, weather: this.world.getClimate()?.weather?.type, event: activity?.id, phase: activity?.phase });
      if (key !== this.environment) {
        this.environment = key;
        this.world.refresh('island_changed');
        this.schedule();
      }
      let changed = false;
      for (const record of this.records.values()) {
        const before = behaviorFingerprint(record.live);
        this.select(record, activity, this.world.publicSnapshot());
        changed ||= before !== behaviorFingerprint(record.live);
      }
      if (changed) this.coordinator.flush();
    }
    if (!this.job && (this.planIn <= 0 || this.elapsed >= this.intervalSeconds)) this.request();
  }

  select(record, activity, world) {
    const { runtime, behavior } = record;
    const id = idOf(runtime);
    const themes = this.themes(record);
    const assignment = activity?.cast.find(member => member.id === id);
    const conversation = this.social.conversations.get(runtime.pet);
    behavior.externallyDriven = Boolean(assignment || conversation);
    if (assignment || conversation) {
      this.leaveLocal(record);
      record.live = assignment
        ? { themeId: assignment.themeId, activity, role: assignment.role, action: assignment.action, target: assignment.target, animation: assignment.animation }
        : { themeId: 'chat', action: conversation.action, animation: conversation.animation, target: this.records.get(conversation.targetId)?.runtime.profile.identity.displayName };
      return;
    }
    if (!runtime._canAct()) {
      this.leaveLocal(record);
      const idle = runtime.pet.petState.is('idle');
      const interacting = runtime.pet.petState.is('interacting');
      record.live = { themeId: idle ? 'daily' : interacting ? 'chat' : null,
        action: idle ? '停下来休息' : interacting ? '正在和玩家交谈'
          : runtime.pet.petState.is('following') ? '正在陪伴玩家' : '暂时忙于其他事务' };

      return;
    }
    const period = dayPeriod(this.world.getClimate()?.time?.hour ?? 12);
    const candidate = period === 'midday' && [...this.records.values()].find(other => this.canChat(record, other));
    if (candidate) {
      record.chatAfter = this.now + 35;
      candidate.chatAfter = this.now + 35;
      this.leaveLocal(record);
      behavior.externallyDriven = true;
      candidate.behavior.cancel();
      void this.social.greet(runtime, idOf(candidate.runtime)).catch(() => {});
      record.live = { themeId: 'chat', action: '向邻居问好', target: candidate.runtime.profile.identity.displayName };
      return;
    }
    const proposal = record.proposal;
    const themeId = period;
    const scheduled = themes[period];
    const position = entityPosition(runtime.pet);
    const fits = object => scheduled.place === 'building' ? isBuilding(object) : object.affordances.includes('shade') || object.affordances.includes('rest');
    const choices = scheduled.place ? world.objects.filter(fits) : [];
    const distance = item => {
      const point = entityPosition(this.world.resolve(item.id));
      return position && point ? Math.hypot(position.x - point.x, position.z - point.z) : Infinity;
    };
    const object = choices.find(o => o.id === proposal?.targetId)
      || choices.find(o => o.id === record.restId)
      || choices.sort((a, b) => (scheduled.place === 'shade' ? Number(b.affordances.includes('shade')) - Number(a.affordances.includes('shade')) : 0)
        || distance(a) - distance(b))[0];
    record.restId = object?.id;
    let theme = scheduled;
    if (scheduled.place && !object) {
      const remaining = scheduled.place === 'building' ? [] : scheduled.actions.filter(action => action.kind !== 'visit');
      theme = { ...scheduled, actions: remaining.length ? remaining : [{ kind: 'wait', name: '就地歇息', seconds: 15 }] };
    }
    const key = behaviorFingerprint({ themeId, theme, object: object?.version });
    if (record.key !== key || !behavior.plan && !record.preparation) {
      record.key = key;
      record.actionRun = behavior.completedActions;
      record.index = Math.floor(Math.random() * theme.actions.length);
      this.install(record, theme, object, world);
    } else if (theme.mode === 'choice' && record.actionRun !== behavior.completedActions && !record.preparation) {
      record.index = (record.index + 1 + Math.floor(Math.random() * Math.max(1, theme.actions.length - 1))) % theme.actions.length;
      this.install(record, theme, object, world);
    }

    record.actionRun = behavior.completedActions;
    record.live = {
      themeId, target: object?.name, reason: proposal?.reason,
      action: behavior.plan?.states.find(state => state.id === behavior.currentStateId)?.name || '稍候',
    };
  }

  get now() { return this.simulatedTime || 0; }

  canChat(record, other) {
    if (record === other || record.chatAfter > this.now || other.chatAfter > this.now ||
        !other.runtime._canAct() || this.town.activeActivity || !this.social.canGreet(record.runtime.pet, other.runtime.pet)) return false;
    const a = entityPosition(record.runtime.pet), b = entityPosition(other.runtime.pet);
    return a && b && Math.hypot(a.x - b.x, a.z - b.z) < 3.5;
  }

  leaveLocal(record) {
    if (!record.key) return;
    record.key = null;
    record.restId = null;
    record.preparation = null;
    record.behavior.cancel(false);
    record.behavior.plan = null;
  }

  install(record, theme, object, world) {
    const { runtime, behavior, index } = record;
    const graph = validateResidentPlan(executionGraph(theme, object, index), { animations: animationsOf(runtime), objects: world.objects });
    record.preparation = null;
    if (!graph.states.some(state => state.generation)) {
      behavior.offer(graph, { reason: theme.name, source: 'theme', policy: 'interrupt', worldRevision: world.revision });
      return;
    }
    const token = {};
    record.preparation = token;
    const current = () => !this.disposed && record.preparation === token;
    void this.body.prepare(runtime, graph, current).then(assets => {
      if (current()) behavior.offer(graph, { assets, reason: theme.name, source: 'theme', policy: 'interrupt', worldRevision: world.revision });
    }).catch(error => {
      if (!current()) return;
      record.error = '动作准备失败，稍后再试。' + error.message.slice(0, 70);
      const fallback = fallbackResidentPlan(runtime, world);
      behavior.offer(validateResidentPlan(fallback.graph, { objects: world.objects }), { reason: fallback.reason, source: 'local', policy: 'interrupt' });
    }).finally(() => {
      if (current()) record.preparation = null;
    });
  }

  request(trigger = 'periodic') {
    if (this.disposed || this.job) return this.job;
    this.elapsed = 0;
    this.planIn = this.intervalSeconds;
    this.world.refresh(trigger);
    const world = this.world.publicSnapshot();
    const records = [...this.records.values()];
    if (!records.length || !this.generationController) return null;
    const serial = this.serial;
    const context = { task: 'maintainThemes', world, activity: this.town.residentActivity?.(), residents: records.map(record => ({
      residentId: idOf(record.runtime), profile: record.runtime.profile, animations: animationsOf(record.runtime),
      themes: editableResidentThemes(dayThemesOnly(this.themes(record))), live: record.live,
      playerDirection: getDirection(this.scope, idOf(record.runtime))?.text || '',
    })) };
    this.job = withPlanningTimeout(this.generationController.run({
      operation: 'resident.behavior', source: { kind: 'resident_behavior', text: '根据岛况维护居民的主题行为' },
      input: { context }, semanticPlanning: 'disabled',
    }), 60_000).then(({ result }) => {
      if (this.disposed || serial !== this.serial) return;
      const data = parseResidentBehaviorResponse(result);
      if (!Array.isArray(data?.proposals)) throw new Error('没有收到居民安排');
      for (const proposal of data.proposals) {
        const record = this.records.get(proposal.residentId);
        if (!record) continue;
        const themes = this.themes(record);
        const direction = getDirection(this.scope, proposal.residentId);
        try {
          const edits = (proposal.edits || []).filter(edit => !direction?.edits?.some(playerEdit => edit.themeId === playerEdit.themeId));
          if (edits.length) record.edits = { ...record.edits, ...validateThemeEdits(edits, dayThemesOnly(themes), animationsOf(record.runtime)) };
          record.error = null;
          record.proposal = { themeId: proposal.themeId, targetId: proposal.targetId, reason: typeof proposal.reason === 'string' ? proposal.reason.slice(0, 110) : '' };
        } catch (error) { record.error = error.message; }
      }
      this.coordinator.flush();
    }).catch(error => { if (!this.disposed) this.lastError = error.message; })
      .finally(() => { this.job = null; });
    return this.job;
  }

  inspect() { return { world: this.world.publicSnapshot(), activity: this.town.residentActivity?.(), planning: Boolean(this.job), lastError: this.lastError }; }

  dispose() {
    this.disposed = true;
    this.unsubscribe();
    this.records.clear();
  }
}
