import { consumeKeyPress } from '../input/keyboard.js';
import { Environment } from '../entities/Environment.js';
import { Item } from '../entities/Item.js';
import { INTIMACY_ITEM_CONFIGS, ENV_POND, ENV_GRASSLAND, getPlayerLine } from '../game/gameData.js';

const PET_INTERACT_RANGE = 3.0;
const ITEM_PICKUP_RANGE = 2.5;
const ENV_RANGE = 3.5; // item must be this close to an environment for tag absorption

/**
 * Unified E-key interaction handler.
 * Priority: drop item > pet seeking player > pet interact > pickup item.
 *
 * @param {import('../entities/Player.js').Player} player
 * @param {import('../entities/Item.js').Item[]} items
 * @param {import('../entities/Environment.js').Environment[]} environments
 * @param {import('../entities/Pet.js').Pet[]} pets
 * @param {Function} addToScene — callback to add a new entity to the scene
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
          _handlePetInteractResult(result, pet, items, addToScene, spawnedMilestoneItems);
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
  dropPos.y = 0.6;
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

// ===================================================================
// environment tag refresh (scan ALL environments)
// ===================================================================

/**
 * Rebuild each environment's moreTags by scanning nearby non-held items.
 * Each environment independently absorbs tags from items in range.
 */
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
// pet interaction
// ===================================================================

function _handlePetInteractResult(result, pet, items, addToScene, spawnedMilestoneItems) {
  if (result.type === 'already_max') return;

  if (result.milestone) {
    const petConfigs = INTIMACY_ITEM_CONFIGS[pet.name];
    if (!petConfigs) return;

    const itemCfg = result.milestone === 5 ? petConfigs.lv5 : petConfigs.lv10;
    const key = `${pet.name}_lv${result.milestone}`;
    if (spawnedMilestoneItems[key]) return;
    spawnedMilestoneItems[key] = true;

    const newItem = new Item({
      id: itemCfg.id,
      name: itemCfg.name,
      color: itemCfg.color,
      tags: itemCfg.tags,
      correspondsTo: pet.name,
      spawnPosition: [
        pet.mesh.position.x + (Math.random() - 0.5) * 2,
        0.75,
        pet.mesh.position.z + (Math.random() - 0.5) * 2,
      ],
    });
    items.push(newItem);
    addToScene(newItem.mesh);
    console.log(`[Milestone] ${pet.name} lv${result.milestone} → ${itemCfg.name}`);
  }
}

// ===================================================================
// player-pet max intimacy dialogue → spawn new environment
// ===================================================================

function _doPlayerPetMaxDialogue(player, pet, environments, addToScene, completedPlayerDialogues) {
  if (completedPlayerDialogues[pet.name]) {
    pet.finishPlayerDialogue();
    return;
  }
  completedPlayerDialogues[pet.name] = true;

  console.log(`[Player↔Pet] ${pet.name}: "${getPlayerLine(pet)}"`);

  // Spawn a new environment
  const isPond = Math.random() < 0.5;
  const envConfig = isPond ? ENV_POND : ENV_GRASSLAND;
  const newEnv = new Environment({
    name: envConfig.name,
    color: envConfig.color,
    size: envConfig.size,
    position: [
      player.mesh.position.x + (Math.random() - 0.5) * 3,
      0.3,
      player.mesh.position.z + (Math.random() - 0.5) * 3,
    ],
    coreTags: envConfig.coreTags,
    moreTags: [],
  });

  addToScene(newEnv.mesh);
  environments.push(newEnv); // register in the global list
  console.log(`[Environment] ${envConfig.name} spawned! Tags: ${envConfig.coreTags.join(', ')}`);

  pet.finishPlayerDialogue();
}
