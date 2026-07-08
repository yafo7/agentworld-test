/**
 * Scene snapshot persistence for Chii Island.
 *
 * Saves the current world state to localStorage so that player modifications
 * (placed/removed decorations, model/animation changes, environment visibility,
 * pet states, item positions) survive page refresh.
 *
 * The snapshot is versioned so future schema changes can migrate or reset old
 * saves gracefully.
 */

const SNAPSHOT_KEY = 'chii-island-scene';
const SNAPSHOT_VERSION = 1;

function generateInstanceId(prefix = 'ent') {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${ts}_${rand}`;
}

function serializeModelSource(entity) {
  if (entity._generatedAssetId) {
    return { type: 'assetId', assetId: entity._generatedAssetId };
  }
  if (entity._hasCustomModel && entity._originalModelJson?._isGLTF) {
    return { type: 'gltf' };
  }
  if (entity._hasCustomModel && entity._originalModelJson) {
    return { type: 'inline', modelJson: entity._originalModelJson };
  }
  if (entity._modelName) {
    return { type: 'path', path: `generated/models/${entity._modelName}.json` };
  }
  return { type: 'path', path: `generated/models/${entity.id}.json` };
}

function serializeStaticEntity(entity) {
  return {
    instanceId: entity._instanceId,
    id: entity.id,
    name: entity.name,
    tags: [...entity.tags],
    category: entity.category,
    areaType: entity._areaType || 'default',
    envIndex: entity._envIndex ?? 4,
    gridX: entity._gridX ?? 0,
    gridZ: entity._gridZ ?? 0,
    scale: entity._content?.scale.x ?? 1,
    visible: entity.mesh.visible,
    modelSource: serializeModelSource(entity),
    interactionPlan: entity._interactionPlan || null,
    idlePlan: entity._animIdle || null,
  };
}

function serializeEnvironment(env) {
  return {
    name: env.name,
    modelSource: serializeModelSource(env),
    interactionPlan: env._interactionPlan || null,
    idlePlan: env._animIdle || null,
    coreTags: [...env.coreTags],
    moreTags: [...env.moreTags],
    color: env._color,
    position: [env.mesh.position.x, env.mesh.position.y, env.mesh.position.z],
  };
}

function serializePet(pet, houseEntity) {
  return {
    name: pet.name,
    houseInstanceId: houseEntity?._instanceId || null,
    affection: pet.affection,
    trust: pet.trust,
    mood: pet.mood,
    spawned: pet.spawned,
    state: pet.state,
    position: [pet.mesh.position.x, pet.mesh.position.y, pet.mesh.position.z],
    milestones: { ...(pet._milestones || {}) },
    memories: [...(pet.memories || [])],
    modelSource: pet._originalModelJson
      ? { type: 'inline', modelJson: pet._originalModelJson }
      : { type: 'path', path: `generated/pets/models/${pet.name}.json` },
  };
}

function serializeItem(item) {
  return {
    id: item.id,
    isHeld: item.isHeld,
    position: [item.mesh.position.x, item.mesh.position.y, item.mesh.position.z],
    modelSource: item._originalModelJson
      ? { type: 'inline', modelJson: item._originalModelJson }
      : { type: 'path', path: `generated/models/${item.id}.json` },
  };
}

export function hasScene() {
  try {
    return !!localStorage.getItem(SNAPSHOT_KEY);
  } catch {
    return false;
  }
}

export function clearScene() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch (err) {
    console.warn('[SceneSnapshot] Failed to clear scene:', err.message);
  }
}

/**
 * Save the current world state to localStorage.
 * @param {Object} sceneState
 * @param {Array} sceneState.staticEntities
 * @param {Array} sceneState.environments
 * @param {Array} sceneState.pets — { pet, houseEntity } objects or bare Pet instances
 * @param {Array} sceneState.items
 * @param {boolean} sceneState.outerEnvGlobalVisible
 * @param {boolean[]} sceneState.envVisibleState
 */
export function saveScene({
  staticEntities = [],
  environments = [],
  pets = [],
  items = [],
} = {}) {
  try {
    const snapshot = {
      version: SNAPSHOT_VERSION,
      timestamp: Date.now(),
      staticEntities: staticEntities.map(serializeStaticEntity),
      environments: environments.filter(Boolean).map(serializeEnvironment),
      pets: pets.map((entry) => {
        if (entry.pet) return serializePet(entry.pet, entry.houseEntity);
        return serializePet(entry, null);
      }),
      items: items.map(serializeItem),
    };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn('[SceneSnapshot] Failed to save scene:', err.message);
  }
}

export function loadScene() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    if (snapshot.version !== SNAPSHOT_VERSION) {
      console.warn(`[SceneSnapshot] Version mismatch (${snapshot.version} != ${SNAPSHOT_VERSION}), clearing old save`);
      clearScene();
      return null;
    }
    return snapshot;
  } catch (err) {
    console.warn('[SceneSnapshot] Failed to load scene:', err.message);
    return null;
  }
}

export { generateInstanceId, SNAPSHOT_VERSION };
