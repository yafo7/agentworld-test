import { AgentPerceptionService } from '../../../gameplay/agents/AgentPerceptionService.js';
import { AgentActionArbiter } from '../../../gameplay/agents/AgentActionRegistry.js';
import { AgentTraceStore } from '../../../gameplay/agents/AgentTraceStore.js';
import { AgentSocialService } from '../../../gameplay/agents/AgentSocialService.js';
import { IslandAgentCoordinator } from '../../../gameplay/agents/IslandAgentCoordinator.js';
import { AnimalAgentInspector } from '../../../gameplay/agents/AnimalAgentInspector.js';
import { AnimalAgentStore } from '../../../storage/AnimalAgentStore.js';
import { ChatAgentReasoningAdapter } from '../../../integrations/content/ChatAgentReasoningAdapter.js';
import { PetBubblePresenter } from '../presentation/PetBubblePresenter.js';
import { createChiiAnimalAgentProfile } from '../data/animalAgentProfiles.js';
import { createChiiAnimalAgentActions } from '../systems/ChiiAnimalAgentActions.js';
import { ChiiResidentThemeSystem } from '../systems/ChiiResidentThemeSystem.js';
import { ChiiResidentBehaviorBody } from '../systems/ChiiResidentBehaviorBody.js';

import { residentThemeAnimations } from '../data/residentThemes.js';
import { directionKey } from '../data/residentRoutines.js';

/** Assemble resident cognition without owning the frame loop or pet body state. */
export function createChiiAnimalAgents({
  lifecycle, camera, player, worldObjects, placementGrid, getPets,
  worldClimate, islandStoryState, regionGameplay, generationController,
  scenePersistence, runtimeScope, explorationOnly, getRegionName,
}) {
  const { pastoralSlice, townSocialSystem } = regionGameplay;
  const trace = new AgentTraceStore();
  const bubbles = lifecycle.add(new PetBubblePresenter({ camera, vfxService: regionGameplay.vfxService }));
  const reasoning = new ChatAgentReasoningAdapter({ generationController, maxConcurrent: 1 });
  const perception = new AgentPerceptionService({
    player,
    worldObjects,
    getPets,
    getClimate: () => worldClimate.getState(),
    getStory: () => islandStoryState.getSnapshot(),
    getActiveEvent: () => {
      const active = townSocialSystem.data?.active;
      return active ? { type: active.type, phase: active.status } : null;
    },
    getRegionName,
  });
  let coordinator = null;
  const social = lifecycle.add(new AgentSocialService({
    getRuntime: id => coordinator?.getRuntime(id) || null,
    bubbles,
    trace,
  }));
  const actions = createChiiAnimalAgentActions({
    placementGrid, worldObjects, social, bubbles, pastoralSlice,
    townSocialSystem, generationController, explorationOnly,
  });
  coordinator = lifecycle.add(new IslandAgentCoordinator({
    perception,
    arbiter: new AgentActionArbiter({ registry: actions, trace }),
    profileResolver: createChiiAnimalAgentProfile,
    store: new AnimalAgentStore({ scope: runtimeScope }),
    reasoning,
    trace,
    runtimeOptions: { startImmediately: explorationOnly },
    onChanged: () => scenePersistence.scheduleSave('animal-agent'),
  }));
  if (!explorationOnly) {
    coordinator.behaviorSystem = new ChiiResidentThemeSystem({
      coordinator, registry: worldObjects, generationController, scope: runtimeScope,
      social, town: townSocialSystem,
      getClimate: () => worldClimate.getState(), getStory: () => islandStoryState.getSnapshot(),
      body: new ChiiResidentBehaviorBody({ placementGrid, generationController, getPets, scope: runtimeScope }),
    });
    townSocialSystem.getIslandResidents = getPets;
    townSocialSystem.residentTheme = (id, type) => coordinator.behaviorSystem.resolveActivity(id, type);
    social.getGreetingGestures = id => {
      const theme = coordinator.behaviorSystem.resolveActivity(id, 'greeting');
      return theme?.edited ? theme.actions.filter(action => ['wait', 'perform'].includes(action.kind)) : [];
    };
    const onDirectionChange = event => {
      for (const id of coordinator.runtimes.keys()) {
        if (event.key === directionKey(runtimeScope, id)) coordinator.behaviorSystem.directionChanged(id);
      }
    };
    window.addEventListener('storage', onDirectionChange);
    lifecycle.add({ dispose: () => window.removeEventListener('storage', onDirectionChange) });
  }
  for (const pet of getPets()) {
    if (!explorationOnly) {
      if (pet.petState?.is('idle')) pet.petState.transition('free_roam', { reason: 'start-island-day' });
      for (const [name, plan] of Object.entries(residentThemeAnimations(pet._originalModelJson))) pet.loadAnimation?.(name, plan);
    }
    coordinator.registerPet(pet);
  }
  lifecycle.add(scenePersistence.registerSnapshotExtension('animalAgents', {
    capture: () => coordinator.snapshot(),
    restore: snapshot => coordinator.restore(snapshot),
  }));
  const inspector = lifecycle.add(new AnimalAgentInspector({
    coordinator, trace, actionRegistry: actions, reasoning,
  }));
  return { coordinator, bubbles, inspector };
}
