import { AgentActionRegistry } from '../../../gameplay/agents/AgentActionRegistry.js';
import { AGENT_PERMISSION_LEVELS } from '../../../gameplay/agents/AgentContracts.js';

function pointFor(runtime, placementGrid, random = Math.random) {
  const bounds = runtime.pet._petBounds;
  if (!bounds) return null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const point = { x: bounds.minX + random() * (bounds.maxX - bounds.minX), y: 0, z: bounds.minZ + random() * (bounds.maxZ - bounds.minZ) };
    if (!placementGrid || placementGrid.isWorldPositionAvailable(point)) return point;
  }
  return null;
}

export function createChiiAnimalAgentActions({
  placementGrid = null, worldObjects = null, social = null, bubbles = null,
  pastoralSlice = null, townSocialSystem = null, generationController = null, random = Math.random,
  explorationOnly = false,
} = {}) {
  const registry = new AgentActionRegistry();
  registry.register({
    id: 'routine.idle', permission: AGENT_PERMISSION_LEVELS.AUTONOMOUS, cooldownMs: 2500, tags: ['routine'],
    execute: async ({ runtime }) => {
      runtime.pet.stopWalking?.(); runtime.pet.playAnimation?.('idle');
      runtime.state.drives.energy = Math.min(1, runtime.state.drives.energy + 0.035);
      return { animation: 'idle' };
    },
  });
  registry.register({
    id: 'routine.wander', permission: AGENT_PERMISSION_LEVELS.AUTONOMOUS, cooldownMs: 3200, tags: ['routine', 'movement'],
    execute: async ({ runtime }) => {
      const target = pointFor(runtime, placementGrid, random);
      if (!target) return { moved: false };
      runtime.pet.walkTo?.(target.x, target.z, 2.6 + random() * 1.4);
      runtime.state.drives.curiosity = Math.max(0.1, runtime.state.drives.curiosity - 0.035);
      return { moved: true, target };
    },
  });
  registry.register({
    id: 'routine.observe', permission: AGENT_PERMISSION_LEVELS.AUTONOMOUS, cooldownMs: 5000, tags: ['routine', 'observation'],
    canExecute: ({ proposal }) => Boolean(proposal.targetId && worldObjects?.findById?.(proposal.targetId)),
    execute: async ({ runtime, proposal }) => {
      const target = worldObjects.findById(proposal.targetId);
      runtime.pet.stopWalking?.();
      runtime.pet.playAnimation?.('idle');
      runtime.state.drives.curiosity = Math.max(0.1, runtime.state.drives.curiosity - 0.06);
      return { targetId: proposal.targetId };
    },
  });
  registry.register({
    id: 'social.greet', permission: AGENT_PERMISSION_LEVELS.VALIDATED, cooldownMs: 18_000, tags: ['social'],
    canExecute: ({ runtime, proposal }) => social?.canGreet(runtime.pet, social.getRuntime?.(proposal.targetId)?.pet) ?? false,
    execute: ({ runtime, proposal }) => social.greet(runtime, proposal.targetId),
  });
  registry.register({
    id: 'social.cooperate', permission: AGENT_PERMISSION_LEVELS.VALIDATED, cooldownMs: 35_000, tags: ['social', 'cooperation'],
    canExecute: ({ runtime, proposal }) => social?.canGreet(runtime.pet, social.getRuntime?.(proposal.targetId)?.pet) ?? false,
    execute: ({ runtime, proposal }) => social.cooperate(runtime, proposal.targetId, { activity: '玩耍' }),
  });
  if (!explorationOnly) {
    registry.register({
      id: 'world.propose', permission: AGENT_PERMISSION_LEVELS.VALIDATED, cooldownMs: 60_000, tags: ['world', 'proposal'],
      canExecute: ({ runtime }) => Boolean(pastoralSlice && runtime.pet._petRegion !== 'church_town'),
      execute: async ({ runtime }) => pastoralSlice.requestAutonomousIdea(runtime.pet),
    });
    registry.register({
      id: 'activity.propose', permission: AGENT_PERMISSION_LEVELS.VALIDATED, cooldownMs: 60_000, tags: ['social', 'activity', 'proposal'],
      canExecute: ({ runtime }) => Boolean(townSocialSystem?.isTownPet(runtime.pet)),
      execute: async ({ runtime }) => {
        bubbles?.showLine(runtime.pet, '我想到一个小活动，来聊聊吗？', 4);
        return { opportunity: townSocialSystem.socialDirector?.getOpportunity(runtime.pet)?.type || null };
      },
    });
    registry.register({
      id: 'building.propose', permission: AGENT_PERMISSION_LEVELS.VALIDATED, cooldownMs: 60_000, tags: ['building', 'proposal'],
      execute: async ({ runtime }) => {
        bubbles?.showLine(runtime.pet, '这块地好像在说：请给我一栋房子。', 4);
        return { route: 'town_builder_dialogue' };
      },
    });
  }
  for (const operation of ['model.generate', 'model.refine', 'model.mount', 'building.generate', 'animation.generate']) {
    registry.register({
      id: `content.${operation}`,
      permission: operation === 'animation.generate' ? AGENT_PERMISSION_LEVELS.CACHED_GENERATION : AGENT_PERMISSION_LEVELS.PLAYER_APPROVAL,
      cooldownMs: 30_000, tags: ['content'],
      canExecute: () => Boolean(generationController),
      execute: async ({ proposal }) => generationController.run(proposal.intent, { confirmed: proposal.approved }),
    });
  }
  registry.register({
    id: 'worldforge.propose', permission: AGENT_PERMISSION_LEVELS.AUTHORING_ONLY, cooldownMs: 300_000, tags: ['worldforge', 'proposal'],
    canExecute: ({ proposal }) => proposal.authoring === true,
    execute: async ({ proposal }) => generationController.run(proposal.intent),
  });
  return registry;
}
