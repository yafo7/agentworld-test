---
name: chii-visuals
description: Integrate, adapt, and validate Chii Island technical-art presentation including render-runtime updates, material tags, model effects, water, sky, lighting, weather visuals, VFX, Cel/current styles, quality tiers, and post-processing. Use when visuals differ from Studio, a new 3d-generate rendering capability should be adopted, or a rendering feature must remain replaceable behind the current ports and adapters.
---

# Chii Technical Art

Use this skill for how the world is presented. Use `$chii-scene` for where objects and terrain are placed, `$chii-ai` for generating content, and `$chii-debug` when the first failing layer is still unknown.

Workflow:

1. Classify the change as model visuals, world water, climate/sky, frame presentation, or temporary gameplay VFX.
2. Read the current audited `3d-generate` baseline in `AGENTS.md` and inspect only the relevant upstream exports or schema.
3. Preserve the stable port and change or add an integration adapter. Do not import sibling source directly.
4. Keep material tags and VFX tags intact through model lifecycle; attach, update, detach, and dispose every runtime effect.
5. Provide a direct-render/basic-material fallback when an optional runtime capability fails.
6. Add a contract or WebGL compatibility test before enabling the feature by default.
7. Run `npm run test:render-compat`, then `$chii-verify --full` and inspect representative screenshots.

Rules:

- Do not replace the renderer, parser, animation runtime, or core loop to adopt a presentation feature.
- Keep gameplay `entity.tags` separate from part-level render `nodes[].tags`.
- Model replacement/removal must reattach or detach visuals through the existing lifecycle.
- World water changes presentation only; terrain, occupancy, collision, and navigation remain owned elsewhere.
- `WorldClimatePresenter` owns the climate visual port; sky/cloud adapters are internal delegates.
- `RenderPresentationPort` is the only owner of quality settings. Other visual adapters may consume its tier but must not store a second setting.
- Do not let scene or gameplay systems know upstream runtime package classes.
- After an authorized upstream update, record the commit and refresh the capability baseline and compatibility fixture.

Read `references/visual-pipeline.md` before changing a shared adapter or updating the pinned render-runtime package.
