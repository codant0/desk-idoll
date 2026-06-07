# 模块 01: 项目脚手架 (Scaffolding)

> 日期: 2026-06-07
> 状态: 设计文档

---

## 目录

1. [项目初始化步骤](#1-项目初始化步骤)
2. [TypeScript 配置](#2-typescript-配置)
3. [Vite 配置](#3-vite-配置)
4. [package.json](#4-packagejson)
5. [共享类型定义](#5-共享类型定义)
6. [.gitignore 配置](#6-gitignore-配置)
7. [electron-builder.yml 基础配置](#7-electron-builderyml-基础配置)

---

## 1. 项目初始化步骤

### 1.1 使用 electron-vite 脚手架初始化

```bash
# 方式一: 使用 create 工具 (推荐)
npm create @quick-start/electron@latest desk-idoll -- --template vanilla-ts

# 方式二: 使用 degit 拉取模板
npx degit alex8088/electron-vite-boilerplate desk-idoll

# 进入项目目录
cd desk-idoll

# 安装依赖
npm install
```

> 选择 `vanilla-ts` 模板: 不引入前端框架 (Vue/React)，渲染层由 PixiJS 驱动，
> 保持轻量。TypeScript 开箱即用。

### 1.2 npm 依赖清单及版本号

#### 运行时依赖 (dependencies)

| 包名 | 版本范围 | 用途 |
|------|----------|------|
| `pixi.js` | `^8.19.0` | 2D 渲染引擎 (Sprite Sheet 动画) |
| `electron-store` | `^8.2.0` | 用户配置持久化 (JSON 存储) |

> `electron-store@8.x` 为 ESM-only 包，由 electron-vite 的 Vite 构建链处理，
> 无需额外配置。`pixi-live2d-display` 在 Phase 2 (Live2D 支持) 时再引入。

#### 开发依赖 (devDependencies)

| 包名 | 版本范围 | 用途 |
|------|----------|------|
| `electron` | `^33.0.0` | Electron 运行时 |
| `electron-vite` | `^2.3.0` | Vite 构建工具链 (main/preload/renderer) |
| `electron-builder` | `^25.1.0` | 打包分发 (NSIS/dmg/AppImage) |
| `@electron-toolkit/preload` | `^3.0.0` | preload 脚手架工具 |
| `@electron-toolkit/utils` | `^4.0.0` | Electron 主进程工具函数 |
| `@electron-toolkit/tsconfig` | `^2.0.0` | 共享 tsconfig 基础配置 |
| `typescript` | `^5.7.0` | TypeScript 编译器 |
| `vite` | `^6.0.0` | Vite 构建核心 |

### 1.3 项目目录结构

```
desk-idoll/
├── .vscode/                              # VS Code 工作区配置
│   └── launch.json                       # Electron 调试配置
├── build/                                # electron-builder 构建资源
│   └── icon.png                          # 应用图标源文件 (512x512 PNG)
├── docs/
│   ├── modules/                          # 模块设计文档
│   │   ├── 01-scaffolding.md
│   │   └── ...
│   └── plans/
│       └── 2026-06-07-desktop-pet-design.md
├── resources/                            # 打包时嵌入的静态资源
│   └── icon.ico                          # Windows 图标 (256x256, 多尺寸 ICO)
├── src/
│   ├── main/                             # Electron 主进程
│   │   ├── index.ts                      # 主进程入口
│   │   ├── windows/
│   │   │   ├── pet-window.ts             # 桌宠透明窗口管理
│   │   │   └── config-window.ts          # 配置窗口管理
│   │   ├── services/
│   │   │   ├── tray.ts                   # 系统托盘
│   │   │   ├── config-manager.ts         # 配置读写 (electron-store)
│   │   │   └── action-executor.ts        # 自定义动作执行器
│   │   └── ipc/
│   │       └── index.ts                  # IPC 通信注册
│   ├── preload/
│   │   ├── index.ts                      # preload 脚本 (contextBridge)
│   │   └── index.d.ts                    # preload 类型声明
│   ├── renderer/                         # 桌宠渲染进程
│   │   ├── index.html                    # 桌宠窗口 HTML
│   │   ├── src/
│   │   │   ├── main.ts                   # 渲染进程入口
│   │   │   ├── engine/
│   │   │   │   ├── render-engine.ts      # PixiJS 渲染引擎
│   │   │   │   ├── adapter.ts            # RenderAdapter 接口定义
│   │   │   │   ├── sprite-adapter.ts     # Sprite Sheet 适配器
│   │   │   │   ├── live2d-adapter.ts     # Live2D 适配器 (Phase 4)
│   │   │   │   ├── physics.ts            # 简单物理引擎
│   │   │   │   └── input.ts              # 鼠标输入处理
│   │   │   ├── state/
│   │   │   │   └── machine.ts            # 行为状态机
│   │   │   ├── env.d.ts                  # 渲染进程环境类型声明
│   │   │   └── vite-env.d.ts             # Vite 客户端类型声明
│   │   └── styles/
│   │       └── main.css                  # 渲染进程样式
│   ├── config/                           # 配置窗口渲染进程
│   │   ├── index.html                    # 配置窗口 HTML
│   │   └── src/
│   │       ├── main.ts                   # 配置窗口入口
│   │       ├── components/
│   │       │   ├── ImageUploader.ts      # 图片上传组件
│   │       │   ├── AnimationSettings.ts  # 动画参数调节
│   │       │   ├── AppearanceSettings.ts # 外观设置
│   │       │   ├── ActionEditor.ts       # 动作配置编辑器
│   │       │   ├── BehaviorSettings.ts   # 行为模式设置
│   │       │   └── PetPreview.ts         # 实时预览
│   │       ├── env.d.ts
│   │       └── vite-env.d.ts
│   ├── shared/                           # 跨进程共享代码
│   │   ├── types.ts                      # 共享类型定义
│   │   ├── constants.ts                  # 默认配置值、常量
│   │   └── ipc-channels.ts               # IPC 通道名枚举
│   └── assets/
│       ├── default-pet/                  # 内置默认桌宠素材
│       │   ├── spritesheet.json
│       │   └── spritesheet.png
│       └── tray-icon.png                 # 系统托盘图标
├── electron.vite.config.ts               # electron-vite 构建配置
├── electron-builder.yml                  # 打包分发配置
├── package.json                          # 项目元数据与脚本
├── tsconfig.json                         # TS 项目引用根配置
├── tsconfig.node.json                    # 主进程 + preload TS 配置
├── tsconfig.web.json                     # 渲染进程 TS 配置
└── .gitignore
```

---

## 2. TypeScript 配置

### 2.1 tsconfig.json (项目根 -- 项目引用)

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

**说明:**

| 字段 | 说明 |
|------|------|
| `files` | 空数组。根配置本身不编译任何文件，仅作为项目引用的入口 |
| `references` | 引用两个子配置：`tsconfig.node.json` 处理 Node 环境代码 (主进程 + preload)，`tsconfig.web.json` 处理浏览器环境代码 (渲染进程) |

> 采用 TypeScript **项目引用 (Project References)** 模式，`tsc --build` 可以
> 增量编译，IDE 也能正确区分两个不同的类型环境。

### 2.2 tsconfig.node.json (主进程 + Preload)

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": [
    "electron.vite.config.*",
    "src/main/**/*",
    "src/preload/**/*",
    "src/shared/**/*"
  ],
  "compilerOptions": {
    "composite": true,
    "types": ["electron-vite/node"],
    "outDir": "./out/ts-node",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@main/*": ["src/main/*"],
      "@preload/*": ["src/preload/*"]
    }
  }
}
```

**配置项说明:**

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `extends` | `@electron-toolkit/tsconfig/tsconfig.node.json` | 继承基础配置。该基础配置设置了 `target: esnext`, `module: esnext`, `strict: true`, `esModuleInterop: true`, `moduleResolution: bundler`, `resolveJsonModule: true`, `isolatedModules: true`, `skipLibCheck: true` 等 |
| `composite` | `true` | 启用项目引用支持，允许增量编译和跨项目引用 |
| `types` | `["electron-vite/node"]` | 仅加载 `electron-vite/node` 类型声明，包含 Node.js 和 Electron 主进程类型 |
| `outDir` | `"./out/ts-node"` | TypeScript 编译输出目录 (实际由 Vite 处理构建，此目录仅用于 `tsc --build` 增量检查) |
| `baseUrl` | `"."` | 路径别名基准目录为项目根 |
| `paths` | 见右侧 | 路径别名，`@shared/*` 指向共享代码，`@main/*` 指向主进程，`@preload/*` 指向 preload 脚本 |
| `include` | 见数组 | 包含主进程、preload、共享代码和 Vite 配置文件 |

> `@electron-toolkit/tsconfig/tsconfig.node.json` 继承自基础配置并额外添加了
> `"types": ["node"]`，因此 Node.js 内置模块的类型是可用的。

### 2.3 tsconfig.web.json (渲染进程)

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.web.json",
  "include": [
    "src/renderer/src/**/*",
    "src/renderer/src/**/*.ts",
    "src/config/src/**/*",
    "src/config/src/**/*.ts",
    "src/shared/**/*",
    "src/preload/*.d.ts"
  ],
  "compilerOptions": {
    "composite": true,
    "outDir": "./out/ts-web",
    "baseUrl": ".",
    "paths": {
      "@renderer/*": ["src/renderer/src/*"],
      "@config/*": ["src/config/src/*"],
      "@shared/*": ["src/shared/*"]
    }
  }
}
```

**配置项说明:**

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `extends` | `@electron-toolkit/tsconfig/tsconfig.web.json` | 继承基础配置 + `"lib": ["ESNext", "DOM", "DOM.Iterable"]`，提供浏览器 DOM API 类型 |
| `composite` | `true` | 启用项目引用支持 |
| `outDir` | `"./out/ts-web"` | TypeScript 编译输出目录 (实际由 Vite 处理) |
| `baseUrl` | `"."` | 路径别名基准目录 |
| `paths` | 见右侧 | `@renderer/*` 指向桌宠渲染进程代码，`@config/*` 指向配置窗口代码，`@shared/*` 指向共享代码 |
| `include` | 见数组 | 包含两个渲染进程的源码、共享代码，以及 preload 的类型声明 (用于 `window.electronAPI` 类型) |

> `src/preload/*.d.ts` 被包含在 web 配置中，是为了让渲染进程能正确获得
> `window.electronAPI` 的类型推断 (通过 contextBridge 暴露的 API)。

---

## 3. Vite 配置

### 3.1 electron.vite.config.ts (完整内容)

```typescript
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  // ─────────────────────────────────────────────
  // 主进程 (Main Process)
  // 运行在 Node.js 环境，管理窗口、托盘、IPC、配置
  // ─────────────────────────────────────────────
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },

  // ─────────────────────────────────────────────
  // Preload 脚本
  // 运行在 Node.js + 浏览器桥接环境，
  // 通过 contextBridge 暴露安全 API
  // ─────────────────────────────────────────────
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@preload': resolve('src/preload')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },

  // ─────────────────────────────────────────────
  // 渲染进程 (Renderer Process) -- 桌宠窗口
  // 运行在 Chromium 环境，PixiJS 渲染
  // ─────────────────────────────────────────────
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    // 开发服务器配置 (仅开发模式生效)
    server: {
      port: 5173
    }
  }
})
```

### 3.2 构建配置说明

#### `externalizeDepsPlugin()`

electron-vite 提供的插件，自动将 `dependencies` 中声明的包从构建产物中排除，
让它们在运行时通过 Node.js 的 `require()` 加载。这对于主进程和 preload 脚本是必要的，
避免将 `electron-store` 等 Node 包打包进 bundle。

#### 主进程 (main)

| 配置 | 说明 |
|------|------|
| `plugins` | `externalizeDepsPlugin()` 排除 Node 依赖 |
| `resolve.alias` | `@shared` 和 `@main` 路径别名，与 tsconfig.json 中的 paths 对应 |
| `build.rollupOptions.input` | 主进程入口: `src/main/index.ts` |
| 输出目录 | 默认 `out/main` (electron-vite 自动处理) |
| 输出格式 | CJS (electron-vite 自动根据 Electron 版本选择) |
| 构建目标 | 自动匹配 Electron 内置的 Node.js 版本 |

#### Preload 脚本

| 配置 | 说明 |
|------|------|
| `plugins` | `externalizeDepsPlugin()` 排除 Node 依赖 |
| `resolve.alias` | `@shared` 和 `@preload` 路径别名 |
| `build.rollupOptions.input` | preload 入口: `src/preload/index.ts` |
| 输出目录 | 默认 `out/preload` |
| 输出格式 | CJS (preload 脚本必须为 CJS) |

#### 渲染进程 (renderer)

| 配置 | 说明 |
|------|------|
| `resolve.alias` | `@renderer` 和 `@shared` 路径别名 |
| `root` | `'src/renderer'` 渲染进程根目录 |
| `build.rollupOptions.input` | 渲染进程入口 HTML: `src/renderer/index.html` |
| 输出目录 | 默认 `out/renderer` |
| 构建目标 | 自动匹配 Electron 内置的 Chrome 版本 |
| `server.port` | 开发模式下 Vite 开发服务器端口 |

> 配置窗口 (`src/config/`) 作为**第二个渲染进程**，需要在 `electron.vite.config.ts`
> 中添加额外配置。详细实现见 Phase 2 配置窗口模块设计文档。

### 3.3 配置窗口渲染进程 (Phase 2 补充)

当配置窗口模块实现时，在 `electron.vite.config.ts` 中需要为配置窗口添加额外的构建条目。
推荐做法是将配置窗口与桌宠渲染进程共享同一个 renderer 构建，通过多入口 (multi-entry) 方式处理：

```typescript
// 在 renderer.build.rollupOptions.input 中添加:
build: {
  rollupOptions: {
    input: {
      index: resolve(__dirname, 'src/renderer/index.html'),
      config: resolve(__dirname, 'src/config/index.html')
    }
  }
}
```

---

## 4. package.json

### 4.1 完整内容

```json
{
  "name": "desk-idoll",
  "version": "0.1.0",
  "description": "Windows 桌面桌宠应用 - 基于 Electron + PixiJS",
  "main": "./out/main/index.js",
  "author": "codant0",
  "license": "MIT",
  "homepage": "https://github.com/codant0/desk-idoll",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/codant0/desk-idoll.git"
  },
  "bugs": {
    "url": "https://github.com/codant0/desk-idoll/issues"
  },
  "keywords": [
    "electron",
    "desktop-pet",
    "shimeji",
    "pixijs",
    "live2d",
    "spritesheet"
  ],
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "lint": "echo 'lint placeholder - add eslint later'",
    "pack": "electron-builder --dir",
    "dist": "electron-builder",
    "dist:win": "electron-builder --win",
    "dist:mac": "electron-builder --mac",
    "dist:linux": "electron-builder --linux",
    "postinstall": "electron-builder install-app-deps"
  },
  "dependencies": {
    "electron-store": "^8.2.0",
    "pixi.js": "^8.19.0"
  },
  "devDependencies": {
    "@electron-toolkit/preload": "^3.0.0",
    "@electron-toolkit/tsconfig": "^2.0.0",
    "@electron-toolkit/utils": "^4.0.0",
    "electron": "^33.0.0",
    "electron-builder": "^25.1.0",
    "electron-vite": "^2.3.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

### 4.2 Scripts 说明

| 脚本 | 命令 | 说明 |
|------|------|------|
| `dev` | `electron-vite dev` | 启动开发模式。同时启动 Vite 开发服务器 (热更新) 和 Electron 主进程。修改渲染进程代码自动热更新，修改主进程代码自动重启 Electron |
| `build` | `electron-vite build` | 生产构建。分别编译 main、preload、renderer 三个目标到 `out/` 目录 |
| `start` | `electron-vite preview` | 预览生产构建结果。先执行 build 再启动 Electron |
| `typecheck:node` | `tsc --noEmit -p tsconfig.node.json` | 对主进程和 preload 代码执行 TypeScript 类型检查 (不输出文件) |
| `typecheck:web` | `tsc --noEmit -p tsconfig.web.json` | 对渲染进程代码执行 TypeScript 类型检查 (不输出文件) |
| `typecheck` | `npm run typecheck:node && npm run typecheck:web` | 同时检查所有进程的类型 |
| `pack` | `electron-builder --dir` | 打包应用到目录 (不生成安装包)，用于快速测试打包结果 |
| `dist` | `electron-builder` | 构建完整分发包 (当前平台) |
| `dist:win` | `electron-builder --win` | 构建 Windows 安装包 (NSIS) |
| `dist:mac` | `electron-builder --mac` | 构建 macOS 安装包 (DMG) |
| `dist:linux` | `electron-builder --linux` | 构建 Linux 安装包 (AppImage) |
| `postinstall` | `electron-builder install-app-deps` | npm install 后自动重建原生依赖 (如 electron-store 的原生模块) |

### 4.3 `main` 字段说明

```json
"main": "./out/main/index.js"
```

electron-vite 将主进程源码编译输出到 `out/main/index.js`，Electron 从这个路径加载主进程。
开发模式下 electron-vite 会自动处理路径映射。

---

## 5. 共享类型定义

### 5.1 src/shared/types.ts (完整内容)

```typescript
// ─────────────────────────────────────────────
// Desk-Idoll 共享类型定义
// 跨主进程和渲染进程共享的接口与类型
// ─────────────────────────────────────────────

// ── 帧范围 (Sprite Sheet) ────────────────────

/** 定义动画状态的帧起止范围 */
export interface FrameRange {
  /** 起始帧索引 (0-based) */
  start: number
  /** 结束帧索引 (包含) */
  end: number
  /** 是否循环播放 */
  loop: boolean
}

// ── Sprite Sheet 动画配置 ────────────────────

/** Sprite Sheet 模型的动画配置 */
export interface SpriteAnimationConfig {
  /** 单帧宽度 (像素) */
  frameWidth: number
  /** 单帧高度 (像素) */
  frameHeight: number
  /** 动画帧率 (帧/秒) */
  fps: number
  /** 各动画状态的帧范围定义 */
  states: {
    /** 待机动画 */
    idle: FrameRange
    /** 行走动画 */
    walk: FrameRange
    /** 拖拽动画 */
    drag: FrameRange
    /** 下落动画 */
    fall: FrameRange
    /** 点击反馈动画 */
    click: FrameRange
  }
  /** Sprite Sheet 图片路径 */
  spritesheetPath: string
  /** Sprite Sheet JSON 描述文件路径 */
  spritesheetJsonPath: string
}

// ── Live2D 动画配置 (Phase 4) ────────────────

/** Live2D 模型的动画配置 */
export interface Live2DAnimationConfig {
  /** .model3.json 文件路径 */
  modelPath: string
  /** 动作映射: 桌宠状态 -> Live2D motion 组名 */
  motions: Record<string, string>
  /** 表情映射: 事件 -> Live2D expression 文件名 */
  expressions: Record<string, string>
  /** 是否跟随鼠标视线 */
  followMouse: boolean
}

// ── 统一动画配置类型 ─────────────────────────

/** 动画配置联合类型 */
export type AnimationConfig = SpriteAnimationConfig | Live2DAnimationConfig

// ── 动画状态 ─────────────────────────────────

/** 桌宠行为状态 */
export type AnimationState = 'idle' | 'walk' | 'drag' | 'fall' | 'click'

/** 模型类型 */
export type ModelType = 'sprite-sheet' | 'live2d'

// ── 状态机事件 ───────────────────────────────

/** 状态机可接收的事件 */
export type StateEvent =
  | 'timeout'       // idle 超时，触发行走
  | 'mousedown'     // 鼠标按下
  | 'mouseup'       // 鼠标释放
  | 'click'         // 左键点击
  | 'edge'          // 到达屏幕边缘
  | 'landed'        // 落地
  | 'actionDone'    // 自定义动作执行完成

// ── 自定义动作 ───────────────────────────────

/** 动作触发方式 */
export type ActionTrigger = 'left-click'

/** 动作类型 */
export type ActionType = 'open-url' | 'execute-cmd' | 'show-message'

/** 用户自定义的桌宠交互动作 */
export interface PetAction {
  /** 动作唯一 ID */
  id: string
  /** 触发方式 */
  trigger: ActionTrigger
  /** 动作类型 */
  type: ActionType
  /** 动作载荷 (URL / 命令 / 消息文本) */
  payload: string
  /** 动作显示名称 (用于右键菜单) */
  name: string
  /** 执行前是否弹出确认对话框 (CMD 类型建议开启) */
  confirmBeforeExecute: boolean
}

/** 动作执行结果 */
export interface ActionResult {
  /** 是否成功 */
  success: boolean
  /** 用户是否取消 (确认对话框) */
  cancelled?: boolean
  /** 错误信息 (失败时) */
  error?: string
}

// ── 行为配置 ─────────────────────────────────

/** 屏幕边缘行为策略 */
export type ScreenEdgeBehavior = 'bounce' | 'wrap' | 'stop'

/** 桌宠行为参数配置 */
export interface BehaviorConfig {
  /** 行走速度 (像素/帧) */
  walkSpeed: number
  /** 是否启用重力 */
  gravity: boolean
  /** 重力加速度 (像素/帧^2) */
  gravityForce: number
  /** 屏幕边缘行为 */
  screenEdgeBehavior: ScreenEdgeBehavior
  /** idle 状态超时时间 (毫秒)，超时后切换到 walk */
  idleTimeout: number
  /** 是否启用随机行走 (idle 超时后随机方向行走) */
  randomWalk: boolean
  /** 随机行走持续时间范围 (毫秒) */
  walkDuration: { min: number; max: number }
}

// ── 桌宠完整配置 ─────────────────────────────

/** 单个桌宠实例的完整配置 */
export interface PetConfig {
  /** 桌宠唯一 ID */
  id: string
  /** 桌宠名称 */
  name: string
  /** 模型类型 */
  modelType: ModelType
  /** 模型文件路径 (Sprite Sheet PNG 或 Live2D .model3.json) */
  modelPath: string
  /** 桌宠显示尺寸 */
  size: {
    width: number
    height: number
  }
  /** 桌宠在屏幕上的位置 */
  position: {
    x: number
    y: number
  }
  /** 透明度 0.0 - 1.0 */
  opacity: number
  /** 窗口层级 (Z-index)，值越大越在前 */
  zIndex: number
  /** 动画配置 */
  animations: AnimationConfig
  /** 自定义动作列表 */
  actions: PetAction[]
  /** 行为配置 */
  behavior: BehaviorConfig
  /** 是否启用 */
  enabled: boolean
  /** 创建时间 (ISO 8601) */
  createdAt: string
  /** 最后修改时间 (ISO 8601) */
  updatedAt: string
}

// ── 全局应用配置 ─────────────────────────────

/** 全局设置 */
export interface GlobalSettings {
  /** 语言 (zh-CN / en-US) */
  language: string
  /** 开机自启动 */
  autoStart: boolean
  /** 启动时检查更新 */
  checkUpdate: boolean
  /** 最大同时运行的桌宠实例数 */
  maxInstances: number
}

/** 完整应用配置 (electron-store 持久化) */
export interface AppConfig {
  /** 所有桌宠配置列表 */
  pets: PetConfig[]
  /** 全局设置 */
  globalSettings: GlobalSettings
}

// ── IPC 消息类型 ─────────────────────────────

/** IPC 消息基础结构 */
export interface IPCMessage<T = unknown> {
  /** 消息通道名 */
  channel: string
  /** 消息数据 */
  data?: T
}

/** 桌宠窗口位置更新消息 */
export interface PetPositionUpdate {
  /** 桌宠 ID */
  petId: string
  /** 新位置 */
  position: { x: number; y: number }
}

/** 配置变更通知消息 */
export interface ConfigChangeNotify {
  /** 变更的配置键 */
  key: string
  /** 变更后的值 */
  value: unknown
  /** 关联的桌宠 ID (若为桌宠配置变更) */
  petId?: string
}

// ── RenderAdapter 接口 ──────────────────────

/**
 * 渲染适配器接口
 * Sprite Sheet 和 Live2D 模型都需要实现此接口
 */
export interface RenderAdapter {
  /** 初始化适配器，加载模型资源 */
  init(container: unknown): Promise<void>
  /** 切换动画状态 */
  setState(state: AnimationState): void
  /** 每帧更新 (传入 delta 时间) */
  update(delta: number): void
  /** 销毁适配器，释放资源 */
  destroy(): void
  /** 获取当前模型的边界矩形 (用于碰撞检测) */
  getBounds(): { x: number; y: number; width: number; height: number }
}
```

### 5.2 src/shared/constants.ts (完整内容)

```typescript
// ─────────────────────────────────────────────
// Desk-Idoll 共享常量
// 默认配置值、系统常量、枚举值
// ─────────────────────────────────────────────

import type {
  PetConfig,
  BehaviorConfig,
  SpriteAnimationConfig,
  GlobalSettings
} from './types'

// ── 应用信息 ─────────────────────────────────

/** 应用名称 */
export const APP_NAME = 'Desk-Idoll'

/** 应用版本 */
export const APP_VERSION = '0.1.0'

/** 应用 ID (用于 electron-store 和 electron-builder) */
export const APP_ID = 'com.codant0.desk-idoll'

/** 应用用户模型 ID (Windows 任务栏分组) */
export const APP_USER_MODEL_ID = 'com.codant0.desk-idoll'

// ── 窗口默认尺寸 ─────────────────────────────

/** 桌宠窗口默认尺寸 */
export const PET_WINDOW_DEFAULTS = {
  width: 200,
  height: 200,
  transparent: true,
  frame: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  hasShadow: false
} as const

/** 配置窗口默认尺寸 */
export const CONFIG_WINDOW_DEFAULTS = {
  width: 680,
  height: 520,
  minWidth: 600,
  minHeight: 480,
  title: 'Desk-Idoll 设置',
  resizable: true,
  center: true
} as const

// ── 默认行为配置 ─────────────────────────────

/** 默认行为配置 */
export const DEFAULT_BEHAVIOR: BehaviorConfig = {
  walkSpeed: 2,
  gravity: true,
  gravityForce: 0.5,
  screenEdgeBehavior: 'bounce',
  idleTimeout: 3000,
  randomWalk: true,
  walkDuration: {
    min: 2000,
    max: 5000
  }
}

// ── 默认动画配置 (Sprite Sheet) ──────────────

/** 默认 Sprite Sheet 动画配置 */
export const DEFAULT_SPRITE_ANIMATION: SpriteAnimationConfig = {
  frameWidth: 128,
  frameHeight: 128,
  fps: 12,
  states: {
    idle: { start: 0, end: 3, loop: true },
    walk: { start: 4, end: 11, loop: true },
    drag: { start: 12, end: 15, loop: false },
    fall: { start: 16, end: 19, loop: false },
    click: { start: 20, end: 23, loop: false }
  },
  spritesheetPath: 'default-pet/spritesheet.png',
  spritesheetJsonPath: 'default-pet/spritesheet.json'
}

// ── 默认桌宠配置 ─────────────────────────────

/** 创建新桌宠时的默认配置模板 */
export const DEFAULT_PET_CONFIG: Omit<PetConfig, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '新桌宠',
  modelType: 'sprite-sheet',
  modelPath: '',
  size: { width: 128, height: 128 },
  position: { x: 200, y: 200 },
  opacity: 1.0,
  zIndex: 9999,
  animations: { ...DEFAULT_SPRITE_ANIMATION },
  actions: [],
  behavior: { ...DEFAULT_BEHAVIOR },
  enabled: true
}

// ── 默认全局设置 ─────────────────────────────

/** 默认全局设置 */
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  language: 'zh-CN',
  autoStart: false,
  checkUpdate: true,
  maxInstances: 5
}

// ── 默认完整配置 ─────────────────────────────

/** 默认完整应用配置 */
export const DEFAULT_APP_CONFIG = {
  pets: [] as PetConfig[],
  globalSettings: { ...DEFAULT_GLOBAL_SETTINGS }
}

// ── 物理引擎常量 ─────────────────────────────

/** 物理引擎相关常量 */
export const PHYSICS = {
  /** 重力常数 (像素/帧^2) */
  GRAVITY: 0.5,
  /** 最大下落速度 (像素/帧) */
  MAX_FALL_SPEED: 15,
  /** 反弹系数 (0-1，1 为完全弹性碰撞) */
  BOUNCE_FACTOR: 0.3,
  /** 摩擦系数 */
  FRICTION: 0.8
} as const

// ── 状态机常量 ───────────────────────────────

/** 状态转换映射表 */
export const STATE_TRANSITIONS = {
  idle: { timeout: 'walk', mousedown: 'drag', click: 'click' },
  walk: { edge: 'idle', mousedown: 'drag', click: 'click' },
  drag: { mouseup: 'fall' },
  fall: { landed: 'idle' },
  click: { actionDone: 'idle' }
} as const

// ── 右键菜单标签 ─────────────────────────────

/** 右键菜单默认标签 */
export const CONTEXT_MENU_LABELS = {
  settings: '设置',
  hide: '隐藏',
  showAll: '显示全部',
  addPet: '添加桌宠',
  separator: '---',
  quit: '退出 Desk-Idoll'
} as const

// ── 存储常量 ─────────────────────────────────

/** electron-store 配置键名 */
export const STORE_KEYS = {
  /** 桌宠配置列表 */
  PETS: 'pets',
  /** 全局设置 */
  GLOBAL_SETTINGS: 'globalSettings',
  /** 窗口位置缓存 */
  WINDOW_POSITIONS: 'windowPositions'
} as const

// ── 限制常量 ─────────────────────────────────

/** 系统限制 */
export const LIMITS = {
  /** 最大桌宠实例数 */
  MAX_PET_INSTANCES: 10,
  /** 最小桌宠尺寸 (像素) */
  MIN_PET_SIZE: 32,
  /** 最大桌宠尺寸 (像素) */
  MAX_PET_SIZE: 512,
  /** 最大自定义动作数 (每个桌宠) */
  MAX_ACTIONS: 20,
  /** 最大桌宠名称长度 */
  MAX_NAME_LENGTH: 32
} as const
```

### 5.3 src/shared/ipc-channels.ts (完整内容)

```typescript
// ─────────────────────────────────────────────
// Desk-Idoll IPC 通道名定义
// 统一管理所有主进程 <-> 渲染进程通信通道
// ─────────────────────────────────────────────

/**
 * IPC 通道名枚举
 *
 * 命名规范:
 * - 主进程 -> 渲染进程: 'pet:xxx' 或 'config:xxx'
 * - 渲染进程 -> 主进程: 'pet:xxx' 或 'config:xxx'
 * - 双向调用 (invoke/handle): 'invoke:xxx'
 */
export const IPC_CHANNELS = {
  // ── 窗口控制 (渲染进程 -> 主进程) ──────────

  /** 设置鼠标事件穿透/交互模式 */
  SET_INTERACTIVE: 'window:set-interactive',

  /** 最小化桌宠窗口 */
  MINIMIZE_PET: 'window:minimize-pet',

  /** 关闭桌宠窗口 */
  CLOSE_PET: 'window:close-pet',

  /** 打开配置窗口 */
  OPEN_CONFIG: 'window:open-config',

  /** 关闭配置窗口 */
  CLOSE_CONFIG: 'window:close-config',

  /** 获取当前窗口所在的屏幕信息 */
  GET_SCREEN_INFO: 'window:get-screen-info',

  // ── 桌宠控制 (主进程 -> 渲染进程) ─────────

  /** 通知桌宠窗口更新配置 */
  UPDATE_PET_CONFIG: 'pet:update-config',

  /** 通知桌宠窗口切换动画状态 */
  SET_ANIMATION_STATE: 'pet:set-animation-state',

  /** 通知桌宠窗口显示/隐藏 */
  SET_PET_VISIBLE: 'pet:set-visible',

  // ── 桌宠位置 (渲染进程 -> 主进程) ─────────

  /** 桌宠位置更新 (拖拽时持续发送) */
  PET_POSITION_UPDATE: 'pet:position-update',

  /** 桌宠落地事件 */
  PET_LANDED: 'pet:landed',

  // ── 配置管理 (渲染进程 -> 主进程) ─────────

  /** 获取完整应用配置 */
  GET_APP_CONFIG: 'config:get-app-config',

  /** 获取单个桌宠配置 */
  GET_PET_CONFIG: 'config:get-pet-config',

  /** 保存桌宠配置 */
  SAVE_PET_CONFIG: 'config:save-pet-config',

  /** 删除桌宠配置 */
  DELETE_PET_CONFIG: 'config:delete-pet-config',

  /** 获取全局设置 */
  GET_GLOBAL_SETTINGS: 'config:get-global-settings',

  /** 保存全局设置 */
  SAVE_GLOBAL_SETTINGS: 'config:save-global-settings',

  /** 创建新桌宠 */
  CREATE_PET: 'config:create-pet',

  // ── 配置变更通知 (主进程 -> 渲染进程) ─────

  /** 配置已变更通知 */
  CONFIG_CHANGED: 'config:changed',

  // ── 动作执行 (渲染进程 -> 主进程) ─────────

  /** 执行自定义动作 */
  EXECUTE_ACTION: 'action:execute',

  /** 动作执行结果回调 */
  ACTION_RESULT: 'action:result',

  // ── 素材管理 (渲染进程 -> 主进程) ─────────

  /** 打开文件选择对话框 */
  OPEN_FILE_DIALOG: 'asset:open-file-dialog',

  /** 保存上传的素材文件到本地 */
  SAVE_ASSET: 'asset:save',

  /** 获取素材文件的本地路径 */
  GET_ASSET_PATH: 'asset:get-path',

  // ── 系统 (双向) ───────────────────────────

  /** 获取应用版本 */
  GET_APP_VERSION: 'system:get-app-version',

  /** 获取平台信息 */
  GET_PLATFORM: 'system:get-platform',

  /** 退出应用 */
  QUIT_APP: 'system:quit',

  /** 开机自启动设置 */
  SET_AUTO_LAUNCH: 'system:set-auto-launch'
} as const

/** IPC 通道名类型 */
export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

/**
 * 为 preload 脚本定义 API 方法签名
 * 与 src/preload/index.ts 中 contextBridge 暴露的方法对应
 */
export interface ElectronAPI {
  // 窗口控制
  setInteractive: (interactive: boolean) => void
  openConfig: () => void
  getScreenInfo: () => Promise<{ width: number; height: number }>

  // 桌宠位置
  onPositionUpdate: (callback: (position: { x: number; y: number }) => void) => void

  // 配置管理
  getAppConfig: () => Promise<import('./types').AppConfig>
  getPetConfig: (petId: string) => Promise<import('./types').PetConfig | undefined>
  savePetConfig: (config: import('./types').PetConfig) => Promise<void>
  deletePetConfig: (petId: string) => Promise<void>
  getGlobalSettings: () => Promise<import('./types').GlobalSettings>
  saveGlobalSettings: (settings: import('./types').GlobalSettings) => Promise<void>
  createPet: (config?: Partial<import('./types').PetConfig>) => Promise<import('./types').PetConfig>
  onConfigChanged: (callback: (notify: import('./types').ConfigChangeNotify) => void) => void

  // 动作执行
  executeAction: (action: import('./types').PetAction) => Promise<import('./types').ActionResult>

  // 素材管理
  openFileDialog: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  saveAsset: (sourcePath: string, targetName: string) => Promise<string>

  // 系统
  getAppVersion: () => Promise<string>
  getPlatform: () => Promise<string>
  quitApp: () => void
  setAutoLaunch: (enable: boolean) => Promise<void>
}

// 扩展 Window 接口，使 TypeScript 认识 window.electronAPI
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
```

---

## 6. .gitignore 配置

```gitignore
# ── Node.js ──────────────────────────────────
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# ── 构建输出 ────────────────────────────────
out/
dist/
*.tsbuildinfo

# ── 环境变量 ────────────────────────────────
.env
.env.local
.env.*.local

# ── IDE / 编辑器 ────────────────────────────
.vscode/*
!.vscode/launch.json
!.vscode/extensions.json
.idea/
*.swp
*.swo
*~
.DS_Store
Thumbs.db

# ── Electron ────────────────────────────────
# electron-builder 输出
release/
*.dmg
*.AppImage
*.deb
*.rpm
*.snap
*.exe
*.msi
*.blockmap

# ── 日志 ────────────────────────────────────
logs/
*.log

# ── 临时文件 ────────────────────────────────
tmp/
temp/
.cache/

# ── 用户上传的桌宠素材 (运行时生成) ─────────
src/assets/user-pets/

# ── Electron 安全相关 ───────────────────────
# 不要提交证书文件
*.pfx
*.p12
*.key
*.cert
```

---

## 7. electron-builder.yml 基础配置

```yaml
# ─────────────────────────────────────────────
# Desk-Idoll 打包分发配置
# 文档: https://www.electron.build/configuration
# ─────────────────────────────────────────────

appId: com.codant0.desk-idoll
productName: Desk-Idoll
copyright: Copyright (c) 2026 codant0
asar: true

# ── 目录配置 ─────────────────────────────────
directories:
  output: release
  buildResources: resources

# ── 要包含的文件 ─────────────────────────────
files:
  - out/**/*
  - "!**/node_modules/**/{CHANGELOG.md,README.md,readme.md,LICENSE,license,LICENCE}"
  - "!**/node_modules/**/{test,tests,powered-test,example,examples}"
  - "!**/node_modules/**/.bin"
  - "!**/*.map"
  - "!**/*.d.ts"

# ── 额外资源 (打包时嵌入) ───────────────────
extraResources:
  - from: src/assets/
    to: assets/
    filter:
      - "**/*"

# ── 应用图标 ─────────────────────────────────
icon: resources/icon.ico

# ── Windows 配置 ─────────────────────────────
win:
  target:
    - target: nsis
      arch:
        - x64
  icon: resources/icon.ico
  artifactName: "${productName}-Setup-${version}.${ext}"
  requestedExecutionLevel: asInvoker

# ── NSIS 安装程序配置 ────────────────────────
nsis:
  oneClick: false
  perMachine: false
  allowElevation: true
  allowToChangeInstallationDirectory: true
  installerIcon: resources/icon.ico
  uninstallerIcon: resources/icon.ico
  installerHeaderIcon: resources/icon.ico
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: "Desk-Idoll"
  uninstallDisplayName: "Desk-Idoll"
  uninstallDisplayAppDescription: true
  language: 2052
  installerLanguages:
    - 2052
    - 1033
  license: null

# ── macOS 配置 (可选) ───────────────────────
mac:
  target:
    - target: dmg
      arch:
        - x64
        - arm64
  icon: resources/icon.icns
  category: public.app-category.entertainment
  artifactName: "${productName}-${version}.${ext}"

dmg:
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications

# ── Linux 配置 (可选) ───────────────────────
linux:
  target:
    - target: AppImage
      arch:
        - x64
  icon: resources/icons
  category: Utility
  artifactName: "${productName}-${version}.${ext}"

# ── 发布配置 (GitHub Releases) ──────────────
publish:
  provider: github
  owner: codant0
  repo: desk-idoll
  releaseType: release
```

### 配置项说明

#### 基础信息

| 字段 | 说明 |
|------|------|
| `appId` | 应用唯一标识符，用于系统注册、自动更新等 |
| `productName` | 产品名称，显示在安装程序和系统中 |
| `asar` | `true` 将应用代码打包为 ASAR 归档文件，保护源码并减少文件数 |

#### Windows (NSIS)

| 字段 | 说明 |
|------|------|
| `target: nsis` | 使用 NSIS 安装程序格式 |
| `arch: [x64]` | 仅构建 64 位版本 (现代 Windows 标准) |
| `oneClick: false` | 非一键安装，显示安装向导 |
| `perMachine: false` | 安装到当前用户目录 (无需管理员权限) |
| `allowToChangeInstallationDirectory` | 允许用户自选安装路径 |
| `language: 2052` | 默认安装语言为简体中文 |
| `requestedExecutionLevel: asInvoker` | 以当前用户权限运行，不请求管理员 |

#### macOS / Linux

macOS 和 Linux 配置为可选目标平台。`artifactName` 使用模板变量自动填充版本号。

#### 发布

| 字段 | 说明 |
|------|------|
| `provider: github` | 使用 GitHub Releases 发布 |
| `releaseType: release` | 只发布正式版本 (非 draft/prerelease) |

---

## 附录 A: 快速初始化命令汇总

```bash
# 1. 创建项目 (使用 electron-vite 模板)
npm create @quick-start/electron@latest desk-idoll -- --template vanilla-ts

# 2. 进入项目
cd desk-idoll

# 3. 安装运行时依赖
npm install pixi.js@^8.19.0 electron-store@^8.2.0

# 4. 创建目录结构
mkdir -p src/main/windows src/main/services src/main/ipc
mkdir -p src/preload
mkdir -p src/renderer/src/engine src/renderer/src/state src/renderer/styles
mkdir -p src/config/src/components
mkdir -p src/shared
mkdir -p src/assets/default-pet
mkdir -p resources build

# 5. 创建共享类型文件
touch src/shared/types.ts src/shared/constants.ts src/shared/ipc-channels.ts

# 6. 创建 preload 类型声明
touch src/preload/index.d.ts

# 7. 验证开发环境
npm run dev

# 8. 验证构建
npm run build

# 9. 验证类型检查
npm run typecheck
```

## 附录 B: VS Code 推荐配置

`.vscode/launch.json` -- Electron 调试配置:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main Process",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron-vite",
      "runtimeArgs": ["dev"],
      "windows": {
        "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron-vite.cmd"
      }
    }
  ]
}
```

`.vscode/extensions.json` -- 推荐扩展:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

## 附录 C: 版本兼容性矩阵

| 依赖 | 文档使用版本 | 最新稳定版 (2026-06) | 说明 |
|------|-------------|---------------------|------|
| `electron` | `^33.0.0` | 42.3.3 | v33 起支持 Windows 10+，Node 20+ |
| `electron-vite` | `^2.3.0` | 5.0.0 | v2 稳定可用，v5 为最新大版本 |
| `pixi.js` | `^8.19.0` | 8.19.0 | v8 使用 WebGPU/WebGL2 渲染 |
| `electron-store` | `^8.2.0` | 11.0.2 | v8 为 ESM-only，需 Vite 编译 |
| `electron-builder` | `^25.1.0` | 26.15.0 | v25 支持 NSIS 3 |
| `typescript` | `^5.7.0` | 6.0.3 | v5 生态兼容性最好 |
| `vite` | `^6.0.0` | 8.0.16 | v6 稳定可用 |

> 版本范围使用 `^` (caret) 锁定主版本，允许自动升级次版本和补丁版本。
> 实际安装时 npm 会解析到范围内最新版。如需使用文档指定的精确版本，
> 将 `^` 前缀去掉即可锁定。
