import { consumeKeyPress } from '../input/keyboard.js';

const GENERATE_RANGE = 4; // how close player must be to forest to press F

/**
 * Handles F-key pet generation near the forest.
 * Matches forest tags against pet originSignatures to determine which pet spawns.
 *
 * @param {import('../entities/Player.js').Player} player
 * @param {import('../entities/Environment.js').Environment} forest
 * @param {import('../entities/Pet.js').Pet[]} pets
 */
export function setupGeneration(player, forest, pets) {
  return {
    update() {
      if (!consumeKeyPress('f')) return;

      const dist = player.mesh.position.distanceTo(forest.mesh.position);
      if (dist > GENERATE_RANGE) return;

      // Find best-matching unspawned pet
      const forestTags = forest.allTags;
      let bestPet = null;
      let bestScore = -1;

      for (const pet of pets) {
        if (pet.spawned) continue;

        // Count how many originSignature tags match current forest tags
        const score = pet.originSignature.filter((t) =>
          forestTags.includes(t)
        ).length;

        if (score > bestScore) {
          bestScore = score;
          bestPet = pet;
        }
      }

      if (bestPet && bestScore > 0) {
        // Spawn pet near forest edge
        const angle = Math.random() * Math.PI * 2;
        const spawnPos = forest.mesh.position.clone();
        spawnPos.x += Math.cos(angle) * 2.5;
        spawnPos.z += Math.sin(angle) * 2.5;
        spawnPos.y = 0.5;

        bestPet.spawnAt(spawnPos);
        console.log(
          `[Generate] ${bestPet.name} spawned! ` +
            `(matched ${bestScore}/${bestPet.originSignature.length} tags)`
        );
      } else if (bestScore === 0) {
        console.log(
          '[Generate] Forest tags do not match any pet yet. Place items near the forest first.'
        );
      } else {
        console.log('[Generate] All matching pets already spawned.');
      }
    },
  };
}
