import { PET_STATES, getPetStateMachine } from '../pets/PetStateMachine.js';

export class SocialEventCoordinator {
  constructor({ petManager, gatherTimeout = 12, arrivalTolerance = 0.45 }) {
    this.petManager = petManager;
    this.gatherTimeout = gatherTimeout;
    this.arrivalTolerance = arrivalTolerance;
    this.active = null;
  }

  start({ plan, participants, slots, gatherTimeout = this.gatherTimeout, arrivalTolerance = this.arrivalTolerance, speed = 4.2, selectArrivals = null, onPerform = null, onFinish = null, onBlocked = null }) {
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
      gatherTimeout,
      arrivalTolerance,
      speed,
      selectArrivals,
      elapsed: 0,
      retryAt: 1,
      onPerform,
      onFinish,
      onBlocked,
    };

    participants.forEach((pet, index) => {
      const machine = getPetStateMachine(pet);
      machine.enterTemporary(PET_STATES.PERFORMING, snapshots[index].state);
      pet.stopFollow?.();
      pet.disableWander?.();
      pet.stopWalking?.();
      pet.unlockFacing?.();
      const slot = slots[index] || slots[slots.length - 1];
      if (slot) pet.walkTo?.(slot.x, slot.z, speed, arrivalTolerance);
    });
    return this.active;
  }

  update(dt) {
    const activity = this.active;
    if (!activity || activity.phase !== 'gathering') return;
    activity.elapsed += dt;
    const arrived = activity.participants.filter((pet, index) => {
      const slot = activity.slots[index] || activity.slots[activity.slots.length - 1];
      const position = pet.getPosition?.() || pet.mesh?.position || pet.position;
      if (!slot || !position) return false;
      return Math.hypot(slot.x - position.x, slot.z - position.z) <= activity.arrivalTolerance;
    });
    if (arrived.length < activity.participants.length) {
      if (activity.elapsed < activity.gatherTimeout) {
        // A temporary obstruction can make walkTo stop. Retry from the actual
        // position without resetting paths for residents still making progress.
        if (activity.selectArrivals && activity.elapsed >= activity.retryAt) {
          activity.retryAt = activity.elapsed + 1.5;
          activity.participants.forEach((pet, i) => {
            const slot = activity.slots[i];
            if (slot && !arrived.includes(pet) && pet.isWalking?.() === false) {
              pet.walkTo?.(slot.x, slot.z, activity.speed, activity.arrivalTolerance);
            }
          });
        }
        return;
      }
      if (activity.selectArrivals?.(arrived)) {
        const missed = activity.snapshots.filter(snapshot => !arrived.includes(snapshot.pet));
        activity.snapshots = activity.snapshots.filter(snapshot => arrived.includes(snapshot.pet));
        activity.slots = activity.slots.filter((_, index) => arrived.includes(activity.participants[index]));
        activity.participants = arrived;
        for (const snapshot of missed) this._restore(snapshot);
      } else {
        activity.phase = 'blocked';
        activity.onBlocked?.(activity);
        if (this.active === activity) this.finish('gather-timeout');
        return;
      }
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
