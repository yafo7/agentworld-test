---
name: chii-ui
description: Design and implement Chii Island game UI, HUD, panels, dialogue, bubbles, loading screens, interaction feedback, responsive layout, accessibility, and input-lock behavior. Use when changing inventory, task or activity displays, ESC settings, dialogue/input surfaces, object-management UI, character showcase UI, or any interface that must coexist with player and camera controls.
---

# Chii UI

Treat this skill as the presentation owner for an existing game state. Use `$chii-gameplay` as the primary skill when rules, rewards, tasks, inventory data, or progression also change. Pair with `$chii-story` for cinematic dialogue and screen transitions.

Workflow:

1. Identify the state owner and the existing presenter before editing DOM or CSS.
2. Define `closed`, `open`, `busy`, `error`, and cancellation behavior where relevant.
3. Reuse the current bubble language, controls, loading screen, and presentation classes.
4. Keep state and rules outside the view. Put Chii views in `presentation/`; systems may coordinate them but should not embed large DOM implementations.
5. Define keyboard, mouse, pointer-lock, camera, and player-lock behavior for every open and close path.
6. Keep layouts readable at desktop and mobile viewports without overlapping the 3D subject or other HUD layers.
7. Add focused state/projection tests, then run `$chii-verify --full` and inspect the screenshot.

Rules:

- All pet overhead speech uses `PetBubblePresenter`.
- Text entry, modal dialogue, inventory, and object editing must freeze gameplay input and restore it on close or failure.
- Preserve the current Esc close priority instead of adding another independent listener.
- Use icons for familiar controls, visible labels for decisions, and real controls for toggles, ranges, and choices.
- Do not put cards inside cards, expose implementation instructions in the game, or let decorative styling reduce text contrast.
- Keep feature state out of `RuntimeHUD`; it only projects status supplied by the owning system.

Read `references/ui-map.md` before changing a shared shell, input lock, or more than one UI surface.
