const PHASES = Object.freeze({
  idle: Object.freeze({ index: 0, label: '日常' }),
  invitation: Object.freeze({ index: 1, label: '招呼' }),
  gathering: Object.freeze({ index: 2, label: '集合' }),
  performing: Object.freeze({ index: 3, label: '故事' }),
  closing: Object.freeze({ index: 4, label: '收尾' }),
});

export class FriendActivityDirector {
  constructor({ actors, stories, onStage = null, onLine = null, onComplete = null }) {
    this.actors = new Map((actors || []).map(actor => [actor.id, actor]));
    this.stories = new Map((stories || []).map(story => [story.id, story]));
    this.onStage = onStage;
    this.onLine = onLine;
    this.onComplete = onComplete;
    this.active = null;
  }

  start(storyId) {
    if (this.active) return false;
    const story = this.stories.get(storyId);
    if (!story) return false;
    const participants = story.participants
      .map(id => this.actors.get(id))
      .filter(Boolean);
    if (participants.length !== story.participants.length) return false;

    this.active = {
      story,
      participants,
      phase: 'invitation',
      elapsed: 0,
      beatIndex: 0,
    };
    for (const actor of participants) {
      actor.setAutonomous?.(false);
      actor.stop?.();
    }
    this._emitStage('invitation', '主持人正在把大家从各自的小忙里叫回来');
    this._emitLine(story.invitation);
    return true;
  }

  update(dt) {
    const activity = this.active;
    if (!activity) return;
    activity.elapsed += Math.max(0, dt || 0);

    if (activity.phase === 'invitation' && activity.elapsed >= 2.6) {
      this._beginGathering(activity);
      return;
    }

    if (activity.phase === 'gathering') {
      const arrived = activity.participants.every(actor => actor.hasArrived?.() !== false);
      if (arrived) this._beginPerformance(activity);
      return;
    }

    if (activity.phase === 'performing') {
      while (
        activity.beatIndex < activity.story.beats.length
        && activity.elapsed >= activity.story.beats[activity.beatIndex].at
      ) {
        const beat = activity.story.beats[activity.beatIndex++];
        this.actors.get(beat.speakerId)?.play?.(beat.animation || 'special');
        this._emitLine(beat);
      }
      if (activity.elapsed >= activity.story.duration) this._beginClosing(activity);
      return;
    }

    if (activity.phase === 'closing' && activity.elapsed >= 3.2) this._finish(activity);
  }

  _beginGathering(activity) {
    activity.phase = 'gathering';
    activity.elapsed = 0;
    activity.participants.forEach((actor, index) => {
      const slot = activity.story.slots[index];
      actor.moveTo?.({ x: slot[0], y: slot[1] || 0, z: slot[2] });
    });
    this._emitStage('gathering', '大家正在往野餐毯旁集合');
  }

  _beginPerformance(activity) {
    activity.phase = 'performing';
    activity.elapsed = 0;
    activity.beatIndex = 0;
    for (const actor of activity.participants) actor.play?.('idle');
    this._emitStage('performing', '一件很小、但很认真的事情正在发生');
  }

  _beginClosing(activity) {
    activity.phase = 'closing';
    activity.elapsed = 0;
    for (const actor of activity.participants) actor.play?.('idle');
    this._emitStage('closing', activity.story.closing);
    this.onLine?.({ speakerId: null, text: activity.story.closing, system: true });
  }

  _finish(activity) {
    for (const actor of activity.participants) {
      actor.setAutonomous?.(true);
      actor.play?.('idle');
    }
    this.active = null;
    this.onComplete?.(activity.story);
    this.onStage?.({
      phase: 'idle',
      phaseIndex: PHASES.idle.index,
      phaseLabel: PHASES.idle.label,
      title: '朋友们继续各忙各的',
      detail: '下一段小故事可以随时开始。',
    });
  }

  _emitStage(phase, detail) {
    const metadata = PHASES[phase];
    this.onStage?.({
      phase,
      phaseIndex: metadata.index,
      phaseLabel: metadata.label,
      title: this.active.story.title,
      detail,
    });
  }

  _emitLine(line) {
    if (!line?.text) return;
    this.onLine?.({ ...line, system: false });
  }
}
