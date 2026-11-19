import { behaviorFingerprint, entityPosition } from './IslandWorldInformation.js';

/** Owns intention/execution progress only; PetStateMachine still owns the body. */
export class ResidentBehaviorRuntime {
  constructor({ runtime, world, body, onChanged = () => {}, saved = null }) {
    Object.assign(this, { runtime, world, body, onChanged });
    this.assets = new Map();
    this.pending = null;
    this.execution = null;
    this.suspended = false;
    this.restore(saved);
  }

  restore(saved) {
    this.cancel();
    this.plan = null; // Saved graphs must be revalidated against the restored world.
    this.saved = saved || null;
    this.directionRevision = saved?.directionRevision || null;
    this.currentStateId = null;
    this.revision = Number(saved?.revision) || 0;
    this.reason = saved?.reason || '正在了解岛屿';
    this.source = 'local';
    this.status = 'waiting';
    this.error = null;
    this.history = (saved?.history || []).slice(-8);
    this.pending = null;
    this.assets.clear();
    this.resumeElapsed = 0;
    this.completedActions = 0;
    this.externallyDriven = false;
  }

  offer(graph, { reason, source = 'ai', policy = 'afterCurrent', worldRevision, assets = new Map() }) {
    const candidate = { graph, reason, source, worldRevision, assets };
    const current = this.plan?.states.find(s => s.id === this.currentStateId);
    const next = graph.states.find(s => s.id === this.currentStateId);
    const actionKey = s => s && behaviorFingerprint({ ...s, onSuccess: null, onFailure: null });
    if (current && next && actionKey(current) === actionKey(next)) {
      // Future transitions may change without replaying the current action.
      this.install(candidate, true);
    } else if (this.execution && policy !== 'interrupt') {
      this.pending = candidate;
    } else this.install(candidate);
  }

  install(candidate, preserve = false) {
    if (!preserve) this.cancel();
    Object.assign(this, { plan: candidate.graph, reason: candidate.reason, source: candidate.source, worldRevision: candidate.worldRevision, assets: candidate.assets });
    if (!preserve) this.currentStateId = this.plan.entryStateId;
    this.pending = null;
    this.error = null;
    this.revision += 1;
    this.status = 'ready';
    this.history.push({ at: Date.now(), reason: this.reason, source: this.source, revision: this.revision });
    this.history = this.history.slice(-8);
    this.onChanged();
  }

  invalidate() {
    const state = this.plan?.states.find(s => s.id === this.currentStateId);
    if (state?.targetId && !this.world.current(state.targetId, state.targetVersion)) {
      this.cancel();
      this.plan = null;
      this.currentStateId = null;
      this.pending = null;
      this.status = 'waiting';
      this.error = '原来的地点已经改变，正在重新安排。';
      this.onChanged();
      return true;
    }
    return false;
  }

  update(dt) {
    if (this.externallyDriven) return true;
    this.invalidate();
    if (!this.runtime._canAct()) {
      if (this.execution) this.cancel(false);
      this.suspended = true;
      this.status = 'suspended';
      return true;
    }
    this.suspended = false;
    if (!this.plan) { this.status = 'waiting'; return false; }
    const state = this.plan.states.find(s => s.id === this.currentStateId);
    if (!state) return false;
    if (state.targetId && !this.world.current(state.targetId, state.targetVersion)) {
      this.finish(false, '目标已改变');
      return true;
    }
    try {
      if (!this.execution) {
        this.execution = { stateId: state.id, elapsed: state.kind === 'wait' ? this.resumeElapsed : 0, point: null, cleanup: null };
        this.resumeElapsed = 0;
        if (state.kind === 'stroll') {
          this.execution.point = this.body.stroll?.(this.runtime, this.world.resolve(state.targetId), state.pace);
          if (!this.execution.point) { this.finish(false, '附近暂时没有可走的路'); return true; }
        } else if (state.kind === 'visit') {
          this.execution.point = this.body.approach(this.runtime, this.world.resolve(state.targetId));
          if (!this.execution.point) { this.finish(false, '暂时无法到达这个地点'); return true; }
        } else {
          // A target-bearing rest/action also verifies real proximity after reload/interrupt.
          if (state.targetId && !this.body.near(this.runtime, this.world.resolve(state.targetId))) {
            this.execution.point = this.body.approach(this.runtime, this.world.resolve(state.targetId));
            this.execution.approaching = true;
            if (!this.execution.point) { this.finish(false, '暂时无法到达这个地点'); return true; }
          } else this.startPresentation(state);
        }
      }
      this.status = this.execution.point ? 'moving' : 'running';
      this.execution.elapsed += Math.max(0, dt);
      if (this.execution.point) {
        const p = entityPosition(this.runtime.pet);
        const arrived = p && Math.hypot(p.x - this.execution.point.x, p.z - this.execution.point.z) <= 0.8;
        if (arrived) {
          if (state.kind === 'visit' || state.kind === 'stroll') this.finish(true);
          else { this.execution.point = null; this.execution.approaching = false; this.execution.elapsed = 0; this.startPresentation(state); }
        } else if (this.runtime.pet.isWalking?.() === false ||
          this.execution.elapsed >= (['visit', 'stroll'].includes(state.kind) ? state.seconds : 120)) {
          this.finish(false, '道路受阻，稍后再试');
        }
      } else if (this.execution.elapsed >= state.seconds) this.finish(true);
    } catch (error) { this.finish(false, error.message); }
    return true;
  }

  startPresentation(state) {
    this.execution.cleanup = this.body.perform(this.runtime, state, this.assets.get(state.id));
  }

  finish(success, error = null) {
    const state = this.plan?.states.find(s => s.id === this.currentStateId);
    if (!state) return;
    this.cancel();
    this.error = error;
    this.status = 'ready';
    if (success && state.kind === 'visit') this.runtime.memory.remember({ type: 'behavior_arrival', summary: `到达${state.name.replace(/^前往/, '')}`, actors: [this.runtime.profile.identity.residentId], objectRefs: [state.targetId], tags: ['behavior', 'visit'], importance: 0.2, outcome: 'succeeded' });
    this.completedActions += 1;
    if (this.pending) {
      const candidate = this.pending;
      if (candidate.graph.states.every(s => !s.targetId || this.world.current(s.targetId, s.targetVersion))) this.install(candidate);
      else { this.pending = null; this.currentStateId = state[success ? 'onSuccess' : 'onFailure']; }
    } else this.currentStateId = state[success ? 'onSuccess' : 'onFailure'];
    this.onChanged();
  }

  cancel(stop = true) {
    this.execution?.cleanup?.();
    this.body.release?.(this.runtime);
    if (stop && this.execution && this.runtime._canAct()) this.runtime.pet.stopWalking?.();
    this.execution = null;
  }

  snapshot() {
    return { schemaVersion: 1, directionRevision: this.directionRevision, graph: this.plan, currentStateId: this.currentStateId, elapsed: this.execution?.elapsed || 0, revision: this.revision, worldRevision: this.worldRevision || 0, reason: this.reason, source: this.source, status: this.status, planningStatus: this.planningStatus || null, error: this.error, pending: this.pending ? { reason: this.pending.reason, graph: this.pending.graph } : null, history: this.history };
  }

  dispose() { this.cancel(); this.pending = null; }
}
