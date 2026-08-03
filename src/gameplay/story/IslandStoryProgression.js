const ISLAND_CHAPTER = 'island_home';

export const ISLAND_STORY_MILESTONES = Object.freeze({
  PASTORAL_HOME_CHANGED: 'pastoral_home_changed',
  FOREST_RESIDENT_SUMMONED: 'forest_resident_summoned',
  TOWN_ACTIVITY_COMPLETED: 'town_social_activity_completed',
  TOWN_BUILDING_COMPLETED: 'town_building_completed',
});

export const ISLAND_DEVELOPMENT_STAGES = Object.freeze({
  STRANDED: 'stranded',
  HOME_SHAPED: 'home_shaped',
  COMMUNITY_GROWING: 'community_growing',
  COMMUNITY_ACTIVE: 'community_active',
  ISLAND_ESTABLISHED: 'island_established',
});

const STAGE_ORDER = Object.freeze([
  ISLAND_DEVELOPMENT_STAGES.STRANDED,
  ISLAND_DEVELOPMENT_STAGES.HOME_SHAPED,
  ISLAND_DEVELOPMENT_STAGES.COMMUNITY_GROWING,
  ISLAND_DEVELOPMENT_STAGES.COMMUNITY_ACTIVE,
  ISLAND_DEVELOPMENT_STAGES.ISLAND_ESTABLISHED,
]);

const REGION_IDS = Object.freeze({
  PASTORAL: 'windmill_pastoral',
  FOREST: 'forest_temple',
  TOWN: 'church_town',
});

const PASTORAL_ACTIONS = new Set(['create', 'refine', 'mount']);
const SUCCESSFUL_ACTIVITY_REASONS = new Set(['host-ended', 'auto-completed']);

function normalizeId(value) {
  const id = String(value || '').trim();
  if (id === 'fangke') return 'fangk';
  if (id === 'crab') return 'builder_crab';
  return id;
}

function optionalString(value) {
  const text = String(value || '').trim();
  return text || null;
}

function compactData(entries) {
  return Object.fromEntries(entries.filter(([, value]) => value !== null && value !== undefined));
}

function requireStoryState(storyState) {
  const methods = [
    'getSnapshot',
    'setChapter',
    'setDevelopmentStage',
    'meetResident',
    'unlockRegion',
    'completeEvent',
  ];
  if (!storyState || methods.some(method => typeof storyState[method] !== 'function')) {
    throw new TypeError('IslandStoryProgression requires an IslandStoryState-compatible owner');
  }
  return storyState;
}

export class IslandStoryProgression {
  constructor({ storyState } = {}) {
    this.storyState = requireStoryState(storyState);
  }

  recordPastoralWorldChange({ action, residentId, targetId, assetId } = {}) {
    const normalizedAction = optionalString(action);
    const normalizedTargetId = optionalString(targetId);
    if (!PASTORAL_ACTIONS.has(normalizedAction) || !normalizedTargetId) {
      return this.storyState.getSnapshot();
    }
    this._enterIslandChapter();
    this._meetResidents([residentId]);
    this.storyState.unlockRegion(REGION_IDS.PASTORAL);
    this.storyState.unlockRegion(REGION_IDS.FOREST);
    this._advanceStage(ISLAND_DEVELOPMENT_STAGES.HOME_SHAPED);
    return this.storyState.completeEvent(
      ISLAND_STORY_MILESTONES.PASTORAL_HOME_CHANGED,
      compactData([
        ['action', normalizedAction],
        ['residentId', normalizeId(residentId) || null],
        ['targetId', normalizedTargetId],
        ['assetId', optionalString(assetId)],
      ]),
    );
  }

  recordForestResidentSummoned({ residentId, residentName, assetId } = {}) {
    const normalizedResidentId = normalizeId(residentId || assetId);
    if (!normalizedResidentId) return this.storyState.getSnapshot();
    this._enterIslandChapter();
    this._meetResidents([normalizedResidentId]);
    this.storyState.unlockRegion(REGION_IDS.FOREST);
    this.storyState.unlockRegion(REGION_IDS.TOWN);
    this._advanceStage(ISLAND_DEVELOPMENT_STAGES.COMMUNITY_GROWING);
    return this.storyState.completeEvent(
      ISLAND_STORY_MILESTONES.FOREST_RESIDENT_SUMMONED,
      compactData([
        ['residentId', normalizedResidentId],
        ['residentName', optionalString(residentName)],
        ['assetId', optionalString(assetId)],
      ]),
    );
  }

  recordTownActivityCompleted({ activityId, activityType, initiatorId, participantIds, reason } = {}) {
    const normalizedActivityId = optionalString(activityId);
    const normalizedReason = optionalString(reason);
    if (!normalizedActivityId || !SUCCESSFUL_ACTIVITY_REASONS.has(normalizedReason)) {
      return this.storyState.getSnapshot();
    }
    this._enterIslandChapter();
    const participants = Array.isArray(participantIds) ? participantIds : [];
    this._meetResidents([initiatorId, ...participants]);
    this.storyState.unlockRegion(REGION_IDS.TOWN);
    this._advanceStage(ISLAND_DEVELOPMENT_STAGES.COMMUNITY_ACTIVE);
    return this.storyState.completeEvent(
      ISLAND_STORY_MILESTONES.TOWN_ACTIVITY_COMPLETED,
      compactData([
        ['activityId', normalizedActivityId],
        ['activityType', optionalString(activityType)],
        ['initiatorId', normalizeId(initiatorId) || null],
        ['participantIds', [...new Set(participants.map(normalizeId).filter(Boolean))]],
        ['reason', normalizedReason],
      ]),
    );
  }

  recordTownBuildingCompleted({ buildingId, buildingName, assetId, builderId, lot } = {}) {
    const normalizedBuildingId = optionalString(buildingId || assetId);
    if (!normalizedBuildingId) return this.storyState.getSnapshot();
    this._enterIslandChapter();
    this._meetResidents([builderId || 'builder_crab']);
    this.storyState.unlockRegion(REGION_IDS.TOWN);
    this._advanceStage(ISLAND_DEVELOPMENT_STAGES.ISLAND_ESTABLISHED);
    const normalizedLot = Number.isInteger(lot?.width) && Number.isInteger(lot?.depth)
      ? { width: lot.width, depth: lot.depth }
      : null;
    return this.storyState.completeEvent(
      ISLAND_STORY_MILESTONES.TOWN_BUILDING_COMPLETED,
      compactData([
        ['buildingId', normalizedBuildingId],
        ['buildingName', optionalString(buildingName)],
        ['assetId', optionalString(assetId)],
        ['builderId', normalizeId(builderId || 'builder_crab')],
        ['lot', normalizedLot],
      ]),
    );
  }

  _enterIslandChapter() {
    if (this.storyState.getSnapshot().chapter === 'prologue') {
      this.storyState.setChapter(ISLAND_CHAPTER);
    }
  }

  _meetResidents(residentIds) {
    for (const residentId of new Set(residentIds.map(normalizeId).filter(Boolean))) {
      this.storyState.meetResident(residentId);
    }
  }

  _advanceStage(targetStage) {
    const current = this.storyState.getSnapshot().developmentStage;
    const currentIndex = STAGE_ORDER.indexOf(current);
    const targetIndex = STAGE_ORDER.indexOf(targetStage);
    if (currentIndex >= 0 && targetIndex > currentIndex) {
      this.storyState.setDevelopmentStage(targetStage);
    }
  }
}
