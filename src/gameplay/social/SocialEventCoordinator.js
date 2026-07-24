import { PET_STATES, getPetStateMachine } from '../pets/PetStateMachine.js';

export class SocialEventCoordinator {
  constructor({ petManager, gatherTimeout = 12 }) {
    this.petManager = petManager;
    this.gatherTimeout = gatherTimeout;
    this.active = null;
  }

  start({ plan, participants, slots, onPerform = null, onFinish = null }) {
    if (this.active) throw new Error('Another social activity is already active');
    if (!plan || participants.length === 0) throw new TypeError('Social activity requires participants');

    const snapshots = participants.map(pet => {
      const machine = getPetStateMachine(pet);
      return {
        pet,
        state: machine.current,
        followTarget: pet._followTarget || null,
        followDistance: pet._followDistance || 3,
        followSpeed: pet._followSpeed || 6,
      };
    });

    this.active = {
      plan,
      participants,
      slots,
      snapshots,
      phase: 'gathering',
      elapsed: 0,
      onPerform,
      onFinish,
    };

    participants.forEach((pet, index) => {
      const machine = getPetStateMachine(pet);
      machine.enterTemporary(PET_STATES.PERFORMING, snapshots[index].state);
      pet.stopWalking?.();
      pet.unlockFacing?.();
      const slot = slots[index] || slots[slots.length - 1];
      if (slot) pet.walkTo?.(slot.x, slot.z, 4.2);
    });
    return this.active;
  }

  update(dt) {
    const activity = this.active;
    if (!activity || activity.phase !== 'gathering') return;
    activity.elapsed += dt;
    const arrived = activity.participants.every(pet => !pet._targetPosition);
    if (!arrived && activity.elapsed < this.gatherTimeout) return;

    if (!arrived) {
      activity.participants.forEach((pet, index) => {
        const slot = activity.slots[index] || activity.slots[activity.slots.length - 1];
        if (slot) pet.setPosition?.(slot.x, 0, slot.z);
        pet.stopWalking?.();
      });
    }
    activity.phase = 'performing';
    activity.elapsed = 0;
    activity.onPerform?.(activity);
  }

  finish(reason = 'host-ended') {
    const activity = this.active;
    if (!activity) return false;
    this.active = null;

    try {
      activity.onFinish?.(activity, reason);
    } finally {
      for (const snapshot of activity.snapshots) this._restore(snapshot);
    }
    return true;
  }

  includes(pet) {
    return !!this.active?.participants.includes(pet);
  }

  _restore(snapshot) {
    const { pet, state, followTarget, followDistance, followSpeed } = snapshot;
    pet.stopWalking?.();
    pet.unlockFacing?.();
    pet.playAnimation?.('idle');
    const machine = getPetStateMachine(pet);
    machine.transition(state, { reason: 'social-activity-ended' });
    machine.resumeState = null;

    if (state === PET_STATES.FOLLOWING && followTarget) {
      pet.followTarget?.(followTarget, followDistance, followSpeed);
    } else if (state === PET_STATES.FREE_ROAM) {
      this.petManager.resumePet?.(pet);
    }
  }
}
