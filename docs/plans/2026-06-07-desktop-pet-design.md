# Desk-Idoll 桌面桌宠设计文档

> 日期: 2026-06-07
> 状态: Confirmed — 已与用户确认

---

## 1. 项目概述

**Desk-Idoll** 是一个 Windows 桌面桌宠应用。用户通过上传 sprite sheet 或 Live2D 模型生成桌宠，桌宠在桌面上以经典 Shimeji 模式活动（行走、待机、拖拽、重力下落），支持左键点击和右键菜单交互，可自定义点击动作（打开 URL、执行 CMD 命令等）。

### 核心功能
- 用户上传 sprite sheet 或 Live2D 模型 → 生成桌宠角色
- 经典 Shimeji 行为: 行走 + 待机 + 拖拽 + 重力下落
- 左键点击触发自定义动作，右键弹出菜单
- 独立配置窗口（完整配置：图片上传、大小、动画参数、外观、动作管理、行为模式）
- 系统托盘驻留，支持多桌宠实例

### 动画建模路线（混合方案）

```
Phase 1: Sprite Sheet 模式
  用户使用 DragonBones (免费) 制作 sprite sheet → 导入桌宠应用

Phase 2: Live2D 模式
  用户在 Live2D Cubism Editor (免费 Indie 授权) 中拆分图层 → 导入桌宠应用

Phase 3 (远期探索): AI 自动生成
  用户上传单张图片 → AI 自动骨骼绑定 → 动画生成
```

---

## 2. 用户素材制作指南

用户需要将自定义图片转换为桌宠可用的动画格式。以下提供完整的工具链和操作指导。

### 2.1 Sprite Sheet 制作工具（Phase 1）

#### 推荐工具: DragonBones（免费）

[DragonBones](http://www.egret.com/products/dragonbones) 是 Egret Technology 开发的免费 2D 骨骼动画工具，支持从静态图片制作骨骼动画并导出 sprite sheet。

**完整工作流:**

```
静态图片 → DragonBones 骨骼绑定 → 骨骼动画 → 导出 Sprite Sheet → 导入 Desk-Idoll
```

**操作步骤:**

1. **准备素材**: 将角色图片拆分为部件（头、身体、手臂、腿等），保存为单独的 PNG 文件
   - 可以使用 Photoshop / GIMP / Krita 进行拆分
   - 不会拆分也可以直接使用完整图片（效果有限）

2. **导入 DragonBones**: 新建项目 → 导入图片部件 → 在骨架面板中组装

3. **骨骼绑定**: 为每个部件添加骨骼节点，建立父子关系
   - 参考: [DragonBones 官方教程](https://docs.egret.com/dragonbones/docs/dbPro/introduction/introduction)

4. **制作动画**: 在时间轴中为各个动画状态（idle/walk/drag/fall/click）制作关键帧

5. **导出**: 选择"导出" → 格式选择 "PixiJS" 或 "Egret" → 生成 spritesheet.json + spritesheet.png

**输出文件:**
- `spritesheet.json` — 帧数据、动画定义
- `spritesheet.png` — 合并后的精灵图

#### 替代工具对比

| 工具 | 价格 | 优势 | 劣势 | 导出 Sprite Sheet |
|------|------|------|------|-------------------|
| **DragonBones** | 免费 | 骨骼动画、网格变形、IK、直接导出 PixiJS 格式 | 社区活跃度下降 | 原生支持 |
| **Spine** | $69-$349 | 行业标准、功能最全、运行时支持广泛 | 付费，bake 帧需要 Pro 版 | Pro 版支持 |
| **Spriter** | 免费/$59 | 入门友好、支持烘焙 PNG 序列帧 | 技术较老、社区萎缩 | 支持（烘焙） |
| **Aseprite** | $19.99 (源码免费) | 像素画专用、帧动画编辑 | 不支持骨骼动画 | 原生支持 |
| **Krita** | 免费开源 | 绘画+动画一体化 | 动画功能较基础 | 需手动打包 |
| **Piskel** | 免费开源 | 在线使用、像素画编辑 | 功能简单 | 支持 |

#### 手动制作方式

如果用户已有逐帧动画图片序列（如从网上下载的 Shimeji 素材包），可以使用以下工具打包为 sprite sheet:

- **TexturePacker** (免费版可用) — 命令行或 GUI 打包
- **ImageMagick** (免费开源) — 命令行: `montage frame_*.png -tile 8x4 -geometry 128x128 spritesheet.png`
- **FFmpeg** (免费开源) — 从 GIF/视频提取帧并拼接

### 2.2 Live2D 模型制作（Phase 2）

#### 推荐工具: Live2D Cubism Editor（免费 Indie 授权）

[Live2D Cubism Editor](https://www.live2d.com/en/sdk/download/unity/) 提供免费的 Indie 授权（年收入 < 1000 万日元 / ~$7 万 USD 免费使用）。

**完整工作流:**

```
分层 PSD/PNG → Cubism Editor 导入 → 网格变形 + 骨骼绑定 → 动作/表情制作 → 导出 .model3.json → 导入 Desk-Idoll
```

**操作步骤:**

1. **准备分层素材**: 在 Photoshop / GIMP 中将角色拆分为图层
   - 必须拆分: 左眼、右眼、嘴巴（多个口型）、眉毛、头发（可按组分）、身体、手臂
   - 越细致的拆分 → 越自然的动画效果
   - 导出为 PSD 或分层 PNG

2. **导入 Cubism Editor**: File → Import → 选择 PSD 文件
   - 参考: [Live2D 官方快速入门](https://docs.live2d.com/en/cubism-editor-manual/quickstart/)

3. **网格编辑**: 为每个部件创建网格，控制变形精度
   - 关键区域（眼睛、嘴巴）需要更密的网格

4. **参数绑定**: 设置参数（角度X/Y、眼睛开合、嘴巴张合等）与网格变形的映射

5. **制作动作和表情**: 在时间轴中制作 motion 和 expression

6. **导出**: File → Export → 选择 "Model3.json" 格式

**输出文件:**
- `model.model3.json` — 模型定义（结构、参数、动作引用）
- `model.moc3` — 编译后的模型数据
- `model.physics3.json` — 物理演算配置（头发/衣服摆动）
- `textures/` — 纹理贴图
- `motions/` — 动作文件 (.motion3.json)
- `expressions/` — 表情文件 (.exp3.json)

**学习资源:**
- [Live2D 官方文档](https://docs.live2d.com/en/)
- [YouTube: Live2D Cubism 教程](https://www.youtube.com/results?search_query=live2d+cubism+tutorial)
- [Bilibili: Live2D 建模教程](https://search.bilibili.com/all?keyword=Live2D建模教程)

### 2.3 AI 自动生成路线（Phase 3 远期）

目前开源 AI 工具可以实现"单张图片 → 动画"，但输出格式与桌宠需求有差距:

| 项目 | 输入 | 输出 | 是否适合桌宠 |
|------|------|------|-------------|
| [Meta AnimatedDrawings](https://github.com/facebookresearch/AnimatedDrawings) | 单张角色图 | GIF / MP4 视频 | 需要额外处理（提取帧 → 打包 sprite sheet） |
| [LivePortrait](https://github.com/KwaiVGI/LivePortrait) | 单张肖像 | MP4 视频 | 仅限人脸/肖像 |
| [First Order Motion Model](https://github.com/AliaksandrSiarohin/first-order-model) | 图片 + 驱动视频 | MP4 视频 | 需要驱动视频 |
| [Thin-Plate Spline Motion Model](https://github.com/yoyo-nb/Thin-Plate-Spline-Motion-Model) | 图片 + 驱动视频 | MP4 视频 | 需要驱动视频 |

**AI 路线的集成方案（远期）:**

```
用户上传单张图片
  → Desk-Idoll 调用 AI 后端 (Python FastAPI)
    → Meta AnimatedDrawings 自动骨骼绑定 + 动画
      → 输出视频帧序列
        → 自动打包为 sprite sheet
          → 导入桌宠渲染引擎
```

**关键挑战:**
- 需要部署 Python AI 服务（本地或远程）
- 模型推理需要 GPU（或较慢的 CPU 推理）
- 输出需要后处理（视频帧 → sprite sheet 转换）
- 动画质量不如手动制作的 sprite sheet 或 Live2D

### 2.4 应用内指导设计

在 Desk-Idoll 配置窗口中，针对不同模型类型提供引导:

```
┌─ 上传模型 ──────────────────────────────────────┐
│                                                  │
│  模型类型: ○ Sprite Sheet  ○ Live2D              │
│                                                  │
│  ┌─ Sprite Sheet 说明 ────────────────────────┐ │
│  │  Sprite Sheet 是将多帧动画排列在一张图上    │ │
│  │                                            │ │
│  │  推荐制作工具:                             │ │
│  │  • DragonBones (免费) - 骨骼动画制作       │ │
│  │  • Aseprite ($19) - 像素画逐帧动画         │ │
│  │  • Spine ($69+) - 专业骨骼动画             │ │
│  │                                            │ │
│  │  [查看详细教程 →]  [下载示例素材 →]        │ │
│  │                                            │ │
│  │  支持的动画状态:                           │ │
│  │  idle(待机) walk(行走) drag(拖拽)          │ │
│  │  fall(下落) click(点击)                    │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  [选择 Sprite Sheet 文件]  [选择 JSON 配置]      │
│                                                  │
└──────────────────────────────────────────────────┘
```

配置窗口应内置以下辅助功能:

1. **示例素材下载** — 提供 2-3 个预制作的 sprite sheet 示例包，用户可直接使用或参考
2. **格式说明** — 链接到应用内嵌的教程页面或外部文档
3. **格式校验** — 上传后自动检测 sprite sheet 格式是否正确，给出错误提示
4. **帧预览** — 上传后自动解析并预览各动画状态的帧序列

---

## 3. 技术选型

### 选定方案: Electron + TypeScript + Vite

| 维度 | 评估 |
|------|------|
| 生态成熟度 | ★★★★★ — 大量桌面宠物参考实现 |
| 透明窗口支持 | ★★★★★ — 原生 `transparent + frameless` |
| 打包体积 | ★★☆☆☆ — ~150MB+ (含 Chromium) |
| 开发效率 | ★★★★★ — Web 技术栈，热更新 |
| Live2D 集成 | ★★★★★ — pixi-live2d-display 成熟方案 |

**关键技术依赖:**
- `electron` — 桌面应用框架
- `pixi.js` — 2D 渲染引擎（Sprite Sheet + Live2D 统一渲染层）
- `pixi-live2d-display` — Live2D Cubism 模型渲染
- `electron-store` — 配置持久化
- `electron-builder` — 打包分发

---

## 4. 架构设计

### 4.1 整体架构

```
┌──────────────────────────────────────────────────┐
│                    Electron                       │
│  ┌──────────┐  ┌────────────┐  ┌──────────────┐ │
│  │  Main     │  │  Pet        │  │  Config      │ │
│  │  Process  │  │  Window(s)  │  │  Window      │ │
│  │          │  │ (Renderer)  │  │ (Renderer)   │ │
│  │ - Tray   │  │ - PixiJS    │  │ - 上传图片   │ │
│  │ - IPC    │  │ - Sprite/L2D│  │ - 动画参数   │ │
│  │ - Actions│  │ - Physics   │  │ - 外观设置   │ │
│  │ - Config │  │ - Input     │  │ - 动作管理   │ │
│  │          │  │ - StateMach │  │ - 行为模式   │ │
│  └──────────┘  └────────────┘  └──────────────┘ │
└──────────────────────────────────────────────────┘
```

### 4.2 进程模型

```
Main Process (Node.js)
├── TrayManager          — 系统托盘图标、右键菜单
├── PetWindowManager     — 管理多个透明桌宠窗口
├── ConfigWindowManager  — 管理独立配置窗口
├── ConfigManager        — 读写用户配置 (electron-store)
├── ActionExecutor       — 执行用户定义的动作 (URL/CMD/消息)
└── IPC Bridge           — 主进程与渲染进程通信

Pet Renderer (Chromium + PixiJS)
├── RenderEngine         — PixiJS 渲染引擎 (统一 Sprite Sheet / Live2D)
├── SpriteAdapter        — Sprite Sheet 动画适配器
├── Live2DAdapter        — Live2D 模型适配器 (Phase 2)
├── PhysicsEngine        — 简单重力 / 碰撞检测 / 地面检测
├── InputHandler         — 鼠标拖拽 / 左键点击 / 右键菜单
└── StateMachine         — 桌宠行为状态机 (idle/walk/drag/fall/click)

Config Renderer (Chromium)
├── ImageUploader        — 图片上传 & 预览
├── AnimationSettings    — 动画参数调节 (帧率、速度)
├── AppearanceSettings   — 外观设置 (大小、透明度、层级)
├── ActionEditor         — 动作配置编辑器 (增删改)
├── BehaviorSettings     — 行为模式设置
└── PetPreview           — 实时预览
```

### 4.3 核心数据模型

```typescript
// 桌宠配置
interface PetConfig {
  id: string;
  name: string;
  modelType: 'sprite-sheet' | 'live2d';  // 模型类型
  modelPath: string;                       // 模型文件路径
  size: { width: number; height: number };
  position: { x: number; y: number };
  opacity: number;                         // 透明度 0-1
  zIndex: number;                          // 层级
  animations: AnimationConfig;
  actions: PetAction[];
  behavior: BehaviorConfig;
}

// 动画配置 (Sprite Sheet 模式)
interface SpriteAnimationConfig {
  frameWidth: number;
  frameHeight: number;
  fps: number;
  states: {
    idle: FrameRange;
    walk: FrameRange;
    drag: FrameRange;
    fall: FrameRange;
    click: FrameRange;
  };
}

// 动画配置 (Live2D 模式)
interface Live2DAnimationConfig {
  modelPath: string;          // .model3.json 路径
  motions: Record<string, string>;  // 动作映射
  expressions: Record<string, string>;  // 表情映射
  followMouse: boolean;       // 是否跟随鼠标
}

// 统一动画配置
type AnimationConfig = SpriteAnimationConfig | Live2DAnimationConfig;

// 帧范围
interface FrameRange {
  start: number;
  end: number;
  loop: boolean;
}

// 自定义动作
interface PetAction {
  id: string;
  trigger: 'left-click';
  type: 'open-url' | 'execute-cmd' | 'show-message';
  payload: string;
  name: string;
  confirmBeforeExecute: boolean;  // 执行前是否确认 (CMD 建议开启)
}

// 行为配置
interface BehaviorConfig {
  walkSpeed: number;
  gravity: boolean;
  screenEdgeBehavior: 'bounce' | 'wrap' | 'stop';
  idleTimeout: number;
  randomWalk: boolean;
}

// 完整应用配置
interface AppConfig {
  pets: PetConfig[];
  globalSettings: {
    language: string;
    autoStart: boolean;
    checkUpdate: boolean;
  };
}
```

---

## 5. 关键技术方案

### 5.1 透明窗口 + 点击穿透

```typescript
// Main Process
const petWindow = new BrowserWindow({
  width: 200,
  height: 200,
  transparent: true,
  frame: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  hasShadow: false,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
});

// 默认点击穿透
petWindow.setIgnoreMouseEvents(true, { forward: true });

// Renderer — 鼠标进入桌宠像素区域时取消穿透
canvas.addEventListener('mouseenter', () => {
  window.electronAPI.setInteractive(true);
});
canvas.addEventListener('mouseleave', () => {
  window.electronAPI.setInteractive(false);
});
```

### 5.2 PixiJS 统一渲染层

使用 PixiJS 作为统一渲染层，Sprite Sheet 和 Live2D 通过适配器模式接入:

```typescript
// 渲染适配器接口
interface RenderAdapter {
  init(container: PIXI.Container): Promise<void>;
  setState(state: AnimationState): void;
  update(delta: number): void;
  destroy(): void;
  getBounds(): PIXI.Rectangle;
}

// Sprite Sheet 适配器
class SpriteAdapter implements RenderAdapter {
  private spritesheet: PIXI.Spritesheet;
  private animatedSprite: PIXI.AnimatedSprite;

  async init(container: PIXI.Container) {
    this.spritesheet = await PIXI.Assets.load(this.config.modelPath);
    this.animatedSprite = new PIXI.AnimatedSprite(
      this.spritesheet.animations[this.currentState]
    );
    container.addChild(this.animatedSprite);
  }

  setState(state: AnimationState) {
    this.animatedSprite.textures = this.spritesheet.animations[state];
    this.animatedSprite.play();
  }

  update(delta: number) {
    this.animatedSprite.update(delta);
  }
}

// Live2D 适配器 (Phase 2)
class Live2DAdapter implements RenderAdapter {
  private model: Live2DModel;

  async init(container: PIXI.Container) {
    this.model = await Live2DModel.from(this.config.modelPath);
    container.addChild(this.model);
  }

  setState(state: AnimationState) {
    this.model.motion(this.config.motions[state]);
  }

  update(delta: number) {
    // Live2D 模型内部自动更新
  }
}
```

### 5.3 行为状态机

```
状态转换图:

         ┌──────────┐
    ┌───>│   Idle   │<───────────────┐
    │    └────┬─────┘                │
    │         │ idleTimeout/随机       │
    │    ┌────v─────┐                │
    │    │   Walk   │────────────────┘
    │    └────┬─────┘      到达屏幕边界
    │         │ 鼠标按下
    │    ┌────v─────┐
    │    │   Drag   │  (跟随鼠标移动)
    │    └────┬─────┘
    │         │ 鼠标释放
    │    ┌────v─────┐
    │    │   Fall   │  (重力下落至桌面)
    │    └────┬─────┘
    │         │ 落地
    └─────────┘ → 回到 Idle 或 Walk

    任意状态 —[左键点击]→ Click → 执行动作 → 回到之前状态
```

```typescript
class StateMachine {
  private state: AnimationState = 'idle';
  private transitions: Record<AnimationState, Partial<Record<Event, AnimationState>>> = {
    idle:  { timeout: 'walk', mousedown: 'drag', click: 'click' },
    walk:  { edge: 'idle', mousedown: 'drag', click: 'click' },
    drag:  { mouseup: 'fall' },
    fall:  { landed: 'idle' },
    click: { actionDone: 'idle' },
  };

  emit(event: Event) {
    const next = this.transitions[this.state]?.[event];
    if (next) {
      this.onExit(this.state);
      this.state = next;
      this.onEnter(this.state);
    }
  }
}
```

### 5.4 物理引擎

简单重力模拟，不需要引入 Matter.js:

```typescript
class PhysicsEngine {
  private velocityY = 0;
  private gravity = 0.5;
  private groundY: number;  // 屏幕底部 Y 坐标

  update(position: { x: number; y: number }, delta: number) {
    if (position.y < this.groundY) {
      this.velocityY += this.gravity * delta;
      position.y += this.velocityY * delta;

      if (position.y >= this.groundY) {
        position.y = this.groundY;
        this.velocityY = 0;
        return 'landed';
      }
    }
    return null;
  }
}
```

### 5.5 动作执行系统

```typescript
// Main Process - ActionExecutor
class ActionExecutor {
  async execute(action: PetAction): Promise<ActionResult> {
    if (action.confirmBeforeExecute) {
      const result = await dialog.showMessageBox({
        type: 'question',
        buttons: ['执行', '取消'],
        message: `确认执行: ${action.name}?\n${action.payload}`,
      });
      if (result.response !== 0) return { success: false, cancelled: true };
    }

    switch (action.type) {
      case 'open-url':
        await shell.openExternal(action.payload);
        break;
      case 'execute-cmd':
        await execAsync(action.payload);
        break;
      case 'show-message':
        await dialog.showMessageBox({ message: action.payload });
        break;
    }
    return { success: true };
  }
}
```

### 5.6 独立配置窗口

配置窗口为独立 BrowserWindow，包含以下功能模块:

```
┌─────────────────────────────────────────────┐
│  Desk-Idoll 设置                            │
├─────────────────────────────────────────────┤
│                                             │
│  [基本设置]  [动画设置]  [动作管理]  [外观]  │
│                                             │
│  ┌─ 基本设置 ─────────────────────────────┐ │
│  │  桌宠名称: [____________]              │ │
│  │  模型类型: ○ Sprite Sheet ○ Live2D     │ │
│  │  上传文件: [选择文件...]  [预览]       │ │
│  │  桌宠大小: [====●====] 200px          │ │
│  │  行为模式: [行走+待机+拖拽 ▼]          │ │
│  └────────────────────────────────────────┘ │
│                                             │
│  ┌─ 动画设置 ─────────────────────────────┐ │
│  │  帧率:     [====●====] 12 fps          │ │
│  │  行走速度: [====●====] 2 px/frame      │ │
│  │  重力:     [✓] 启用                    │ │
│  │  屏幕边缘: [弹回 ▼]                    │ │
│  │  待机超时: [====●====] 3000ms          │ │
│  │  随机行走: [✓] 启用                    │ │
│  └────────────────────────────────────────┘ │
│                                             │
│  ┌─ 动作管理 ─────────────────────────────┐ │
│  │  [+ 添加动作]                          │ │
│  │  ┌──────────────────────────────────┐  │ │
│  │  │ 打开浏览器    URL  https://...  │  │ │
│  │  │ 打开记事本    CMD  notepad.exe  │  │ │
│  │  │ 弹窗消息      MSG  Hello!       │  │ │
│  │  └──────────────────────────────────┘  │ │
│  └────────────────────────────────────────┘ │
│                                             │
│  ┌─ 外观 ─────────────────────────────────┐ │
│  │  透明度: [====●====] 100%              │ │
│  │  层级:   [====●====] 最前              │ │
│  └────────────────────────────────────────┘ │
│                                             │
│  [保存]  [取消]  [添加到桌面]               │
└─────────────────────────────────────────────┘
```

### 5.7 右键菜单

```typescript
// Renderer 进程中构建菜单模板
const contextMenuTemplate = [
  { label: '设置', click: () => openConfigWindow() },
  { type: 'separator' },
  ...pet.actions.map(action => ({
    label: action.name,
    click: () => executeAction(action),
  })),
  { type: 'separator' },
  { label: '隐藏', click: () => hidePet() },
  { label: '退出', click: () => quitApp() },
];
```

---

## 6. 参考的开源实现

| 项目 | 技术栈 | 参考价值 |
|------|--------|----------|
| [Shimeji-ee](https://github.com/Kilkakon/shimeji) | Java | 行为状态机、sprite sheet 动画系统、桌面交互 |
| [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) | PixiJS | Live2D 模型在 Web/Electron 中的渲染方案 |
| [Live2dDesktopPet](https://github.com/RimoChan/Live2dDesktopPet) | Electron | Live2D 桌面宠物完整实现 |
| [Meta AnimatedDrawings](https://github.com/facebookresearch/AnimatedDrawings) | Python | 单张图片 → 骨骼绑定 → 动画 (远期 AI 方案) |
| [LivePortrait](https://github.com/KwaiVGI/LivePortrait) | Python | 肖像表情驱动 (远期 AI 方案) |
| [live2d-widget](https://github.com/stevenjoezhang/live2d-widget) | Web | Live2D 网页挂件，可嵌入 Electron |

---

## 7. 实现阶段规划

### Phase 1: 基础骨架 + Sprite Sheet (MVP) — ~5-7 天 ✅

**目标:** 用户可以导入 sprite sheet 生成一个能在桌面行走的桌宠

- [x] 项目初始化 (Electron + TypeScript + Vite + PixiJS)
- [x] 透明无边框窗口 + always-on-top + 点击穿透
- [x] PixiJS 渲染引擎集成
- [x] Sprite Sheet 加载与动画播放
- [x] 行为状态机 (idle → walk → drag → fall)
- [x] 简单物理引擎 (重力 + 地面碰撞)
- [x] 屏幕边界检测 + 随机行走
- [x] 左键点击 + 右键菜单基础交互
- [x] 系统托盘 (退出/隐藏)
- [x] 内置默认 sprite sheet 用于演示
- [x] electron-builder 打包配置

**交付物:** 导入 sprite sheet 后，桌宠能在桌面自由行走、可拖拽、有重力效果

### Phase 2: 独立配置窗口 — ~5-7 天 ✅

**目标:** 用户可以通过配置窗口自定义桌宠

- [x] 配置窗口 BrowserWindow 创建与管理
- [x] 图片上传 (sprite sheet) + 本地存储
- [x] 基本设置 (名称、大小、行为模式)
- [x] 动画参数调节 (帧率、行走速度、重力开关)
- [x] 外观设置 (透明度、层级)
- [x] 实时预览 (桌宠窗口实时同步配置变更)
- [x] 配置持久化 (electron-store)
- [x] 多桌宠实例支持 (添加/删除/切换)
- [x] 右键菜单完善 (设置入口、动作列表)

**交付物:** 用户可以通过配置窗口上传 sprite sheet 并自定义桌宠各项参数

### Phase 3: 自定义动作系统 — ~3-5 天 ✅

**目标:** 桌宠左键点击后能执行自定义操作

- [x] 动作配置 UI (打开 URL / 执行 CMD / 显示消息)
- [x] 动作执行引擎 (Main Process)
- [x] 左键点击触发动作
- [x] 动作列表管理 (增删改)
- [x] CMD 执行确认对话框
- [x] 动作执行状态反馈 (成功/失败动画)

**交付物:** 用户可以配置桌宠的左键点击行为，支持打开 URL、执行 CMD、弹窗消息

### Phase 4: Live2D 支持 — ~5-7 天 ✅

**目标:** 支持 Live2D 模型作为桌宠

> **状态:** PixiJS 已降级至 v6.5.10，pixi-live2d-display@0.4.0 已集成，Live2D 适配器已完整实现。
> Cubism SDK Core 已打包。用户导入 .model3.json 即可使用 Live2D 模型。

- [x] Live2D 适配器接口实现
- [x] pixi-live2d-display 集成 (PixiJS v6.5.10)
- [x] Live2D 模型加载与渲染 (Live2DModel.from)
- [x] Live2D 适配器实现 (motion/expression 映射)
- [x] Cubism SDK Core 打包 (live2dcubismcore.min.js)
- [x] 配置窗口支持 Live2D 模型上传 (modelType 切换 + .model3.json 拖拽自动识别)
- [x] 状态机适配 Live2D motion 系统 (fallback 映射: idle/walk/drag/fall/click → motion group)

**交付物:** 用户可以导入 Live2D 模型作为桌宠，享受更自然的动画效果

### Phase 5: 打磨与扩展 — ~5-7 天 ✅

**目标:** 产品级体验

- [x] 开机自启动 (IPC + 配置窗口 UI 开关)
- [x] 自动更新 (electron-updater)
- [x] 多语言支持 (i18n — zh-CN + en，配置窗口/托盘/通知全覆盖)
- [x] 性能优化 — 无需进行（当前仅支持单桌宠实例，PixiJS 单实例内存/CPU 开销极小，多实例共享进程方案不适用）
- [x] 错误处理与日志系统 (logger + uncaughtException/unhandledRejection)
- [x] 用户引导 (首次启动通知提示)
- [x] 应用图标 (icon.ico 256x256)

**Phase 6 (远期探索):**
- [ ] AI 图片建模 — 集成 Meta Animated Drawings 或类似方案
- [ ] 用户上传单张图片 → AI 自动生成动画
- [ ] 应用内素材市场 / 分享社区

---

## 8. 目录结构

```
desk-idoll/
├── docs/
│   └── plans/
│       └── 2026-06-07-desktop-pet-design.md
├── src/
│   ├── main/                         # Electron Main Process
│   │   ├── index.ts                  # 入口
│   │   ├── tray.ts                   # 系统托盘
│   │   ├── pet-window.ts             # 桌宠窗口管理
│   │   ├── config-window.ts          # 配置窗口管理
│   │   ├── config-manager.ts         # 配置读写 (electron-store)
│   │   ├── action-executor.ts        # 动作执行
│   │   └── ipc.ts                    # IPC 通信注册
│   ├── preload/
│   │   └── index.ts                  # preload 脚本 (contextBridge)
│   ├── renderer/                     # Pet Renderer
│   │   ├── index.html
│   │   ├── main.ts                   # 渲染进程入口
│   │   ├── engine/
│   │   │   ├── render-engine.ts      # PixiJS 渲染引擎
│   │   │   ├── adapter.ts            # RenderAdapter 接口
│   │   │   ├── sprite-adapter.ts     # Sprite Sheet 适配器
│   │   │   ├── live2d-adapter.ts     # Live2D 适配器 (Phase 4)
│   │   │   ├── physics.ts            # 物理引擎
│   │   │   └── input.ts              # 输入处理
│   │   ├── state/
│   │   │   └── machine.ts            # 行为状态机
│   │   └── styles/
│   │       └── main.css
│   ├── config/                       # Config Renderer
│   │   ├── index.html
│   │   ├── main.ts
│   │   └── components/
│   │       ├── ImageUploader.ts
│   │       ├── AnimationSettings.ts
│   │       ├── AppearanceSettings.ts
│   │       ├── ActionEditor.ts
│   │       ├── BehaviorSettings.ts
│   │       └── PetPreview.ts
│   ├── shared/                       # 共享类型和工具
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   └── ipc-channels.ts
│   └── assets/
│       ├── default-pet/              # 默认 sprite sheet
│       │   ├── spritesheet.json
│       │   └── spritesheet.png
│       └── tray-icon.png
├── resources/
│   └── icon.png                      # 应用图标
├── electron-builder.yml
├── electron.vite.config.ts
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── tsconfig.web.json
```

---

## 9. 依赖清单

```json
{
  "dependencies": {
    "electron-store": "^8.x",
    "pixi.js": "6.5.10",
    "pixi-live2d-display": "0.4.0"
  },
  "devDependencies": {
    "electron": "^33.x",
    "electron-builder": "^25.x",
    "electron-vite": "^2.x",
    "typescript": "^5.x",
    "vite": "^6.x"
  }
}
```

---

## 10. 风险与应对

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| 透明窗口在不同 Windows 版本兼容性 | 银高 | 测试 Win10/11，备选 DWM 方案 |
| Electron 包体过大 | 中 | 后期可迁移到 Tauri，当前优先功能 |
| PixiJS + Live2D 内存占用 | 中 | 限制模型复杂度，按需加载/卸载模型 |
| CMD 执行安全风险 | 高 | 默认开启确认对话框，命令记录审计 |
| 多实例内存占用 | 中 | 限制最大实例数，共享渲染进程优化 |
| Sprite Sheet 格式兼容 | 低 | 支持标准 PixiJS spritesheet JSON 格式 |

---

## 11. 附录: Sprite Sheet 格式规范

应用接受标准 PixiJS Spritesheet JSON 格式:

```json
{
  "frames": {
    "idle_0": { "frame": { "x": 0, "y": 0, "w": 128, "h": 128 } },
    "idle_1": { "frame": { "x": 128, "y": 0, "w": 128, "h": 128 } },
    "walk_0": { "frame": { "x": 0, "y": 128, "w": 128, "h": 128 } },
    "walk_1": { "frame": { "x": 128, "y": 128, "w": 128, "h": 128 } }
  },
  "animations": {
    "idle": ["idle_0", "idle_1"],
    "walk": ["walk_0", "walk_1"]
  },
  "meta": {
    "size": { "w": 512, "h": 512 },
    "scale": "1"
  }
}
```

预设动画状态命名:
- `idle` — 待机
- `walk` — 行走
- `drag` — 拖拽
- `fall` — 下落
- `click` — 点击反馈
