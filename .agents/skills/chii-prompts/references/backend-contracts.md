# Backend Contracts

Use `api-reference.md` as the complete upstream reference. This file records only the Chii-facing prompt boundary.

## Operation Map

| Operation | Canonical backend endpoint | Prompt-bearing fields | Required result |
|---|---|---|---|
| `pet_generate` | `POST /api/generate/model` | `description` | SSE result containing `modelJson` |
| `model_generate` | `POST /api/generate/model` | `description` | SSE result containing `modelJson` |
| `model_refine` | `POST /api/refine/model` | `description` | JSON containing refined `modelJson` |
| `model_mount` | `POST /api/mount` | string `secondary`, plus placement `description` | JSON containing mounted `modelJson` and mount id/plan |
| `activity_plan` | `POST /api/chat` | `messages` | Strict JSON accepted by `ActivityPlanValidator` |
| `animation_generate` | `POST /api/generate/animation-quick` | `description` | JSON Motion Plan |
| `building_generate` | `POST /api/generate/model` | footprint-aware `description` | SSE result containing `modelJson` |

Chii code calls semantic methods on `ContentGenerationPort`/`VoxelContentAdapter`; gameplay must not hardcode these URLs. The backend wrapper may expose a compatibility route while the canonical upstream route evolves.

## Current Chii Policy

- Autonomous Voxel model generation uses semantic quality `voxel`; `VoxelContentAdapter` currently maps it to `provider: gpt`, `model: gpt-5.6-sol-high`, and `mode: voxel`.
- Refine, mount, animation, and chat provider profiles are adapter policy. Prompt authors must not override them in prose.
- Chii sends one selected-provider request and reports structured errors. The generic fallback-chain suggestion in upstream documentation does not apply.
- Model generation and refine may send `materialTags` separately. Prompts describe visible material normally, while the adapter supplies the audited material vocabulary.
- Current runtime gameplay uses Quick Motion Plans. Do not assume Pro animation payloads unless a separate integration task verifies them.

## Preconditions

### Generate

- `description` is non-empty.
- `mode` is selected by adapter policy.
- One prompt describes one runtime object.

### Refine

- `modelJson` retains valid `_meta.ai` from backend generation.
- `description` identifies the retained model and concrete changes.
- Optional `refModelJson` is a request field, not a substitute for the description.

### Mount

- `primary` retains valid `_meta.ai`.
- If `secondary` is model JSON, it also retains valid `_meta.ai`; if it is a string, it is a short part-generation prompt.
- Placement `description` names the target anchor and orientation.
- The primary identity and unrelated parts stay unchanged.

### Animation

- `modelJson` is the exact model that will play the plan.
- `duration` and `emitParticles` are request fields, not vague prose.
- The prompt names a single action with readable body-part motion.

### Activity Planning

- The system message demands JSON only.
- The user message contains only available pet ids/profiles, object ids/tags, location, and the player's concept.
- Validate the response before any generation call.
- Current daily activities use 1-2 pets; festivals may use up to 6.
- Current action prompts are at most 12 characters and prop prompts at most 20 characters after validation.

### Buildings

- The terrain lot is confirmed before prompting.
- Width and depth are terrain tiles, not placement-grid cells.
- The prompt preserves the lot ratio; `ObjectPlacementService` still owns snapping, normalization, occupancy, and collision.

## Fields That Do Not Belong In Prompt Text

- `provider`, `model`, `mode`
- `materialTags`
- `duration`, `emitParticles`
- `temperature`, `maxTokens`
- API key, base URL, timeout, retry, fallback
- runtime asset id, object registry id, placement-grid subdivision

Carry them as structured request metadata through existing ports and adapters.
