/**
 * Entity registry — centralized index for spatial and logical queries.
 * Decouples entity storage from individual entity classes.
 */

const allEntities = [];
const byName = new Map();
const byEnv = new Map(); // envIndex -> Set<Entity>
const byType = new Map(); // type -> Set<Entity>

export const entityRegistry = {
  /**
   * Register an entity with optional metadata.
   * @param {Object} entity — must have .name and .mesh
   * @param {Object} meta — { envIndex?, type? }
   */
  add(entity, meta = {}) {
    allEntities.push(entity);
    if (entity.name) byName.set(entity.name, entity);
    if (meta.envIndex !== undefined) {
      if (!byEnv.has(meta.envIndex)) byEnv.set(meta.envIndex, new Set());
      byEnv.get(meta.envIndex).add(entity);
    }
    if (meta.type) {
      if (!byType.has(meta.type)) byType.set(meta.type, new Set());
      byType.get(meta.type).add(entity);
    }
  },

  /**
   * Remove an entity from all indexes.
   * @param {Object} entity
   */
  remove(entity) {
    const idx = allEntities.indexOf(entity);
    if (idx !== -1) allEntities.splice(idx, 1);
    if (entity.name) byName.delete(entity.name);
    for (const set of byEnv.values()) set.delete(entity);
    for (const set of byType.values()) set.delete(entity);
  },

  /**
   * Update an entity's metadata (e.g. moved to a different env).
   * @param {Object} entity
   * @param {Object} newMeta
   */
  updateMeta(entity, newMeta) {
    this.remove(entity);
    this.add(entity, newMeta);
  },

  /**
   * Query entities by filters.
   * @param {Object} filters — { envIndex?, type?, visible?, spawned? }
   * @returns {Array}
   */
  query(filters = {}) {
    let result = [...allEntities];
    if (filters.envIndex !== undefined) {
      const set = byEnv.get(filters.envIndex);
      result = set ? [...set] : [];
    }
    if (filters.type !== undefined) {
      const set = byType.get(filters.type);
      result = result.filter((e) => set?.has(e));
    }
    if (filters.visible !== undefined) {
      result = result.filter((e) => e.mesh?.visible === filters.visible);
    }
    if (filters.spawned !== undefined) {
      result = result.filter((e) => e.spawned === filters.spawned);
    }
    return result;
  },

  /**
   * Find a single entity by name.
   * @param {string} name
   * @returns {Object|null}
   */
  find(name) {
    return byName.get(name) || null;
  },

  /**
   * Get all registered entities.
   * @returns {Array}
   */
  getAll() {
    return [...allEntities];
  },

  /**
   * Get the count of all entities.
   * @returns {number}
   */
  count() {
    return allEntities.length;
  },

  /**
   * Clear the entire registry.
   */
  clear() {
    allEntities.length = 0;
    byName.clear();
    byEnv.clear();
    byType.clear();
  },
};
