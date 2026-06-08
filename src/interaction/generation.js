import * as THREE from 'three';
import { consumeKeyPress } from '../input/keyboard.js';
import { generatePet } from '../ai/petGen.js';
import { PET_CONFIGS } from '../game/gameData.js';

const GENERATE_RANGE = 4;
let generating = false;

/**
 * F-key pet generation near any environment.
 * Checks preset pets first (matching originSignature to environment tags).
 * Falls back to DeepSeek AI if no preset matches.
 */
export function setupGeneration(player, environments, items, onGenerate) {
  return {
    update() {
      if (!consumeKeyPress('f') || generating) return;

      // Find nearest environment
      let nearestEnv = null;
      let nearestDist = Infinity;
      for (const env of environments) {
        const dist = player.mesh.position.distanceTo(env.mesh.position);
        if (dist < GENERATE_RANGE && dist < nearestDist) {
          nearestEnv = env;
          nearestDist = dist;
        }
      }
      if (!nearestEnv) {
        console.log('[Generate] Not near any environment.');
        return;
      }

      const envTags = nearestEnv.allTags;

      // ---- Step 1: Check preset pets (find best match) ----
      let bestPreset = null;
      let bestScore = 0;
      for (const preset of PET_CONFIGS) {
        const score = preset.originSignature.filter((t) => envTags.includes(t)).length;
        if (score > bestScore) {
          bestScore = score;
          bestPreset = preset;
        }
      }

      if (bestPreset && bestScore > 0) {
        _showNotification(nearestEnv, `「${bestPreset.name}」正在接近……`);
        generating = true;
        setTimeout(() => {
          onGenerate(bestPreset);
          _hideNotification(nearestEnv);
          generating = false;
        }, 1500);
        return;
      }

      // ---- Step 2: No preset matched — call DeepSeek AI ----
      const nearbyItemTags = [];
      for (const item of items) {
        if (item.isHeld) continue;
        const dist = item.mesh.position.distanceTo(nearestEnv.mesh.position);
        if (dist < 3.5) nearbyItemTags.push(...item.tags);
      }

      console.log('[Generate] No preset match — calling AI...');
      _showNotification(nearestEnv, '未知的宠物正在接近……');

      generating = true;
      generatePet(envTags, nearbyItemTags)
        .then((config) => {
          _hideNotification(nearestEnv);
          onGenerate(config);
          generating = false;
        })
        .catch((err) => {
          _hideNotification(nearestEnv);
          console.error('[Generate] AI failed:', err);
          generating = false;
        });
    },
  };
}

// ---- notification text ----

function _showNotification(env, text) {
  // Remove existing notification if any
  _hideNotification(env);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px "Microsoft YaHei", "PingFang SC", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.y = 2.5;
  sprite.scale.set(3.5, 0.66, 1);
  sprite.name = '__generation_notify__';
  sprite.userData = { isNotification: true };

  env.mesh.add(sprite);
}

function _hideNotification(env) {
  const existing = env.mesh.children.find((c) => c.userData?.isNotification);
  if (existing) {
    env.mesh.remove(existing);
    existing.material?.map?.dispose();
    existing.material?.dispose();
  }
}
