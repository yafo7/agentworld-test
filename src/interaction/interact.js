import { consumeKeyPress } from '../input/keyboard.js';
import { Environment } from '../entities/Environment.js';
import { Item } from '../entities/Item.js';
import { generateMilestoneItem, generateMilestoneEnv } from '../ai/milestoneGen.js';
import { generatePlayerDialogue } from '../ai/dialogueGen.js';

const PET_INTERACT_RANGE = 3.0;
const ITEM_PICKUP_RANGE = 2.5;
const ENV_RANGE = 3.5;

/**
 * Unified E-key interaction handler.
 * Priority: drop item > pet seeking player > pet interact > pickup item.
 */
export function setupInteract(player, items, environments, pets, addToScene) {
  const spawnedMilestoneItems = {};
  const completedPlayerDialogues = {};

  return {
    update() {
      if (!consumeKeyPress('e')) return;

      // Priority 1: Drop held item
      if (player.heldItem) {
        _dropItem(player);
        _refreshAllEnvTags(environments, items);
        return;
      }

      // Priority 2: Pet seeking player → player dialogue
      for (const pet of pets) {
        if (!pet.spawned || pet.state !== 'seeking_player') continue;
        const dist = player.mesh.position.distanceTo(pet.mesh.position);
        if (dist < PET_INTERACT_RANGE) {
          _doPlayerPetMaxDialogue(player, pet, environments, addToScene, completedPlayerDialogues);
          return;
        }
      }

      // Priority 3: Pet nearby → affection interaction
      for (const pet of pets) {
        if (!pet.spawned || pet.state === 'chatting' || pet.state === 'seeking_player') continue;
        const dist = player.mesh.position.distanceTo(pet.mesh.position);
        if (dist < PET_INTERACT_RANGE) {
          const result = pet.interactWithPlayer();
          _handlePetInteractResult(result, pet, items, environments, addToScene, spawnedMilestoneItems);
          console.log(`[Pet] ${pet.name} affection: ${pet.affection}/10`);
          return;
        }
      }

      // Priority 4: Pickup item
      _pickupNearest(player, items);
      _refreshAllEnvTags(environments, items);
    },
  };
}

// ===================================================================
// item pickup / drop
// ===================================================================

function _dropItem(player) {
  const item = player.heldItem;
  player.heldItem = null;
  const dropPos = player.mesh.position.clone();
  dropPos.y = 0; // model bottom sits on ground at y=0
  item.onDrop(dropPos);
  console.log(`[Drop] Dropped ${item.name}`);
}

function _pickupNearest(player, items) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const item of items) {
    if (item.isHeld) continue;
    const dist = player.mesh.position.distanceTo(item.mesh.position);
    if (dist < ITEM_PICKUP_RANGE && dist < nearestDist) {
      nearest = item;
      nearestDist = dist;
    }
  }
  if (nearest) {
    player.heldItem = nearest;
    nearest.onPickup();
    console.log(`[Pickup] Picked up ${nearest.name}`);
  }
}

function _refreshAllEnvTags(environments, items) {
  for (const env of environments) {
    env.moreTags = [];
    for (const item of items) {
      if (item.isHeld) continue;
      const dist = item.mesh.position.distanceTo(env.mesh.position);
      if (dist < ENV_RANGE) {
        env.addTags(item.tags);
      }
    }
    env._syncLabel();
  }
}

// ===================================================================
// pet interaction milestones (AI-generated)
// ===================================================================

function _handlePetInteractResult(result, pet, items, environments, addToScene, spawnedMilestoneItems) {
  if (result.type === 'already_max') return;

  if (result.milestone === 5) {
    const key = `${pet.name}_lv5`;
    if (spawnedMilestoneItems[key]) return;
    spawnedMilestoneItems[key] = true;

    // AI generates the item
    generateMilestoneItem(pet)
      .then((itemCfg) => {
        const newItem = new Item({
          id: itemCfg.name,
          name: itemCfg.name,
          color: itemCfg.color,
          tags: itemCfg.tags,
          correspondsTo: pet.name,
          spawnPosition: [
            pet.mesh.position.x + (Math.random() - 0.5) * 2,
            0,
            pet.mesh.position.z + (Math.random() - 0.5) * 2,
          ],
        });
        items.push(newItem);
        addToScene(newItem.mesh);
        _refreshAllEnvTags(environments, items);
        console.log(`[Milestone] ${pet.name} lv5 → AI item: ${itemCfg.name} [${itemCfg.tags.join(', ')}]`);
      })
      .catch((err) => console.error('[Milestone] AI item failed:', err));
  }

  if (result.milestone === 10) {
    const key = `${pet.name}_lv10`;
    if (spawnedMilestoneItems[key]) return;
    spawnedMilestoneItems[key] = true;

    // AI generates a new environment
    generateMilestoneEnv(pet)
      .then((envCfg) => {
        const newEnv = new Environment({
          name: envCfg.name,
          color: envCfg.color,
          size: [1.5, 0.6, 1.5],
          position: [
            pet.mesh.position.x + (Math.random() - 0.5) * 3,
            0,
            pet.mesh.position.z + (Math.random() - 0.5) * 3,
          ],
          coreTags: envCfg.tags,
          moreTags: [],
        });
        addToScene(newEnv.mesh);
        environments.push(newEnv);
        console.log(`[Milestone] ${pet.name} lv10 → AI env: ${envCfg.name} [${envCfg.tags.join(', ')}]`);
      })
      .catch((err) => console.error('[Milestone] AI env failed:', err));
  }
}

// ===================================================================
// player-pet max intimacy dialogue (AI-generated)
// ===================================================================

function _doPlayerPetMaxDialogue(player, pet, environments, addToScene, completedPlayerDialogues) {
  if (completedPlayerDialogues[pet.name]) {
    pet.finishPlayerDialogue();
    return;
  }
  completedPlayerDialogues[pet.name] = true;

  // Show loading
  pet._bubble.show('……');

  // Generate dialogue via AI (environment already spawned at milestone)
  generatePlayerDialogue(pet)
    .then((lines) => {
      if (lines.length > 0) {
        pet._bubble.show(lines[0].text);
      }
      console.log(`[Player↔Pet] ${pet.name}:`);
      lines.forEach((l) => console.log(`  ${l.text}`));

      // Hide bubble after a few seconds
      setTimeout(() => pet._bubble.hide(), 4000);
      pet.finishPlayerDialogue();
    })
    .catch((err) => {
      console.error('[Dialogue] AI failed:', err);
      pet._bubble.hide();
      pet.finishPlayerDialogue();
    });
}
