import { consumeKeyPress } from '../input/keyboard.js';
import { Environment } from '../entities/Environment.js';
import { Item } from '../entities/Item.js';
import { generateMilestoneItem, generateMilestoneEnv } from '../ai/milestoneGen.js';
import { generatePlayerDialogue } from '../ai/dialogueGen.js';

const PET_INTERACT_RANGE = 3.0;
const ITEM_PICKUP_RANGE = 2.5;
const STATIC_INTERACT_RANGE = 1.8;
const HOUSE_SUMMON_RANGE = 3.0;

/**
 * Unified E-key interaction handler.
 * Priority: drop item > pet seeking player > pet interact > summon house pet > static entity interact > pickup item.
 */
export function setupInteract(player, items, environments, pets, housePetMap, staticEntities, addToScene, allEntitiesForEnv) {
  const spawnedMilestoneItems = {};
  const completedPlayerDialogues = {};

  return {
    update() {
      // ---- J key: disband all following pets ----
      if (consumeKeyPress('j')) {
        let disbanded = false;
        for (const pet of pets) {
          if (pet.state === 'following') {
            pet.stopFollowing();
            disbanded = true;
          }
        }
        if (disbanded) {
          console.log('[Interact] All following pets disbanded.');
          return;
        }
      }

      // ---- R key: send all following pets to refine the same target (nearest to player) ----
      if (consumeKeyPress('r')) {
        const following = pets.filter((p) => p.state === 'following');
        if (following.length === 0) return;

        // Find nearest refinable entity to the player
        let nearestTarget = null;
        let nearestDist = Infinity;
        const candidates = [
          ...staticEntities.filter((e) => e.mesh.visible),
          ...environments,
          ...items.filter((i) => !i.isHeld),
          ...pets.filter((p) => p.spawned),
        ];
        for (const entity of candidates) {
          const dist = player.mesh.position.distanceTo(entity.mesh.position);
          if (dist < nearestDist) {
            nearestTarget = entity;
            nearestDist = dist;
          }
        }

        if (nearestTarget) {
          // Collect one random tag from each participating pet (deduped)
          const allTags = [];
          for (const pet of following) {
            const tag = pet.tags[Math.floor(Math.random() * pet.tags.length)];
            if (!allTags.includes(tag)) allTags.push(tag);
          }
          nearestTarget._pendingRefineTags = allTags;

          for (const pet of following) {
            pet.startRefine(nearestTarget);
          }
          console.log(`[Interact] ${following.length} pets sent to refine ${nearestTarget.name} with tags [${allTags.join(', ')}]`);
          return;
        }
      }

      // ---- H key: call pet to follow (multi-pet) ----
      if (consumeKeyPress('h')) {
        for (const pet of pets) {
          if (!pet.spawned) continue;
          if (pet.state === 'chatting' || pet.state === 'seeking_player' || pet.state === 'returning_home' || pet.state === 'recall_pause' || pet.state === 'refining') continue;
          const dist = player.mesh.position.distanceTo(pet.mesh.position);
          if (dist < PET_INTERACT_RANGE) {
            if (pet.state !== 'following') {
              pet.startFollowing(player);
            }
            return;
          }
        }
      }

      if (!consumeKeyPress('e')) return;

      // Priority 1: Drop held item
      if (player.heldItem) {
        _dropItem(player);
        _refreshAllEnvTags(environments, allEntitiesForEnv);
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

      // Priority 4: Near house → summon or recall
      if (housePetMap) {
        for (const [houseName, data] of housePetMap.entries()) {
          const dist = player.mesh.position.distanceTo(data.house.mesh.position);
          if (dist < HOUSE_SUMMON_RANGE) {
            if (!data.summoned) {
              // Summon at the grid next to the house
              const spawnPos = { x: data.sidePos.x, y: 0, z: data.sidePos.z };
              data.pet.spawnAt(spawnPos);
              if (!pets.includes(data.pet)) {
                addToScene(data.pet.mesh);
                pets.push(data.pet);
              }
              data.summoned = true;
              console.log(`[Summon] ${data.pet.name} 从 ${houseName} 出现了！`);
              return;
            } else if (data.pet.spawned && data.pet.state !== 'returning_home' && data.pet.state !== 'recall_pause') {
              // Recall to the grid next to the house
              const recallPos = { x: data.sidePos.x, y: 0, z: data.sidePos.z };
              data.pet.startRecall(recallPos, () => {
                data.summoned = false;
                console.log(`[Recall] ${data.pet.name} 已回到 ${houseName}`);
              });
              return;
            }
          }
        }
      }

      // Priority 5: Static entity interaction (breathing animation)
      let nearestStatic = null;
      let nearestStaticDist = Infinity;
      for (const entity of staticEntities) {
        const dist = player.mesh.position.distanceTo(entity.mesh.position);
        if (dist < STATIC_INTERACT_RANGE && dist < nearestStaticDist) {
          nearestStatic = entity;
          nearestStaticDist = dist;
        }
      }
      if (nearestStatic) {
        nearestStatic.playInteractionAnimation();
        console.log(`[Interact] ${nearestStatic.name} 交互动画`);
        return;
      }

      // Priority 6: Pickup item (wind chime only now)
      _pickupNearest(player, items);
      _refreshAllEnvTags(environments, allEntitiesForEnv);
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
  dropPos.y = 0;
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

function _refreshAllEnvTags(environments, allEntities) {
  for (const env of environments) {
    env.refreshTagsFromEntities(allEntities);
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
        console.log(`[Milestone] ${pet.name} lv5 → AI item: ${itemCfg.name} [${itemCfg.tags.join(', ')}]`);
      })
      .catch((err) => console.error('[Milestone] AI item failed:', err));
  }

  if (result.milestone === 10) {
    const key = `${pet.name}_lv10`;
    if (spawnedMilestoneItems[key]) return;
    spawnedMilestoneItems[key] = true;

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

  pet._bubble.show('……');

  generatePlayerDialogue(pet)
    .then((lines) => {
      if (lines.length > 0) {
        pet._bubble.show(lines[0].text);
      }
      console.log(`[Player↔Pet] ${pet.name}:`);
      lines.forEach((l) => console.log(`  ${l.text}`));

      setTimeout(() => pet._bubble.hide(), 4000);
      pet.finishPlayerDialogue();
    })
    .catch((err) => {
      console.error('[Dialogue] AI failed:', err);
      pet._bubble.hide();
      pet.finishPlayerDialogue();
    });
}
