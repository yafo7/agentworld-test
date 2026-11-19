function phaseForHour(hour) {
  const value = Number(hour);
  if (!Number.isFinite(value)) return 'afternoon';
  if (value >= 5 && value < 12) return 'morning';
  if (value >= 12 && value < 18) return 'afternoon';
  return 'evening';
}

export class AgentSchedulePlanner {
  update(runtime, perception) {
    const phase = phaseForHour(perception?.climate?.hour);
    const anchors = runtime.profile.scheduleTemplate || [];
    const anchor = anchors.find(item => item.phase === phase) || anchors[0] || null;
    runtime.state.schedule.current = anchor ? { ...anchor } : { phase, activity: '自由生活' };

    if (!runtime.state.goals.active) {
      const value = runtime.profile.personality.values[0]?.id || '照顾小岛';
      runtime.state.goals.active = {
        id: `resident-life:${value}`,
        label: `让${value}成为今天生活的一部分`,
        source: 'personality',
      };
    }
    return runtime.state.schedule.current;
  }
}

export { phaseForHour as getAgentDayPhase };
