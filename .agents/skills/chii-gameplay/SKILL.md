---
name: chii-gameplay
description: Design and implement Chii Island gameplay systems and scoped vertical slices, including pets, interactions, dialogue choices, inventory, equipment, tasks, journal or progression state, region events, social activities, construction, summoning, camping, and player-world actions. Use whenever rules, state transitions, entry/exit conditions, persistence, rewards, or reusable play loops change.
---

# Chii Gameplay And Systems

Treat this as the single primary skill for game rules. Do not create a separate feature skill for each inventory, task, pet, or region system.

Classify the work:

- Shared system: inventory, equipment, tasks, journal, progression, abilities, or reusable interaction rules.
- Region slice: pastoral, forest, town, beach, or a cross-region loop.
- Resident behavior: pet state, following, free roam, work, performance, or social coordination.
- AI world action: create/refine/mount/animation initiated by gameplay.
- Authored sequence: pair with `$chii-story`.
- Interface work: pair with `$chii-ui`; the gameplay system remains the state owner.

Before editing, define:

1. Player verb and entry condition.
2. Authoritative state owner and allowed transitions.
3. Participating pets, objects, regions, and reservations.
4. Normal completion, cancellation, failure, and resume state.
5. Visible feedback and UI projection.
6. Session-only or persistent data.
7. AI/backend operations and caching policy.
8. Explicit non-goals and one testable outcome.

Place code by ownership:

- reusable rules and state: `src/gameplay/`
- world registry, placement, navigation, physics: `src/world/`
- Chii orchestration: `src/demos/chii-island/systems/`
- region composition: `src/demos/chii-island/gameplay/`
- UI and camera presentation: `presentation/` through `$chii-ui` or `$chii-story`
- backend semantics: ports/integrations through `$chii-ai`

Reuse `PetStateMachine`, `ChiiInteractionController`, `PetWorkCoordinator`, `WorldObjectRegistry`, and current persistence repositories. Keep `main.js` as dependency assembly and stable update order.

Rules:

- Never express one feature state through duplicate booleans in multiple systems.
- Busy pet work suspends follow/free-roam and records an explicit resume policy.
- Runtime HUD and dialogue project state; they do not own tasks, inventory, progression, or rewards.
- Autonomous generated world placements remain session-only unless persistence is explicitly requested.
- Reuse generated activity assets after first success.
- Guard async re-entry and restore valid input, camera, and pet state in `finally`.

Read `references/systems.md` for shared-system ownership. Read `references/regions.md` only for region work. Finish with focused tests and `$chii-verify`.
