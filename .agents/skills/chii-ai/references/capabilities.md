# AI Capability Map

| Intent | Semantic operation | Current owner |
|---|---|---|
| New identity | `generateModel` | `AIWorldActionService.createObject` |
| Whole-model change | `refineModel` | `AIWorldActionService.refineObject` |
| Add local part | `mountPart` | `AIWorldActionService.mountPart` |
| Motion or VFX | `generateAnimation` | `ContentGenerationPort` |
| Planning/name/prompt | `chat` | `ContentGenerationPort` |

Key files:

- Contract: `src/ports/ContentGenerationPort.js`
- Provider policy: `src/integrations/content/VoxelContentAdapter.js`
- HTTP wrapper: `src/backend/voxelApi.js`
- Work lifecycle: `src/gameplay/ai/PetWorkCoordinator.js`
- Persistence: `src/assets/repositories/GeneratedAssetRepository.js`

Operation distinction:

- Generate creates a new object identity.
- Refine preserves identity while changing the whole form/style.
- Mount preserves identity and adds a local part at hand, head, back, surface, roof, wall, or ground.

Use `$chii-prompts` for all prompt wording, planner messages, and reusable templates. This capability map owns operation selection, not prose style.

## Current Request Contract

- Chii Voxel generation is one explicit request with `provider: gpt`, `model: gpt-5.6-sol-high`, and `mode: voxel`.
- Voxel generate and refine requests include Chii's compact `material-tags-v1` prompt contract, pinned to audited backend commit `de51c7d`. The remote API does not expose the Studio vocabulary JSON URL, so gameplay must not fetch it from port 8000 or route generation through Studio.
- Chii runs the pinned Studio `MaterialTagRuntime` behind `ModelVisualPort`; fire and smoke use runtime companions, while pool/fall water uses Chii's lightweight presenter. Do not claim full Studio water, texture-tuning, or batching parity.
- Refine, mount, and quick animation also use `provider: gpt` through the api-reference backend. They never use Studio save/load endpoints.
- Do not silently fall back to another provider. Surface the structured backend code, status, detail, and timing to the owning gameplay flow.
- Generation, refine, mount, and animation currently use a 300-second browser timeout.
- Current gameplay uses Quick Motion Plans. Query runtime template support instead of hardcoding a list; historical `tilt` tracks remain normalized to `pointTo` for Chii compatibility.
