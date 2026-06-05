import { generatePetDialogue } from '../ai/dialogueGen.js';

const PET_CHAT_RANGE = 3.5;
const CHAT_CHECK_INTERVAL = 2;
const SEEK_CHECK_INTERVAL = 5;
const SEEK_CHANCE = 0.1; // 10% per check (was 50%)

let dialogueGenerating = false;

/**
 * Periodic pet-to-pet dialogue (AI-generated) and seek-player system.
 *
 * @param {import('../entities/Pet.js').Pet[]} pets
 * @param {THREE.Vector3} playerPos
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

      // Clean up finished dialogues
      for (const pet of pets) {
        if (pet.isChatFinished) pet.endChat();
      }
    },
  };
}

// ===================================================================
// pet ↔ pet dialogue
// ===================================================================

function _checkPetChats(pets) {
  if (dialogueGenerating) return;

  for (let i = 0; i < pets.length; i++) {
    for (let j = i + 1; j < pets.length; j++) {
      const a = pets[i];
      const b = pets[j];

      if (!a.spawned || !b.spawned) continue;
      if (a.state !== 'wandering' || b.state !== 'wandering') continue;

      const dist = a.mesh.position.distanceTo(b.mesh.position);
      if (dist < PET_CHAT_RANGE && Math.random() < 0.5) {
        _startChat(a, b);
        return;
      }
    }
  }
}

async function _startChat(a, b) {
  dialogueGenerating = true;

  // Stop pets immediately
  a.state = 'chatting';
  b.state = 'chatting';
  a._bubble.show('……');
  b._bubble.show('……');

  try {
    const lines = await generatePetDialogue(a, b);
    // Build 5 rounds from AI response
    const dialogueLines = [
      ...lines.slice(0, 4),
      {
        speaker: `${a.name} & ${b.name}`,
        text: '那就先这样啦，下次再聊～',
      },
    ];
    a.startChatWith(b, dialogueLines);
    b.startChatWith(a, dialogueLines);
    console.log(`[Chat] ${a.name} ↔ ${b.name} — AI dialogue ready`);
  } catch (err) {
    console.error('[Chat] AI failed, using fallback:', err.message);
    // Fallback: simple static dialogue
    const fallback = [
      { speaker: a.name, text: '你好呀。' },
      { speaker: b.name, text: '嗯……你好。' },
      { speaker: a.name, text: '今天天气不错呢。' },
      { speaker: b.name, text: '是啊，很适合散步。' },
      { speaker: `${a.name} & ${b.name}`, text: '回头见！' },
    ];
    a.startChatWith(b, fallback);
    b.startChatWith(a, fallback);
  } finally {
    dialogueGenerating = false;
  }
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
