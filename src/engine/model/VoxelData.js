/**
 * VoxelData - Lowpoly 模型核心数据结构
 * 方向规范: Y-Up, Z-Forward(+Z), X-Right(+X)
 *
 * 支持层级系统：组(group) 和 锁定(lock)
 *   组 = 没有 mesh 的 VoxelPart (isGroup=true)
 *   子节点通过 parent 引用组 ID
 *
 * 本文件基于 artwork-place/VoxelData.js 蓝本适配，供游戏运行时使用。
 */

function boundsFromPoints(points, expand = 0) {
  if (!points.length) return null;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const point of points) {
    const x = Number(point[0]) || 0;
    const y = Number(point[1]) || 0;
    const z = Number(point[2]) || 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return {
    minX: minX - expand,
    minY: minY - expand,
    minZ: minZ - expand,
    maxX: maxX + expand,
    maxY: maxY + expand,
    maxZ: maxZ + expand,
  };
}

function boundsFromTriangleParams(g = {}) {
  return boundsFromPoints([
    Array.isArray(g.a) ? g.a : [0, 0, 0],
    Array.isArray(g.b) ? g.b : [1, 0, 0],
    Array.isArray(g.c) ? g.c : [0, 1, 0],
  ], Math.max(0, Number(g.d) || 0) / 2);
}

function boundsFromPatchParams(g = {}) {
  const vertices = Array.isArray(g.vertices) ? g.vertices : [];
  const points = [];
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    points.push([vertices[i], vertices[i + 1], vertices[i + 2]]);
  }
  return boundsFromPoints(points, Math.max(0, Number(g.d) || 0) / 2)
    || { minX: -0.5, minY: -0.5, minZ: 0, maxX: 0.5, maxY: 0.5, maxZ: 0 };
}

/* ---------- VoxelPart ---------- */

export class VoxelPart {
  constructor(data = {}) {
    this.id = data.id || ('p_' + Math.random().toString(36).slice(2, 9));
    this.name = data.name || 'Unnamed';
    this.parent = data.parent || null;
    this.mirrorOf = data.mirrorOf || null;
    this.isGroup = data.isGroup || data.group || false;
    this.locked = data.locked || false;

    this.offset = { x: 0, y: 0, z: 0, ...(data.offset || {}) };
    this.rotation = { x: 0, y: 0, z: 0, ...(data.rotation || {}) };
    this.quaternion = data.quaternion ? { ...data.quaternion } : null;
    this.scale = data.scale ? { x: data.scale.x ?? 1, y: data.scale.y ?? 1, z: data.scale.z ?? 1 } : null;
    this.attach = data.attach || null;
    this.pivotTarget = data.pivotTarget || null;

    // Lowpoly mesh data (只有叶子节点有)
    this.mesh = data.mesh || null;

    // Legacy shape data (兼容旧格式)
    this.shapes = [];
    this.voxels = [];
    this.boxes = [];

    if (data.mesh) {
      const m = data.mesh;
      const rawColor = m.material?.color ?? 0xcccccc;
      const hexStr = typeof rawColor === 'number'
        ? '#' + rawColor.toString(16).padStart(6, '0')
        : rawColor; // already a string like '#aabbcc'
      if (m.type === 'box') {
        const w = m.geometry?.width || 1;
        const h = m.geometry?.height || 1;
        const d = m.geometry?.depth || 1;
        this.boxes.push({ minX: 0, minY: 0, minZ: 0, maxX: w - 1, maxY: h - 1, maxZ: d - 1, color: hexStr });
      } else {
        this.voxels.push({ x: 0, y: 0, z: 0, color: hexStr });
      }
    } else if (Array.isArray(data.shapes)) {
      for (const s of data.shapes) {
        if (s) {
          this.shapes.push(s);
          if (s.type === 'box') {
            const x = Math.round(s.x || 0), y = Math.round(s.y || 0), z = Math.round(s.z || 0);
            const w = Math.max(1, Math.round(s.w || 1)), h = Math.max(1, Math.round(s.h || 1)), d = Math.max(1, Math.round(s.d || 1));
            this.boxes.push({ minX: x, minY: y, minZ: z, maxX: x + w - 1, maxY: y + h - 1, maxZ: z + d - 1, color: s.color || '#cccccc' });
          } else if (s.type === 'dot') {
            this.voxels.push({ x: Math.round(s.x || 0), y: Math.round(s.y || 0), z: Math.round(s.z || 0), color: s.color || '#cccccc' });
          }
        }
      }
    }

    const items = data.voxels || [];
    for (const v of items) {
      if (Array.isArray(v)) {
        this.voxels.push({ x: Math.round(v[0] || 0), y: Math.round(v[1] || 0), z: Math.round(v[2] || 0), color: v[3] || '#cccccc' });
      } else if (v && v.type === 'box') {
        this.boxes.push({
          minX: Math.round(v.min?.[0] ?? v.min?.x ?? 0), minY: Math.round(v.min?.[1] ?? v.min?.y ?? 0), minZ: Math.round(v.min?.[2] ?? v.min?.z ?? 0),
          maxX: Math.round(v.max?.[0] ?? v.max?.x ?? 0), maxY: Math.round(v.max?.[1] ?? v.max?.y ?? 0), maxZ: Math.round(v.max?.[2] ?? v.max?.z ?? 0),
          color: v.color || '#cccccc'
        });
      } else if (v && typeof v === 'object') {
        this.voxels.push({ x: Math.round(v.x || 0), y: Math.round(v.y || 0), z: Math.round(v.z || 0), color: v.color || '#cccccc' });
      }
    }

    this.motion = {
      rotationAxes: { x: data.motion?.rotationAxes?.x ?? true, y: data.motion?.rotationAxes?.y ?? true, z: data.motion?.rotationAxes?.z ?? true },
      translationAxes: { x: data.motion?.translationAxes?.x ?? true, y: data.motion?.translationAxes?.y ?? true, z: data.motion?.translationAxes?.z ?? true }
    };

    this.material = { roughness: 0.5, metalness: 0.05, ...(data.material || {}) };
  }

  getVoxelCount() {
    if (this.mesh) return 1;
    return this.boxes.reduce((s, b) => s + (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1) * (b.maxZ - b.minZ + 1), 0) + this.voxels.length;
  }

  /** 递归获取所有后代 ID */
  getDescendantIds(model) {
    const ids = [];
    const children = model ? model.getChildren(this.id) : [];
    for (const child of children) {
      ids.push(child.id);
      ids.push(...child.getDescendantIds(model));
    }
    return ids;
  }

  clone() {
    return new VoxelPart({
      id: this.id, name: this.name, parent: this.parent, mirrorOf: this.mirrorOf,
      isGroup: this.isGroup, locked: this.locked,
      offset: { ...this.offset }, rotation: { ...this.rotation }, quaternion: this.quaternion ? { ...this.quaternion } : null, scale: this.scale ? { ...this.scale } : null, attach: this.attach,
      pivotTarget: this.pivotTarget,
      mesh: this.mesh ? JSON.parse(JSON.stringify(this.mesh)) : null,
      shapes: this.shapes.map(s => ({ ...s })),
      voxels: this.voxels.map(v => ({ ...v })),
      boxes: this.boxes.map(b => ({ ...b })),
      motion: JSON.parse(JSON.stringify(this.motion)),
      material: { ...this.material }
    });
  }

  static fromJSON(json) {
    return new VoxelPart(json);
  }
}

/* ---------- VoxelModel ---------- */

export class VoxelModel {
  constructor(data = {}) {
    this.name = data.name || 'Untitled';
    this.rigType = data.rigType || 'custom';
    this.type = data.type || 'voxel';
    this.parts = [];
    this.animations = data.animations || {};
    this._animOverrides = data._animOverrides || {};
    this.meta = data.meta || { version: '3.0', created: Date.now() };
    this._aiMeta = data._aiMeta || data._meta?.ai || null;

    if (data.nodes && Array.isArray(data.nodes)) {
      // v2 format: flat nodes (group = no `mesh`, mesh = has `mesh`). All transforms
      // are local-to-parent. Mirrors backend model-data.js v2 parse.
      this.type = 'lowpoly';
      this.name = data.name || 'Untitled';
      const groupIds = new Set();
      for (const node of data.nodes) {
        const t = node.transform || {};
        const pos = t.pos || [0, 0, 0];
        const quat = t.quat ? { x: t.quat[0] || 0, y: t.quat[1] || 0, z: t.quat[2] || 0, w: t.quat[3] ?? 1 } : null;
        const scale = t.scale ? { x: t.scale[0] ?? 1, y: t.scale[1] ?? 1, z: t.scale[2] ?? 1 } : null;
        if (node.mesh) {
          const m = node.mesh;
          const material = m.material ? { ...m.material } : { color: m.color ?? 0xcccccc, flatShading: true };
          const typeName = m.type ? m.type.charAt(0).toUpperCase() + m.type.slice(1) : 'Mesh';
          this.parts.push(new VoxelPart({
            id: node.id,
            name: node.name || typeName,
            parent: node.parent || null,
            offset: { x: pos[0], y: pos[1], z: pos[2] },
            rotation: { x: 0, y: 0, z: 0 },
            quaternion: quat,
            scale,
            mesh: { type: m.type, geometry: { ...(m.params || m.geometry || {}) }, material },
          }));
        } else {
          groupIds.add(node.id);
          this.parts.push(new VoxelPart({
            id: node.id,
            name: node.name || node.id,
            parent: node.parent || null,
            isGroup: true,
            offset: { x: pos[0], y: pos[1], z: pos[2] },
            rotation: { x: 0, y: 0, z: 0 },
            quaternion: quat,
            scale,
          }));
        }
      }
      // Auto-lock children of groups (matches v1 behavior)
      for (const part of this.parts) {
        if (!part.isGroup && part.parent && groupIds.has(part.parent)) part.locked = true;
      }
    } else if (data.meshes && Array.isArray(data.meshes)) {
      // v1 legacy: flat meshes[] with group:true / parent. Kept for transition (old saved models).
      this.type = 'lowpoly';
      this.name = data.name || 'Untitled';
      let currentGroupId = null; // Track last seen group for parent inference
      const explicitUnlocked = new Set(); // Track parts with explicit locked:false

      for (let i = 0; i < data.meshes.length; i++) {
        const m = data.meshes[i];

        if (m.group) {
          // Group node: subsequent meshes auto-parent to this group
          currentGroupId = m.id;
          this.parts.push(new VoxelPart({
            id: m.id || ('group_' + i),
            name: m.name || 'Group_' + i,
            parent: m.parent || null,
            isGroup: true,
            locked: m.locked === undefined ? false : m.locked,
            offset: m.position ? { x: m.position.x || 0, y: m.position.y || 0, z: m.position.z || 0 } : { x: 0, y: 0, z: 0 },
            rotation: m.rotation ? { x: m.rotation.x || 0, y: m.rotation.y || 0, z: m.rotation.z || 0 } : { x: 0, y: 0, z: 0 },
            pivotTarget: m.pivotTarget || null
          }));
        } else {
          // Mesh node: infer parent from last group if not explicit
          const parentId = m.parent || currentGroupId || null;
          const typeName = m.type ? m.type.charAt(0).toUpperCase() + m.type.slice(1) : 'Mesh';
          // Compact format: m.color (number) → expand to material object
          const material = m.color !== undefined
            ? { color: m.color, flatShading: true }
            : { ...(m.material || {}) };
          if (m.locked === false) explicitUnlocked.add(m.id || ('mesh_' + i));
          this.parts.push(new VoxelPart({
            id: m.id || ('mesh_' + i),
            name: m.name || (typeName + '_' + i),
            parent: parentId,
            locked: m.locked === true,
            offset: { x: m.position?.x ?? 0, y: m.position?.y ?? 0, z: m.position?.z ?? 0 },
            rotation: m.rotation ? { x: m.rotation.x || 0, y: m.rotation.y || 0, z: m.rotation.z || 0 } : { x: 0, y: 0, z: 0 },
            quaternion: m.quaternion ? { x: m.quaternion.x || 0, y: m.quaternion.y || 0, z: m.quaternion.z || 0, w: m.quaternion.w ?? 1 } : null,
            mesh: { type: m.type, geometry: { ...m.geometry }, material }
          }));
        }
      }

      // Auto-lock children of groups (unless explicitly unlocked)
      const groupIds = new Set(this.parts.filter(p => p.isGroup).map(p => p.id));
      for (const part of this.parts) {
        if (!part.isGroup && part.parent && groupIds.has(part.parent)) {
          if (!explicitUnlocked.has(part.id)) {
            part.locked = true;
          }
        }
      }
    } else {
      this.parts = (data.parts || []).map(p => VoxelPart.fromJSON(p));
    }

    // Pivot placement is now done server-side (LowpolyBuilder._autoCenterGroups + _fixChainPivots).
    // Frontend no longer modifies model positions on load.
  }

  /** Compute the axis-aligned bounding box of a group's direct non-group children,
   *  respecting each child's rotation (XYZ Euler order, matching Three.js default). */
  _getChildrenBounds(groupId) {
    const children = this.getChildren(groupId).filter(c => !c.isGroup);
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const c of children) {
      const bounds = this._getMeshBounds(c);
      if (!bounds) continue;

      const hasQuat = !!c.quaternion;
      const { x: rx, y: ry, z: rz } = c.rotation;
      const hasRot = !hasQuat && (Math.abs(rx) > 1e-9 || Math.abs(ry) > 1e-9 || Math.abs(rz) > 1e-9);

      if (!hasQuat && !hasRot) {
        const ox = c.offset.x, oy = c.offset.y, oz = c.offset.z;
        minX = Math.min(minX, ox + bounds.minX);
        minY = Math.min(minY, oy + bounds.minY);
        minZ = Math.min(minZ, oz + bounds.minZ);
        maxX = Math.max(maxX, ox + bounds.maxX);
        maxY = Math.max(maxY, oy + bounds.maxY);
        maxZ = Math.max(maxZ, oz + bounds.maxZ);
        continue;
      }

      const corners = [
        [bounds.minX, bounds.minY, bounds.minZ],
        [bounds.minX, bounds.minY, bounds.maxZ],
        [bounds.minX, bounds.maxY, bounds.minZ],
        [bounds.minX, bounds.maxY, bounds.maxZ],
        [bounds.maxX, bounds.minY, bounds.minZ],
        [bounds.maxX, bounds.minY, bounds.maxZ],
        [bounds.maxX, bounds.maxY, bounds.minZ],
        [bounds.maxX, bounds.maxY, bounds.maxZ],
      ];

      if (hasQuat) {
        const q = c.quaternion;
        for (let [px, py, pz] of corners) {
          const tx = 2 * (q.y * pz - q.z * py);
          const ty = 2 * (q.z * px - q.x * pz);
          const tz = 2 * (q.x * py - q.y * px);
          const rrx = px + q.w * tx + (q.y * tz - q.z * ty);
          const rry = py + q.w * ty + (q.z * tx - q.x * tz);
          const rrz = pz + q.w * tz + (q.x * ty - q.y * tx);
          minX = Math.min(minX, c.offset.x + rrx);
          minY = Math.min(minY, c.offset.y + rry);
          minZ = Math.min(minZ, c.offset.z + rrz);
          maxX = Math.max(maxX, c.offset.x + rrx);
          maxY = Math.max(maxY, c.offset.y + rry);
          maxZ = Math.max(maxZ, c.offset.z + rrz);
        }
      } else {
        const cosX = Math.cos(rx), sinX = Math.sin(rx);
        const cosY = Math.cos(ry), sinY = Math.sin(ry);
        const cosZ = Math.cos(rz), sinZ = Math.sin(rz);
        for (let [px, py, pz] of corners) {
          let y1 = py * cosX - pz * sinX;
          let z1 = py * sinX + pz * cosX;
          let x2 = px * cosY + z1 * sinY;
          let z2 = -px * sinY + z1 * cosY;
          let x3 = x2 * cosZ - y1 * sinZ;
          let y3 = x2 * sinZ + y1 * cosZ;
          minX = Math.min(minX, c.offset.x + x3);
          minY = Math.min(minY, c.offset.y + y3);
          minZ = Math.min(minZ, c.offset.z + z2);
          maxX = Math.max(maxX, c.offset.x + x3);
          maxY = Math.max(maxY, c.offset.y + y3);
          maxZ = Math.max(maxZ, c.offset.z + z2);
        }
      }
    }

    if (!isFinite(minX)) return null;
    return { minX, minY, minZ, maxX, maxY, maxZ,
      centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2, centerZ: (minZ + maxZ) / 2 };
  }

  /** Get the local AABB of a single mesh part */
  _getMeshBounds(part) {
    if (!part.mesh) return null;
    const g = part.mesh.geometry || {};
    switch (part.mesh.type) {
      case 'box': {
        const hw = (g.width || 1) / 2, hh = (g.height || 1) / 2, hd = (g.depth || 1) / 2;
        return { minX: -hw, minY: -hh, minZ: -hd, maxX: hw, maxY: hh, maxZ: hd };
      }
      case 'sphere': {
        const r = g.radius || 1;
        return { minX: -r, minY: -r, minZ: -r, maxX: r, maxY: r, maxZ: r };
      }
      case 'cylinder': {
        const r = Math.max(g.radiusTop ?? 1, g.radiusBottom ?? 1);
        const hh = (g.height || 1) / 2;
        return { minX: -r, minY: -hh, minZ: -r, maxX: r, maxY: hh, maxZ: r };
      }
      case 'cone': {
        const r = g.radius || 1, hh = (g.height || 1) / 2;
        return { minX: -r, minY: -hh, minZ: -r, maxX: r, maxY: hh, maxZ: r };
      }
      case 'torus': {
        const R = (g.radius || 1) + (g.tube || 0.3);
        const t = (g.tube || 0.3);
        return { minX: -R, minY: -t, minZ: -R, maxX: R, maxY: t, maxZ: R };
      }
      case 'dodecahedron': case 'icosahedron': case 'octahedron': {
        const r = g.radius || 1;
        return { minX: -r, minY: -r, minZ: -r, maxX: r, maxY: r, maxZ: r };
      }
      case 'tri':
        return boundsFromTriangleParams(g);
      case 'patch':
        return boundsFromPatchParams(g);
      case 'wedge': {
        const hw = (g.width || 1) / 2, hh = (g.height || 1) / 2, hd = (g.depth || 1) / 2;
        return { minX: -hw, minY: -hh, minZ: -hd, maxX: hw, maxY: hh, maxZ: hd };
      }
      default: {
        // Try runtime to get accurate bounds
        const rt = typeof window !== 'undefined' ? window.__voxelRuntime : null;
        if (rt) {
          try {
            const geo = rt.buildGeometry(part.mesh.type, part.mesh.geometry || {});
            geo.computeBoundingBox();
            const bb = geo.boundingBox;
            if (bb && isFinite(bb.min.x)) {
              geo.dispose();
              return { minX: bb.min.x, minY: bb.min.y, minZ: bb.min.z, maxX: bb.max.x, maxY: bb.max.y, maxZ: bb.max.z };
            }
            geo.dispose();
          } catch (_) { /* fallback */ }
        }
        return { minX: -0.5, minY: -0.5, minZ: -0.5, maxX: 0.5, maxY: 0.5, maxZ: 0.5 };
      }
    }
  }

  getPart(id) { return this.parts.find(p => p.id === id); }
  getRootParts() { return this.parts.filter(p => !p.parent); }
  getChildren(parentId) { return this.parts.filter(p => p.parent === parentId); }

  /**
   * 获取某个 part 及其所有后代的 ID 列表
   */
  getPartFamily(id) {
    const part = this.getPart(id);
    if (!part) return [];
    return [id, ...part.getDescendantIds(this)];
  }

  clone() {
    return new VoxelModel({
      name: this.name + ' Copy', type: this.type, rigType: this.rigType,
      parts: this.parts.map(p => p.clone()),
      animations: JSON.parse(JSON.stringify(this.animations)),
      meta: { ...this.meta }
    });
  }

  optimize() { return this; }
  autoLayout() { return this; }

  resolveMirrors() {
    const mirrorMap = new Map();
    for (const part of this.parts) {
      if (part.mirrorOf) mirrorMap.set(part.id, part.mirrorOf);
    }
    for (const [childId, sourceId] of mirrorMap) {
      const source = this.getPart(sourceId);
      const target = this.getPart(childId);
      if (!source || !target) continue;
      if (source.mesh && !target.mesh) {
        target.mesh = JSON.parse(JSON.stringify(source.mesh));
        target.offset = { x: -source.offset.x, y: source.offset.y, z: source.offset.z };
        if (source.quaternion) {
          target.quaternion = { x: source.quaternion.x, y: -source.quaternion.y, z: -source.quaternion.z, w: source.quaternion.w };
        }
        target.rotation = { x: source.rotation.x, y: -source.rotation.y, z: -source.rotation.z };
      } else if (source.shapes.length > 0) {
        target.shapes = source.shapes.map(s => {
          const json = typeof s === 'object' ? (s.toJSON ? s.toJSON() : { ...s }) : { ...s };
          if (json.x !== undefined) json.x = -json.x;
          return json;
        });
        target.voxels = source.voxels.map(v => ({ ...v, x: -v.x }));
        target.boxes = source.boxes.map(b => ({
          minX: -b.maxX, maxX: -b.minX,
          minY: b.minY, maxY: b.maxY,
          minZ: b.minZ, maxZ: b.maxZ,
          color: b.color
        }));
      }
    }
    return this;
  }

  toJSON() {
    if (this.type === 'lowpoly') {
      const r2 = v => Math.round(v * 10000) / 10000;
      // XYZ Euler (radians) → quaternion {x,y,z,w} (mirrors THREE XYZ order).
      const eulerToQuat = (rx, ry, rz) => {
        const c1 = Math.cos(rx / 2), s1 = Math.sin(rx / 2);
        const c2 = Math.cos(ry / 2), s2 = Math.sin(ry / 2);
        const c3 = Math.cos(rz / 2), s3 = Math.sin(rz / 2);
        return { x: s1 * c2 * c3 + c1 * s2 * s3, y: c1 * s2 * c3 - s1 * c2 * s3,
                 z: c1 * c2 * s3 + s1 * s2 * c3, w: c1 * c2 * c3 - s1 * s2 * s3 };
      };
      const nodes = this.parts.map(p => {
        const node = { id: p.id };
        if (p.isGroup) {
          if (p.name && p.name !== p.id) node.name = p.name;
        } else {
          node.mesh = { type: p.mesh?.type || 'box', params: { ...(p.mesh?.geometry || {}) } };
          const mat = p.mesh?.material;
          const hasExtra = mat && (mat.roughness !== undefined || mat.metalness !== undefined
            || mat.transparent || mat.flatShading === false);
          if (hasExtra) node.mesh.material = { ...mat };
          else node.mesh.color = mat?.color ?? p.material?.color ?? 0xcccccc;
        }
        if (p.parent) node.parent = p.parent;
        const transform = { pos: [r2(p.offset.x), r2(p.offset.y), r2(p.offset.z)] };
        if (p.quaternion) {
          transform.quat = [r2(p.quaternion.x), r2(p.quaternion.y), r2(p.quaternion.z), r2(p.quaternion.w)];
        } else if (p.rotation && (p.rotation.x || p.rotation.y || p.rotation.z)) {
          const q = eulerToQuat(p.rotation.x || 0, p.rotation.y || 0, p.rotation.z || 0);
          transform.quat = [r2(q.x), r2(q.y), r2(q.z), r2(q.w)];
        }
        if (p.scale) transform.scale = [r2(p.scale.x), r2(p.scale.y), r2(p.scale.z)];
        node.transform = transform;
        if (p.locked) node.locked = true;
        return node;
      });
      const out = { name: this.name, type: 'lowpoly', format: 2, nodes, _meta: { skipAutoCenter: true } };
      if (this.animations && Object.keys(this.animations).length > 0) out.animations = this.animations;
      if (this._animOverrides && Object.keys(this._animOverrides).length > 0) out._animOverrides = this._animOverrides;
      if (this._aiMeta) out._meta.ai = this._aiMeta;
      return out;
    }
    return {
      name: this.name, rigType: this.rigType, _skipAutoCenter: true,
      parts: this.parts.map(p => ({
        id: p.id, name: p.name, parent: p.parent, mirrorOf: p.mirrorOf,
        isGroup: p.isGroup, locked: p.locked,
        offset: { ...p.offset }, rotation: { ...p.rotation },
        attach: p.attach,
        shapes: p.shapes, voxels: p.voxels, boxes: p.boxes,
        motion: p.motion, material: p.material
      })),
      animations: this.animations,
      meta: this.meta,
      ...(this._aiMeta ? { _aiMeta: this._aiMeta } : {})
    };
  }

  static fromJSON(json) {
    return new VoxelModel(json);
  }
}
