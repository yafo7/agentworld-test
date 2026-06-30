import * as THREE from 'three';

/**
 * Creates a canvas-texture sprite that floats above a mesh.
 * Shows name (line1), residence info (line2, optional), tags (line3).
 *
 * Usage:
 *   const label = createTagLabel(mesh);
 *   label.update(name, tags, residence);
 */
export function createTagLabel(mesh, initialTags = []) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 220;

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMat);

  sprite.position.y = 2.2;
  sprite.scale.set(3.2, 1.375, 1); // 512/220 * 1.375 ≈ 3.2

  mesh.add(sprite);

  const label = {
    sprite,
    canvas,
    texture,
    _tags: [...initialTags],
    _name: mesh.name || '',
    _residence: '',

    /** @param {string} [residence] — optional residence info, shown on its own line */
    update(name, tags, residence) {
      this._name = name || this._name;
      this._tags = [...(tags || [])];
      this._residence = residence || '';
      _draw(this.canvas, this._name, this._tags, this._residence);
      this.texture.needsUpdate = true;
    },

    dispose() {
      this.sprite.material.dispose();
      this.texture.dispose();
    },
  };

  _draw(canvas, label._name, label._tags);
  texture.needsUpdate = true;

  return label;
}

// ---- internal ----

const LINE1_FONT = 'bold 36px "Microsoft YaHei", "PingFang SC", Arial, sans-serif';
const LINE2_FONT = '26px "Microsoft YaHei", "PingFang SC", Arial, sans-serif';
const LINE3_FONT = '22px "Microsoft YaHei", "PingFang SC", Arial, sans-serif';

function _draw(canvas, name, tags, residence) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Measure each line
  ctx.font = LINE1_FONT;
  const nameW = ctx.measureText(name).width;

  ctx.font = LINE2_FONT;
  const resW = residence ? ctx.measureText(residence).width : 0;

  const tagStr = tags.length > 0 ? tags.join(' · ') : '';
  ctx.font = LINE3_FONT;
  const tagW = tagStr ? ctx.measureText(tagStr).width : 0;

  const maxTextW = Math.max(nameW, resW, tagW);
  const padX = 24;
  const padY = 16;
  const line1H = 44;
  const line2H = residence ? 34 : 0;
  const line3H = tagStr ? 30 : 0;
  const gap = residence || tagStr ? 6 : 0;
  const gap2 = residence && tagStr ? 4 : 0;
  const totalTextH = line1H + (line2H ? gap + line2H : 0) + (line3H ? gap2 + line3H : 0);

  const bgW = maxTextW + padX * 2;
  const bgX = (w - bgW) / 2;
  const bgY = (h - totalTextH) / 2 - padY;
  const bgH = totalTextH + padY * 2;

  // Background
  const radius = 16;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.beginPath();
  ctx.moveTo(bgX + radius, bgY);
  ctx.lineTo(bgX + bgW - radius, bgY);
  ctx.quadraticCurveTo(bgX + bgW, bgY, bgX + bgW, bgY + radius);
  ctx.lineTo(bgX + bgW, bgY + bgH - radius);
  ctx.quadraticCurveTo(bgX + bgW, bgY + bgH, bgX + bgW - radius, bgY + bgH);
  ctx.lineTo(bgX + radius, bgY + bgH);
  ctx.quadraticCurveTo(bgX, bgY + bgH, bgX, bgY + bgH - radius);
  ctx.lineTo(bgX, bgY + radius);
  ctx.quadraticCurveTo(bgX, bgY, bgX + radius, bgY);
  ctx.closePath();
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  let y = bgY + padY;

  // Line 1 — name (bold, white)
  ctx.fillStyle = '#ffffff';
  ctx.font = LINE1_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(name, w / 2, y);
  y += line1H + gap;

  // Line 2 — residence (gold, on its own line)
  if (residence) {
    ctx.fillStyle = '#ffcc66';
    ctx.font = LINE2_FONT;
    ctx.fillText(residence, w / 2, y);
    y += line2H + gap2;
  }

  // Line 3 — tags (light gray)
  if (tagStr) {
    ctx.fillStyle = '#cccccc';
    ctx.font = LINE3_FONT;
    ctx.fillText(tagStr, w / 2, y);
  }
}
