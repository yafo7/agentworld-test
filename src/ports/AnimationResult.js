/** Normalize the two public backend animation formats without changing old plans. */
export function animationResultPlan(data, modelJson) {
  if (!data?.ok) throw new Error('动画生成未成功');
  if (data.plan && typeof data.plan === 'object') return data.plan;
  const b = data.baked;
  if (!b || !Number.isFinite(b.fps) || b.fps <= 0 || b.fps > 240 || !Number.isFinite(b.duration) || b.duration <= 0 || b.duration > 120
    || !b.animation || typeof b.animation !== 'object' || !Object.keys(b.animation).length) throw new Error('动画响应缺少有效轨道');
  if ((b.emit && Object.keys(b.emit).length) || (b.vfx && Object.values(b.vfx).some(v => Array.isArray(v) ? v.length : Boolean(v)))) throw new Error('采样动画暂不支持粒子轨道');
  const ids = new Set((modelJson?.nodes || []).map(n => n.id));
  for (const [id, tracks] of Object.entries(b.animation)) {
    if (!ids.has(id)) throw new Error(`动画引用不存在的模型节点：${id}`);
    if (!tracks || typeof tracks !== 'object' || !Object.keys(tracks).length) throw new Error('动画轨道为空');
    let count = null;
    for (const [key, values] of Object.entries(tracks)) {
      if (!/^(pos[XYZ]|rot[XYZ]|quat[XYZW])$/.test(key)) throw new Error(`暂不支持的动画轨道：${key}`);
      if (!Array.isArray(values) || !values.length || values.length > 28801 || !values.every(Number.isFinite) || (count !== null && values.length !== count)) throw new Error('动画采样数据无效');
      count = values.length;
    }
    const quaternionKeys = ['quatX', 'quatY', 'quatZ', 'quatW'];
    if (quaternionKeys.some(k => tracks[k])) {
      if (!quaternionKeys.every(k => tracks[k])) throw new Error('四元数轨道不完整');
      for (let i = 0; i < count; i++) if (quaternionKeys.reduce((n, k) => n + tracks[k][i] ** 2, 0) < 1e-12) throw new Error('四元数轨道无效');
    }
  }
  return { _duration: b.duration, _loop: b.loop !== false, _baked: { fps: b.fps, animation: b.animation } };
}
