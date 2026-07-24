import { buildModelFromJson } from '../../engine/model/builder.js';

export function replaceStaticEntityModel({
  entity,
  modelJson,
  colliderRegistry = null,
  operation = 'refine',
  assetId = null,
  nextMesh = null,
}) {
  if (!entity || !modelJson) return false;
  const previousJson = entity._originalModelJson || entity.mesh?.userData?.modelJson || null;
  const prepared = colliderRegistry?.prepareEntity(entity, {
    modelJson,
    operation,
    assetId,
  }) || null;
  const mesh = nextMesh || buildModelFromJson(modelJson);
  if (!mesh) return false;

  entity.replaceModel(mesh, modelJson);
  try {
    if (prepared) colliderRegistry.commitPrepared(prepared);
    return true;
  } catch (error) {
    if (previousJson) {
      const previousMesh = buildModelFromJson(previousJson);
      if (previousMesh) entity.replaceModel(previousMesh, previousJson);
    }
    throw error;
  }
}
