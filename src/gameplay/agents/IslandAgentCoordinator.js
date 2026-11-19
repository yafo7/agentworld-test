import { AnimalAgentRuntime } from './AnimalAgentRuntime.js';

export class IslandAgentCoordinator {
  constructor({
    perception,
    arbiter,
    profileResolver,
    store = null,
    reasoning = null,
    trace = null,
    onChanged = null,
    runtimeOptions = null,
  } = {}) {
    if (!perception || !arbiter || !profileResolver) throw new TypeError('IslandAgentCoordinator requires perception, arbiter, and profileResolver');
    this.perception = perception;
    this.arbiter = arbiter;
    this.profileResolver = profileResolver;
    this.store = store;
    this.reasoning = reasoning;
    this.trace = trace;
    this.onChanged = onChanged;
    this.runtimeOptions = runtimeOptions || {};
    this.runtimes = new Map();
    this.saveElapsed = 0;
    this.disposed = false;
  }

  registerPet(pet) {
    if (this.disposed) return null;
    const profile = this.profileResolver(pet);
    if (!profile) return null;
    const id = profile.identity.residentId;
    if (this.runtimes.has(id)) return this.runtimes.get(id);
    const runtime = new AnimalAgentRuntime({
      profile,
      pet,
      perception: this.perception,
      arbiter: this.arbiter,
      reasoning: this.reasoning,
      trace: this.trace,
      saved: this.store?.load(id),
      ...this.runtimeOptions,
    });
    this.runtimes.set(id, runtime);
    this.behaviorSystem?.attach(runtime);
    this.trace?.append({ residentId: id, type: 'registered' });
    return runtime;
  }

  update(dt) {
    if (this.disposed) return;
    this.behaviorSystem?.update(dt);
    for (const runtime of this.runtimes.values()) runtime.update(dt);
    this.saveElapsed += dt;
    if (this.saveElapsed >= 10) {
      this.saveElapsed = 0;
      this.flush();
    }
  }

  getRuntime(residentId) {
    return this.runtimes.get(residentId) || null;
  }

  snapshot() {
    return Object.fromEntries([...this.runtimes].map(([id, runtime]) => [id, runtime.snapshot()]));
  }

  restore(snapshots = {}) {
    if (this.disposed) return;
    this.behaviorSystem?.reset();
    for (const [id, saved] of Object.entries(snapshots || {})) {
      const runtime = this.runtimes.get(id);
      if (!runtime) continue;
      runtime.restore(saved);
    }
    this.store?.replaceAll?.(snapshots);
  }

  flush() {
    const snapshot = this.snapshot();
    if (this.store?.saveMany) this.store.saveMany(snapshot);
    else for (const [id, saved] of Object.entries(snapshot)) this.store?.save(id, saved);
    this.onChanged?.(snapshot);
    return snapshot;
  }

  inspect() {
    return [...this.runtimes.values()].map(runtime => ({
      residentId: runtime.profile.identity.residentId,
      state: runtime.pet.petState?.current || null,
      drives: { ...runtime.state.drives },
      mood: { ...runtime.state.mood },
      currentPlan: structuredClone(runtime.state.currentPlan),
      behavior: runtime.behavior?.snapshot() || null,
      actionStatus: runtime.actionStatus,
      perception: structuredClone(runtime.latestPerception),
      memories: runtime.memory.episodic.length,
      relationships: structuredClone(runtime.memory.relationships),
    }));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.behaviorSystem?.dispose();
    try {
      this.flush();
    } finally {
      for (const runtime of this.runtimes.values()) runtime.dispose();
      this.runtimes.clear();
    }
  }
}
