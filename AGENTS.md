# AGENTS.md

This file is the long-term guidance for Codex when working in `agentworld-test`.

Read order matters. The top sections are authoritative for current development. Historical sections are reference only and must not override the current Chii Island direction.

---

## 0. Highest Priority Rules

### Current Mode Defaults

You are a coding agent optimized for real-time 3D game development using Three.js.

Primary goal:

- Preserve the running game.
- Make minimal, safe, incremental changes.
- Never destabilize the render loop.
- Prefer current architecture over rewrites.

### Work Modes

**CODE MODE**

- Implement only the requested feature.
- Use small patches.
- Reuse the existing architecture.
- Do not rewrite full files unless the user explicitly asks for a document refactor or full replacement.

**DEBUG MODE**

- Identify root cause briefly.
- Fix with the smallest safe change.
- Do not refactor unrelated systems.
- Do not restructure the render pipeline unless the bug is proven there.

**ARCH MODE**

- Used for system design and project planning.
- Be concise, practical, and game-dev oriented.
- Prefer incremental architecture changes over full rewrites.

### Non-Negotiable Engineering Rules

1. Do not modify the core loop unless necessary: `requestAnimationFrame`, `renderer.render()`, scene/camera initialization.
2. Do not modify camera, renderer, delta time, physics stepping, model parser, or animation runtime unless the task is specifically about them or data proves the fault is there.
3. Do not replace the entity model, scene graph, physics engine, renderer, VoxelModel, JSON schema, or asset pipeline as a side effect of a feature task.
4. Prefer local patches: one function, one class, or one system at a time.
5. If unsure, choose the smallest safe change that keeps Chii Island running.
6. Do not delete user or generated assets unless explicitly requested.
7. Do not revert existing dirty worktree changes unless explicitly requested.
8. Do not modify sibling projects such as `3d-generate` or `voxel-game` unless the user explicitly authorizes code changes there. Reading and running them for integration diagnosis is allowed.
9. Remote/cloud backend services must only be used through their public API. Do not attempt to modify deployed services.

### Output Style

- Keep responses minimal and actionable by default.
- For code tasks, summarize what changed and how it was verified.
- For reviews, list bugs/risks first with file references.
- For architecture tasks, clearly separate current decisions from historical context.

---

## 1. Current Project Direction

Chii Island is currently an **AI-native 3D pet home prototype**, not a full RTS/management game.

Core thesis:

```text
环境塑造宠物
宠物塑造环境
```

Current prototype goals:

- Validate language-driven voxel model creation inside a playable Three.js world.
- Validate AI model refine, generated animation/VFX, and add-part/mount as gameplay actions.
- Make pets feel like concrete, memorable residents, not generic NPCs.
- Let player actions, pet actions, object placement, and environment tags influence each other.

NPC layering:

- **Pets / core characters**: small number, concrete, named, polished. Current names include `momo`, `mako`, `yafo`, `lingq`, `fangk`, `mok`.
- **Animal communities**: future ecology layer. Do not implement in the first version unless explicitly requested.

Current priority is Chii Island. Ghost Home is historical/conceptual unless the user explicitly switches tasks to it.

---

## 2. Current Running State

### Main Demo URL

```text
http://localhost:5173/src/demos/chii-island/
```

### Commands

```bash
npm run dev
npm run build
npm run preview
```

Development usually also needs the local Voxel Studio / `3d-generate` server on port `8000`.

### Current Chii Island State

The current local project has moved beyond the older 20x20 single-forest prototype. Treat the current Chii Island as a 50x50 island scene with three intended regions:

- Windmill pastoral area.
- Temple forest area.
- Church town area.

Current implemented state:

- `src/demos/chii-island/main.js` is the main Chii Island orchestration entry.
- Terrain is generated as plain colored box tiles through `src/engine/world/terrain.js`.
- Scene layout is assisted by `src/demos/chii-island/systems/sceneLayout.js`.
- The island includes river, grass, dirt paths, rock/building bases, windmill, church, temple, trees, flowers/grass clusters, and denser boundary vegetation.
- Player is Nailong from `public/generated/models/nailong.json`.
- Player animations include idle/run/jump/wave/fan-style actions. Space is flight mode; H and J trigger specific animations/effects.
- Current pet/character roster:
  - `momo`: bear.
  - `mako`: horse.
  - `yafo`: sky-blue bird.
  - `lingq`: peacock.
  - `fangk`: architect.
  - `mok`: axe-wielding crocodile.
- `src/demos/chii-island/systems/PetManager.js` loads and manages newer pets, random idle/run/jump switching, chat, and follow.
- `src/demos/chii-island/systems/ArchitectNPC.js` and `ConstructionEffect.js` handle architect/bear construction-style interactions and building refine validation.
- The older right-side editor code still exists in `src/demos/chii-island/systems/generateSystem.js`, but the current Chii main flow hides it. Do not restore the full old editor unless the task asks for it.

### Important Current Inconsistencies

These are known architectural mismatches. Do not silently “fix” them unless the task targets them.

- Some Chii code still reads Studio legacy original JSON through `/studio/api/model/{commit}/{folder}`.
- The intended runtime truth is edited/published runtime JSON, synced into `public/generated/`.
- `Pet.js` contains an older, richer pet state machine. Current Chii main flow mostly uses `PetManager`, `ArchitectNPC`, and `ConstructionEffect`.
- `generateSystem.js` contains useful old editor features but does not represent the latest pet-task-first gameplay direction.
- Terrain currently uses pure colored tiles for speed and clarity. Do not replace it with voxel tile models unless asked.

---

## 3. Current Architecture Map

### High-Level Layers

```text
src/backend/       API wrappers and AI/studio integration
src/storage/       cache, registry, scene snapshot, lightweight global state
src/engine/        reusable Three.js/game systems
src/demos/         demo-specific gameplay composition
public/generated/  local runtime model/animation assets
.agents/skills/    Codex project skills
```

### Engine Layer

- `engine/core/`: scene, camera, renderer, lights, sky/visual infrastructure.
- `engine/input/`: keyboard/pointer-lock/input state. Input should stay mostly data-oriented.
- `engine/physics/`: Rapier integration and collision helpers.
- `engine/world/terrain.js`: tile/grid terrain creation and painting.
- `engine/model/`: voxel JSON loading/building/fallback geometry.
- `engine/animation/`: animation plan loading, playback, particles/VFX helpers.
- `engine/entity/`: base entities such as `Player`, `Pet`, `StaticEntity`, `Environment`, `Item`.
- `engine/interaction/`: raycast, hints, interaction routing.
- `engine/ui/`: canvas sprite labels, speech bubbles, pet dialogue UI.

### Chii Demo Layer

- `demos/chii-island/main.js`: current scene assembly and update orchestration.
- `demos/chii-island/systems/sceneLayout.js`: procedural layout for terrain/roads/building zones/vegetation.
- `demos/chii-island/systems/PetManager.js`: current newer pet manager.
- `demos/chii-island/systems/ArchitectNPC.js`: architect-style NPC behavior.
- `demos/chii-island/systems/ConstructionEffect.js`: construction/refine visual and behavior validation.
- `demos/chii-island/systems/DialogueSystem.js`: local dialogue interaction support.
- `demos/chii-island/systems/generateSystem.js`: older right-side model editor; currently reference/optional.
- `demos/chii-island/data/studioLibrary.js`: old Studio bridge. Be careful: it currently points at legacy Studio endpoints.
- `demos/chii-island/data/generatedLibrary.js`: local generated model/animation library and localStorage fallback.

### Storage / Persistence

- `src/storage/assetCache.js`: model/animation JSON cache.
- `src/storage/entityRegistry.js`: entity lookup.
- `src/storage/gameState.js`: lightweight global store.
- `src/storage/sceneSnapshot.js`: local scene snapshot persistence.
- Browser `localStorage` is used as a fallback for generated library and scene state.

---

## 4. Asset Pipeline and Studio Integration

### Current Source of Truth

The intended asset lifecycle is:

```text
AI generation
↓
Original JSON          # generation history, read-only reference
↓
Studio edit
↓
Edited JSON            # editable working asset
↓
Publish
↓
Runtime JSON           # only runtime truth
↓
Chii local sync
↓
public/generated/
↓
Three.js scene
```

Rules:

- Original JSON is history. It should not be the normal game runtime input.
- Edited JSON is for Studio editing.
- Runtime JSON is for games.
- Chii should read its local synced runtime copy in `public/generated/`.
- Do not create more ad hoc asset entry points.

### 3d-generate / Studio Current API Understanding

Local Studio is the sibling project `../3d-generate`, normally served on port `8000`.

Important current/modern endpoints:

- `GET /api/assets/{assetId}/edit`: load editable asset.
- `POST /api/assets/{assetId}/edit`: save editable asset.
- `POST /api/assets/{assetId}/publish`: publish edited asset to runtime.
- `GET /api/assets/{assetId}/runtime`: load runtime asset.
- `GET /api/assets/{assetId}/history`: inspect asset history/manifest.

Legacy endpoints still exist:

- `GET /api/models`: list legacy `generated_models`.
- `GET /api/model/{commit}/{folder}`: legacy original model.
- `GET /api/load-edited/{commit}/{folder}`: legacy edited model.
- `GET /api/animations/{commit}/{folder}`: legacy animation list.

Use legacy endpoints only for compatibility, migration, or diagnosis.

### Chii Local Runtime Assets

Chii runtime assets live under:

```text
public/generated/models/
public/generated/animations/
public/generated/chii-runtime-manifest.json
```

The project has a dedicated Codex skill:

```text
$sync-studio-assets
```

Use it when the user asks to refresh Chii Island assets from Studio. It syncs only Chii-used models/animations, not the entire Studio library.

### Local Generated Library

The Vite dev plugin in `vite.config.js` exposes local library endpoints:

- `POST /api/local-library/save-model`
- `POST /api/local-library/save-animation`
- `GET /api/local-library/list`

These write to `public/generated/` and update the generated library manifest. This is separate from the Studio runtime sync pipeline.

### Model Rendering Diagnosis Rule

Past investigations showed many “Studio correct, Three wrong” cases were caused by loading different JSON, not by the renderer.

Before modifying renderer/model parser:

1. Compare exact JSON inputs.
2. Compare `VoxelModel.fromJSON` output.
3. Compare after mirror/optimize steps.
4. Compare renderer input.
5. Only then inspect mesh output.

---

## 5. Backend AI Capabilities and Gameplay Mapping

### 1. Generate Model

Creates a new object identity from language.

Use for:

- New pet.
- Pet egg.
- Building.
- Decoration.
- Farm item.
- Activity prop.
- Environment node.

Gameplay mapping:

- Forest tag combinations generate pet eggs or visitors.
- Pet tasks generate home objects.
- Town activities generate temporary props.

### 2. Refine Model

Modifies the whole model while preserving identity.

Use for:

- Repairing a building.
- Evolving a pet form.
- Changing a tree/shrine/object style.
- Applying environment-driven transformation.

Do not use refine for “put a tool in hand” or “hang a sign on a building”; that is add part.

### 3. Generate Animation / VFX

Generates motion plans and effects for behavior expression.

Use for:

- Idle/run/jump/action loops.
- Farming, building, repairing, performing.
- Pet social vignettes.
- Magic, construction, fan, summon, hatch, festival effects.

### 4. Add Part / Mount

Adds a local part while preserving the original model identity.

Use for:

- Clothing, hats, toys, tools, decorations.
- Pet holding an axe/hammer/seed bag/instrument/fan.
- Building banners, bells, signs, lights.
- Ground/environment inserted markers.

Valid placement concepts:

- Hand.
- Head.
- Back.
- Building surface.
- Decoration surface.
- Ground/environment node.

Studio implementation reference:

- `../3d-generate/js/api-client.js`: `APIClient.mountModel(primary, secondary, description)` calls `/api/mount`.
- `../3d-generate/js/editor/Editor.js`: `_onMount()` handles Studio add-part flow.
- Mount results are recorded in model JSON metadata such as `_meta.mounts`.

Chii implementation rule:

- First Chii add-part slice should be a pet-task/player-command result, not a large UI/equipment system.
- Reuse Studio mount schema. Do not invent a separate Chii-only mount format.

---

## 6. Three Current Environments

These are three regions of one island, not three separate games.

### Windmill Pastoral

Purpose:

- Validate building a farm/home with pets.
- Validate pet-assisted construction, placement, repair, and farm object generation.
- Use generate/refine/add part on buildings, decorations, and farm objects.

Core interaction chain:

```text
pet proposes home task
↓
player accepts/selects target
↓
pet moves and plays work animation
↓
generate/refine/add part runs
↓
object/building updates in scene
↓
pastoral tags update
↓
pet feedback unlocks next small task
```

Example first slices:

- `fangk` asks to build a farm sign near the windmill.
- `mako` gets a seed bag mounted on its back.
- `momo` repairs a shed through refine.

### Temple Forest

Purpose:

- Validate environment tag combinations.
- Validate pets and placed objects influencing environment state.
- Validate environment-driven new pet/pet egg generation.

Core interaction chain:

```text
player brings pets into forest
↓
pets interact/place objects/repair shrine node
↓
forest tags update
↓
tag combination threshold is reached
↓
AI generates pet egg or visitor pet
↓
hatching/summon animation and VFX play
↓
new pet enters candidate resident or visitor state
```

Example first slices:

- `glow grass + bird + temple` triggers a glowing egg.
- `oak + peacock + flowers` attracts a forest visitor.
- Add runes/bells to the temple with add part instead of refining the whole temple.

### Church Town

Purpose:

- Validate pet social behavior, group events, relationship tags, animation, and VFX.
- Use town objects as social triggers: benches, lamps, square, notice board, church bell.

Core interaction chain:

```text
player starts/approaches activity
↓
system selects pets and trigger point
↓
pets gather
↓
dialogue/animation/VFX plays
↓
relationship tags update
↓
town tag/object state receives result
```

Example first slices:

- Plaza dance event with multiple pets.
- Notice board task where pets gather and react.
- Church bell gets festival ribbons via add part.

---

## 7. Current Vertical Slice

Do not build a full management game first. The next useful vertical slice is:

```text
player enters 50x50 island
↓
three regions are recognizable
↓
each region has one pet-involved event
↓
each event triggers one AI capability
↓
result appears in scene
↓
result can be restored or resynced
```

Minimum event targets:

- Pastoral: pet helps build/repair/place one farm object.
- Forest: tag combination triggers a pet egg or visitor.
- Town: multi-pet activity triggers animation/VFX and relationship feedback.
- Add part: one clear case, such as `mako` carrying a seed bag or `fangk` holding a hammer.

---

## 8. Implementation Priorities

### P0. Asset Truth and Sync Discipline

- Chii runtime should use synced runtime JSON, not legacy original JSON.
- Keep `$sync-studio-assets` as the normal refresh operation.
- Maintain a clear allowlist of Chii-used assets.
- Do not touch Renderer, VoxelModel, or JSON schema for asset mismatch bugs until input JSON is proven identical.

### P1. One Minimal AI Gameplay Entry

- Prefer a pet task or player command over restoring the full old right editor.
- Implement one capability, one region, one visible result.
- Keep async calls guarded against re-entry.

### P2. Three-Region Tag State

- Add lightweight tag state for pastoral/forest/town.
- Explain why an event triggers from tag state.
- Do not build full card UI yet.

### P3. Pet Task and Relationship Loop

- Pets propose simple tasks.
- Player accepts.
- Pet moves, animates, triggers AI result, gives feedback.
- Town can record minimal relationship tags.

### P4. Add Part / Mount Landing

- Reuse `/api/mount` and Studio `_meta.mounts`.
- Support a small placement set first: hand, head, back, building.
- Do not build a full equipment/inventory/stat system.

### P5. Persistence and Replay

- Store enough metadata to restore or resync visible AI results.
- Track prompt, target entity, original assetId, result assetId, and timestamp when practical.
- Prefer refresh-stable prototype behavior over a complex save system.

---

## 9. First Version Non-Goals

Do not implement these unless the user explicitly asks:

- Full RTS resource economy.
- Full inventory, warehouse, crafting, production chains.
- Combat.
- Infinite map or multi-island expansion.
- Full animal community ecology.
- Complex equipment stats.
- Multiplayer, networking, account system, cloud save.
- Full Ghost Home feature work.
- Large ECS rewrite.
- Renderer/model parser rewrite.
- Full restoration of every old editor feature.
- Polished final UI/UX for all future systems.

---

## 10. File and Module Rules

### Current File Architecture

```text
agentworld-test/
├── index.html
├── package.json
├── artwork/
├── public/
│   └── generated/
│       ├── models/
│       ├── animations/
│       └── chii-runtime-manifest.json
└── src/
    ├── backend/
    ├── storage/
    ├── engine/
    │   ├── core/
    │   ├── input/
    │   ├── physics/
    │   ├── world/
    │   ├── model/
    │   ├── animation/
    │   ├── entity/
    │   ├── interaction/
    │   └── ui/
    └── demos/
        ├── chii-island/
        └── ghost-home/
```

### Module Responsibilities

- `main.js` files should remain startup/orchestration, not broad business logic dumps. Current Chii `main.js` is already heavy; add new substantial behavior to systems when possible.
- `core/` is Three.js infrastructure.
- `input/` should be input state and controls, with minimal gameplay logic.
- `physics/` owns Rapier integration and colliders.
- `entity/` classes own mesh/data/update behavior and expose `.mesh`.
- `interaction/` routes hit detection and player interaction; use flags for async AI calls.
- `backend/` wraps API calls and prompt/API integration; it should not operate DOM or scene objects.
- `ui/` owns DOM/canvas sprite UI.
- `public/generated/` holds runtime model/animation JSON used by the local game.
- `artwork/` is external art/design input. Do not delete or rewrite art source files.

### Async AI Pattern

Use a re-entry guard:

```js
let generating = false;

function trigger() {
  if (generating) return;
  generating = true;
  aiCall()
    .then(result => {
      // handle result
    })
    .catch(err => {
      // handle error
    })
    .finally(() => {
      generating = false;
    });
}
```

### Terrain and Placement Rules

- Unit/tile color should be managed through terrain painting helpers such as `paintUnitArea()` where that path exists.
- Static entity placement should use existing placement helpers when present, so mesh addition, occupancy, and tile color stay in sync.
- Do not place trees/buildings inside building footprints.
- Avoid overlapping or clipping placed entities.

---

## 11. Key Files

### Current Chii Runtime

| File | Why it matters |
|------|----------------|
| `src/demos/chii-island/main.js` | Current Chii scene orchestration and update loop composition. |
| `src/demos/chii-island/systems/sceneLayout.js` | Current 50x50 island layout generation. |
| `src/demos/chii-island/systems/PetManager.js` | Current newer pet loading, random behavior, chat/follow. |
| `src/demos/chii-island/systems/ArchitectNPC.js` | Architect/NPC interaction behavior. |
| `src/demos/chii-island/systems/ConstructionEffect.js` | Construction/refine validation. |
| `src/demos/chii-island/systems/DialogueSystem.js` | Dialogue UI/control support. |
| `src/demos/chii-island/systems/generateSystem.js` | Older right editor. Reference only unless explicitly re-enabled. |
| `src/demos/chii-island/data/studioLibrary.js` | Studio bridge; currently legacy endpoint based. |
| `src/demos/chii-island/data/generatedLibrary.js` | Local generated model/animation persistence. |

### Engine and Storage

| File | Why it matters |
|------|----------------|
| `src/engine/model/builder.js` | Voxel JSON to Three model build path. Avoid changing unless proven necessary. |
| `src/engine/model/loader.js` | Model JSON loading/cache/build entry. |
| `src/engine/animation/player.js` | Animation application. Avoid changing for asset mismatch bugs. |
| `src/engine/animation/particles.js` | VFX/particle helpers. |
| `src/engine/world/terrain.js` | Tile terrain and tile painting. |
| `src/engine/entity/Player.js` | Player model/movement integration. |
| `src/engine/entity/Pet.js` | Older rich pet entity. Useful reference, not always current main flow. |
| `src/engine/entity/StaticEntity.js` | Static objects/buildings/trees. |
| `src/engine/interaction/interact.js` | Older interaction routing. Check whether current Chii main uses it before editing. |
| `src/storage/sceneSnapshot.js` | Scene persistence. |
| `src/backend/voxelApi.js` | Generate/refine/animation API wrapper. |

### Project Skills

| Skill | Use |
|------|-----|
| `$dev` | Start local development services for Chii Island / Studio. |
| `$sync-studio-assets` | Sync Chii-used Studio models and animations into local runtime assets. |

---

## 12. Known Risks and Open Issues

- Asset source mismatch remains the main risk: legacy original vs edited/runtime.
- Current Chii main flow and older `Pet.js`/`generateSystem.js` flows overlap conceptually but are not one clean system.
- Some current model/animation behavior depends on local Studio availability and synced JSON freshness.
- Voxel Runtime may be unavailable; animation fallback is simpler and less accurate.
- High mesh counts can cause rendering pressure; optimize only after profiling or visible performance issues.
- Scene persistence needs to be checked whenever AI-generated or mounted assets are applied.
- Existing worktree may contain many user/generated changes. Do not clean it without explicit instruction.

---

## 13. Historical Background, Low Priority

This section preserves context but does not override current Chii Island direction.

### Older Chii Island Concept

Earlier Chii Island was described as a 3D simulation/RTS management prototype: build a place, attract life, care for pets, send them to work/battle/socialize, and expand the island.

This remains useful long-term flavor, but current development is narrower:

- AI-native pet home.
- Three focused regions.
- Pet-involved AI actions.
- Runtime asset pipeline validation.

### Older 2026-06-30 State

Older documentation described:

- A 20x20 single central forest environment.
- Nezha player model.
- G placeholder placement.
- X clear decoration.
- Right-side model editor as a primary workflow.
- Pet houses and summon/recall loops.
- H/J/R multi-pet follow/refine controls.
- Local scene snapshot persistence.

Treat this as historical reference. Use only after confirming the current code path still uses the relevant files.

### Ghost Home

Ghost Home is a second demo concept:

- Two-player/party game.
- Friendly ghost improves a manor.
- Mischief ghost makes it haunted.
- NPC residents react to comfort/fear.

Current Chii Island tasks should not implement Ghost Home features unless the user explicitly switches focus.

### Long-Term Chii Ideas

These are future directions, not first-version requirements:

- Pet evolution.
- Environment card/tag UI.
- Pet work/ability systems.
- Building management.
- Crafting/resources.
- Exploration/unlocking.
- Combat.
- Social graph.
- Codex/collection systems.

---

## 14. Documentation Rules

- `AGENTS.md` is the primary guidance file for Codex.
- New project decisions, constraints, and system boundaries should be added here.
- Large specialized references may live in separate files, but this file must link or summarize their role.

Reference docs:

| File | Purpose |
|------|---------|
| `readme.md` | External-facing project overview and changelog. |
| `CLAUDE.md` | Historical Claude guidance. Reference only after checking against this file. |
| `api-reference.md` | Voxel Studio API reference. |
| `image.md` | Excalidraw/design diagram reference if present. |
| `artwork/` | External art/design source material. |

`readme.md` rule:

- The project overview section may be updated.
- Existing changelog entries should be append-only.

---

## 15. Decisions Not Yet Authorized

Do not invent final answers for these without user/product direction:

- Exact tag scoring formulas.
- Pet evolution thresholds.
- Environment combination thresholds.
- Pet work balance and rewards.
- UI layout for long-term systems.
- Prompt formats for final production generation.
- Resource economy values.
- Combat formulas.
- Social relationship weight formulas.
- Crafting/building recipe lists.
- Evolution branch mapping.
