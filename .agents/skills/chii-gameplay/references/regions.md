# Region Gameplay Reference

## Shared Island Loop

The regions are phases of one island, not separate games:

```text
Pastoral changes the home
→ Forest creates or welcomes a resident
→ Town gives residents shared activities and building work
→ residents and session objects return to the same island runtime
```

Do not create a separate engine, pet state machine, inventory, task system, or persistence store per region.

## Windmill Pastoral

Purpose: pet-assisted home building and environment modification.

Current slice:

- first interaction chooses following or free roam
- player-commanded and approved autonomous create/refine/mount
- construction presentation and work-state resume policy
- generated placements are session-only

Keep fields, paths, reserved building pads, and object clearance usable when adding activities.

## Temple Forest

Purpose: player and companion wishes create or attract new residents.

Current slice:

- following pet plus trophy questions
- prompt synthesis and async pet generation
- generated idle/run/jump/special animations
- introduction and existing pet interaction reuse
- tent camping and return to following
- summoned pets are session-only

## Church Town

Purpose: public life, reusable social activities, animation/VFX, and building.

Current slice:

- town free roam and follow/free-roam dialogue
- contextual daily activities and hosted festivals
- gathering, performance, wind-down, and exact state restoration
- generated activity assets cached across replay
- four-stage HUD plus an optional non-blocking preparation task
- builder crab lot selection and generated construction

`fangk` owns hosting and event exit. The builder crab owns new-building construction.

## Beach And Act Handoff

The forest-side beach is the Act 0 gameplay handoff and normal world terrain. Story staging remains transient; the beach spawn, terrain, navigation, and nearby environment belong to the shared island.
