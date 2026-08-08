const TERRAIN_COLORS = {
  grass: '#83b864',
  dirt: '#b58a58',
  rock: '#92928d',
  water: '#59a9c5',
  sand: '#e8cf8b',
  farmland: '#986643',
  brick: '#b76150',
};

const MAP_FACE = 'rgba(246, 236, 205, 0.92)';
const DEFAULT_VIEW_RADIUS = 40;
const DEFAULT_PET_ICON_URLS = Object.freeze({
  momo: '/ui/minimap-pets/momo.png',
  mako: '/ui/minimap-pets/mako.png',
  yafo: '/ui/minimap-pets/yafo.png',
  lingq: '/ui/minimap-pets/lingq.png',
  fangk: '/ui/minimap-pets/fangk.png',
  mok: '/ui/minimap-pets/mok.png',
  builder_crab: '/ui/minimap-pets/builder-crab.png',
  fallback: '/ui/minimap-pet-avatar.png',
});

const PET_ICON_ALIASES = Object.freeze({
  bear: 'momo',
  horse_7: 'mako',
  horse: 'mako',
  sky_bird: 'yafo',
  bird: 'yafo',
  peacock: 'lingq',
  fangke: 'fangk',
  architect: 'fangk',
  croc_axe: 'mok',
  crocodile: 'mok',
  crab: 'builder_crab',
  buildercrab: 'builder_crab',
});

function positionOf(value) {
  const position = value?.mesh?.position || value?.position || value;
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
  return position;
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function normalizePetIconId(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized) return null;
  const resolved = PET_ICON_ALIASES[normalized] || normalized;
  return DEFAULT_PET_ICON_URLS[resolved] ? resolved : null;
}

export function resolveMiniMapPetIconId(pet) {
  const candidates = [
    pet?._residentId,
    pet?._petId,
    pet?._profile?.id,
    pet?._petName,
    pet?.mesh?.name,
  ];
  for (const candidate of candidates) {
    const resolved = normalizePetIconId(candidate);
    if (resolved) return resolved;
  }
  return 'fallback';
}

export function worldToLocalMap(position, playerPosition, {
  centerX,
  centerY,
  scale,
}) {
  return {
    x: centerX + (position.x - playerPosition.x) * scale,
    y: centerY + (position.z - playerPosition.z) * scale,
  };
}

function shortLabel(value) {
  return String(value || '').trim().slice(0, 5);
}

export function classifyMiniMapObject(entity) {
  const tokens = [entity?.name, ...(entity?.tags || [])]
    .map(value => String(value || '').toLowerCase());
  const has = (...values) => values.some(value => tokens.some(token => token.includes(value)));
  if (has('篝火', 'campfire')) return 'campfire';
  if (has('树木', 'tree', 'apple', 'oak')) return 'tree';
  if (has('crop', 'wheat', 'carrot', '蔬菜', '小麦', '胡萝卜')) return 'crop';
  if (has('flower', '花', 'plant', 'grass', '草')) return 'plant';
  return null;
}

export class IslandMiniMapPresenter {
  constructor({
    canvas,
    terrainLayout,
    center,
    tileSize,
    landmarks = [],
    viewRadius = DEFAULT_VIEW_RADIUS,
    getPets = () => [],
    worldObjects = null,
    petIconUrls = DEFAULT_PET_ICON_URLS,
  }) {
    this.canvas = canvas;
    this.shell = canvas?.closest?.('#island-minimap-shell') || null;
    this.context = canvas?.getContext?.('2d') || null;
    this.terrainLayout = terrainLayout || [];
    this.gridSize = this.terrainLayout.length;
    this.center = center;
    this.tileSize = tileSize;
    this.landmarks = landmarks;
    this.viewRadius = viewRadius;
    this.getPets = getPets;
    this.worldObjects = worldObjects;
    this.objectMarkers = [];
    this.player = null;
    this.objective = null;
    this.elapsed = 0;
    this.renderTimer = 0;
    this.disposed = false;
    this.petIcons = new Map();
    if (typeof Image !== 'undefined') {
      Object.entries({ ...DEFAULT_PET_ICON_URLS, ...petIconUrls }).forEach(([id, url]) => {
        const image = new Image();
        image.src = url;
        this.petIcons.set(id, image);
      });
    }
    this.unsubscribeWorldObjects = worldObjects?.onChange?.(() => this._refreshObjectMarkers()) || null;
    this._refreshObjectMarkers();
    this._resize();
    this.shell?.classList.add('visible');
  }

  _resize() {
    if (!this.canvas || !this.context) return;
    const size = Math.max(132, Math.round(this.canvas.clientWidth || 176));
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    this.canvas.width = Math.round(size * ratio);
    this.canvas.height = Math.round(size * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.size = size;
  }

  setPlayer(player) {
    this.player = player;
  }

  setObjective(objective) {
    this.objective = objective;
  }

  update(dt) {
    if (this.disposed || !this.context || !this.player) return;
    if (Math.round(this.canvas.clientWidth || 0) !== this.size) this._resize();
    this.elapsed += dt;
    this.renderTimer += dt;
    if (this.renderTimer < 0.08) return;
    this.renderTimer = 0;
    this.render();
  }

  _worldToCell(position) {
    const offset = ((this.gridSize - 1) * this.tileSize) / 2;
    return {
      x: Math.round((position.x - this.center[0] + offset) / this.tileSize),
      z: Math.round((position.z - this.center[1] + offset) / this.tileSize),
    };
  }

  _cellToWorld(x, z) {
    const offset = ((this.gridSize - 1) * this.tileSize) / 2;
    return {
      x: this.center[0] + x * this.tileSize - offset,
      z: this.center[1] + z * this.tileSize - offset,
    };
  }

  _drawTerrain(ctx, playerPosition, transform) {
    const playerCell = this._worldToCell(playerPosition);
    const radiusCells = Math.ceil(this.viewRadius / this.tileSize) + 1;
    const cellPixels = this.tileSize * transform.scale;
    const minX = Math.max(0, playerCell.x - radiusCells);
    const maxX = Math.min(this.gridSize - 1, playerCell.x + radiusCells);
    const minZ = Math.max(0, playerCell.z - radiusCells);
    const maxZ = Math.min(this.gridSize - 1, playerCell.z + radiusCells);

    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const world = this._cellToWorld(x, z);
        const point = worldToLocalMap(world, playerPosition, transform);
        ctx.fillStyle = TERRAIN_COLORS[this.terrainLayout[z]?.[x]] || TERRAIN_COLORS.grass;
        ctx.fillRect(
          point.x - (cellPixels / 2) - 0.35,
          point.y - (cellPixels / 2) - 0.35,
          cellPixels + 0.7,
          cellPixels + 0.7,
        );
      }
    }
  }

  _drawLocalLandmark(ctx, point, landmark, important = false) {
    const radius = important ? 5.2 : 3.6;
    ctx.fillStyle = important ? '#ef9d4b' : '#fff5cf';
    ctx.strokeStyle = important ? '#fff5cf' : '#665343';
    ctx.lineWidth = important ? 2 : 1.2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const label = shortLabel(landmark.label);
    if (!label) return;
    ctx.font = '700 9px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(246,236,205,0.92)';
    ctx.strokeText(label, point.x, point.y - radius - 3);
    ctx.fillStyle = '#4f4038';
    ctx.fillText(label, point.x, point.y - radius - 3);
  }

  _refreshObjectMarkers() {
    this.objectMarkers = (this.worldObjects?.items || [])
      .map(entity => ({ entity, kind: classifyMiniMapObject(entity) }))
      .filter(marker => marker.kind && positionOf(marker.entity));
  }

  _visibleObjectMarkers(playerPosition) {
    const clustered = new Set();
    const counts = new Map();
    const clusterSize = { tree: 14, crop: 12, plant: 16 };
    const limits = { tree: 7, crop: 8, plant: 6 };
    return this.objectMarkers
      .map(marker => ({
        ...marker,
        distance: horizontalDistance(playerPosition, positionOf(marker.entity)),
      }))
      .filter(marker => marker.distance <= this.viewRadius)
      .sort((a, b) => (
        (a.kind === 'campfire' ? -1 : b.kind === 'campfire' ? 1 : 0)
        || a.distance - b.distance
      ))
      .filter(marker => {
        if (marker.kind === 'campfire') return true;
        const position = positionOf(marker.entity);
        const size = clusterSize[marker.kind] || 14;
        const key = `${marker.kind}:${Math.floor(position.x / size)}:${Math.floor(position.z / size)}`;
        if (clustered.has(key)) return false;
        const count = counts.get(marker.kind) || 0;
        if (count >= (limits[marker.kind] || 6)) return false;
        clustered.add(key);
        counts.set(marker.kind, count + 1);
        return true;
      });
  }

  _drawEnvironmentMarker(ctx, point, kind) {
    if (kind === 'campfire') {
      ctx.fillStyle = '#fff0bd';
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e86936';
      ctx.beginPath();
      ctx.moveTo(point.x, point.y - 6);
      ctx.quadraticCurveTo(point.x + 6, point.y, point.x, point.y + 5);
      ctx.quadraticCurveTo(point.x - 5, point.y + 1, point.x, point.y - 6);
      ctx.fill();
      ctx.fillStyle = '#f6bd4f';
      ctx.beginPath();
      ctx.arc(point.x + 0.5, point.y + 1, 2.2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (kind === 'tree') {
      ctx.fillStyle = '#527f46';
      ctx.beginPath();
      ctx.arc(point.x, point.y - 1.5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#76523b';
      ctx.fillRect(point.x - 1, point.y + 2, 2, 3);
      return;
    }

    if (kind === 'crop') {
      ctx.fillStyle = '#e2b94f';
      ctx.fillRect(point.x - 3.5, point.y - 3.5, 2, 7);
      ctx.fillRect(point.x + 1.5, point.y - 3.5, 2, 7);
      return;
    }

    ctx.fillStyle = '#f18aa1';
    for (const [dx, dy] of [[0, -2.5], [2.5, 0], [0, 2.5], [-2.5, 0]]) {
      ctx.beginPath();
      ctx.arc(point.x + dx, point.y + dy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f6d56f';
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawPets(ctx, playerPosition, transform) {
    const pets = [...new Set((this.getPets?.() || []).filter(Boolean))];
    pets.forEach((pet, index) => {
      const position = positionOf(pet);
      if (!position || horizontalDistance(playerPosition, position) > this.viewRadius) return;
      const point = worldToLocalMap(position, playerPosition, transform);
      const dx = point.x - transform.centerX;
      const dy = point.y - transform.centerY;
      const distance = Math.hypot(dx, dy);
      if (distance < 15) {
        const angle = distance > 0.5 ? Math.atan2(dy, dx) : (index / Math.max(pets.length, 1)) * Math.PI * 2;
        point.x = transform.centerX + Math.cos(angle) * 15;
        point.y = transform.centerY + Math.sin(angle) * 15;
      }
      const size = 18;
      ctx.fillStyle = 'rgba(255,248,220,0.92)';
      ctx.beginPath();
      ctx.arc(point.x, point.y, 9.5, 0, Math.PI * 2);
      ctx.fill();
      const icon = this.petIcons.get(resolveMiniMapPetIconId(pet))
        || this.petIcons.get('fallback');
      if (icon?.complete && icon.naturalWidth > 0) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(icon, point.x - size / 2, point.y - size / 2, size, size);
      } else {
        ctx.fillStyle = '#d7833f';
        ctx.fillRect(point.x - 5, point.y - 5, 10, 10);
      }
    });
  }

  _drawObjective(ctx, playerPosition, transform, mapRadius) {
    const objectivePosition = positionOf(this.objective);
    if (!objectivePosition) return;
    const distance = horizontalDistance(playerPosition, objectivePosition);
    if (distance <= this.viewRadius) {
      const point = worldToLocalMap(objectivePosition, playerPosition, transform);
      const pulse = 6 + Math.sin(this.elapsed * 5) * 1.6;
      ctx.strokeStyle = 'rgba(255,247,200,0.92)';
      ctx.fillStyle = '#ed9844';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      this._drawMapLabel(ctx, point.x, point.y - pulse - 5, this.objective.label);
      return;
    }

    const angle = Math.atan2(
      objectivePosition.z - playerPosition.z,
      objectivePosition.x - playerPosition.x,
    );
    const pinRadius = mapRadius - 10;
    const x = transform.centerX + Math.cos(angle) * pinRadius;
    const y = transform.centerY + Math.sin(angle) * pinRadius;
    const pulse = 1 + Math.sin(this.elapsed * 5) * 0.08;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#ed9844';
    ctx.strokeStyle = '#fff5cf';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(6, 5);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    const labelRadius = mapRadius - 28;
    this._drawMapLabel(
      ctx,
      transform.centerX + Math.cos(angle) * labelRadius,
      transform.centerY + Math.sin(angle) * labelRadius,
      this.objective.label,
    );
  }

  _drawMapLabel(ctx, x, y, value) {
    const label = shortLabel(value);
    if (!label) return;
    ctx.font = '800 9px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = ctx.measureText(label).width + 8;
    ctx.fillStyle = 'rgba(255,247,218,0.9)';
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - 7, width, 14, 5);
    ctx.fill();
    ctx.fillStyle = '#5b4637';
    ctx.fillText(label, x, y);
  }

  _drawPlayer(ctx, transform) {
    const heading = this.player.mesh?.rotation?.y || 0;
    ctx.save();
    ctx.translate(transform.centerX, transform.centerY);
    ctx.rotate(-heading + Math.PI);
    ctx.fillStyle = '#334d46';
    ctx.strokeStyle = '#fff8dc';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6.5);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6, 6.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  render() {
    const ctx = this.context;
    const size = this.size;
    const playerPosition = positionOf(this.player);
    if (!ctx || !size || !this.gridSize || !playerPosition) return;
    const center = size / 2;
    const mapRadius = center - 2;
    const transform = {
      centerX: center,
      centerY: center,
      scale: (mapRadius - 10) / this.viewRadius,
    };

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, mapRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = MAP_FACE;
    ctx.fillRect(0, 0, size, size);
    this._drawTerrain(ctx, playerPosition, transform);

    for (const landmark of this.landmarks) {
      const landmarkPosition = positionOf(landmark);
      if (!landmarkPosition || horizontalDistance(playerPosition, landmarkPosition) > this.viewRadius) continue;
      this._drawLocalLandmark(
        ctx,
        worldToLocalMap(landmarkPosition, playerPosition, transform),
        landmark,
      );
    }

    for (const marker of this._visibleObjectMarkers(playerPosition)) {
      this._drawEnvironmentMarker(
        ctx,
        worldToLocalMap(positionOf(marker.entity), playerPosition, transform),
        marker.kind,
      );
    }

    this._drawPets(ctx, playerPosition, transform);
    this._drawObjective(ctx, playerPosition, transform, mapRadius);
    this._drawPlayer(ctx, transform);
    ctx.restore();
  }

  dispose() {
    this.disposed = true;
    this.unsubscribeWorldObjects?.();
    this.petIcons.forEach((image) => {
      image.onload = null;
      image.onerror = null;
    });
    this.petIcons.clear();
    this.shell?.classList.remove('visible');
    this.context?.clearRect(0, 0, this.size || 0, this.size || 0);
  }
}
