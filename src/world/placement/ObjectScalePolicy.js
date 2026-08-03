import * as THREE from 'three';

function finitePositive(value, fallback = Infinity) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function readUniformScale(entity) {
  return finitePositive(entity?._content?.scale?.x, 1);
}

export class ObjectScalePolicy {
  constructor({ profiles, resolveProfile, cellSize = 2 } = {}) {
    this.profiles = profiles || {};
    this.resolveProfile = resolveProfile || (() => 'small_decor');
    this.cellSize = cellSize;
  }

  normalize(entity, {
    profileId = null,
    assetId = null,
    name = null,
    description = '',
    category = null,
    footprint = { width: 2, depth: 2 },
    userScale = 1,
    variation = 1,
    enlarge = true,
  } = {}) {
    const resolvedProfileId = this.resolveProfile({
      profileId,
      assetId,
      name: name || entity?.name,
      description,
      category: category || entity?.category,
    });
    const profile = this.profiles[resolvedProfileId] || this.profiles.small_decor;
    if (!profile) return null;
    if (profile.runtimeScale === 'authored') {
      return this.captureAuthored(entity, {
        profileId: resolvedProfileId,
        assetId,
        name,
        description,
        category,
      });
    }

    const box = entity?.getWorldBBox?.();
    if (!box || box.isEmpty()) return null;
    const currentScale = readUniformScale(entity);
    const measured = box.getSize(new THREE.Vector3());
    const raw = measured.clone().divideScalar(currentScale);
    const fill = finitePositive(profile.footprintFill, 0.82);
    const footprintWidth = finitePositive(footprint?.width, 1) * this.cellSize * fill;
    const footprintDepth = finitePositive(footprint?.depth, 1) * this.cellSize * fill;
    const maxWidth = Math.min(footprintWidth, finitePositive(profile.maxWidth));
    const maxDepth = Math.min(footprintDepth, finitePositive(profile.maxDepth));
    const maxHeight = finitePositive(profile.maxHeight);

    let semanticScale;
    if (profile.fitMode === 'footprint') {
      semanticScale = Math.min(
        maxWidth / Math.max(raw.x, 0.001),
        maxDepth / Math.max(raw.z, 0.001),
        maxHeight / Math.max(raw.y, 0.001),
      );
    } else {
      semanticScale = finitePositive(profile.targetHeight, measured.y)
        / Math.max(raw.y, 0.001);
      semanticScale = Math.min(
        semanticScale,
        maxWidth / Math.max(raw.x, 0.001),
        maxDepth / Math.max(raw.z, 0.001),
        maxHeight / Math.max(raw.y, 0.001),
      );
    }

    if (!enlarge) semanticScale = Math.min(currentScale, semanticScale);
    semanticScale = THREE.MathUtils.clamp(semanticScale, 0.02, 8);
    const normalizedVariation = THREE.MathUtils.clamp(Number(variation) || 1, 0.75, 1.25);
    const normalizedUserScale = THREE.MathUtils.clamp(Number(userScale) || 1, 0.5, 2);
    const finalScale = semanticScale * normalizedVariation * normalizedUserScale;
    const limitMultiplier = normalizedVariation * normalizedUserScale;
    entity._content?.scale?.setScalar(finalScale);
    this.anchorToGroundCenter(entity);

    const identity = Object.freeze({
      profileId: resolvedProfileId,
      scaleCategory: profile.category || 'furniture',
      semanticScale,
      variation: normalizedVariation,
      userScale: normalizedUserScale,
      sourceSize: Object.freeze({ width: raw.x, height: raw.y, depth: raw.z }),
      targetLimits: Object.freeze({
        width: maxWidth * limitMultiplier,
        height: maxHeight * limitMultiplier,
        depth: maxDepth * limitMultiplier,
      }),
      clearanceCells: Math.max(0, Math.ceil(Number(profile.clearanceCells) || 0)),
    });
    if (entity.mesh?.userData) entity.mesh.userData.worldScaleIdentity = identity;
    return identity;
  }

  captureAuthored(entity, {
    profileId = null,
    assetId = null,
    name = null,
    description = '',
    category = null,
  } = {}) {
    const resolvedProfileId = this.resolveProfile({
      profileId,
      assetId,
      name: name || entity?.name,
      description,
      category: category || entity?.category,
    });
    const profile = this.profiles[resolvedProfileId] || this.profiles.small_decor || {};
    const box = entity?.getWorldBBox?.();
    if (!box || box.isEmpty()) return null;
    const currentScale = readUniformScale(entity);
    const size = box.getSize(new THREE.Vector3());
    const sourceSize = size.clone().divideScalar(currentScale);
    const identity = Object.freeze({
      profileId: resolvedProfileId,
      scaleCategory: profile.category || 'furniture',
      semanticScale: currentScale,
      variation: 1,
      userScale: 1,
      source: 'authored_reference',
      naturalFootprint: profile.naturalFootprint === true,
      sourceSize: Object.freeze({
        width: sourceSize.x,
        height: sourceSize.y,
        depth: sourceSize.z,
      }),
      referenceSize: Object.freeze({
        width: size.x,
        height: size.y,
        depth: size.z,
      }),
      targetLimits: Object.freeze({
        width: size.x * 1.01,
        height: size.y * 1.01,
        depth: size.z * 1.01,
      }),
      clearanceCells: Math.max(0, Math.ceil(Number(profile.clearanceCells) || 0)),
    });
    if (entity.mesh?.userData) entity.mesh.userData.worldScaleIdentity = identity;
    return identity;
  }

  anchorToGroundCenter(entity) {
    const model = entity?._modelGroup;
    const parent = model?.parent;
    if (!model || !parent || parent !== entity._content) return false;
    entity.mesh?.updateWorldMatrix?.(true, true);
    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) return false;
    const centerWorld = box.getCenter(new THREE.Vector3());
    const bottomWorld = new THREE.Vector3(centerWorld.x, box.min.y, centerWorld.z);
    const centerLocal = parent.worldToLocal(centerWorld.clone());
    const bottomLocal = parent.worldToLocal(bottomWorld);
    model.position.x -= centerLocal.x;
    model.position.y -= bottomLocal.y;
    model.position.z -= centerLocal.z;
    entity.mesh?.updateWorldMatrix?.(true, true);
    return true;
  }

  auditEntity(entity, metadata = {}) {
    const identity = metadata?.placement?.sizeIdentity
      || entity?.mesh?.userData?.worldScaleIdentity
      || null;
    const box = entity?.getWorldBBox?.();
    const size = box && !box.isEmpty() ? box.getSize(new THREE.Vector3()) : null;
    if (!identity || !size) {
      return { id: entity?.id || entity?.name || 'unknown', status: 'unclassified', identity, size: null };
    }
    const limits = identity.targetLimits || {};
    const violations = [];
    if (size.x > finitePositive(limits.width) + 0.01) violations.push('width');
    if (size.y > finitePositive(limits.height) + 0.01) violations.push('height');
    if (size.z > finitePositive(limits.depth) + 0.01) violations.push('depth');
    return {
      id: entity?.id || entity?.name || 'unknown',
      status: violations.length ? 'out_of_profile' : 'ok',
      profileId: identity.profileId,
      scaleCategory: identity.scaleCategory,
      size: { width: size.x, height: size.y, depth: size.z },
      violations,
    };
  }
}
