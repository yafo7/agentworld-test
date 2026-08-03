# Chii Island Art References

这里存放供 AI 与组内成员共同阅读的美术参考，不直接参与运行时加载。

## 目录

- `characters/`: 角色设定图、正侧背三视图、服装拆分图。
- `buildings/`: 建筑外观、立面、平面图和明确的地块尺寸。
- `scenes/`: 区域构图、路径、植被密度、昼夜与天气参考。
- `props/`: 家具、工具、活动道具及其相对人物比例。
- `materials/`: 木、石、玻璃、水、火、植被等材质气氛参考。

## 使用规则

1. 图片文件名使用稳定英文 id，例如 `mako-front.png`、`church-plan-5x8.png`。
2. 每张图在 `references.json` 登记主题、用途、来源和可否用于生成。
3. 角色优先提供正面、侧面、背面；建筑优先提供平面图与地块 `N x M`。
4. 参考图只帮助理解结构与风格，最终发送给后端的文字仍由 `$chii-prompts` 生成。
5. 不放入 API key、用户隐私、来源不明或无授权的商用素材。
6. 运行时模型仍写入 `public/generated/`，不要让游戏代码读取本目录。

## 最小登记示例

```json
{
  "id": "church-plan-5x8",
  "file": "buildings/church-plan-5x8.png",
  "subject": "哥特教堂平面图",
  "purpose": ["layout", "generation"],
  "footprint": { "width": 5, "depth": 8, "unit": "terrain_tile" },
  "source": "team-authored",
  "generationAllowed": true
}
```
