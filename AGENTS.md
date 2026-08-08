# AGENTS.md

Long-term guidance for Codex in `agentworld-test`. Top sections are authoritative. This file records stable constraints and the implemented product baseline, not speculative plans or a changelog. Load detailed project knowledge through the smallest relevant `chii-*` skill.

## 0. Non-Negotiable Rules

- Preserve the running Three.js game and make small, incremental changes.
- Do not modify the render loop, camera, renderer, delta time, physics step, model parser, animation runtime, VoxelModel, JSON schema, scene graph, or asset pipeline unless the task targets that layer and evidence proves it necessary.
- Reuse current modules before creating abstractions. Keep feature logic out of `main.js`.
- Do not delete generated/user assets or revert dirty worktree changes unless explicitly requested.
- Do not modify sibling projects (`3d-generate`, `voxel-game`) unless explicitly authorized. Reading/running them is allowed.
- Remote services may only be used through public APIs. Never place API keys in browser code.
- Before any autonomous backend call, use `$chii-prompts` to author or validate prompt text; use `$chii-ai` for invocation, provider policy, result handling, and persistence.
- Browser location may only be requested after an explicit player action. Use it only through the climate weather adapter; never persist coordinates or send them to AI, Studio, model generation, or analytics.
- Do not recreate or import the removed `src/legacy/` runtime.
- For model mismatch bugs, compare exact JSON inputs before inspecting renderer code.
- Keep Studio-authored assets and autonomous gameplay generation as separate workflows. Never silently substitute one for the other.
- After every authorized `3d-generate` update, compare the previous and new commits and refresh the capability baseline in Section 3. Review API contracts, model/animation schema, material tags, runtime package exports, provider modes, and local asset compatibility before relying on new behavior.
- Do not bypass `WorldObjectRegistry`, `PlacementGrid`, `ObjectPlacementService`, or `ColliderRegistry` when adding or replacing an interactive world object.
- Run `$chii-verify` after code, scene, asset, or integration changes.

## 1. Product Direction

Chii Island is an **AI-native 3D pet home prototype**, not a full management game.

```text
环境塑造宠物
宠物塑造环境
```

Goals:

- Validate language-driven voxel model generation in a playable Three.js world.
- Validate refine, animation/VFX, and add-part/mount as gameplay actions.
- Make a small number of named pets feel like concrete residents.
- Let pets, player actions, objects, and environment state affect each other.

The current milestone is to make the three regions feel like one connected prototype:

```text
Pastoral: player and pet change the home
→ Forest: a following companion helps summon a new resident
→ Town: residents socialize, stage activities, and build
→ created residents and objects return to the shared island session
```

Current named residents: `momo`, `mako`, `yafo`, `lingq`, `fangk/fangke`, `mok`, and the town builder crab (`builder_crab`, display name `螃蟹`). `fangk` owns town hosting/organization; the crab owns new-building construction. Animal communities are a future layer.

Ghost Home is retired. Its old URL is a compatibility redirect to Agentland Friends; do not restore its runtime unless explicitly requested.

## 2. Current Baseline

Main URL:

```text
http://localhost:5173/src/demos/chii-island/
http://localhost:5173/src/demos/agentland-friends/
```

Services:

- Chii Island/Vite: port `5173`.
- Local Voxel Studio/`3d-generate`: port `8000`.
- Use `$chii-dev` to inspect/start/stop them safely.
- Do not assume either service is already running; check first.

Current island:

- 50x50 colored-tile terrain with a continuous animated river, forest-side sand/rock beach, waterfall, and town fountain.
- Windmill pastoral, temple forest, and church town regions.
- Phrolova player with movement, jump, flight, idle/walk/run/jump/special actions, inventory, and hand-prop presentation. `Space` jumps, `H` toggles flight, `J` plays the special action, and `B` opens the inventory.
- Rapier physics, voxel runtime, animation plans, particles, dialogue, and runtime HUD.
- Cross-scene story progression is owned by `IslandStoryState`: chapter, island day, development stage, known residents, unlocked regions, current authored objective, completed events, and durable story facts. Existing Act 0 saves migrate automatically; scene-style saves remain separate.
- Unified current pet state machine.
- Runtime assets loaded locally from `public/generated/`.
- ESC switches between Original, Pro, and Forge; Original remains the default. Voxel is an archived compatibility profile and is no longer shown in the scene switcher. Original and Pro keep their frozen Chii snapshots. Forge loads a versioned WorldForge base-scene package while reusing Original resident/building assets as Chii gameplay overlays.
- ESC can switch collision between important-part voxel AABBs (default) and the legacy whole-bounds strategy; both are owned by `ColliderRegistry`.
- ESC provides a bubble-style climate panel. Manual mode controls weather, hour (0-23), and month (1-12); realtime mode reads device date/time/timezone without permission and requests location only after the player clicks weather sync. Open-Meteo supplies weather and BigDataCloud supplies the city label through separate adapters. Weather uses a 30-minute browser cache and clear-weather fallback; the city label is session-only. Coordinates are rounded by the adapters and are never cached.
- Editable non-vegetation objects use grid occupancy and support move, rotate, scale, and delete. Editing uses a fixed north-up overhead camera: screen up is world `-Z`, screen right is world `+X`.
- Character appearance uses an approved empty-hand base. A complete clothing loadout is regenerated from that base through identity-preserving refine; hand props and simple accessories use mount. Successful results are cached by character, base revision, and loadout.

Implemented vertical slices:

- Act 0 prologue: a transient code-built damaged-helicopter stage, locally cached backend-generated angel and animations, rescue-wish input, scripted ejection/free fall/ocean impact, and clean transition to the forest beach. The player's wish is a local story fact and never triggers generation during the performance.
- Pastoral: follow/free roam, create/refine/mount, work presentation, and persistent world results.
- Forest: companion-led pet summon, generated animations, introduction, camping; summoned pets persist as residents.
- Town social: free roam/follow, contextual daily activities, hosted festivals, group gathering, generated/cached activity assets, animation, and VFX. A top-right phase card shows the current four-stage activity and one optional preparation task without blocking backend work.
- Town building: talk to the builder crab, choose a terrain lot, place its footprint from overhead view, describe and confirm the building, then generate and construct it. Current prototype lot presets are `3x4`, `4x4`, and `5x5` terrain tiles.
- Building interiors: curated and generated buildings share one enter/exit system. The church has a code-built Gothic nave plus locally cached backend-generated pews, altar, and statue; windmill, temple, and generated buildings currently reuse one simple empty-room template.
- Agentland Friends: a standalone prototype that previews user-supplied local reference images, selects generated friend characters, lets residents roam autonomously, and plays a small staged group story. It is separate from Chii gameplay and does not upload references or call the backend at runtime.

Original, Pro, Forge, and the archived Voxel profile own isolated local saves. AI-created objects, refine/mount results, confirmed object transforms and deletions, generated buildings, summoned residents, and character appearance changes survive refresh. ESC exposes one continuously updated Auto state plus three manually frozen Record slots; Reset restores the selected Record into Auto after explicit confirmation. Construction/VFX helpers, social-event props and outfits, dialogue/camera/input state, and frame-by-frame free-roam positions remain transient.

Use `$chii-status` instead of rereading the whole repository for current progress.

## 3. Architecture

```text
src/ports/         stable content and asset contracts
src/integrations/  backend/studio adapters and provider policy
src/backend/       HTTP/API wrappers
src/assets/        runtime/generated asset repositories
src/storage/       cache and persistence
src/engine/        reusable Three.js, Rapier, model, animation, input, UI
src/world/         world registry and collider composition
src/gameplay/      shared pet state and AI work lifecycle
src/demos/         demo-specific composition and behavior
public/generated/  local runtime model/animation JSON
```

Important ownership:

- `src/demos/chii-island/main.js`: dependency assembly and stable update/render order.
- `src/engine/runtime/ApplicationLifecycle.js`: reverse-order, idempotent cleanup for page exit, failed bootstrap, and Vite HMR. Feature systems own their own cleanup and are registered here by the composition root.
- `presentation/SceneManagementPanel.js`: ESC settings presentation and DOM listener lifecycle. Setting values remain owned by collider, render, climate, save, and audit systems.
- `story/ActZeroStoryState.js` and `presentation/ActZeroCrashDirector.js`: prologue persistence, transient stage lifecycle, input/camera lock, and first-act handoff. Act 0 actors are not pets and its props do not enter world placement or collision registries.
- `src/gameplay/story/IslandStoryState.js`: the single persistent story-progression owner shared by all scene styles. Directors and region systems request explicit transitions; they do not write story-shaped localStorage or duplicate chapter/day/objective flags.
- `src/gameplay/story/IslandStoryProgression.js`: explicit successful-exit transitions from Pastoral, Forest summon, Town Social, and Town Builder into `IslandStoryState`.
- `story/storyDevelopmentBaseline.js` and `npm run test:story-baseline`: frozen Original story-development contract plus integrity checks for its manifest, catalog residents, and 71 runtime assets.
- `gameplay/createChiiRegionGameplay.js`: three-region gameplay composition.
- `world/ChiiSceneAssembler.js`: Chii entity placement.
- `systems/sceneLayout.js`: deterministic terrain and region plan.
- `data/sceneStyle.js` and `data/assetCatalog.js`: selectable Original/Pro/Forge profiles plus the archived Voxel compatibility profile, feature flags, frozen roots, and runtime catalog selection.
- `systems/ChiiInteractionController.js`: interaction selection/routing.
- `systems/PetManager.js`: current pet loading and free-roam behavior.
- `data/residentCatalog.js`: canonical resident IDs, legacy aliases, asset/profile identity, loader ownership, region, spawn, and initial state.
- `systems/ChiiCharacterRuntimeService.js`: resident model/animation loading plus base-first saved appearance restoration.
- `systems/ChiiInteractionSession.js`: interaction route ownership, dialogue/camera/player locks, and cancellation-safe teardown.
- `systems/ObjectEditorController.js`: object management UI, fixed overhead editing camera, and building-footprint placement sessions.
- `systems/ChiiScenePersistenceSystem.js`, `src/storage/ChiiSceneSaveStore.js`, and `presentation/SceneSavePanel.js`: per-scene Auto persistence, three frozen Record slots, transactional Reset/reload, and ESC save UI.
- `systems/BuildingInteriorSystem.js` and `world/ChiiInteriorAssembler.js`: building-door routing, room visibility, player/camera teleport, church architecture/furniture, shared empty-room fallback, and interior collision.
- `systems/TownSocialSystem.js`, `TownSocialDirector.js`, and `data/townSocialActivities.js`: town opportunities, pure activity/dialogue policy, activities, festivals, and their lifecycle.
- `src/gameplay/social/ActivityRegistry.js`, `src/storage/TownActivityRegistryStore.js`, and `data/townActivityRegistry.js`: scene-scoped activity signatures, exact/similar lookup, draft-to-ready registration, reusable asset bindings, and the six curated Original activity packages.
- `src/gameplay/social/ActivityAssetResolver.js` and `src/assets/repositories/ActivityAssetRepository.js`: compatibility-checked resolution of resident, generated-cache, and local-file activity assets before backend fallback.
- `systems/RuntimeHUD.js`: runtime hints plus the non-blocking town activity phase/task card.
- `systems/TownBuilderSystem.js`: builder-crab dialogue, lot selection, building generation, and construction lifecycle.
- `systems/AssetSemanticAudit.js`: read-only development report for model tags, animation operators, and renderer counters; exposed as `window.__chiiAssetAudit`.
- `presentation/TemporaryVfxService.js`: shared lifecycle and presets for temporary idea, work, dust, summon, and celebration effects.
- `presentation/PastoralWorkEffects.js`: Pastoral work-start, dust, scaffold, reveal, animation/particle presentation, and cleanup; `pastoralSlice` owns rules only.
- `systems/WorldClimateSystem.js`: single Chii climate state owner, manual/realtime mode, ESC binding, clock refresh, explicit weather-sync lifecycle, and fallback policy.
- `presentation/WorldClimatePresenter.js`: environment-only weather particles, time-of-day lighting/fog, sun movement, and month tint.
- `src/world/climate/WorldClimateState.js`: provider-neutral climate modes, weather vocabulary, normalization, and presentation projection.
- `src/ports/WeatherPort.js`, `src/ports/PlaceNamePort.js`, `src/integrations/climate/`, and `src/storage/ClimateCache.js`: weather/place contracts, browser clock/location, Open-Meteo weather, BigDataCloud city lookup, and location-free weather cache.
- `src/gameplay/pets/PetStateMachine.js`: single current pet-state owner.
- `src/gameplay/control/ControlLockCoordinator.js`: one projection of all blocking surfaces into camera, interaction, special-action, inventory, and movement gates.
- `src/gameplay/ai/`: semantic AI actions and work lifecycle.
- `src/world/placement/`: occupancy, snapping, footprint transactions, and object editing operations.
- `data/worldTuningProfile.js` and `ObjectScalePolicy`: the single Chii world scale, six scale categories (`building`, `pet`, `tree`, `plant`, `furniture`, `interactive_prop`), semantic size profiles, bottom-center anchoring, and presentation tuning. Gameplay passes semantic identity; it does not invent raw scale.
- `src/world/physics/ColliderRegistry.js`: collider strategy, registration, rebuild, and debug visualization.
- `src/integrations/content/VoxelContentAdapter.js`: provider/mode policy.
- `src/ports/ModelVisualPort.js` and `src/integrations/rendering/VoxelStudioModelVisualAdapter.js`: model-tag materials, fire/smoke companions, lightweight model water, and replacement/removal lifecycle.
- `src/ports/WorldWaterVisualPort.js` and `src/integrations/rendering/VoxelStudioWorldWaterAdapter.js`: replaceable continuous river presentation, isolated from terrain occupancy and navigation.
- `src/ports/WorldClimateVisualPort.js`, `presentation/WorldClimatePresenter.js`, and `src/integrations/rendering/ChiiSkyVisualAdapter.js`: the presenter implements the climate visual contract and owns the replaceable sky delegate.
- `src/ports/RenderPresentationPort.js` and `src/integrations/rendering/VoxelStudioRenderPresentationAdapter.js`: current/cel styles, optional post-processing, quality tiers, and direct-render fallback.
- `src/ports/ForgeScenePort.js`, `src/assets/repositories/ForgeSceneRepository.js`, and `src/integrations/worldforge/`: immutable Forge package loading, hash/version checks, embeddable WorldForge rendering, Forge height-field physics, and navigation-grid projection.
- `public/generated/scenes/forge/worldforge/`: published runtime-only Forge map, render scheme, gameplay bindings, optional HDRI, and integrity manifest. Chii never requires the live WorldForge editor in production.
- `src/demos/chii-island/data/assetCatalog.js`: local runtime asset catalog.
- `src/assets/generatedAssetManifest.js` and `src/assets/generatedLibrary.js`: generated-library schema, lifecycle, and runtime lookup; local Vite persistence is implemented by `vite/localLibraryPlugin.js`.

Architecture baseline completed 2026-07-13:

- Engine has no backend/demo imports.
- Runtime/backend/provider decisions are behind ports and adapters.
- Scene assembly and object lookup are outside `main.js`.
- create/refine/mount share one work lifecycle.
- Historical runtime roots are removed; architecture tests prevent their return.

Architecture hardening completed 2026-08-03:

- Shared layers no longer import Chii catalogs or implicit singleton adapters.
- Resident identity, pet state, story progression, control locks, climate state, and town resident reservations each have one owner.
- Scene snapshots reference generated assets by ID; legacy inline payloads migrate through `GeneratedAssetRepository`.
- Region systems reject late async results after disposal and release pets, reservations, VFX, input, camera, DOM listeners, and frame resources through explicit lifecycle contracts.
- Source import resolution, dependency direction, cycles, orphan modules, generated asset integrity, and secret scanning are automated verification gates.

### 3d-generate Capability Baseline

Last audited backend/runtime baseline: `1805dfc` on 2026-08-08. Chii pins that runtime as `vendor/voxel-studio-render-runtime-0.1.0-1805dfc.tgz`, pins Three to `0.160.1`, and validates the package in real WebGL2 with `npm run test:render-compat`.

Current backend and Studio capabilities:

- Language-driven model generation, refine, add-part/mount, animation, and particle-enabled animation generation remain the core production APIs.
- Studio generation supports provider modes including Voxel, Voxel Pro, Curve, Wire, and a newly exposed Math mode. Do not assume Math behavior or quality until it is tested against the remote backend.
- Material Tags v2 lets AI annotate `nodes[].tags` with semantic material intent while the runtime owns shaders and particles. The audited vocabulary includes `base` (`gold`, `silver`, `metal`, `glass`, `wood`, `stone`, `fur`), `water` (`pool`, `fall`), `foliage:leaf`, `vegetation:sway`, `emissive`, `fire` (normal/blue/green), and `smoke` (normal/steam).
- `electric`, `poison`, `ice`, `wet`, `rust`, `mossy`, `dirty`, and `damage` are vocabulary/design entries, not completed Chii rendering features.
- The material system includes procedural triplanar wood/stone variants, model-local pools/waterfalls/water streams, deterministic fire/smoke particles, and global tuning through `/api/material-tag-textures`.
- `@voxel-studio/render-runtime` is a reusable Three.js package for material tags, effect packages, batching, render styles, quality tiers, and post-processing. Chii pins `1805dfc` as `vendor/voxel-studio-render-runtime-0.1.0-1805dfc.tgz` and has verified it against Three.js r160 in real WebGL2; rerun `npm run test:render-compat` before updating that package.
- Remote commit `411c4ad` centralizes per-material, per-patch shader program cache generations in `MaterialShaderPatchChain`. It fixes stale Three.js program reuse after Cel patch reinstall, effect-layer remove/reapply, effect-variant replacement, and CSM rebuild. It does not change public API routes, generation providers, model/animation JSON, material-tag vocabulary, package exports, package version, or the Three.js peer range. Chii receives none of these runtime changes merely by pulling the sibling repository; adopting them requires a newly pinned tarball and the full render compatibility gate.
- `SkySystem`, atmosphere, clouds, HDRI, environment reflection, and shared render presets exist, with `GET/POST /api/shared-render-preset` and a hash endpoint. Treat this as an available module set, not as an already integrated Chii feature.
- The backend also exposes editable model/animation persistence through `/api/load-edited`, `/api/save-edited`, `/api/animations`, and `/api/save-animation`. Chii asset sync uses these native upstream endpoints.

Current Chii integration boundary:

- Pulling `3d-generate` or WorldForge does not automatically change Chii visuals. Runtime changes require a newly pinned tarball and compatibility verification; map changes require an explicit `publish:forge-scene` operation.
- Chii preserves `nodes[].tags`, explicit `locked`, mesh bone endpoints, `_meta.mounts`, and known extension metadata through model parse/clone/serialize. Autonomous Voxel generate/refine requests send compact read-only material/VFX contracts pinned to the current audited backend baseline.
- Chii runs the pinned Studio `MaterialTagRuntime` behind `ModelVisualPort`; tagged models remain unmerged so part semantics survive. The adapter promotes compatible Lambert/Phong materials to Standard only at this integration boundary. Fire/smoke, fur, foliage, and vegetation sway use runtime capabilities; pool/fall model water and the continuous world river remain replaceable Chii adapters. This is not full Studio parity: upstream model-water classes, texture-tuning presets, and batching are not exported/integrated.
- Model visual lifecycle follows world-object registration and model replacement. Create/refine/mount/remove paths must attach, detach, or reattach through the visual adapter instead of managing tag effects inside gameplay code.
- Time and weather drive a replaceable Chii sky through `WorldClimateVisualPort`. Full Studio clouds, HDRI, environment reflections, and shared render presets remain unintegrated.
- Current/Cel styles, optional subtle post-processing, and low/medium/high/ultra quality tiers run through `RenderPresentationPort`. Current style, high quality, and post-processing off are the defaults; direct renderer fallback must remain available.
- Historical `tilt` animation tracks normalize to `pointTo`. The bundled fallback runtime mirrors current backend `dash`, `slash`, `lockWorldRot`, and `launch.decel` behavior and reports its source/version/templates at startup.
- Autonomous Voxel generation sends exactly `provider: gpt`, `model: gpt-5.6-sol-high`, and `mode: voxel`. Generate/refine/mount/animation do not silently cross-fallback to another provider; backend errors retain structured diagnostics.
- Keep Chii `entity.tags` (gameplay semantics such as flower/farm/church) separate from `model.nodes[].tags` (part-level render semantics such as wood/fire/water). Never merge the two namespaces.
- Preserve and contract-test tags end to end, and adopt only implemented tags behind engine/integration boundaries. Do not replace the renderer or parser wholesale.
- Mass environment content should use deterministic vocabulary-driven material effects and batching. Unique pets, equipment, mounts, and festival props may use standalone effect packages. This division matches Chii's many environment objects and small set of detailed residents.
- Further upstream water parity, sky, and shared-render-preset parity must remain separate scoped milestones. Do not bundle them into ordinary gameplay changes.

Update procedure after each `3d-generate` pull:

1. Record old/new commit IDs and review the commit range rather than rereading the whole repository.
2. Check public API routes, request payloads, JSON fields, animation/VFX formats, provider modes, material vocabulary status, package exports, and Three.js peer version.
3. Check whether Studio-generated assets now contain fields Chii drops or interprets differently.
4. Update this baseline and the relevant `$chii-ai` or `$chii-assets` reference when contracts changed.
5. Keep upstream tracked code identical to `origin/main`; preserve local `generated_models` Edited data, then run sync dry-run and `$chii-verify` for any Chii-side integration change.

## 4. Gameplay Contracts

### Pets And Activities

- `PetStateMachine` is the only owner of pet state. Systems request transitions; they do not create parallel state flags.
- All current Chii pet overhead text must use `PetBubblePresenter`: `setHint` for idea bubbles and `showLine` for spoken lines. Do not create per-system pet speech sprites or call `createSpeechBubble` directly for pets. Non-pet labels such as construction status are outside this rule.
- Shared states include idle, following, free roam, working, performing, camping, and summoning participation. Busy work must suspend follow/free-roam updates.
- A commanded job records its resume policy before work starts. Current construction resumes the crab to free roam; cancellation restores the pre-dialogue state.
- Pet-specific personality, preferences, and capabilities belong in `data/petProfiles.js`. Do not duplicate the common interaction flow per pet.
- Town social activities belong to `TownSocialSystem`/`TownSocialDirector`; building construction belongs to `TownBuilderSystem`. The crab may join social activities, but builder interaction takes routing priority.
- Reuse generated activity models and animations after the first successful backend generation. Do not call the backend on every replay.
- Before planning or preparing an activity, query `ActivityRegistry`. Exact ready activities replay their registered plan/assets without AI planning; similar activities create a derived draft and reuse only compatible bindings; unmatched activities create a fresh draft. Promote a draft to ready only after a successful activity completion.
- The curated Original activity library currently registers campfire, apple picking, greeting practice, campfire party, mako birthday, and Spring Festival. Use `npm run audit:town-activities` to inspect it and `npm run prepare:town-activities` only when registered files are missing or intentionally refreshed.
- Town preparation tasks are short, visible player guidance while cached/backend activity assets become ready. They must not gate generation, duplicate the event state machine, or become a quest/economy system.

### Character Appearance And Props

- Approved character bases are identity-stable and empty-handed. Never refine an already dressed runtime result as the next outfit base.
- Resolve the entire clothing loadout from the approved base with one identity-preserving refine request, then cache the result by character, base revision, and loadout. Removing all clothing returns the base model.
- Use mount only for hand props and simple accessories whose attachment should remain a distinct part. Generate or reuse a matching presentation animation instead of encoding a pose into the model.
- Equipping a hand prop on the player uses the shared overhead-show presentation and camera close-up. Gameplay input must be restored even if generation, mounting, animation, or presentation fails.

### Objects, Lots, And Buildings

- Occupancy uses placement-grid cells; user-facing building dimensions use terrain tiles. Convert with the grid subdivision rather than treating the two units as equal.
- New buildings must choose their `N x M` lot before generation. Reserve and confirm a collision-free placement draft first, then ask for a concrete description and final confirmation, and only then call the backend.
- Building prompts must include the selected base width/depth ratio. Keep autonomous model prompts short, concrete, visual, and in Chinese.
- A generated building must keep its confirmed footprint, normalize into that footprint, register as an editable world object, and participate in collider lifecycle/debug rendering.
- Moving, rotating, or scaling an object must preserve its footprint center. Placement commits are atomic; cancel restores the previous transform and occupancy.
- Hard footprint cells prevent overlap. Semantic clearance cells are soft walking/interaction space. Generated placement should prefer clearance-safe cells, while existing curated layouts are audited rather than moved automatically.
- Refine keeps the target size profile. Mount keeps the primary object's scale. Style switching changes asset paths, never semantic world size.
- Curated trees, buildings, flowers, grass, crops, carrots, flower pots, tents, trophies, and the town campfire retain their approved authored scales. Measure them as generation references; do not normalize those existing scene instances to generic size-profile limits.
- Generated buildings obey confirmed footprints; pets obey resident-height profiles; generated trees and plants use concrete prompt proportions plus natural measured footprints. Furniture sizing remains provisional until representative island furniture is approved.
- Vegetation remains scene dressing and is not opened through the general object-management interaction unless explicitly requested.
- Bridges must expose a named, continuous walkable deck, reserve a crossing footprint, and participate in both player collision and pet pathfinding. Never treat a decorative bridge silhouette as sufficient.
- Terrain owns occupancy, shore shape, and navigation. `WorldWaterVisualPort` owns only water presentation; swapping the water renderer must not alter traversability or placement data.

### Async AI Work

- create/refine/mount use `AIWorldActionService` through the content port. Never route autonomous gameplay through Studio endpoints.
- Guard re-entry, release dialogue/input/camera locks, and restore valid pet state in `finally`.
- Work presentation may use scaffold, dust, VFX, and pet-specific animation, but presentation must not own gameplay state or API policy.

## 5. Asset Workflows

Keep these workflows separate.

### User-Controlled Studio Work

```text
User edits in Studio
→ explicit Studio save
→ $chii-assets
→ public/generated
→ Chii runtime
```

Do not reinterpret or regenerate the user's Studio work. The default sync source is the latest JSON saved by Studio; models without an edited save fall back to their original JSON. `3d-generate` tracked source follows its remote repository and must not carry Chii-specific API patches. Local `generated_models/.../edited/` content is the Studio state that must survive upstream resets; never use `git clean -fdx` as an update shortcut.

Curated residents such as the builder crab and their approved animations follow this workflow. Add them to the explicit Chii sync allowlist and `assetCatalog.js`; do not copy the entire Studio library into the island.

### Autonomous Gameplay Work

```text
Gameplay event
→ ContentGenerationPort / AIWorldActionService
→ backend API
→ scene result
→ generated repository as asset history
```

Use `$chii-ai`. Do not route autonomous gameplay through manual Studio editing.

Current autonomous model generation uses `provider: 'gpt'` with `mode: 'voxel'`. Generated model/animation JSON remains in the generated repository; scene saves reference those asset IDs and persist placement, transform, occupancy metadata, operation, and resident event data without duplicating full model JSON in localStorage. `chii-ai-world-state` is the live in-memory event list and is serialized only through the active scene save.

Current scene-production policy: update Original only by default. Pro and Voxel remain independent comparison scenes and receive no generated assets, clothing variants, or layout changes unless the user explicitly names them. Existing GPT 5.6 assets remain frozen in their owning scenes. Preserve semantic metadata and authored size roles when replacing model JSON.

Frozen legacy scene snapshots live under `public/generated/scenes/{pro,voxel,original}/`; Voxel remains archived. Forge lives under `public/generated/scenes/forge/worldforge/` and is published from WorldForge through `npm run publish:forge-scene -- --map-id=<id>`. Never edit a published Forge JSON by hand; change the WorldForge map or Chii bindings and republish.

Runtime save rules:

- Original, Pro, Forge, and archived Voxel Auto/Record data must remain isolated.
- World changes auto-save after registry metadata/add/remove events and flush before scene-style reload or page exit.
- Restore world objects before collider and placement-grid composition; restore summoned pets after region gameplay composition.
- Record captures the current world delta, resident event data, and scoped character appearances. Reset must suspend auto-save, copy the selected Record to Auto, restore appearances/events, and reload.
- Never persist `building_draft`, `interior`, `social_event`, or `persistenceMode: temporary` content.

Visual references belong under the owning demo's `art-references/` directory with a small manifest and provenance note. Runtime code may preview a player-selected local image, but must not upload it or send it to generation without an explicit confirmed workflow.

## 6. Module Rules

- `engine/`: reusable infrastructure only; no demo/backend imports.
- `ports/`: stable semantic interfaces.
- `integrations/`: endpoint/provider adaptation.
- `backend/`: HTTP and API transport; no scene or DOM work.
- `assets/`: runtime resolution and generated-result persistence.
- `gameplay/`: shared state/workflow without bootstrap code.
- `demos/chii-island/systems/`: Chii behavior and interaction.
- `demos/chii-island/presentation/`: camera and visual sequences.
- `demos/agentland-friends/`: standalone friends-collection prototype; do not couple its stage or story state into Chii systems.
- `world/`: registry, occupancy, and collider composition.
- `public/generated/`: runtime data, never casually clean or rewrite.

Terrain/entity placement must use current painting, assembler, registry, occupancy, and collider helpers. Avoid clipping and overlapping footprints.

## 7. Skill Index

Use one primary domain skill. Add a second skill only when the task crosses a real ownership boundary.

### Workbench

| Skill | Use |
|---|---|
| `$chii-dev` | Start, stop, restart, or inspect ports 5173/8000. |
| `$chii-status` | Summarize current branch, services, assets, and worktree. |
| `$chii-debug` | Evidence-first diagnosis across assets, state, input, physics, rendering. |
| `$chii-verify` | Run tests/build/browser WebGL verification. |
| `$chii-handoff` | Produce group-meeting or agent-handoff summaries. |

### AI And Assets

| Skill | Use |
|---|---|
| `$chii-prompts` | Compose and validate reusable prompts for every Chii backend operation. |
| `$chii-ai` | Generate/refine/mount/animate content through autonomous backend APIs. |
| `$chii-assets` | Sync/audit user-controlled Studio models and animations. |

### Product Implementation

| Skill | Use |
|---|---|
| `$chii-gameplay` | Own game rules and systems: pets, interactions, inventory, equipment, tasks, progression, social activities, building, and region slices. |
| `$chii-scene` | Own terrain, placement, vegetation, roads, footprints, occupancy, and static collision. |
| `$chii-ui` | Own HUD, panels, dialogue surfaces, bubbles, loading, responsive layout, accessibility, and input locks. |
| `$chii-story` | Own authored storyline, acts, dialogue performance, actor blocking, cinematic shots, transitions, and gameplay handoff. |
| `$chii-visuals` | Own technical-art adapters for material tags, water, sky, lighting, VFX, render styles, quality, and post-processing. |

Typical workflow:

```text
$chii-status
→ one primary domain skill
→ optional paired skill for a crossed boundary
→ minimal change
→ $chii-verify
→ $chii-handoff when needed
```

Common pairs:

- Gameplay system with a panel: `$chii-gameplay` + `$chii-ui`.
- Authored interactive sequence: `$chii-story` + `$chii-ui`; add `$chii-gameplay` only when persistent rules change.
- Generated gameplay content: `$chii-gameplay` + `$chii-prompts` + `$chii-ai`.
- New Studio-authored asset: `$chii-assets` + `$chii-scene`.
- New render-runtime capability: `$chii-visuals`; add `$chii-ai` only when request/schema behavior also changes.

## 8. First-Version Non-Goals

Do not implement unless explicitly requested:

- Full RTS economy, inventory, warehouse, crafting, or production chains.
- Combat, multiplayer, accounts, networking, or cloud saves.
- Infinite maps, multi-island expansion, or full animal ecology.
- Complex equipment stats, social graph, relationship formulas, or evolution systems.
- Additional bespoke or furnished building interiors, construction resources, upgrade trees, workers, production timers, or an economy around the builder crab.
- Large ECS rewrite, renderer/parser rewrite, or full old-editor restoration.
- Restoring the retired Ghost Home runtime.

## 9. Documentation And History

- `AGENTS.md`: short authoritative rules and routing only.
- `api-reference.md`: latest backend API reference; read only relevant endpoint sections through `$chii-ai`.
- `$chii-prompts`: authoritative prompt grammar and templates for pet/model generation, refine, mount, activity planning, animation, and footprint-constrained buildings.
- `README.md`: external overview and append-only changelog.
- `CLAUDE.md`: historical guidance only.
- Skill `references/`: detailed workflows loaded only when triggered.
- `.agents/CHII_SKILLS.md`: user-facing skill selection and combination guide.
- `artwork/` and demo `art-references/`: external/local design sources; do not delete or rewrite.

Historical plans, abandoned editor paths, and Ghost Home notes are context only. Ghost Home's old URL redirects to Agentland Friends. These notes must not override Sections 0-6 or be revived without an explicit user request.

Do not invent product formulas, thresholds, economy values, final prompt formats, or long-term UI decisions without user direction.
