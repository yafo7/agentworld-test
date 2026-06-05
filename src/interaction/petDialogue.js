import { getGreeting, getResponse, GOODBYES } from '../game/gameData.js';

const PET_CHAT_RANGE = 3.5;   // pets must be this close to start talking
const CHAT_CHECK_INTERVAL = 2; // seconds between checks
const SEEK_CHECK_INTERVAL = 5; // seconds between seek-player checks
const SEEK_CHANCE = 0.5;

/**
 * Periodic pet-to-pet dialogue and seek-player system.
 * Call update(dt) every frame.
 *
 * @param {import('../entities/Pet.js').Pet[]} pets
 * @param {THREE.Vector3} playerPos — current player position
 */
export function setupPetDialogue(pets, playerPos) {
  let chatCheckTimer = 0;
  let seekCheckTimer = 0;

  return {
    update(dt) {
      chatCheckTimer += dt;
      seekCheckTimer += dt;

      if (chatCheckTimer >= CHAT_CHECK_INTERVAL) {
        chatCheckTimer = 0;
        _checkPetChats(pets);
      }

      if (seekCheckTimer >= SEEK_CHECK_INTERVAL) {
        seekCheckTimer = 0;
        _checkSeekPlayer(pets);
      }

      // Check if any dialogue has finished
      for (const pet of pets) {
        if (pet.isChatFinished) {
          pet.endChat();
        }
      }
    },
  };
}

// ===================================================================
// pet ↔ pet dialogue
// ===================================================================

function _checkPetChats(pets) {
  for (let i = 0; i < pets.length; i++) {
    for (let j = i + 1; j < pets.length; j++) {
      const a = pets[i];
      const b = pets[j];

      if (!a.spawned || !b.spawned) continue;
      if (a.state !== 'wandering' || b.state !== 'wandering') continue;

      const dist = a.mesh.position.distanceTo(b.mesh.position);
      if (dist < PET_CHAT_RANGE && Math.random() < 0.5) {
        _startChat(a, b);
        return; // only one chat at a time for now
      }
    }
  }
}

function _startChat(a, b) {
  console.log(`[Chat] ${a.name} and ${b.name} start talking!`);

  // Build 5-round dialogue
  const lines = [
    { speaker: a.name, text: getGreeting(a) },
    { speaker: b.name, text: getResponse(b, a) },
    { speaker: a.name, text: _commentOnTag(a, b) },
    { speaker: b.name, text: _commentOnTag(b, a) },
    {
      speaker: `${a.name} & ${b.name}`,
      text: GOODBYES[Math.floor(Math.random() * GOODBYES.length)],
    },
  ];

  a.startChatWith(b, lines);
  b.startChatWith(a, lines);
}

/** Generate a comment from petA about petB's tags. */
function _commentOnTag(a, b) {
  const bTag = b.tags[Math.floor(Math.random() * b.tags.length)] || '特别';
  const templates = [
    `你的「${bTag}」气质真特别呢。`,
    `我好像能感受到你的「${bTag}」……`,
    `「${bTag}」？和我听说的不太一样呢。`,
    `你身上的「${bTag}」让我很好奇。`,
    `原来「${bTag}」是这样的感觉。`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

// ===================================================================
// seek player
// ===================================================================

function _checkSeekPlayer(pets) {
  for (const pet of pets) {
    if (!pet.spawned) continue;
    if (!pet.shouldSeekPlayer()) continue;
    if (Math.random() < SEEK_CHANCE) {
      pet.startSeekingPlayer();
    }
  }
}
