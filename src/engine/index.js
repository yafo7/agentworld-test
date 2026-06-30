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
export { applyAnimation } from './animation/player.js';
export { ParticleEmitter } from './animation/particles.js';

// ---- Core (re-export from legacy src/core/; Phase 2 will physically move) ----
export { createScene } from './core/scene.js';
export { ThirdPersonCamera } from './core/camera.js';
export { createRenderer } from './core/renderer.js';
export { createLights } from './core/lights.js';

// ---- World (re-export from legacy src/world/; Phase 2 will physically move) ----
export { createUnitEnvironment, getGridWorldPosition, paintUnitArea, worldToGridCoordinates } from './world/terrain.js';

// ---- Entity (re-export from legacy src/entities/; Phase 2 will physically move) ----
export { Player } from './entity/Player.js';
export { Pet } from './entity/Pet.js';
export { Environment } from './entity/Environment.js';
export { Item } from './entity/Item.js';
export { StaticEntity } from './entity/StaticEntity.js';

// ---- UI (re-export from legacy src/ui/; Phase 2 will physically move) ----
export { createTagLabel } from './ui/TagLabel.js';
export { createSpeechBubble } from './ui/SpeechBubble.js';

// ---- Interaction (re-export from legacy src/interaction/; Phase 2 will physically move) ----
export { consumeKeyPress, isKeyDown } from './input/keyboard.js';
export { createInteractionHint } from './interaction/interactionHint.js';
export { setupRaycast } from './interaction/raycast.js';
