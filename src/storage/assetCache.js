/**
 * Asset cache — in-memory key-value store for model/animation JSON.
 * Prevents duplicate fetch() and enables preload strategies.
 */

const cache = new Map();

export const assetCache = {
  /**
   * Load an asset by path. Uses the provided loader or defaults to JSON fetch.
   * @param {string} path
   * @param {Function|null} loader — async (path) => data
   * @returns {Promise<any>}
   */
  async load(path, loader = null) {
    if (cache.has(path)) return cache.get(path);

    const promise = loader
      ? loader(path)
      : fetch(`/${path}`).then((r) => (r.ok ? r.json() : null));

    cache.set(path, promise);
    return promise;
  },

  /**
   * Store data directly (e.g. for programmatically generated assets).
   * @param {string} path
   * @param {any} data
   */
  set(path, data) {
    cache.set(path, Promise.resolve(data));
  },

  /**
   * Check if an asset is already cached.
   * @param {string} path
   */
  has(path) {
    return cache.has(path);
  },

  /**
   * Preload multiple assets in parallel.
   * @param {Array<string>} paths
   * @param {Function|null} loader
   * @returns {Promise<void>}
   */
  preload(paths, loader = null) {
    return Promise.all(paths.map((p) => this.load(p, loader)));
  },

  /**
   * Clear all cached assets.
   */
  clear() {
    cache.clear();
  },
};
