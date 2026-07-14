---
name: chii-debug
description: Diagnose Chii Island bugs using evidence-first checks across assets, model parsing, animation, pet state, interaction, physics, camera, UI, backend calls, and performance. Use when behavior is wrong, models differ from Studio, pets resume the wrong action, effects disappear, controls lock, or rendering appears broken.
---

# Chii Debugging

1. Reproduce one narrow symptom.
2. Select a diagnostic lane from `references/diagnostics.md`.
3. Capture the first differing input or state.
4. Stop investigating downstream systems once the first difference is proven.
5. Fix the smallest owning function.
6. Add a regression test and run `$chii-verify`.

Never begin with renderer/model-parser changes. Never use visual appearance alone as proof of the failing layer.

For Studio-versus-Three differences, compare exact JSON before reading Renderer code. For pet behavior, inspect `PetStateMachine.current`, `resumeState`, `_followEnabled`, and movement target at each transition.
