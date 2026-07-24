# AGENTS.md

Long-term guidance for Codex in `agentworld-test`. Top sections are authoritative. This file records stable constraints and the implemented product baseline, not speculative plans or a changelog. Load detailed project knowledge through the smallest relevant `chii-*` skill.

## 0. Non-Negotiable Rules

- Preserve the running Three.js game and make small, incremental changes.
- Do not modify the render loop, camera, renderer, delta time, physics step, model parser, animation runtime, VoxelModel, JSON schema, scene graph, or asset pipeline unless the task targets that layer and evidence proves it necessary.
- Reuse current modules before creating abstractions. Keep feature logic out of `main.js`.
- Do not delete generated/user assets or revert dirty worktree changes unless explicitly requested.
- Do not modify sibling projects (`3d-generate`, `voxel-game`) unless explicitly authorized. Reading/running them is allowed.
- Remote services may only be used through public APIs. Never place API keys in browser code.
- Browser location may only be requested after an explicit player action. Use it only through the climate weather adapter; never persist coordinates or send them to AI, Studio, model generation, or analytics.
- Current Chii code must not import from `src/legacy/`.
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

Ghost Home is historical unless the user explicitly switches focus.

## 2. Current Baseline

Main URL:

```text
http://localhost:5173/src/demos/chii-island/
```

Services:

- Chii Island/Vite: port `5173`.
- Local Voxel Studio/`3d-generate`: port `8000`.
- Use `$chii-dev` to inspect/start/stop them safely.
- Do not assume either service is already running; check first.

Current island:

- 50x50 colored-tile terrain with river.
- Windmill pastoral, temple forest, and church town regions.
- Nailong player with movement, flight, idle/run/jump, H/J actions.
- Rapier physics, voxel runtime, animation plans, particles, dialogue, and runtime HUD.
- Unified current pet state machine.
- Runtime assets loaded locally from `public/generated/`.
- ESC can switch environment assets between Pro and Voxel styles; Voxel is the default. Player, pets, buildings, forest trophy, and forest tent stay on shared Pro assets.
- ESC can switch collision between important-part voxel AABBs (default) and the legacy whole-bounds strategy; both are owned by `ColliderRegistry`.
- ESC provides a bubble-style climate panel. Manual mode controls weather, hour (0-23), and month (1-12); realtime mode reads device date/time/timezone without permission and requests location only after the player clicks weather sync. Open-Meteo supplies weather and BigDataCloud supplies the city label through separate adapters. Weather uses a 30-minute browser cache and clear-weather fallback; the city label is session-only. Coordinates are rounded by the adapters and are never cached.
- Editable non-vegetation objects use grid occupancy and support move, rotate, scale, and delete. Editing uses a fixed north-up overhead camera: screen up is world `-Z`, screen right is world `+X`.

Implemented vertical slices:

- Pastoral: follow/free roam, create/refine/mount, work presentation, session-only result.
- Forest: companion-led pet summon, generated animations, introduction, camping; summoned pets are session-only.
- Town social: free roam/follow, contextual daily activities, hosted festivals, group gathering, generated/cached activity assets, animation, and VFX.
- Town building: talk to the builder crab, choose a terrain lot, place its footprint from overhead view, describe and confirm the building, then generate and construct it. Current prototype lot presets are `3x4`, `4x4`, and `5x5` terrain tiles.

World placements created during autonomous gameplay are session-only. Generated model/animation files may remain in generated asset history, but the placed object or summoned pet must not be restored after refresh unless persistence is explicitly requested.

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
src/legacy/        historical root/Ghost paths; forbidden to current Chii
public/generated/  local runtime model/animation JSON
```

Important ownership:

- `src/demos/chii-island/main.js`: dependency assembly and stable update/render order.
- `gameplay/createChiiRegionGameplay.js`: three-region gameplay composition.
- `world/ChiiSceneAssembler.js`: Chii entity placement.
- `systems/sceneLayout.js`: deterministic terrain and region plan.
- `systems/ChiiInteractionController.js`: interaction selection/routing.
- `systems/PetManager.js`: current pet loading and free-roam behavior.
- `systems/ObjectEditorController.js`: object management UI, fixed overhead editing camera, and building-footprint placement sessions.
- `systems/TownSocialSystem.js` and `TownSocialDirector.js`: town opportunities, activities, festivals, and their lifecycle.
- `systems/TownBuilderSystem.js`: builder-crab dialogue, lot selection, building generation, and construction lifecycle.
- `systems/AssetSemanticAudit.js`: read-only development report for model tags, animation operators, and renderer counters; exposed as `window.__chiiAssetAudit`.
- `presentation/TemporaryVfxService.js`: shared lifecycle and presets for temporary idea, work, dust, summon, and celebration effects.
- `systems/WorldClimateSystem.js`: single Chii climate state owner, manual/realtime mode, ESC binding, clock refresh, explicit weather-sync lifecycle, and fallback policy.
- `presentation/WorldClimatePresenter.js`: environment-only weather particles, time-of-day lighting/fog, sun movement, and month tint.
- `src/world/climate/WorldClimateState.js`: provider-neutral climate modes, weather vocabulary, normalization, and presentation projection.
- `src/ports/WeatherPort.js`, `src/ports/PlaceNamePort.js`, `src/integrations/climate/`, and `src/storage/ClimateCache.js`: weather/place contracts, browser clock/location, Open-Meteo weather, BigDataCloud city lookup, and location-free weather cache.
- `src/gameplay/pets/PetStateMachine.js`: single current pet-state owner.
- `src/gameplay/ai/`: semantic AI actions and work lifecycle.
- `src/world/placement/`: occupancy, snapping, footprint transactions, and object editing operations.
- `src/world/physics/ColliderRegistry.js`: collider strategy, registration, rebuild, and debug visualization.
- `src/integrations/content/VoxelContentAdapter.js`: provider/mode policy.
- `src/ports/ModelVisualPort.js` and `src/integrations/rendering/VoxelStudioModelVisualAdapter.js`: model-tag materials, fire/smoke companions, lightweight model water, and replacement/removal lifecycle.
- `src/ports/WorldClimateVisualPort.js` and `src/integrations/rendering/ChiiSkyVisualAdapter.js`: replaceable sky presentation driven by the existing climate state.
- `src/ports/RenderPresentationPort.js` and `src/integrations/rendering/VoxelStudioRenderPresentationAdapter.js`: current/cel styles, optional post-processing, quality tiers, and direct-render fallback.
- `src/demos/chii-island/data/assetCatalog.js`: local runtime asset catalog.

Architecture baseline completed 2026-07-13:

- Engine has no backend/demo imports.
- Runtime/backend/provider decisions are behind ports and adapters.
- Scene assembly and object lookup are outside `main.js`.
- create/refine/mount share one work lifecycle.
- Historical paths are isolated under `src/legacy/`.

### 3d-generate Capability Baseline

Last audited remote baseline: `de51c7d` on 2026-07-23. This is a compatibility baseline, not permission to import sibling source directly.

Current backend and Studio capabilities:

- Language-driven model generation, refine, add-part/mount, animation, and particle-enabled animation generation remain the core production APIs.
- Studio generation supports provider modes including Voxel, Voxel Pro, Curve, Wire, and a newly exposed Math mode. Do not assume Math behavior or quality until it is tested against the remote backend.
- Material Tags v2 lets AI annotate `nodes[].tags` with semantic material intent while the runtime owns shaders and particles. Implemented tags are `base` (`gold`, `silver`, `metal`, `glass`, `wood`, `stone`), `water` (`pool`, `fall`), `emissive`, `fire` (normal/blue/green), and `smoke` (normal/steam).
- `electric`, `poison`, `ice`, `wet`, `rust`, `mossy`, `dirty`, and `damage` are vocabulary/design entries, not completed Chii rendering features.
- The material system includes procedural triplanar wood/stone variants, model-local pools/waterfalls/water streams, deterministic fire/smoke particles, and global tuning through `/api/material-tag-textures`.
- `@voxel-studio/render-runtime` is a reusable Three.js package for material tags, effect packages, batching, render styles, quality tiers, and post-processing. Chii pins the audited `de51c7d` package and has verified its public material, Cel, and render-pipeline paths against Three.js r184 in real WebGL2; rerun `npm run test:render-compat` before updating that package.
- `SkySystem`, atmosphere, clouds, HDRI, environment reflection, and shared render presets exist, with `GET/POST /api/shared-render-preset` and a hash endpoint. Treat this as an available module set, not as an already integrated Chii feature.
- The backend also exposes editable model/animation persistence through `/api/load-edited`, `/api/save-edited`, `/api/animations`, and `/api/save-animation`. Chii asset sync uses these native upstream endpoints.

Current Chii integration boundary:

- Pulling `3d-generate` does not automatically change Chii visuals. Chii runs local JSON from `public/generated/` and does not import sibling runtime code.
- Chii preserves `nodes[].tags`, explicit `locked`, mesh bone endpoints, `_meta.mounts`, and known extension metadata through model parse/clone/serialize. Autonomous Voxel generate/refine requests send a compact read-only `material-tags-v1` prompt contract pinned to audited backend commit `de51c7d`.
- Chii runs the pinned Studio `MaterialTagRuntime` behind `ModelVisualPort`; tagged models remain unmerged so part semantics survive. Fire and smoke use runtime companions, while pool/fall water uses a lightweight Chii presenter behind the same adapter. This is not full Studio parity: Studio `ModelWaterInstances`, texture-tuning presets, and batching are not integrated.
- Model visual lifecycle follows world-object registration and model replacement. Create/refine/mount/remove paths must attach, detach, or reattach through the visual adapter instead of managing tag effects inside gameplay code.
- Time and weather drive a replaceable Chii sky through `WorldClimateVisualPort`. Full Studio clouds, HDRI, environment reflections, and shared render presets remain unintegrated.
- Current/Cel styles, optional subtle post-processing, and low/medium/high/ultra quality tiers run through `RenderPresentationPort`. Current style, high quality, and post-processing off are the defaults; direct renderer fallback must remain available.
- Historical `tilt` animation tracks normalize to `pointTo`. The bundled fallback runtime mirrors current backend `dash`, `slash`, `lockWorldRot`, and `launch.decel` behavior and reports its source/version/templates at startup.
- Autonomous Voxel generation sends exactly `provider: gpt`, `model: gpt-5.6-sol-high`, and `mode: voxel`. Generate/refine/mount/animation do not silently cross-fallback to another provider; backend errors retain structured diagnostics.
- Keep Chii `entity.tags` (gameplay semantics such as flower/farm/church) separate from `model.nodes[].tags` (part-level render semantics such as wood/fire/water). Never merge the two namespaces.
- Preserve and contract-test tags end to end, and adopt only implemented tags behind engine/integration boundaries. Do not replace the renderer or parser wholesale.
- Mass environment content should use deterministic vocabulary-driven material effects and batching. Unique pets, equipment, mounts, and festival props may use standalone effect packages. This division matches Chii's many environment objects and small set of detailed residents.
- Further water, sky, and shared-render-preset parity must remain separate scoped milestones. Do not bundle them into ordinary gameplay changes.

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

### Objects, Lots, And Buildings

- Occupancy uses placement-grid cells; user-facing building dimensions use terrain tiles. Convert with the grid subdivision rather than treating the two units as equal.
- New buildings must choose their `N x M` lot before generation. Reserve and confirm a collision-free placement draft first, then ask for a concrete description and final confirmation, and only then call the backend.
- Building prompts must include the selected base width/depth ratio. Keep autonomous model prompts short, concrete, visual, and in Chinese.
- A generated building must keep its confirmed footprint, normalize into that footprint, register as an editable world object, and participate in collider lifecycle/debug rendering.
- Moving, rotating, or scaling an object must preserve its footprint center. Placement commits are atomic; cancel restores the previous transform and occupancy.
- Vegetation remains scene dressing and is not opened through the general object-management interaction unless explicitly requested.

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

Current autonomous model generation uses `provider: 'gpt'` with `mode: 'voxel'`. AI-created scene objects and summoned pets must not restore after refresh; `chii-ai-world-state` is memory-only and old browser snapshots are cleared.

Curated Voxel environment variants live under `public/generated/styles/voxel/`. The style selector changes catalog paths only; do not duplicate scene layout, gameplay, characters, or buildings per style.

## 6. Module Rules

- `engine/`: reusable infrastructure only; no demo/backend imports.
- `ports/`: stable semantic interfaces.
- `integrations/`: endpoint/provider adaptation.
- `backend/`: HTTP and API transport; no scene or DOM work.
- `assets/`: runtime resolution and generated-result persistence.
- `gameplay/`: shared state/workflow without bootstrap code.
- `demos/chii-island/systems/`: Chii behavior and interaction.
- `demos/chii-island/presentation/`: camera and visual sequences.
- `world/`: registry, occupancy, and collider composition.
- `public/generated/`: runtime data, never casually clean or rewrite.

Terrain/entity placement must use current painting, assembler, registry, occupancy, and collider helpers. Avoid clipping and overlapping footprints.

## 7. Skill Index

Use the smallest relevant skill:

| Skill | Use |
|---|---|
| `$chii-dev` | Start, stop, restart, or inspect ports 5173/8000. |
| `$chii-assets` | Sync/audit Studio runtime models and animations. |
| `$chii-status` | Summarize current branch, services, assets, and worktree. |
| `$chii-verify` | Run tests/build/browser WebGL verification. |
| `$chii-ai` | Generate/refine/mount/animate content through backend APIs. |
| `$chii-debug` | Evidence-first diagnosis across assets, state, input, physics, rendering. |
| `$chii-gameplay` | Implement a scoped pet/region gameplay slice. |
| `$chii-scene` | Modify terrain, placement, vegetation, occupancy, and collision. |
| `$chii-handoff` | Produce group-meeting or agent-handoff summaries. |

Typical workflow:

```text
$chii-status
→ one domain skill
→ minimal change
→ $chii-verify
→ $chii-handoff when needed
```

## 8. First-Version Non-Goals

Do not implement unless explicitly requested:

- Full RTS economy, inventory, warehouse, crafting, or production chains.
- Combat, multiplayer, accounts, networking, or cloud saves.
- Infinite maps, multi-island expansion, or full animal ecology.
- Complex equipment stats, social graph, relationship formulas, or evolution systems.
- Building interiors, construction resources, upgrade trees, workers, production timers, or an economy around the builder crab.
- Large ECS rewrite, renderer/parser rewrite, or full old-editor restoration.
- Ghost Home feature work during Chii tasks.

## 9. Documentation And History

- `AGENTS.md`: short authoritative rules and routing only.
- `api-reference.md`: backend API reference; read only relevant sections through `$chii-ai`.
- `readme.md`: external overview and append-only changelog.
- `CLAUDE.md`: historical guidance only.
- Skill `references/`: detailed workflows loaded only when triggered.
- `artwork/`: external design source; do not delete or rewrite.

Historical plans, abandoned editor paths, and Ghost Home notes are context only. They must not override Sections 0-6 or be revived without an explicit user request.

Do not invent product formulas, thresholds, economy values, final prompt formats, or long-term UI decisions without user direction.
