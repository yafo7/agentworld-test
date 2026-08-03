# Chii Prompt Style Guide

## Stable Language Pattern

Saved Studio assets show the most reliable pattern:

```text
量词 + 明确主体
→ 颜色或材质
→ 姿态、比例或结构
→ 1-3个强识别特征
→ 必要的比例或安装约束
```

Examples from the established asset language:

- `一匹棕色的马儿，身上穿着7号红色球衣`
- `一只站立行走的鳄鱼，双手各拿着一把大斧子`
- `一个由原木条堆起来的篝火`
- `一个巨大的哥特教堂，底部长宽比是5/8`

Keep this direct noun-led rhythm. Do not turn prompts into polite requests or design essays.

## Visible Translation

Translate abstract input before generation:

| Abstract intent | Visible wording |
|---|---|
| 可爱 | 圆脑袋、短手短脚、豆豆眼 |
| 温暖 | 原木、暖黄色灯、红瓦、橙色火光 |
| 神秘 | 发光短角、漂浮水晶、深色斗篷 |
| 活泼 | 前倾姿态、展开翅膀、翘起尾巴 |
| 沉稳 | 宽肩、四脚稳站、深棕配色 |
| 强壮 | 粗壮四肢、大手、宽胸甲 |
| 亲近水 | 水滴尾巴、透明鳍、背部小喷泉 |
| 喜欢工作 | 工具腰带、卷轴、木锤、安全帽 |

Do not leave personality words in the final model prompt when a visible replacement is available.

## Length Targets

| Prompt type | Target |
|---|---|
| General model | 15-20 Chinese characters; maximum about 28 |
| Pet model | 18-28; maximum 32 |
| Refine instruction | 12-28; maximum 32 |
| Mount part | 6-18 |
| Mount placement | 8-24 |
| Animation action | 5-10; maximum 12 |
| Generated festival prop | 15-20 |
| Building | 22-36; maximum 40 |

These are stability targets, not reasons to truncate away identity, anchor, or footprint constraints.

## Shape And Composition

- Ask for one readable silhouette and a few large features. Tiny repeated details are unstable and visually noisy.
- State a count when it matters: `两把斧子`, `三朵花`, `一根烟囱`.
- State posture when it affects rigging or mounting: `站立`, `四脚站立`, `展开双翼`.
- State material where it affects semantic tags or style: `原木`, `灰石`, `红砖`, `玻璃`, `金属`.
- Avoid requesting terrain slabs, display bases, labels, text, background, or surrounding scenery as part of a single object unless they are the subject.
- Do not repeat `体素风格` or technical mesh instructions in every prompt; generation mode already owns that style.

## Region Vocabulary

Use region words only when they produce visible choices.

| Region | Useful concrete vocabulary |
|---|---|
| Windmill Pastoral | 原木、红瓦、稻草、木箱、木栅栏、花盆、农具、暖黄灯 |
| Temple Forest | 苔藓石、藤蔓、蘑菇、树叶、水晶、浅水、露营布、木桩 |
| Church Town | 红砖、灰石、路灯、彩旗、木长椅、钟、篝火、花环 |

## Rewrite Tests

Bad: `创造一个温暖可爱的森林伙伴`

Good: `一只圆滚滚白色小鹿，金色短角，背着三片发光叶`

Bad: `把这棵树改得更梦幻一点`

Good: `保留苹果树结构，树冠改成蓝绿色，枝间增加发光蘑菇`

Bad: `给momo加一个漂亮装饰`

Good part: `粉色小花编成的圆形花环`

Good placement: `戴在头顶，两耳之间，保持水平`

Bad: `表现劳动时认真又快乐的感觉`

Good: `双手交替挥锤`

## Final Language Check

Delete or rewrite words that cannot be verified visually: `感觉`, `氛围`, `治愈`, `高级`, `有趣`, `特别`, `漂亮`, `神奇`, `适合`, `充满`, `表现出`.

Keep them only in planner context or dialogue, never as the sole generation instruction.
