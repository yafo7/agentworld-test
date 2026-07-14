import * as THREE from 'three';
import { getRuntime } from '../runtime/runtimeProvider.js';

/**
 * Evaluate a motion plan at time t — mirrors 3d-generate MotionExpander.evaluateAt.
 * Signature: evaluateMotion(plan, duration, model, t) — model is 3rd, t is 4th.
 *
 * @param {object} plan — motion plan JSON (normalized: bone keys at top level)
 * @param {number} duration — animation duration in seconds
 * @param {object} model — VoxelModel-compatible (has getPart/getChildren) or THREE.Group with _voxelModel
 * @param {number} t — current time in seconds
 * @returns {object} deltas per partId: { partId: { position?:[dx,dy,dz], rotation?:[drx,dry,drz], scale?:[sx,sy,sz] }, _attachMap?: {...} }
 */
export function evaluateMotion(plan, duration, model, t) {
  const runtime = getRuntime();
  if (!runtime || !plan) return { _attachMap: {} };

  // Resolve VoxelModel wrapper from THREE.Group if needed
  const modelArg = model._voxelModel || model;

  try {
    // 3d-generate signature: (plan, duration, model, t)
    return runtime.evaluateMotion(plan, duration, modelArg, t);
  } catch (err) {
    console.warn('[AnimationPlayer] evaluateMotion failed:', err.message);
    return { _attachMap: {} };
  }
}

/**
 * Apply evaluated motion deltas to a THREE.Group model.
 * Uses a basePoseMap (lazily built) to accumulate deltas on top of initial poses.
 * Mirrors 3d-generate Editor._applyAnimation + renderer.updateTransforms pattern.
 *
 * @param {object} deltas — result from evaluateMotion(): { partId: { position, rotation, scale }, _attachMap }
 * @param {THREE.Group} model — the THREE.Group root containing named children
 * @param {Map|null} basePoseMap — cached base poses, built lazily on first call
 * @returns {Map} updated basePoseMap
 */
export function applyMotionDeltas(deltas, model, basePoseMap = null) {
  if (!deltas || !model) return basePoseMap;

  // Build base pose map lazily on first call
  if (!basePoseMap) {
    basePoseMap = new Map();
    model.traverse((obj) => {
      if (obj.name) {
        basePoseMap.set(obj.name, {
          position: obj.position.clone(),
          rotation: obj.rotation.clone(),
          quaternion: obj.quaternion.clone(),
          scale: obj.scale.clone(),
        });
      }
    });
  }

  const applied = new Map(); // partId → applied delta for attach propagation

  for (const [partId, tracks] of Object.entries(deltas)) {
    if (partId.startsWith('_')) continue;

    const obj = model.getObjectByName(partId);
    if (!obj) continue;

    const base = basePoseMap.get(partId);
    if (!base) continue;

    const pos = tracks.position || [0, 0, 0];
    const rot = tracks.rotation || [0, 0, 0];
    const scl = tracks.scale || null;

    obj.position.set(
      base.position.x + pos[0],
      base.position.y + pos[1],
      base.position.z + pos[2]
    );

    if (base.quaternion) {
      const qDelta = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ')
      );
      obj.quaternion.copy(base.quaternion).multiply(qDelta);
    } else {
      obj.rotation.set(
        base.rotation.x + rot[0],
        base.rotation.y + rot[1],
        base.rotation.z + rot[2]
      );
    }

    if (scl) {
      obj.scale.set(base.scale.x * scl[0], base.scale.y * scl[1], base.scale.z * scl[2]);
    }

    applied.set(partId, tracks);
  }

  // Propagate parent deltas to _attached children
  const attachMap = deltas._attachMap;
  if (attachMap) {
    for (const [childId, parentId] of Object.entries(attachMap)) {
      const parentDeltas = applied.get(parentId);
      if (!parentDeltas) continue;

      const childObj = model.getObjectByName(childId);
      if (!childObj) continue;

      const childBase = basePoseMap.get(childId);
      if (!childBase) continue;

      const childDeltas = applied.get(childId);
      const ownPos = childDeltas?.position || [0, 0, 0];
      const ownRot = childDeltas?.rotation || [0, 0, 0];
      const pPos = parentDeltas.position || [0, 0, 0];
      const pRot = parentDeltas.rotation || [0, 0, 0];

      childObj.position.set(
        childBase.position.x + ownPos[0] + pPos[0],
        childBase.position.y + ownPos[1] + pPos[1],
        childBase.position.z + ownPos[2] + pPos[2]
      );

      if (childBase.quaternion) {
        const ownQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(ownRot[0], ownRot[1], ownRot[2], 'XYZ'));
        const parentQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(pRot[0], pRot[1], pRot[2], 'XYZ'));
        childObj.quaternion.copy(childBase.quaternion).multiply(ownQ).multiply(parentQ);
      } else {
        childObj.rotation.set(
          childBase.rotation.x + ownRot[0] + pRot[0],
          childBase.rotation.y + ownRot[1] + pRot[1],
          childBase.rotation.z + ownRot[2] + pRot[2]
        );
      }
    }
  }

  return basePoseMap;
}

/**
 * Legacy wrapper — evaluate + apply in one call.
 * Maintains backward compatibility with code that expects the old applyAnimation signature.
 */
export function applyAnimation(plan, duration, model, t, basePoseMap = null) {
  const deltas = evaluateMotion(plan, duration, model, t);
  return applyMotionDeltas(deltas, model, basePoseMap);
}
