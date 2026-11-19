import { Quaternion } from 'three';

/** Baked positions/Euler angles are deltas; quaternions are absolute local poses. */
export function evaluateBakedMotion(plan, t) {
  const baked = plan._baked;
  const sample = Math.max(0, Math.min(t, plan._duration)) * baked.fps;
  const frame = Math.floor(sample), alpha = sample - frame;
  const deltas = { _attachMap: {} };
  for (const [id, tracks] of Object.entries(baked.animation)) {
    const at = (key, i, fallback = 0) => tracks[key]?.[Math.min(i, tracks[key].length - 1)] ?? fallback;
    const value = key => at(key, frame) + (at(key, frame + 1) - at(key, frame)) * alpha;
    const delta = { position: ['posX', 'posY', 'posZ'].map(value) };
    if (tracks.quatX) {
      const q = i => new Quaternion(...['quatX', 'quatY', 'quatZ', 'quatW'].map(k => at(k, i))).normalize();
      delta.absoluteQuaternion = q(frame).slerp(q(frame + 1), alpha).toArray();
    } else delta.rotation = ['rotX', 'rotY', 'rotZ'].map(value);
    deltas[id] = delta;
  }
  return deltas;
}
