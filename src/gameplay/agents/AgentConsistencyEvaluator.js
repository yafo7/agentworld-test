export class AgentConsistencyEvaluator {
  evaluate({ agents = [], traces = [], actionRegistry = null, reasoningMetrics = null } = {}) {
    const findings = [];
    const actionIds = new Set(actionRegistry?.list?.().map(action => action.id) || []);
    for (const agent of agents) {
      if (!agent.residentId) findings.push({ severity: 'error', code: 'missing_resident_id' });
      if (agent.currentPlan?.steps?.some(step => actionIds.size && !actionIds.has(step.actionId))) {
        findings.push({ severity: 'error', code: 'unknown_planned_action', residentId: agent.residentId });
      }
      if ((agent.cognition?.dailyCalls || 0) > (agent.cognition?.dailyCallBudget || 0)) {
        findings.push({ severity: 'error', code: 'reasoning_budget_exceeded', residentId: agent.residentId });
      }
    }
    const decisionsByAgent = new Map();
    for (const trace of traces.filter(item => item.type === 'decision')) {
      const list = decisionsByAgent.get(trace.residentId) || [];
      list.push(trace.selected?.actionId);
      decisionsByAgent.set(trace.residentId, list);
    }
    for (const [residentId, actions] of decisionsByAgent) {
      const tail = actions.slice(-5);
      if (tail.length === 5 && new Set(tail).size === 1) {
        findings.push({ severity: 'warning', code: 'repetitive_behavior', residentId, actionId: tail[0] });
      }
    }
    if ((reasoningMetrics?.failures || 0) > 3) findings.push({ severity: 'warning', code: 'reasoning_failures_high' });
    const errors = findings.filter(item => item.severity === 'error').length;
    const warnings = findings.length - errors;
    return { valid: errors === 0, score: Math.max(0, 100 - errors * 20 - warnings * 5), findings };
  }
}
