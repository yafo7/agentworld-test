import { consumeKeyPress } from '../input/keyboard.js';

const GENERATE_RANGE = 4; // player must be this close to an environment to press F

/**
 * Handles F-key pet generation near any environment (forest, pond, grassland, etc.).
 * Finds the nearest environment, matches its tags against pet originSignatures.
 *
 * @param {import('../entities/Player.js').Player} player
 * @param {import('../entities/Environment.js').Environment[]} environments
 * @param {import('../entities/Pet.js').Pet[]} pets
 */
export function setupGeneration(player, environments, pets) {
  return {
    update() {
      if (!consumeKeyPress('f')) return;

      // Find the nearest environment
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

      // Match environment tags against unspawned pets
      const envTags = nearestEnv.allTags;
      let bestPet = null;
      let bestScore = -1;

      for (const pet of pets) {
        if (pet.spawned) continue;
        const score = pet.originSignature.filter((t) => envTags.includes(t)).length;
        if (score > bestScore) {
          bestScore = score;
          bestPet = pet;
        }
      }

      if (bestPet && bestScore > 0) {
        const angle = Math.random() * Math.PI * 2;
        const spawnPos = nearestEnv.mesh.position.clone();
        spawnPos.x += Math.cos(angle) * 2.5;
        spawnPos.z += Math.sin(angle) * 2.5;
        spawnPos.y = 0.5;

        bestPet.spawnAt(spawnPos);
        console.log(
          `[Generate] ${bestPet.name} spawned near ${nearestEnv.name}! ` +
          `(matched ${bestScore}/${bestPet.originSignature.length} tags)`
        );
      } else if (bestScore === 0) {
        console.log(
          `[Generate] ${nearestEnv.name} tags [${envTags.join(', ')}] ` +
          `don't match any pet yet. Place items near it first.`
        );
      } else {
        console.log('[Generate] All matching pets already spawned.');
      }
    },
  };
}
