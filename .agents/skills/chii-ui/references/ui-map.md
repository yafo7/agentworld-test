# Chii UI Map

## Ownership

| Surface | State owner | View or presenter |
|---|---|---|
| Context interaction prompt | `ChiiInteractionController` | `#interact-prompt` in `index.html` |
| Pet dialogue and text input | Calling gameplay system plus `DialogueSystem` | `systems/DialogueSystem.js` |
| Pet overhead speech and ideas | Calling pet/gameplay system | `presentation/PetBubblePresenter.js` |
| Inventory | `systems/InventorySystem.js` | `presentation/InventoryPanel.js` and `inventory.css` |
| Equipped-item close-up | `InventorySystem` callback | `presentation/PlayerItemShowcaseDirector.js` |
| Town activity progress | `TownSocialSystem` | `systems/RuntimeHUD.js` |
| Object and lot editing | `ObjectEditorController` or placement service | `ObjectPlacementOverlay.js` and object editor DOM |
| ESC settings | Climate/render/collider settings owners | `#mgmt-panel` in `index.html` |
| Shared page loading | Navigation/bootstrap caller | `ChiiPageLoadingScreen.js` and shared CSS |
| Character showcase | Appearance store/equipment service | `player-candidates.html/js/css` |
| Story overlay | Story director | `ActZeroOverlay.js` or a story-specific presenter |

Do not create a second owner for the same state merely to make a UI.

## Input And Overlay Contract

The main loop currently resolves blocking surfaces before player update. Preserve this behavior:

```text
story or room transition
→ item showcase
→ inventory
→ object editor
→ dialogue/text input
→ ESC panel
→ normal interaction and movement
```

For every blocking surface:

1. Expose one authoritative `isOpen()` or `isActive()` state.
2. Stop movement, interaction, camera mouse delta, and conflicting shortcuts while active.
3. Let text fields receive ordinary movement letters without moving the player.
4. Close through the existing owner, not by editing CSS classes from unrelated code.
5. Restore pointer/camera/input state in normal completion, cancellation, and error paths.

## Visual Language

- Continue the rounded, warm, cartoon bubble language already used by dialogue, pet bubbles, inventory, and climate controls.
- Keep dialogue near the bottom and preserve a clear view of actors.
- Use one strong accent plus neutral surfaces; avoid making every element the same color.
- Maintain stable control sizes so hover, loading, and long Chinese labels do not shift the layout.
- Respect safe edges, activity HUD, interaction prompt, and dialogue layers simultaneously.
- Use concise island voice for text. UI copy states what is happening or what the player can choose, not how the feature was implemented.

## Verification Matrix

Check at least:

- `1440x900` desktop.
- A narrow mobile-like viewport.
- Long Chinese labels and backend error text.
- Keyboard-only close and confirmation.
- Open/close while pointer lock is absent.
- No player movement while typing.
- Async busy state and cancellation.
- Screenshot with the relevant 3D subject still visible.
