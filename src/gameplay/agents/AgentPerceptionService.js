function positionOf(entity) {
  return entity?.getPosition?.() || entity?.mesh?.position || entity?.position || null;
}

function entityId(entity, metadata = {}) {
  return entity?._residentId || entity?._petId || entity?._instanceId || entity?.id
    || metadata.saveId || entity?.name || entity?.mesh?.name || null;
}

function distance(a, b) {
  return a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Number.POSITIVE_INFINITY;
}

export class AgentPerceptionService {
  constructor({
    player = null,
    worldObjects = null,
    getPets = () => [],
    getClimate = () => null,
    getStory = () => null,
    getActiveEvent = () => null,
    getRegionName = () => null,
    radius = 18,
    now = () => Date.now(),
  } = {}) {
    this.player = player;
    this.worldObjects = worldObjects;
    this.getPets = getPets;
    this.getClimate = getClimate;
    this.getStory = getStory;
    this.getActiveEvent = getActiveEvent;
    this.getRegionName = getRegionName;
    this.radius = radius;
    this.now = now;
  }

  perceive(runtime) {
    const pet = runtime.pet;
    const origin = positionOf(pet);
    const nearbyObjects = (this.worldObjects?.items || []).map(entity => {
      const metadata = this.worldObjects.getMetadata?.(entity) || {};
      const position = positionOf(entity);
      return {
        id: entityId(entity, metadata),
        name: entity.name || entity.mesh?.name || metadata.name || 'object',
        tags: [...new Set([...(entity.tags || []), ...(metadata.tags || [])])],
        distance: distance(origin, position),
        position: position ? { x: position.x, y: position.y || 0, z: position.z } : null,
        editable: Boolean(metadata.editable),
      };
    }).filter(item => item.id && item.distance <= this.radius).sort((a, b) => a.distance - b.distance).slice(0, 16);
    const nearbyResidents = this.getPets().filter(other => other && other !== pet).map(other => {
      const position = positionOf(other);
      return {
        id: entityId(other),
        name: other._petName || other.mesh?.name || entityId(other),
        distance: distance(origin, position),
        state: other.petState?.current || other._petState || 'idle',
        position: position ? { x: position.x, y: position.y || 0, z: position.z } : null,
      };
    }).filter(item => item.id && item.distance <= this.radius).sort((a, b) => a.distance - b.distance).slice(0, 8);
    const playerPosition = positionOf(this.player);
    const climate = this.getClimate?.();
    const story = this.getStory?.();
    return {
      at: this.now(),
      residentId: runtime.profile.identity.residentId,
      location: {
        regionId: pet._petRegion || null,
        label: this.getRegionName?.(origin) || pet._petRegion || 'island',
        position: origin ? { x: origin.x, y: origin.y || 0, z: origin.z } : null,
      },
      self: { state: pet.petState?.current || pet._petState || 'idle', drives: { ...runtime.state.drives } },
      player: playerPosition ? {
        visible: distance(origin, playerPosition) <= this.radius,
        distance: distance(origin, playerPosition),
        position: { x: playerPosition.x, y: playerPosition.y || 0, z: playerPosition.z },
      } : null,
      nearbyObjects,
      nearbyResidents,
      climate: climate ? {
        hour: climate.time?.hour ?? null,
        month: climate.time?.month ?? null,
        weather: climate.weather?.type || null,
      } : null,
      story: story ? {
        islandDay: story.islandDay || 1,
        chapter: story.chapter || null,
        objectiveId: story.currentObjective?.id || null,
      } : null,
      activeEvent: this.getActiveEvent?.() || null,
    };
  }
}
