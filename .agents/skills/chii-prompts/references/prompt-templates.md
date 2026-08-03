# Prompt Templates

Replace brace variables, then run the style and contract checks. Do not send braces or optional notes to the backend.

## World Constraint Packet

Keep physical size outside the raw model JSON. Every generated world object must carry this gameplay-side packet:

```json
{
  "sizeProfile": "small_decor",
  "footprint": { "width": 2, "depth": 2, "unit": "placement_cell" },
  "clearanceCells": 0,
  "groundAnchor": "bottom_center"
}
```

- `sizeProfile` must be one of the profiles in `worldTuningProfile.js`.
- Every profile belongs to exactly one scale category: `building`, `pet`, `tree`, `plant`, `furniture`, or `interactive_prop`.
- General object footprints use placement cells; one cell is 2 world units.
- Building lots use terrain tiles in dialogue and prompts; one terrain tile becomes two placement cells.
- Refine inherits the target object's packet.
- Mount inherits the primary object's packet and must not rescale the primary model.
- Pro and Voxel variants use the same packet.
- The backend prompt describes visible proportions. Runtime placement remains the final authority for world scale.
- Curated trees, buildings, flowers, grass, crops, carrots, flower pots, tents, trophies, and the town campfire keep their approved authored scale. Their measured bounds are generation references, not targets for runtime rescaling.
- Furniture profiles remain provisional until representative generated furniture is approved in the island.
- Tree generation uses `成熟树高约为宠物二至五倍`.
- Campfire generation uses `篝火整体高度约为一只宠物`.
- Building generation keeps the confirmed footprint and uses `门高约一只宠物，主体按占地完整展开`.

## 1. Pet Generation

### Inputs

```text
animal_or_body: animal prototype or readable body form
main_color: one dominant color
body_shape: round, tall, four-legged, standing, winged...
feature_1..3: visible identity or ability features
```

### Direct Template

```text
一只{main_color}{body_shape}的{animal_or_body}，{feature_1}，{feature_2}
```

Optional third feature is allowed only if the first two do not communicate the ability.

Example:

```text
一只圆滚滚蓝色水獭，透明耳朵，水滴尾巴背着小喷泉
```

### Wish-to-Pet Planner

Use `/api/chat` before model generation when player mood, companion wishes, or story context must be combined.

System message:

```text
你是奇异岛宠物外形提炼器。只输出一句18到28字的中文模型描述，不解释。必须包含动物原型或身体形态、主色和1到3个可见特征。把性格、心情和能力改写成能看见的身体、颜色或部件；不要写故事、氛围、用途或请求语。
```

User message:

```text
玩家想遇见：{player_wish}
玩家期待的性格：{mood_wish}
同行宠物愿望：{companion_wish}
同行宠物特征：{companion_profile}
```

Pass only the planner's single output sentence to `generateModel`.

## 2. General Model Generation

### Template

```text
一个{object_name}，{main_material_or_color}，{main_structure}，{recognition_feature}
```

For plants, use the natural classifier:

```text
一株{plant_name}，{flower_or_leaf_color}，{stem_leaf_shape}
一丛{plant_name}，{count_or_density}，{visible_feature}
一棵{tree_name}，{trunk_shape}，{crown_shape_or_fruit}
```

Examples:

```text
一个原木工具架，三层横梁，挂着木锤和草帽
一株蓝色郁金香，六片宽叶，花朵微微张开
一个蘑菇灯，粗短木柄，橙色伞盖向下发光
```

Do not include the surrounding field, road, room, character, or background.

## 3. Model Refine

Refine changes an existing identity. It does not add a detachable accessory.

### Local Change Template

```text
保留{model_identity}与整体比例，只将{target_part}改成{concrete_change}，其余不变
```

### Whole-Style Change Template

```text
保留{model_identity}和原有结构，整体改用{materials_and_colors}，{one_structural_change}
```

Examples:

```text
保留苹果树与整体比例，只把树冠改成蓝绿色，枝间增加发光蘑菇
保留木屋和门窗结构，墙面改成浅色原木，屋顶改成红瓦斜顶
```

Checklist:

- The target model has valid `_meta.ai`.
- The prompt says what remains.
- The result is described visually, not as `更漂亮` or `更田园`.
- Use mount instead if the new element should remain detachable.

## 4. Mount / Add Part

Mount has two prompt surfaces. Never merge them into an ambiguous sentence.

### New Part (`secondary` string)

```text
{main_color_or_material}{part_name}，{shape_or_detail}
```

### Placement (`description`)

```text
将它固定在{exact_anchor}，{orientation}，{clearance_rule}
```

Examples:

```yaml
secondary: "粉色小花编成的圆形花环"
description: "将它戴在头顶两耳之间，保持水平，不遮挡眼睛"
```

```yaml
secondary: "红砖短烟囱，顶部黑色金属帽"
description: "将它固定在屋顶右后侧，竖直向上，底部贴合瓦面"
```

If the part comes from the model library, send its model JSON as `secondary`; only author the placement sentence.

Valid anchor vocabulary:

```text
头顶、左手、右手、背部中央、胸前、腰侧、屋顶中央、屋脊右侧、正门左墙、树枝末端、地面插槽
```

## 5. Pet Activity Planning

The planner creates executable JSON. Individual action and prop prompts inside that JSON still follow the short-prompt rules.

### Daily Activity System Message

```text
你是奇异岛城镇小活动策划宠物。只输出JSON，不解释。只能使用输入中存在的宠物和对象；活动包含1到2只宠物，地点只能是church_square、campfire或apple_tree。每只宠物动作写5到10字具体中文，只描述一个可播放动作。对白按观察、邀请、回应三步，每句简短，只留一个可爱的小幽默。严格使用给定JSON格式，不增加字段。
```

Append this exact output schema to the system message:

```text
格式:{"type":"custom_daily","scale":"daily","title":"名称","hostId":"fangk","initiatorId":"id","participants":["id"],"locationId":"church_square","targetObjectIds":[],"actionPrompts":{"id":"具体动作"},"dialogue":{"proposal":"观察和邀请","accept":"接受后的回应","ready":"动作开场","reaction":{"speakerId":"id","text":"动作后的回应"},"end":"结束对白"}}
```

Validate the response with `ActivityPlanValidator`.

### Festival System Message

```text
你是奇异岛节日策划师fangk。只输出JSON，不解释。只能使用输入中存在的宠物和对象，地点只能是church_square或campfire。安排清楚的邀请、集合、表演和由fangk确认结束。先查看reusableAssets；有合适道具时operation写library并原样填写libraryKey，不合适才写generate。最多生成两个可见体素道具，每个道具描述15到20字；每只宠物动作5到10字。对白可爱、自然、略带幽默，环境对白最多三句。严格使用给定JSON格式，不增加字段。
```

Append this exact output schema to the system message:

```text
格式:{"type":"custom_festival","scale":"festival","title":"节日名","hostId":"fangk","initiatorId":"fangk","participants":["id"],"locationId":"church_square","targetObjectIds":[],"actionPrompts":{"id":"具体动作"},"props":[{"id":"prop","name":"道具名","operation":"generate或library","libraryKey":"仅复用时填写","archetype":"festival_prop","sizeProfile":"festival_prop","prompt":"具体模型描述","footprint":{"width":2,"depth":2}}],"dialogue":{"proposal":"活动邀请","accept":"接受回应","ready":"开场对白","ambient":[{"speakerId":"id","text":"活动中的短句"}],"end":"结束对白"}}
```

Validate the response before generating props or animations.

### Planner User Context

```json
{
  "concept": "{player_concept}",
  "initiatorId": "{pet_id}",
  "pets": [{ "id": "{id}", "personalityTags": [], "featureTags": [], "favoriteActions": [] }],
  "objects": [{ "id": "{id}", "name": "{name}", "tags": [] }],
  "reusableAssets": [{ "libraryKey": "{key}", "name": "{name}", "prompt": "{prompt}", "activityType": "{type}" }]
}
```

Do not let the planner invent pet ids, object ids, unsupported operations, or runtime fields that the validator discards.

## 6. Autonomous Animation And VFX

### Motion Template

```text
{body_part}{specific_motion}{direction_or_rhythm}
```

Examples:

```text
轻轻呼吸摇摆
四脚快速向前奔跑
双手交替挥斧
展开双翼上下扇动
左右踏步挥舞双手
```

### Motion With Particles

Keep the motion first and add one visible particle result:

```text
双手挥锤，脚边扬起灰尘
原地转圈，身边冒出彩色星星
```

Request hints:

```yaml
duration: 2.0
emitParticles: true
```

Use `emitParticles: false` when particles are not part of the action. Looping, duration, and particle enablement belong in request metadata; do not replace them with abstract prose.

For a generated pet's `special` action, select one visible feature from the final pet prompt and animate it:

```text
feature: 水滴尾巴
special: 尾巴左右甩出水花
```

## 7. Footprint-Constrained Building

The lot is gameplay data, not an AI suggestion. Confirm it first.

### Inputs

```text
width_tiles: N
depth_tiles: M
building_type: concrete building identity
main_material: one dominant material
roof_or_top: readable top structure
front_feature: door, porch, tower, signless window arrangement...
```

### Direct Template

```text
占地{N}×{M}地块的{building_type}，底部长宽比{N}:{M}，{main_material}，{roof_or_top}，{front_feature}
```

Example:

```text
占地3×4地块的田园木屋，底部长宽比3:4，浅色原木墙，红瓦斜顶，正面双开木门
```

Compact variant when the endpoint responds better to shorter wording:

```text
3×4地块田园木屋，底部3:4，原木墙红瓦斜顶，正面双开门
```

### Building Planner

Use `/api/chat` only when a player description is long or contradictory.

System message:

```text
你是奇异岛建筑提示词整理器。只输出一句不超过40字的中文建筑外形描述。必须原样保留“占地{N}×{M}地块”和“底部长宽比{N}:{M}”，写清建筑类型、主材质、屋顶和正面特征。只生成建筑本体，不要地面、树木、人物、围栏或背景。
```

User message:

```text
玩家描述：{player_description}
```

### Building Validation

- The prompt width/depth order matches the confirmed lot.
- Do not normalize `3:4` into `4:3` after rotating the camera; runtime rotation is separate.
- Do not promise physical world scale through prose. The placed model is normalized into the reserved footprint after generation.
- Do not ask the model to include adjacent roads, gardens, trees, or terrain because those occupy separate grid cells.
- Registration, occupancy, collider, move, scale, and delete remain owned by existing world services.
