# 模块 03 — 渲染引擎 (Render Engine)

> 日期: 2026-06-07
> 依赖模块: 01-main-process (IPC 通信), 02-preload (contextBridge)
> 技术栈: PixiJS 8.x, TypeScript, Vite, Electron

---

## 目录

1. [模块概述](#1-模块概述)
2. [文件清单](#2-文件清单)
3. [src/renderer/index.html — HTML 模板](#3-srcrendererindexhtml--html-模板)
4. [src/renderer/styles/main.css — 全局样式](#4-srcrendererstylesmaincss--全局样式)
5. [src/renderer/engine/adapter.ts — 适配器接口](#5-srcrendererengineadapter--适配器接口)
6. [src/renderer/engine/sprite-adapter.ts — Sprite Sheet 适配器](#6-srcrendererenginesprite-adapter--sprite-sheet-适配器)
7. [src/renderer/engine/render-engine.ts — 渲染引擎核心](#7-srcrendererenginerender-engine--渲染引擎核心)
8. [src/renderer/main.ts — 渲染进程入口](#8-srcrenderermain--渲染进程入口)
9. [模块初始化流程图](#9-模块初始化流程图)
10. [坐标系统说明](#10-坐标系统说明)
11. [Sprite Sheet 格式规范](#11-sprite-sheet-格式规范)
12. [扩展指南: 新增适配器](#12-扩展指南新增适配器)

---

## 1. 模块概述

渲染引擎是 Desk-Idoll 桌宠应用的核心模块，运行在 Electron 渲染进程中。它负责:

- 初始化 PixiJS Application，创建透明背景的 canvas
- 提供统一的 RenderAdapter 接口，屏蔽 Sprite Sheet 与 Live2D 的差异
- 管理动画状态切换 (idle / walk / drag / fall / click)
- 将桌面屏幕坐标转换为 PixiJS 渲染坐标
- 每帧驱动适配器的 update 方法，保持动画流畅

**设计原则:**

- 适配器模式 — RenderEngine 不直接操作 Sprite 或 Live2D 对象，而是通过适配器抽象
- 生命周期明确 — init / destroy 对称，避免内存泄漏
- 坐标统一 — 所有外部输入（鼠标位置、窗口位置）统一转换为渲染坐标后再使用

---

## 2. 文件清单

```
src/renderer/
├── index.html                 # HTML 模板 (Vite 入口)
├── main.ts                    # 渲染进程入口
├── styles/
│   └── main.css               # 全局样式
└── engine/
    ├── adapter.ts             # RenderAdapter 接口 + AnimationState 类型
    ├── sprite-adapter.ts      # Sprite Sheet 适配器
    └── render-engine.ts       # 渲染引擎核心
```

---

## 3. src/renderer/index.html — HTML 模板

最小化 HTML 结构。Vite 通过此文件作为入口点，将 `main.ts` 注入为 `<script type="module">`。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;" />
  <title>Desk-Idoll</title>
</head>
<body>
  <!-- PixiJS 将自动在此创建 canvas -->
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

**要点:**

- `<body>` 为空 — PixiJS Application 会自动创建 canvas 并 append 到 body
- CSP 限制: 仅允许 `'self'` 来源的脚本和样式，图片允许 `data:` 和 `blob:` (PixiJS 纹理加载需要)
- 无外部 CDN 引用 — 所有依赖通过 Vite 打包

---

## 4. src/renderer/styles/main.css — 全局样式

```css
/*
 * Desk-Idoll 渲染进程全局样式
 *
 * 核心目标:
 * 1. 完全透明背景 — Electron transparent 窗口依赖于此
 * 2. Canvas 填满整个窗口 — PixiJS 渲染区域等于窗口大小
 * 3. 禁用所有默认交互 — 鼠标事件由 PixiJS/InputHandler 单独处理
 */

/* --- Reset --- */

*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* --- Body: 透明背景 + 全屏 --- */

html,
body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: transparent;
  /* 确保 Electron transparent 窗口在所有 Windows 版本上生效 */
  background: transparent;
}

/* --- Canvas: 填充窗口 + 无边距 --- */

canvas {
  display: block;
  width: 100%;
  height: 100%;
  /* PixiJS 设置的内联宽高会覆盖此值，但保留作为 fallback */
}

/* --- 禁用文本选中 --- */

body {
  -webkit-user-select: none;
  user-select: none;
}

/* --- 禁用拖拽 (防止 Electron 默认拖拽行为干扰) --- */

img,
canvas {
  -webkit-user-drag: none;
  user-select: none;
  pointer-events: none;
}

/*
 * 注意: canvas 的 pointer-events 设为 none 是因为
 * PixiJS 自身在 canvas 上层管理交互。
 * InputHandler 通过 PixiJS 的 event system (FederatedPointerEvent)
 * 捕获鼠标事件，不需要 DOM 级别的 pointer-events。
 *
 * 如果后续发现 PixiJS 事件不工作，将此改为 pointer-events: auto。
 */
</script>
```

---

## 5. src/renderer/engine/adapter.ts — 适配器接口

定义渲染适配器的统一接口、动画状态类型，以及适配器工厂函数。

```typescript
/**
 * adapter.ts — 渲染适配器接口定义
 *
 * RenderAdapter 是 Sprite Sheet 和 Live2D 的统一抽象层。
 * RenderEngine 只通过此接口操作动画模型，不直接依赖具体实现。
 */

import type * as PIXI from 'pixi.js';

// ============================================================
// AnimationState — 桌宠行为状态
// ============================================================

/**
 * 桌宠的动画状态。
 *
 * 与 StateMachine 的状态一一对应:
 * - idle:  待机 (站立不动，偶尔眨眼/呼吸)
 * - walk:  行走 (在桌面上左右移动)
 * - drag:  拖拽 (被用户鼠标抓住，跟随移动)
 * - fall:  下落 (被释放后受重力下落)
 * - click: 点击 (左键点击后的反馈动画)
 */
export type AnimationState = 'idle' | 'walk' | 'drag' | 'fall' | 'click';

// ============================================================
// RenderAdapter — 渲染适配器接口
// ============================================================

/**
 * 渲染适配器接口。
 *
 * 生命周期:
 *   init() → setState('idle') → update() 每帧调用 → destroy()
 *
 * 所有适配器 (SpriteAdapter, Live2DAdapter) 必须实现此接口。
 */
export interface RenderAdapter {
  /**
   * 初始化适配器。
   *
   * 负责加载资源 (spritesheet / model3.json) 并创建渲染对象，
   * 将渲染对象添加到传入的 container 中。
   *
   * @param container - PixiJS 容器，适配器将渲染对象作为其子节点添加
   * @param config - 适配器配置 (模型路径、帧率等)
   */
  init(container: PIXI.Container, config: AdapterConfig): Promise<void>;

  /**
   * 切换动画状态。
   *
   * 切换时应:
   * 1. 停止当前动画
   * 2. 切换到目标状态的纹理/动作
   * 3. 播放新动画
   *
   * @param state - 目标动画状态
   */
  setState(state: AnimationState): void;

  /**
   * 每帧更新。
   *
   * 由 RenderEngine 的 ticker 驱动，传入 delta 时间因子。
   * 适配器在此方法中推进动画帧、更新内部状态。
   *
   * @param delta - 时间因子 (1.0 = 正常速度，基于 60fps)
   */
  update(delta: number): void;

  /**
   * 获取当前渲染对象的碰撞边界。
   *
   * 返回的矩形使用本地坐标系 (相对于 container)。
   * 用于 InputHandler 判断鼠标是否在桌宠区域内。
   *
   * @returns 碰撞边界矩形
   */
  getBounds(): PIXI.Rectangle;

  /**
   * 销毁适配器，释放所有资源。
   *
   * 必须:
   * 1. 从 container 移除渲染对象
   * 2. 销毁纹理和 Spritesheet
   * 3. 清空内部引用
   */
  destroy(): void;

  /**
   * 适配器是否已初始化完成。
   */
  readonly ready: boolean;
}

// ============================================================
// AdapterConfig — 适配器配置
// ============================================================

/**
 * 适配器初始化时的配置参数。
 */
export interface AdapterConfig {
  /** 模型文件路径 (sprite sheet JSON 或 .model3.json) */
  modelPath: string;

  /** 目标渲染尺寸 (缩放适配) */
  width: number;
  height: number;

  /** 动画帧率 */
  fps: number;

  /** 初始动画状态 */
  initialState?: AnimationState;
}

// ============================================================
// AdapterFactory — 适配器工厂
// ============================================================

/**
 * 适配器类型枚举。
 */
export type AdapterType = 'sprite-sheet' | 'live2d';

/**
 * 适配器工厂函数。
 *
 * 根据传入的类型创建对应的适配器实例。
 * 使用动态 import 实现懒加载，避免未使用的适配器代码影响首屏加载。
 *
 * @param type - 适配器类型
 * @returns 适配器实例
 *
 * @example
 * ```typescript
 * const adapter = await createAdapter('sprite-sheet');
 * await adapter.init(container, { modelPath: './pet.json', width: 128, height: 128, fps: 12 });
 * ```
 */
export async function createAdapter(type: AdapterType): Promise<RenderAdapter> {
  switch (type) {
    case 'sprite-sheet': {
      const { SpriteAdapter } = await import('./sprite-adapter');
      return new SpriteAdapter();
    }
    case 'live2d': {
      // Phase 2: Live2D 适配器
      // const { Live2DAdapter } = await import('./live2d-adapter');
      // return new Live2DAdapter();
      throw new Error('Live2D adapter is not yet implemented. Coming in Phase 2.');
    }
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown adapter type: ${_exhaustive}`);
    }
  }
}
```

**设计要点:**

- `AnimationState` 使用字符串联合类型而非 enum — 便于序列化和 IPC 传输
- `createAdapter` 使用动态 `import()` — 懒加载适配器代码，Live2D 运行时不加载 sprite-adapter 的依赖也不影响
- 穷尽检查 (`_exhaustive: never`) — 新增适配器类型时 TypeScript 编译器会强制要求处理
- `ready` 只读属性 — 防止外部篡改初始化状态

---

## 6. src/renderer/engine/sprite-adapter.ts — Sprite Sheet 适配器

Sprite Sheet 适配器的完整实现。处理 PixiJS 标准 Spritesheet JSON 格式的加载、AnimatedSprite 创建、动画状态切换和帧更新。

```typescript
/**
 * sprite-adapter.ts — Sprite Sheet 渲染适配器
 *
 * 使用 PixiJS 的 Assets 系统加载 Spritesheet (JSON + PNG)，
 * 通过 AnimatedSprite 播放帧动画。
 *
 * 支持的 Sprite Sheet 格式: PixiJS 标准 Spritesheet JSON
 * 参考: https://pixijs.io/8.x/guides/components/assets#spritesheet
 */

import {
  Assets,
  AnimatedSprite,
  Container,
  Rectangle,
  Spritesheet,
  Texture,
} from 'pixi.js';
import type { RenderAdapter, AdapterConfig, AnimationState } from './adapter';

/**
 * SpriteAdapter — 基于 Sprite Sheet 的渲染适配器。
 *
 * 工作流程:
 * 1. init() → 加载 sprite sheet JSON + PNG → 创建 AnimatedSprite → 添加到 container
 * 2. setState() → 切换 AnimatedSprite 的 textures 数组 → 重新播放
 * 3. update() → 推进 AnimatedSprite 的当前帧
 * 4. destroy() → 移除并销毁所有资源
 */
export class SpriteAdapter implements RenderAdapter {
  /** PixiJS Spritesheet 实例 (包含所有帧纹理和动画定义) */
  private spritesheet: Spritesheet | null = null;

  /** PixiJS AnimatedSprite (当前渲染的动画精灵) */
  private sprite: AnimatedSprite | null = null;

  /** 父容器引用 (用于 destroy 时移除子节点) */
  private container: Container | null = null;

  /** 当前动画状态 */
  private currentState: AnimationState = 'idle';

  /** 目标渲染尺寸 */
  private targetWidth = 0;
  private targetHeight = 0;

  /** 初始化完成标志 */
  private _ready = false;

  /** @override */
  get ready(): boolean {
    return this._ready;
  }

  // ============================================================
  // init — 加载资源并创建渲染对象
  // ============================================================

  /**
   * 初始化 Sprite 适配器。
   *
   * 步骤:
   * 1. 使用 PIXI.Assets.load 加载 sprite sheet (JSON + PNG 一起加载)
   * 2. 从 spritesheet.animations 中取出初始状态的纹理数组
   * 3. 创建 AnimatedSprite 并配置属性
   * 4. 计算缩放比例，使精灵适配目标尺寸
   * 5. 将精灵添加到 container
   *
   * @param container - PixiJS 容器
   * @param config - 适配器配置
   * @throws 如果 sprite sheet 加载失败或格式不正确
   */
  async init(container: Container, config: AdapterConfig): Promise<void> {
    this.container = container;
    this.targetWidth = config.width;
    this.targetHeight = config.height;

    // --- 1. 加载 Spritesheet ---
    // PIXI.Assets.load 对 Spritesheet JSON 有原生支持:
    // 它会自动解析 JSON 中的 frames 字段，并加载对应的 PNG 纹理图集。
    // 返回值类型为 Spritesheet。
    try {
      this.spritesheet = await Assets.load<Spritesheet>(config.modelPath);
    } catch (error) {
      throw new Error(
        `[SpriteAdapter] Failed to load sprite sheet: ${config.modelPath}\n` +
        `  Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // --- 2. 验证 Spritesheet 格式 ---
    if (!this.spritesheet.animations || Object.keys(this.spritesheet.animations).length === 0) {
      throw new Error(
        `[SpriteAdapter] Sprite sheet has no animations defined.\n` +
        `  Expected: "animations" field in JSON (e.g. { "idle": ["idle_0", "idle_1"] })\n` +
        `  Path: ${config.modelPath}`
      );
    }

    // --- 3. 获取初始状态的纹理 ---
    const initialState = config.initialState ?? 'idle';
    const textures = this.getTexturesForState(initialState);

    // --- 4. 创建 AnimatedSprite ---
    this.sprite = new AnimatedSprite(textures);
    this.sprite.anchor.set(0.5, 0.5); // 中心锚点，便于坐标计算

    // --- 5. 配置动画参数 ---
    this.sprite.animationSpeed = config.fps / 60;
    // PixiJS 的 animationSpeed 单位是 "帧 / ticker 帧"，
    // 如果 ticker 跑在 60fps，想要 12fps 的动画，速度 = 12/60 = 0.2
    this.sprite.loop = true;
    this.sprite.play();

    // --- 6. 缩放适配 ---
    // Spritesheet 中的帧尺寸可能与目标尺寸不同，需要缩放。
    // 帧尺寸取自 spritesheet 中第一帧的原始像素尺寸。
    const frameTexture = textures[0];
    if (frameTexture) {
      const frameWidth = frameTexture.width;
      const frameHeight = frameTexture.height;

      if (frameWidth > 0 && frameHeight > 0) {
        const scaleX = this.targetWidth / frameWidth;
        const scaleY = this.targetHeight / frameHeight;
        // 等比缩放，取较小值以保证完整显示
        const scale = Math.min(scaleX, scaleY);
        this.sprite.scale.set(scale);
      }
    }

    // --- 7. 添加到容器 ---
    container.addChild(this.sprite);

    // --- 8. 标记就绪 ---
    this.currentState = initialState;
    this._ready = true;
  }

  // ============================================================
  // setState — 切换动画状态
  // ============================================================

  /**
   * 切换到目标动画状态。
   *
   * 如果目标状态与当前状态相同，则忽略 (避免重复切换导致动画重置)。
   * 如果目标状态在 spritesheet 中没有对应的动画定义，
   * 会 fallback 到 'idle' 状态并打印警告。
   *
   * @param state - 目标动画状态
   */
  setState(state: AnimationState): void {
    if (!this.sprite || !this.spritesheet) {
      console.warn('[SpriteAdapter] setState called before init');
      return;
    }

    // 避免重复切换
    if (state === this.currentState) {
      return;
    }

    // 获取目标状态的纹理数组
    let textures: Texture[];
    try {
      textures = this.getTexturesForState(state);
    } catch {
      // 目标状态不存在，fallback 到 idle
      console.warn(
        `[SpriteAdapter] Animation state "${state}" not found in spritesheet. ` +
        `Available: ${Object.keys(this.spritesheet.animations).join(', ')}. ` +
        `Falling back to "idle".`
      );
      if (state !== 'idle') {
        textures = this.getTexturesForState('idle');
        state = 'idle';
      } else {
        // idle 也不存在，保持当前状态
        return;
      }
    }

    // 切换纹理并重新播放
    this.sprite.textures = textures;
    this.sprite.gotoAndPlay(0);

    this.currentState = state;
  }

  // ============================================================
  // update — 帧更新
  // ============================================================

  /**
   * 每帧更新动画。
   *
   * 由 RenderEngine 的 ticker 调用。
   * AnimatedSprite 内部会根据 animationSpeed 自动推进帧，
   * 但需要显式调用 update() 来触发。
   *
   * @param delta - 时间因子 (来自 PIXI.Ticker)
   */
  update(delta: number): void {
    if (!this.sprite) return;

    // AnimatedSprite.update 会根据 animationSpeed * delta 推进帧
    this.sprite.update(delta);
  }

  // ============================================================
  // getBounds — 碰撞边界
  // ============================================================

  /**
   * 获取当前精灵的碰撞边界。
   *
   * 返回的矩形使用本地坐标系 (相对于 container)。
   * 该边界考虑了精灵的缩放和锚点偏移。
   *
   * 注意: 返回的是精灵的实际渲染边界 (包含缩放)，
   * 而非原始帧的像素尺寸。
   *
   * @returns 碰撞边界矩形
   */
  getBounds(): Rectangle {
    if (!this.sprite) {
      return new Rectangle(0, 0, 0, 0);
    }

    // getBounds() 返回世界坐标边界，我们需要本地坐标。
    // 使用 sprite 的 width/height (已包含缩放) 和 position 计算。
    const w = this.sprite.width;
    const h = this.sprite.height;
    const x = this.sprite.x - w * this.sprite.anchor.x;
    const y = this.sprite.y - h * this.sprite.anchor.y;

    return new Rectangle(x, y, w, h);
  }

  // ============================================================
  // destroy — 销毁清理
  // ============================================================

  /**
   * 销毁适配器，释放所有资源。
   *
   * 清理顺序:
   * 1. 从 container 移除 sprite
   * 2. 销毁 sprite (释放 GPU 纹理)
   * 3. 卸载 spritesheet 资源 (从 Assets 缓存中移除)
   * 4. 清空所有内部引用
   */
  destroy(): void {
    // 1. 从容器移除
    if (this.sprite && this.container) {
      this.container.removeChild(this.sprite);
    }

    // 2. 销毁 AnimatedSprite
    //    destroy({ children: true }) 会同时销毁其持有的纹理引用
    if (this.sprite) {
      this.sprite.destroy({ children: true });
      this.sprite = null;
    }

    // 3. 卸载 Spritesheet 资源
    //    Assets.unload 会从缓存中移除，并在引用计数归零时释放 GPU 资源
    if (this.spritesheet) {
      // 获取 spritesheet 对应的资源 URL (用于 unload)
      // Spritesheet 的 textureSource 中存储了原始加载路径
      const textureKeys = Object.keys(this.spritesheet.textures);
      if (textureKeys.length > 0) {
        // 使用 spritesheet 的第一个纹理的来源来 unload 整个 spritesheet
        // 注意: Assets.unload 的参数是加载时使用的 key (即 modelPath)
        // 但 spritesheet 对象可能已经被 Assets 缓存管理，这里做安全卸载
        try {
          // PixiJS 8.x: Spritesheet 自身可以作为 unload 参数
          this.spritesheet.destroy(true);
        } catch (e) {
          // 即使卸载失败也不应阻断后续清理
          console.warn('[SpriteAdapter] Error unloading spritesheet:', e);
        }
      }
      this.spritesheet = null;
    }

    // 4. 清空引用
    this.container = null;
    this._ready = false;
  }

  // ============================================================
  // 内部辅助方法
  // ============================================================

  /**
   * 从 Spritesheet 中获取指定动画状态的纹理数组。
   *
   * Spritesheet.animations 的结构:
   * {
   *   "idle": [Texture, Texture, ...],
   *   "walk": [Texture, Texture, ...],
   *   ...
   * }
   *
   * @param state - 动画状态名
   * @returns 纹理数组
   * @throws 如果该状态在 spritesheet 中不存在
   */
  private getTexturesForState(state: AnimationState): Texture[] {
    if (!this.spritesheet) {
      throw new Error('[SpriteAdapter] Spritesheet not loaded');
    }

    const textures = this.spritesheet.animations[state];

    if (!textures || textures.length === 0) {
      throw new Error(
        `[SpriteAdapter] No textures found for animation state "${state}". ` +
        `Available states: ${Object.keys(this.spritesheet.animations).join(', ')}`
      );
    }

    return textures;
  }
}
```

**关键实现细节:**

1. **animationSpeed 计算**: PixiJS 的 `animationSpeed` 单位是 "每 ticker 帧播放的动画帧数"。Ticker 默认 60fps，所以想要 12fps 的动画，速度 = 12/60 = 0.2。

2. **缩放策略**: 取 `min(scaleX, scaleY)` 等比缩放，保证精灵完整显示在目标区域内不变形。

3. **setState 防抖**: 相同状态重复设置时直接 return，避免动画跳帧。

4. **资源卸载**: `destroy()` 中先移除子节点、再销毁 sprite、最后卸载 spritesheet，顺序不可颠倒。

---

## 7. src/renderer/engine/render-engine.ts — 渲染引擎核心

RenderEngine 是整个渲染模块的门面 (Facade)，管理 PixiJS Application 的生命周期，协调适配器的加载和切换，并提供坐标转换工具。

```typescript
/**
 * render-engine.ts — 渲染引擎核心
 *
 * 职责:
 * 1. 管理 PixiJS Application 的生命周期 (创建、销毁)
 * 2. 管理 RenderAdapter 的加载、切换、更新
 * 3. 提供桌面坐标与渲染坐标之间的转换
 * 4. 驱动游戏循环 (ticker)
 *
 * 设计模式: Facade + Strategy
 * - Facade: 对外暴露简洁的 init/setState/destroy API
 * - Strategy: 适配器可运行时替换 (Sprite → Live2D)
 */

import { Application, Container, Rectangle } from 'pixi.js';
import type { RenderAdapter, AdapterType, AdapterConfig, AnimationState } from './adapter';
import { createAdapter } from './adapter';

// ============================================================
// RenderEngineOptions — 初始化选项
// ============================================================

export interface RenderEngineOptions {
  /** 目标挂载的 DOM 元素 (默认 document.body) */
  mountElement?: HTMLElement;

  /** 窗口宽度 (像素) */
  width: number;

  /** 窗口高度 (像素) */
  height: number;

  /** 背景色 (0xRRGGBB 格式，透明窗口应传 0x000000) */
  backgroundColor?: number;

  /** 背景透明度 (0 = 完全透明，1 = 完全不透明) */
  backgroundAlpha?: number;

  /** 抗锯齿 */
  antialias?: boolean;

  /** 分辨率 (设备像素比，默认 window.devicePixelRatio) */
  resolution?: number;
}

// ============================================================
// CoordinateInfo — 坐标信息
// ============================================================

/**
 * 桌面坐标信息。
 * 由主进程通过 IPC 传递给渲染进程。
 */
export interface DesktopCoordinate {
  /** 窗口在屏幕上的 X 坐标 */
  windowX: number;
  /** 窗口在屏幕上的 Y 坐标 */
  windowY: number;
  /** 鼠标在屏幕上的 X 坐标 */
  mouseX: number;
  /** 鼠标在屏幕上的 Y 坐标 */
  mouseY: number;
}

// ============================================================
// RenderEngine — 渲染引擎核心类
// ============================================================

/**
 * 渲染引擎核心类。
 *
 * 典型使用流程:
 * ```typescript
 * const engine = new RenderEngine();
 * await engine.init({ width: 200, height: 200 });
 * await engine.loadAdapter('sprite-sheet', {
 *   modelPath: './assets/pet.json',
 *   width: 128,
 *   height: 128,
 *   fps: 12,
 * });
 * engine.setState('walk');
 * // ... 游戏运行中 ...
 * engine.destroy();
 * ```
 */
export class RenderEngine {
  /** PixiJS Application 实例 */
  private app: Application | null = null;

  /** 当前活跃的渲染适配器 */
  private adapter: RenderAdapter | null = null;

  /** 桌宠角色容器 (适配器的渲染对象挂载在此) */
  private petContainer: Container | null = null;

  /** 窗口尺寸缓存 */
  private windowWidth = 0;
  private windowHeight = 0;

  /** 初始化完成标志 */
  private _initialized = false;

  /** 当前适配器类型 */
  private currentAdapterType: AdapterType | null = null;

  // ============================================================
  // init — 初始化 PixiJS Application
  // ============================================================

  /**
   * 初始化 PixiJS Application。
   *
   * 步骤:
   * 1. 创建 PixiJS Application
   * 2. 初始化画布 (透明背景)
   * 3. 创建桌宠容器
   * 4. 设置容器初始位置 (窗口中心底部)
   * 5. 启动游戏循环
   *
   * @param options - 初始化选项
   * @throws 如果 PixiJS 初始化失败
   */
  async init(options: RenderEngineOptions): Promise<void> {
    if (this._initialized) {
      console.warn('[RenderEngine] Already initialized. Call destroy() first.');
      return;
    }

    this.windowWidth = options.width;
    this.windowHeight = options.height;

    // --- 1. 创建 PixiJS Application ---
    this.app = new Application();

    // --- 2. 初始化画布 ---
    // Application.init() 是 PixiJS 8.x 的异步初始化方法
    await this.app.init({
      width: options.width,
      height: options.height,
      backgroundColor: options.backgroundColor ?? 0x000000,
      backgroundAlpha: options.backgroundAlpha ?? 0, // 完全透明
      antialias: options.antialias ?? true,
      resolution: options.resolution ?? window.devicePixelRatio ?? 1,
      autoDensity: true, // 自动处理 CSS 像素与物理像素的差异
    });

    // --- 3. 将 canvas 挂载到 DOM ---
    const mountElement = options.mountElement ?? document.body;
    mountElement.appendChild(this.app.canvas);

    // --- 4. 创建桌宠容器 ---
    this.petContainer = new Container();

    // 将容器定位在窗口底部中央
    // (0, 0) 是 canvas 左上角，桌宠通常站在窗口底部
    this.petContainer.x = options.width / 2;
    this.petContainer.y = options.height;

    this.app.stage.addChild(this.petContainer);

    // --- 5. 注册 ticker ---
    // PixiJS ticker 在 Application.init 后自动启动
    // 我们注册一个高优先级的回调来驱动适配器更新
    this.app.ticker.add(this.onTick, this);

    this._initialized = true;
  }

  // ============================================================
  // loadAdapter — 加载渲染适配器
  // ============================================================

  /**
   * 加载并激活一个渲染适配器。
   *
   * 如果已有适配器在运行，会先销毁旧适配器再加载新适配器。
   * 支持运行时切换适配器类型 (例如从 Sprite 切换到 Live2D)。
   *
   * @param type - 适配器类型 ('sprite-sheet' | 'live2d')
   * @param config - 适配器配置
   * @throws 如果引擎未初始化或适配器加载失败
   */
  async loadAdapter(type: AdapterType, config: AdapterConfig): Promise<void> {
    if (!this._initialized || !this.petContainer) {
      throw new Error('[RenderEngine] Must call init() before loadAdapter()');
    }

    // 如果已有适配器，先销毁
    if (this.adapter) {
      this.unloadAdapter();
    }

    // 创建并初始化新适配器
    this.adapter = await createAdapter(type);
    await this.adapter.init(this.petContainer, config);
    this.currentAdapterType = type;
  }

  // ============================================================
  // unloadAdapter — 卸载当前适配器
  // ============================================================

  /**
   * 卸载当前适配器并释放其资源。
   * 如果没有活跃的适配器，则不执行任何操作。
   */
  unloadAdapter(): void {
    if (this.adapter) {
      this.adapter.destroy();
      this.adapter = null;
      this.currentAdapterType = null;
    }
  }

  // ============================================================
  // setState — 切换动画状态
  // ============================================================

  /**
   * 切换当前适配器的动画状态。
   *
   * @param state - 目标动画状态
   * @throws 如果没有活跃的适配器
   */
  setState(state: AnimationState): void {
    if (!this.adapter) {
      console.warn('[RenderEngine] No adapter loaded. Call loadAdapter() first.');
      return;
    }
    this.adapter.setState(state);
  }

  // ============================================================
  // setPetPosition — 设置桌宠位置
  // ============================================================

  /**
   * 设置桌宠容器在 canvas 中的位置。
   *
   * 坐标系: canvas 本地坐标 (左上角为原点)。
   * 由于 petContainer 的锚点在底部中央 (init 中设置)，
   * x 控制水平位置，y 控制底部 Y 坐标。
   *
   * @param x - X 坐标 (canvas 本地)
   * @param y - Y 坐标 (canvas 本地，即底部边缘)
   */
  setPetPosition(x: number, y: number): void {
    if (!this.petContainer) return;
    this.petContainer.x = x;
    this.petContainer.y = y;
  }

  // ============================================================
  // getPetPosition — 获取桌宠位置
  // ============================================================

  /**
   * 获取桌宠容器的当前位置。
   *
   * @returns 桌宠位置 { x, y }
   */
  getPetPosition(): { x: number; y: number } {
    if (!this.petContainer) return { x: 0, y: 0 };
    return { x: this.petContainer.x, y: this.petContainer.y };
  }

  // ============================================================
  // setPetScale — 设置桌宠缩放
  // ============================================================

  /**
   * 设置桌宠容器的缩放比例。
   *
   * @param scale - 缩放比例 (1.0 = 原始大小)
   */
  setPetScale(scale: number): void {
    if (!this.petContainer) return;
    this.petContainer.scale.set(scale);
  }

  // ============================================================
  // 坐标转换: 桌面坐标 ↔ 渲染坐标
  // ============================================================

  /**
   * 将桌面屏幕坐标转换为 canvas 本地坐标。
   *
   * 桌面坐标: 以屏幕左上角为原点的绝对坐标。
   * 渲染坐标: 以 canvas 左上角为原点的本地坐标。
   *
   * 转换公式:
   *   canvasX = screenX - windowX
   *   canvasY = screenY - windowY
   *
   * @param screenX - 屏幕 X 坐标
   * @param screenY - 屏幕 Y 坐标
   * @param windowX - 窗口左上角在屏幕上的 X 坐标
   * @param windowY - 窗口左上角在屏幕上的 Y 坐标
   * @returns canvas 本地坐标
   */
  screenToCanvas(
    screenX: number,
    screenY: number,
    windowX: number,
    windowY: number,
  ): { x: number; y: number } {
    return {
      x: screenX - windowX,
      y: screenY - windowY,
    };
  }

  /**
   * 将 canvas 本地坐标转换为桌面屏幕坐标。
   *
   * 转换公式:
   *   screenX = canvasX + windowX
   *   screenY = canvasY + windowY
   *
   * @param canvasX - canvas X 坐标
   * @param canvasY - canvas Y 坐标
   * @param windowX - 窗口左上角在屏幕上的 X 坐标
   * @param windowY - 窗口左上角在屏幕上的 Y 坐标
   * @returns 屏幕坐标
   */
  canvasToScreen(
    canvasX: number,
    canvasY: number,
    windowX: number,
    windowY: number,
  ): { x: number; y: number } {
    return {
      x: canvasX + windowX,
      y: canvasY + windowY,
    };
  }

  /**
   * 判断屏幕坐标是否在桌宠的碰撞区域内。
   *
   * 先将屏幕坐标转换为 canvas 坐标，
   * 再与适配器返回的碰撞边界进行矩形包含检测。
   *
   * @param screenX - 屏幕 X 坐标
   * @param screenY - 屏幕 Y 坐标
   * @param windowX - 窗口 X 坐标
   * @param windowY - 窗口 Y 坐标
   * @returns 是否在桌宠区域内
   */
  isPointOverPet(
    screenX: number,
    screenY: number,
    windowX: number,
    windowY: number,
  ): boolean {
    if (!this.adapter || !this.adapter.ready) return false;

    const canvasPos = this.screenToCanvas(screenX, screenY, windowX, windowY);

    // 将 canvas 坐标转换为 petContainer 的本地坐标
    if (!this.petContainer) return false;

    const localX = canvasPos.x - this.petContainer.x;
    const localY = canvasPos.y - this.petContainer.y;

    const bounds = this.adapter.getBounds();
    return bounds.contains(localX, localY);
  }

  // ============================================================
  // 游戏循环
  // ============================================================

  /**
   * 游戏循环回调 (由 PixiJS Ticker 驱动)。
   *
   * 每帧执行:
   * 1. 推进适配器动画
   * 2. (未来) 推进物理引擎
   * 3. (未来) 更新状态机
   *
   * @param ticker - PixiJS Ticker 实例
   */
  private onTick(ticker: { deltaTime: number }): void {
    if (!this.adapter || !this.adapter.ready) return;

    // 推进适配器动画
    this.adapter.update(ticker.deltaTime);
  }

  // ============================================================
  // getter: app — 暴露 PixiJS Application (只读)
  // ============================================================

  /**
   * 获取 PixiJS Application 实例。
   *
   * 提供对底层 Application 的只读访问，
   * 用于需要直接操作 stage/ticker/renderer 的高级场景。
   *
   * @returns PixiJS Application 实例，未初始化时返回 null
   */
  get pixiApp(): Application | null {
    return this.app;
  }

  /**
   * 获取当前适配器实例。
   *
   * @returns 当前适配器，未加载时返回 null
   */
  get activeAdapter(): RenderAdapter | null {
    return this.adapter;
  }

  /**
   * 获取当前适配器类型。
   *
   * @returns 适配器类型字符串，未加载时返回 null
   */
  get adapterType(): AdapterType | null {
    return this.currentAdapterType;
  }

  /**
   * 引擎是否已初始化。
   */
  get initialized(): boolean {
    return this._initialized;
  }

  // ============================================================
  // resize — 窗口尺寸变化
  // ============================================================

  /**
   * 处理窗口尺寸变化。
   *
   * 当 Electron 窗口大小改变时，需要同步调整 canvas 尺寸
   * 和桌宠容器的位置。
   *
   * @param newWidth - 新的窗口宽度
   * @param newHeight - 新的窗口高度
   */
  resize(newWidth: number, newHeight: number): void {
    if (!this.app) return;

    this.windowWidth = newWidth;
    this.windowHeight = newHeight;

    // 调整 PixiJS renderer 尺寸
    this.app.renderer.resize(newWidth, newHeight);

    // 更新桌宠容器位置 (保持在底部中央)
    if (this.petContainer) {
      this.petContainer.x = newWidth / 2;
      this.petContainer.y = newHeight;
    }
  }

  // ============================================================
  // destroy — 销毁渲染引擎
  // ============================================================

  /**
   * 销毁渲染引擎，释放所有资源。
   *
   * 清理顺序:
   * 1. 卸载适配器
   * 2. 移除 ticker 回调
   * 3. 销毁 PixiJS Application
   * 4. 从 DOM 移除 canvas
   * 5. 清空所有引用
   */
  destroy(): void {
    // 1. 卸载适配器
    this.unloadAdapter();

    // 2. 移除 ticker 回调
    if (this.app) {
      this.app.ticker.remove(this.onTick, this);
    }

    // 3. 销毁 PixiJS Application
    //    destroy(true) 会同时移除 canvas 元素
    if (this.app) {
      this.app.destroy(true);
      this.app = null;
    }

    // 4. 清空引用
    this.petContainer = null;
    this._initialized = false;
    this.currentAdapterType = null;
  }
}
```

**关键设计决策:**

1. **petContainer 锚点在底部中央**: `petContainer.x = width/2; petContainer.y = height;` — 桌宠通常"站在"窗口底部，这样设置后只需修改 x 即可水平移动，y 始终等于窗口高度。

2. **坐标转换方法**: `screenToCanvas` / `canvasToScreen` 是纯函数，不依赖状态，方便外部 (InputHandler) 直接调用。

3. **isPointOverPet**: 集成碰撞检测，将屏幕坐标 → canvas 坐标 → container 本地坐标 → bounds 检测，一条链完成。

4. **resize**: Electron 窗口大小变化时调用，同步调整 renderer 和 container 位置。

---

## 8. src/renderer/main.ts — 渲染进程入口

渲染进程的主入口文件。负责初始化渲染引擎、加载桌宠资源、启动游戏循环，并桥接 IPC 通信。

```typescript
/**
 * main.ts — 渲染进程入口
 *
 * 初始化顺序:
 * 1. 等待 DOM 就绪
 * 2. 加载全局样式 (Vite 已处理，此处为运行时入口)
 * 3. 创建 RenderEngine 实例
 * 4. 初始化 PixiJS Application (透明背景 canvas)
 * 5. 加载桌宠适配器 (Sprite Sheet)
 * 6. 设置初始动画状态
 * 7. 注册 IPC 事件监听 (主进程通信)
 * 8. 注册鼠标交互事件 (点击穿透控制)
 *
 * 启动入口: Vite 将此文件打包并注入到 index.html 的 <script type="module"> 中。
 */

import './styles/main.css';
import { RenderEngine } from './engine/render-engine';
import type { AnimationState, AdapterConfig } from './engine/adapter';

// ============================================================
// 类型声明: Electron preload 暴露的 API
// ============================================================

/**
 * 通过 contextBridge 暴露的 Electron API。
 * 对应 preload/index.ts 中的 electronAPI。
 */
interface ElectronAPI {
  /** 设置窗口是否响应鼠标事件 (控制点击穿透) */
  setInteractive: (interactive: boolean) => void;

  /** 设置窗口位置 */
  setWindowPosition: (x: number, y: number) => void;

  /** 获取窗口位置 */
  getWindowPosition: () => Promise<{ x: number; y: number }>;

  /** 获取窗口尺寸 */
  getWindowSize: () => Promise<{ width: number; height: number }>;

  /** 发送桌宠状态变化 */
  onStateChange: (callback: (state: AnimationState) => void) => void;

  /** 接收主进程的配置更新 */
  onConfigUpdate: (callback: (config: PetRendererConfig) => void) => void;

  /** 请求主进程执行动作 */
  requestAction: (actionId: string) => void;
}

/**
 * 主进程传来的桌宠渲染配置。
 */
interface PetRendererConfig {
  modelType: 'sprite-sheet' | 'live2d';
  modelPath: string;
  width: number;
  height: number;
  fps: number;
  opacity: number;
}

// 扩展 Window 类型
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// ============================================================
// 全局状态
// ============================================================

/** 渲染引擎单例 */
let renderEngine: RenderEngine | null = null;

/** 当前桌宠状态 */
let currentState: AnimationState = 'idle';

/** 窗口位置缓存 (用于坐标转换) */
let windowPosition = { x: 0, y: 0 };

/** 窗口尺寸缓存 */
let windowSize = { width: 200, height: 200 };

// ============================================================
// 初始化函数
// ============================================================

/**
 * 主初始化函数。
 *
 * 按顺序执行所有模块的初始化:
 * 1. 获取窗口信息
 * 2. 初始化渲染引擎
 * 3. 加载桌宠模型
 * 4. 注册事件监听
 */
async function initialize(): Promise<void> {
  console.log('[main] Desk-Idoll renderer starting...');

  // --- 1. 获取窗口信息 ---
  try {
    windowPosition = await window.electronAPI.getWindowPosition();
    windowSize = await window.electronAPI.getWindowSize();
  } catch (error) {
    // Electron API 可能不可用 (开发环境 / 未加载 preload)
    // 使用默认值继续
    console.warn('[main] ElectronAPI not available, using defaults:', error);
    windowSize = { width: 200, height: 200 };
  }

  // --- 2. 初始化渲染引擎 ---
  renderEngine = new RenderEngine();
  await renderEngine.init({
    width: windowSize.width,
    height: windowSize.height,
    backgroundColor: 0x000000,
    backgroundAlpha: 0, // 完全透明
    antialias: true,
  });

  console.log('[main] Render engine initialized');

  // --- 3. 加载桌宠模型 ---
  // 默认加载内置的 sprite sheet
  // 后续由主进程通过 IPC 发送实际配置
  const defaultConfig: AdapterConfig = {
    modelPath: './assets/default-pet/spritesheet.json',
    width: 128,
    height: 128,
    fps: 12,
    initialState: 'idle',
  };

  try {
    await renderEngine.loadAdapter('sprite-sheet', defaultConfig);
    renderEngine.setState('idle');
    console.log('[main] Default pet loaded');
  } catch (error) {
    console.error('[main] Failed to load default pet:', error);
    // 模型加载失败不应阻止应用启动
    // 用户可以在配置窗口中上传新的 sprite sheet
  }

  // --- 4. 设置初始透明度 ---
  // 通过 CSS opacity 控制整体透明度
  document.body.style.opacity = '1';

  // --- 5. 注册 IPC 监听 ---
  registerIPCListeners();

  // --- 6. 注册鼠标交互 ---
  registerMouseInteraction();

  // --- 7. 注册窗口事件 ---
  registerWindowEvents();

  console.log('[main] Desk-Idoll renderer ready');
}

// ============================================================
// IPC 事件监听
// ============================================================

/**
 * 注册主进程 IPC 事件监听。
 *
 * 主进程可以发送以下事件:
 * - state-change: 通知渲染进程切换动画状态
 * - config-update: 推送新的桌宠配置
 * - position-sync: 同步窗口位置 (用于坐标转换)
 */
function registerIPCListeners(): void {
  if (!window.electronAPI) return;

  // 主进程请求切换动画状态
  window.electronAPI.onStateChange((state: AnimationState) => {
    currentState = state;
    renderEngine?.setState(state);
  });

  // 主进程推送配置更新
  window.electronAPI.onConfigUpdate(async (config: PetRendererConfig) => {
    if (!renderEngine) return;

    console.log('[main] Config update received:', config);

    // 卸载旧适配器
    renderEngine.unloadAdapter();

    // 使用新配置加载适配器
    const adapterConfig: AdapterConfig = {
      modelPath: config.modelPath,
      width: config.width,
      height: config.height,
      fps: config.fps,
      initialState: currentState,
    };

    try {
      await renderEngine.loadAdapter(config.modelType, adapterConfig);
      renderEngine.setState(currentState);

      // 更新透明度
      document.body.style.opacity = String(config.opacity);
    } catch (error) {
      console.error('[main] Failed to apply config update:', error);
    }
  });
}

// ============================================================
// 鼠标交互
// ============================================================

/**
 * 注册鼠标交互事件，控制点击穿透。
 *
 * 点击穿透机制:
 * - 默认窗口是点击穿透的 (主进程设置 setIgnoreMouseEvents(true))
 * - 当鼠标进入桌宠的像素区域时，取消穿透 (setInteractive(true))
 * - 当鼠标离开桌宠区域时，恢复穿透 (setInteractive(false))
 *
 * 这样桌宠周围的透明区域可以"穿透"点击到下方窗口，
 * 而点击桌宠本身时能正常响应。
 */
function registerMouseInteraction(): void {
  const canvas = document.querySelector('canvas');
  if (!canvas || !window.electronAPI) return;

  // 使用 PixiJS canvas 的 mousemove 事件判断鼠标是否在桌宠上方
  canvas.addEventListener('mousemove', (event: MouseEvent) => {
    if (!renderEngine) return;

    const isOverPet = renderEngine.isPointOverPet(
      event.screenX,
      event.screenY,
      windowPosition.x,
      windowPosition.y,
    );

    window.electronAPI.setInteractive(isOverPet);
  });

  // 鼠标离开 canvas 时恢复穿透
  canvas.addEventListener('mouseleave', () => {
    window.electronAPI?.setInteractive(false);
  });

  // 左键点击
  canvas.addEventListener('click', (event: MouseEvent) => {
    if (!renderEngine) return;

    const isOverPet = renderEngine.isPointOverPet(
      event.screenX,
      event.screenY,
      windowPosition.x,
      windowPosition.y,
    );

    if (isOverPet) {
      // 触发 click 动画状态
      currentState = 'click';
      renderEngine.setState('click');

      // click 动画播放完成后恢复之前的状态
      // 这里用定时器简化，实际应由 StateMachine 管理
      setTimeout(() => {
        currentState = 'idle';
        renderEngine?.setState('idle');
      }, 1000);

      // 通知主进程执行自定义动作
      // window.electronAPI.requestAction('default-click');
    }
  });

  // 右键菜单
  canvas.addEventListener('contextmenu', (event: MouseEvent) => {
    event.preventDefault();
    // 右键菜单由主进程通过 IPC 创建原生菜单
    // 这里可以发送 IPC 消息触发菜单
  });
}

// ============================================================
// 窗口事件
// ============================================================

/**
 * 注册窗口相关事件。
 */
function registerWindowEvents(): void {
  // 窗口大小变化时更新渲染引擎
  window.addEventListener('resize', () => {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;

    windowSize = { width: newWidth, height: newHeight };
    renderEngine?.resize(newWidth, newHeight);
  });

  // 页面即将卸载时销毁渲染引擎
  window.addEventListener('beforeunload', () => {
    renderEngine?.destroy();
    renderEngine = null;
  });
}

// ============================================================
// 启动
// ============================================================

// 等待 DOM 就绪后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  // DOM 已就绪 (Vite 模块加载时 DOM 通常已就绪)
  initialize();
}
```

**初始化顺序说明:**

```
DOMContentLoaded / Vite 模块加载
  → initialize()
    → 获取窗口信息 (IPC)
    → RenderEngine.init()
      → new Application()
      → app.init() (创建透明 canvas)
      → canvas 挂载到 body
      → 创建 petContainer (底部中央)
      → 启动 ticker
    → loadAdapter('sprite-sheet')
      → createAdapter() → new SpriteAdapter()
      → SpriteAdapter.init()
        → Assets.load(spritesheet.json)
        → 创建 AnimatedSprite
        → 缩放适配
        → 添加到 petContainer
    → setState('idle')
    → 注册 IPC 监听
    → 注册鼠标交互
    → 注册窗口事件
    → 渲染引擎就绪，游戏循环运行中
```

---

## 9. 模块初始化流程图

```
                    ┌─────────────────┐
                    │  main.ts 加载    │
                    └────────┬────────┘
                             │
                    ┌────────v────────┐
                    │  DOM 就绪?       │
                    │  (DOMContentLoaded)│
                    └────────┬────────┘
                             │
                    ┌────────v────────┐
                    │  获取窗口信息     │
                    │  (IPC → Main)    │
                    └────────┬────────┘
                             │
                    ┌────────v────────┐
                    │  RenderEngine    │
                    │  .init()         │
                    │                  │
                    │  ┌────────────┐ │
                    │  │ Application│ │
                    │  │ .init()    │ │
                    │  └─────┬──────┘ │
                    │        │        │
                    │  ┌─────v──────┐ │
                    │  │ canvas     │ │
                    │  │ 挂载 DOM   │ │
                    │  └─────┬──────┘ │
                    │        │        │
                    │  ┌─────v──────┐ │
                    │  │ petContainer│ │
                    │  │ 创建       │ │
                    │  └─────┬──────┘ │
                    │        │        │
                    │  ┌─────v──────┐ │
                    │  │ ticker     │ │
                    │  │ 启动       │ │
                    │  └────────────┘ │
                    └────────┬────────┘
                             │
                    ┌────────v────────┐
                    │  loadAdapter()   │
                    │  'sprite-sheet'  │
                    │                  │
                    │  createAdapter() │
                    │       │          │
                    │  SpriteAdapter   │
                    │  .init()         │
                    │       │          │
                    │  Assets.load()   │
                    │  spritesheet.json│
                    │       │          │
                    │  AnimatedSprite  │
                    │  创建 + 缩放     │
                    │       │          │
                    │  addChild()      │
                    └────────┬────────┘
                             │
                    ┌────────v────────┐
                    │  setState('idle')│
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────v───┐  ┌──────v──────┐  ┌───v────────┐
     │ IPC 监听   │  │ 鼠标交互    │  │ 窗口事件   │
     │ state-change│  │ click穿透   │  │ resize     │
     │ config-update│ │ click/dbl   │  │ beforeunload│
     └─────────────┘ └─────────────┘  └────────────┘
                             │
                    ┌────────v────────┐
                    │  游戏循环运行中   │
                    │  ticker → update │
                    └─────────────────┘
```

---

## 10. 坐标系统说明

Desk-Idoll 涉及三套坐标系统:

```
屏幕坐标系 (Screen)
├── 原点: 屏幕左上角
├── 单位: 物理像素
└── 用途: Electron BrowserWindow.position, mouseEvent.screenX/Y

窗口坐标系 (Window / Canvas)
├── 原点: 窗口 (canvas) 左上角
├── 单位: CSS 像素
├── 转换: canvasX = screenX - windowPosition.x
│         canvasY = screenY - windowPosition.y
└── 用途: PixiJS stage 中的定位

容器本地坐标系 (Container Local)
├── 原点: petContainer 的 position (底部中央)
├── 单位: CSS 像素 (受 container.scale 影响)
├── 转换: localX = canvasX - petContainer.x
│         localY = canvasY - petContainer.y
└── 用途: 适配器 getBounds(), 碰撞检测
```

**转换示例:**

```typescript
// 鼠标屏幕坐标 (1000, 500)
// 窗口位置 (800, 300)
// 窗口大小 (200, 200)
// petContainer 位置 (100, 200) — 底部中央

// 1. 屏幕 → Canvas
const canvasX = 1000 - 800 = 200;  // 右边缘外
const canvasY = 500 - 300 = 200;   // 底边缘

// 2. Canvas → Container Local
const localX = 200 - 100 = 100;    // 容器右侧
const localY = 200 - 200 = 0;      // 容器顶部 (即底部锚点)

// 3. 碰撞检测
const bounds = adapter.getBounds(); // e.g. Rectangle(-64, -128, 128, 128)
const isHit = bounds.contains(localX, localY); // false (超出范围)
```

---

## 11. Sprite Sheet 格式规范

应用接受标准 PixiJS Spritesheet JSON 格式:

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
    }
  },
  "animations": {
    "idle": ["idle_0", "idle_1"],
    "walk": ["walk_0", "walk_1"],
    "drag": ["idle_0"],
    "fall": ["idle_0"],
    "click": ["idle_0", "idle_1"]
  },
  "meta": {
    "image": "spritesheet.png",
    "format": "RGBA8888",
    "size": { "w": 512, "h": 512 },
    "scale": "1"
  }
}
```

**字段说明:**

| 字段 | 必填 | 说明 |
|------|------|------|
| `frames` | 是 | 每帧的矩形区域定义。key 格式建议为 `{state}_{index}` |
| `frames.*.frame` | 是 | `{ x, y, w, h }` — 帧在图集中的像素位置和尺寸 |
| `animations` | 是 | 动画状态名 → 帧 key 数组的映射 |
| `meta.image` | 是 | 图集 PNG 文件名 (相对于 JSON 文件) |
| `meta.size` | 否 | 图集总尺寸 |
| `frames.*.rotated` | 否 | 帧是否被旋转 (TexturePacker 优化) |
| `frames.*.trimmed` | 否 | 是否裁剪了透明像素 |
| `frames.*.spriteSourceSize` | 否 | 裁剪后在原始帧中的位置 |
| `frames.*.sourceSize` | 否 | 原始帧尺寸 |

**预设动画状态:**

| 状态 | 用途 | 帧数建议 |
|------|------|----------|
| `idle` | 待机 (站立不动) | 2-4 帧 (低帧率呼吸/眨眼) |
| `walk` | 行走 (左右移动) | 4-8 帧 (循环) |
| `drag` | 拖拽 (被抓住) | 1-2 帧 (可复用 idle) |
| `fall` | 下落 (重力掉落) | 1-2 帧 (可复用 idle) |
| `click` | 点击反馈 | 2-4 帧 (播放一次) |

**最小可用 Sprite Sheet:**

即使只提供 `idle` 一个动画状态，桌宠也能运行。缺失的状态会 fallback 到 `idle`。

---

## 12. 扩展指南: 新增适配器

以 Live2D 适配器为例，展示如何基于 RenderAdapter 接口新增适配器。

### 步骤 1: 创建适配器文件

```typescript
// src/renderer/engine/live2d-adapter.ts (Phase 2)

import type { Container, Rectangle } from 'pixi.js';
import type { RenderAdapter, AdapterConfig, AnimationState } from './adapter';

export class Live2DAdapter implements RenderAdapter {
  private _ready = false;
  private container: Container | null = null;

  get ready(): boolean { return this._ready; }

  async init(container: Container, config: AdapterConfig): Promise<void> {
    this.container = container;

    // Phase 2: 使用 pixi-live2d-display 加载模型
    // const { Live2DModel } = await import('pixi-live2d-display');
    // this.model = await Live2DModel.from(config.modelPath);
    // container.addChild(this.model);

    this._ready = true;
  }

  setState(state: AnimationState): void {
    if (!this._ready) return;
    // Phase 2: 映射 AnimationState → Live2D motion group
    // this.model.motion(this.motionMap[state]);
  }

  update(_delta: number): void {
    if (!this._ready) return;
    // Live2D 模型内部自动更新，通常不需要手动调用
  }

  getBounds(): Rectangle {
    if (!this._ready) return new Rectangle(0, 0, 0, 0);
    // Phase 2: 从 Live2D 模型获取边界
    // return this.model.getBounds();
    return new Rectangle(0, 0, 0, 0);
  }

  destroy(): void {
    if (this.container) {
      // this.container.removeChild(this.model);
    }
    // this.model?.destroy();
    this.container = null;
    this._ready = false;
  }
}
```

### 步骤 2: 在工厂函数中注册

```typescript
// src/renderer/engine/adapter.ts 中的 createAdapter 函数

case 'live2d': {
  const { Live2DAdapter } = await import('./live2d-adapter');
  return new Live2DAdapter();
}
```

### 步骤 3: 在 main.ts 中支持新类型

`PetRendererConfig.modelType` 已声明支持 `'live2d'`，`loadAdapter` 会自动路由到对应适配器。无需修改 main.ts。

---

*文档结束。渲染引擎模块为 Desk-Idoll 的核心渲染层，所有动画和视觉呈现通过此模块驱动。*
