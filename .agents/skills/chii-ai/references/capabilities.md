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

Prompts must describe visible geometry or concrete motion. Convert abstract mood into color, shape, material, body form, attachment, or movement.
