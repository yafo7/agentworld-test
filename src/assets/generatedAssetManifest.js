const GENERATED_ROOT = 'generated';
const ARCHIVE_ROOT = `${GENERATED_ROOT}/_archive`;

export const GENERATED_ASSET_LIFECYCLE = Object.freeze({
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  SUPERSEDED: 'superseded',
  TOMBSTONE: 'tombstone',
});

const VALID_LIFECYCLE = new Set(Object.values(GENERATED_ASSET_LIFECYCLE));
const GENERATED_PATH_PATTERN = /^generated\/(?:_archive\/)?(?:models|animations)\/[a-z0-9_-]+\.json$/i;

function normalizeGeneratedPath(value) {
  if (typeof value !== 'string') return null;
  const path = value.replace(/^\/+/, '').replace(/\\/g, '/');
  const parts = path.split('/');
  if (
    parts[0] !== GENERATED_ROOT
    || parts.some((part) => !part || part === '.' || part === '..')
    || !GENERATED_PATH_PATTERN.test(path)
  ) {
    return null;
  }
  return path;
}

function legacyArchiveCounterpart(path) {
  const activeMatch = path.match(/^generated\/(models|animations)\/([^/]+\.json)$/);
  if (activeMatch) {
    return `${ARCHIVE_ROOT}/${activeMatch[1]}/${activeMatch[2]}`;
  }

  const archiveMatch = path.match(/^generated\/_archive\/(models|animations)\/([^/]+\.json)$/);
  if (archiveMatch) {
    return `${GENERATED_ROOT}/${archiveMatch[1]}/${archiveMatch[2]}`;
  }

  return null;
}

function normalizeLifecycle(resource, path) {
  const lifecycle = resource?.lifecycle && typeof resource.lifecycle === 'object'
    ? resource.lifecycle
    : {};
  const inferredStatus = path?.startsWith(`${ARCHIVE_ROOT}/`)
    ? GENERATED_ASSET_LIFECYCLE.ARCHIVED
    : GENERATED_ASSET_LIFECYCLE.ACTIVE;
  const status = VALID_LIFECYCLE.has(lifecycle.status) ? lifecycle.status : inferredStatus;
  const previousPaths = Array.isArray(lifecycle.previousPaths)
    ? lifecycle.previousPaths.map(normalizeGeneratedPath).filter(Boolean)
    : [];

  return {
    schemaVersion: 1,
    status,
    previousPaths: [...new Set(previousPaths.filter((candidate) => candidate !== path))],
  };
}

export function normalizeGeneratedAssetResource(resource) {
  if (!resource || typeof resource !== 'object') return null;
  const { path: _untrustedPath, ...metadata } = resource;
  const path = normalizeGeneratedPath(resource.path);
  return {
    ...metadata,
    ...(path ? { path } : {}),
    lifecycle: normalizeLifecycle(resource, path),
  };
}

export function normalizeGeneratedAssetEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;

  const animations = Array.isArray(entry.animations)
    ? entry.animations.map(normalizeGeneratedAssetResource).filter(Boolean)
    : [];
  if (entry.animId && entry.animPath && !animations.some((item) => item.animId === entry.animId)) {
    animations.unshift(normalizeGeneratedAssetResource({
      animId: entry.animId,
      name: entry.animName || 'generated animation',
      type: entry.animType || 'idle',
      path: entry.animPath,
    }));
  }

  return {
    ...normalizeGeneratedAssetResource(entry),
    animations,
    hasIdleAnimation: animations.some((item) => item.type === 'idle'),
  };
}

export function generatedAssetPathCandidates(resource) {
  const normalized = normalizeGeneratedAssetResource(resource);
  if (!normalized || normalized.lifecycle.status === GENERATED_ASSET_LIFECYCLE.TOMBSTONE) {
    return [];
  }

  const candidates = [];
  const add = (value) => {
    const path = normalizeGeneratedPath(value);
    if (path && !candidates.includes(path)) candidates.push(path);
  };

  add(normalized.path);
  for (const path of normalized.lifecycle.previousPaths) add(path);

  // Entries written before lifecycle v1 only recorded the active path. Their
  // files may already have been preserved under _archive, so retain that
  // deterministic fallback for old localStorage and save data.
  const counterpart = normalized.path && legacyArchiveCounterpart(normalized.path);
  add(counterpart);

  return candidates;
}
