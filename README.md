# 纽约 3D 地图 Demo（10.16 黑客松）

风格按 `UI_newyork.png`（M1 纽约总览）和 `UI2_newyork.png`（M2 Brooklyn 落点）做：楼都是简化后的几何块，只画纽约五个区。

## 怎么跑
```bash
cd ~/Downloads/01_1016_黑客松
python3 -m http.server 5180
```
打开 http://127.0.0.1:5180 。
- 不能直接双击 index.html：浏览器会拦截读取 `nyc.geojson`。
- **地图本身可以离线跑。** 地图数据和 MapLibre 都在本地，不连网也能画出来。只有字体从 Google Fonts 加载，断网时会退回系统字体。

## 文件
| 文件 | 内容 |
|---|---|
| `index.html` | 整个 Demo：样式、地图、按钮、图钉都在这一个文件里 |
| `nyc.geojson` | 预先算好的全部地图几何（1.4 MB） |
| `lib/` | MapLibre GL JS 5.6.0（本地副本，不走 CDN） |
| `截图/` | 桌面和手机的总览、落点截图，以及一段往返转场录屏 |
| `旧版/` | 上一版：用 OpenFreeMap 瓦片画的真实建筑，楼块很多 |

## 地图里有什么（全部来自 `nyc.geojson`，提前算好）
| 名称 | 用途 | 数量 | 数据来源 |
|---|---|---|---|
| `borough` | 五个区的板块（总览用）。Brooklyn 青柠色，其余区蓝绿色，表面带网格纹理 | 5 | NYC Open Data |
| `shore` | Brooklyn、Manhattan 的精细岸线。近景用作地面，以及青柠色的 Brooklyn 水岸线 | 2 | NYC Open Data |
| `block` | 近景地面的方块网格：70 m 一格，斜 25°，所以斜看时像菱形 | 4,754 | 根据岸线生成 |
| `bar` | 近景光柱：每 3×3 格只留最高的一栋，而且只保留 ≥45 m 的楼 | 158 | OSM 建筑高度 |
| `citybar` | 总览光柱：约 450 m 一格取最高楼，只保留 ≥110 m、在五区内的楼（新泽西的楼已排除） | 120 | OSM 建筑高度 |
| `bridge` / `tower` | Brooklyn Bridge、Manhattan Bridge 的桥面和桥塔 | 2 / 4 | OSM |
| `ring` | 总览里围绕 Brooklyn 的雷达圈 | 3 | 生成 |

飞入 Brooklyn 时，板块会随缩放沉到地面，同时近景的方块网格淡入。这个效果完全由 zoom 表达式驱动，不在每一帧做计算。

**光柱只是示意。** 位置和高度来自 OSM，但做过合并，一根光柱不等于一栋真实的楼。

## 数据来源
- **区界**：NYC Open Data「Borough Boundaries」(`gthc-hcne`)，NYC Department of City Planning 发布，2026-10-15 下载。
  - 总览板块：简化容差约 30 m，去掉小于 1.5e-4 deg² 的岛。
  - 近景岸线：简化容差约 4 m。
- **建筑高度、桥梁**：© OpenStreetMap contributors (ODbL)，2026-10-15 通过 Overpass API 查询。
  - 高度取 `height` 标签；没有的话用 `building:levels × 3.2 m` 估算。
  - 桥塔位置是沿桥面按比例估的，不是测量值。
- **点位**：坐标用 OSM（Nominatim）核对过。
  | # | 地点 | 经度, 纬度 |
  |---|---|---|
  | 01 | Brooklyn Bridge Park — Pier 1 | -73.9962, 40.7027 |
  | 02 | DUMBO — Washington Street | -73.9897, 40.7031 |
  | 03 | Brooklyn Heights Promenade | -73.9978, 40.6964 |
  | 04 | Domino Park | -73.9683, 40.7141 |

## 重新生成 `nyc.geojson`
生成脚本 `build_nyc.py` 和它用的原始数据（区界 + Overpass 查询结果）为了少放文件，都没放进这个文件夹，只存在 Claude 这次对话的临时目录里。**这次对话之后就找不回来了。**之后想改格子大小、光柱密度或网格角度，要么先让 Claude 把脚本和数据存进来，要么重新下载数据再生成。

## 镜头参数（`views()`）
| | 桌面 | 手机（竖屏） |
|---|---|---|
| NYC | zoom 10.45 / pitch 55 / bearing -28 | zoom 9.0 / pitch 55 / bearing -20 |
| Brooklyn | zoom 14.8 / pitch 66 / bearing 10 | zoom 13.9 / pitch 66 / bearing 30 |

Brooklyn 视角是按"四个点都要避开头部和底部卡片"算出来的。

## 已知限制
- **四个点位和新设计稿不一致。** 用的是任务文档里的四个点。`UI2_newyork.png` 里是三个 DUMBO 点（Subway station / Pier 1 railing / Bridge Park lawn）。如果换成设计稿的三个点，可以放得更近，构图也更像设计稿。
- **落点 zoom 低于要求。** 因为 Domino Park 离其他三个点约 2 km，落点 zoom（桌面 14.8、手机 13.9）都低于任务要求的 15–16。
- **手机总览里 Manhattan 标签被 BROOKLYN 卡片挡住了。**
- **图钉缩略图是简单的 SVG 插画，不是真实照片。**
- **帧率只在无头 Chrome 里测过。** 软件渲染下，录屏在 18 秒里拿到 645 帧（约 35 fps）；旧版的真实建筑同样条件下只有约 8 fps。真机没有测过。
