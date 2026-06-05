import * as THREE from 'three';

/**
 * Speech bubble sprite that appears above a mesh.
 * Used for pet dialogue. Can be shown/hidden dynamically.
 *
 * Usage:
 *   const bubble = createSpeechBubble(mesh);
 *   bubble.show("Hello!");
 *   bubble.hide();
 */
export function createSpeechBubble(mesh) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 140;

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMat);

  // Position above the tag label
  sprite.position.y = 2.5;
  sprite.scale.set(3.5, 0.96, 1);
  sprite.visible = false;

  mesh.add(sprite);

  const bubble = {
    sprite,
    canvas,
    texture,

    show(text) {
      _drawBubble(canvas, text);
      texture.needsUpdate = true;
      sprite.visible = true;
    },

    hide() {
      sprite.visible = false;
    },

    get isVisible() {
      return sprite.visible;
    },

    dispose() {
      sprite.material.dispose();
      texture.dispose();
    },
  };

  return bubble;
}

// ---- internal ----

function _drawBubble(canvas, text) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Word wrap
  const maxWidth = w - 60;
  const fontSize = 26;
  ctx.font = `${fontSize}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;

  const lines = _wrapText(ctx, text, maxWidth);
  const lineHeight = fontSize * 1.5;
  const totalTextH = lines.length * lineHeight;
  const padX = 30;
  const padY = 16;

  const bgW = maxWidth + padX * 2;
  const bgH = totalTextH + padY * 2 + 20; // +20 for pointer
  const bgX = (w - bgW) / 2;
  const bgY = (h - bgH) / 2;

  // Rounded rect background (white)
  const radius = 18;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 2;

  ctx.beginPath();
  _roundRect(ctx, bgX, bgY, bgW, bgH - 16, radius);
  ctx.fill();
  ctx.stroke();

  // Speech pointer (small triangle at bottom)
  const pointerW = 16;
  const pointerH = 14;
  const pointerX = w / 2;
  const pointerY = bgY + bgH - 16;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#333333';
  ctx.beginPath();
  ctx.moveTo(pointerX, pointerY + pointerH);
  ctx.lineTo(pointerX - pointerW, pointerY);
  ctx.lineTo(pointerX + pointerW, pointerY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Redraw top border over pointer area
  ctx.beginPath();
  ctx.moveTo(pointerX - pointerW - 2, pointerY);
  ctx.lineTo(pointerX + pointerW + 2, pointerY);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 2;

  // Text
  ctx.fillStyle = '#222222';
  ctx.font = `${fontSize}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], w / 2, bgY + padY + i * lineHeight);
  }
}

function _wrapText(ctx, text, maxWidth) {
  const lines = [];
  let current = '';
  for (const char of text) {
    const test = current + char;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = char;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}
