import { consumeKeyPress } from '../input/keyboard.js';

const PICKUP_RANGE = 2.5;    // how close player must be to pick up an item
const FOREST_RANGE = 3.5;    // how close to forest for item tags to apply

/**
 * Handles E-key pickup/drop of items.
 * Call `update()` every frame.
 *
 * @param {import('../entities/Player.js').Player} player
 * @param {import('../entities/Item.js').Item[]} items
 * @param {import('../entities/Environment.js').Environment} forest
 */
export function setupPickup(player, items, forest) {
  return {
    update() {
      if (!consumeKeyPress('e')) return;

      if (player.heldItem) {
        // Drop the held item at player position
        _dropItem(player, forest);
      } else {
        // Try to pick up the nearest item in range
        _pickupNearest(player, items);
      }

      // After any pickup/drop, re-scan forest tags
      _refreshForestTags(forest, items);
    },
  };
}

// ---- internal ----

function _pickupNearest(player, items) {
  let nearest = null;
  let nearestDist = Infinity;

  for (const item of items) {
    if (item.isHeld) continue;
    const dist = player.mesh.position.distanceTo(item.mesh.position);
    if (dist < PICKUP_RANGE && dist < nearestDist) {
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

function _dropItem(player, forest) {
  const item = player.heldItem;
  player.heldItem = null;

  // Drop at player's feet
  const dropPos = player.mesh.position.clone();
  dropPos.y = 0.6; // item height
  item.onDrop(dropPos);

  // Check if dropped near forest
  const distToForest = dropPos.distanceTo(forest.mesh.position);
  if (distToForest < FOREST_RANGE) {
    console.log(`[Place] ${item.name} placed near forest → tags added`);
  }

  console.log(`[Drop] Dropped ${item.name}`);
}

/**
 * Rebuild forest.moreTags by scanning which non-held items are near the forest.
 * Always syncs the label afterward so tag removal is reflected immediately.
 */
function _refreshForestTags(forest, items) {
  // Start fresh
  forest.moreTags = [];

  for (const item of items) {
    if (item.isHeld) continue;
    const dist = item.mesh.position.distanceTo(forest.mesh.position);
    if (dist < FOREST_RANGE) {
      forest.addTags(item.tags);
    }
  }

  // Always sync — covers the case where all items were removed
  // and addTags() was never called (so _syncLabel was never triggered).
  forest._syncLabel();
}
