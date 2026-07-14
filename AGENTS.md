# AGENTS.md

Long-term guidance for Codex in `agentworld-test`. Top sections are authoritative. Load detailed project knowledge through the `chii-*` skills only when relevant.

## 0. Non-Negotiable Rules

- Preserve the running Three.js game and make small, incremental changes.
- Do not modify the render loop, camera, renderer, delta time, physics step, model parser, animation runtime, VoxelModel, JSON schema, scene graph, or asset pipeline unless the task targets that layer and evidence proves it necessary.
- Reuse current modules before creating abstractions. Keep feature logic out of `main.js`.
- Do not delete generated/user assets or revert dirty worktree changes unless explicitly requested.
- Do not modify sibling projects (`3d-generate`, `voxel-game`) unless explicitly authorized. Reading/running them is allowed.
- Remote services may only be used through public APIs. Never place API keys in browser code.
- Current Chii code must not import from `src/legacy/`.
- For model mismatch bugs, compare exact JSON inputs before inspecting renderer code.
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

Current core characters: `momo`, `mako`, `yafo`, `lingq`, `fangk/fangke`, `mok`. Animal communities are a future layer.

Ghost Home is historical unless the user explicitly switches focus.

## 2. Running State

Main URL:

```text
http://localhost:5173/src/demos/chii-island/
```

Services:

- Chii Island/Vite: port `5173`.
- Local Voxel Studio/`3d-generate`: port `8000`.
- Use `$chii-dev` to inspect/start/stop them safely.

Current island:

- 50x50 colored-tile terrain with river.
- Windmill pastoral, temple forest, and church town regions.
- Nailong player with movement, flight, idle/run/jump, H/J actions.
- Rapier physics, voxel runtime, animation plans, particles, dialogue, and runtime HUD.
- Unified current pet state machine.
- Runtime assets loaded locally from `public/generated/`.
- ESC can switch environment assets between Pro and Voxel styles; Voxel is the default. Player, pets, buildings, forest trophy, and forest tent stay on shared Pro assets.

Implemented vertical slices:

- Pastoral: follow/free roam, create/refine/mount, work presentation, session-only result.
- Forest: companion-led pet summon, generated animations, introduction, camping; summoned pets are session-only.
- Town: free roam/follow, group gathering, dance party, VFX.

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
- `src/gameplay/pets/PetStateMachine.js`: single current pet-state owner.
- `src/gameplay/ai/`: semantic AI actions and work lifecycle.
- `src/integrations/content/VoxelContentAdapter.js`: provider/mode policy.
- `src/demos/chii-island/data/assetCatalog.js`: local runtime asset catalog.

Architecture baseline completed 2026-07-13:

- Engine has no backend/demo imports.
- Runtime/backend/provider decisions are behind ports and adapters.
- Scene assembly and object lookup are outside `main.js`.
- create/refine/mount share one work lifecycle.
- Historical paths are isolated under `src/legacy/`.

## 4. Asset Workflows

Keep these workflows separate.

### User-Controlled Studio Work

```text
User edits in Studio
→ explicit save/publish
→ $chii-assets
→ public/generated
→ Chii runtime
```

Do not reinterpret or regenerate the user's Studio work. Runtime JSON is the default source. Edit/original sources require explicit diagnostic intent.

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

## 5. Module Rules

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

Async AI work must guard re-entry and clean up pet state/presentation in `finally`.

Terrain/entity placement must use current painting, assembler, registry, occupancy, and collider helpers. Avoid clipping and overlapping footprints.

## 6. Skill Index

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

## 7. First-Version Non-Goals

Do not implement unless explicitly requested:

- Full RTS economy, inventory, warehouse, crafting, or production chains.
- Combat, multiplayer, accounts, networking, or cloud saves.
- Infinite maps, multi-island expansion, or full animal ecology.
- Complex equipment stats, social graph, relationship formulas, or evolution systems.
- Large ECS rewrite, renderer/parser rewrite, or full old-editor restoration.
- Ghost Home feature work during Chii tasks.

## 8. Documentation

- `AGENTS.md`: short authoritative rules and routing only.
- `api-reference.md`: backend API reference; read only relevant sections through `$chii-ai`.
- `readme.md`: external overview and append-only changelog.
- `CLAUDE.md`: historical guidance only.
- Skill `references/`: detailed workflows loaded only when triggered.
- `artwork/`: external design source; do not delete or rewrite.

Do not invent product formulas, thresholds, economy values, final prompt formats, or long-term UI decisions without user direction.
