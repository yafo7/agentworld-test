import * as THREE from 'three';
import { colliderProfileForEntity } from './ColliderPolicy.js';
import { buildPhysicsAssetPlan, hashModelJson } from './PhysicsAssetBuilder.js';
import { DEFAULT_COLLIDER_STRATEGY, normalizeColliderStrategy } from './ColliderStrategy.js';

const anonymousEntityKeys = new WeakMap();
let nextAnonymousEntityKey = 1;

function entityKey(entity) {
  const explicit = entity?._instanceId || entity?.id || entity?.mesh?.uuid;
  if (explicit) return explicit;
  if (!entity || typeof entity !== 'object') return null;
  if (!anonymousEntityKeys.has(entity)) {
    anonymousEntityKeys.set(entity, `collider-entity-${nextAnonymousEntityKey++}`);
  }
  return anonymousEntityKeys.get(entity);
}

function modelJsonFor(entity, override) {
  return override || entity?._originalModelJson || entity?.mesh?.userData?.modelJson || null;
}

function transformBounds(bounds, matrix) {
  return bounds?.clone().applyMatrix4(matrix) || null;
}

export class ColliderRegistry {
  constructor(physics, { strategy = DEFAULT_COLLIDER_STRATEGY } = {}) {
    this.physics = physics;
    this.strategy = normalizeColliderStrategy(strategy);
    this.records = new Map();
    this._unbindWorldObjects = null;
  }

  prepareEntity(entity, {
    modelJson = null,
    operation = 'original',
    assetId = null,
    parentRevisionId = null,
  } = {}) {
    const profile = colliderProfileForEntity(entity, this.strategy);
    const sourceJson = modelJsonFor(entity, modelJson);
    const contentHash = hashModelJson(sourceJson);
    const previousRevision = entity?.mesh?.userData?.modelRevision || null;
    const revision = Object.freeze({
      revisionId: `${assetId || entity?.id || 'model'}:${contentHash}`,
      assetId: assetId || entity?._generatedAssetId || entity?.id || null,
      parentRevisionId: parentRevisionId || previousRevision?.revisionId || null,
      operation,
      contentHash,
    });
    const plan = profile.mode !== 'none' && sourceJson
      ? buildPhysicsAssetPlan({ modelJson: sourceJson, profile, strategy: this.strategy })
      : null;
    return { entity, profile, plan, revision, sourceJson };
  }

  commitPrepared(prepared) {
    const { entity, profile, plan, revision, sourceJson } = prepared;
    const key = entityKey(entity);
    if (!key) throw new Error('Collider entity requires a stable instance id');

    let nextRecord = null;
    try {
      nextRecord = this._createRecord(entity, profile, plan, revision, sourceJson);
    } catch (error) {
      if (nextRecord?.body) this.physics.removeRigidBody(nextRecord.body);
      throw error;
    }

    const previous = this.records.get(key);
    if (nextRecord) this.records.set(key, nextRecord);
    else this.records.delete(key);
    if (previous?.body) this.physics.removeRigidBody(previous.body);
    if (entity.mesh?.userData) entity.mesh.userData.modelRevision = revision;
    return nextRecord;
  }

  registerEntity(entity, options = {}) {
    return this.commitPrepared(this.prepareEntity(entity, options));
  }

  replaceEntity(entity, options = {}) {
    return this.registerEntity(entity, options);
  }

  removeEntity(entity) {
    const key = entityKey(entity);
    const record = key ? this.records.get(key) : null;
    if (record?.body) this.physics.removeRigidBody(record.body);
    if (key) this.records.delete(key);
    return !!record;
  }

  bindWorldObjects(worldObjects) {
    this._unbindWorldObjects?.();
    this._unbindWorldObjects = worldObjects.onChange?.((event) => {
      if (event.type === 'added') this.registerEntity(event.entity, event.metadata);
      if (event.type === 'removed') this.removeEntity(event.entity);
    }) || null;
    return () => {
      this._unbindWorldObjects?.();
      this._unbindWorldObjects = null;
    };
  }

  get(entity) {
    return this.records.get(entityKey(entity)) || null;
  }

  setStrategy(strategy) {
    const nextStrategy = normalizeColliderStrategy(strategy);
    if (nextStrategy === this.strategy) return this.summary();

    const replacements = [];
    try {
      for (const [key, record] of this.records) {
        const profile = colliderProfileForEntity(record.entity, nextStrategy);
        const plan = profile.mode !== 'none' && record.sourceJson
          ? buildPhysicsAssetPlan({ modelJson: record.sourceJson, profile, strategy: nextStrategy })
          : null;
        const nextRecord = this._createRecord(
          record.entity,
          profile,
          plan,
          record.revision,
          record.sourceJson,
        );
        replacements.push({ key, previous: record, next: nextRecord });
      }
    } catch (error) {
      for (const replacement of replacements) {
        if (replacement.next?.body) this.physics.removeRigidBody(replacement.next.body);
      }
      throw error;
    }

    this.strategy = nextStrategy;
    for (const { key, previous, next } of replacements) {
      if (next) this.records.set(key, next);
      else this.records.delete(key);
      if (previous.body) this.physics.removeRigidBody(previous.body);
    }
    return this.summary();
  }

  summary() {
    let colliders = 0;
    let candidates = 0;
    let fallbacks = 0;
    for (const record of this.records.values()) {
      colliders += record.colliders.length;
      candidates += record.plan?.candidateCount || 0;
      if (record.plan?.fallbackUsed) fallbacks += 1;
    }
    return { strategy: this.strategy, assets: this.records.size, colliders, candidates, fallbacks };
  }

  dispose() {
    this._unbindWorldObjects?.();
    for (const record of this.records.values()) {
      if (record.body) this.physics.removeRigidBody(record.body);
    }
    this.records.clear();
  }

  _createRecord(entity, profile, plan, revision, sourceJson = null) {
    if (profile.mode === 'none') return null;
    entity.mesh.updateWorldMatrix?.(true, true);
    entity._content?.updateWorldMatrix?.(true, true);
    const sourceMatrix = entity._content?.matrixWorld || entity.mesh.matrixWorld;
    const instanceMatrix = sourceMatrix?.clone?.() || new THREE.Matrix4().makeTranslation(
      entity.mesh.position?.x || 0,
      entity.mesh.position?.y || 0,
      entity.mesh.position?.z || 0,
    );
    const colliders = [];
    const body = this.physics.createStaticBody();

    try {
      if (profile.mode === 'bridge') {
        const bridge = entity.mesh.userData?.collider || {};
        const length = Math.max(0.1, Number(bridge.length) || 0.1);
        const width = Math.max(0.1, Number(bridge.width) || 0.1);
        const deckY = Number(bridge.deckY) || 0;
        const deckThickness = Math.max(0.05, Number(bridge.deckThickness) || 0.2);
        const railHeight = Math.max(0.2, Number(bridge.railHeight) || 1.2);
        const railThickness = Math.max(0.1, Number(bridge.railThickness) || 0.4);
        const deckSegments = Array.isArray(bridge.deckSegments) ? bridge.deckSegments : [];
        const railSegments = Array.isArray(bridge.railSegments) ? bridge.railSegments : [];
        const rootPosition = entity.mesh.getWorldPosition(new THREE.Vector3());
        const rootRotation = entity.mesh.getWorldQuaternion(new THREE.Quaternion());
        const addLocalBox = (halfExtents, localCenter, localRotation = null) => {
          const center = localCenter.clone().applyQuaternion(rootRotation).add(rootPosition);
          const rotation = localRotation
            ? rootRotation.clone().multiply(localRotation)
            : rootRotation;
          colliders.push(this.physics.addStaticBoxToBody(
            body,
            halfExtents.x,
            halfExtents.y,
            halfExtents.z,
            center.x,
            center.y,
            center.z,
            { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
          ));
        };
        const addSegment = (segment) => {
          const halfExtents = new THREE.Vector3().fromArray(segment.halfExtents || []);
          const center = new THREE.Vector3().fromArray(segment.center || []);
          const rotation = new THREE.Quaternion().fromArray(segment.rotation || [0, 0, 0, 1]);
          if (
            !Number.isFinite(halfExtents.x)
            || !Number.isFinite(halfExtents.y)
            || !Number.isFinite(halfExtents.z)
            || Math.min(halfExtents.x, halfExtents.y, halfExtents.z) <= 0
          ) return;
          addLocalBox(halfExtents, center, rotation);
        };

        if (deckSegments.length > 0) {
          deckSegments.forEach(addSegment);
        } else {
          addLocalBox(
            new THREE.Vector3(length * 0.5, deckThickness * 0.5, width * 0.5),
            new THREE.Vector3(0, deckY - deckThickness * 0.5, 0),
          );
        }
        if (railSegments.length > 0) {
          railSegments.forEach(addSegment);
        } else {
          const railOffset = width * 0.5 - railThickness * 0.5;
          for (const side of [-1, 1]) {
            addLocalBox(
              new THREE.Vector3(length * 0.5, railHeight * 0.5, railThickness * 0.5),
              new THREE.Vector3(0, deckY + railHeight * 0.5, railOffset * side),
            );
          }
        }
      } else if (profile.mode === 'legacy-tree') {
        const worldBounds = plan?.bounds
          ? transformBounds(plan.bounds, instanceMatrix)
          : entity.getWorldBBox?.();
        if (worldBounds && !worldBounds.isEmpty()) {
          const size = worldBounds.getSize(new THREE.Vector3());
          const center = worldBounds.getCenter(new THREE.Vector3());
          const radius = THREE.MathUtils.clamp(Math.min(size.x, size.z) * 0.16, 0.45, 1.15);
          colliders.push(this.physics.addStaticCylinderToBody(
            body,
            size.y * 0.5,
            radius,
            center.x,
            center.y,
            center.z,
          ));
        }
      } else if (profile.mode === 'legacy-building') {
        const worldBounds = plan?.bounds
          ? transformBounds(plan.bounds, instanceMatrix)
          : entity.getWorldBBox?.();
        const footprint = entity.mesh.userData?.collider;
        if (worldBounds && !worldBounds.isEmpty() && footprint?.width && footprint?.depth) {
          const size = worldBounds.getSize(new THREE.Vector3());
          const center = worldBounds.getCenter(new THREE.Vector3());
          colliders.push(this.physics.addStaticBoxToBody(
            body,
            footprint.width * 0.5,
            size.y * 0.5,
            footprint.depth * 0.5,
            entity.mesh.position.x,
            center.y,
            entity.mesh.position.z,
          ));
        }
      } else if (profile.mode === 'legacy-bounds') {
        const worldBounds = plan?.bounds
          ? transformBounds(plan.bounds, instanceMatrix)
          : entity.getWorldBBox?.();
        if (worldBounds && !worldBounds.isEmpty()) {
          const size = worldBounds.getSize(new THREE.Vector3());
          const center = worldBounds.getCenter(new THREE.Vector3());
          colliders.push(this.physics.addStaticBoxToBody(
            body,
            size.x * 0.5,
            size.y * 0.5,
            size.z * 0.5,
            center.x,
            center.y,
            center.z,
          ));
        }
      } else if (plan?.boxes?.length) {
        const rootPosition = new THREE.Vector3();
        const rootRotation = new THREE.Quaternion();
        const rootScale = new THREE.Vector3();
        instanceMatrix.decompose(rootPosition, rootRotation, rootScale);
        const absoluteScale = new THREE.Vector3(
          Math.abs(rootScale.x),
          Math.abs(rootScale.y),
          Math.abs(rootScale.z),
        );
        for (const box of plan.boxes) {
          const center = box.center.clone().applyMatrix4(instanceMatrix);
          const halfExtents = box.halfExtents.clone().multiply(absoluteScale);
          const rotation = rootRotation.clone().multiply(box.rotation);
          colliders.push(this.physics.addStaticBoxToBody(
            body,
            halfExtents.x,
            halfExtents.y,
            halfExtents.z,
            center.x,
            center.y,
            center.z,
            { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
          ));
        }
      } else {
        const worldBounds = entity.getWorldBBox?.();
        if (worldBounds && !worldBounds.isEmpty()) {
          const size = worldBounds.getSize(new THREE.Vector3());
          const center = worldBounds.getCenter(new THREE.Vector3());
          colliders.push(this.physics.addStaticBoxToBody(
            body,
            size.x * 0.5,
            size.y * 0.5,
            size.z * 0.5,
            center.x,
            center.y,
            center.z,
          ));
        }
      }

      if (colliders.length === 0) {
        this.physics.removeRigidBody(body);
        return null;
      }
      return { entity, body, colliders, plan, revision, profileKey: profile.key, sourceJson };
    } catch (error) {
      this.physics.removeRigidBody(body);
      throw error;
    }
  }
}
