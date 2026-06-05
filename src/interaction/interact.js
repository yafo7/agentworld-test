import { consumeKeyPress } from '../input/keyboard.js';
import { Environment } from '../entities/Environment.js';
import { Item } from '../entities/Item.js';
import { INTIMACY_ITEM_CONFIGS, ENV_POND, ENV_GRASSLAND, getPlayerLine } from '../game/gameData.js';

const PET_INTERACT_RANGE = 3.0;
const ITEM_PICKUP_RANGE = 2.5;
const FOREST_RANGE = 3.5;

/**
 * Unified E-key interaction handler.
 * Priority: drop item > pet seeking player > pet interact > pickup item.
 *
 * @param {import('../entities/Player.js').Player} player
 * @param {import('../entities/Item.js').Item[]} items
 * @param {import('../entities/Environment.js').Environment} forest
 * @param {import('../entities/Pet.js').Pet[]} pets
 * @param {Function} addToScene — callback to add a new entity to the scene
 */
export function setupInteract(player, items, forest, pets, addToScene) {
  // Track which pet-milestone items have been spawned
  const spawnedMilestoneItems = {};   // key: "petName_lv5", "petName_lv10"
  const completedPlayerDialogues = {}; // key: petName, to avoid repeat dialogues

  return {
    update() {
      if (!consumeKeyPress('e')) return;

      // --- Priority 1: Drop held item ---
      if (player.heldItem) {
        _dropItem(player, forest);
        _refreshForestTags(forest, items);
        return;
      }

      // --- Priority 2: Pet seeking player → player dialogue ---
      for (const pet of pets) {
        if (!pet.spawned) continue;
        if (pet.state !== 'seeking_player') continue;
        const dist = player.mesh.position.distanceTo(pet.mesh.position);
        if (dist < PET_INTERACT_RANGE) {
          _doPlayerPetMaxDialogue(player, pet, items, forest, addToScene, completedPlayerDialogues);
          return;
        }
      }

      // --- Priority 3: Pet nearby → affection interaction ---
      for (const pet of pets) {
        if (!pet.spawned) continue;
        if (pet.state === 'chatting' || pet.state === 'seeking_player') continue;
        const dist = player.mesh.position.distanceTo(pet.mesh.position);
        if (dist < PET_INTERACT_RANGE) {
          const result = pet.interactWithPlayer();
          _handlePetInteractResult(result, pet, player, items, addToScene, spawnedMilestoneItems);
          console.log(`[Pet] ${pet.name} affection: ${pet.affection}/10, result:`, result);
          return;
        }
      }

      // --- Priority 4: Pickup item ---
      _pickupNearest(player, items);
      _refreshForestTags(forest, items);
    },
  };
}

// ===================================================================
// internal helpers
// ===================================================================

function _dropItem(player, forest) {
  const item = player.heldItem;
  player.heldItem = null;
  const dropPos = player.mesh.position.clone();
  dropPos.y = 0.6;
  item.onDrop(dropPos);
  const dist = dropPos.distanceTo(forest.mesh.position);
  if (dist < FOREST_RANGE) {
    console.log(`[Place] ${item.name} placed near forest → tags added`);
  }
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

function _refreshForestTags(forest, items) {
  forest.moreTags = [];
  for (const item of items) {
    if (item.isHeld) continue;
    const dist = item.mesh.position.distanceTo(forest.mesh.position);
    if (dist < FOREST_RANGE) {
      forest.addTags(item.tags);
    }
  }
  forest._syncLabel();
}

// --- pet interaction handlers ---

function _handlePetInteractResult(result, pet, player, items, addToScene, spawnedMilestoneItems) {
  if (result.type === 'already_max') return;

  if (result.milestone) {
    // Spawn new item near the pet
    const petConfigs = INTIMACY_ITEM_CONFIGS[pet.name];
    if (!petConfigs) return;

    const itemCfg = result.milestone === 5 ? petConfigs.lv5 : petConfigs.lv10;
    const key = `${pet.name}_lv${result.milestone}`;
    if (spawnedMilestoneItems[key]) return; // already spawned
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
    console.log(`[Milestone] ${pet.name} reached lv${result.milestone} → spawned ${itemCfg.name}`);
  }
}

function _doPlayerPetMaxDialogue(player, pet, items, forest, addToScene, completedPlayerDialogues) {
  if (completedPlayerDialogues[pet.name]) {
    console.log(`[Dialogue] Already talked to ${pet.name} at max intimacy.`);
    pet.finishPlayerDialogue();
    return;
  }
  completedPlayerDialogues[pet.name] = true;

  // Show dialogue in console for now
  console.log(`[Player↔Pet] ${pet.name}: "${getPlayerLine(pet)}"`);

  // Spawn a new environment at player position
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
  forest.addTags(envConfig.coreTags); // new env tags also affect the main forest
  console.log(`[Environment] ${envConfig.name} spawned! Tags: ${envConfig.coreTags.join(', ')}`);

  pet.finishPlayerDialogue();
}
