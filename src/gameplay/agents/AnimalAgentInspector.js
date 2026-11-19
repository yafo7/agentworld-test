import { AgentConsistencyEvaluator } from './AgentConsistencyEvaluator.js';
import { AgentReplayHarness } from './AgentReplayHarness.js';

export class AnimalAgentInspector {
  constructor({ coordinator, trace, actionRegistry, reasoning = null, captureInterval = 30 } = {}) {
    this.coordinator = coordinator;
    this.trace = trace;
    this.actionRegistry = actionRegistry;
    this.reasoning = reasoning;
    this.evaluator = new AgentConsistencyEvaluator();
    this.replay = new AgentReplayHarness();
    this.captureInterval = Math.max(5, Number(captureInterval) || 30);
    this.captureElapsed = 0;
  }

  update(dt) {
    this.captureElapsed += Math.max(0, Number(dt) || 0);
    if (this.captureElapsed < this.captureInterval) return null;
    this.captureElapsed %= this.captureInterval;
    return this.capture('periodic');
  }

  inspect() { return this.coordinator.inspect(); }
  traces(options = {}) { return this.trace.list(options); }
  memory(residentId) { return this.coordinator.getRuntime(residentId)?.memory.snapshot() || null; }
  async deliberate(residentId) { return this.coordinator.getRuntime(residentId)?.deliberate({ force: true }) || null; }
  capture(label = 'manual') { return this.replay.record(label, this.coordinator.snapshot(), this.trace.list().length); }
  exportReplay() { return this.replay.export(); }

  dispose() {
    this.replay.clear();
  }

  evaluate() {
    const agents = [...this.coordinator.runtimes.values()].map(runtime => ({
      residentId: runtime.profile.identity.residentId,
      currentPlan: runtime.state.currentPlan,
      cognition: runtime.state.cognition,
    }));
    return this.evaluator.evaluate({
      agents,
      traces: this.trace.list(),
      actionRegistry: this.actionRegistry,
      reasoningMetrics: this.reasoning?.getMetrics?.(),
    });
  }
}
