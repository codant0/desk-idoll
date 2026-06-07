# Module 04: Physics Engine + Movement System

> 文件: `src/renderer/engine/physics.ts`
> 状态: 设计文档
> 依赖: 无外部物理引擎（自研轻量实现）

---

## 1. 模块概述

本模块为 Desk-Idoll 桌面桌宠提供完整的物理模拟和自主移动能力，包含：

- **重力系统** — 桌宠被释放后受重力下落，落地后速度归零
- **地面检测** — 基于屏幕工作区计算地面 Y 坐标，排除任务栏高度
- **水平行走** — 桌宠在地面上左右行走，支持方向翻转
- **随机行走 AI** — 随机方向切换、随机停顿，模拟自然行为
- **屏幕边界处理** — 支持 bounce / wrap / stop 三种边界策略

所有计算基于 delta time，与帧率无关。不引入 Matter.js，使用简单的自定义物理模拟。

### 坐标系说明

Electron 窗口坐标系以屏幕左上角为原点 (0, 0)，X 轴向右为正，Y 轴向下为正。桌宠的 `position.y` 值越大表示越靠近屏幕底部。

```
(0,0) ───────────────────→ X
  │
  │    ┌─────────┐
  │    │  Pet    │  position = { x, y }
  │    │  (idle) │  y 向下增大
  │    └─────────┘
  │
  │  ════════════════════  ← groundY (地面)
  │  ████████████████████  ← 任务栏区域
  ↓ Y
```

---

## 2. 类型定义

```typescript
// src/renderer/engine/physics.ts

/** 二维坐标 */
export interface Vec2 {
  x: number;
  y: number;
}

/** 物理引擎配置 */
export interface PhysicsConfig {
  /** 重力加速度，单位: px/frame^2（在 60fps 下约为 0.5） */
  gravity: number;
  /** 水平行走速度，单位: px/frame（在 60fps 下约为 2） */
  walkSpeed: number;
  /** 屏幕边缘行为 */
  screenEdgeBehavior: 'bounce' | 'wrap' | 'stop';
  /** 待机超时后切换到行走的等待时间，单位: ms */
  idleTimeout: number;
  /** 是否启用随机行走 */
  randomWalk: boolean;
  /** 地面反弹衰减系数（0 = 无反弹，1 = 完全弹性反弹） */
  bounceDamping: number;
}

/** 物理引擎默认配置 */
export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  gravity: 0.5,
  walkSpeed: 2,
  screenEdgeBehavior: 'bounce',
  idleTimeout: 3000,
  randomWalk: true,
  bounceDamping: 0,
};

/** 桌宠朝向 */
export type Facing = 'left' | 'right';

/** 物理引擎事件回调 */
export interface PhysicsCallbacks {
  /** 桌宠落地时触发 */
  onLanded?: (position: Vec2) => void;
  /** 桌宠到达屏幕边缘时触发 */
  onEdgeReached?: (edge: 'left' | 'right', position: Vec2) => void;
  /** 行走方向改变时触发 */
  onDirectionChanged?: (facing: Facing) => void;
  /** 行走状态改变时触发（开始行走 / 停止行走） */
  onWalkingChanged?: (isWalking: boolean) => void;
}

/** 屏幕边界信息 */
export interface ScreenBounds {
  /** 左边界 X */
  left: number;
  /** 右边界 X（屏幕宽度 - 桌宠宽度） */
  right: number;
  /** 地面 Y 坐标（屏幕底部 - 桌宠高度 - 任务栏高度） */
  groundY: number;
  /** 屏幕工作区宽度 */
  screenWidth: number;
  /** 屏幕工作区高度 */
  screenHeight: number;
}
```

---

## 3. PhysicsEngine 完整实现

### 3.1 类结构总览

```typescript
// src/renderer/engine/physics.ts

import { screen } from '@electron/remote';
// 如果不使用 @electron/remote，可通过 IPC 获取屏幕信息

export class PhysicsEngine {
  // ── 状态 ──
  private position: Vec2 = { x: 0, y: 0 };
  private velocity: Vec2 = { x: 0, y: 0 };
  private facing: Facing = 'right';
  private isWalking: boolean = false;
  private isFalling: boolean = false;
  private isOnGround: boolean = false;

  // ── 配置 ──
  private config: PhysicsConfig;
  private bounds: ScreenBounds;
  private petWidth: number;
  private petHeight: number;

  // ── 随机行走 AI ──
  private walkTimer: number = 0;
  private idleTimer: number = 0;
  private walkDuration: number = 0;
  private pauseDuration: number = 0;
  private isPaused: boolean = false;

  // ── 回调 ──
  private callbacks: PhysicsCallbacks = {};

  constructor(
    petWidth: number,
    petHeight: number,
    config: Partial<PhysicsConfig> = {},
  ) {
    this.config = { ...DEFAULT_PHYSICS_CONFIG, ...config };
    this.petWidth = petWidth;
    this.petHeight = petHeight;
    this.bounds = this.calculateScreenBounds();
  }

  // ... 以下各节详细实现 ...
}
```

### 3.2 屏幕边界与地面 Y 坐标计算

地面 Y 坐标 = 屏幕工作区高度 - 桌宠高度 - 任务栏高度

任务栏高度通过比较 `screen.getPrimaryDisplay()` 的 `bounds` 和 `workArea` 得到：

- `bounds` = 整个屏幕分辨率（如 1920x1080）
- `workArea` = 排除任务栏后的可用区域（如 1920x1040）
- 任务栏高度 = `bounds.height - workArea.height`

```typescript
  /**
   * 计算屏幕边界信息。
   * 使用 Electron screen API 获取显示器工作区尺寸。
   *
   * Electron 中 screen.getPrimaryDisplay() 的坐标系：
   *   - bounds: 完整屏幕分辨率，原点在屏幕左上角
   *   - workArea: 排除任务栏后的可用区域
   *   - workArea.y: 工作区起始 Y（如果有顶部任务栏则 > 0）
   *
   * 本项目假设任务栏在底部（Windows 默认），所以：
   *   任务栏高度 = bounds.height - workArea.height
   *   地面 Y = workArea.height - petHeight
   */
  private calculateScreenBounds(): ScreenBounds {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workAreaSize } = primaryDisplay;

    // 任务栏高度 = 完整屏幕高度 - 工作区高度
    // 工作区排除了任务栏，所以差值就是任务栏占用的高度
    const taskbarHeight =
      primaryDisplay.bounds.height - workAreaSize.height;

    // 地面 Y 坐标 = 工作区高度 - 桌宠高度
    // 桌宠底部恰好接触工作区底部（即任务栏顶部）
    const groundY = workAreaSize.height - this.petHeight;

    return {
      left: 0,
      right: workAreaSize.width - this.petWidth,
      groundY,
      screenWidth: workAreaSize.width,
      screenHeight: workAreaSize.height,
    };
  }

  /**
   * 窗口大小改变或显示器切换时重新计算边界。
   * 需要在主进程监听 'display-metrics-changed' 事件后通知渲染进程调用。
   */
  public recalculateBounds(): void {
    this.bounds = this.calculateScreenBounds();

    // 确保当前地面位置仍然有效
    if (this.position.y > this.bounds.groundY) {
      this.position.y = this.bounds.groundY;
    }

    // 确保水平位置在边界内
    this.position.x = Math.max(
      this.bounds.left,
      Math.min(this.bounds.right, this.position.x),
    );
  }
```

### 3.3 重力模拟与落地检测

核心公式（帧率无关的 delta time 版本）：

```
velocityY += gravity * delta
positionY += velocityY * delta
```

其中 `delta` 是自上一帧以来经过的时间比例（60fps 下 delta = 1）。PixiJS 的 ticker 会传入这个值。

```typescript
  /**
   * 重力更新 — 每帧调用。
   *
   * @param delta - 帧时间系数。PixiJS ticker 中 delta ≈ 1 表示一帧。
   *                60fps 时 delta ≈ 1；30fps 时 delta ≈ 2。
   *                这保证了物理行为与帧率无关。
   * @returns 是否刚刚落地（用于触发动画切换）
   */
  private applyGravity(delta: number): boolean {
    if (!this.isFalling) return false;

    // 应用重力加速度（向下为正方向）
    this.velocity.y += this.config.gravity * delta;

    // 更新位置
    this.position.y += this.velocity.y * delta;

    // 地面碰撞检测
    if (this.position.y >= this.bounds.groundY) {
      // 位置修正 — 精确放置在地面上
      this.position.y = this.bounds.groundY;

      // 速度归零（或者带反弹衰减）
      if (this.config.bounceDamping > 0 && this.velocity.y > 1) {
        // 反弹：速度反向并衰减
        this.velocity.y = -this.velocity.y * this.config.bounceDamping;
      } else {
        // 完全停止
        this.velocity.y = 0;
        this.isFalling = false;
        this.isOnGround = true;
      }

      return true; // 触发 landed 事件
    }

    return false;
  }
```

### 3.4 水平行走与方向翻转

```typescript
  /**
   * 行走更新 — 每帧调用，仅在地面行走时生效。
   *
   * @param delta - 帧时间系数
   */
  private applyWalking(delta: number): void {
    if (!this.isWalking || !this.isOnGround || this.isPaused) return;

    // 根据朝向计算水平速度
    const direction = this.facing === 'right' ? 1 : -1;
    this.velocity.x = this.config.walkSpeed * direction;

    // 更新水平位置
    this.position.x += this.velocity.x * delta;

    // 屏幕边界检测
    this.handleScreenEdge();
  }

  /**
   * 屏幕边界检测与处理。
   *
   * 三种策略：
   *   bounce — 到达边界后反转方向（像弹球）
   *   wrap   — 从屏幕另一侧出现（像吃豆人）
   *   stop   — 停在边界处，切换为 idle
   */
  private handleScreenEdge(): void {
    let hitEdge: 'left' | 'right' | null = null;

    // 左边界检测
    if (this.position.x <= this.bounds.left) {
      this.position.x = this.bounds.left;
      hitEdge = 'left';
    }
    // 右边界检测
    else if (this.position.x >= this.bounds.right) {
      this.position.x = this.bounds.right;
      hitEdge = 'right';
    }

    if (!hitEdge) return;

    // 触发边界回调
    this.callbacks.onEdgeReached?.(hitEdge, { ...this.position });

    switch (this.config.screenEdgeBehavior) {
      case 'bounce':
        // 反转朝向
        this.facing = this.facing === 'right' ? 'left' : 'right';
        this.velocity.x = 0;
        this.callbacks.onDirectionChanged?.(this.facing);
        break;

      case 'wrap':
        // 从另一侧出现
        if (hitEdge === 'left') {
          this.position.x = this.bounds.right;
        } else {
          this.position.x = this.bounds.left;
        }
        break;

      case 'stop':
        // 停在边界，结束行走
        this.velocity.x = 0;
        this.stopWalking();
        break;
    }
  }

  /**
   * 翻转桌宠朝向。
   * 在 PixiJS 中通过设置 container.scale.x = -1 或 1 实现。
   * 此方法只更新内部状态，实际翻转由外部渲染层执行。
   */
  public flipDirection(): void {
    this.facing = this.facing === 'right' ? 'left' : 'right';
    this.callbacks.onDirectionChanged?.(this.facing);
  }

  /**
   * 获取用于渲染的水平缩放值。
   * right = 1, left = -1
   */
  public getScaleX(): number {
    return this.facing === 'right' ? 1 : -1;
  }
```

### 3.5 随机行走 AI

随机行走 AI 模拟桌宠的自主行为：

1. **行走阶段** — 随机持续 2~6 秒
2. **停顿阶段** — 随机停顿 1~4 秒
3. **方向决策** — 每次停顿结束后随机选择方向

```typescript
  /**
   * 随机行走 AI 更新 — 每帧调用。
   *
   * 行为模式：
   *   [idle 等待 idleTimeout] → [开始行走 2~6秒] → [停顿 1~4秒] → [重复]
   *
   * @param delta - 帧时间系数
   * @param deltaTime - 自上一帧以来的实际毫秒数
   */
  private updateRandomWalk(delta: number, deltaTime: number): void {
    if (!this.config.randomWalk || !this.isOnGround) return;

    if (this.isWalking) {
      if (this.isPaused) {
        // 停顿阶段
        this.pauseDuration -= deltaTime;
        if (this.pauseDuration <= 0) {
          // 停顿结束，决定下一步
          this.isPaused = false;

          // 50% 概率继续行走，50% 概率回到 idle
          if (Math.random() < 0.5) {
            this.startWalking();
          } else {
            this.stopWalking();
          }
        }
      } else {
        // 行走阶段
        this.walkDuration -= deltaTime;
        if (this.walkDuration <= 0) {
          // 行走时间结束，开始停顿或停止
          if (Math.random() < 0.6) {
            // 60% 概率停顿后继续
            this.isPaused = true;
            this.pauseDuration = 1000 + Math.random() * 3000; // 1~4秒
            this.velocity.x = 0;
          } else {
            // 40% 概率直接停止
            this.stopWalking();
          }
        }
      }
    } else {
      // idle 状态 — 等待 idleTimeout 后开始行走
      this.idleTimer += deltaTime;
      if (this.idleTimer >= this.config.idleTimeout) {
        this.idleTimer = 0;
        this.startWalking();
      }
    }
  }

  /**
   * 开始行走 — 随机选择方向并设置行走时长。
   */
  private startWalking(): void {
    // 随机选择方向
    this.facing = Math.random() < 0.5 ? 'left' : 'right';
    this.callbacks.onDirectionChanged?.(this.facing);

    // 随机行走时长 2~6 秒
    this.walkDuration = 2000 + Math.random() * 4000;
    this.isWalking = true;
    this.isPaused = false;
    this.idleTimer = 0;

    this.callbacks.onWalkingChanged?.(true);
  }

  /**
   * 停止行走。
   */
  private stopWalking(): void {
    this.isWalking = false;
    this.isPaused = false;
    this.velocity.x = 0;
    this.walkDuration = 0;
    this.pauseDuration = 0;
    this.idleTimer = 0;

    this.callbacks.onWalkingChanged?.(false);
  }
```

### 3.6 主更新循环

```typescript
  /**
   * 主更新函数 — 每帧由 PixiJS ticker 调用。
   *
   * 更新顺序：
   *   1. 重力（如果在下落状态）
   *   2. 水平行走（如果在行走状态且在地面上）
   *   3. 随机行走 AI（如果启用）
   *
   * @param ticker - PixiJS 的 Ticker，用于获取 delta
   */
  public update(ticker: { deltaMS: number }): void {
    const delta = ticker.deltaMS / (1000 / 60); // 归一化到 60fps 的 delta
    const deltaTime = ticker.deltaMS;            // 实际毫秒数

    // 第一步：重力（下落中的桌宠）
    const justLanded = this.applyGravity(delta);
    if (justLanded) {
      this.callbacks.onLanded?.({ ...this.position });
    }

    // 第二步：水平行走
    this.applyWalking(delta);

    // 第三步：随机行走 AI
    this.updateRandomWalk(delta, deltaTime);
  }
```

---

## 4. 公共 API 接口

### 4.1 初始化与生命周期

```typescript
  /**
   * 初始化桌宠位置。
   *
   * @param x - 初始 X 坐标（默认屏幕中央）
   * @param y - 初始 Y 坐标（默认地面上）
   */
  public init(x?: number, y?: number): void {
    this.bounds = this.calculateScreenBounds();

    this.position.x = x ?? (this.bounds.screenWidth - this.petWidth) / 2;
    this.position.y = y ?? this.bounds.groundY;
    this.velocity = { x: 0, y: 0 };
    this.isOnGround = this.position.y >= this.bounds.groundY;
    this.isFalling = !this.isOnGround;
    this.isWalking = false;
    this.isPaused = false;
    this.idleTimer = 0;
  }

  /**
   * 注册事件回调。
   */
  public on(callbacks: PhysicsCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * 清除所有回调。
   */
  public off(): void {
    this.callbacks = {};
  }

  /**
   * 销毁引擎，清理状态。
   */
  public destroy(): void {
    this.callbacks = {};
    this.velocity = { x: 0, y: 0 };
    this.isWalking = false;
    this.isFalling = false;
  }
```

### 4.2 位置与速度控制

```typescript
  /** 获取当前位置（只读副本） */
  public getPosition(): Readonly<Vec2> {
    return { ...this.position };
  }

  /** 设置位置（用于拖拽结束后放置桌宠） */
  public setPosition(x: number, y: number): void {
    this.position.x = x;
    this.position.y = y;

    // 重新判断是否在地面上
    if (y >= this.bounds.groundY) {
      this.position.y = this.bounds.groundY;
      this.isOnGround = true;
      this.isFalling = false;
      this.velocity.y = 0;
    } else {
      this.isOnGround = false;
      this.isFalling = true;
    }
  }

  /** 获取当前速度（只读副本） */
  public getVelocity(): Readonly<Vec2> {
    return { ...this.velocity };
  }

  /** 设置速度（用于拖拽抛出时的初始速度） */
  public setVelocity(vx: number, vy: number): void {
    this.velocity.x = vx;
    this.velocity.y = vy;

    if (vy !== 0) {
      this.isFalling = true;
      this.isOnGround = false;
    }
  }

  /** 获取当前朝向 */
  public getFacing(): Facing {
    return this.facing;
  }

  /** 强制设置朝向 */
  public setFacing(facing: Facing): void {
    this.facing = facing;
    this.callbacks.onDirectionChanged?.(facing);
  }

  /** 是否正在行走 */
  public getIsWalking(): boolean {
    return this.isWalking;
  }

  /** 是否在地面上 */
  public getIsOnGround(): boolean {
    return this.isOnGround;
  }

  /** 是否正在下落 */
  public getIsFalling(): boolean {
    return this.isFalling;
  }

  /** 获取屏幕边界信息 */
  public getBounds(): Readonly<ScreenBounds> {
    return { ...this.bounds };
  }
```

### 4.3 外部触发的移动控制

```typescript
  /**
   * 开始下落 — 拖拽释放后调用。
   * 重置垂直速度为 0，让重力接管。
   *
   * @param vx - 释放时的水平速度（可选，模拟抛出效果）
   */
  public startFalling(vx: number = 0): void {
    this.isFalling = true;
    this.isOnGround = false;
    this.velocity.y = 0;
    this.velocity.x = vx;

    // 停止行走
    this.stopWalking();
  }

  /**
   * 强制行走 — 外部命令桌宠向指定方向行走。
   *
   * @param direction - 行走方向
   * @param duration  - 行走持续时间（ms），默认无限
   */
  public walk(direction: Facing, duration?: number): void {
    this.facing = direction;
    this.callbacks.onDirectionChanged?.(direction);

    if (!this.isOnGround) return;

    this.isWalking = true;
    this.isPaused = false;
    this.walkDuration = duration ?? Infinity;
    this.idleTimer = 0;

    this.callbacks.onWalkingChanged?.(true);
  }

  /**
   * 强制进入 idle 状态。
   */
  public idle(): void {
    this.stopWalking();
  }

  /**
   * 更新桌宠尺寸（用户调整大小后调用）。
   */
  public setPetSize(width: number, height: number): void {
    this.petWidth = width;
    this.petHeight = height;
    this.recalculateBounds();
  }

  /**
   * 更新配置（运行时修改参数）。
   */
  public updateConfig(config: Partial<PhysicsConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置（只读副本）。
   */
  public getConfig(): Readonly<PhysicsConfig> {
    return { ...this.config };
  }
```

---

## 5. 与状态机的集成

### 5.1 集成方式

PhysicsEngine 通过回调函数与状态机（`StateMachine`）松耦合集成。状态机监听物理事件并驱动状态转换，物理引擎不直接依赖状态机。

```
StateMachine                    PhysicsEngine
    │                               │
    │  onLanded callback            │
    │◄──────────────────────────────│  桌宠落地
    │  → transition to 'idle'       │
    │                               │
    │  onEdgeReached callback       │
    │◄──────────────────────────────│  到达屏幕边缘
    │  → transition to 'idle'       │
    │                               │
    │  onWalkingChanged callback    │
    │◄──────────────────────────────│  行走状态改变
    │  → update animation state     │
    │                               │
    │  startFalling()               │
    │──────────────────────────────→│  拖拽释放
    │                               │
    │  walk('left')                 │
    │──────────────────────────────→│  强制行走
    │                               │
```

### 5.2 状态机集成示例

```typescript
// src/renderer/state/machine.ts（片段）

import { PhysicsEngine } from '../engine/physics';

export class StateMachine {
  private state: AnimationState = 'idle';
  private physics: PhysicsEngine;

  constructor(physics: PhysicsEngine) {
    this.physics = physics;

    // 注册物理引擎回调
    this.physics.on({
      onLanded: (position) => {
        // 落地后转为 idle
        this.transition('idle');
      },
      onEdgeReached: (edge, position) => {
        // 根据边界行为决定状态
        const behavior = this.physics.getConfig().screenEdgeBehavior;
        if (behavior === 'stop') {
          this.transition('idle');
        }
        // bounce 和 wrap 时继续 walk，不需要转状态
      },
      onWalkingChanged: (isWalking) => {
        if (isWalking) {
          this.transition('walk');
        } else if (this.state === 'walk') {
          this.transition('idle');
        }
      },
      onDirectionChanged: (facing) => {
        // 更新渲染层的朝向
        this.updatePetFacing(facing);
      },
    });
  }

  private transition(newState: AnimationState): void {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    console.log(`State: ${oldState} → ${newState}`);
    // 通知渲染层切换动画...
  }

  /** 拖拽开始 */
  public onDragStart(): void {
    this.physics.idle(); // 停止行走
    this.transition('drag');
  }

  /** 拖拽释放 */
  public onDragEnd(velocityX: number, velocityY: number): void {
    this.physics.startFalling(velocityX);
    this.transition('fall');
  }

  private updatePetFacing(facing: 'left' | 'right'): void {
    // 在渲染层中设置 container.scale.x
    // facing === 'right' → scale.x = 1
    // facing === 'left'  → scale.x = -1
  }
}
```

### 5.3 渲染层集成示例

```typescript
// src/renderer/main.ts（片段）

import * as PIXI from 'pixi.js';
import { PhysicsEngine } from './engine/physics';

async function main() {
  const app = new PIXI.Application();
  await app.init({
    backgroundAlpha: 0, // 透明背景
    resizeTo: window,
  });
  document.body.appendChild(app.canvas);

  const petContainer = new PIXI.Container();
  app.stage.addChild(petContainer);

  // ... 加载 sprite sheet, 创建 AnimatedSprite ...

  // 创建物理引擎
  const petWidth = 128;
  const petHeight = 128;
  const physics = new PhysicsEngine(petWidth, petHeight, {
    gravity: 0.5,
    walkSpeed: 2,
    screenEdgeBehavior: 'bounce',
    idleTimeout: 3000,
    randomWalk: true,
  });

  // 初始化位置
  physics.init();

  // 注册回调 — 更新渲染
  physics.on({
    onDirectionChanged: (facing) => {
      // 翻转桌宠朝向
      petContainer.scale.x = facing === 'right' ? 1 : -1;
    },
    onLanded: (position) => {
      // 落地后切换到 idle 动画
      // sprite.textures = spritesheet.animations['idle'];
      // sprite.play();
    },
    onWalkingChanged: (isWalking) => {
      // 切换 walk / idle 动画
      // const state = isWalking ? 'walk' : 'idle';
      // sprite.textures = spritesheet.animations[state];
      // sprite.play();
    },
  });

  // 主循环 — 驱动物理引擎
  app.ticker.add((ticker) => {
    physics.update(ticker);

    // 同步位置到渲染层
    const pos = physics.getPosition();
    petContainer.x = pos.x;
    petContainer.y = pos.y;
  });
}
```

---

## 6. IPC 屏幕信息获取

在不使用 `@electron/remote` 的情况下，通过 IPC 获取屏幕尺寸信息。

### 6.1 Main Process（主进程端）

```typescript
// src/main/ipc.ts

import { ipcMain, screen } from 'electron';

ipcMain.handle('get-screen-bounds', () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workAreaSize, bounds } = primaryDisplay;
  const taskbarHeight = bounds.height - workAreaSize.height;

  return {
    screenWidth: workAreaSize.width,
    screenHeight: workAreaSize.height,
    taskbarHeight,
  };
});
```

### 6.2 Preload（预加载脚本）

```typescript
// src/preload/index.ts

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getScreenBounds: () => ipcRenderer.invoke('get-screen-bounds'),
  setInteractive: (interactive: boolean) =>
    ipcRenderer.send('set-interactive', interactive),
});
```

### 6.3 Renderer（渲染进程端）

```typescript
// src/renderer/engine/physics.ts — 替换 calculateScreenBounds

declare global {
  interface Window {
    electronAPI: {
      getScreenBounds: () => Promise<{
        screenWidth: number;
        screenHeight: number;
        taskbarHeight: number;
      }>;
      setInteractive: (interactive: boolean) => void;
    };
  }
}

// 将 calculateScreenBounds 改为异步版本（用于初始化）
// 或者在应用启动时缓存屏幕信息

// 方案 A：启动时缓存
let cachedScreenInfo: {
  screenWidth: number;
  screenHeight: number;
  taskbarHeight: number;
} | null = null;

export async function initScreenInfo(): Promise<void> {
  cachedScreenInfo = await window.electronAPI.getScreenBounds();
}

// PhysicsEngine 内部使用缓存的信息
// 在 calculateScreenBounds 中：
//   if (cachedScreenInfo) { 使用缓存 }
//   else { 使用默认值，等待缓存初始化 }
```

---

## 7. 完整文件源码

以下是 `src/renderer/engine/physics.ts` 的完整可运行实现：

```typescript
// ============================================================================
// src/renderer/engine/physics.ts
// Desk-Idoll 物理引擎 + 移动系统
// ============================================================================

/** 二维坐标 */
export interface Vec2 {
  x: number;
  y: number;
}

/** 物理引擎配置 */
export interface PhysicsConfig {
  /** 重力加速度，单位: px/frame^2（在 60fps 下约为 0.5） */
  gravity: number;
  /** 水平行走速度，单位: px/frame（在 60fps 下约为 2） */
  walkSpeed: number;
  /** 屏幕边缘行为 */
  screenEdgeBehavior: 'bounce' | 'wrap' | 'stop';
  /** 待机超时后切换到行走的等待时间，单位: ms */
  idleTimeout: number;
  /** 是否启用随机行走 */
  randomWalk: boolean;
  /** 地面反弹衰减系数（0 = 无反弹，1 = 完全弹性反弹） */
  bounceDamping: number;
}

/** 物理引擎默认配置 */
export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  gravity: 0.5,
  walkSpeed: 2,
  screenEdgeBehavior: 'bounce',
  idleTimeout: 3000,
  randomWalk: true,
  bounceDamping: 0,
};

/** 桌宠朝向 */
export type Facing = 'left' | 'right';

/** 物理引擎事件回调 */
export interface PhysicsCallbacks {
  onLanded?: (position: Vec2) => void;
  onEdgeReached?: (edge: 'left' | 'right', position: Vec2) => void;
  onDirectionChanged?: (facing: Facing) => void;
  onWalkingChanged?: (isWalking: boolean) => void;
}

/** 屏幕边界信息 */
export interface ScreenBounds {
  left: number;
  right: number;
  groundY: number;
  screenWidth: number;
  screenHeight: number;
}

/** 缓存的屏幕信息（启动时通过 IPC 获取） */
interface ScreenInfo {
  screenWidth: number;
  screenHeight: number;
  taskbarHeight: number;
}

let cachedScreenInfo: ScreenInfo | null = null;

/**
 * 初始化屏幕信息缓存。
 * 应在应用启动时、创建 PhysicsEngine 之前调用。
 *
 * @param info - 通过 IPC 从主进程获取的屏幕信息
 */
export function setScreenInfo(info: ScreenInfo): void {
  cachedScreenInfo = info;
}

/**
 * 获取缓存的屏幕信息，未初始化时返回默认值。
 */
export function getScreenInfo(): ScreenInfo {
  if (cachedScreenInfo) return cachedScreenInfo;
  // 未初始化时的降级默认值（1920x1080，无任务栏）
  return { screenWidth: 1920, screenHeight: 1080, taskbarHeight: 0 };
}

// ──────────────────────────────────────────────────────────────────────────────
// PhysicsEngine 主类
// ──────────────────────────────────────────────────────────────────────────────

export class PhysicsEngine {
  // ── 状态 ──
  private position: Vec2 = { x: 0, y: 0 };
  private velocity: Vec2 = { x: 0, y: 0 };
  private facing: Facing = 'right';
  private isWalking: boolean = false;
  private isFalling: boolean = false;
  private isOnGround: boolean = false;

  // ── 配置 ──
  private config: PhysicsConfig;
  private bounds: ScreenBounds;
  private petWidth: number;
  private petHeight: number;

  // ── 随机行走 AI 状态 ──
  private walkTimer: number = 0;
  private idleTimer: number = 0;
  private walkDuration: number = 0;
  private pauseDuration: number = 0;
  private isPaused: boolean = false;

  // ── 回调 ──
  private callbacks: PhysicsCallbacks = {};

  constructor(
    petWidth: number,
    petHeight: number,
    config: Partial<PhysicsConfig> = {},
  ) {
    this.config = { ...DEFAULT_PHYSICS_CONFIG, ...config };
    this.petWidth = petWidth;
    this.petHeight = petHeight;
    this.bounds = this.calculateScreenBounds();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 屏幕边界计算
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 计算屏幕边界信息。
   *
   * 坐标系：Electron 屏幕左上角为原点 (0,0)，Y 轴向下。
   *
   * 地面 Y 坐标计算公式：
   *   groundY = workAreaHeight - petHeight
   *
   * 其中 workAreaHeight = screenHeight - taskbarHeight。
   * 桌宠底部恰好接触任务栏顶部。
   */
  private calculateScreenBounds(): ScreenBounds {
    const info = getScreenInfo();
    const groundY = info.screenHeight - this.petHeight;

    return {
      left: 0,
      right: info.screenWidth - this.petWidth,
      groundY,
      screenWidth: info.screenWidth,
      screenHeight: info.screenHeight,
    };
  }

  /**
   * 窗口大小改变或显示器切换时重新计算边界。
   */
  public recalculateBounds(): void {
    this.bounds = this.calculateScreenBounds();

    // 修正位置确保在有效范围内
    if (this.position.y > this.bounds.groundY) {
      this.position.y = this.bounds.groundY;
      this.isOnGround = true;
      this.isFalling = false;
      this.velocity.y = 0;
    }

    this.position.x = this.clampX(this.position.x);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 初始化与生命周期
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 初始化桌宠位置和物理状态。
   *
   * @param x - 初始 X 坐标（默认：屏幕中央）
   * @param y - 初始 Y 坐标（默认：地面上）
   */
  public init(x?: number, y?: number): void {
    this.bounds = this.calculateScreenBounds();

    this.position.x = x ?? (this.bounds.screenWidth - this.petWidth) / 2;
    this.position.y = y ?? this.bounds.groundY;
    this.velocity = { x: 0, y: 0 };
    this.isOnGround = this.position.y >= this.bounds.groundY;
    this.isFalling = !this.isOnGround;
    this.isWalking = false;
    this.isPaused = false;
    this.idleTimer = 0;
  }

  /**
   * 注册事件回调。
   */
  public on(callbacks: PhysicsCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * 清除所有回调。
   */
  public off(): void {
    this.callbacks = {};
  }

  /**
   * 销毁引擎，清理状态。
   */
  public destroy(): void {
    this.callbacks = {};
    this.velocity = { x: 0, y: 0 };
    this.isWalking = false;
    this.isFalling = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 主更新循环
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 主更新函数 — 每帧由 PixiJS ticker 调用。
   *
   * 更新顺序：
   *   1. 重力（如果在下落状态）
   *   2. 水平行走（如果在行走状态且在地面上）
   *   3. 随机行走 AI（如果启用）
   *
   * @param ticker - PixiJS Ticker 对象，提供 deltaMS
   */
  public update(ticker: { deltaMS: number }): void {
    // 归一化 delta：60fps 下 delta = 1，30fps 下 delta = 2
    const delta = ticker.deltaMS / (1000 / 60);
    const deltaTime = ticker.deltaMS;

    // 1. 重力
    const justLanded = this.applyGravity(delta);
    if (justLanded) {
      this.callbacks.onLanded?.({ ...this.position });
    }

    // 2. 水平行走
    this.applyWalking(delta);

    // 3. 随机行走 AI
    this.updateRandomWalk(delta, deltaTime);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 重力系统
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 重力模拟与落地检测。
   *
   * 物理公式（帧率无关版本）：
   *   velocityY += gravity * delta
   *   positionY += velocityY * delta
   *
   * 地面碰撞条件：positionY >= groundY
   * 碰撞后：positionY = groundY, velocityY = 0
   *
   * @returns true 如果刚刚落地
   */
  private applyGravity(delta: number): boolean {
    if (!this.isFalling) return false;

    // 应用重力加速度（Y 轴向下为正）
    this.velocity.y += this.config.gravity * delta;

    // 更新位置
    this.position.y += this.velocity.y * delta;

    // 地面碰撞检测
    if (this.position.y >= this.bounds.groundY) {
      // 位置修正
      this.position.y = this.bounds.groundY;

      if (
        this.config.bounceDamping > 0 &&
        Math.abs(this.velocity.y) > 1
      ) {
        // 反弹模式：速度反向并衰减
        this.velocity.y = -this.velocity.y * this.config.bounceDamping;
      } else {
        // 速度归零，停止下落
        this.velocity.y = 0;
        this.isFalling = false;
        this.isOnGround = true;
      }

      return true;
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 行走系统
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 水平行走逻辑。
   *
   * 根据当前朝向 (facing) 计算水平速度，更新位置，并检测屏幕边界。
   */
  private applyWalking(delta: number): void {
    if (!this.isWalking || !this.isOnGround || this.isPaused) return;

    // 方向：right = +1, left = -1
    const dir = this.facing === 'right' ? 1 : -1;
    this.velocity.x = this.config.walkSpeed * dir;

    // 更新水平位置
    this.position.x += this.velocity.x * delta;

    // 边界检测
    this.handleScreenEdge();
  }

  /**
   * 屏幕边界检测与处理。
   *
   * 三种策略：
   *   bounce — 反转方向
   *   wrap   — 从另一侧出现
   *   stop   — 停在边界
   */
  private handleScreenEdge(): void {
    let hitEdge: 'left' | 'right' | null = null;

    if (this.position.x <= this.bounds.left) {
      this.position.x = this.bounds.left;
      hitEdge = 'left';
    } else if (this.position.x >= this.bounds.right) {
      this.position.x = this.bounds.right;
      hitEdge = 'right';
    }

    if (!hitEdge) return;

    // 触发边界回调
    this.callbacks.onEdgeReached?.(hitEdge, { ...this.position });

    switch (this.config.screenEdgeBehavior) {
      case 'bounce':
        this.facing = this.facing === 'right' ? 'left' : 'right';
        this.velocity.x = 0;
        this.callbacks.onDirectionChanged?.(this.facing);
        break;

      case 'wrap':
        this.position.x =
          hitEdge === 'left' ? this.bounds.right : this.bounds.left;
        break;

      case 'stop':
        this.velocity.x = 0;
        this.stopWalking();
        break;
    }
  }

  /**
   * 获取渲染用的水平缩放值。
   * right → 1, left → -1
   * 在 PixiJS 中使用：container.scale.x = physics.getScaleX()
   */
  public getScaleX(): number {
    return this.facing === 'right' ? 1 : -1;
  }

  /**
   * 翻转方向。
   */
  public flipDirection(): void {
    this.facing = this.facing === 'right' ? 'left' : 'right';
    this.callbacks.onDirectionChanged?.(this.facing);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 随机行走 AI
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 随机行走 AI 更新。
   *
   * 状态机：
   *   idle (等待 idleTimeout)
   *     → walk (随机方向，持续 2~6 秒)
   *       → pause (停顿 1~4 秒)
   *         → walk 或 idle (随机决定)
   *
   * @param delta    - 帧时间系数
   * @param deltaTime - 实际毫秒数
   */
  private updateRandomWalk(_delta: number, deltaTime: number): void {
    if (!this.config.randomWalk || !this.isOnGround) return;

    if (this.isWalking) {
      if (this.isPaused) {
        // 停顿阶段
        this.pauseDuration -= deltaTime;
        if (this.pauseDuration <= 0) {
          this.isPaused = false;
          if (Math.random() < 0.5) {
            this.startWalking();
          } else {
            this.stopWalking();
          }
        }
      } else {
        // 行走阶段
        this.walkDuration -= deltaTime;
        if (this.walkDuration <= 0) {
          if (Math.random() < 0.6) {
            // 停顿后继续
            this.isPaused = true;
            this.pauseDuration = 1000 + Math.random() * 3000;
            this.velocity.x = 0;
          } else {
            this.stopWalking();
          }
        }
      }
    } else {
      // idle 等待
      this.idleTimer += deltaTime;
      if (this.idleTimer >= this.config.idleTimeout) {
        this.idleTimer = 0;
        this.startWalking();
      }
    }
  }

  /**
   * 开始行走（随机方向 + 随机时长）。
   */
  private startWalking(): void {
    this.facing = Math.random() < 0.5 ? 'left' : 'right';
    this.callbacks.onDirectionChanged?.(this.facing);

    this.walkDuration = 2000 + Math.random() * 4000; // 2~6 秒
    this.isWalking = true;
    this.isPaused = false;
    this.idleTimer = 0;

    this.callbacks.onWalkingChanged?.(true);
  }

  /**
   * 停止行走。
   */
  private stopWalking(): void {
    this.isWalking = false;
    this.isPaused = false;
    this.velocity.x = 0;
    this.walkDuration = 0;
    this.pauseDuration = 0;
    this.idleTimer = 0;

    this.callbacks.onWalkingChanged?.(false);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 公共 API — 位置与速度
  // ═══════════════════════════════════════════════════════════════════════════

  /** 获取当前位置（只读副本） */
  public getPosition(): Readonly<Vec2> {
    return { ...this.position };
  }

  /** 设置位置（用于拖拽结束后放置桌宠） */
  public setPosition(x: number, y: number): void {
    this.position.x = this.clampX(x);
    this.position.y = y;

    if (y >= this.bounds.groundY) {
      this.position.y = this.bounds.groundY;
      this.isOnGround = true;
      this.isFalling = false;
      this.velocity.y = 0;
    } else {
      this.isOnGround = false;
      this.isFalling = true;
    }
  }

  /** 获取当前速度（只读副本） */
  public getVelocity(): Readonly<Vec2> {
    return { ...this.velocity };
  }

  /** 设置速度（用于拖拽抛出时的初始速度） */
  public setVelocity(vx: number, vy: number): void {
    this.velocity.x = vx;
    this.velocity.y = vy;
    if (vy !== 0) {
      this.isFalling = true;
      this.isOnGround = false;
    }
  }

  /** 获取当前朝向 */
  public getFacing(): Facing {
    return this.facing;
  }

  /** 强制设置朝向 */
  public setFacing(facing: Facing): void {
    this.facing = facing;
    this.callbacks.onDirectionChanged?.(facing);
  }

  /** 是否正在行走 */
  public getIsWalking(): boolean {
    return this.isWalking;
  }

  /** 是否在地面上 */
  public getIsOnGround(): boolean {
    return this.isOnGround;
  }

  /** 是否正在下落 */
  public getIsFalling(): boolean {
    return this.isFalling;
  }

  /** 获取屏幕边界信息 */
  public getBounds(): Readonly<ScreenBounds> {
    return { ...this.bounds };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 公共 API — 外部触发
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 开始下落 — 拖拽释放后调用。
   *
   * @param vx - 释放时的水平速度（可选，模拟抛出）
   */
  public startFalling(vx: number = 0): void {
    this.isFalling = true;
    this.isOnGround = false;
    this.velocity.y = 0;
    this.velocity.x = vx;
    this.stopWalking();
  }

  /**
   * 强制行走。
   *
   * @param direction - 行走方向
   * @param duration  - 持续时间（ms），默认无限
   */
  public walk(direction: Facing, duration?: number): void {
    this.facing = direction;
    this.callbacks.onDirectionChanged?.(direction);

    if (!this.isOnGround) return;

    this.isWalking = true;
    this.isPaused = false;
    this.walkDuration = duration ?? Infinity;
    this.idleTimer = 0;

    this.callbacks.onWalkingChanged?.(true);
  }

  /** 强制进入 idle 状态 */
  public idle(): void {
    this.stopWalking();
  }

  /**
   * 更新桌宠尺寸（用户调整大小后调用）。
   */
  public setPetSize(width: number, height: number): void {
    this.petWidth = width;
    this.petHeight = height;
    this.recalculateBounds();
  }

  /**
   * 运行时更新配置。
   */
  public updateConfig(config: Partial<PhysicsConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** 获取当前配置（只读副本） */
  public getConfig(): Readonly<PhysicsConfig> {
    return { ...this.config };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 工具方法
  // ═══════════════════════════════════════════════════════════════════════════

  /** 将 X 坐标限制在屏幕边界内 */
  private clampX(x: number): number {
    return Math.max(this.bounds.left, Math.min(this.bounds.right, x));
  }
}
```

---

## 8. 配置参数速查表

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `gravity` | `number` | `0.5` | 重力加速度，px/frame^2（60fps 基准）。值越大下落越快 |
| `walkSpeed` | `number` | `2` | 水平行走速度，px/frame（60fps 基准）。值越大走得越快 |
| `screenEdgeBehavior` | `'bounce' \| 'wrap' \| 'stop'` | `'bounce'` | 到达屏幕边缘时的行为 |
| `idleTimeout` | `number` | `3000` | idle 状态等待多久后自动开始行走（ms） |
| `randomWalk` | `boolean` | `true` | 是否启用随机行走 AI |
| `bounceDamping` | `number` | `0` | 地面反弹衰减系数（0 = 不反弹，0.5 = 衰减一半，1 = 完全弹性） |

### 参数调优建议

```
可爱慢速风格:  gravity: 0.3, walkSpeed: 1, idleTimeout: 5000
活泼快速风格:  gravity: 0.8, walkSpeed: 3, idleTimeout: 1500
弹跳球风格:    gravity: 0.5, walkSpeed: 2, bounceDamping: 0.6
巡逻风格:      gravity: 0.5, walkSpeed: 1.5, screenEdgeBehavior: 'wrap'
```

---

## 9. 帧率无关性说明

物理引擎的帧率无关性通过 PixiJS 的 `ticker.deltaMS` 实现：

```
deltaMS = 自上一帧以来的实际毫秒数

归一化 delta = deltaMS / (1000 / 60)
  - 60fps: deltaMS ≈ 16.67ms → delta ≈ 1.0
  - 30fps: deltaMS ≈ 33.33ms → delta ≈ 2.0
  - 144fps: deltaMS ≈ 6.94ms → delta ≈ 0.417

物理公式:
  velocityY += gravity * delta    （加速度按帧缩放）
  positionY += velocityY * delta  （位移按帧缩放）
```

这意味着无论运行在 30fps 还是 144fps，桌宠的下落速度、行走速度在物理上是一致的。唯一的变化是动画的平滑程度（帧率越高越平滑）。

---

## 10. 边界行为详细说明

### bounce（弹回）

```
桌宠走到右边界 → 反转朝向 → 向左行走

时间线:
  →→→→→→→→→|
            |←←←←←←←←←
  →→→→→→→→→→→→→→→→→→→→→
```

适合场景：大多数桌面桌宠的默认行为，像在墙上弹来弹去。

### wrap（穿越）

```
桌宠走到右边界 → 从左边界出现

时间线:
  →→→→→→→→→|
            |→→→→→→→→→→  （从左侧出现）
  →→→→→→→→→→→→→→→→→→→→→
```

适合场景：想要桌宠在屏幕上来回巡逻，不停歇。

### stop（停止）

```
桌宠走到右边界 → 停下 → 等待 idleTimeout → 随机选择新方向

时间线:
  →→→→→→→→→|
            idle... (3s)
            |←←←←←←←←←  （反向行走）
```

适合场景：希望桌宠到达边界后停一会儿再走，更自然。

---

## 11. 错误处理与边界情况

### 11.1 屏幕信息未初始化

```typescript
// getScreenInfo() 在缓存未设置时返回默认值
// 这保证了 PhysicsEngine 在屏幕信息异步获取完成前也能工作
// 后续通过 recalculateBounds() 更新到正确值
```

### 11.2 桌宠被放到屏幕外

```typescript
// setPosition() 会自动 clamp X 到有效范围
// Y 坐标如果超过 groundY 会被修正到 groundY
// Y 坐标如果为负（拖到屏幕顶部以上），会触发下落
```

### 11.3 多显示器场景

```typescript
// 当前实现基于主显示器 (getPrimaryDisplay)
// 多显示器支持需要额外处理：
//   - 窗口跟随桌宠移动到其他显示器
//   - 跨显示器的边界计算
// 这是 Phase 5+ 的优化项，当前阶段使用主显示器即可
```

### 11.4 任务栏位置非底部

```typescript
// Windows 任务栏通常在底部，但用户可能将其移到顶部/左侧/右侧
// 当前实现假设任务栏在底部（workArea.y = 0）
// 如果需要支持其他位置，需要比较 bounds 和 workArea 的 x/y/width/height
```
