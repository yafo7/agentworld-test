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
  }

  async run({
    pet,
    points,
    nextState,
    focusCamera,
    status,
    execute,
    apply,
  }) {
    let presentation = null;
    let jobId = null;

    try {
      presentation = this.startPresentation?.(points);
      jobId = this.runtimeStatus?.startJob(status.title, status.preparing);
      await this.playIntro?.(pet, points, { focusCamera });
      this.runtimeStatus?.updateJob(jobId, status.requesting);
      const result = await execute();
      if (status.applying) this.runtimeStatus?.updateJob(jobId, status.applying);
      const applied = await apply(result);
      this.runtimeStatus?.completeJob(jobId, status.complete);
      return applied;
    } catch (error) {
      this.runtimeStatus?.failJob(jobId, error);
      throw error;
    } finally {
      this.stopPresentation?.(presentation);
      this.finishPet?.(pet, nextState);
    }
  }
}
