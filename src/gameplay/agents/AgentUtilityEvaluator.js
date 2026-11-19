function preferenceScore(profile, tags = []) {
  const preferred = profile.preferences.objects || {};
  return tags.reduce((score, tag) => score + (Number(preferred[tag]) || 0), 0);
}

function recentPenalty(memory, actionId) {
  const recent = memory.episodic.slice(-4);
  return recent.filter(event => event.tags.includes(actionId)).length * 0.12;
}

export class AgentUtilityEvaluator {
  candidates(runtime, perception) {
    const { drives } = runtime.state;
    const profile = runtime.profile;
    const dayPhase = runtime.state.schedule.current?.phase || 'afternoon';
    const candidates = [
      {
        actionId: 'routine.idle',
        reason: drives.energy < 0.35 ? '想安静休息一会儿' : '想停下来看看岛上',
        score: 0.22 + (1 - drives.energy) * 0.72 + (dayPhase === 'evening' ? 0.08 : 0),
      },
      {
        actionId: 'routine.wander',
        reason: '想在附近散散步',
        score: 0.3 + drives.curiosity * 0.35 + (dayPhase === 'morning' ? 0.08 : 0),
      },
    ];
    const object = perception.nearbyObjects[0];
    if (object) {
      candidates.push({
        actionId: 'routine.observe',
        targetId: object.id,
        reason: `想看看${object.name}`,
        score: 0.28 + drives.curiosity * 0.42 + preferenceScore(profile, object.tags) * 0.2,
      });
    }
    const resident = perception.nearbyResidents.find(item => item.state === 'free_roam' || item.state === 'idle');
    if (resident) {
      const relationship = runtime.memory.getRelationship(resident.id);
      candidates.push({
        actionId: 'social.greet',
        targetId: resident.id,
        reason: `想和${resident.name}打个招呼`,
        score: 0.24 + drives.sociability * 0.52 + relationship.affection * 0.12 + (dayPhase === 'evening' ? 0.1 : 0),
      });
      if (relationship.familiarity >= 0.08 || relationship.affection >= 0.08) {
        candidates.push({
          actionId: 'social.cooperate',
          targetId: resident.id,
          reason: `想和${resident.name}一起玩一小会儿`,
          score: 0.18 + drives.sociability * 0.4 + relationship.trust * 0.18 - relationship.tension * 0.24,
        });
      }
    }
    const canShapeWorld = profile.capabilities.some(capability => capability.actionIds.includes('world.propose'));
    if (canShapeWorld && !runtime.pet._pastoralIdeaPending) {
      candidates.push({
        actionId: 'world.propose',
        reason: '想让附近变得更适合生活',
        score: 0.08 + drives.purpose * 0.34 + drives.curiosity * 0.18 + (dayPhase === 'afternoon' ? 0.08 : 0),
      });
    }
    if (profile.capabilities.some(capability => capability.actionIds.includes('activity.propose'))) {
      candidates.push({
        actionId: 'activity.propose',
        reason: '想邀请大家做点有趣的小事',
        score: 0.08 + drives.sociability * 0.42 + drives.purpose * 0.15,
      });
    }
    if (profile.capabilities.some(capability => capability.actionIds.includes('building.propose'))) {
      candidates.push({
        actionId: 'building.propose',
        reason: '发现一块值得好好利用的空地',
        score: 0.08 + drives.purpose * 0.5,
      });
    }
    return candidates.map(candidate => ({
      ...candidate,
      score: Math.max(0, candidate.score - recentPenalty(runtime.memory, candidate.actionId)),
    })).sort((a, b) => b.score - a.score);
  }
}
