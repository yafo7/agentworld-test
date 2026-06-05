import * as THREE from 'three';

/**
 * Creates a canvas-texture sprite that floats above a mesh,
 * displaying its current tags as readable text.
 *
 * Usage:
 *   const label = createTagLabel(mesh, tagsArray);
 *   label.update(newTagsArray);    // call whenever tags change
 *
 * The sprite is added as a child of the mesh, so it follows automatically.
 */
export function createTagLabel(mesh, initialTags = []) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMat);

  sprite.position.y = 2.0;
  sprite.scale.set(3, 0.9375, 1); // keeps aspect: 512/160 * 0.9375 ≈ 3

  mesh.add(sprite);

  const label = {
    sprite,
    canvas,
    texture,
    _tags: [...initialTags],
    _name: mesh.name || '',

    /** Call when tags change to refresh the displayed text. */
    update(name, tags) {
      this._name = name || this._name;
      this._tags = [...tags];
      _draw(this.canvas, this._name, this._tags);
      this.texture.needsUpdate = true;
    },

    /** Call every frame if label needs to face camera. (Not needed for sprites — they auto-billboard.) */
    dispose() {
      this.sprite.material.dispose();
      this.texture.dispose();
    },
  };

  // Initial draw
  _draw(canvas, label._name, label._tags);
  texture.needsUpdate = true;

  return label;
}

// ---- internal ----

const LINE1_FONT = 'bold 32px "Microsoft YaHei", "PingFang SC", Arial, sans-serif';
const LINE2_FONT = '22px "Microsoft YaHei", "PingFang SC", Arial, sans-serif';

function _draw(canvas, name, tags) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Measure text widths to size background
  ctx.font = LINE1_FONT;
  const nameW = ctx.measureText(name).width;

  const tagStr = tags.length > 0 ? tags.join(' · ') : '';
  ctx.font = LINE2_FONT;
  const tagW = tagStr ? ctx.measureText(tagStr).width : 0;

  const maxTextW = Math.max(nameW, tagW);
  const padX = 24;
  const padY = 14;
  const line1H = 40;
  const line2H = tagStr ? 30 : 0;
  const gap = tagStr ? 4 : 0;
  const totalTextH = line1H + gap + line2H;

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

  // Line 1 — name (bold, larger, centered)
  ctx.fillStyle = '#ffffff';
  ctx.font = LINE1_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(name, w / 2, bgY + padY);

  // Line 2 — tags (smaller, lighter)
  if (tagStr) {
    ctx.fillStyle = '#cccccc';
    ctx.font = LINE2_FONT;
    ctx.fillText(tagStr, w / 2, bgY + padY + line1H + gap);
  }
}
