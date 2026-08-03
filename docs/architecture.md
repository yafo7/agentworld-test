# Chii Island Architecture

Status: current implemented architecture map.

Reviewed against the working tree on 2026-08-03. This document describes the
code that exists. Items under **Known migration debt** are not implemented
architecture and must not be presented as completed work.

## Authority And Scope

Documentation precedence is:

1. `AGENTS.md` is the binding repository policy and product baseline.
2. A selected `.agents/skills/chii-*` skill owns its detailed workflow.
3. This document maps current runtime ownership and dependency boundaries.
4. `api-reference.md` is a dated backend API snapshot, not product policy.
5. `README.md` is the external overview and append-only changelog.
6. `CLAUDE.md`, `image.md`, and files under `docs/history/` are historical
   context only.

When these sources disagree, the earlier item wins. Historical material must
never revive retired Ghost Home behavior or superseded gameplay flows.

## Runtime Surfaces

| Surface | Entry | Role |
|---|---|---|
| Chii Island | `src/demos/chii-island/index.html` | Primary playable prototype |
| Character showcase | `src/demos/chii-island/player-candidates.html` | Character and equipment preview; the filename is historical |
| Agentland Friends | `src/demos/agentland-friends/index.html` | Separate friends prototype |
| Ghost Home | `src/demos/ghost-home/index.html` | Compatibility redirect to Agentland Friends only |
| Repository root | `index.html` | Redirect to Chii Island |

The retired `src/main.js` and `src/legacy/` roots have been removed. Architecture
tests prevent current runtime modules from recreating or importing them.

## Layer Map

```text
HTML entry points
  -> demos/* composition and feature systems
       -> gameplay/* domain workflows and state machines
       -> world/* registry, placement, occupancy, and collision composition
       -> engine/* reusable Three.js, Rapier, model, animation, input, and UI
       -> ports/* semantic contracts
            <- integrations/* provider and runtime adapters
                 -> backend/* HTTP transport
       -> assets/* runtime and generated asset repositories
       -> storage/* browser persistence and caches

public/generated/* = local runtime data, not executable application logic
```

Layer responsibilities:

| Layer | Owns | Must not own |
|---|---|---|
| `engine/` | Reusable renderer, physics, input, model and animation infrastructure | Demo rules, backend policy, Chii content |
| `ports/` | Stable semantic interfaces | Concrete endpoints, DOM, scene composition |
| `integrations/` | Port implementations and provider policy | Product progression and scene rules |
| `backend/` | Request construction and HTTP transport | Scene objects, DOM, gameplay state |
| `assets/` | Runtime resolution and generated-result persistence | Chii demo catalogs |
| `storage/` | Save stores, caches, serialization | Runtime orchestration |
| `world/` | Object registry, placement grid, occupancy and collider lifecycle | Region-specific gameplay |
| `gameplay/` | Shared pet, story, social and AI work lifecycles | Bootstrap and page composition |
| `demos/chii-island/` | Chii assembly, regions, presentation and interaction routing | Reusable engine implementation |
| `demos/agentland-friends/` | Friends-only runtime | Chii story or scene state |

Allowed dependencies point from composition toward contracts and reusable
layers. Shared layers do not import a demo. Ports do not import their adapters.
Provider, browser, and backend choices are made by the composition root.

## Chii Composition Root

`src/demos/chii-island/main.js` is the current application composition root. It
constructs dependencies and owns the fixed update/render order. New feature
logic should be placed in an owning system and injected here rather than added
inline.

Current startup order is a compatibility contract:

1. Construct `IslandStoryState`, `ActZeroStoryState`, and the loading surface.
2. Initialize the voxel runtime and Rapier physics.
3. Create the Three.js scene, renderer, input, camera, lights, and render/model
   visual adapters.
4. Resolve the selected Original, Pro, or Voxel scene profile and local catalog.
5. Generate deterministic terrain/layout and attach optional world water.
6. Assemble entities into `WorldObjectRegistry`.
7. Restore the selected scene's Auto save before collider composition.
8. Bind model visual and collider lifecycle to registered world objects.
9. Construct the player, appearance/equipment flow, climate, and named residents.
10. Construct HUD, save UI, object editing, placement, and interiors.
11. Compose Pastoral, Forest, Town Social, and Town Builder systems.
12. Restore generated residents after region gameplay composition.
13. Construct interaction routing, Act 0, and the ESC management presenter.
14. Register assembled resources with `ApplicationLifecycle` in creation order.
15. Start the owned animation frame and resize observer.

Changing this sequence can change save restoration, occupancy, visual tags,
collider registration, or actor availability. Such a change requires a scoped
task and a real-composition regression test.

Every bootstrap await crosses `ApplicationLifecycle.assertActive()`. The
lifecycle exposes an abort signal, invalidates stale HMR/pagehide continuations,
and disposes resources registered after cancellation immediately.

## Frame Contract

The current frame order is also compatibility-sensitive:

1. Schedule the next frame and clamp delta time to 0.1 seconds.
2. Update Act 0 and derive its input gate.
3. Update inventory eligibility and consume camera/ESC interaction input.
4. Route interactions and the player special action.
5. Update static entity animation.
6. Update player movement when controls are available.
7. Update named residents, `PetManager`, region gameplay, and climate.
8. Update model effects and world water.
9. Update HUD, temporary region presentation, particles, and dialogue typing.
10. Apply the Act 0 or third-person camera.
11. Step physics and update physics debug rendering.
12. End the input frame and render through `RenderPresentationPort`.

Refactoring may extract these stages, but must preserve their relative order
until tests prove an intentional change is safe.

## Domain Ownership

| Concern | Current owner |
|---|---|
| Persistent story progression | `src/gameplay/story/IslandStoryState.js` |
| Cross-region milestone transitions | `src/gameplay/story/IslandStoryProgression.js` |
| Act 0 persistence and performance | `ActZeroStoryState` and `ActZeroCrashDirector` |
| Pet state | `src/gameplay/pets/PetStateMachine.js` |
| Canonical resident identity | `data/residentCatalog.js` |
| Resident asset and appearance restoration | `systems/ChiiCharacterRuntimeService.js` |
| Three-region composition | `gameplay/createChiiRegionGameplay.js` |
| Pastoral AI work | `systems/pastoralSlice.js` and shared AI work services |
| Pastoral work presentation | `presentation/PastoralWorkEffects.js` |
| Forest summon and camping | `systems/ForestTempleSystem.js` |
| Town activity lifecycle | `TownSocialSystem` and `TownSocialDirector` |
| Town construction | `TownBuilderSystem` |
| World identity and metadata | `WorldObjectRegistry` |
| Placement and occupancy | `src/world/placement/` |
| Physics collider lifecycle | `ColliderRegistry` |
| Model-tag visual lifecycle | `WorldModelVisualLifecycle` and `ModelVisualPort` |
| Climate state and providers | `WorldClimateSystem`, climate ports, adapters, and cache |
| Per-scene Auto/Record persistence | `ChiiScenePersistenceSystem` and `ChiiSceneSaveStore` |
| Generated asset catalog and integrity | `src/assets/generatedLibrary.js`, `generatedAssetManifest.js`, and `GeneratedAssetRepository` |
| Input ownership | `ControlLockCoordinator` plus each surface's `isOpen()`/`isActive()` state |
| Interaction session and dialogue teardown | `systems/ChiiInteractionSession.js` |
| Page/HMR resource cleanup | `ApplicationLifecycle` and system-level `dispose()` methods |
| ESC settings presentation | `SceneManagementPanel` |

Systems request state transitions from these owners. They must not create
parallel story flags, pet state machines, placement stores, or collider lists.

## Core Data Flows

Autonomous gameplay content:

```text
player interaction
  -> region system
  -> PetStateMachine / PetWorkCoordinator
  -> AIWorldActionService
  -> ContentGenerationPort
  -> VoxelContentAdapter
  -> backend API
  -> GeneratedAssetRepository
  -> WorldObjectRegistry
  -> placement + collider + visual + scene-save lifecycles
```

Studio-authored content is a separate workflow:

```text
explicit Studio save
  -> chii-assets sync workflow
  -> public/generated runtime files and catalog
  -> Chii runtime
```

Autonomous gameplay must not call Studio save/load endpoints. Studio sync must
not reinterpret or regenerate user-authored content.

## Persistence And Scene Profiles

Original, Pro, and Voxel are independent scene profiles. Original is the
default and the only profile modified unless a task explicitly names another
profile. Each profile owns its frozen asset root, feature flags, catalog, Auto
save, and three Record slots.

`WorldObjectRegistry` is the intended identity source for live world objects.
Registry events feed placement, colliders, model visuals, and persistence.
Generated model and animation files are referenced by asset ID. New snapshots
never inline full generated model JSON. Legacy inline snapshots are read once,
migrated into `GeneratedAssetRepository`, and then registered by asset ID.

Generated/user assets, history snapshots, and Studio backups are durable data.
They must not be removed merely because they are duplicated or absent from the
current page bundle.

## Rendering Boundaries

- `ModelVisualPort` owns model-tag materials and model-local effect lifecycle.
- `WorldWaterVisualPort` owns continuous water presentation only; terrain owns
  occupancy and traversal.
- `WorldClimateVisualPort` owns the replaceable sky/environment visual delegate.
- `RenderPresentationPort` owns Current/Cel styles, quality, optional
  post-processing, and direct-render fallback.

The audited external render-runtime baseline is commit `1203a1e`. A sibling
repository checkout is never an implicit runtime dependency or authorization
to copy its source.

## Known Migration Debt

The following are current exceptions, not approved target architecture:

- `main.js` still contains detailed player/resident construction and spawn
  assembly in addition to dependency assembly and the fixed frame contract;
  asset/appearance restoration and interaction-session teardown are isolated in
  `ChiiCharacterRuntimeService` and `ChiiInteractionSession`.
- `TownSocialSystem` and `pastoralSlice` remain large orchestration modules.
  Pure town activity policy and pastoral presentation have been extracted, but
  further splits must preserve their current async state machines.
- Generated asset writes are atomic per file and manifest entries have explicit
  lifecycle states, but the payload-plus-manifest update is not one filesystem
  transaction. A process crash between those writes can leave an unreferenced
  payload; hashes and byte-size verification are not yet recorded.
- The pinned render-runtime package still declares an obsolete Three.js peer
  range. CI intentionally installs with `--legacy-peer-deps` until the audited
  upstream package metadata is refreshed.
- Backend requests already in flight cannot always be transport-aborted. System
  operation tokens prevent late results from mutating the scene or story, while
  a successfully persisted generated payload may remain as reusable history.

Remove an exception only with focused tests and without changing unrelated
gameplay behavior.

## Change Gates

Architecture work is complete only when the affected scope passes:

1. focused contract tests for the owner being changed;
2. the full Node test suite;
3. production build;
4. story, activity, or render compatibility checks when that contract changes;
5. browser/WebGL verification for scene, UI, camera, input, asset, or rendering
   changes;
6. clean-resource checks for missing runtime asset URLs and restored saves.

Security cleanup is separate from Git history rewriting. Never force push,
delete durable assets, or rewrite history as an incidental architecture step.
