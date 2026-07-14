// ═══════════════════════════════════════════════════════════
// Engine — reusable game SDK layer.
// Any demo can import capabilities from here without touching business logic.
// ═══════════════════════════════════════════════════════════

// ---- Model ----
export { fallbackBuildGeometry } from './model/fallback.js';
export { buildModelFromJson } from './model/builder.js';
export { loadModel } from './model/loader.js';

// ---- Animation ----
export { loadAnimationPlan } from './animation/planLoader.js';
export { evaluateMotion, applyMotionDeltas, applyAnimation } from './animation/player.js';
export { ParticleSystem } from './animation/particles.js';

// ---- Core (re-export from legacy src/core/; Phase 2 will physically move) ----
export { createScene } from './core/scene.js';
export { ThirdPersonCamera } from './core/camera.js';
export { createRenderer } from './core/renderer.js';
export { createLights } from './core/lights.js';
export { SkyDome } from './core/SkyDome.js';

// ---- Physics ----
export { PhysicsWorld } from './physics/PhysicsWorld.js';
export { RapierDebugRenderer } from './physics/RapierDebugRenderer.js';

// ---- World (re-export from legacy src/world/; Phase 2 will physically move) ----
export { createUnitEnvironment, getGridWorldPosition, worldToGridCoordinates, paintUnitArea, preloadBlocks, generateTerrainLayout, getBlockModel } from './world/terrain.js';

// ---- Entity (re-export from legacy src/entities/; Phase 2 will physically move) ----
export { Player } from './entity/Player.js';
export { Environment } from './entity/Environment.js';
export { Item } from './entity/Item.js';
export { StaticEntity } from './entity/StaticEntity.js';

// ---- UI (re-export from legacy src/ui/; Phase 2 will physically move) ----
export { createTagLabel } from './ui/TagLabel.js';
export { createSpeechBubble } from './ui/SpeechBubble.js';
export { createPetDialogueUI } from './ui/PetDialogueUI.js';

// ---- Interaction (re-export from legacy src/interaction/; Phase 2 will physically move) ----
export { consumeKeyPress, isKeyDown } from './input/keyboard.js';
export { Input } from './input/Input.js';
export { createInteractionHint } from './interaction/interactionHint.js';
export { setupRaycast } from './interaction/raycast.js';
