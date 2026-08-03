export class RuntimeHUD {
  constructor({ renderer, physics }) {
    this.renderer = renderer;
    this.physics = physics;
    this.jobEl = document.getElementById('runtime-job');
    this.jobTitleEl = document.getElementById('runtime-job-title');
    this.jobStageEl = document.getElementById('runtime-job-stage');
    this.regionEl = document.getElementById('runtime-region');
    this.followerEl = document.getElementById('runtime-follower');
    this.activityEl = document.getElementById('runtime-activity');
    this.activityTitleEl = document.getElementById('runtime-activity-title');
    this.activityStageEl = document.getElementById('runtime-activity-stage');
    this.activityPhaseEl = document.getElementById('runtime-activity-phase');
    this.activityProgressEl = document.getElementById('runtime-activity-progress-value');
    this.activityTaskEl = document.getElementById('runtime-activity-task');
    this.activityTaskTextEl = document.getElementById('runtime-activity-task-text');
    this.activityHelperEl = document.getElementById('runtime-activity-helper');
    this.perfEl = document.getElementById('runtime-perf');
    this.jobs = new Map();
    this.jobSerial = 0;
    this.perfVisible = false;
    this.perfTimer = 0;
    this.frameTime = 16.7;
  }

  startJob(label, stage = '准备中') {
    const id = `job_${++this.jobSerial}`;
    this.jobs.set(id, { label, stage, state: 'working' });
    this._renderJob(id);
    return id;
  }

  updateJob(id, stage) {
    const job = this.jobs.get(id);
    if (!job) return;
    job.stage = stage;
    this._renderJob(id);
  }

  completeJob(id, stage = '完成') {
    this._finishJob(id, 'complete', stage, 2200);
  }

  failJob(id, error) {
    const message = String(error?.message || error || '操作失败').slice(0, 80);
    this._finishJob(id, 'error', message, 5200);
  }

  _finishJob(id, state, stage, delay) {
    const job = this.jobs.get(id);
    if (!job) return;
    job.state = state;
    job.stage = stage;
    this._renderJob(id);
    setTimeout(() => {
      this.jobs.delete(id);
      const latest = Array.from(this.jobs.keys()).pop();
      if (latest) this._renderJob(latest);
      else this.jobEl?.classList.remove('visible');
    }, delay);
  }

  _renderJob(id) {
    const job = this.jobs.get(id);
    if (!job || !this.jobEl) return;
    this.jobTitleEl.textContent = job.label;
    this.jobStageEl.textContent = job.stage;
    this.jobEl.dataset.state = job.state;
    this.jobEl.classList.add('visible');
  }

  setWorldStatus(region, follower) {
    if (this.regionEl) this.regionEl.textContent = region || '奇异岛';
    if (this.followerEl) {
      this.followerEl.textContent = follower ? `${follower} 跟随中` : '独自探索';
    }
  }

  setActivityStatus(title = null, stage = '', details = {}) {
    if (!this.activityEl) return;
    if (!title) {
      this.activityEl.classList.remove('visible');
      return;
    }
    this.activityTitleEl.textContent = title;
    this.activityStageEl.textContent = stage;
    const phaseIndex = Math.max(1, Number(details.phaseIndex) || 1);
    const phaseCount = Math.max(phaseIndex, Number(details.phaseCount) || 4);
    if (this.activityPhaseEl) {
      this.activityPhaseEl.textContent = `${details.phaseLabel || '准备'} ${phaseIndex}/${phaseCount}`;
    }
    if (this.activityProgressEl) {
      this.activityProgressEl.style.width = `${Math.min(100, (phaseIndex / phaseCount) * 100)}%`;
    }
    if (this.activityTaskEl) {
      const task = details.task || null;
      this.activityTaskEl.classList.toggle('visible', !!task);
      this.activityTaskEl.dataset.state = task?.complete ? 'complete' : 'open';
      if (this.activityTaskTextEl) this.activityTaskTextEl.textContent = task?.label || '';
    }
    if (this.activityHelperEl) this.activityHelperEl.textContent = details.helper || '';
    this.activityEl.dataset.phase = details.phase || 'preparing';
    this.activityEl.classList.add('visible');
  }

  setPerformanceVisible(visible) {
    this.perfVisible = !!visible;
    this.perfEl?.classList.toggle('visible', this.perfVisible);
  }

  update(dt, { entities = 0, pets = 0 } = {}) {
    this.frameTime += ((dt * 1000) - this.frameTime) * 0.08;
    if (!this.perfVisible) return;
    this.perfTimer += dt;
    if (this.perfTimer < 0.35) return;
    this.perfTimer = 0;
    const render = this.renderer.info.render;
    const colliders = this.physics.world?.colliders?.len?.() ?? 0;
    const bodies = this.physics.world?.bodies?.len?.() ?? 0;
    this.perfEl.textContent = [
      `${Math.round(1000 / Math.max(this.frameTime, 1))} FPS  ${this.frameTime.toFixed(1)} ms`,
      `${render.calls} calls  ${Math.round(render.triangles / 1000)}k tris`,
      `${entities} entities  ${pets} pets`,
      `${colliders} colliders  ${bodies} bodies`,
    ].join('\n');
  }
}
