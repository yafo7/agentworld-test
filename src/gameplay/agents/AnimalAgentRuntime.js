import { AGENT_ACTION_STATUS, createAgentRuntimeSnapshot } from './AgentContracts.js';
import { AgentMemory } from './AgentMemory.js';
import { AgentSchedulePlanner } from './AgentSchedulePlanner.js';
import { AgentUtilityEvaluator } from './AgentUtilityEvaluator.js';

export class AnimalAgentRuntime {
  constructor({
    profile,
    pet,
    perception,
    arbiter,
    evaluator = new AgentUtilityEvaluator(),
    schedulePlanner = new AgentSchedulePlanner(),
    reasoning = null,
    trace = null,
    saved = null,
    now = () => Date.now(),
    random = Math.random,
    perceptionInterval = 1,
    deliberationInterval = 18,
    startImmediately = false,
  } = {}) {
    if (!profile || !pet || !perception || !arbiter) throw new TypeError('AnimalAgentRuntime requires profile, pet, perception, and arbiter');
    this.profile = profile;
    this.pet = pet;
    this.perception = perception;
    this.arbiter = arbiter;
    this.evaluator = evaluator;
    this.schedulePlanner = schedulePlanner;
    this.reasoning = reasoning;
    this.trace = trace;
    this.now = now;
    this.random = random;
    this.state = createAgentRuntimeSnapshot(profile, saved?.state);
    this.memory = new AgentMemory({ residentId: profile.identity.residentId, saved: saved?.memory });
    this.latestPerception = null;
    this.actionStatus = AGENT_ACTION_STATUS.IDLE;
    this.activeAction = null;
    this.perceptionElapsed = 0;
    this.perceptionInterval = perceptionInterval;
    this.deliberationInterval = deliberationInterval + random() * 8;
    this.deliberationElapsed = startImmediately
      ? this.deliberationInterval
      : -random() * deliberationInterval;
    this.reasoningReadyAt = startImmediately ? this.now() + 60_000 : 0;
    this.disposed = false;
    this.epoch = 0;
    this.deliberation = null;
    this.reflection = null;
    this.savedBehavior = saved?.behavior || null;
    this.behavior = null;
    this.pet._agentControlled = true;
  }

  update(dt) {
    if (this.disposed) return;
    this._updateDrives(dt);
    this.perceptionElapsed += dt;
    this.deliberationElapsed += dt;
    if (this.perceptionElapsed >= this.perceptionInterval) {
      this.perceptionElapsed = 0;
      this._refreshPerception();
    }
    if (this.behavior?.update(dt)) return;
    if (this.deliberationElapsed < this.deliberationInterval || this.activeAction) return;
    this.deliberationElapsed = 0;
    this.deliberate().catch(error => {
      this.trace?.append({ residentId: this.profile.identity.residentId, type: 'deliberation_failed', error: error.message });
    });
  }

  async deliberate({ force = false } = {}) {
    if (this.behavior?.plan) return null;
    if (!this._canAct() || this.activeAction || this.deliberation) return null;
    if (!force && this.deliberationElapsed < 0) return null;
    const operation = { epoch: this.epoch };
    this.deliberation = operation;
    try {
      return await this._deliberate(operation);
    } finally {
      if (this.deliberation === operation) this.deliberation = null;
    }
  }

  _canAct() {
    return !this.disposed && this.pet.petState?.is('free_roam')
      && !this.pet.petState.isBusy() && !this.pet._pastoralIdeaPending;
  }

  _isCurrent(operation) {
    return !this.disposed && operation.epoch === this.epoch;
  }

  async _deliberate(operation) {
    this.latestPerception ||= this._refreshPerception();
    const candidates = this.evaluator.candidates(this, this.latestPerception)
      .filter(candidate => this.arbiter.registry.get(candidate.actionId));
    if (!candidates.length) return null;
    const memories = this.memory.retrieve({
      text: candidates[0].reason,
      tags: [candidates[0].actionId],
      actors: this.latestPerception.nearbyResidents.map(item => item.id),
    }, { limit: 5, now: this.now() });
    let selected = candidates[0];
    if (this.reasoning?.selectAction && this._canUseReasoning(candidates)) {
      try {
        const reasoned = await this.reasoning.selectAction({ runtime: this, perception: this.latestPerception, candidates, memories });
        if (!this._isCurrent(operation)) return null;
        // Reasoning may select only an existing action/target pair.
        selected = candidates.find(candidate => candidate.actionId === reasoned?.actionId
          && (candidate.targetId ?? null) === (reasoned?.targetId ?? null))
          || selected;
        this.state.cognition.dailyCalls += 1;
      } catch (error) {
        if (!this._isCurrent(operation)) return null;
        this.trace?.append({ residentId: this.profile.identity.residentId, type: 'reasoning_failed', error: error.message });
      }
    }
    if (!this._isCurrent(operation) || !this._canAct() || this.behavior?.plan) return null;
    this.state.cognition.lastPlanAt = this.now();
    this.state.currentPlan = {
      goalId: `goal:${selected.actionId}`,
      reason: selected.reason,
      steps: [{ ...selected }],
      currentStep: 0,
      createdAt: this.now(),
    };
    this.trace?.append({
      residentId: this.profile.identity.residentId,
      type: 'decision',
      candidates,
      selected,
      memoryIds: memories.map(memory => memory.id),
    });
    return this._execute(selected, operation);
  }

  async _execute(proposal, operation = { epoch: this.epoch }) {
    this.activeAction = proposal;
    this.actionStatus = AGENT_ACTION_STATUS.EXECUTING;
    try {
      const outcome = await this.arbiter.execute(this, proposal);
      if (!this._isCurrent(operation)) return null;
      this.actionStatus = outcome.status;
      if (outcome.status === AGENT_ACTION_STATUS.SUCCEEDED) {
        const event = this.memory.remember({
          type: 'agent_action',
          actors: [this.profile.identity.residentId],
          objectRefs: proposal.targetId ? [proposal.targetId] : [],
          summary: proposal.reason,
          tags: [proposal.actionId],
          outcome: 'succeeded',
          importance: proposal.actionId.startsWith('routine.') ? 0.18 : 0.55,
        });
        this._reflectIfNeeded(event).catch(error => {
          this.trace?.append({ residentId: this.profile.identity.residentId, type: 'reflection_failed', error: error.message });
        });
      }
      return outcome;
    } finally {
      if (this._isCurrent(operation)) {
        this.activeAction = null;
        if (this.actionStatus !== AGENT_ACTION_STATUS.AWAITING_APPROVAL) this.actionStatus = AGENT_ACTION_STATUS.IDLE;
      }
    }
  }

  _canUseReasoning(candidates) {
    return candidates.length > 1
      && this.state.cognition.dailyCalls < this.state.cognition.dailyCallBudget
      && this.now() >= this.reasoningReadyAt
      && this.now() - this.state.cognition.lastPlanAt >= 60_000;
  }

  async _reflectIfNeeded(event) {
    if (this.disposed || this.reflection) return null;
    if (!this.reasoning?.reflect || this.memory.reflectionPressure < 3.2) return null;
    if (this.state.cognition.dailyCalls >= this.state.cognition.dailyCallBudget) return null;
    if (this.now() - this.state.cognition.lastReflectionAt < 300_000) return null;
    const memories = this.memory.retrieve({ text: event.summary, tags: event.tags }, { limit: 8, now: this.now() });
    const operation = { epoch: this.epoch };
    this.reflection = operation;
    try {
      const reflection = await this.reasoning.reflect({ runtime: this, memories });
      if (!this._isCurrent(operation)) return null;
      if (!reflection?.summary) return null;
      this.state.cognition.dailyCalls += 1;
      this.state.cognition.lastReflectionAt = this.now();
      const saved = this.memory.addReflection(reflection);
      this.trace?.append({ residentId: this.profile.identity.residentId, type: 'reflection', reflection: saved });
      return saved;
    } finally {
      if (this.reflection === operation) this.reflection = null;
    }
  }

  _updateDrives(dt) {
    this.state.drives.energy = Math.max(0.1, this.state.drives.energy - dt * 0.0006);
    this.state.drives.curiosity = Math.min(1, this.state.drives.curiosity + dt * 0.0004);
    this.state.drives.sociability = Math.min(1, this.state.drives.sociability + dt * 0.00025);
  }

  _refreshPerception() {
    this.latestPerception = this.perception.perceive(this);
    this.state.cognition.lastPerceptionAt = this.latestPerception.at;
    this._syncIslandDay(this.latestPerception.story?.islandDay);
    this.schedulePlanner.update(this, this.latestPerception);
    return this.latestPerception;
  }

  _syncIslandDay(islandDay) {
    const nextDay = Math.max(1, Number(islandDay) || 1);
    const previousDay = Math.max(1, Number(this.state.schedule.islandDay) || 1);
    if (nextDay === previousDay) return;
    this.state.schedule.islandDay = nextDay;
    this.state.cognition.dailyCalls = 0;
  }

  snapshot() {
    return { state: structuredClone(this.state), memory: this.memory.snapshot(), ...(this.behavior ? { behavior: this.behavior.snapshot() } : {}) };
  }

  restore(saved = {}) {
    if (this.disposed) return;
    this.epoch += 1;
    this.savedBehavior = saved.behavior || null;
    this.behavior?.restore(saved.behavior);
    this.deliberation = null;
    this.reflection = null;
    this.state = createAgentRuntimeSnapshot(this.profile, saved.state);
    this.memory = new AgentMemory({ residentId: this.profile.identity.residentId, saved: saved.memory });
    this.latestPerception = null;
    this.activeAction = null;
    this.actionStatus = AGENT_ACTION_STATUS.IDLE;
  }

  dispose() {
    if (this.disposed) return;
    this.behavior?.dispose();
    this.disposed = true;
    this.epoch += 1;
    this.deliberation = null;
    this.reflection = null;
    this.activeAction = null;
    this.pet._agentControlled = false;
  }
}
