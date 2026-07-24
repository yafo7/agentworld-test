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
export function createSpeechBubble(mesh, { variant = 'speech' } = {}) {
  const canvas = document.createElement('canvas');
  const petLayout = variant === 'idea' || variant === 'pet';
  canvas.width = petLayout ? 640 : 512;
  canvas.height = petLayout ? 200 : 140;

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.renderOrder = 2000;

  // Position above the tag label
  sprite.position.y = 2.5;
  sprite.scale.set(petLayout ? 3.7 : 3.5, petLayout ? 1.16 : 0.96, 1);
  sprite.visible = false;

  mesh.add(sprite);

  const bubble = {
    sprite,
    canvas,
    texture,

    show(text, { variant: nextVariant = variant } = {}) {
      _drawBubble(canvas, text, nextVariant);
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

function _drawBubble(canvas, text, variant = 'speech') {
  if (variant === 'idea') {
    _drawIdeaBubble(canvas, text);
    return;
  }
  if (variant === 'pet') {
    _drawPetBubble(canvas, text);
    return;
  }

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

function _drawPetBubble(canvas, text) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cardX = 44;
  const cardY = 24;
  const cardW = w - 88;
  const cardH = 132;
  const radius = 34;

  ctx.save();
  ctx.shadowColor = 'rgba(82, 55, 32, 0.28)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#fff9df';
  ctx.strokeStyle = '#6d4b2f';
  ctx.lineWidth = 6;
  ctx.beginPath();
  _roundRect(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.stroke();

  const pointerX = w * 0.53;
  const pointerY = cardY + cardH - 2;
  ctx.fillStyle = '#fff9df';
  ctx.beginPath();
  ctx.moveTo(pointerX - 21, pointerY);
  ctx.quadraticCurveTo(pointerX - 9, pointerY + 25, pointerX + 4, h - 13);
  ctx.quadraticCurveTo(pointerX + 8, pointerY + 17, pointerX + 27, pointerY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pointerX - 17, pointerY - 2);
  ctx.lineTo(pointerX + 24, pointerY - 2);
  ctx.strokeStyle = '#fff9df';
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.fillStyle = '#4d3727';
  ctx.font = '700 27px "Microsoft YaHei", "PingFang SC", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const source = String(text || '');
  const lines = _wrapText(ctx, source, cardW - 70).slice(0, 3);
  if (lines.length === 3 && lines.join('').length < source.length) {
    lines[2] = `${lines[2].slice(0, Math.max(0, lines[2].length - 1))}…`;
  }
  const lineHeight = 34;
  const startY = cardY + cardH / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => ctx.fillText(line, w / 2, startY + index * lineHeight));

  ctx.fillStyle = '#ff8b69';
  ctx.beginPath();
  ctx.arc(w - 64, 46, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#70c9b0';
  ctx.beginPath();
  ctx.arc(w - 43, 70, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function _drawIdeaBubble(canvas, text) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cardX = 66;
  const cardY = 26;
  const cardW = w - 104;
  const cardH = 126;
  const radius = 34;

  ctx.save();
  ctx.shadowColor = 'rgba(82, 55, 32, 0.28)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#fff9df';
  ctx.strokeStyle = '#6d4b2f';
  ctx.lineWidth = 6;
  ctx.beginPath();
  _roundRect(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.stroke();

  const pointerX = w * 0.53;
  const pointerY = cardY + cardH - 2;
  ctx.fillStyle = '#fff9df';
  ctx.beginPath();
  ctx.moveTo(pointerX - 21, pointerY);
  ctx.quadraticCurveTo(pointerX - 9, pointerY + 25, pointerX + 4, h - 13);
  ctx.quadraticCurveTo(pointerX + 8, pointerY + 17, pointerX + 27, pointerY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pointerX - 17, pointerY - 2);
  ctx.lineTo(pointerX + 24, pointerY - 2);
  ctx.strokeStyle = '#fff9df';
  ctx.lineWidth = 8;
  ctx.stroke();

  const bulbX = 106;
  const bulbY = 89;
  ctx.fillStyle = '#ffe36d';
  ctx.strokeStyle = '#6d4b2f';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(bulbX, bulbY - 10, 31, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f8b84a';
  ctx.beginPath();
  _roundRect(ctx, bulbX - 15, bulbY + 15, 30, 24, 7);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bulbX - 10, bulbY + 47);
  ctx.lineTo(bulbX + 10, bulbY + 47);
  ctx.stroke();

  ctx.strokeStyle = '#f2b642';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (const [x1, y1, x2, y2] of [
    [bulbX, 35, bulbX, 21],
    [61, 54, 49, 43],
    [151, 54, 163, 43],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.fillStyle = '#4d3727';
  ctx.font = '700 32px "Microsoft YaHei", "PingFang SC", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = String(text || '我有个想法！').slice(0, 12);
  ctx.fillText(label, 378, cardY + cardH / 2 + 1);

  ctx.fillStyle = '#ff8b69';
  ctx.beginPath();
  ctx.arc(w - 57, 47, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#70c9b0';
  ctx.beginPath();
  ctx.arc(w - 38, 72, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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
