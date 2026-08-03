# Diagnostic Lanes

## Asset or model mismatch

```text
Studio runtime JSON
→ local public/generated JSON
→ VoxelModel.fromJSON
→ resolveMirrors/optimize
→ renderer input
→ Mesh
```

Deep-diff each stage and stop at the first difference.

## Pet behavior

Check state owner, transition reason, resume state, follow flag, wander flag, target position, and completion callback. Current Chii must not assign behavior through an independent second state machine.

## Backend action

Check semantic operation, prompt, provider profile, request payload, response model, persistence result, scene application, and final work cleanup in that order.

## Input/UI

Check DialogueSystem active/input state, camera lock, player lock, pointer lock, and Input frame state. Text input must freeze player movement.

After locating the first UI-state difference, use `$chii-ui` for the presentation or lock fix. Do not move feature state into a panel to repair a display bug.

## Story performance

Check story phase, elapsed phase time, actor anchor/rotation, camera template and pose, screen transition, input lock, cleanup, and final gameplay handoff in that order. Use `$chii-story` after the first broken beat is proven.

## Physics

Check visual transform, collider transform, body type, collision groups, terrain height, and physics step. Do not replace Rapier without evidence.

## Performance/rendering

Measure renderer calls, triangles, geometries, frame time, and repeated model instances. Optimize only after measurement.

For runtime material, sky, water, or VFX differences, compare tags and adapter input before shaders. Use `$chii-visuals` once the failing presentation boundary is identified.
