import { PET_STATES, getPetStateMachine } from '../pets/PetStateMachine.js';

function abortError() {
  const error = new Error('Agent social interaction was aborted');
  error.name = 'AbortError';
  return error;
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const abort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function positionOf(pet) { return pet?.getPosition?.() || pet?.mesh?.position || null; }

export class AgentSocialService {
  constructor({ getRuntime, bubbles = null, trace = null, wait = delay } = {}) {
    this.getRuntime = getRuntime;
    this.bubbles = bubbles;
    this.trace = trace;
    this.wait = wait;
    this.active = new Set();
    this.conversations = new Map();
    this.abortController = new AbortController();
  }

  canGreet(initiator, target) {
    return Boolean(
      initiator && target && initiator !== target
      && !this.active.has(initiator) && !this.active.has(target)
      && !getPetStateMachine(initiator).isBusy()
      && !getPetStateMachine(target).isBusy()
      && ['free_roam', 'idle'].includes(getPetStateMachine(target).current),
    );
  }

  async greet(initiatorRuntime, targetId) {
    const targetRuntime = this.getRuntime?.(targetId);
    const initiator = initiatorRuntime?.pet;
    const target = targetRuntime?.pet;
    if (!this.canGreet(initiator, target)) return { accepted: false, reason: 'unavailable' };
    const relation = targetRuntime.memory.getRelationship(initiatorRuntime.profile.identity.residentId);
    if (relation.tension >= 0.75) return { accepted: false, reason: 'needs_space' };
    this.active.add(initiator);
    this.active.add(target);
    this.conversations.set(initiator, { targetId, action: '向邻居问好' });
    this.conversations.set(target, { targetId: initiatorRuntime.profile.identity.residentId, action: '面向邻居听他说话' });
    const initiatorState = getPetStateMachine(initiator);
    const targetState = getPetStateMachine(target);
    initiatorState.enterTemporary(PET_STATES.INTERACTING, initiatorState.current);
    targetState.enterTemporary(PET_STATES.INTERACTING, targetState.current);
    try {
      const a = positionOf(initiator);
      const b = positionOf(target);
      initiator.stopWalking?.();
      target.stopWalking?.();
      if (a && b) {
        initiator.lockFacing?.(b.x, b.z);
        target.lockFacing?.(a.x, a.z);
      }
      this.bubbles?.showLine(initiator, `嗨，${targetRuntime.profile.identity.displayName}！今天也精神满满吗？`, 2.4);
      await this.wait(900, this.abortController.signal);
      this.bubbles?.showLine(target, '当然！我连发呆都很有精神。', 2.6);
      this.conversations.get(initiator).action = '听邻居回应';
      this.conversations.get(target).action = target._animPlans?.nod ? '点头回应' : '回应邻居';
      const gestures = (pet, id, fallback) => {
        const edits = this.getGreetingGestures?.(id);
        return this._playGreetingGestures(pet, edits?.length ? edits : [fallback]);
      };
      await Promise.all([
        gestures(initiator, initiatorRuntime.profile.identity.residentId, { name: '听邻居回应', seconds: 1.6 }),
        gestures(target, targetId, { name: this.conversations.get(target).action, animation: target._animPlans?.nod ? 'nod' : 'idle', seconds: 1.6 }),
      ]);
      const shared = {
        type: 'social_greeting',
        actors: [initiatorRuntime.profile.identity.residentId, targetId],
        summary: `${initiatorRuntime.profile.identity.displayName}和${targetRuntime.profile.identity.displayName}开心地打了招呼`,
        tags: ['social.greet', 'friendly'], outcome: 'completed', importance: 0.38, valence: 0.4,
      };
      const first = initiatorRuntime.memory.remember(shared);
      const second = targetRuntime.memory.remember({ ...shared, id: `${shared.type}_${Date.now()}_${targetId}` });
      initiatorRuntime.memory.updateRelationship(targetId, { familiarity: 0.04, affection: 0.025, trust: 0.01 }, { memoryId: first.id });
      targetRuntime.memory.updateRelationship(initiatorRuntime.profile.identity.residentId, { familiarity: 0.04, affection: 0.025, trust: 0.01 }, { memoryId: second.id });
      this._shareFact(initiatorRuntime, targetRuntime);
      this.trace?.append({ residentId: initiatorRuntime.profile.identity.residentId, type: 'social_completed', targetId });
      return { accepted: true, targetId };
    } finally {
      initiator.unlockFacing?.();
      target.unlockFacing?.();
      initiatorState.resume('agent-social-completed');
      targetState.resume('agent-social-completed');
      this.active.delete(initiator);
      this.active.delete(target);
      this.conversations.delete(initiator);
      this.conversations.delete(target);
    }
  }

  async _playGreetingGestures(pet, gestures) {
    const conversation = this.conversations.get(pet);
    for (const gesture of gestures) {
      if (this.abortController.signal.aborted || !getPetStateMachine(pet).is(PET_STATES.INTERACTING)) return;
      conversation.animation = gesture.animation || 'idle';
      conversation.action = gesture.name;
      pet.playAnimation?.(conversation.animation);
      await this.wait(gesture.seconds * 1000, this.abortController.signal);
    }
    pet.playAnimation?.('idle');
    conversation.animation = 'idle';
    conversation.action = '听邻居回应';
  }

  async cooperate(initiatorRuntime, targetId, { activity = '一起玩耍' } = {}) {
    const targetRuntime = this.getRuntime?.(targetId);
    const initiator = initiatorRuntime?.pet;
    const target = targetRuntime?.pet;
    if (!this.canGreet(initiator, target)) return { accepted: false, reason: 'unavailable' };
    const relation = initiatorRuntime.memory.getRelationship(targetId);
    const acceptance = 0.55 + relation.trust * 0.2 + relation.affection * 0.2 - relation.tension * 0.35;
    if (acceptance < 0.42) {
      this.recordConflict(initiatorRuntime, targetRuntime, {
        reason: `${targetRuntime.profile.identity.displayName}现在想自己安静一会儿`,
        severity: 0.08,
      });
      return { accepted: false, reason: 'declined' };
    }

    this.active.add(initiator);
    this.active.add(target);
    const initiatorState = getPetStateMachine(initiator);
    const targetState = getPetStateMachine(target);
    initiatorState.enterTemporary(PET_STATES.INTERACTING, initiatorState.current);
    targetState.enterTemporary(PET_STATES.INTERACTING, targetState.current);
    try {
      initiator.stopWalking?.();
      target.stopWalking?.();
      const a = positionOf(initiator);
      const b = positionOf(target);
      if (a && b) {
        initiator.lockFacing?.(b.x, b.z);
        target.lockFacing?.(a.x, a.z);
      }
      this.bubbles?.showLine(initiator, `${targetRuntime.profile.identity.displayName}，一起${activity}吧！`, 2.6);
      await this.wait(850, this.abortController.signal);
      this.bubbles?.showLine(target, '好呀，我已经把开心准备好了！', 2.8);
      initiator.playAnimation?.(initiator._animPlans?.jump ? 'jump' : 'idle');
      target.playAnimation?.(target._animPlans?.jump ? 'jump' : 'idle');
      await this.wait(2200, this.abortController.signal);

      const actors = [initiatorRuntime.profile.identity.residentId, targetId];
      const summary = `${initiatorRuntime.profile.identity.displayName}和${targetRuntime.profile.identity.displayName}${activity}`;
      const first = initiatorRuntime.memory.remember({
        type: 'social_cooperation', actors, summary, tags: ['social.cooperate', activity],
        outcome: 'completed', importance: 0.52, valence: 0.55,
      });
      const second = targetRuntime.memory.remember({
        type: 'social_cooperation', actors, summary, tags: ['social.cooperate', activity],
        outcome: 'completed', importance: 0.52, valence: 0.55,
      });
      initiatorRuntime.memory.updateRelationship(targetId, {
        familiarity: 0.05, affection: 0.04, trust: 0.035, tension: -0.025,
      }, { memoryId: first.id });
      targetRuntime.memory.updateRelationship(initiatorRuntime.profile.identity.residentId, {
        familiarity: 0.05, affection: 0.04, trust: 0.035, tension: -0.025,
      }, { memoryId: second.id });
      this.trace?.append({
        residentId: initiatorRuntime.profile.identity.residentId,
        type: 'social_cooperation_completed', targetId, activity,
      });
      return { accepted: true, targetId, activity };
    } finally {
      initiator.unlockFacing?.();
      target.unlockFacing?.();
      initiatorState.resume('agent-cooperation-completed');
      targetState.resume('agent-cooperation-completed');
      this.active.delete(initiator);
      this.active.delete(target);
    }
  }

  recordConflict(firstRuntime, secondRuntime, { reason = '意见不太一样', severity = 0.1 } = {}) {
    if (!firstRuntime || !secondRuntime) return null;
    const firstId = firstRuntime.profile.identity.residentId;
    const secondId = secondRuntime.profile.identity.residentId;
    const amount = Math.min(0.25, Math.max(0.02, Number(severity) || 0.1));
    const shared = {
      type: 'social_conflict', actors: [firstId, secondId], summary: reason,
      tags: ['social.conflict'], outcome: 'unresolved', importance: 0.45, valence: -amount,
    };
    const first = firstRuntime.memory.remember(shared);
    const second = secondRuntime.memory.remember(shared);
    firstRuntime.memory.updateRelationship(secondId, { tension: amount, trust: -amount * 0.45 }, { memoryId: first.id });
    secondRuntime.memory.updateRelationship(firstId, { tension: amount, trust: -amount * 0.45 }, { memoryId: second.id });
    this.trace?.append({ residentId: firstId, type: 'social_conflict', targetId: secondId, reason, severity: amount });
    return { firstId, secondId, severity: amount };
  }

  reconcile(firstRuntime, secondRuntime) {
    if (!firstRuntime || !secondRuntime) return null;
    const firstId = firstRuntime.profile.identity.residentId;
    const secondId = secondRuntime.profile.identity.residentId;
    firstRuntime.memory.updateRelationship(secondId, { tension: -0.12, trust: 0.04, affection: 0.02 });
    secondRuntime.memory.updateRelationship(firstId, { tension: -0.12, trust: 0.04, affection: 0.02 });
    return { firstId, secondId, reconciled: true };
  }

  _shareFact(source, target) {
    const fact = [...source.memory.semanticFacts].reverse().find(item => item.shareable);
    if (!fact) return;
    target.memory.learnFact({ ...fact, confidence: Math.max(0.35, fact.confidence * 0.85) });
  }

  dispose() {
    this.abortController.abort();
    this.active.clear();
  }
}
