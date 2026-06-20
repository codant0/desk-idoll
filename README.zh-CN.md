# Desk-Idoll

> 一款轻量级 Windows 桌面宠物（shimeji 风格），基于 Electron + PixiJS + TypeScript 构建。

[English](README.md) | [中文](README.zh-CN.md)

---

## 功能特性

- **动态桌面宠物** — 角色在桌面上行走、下落、交互，基于物理引擎驱动
- **Sprite Sheet & Live2D** — 支持 PixiJS 精灵表动画和 Live2D Cubism 模型
- **静态图片桌宠** — 上传单张图片即可创建动态桌面宠物，支持程序化动画
- **拖拽交互** — 鼠标拖拽桌宠，松手后受重力下落
- **自定义动作** — 左键点击可绑定打开 URL、执行命令、显示消息
- **多桌宠** — 同时运行多个桌宠，各自独立配置
- **系统托盘** — 通过托盘图标控制：显示/隐藏、添加/删除、设置
- **自动更新** — 通过 GitHub Releases 内置更新机制
- **国际化** — 支持中文（zh-CN）和英文

### 桌宠定制模式

Desk-Idoll 支持三种桌宠定制模式：

| 模式 | 输入要求 | 动画效果 | 适用场景 |
|------|----------|----------|----------|
| **Sprite Sheet** | 精灵图 JSON + PNG | 帧动画 | 专业动画师 |
| **Live2D** | Live2D 模型文件 | 骨骼动画 | Live2D 用户 |
| **静态图片** | 单张 PNG/JPG 图片 | 程序化动画 | 普通用户 |

### 静态图片模式

只需上传一张图片，即可创建动态桌宠！

#### 简单模式（即时生效）
- **温柔风格**：轻柔浮动，缓慢呼吸
- **活泼风格**：活泼弹跳，节奏明快
- **精力充沛风格**：精力充沛，动感十足

#### 高级模式（AI处理）
使用 Meta AnimatedDrawings 技术，从静态图片生成真实动画。
需要 Python 环境和 AnimatedDrawings 服务。

### 动画状态

桌宠支持以下动画状态：
- **idle**：闲置时的浮动/呼吸动画
- **walk**：行走时的弹跳动画
- **drag**：拖拽时的摇晃动画
- **fall**：下落时的旋转动画
- **click**：点击时的缩放反馈

## 快速开始

### 环境要求

- Node.js 18+
- Windows 10/11（主要平台）

### 开发

```bash
npm run dev              # 开发模式（热重载）
npm run build            # 构建所有目标
npm run typecheck        # 类型检查
npm run dist:win         # 打包 Windows 安装程序
```

### AnimatedDrawings 服务

如需使用高级模式，需要启动 Python 服务：

```bash
cd services/animated-drawings
pip install -r requirements.txt
python server.py
```

服务默认运行在 `http://127.0.0.1:5000`

### 项目结构

```
src/
├── main/                     # Electron 主进程
│   ├── index.ts              # 应用入口、生命周期管理
│   ├── ipc/index.ts          # IPC 处理器注册
│   ├── windows/
│   │   ├── pet-window.ts     # 透明桌宠窗口管理器
│   │   └── config-window.ts  # 设置窗口（单例）
│   └── services/
│       ├── config-manager.ts # 配置持久化（electron-store）
│       ├── action-executor.ts# 动作执行（URL、命令、消息）
│       ├── tray.ts           # 系统托盘管理器
│       ├── updater.ts        # 自动更新（electron-updater）
│       └── logger.ts         # 按日轮转文件日志
├── preload/
│   └── index.ts              # contextBridge → window.electronAPI
├── renderer/
│   ├── index.html            # 桌宠窗口入口
│   ├── public/
│   │   └── live2dcubismcore.min.js  # Live2D Cubism SDK 运行时
│   ├── styles/main.css       # 桌宠窗口 CSS
│   ├── src/
│   │   ├── main.ts           # 渲染进程初始化，连接所有子系统
│   │   ├── styles/main.css   # 桌宠窗口详细 CSS
│   │   ├── engine/
│   │   │   ├── render-engine.ts  # PixiJS Application 门面
│   │   │   ├── adapter.ts        # RenderAdapter 接口 + 工厂
│   │   │   ├── sprite-adapter.ts # 精灵表渲染器
│   │   │   ├── live2d-adapter.ts # Live2D 渲染器
│   │   │   ├── physics.ts        # 重力、行走、随机 AI
│   │   │   └── input.ts          # 鼠标交互、拖拽/点击检测
│   │   └── state/
│   │       └── machine.ts        # 有限状态机
│   └── config/
│       ├── index.html        # 配置窗口入口
│       ├── main.ts           # ConfigApp：侧边栏 + 标签页
│       ├── styles/config.css # 配置窗口设计系统
│       └── components/
│           ├── PetListPanel.ts
│           ├── SettingsPanel.ts
│           └── ActionEditor.ts
├── shared/
│   ├── types.ts              # 所有 TypeScript 类型定义
│   ├── constants.ts          # 默认值、物理常量
│   ├── ipc-channels.ts       # IPC 通道名 + ElectronAPI 接口
│   ├── i18n.ts               # 国际化
│   └── utils.ts              # 工具函数
└── assets/
    ├── default-pet/          # 默认精灵表（128x128，5 种状态）
    └── tray-icon.png         # 系统托盘图标
```

## 架构设计

### 三进程模型

```
┌─────────────────────────────────────────┐
│              主进程                      │
│  ConfigManager · PetWindowManager       │
│  ActionExecutor · TrayManager           │
│  UpdaterManager · Logger                │
└──────────────┬──────────────────────────┘
               │ ipcMain.handle() / .on()
               ▼
┌─────────────────────────────────────────┐
│            预加载脚本                    │
│  contextBridge.exposeInMainWorld()      │
└──────────────┬──────────────────────────┘
               │ window.electronAPI.*
               ▼
┌────────────────────┐  ┌─────────────────┐
│   桌宠渲染进程      │  │  配置渲染进程    │
│  RenderEngine      │  │  ConfigApp      │
│  PhysicsEngine     │  │  PetListPanel   │
│  StateMachine      │  │  SettingsPanel  │
│  InputHandler      │  │  ActionEditor   │
└────────────────────┘  └─────────────────┘
```

### 状态机

桌宠行为由有限状态机驱动：

```
idle ──timeout──→ walk ──edge──→ idle
 │                 │
 ├──mousedown──→ drag ──mouseup──→ fall ──landed──→ idle
 │                 │
 └──click──→ click ──actionDone──→ idle
```

| 状态 | 动画 | 说明 |
|------|------|------|
| `idle` | 静止站立 | 等待超时后随机行走 |
| `walk` | 行走循环 | 碰到屏幕边缘反弹 |
| `drag` | 被拖拽 | 鼠标按住拖动窗口 |
| `fall` | 下落 | 松手后受重力下落 |
| `click` | 点击反馈 | 执行绑定动作 |

### 物理引擎

自研轻量物理引擎（不依赖 Matter.js），采用不可变状态 + reducer 模式：

1. **重力** — 加速下落，落地后可配置反弹衰减
2. **行走** — 水平移动，支持边缘行为（反弹/穿越/停止）
3. **随机行走 AI** — 自主 idle → walk → pause → walk 循环

物理引擎在 `idle`、`walk` 和 `fall` 状态下运行。随机行走 AI 会在桌宠静止在地面上时自动触发行走。用户配置的行为设置（行走速度、重力、边缘行为等）会实时同步到物理引擎。

### 点击穿透机制

桌宠窗口默认透明且可穿透点击：

1. 窗口启动时设置 `setIgnoreMouseEvents(true, { forward: true })`
2. 渲染进程的 `InputHandler` 通过 PixiJS 进行像素级命中检测
3. 鼠标在桌宠像素上 → `setInteractive(true)` → `setIgnoreMouseEvents(false)` 捕获事件
4. 鼠标离开桌宠 → `setInteractive(false)` → 恢复点击穿透

### 渲染适配器模式

```
RenderAdapter（接口）
  ├── SpriteAdapter   — PixiJS Spritesheet + AnimatedSprite
  ├── Live2DAdapter   — pixi-live2d-display + Live2DModel
  └── StaticAdapter   — 静态图片程序化动画
```

适配器通过动态 `import()` 懒加载，支持运行时切换。

## 自定义精灵表

制作自己的桌宠，需准备符合以下规格的精灵表 PNG：

| 属性 | 值 |
|------|-----|
| 总尺寸 | 768 × 640 px（6 列 × 5 行） |
| 单帧尺寸 | 128 × 128 px |
| 格式 | PNG-32，含 alpha 透明通道 |

帧布局：

```
第 0 行: idle_0  idle_1  idle_2  idle_3   （空）     （空）
第 1 行: walk_0  walk_1  walk_2  walk_3  walk_4    walk_5
第 2 行: drag_0  drag_1    —       —       —         —
第 3 行: fall_0  fall_1    —       —       —         —
第 4 行: click_0 click_1 click_2 click_3    —         —
```

同时需要创建对应的 `spritesheet.json`，遵循 [PixiJS Spritesheet 格式](https://pixijs.io/6.x/guides/components/assets)。

## 自定义动作

每个桌宠可绑定多个左键点击动作：

| 类型 | 载荷 | 示例 |
|------|------|------|
| `open-url` | 要打开的 URL | `https://github.com` |
| `execute-cmd` | Shell 命令 | `notepad.exe` |
| `show-message` | 消息文本 | `你好！` |

动作可设置执行前弹出确认对话框。

## 打包发布

```bash
# 构建可分发文件
npm run dist:win

# 输出目录
release/
  ├── Desk-Idoll-Setup-0.1.0.exe    # NSIS 安装程序
  └── Desk-Idoll-0.1.0-portable.exe  # 便携版
```

## API 文档

### IPC 通道

| 通道 | 方向 | 说明 |
|------|------|------|
| `static:validate-image` | 渲染→主 | 验证图片文件 |
| `static:copy-image` | 渲染→主 | 复制图片到资源目录 |
| `animated-drawings:check-service` | 渲染→主 | 检查AI服务状态 |
| `animated-drawings:start-service` | 渲染→主 | 启动AI服务 |
| `animated-drawings:process` | 渲染→主 | 处理图片生成动画 |
| `animated-drawings:status` | 渲染→主 | 查询处理状态 |
| `spritesheet:generate` | 渲染→主 | 生成精灵图 |

## 许可证

MIT
