import { consumeKeyPress } from '../input/keyboard.js';
import { generatePet } from '../ai/petGen.js';

const GENERATE_RANGE = 4;
let generating = false;

/**
 * F-key pet generation near any environment (AI-driven).
 *
 * @param {import('../entities/Player.js').Player} player
 * @param {import('../entities/Environment.js').Environment[]} environments
 * @param {import('../entities/Item.js').Item[]} items
 * @param {Function} onGenerate — callback(petConfig) when AI returns
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
        console.log('[Generate] Not near any environment. Walk closer to one first.');
        return;
      }

      // Collect tags from environment + nearby items
      const envTags = nearestEnv.allTags;
      const nearbyItemTags = [];
      for (const item of items) {
        if (item.isHeld) continue;
        const dist = item.mesh.position.distanceTo(nearestEnv.mesh.position);
        if (dist < 3.5) nearbyItemTags.push(...item.tags);
      }

      console.log(`[Generate] Generating pet near ${nearestEnv.name}... Tags:`, [...new Set([...envTags, ...nearbyItemTags])]);

      generating = true;
      generatePet(envTags, nearbyItemTags)
        .then((config) => {
          onGenerate(config);
          generating = false;
        })
        .catch((err) => {
          console.error('[Generate] AI failed:', err);
          generating = false;
        });
    },
  };
}
