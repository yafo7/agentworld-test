import * as THREE from 'three';
import { getRuntime } from '../../backend/runtimeLoader.js';

/**
 * Evaluate a motion plan at time t and apply pose deltas.
 * Deltas are ADDED to the stored base pose (following API spec "叠加到初始姿态").
 *
 * FIXED: uses v2 API signature evaluateMotion(plan, duration, t, lookups)
 * where lookups = model._voxelModel (provides getPart / getChildren).
 *
 * @param {object} plan — motion plan JSON
 * @param {number} duration — animation duration in seconds
 * @param {THREE.Object3D} model — the model group
 * @param {number} t — current time in seconds
 * @param {Map|null} basePoseMap — cached base poses (built lazily on first call)
 * @returns {Map|null} updated basePoseMap
 */
export function applyAnimation(plan, duration, model, t, basePoseMap = null) {
  const runtime = getRuntime();
  if (!runtime || !plan) return basePoseMap;

  let pose;
  try {
    const modelArg = model._voxelModel || model;
    // v2 signature: (plan, duration, t, lookups?)
    // lookups = { getPart(id), getChildren(id) } — matches modelArg shape
    pose = runtime.evaluateMotion(plan, duration, t, modelArg);
  } catch (err) {
    console.warn('[AnimationPlayer] evaluateMotion failed:', err.message);
    return basePoseMap;
  }

  const isFirstCall = !basePoseMap;
  const animKeys = Object.keys(pose).filter(k => !k.startsWith('_'));
  if (isFirstCall && animKeys.length === 0) {
    console.warn('[AnimationPlayer] evaluateMotion returned empty pose');
  }

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

  // Apply deltas: base + delta
  const applied = new Map(); // partId → { position, rotation, scale } applied delta
  for (const [partId, delta] of Object.entries(pose)) {
    if (partId.startsWith('_')) continue;

    const obj = model.getObjectByName(partId);
    if (!obj) continue;

    const base = basePoseMap.get(partId);
    if (!base) continue;

    const pos = delta.position || [0, 0, 0];
    const rot = delta.rotation || [0, 0, 0];
    const scl = delta.scale;

    obj.position.set(
      base.position.x + pos[0],
      base.position.y + pos[1],
      base.position.z + pos[2]
    );

    // Prefer quaternion composition for v2 models (initial pose set via quaternion)
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

    applied.set(partId, { position: pos, rotation: rot, scale: scl });
  }

  // Propagate parent deltas to _attached children
  const attachMap = pose._attachMap;
  if (attachMap) {
    for (const [childId, parentId] of Object.entries(attachMap)) {
      const parentApplied = applied.get(parentId);
      if (!parentApplied) continue;

      const childObj = model.getObjectByName(childId);
      if (!childObj) continue;

      const childBase = basePoseMap.get(childId);
      if (!childBase) continue;

      // Child gets its own delta (if any) + parent's delta
      const childApplied = applied.get(childId);
      const ownPos = childApplied ? childApplied.position : [0, 0, 0];
      const ownRot = childApplied ? childApplied.rotation : [0, 0, 0];

      childObj.position.set(
        childBase.position.x + ownPos[0] + parentApplied.position[0],
        childBase.position.y + ownPos[1] + parentApplied.position[1],
        childBase.position.z + ownPos[2] + parentApplied.position[2]
      );

      if (childBase.quaternion) {
        const ownQ = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(ownRot[0], ownRot[1], ownRot[2], 'XYZ')
        );
        const parentQ = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(parentApplied.rotation[0], parentApplied.rotation[1], parentApplied.rotation[2], 'XYZ')
        );
        childObj.quaternion.copy(childBase.quaternion).multiply(ownQ).multiply(parentQ);
      } else {
        childObj.rotation.set(
          childBase.rotation.x + ownRot[0] + parentApplied.rotation[0],
          childBase.rotation.y + ownRot[1] + parentApplied.rotation[1],
          childBase.rotation.z + ownRot[2] + parentApplied.rotation[2]
        );
      }
    }
  }

  return basePoseMap;
}
