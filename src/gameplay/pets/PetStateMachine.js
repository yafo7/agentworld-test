export const PET_STATES = Object.freeze({
  IDLE: 'idle',
  FOLLOWING: 'following',
  FREE_ROAM: 'free_roam',
  WORKING: 'working',
  INTERACTING: 'interacting',
  PERFORMING: 'performing',
  CAMPING: 'camping',
  SUMMONING_PARTICIPANT: 'summoning_participant',
});

const VALID_STATES = new Set(Object.values(PET_STATES));
const BUSY_STATES = new Set([
  PET_STATES.WORKING,
  PET_STATES.INTERACTING,
  PET_STATES.PERFORMING,
  PET_STATES.CAMPING,
  PET_STATES.SUMMONING_PARTICIPANT,
]);

export class PetStateMachine {
  constructor(pet, initialState = PET_STATES.IDLE) {
    if (!pet) throw new TypeError('PetStateMachine requires a pet');
    if (!VALID_STATES.has(initialState)) throw new TypeError(`Unknown pet state: ${initialState}`);
    this.pet = pet;
    this.current = initialState;
    this.previous = null;
    this.resumeState = null;
    this.listeners = new Set();
  }

  is(state) {
    return this.current === state;
  }

  isBusy() {
    return BUSY_STATES.has(this.current);
  }

  transition(nextState, { reason = 'unspecified', resumeState = undefined } = {}) {
    if (!VALID_STATES.has(nextState)) throw new TypeError(`Unknown pet state: ${nextState}`);
    if (resumeState !== undefined) this.resumeState = resumeState;
    if (nextState === this.current) return this.current;

    const from = this.current;
    this.previous = from;
    this.current = nextState;

    if (from === PET_STATES.FOLLOWING && nextState !== PET_STATES.FOLLOWING) {
      this.pet.stopFollow?.();
    }
    if (from === PET_STATES.FREE_ROAM && nextState !== PET_STATES.FREE_ROAM) {
      this.pet.disableWander?.();
    }

    for (const listener of this.listeners) listener({ pet: this.pet, from, to: nextState, reason });
    return this.current;
  }

  enterWork({ autonomous = false } = {}) {
    const resumeState = autonomous || this.current === PET_STATES.FREE_ROAM
      ? PET_STATES.FREE_ROAM
      : PET_STATES.IDLE;
    return this.transition(PET_STATES.WORKING, { reason: 'work-started', resumeState });
  }

  completeWork(nextState = null) {
    const destination = nextState || this.resumeState || PET_STATES.IDLE;
    this.resumeState = null;
    return this.transition(destination, { reason: 'work-completed' });
  }

  enterTemporary(state, resumeState = this.current) {
    return this.transition(state, { reason: 'temporary-started', resumeState });
  }

  resume(reason = 'temporary-completed') {
    const destination = this.resumeState || PET_STATES.IDLE;
    this.resumeState = null;
    return this.transition(destination, { reason });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function attachPetStateMachine(pet, initialState = pet?._petState || PET_STATES.IDLE) {
  if (pet?.petState instanceof PetStateMachine) return pet.petState;
  const machine = new PetStateMachine(pet, initialState);
  Object.defineProperty(pet, '_petState', {
    configurable: true,
    enumerable: true,
    get: () => machine.current,
    set: (state) => machine.transition(state, { reason: 'legacy-assignment' }),
  });
  Object.defineProperty(pet, '_followEnabled', {
    configurable: true,
    enumerable: true,
    get: () => machine.is(PET_STATES.FOLLOWING),
    set: enabled => {
      if (enabled) machine.transition(PET_STATES.FOLLOWING, { reason: 'legacy-follow-assignment' });
      else if (machine.is(PET_STATES.FOLLOWING)) {
        machine.transition(PET_STATES.IDLE, { reason: 'legacy-follow-assignment' });
      }
    },
  });
  Object.defineProperty(pet, '_wanderEnabled', {
    configurable: true,
    enumerable: true,
    get: () => machine.is(PET_STATES.FREE_ROAM),
    set: enabled => {
      if (enabled) machine.transition(PET_STATES.FREE_ROAM, { reason: 'legacy-wander-assignment' });
      else if (machine.is(PET_STATES.FREE_ROAM)) {
        machine.transition(PET_STATES.IDLE, { reason: 'legacy-wander-assignment' });
      }
    },
  });
  pet.petState = machine;
  return machine;
}

export function getPetStateMachine(pet) {
  return pet?.petState || attachPetStateMachine(pet);
}
