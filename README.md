# 纽约 3D 地图 Demo（10.16 黑客松）

风格按 `UI_newyork.png`（M1 纽约总览）和 `UI2_newyork.png`（M2 Brooklyn 落点）做，只画纽约五个区。

**演示流程：** 打开是纽约总览 → 点 Enter Brooklyn → Brooklyn「点亮」（板块变亮、轮廓光晕变大、BOROUGHS LIT 0/5 → 1/5，约 1 秒）→ 俯冲进 DUMBO（4 秒），真实楼宇随镜头拉近从地面升起 → 落在你拍视频的 4 个点，底部卡片播放对应视频。

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
| `00_video/` | 你在 DUMBO 拍的视频；其中 4 段用作点位视频 |

## 地图里有什么（全部来自 `nyc.geojson`，提前算好）
| 名称 | 用途 | 数量 | 数据来源 |
|---|---|---|---|
| `borough` | 五个区的板块（总览用）。Brooklyn 青柠色，其余区蓝绿色，表面带网格纹理 | 5 | NYC Open Data |
| `shore` | Brooklyn、Manhattan 的精细岸线。近景用作地面，以及青柠色的 Brooklyn 水岸线 | 2 | NYC Open Data |
| `bldg` | DUMBO 核心区（半径 520 m）的真实楼宇轮廓和高度；zoom 14.2→15.7 之间从地面升到实际高度 | 306 | OSM（392/424 栋有 `height` 标签，其余用楼层估算或 10 m 兜底） |
| `block` | 核心区外的方块网格：70 m 一格，斜 15°，配合 bearing -60 斜看时像菱形 | 4,655 | 根据岸线生成 |
| `bar` | 核心区外的光柱：每 3×3 格只留最高的一栋，而且只保留 ≥45 m 的楼 | 151 | OSM 建筑高度 |
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
- **点位**：来自你拍的视频。视频文件里没有 GPS，位置是我看画面判断的，你确认过，再用 OSM（Nominatim）取坐标。精确到街区，不是精确到米。
  | # | 地点 | 视频 | 经度, 纬度 |
  |---|---|---|---|
  | 01 | Fulton Ferry Landing（桥下） | `01_布鲁克林桥下.mp4` | -73.9946, 40.7036 |
  | 02 | Empire Fulton Ferry 草坪 | `10_草坪看大桥.mp4` | -73.9919, 40.7046 |
  | 03 | Water Street 石子路 | `12_铁门石子路.mp4` | -73.9902, 40.7032 |
  | 04 | St. Ann's Warehouse 红砖院子 | `13_红砖院子_橙桌.mp4` | -73.9928, 40.7036 |
  - 图钉缩略图是从这 4 段视频截的帧，挑的都是没有人脸的帧，已嵌进 index.html，不占额外文件。

## 重新生成 `nyc.geojson`
生成脚本 `build_nyc.py` 和它用的原始数据（区界 + Overpass 查询结果）为了少放文件，都没放进这个文件夹，只存在 Claude 这次对话的临时目录里。**这次对话之后就找不回来了。**之后想改格子大小、光柱密度或网格角度，要么先让 Claude 把脚本和数据存进来，要么重新下载数据再生成。

## 镜头参数（`views()`）
| | 桌面 | 手机（竖屏） |
|---|---|---|
| NYC | zoom 10.45 / pitch 55 / bearing -28 | zoom 9.0 / pitch 55 / bearing -20 |
| DUMBO | zoom 16.2 / pitch 62 / bearing -60 | zoom 15.8 / pitch 62 / bearing -60 |

DUMBO 视角是按"四个点都要避开头部和底部卡片"算出来的。bearing -60 让 Manhattan 和两座桥出现在画面右上方，跟设计稿一致。

## 已知限制
- **落点 zoom 略高于任务要求。** 桌面 16.2、手机 15.8，任务要求是约 15–16；这是为了真正俯冲进 DUMBO 街区。
- **点位精度只到街区。** 位置是看画面判断的，不是 GPS。
- **楼宇高度来自 OSM，没有逐栋核对。** 少数没有高度标签的楼是估算值。
- **手机总览里 Manhattan 标签被 BROOKLYN 卡片挡住了。**
- **点亮只在第一次进 Brooklyn 时播放。** 之后来回都直接飞；刷新页面会重置。
- **帧率只在无头 Chrome 里测过。** 软件渲染下，往返录屏在约 21 秒里拿到 705 帧（约 33 fps）。真机没有测过。
