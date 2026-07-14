---
name: chii-gameplay
description: Design and implement a scoped Chii Island gameplay vertical slice using the current region systems, pet state machine, interaction routing, AI services, persistence, and presentation boundaries. Use when adding or changing pet behavior, dialogue choices, region events, work actions, parties, summons, camping, or other player-pet gameplay.
---

# Chii Gameplay Slice

Before editing, define:

- one region
- one player trigger
- participating pets/objects
- state transitions
- one visible result
- persistence requirement
- explicit non-goals

Place code by ownership:

- shared state/AI lifecycle: `src/gameplay/`
- region composition: `demos/chii-island/gameplay/`
- Chii behavior: `demos/chii-island/systems/`
- UI/presentation: `systems/DialogueSystem.js` or `presentation/`
- backend semantics: ports/integrations, never region code

Reuse `PetStateMachine`, `ChiiInteractionController`, `PetWorkCoordinator`, and `WorldObjectRegistry`. Keep `main.js` as composition and update order only.

Read `references/regions.md` only for region-specific work. Finish with `$chii-verify`.
