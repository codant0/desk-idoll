# 08 - 打包配置 + 默认资源 模块设计文档

> 日期: 2026-06-07
> 模块: 打包与分发 (Packaging & Distribution)
> 状态: Draft

---

## 1. 模块职责

本模块定义 Desk-Idoll 的完整打包流程、安装器配置、应用图标规范、默认资源文件结构和构建脚本。目标是让项目可以通过 `electron-builder` 一键构建出可分发的 Windows 安装包和便携版可执行文件。

**核心产出:**
- `electron-builder.yml` — 完整打包配置
- `resources/icon.ico` — Windows 应用图标（多尺寸）
- `src/assets/default-pet/` — 默认桌宠 sprite sheet（首次运行即有可演示的桌宠）
- `src/assets/tray-icon.png` — 系统托盘图标
- `package.json` scripts — 开发/构建/打包命令集
- `.gitignore` — 版本控制排除规则

---

## 2. electron-builder.yml — 完整打包配置

文件路径: `electron-builder.yml`（项目根目录）

```yaml
# ============================================================
# Desk-Idoll — electron-builder 打包配置
# ============================================================
# 文档: https://www.electron.build/configuration
# ============================================================

appId: com.desk-idoll.app
productName: Desk-Idoll
copyright: Copyright (c) 2026 Desk-Idoll Contributors

# ------------------------------------------------------------
# 目录约定（与 electron-vite 输出对齐）
# ------------------------------------------------------------
directories:
  buildResources: build          # 构建资源目录（图标等）
  output: release                # 打包输出目录
  app: dist                      # electron-vite 编译输出

# ------------------------------------------------------------
# 文件包含规则
# 只打包编译产物和必要资源，排除源码和开发文件
# ------------------------------------------------------------
files:
  - dist/**/*
  - "!node_modules/**/*.{md,txt,map}"
  - "!node_modules/**/test{,s}/**"
  - "!node_modules/**/doc{,s}/**"
  - "!node_modules/**/example{,s}/**"
  - "!node_modules/**/.{eslintrc,prettierrc,babelrc}.*"
  - "!**/*.map"
  - "!**/*.ts"
  - "!**/*.vue"
  - "!**/tsconfig*.json"
  - "!**/.gitignore"
  - "!**/README.md"
  - "!**/CHANGELOG.md"
  - "!**/LICENSE{,.md,.txt}"

# ------------------------------------------------------------
# extraResources — 打包时额外复制的资源
# 这些文件会被放到安装目录的 resources/ 子目录下
# 在代码中通过 process.resourcesPath 访问
# ------------------------------------------------------------
extraResources:
  - from: "src/assets/default-pet/"
    to: "default-pet/"
    filter:
      - "**/*"
  - from: "src/assets/tray-icon.png"
    to: "tray-icon.png"

# ------------------------------------------------------------
# Windows 目标平台配置
# 同时输出 nsis 安装包和 portable 便携版
# ------------------------------------------------------------
win:
  target:
    - target: nsis
      arch:
        - x64
    - target: portable
      arch:
        - x64
  icon: resources/icon.ico
  requestedExecutionLevel: asInvoker   # 不请求管理员权限
  artifactName: "${productName}-${version}-${arch}-setup.${ext}"

# portable 便携版配置
portable:
  artifactName: "${productName}-${version}-portable.${ext}"
  # splashImage: resources/installer-splash.bmp  # 可选：启动画面

# ------------------------------------------------------------
# NSIS 安装器配置
# ------------------------------------------------------------
nsis:
  oneClick: false                     # 允许自定义安装目录
  allowToChangeInstallationDirectory: true
  allowElevation: true
  installerIcon: resources/icon.ico
  uninstallerIcon: resources/icon.ico
  installerHeaderIcon: resources/icon.ico
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Desk-Idoll
  menuCategory: true                  # 开始菜单中创建子文件夹
  perMachine: false                   # 安装到当前用户目录
  deleteAppDataOnUninstall: false     # 卸载时保留用户配置
  runAfterFinish: true                # 安装完成后立即运行
  artifactName: "${productName}-${version}-setup.${ext}"
  license: LICENSE                    # 可选：许可证文件路径
  # installerLanguages: ["zh_CN", "en_US"]  # 安装器语言（nsis 多语言需要额外配置）

# ------------------------------------------------------------
# macOS 配置（预留，当前不使用）
# ------------------------------------------------------------
# mac:
#   target:
#     - target: dmg
#       arch:
#         - x64
#         - arm64
#   icon: resources/icon.icns
#   category: public.app-category.entertainment

# ------------------------------------------------------------
# asar 打包配置
# ------------------------------------------------------------
asar: true
asarUnpack:
  - "resources/**"

# ------------------------------------------------------------
# 发布配置（预留）
# ------------------------------------------------------------
# publish:
#   provider: github
#   owner: your-github-username
#   repo: desk-idoll
#   releaseType: release
```

### 2.1 配置说明

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `appId` | `com.desk-idoll.app` | 应用唯一标识，用于 Windows 注册表和更新检测 |
| `productName` | `Desk-Idoll` | 显示在安装器、快捷方式、任务栏中的应用名称 |
| `win.target` | `nsis` + `portable` | 同时输出安装包（.exe）和免安装便携版（.exe） |
| `win.icon` | `resources/icon.ico` | 应用图标，嵌入到 .exe 文件中 |
| `nsis.oneClick` | `false` | 允许用户选择安装目录，而非一键安装到默认路径 |
| `nsis.deleteAppDataOnUninstall` | `false` | 卸载时保留 `%APPDATA%/desk-idoll/` 中的用户配置 |
| `asar` | `true` | 将应用代码打包为单个 asar 归档文件，加快读取 |
| `asarUnpack` | `resources/**` | 将默认资源从 asar 中解压，确保运行时可直接访问文件路径 |

---

## 3. 应用图标制作规范

### 3.1 icon.ico — Windows 应用图标

文件路径: `resources/icon.ico`

ICO 格式支持在一个文件中嵌入多个尺寸的图标，Windows 会根据显示场景自动选择合适的尺寸。

**必须包含的尺寸:**

| 尺寸 (px) | 用途 |
|-----------|------|
| 16x16 | 窗口标题栏、任务栏小图标、系统托盘 |
| 32x32 | 桌面快捷方式（小图标）、Alt+Tab 缩略图 |
| 48x48 | 桌面快捷方式（中图标）、文件资源管理器详细视图 |
| 64x64 | 文件资源管理器平铺视图 |
| 128x128 | 文件资源管理器超大图标 |
| 256x256 | 安装器标题栏、Windows Vista+ 大图标视图、缩略图缓存 |

**制作方式:**

```bash
# 使用 ImageMagick 从 PNG 生成 ICO（包含所有尺寸）
convert icon-256.png \
  \( -clone 0 -resize 128x128 \) \
  \( -clone 0 -resize 64x64 \) \
  \( -clone 0 -resize 48x48 \) \
  \( -clone 0 -resize 32x32 \) \
  \( -clone 0 -resize 16x16 \) \
  icon.ico
```

**设计要求:**
- 背景透明（PNG 带 alpha 通道）
- 256x256 起始图需为正方形，分辨率不低于 256x256
- 避免过多细节在小尺寸（16x16）下丢失，设计时优先确保小尺寸辨识度
- 推荐使用 IcoFX、Greenfish Icon Editor 或在线工具 realfavicongenerator.net 制作

### 3.2 icon.png — 开发环境应用图标

文件路径: `resources/icon.png`

开发模式下 electron-builder 未参与，直接使用 PNG 格式图标。

| 属性 | 要求 |
|------|------|
| 尺寸 | 512x512 px |
| 格式 | PNG-24（带 alpha 透明通道） |
| 用途 | 开发模式下 `BrowserWindow.icon` 配置 |

```typescript
// 开发环境使用 PNG 图标
const iconPath = isDev
  ? path.join(__dirname, '../../resources/icon.png')
  : path.join(process.resourcesPath, 'icon.ico');
```

### 3.3 tray-icon.png — 系统托盘图标

文件路径: `src/assets/tray-icon.png`

| 属性 | 要求 |
|------|------|
| 尺寸 | 16x16 px（Windows 托盘标准尺寸） |
| 格式 | PNG-24（带 alpha 透明通道） |
| 风格 | 与应用图标一致的简化版本，高对比度，辨识度高 |
| 用途 | `Tray` 构造函数的图标参数 |

**设计注意事项:**
- Windows 托盘区域背景为深色（任务栏），图标应为浅色/白色主体
- 避免使用过多渐变，16x16 像素下需要清晰可辨
- 可准备 16x16 和 32x32 两个版本（高 DPI 显示器自动使用 32x32）

```typescript
// 托盘图标加载
const trayIconPath = isDev
  ? path.join(__dirname, '../assets/tray-icon.png')
  : path.join(process.resourcesPath, 'default-pet', '../tray-icon.png');

const tray = new Tray(trayIconPath);
```

---

## 4. 默认资源文件

首次安装后，应用自带一套默认桌宠资源，确保用户无需上传任何文件即可体验完整的桌宠功能。

### 4.1 文件清单

```
src/assets/
  default-pet/
    spritesheet.json        # Sprite Sheet 配置（帧数据 + 动画定义）
    spritesheet.png         # 精灵图合集（所有动画帧排列在一张图上）
  tray-icon.png             # 系统托盘图标（16x16）

resources/
  icon.ico                  # Windows 应用图标（多尺寸 ICO）
  icon.png                  # 开发环境应用图标（512x512 PNG）
```

### 4.2 spritesheet.png — 默认精灵图

**图片规格:**

| 属性 | 要求 |
|------|------|
| 总尺寸 | 768 x 640 px（6 列 x 5 行，每帧 128x128） |
| 帧尺寸 | 128 x 128 px |
| 格式 | PNG-32（带 alpha 透明通道） |
| 色彩空间 | sRGB |
| 背景 | 完全透明（alpha = 0） |

**内容要求:**

默认桌宠应为一个简单的卡通角色（如小方块人、小动物、像素角色），风格参考经典 Shimeji 桌宠。角色应居中放置在每个 128x128 的帧中，四周留有透明边距以便于碰撞检测和视觉效果。

**各动画状态的画面描述:**

| 动画状态 | 帧数 | 画面描述 |
|----------|------|----------|
| `idle` | 4 帧 | 角色站立不动，轻微呼吸/摇摆动画（如身体微微上下浮动、眨眼等） |
| `walk` | 6 帧 | 角色左右行走的完整步态循环（腿部交替迈步、手臂自然摆动） |
| `drag` | 2 帧 | 角色被拖拽时的姿态（如双手张开、表情惊讶、身体后仰） |
| `fall` | 2 帧 | 角色在空中下落的姿态（如双手上举、头发/耳朵向上飘） |
| `click` | 4 帧 | 角色被点击时的反馈动画（如弹跳、冒星星、跳跃后落地） |

### 4.3 托盘图标与应用图标

见第 3 节的详细规范。

---

## 5. 默认 Sprite Sheet 详细规范

### 5.1 帧布局规范

精灵图采用网格布局，每个动画状态占用一行，帧从左到右排列：

```
spritesheet.png 布局（768 x 640 px）:

行 0 (y=0):   | idle_0 | idle_1 | idle_2 | idle_3 |   (空)  |   (空)  |
行 1 (y=128): | walk_0 | walk_1 | walk_2 | walk_3 | walk_4 | walk_5 |
行 2 (y=256): | drag_0 | drag_1 |   (空)  |   (空)  |   (空)  |   (空)  |
行 3 (y=384): | fall_0 | fall_1 |   (空)  |   (空)  |   (空)  |   (空)  |
行 4 (y=512): | click_0| click_1| click_2| click_3|   (空)  |   (空)  |

每帧: 128 x 128 px
最大宽度: 6 x 128 = 768 px
最大高度: 5 x 128 = 640 px
```

### 5.2 spritesheet.json — 完整配置

文件路径: `src/assets/default-pet/spritesheet.json`

```json
{
  "frames": {
    "idle_0": {
      "frame": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "idle_1": {
      "frame": { "x": 128, "y": 0, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "idle_2": {
      "frame": { "x": 256, "y": 0, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "idle_3": {
      "frame": { "x": 384, "y": 0, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "walk_0": {
      "frame": { "x": 0, "y": 128, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "walk_1": {
      "frame": { "x": 128, "y": 128, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "walk_2": {
      "frame": { "x": 256, "y": 128, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "walk_3": {
      "frame": { "x": 384, "y": 128, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "walk_4": {
      "frame": { "x": 512, "y": 128, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "walk_5": {
      "frame": { "x": 640, "y": 128, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "drag_0": {
      "frame": { "x": 0, "y": 256, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "drag_1": {
      "frame": { "x": 128, "y": 256, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "fall_0": {
      "frame": { "x": 0, "y": 384, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "fall_1": {
      "frame": { "x": 128, "y": 384, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "click_0": {
      "frame": { "x": 0, "y": 512, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "click_1": {
      "frame": { "x": 128, "y": 512, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "click_2": {
      "frame": { "x": 256, "y": 512, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    },
    "click_3": {
      "frame": { "x": 384, "y": 512, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    }
  },
  "animations": {
    "idle": ["idle_0", "idle_1", "idle_2", "idle_3"],
    "walk": ["walk_0", "walk_1", "walk_2", "walk_3", "walk_4", "walk_5"],
    "drag": ["drag_0", "drag_1"],
    "fall": ["fall_0", "fall_1"],
    "click": ["click_0", "click_1", "click_2", "click_3"]
  },
  "meta": {
    "app": "Desk-Idoll",
    "version": "1.0.0",
    "image": "spritesheet.png",
    "format": "RGBA8888",
    "size": { "w": 768, "h": 640 },
    "scale": "1",
    "smartupdate": "$TexturePacker:SmartUpdate:placeholder"
  }
}
```

### 5.3 动画播放参数

应用内部使用以下默认参数驱动动画播放:

```typescript
// src/shared/constants.ts — 默认动画参数
export const DEFAULT_ANIMATION_CONFIG = {
  frameWidth: 128,
  frameHeight: 128,
  fps: 12,                    // 全局默认帧率
  states: {
    idle:  { start: 0, end: 3, loop: true  },  // 4 帧，循环
    walk:  { start: 0, end: 5, loop: true  },  // 6 帧，循环
    drag:  { start: 0, end: 1, loop: true  },  // 2 帧，循环
    fall:  { start: 0, end: 1, loop: false },  // 2 帧，不循环（播放一次后停在最后一帧）
    click: { start: 0, end: 3, loop: false },  // 4 帧，不循环（播放完成后回到 idle）
  },
} as const;
```

### 5.4 PixiJS 加载示例

```typescript
// Renderer 中加载默认 sprite sheet 的代码示例
import { Assets, AnimatedSprite } from 'pixi.js';

async function loadDefaultPet() {
  // 开发环境从 src/assets 加载，生产环境从 extraResources 加载
  const basePath = isDev
    ? '/src/assets/default-pet'
    : `${process.resourcesPath}/default-pet`;

  const spritesheet = await Assets.load(`${basePath}/spritesheet.json`);

  const idleSprite = new AnimatedSprite(spritesheet.animations.idle);
  idleSprite.animationSpeed = 1 / 12;  // 12 fps
  idleSprite.loop = true;
  idleSprite.play();

  return idleSprite;
}
```

---

## 6. 构建脚本

### 6.1 package.json scripts 配置

文件路径: `package.json`

```jsonc
{
  "name": "desk-idoll",
  "version": "0.1.0",
  "description": "Windows 桌面桌宠应用",
  "main": "dist/main/index.js",
  "author": "Desk-Idoll Contributors",
  "license": "MIT",
  "scripts": {
    // --------------------------------------------------------
    // 开发
    // --------------------------------------------------------

    // 启动开发模式（主进程 + 渲染进程热更新）
    "dev": "electron-vite dev",

    // 仅构建（不启动 Electron），用于检查编译输出
    "dev:build": "electron-vite build",

    // 预览模式（先构建再启动，接近生产环境）
    "preview": "electron-vite preview",

    // --------------------------------------------------------
    // 构建
    // --------------------------------------------------------

    // 编译 TypeScript → JavaScript（主进程 + 预加载 + 渲染进程）
    "build": "electron-vite build",

    // TypeScript 类型检查（不输出文件）
    "typecheck": "tsc --noEmit && electron-vite typecheck",

    // --------------------------------------------------------
    // 打包
    // --------------------------------------------------------

    // 打包为未压缩的应用目录（不生成安装包，用于调试）
    "pack": "electron-vite build && electron-builder --dir",

    // 构建并生成 Windows 安装包（nsis + portable）
    "dist": "electron-vite build && electron-builder --win",

    // 仅生成 nsis 安装包
    "dist:nsis": "electron-vite build && electron-builder --win --target nsis",

    // 仅生成便携版
    "dist:portable": "electron-vite build && electron-builder --win --target portable",

    // --------------------------------------------------------
    // 其他
    // --------------------------------------------------------

    // 安装原生模块的 Electron 版本依赖
    "postinstall": "electron-builder install-app-deps",

    // 清理构建输出
    "clean": "rimraf dist release",

    // 代码规范检查
    "lint": "eslint src/ --ext .ts,.tsx",

    // 代码格式化
    "format": "prettier --write src/"
  },
  "dependencies": {
    "electron-store": "^8.2.0",
    "pixi.js": "^8.6.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "electron": "^33.3.0",
    "electron-builder": "^25.1.0",
    "electron-vite": "^2.4.0",
    "eslint": "^9.0.0",
    "prettier": "^3.4.0",
    "rimraf": "^6.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

### 6.2 脚本用途速查

| 命令 | 用途 | 产出 |
|------|------|------|
| `npm run dev` | 开发模式，带热更新 | 无文件产出，内存中运行 |
| `npm run build` | 仅编译 TypeScript | `dist/` 目录 |
| `npm run pack` | 打包为应用目录（调试用） | `release/win-unpacked/` |
| `npm run dist` | 完整打包，生成安装包 | `release/Desk-Idoll-*-setup.exe` + `release/Desk-Idoll-*-portable.exe` |
| `npm run dist:nsis` | 仅生成 NSIS 安装包 | `release/Desk-Idoll-*-setup.exe` |
| `npm run dist:portable` | 仅生成便携版 | `release/Desk-Idoll-*-portable.exe` |
| `npm run postinstall` | 安装原生依赖 | 无（自动在 npm install 后运行） |
| `npm run typecheck` | TypeScript 类型检查 | 无（仅检查，不输出） |
| `npm run clean` | 清理构建产物 | 删除 `dist/` 和 `release/` |

### 6.3 构建流程图

```
npm run dist
  │
  ├─ 1. electron-vite build
  │     ├─ 编译 src/main/       → dist/main/
  │     ├─ 编译 src/preload/    → dist/preload/
  │     └─ 编译 src/renderer/   → dist/renderer/
  │
  └─ 2. electron-builder --win
        ├─ 读取 electron-builder.yml
        ├─ 收集 dist/ + extraResources
        ├─ asar 打包 → app.asar
        ├─ 生成 NSIS 安装包 → release/Desk-Idoll-0.1.0-setup.exe
        └─ 生成便携版 → release/Desk-Idoll-0.1.0-portable.exe
```

---

## 7. 打包优化

### 7.1 asar 打包配置

asar（Atom Shell Archive）将应用文件打包为单个归档文件，优点:

- 减少文件系统调用次数，加快启动速度
- 避免路径过长问题（Windows MAX_PATH 限制）
- 防止用户直接修改源代码（仅基础保护）

```yaml
# electron-builder.yml
asar: true
asarUnpack:
  - "resources/**"    # 默认资源解压到文件系统，确保可直接用路径访问
```

**为什么需要 asarUnpack:**
- 部分 Node.js API（如 `child_process.exec`）对 asar 内的文件路径支持有限
- 原生模块（.node 文件）必须在 asar 外部
- 本项目中 `resources/` 目录下的默认资源需要在运行时通过文件路径直接访问

### 7.2 文件排除规则

以下文件/目录在打包时应被排除，以减小安装包体积:

```yaml
# electron-builder.yml — files 配置
files:
  # 必须包含
  - dist/**/*

  # 排除 node_modules 中的非必要文件
  - "!node_modules/**/*.{md,txt,map,ts,flow}"
  - "!node_modules/**/test{,s}/**"
  - "!node_modules/**/doc{,s}/**"
  - "!node_modules/**/example{,s}/**"
  - "!node_modules/**/benchmark{,s}/**"
  - "!node_modules/**/.{eslintrc,prettierrc,babelrc}.*"
  - "!node_modules/**/.github/**"
  - "!node_modules/**/.vscode/**"
  - "!node_modules/**/*.d.ts"
  - "!node_modules/**/CHANGELOG{,.md}"
  - "!node_modules/**/LICENSE{,.md,.txt}"

  # 排除开发专用依赖
  - "!node_modules/@types/**"
  - "!node_modules/typescript/**"
  - "!node_modules/eslint/**"
  - "!node_modules/prettier/**"
  - "!node_modules/vite/**"
  - "!node_modules/electron-vite/**"

  # 排除源码和配置文件
  - "!**/*.ts"
  - "!**/*.tsx"
  - "!**/tsconfig*.json"
  - "!**/.gitignore"
  - "!**/.env*"
```

**预估体积影响:**

| 排除规则 | 预估减少 |
|----------|---------|
| node_modules 测试/文档/示例 | ~20-50 MB |
| TypeScript 类型定义 (.d.ts) | ~5-15 MB |
| 开发依赖（eslint, prettier, vite 等） | ~100-200 MB |
| 源码 .ts 文件 | ~1-2 MB |

### 7.3 代码签名配置（可选，预留）

代码签名可以消除 Windows SmartScreen 警告，提升用户信任度。以下为预留配置:

```yaml
# electron-builder.yml — 代码签名配置

# 方式一: 使用代码签名证书文件
# win:
#   sign: ./scripts/sign.js        # 自定义签名脚本
#   signingHashAlgorithms:
#     - sha256
#   certificateFile: cert.pfx
#   certificatePassword: ${CERTIFICATE_PASSWORD}  # 从环境变量读取
#   rfc3161TimeStampServer: http://timestamp.digicert.com

# 方式二: 使用 Azure Key Vault（推荐用于 CI/CD）
# win:
#   sign: ./scripts/sign.js
#   azureSignOptions:
#     endpoint: https://YOUR_VAULT_NAME.vault.azure.net
#     certificateName: YOUR_CERT_NAME
```

**自定义签名脚本**（当默认签名不满足需求时）:

```javascript
// scripts/sign.js
// 文档: https://www.electron-builder.win/code-signing

exports.default = async function(configuration) {
  // doNotSign: 不签名（开发环境）
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') {
    return;
  }

  // 使用 signtool.exe 签名
  // electron-builder 会自动调用此脚本
  const { execSync } = require('child_process');

  const signtool = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\x64\\signtool.exe';
  const certPath = configuration.path;
  const password = process.env.CERTIFICATE_PASSWORD;

  execSync(
    `"${signtool}" sign /f "${certPath}" /p "${password}" /tr http://timestamp.digicert.com /td sha256 /fd sha256 "${configuration.path}"`,
    { stdio: 'inherit' }
  );
};
```

**开发阶段跳过签名:**

```bash
# 设置环境变量跳过签名
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run dist
```

---

## 8. .gitignore 完整配置

文件路径: `.gitignore`

```gitignore
# ============================================================
# Desk-Idoll — .gitignore
# ============================================================

# ------------------------------------------------------------
# 依赖
# ------------------------------------------------------------
node_modules/

# ------------------------------------------------------------
# 构建与打包输出
# ------------------------------------------------------------
dist/
out/
release/
build/

# ------------------------------------------------------------
# 环境变量与密钥
# ------------------------------------------------------------
.env
.env.local
.env.*.local
*.pfx
*.pem

# ------------------------------------------------------------
# 日志
# ------------------------------------------------------------
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# ------------------------------------------------------------
# 编辑器与 IDE
# ------------------------------------------------------------
.vscode/
!.vscode/extensions.json
!.vscode/settings.json
.idea/
*.swp
*.swo
*~

# ------------------------------------------------------------
# 操作系统
# ------------------------------------------------------------
.DS_Store
Thumbs.db
ehthumbs.db
Desktop.ini

# ------------------------------------------------------------
# Electron 相关
# ------------------------------------------------------------
# electron-builder 缓存
node_modules/.cache/

# ------------------------------------------------------------
# 测试覆盖率
# ------------------------------------------------------------
coverage/
.nyc_output/

# ------------------------------------------------------------
# 临时文件
# ------------------------------------------------------------
tmp/
temp/
*.tmp
*.temp

# ------------------------------------------------------------
# TypeScript
# ------------------------------------------------------------
*.tsbuildinfo
```

---

## 9. 目录结构总览

```
desk-idoll/
├── .gitignore                          # Git 忽略规则
├── electron-builder.yml                # 打包配置
├── electron.vite.config.ts             # electron-vite 构建配置
├── package.json                        # 项目配置 + 构建脚本
├── tsconfig.json                       # TypeScript 根配置
├── tsconfig.node.json                  # Node.js (主进程) TS 配置
├── tsconfig.web.json                   # Web (渲染进程) TS 配置
│
├── resources/                          # 构建资源（打包时使用）
│   ├── icon.ico                        # Windows 应用图标（多尺寸 ICO）
│   └── icon.png                        # 开发环境应用图标（512x512 PNG）
│
├── src/
│   ├── assets/                         # 应用资源（运行时使用）
│   │   ├── default-pet/
│   │   │   ├── spritesheet.json        # 默认 sprite sheet 配置
│   │   │   └── spritesheet.png         # 默认精灵图（768x640，128x128/帧）
│   │   └── tray-icon.png              # 系统托盘图标（16x16）
│   │
│   ├── main/                           # Electron 主进程
│   ├── preload/                        # 预加载脚本
│   ├── renderer/                       # 桌宠渲染进程
│   ├── config/                         # 配置窗口渲染进程
│   └── shared/                         # 共享类型和常量
│
├── docs/
│   ├── plans/                          # 设计规划文档
│   └── modules/                        # 模块设计文档
│       └── 08-packaging.md             # 本文档
│
└── release/                            # 打包输出（gitignore）
    ├── Desk-Idoll-0.1.0-setup.exe     # NSIS 安装包
    ├── Desk-Idoll-0.1.0-portable.exe  # 便携版
    └── win-unpacked/                   # 解压后的应用目录
```

---

## 10. 安装包用户体验流程

### 10.1 NSIS 安装流程

```
双击 Desk-Idoll-0.1.0-setup.exe
  │
  ├─ 1. 欢迎界面 — 显示应用图标和名称
  ├─ 2. 许可协议 — 显示 LICENSE 文件内容（可选）
  ├─ 3. 选择安装目录 — 默认 C:\Users\<用户>\AppData\Local\Programs\Desk-Idoll
  ├─ 4. 选择附加任务 — 创建桌面快捷方式 / 创建开始菜单快捷方式
  ├─ 5. 安装 — 复制文件到目标目录
  ├─ 6. 完成 — 可选"立即运行 Desk-Idoll"
  │
  └─ 安装后目录结构:
     C:\Users\<用户>\AppData\Local\Programs\Desk-Idoll\
       ├── Desk-Idoll.exe           # 主程序
       ├── resources/
       │   ├── app.asar             # 应用代码
       │   ├── default-pet/         # 默认资源（从 asar 解压）
       │   │   ├── spritesheet.json
       │   │   └── spritesheet.png
       │   └── tray-icon.png
       └── ...
```

### 10.2 便携版使用流程

```
双击 Desk-Idoll-0.1.0-portable.exe
  │
  └─ 直接运行，无需安装
     首次运行时自动在 %APPDATA%/desk-idoll/ 创建配置目录
```

---

## 11. CI/CD 集成（预留）

### GitHub Actions 示例

```yaml
# .github/workflows/build.yml
name: Build

on:
  push:
    tags:
      - 'v*'

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run dist

      - uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: |
            release/*.exe

      - name: Create Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            release/*.exe
```

---

## 12. 常见问题

### Q: 为什么需要同时配置 nsis 和 portable 两种目标？

NSIS 安装包适合需要长期使用的用户（注册到系统、创建快捷方式、支持卸载）。便携版适合临时使用或不想修改系统的用户（U盘携带、绿色软件）。

### Q: extraResources 和 asar 的关系是什么？

`asar: true` 会将 `dist/` 下的所有文件打包为 `app.asar` 归档。`extraResources` 指定的文件会被复制到 `resources/` 目录下（在 asar 外部）。代码中通过 `process.resourcesPath` 获取 `resources/` 目录路径来访问这些文件。

### Q: 默认资源为什么放在 src/assets 而不是 resources？

`src/assets/` 中的文件会被 electron-vite 处理（如哈希、压缩），适合渲染进程直接 import 使用。`resources/` 中的文件在打包时原样复制，适合主进程通过文件路径访问。默认 sprite sheet 既需要渲染进程加载（PixiJS），也需要通过文件路径引用，所以放在 `src/assets/` 并通过 `extraResources` 复制到 `resources/`。

### Q: 如何测试打包结果？

```bash
# 1. 先用 pack 命令打包为目录（比 dist 快，不生成安装器）
npm run pack

# 2. 直接运行解压后的可执行文件
./release/win-unpacked/Desk-Idoll.exe

# 3. 确认无误后再用 dist 生成正式安装包
npm run dist
```
