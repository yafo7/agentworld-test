export class PetWorkAbortedError extends Error {
  constructor(message = 'Pet work was aborted') {
    super(message);
    this.name = 'PetWorkAbortedError';
    this.code = 'PET_WORK_ABORTED';
  }
}

export function isPetWorkAbortedError(error) {
  return error?.code === 'PET_WORK_ABORTED' || error?.name === 'AbortError';
}

function toAbortError(reason) {
  if (isPetWorkAbortedError(reason)) return reason;
  return new PetWorkAbortedError(
    typeof reason === 'string' ? reason : reason?.message,
  );
}

export class PetWorkCoordinator {
  constructor({
    runtimeStatus = null,
    startPresentation,
    stopPresentation,
    playIntro,
    finishPet,
  }) {
    this.runtimeStatus = runtimeStatus;
    this.startPresentation = startPresentation;
    this.stopPresentation = stopPresentation;
    this.playIntro = playIntro;
    this.finishPet = finishPet;
    this.abortVersion = 0;
    this.abortReason = null;
    this.disposed = false;
  }

  abortPending(reason = 'Pet work was aborted') {
    this.abortVersion += 1;
    this.abortReason = toAbortError(reason);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abortPending('Pet work coordinator was disposed');
  }

  _throwIfAborted(version, signal) {
    if (signal?.aborted) throw toAbortError(signal.reason);
    if (this.disposed || version !== this.abortVersion) {
      throw this.abortReason || new PetWorkAbortedError();
    }
  }

  async run({
    pet,
    points,
    nextState,
    focusCamera,
    status,
    execute,
    apply,
    signal = null,
  }) {
    const version = this.abortVersion;
    this._throwIfAborted(version, signal);
    let presentation = null;
    let jobId = null;

    try {
      presentation = this.startPresentation?.(points);
      jobId = this.runtimeStatus?.startJob(status.title, status.preparing);
      await this.playIntro?.(pet, points, { focusCamera });
      this._throwIfAborted(version, signal);
      this.runtimeStatus?.updateJob(jobId, status.requesting);
      const result = await execute();
      // Backend calls are not always cancellable. This checkpoint prevents a
      // late result from mutating the world after its owning system is gone.
      this._throwIfAborted(version, signal);
      if (status.applying) this.runtimeStatus?.updateJob(jobId, status.applying);
      const applied = await apply(result);
      this.runtimeStatus?.completeJob(jobId, status.complete);
      return applied;
    } catch (error) {
      if (!isPetWorkAbortedError(error)) this.runtimeStatus?.failJob(jobId, error);
      throw error;
    } finally {
      this.stopPresentation?.(presentation);
      this.finishPet?.(pet, nextState);
    }
  }
}
