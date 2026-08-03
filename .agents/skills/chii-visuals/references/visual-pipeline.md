# Chii Visual Pipeline

## Decision Map

| Visual concern | Stable contract | Current adapter or presenter |
|---|---|---|
| Per-model material tags and companions | `ModelVisualPort` | `VoxelStudioModelVisualAdapter` |
| Whole-frame style, quality, post-processing | `RenderPresentationPort` | `VoxelStudioRenderPresentationAdapter` |
| Continuous river or future world water | `WorldWaterVisualPort` | `VoxelStudioWorldWaterAdapter` |
| Time/weather climate presentation | `WorldClimateVisualPort` | `WorldClimatePresenter` |
| Sky rendering inside climate presentation | Presenter-owned visual delegate | `ChiiSkyVisualAdapter` |
| Model-local pool/fall water | Model visual lifecycle | `ModelWaterTagPresenter` |
| Short gameplay dust, ideas, celebration | Chii presentation service | `TemporaryVfxService` |
| Animation-plan particles/VFX | Animation runtime plan | `engine/animation/particles.js` |

Choose one owner. Do not make one effect update from multiple systems.

`WorldClimatePresenter` is the object exposed through `WorldClimateVisualPort`.
`ChiiSkyVisualAdapter` is its replaceable internal sky delegate; it does not implement
the climate port directly. Render quality remains owned by
`RenderPresentationPort`. A sky or cloud adapter may consume the selected quality
tier, but must not persist or independently select another tier.

## Runtime Boundary

The authoritative upstream commit and package path live in `AGENTS.md` Section 3. On update:

1. Compare old/new commits.
2. Inspect package exports, peer Three version, material/VFX vocabularies, and effect lifecycle.
3. Pack or pin the audited package locally.
4. Adapt at `src/integrations/rendering/`.
5. Keep unsupported exports behind a Chii-owned adapter rather than copying sibling code.
6. Update capability reporting and tests.

`VoxelStudioModelVisualAdapter` currently promotes compatible Lambert/Phong materials to Standard only at the adapter boundary because runtime shader layers target PBR anchors. Parser and base builder output stay unchanged.

## Lifecycle Contract

Every visual integration must support:

```text
attach or set state
→ update with bounded delta
→ replace or detach
→ dispose GPU resources
```

Async attachment must reject stale results when a model is replaced while an effect is still loading. Shared materials require identity-aware caching and restoration.

## Validation

Use:

```powershell
npm run test:render-compat
node .agents/skills/chii-verify/scripts/verify.mjs --full
```

Check:

- WebGL context remains alive.
- Shader programs are runnable.
- Pixel output is nonblank.
- Tagged and untagged models retain readable color.
- Attach/detach does not leak companions or materials.
- Current/Cel switching and direct-render fallback work.
- River/model water animates without changing navigation.
- Desktop and narrow viewport screenshots preserve composition.
