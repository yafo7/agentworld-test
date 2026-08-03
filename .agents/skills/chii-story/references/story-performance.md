# Chii Story Performance Map

## Current Architecture

| Responsibility | Current owner |
|---|---|
| Persistent story facts and replay/skip query | `story/ActZeroStoryState.js` |
| Phase timeline and handoff | `presentation/ActZeroCrashDirector.js` |
| Transient set, actors, anchors, and camera poses | `presentation/ActZeroCrashStage.js` |
| Captions, input, status, and screen overlay | `presentation/ActZeroOverlay.js` |
| Story ambience and cues | `presentation/ActZeroSoundscape.js` |
| Pure shot, shake, blend, and transition math | `presentation/cinematic/CinematicTemplateLibrary.js` |
| Screen-only transition rendering | `presentation/cinematic/CinematicScreenEffectPresenter.js` |
| Shared player/dialogue framing outside cutscenes | `presentation/DialogueCameraDirector.js` |
| Cross-page loading | `presentation/ChiiPageLoadingScreen.js` |

Preserve these boundaries for later acts. A new act may have its own state/director/stage files without copying engine or gameplay state.

## Beat Sheet

Define each beat with:

```text
id:
entry condition:
story fact learned:
active actors:
actor movement/blocking:
dialogue:
shot template and anchors:
screen transition:
player/camera/input state:
duration or completion signal:
assets that must already exist:
exit state:
skip/cancel/error cleanup:
```

Every sequence also declares:

- Starting gameplay state.
- Final player position and facing.
- Final pet/world state.
- Whether replay changes persistent facts.
- Which transient objects must be disposed.

## Template Selection

- `pov_wake`: waking or regaining awareness.
- `establishing_wide`: geography, exits, danger, or group arrangement.
- `dialogue_two_shot`: relationship and shared space.
- `dialogue_over_shoulder` / `shot_reverse_shot`: focused conversation while preserving the axis.
- `entrance_reveal`: introduce an arriving actor through reserved screen space.
- `face_close_up` / `reaction_close_up`: decisive line or response.
- `action_tracking`: sustained movement such as falling, running, or ejection.
- `impact_wide`: show the complete consequence.
- `focus_insert`: isolate a prop, ripple, clue, or transition target.

Use `cut` for continuous action, fades for act boundaries, `dip_to_black` for a short related jump, `pov_wake_blink` for waking, and iris transitions for visual focus. `dissolve` and `wipe` still require two render surfaces.

## Tests

Prefer deterministic tests for:

- Phase and line order.
- Camera pose source and target.
- No unintended cut inside an authored long take.
- Exact transition type.
- Input release and transient-stage cleanup.
- Final teleport/facing and story-state persistence.

Browser QA checks actor orientation, occlusion, readable dialogue placement, and whether the next gameplay interaction works immediately after the scene.
