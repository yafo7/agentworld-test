# Gameplay System Ownership

## Current Systems

| Concern | Authoritative owner | Presentation or adapter |
|---|---|---|
| Pet state and resume policy | `src/gameplay/pets/PetStateMachine.js` | pet entity animation and bubbles |
| Player/pet/world interaction routing | `ChiiInteractionController` | context prompt |
| AI create/refine/mount work | `AIWorldActionService` and `PetWorkCoordinator` | construction and temporary VFX |
| Inventory open/equip flow | `InventorySystem` | `InventoryPanel` |
| Clothing and hand props | `CharacterEquipmentService` plus appearance store/cache | showcase and character page |
| Town activity rules | `TownSocialSystem`, planner, coordinator, reservations | `RuntimeHUD` and cue presenter |
| Town opportunities | `TownSocialDirector` and social memory | pet idea bubble |
| Building lots and generation | `TownBuilderSystem` plus placement services | object placement UI |
| Forest summon/camping | `ForestTempleSystem` | dialogue, trophy/tent effects |
| Building entry and room state | `BuildingInteriorSystem` | room assembler and camera handoff |
| Climate state | `WorldClimateSystem` / `WorldClimateState` | climate presenter and ESC controls |
| World object identity | `WorldObjectRegistry` | scene assembler |

## Adding A Task Or Journal System

Do not store task progress in `RuntimeHUD`, dialogue nodes, or pet bubbles. Add a reusable owner under `src/gameplay/`, for example:

```text
Task definition
→ task instance/state owner
→ gameplay events update progress
→ projection DTO
→ Chii UI presenter
```

Specify task identity, entry trigger, observable objectives, completion, cancellation, persistence, and story gating separately. A temporary town preparation hint is not automatically a persistent quest.

## Adding Inventory Or Equipment Behavior

Keep:

- item definitions in data
- inventory/equip rules in gameplay/system code
- model generation or mounting in the equipment/content service
- visual selection and busy/error states in the panel
- player movement and camera frozen while the panel or showcase owns input

Clothing resolves from the approved empty-hand base through one full-loadout refine. Hand props mount afterward and may trigger a presentation animation.

## Persistence Decision

Choose explicitly:

- Session-only: autonomous generated placements, summoned pets, temporary festival props.
- Local preference: UI, climate, render style, chosen approved appearance.
- Story fact: authored progression such as Act completion.
- Asset history: generated JSON that may remain without restoring its world placement.

Do not turn a session-only prototype result into save data merely because a file exists in `public/generated/`.

## Failure Contract

For an async gameplay action:

1. Reject duplicate start.
2. Reserve pets/objects if needed.
3. Record resume state.
4. Release dialogue and camera when background work begins.
5. Apply results atomically.
6. In `finally`, remove presentation, release reservations, and restore a valid state.
