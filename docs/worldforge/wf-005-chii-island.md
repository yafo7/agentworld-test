# WF-005 Chii Island

This document is the production contract for the fifth WorldForge world. The
WorldForge map remains the editable source; Chii only consumes a confirmed,
versioned runtime publication.

## Source

- Chii world id: `wf-chii-island`
- WorldForge map id: `map-6ea55ad2-0d07-4161`
- Map size: `192 x 24 x 192`
- Terrain resolution: `129 x 129`
- Generation mode: `voxel`
- Runtime profile: `exploration`

## Master Layout

WorldForge north is positive Z. Sea level is Y=0.

| Region | Center | Height | Purpose |
| --- | --- | --- | --- |
| Forest temple | `(-53, 53)` | `2-6` | Dense forest, shrine clearing, winding dirt path |
| Mountain | `(0, 65)` | `4-6` | Rocky high ground and the source of the island waterway |
| Sakura grove | `(56, 48)` | `2-5` | Open cherry grove and lookout clearing |
| Waterfall basin | `(31, 3)` | `-1-2` | Upper stream, waterfall, pool, and central landmark |
| Windmill pastoral | `(-50, -32)` | `-1-2` | Fields, garden, windmill, and future home lots |
| Church town | `(38, -34)` | `-1-2` | Church, square, low houses, and stone roads |
| South beach spawn | `(-24, -72)` | `0-1` | Safe arrival point and path into the island |

The water route is continuous: mountain pond, north stream, waterfall, central
pool, south river, and sea. A walkable bridge connects pastoral and town. Main
paths must remain at least four metres wide and avoid slopes above 28 degrees.

## Transition Rules

- Use 12-20 metre broad transition bands instead of straight biome borders.
- Scatter three to five smaller 6-12 metre patches from each neighbouring
  biome inside the transition band.
- Forest to pastoral: fruit trees, shrubs, wild flowers, then open grass.
- Pastoral to town: fewer crops, low stone walls, roadside trees, then paving.
- Town to sakura: sparse cherry trees and a stone-lantern path.
- Sakura to mountain: fewer blossoms, more pine and exposed grey rock.
- Mountain to forest: mixed pine, broadleaf trees, and broken rock shelves.
- Keep buildings, roads, activity clearings, and water surfaces free of trees.

## Generation Batches

Each sentence is an independent WorldForge generate/refine request. Commit and
inspect each batch before continuing.

1. `创建四周环海的大岛，北部高山，南部缓坡，中间河谷。`
2. `西北布置茂密森林，包含古树、神殿、林间空地和土路。`
3. `北部抬高为岩石山地，保留从南侧上山的连续缓坡。`
4. `东北布置疏密相间的樱花林、草坡和观景空地。`
5. `北部山地增加浅溪，流向中央悬崖。`
6. `中央悬崖布置窄瀑布，下方连接圆形水潭。`
7. `中央水潭向南延伸宽缓河流，最终流入南侧海洋。`
8. `西南布置开阔田园，包含农田、风车、花园和土路。`
9. `东南布置温暖小镇，包含教堂、广场、低矮房屋和石路。`
10. Apply the five transition rules as separate refine requests.
11. `检查区域高度衔接，消除直线边界和意外陡坡。`
12. `清除建筑内部树木，移除重叠物体，保留活动空地。`

## Acceptance Gates

- One native WorldForge height field; no stitched runtime seams.
- All six regions are readable from terrain, vegetation, and landmarks.
- The water route is visually continuous and does not block every north-south
  route.
- The south spawn, bridge, activity spaces, and region paths are walkable.
- No trees inside buildings and no major object overlaps.
- Object budget targets 180-260 instances; repeated vegetation uses scatters.
- One shared confirmed render scheme is used across the whole island.
- Chii receives the world only through `sync:worldforge-worlds`; published JSON
  is never edited by hand.
