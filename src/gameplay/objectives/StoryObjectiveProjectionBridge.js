const OWNER_ID = 'story-current-objective';

function toProjection(objective) {
  const guidance = objective?.data?.guidance;
  if (!guidance || typeof guidance !== 'object') return null;
  return {
    id: `story:${objective.id}`,
    source: 'story',
    title: objective.title,
    label: guidance.label || objective.title,
    kind: guidance.kind || 'visit',
    target: guidance.target,
    trigger: guidance.trigger,
    radius: guidance.radius,
    progress: guidance.progress,
    priority: Number.isFinite(guidance.priority) ? guidance.priority : 20,
  };
}

export class StoryObjectiveProjectionBridge {
  constructor({ storyState, projectionStore }) {
    this.storyState = storyState;
    this.projectionStore = projectionStore;
    this.disposed = false;
    this.unsubscribe = storyState?.onChange?.(() => this.refresh()) || null;
    this.refresh();
  }

  refresh() {
    if (this.disposed) return;
    const objective = this.storyState?.getSnapshot?.().currentObjective;
    const projection = toProjection(objective);
    if (projection) this.projectionStore.publish(OWNER_ID, projection);
    else this.projectionStore.clear(OWNER_ID);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
    this.projectionStore.clear(OWNER_ID);
  }
}
