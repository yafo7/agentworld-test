---
name: chii-ai
description: Implement or invoke Chii Island autonomous AI content operations including model generation, refine, add-part or mount, animation, VFX, and planning chat. Use when gameplay or Codex must call the backend, choose semantic quality/provider policy, handle results, or persist generated content. Pair with $chii-prompts whenever authoring or changing prompt text.
---

# Chii AI Content

First classify the workflow:

- User edited an asset in Studio: stop and use `$chii-assets`.
- Gameplay/Codex autonomously creates or changes content: continue here.

Workflow:

1. Read only the relevant endpoint section in `api-reference.md`.
2. Use `$chii-prompts` to produce and validate the operation-specific Prompt Packet.
3. Call semantic interfaces in `ContentGenerationPort` or `AIWorldActionService`; map only supported packet fields into the request.
4. Keep provider selection inside `VoxelContentAdapter`.
5. Use `quality: 'voxel'` for Chii gameplay model generation (`provider: 'gpt'`, `model: 'gpt-5.6-sol-high'`, `mode: 'voxel'`).
6. Persist through `GeneratedAssetRepository` and record world metadata when the result must survive refresh.
7. Guard async re-entry and run `$chii-verify`.

For the curated environment-only Voxel scene variant, run `scripts/generate-scene-voxel-variants.mjs`. It preserves player, pet, and building assets and writes the style set under `public/generated/styles/voxel/`.

Do not call manual Studio edit endpoints from autonomous gameplay. Do not put secrets in browser code.

Read `references/capabilities.md` when selecting an operation or changing integration behavior. Prompt wording and reusable templates live only in `$chii-prompts`; do not duplicate them here.
