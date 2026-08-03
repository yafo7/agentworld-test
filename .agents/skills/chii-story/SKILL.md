---
name: chii-story
description: Design and implement Chii Island storylines, acts, scripted events, dialogue performances, actor blocking, cinematic camera shots, transitions, loading beats, and control handoffs. Use for prologue or chapter scenes, character entrances, authored conversations, cutscenes, story-state progression, camera direction, or any sequence that temporarily directs player attention and then returns to gameplay.
---

# Chii Story Performance

Use this skill for authored dramatic sequences. Use `$chii-gameplay` for repeatable activities, tasks, rewards, and systemic rules; pair with `$chii-ui` for dialogue or overlay redesign.

Workflow:

1. Establish canon facts, entry conditions, player knowledge, and the exact exit state.
2. Write a beat sheet before code: action, dialogue, actor blocking, shot, control state, duration, and transition.
3. Reuse `CinematicTemplateLibrary` shots and transitions before adding a new template.
4. Separate persistent facts, timeline direction, transient stage objects, screen presentation, and sound.
5. Preload required local assets or show an explicit loading state; do not stall the render loop during generation.
6. Lock only the controls the beat requires and release input, camera, temporary actors, and overlays on completion, skip, cancel, and failure.
7. Test phase order, authored lines, camera continuity, transition semantics, cleanup, and gameplay handoff; finish with `$chii-verify --full`.

Rules:

- A story director may request gameplay changes but must not become a second pet, inventory, task, or world-state owner.
- Story-only actors and stage props stay transient unless the script explicitly hands them to world registries.
- Preserve the dialogue axis and readable actor framing. Use close-ups for decisions or reactions, not as the default camera.
- A long continuous action keeps one tracking shot unless a motivated cut improves comprehension.
- Screen masks, fades, blinks, and iris effects are presentation, not world geometry.
- Keep authored text separate from backend prompts. Use `$chii-prompts` and `$chii-ai` only when the story explicitly creates content.

Read `references/story-performance.md` for the current file map, beat-sheet format, and cinematic template selection.
