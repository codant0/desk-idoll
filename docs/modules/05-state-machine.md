# 05 - 行为状态机模块设计实现文档

> 模块: `src/renderer/state/machine.ts`
> 项目: Desk-Idoll 桌面桌宠
> 技术栈: Electron + TypeScript + PixiJS

---

## 1. 模块职责

行为状态机是桌宠渲染进程的核心控制模块。它管理桌宠的 5 种行为状态（idle、walk、drag、fall、click）之间的转换逻辑，协调渲染引擎、输入系统和物理引擎之间的交互。

```
┌─────────────────────────────────────────────────────────┐
│                     Renderer Process                     │
│                                                         │
│  ┌───────────┐    events    ┌──────────────────┐       │
│  │   Input    │───────────>│                  │       │
│  │  Handler   │            │   StateMachine    │       │
│  └───────────┘            │                  │       │
│                            │  state transitions│       │
│  ┌───────────┐    events   │                  │       │
│  │  Physics   │───────────>│                  │       │
│  │  Engine    │            └──────┬───────────┘       │
│  └───────────┘                   │                     │
│                            onEnter / onExit             │
│                                  │                     │
│                    ┌─────────────┼─────────────┐       │
│                    v             v             v       │
│              ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│              │ Render    │ │ Physics  │ │  Input   │   │
│              │ Adapter   │ │ Engine   │ │ Handler  │   │
│              └──────────┘ └──────────┘ └──────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 类型定义

### 2.1 AnimationState — 动画状态类型

桌宠的 5 种行为状态，每种状态对应一个独立的动画序列。

```typescript
/**
 * 桌宠动画状态。
 *
 * - idle:   待机状态，桌宠静止不动，等待 idleTimeout 到期后随机进入 walk
 * - walk:   行走状态，桌宠在桌面上沿水平方向移动
 * - drag:   拖拽状态，用户按住鼠标左键拖动桌宠
 * - fall:   下落状态，用户释放桌宠后受重力影响下落
 * - click:  点击状态，用户左键点击桌宠触发自定义动作
 */
type AnimationState = 'idle' | 'walk' | 'drag' | 'fall' | 'click';
```

### 2.2 Event — 事件类型

驱动状态转换的外部事件。事件来源分为三类：输入系统（mousedown/mouseup/click）、物理引擎（edge/landed）、内部计时器（timeout）和动作系统（actionDone）。

```typescript
/**
 * 状态机事件。
 *
 * 输入系统事件:
 * - mousedown:  鼠标左键按下（在桌宠区域内）
 * - mouseup:    鼠标左键释放
 * - click:      鼠标左键点击（按下 + 释放，短时间完成）
 *
 * 物理引擎事件:
 * - edge:       行走到达屏幕边缘
 * - landed:     下落过程中落到地面
 *
 * 内部事件:
 * - timeout:    idle 状态超时计时器到期
 * - actionDone: click 状态的动作执行完毕
 */
type Event = 'timeout' | 'mousedown' | 'mouseup' | 'click' | 'edge' | 'landed' | 'actionDone';
```

### 2.3 状态转换表类型

```typescript
/**
 * 状态转换表类型。
 * 外层 Record 的 key 是当前状态，内层 Record 的 key 是触发事件，value 是目标状态。
 * 若某个状态下某事件未定义，则该事件在该状态下被忽略（不触发转换）。
 */
type TransitionTable = Record<AnimationState, Partial<Record<Event, AnimationState>>>;
```

---

## 3. 状态转换表（完整定义）

下表定义了所有合法的状态转换。未列出的 (state, event) 组合表示该事件在该状态下被忽略。

| 当前状态 | 事件        | 目标状态 | 说明                         |
|----------|-------------|----------|------------------------------|
| idle     | timeout     | walk     | 待机超时，开始随机行走       |
| idle     | mousedown   | drag     | 用户按下鼠标，开始拖拽       |
| idle     | click       | click    | 用户点击，触发自定义动作     |
| walk     | edge        | idle     | 到达屏幕边缘，停止行走       |
| walk     | mousedown   | drag     | 用户按下鼠标，中断行走       |
| walk     | click       | click    | 用户点击，触发自定义动作     |
| drag     | mouseup     | fall     | 用户释放鼠标，开始重力下落   |
| fall     | landed      | idle     | 落地，回到待机               |
| click    | actionDone  | idle     | 动作执行完毕，回到待机       |

**状态转换图:**

```
                   ┌────────────┐
          ┌───────>│    idle    │<────────────────────────┐
          │        └─────┬──────┘                         │
          │              │                                │
          │   timeout    │ mousedown         landed       │
          │              v                                │
          │        ┌────────────┐                         │
          │   edge │    walk    │ mousedown               │
          ├────────┘─────┬──────┘                         │
          │              │                                │
          │              v                                │
          │        ┌────────────┐                         │
          │        │    drag    │                         │
          │        └─────┬──────┘                         │
          │              │ mouseup                        │
          │              v                                │
          │        ┌────────────┐                         │
          └────────│    fall    │                         │
                   └────────────┘                         │
                                                          │
    任意状态 ──[click]──> ┌────────────┐ ──[actionDone]──┘
                         │    click   │
                         └────────────┘
```

---

## 4. 完整代码实现

### 4.1 StateMachine 类

```typescript
// src/renderer/state/machine.ts

/**
 * 行为状态机。
 *
 * 职责:
 * - 维护当前动画状态
 * - 根据事件驱动状态转换
 * - 在状态进入/退出时触发回调，协调渲染、物理、输入子系统
 *
 * 用法:
 * ```typescript
 * const machine = new StateMachine();
 *
 * // 注册回调
 * machine.onEnter('idle', (state) => { /* 启动 idle 动画 *\/ });
 * machine.onExit('idle', (state) => { /* 清除计时器 *\/ });
 *
 * // 触发事件
 * machine.emit('timeout');  // idle -> walk
 * machine.emit('mousedown'); // walk -> drag
 * machine.emit('mouseup');   // drag -> fall
 * machine.emit('landed');    // fall -> idle
 * ```
 */
export class StateMachine {
  /** 当前状态 */
  private currentState: AnimationState = 'idle';

  /** 上一个状态（用于 click 完成后恢复） */
  private previousState: AnimationState = 'idle';

  /** 状态转换表 */
  private transitions: TransitionTable = {
    idle:  { timeout: 'walk', mousedown: 'drag', click: 'click' },
    walk:  { edge: 'idle', mousedown: 'drag', click: 'click' },
    drag:  { mouseup: 'fall' },
    fall:  { landed: 'idle' },
    click: { actionDone: 'idle' },
  };

  /** 进入状态回调列表。每个状态可注册多个回调。 */
  private enterCallbacks: Map<AnimationState, Set<(state: AnimationState) => void>> = new Map();

  /** 退出状态回调列表。每个状态可注册多个回调。 */
  private exitCallbacks: Map<AnimationState, Set<(state: AnimationState) => void>> = new Map();

  /**
   * 创建状态机实例。
   *
   * @param initialState - 初始状态，默认为 'idle'
   */
  constructor(initialState: AnimationState = 'idle') {
    this.currentState = initialState;
    this.previousState = initialState;

    // 初始化所有状态的回调集合
    const states: AnimationState[] = ['idle', 'walk', 'drag', 'fall', 'click'];
    for (const state of states) {
      this.enterCallbacks.set(state, new Set());
      this.exitCallbacks.set(state, new Set());
    }
  }

  // ──────────────────────────────────────────────
  //  公共 API
  // ──────────────────────────────────────────────

  /**
   * 获取当前状态。
   *
   * @returns 当前动画状态
   */
  getCurrentState(): AnimationState {
    return this.currentState;
  }

  /**
   * 获取上一个状态。
   * 用于 click 动作完成后恢复到之前的状态（idle 或 walk）。
   *
   * @returns 上一个动画状态
   */
  getPreviousState(): AnimationState {
    return this.previousState;
  }

  /**
   * 触发事件，驱动状态转换。
   *
   * 如果当前状态下该事件有对应的目标状态，则:
   * 1. 调用当前状态的 onExit 回调
   * 2. 更新 currentState 为目标状态
   * 3. 调用目标状态的 onEnter 回调
   *
   * 如果当前状态下该事件无对应转换，则静默忽略。
   *
   * @param event - 要触发的事件
   * @returns 是否发生了状态转换
   */
  emit(event: Event): boolean {
    const targetState = this.transitions[this.currentState]?.[event];

    if (!targetState) {
      // 该事件在当前状态下无对应转换，忽略
      return false;
    }

    const fromState = this.currentState;

    // 执行退出回调
    this.executeCallbacks(this.exitCallbacks, fromState);

    // 更新状态
    this.previousState = fromState;
    this.currentState = targetState;

    // 执行进入回调
    this.executeCallbacks(this.enterCallbacks, targetState);

    return true;
  }

  /**
   * 注册状态进入回调。
   *
   * 当状态机进入指定状态时，回调被调用。
   * 同一个回调函数不会被重复注册。
   *
   * @param state - 目标状态
   * @param callback - 进入状态时调用的回调
   * @returns 取消注册的函数
   */
  onEnter(state: AnimationState, callback: (state: AnimationState) => void): () => void {
    const callbacks = this.enterCallbacks.get(state);
    if (callbacks) {
      callbacks.add(callback);
    }

    // 返回取消注册函数
    return () => {
      callbacks?.delete(callback);
    };
  }

  /**
   * 注册状态退出回调。
   *
   * 当状态机离开指定状态时，回调被调用。
   * 同一个回调函数不会被重复注册。
   *
   * @param state - 源状态
   * @param callback - 退出状态时调用的回调
   * @returns 取消注册的函数
   */
  onExit(state: AnimationState, callback: (state: AnimationState) => void): () => void {
    const callbacks = this.exitCallbacks.get(state);
    if (callbacks) {
      callbacks.add(callback);
    }

    // 返回取消注册函数
    return () => {
      callbacks?.delete(callback);
    };
  }

  /**
   * 检查某个事件在当前状态下是否会导致状态转换。
   *
   * @param event - 要检查的事件
   * @returns 如果事件会触发转换返回 true，否则返回 false
   */
  canEmit(event: Event): boolean {
    return !!this.transitions[this.currentState]?.[event];
  }

  /**
   * 获取当前状态下所有可触发的事件。
   *
   * @returns 可触发事件数组
   */
  getAvailableEvents(): Event[] {
    const transitions = this.transitions[this.currentState];
    if (!transitions) return [];
    return Object.keys(transitions) as Event[];
  }

  /**
   * 强制设置状态（不触发回调）。
   * 仅用于初始化或特殊情况，正常流程应使用 emit()。
   *
   * @param state - 要设置的状态
   */
  forceState(state: AnimationState): void {
    this.previousState = this.currentState;
    this.currentState = state;
  }

  /**
   * 重置状态机到初始状态。
   *
   * @param state - 重置到的状态，默认 'idle'
   */
  reset(state: AnimationState = 'idle'): void {
    this.currentState = state;
    this.previousState = state;
  }

  /**
   * 销毁状态机，清除所有回调。
   */
  destroy(): void {
    for (const [, callbacks] of this.enterCallbacks) {
      callbacks.clear();
    }
    for (const [, callbacks] of this.exitCallbacks) {
      callbacks.clear();
    }
  }

  // ──────────────────────────────────────────────
  //  内部方法
  // ──────────────────────────────────────────────

  /**
   * 执行指定状态的所有回调。
   */
  private executeCallbacks(
    callbackMap: Map<AnimationState, Set<(state: AnimationState) => void>>,
    state: AnimationState
  ): void {
    const callbacks = callbackMap.get(state);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(state);
        } catch (error) {
          console.error(`[StateMachine] Error in ${state} callback:`, error);
        }
      }
    }
  }
}
```

### 4.2 导出类型定义

```typescript
// src/renderer/state/types.ts

/**
 * 桌宠动画状态。
 */
export type AnimationState = 'idle' | 'walk' | 'drag' | 'fall' | 'click';

/**
 * 状态机事件。
 */
export type Event =
  | 'timeout'     // idle 超时
  | 'mousedown'   // 鼠标按下
  | 'mouseup'     // 鼠标释放
  | 'click'       // 鼠标点击
  | 'edge'        // 到达屏幕边缘
  | 'landed'      // 落地
  | 'actionDone'; // 动作执行完毕

/**
 * 状态转换表类型。
 */
export type TransitionTable = Record<AnimationState, Partial<Record<Event, AnimationState>>>;

/**
 * 状态回调函数类型。
 */
export type StateCallback = (state: AnimationState) => void;
```

---

## 5. 状态进入/退出行为

每种状态在进入和退出时需要执行特定的操作。这些操作通过回调注册到状态机上。

### 5.1 行为配置接口

```typescript
// src/renderer/state/behaviors.ts

import { AnimationState } from './types';

/**
 * idle 状态配置。
 */
export interface IdleConfig {
  /** idle 超时时间（毫秒），超时后进入 walk */
  idleTimeout: number;
  /** 是否在一定范围内随机化超时时间 */
  randomizeTimeout: boolean;
  /** 随机化范围倍数，例如 0.5 表示 timeout * (0.5 ~ 1.5) */
  timeoutRandomRange: number;
}

/**
 * walk 状态配置。
 */
export interface WalkConfig {
  /** 行走速度（像素/帧） */
  walkSpeed: number;
  /** 行走方向：1 = 右，-1 = 左 */
  walkDirection: 1 | -1;
  /** 是否启用随机方向切换 */
  randomDirection: boolean;
}

/**
 * drag 状态配置。
 */
export interface DragConfig {
  /** 拖拽时的动画名称 */
  dragAnimation: string;
}

/**
 * fall 状态配置。
 */
export const DEFAULT_FALL_CONFIG = {
  /** 重力加速度（像素/帧^2） */
  gravity: 0.5,
  /** 最大下落速度（像素/帧） */
  maxVelocity: 15,
  /** 落地检测阈值（像素） */
  landingThreshold: 2,
};

/**
 * click 状态配置。
 */
export interface ClickConfig {
  /** click 动画播放时长（毫秒），超时后自动触发 actionDone */
  clickDuration: number;
}
```

### 5.2 BehaviorManager — 行为管理器

```typescript
// src/renderer/state/behaviors.ts

import { StateMachine } from './machine';
import { AnimationState, Event } from './types';
import type { RenderAdapter } from '../engine/adapter';
import type { PhysicsEngine } from '../engine/physics';
import type { InputHandler } from '../engine/input';

/**
 * 行为管理器。
 *
 * 将状态机的状态转换与具体的渲染、物理、输入行为绑定。
 * 负责注册 onEnter / onExit 回调，实现每种状态的具体行为。
 */
export class BehaviorManager {
  private machine: StateMachine;
  private renderAdapter: RenderAdapter;
  private physics: PhysicsEngine;
  private input: InputHandler;

  /** idle 超时计时器 ID */
  private idleTimerId: ReturnType<typeof setTimeout> | null = null;

  /** click 动作计时器 ID */
  private clickTimerId: ReturnType<typeof setTimeout> | null = null;

  /** 当前配置 */
  private config: {
    idleTimeout: number;
    randomizeTimeout: boolean;
    timeoutRandomRange: number;
    walkSpeed: number;
    randomDirection: boolean;
    clickDuration: number;
  };

  /** 取消注册回调的清理函数列表 */
  private cleanupFns: Array<() => void> = [];

  constructor(params: {
    machine: StateMachine;
    renderAdapter: RenderAdapter;
    physics: PhysicsEngine;
    input: InputHandler;
    config: {
      idleTimeout: number;
      randomizeTimeout: boolean;
      timeoutRandomRange: number;
      walkSpeed: number;
      randomDirection: boolean;
      clickDuration: number;
    };
  }) {
    this.machine = params.machine;
    this.renderAdapter = params.renderAdapter;
    this.physics = params.physics;
    this.input = params.input;
    this.config = params.config;

    this.registerBehaviors();
  }

  /**
   * 注册所有状态的行为回调。
   */
  private registerBehaviors(): void {
    // ── idle 进入 ──
    this.cleanupFns.push(
      this.machine.onEnter('idle', (state) => {
        this.onIdleEnter(state);
      })
    );

    // ── idle 退出 ──
    this.cleanupFns.push(
      this.machine.onExit('idle', (state) => {
        this.onIdleExit(state);
      })
    );

    // ── walk 进入 ──
    this.cleanupFns.push(
      this.machine.onEnter('walk', (state) => {
        this.onWalkEnter(state);
      })
    );

    // ── walk 退出 ──
    this.cleanupFns.push(
      this.machine.onExit('walk', (state) => {
        this.onWalkExit(state);
      })
    );

    // ── drag 进入 ──
    this.cleanupFns.push(
      this.machine.onEnter('drag', (state) => {
        this.onDragEnter(state);
      })
    );

    // ── drag 退出 ──
    this.cleanupFns.push(
      this.machine.onExit('drag', (state) => {
        this.onDragExit(state);
      })
    );

    // ── fall 进入 ──
    this.cleanupFns.push(
      this.machine.onEnter('fall', (state) => {
        this.onFallEnter(state);
      })
    );

    // ── fall 退出 ──
    this.cleanupFns.push(
      this.machine.onExit('fall', (state) => {
        this.onFallExit(state);
      })
    );

    // ── click 进入 ──
    this.cleanupFns.push(
      this.machine.onEnter('click', (state) => {
        this.onClickEnter(state);
      })
    );

    // ── click 退出 ──
    this.cleanupFns.push(
      this.machine.onExit('click', (state) => {
        this.onClickExit(state);
      })
    );
  }

  // ──────────────────────────────────────────────
  //  idle 状态行为
  // ──────────────────────────────────────────────

  /**
   * idle 进入行为:
   * 1. 通知渲染引擎播放 idle 动画
   * 2. 停止物理引擎的行走移动
   * 3. 启动 idleTimeout 计时器，超时后触发 'timeout' 事件
   */
  private onIdleEnter(_state: AnimationState): void {
    // 播放 idle 动画
    this.renderAdapter.setState('idle');

    // 停止行走移动（物理引擎保持待机模式）
    this.physics.setMovementEnabled(false);

    // 启动 idle 超时计时器
    this.startIdleTimer();
  }

  /**
   * idle 退出行为:
   * 1. 清除 idle 超时计时器
   */
  private onIdleExit(_state: AnimationState): void {
    this.clearIdleTimer();
  }

  // ──────────────────────────────────────────────
  //  walk 状态行为
  // ──────────────────────────────────────────────

  /**
   * walk 进入行为:
   * 1. 通知渲染引擎播放 walk 动画
   * 2. 设置行走方向（随机或保持当前方向）
   * 3. 启动物理引擎的行走移动
   */
  private onWalkEnter(_state: AnimationState): void {
    // 播放 walk 动画
    this.renderAdapter.setState('walk');

    // 设置行走方向
    if (this.config.randomDirection) {
      const direction = Math.random() < 0.5 ? 1 : -1;
      this.physics.setWalkDirection(direction);
    }

    // 启用行走移动
    this.physics.setWalkSpeed(this.config.walkSpeed);
    this.physics.setMovementEnabled(true);
  }

  /**
   * walk 退出行为:
   * 1. 停止行走移动
   */
  private onWalkExit(_state: AnimationState): void {
    this.physics.setMovementEnabled(false);
  }

  // ──────────────────────────────────────────────
  //  drag 状态行为
  // ──────────────────────────────────────────────

  /**
   * drag 进入行为:
   * 1. 停止所有自动移动
   * 2. 禁用物理引擎
   * 3. 通知渲染引擎播放 drag 动画
   * 4. 启用输入系统的拖拽追踪
   */
  private onDragEnter(_state: AnimationState): void {
    // 停止所有自动移动
    this.physics.setMovementEnabled(false);
    this.physics.setEnabled(false);

    // 播放 drag 动画
    this.renderAdapter.setState('drag');

    // 启用拖拽追踪
    this.input.setDragEnabled(true);
  }

  /**
   * drag 退出行为:
   * 1. 禁用输入系统的拖拽追踪
   */
  private onDragExit(_state: AnimationState): void {
    this.input.setDragEnabled(false);
  }

  // ──────────────────────────────────────────────
  //  fall 状态行为
  // ──────────────────────────────────────────────

  /**
   * fall 进入行为:
   * 1. 启用物理引擎
   * 2. 初始化重力
   * 3. 通知渲染引擎播放 fall 动画
   */
  private onFallEnter(_state: AnimationState): void {
    // 启用物理引擎并初始化重力
    this.physics.setEnabled(true);
    this.physics.initGravity();

    // 播放 fall 动画
    this.renderAdapter.setState('fall');
  }

  /**
   * fall 退出行为:
   * 1. 停止重力
   */
  private onFallExit(_state: AnimationState): void {
    this.physics.stopGravity();
  }

  // ──────────────────────────────────────────────
  //  click 状态行为
  // ──────────────────────────────────────────────

  /**
   * click 进入行为:
   * 1. 停止所有自动移动
   * 2. 通知渲染引擎播放 click 动画
   * 3. 启动 click 持续计时器，完成后触发 'actionDone'
   * 4. 通过 IPC 通知主进程执行动作
   */
  private onClickEnter(_state: AnimationState): void {
    // 停止自动移动
    this.physics.setMovementEnabled(false);

    // 播放 click 动画
    this.renderAdapter.setState('click');

    // 启动 click 持续计时器
    this.startClickTimer();

    // 通知主进程执行动作（通过 IPC）
    // 实际实现中由 PetController 负责 IPC 通信
    // this.ipc.executeAction();
  }

  /**
   * click 退出行为:
   * 1. 清除 click 计时器
   */
  private onClickExit(_state: AnimationState): void {
    this.clearClickTimer();
  }

  // ──────────────────────────────────────────────
  //  计时器管理
  // ──────────────────────────────────────────────

  /**
   * 启动 idle 超时计时器。
   * 超时时间可配置为随机化，避免所有桌宠同时开始行走。
   */
  private startIdleTimer(): void {
    this.clearIdleTimer();

    let timeout = this.config.idleTimeout;

    if (this.config.randomizeTimeout) {
      const range = this.config.timeoutRandomRange;
      const min = timeout * (1 - range);
      const max = timeout * (1 + range);
      timeout = Math.floor(min + Math.random() * (max - min));
    }

    this.idleTimerId = setTimeout(() => {
      this.machine.emit('timeout');
    }, timeout);
  }

  /**
   * 清除 idle 超时计时器。
   */
  private clearIdleTimer(): void {
    if (this.idleTimerId !== null) {
      clearTimeout(this.idleTimerId);
      this.idleTimerId = null;
    }
  }

  /**
   * 启动 click 动作计时器。
   * click 动画播放完成后自动触发 actionDone 事件。
   */
  private startClickTimer(): void {
    this.clearClickTimer();

    this.clickTimerId = setTimeout(() => {
      this.machine.emit('actionDone');
    }, this.config.clickDuration);
  }

  /**
   * 清除 click 计时器。
   */
  private clearClickTimer(): void {
    if (this.clickTimerId !== null) {
      clearTimeout(this.clickTimerId);
      this.clickTimerId = null;
    }
  }

  /**
   * 销毁行为管理器，清除所有回调和计时器。
   */
  destroy(): void {
    this.clearIdleTimer();
    this.clearClickTimer();

    for (const fn of this.cleanupFns) {
      fn();
    }
    this.cleanupFns = [];
  }
}
```

---

## 6. 与渲染引擎的集成

状态机通过 `RenderAdapter` 接口与渲染引擎交互。每当状态转换发生时，`BehaviorManager` 调用 `renderAdapter.setState()` 切换动画。

### 6.1 RenderAdapter 接口

```typescript
// src/renderer/engine/adapter.ts

import { AnimationState } from '../state/types';

/**
 * 渲染适配器接口。
 *
 * 统一 Sprite Sheet 和 Live2D 两种渲染模式的抽象层。
 * 状态机通过此接口控制动画播放，不关心底层渲染实现。
 */
export interface RenderAdapter {
  /**
   * 初始化渲染资源。
   *
   * @param container - PixiJS 容器，适配器将自身显示对象添加到此容器
   */
  init(container: PIXI.Container): Promise<void>;

  /**
   * 切换动画状态。
   *
   * 状态机在状态转换时调用此方法，适配器负责:
   * - Sprite Sheet 模式: 切换 AnimatedSprite 的纹理序列
   * - Live2D 模式: 触发对应的 motion
   *
   * @param state - 要切换到的动画状态
   */
  setState(state: AnimationState): void;

  /**
   * 每帧更新。
   *
   * @param delta - 帧间时间增量（PixiJS ticker 的 delta 值）
   */
  update(delta: number): void;

  /**
   * 销毁渲染资源。
   */
  destroy(): void;

  /**
   * 获取桌宠当前的边界矩形。
   * 用于碰撞检测和输入命中测试。
   *
   * @returns 边界矩形
   */
  getBounds(): PIXI.Rectangle;

  /**
   * 注册动画完成回调。
   * 当一次性动画（如 click）播放完毕时触发。
   *
   * @param callback - 动画完成时的回调函数
   * @returns 取消注册函数
   */
  onAnimationComplete(callback: () => void): () => void;
}
```

### 6.2 SpriteAdapter 实现（渲染集成部分）

```typescript
// src/renderer/engine/sprite-adapter.ts

import * as PIXI from 'pixi.js';
import { RenderAdapter } from './adapter';
import { AnimationState } from '../state/types';

/**
 * Sprite Sheet 渲染适配器。
 *
 * 使用 PixiJS 的 AnimatedSprite 播放 sprite sheet 中定义的动画序列。
 * 每个 AnimationState 对应 spritesheet.json 中 animations 字段的一个 key。
 */
export class SpriteAdapter implements RenderAdapter {
  private spritesheet: PIXI.Spritesheet | null = null;
  private animatedSprite: PIXI.AnimatedSprite | null = null;
  private container: PIXI.Container | null = null;
  private currentState: AnimationState = 'idle';
  private modelPath: string;
  private fps: number;
  private animationCompleteCallbacks: Set<() => void> = new Set();

  constructor(config: { modelPath: string; fps: number }) {
    this.modelPath = config.modelPath;
    this.fps = config.fps;
  }

  async init(container: PIXI.Container): Promise<void> {
    this.container = container;

    // 加载 sprite sheet
    this.spritesheet = await PIXI.Assets.load(this.modelPath);

    // 创建 AnimatedSprite，初始播放 idle 动画
    const textures = this.spritesheet.animations['idle'];
    if (!textures || textures.length === 0) {
      throw new Error(`[SpriteAdapter] Missing 'idle' animation in sprite sheet`);
    }

    this.animatedSprite = new PIXI.AnimatedSprite(textures);
    this.animatedSprite.animationSpeed = this.fps / 60; // PixiJS 用 60fps 基准
    this.animatedSprite.anchor.set(0.5);
    this.animatedSprite.loop = true;
    this.animatedSprite.play();

    container.addChild(this.animatedSprite);
  }

  /**
   * 切换动画状态。
   *
   * 根据状态名从 spritesheet.animations 中获取对应的纹理序列，
   * 替换 AnimatedSprite 的 textures 并重新播放。
   *
   * @param state - 目标动画状态
   */
  setState(state: AnimationState): void {
    if (!this.animatedSprite || !this.spritesheet) return;

    const textures = this.spritesheet.animations[state];
    if (!textures || textures.length === 0) {
      console.warn(`[SpriteAdapter] Animation '${state}' not found, falling back to idle`);
      const fallback = this.spritesheet.animations['idle'];
      if (fallback) {
        this.animatedSprite.textures = fallback;
      }
    } else {
      this.animatedSprite.textures = textures;
    }

    // click 动画不循环，播放一次后触发完成回调
    if (state === 'click') {
      this.animatedSprite.loop = false;
      this.animatedSprite.onComplete = () => {
        this.notifyAnimationComplete();
      };
    } else {
      this.animatedSprite.loop = true;
      this.animatedSprite.onComplete = undefined;
    }

    this.animatedSprite.gotoAndPlay(0);
    this.currentState = state;
  }

  update(delta: number): void {
    if (this.animatedSprite) {
      this.animatedSprite.update(delta);
    }
  }

  destroy(): void {
    if (this.animatedSprite) {
      this.animatedSprite.destroy();
      this.animatedSprite = null;
    }
    if (this.spritesheet) {
      this.spritesheet.destroy(true);
      this.spritesheet = null;
    }
    this.animationCompleteCallbacks.clear();
  }

  getBounds(): PIXI.Rectangle {
    if (this.animatedSprite) {
      return this.animatedSprite.getBounds();
    }
    return new PIXI.Rectangle(0, 0, 0, 0);
  }

  /**
   * 注册动画完成回调。
   * 当 click 等一次性动画播放完毕时触发。
   */
  onAnimationComplete(callback: () => void): () => void {
    this.animationCompleteCallbacks.add(callback);
    return () => {
      this.animationCompleteCallbacks.delete(callback);
    };
  }

  /**
   * 通知所有动画完成回调。
   */
  private notifyAnimationComplete(): void {
    for (const cb of this.animationCompleteCallbacks) {
      try {
        cb();
      } catch (error) {
        console.error('[SpriteAdapter] Error in animation complete callback:', error);
      }
    }
  }
}
```

### 6.3 状态变化通知流程

```
StateMachine.emit('timeout')
  └─> onExit('idle')  ──> BehaviorManager.onIdleExit()  ──> clearIdleTimer()
  └─> state = 'walk'
  └─> onEnter('walk') ──> BehaviorManager.onWalkEnter()
                          ├── renderAdapter.setState('walk')  ← 切换动画
                          ├── physics.setWalkDirection(dir)
                          └── physics.setMovementEnabled(true)
```

---

## 7. 与输入系统的集成

### 7.1 InputHandler 接口

```typescript
// src/renderer/engine/input.ts

import { StateMachine } from '../state/machine';

/**
 * 输入处理器。
 *
 * 职责:
 * - 监听鼠标事件（mousedown、mouseup、click）
 * - 判断鼠标是否在桌宠区域内
 * - 将鼠标事件转换为状态机事件
 * - 拖拽状态下追踪鼠标位置并移动桌宠
 */
export class InputHandler {
  private machine: StateMachine;
  private canvas: HTMLCanvasElement;
  private getBounds: () => PIXI.Rectangle;
  private setPosition: (x: number, y: number) => void;
  private getPosition: () => { x: number; y: number };

  /** 是否启用拖拽追踪 */
  private dragEnabled = false;

  /** 拖拽时鼠标相对于桌宠中心的偏移 */
  private dragOffset = { x: 0, y: 0 };

  /** 鼠标是否在桌宠区域内 */
  private isHovering = false;

  /** click 判定的最大时间间隔（毫秒） */
  private clickThreshold = 200;

  /** mousedown 的时间戳 */
  private mouseDownTime = 0;

  constructor(params: {
    machine: StateMachine;
    canvas: HTMLCanvasElement;
    getBounds: () => PIXI.Rectangle;
    setPosition: (x: number, y: number) => void;
    getPosition: () => { x: number; y: number };
    clickThreshold?: number;
  }) {
    this.machine = params.machine;
    this.canvas = params.canvas;
    this.getBounds = params.getBounds;
    this.setPosition = params.setPosition;
    this.getPosition = params.getPosition;

    if (params.clickThreshold !== undefined) {
      this.clickThreshold = params.clickThreshold;
    }

    this.bindEvents();
  }

  /**
   * 绑定鼠标事件监听。
   */
  private bindEvents(): void {
    // 鼠标进入/离开桌宠区域
    this.canvas.addEventListener('mouseenter', () => {
      this.isHovering = true;
      // 通知 Electron 取消点击穿透
      if (window.electronAPI) {
        window.electronAPI.setInteractive(true);
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isHovering = false;
      // 通知 Electron 恢复点击穿透
      if (window.electronAPI) {
        window.electronAPI.setInteractive(false);
      }
    });

    // 鼠标按下
    this.canvas.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return; // 仅处理左键

      this.mouseDownTime = Date.now();

      if (this.isHovering) {
        // 计算拖拽偏移
        const pos = this.getPosition();
        this.dragOffset.x = e.clientX - pos.x;
        this.dragOffset.y = e.clientY - pos.y;

        // 触发 mousedown 事件
        this.machine.emit('mousedown');
      }
    });

    // 鼠标释放
    this.canvas.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button !== 0) return; // 仅处理左键

      const currentState = this.machine.getCurrentState();

      if (currentState === 'drag') {
        // 在 drag 状态下释放鼠标
        this.machine.emit('mouseup');
      }
    });

    // 鼠标点击（用于判定 click vs drag）
    this.canvas.addEventListener('click', (e: MouseEvent) => {
      if (e.button !== 0) return; // 仅处理左键

      const elapsed = Date.now() - this.mouseDownTime;
      const currentState = this.machine.getCurrentState();

      // 只有在非 drag 状态下，且按下时间短于阈值，才判定为 click
      if (currentState !== 'drag' && elapsed < this.clickThreshold) {
        this.machine.emit('click');
      }
    });

    // 鼠标移动（拖拽追踪）
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.dragEnabled) return;

      const newX = e.clientX - this.dragOffset.x;
      const newY = e.clientY - this.dragOffset.y;
      this.setPosition(newX, newY);
    });
  }

  /**
   * 设置拖拽追踪是否启用。
   * 由 BehaviorManager 在 drag 状态进入/退出时调用。
   *
   * @param enabled - 是否启用拖拽
   */
  setDragEnabled(enabled: boolean): void {
    this.dragEnabled = enabled;
  }

  /**
   * 销毁输入处理器。
   */
  destroy(): void {
    // 实际实现中需要移除事件监听器
  }
}
```

### 7.2 click 与 mousedown 的区分逻辑

```
用户按下鼠标 (mousedown)
  │
  ├── 按下时间 < clickThreshold (200ms) 且未移动 ──> 触发 click 事件
  │     StateMachine: idle/walk ──[click]──> click
  │
  └── 按下时间 >= clickThreshold 或发生移动 ──> 触发 mousedown 事件
        StateMachine: idle/walk ──[mousedown]──> drag
        鼠标释放时: drag ──[mouseup]──> fall
```

**关键设计决策**: `click` 和 `mousedown` 事件是互斥的。当用户快速点击桌宠时，流程为:

1. `mousedown` 记录时间戳
2. 若在 `clickThreshold` 内释放且未移动 -> 触发 `click` 事件 (idle/walk -> click)
3. 若超过阈值或发生移动 -> 触发 `mousedown` 事件 (idle/walk -> drag)

这意味着 `click` 事件在 `mousedown` 之前被判定。实际实现中，`mousedown` handler 记录时间，`click` handler 检查时间差来决定是否触发状态机的 `click` 事件。

### 7.3 物理引擎事件的输入桥接

```typescript
// 在主循环中，物理引擎的事件通过 InputHandler 桥接到状态机

// src/renderer/main.ts (主循环片段)

function gameLoop(delta: number) {
  const currentState = stateMachine.getCurrentState();

  // 物理引擎更新
  if (currentState === 'fall') {
    const physicsResult = physics.update(position, delta);
    if (physicsResult === 'landed') {
      stateMachine.emit('landed'); // fall -> idle
    }
  }

  if (currentState === 'walk') {
    const physicsResult = physics.updateWalk(position, delta);
    if (physicsResult === 'edge') {
      stateMachine.emit('edge'); // walk -> idle
    }
  }

  // 渲染更新
  renderAdapter.update(delta);
}
```

---

## 8. 与物理引擎的集成

### 8.1 PhysicsEngine 接口与实现

```typescript
// src/renderer/engine/physics.ts

/**
 * 物理引擎。
 *
 * 简单的重力模拟和行走移动，不引入 Matter.js 等物理库。
 * 由状态机的 BehaviorManager 控制启用/禁用。
 */
export class PhysicsEngine {
  // ── 重力相关 ──
  private velocityY = 0;
  private gravity = 0.5;
  private maxVelocity = 15;
  private landingThreshold = 2;
  private gravityEnabled = false;

  // ── 行走相关 ──
  private walkSpeed = 2;
  private walkDirection: 1 | -1 = 1;
  private movementEnabled = false;

  // ── 引擎状态 ──
  private enabled = true;

  // ── 屏幕边界 ──
  private screenWidth: number;
  private screenHeight: number;
  private petWidth: number;
  private petHeight: number;

  /** 边界行为: bounce(弹回) / wrap(穿越) / stop(停止) */
  private edgeBehavior: 'bounce' | 'wrap' | 'stop' = 'bounce';

  constructor(config: {
    screenWidth: number;
    screenHeight: number;
    petWidth: number;
    petHeight: number;
    gravity?: number;
    maxVelocity?: number;
    edgeBehavior?: 'bounce' | 'wrap' | 'stop';
  }) {
    this.screenWidth = config.screenWidth;
    this.screenHeight = config.screenHeight;
    this.petWidth = config.petWidth;
    this.petHeight = config.petHeight;

    if (config.gravity !== undefined) this.gravity = config.gravity;
    if (config.maxVelocity !== undefined) this.maxVelocity = config.maxVelocity;
    if (config.edgeBehavior !== undefined) this.edgeBehavior = config.edgeBehavior;
  }

  /**
   * 启用/禁用整个物理引擎。
   * drag 状态下禁用，fall 状态下启用。
   *
   * @param enabled - 是否启用
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 初始化重力。
   * fall 状态进入时调用，重置垂直速度。
   */
  initGravity(): void {
    this.velocityY = 0;
    this.gravityEnabled = true;
  }

  /**
   * 停止重力。
   * fall 状态退出时调用。
   */
  stopGravity(): void {
    this.gravityEnabled = false;
    this.velocityY = 0;
  }

  /**
   * 启用/禁用行走移动。
   * walk 状态进入/退出时调用。
   *
   * @param enabled - 是否启用
   */
  setMovementEnabled(enabled: boolean): void {
    this.movementEnabled = enabled;
  }

  /**
   * 设置行走速度。
   *
   * @param speed - 像素/帧
   */
  setWalkSpeed(speed: number): void {
    this.walkSpeed = speed;
  }

  /**
   * 设置行走方向。
   *
   * @param direction - 1 = 右，-1 = 左
   */
  setWalkDirection(direction: 1 | -1): void {
    this.walkDirection = direction;
  }

  /**
   * 更新重力（fall 状态）。
   *
   * @param position - 当前位置（会被修改）
   * @param delta - 帧间时间增量
   * @returns 'landed' 如果落地，null 如果仍在下落
   */
  updateGravity(position: { x: number; y: number }, delta: number): 'landed' | null {
    if (!this.enabled || !this.gravityEnabled) return null;

    const groundY = this.screenHeight - this.petHeight / 2;

    // 加速下落
    this.velocityY = Math.min(this.velocityY + this.gravity * delta, this.maxVelocity);
    position.y += this.velocityY * delta;

    // 落地检测
    if (position.y >= groundY - this.landingThreshold) {
      position.y = groundY;
      this.velocityY = 0;
      this.gravityEnabled = false;
      return 'landed';
    }

    return null;
  }

  /**
   * 更新行走移动（walk 状态）。
   *
   * @param position - 当前位置（会被修改）
   * @param delta - 帧间时间增量
   * @returns 'edge' 如果到达屏幕边缘，null 如果正常行走
   */
  updateWalk(position: { x: number; y: number }, delta: number): 'edge' | null {
    if (!this.enabled || !this.movementEnabled) return null;

    // 水平移动
    position.x += this.walkSpeed * this.walkDirection * delta;

    // 屏幕边缘检测
    const minX = this.petWidth / 2;
    const maxX = this.screenWidth - this.petWidth / 2;

    if (position.x <= minX) {
      switch (this.edgeBehavior) {
        case 'bounce':
          position.x = minX;
          this.walkDirection = 1;
          return null; // 弹回不算 edge 事件
        case 'wrap':
          position.x = maxX;
          return null;
        case 'stop':
          position.x = minX;
          return 'edge'; // 停止行走，触发 edge 事件
      }
    }

    if (position.x >= maxX) {
      switch (this.edgeBehavior) {
        case 'bounce':
          position.x = maxX;
          this.walkDirection = -1;
          return null;
        case 'wrap':
          position.x = minX;
          return null;
        case 'stop':
          position.x = maxX;
          return 'edge';
      }
    }

    return null;
  }

  /**
   * 统一更新入口。
   * 根据当前状态自动选择更新逻辑。
   *
   * @param position - 当前位置
   * @param delta - 帧间时间增量
   * @param state - 当前状态
   * @returns 事件名，无事件返回 null
   */
  update(
    position: { x: number; y: number },
    delta: number,
    state: string
  ): 'landed' | 'edge' | null {
    if (!this.enabled) return null;

    switch (state) {
      case 'fall':
        return this.updateGravity(position, delta);
      case 'walk':
        return this.updateWalk(position, delta);
      default:
        return null;
    }
  }
}
```

### 8.2 状态与物理引擎的对应关系

| 状态  | 物理引擎状态                    | 说明                           |
|-------|--------------------------------|-------------------------------|
| idle  | movementEnabled = false        | 不移动，不受重力              |
| walk  | movementEnabled = true         | 水平行走移动                  |
| drag  | enabled = false                | 完全禁用，跟随鼠标            |
| fall  | gravityEnabled = true          | 重力下落                      |
| click | movementEnabled = false        | 不移动，播放动画              |

### 8.3 物理引擎事件到状态机事件的映射

```
PhysicsEngine.updateGravity() 返回 'landed'
  └─> StateMachine.emit('landed')  ──> fall → idle

PhysicsEngine.updateWalk() 返回 'edge'
  └─> StateMachine.emit('edge')    ──> walk → idle
```

---

## 9. 完整集成示例

### 9.1 PetController — 桌宠控制器

将状态机、渲染引擎、物理引擎、输入系统组装在一起的顶层控制器。

```typescript
// src/renderer/controller.ts

import * as PIXI from 'pixi.js';
import { StateMachine } from './state/machine';
import { BehaviorManager } from './state/behaviors';
import { AnimationState } from './state/types';
import { SpriteAdapter } from './engine/sprite-adapter';
import { PhysicsEngine } from './engine/physics';
import { InputHandler } from './engine/input';

/**
 * 桌宠控制器。
 *
 * 负责初始化和协调所有子系统:
 * - StateMachine: 行为状态机
 * - BehaviorManager: 行为管理器（绑定状态转换的具体行为）
 * - RenderAdapter: 渲染适配器（Sprite Sheet 或 Live2D）
 * - PhysicsEngine: 物理引擎
 * - InputHandler: 输入处理
 */
export class PetController {
  private app: PIXI.Application;
  private machine: StateMachine;
  private behaviorManager: BehaviorManager;
  private renderAdapter: SpriteAdapter;
  private physics: PhysicsEngine;
  private input: InputHandler;

  /** 桌宠位置 */
  private position = { x: 100, y: 100 };

  /** 桌宠配置 */
  private config: PetControllerConfig;

  constructor(config: PetControllerConfig) {
    this.config = config;
  }

  /**
   * 初始化桌宠。
   */
  async init(): Promise<void> {
    // 1. 创建 PixiJS 应用
    this.app = new PIXI.Application();
    await this.app.init({
      backgroundAlpha: 0, // 透明背景
      width: this.config.windowWidth,
      height: this.config.windowHeight,
    });

    // 将 canvas 添加到 DOM
    document.getElementById('pet-container')!.appendChild(this.app.canvas);

    // 2. 创建渲染适配器
    this.renderAdapter = new SpriteAdapter({
      modelPath: this.config.modelPath,
      fps: this.config.fps,
    });
    await this.renderAdapter.init(this.app.stage);

    // 3. 创建物理引擎
    this.physics = new PhysicsEngine({
      screenWidth: this.config.windowWidth,
      screenHeight: this.config.windowHeight,
      petWidth: this.config.petWidth,
      petHeight: this.config.petHeight,
      gravity: this.config.gravity,
      edgeBehavior: this.config.edgeBehavior,
    });

    // 4. 创建状态机
    this.machine = new StateMachine('idle');

    // 5. 创建输入处理器
    this.input = new InputHandler({
      machine: this.machine,
      canvas: this.app.canvas as HTMLCanvasElement,
      getBounds: () => this.renderAdapter.getBounds(),
      setPosition: (x, y) => this.setPosition(x, y),
      getPosition: () => ({ ...this.position }),
      clickThreshold: 200,
    });

    // 6. 创建行为管理器（绑定状态转换行为）
    this.behaviorManager = new BehaviorManager({
      machine: this.machine,
      renderAdapter: this.renderAdapter,
      physics: this.physics,
      input: this.input,
      config: {
        idleTimeout: this.config.idleTimeout,
        randomizeTimeout: true,
        timeoutRandomRange: 0.5,
        walkSpeed: this.config.walkSpeed,
        randomDirection: true,
        clickDuration: this.config.clickDuration,
      },
    });

    // 7. 注册动画完成回调（用于 click 动画完成后触发 actionDone）
    this.renderAdapter.onAnimationComplete(() => {
      if (this.machine.getCurrentState() === 'click') {
        this.machine.emit('actionDone');
      }
    });

    // 8. 启动主循环
    this.app.ticker.add(this.update, this);

    // 9. 手动触发初始状态的 onEnter
    this.machine.forceState('idle');
    // 通过 emit 一个不会产生转换的事件来触发 idle 的 onEnter
    // 或者直接调用:
    this.machine.reset('idle');
    // 由于 reset 不触发回调，我们需要手动触发
    // 实际实现中，可以在构造函数中让 BehaviorManager 初始化时主动调用一次
  }

  /**
   * 主循环。每帧调用。
   */
  private update(ticker: PIXI.Ticker): void {
    const delta = ticker.deltaTime;
    const currentState = this.machine.getCurrentState();

    // 物理引擎更新
    const physicsEvent = this.physics.update(this.position, delta, currentState);
    if (physicsEvent) {
      this.machine.emit(physicsEvent);
    }

    // 渲染更新
    this.renderAdapter.update(delta);

    // 同步位置到 PixiJS 显示对象
    const bounds = this.renderAdapter.getBounds();
    if (bounds.width > 0) {
      // 位置更新由 InputHandler（拖拽）或 PhysicsEngine（行走/下落）驱动
    }
  }

  /**
   * 设置桌宠位置。
   */
  private setPosition(x: number, y: number): void {
    this.position.x = x;
    this.position.y = y;

    // 同步到 PixiJS stage
    this.app.stage.x = x;
    this.app.stage.y = y;
  }

  /**
   * 获取当前状态。
   */
  getState(): AnimationState {
    return this.machine.getCurrentState();
  }

  /**
   * 销毁桌宠。
   */
  destroy(): void {
    this.app.ticker.remove(this.update, this);
    this.behaviorManager.destroy();
    this.machine.destroy();
    this.input.destroy();
    this.renderAdapter.destroy();
    this.app.destroy(true);
  }
}

/**
 * 桌宠控制器配置。
 */
interface PetControllerConfig {
  /** 窗口宽度 */
  windowWidth: number;
  /** 窗口高度 */
  windowHeight: number;
  /** 模型文件路径 */
  modelPath: string;
  /** 动画帧率 */
  fps: number;
  /** 桌宠宽度 */
  petWidth: number;
  /** 桌宠高度 */
  petHeight: number;
  /** idle 超时时间（毫秒） */
  idleTimeout: number;
  /** 行走速度（像素/帧） */
  walkSpeed: number;
  /** 重力加速度 */
  gravity: number;
  /** 屏幕边缘行为 */
  edgeBehavior: 'bounce' | 'wrap' | 'stop';
  /** click 动画持续时间（毫秒） */
  clickDuration: number;
}
```

### 9.2 使用示例

```typescript
// src/renderer/main.ts

import { PetController } from './controller';

async function main() {
  const controller = new PetController({
    windowWidth: 800,
    windowHeight: 600,
    modelPath: '/assets/default-pet/spritesheet.json',
    fps: 12,
    petWidth: 128,
    petHeight: 128,
    idleTimeout: 3000,
    walkSpeed: 2,
    gravity: 0.5,
    edgeBehavior: 'bounce',
    clickDuration: 1000,
  });

  await controller.init();

  console.log('Desk-Idoll initialized, current state:', controller.getState());
}

main().catch(console.error);
```

---

## 10. 状态机调试工具

### 10.1 状态转换日志

```typescript
// src/renderer/state/debug.ts

import { StateMachine } from './machine';
import { AnimationState, Event } from './types';

/**
 * 状态机调试工具。
 *
 * 为状态机添加详细的日志输出，便于开发调试。
 */
export function enableStateMachineDebug(machine: StateMachine): () => void {
  const allStates: AnimationState[] = ['idle', 'walk', 'drag', 'fall', 'click'];
  const cleanupFns: Array<() => void> = [];

  for (const state of allStates) {
    cleanupFns.push(
      machine.onEnter(state, (s) => {
        console.log(
          `%c[StateMachine] ENTER: ${s}`,
          'color: #4CAF50; font-weight: bold',
          `at ${new Date().toISOString()}`
        );
      })
    );

    cleanupFns.push(
      machine.onExit(state, (s) => {
        console.log(
          `%c[StateMachine] EXIT: ${s}`,
          'color: #FF9800; font-weight: bold',
          `at ${new Date().toISOString()}`
        );
      })
    );
  }

  // 返回清理函数
  return () => {
    for (const fn of cleanupFns) {
      fn();
    }
  };
}

/**
 * 状态转换历史记录。
 * 记录最近 N 次状态转换，便于回溯调试。
 */
export class TransitionHistory {
  private history: Array<{
    from: AnimationState;
    to: AnimationState;
    event: Event;
    timestamp: number;
  }> = [];

  private maxSize: number;

  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  /**
   * 记录一次状态转换。
   */
  record(from: AnimationState, to: AnimationState, event: Event): void {
    this.history.push({ from, to, event, timestamp: Date.now() });

    if (this.history.length > this.maxSize) {
      this.history.shift();
    }
  }

  /**
   * 获取转换历史。
   */
  getHistory() {
    return [...this.history];
  }

  /**
   * 打印最近的转换历史。
   */
  printRecent(count = 10): void {
    const recent = this.history.slice(-count);
    console.table(
      recent.map((entry) => ({
        from: entry.from,
        event: entry.event,
        to: entry.to,
        time: new Date(entry.timestamp).toLocaleTimeString(),
      }))
    );
  }

  /**
   * 清除历史。
   */
  clear(): void {
    this.history = [];
  }
}
```

---

## 11. 单元测试

```typescript
// src/renderer/state/__tests__/machine.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateMachine } from '../machine';

describe('StateMachine', () => {
  let machine: StateMachine;

  beforeEach(() => {
    machine = new StateMachine('idle');
  });

  describe('初始状态', () => {
    it('默认初始状态为 idle', () => {
      expect(machine.getCurrentState()).toBe('idle');
    });

    it('可以指定初始状态', () => {
      const m = new StateMachine('walk');
      expect(m.getCurrentState()).toBe('walk');
    });
  });

  describe('状态转换', () => {
    it('idle + timeout -> walk', () => {
      const result = machine.emit('timeout');
      expect(result).toBe(true);
      expect(machine.getCurrentState()).toBe('walk');
    });

    it('idle + mousedown -> drag', () => {
      machine.emit('mousedown');
      expect(machine.getCurrentState()).toBe('drag');
    });

    it('idle + click -> click', () => {
      machine.emit('click');
      expect(machine.getCurrentState()).toBe('click');
    });

    it('walk + edge -> idle', () => {
      machine.emit('timeout'); // idle -> walk
      machine.emit('edge');
      expect(machine.getCurrentState()).toBe('idle');
    });

    it('walk + mousedown -> drag', () => {
      machine.emit('timeout'); // idle -> walk
      machine.emit('mousedown');
      expect(machine.getCurrentState()).toBe('drag');
    });

    it('drag + mouseup -> fall', () => {
      machine.emit('mousedown'); // idle -> drag
      machine.emit('mouseup');
      expect(machine.getCurrentState()).toBe('fall');
    });

    it('fall + landed -> idle', () => {
      machine.emit('mousedown'); // idle -> drag
      machine.emit('mouseup');   // drag -> fall
      machine.emit('landed');
      expect(machine.getCurrentState()).toBe('idle');
    });

    it('click + actionDone -> idle', () => {
      machine.emit('click'); // idle -> click
      machine.emit('actionDone');
      expect(machine.getCurrentState()).toBe('idle');
    });

    it('无效事件被忽略', () => {
      const result = machine.emit('landed'); // idle 不响应 landed
      expect(result).toBe(false);
      expect(machine.getCurrentState()).toBe('idle');
    });
  });

  describe('回调', () => {
    it('onEnter 在进入状态时被调用', () => {
      const callback = vi.fn();
      machine.onEnter('walk', callback);

      machine.emit('timeout'); // idle -> walk
      expect(callback).toHaveBeenCalledWith('walk');
    });

    it('onExit 在退出状态时被调用', () => {
      const callback = vi.fn();
      machine.onExit('idle', callback);

      machine.emit('timeout'); // idle -> walk
      expect(callback).toHaveBeenCalledWith('idle');
    });

    it('回调按注册顺序执行', () => {
      const order: number[] = [];
      machine.onEnter('walk', () => order.push(1));
      machine.onEnter('walk', () => order.push(2));
      machine.onEnter('walk', () => order.push(3));

      machine.emit('timeout');
      expect(order).toEqual([1, 2, 3]);
    });

    it('取消注册后回调不再被调用', () => {
      const callback = vi.fn();
      const unregister = machine.onEnter('walk', callback);

      unregister();
      machine.emit('timeout'); // idle -> walk
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('完整流程', () => {
    it('idle -> walk -> drag -> fall -> idle 完整循环', () => {
      expect(machine.getCurrentState()).toBe('idle');

      machine.emit('timeout');    // idle -> walk
      expect(machine.getCurrentState()).toBe('walk');

      machine.emit('mousedown');  // walk -> drag
      expect(machine.getCurrentState()).toBe('drag');

      machine.emit('mouseup');    // drag -> fall
      expect(machine.getCurrentState()).toBe('fall');

      machine.emit('landed');     // fall -> idle
      expect(machine.getCurrentState()).toBe('idle');
    });

    it('idle -> click -> idle 完整循环', () => {
      machine.emit('click');       // idle -> click
      expect(machine.getCurrentState()).toBe('click');

      machine.emit('actionDone');  // click -> idle
      expect(machine.getCurrentState()).toBe('idle');
    });

    it('walk 状态下点击也能触发 click', () => {
      machine.emit('timeout');     // idle -> walk
      expect(machine.getCurrentState()).toBe('walk');

      machine.emit('click');       // walk -> click
      expect(machine.getCurrentState()).toBe('click');

      machine.emit('actionDone');  // click -> idle
      expect(machine.getCurrentState()).toBe('idle');
    });
  });

  describe('辅助方法', () => {
    it('canEmit 正确报告事件可用性', () => {
      expect(machine.canEmit('timeout')).toBe(true);
      expect(machine.canEmit('mousedown')).toBe(true);
      expect(machine.canEmit('click')).toBe(true);
      expect(machine.canEmit('edge')).toBe(false);
      expect(machine.canEmit('landed')).toBe(false);
    });

    it('getAvailableEvents 返回当前状态可用事件', () => {
      const events = machine.getAvailableEvents();
      expect(events).toContain('timeout');
      expect(events).toContain('mousedown');
      expect(events).toContain('click');
      expect(events).not.toContain('edge');
    });

    it('getPreviousState 返回上一个状态', () => {
      machine.emit('timeout'); // idle -> walk
      expect(machine.getPreviousState()).toBe('idle');

      machine.emit('mousedown'); // walk -> drag
      expect(machine.getPreviousState()).toBe('walk');
    });

    it('reset 重置状态', () => {
      machine.emit('timeout');
      machine.emit('mousedown');
      expect(machine.getCurrentState()).toBe('drag');

      machine.reset();
      expect(machine.getCurrentState()).toBe('idle');
    });
  });

  describe('错误处理', () => {
    it('回调中的异常不影响其他回调执行', () => {
      const callback2 = vi.fn();

      machine.onEnter('walk', () => {
        throw new Error('test error');
      });
      machine.onEnter('walk', callback2);

      machine.emit('timeout');
      expect(callback2).toHaveBeenCalled();
    });
  });
});
```

---

## 12. 文件清单

本模块涉及的文件及其职责:

| 文件路径 | 职责 |
|----------|------|
| `src/renderer/state/machine.ts` | 状态机核心类，管理状态和转换 |
| `src/renderer/state/types.ts` | 类型定义（AnimationState、Event、TransitionTable） |
| `src/renderer/state/behaviors.ts` | 行为管理器，绑定状态转换的具体行为 |
| `src/renderer/state/debug.ts` | 调试工具（日志、转换历史） |
| `src/renderer/state/__tests__/machine.test.ts` | 状态机单元测试 |
| `src/renderer/engine/adapter.ts` | RenderAdapter 接口定义 |
| `src/renderer/engine/sprite-adapter.ts` | Sprite Sheet 渲染适配器实现 |
| `src/renderer/engine/physics.ts` | 物理引擎（重力 + 行走） |
| `src/renderer/engine/input.ts` | 输入处理（鼠标事件 → 状态机事件） |
| `src/renderer/controller.ts` | 桌宠控制器（组装所有子系统） |
| `src/renderer/main.ts` | 渲染进程入口 |

---

## 13. 设计决策说明

### 13.1 为什么使用回调模式而不是事件发射器

状态机使用 `onEnter/onExit` 回调注册模式，而非 Node.js 风格的 EventEmitter。原因:

1. **类型安全**: 回调签名明确 `(state: AnimationState) => void`，TypeScript 可以静态检查
2. **可控顺序**: 回调按注册顺序执行，行为可预测
3. **取消注册简单**: 返回清理函数，无需手动管理 listener 引用
4. **无事件名拼写错误风险**: 事件名是类型约束的联合类型

### 13.2 为什么 click 和 mousedown 是互斥事件

在实际鼠标交互中，一次点击操作同时满足 "按下" 和 "释放" 两个条件。如果同时发送 mousedown 和 click 事件，会导致状态混乱（先到 drag，再到 click，但 drag 期望 mouseup）。

解决方案: 在 InputHandler 中通过时间阈值（clickThreshold）区分:
- 短按 (< 200ms) = click（触发动作）
- 长按 (>= 200ms) = mousedown（进入拖拽）

### 13.3 为什么 click 状态完成后回到 idle 而非 previousState

虽然设计图中标注 "回到之前状态"，但实际实现中 click -> actionDone -> idle 更合理:

1. **简化逻辑**: 不需要维护 previousState 的复杂恢复逻辑
2. **自然行为**: 用户点击桌宠后，桌宠"愣一下"然后回到待机是自然的表现
3. **避免状态冲突**: 如果之前是 walk，恢复行走方向和速度可能与用户预期不符

如需恢复到之前状态，可将转换表修改为 `click: { actionDone: previousState }`，但这需要扩展 StateMachine 的转换表支持动态目标状态。
