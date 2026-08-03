---
name: chii-prompts
description: Compose, normalize, and review Chii Island backend prompts for pet or object generation, refine, mount/add-part, pet activity planning, autonomous animation/VFX, and footprint-constrained buildings. Use whenever gameplay code or Codex is about to send description, secondary, mount placement, or /api/chat messages to the api-reference backend, or when prompt style and generation stability must be audited. Do not use for user-controlled Voxel Studio asset sync.
---

# Chii Prompt Authoring

Turn gameplay intent into short, concrete Chinese prompts that the current backend can execute consistently. This skill owns prompt wording and validation; `$chii-ai` owns API invocation, provider policy, error handling, and persistence.

## Workflow

1. Classify the request as exactly one operation:
   - `pet_generate`
   - `model_generate`
   - `model_refine`
   - `model_mount`
   - `activity_plan`
   - `animation_generate`
   - `building_generate`
2. Read the matching section in [prompt-templates.md](references/prompt-templates.md).
3. Gather only observable or executable inputs. Convert personality, mood, story, and atmosphere into visible shape, color, material, part, pose, or action.
4. If the input is long or contextual, use `/api/chat` as a planning layer first. Its output must be a short downstream model, refine, mount, or animation prompt.
5. Apply [style-guide.md](references/style-guide.md), then check the operation contract in [backend-contracts.md](references/backend-contracts.md).
6. Return a Prompt Packet. Do not call the backend unless the user also asked to generate or implement the result.

## Prompt Packet

Use this shape when handing a prompt to code or `$chii-ai`:

```yaml
operation: model_generate
prompt_profile: chii-v1
endpoint: /api/generate/model
prompt: "一个原木工具架，三层横梁，挂着木锤和草帽"
secondary: null
placement: null
planner_messages: null
request_hints:
  quality: voxel
  duration: null
  emitParticles: false
preconditions: []
validation:
  concrete_chinese: true
  one_subject: true
  identity_preserved: null
  footprint_preserved: null
```

Only include fields meaningful to the selected operation. `request_hints` are semantic hints for existing adapters, not raw provider overrides.

`chii-v1` is the current reusable language profile. Change that identifier only when template grammar or constraints intentionally become incompatible.

## Hard Rules

- Write final generation descriptions in Chinese unless a user explicitly requires another language.
- Start with the subject noun. Follow with color/material, body or structure, then one to three strong visible features.
- Default model descriptions to 15-20 Chinese characters. Use up to 32 for pets or constrained objects and up to 40 for buildings when the footprint must remain explicit.
- Keep one generated subject per request. Do not ask a model endpoint to create a whole scene.
- Do not pass story, emotion, personality, gameplay tags, or abstract atmosphere directly to a model endpoint. Translate them into visible evidence first.
- Refine must name what stays unchanged, what part changes, and the concrete result.
- Mount must separate the part (`secondary`) from its physical attachment instruction (`description`). Name a real anchor such as head, right hand, roof ridge, wall, branch, or ground socket.
- Animation prompts describe one readable action. Use 5-10 Chinese characters when possible; add only the minimum visible particle phrase when `emitParticles` is required.
- Building generation starts only after an `N x M` terrain lot is chosen. Preserve both `N x M` and `N:M` in the prompt; runtime placement still owns actual scale and occupancy.
- Keep gameplay `entity.tags` out of model `nodes[].tags`. Material tag vocabulary is a separate request field, not prose pasted into the prompt.
- Never put API keys, provider fallback instructions, endpoint URLs, JSON schema internals, or renderer instructions into a generation prompt.
- Do not silently choose a different provider or mode. `VoxelContentAdapter` owns those decisions.
- Do not route autonomous gameplay through Studio load/save endpoints.

## Two-Layer Rule

Use a planner only when raw intent contains multiple facts or abstract language:

```text
player/pet/world context
        ↓ /api/chat with strict output rules
short concrete prompt or validated activity JSON
        ↓ generation/refine/mount/animation endpoint
runtime result
```

Never send the planner's explanation, chain of thought, story, or full context to a model-generation endpoint. Accept only its final sentence or validated JSON fields.

## Completion Check

Before returning a Prompt Packet, confirm:

- The operation and endpoint match.
- The sentence names a concrete subject or action.
- Every adjective can be seen in the finished model or animation.
- It contains no conflicting scale, count, pose, or placement instruction.
- Refine preserves identity; mount preserves the primary model.
- Activity output matches the current validator and references only available pets and objects.
- Building width/depth order matches the confirmed lot.
- The prompt can be reused by replacing brace variables without rewriting its grammar.

If any check fails, rewrite the prompt before handing it off.
