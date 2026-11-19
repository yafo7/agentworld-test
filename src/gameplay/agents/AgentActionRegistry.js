import { AGENT_ACTION_STATUS, AGENT_PERMISSION_LEVELS } from './AgentContracts.js';

export class AgentActionError extends Error {
  constructor(message, code = 'AGENT_ACTION_FAILED', details = null) {
    super(message);
    this.name = 'AgentActionError';
    this.code = code;
    this.details = details;
  }
}

export class AgentActionRegistry {
  constructor() {
    this.actions = new Map();
  }

  register(definition) {
    const id = String(definition?.id || '').trim();
    if (!id) throw new TypeError('Agent action requires id');
    if (typeof definition.execute !== 'function') throw new TypeError(`Agent action ${id} requires execute()`);
    if (this.actions.has(id)) throw new TypeError(`Agent action already registered: ${id}`);
    this.actions.set(id, Object.freeze({
      permission: AGENT_PERMISSION_LEVELS.AUTONOMOUS,
      cooldownMs: 0,
      tags: Object.freeze([]),
      ...definition,
      id,
      tags: Object.freeze([...(definition.tags || [])]),
    }));
    return this;
  }

  get(id) {
    return this.actions.get(id) || null;
  }

  list({ maxPermission = Infinity } = {}) {
    return [...this.actions.values()].filter(action => action.permission <= maxPermission);
  }
}

export class AgentActionArbiter {
  constructor({ registry, reservations = null, now = () => Date.now(), trace = null } = {}) {
    if (!registry) throw new TypeError('AgentActionArbiter requires registry');
    this.registry = registry;
    this.reservations = reservations;
    this.now = now;
    this.trace = trace;
    this.cooldowns = new Map();
  }

  async execute(runtime, proposal = {}) {
    const definition = this.registry.get(proposal.actionId);
    if (!definition) throw new AgentActionError(`Unknown agent action: ${proposal.actionId}`, 'UNKNOWN_AGENT_ACTION');
    const residentId = runtime.profile.identity.residentId;
    const cooldownKey = `${residentId}:${definition.id}`;
    if ((this.cooldowns.get(cooldownKey) || 0) > this.now()) {
      throw new AgentActionError('Agent action is cooling down', 'AGENT_ACTION_COOLDOWN');
    }
    if (definition.permission >= AGENT_PERMISSION_LEVELS.PLAYER_APPROVAL && !proposal.approved) {
      return { status: AGENT_ACTION_STATUS.AWAITING_APPROVAL, actionId: definition.id };
    }
    if (definition.permission === AGENT_PERMISSION_LEVELS.AUTHORING_ONLY && proposal.authoring !== true) {
      throw new AgentActionError('World authoring actions require authoring mode', 'AGENT_AUTHORING_REQUIRED');
    }
    const context = { runtime, proposal, definition, now: this.now() };
    const precondition = await definition.canExecute?.(context);
    if (precondition === false || typeof precondition === 'string') {
      throw new AgentActionError(
        typeof precondition === 'string' ? precondition : 'Agent action precondition failed',
        'AGENT_ACTION_PRECONDITION',
      );
    }
    let reservation = null;
    try {
      if (proposal.reservationId && this.reservations?.reserve) {
        reservation = this.reservations.reserve(proposal.reservationId, [runtime.pet]);
        if (!reservation) throw new AgentActionError('Agent target is reserved', 'AGENT_ACTION_RESERVED');
      }
      this.trace?.append({ residentId, type: 'action_started', actionId: definition.id, proposal });
      const result = await definition.execute(context);
      this.cooldowns.set(cooldownKey, this.now() + Math.max(0, Number(definition.cooldownMs) || 0));
      this.trace?.append({ residentId, type: 'action_succeeded', actionId: definition.id, result });
      return { status: AGENT_ACTION_STATUS.SUCCEEDED, actionId: definition.id, result };
    } catch (error) {
      this.trace?.append({ residentId, type: 'action_failed', actionId: definition.id, error: error.message });
      throw error;
    } finally {
      if (reservation && proposal.reservationId) this.reservations?.release?.(proposal.reservationId);
    }
  }
}
