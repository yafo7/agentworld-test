export class WorldTuningAudit {
  constructor({ worldObjects, objectPlacement, metrics, profiles, budgets = {} }) {
    this.worldObjects = worldObjects;
    this.objectPlacement = objectPlacement;
    this.metrics = metrics;
    this.profiles = profiles;
    this.budgets = budgets;
  }

  snapshot() {
    const objects = this.worldObjects.items.map(entity => {
      const metadata = this.worldObjects.getMetadata(entity);
      return this.objectPlacement.scalePolicy?.auditEntity(entity, metadata) || {
        id: entity.id || entity.name,
        status: 'unclassified',
      };
    });
    const counts = objects.reduce((result, object) => {
      result[object.status] = (result[object.status] || 0) + 1;
      return result;
    }, {});
    const categories = objects.reduce((result, object) => {
      const category = object.scaleCategory || 'unclassified';
      result[category] = (result[category] || 0) + 1;
      return result;
    }, {});
    const placement = this.objectPlacement.audit();
    const warnings = [];
    if (objects.length > (this.budgets.staticObjectsWarning ?? Infinity)) {
      warnings.push(`static_objects:${objects.length}`);
    }
    if ((counts.out_of_profile || 0) > (this.budgets.outOfProfileWarning ?? Infinity)) {
      warnings.push(`out_of_profile:${counts.out_of_profile}`);
    }
    if (placement.softOverlaps.length > (this.budgets.softOverlapWarning ?? Infinity)) {
      warnings.push(`soft_overlaps:${placement.softOverlaps.length}`);
    }
    return {
      metrics: this.metrics,
      profiles: Object.keys(this.profiles),
      placement,
      counts,
      categories,
      warnings,
      objects,
    };
  }

  print() {
    const snapshot = this.snapshot();
    console.groupCollapsed('[WorldTuning]', snapshot.counts);
    console.table(snapshot.objects);
    console.groupEnd();
    return snapshot;
  }
}
