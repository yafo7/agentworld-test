import { IslandWorldInformation, behaviorFingerprint } from './IslandWorldInformation.js';
import { ResidentBehaviorRuntime } from './ResidentBehaviorRuntime.js';
import { validateResidentPlan, fallbackResidentPlan } from './ResidentBehaviorPlan.js';

export function parseResidentBehaviorResponse(result) {
  return typeof result === 'string' ? JSON.parse(result.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) : result;
}

export async function withPlanningTimeout(promise, ms) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('AI 规划超时')), ms); })]); }
  finally { clearTimeout(timer); }
}

/** One debounced batch planner; independent per-resident graphs and execution. */
export class ResidentBehaviorSystem {
  constructor({ coordinator, registry, body, generationController, getClimate, getStory, scope, defaultRoutine, getPlayerDirection, intervalSeconds = 300, debounceSeconds = 2, planningTimeoutMs = 60_000, now = Date.now }) {
    Object.assign(this, { coordinator, registry, body, generationController, defaultRoutine, getPlayerDirection, intervalSeconds, debounceSeconds, planningTimeoutMs, now });
    this.world = new IslandWorldInformation({ registry, getClimate, getStory, scope, now });
    this.world.refresh('startup');
    this.elapsed = 0;
    this.dirtyElapsed = 0;
    this.dirty = true;
    this.serial = 0;
    this.job = null;
    this.disposed = false;
    this.lastError = null;
    this.lastRequestAt = null;
    this.knownFacts = new Map(registry.items.map(e => [e, this.world.describe(e)?.version]));
    this.climateCheckElapsed = 0;
    this.climateKey = this.environmentKey();
    this.unsubscribe = registry.onChange(event => {
      const version = event.type === 'removed' ? undefined : this.world.describe(event.entity)?.version;
      const previous = this.knownFacts.get(event.entity);
      if (event.type === 'removed') this.knownFacts.delete(event.entity);
      else this.knownFacts.set(event.entity, version);
      if (previous === version) return;
      this.serial += 1;
      this.dirty = true;
      this.dirtyElapsed = 0;
      for (const runtime of coordinator.runtimes.values()) runtime.behavior?.invalidate();
    });
  }

  attach(runtime) {
    runtime.behavior = new ResidentBehaviorRuntime({ runtime, world: this.world, body: this.body, saved: runtime.savedBehavior, onChanged: () => { this.coordinator.saveElapsed = 10; } });
    if (!runtime.savedBehavior?.graph) {
      const id = runtime.profile.identity.residentId;
      const routine = this.defaultRoutine?.(id, Object.keys(runtime.pet._animPlans || {}));
      if (routine) runtime.behavior.offer(routine.graph, { reason: routine.reason, source: 'default' });
      this.applyPlayerDirection(runtime);
    }
    this.serial += 1;
    this.dirty = true;
  }

  applyPlayerDirection(runtime) {
    const direction = this.getPlayerDirection?.(runtime.profile.identity.residentId);
    if (!direction?.revision || direction.revision === runtime.behavior.directionRevision && runtime.behavior.plan) return false;
    try {
      const graph = validateResidentPlan(direction.graph, { animations: Object.keys(runtime.pet._animPlans || {}) });
      if (graph.states.some(state => state.generation)) return false;
      runtime.behavior.offer(graph, { reason: direction.reason, source: 'player', policy: 'interrupt', worldRevision: this.world.publicSnapshot().revision });
      runtime.behavior.directionRevision = direction.revision;
      return true;
    } catch { return false; }
  }

  directionChanged(id) {
    const runtime = this.coordinator.runtimes.get(id);
    if (runtime && this.applyPlayerDirection(runtime)) {
      this.serial += 1;
      this.dirty = true;
      this.dirtyElapsed = 0;
      this.coordinator.flush();
    }
  }

  reset() {
    this.serial += 1;
    this.dirty = true;
    this.dirtyElapsed = 0;
    this.world.refresh('restore');
  }

  environmentKey() {
    const climate = this.world.getClimate();
    const story = this.world.getStory();
    return behaviorFingerprint({ weather: climate?.weather?.type, hour: Math.floor(climate?.time?.hour ?? 12), month: climate?.time?.month, day: story?.islandDay, chapter: story?.chapter });
  }

  update(dt) {
    if (this.disposed) return;
    this.elapsed += dt;
    this.climateCheckElapsed += dt;
    if (this.climateCheckElapsed >= 1) {
      this.climateCheckElapsed = 0;
      const key = this.environmentKey();
      if (key !== this.climateKey) { this.climateKey = key; this.serial += 1; this.dirty = true; this.dirtyElapsed = 0; }
    }
    if (this.dirty) this.dirtyElapsed += dt;
    if (!this.job && ((this.dirty && this.dirtyElapsed >= this.debounceSeconds) || this.elapsed >= this.intervalSeconds)) {
      this.request(this.dirty ? 'world_changed' : 'periodic');
    }
  }

  request(trigger = 'manual') {
    if (this.disposed || this.job) return this.job;
    this.world.refresh(trigger);
    const publicWorld = this.world.publicSnapshot();
    const runtimes = [...this.coordinator.runtimes.values()];
    const restores = [];
    // Install safe local plans immediately, including when the backend is offline.
    for (const runtime of runtimes) {
      runtime.behavior.invalidate();
      if (!runtime.behavior.plan) {
        const saved = runtime.behavior.saved;
        let fallback = this.defaultRoutine?.(runtime.profile.identity.residentId, Object.keys(runtime.pet._animPlans || {})) || fallbackResidentPlan(runtime, publicWorld);
        let restored = false;
        if (Array.isArray(saved?.graph?.states) && saved.graph.states.some(s => s.generation)) {
          try {
            const graph = validateResidentPlan(saved.graph, { objects: publicWorld.objects, animations: Object.keys(runtime.pet._animPlans || {}) });
            restores.push({ runtime, graph, saved });
          } catch { /* Invalid stored graphs cannot request generation. */ }
        }
        if (Array.isArray(saved?.graph?.states) && !saved.graph.states.some(s => s.generation)) {
          try {
            const graph = validateResidentPlan(saved.graph, { objects: publicWorld.objects, animations: Object.keys(runtime.pet._animPlans || {}) });
            fallback = { graph, reason: saved.reason, source: saved.source };
            restored = true;
          } catch { /* Removed targets must not survive a restore. */ }
        }
        runtime.behavior.saved = null;
        runtime.behavior.offer(validateResidentPlan(fallback.graph, { objects: publicWorld.objects, animations: Object.keys(runtime.pet._animPlans || {}) }), { reason: fallback.reason, source: fallback.source || (this.defaultRoutine ? 'default' : 'local'), worldRevision: publicWorld.revision });
        if (restored) {
          const current = runtime.behavior.plan.states.find(s => s.id === saved.currentStateId);
          if (current) { runtime.behavior.currentStateId = current.id; runtime.behavior.resumeElapsed = Math.min(current.seconds, Math.max(0, Number(saved.elapsed) || 0)); }
        }
      }
      if (this.applyPlayerDirection(runtime)) {
        const index = restores.findIndex(item => item.runtime === runtime);
        if (index >= 0) restores.splice(index, 1);
      }
    }
    this.dirty = false;
    this.dirtyElapsed = 0;
    this.elapsed = 0;
    this.lastRequestAt = this.now();
    const serial = this.serial;
    const epochs = runtimes.map(r => r.epoch);
    const modelOf = r => this.body.baseModel?.(r) || r.pet._originalModelJson;
    const models = runtimes.map(r => behaviorFingerprint(modelOf(r)));
    const isCurrent = () => !this.disposed && serial === this.serial && runtimes.every((r, i) => !r.disposed && r.epoch === epochs[i] && behaviorFingerprint(modelOf(r)) === models[i]);
    const context = { world: publicWorld, residents: runtimes.map(r => ({ residentId: r.profile.identity.residentId, profile: r.profile, playerDirection: this.getPlayerDirection?.(r.profile.identity.residentId)?.text || '', drives: r.state.drives, current: r.behavior.snapshot(), animations: Object.keys(r.pet._animPlans || {}).filter(k => !k.startsWith('behavior_')), memories: r.memory.episodic.slice(-4).map(m => ({ summary: m.summary, outcome: m.outcome })) })) };
    for (const r of runtimes) r.behavior.planningStatus = 'planning';
    this.job = this.plan(context, runtimes, isCurrent, restores).catch(error => {
      if (isCurrent()) {
        this.lastError = error.message;
        for (const r of runtimes) r.behavior.error = `暂用当前安排：${error.message}`;
      }
    }).finally(() => {
      for (const r of runtimes) r.behavior.planningStatus = null;
      this.job = null;
    });
    return this.job;
  }

  async plan(context, runtimes, isCurrent, restores = []) {
    for (const { runtime, graph, saved } of restores) {
      if (!isCurrent()) { this.dirty = true; return; }
      try {
        const assets = await this.body.prepare(runtime, graph, isCurrent, { cachedOnly: true });
        if (!isCurrent()) { this.dirty = true; return; }
        runtime.behavior.offer(graph, { reason: saved.reason, source: saved.source || 'ai', policy: 'interrupt', assets, worldRevision: context.world.revision });
        if (graph.states.some(s => s.id === saved.currentStateId)) runtime.behavior.currentStateId = saved.currentStateId;
        context.residents.find(r => r.residentId === runtime.profile.identity.residentId).current = runtime.behavior.snapshot();
      } catch (error) { runtime.behavior.error = error.message; }
    }
    if (!this.generationController || !runtimes.length) return;
    const completed = await withPlanningTimeout(this.generationController.run({ operation: 'resident.behavior', source: { kind: 'resident_behavior', text: '根据岛屿变化维护居民行为' }, input: { context }, semanticPlanning: 'disabled' }), this.planningTimeoutMs);
    if (!isCurrent()) { this.dirty = true; return; }
    const result = parseResidentBehaviorResponse(completed.result);
    if (!Array.isArray(result?.proposals) || result.proposals.length !== runtimes.length) throw new Error('AI 返回的居民列表不完整');
    const proposals = new Map();
    for (const p of result.proposals) {
      if (proposals.has(p.residentId) || !runtimes.some(r => r.profile.identity.residentId === p.residentId) || !['keep', 'revise', 'capabilityGap'].includes(p.decision) || typeof p.reason !== 'string') throw new Error('AI 行为响应不合法');
      proposals.set(p.residentId, p);
    }
    this.lastError = null;
    for (const r of runtimes) {
      if (!isCurrent()) { this.dirty = true; return; }
      const p = proposals.get(r.profile.identity.residentId);
      try {
        if (p.decision === 'keep') {
          r.behavior.reason = p.reason.slice(0, 200);
          r.behavior.error = null;
          continue;
        }
        if (p.decision === 'capabilityGap') { r.behavior.error = p.reason.slice(0, 200); continue; }
        const graph = validateResidentPlan(p.graph, { objects: context.world.objects, animations: Object.keys(r.pet._animPlans || {}) });
        r.behavior.planningStatus = 'preparing';
        const assets = await this.body.prepare(r, graph, isCurrent);
        if (!isCurrent()) { this.dirty = true; return; }
        r.behavior.offer(graph, { reason: p.reason.slice(0, 200), source: 'ai', policy: p.switchPolicy, worldRevision: context.world.revision, assets });
      } catch (error) {
        if (isCurrent()) r.behavior.error = `保留当前安排：${error.message}`;
      }
    }
    if (isCurrent()) this.coordinator.flush();
  }

  inspect() { return { world: this.world.publicSnapshot(), planning: Boolean(this.job), lastError: this.lastError, lastRequestAt: this.lastRequestAt, intervalSeconds: this.intervalSeconds }; }
  dispose() { this.disposed = true; this.serial += 1; this.unsubscribe(); }
}
