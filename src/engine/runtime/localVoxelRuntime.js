import * as THREE from 'three';
import { fallbackBuildGeometry } from '../model/fallback.js';

export const LOCAL_RUNTIME_VERSION = 'chii-local-2026-07-23';
export const LOCAL_ANIMATION_TEMPLATES = Object.freeze([
  'bounce', 'slide', 'swing', 'sway', 'breathe', 'wave', 'drop', 'impulse',
  'launch', 'dash', 'slash', 'spin', 'pointTo', 'shift', 'squash', 'flow',
  'emit', 'lockWorldRot',
]);

function axisIndex(axis) {
  return axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
}

function loopFrequency(frequency, duration) {
  const safeDuration = Math.max(0.01, duration || 1);
  const cycles = Math.max(1, Math.round((frequency || 1) * safeDuration));
  return cycles / safeDuration;
}

function axisVector(axis, value) {
  const result = [0, 0, 0];
  result[axisIndex(axis)] = value;
  return result;
}

function evaluateTemplate(name, params, t, duration, groupId, model) {
  const p = params || {};
  switch (name) {
    case 'bounce':
      return { position: [0, Math.sin(t * loopFrequency(p.frequency || 2, duration) * Math.PI * 2) * (p.amplitude || 0.2), 0] };
    case 'slide': {
      const phase = p.phase || 0;
      const tp = ((t * (p.frequency || 1) + phase + 0.25) % 1 + 1) % 1;
      return { position: axisVector(p.axis || 'y', (1 - 4 * Math.abs(tp - 0.5)) * (p.distance || 1)) };
    }
    case 'swing':
    case 'sway': {
      const defaultAxis = name === 'swing' ? 'x' : 'z';
      const defaultAmplitude = name === 'swing' ? 0.5 : 0.3;
      const angle = Math.sin((t * loopFrequency(p.frequency || 1, duration) + (p.phase || 0)) * Math.PI * 2)
        * (p.amplitude || defaultAmplitude) * (Math.PI / 3);
      return { rotation: axisVector(p.axis || defaultAxis, angle) };
    }
    case 'breathe': {
      const scale = 1 + Math.sin(t * loopFrequency(p.frequency || 0.5, duration) * Math.PI * 2) * (p.amplitude || 0.02);
      return { scale: [scale, scale, scale] };
    }
    case 'wave': {
      const children = model?.getChildren?.(groupId)?.filter(child => child.isGroup) || [];
      if (children.length < 2) return {};
      const result = {};
      const frequency = loopFrequency(p.frequency || 1.5, duration);
      children.forEach((child, index) => {
        const value = Math.sin((t * frequency - index * (p.delay || 0.08) / duration) * Math.PI * 2) * (p.amplitude || 0.2);
        result[child.id] = { position: [0, value, 0] };
      });
      return result;
    }
    case 'drop': {
      const fallEnd = duration * 0.3;
      const settleEnd = duration * 0.5;
      const amplitude = p.amplitude || 0.5;
      const bounce = p.bounce || 0.1;
      let value;
      if (t <= fallEnd) value = -amplitude * (t / fallEnd) ** 2;
      else if (t <= settleEnd) value = -amplitude + bounce * (1 - (1 - (t - fallEnd) / (settleEnd - fallEnd)) ** 2);
      else value = -amplitude + bounce;
      return { position: axisVector(p.axis || 'y', value) };
    }
    case 'impulse': {
      const peak = duration * 0.2;
      const amplitude = p.amplitude || 0.5;
      const value = t <= peak
        ? amplitude * (1 - (1 - t / peak) ** 2)
        : amplitude * (1 - ((t - peak) / (duration - peak)) ** 2);
      return { position: axisVector(p.axis || 'y', value) };
    }
    case 'launch': {
      const safeDuration = Math.max(duration, 0.01);
      const clampedTime = Math.min(t, safeDuration);
      const deceleration = p.decel ?? 1.5;
      const progress = clampedTime / safeDuration;
      const exponent = deceleration + 1;
      const distance = (p.speed || 8) * safeDuration * (1 - Math.pow(1 - progress, exponent)) / exponent;
      return { position: axisVector(p.axis || 'z', distance) };
    }
    case 'dash':
      return { position: axisVector(p.axis || 'z', (p.speed || 8) * Math.min(t, Math.max(duration, 0.01))) };
    case 'slash': {
      const progress = Math.min(t * (p.speed || 4), 1);
      const angle = (p.amplitude || 0.8) * (Math.PI / 3) * (1 - Math.cos(Math.PI / 2 * progress));
      return { rotation: axisVector(p.axis || 'x', angle) };
    }
    case 'spin': {
      const direction = p.direction === 'ccw' ? -1 : 1;
      return { rotation: axisVector(p.axis || 'y', t * loopFrequency(p.frequency || p.speed || 1, duration) * Math.PI * 2 * direction) };
    }
    case 'pointTo':
      return { rotation: axisVector(p.axis || 'x', (p.angle || 0) * Math.PI / 180) };
    case 'shift':
      return { position: axisVector(p.axis || 'y', p.distance || 0) };
    case 'squash': {
      const scale = [1, 1, 1];
      scale[axisIndex(p.axis || 'y')] = p.amount ?? 1;
      return { scale };
    }
    case 'flow': {
      const axis = p.axis || 'y';
      const distance = p.distance || 5;
      const negativeDistance = p.neg_dis || 0;
      const range = Math.max(0.001, distance + negativeDistance);
      const children = model?.getChildren?.(groupId) || [];
      if (model?.getPart?.(groupId)?.isGroup && children.length) {
        const result = {};
        children.forEach((child, index) => {
          const offset = child.offset?.[axis] || 0;
          const stagger = (offset + index / children.length * range) % range;
          result[child.id] = { position: axisVector(axis, ((stagger + negativeDistance + t * (p.speed || 2)) % range) - negativeDistance - stagger) };
        });
        return result;
      }
      const offset = model?.getPart?.(groupId)?.offset?.[axis] || 0;
      const stagger = offset % range;
      return { position: axisVector(axis, ((stagger + negativeDistance + t * (p.speed || 2)) % range) - negativeDistance - stagger) };
    }
    case 'lockWorldRot':
      return {};
    default:
      return {};
  }
}

function addTransform(target, transform) {
  if (transform.position) for (let i = 0; i < 3; i++) target.position[i] += transform.position[i];
  if (transform.rotation) for (let i = 0; i < 3; i++) target.rotation[i] += transform.rotation[i];
  if (transform.scale) target.scale = transform.scale;
}

function chainWorldQuaternion(model, groupId, motionResult = null) {
  const group = model?.getPart?.(groupId);
  if (!group?.parent) return new THREE.Quaternion();
  const chain = [];
  let current = model.getPart(group.parent);
  while (current) {
    chain.unshift(current);
    current = current.parent ? model.getPart(current.parent) : null;
  }
  const world = new THREE.Quaternion();
  for (const part of chain) {
    if (part.quaternion && !motionResult) {
      world.multiply(new THREE.Quaternion(part.quaternion.x, part.quaternion.y, part.quaternion.z, part.quaternion.w));
      continue;
    }
    const delta = motionResult?.[part.id]?.rotation || [0, 0, 0];
    world.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
      (part.rotation?.x || 0) + delta[0],
      (part.rotation?.y || 0) + delta[1],
      (part.rotation?.z || 0) + delta[2],
      'XYZ'
    )));
  }
  return world;
}

export function createLocalVoxelRuntime() {
  return {
    runtimeVersion: LOCAL_RUNTIME_VERSION,

    listAnimationTemplates() {
      return LOCAL_ANIMATION_TEMPLATES.map(key => ({ key }));
    },

    buildGeometry(type, params) {
      return fallbackBuildGeometry(type, params);
    },

    evaluateMotion(plan, duration, model, t) {
      const safeDuration = Math.max(0.01, duration || 1);
      const result = {};
      for (const [groupId, motions] of Object.entries(plan || {})) {
        if (groupId.startsWith('_') || !motions || typeof motions !== 'object') continue;
        const entry = { position: [0, 0, 0], rotation: [0, 0, 0], scale: null };
        for (const [templateName, rawParams] of Object.entries(motions)) {
          if (templateName.startsWith('_') || templateName === 'emit') continue;
          for (const params of Array.isArray(rawParams) ? rawParams : [rawParams]) {
            const start = params?._t0 ?? 0;
            const end = params?._t1 ?? safeDuration;
            if (t < start - 0.0001 || t > end + 0.0001) continue;
            const transform = evaluateTemplate(templateName, params, t, safeDuration, groupId, model);
            const childIds = Object.keys(transform).filter(key => !['position', 'rotation', 'scale'].includes(key) && !key.startsWith('_'));
            if (childIds.length) {
              for (const childId of childIds) {
                result[childId] ||= { position: [0, 0, 0], rotation: [0, 0, 0], scale: null };
                addTransform(result[childId], transform[childId]);
              }
            } else {
              addTransform(entry, transform);
            }
          }
        }
        result[groupId] = entry;
      }

      for (const [groupId, motions] of Object.entries(plan || {})) {
        const pointTo = motions?.pointTo;
        if (!pointTo) continue;
        for (const params of Array.isArray(pointTo) ? pointTo : [pointTo]) {
          if (!params.lockWorldRot) continue;
          const part = model?.getPart?.(groupId);
          if (!part) continue;
          const axis = axisIndex(params.axis || 'x');
          const baseRotation = [part.rotation?.x || 0, part.rotation?.y || 0, part.rotation?.z || 0];
          const restWorld = chainWorldQuaternion(model, groupId)
            .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...baseRotation, 'XYZ')));
          const targetEuler = new THREE.Euler().setFromQuaternion(restWorld, 'YXZ');
          const target = [targetEuler.x, targetEuler.y, targetEuler.z];
          target[axis] = (params.angle || 0) * Math.PI / 180;
          const targetWorld = new THREE.Quaternion().setFromEuler(new THREE.Euler(...target, 'XYZ'));
          const local = chainWorldQuaternion(model, groupId, result).invert().multiply(targetWorld);
          const localEuler = new THREE.Euler().setFromQuaternion(local, 'YXZ');
          result[groupId] ||= { position: [0, 0, 0], rotation: [0, 0, 0], scale: null };
          result[groupId].rotation = [
            localEuler.x - baseRotation[0],
            localEuler.y - baseRotation[1],
            localEuler.z - baseRotation[2],
          ];
        }
      }

      for (const [groupId, motions] of Object.entries(plan || {})) {
        const lockWorldRot = motions?.lockWorldRot;
        if (!lockWorldRot) continue;
        for (const params of Array.isArray(lockWorldRot) ? lockWorldRot : [lockWorldRot]) {
          const part = model?.getPart?.(groupId);
          if (!part) continue;
          const baseRotation = [part.rotation?.x || 0, part.rotation?.y || 0, part.rotation?.z || 0];
          const restWorld = chainWorldQuaternion(model, groupId)
            .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...baseRotation, 'XYZ')));
          const restEuler = new THREE.Euler().setFromQuaternion(restWorld, 'YXZ');
          const target = [
            params.rotX !== undefined ? (params.rotX || 0) : restEuler.x,
            params.rotY !== undefined ? (params.rotY || 0) : restEuler.y,
            params.rotZ !== undefined ? (params.rotZ || 0) : restEuler.z,
          ];
          const targetWorld = new THREE.Quaternion().setFromEuler(new THREE.Euler(...target, 'XYZ'));
          const local = chainWorldQuaternion(model, groupId, result).invert().multiply(targetWorld);
          const localEuler = new THREE.Euler().setFromQuaternion(local, 'YXZ');
          result[groupId] ||= { position: [0, 0, 0], rotation: [0, 0, 0], scale: null };
          result[groupId].rotation = [
            localEuler.x - baseRotation[0],
            localEuler.y - baseRotation[1],
            localEuler.z - baseRotation[2],
          ];
        }
      }

      result._attachMap = {};
      for (const [groupId, motions] of Object.entries(plan || {})) {
        if (motions?._attach) result._attachMap[groupId] = motions._attach;
      }
      return result;
    },
  };
}
