# 06 - 输入处理 + 交互模块设计文档

> 模块: `src/renderer/engine/input.ts` 及相关 IPC 通信
> 依赖: PixiJS 8.x, Electron IPC, 状态机 (`state/machine.ts`)
> 状态: 设计稿

---

## 1. 模块职责

输入处理模块是渲染进程中桌宠与用户交互的唯一入口，负责：

- 监听所有鼠标事件（mousedown / mousemove / mouseup / click / contextmenu）
- 区分"拖拽"与"点击"两种交互意图
- 通过 IPC 将窗口拖拽、点击穿透切换、右键菜单显示、动作执行等指令发送给主进程
- 将交互事件分发给状态机，驱动桌宠行为状态转换

### 模块依赖关系

```
Renderer Process
┌──────────────────────────────────────────────────────┐
│                                                      │
│  PixiJS Canvas                                       │
│       │                                              │
│       ▼                                              │
│  InputHandler ──dispatch──> StateMachine              │
│       │                       │                      │
│       │ IPC                   │ state change          │
│       ▼                       ▼                      │
│  electronAPI            RenderAdapter                │
│       │                       │                      │
└───────┼───────────────────────┼──────────────────────┘
        │                       │
        ▼ (IPC invoke)          ▼ (animation update)
Main Process              PixiJS render loop
```

---

## 2. IPC 通道定义

文件: `src/shared/ipc-channels.ts`

```typescript
/**
 * 所有 IPC 通道名称的常量定义，避免硬编码字符串。
 * 渲染进程和主进程共享此文件。
 */

// ─── 渲染进程 → 主进程 (invoke / send) ───

/** 拖拽移动窗口 */
export const IPC_MOVE_WINDOW = 'move-window';

/** 切换鼠标穿透状态 */
export const IPC_SET_INTERACTIVE = 'set-interactive';

/** 请求显示右键菜单 */
export const IPC_SHOW_CONTEXT_MENU = 'show-context-menu';

/** 请求执行桌宠动作 */
export const IPC_EXECUTE_ACTION = 'execute-action';

/** 获取当前桌宠配置 */
export const IPC_GET_PET_CONFIG = 'get-pet-config';

/** 获取动作列表 */
export const IPC_GET_ACTIONS = 'get-actions';

// ─── 主进程 → 渲染进程 (send / on) ───

/** 主进程通知渲染进程动作执行完成 */
export const IPC_ACTION_DONE = 'action-done';

/** 主进程通知渲染进程隐藏桌宠 */
export const IPC_HIDE_PET = 'hide-pet';

/** 主进程通知渲染进程显示桌宠 */
export const IPC_SHOW_PET = 'show-pet';
```

---

## 3. Preload 桥接层

文件: `src/preload/index.ts`

Preload 脚本通过 `contextBridge` 向渲染进程暴露安全的 API，所有主进程通信必须经过此层。

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_MOVE_WINDOW,
  IPC_SET_INTERACTIVE,
  IPC_SHOW_CONTEXT_MENU,
  IPC_EXECUTE_ACTION,
  IPC_GET_PET_CONFIG,
  IPC_GET_ACTIONS,
  IPC_ACTION_DONE,
  IPC_HIDE_PET,
  IPC_SHOW_PET,
} from '../shared/ipc-channels';

/**
 * 暴露给渲染进程的 API 接口。
 * 渲染进程通过 window.electronAPI 调用。
 */
export interface ElectronAPI {
  /** 拖拽移动窗口到指定屏幕坐标 */
  moveWindow(x: number, y: number): Promise<void>;

  /** 切换鼠标穿透（true = 可交互，false = 穿透） */
  setInteractive(flag: boolean): Promise<void>;

  /** 请求主进程弹出右键菜单 */
  showContextMenu(menuId: string): Promise<void>;

  /** 请求主进程执行指定动作 */
  executeAction(actionId: string): Promise<{ success: boolean; error?: string }>;

  /** 获取当前桌宠配置 */
  getPetConfig(): Promise<any>;

  /** 获取动作列表 */
  getActions(): Promise<any[]>;

  /** 监听动作执行完成 */
  onActionDone(callback: (actionId: string) => void): void;

  /** 监听隐藏桌宠指令 */
  onHidePet(callback: () => void): void;

  /** 监听显示桌宠指令 */
  onShowPet(callback: () => void): void;

  /** 移除指定通道的所有监听器 */
  removeAllListeners(channel: string): void;
}

const electronAPI: ElectronAPI = {
  moveWindow: (x, y) => ipcRenderer.invoke(IPC_MOVE_WINDOW, x, y),
  setInteractive: (flag) => ipcRenderer.invoke(IPC_SET_INTERACTIVE, flag),
  showContextMenu: (menuId) => ipcRenderer.invoke(IPC_SHOW_CONTEXT_MENU, menuId),
  executeAction: (actionId) => ipcRenderer.invoke(IPC_EXECUTE_ACTION, actionId),
  getPetConfig: () => ipcRenderer.invoke(IPC_GET_PET_CONFIG),
  getActions: () => ipcRenderer.invoke(IPC_GET_ACTIONS),

  onActionDone: (callback) => {
    ipcRenderer.on(IPC_ACTION_DONE, (_event, actionId) => callback(actionId));
  },
  onHidePet: (callback) => {
    ipcRenderer.on(IPC_HIDE_PET, () => callback());
  },
  onShowPet: (callback) => {
    ipcRenderer.on(IPC_SHOW_PET, () => callback());
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
```

类型声明文件: `src/renderer/types/electron.d.ts`

```typescript
import type { ElectronAPI } from '../../preload/index';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

---

## 4. 主进程 IPC 处理

文件: `src/main/ipc.ts`

主进程侧注册所有 IPC 处理器，接收渲染进程的指令并执行相应操作。

```typescript
import { ipcMain, BrowserWindow, Menu, shell, dialog } from 'electron';
import {
  IPC_MOVE_WINDOW,
  IPC_SET_INTERACTIVE,
  IPC_SHOW_CONTEXT_MENU,
  IPC_EXECUTE_ACTION,
  IPC_GET_PET_CONFIG,
  IPC_GET_ACTIONS,
  IPC_ACTION_DONE,
} from '../shared/ipc-channels';
import type { PetAction, PetConfig } from '../shared/types';

/**
 * 注册所有 IPC 通道的处理逻辑。
 *
 * @param getWindow - 获取当前桌宠 BrowserWindow 实例的函数
 * @param getConfig - 获取当前桌宠配置的函数
 * @param getActions - 获取动作列表的函数
 */
export function registerIPC(
  getWindow: () => BrowserWindow | null,
  getConfig: () => PetConfig,
  getActions: () => PetAction[],
): void {

  // ─── 拖拽移动窗口 ───
  ipcMain.handle(IPC_MOVE_WINDOW, (_event, x: number, y: number) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.setPosition(Math.round(x), Math.round(y));
    }
  });

  // ─── 切换鼠标穿透 ───
  ipcMain.handle(IPC_SET_INTERACTIVE, (_event, flag: boolean) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      if (flag) {
        // 可交互: 取消穿透，正常接收鼠标事件
        win.setIgnoreMouseEvents(false);
      } else {
        // 穿透: 忽略鼠标事件，但 forward: true 仍然转发坐标给渲染进程用于 hitTest
        win.setIgnoreMouseEvents(true, { forward: true });
      }
    }
  });

  // ─── 右键菜单 ───
  ipcMain.handle(IPC_SHOW_CONTEXT_MENU, (_event, menuId: string) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;

    const actions = getActions();
    const config = getConfig();

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: `${config.name} - 设置`,
        click: () => {
          // 通知打开配置窗口（由 PetWindowManager 处理）
          BrowserWindow.getAllWindows()
            .find(w => w.webContents.getURL().includes('config'))
            ?.show();
        },
      },
      { type: 'separator' },
      ...actions.map((action) => ({
        label: action.name,
        click: () => {
          win.webContents.send(IPC_ACTION_DONE, action.id);
        },
      })),
      { type: 'separator' },
      {
        label: '隐藏',
        click: () => {
          win.hide();
        },
      },
      {
        label: '退出',
        click: () => {
          // 由主进程 index.ts 处理退出逻辑
          BrowserWindow.getAllWindows().forEach(w => w.close());
        },
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    menu.popup({
      window: win,
    });
  });

  // ─── 执行动作 ───
  ipcMain.handle(IPC_EXECUTE_ACTION, async (_event, actionId: string) => {
    const actions = getActions();
    const action = actions.find(a => a.id === actionId);
    if (!action) {
      return { success: false, error: `Action not found: ${actionId}` };
    }

    try {
      // 执行前确认（CMD 类型默认开启）
      if (action.confirmBeforeExecute) {
        const result = await dialog.showMessageBox({
          type: 'question',
          buttons: ['执行', '取消'],
          defaultId: 1,
          message: `确认执行: ${action.name}?\n${action.payload}`,
        });
        if (result.response !== 0) {
          return { success: false, error: 'Cancelled by user' };
        }
      }

      switch (action.type) {
        case 'open-url':
          await shell.openExternal(action.payload);
          break;
        case 'execute-cmd': {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          await promisify(exec)(action.payload);
          break;
        }
        case 'show-message':
          await dialog.showMessageBox({
            type: 'info',
            message: action.payload,
          });
          break;
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ─── 获取配置 ───
  ipcMain.handle(IPC_GET_PET_CONFIG, () => {
    return getConfig();
  });

  // ─── 获取动作列表 ───
  ipcMain.handle(IPC_GET_ACTIONS, () => {
    return getActions();
  });
}
```

---

## 5. 输入处理器 — InputHandler 类

文件: `src/renderer/engine/input.ts`

这是核心模块，负责全部鼠标输入的捕获、意图判断和事件分发。

### 5.1 完整代码实现

```typescript
import type * as PIXI from 'pixi.js';
import type { StateMachine } from '../state/machine';

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

/** 二维坐标点 */
interface Point {
  x: number;
  y: number;
}

/** 输入事件类型 — 分发给状态机的事件 */
export type InputEvent =
  | { type: 'mousedown'; position: Point }
  | { type: 'mousemove'; position: Point }
  | { type: 'mouseup'; position: Point }
  | { type: 'click'; position: Point }
  | { type: 'contextmenu'; position: Point }
  | { type: 'drag-start'; position: Point }
  | { type: 'drag-move'; position: Point; delta: Point }
  | { type: 'drag-end'; position: Point }
  | { type: 'pointer-enter' }
  | { type: 'pointer-leave' };

/** 输入事件回调函数类型 */
export type InputEventCallback = (event: InputEvent) => void;

/** InputHandler 配置选项 */
export interface InputHandlerOptions {
  /** 拖拽阈值（像素）。mousedown 到 mousemove 的累积距离超过此值才判定为拖拽 */
  dragThreshold?: number;

  /** 点击最大持续时间（毫秒）。超过此时间的交互不判定为点击 */
  clickMaxDuration?: number;

  /** 是否启用调试日志 */
  debug?: boolean;
}

// ─────────────────────────────────────────────
// 默认配置
// ─────────────────────────────────────────────

const DEFAULT_OPTIONS: Required<InputHandlerOptions> = {
  dragThreshold: 5,
  clickMaxDuration: 300,
  debug: false,
};

// ─────────────────────────────────────────────
// InputHandler 类
// ─────────────────────────────────────────────

/**
 * 桌宠输入处理器。
 *
 * 职责:
 * 1. 监听 PixiJS stage 上的鼠标事件
 * 2. 根据鼠标轨迹区分"拖拽"和"点击"
 * 3. 通过 IPC 通知主进程执行窗口操作（移动、穿透、菜单）
 * 4. 将交互事件分发给状态机
 * 5. 管理点击穿透的动态切换
 */
export class InputHandler {
  /** PixiJS 应用引用 */
  private app: PIXI.Application;

  /** 状态机引用 */
  private stateMachine: StateMachine;

  /** 配置选项 */
  private options: Required<InputHandlerOptions>;

  /** 桌宠渲染容器的引用，用于 hitTest */
  private petContainer: PIXI.Container | null = null;

  // ─── 拖拽状态 ───

  /** 是否正在拖拽 */
  private isDragging = false;

  /** 鼠标按下时的屏幕坐标 */
  private dragStartScreen: Point = { x: 0, y: 0 };

  /** 鼠标按下时的窗口坐标 */
  private dragStartWindow: Point = { x: 0, y: 0 };

  /** 鼠标按下时的时间戳 */
  private mouseDownTime = 0;

  /** 当前鼠标是否在桌宠像素区域内（用于穿透管理） */
  private isPointerOverPet = false;

  /** 是否已销毁 */
  private destroyed = false;

  // ─── 事件监听器引用（用于清理） ───

  private boundOnPointerDown: (e: PIXI.FederatedPointerEvent) => void;
  private boundOnPointerMove: (e: PIXI.FederatedPointerEvent) => void;
  private boundOnPointerUp: (e: PIXI.FederatedPointerEvent) => void;
  private boundOnPointerUpOutside: (e: PIXI.FederatedPointerEvent) => void;
  private boundOnRightClick: (e: PIXI.FederatedPointerEvent) => void;

  /**
   * 创建 InputHandler 实例。
   *
   * @param app - PixiJS Application 实例
   * @param stateMachine - 桌宠状态机
   * @param options - 可选配置
   */
  constructor(
    app: PIXI.Application,
    stateMachine: StateMachine,
    options?: InputHandlerOptions,
  ) {
    this.app = app;
    this.stateMachine = stateMachine;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // 绑定事件处理器，保存引用以便后续清理
    this.boundOnPointerDown = this.onPointerDown.bind(this);
    this.boundOnPointerMove = this.onPointerMove.bind(this);
    this.boundOnPointerUp = this.onPointerUp.bind(this);
    this.boundOnPointerUpOutside = this.onPointerUpOutside.bind(this);
    this.boundOnRightClick = this.onRightClick.bind(this);

    this.attachListeners();

    if (this.options.debug) {
      console.log('[InputHandler] Initialized', this.options);
    }
  }

  // ─────────────────────────────────────────
  // 公共 API
  // ─────────────────────────────────────────

  /**
   * 设置桌宠渲染容器。
   * InputHandler 需要此引用来进行像素级 hitTest，
   * 判断鼠标是否悬停在桌宠的可见像素上。
   *
   * @param container - PixiJS Container（桌宠的渲染根容器）
   */
  setPetContainer(container: PIXI.Container): void {
    this.petContainer = container;

    // 为容器开启事件，确保 PixiJS EventSystem 能对其进行 hitTest
    container.eventMode = 'static';
    container.cursor = 'pointer';
  }

  /**
   * 获取当前是否正在拖拽。
   */
  getIsDragging(): boolean {
    return this.isDragging;
  }

  /**
   * 获取当前鼠标是否在桌宠区域上。
   */
  getIsPointerOverPet(): boolean {
    return this.isPointerOverPet;
  }

  /**
   * 销毁 InputHandler，移除所有事件监听。
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.detachListeners();

    if (this.options.debug) {
      console.log('[InputHandler] Destroyed');
    }
  }

  // ─────────────────────────────────────────
  // 事件监听器注册 / 移除
  // ─────────────────────────────────────────

  /**
   * 注册所有 PixiJS stage 级别的事件监听器。
   * 使用 stage 而非 canvas 的原因是 PixiJS 的 FederatedEvent
   * 已经处理了坐标转换和事件冒泡。
   */
  private attachListeners(): void {
    const stage = this.app.stage;

    // stage 级别: 捕获所有指针事件
    stage.on('pointerdown', this.boundOnPointerDown);
    stage.on('pointermove', this.boundOnPointerMove);
    stage.on('pointerup', this.boundOnPointerUp);
    stage.on('pointerupoutside', this.boundOnPointerUpOutside);

    // 右键菜单（PixiJS 8 中通过 rightclick 事件）
    stage.on('rightclick', this.boundOnRightClick);

    // 穿透管理: 使用底层 canvas 的 mousemove 进行 hitTest
    // 因为当窗口处于穿透模式时，PixiJS 的事件不会触发
    this.attachCanvasHitTestListener();
  }

  /**
   * 移除所有事件监听器。
   */
  private detachListeners(): void {
    const stage = this.app.stage;

    stage.off('pointerdown', this.boundOnPointerDown);
    stage.off('pointermove', this.boundOnPointerMove);
    stage.off('pointerup', this.boundOnPointerUp);
    stage.off('pointerupoutside', this.boundOnPointerUpOutside);
    stage.off('rightclick', this.boundOnRightClick);

    this.detachCanvasHitTestListener();
  }

  // ─────────────────────────────────────────
  // Canvas 级别 hitTest（穿透管理核心）
  // ─────────────────────────────────────────

  /**
   * 底层 canvas 的 mousemove 处理器引用。
   * 用于穿透模式下检测鼠标是否进入了桌宠的像素区域。
   */
  private canvasMouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private canvasMouseLeaveHandler: (() => void) | null = null;

  /**
   * 注册 canvas 级别的 mousemove 监听器。
   *
   * 当窗口处于穿透模式（setIgnoreMouseEvents(true, { forward: true })）时，
   * 主进程仍然会通过 forward 机制将 mousemove 事件转发给渲染进程。
   * 我们利用这些转发的事件来做 hitTest，判断鼠标是否在桌宠像素上。
   *
   * 如果鼠标在桌宠像素上 → IPC set-interactive(true) 取消穿透
   * 如果鼠标离开桌宠像素 → IPC set-interactive(false) 恢复穿透
   */
  private attachCanvasHitTestListener(): void {
    const canvas = this.app.canvas as HTMLCanvasElement;

    this.canvasMouseMoveHandler = (e: MouseEvent) => {
      if (this.destroyed) return;
      this.hitTestAtClientPosition(e.clientX, e.clientY);
    };

    this.canvasMouseLeaveHandler = () => {
      if (this.destroyed) return;
      if (this.isPointerOverPet) {
        this.isPointerOverPet = false;
        this.setInteractive(false);
      }
    };

    canvas.addEventListener('mousemove', this.canvasMouseMoveHandler);
    canvas.addEventListener('mouseleave', this.canvasMouseLeaveHandler);
  }

  /**
   * 移除 canvas 级别的监听器。
   */
  private detachCanvasHitTestListener(): void {
    const canvas = this.app.canvas as HTMLCanvasElement;

    if (this.canvasMouseMoveHandler) {
      canvas.removeEventListener('mousemove', this.canvasMouseMoveHandler);
      this.canvasMouseMoveHandler = null;
    }
    if (this.canvasMouseLeaveHandler) {
      canvas.removeEventListener('mouseleave', this.canvasMouseLeaveHandler);
      this.canvasMouseLeaveHandler = null;
    }
  }

  /**
   * 在指定的客户端坐标处执行 hitTest。
   * 使用 PixiJS EventSystem 的 hitTest 方法判断该坐标是否命中桌宠容器的像素。
   *
   * @param clientX - 鼠标在视口中的 X 坐标
   * @param clientY - 鼠标在视口中的 Y 坐标
   */
  private hitTestAtClientPosition(clientX: number, clientY: number): void {
    if (!this.petContainer) return;

    // 将客户端坐标转换为 PixiJS 世界坐标
    const rect = (this.app.canvas as HTMLCanvasElement).getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    // 使用 PixiJS 的 EventSystem 做 hitTest
    const hitResult = this.app.renderer.events.hitTest({
      x: localX,
      y: localY,
    } as any);

    // hitTest 返回一个数组，第一个元素是最顶层命中的显示对象
    // 判断命中结果中是否包含桌宠容器或其子节点
    const isOverPet = hitResult !== null && this.isDescendantOfPet(hitResult as any);

    if (isOverPet && !this.isPointerOverPet) {
      // 鼠标进入桌宠区域
      this.isPointerOverPet = true;
      this.setInteractive(true);
    } else if (!isOverPet && this.isPointerOverPet && !this.isDragging) {
      // 鼠标离开桌宠区域（拖拽中不切换穿透，避免窗口丢失鼠标捕获）
      this.isPointerOverPet = false;
      this.setInteractive(false);
    }
  }

  /**
   * 判断给定的显示对象是否是桌宠容器的子节点。
   */
  private isDescendantOfPet(displayObject: PIXI.Container): boolean {
    let current: PIXI.Container | null = displayObject as PIXI.Container;
    while (current) {
      if (current === this.petContainer) return true;
      current = current.parent;
    }
    return false;
  }

  // ─────────────────────────────────────────
  // IPC 辅助方法
  // ─────────────────────────────────────────

  /**
   * 通过 IPC 通知主进程切换窗口的鼠标穿透状态。
   */
  private setInteractive(flag: boolean): void {
    if (this.options.debug) {
      console.log(`[InputHandler] set-interactive: ${flag}`);
    }
    window.electronAPI.setInteractive(flag);
  }

  /**
   * 通过 IPC 通知主进程移动窗口。
   */
  private moveWindow(x: number, y: number): void {
    window.electronAPI.moveWindow(x, y);
  }

  /**
   * 通过 IPC 通知主进程弹出右键菜单。
   */
  private showContextMenu(): void {
    window.electronAPI.showContextMenu('default');
  }

  /**
   * 通过 IPC 通知主进程执行动作。
   */
  private executeAction(actionId: string): void {
    window.electronAPI.executeAction(actionId).then((result) => {
      if (this.options.debug) {
        console.log(`[InputHandler] Action "${actionId}" result:`, result);
      }
    });
  }

  // ─────────────────────────────────────────
  // PixiJS 事件处理器
  // ─────────────────────────────────────────

  /**
   * pointerdown 事件处理器。
   * 记录拖拽起始位置和时间。
   */
  private onPointerDown(e: PIXI.FederatedPointerEvent): void {
    if (this.destroyed) return;

    const position = this.getStagePosition(e);

    // 记录起始状态
    this.dragStartScreen = { x: e.screenX, y: e.screenY };
    this.dragStartWindow = { ...this.getWindowPosition() };
    this.mouseDownTime = Date.now();
    this.isDragging = false;

    // 通知状态机鼠标按下
    this.emitToStateMachine({ type: 'mousedown', position });

    if (this.options.debug) {
      console.log('[InputHandler] pointerdown at', position);
    }
  }

  /**
   * pointermove 事件处理器。
   * 当鼠标按下并移动超过阈值时进入拖拽模式。
   * 拖拽模式下通过 IPC 移动窗口。
   */
  private onPointerMove(e: PIXI.FederatedPointerEvent): void {
    if (this.destroyed) return;

    const position = this.getStagePosition(e);

    // 只有鼠标按下时才可能进入拖拽
    if (this.mouseDownTime > 0) {
      const dx = e.screenX - this.dragStartScreen.x;
      const dy = e.screenY - this.dragStartScreen.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (!this.isDragging && distance >= this.options.dragThreshold) {
        // 超过阈值，进入拖拽模式
        this.isDragging = true;

        // 切换穿透状态: 拖拽期间必须保持可交互
        this.setInteractive(true);

        // 通知状态机
        this.emitToStateMachine({ type: 'drag-start', position: this.dragStartScreen });

        if (this.options.debug) {
          console.log('[InputHandler] drag-start, distance:', distance.toFixed(1));
        }
      }

      if (this.isDragging) {
        // 计算新的窗口位置 = 拖拽起始窗口位置 + 鼠标偏移量
        const newX = this.dragStartWindow.x + dx;
        const newY = this.dragStartWindow.y + dy;

        // 通过 IPC 移动窗口
        this.moveWindow(newX, newY);

        // 通知状态机
        this.emitToStateMachine({
          type: 'drag-move',
          position: { x: e.screenX, y: e.screenY },
          delta: { x: dx, y: dy },
        });
      }
    }

    // 通知状态机鼠标移动
    this.emitToStateMachine({ type: 'mousemove', position });
  }

  /**
   * pointerup 事件处理器。
   * 结束拖拽或触发点击。
   */
  private onPointerUp(e: PIXI.FederatedPointerEvent): void {
    if (this.destroyed) return;
    this.handlePointerUp(e);
  }

  /**
   * pointerupoutside 事件处理器。
   * 当鼠标在窗口外松开时也需要结束拖拽。
   */
  private onPointerUpOutside(e: PIXI.FederatedPointerEvent): void {
    if (this.destroyed) return;
    this.handlePointerUp(e);
  }

  /**
   * pointerup 的统一处理逻辑。
   * 区分点击和拖拽结束。
   */
  private handlePointerUp(e: PIXI.FederatedPointerEvent): void {
    if (this.mouseDownTime === 0) return; // 没有对应的 mousedown

    const position = this.getStagePosition(e);
    const duration = Date.now() - this.mouseDownTime;
    const dx = e.screenX - this.dragStartScreen.x;
    const dy = e.screenY - this.dragStartScreen.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (this.isDragging) {
      // ─── 拖拽结束 ───
      this.isDragging = false;

      // 通知状态机
      this.emitToStateMachine({ type: 'drag-end', position });

      // 拖拽结束后延迟恢复穿透检测
      // 给一小段延迟让窗口稳定下来
      setTimeout(() => {
        if (!this.destroyed) {
          this.hitTestAtClientPosition(e.screenX, e.screenY);
        }
      }, 100);

      if (this.options.debug) {
        console.log('[InputHandler] drag-end at', position);
      }
    } else if (distance < this.options.dragThreshold && duration < this.options.clickMaxDuration) {
      // ─── 判定为点击 ───
      this.emitToStateMachine({ type: 'click', position });

      // 通过 IPC 通知主进程执行当前动作
      this.handleClickAction();

      if (this.options.debug) {
        console.log('[InputHandler] click at', position,
          `(distance: ${distance.toFixed(1)}, duration: ${duration}ms)`);
      }
    }

    // 通知状态机鼠标松开
    this.emitToStateMachine({ type: 'mouseup', position });

    // 重置状态
    this.mouseDownTime = 0;
    this.dragStartScreen = { x: 0, y: 0 };
  }

  /**
   * 右键点击处理器。
   * 阻止默认行为，通过 IPC 请求主进程弹出上下文菜单。
   */
  private onRightClick(e: PIXI.FederatedPointerEvent): void {
    if (this.destroyed) return;

    const position = this.getStagePosition(e);

    // 阻止浏览器默认右键菜单
    e.preventDefault();
    e.stopPropagation();

    // 通知状态机
    this.emitToStateMachine({ type: 'contextmenu', position });

    // 通过 IPC 请求主进程弹出菜单
    this.showContextMenu();

    if (this.options.debug) {
      console.log('[InputHandler] contextmenu at', position);
    }
  }

  // ─────────────────────────────────────────
  // 辅助方法
  // ─────────────────────────────────────────

  /**
   * 将 FederatedPointerEvent 的坐标转换为 stage 内的局部坐标。
   */
  private getStagePosition(e: PIXI.FederatedPointerEvent): Point {
    const local = e.getLocalPosition(this.app.stage);
    return { x: local.x, y: local.y };
  }

  /**
   * 获取当前 Electron 窗口的屏幕坐标。
   */
  private getWindowPosition(): Point {
    // 使用 screenLeft/screenTop（IE/标准）或 screenX/screenY
    return {
      x: window.screenLeft ?? window.screenX ?? 0,
      y: window.screenTop ?? window.screenY ?? 0,
    };
  }

  /**
   * 将输入事件分发给状态机。
   */
  private emitToStateMachine(event: InputEvent): void {
    this.stateMachine.handleInput(event);
  }

  /**
   * 处理点击动作。
   * 从配置中获取当前绑定的动作并通过 IPC 执行。
   */
  private handleClickAction(): void {
    // 从主进程获取动作列表，执行第一个绑定到 left-click 的动作
    window.electronAPI.getActions().then((actions) => {
      if (actions && actions.length > 0) {
        const clickAction = actions.find(a => a.trigger === 'left-click') ?? actions[0];
        if (clickAction) {
          this.executeAction(clickAction.id);
        }
      }
    }).catch((err) => {
      if (this.options.debug) {
        console.error('[InputHandler] Failed to get actions:', err);
      }
    });
  }
}
```

---

## 6. 状态机接口与集成

文件: `src/renderer/state/machine.ts`

InputHandler 通过 `stateMachine.handleInput(event)` 将事件分发给状态机。以下是状态机中与输入相关的部分（完整状态机由 `02-state-machine` 模块定义，此处仅展示输入接口）。

```typescript
import type { InputEvent } from '../engine/input';

/** 桌宠动画状态 */
export type AnimationState = 'idle' | 'walk' | 'drag' | 'fall' | 'click';

/** 状态机事件类型 */
export type StateEvent =
  | 'timeout'      // 待机超时 → 转为行走
  | 'edge'         // 到达屏幕边缘
  | 'mousedown'    // 鼠标按下
  | 'mouseup'      // 鼠标松开
  | 'click'        // 左键点击
  | 'landed'       // 重力下落着地
  | 'action-done'; // 动作执行完成

/** 状态转换表 */
const TRANSITIONS: Record<AnimationState, Partial<Record<StateEvent, AnimationState>>> = {
  idle:  { timeout: 'walk', mousedown: 'drag', click: 'click' },
  walk:  { edge: 'idle', mousedown: 'drag', click: 'click' },
  drag:  { mouseup: 'fall' },
  fall:  { landed: 'idle' },
  click: { action-done: 'idle' },
};

/**
 * 桌宠行为状态机。
 *
 * 接收 InputHandler 分发的输入事件，根据当前状态和转换表驱动状态变化。
 */
export class StateMachine {
  private state: AnimationState = 'idle';
  private listeners: Array<(oldState: AnimationState, newState: AnimationState) => void> = [];

  /** 获取当前状态 */
  getState(): AnimationState {
    return this.state;
  }

  /**
   * 处理 InputHandler 分发的输入事件。
   * 将 InputEvent 映射为 StateEvent 并触发状态转换。
   */
  handleInput(event: InputEvent): void {
    switch (event.type) {
      case 'mousedown':
        this.emit('mousedown');
        break;
      case 'mouseup':
        this.emit('mouseup');
        break;
      case 'click':
        this.emit('click');
        break;
      case 'drag-start':
        // drag-start 对应 mousedown 后超过阈值，已经通过 mousedown 事件处理
        break;
      case 'drag-end':
        // drag-end 对应 mouseup
        this.emit('mouseup');
        break;
      case 'contextmenu':
        // 右键菜单不触发状态转换
        break;
      // mousemove, drag-move, pointer-enter, pointer-leave 不触发状态转换
    }
  }

  /**
   * 发出一个状态事件，尝试触发状态转换。
   */
  emit(event: StateEvent): void {
    const next = TRANSITIONS[this.state]?.[event];
    if (next) {
      const oldState = this.state;
      this.state = next;

      // 通知所有监听器
      for (const listener of this.listeners) {
        listener(oldState, next);
      }
    }
  }

  /**
   * 注册状态变化监听器。
   */
  onStateChange(listener: (oldState: AnimationState, newState: AnimationState) => void): void {
    this.listeners.push(listener);
  }

  /**
   * 移除状态变化监听器。
   */
  offStateChange(listener: (oldState: AnimationState, newState: AnimationState) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }
}
```

---

## 7. 渲染进程入口集成

文件: `src/renderer/main.ts`

展示 InputHandler 如何在渲染进程入口处被实例化和集成。

```typescript
import * as PIXI from 'pixi.js';
import { InputHandler } from './engine/input';
import { StateMachine } from './state/machine';

async function main(): Promise<void> {
  // ─── 1. 创建 PixiJS 应用 ───
  const app = new PIXI.Application();

  await app.init({
    // 透明背景，桌宠窗口本身就是透明的
    backgroundAlpha: 0,
    // 窗口大小由 Electron 控制，PixiJS 填满整个视口
    resizeTo: window,
    // 开启事件系统
    eventMode: 'passive',
    // 使用 antialias 让边缘更平滑
    antialias: true,
    // 高 DPI 支持
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  // 将 canvas 添加到 DOM
  document.body.appendChild(app.canvas as HTMLCanvasElement);

  // 确保 canvas 背景透明
  (app.canvas as HTMLCanvasElement).style.background = 'transparent';

  // ─── 2. 创建桌宠渲染容器 ───
  const petContainer = new PIXI.Container();
  petContainer.label = 'pet-root';
  app.stage.addChild(petContainer);

  // ─── 3. 创建状态机 ───
  const stateMachine = new StateMachine();

  // ─── 4. 创建并配置 InputHandler ───
  const inputHandler = new InputHandler(app, stateMachine, {
    dragThreshold: 5,       // 5 像素内视为点击
    clickMaxDuration: 300,  // 300ms 内视为点击
    debug: process.env.NODE_ENV === 'development',
  });

  // 将桌宠容器设置给 InputHandler，用于 hitTest
  inputHandler.setPetContainer(petContainer);

  // ─── 5. 注册状态变化监听 ───
  stateMachine.onStateChange((oldState, newState) => {
    console.log(`[State] ${oldState} → ${newState}`);
    // TODO: 通知 RenderAdapter 切换动画
  });

  // ─── 6. 主渲染循环 ───
  app.ticker.add((ticker) => {
    // TODO: 更新物理引擎、动画适配器等
    const delta = ticker.deltaTime;
  });

  // ─── 7. 清理 ───
  window.addEventListener('beforeunload', () => {
    inputHandler.destroy();
    app.destroy(true);
  });
}

main().catch(console.error);
```

---

## 8. 拖拽实现详解

### 8.1 拖拽原理

透明无边框窗口无法使用 CSS `-webkit-app-region: drag`（因为它不支持精确控制和状态机集成）。因此采用 Electron 的 `BrowserWindow.setPosition(x, y)` 方式实现拖拽。

**核心思路：**

```
鼠标按下 (screenX, screenY)          记录: dragStartScreen, dragStartWindow
        │
        ▼
鼠标移动 (screenX, screenY)          计算: dx = screenX - dragStartScreen.x
        │                                         dy = screenY - dragStartScreen.y
        │                            新位置: newX = dragStartWindow.x + dx
        │                                         newY = dragStartWindow.y + dy
        ▼
IPC: moveWindow(newX, newY)          主进程: BrowserWindow.setPosition(newX, newY)
```

### 8.2 拖拽阈值

为避免用户只是轻微移动鼠标就被误判为拖拽，设置了 `dragThreshold`（默认 5 像素）。只有当鼠标累积移动距离超过此阈值时才进入拖拽模式。

```
拖拽判定流程:

  mousedown
      │
      ▼
  mousemove ──> 计算距离 ──> 距离 < 5px ? ──> 继续等待
      │                           │
      │                       距离 >= 5px
      │                           │
      │                           ▼
      │                     isDragging = true
      │                     emit('drag-start')
      │                           │
      ▼                           ▼
  后续 mousemove ──────────────> moveWindow(dx, dy)
      │
      ▼
  mouseup
      │
      isDragging ? ──> true  → emit('drag-end')
      │                   false → emit('click') （如果时间+距离均在阈值内）
```

### 8.3 拖拽时的视觉反馈

拖拽期间状态机进入 `drag` 状态，RenderAdapter 会切换到拖拽动画。以下是在 InputHandler 中可以集成的视觉反馈钩子：

```typescript
// 在 onPointerMove 中，当 isDragging 变为 true 时:
// 1. 状态机已切换到 'drag' 状态 → 动画自动切换
// 2. 可选: 给 canvas 添加拖拽中的 CSS 类名
private updateDragVisuals(active: boolean): void {
  const canvas = this.app.canvas as HTMLCanvasElement;
  if (active) {
    canvas.classList.add('pet-dragging');
  } else {
    canvas.classList.remove('pet-dragging');
  }
}
```

对应 CSS（`src/renderer/styles/main.css`）：

```css
/* 拖拽中: 可选的视觉反馈，例如略微降低透明度 */
canvas.pet-dragging {
  opacity: 0.85;
  transition: opacity 0.1s ease;
}

/* 非拖拽时恢复正常 */
canvas:not(.pet-dragging) {
  opacity: 1;
  transition: opacity 0.2s ease;
}
```

---

## 9. 左键点击实现详解

### 9.1 点击判定条件

左键点击需要同时满足以下两个条件：

| 条件 | 默认阈值 | 说明 |
|------|----------|------|
| 鼠标移动距离 | < 5px | mousedown 到 mouseup 之间的总位移 |
| 持续时间 | < 300ms | mousedown 到 mouseup 之间的时间差 |

两个条件缺一不可：

- 距离短 + 时间短 = **点击** → 触发动作
- 距离短 + 时间长 = **长按** → 不触发（可能是误操作后松开）
- 距离长 = **拖拽** → 进入拖拽流程

### 9.2 点击事件流

```
用户左键点击桌宠
      │
      ▼
InputHandler: pointerdown
      │  记录 dragStartScreen, mouseDownTime
      ▼
InputHandler: pointerup
      │  计算距离 = 2px (< 5px ✓)
      │  计算时间 = 80ms (< 300ms ✓)
      │  判定为 click
      ▼
      ├──> stateMachine.emit('click')     → 状态切换到 'click'，播放点击动画
      │
      └──> handleClickAction()
              │
              ▼
         electronAPI.getActions()
              │
              ▼
         找到 trigger === 'left-click' 的动作
              │
              ▼
         electronAPI.executeAction(actionId)
              │
              ▼
         主进程执行动作 (open-url / execute-cmd / show-message)
              │
              ▼
         动画播放完毕 → stateMachine.emit('action-done') → 回到 idle
```

---

## 10. 右键菜单实现详解

### 10.1 事件处理

右键菜单通过 PixiJS 的 `rightclick` 事件捕获。必须阻止浏览器默认的右键菜单。

```typescript
private onRightClick(e: PIXI.FederatedPointerEvent): void {
  // 1. 阻止浏览器默认菜单
  e.preventDefault();
  e.stopPropagation();

  // 2. 不触发状态转换（右键菜单不影响桌宠行为）

  // 3. 通过 IPC 让主进程弹出原生菜单
  this.showContextMenu();
}
```

### 10.2 菜单结构

```
┌────────────────────────────────────┐
│  <桌宠名称> - 设置                │
├────────────────────────────────────┤
│  ┌ 动作列表 ────────────────────┐ │
│  │  打开浏览器                   │ │
│  │  打开记事本                   │ │
│  │  弹窗消息                     │ │
│  └──────────────────────────────┘ │
├────────────────────────────────────┤
│  隐藏                             │
│  退出                             │
└────────────────────────────────────┘
```

### 10.3 菜单交互流程

```
用户右键点击桌宠
      │
      ▼
PixiJS rightclick 事件
      │
      ▼
InputHandler.onRightClick()
      │  阻止默认行为
      │  通知状态机 contextmenu 事件
      │
      ▼
IPC: showContextMenu('default')
      │
      ▼
主进程: ipcMain.handle(IPC_SHOW_CONTEXT_MENU)
      │  构建 Menu.buildFromTemplate()
      │  menu.popup({ window: petWindow })
      │
      ▼
用户选择菜单项
      │
      ├── "设置"    → 打开配置窗口
      ├── "动作X"   → 执行对应动作
      ├── "隐藏"    → 隐藏桌宠窗口
      └── "退出"    → 关闭所有窗口退出应用
```

---

## 11. 点击穿透实现详解

### 11.1 原理概述

桌宠窗口默认全屏透明，用户需要能"透过"窗口点击桌面上的其他图标。只有当鼠标悬停在桌宠的可见像素上时，窗口才接收鼠标事件。

核心机制：

```
Electron: BrowserWindow.setIgnoreMouseEvents(true, { forward: true })
                                                    ^^^^^^^^^^^^^^^
                                                    forward: true 的作用：
                                                    虽然忽略鼠标事件，
                                                    但仍然将 mousemove 坐标
                                                    转发给渲染进程用于 hitTest
```

### 11.2 穿透状态切换

```
正常模式（可交互）                    穿透模式（鼠标事件被忽略）
setIgnoreMouseEvents(false)          setIgnoreMouseEvents(true, { forward: true })
      │                                       │
      │  鼠标进入桌宠像素区域                    │  鼠标离开桌宠像素区域
      │                                       │
      ▼                                       ▼
PixiJS 正常处理事件                   mousemove 事件仍被转发
InputHandler 捕获事件                 canvas 级别监听器做 hitTest
                                      发现鼠标在桌宠上 → 切换到可交互模式
```

### 11.3 hitTest 流程

```
canvas mousemove 事件（由 Electron forward 机制触发）
      │
      ▼
hitTestAtClientPosition(clientX, clientY)
      │
      ▼
将 clientX/Y 转换为 PixiJS 局部坐标
      │
      ▼
app.renderer.events.hitTest({ x, y })
      │
      ▼
PixiJS EventSystem 遍历显示树
      │
      ├── 命中 petContainer 的某个子节点 → isOverPet = true
      │       │
      │       ▼
      │   !isPointerOverPet ? → 切换到可交互模式
      │       setInteractive(true)
      │       isPointerOverPet = true
      │
      └── 未命中任何桌宠像素 → isOverPet = false
              │
              ▼
          isPointerOverPet && !isDragging ? → 切换到穿透模式
              setInteractive(false)
              isPointerOverPet = false
```

### 11.4 重要注意事项

1. **拖拽期间不切换穿透**: 当 `isDragging === true` 时，即使鼠标移出桌宠像素区域也不切换穿透模式。否则窗口会丢失鼠标捕获，导致拖拽中断。

2. **hitTest 的坐标转换**: Electron forward 传来的坐标是屏幕坐标，需要通过 `getBoundingClientRect()` 转换为 canvas 内的局部坐标，再交给 PixiJS 的 hitTest。

3. **PixiJS hitTest 精度**: PixiJS 默认使用矩形包围盒进行 hitTest。如果需要像素级精度（例如不规则形状的桌宠），需要在 Sprite 上设置 `hitArea` 为自定义的像素遮罩，或使用 `PIXI.Graphics` 构建精确的碰撞区域。

---

## 12. 像素级 hitTest 增强

默认的 PixiJS hitTest 使用矩形包围盒，对于不规则形状的桌宠可能不够精确。以下提供像素级 hitTest 的增强实现。

### 12.1 使用 hitArea 配合自定义形状

```typescript
import * as PIXI from 'pixi.js';

/**
 * 为桌宠 Sprite 设置像素级 hitArea。
 * 基于纹理的 alpha 通道生成碰撞区域。
 *
 * @param sprite - 桌宠的 AnimatedSprite 或 Sprite
 * @param threshold - alpha 阈值 (0-255)，低于此值的像素视为透明
 */
export function setupPixelHitArea(sprite: PIXI.AnimatedSprite | PIXI.Sprite, threshold = 128): void {
  const texture = sprite.texture;
  if (!texture || !texture.source) return;

  const source = texture.source.resource as HTMLImageElement | ImageBitmap;
  if (!source) return;

  // 创建临时 canvas 提取像素数据
  const canvas = document.createElement('canvas');
  const width = texture.width;
  const height = texture.height;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 绘制纹理到临时 canvas
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);

  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    // 创建 Polygon hitArea：扫描每行，生成不透明像素的轮廓
    // 简化方案：直接使用 ImageBitmap 作为 hitArea 的数据源
    // PixiJS 8 支持通过自定义 contains 方法实现精确碰撞

    sprite.hitArea = {
      contains(x: number, y: number): boolean {
        const px = Math.floor(x);
        const py = Math.floor(y);
        if (px < 0 || py < 0 || px >= width || py >= height) return false;

        // 读取该像素的 alpha 值
        const alphaIndex = (py * width + px) * 4 + 3;
        return pixels[alphaIndex] >= threshold;
      },
    } as PIXI.HitArea;
  } catch (e) {
    // 跨域限制可能导致 getImageData 失败
    console.warn('[InputHandler] Cannot setup pixel hitArea (CORS?), falling back to bounds:', e);
  }
}
```

### 12.2 在 main.ts 中使用

```typescript
import { setupPixelHitArea } from './engine/input';

// 在加载 sprite sheet 之后:
const animatedSprite = new PIXI.AnimatedSprite(textures);
setupPixelHitArea(animatedSprite, 128);
petContainer.addChild(animatedSprite);
```

---

## 13. 完整事件流时序图

### 13.1 拖拽时序

```
Renderer                    IPC                     Main
    │                         │                        │
    │ pointerdown             │                        │
    │ (记录起始位置)           │                        │
    │                         │                        │
    │ pointermove             │                        │
    │ (距离 > threshold)      │                        │
    │ isDragging = true       │                        │
    │ stateMachine            │                        │
    │  .emit('mousedown')     │                        │
    │                         │                        │
    │ pointermove             │  moveWindow(newX, newY)│
    │ (计算新位置)             │ ─────────────────────> │ setPosition(x,y)
    │                         │                        │
    │ pointermove             │  moveWindow(newX, newY)│
    │ (持续更新)               │ ─────────────────────> │ setPosition(x,y)
    │                         │                        │
    │ pointerup               │                        │
    │ isDragging = false      │                        │
    │ stateMachine            │                        │
    │  .emit('mouseup')       │                        │
    │                         │                        │
```

### 13.2 左键点击时序

```
Renderer                    IPC                     Main
    │                         │                        │
    │ pointerdown             │                        │
    │ pointerup               │                        │
    │ (距离 < threshold       │                        │
    │  && 时间 < maxDuration) │                        │
    │ 判定为 click            │                        │
    │ stateMachine            │                        │
    │  .emit('click')         │                        │
    │                         │                        │
    │ getActions()            │                        │
    │ ───────────────────────────────────────────────> │
    │ <─────────────────────────────────────────────── │ actions[]
    │                         │                        │
    │ executeAction(id)       │                        │
    │ ───────────────────────────────────────────────> │
    │                         │                        │ 执行动作
    │                         │                        │ (open-url / cmd / msg)
    │ <─────────────────────────────────────────────── │ { success: true }
    │                         │                        │
    │ stateMachine            │                        │
    │  .emit('action-done')   │                        │
```

### 13.3 点击穿透时序

```
Renderer                    IPC                     Main
    │                         │                        │
    │ ─── 默认: 穿透模式 ───  │                        │
    │                         │                        │
    │ canvas mousemove        │                        │
    │ (forward 转发)          │                        │
    │ hitTest → 在桌宠像素上   │                        │
    │                         │  set-interactive(true) │
    │ ───────────────────────────────────────────────> │
    │                         │                        │
    │                         │  setIgnoreMouseEvents  │
    │                         │       (false)          │
    │ ─── 可交互模式 ───       │                        │
    │                         │                        │
    │ canvas mousemove        │                        │
    │ (forward 转发)          │                        │
    │ hitTest → 不在桌宠像素上  │                        │
    │                         │  set-interactive(false)│
    │ ───────────────────────────────────────────────> │
    │                         │                        │
    │                         │  setIgnoreMouseEvents  │
    │                         │  (true, {forward:true})│
    │ ─── 穿透模式 ───         │                        │
```

---

## 14. 主进程窗口配置

文件: `src/main/pet-window.ts`

主进程中创建透明窗口的完整配置，确保与 InputHandler 配合工作。

```typescript
import { BrowserWindow, screen } from 'electron';
import path from 'path';

/**
 * 创建桌宠透明窗口。
 *
 * 关键配置项说明:
 * - transparent: true          — 窗口背景透明
 * - frame: false               — 无边框
 * - alwaysOnTop: true          — 始终置顶
 * - hasShadow: false           — 去除窗口阴影
 * - skipTaskbar: true          — 不在任务栏显示
 * - resizable: false           — 禁止调整大小
 * - setIgnoreMouseEvents       — 默认开启穿透（由渲染进程动态控制）
 */
export function createPetWindow(): BrowserWindow {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: 200,
    height: 200,
    x: screenWidth - 250,
    y: screenHeight - 250,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,         // 由 InputHandler 通过 setPosition 控制移动
    focusable: true,        // 需要能接收键盘事件（未来扩展）
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,       // preload 需要访问 Node API
    },
  });

  // 设置窗口层级: 高于普通窗口，但低于全屏应用
  win.setAlwaysOnTop(true, 'screen-saver');

  // 默认开启穿透模式（forward: true 允许渲染进程接收 mousemove 坐标）
  win.setIgnoreMouseEvents(true, { forward: true });

  // 加载渲染进程页面
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // 开发模式下打开 DevTools
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}
```

---

## 15. 错误处理与边界情况

### 15.1 InputHandler 的防御性编程

```typescript
// 在 InputHandler 中需要处理的边界情况:

// 1. 窗口失焦时的拖拽中断
//    如果用户在拖拽过程中切换了窗口焦点，需要强制结束拖拽
private onWindowBlur = (): void => {
  if (this.isDragging) {
    this.isDragging = false;
    this.mouseDownTime = 0;
    this.emitToStateMachine({ type: 'drag-end', position: { x: 0, y: 0 } });
  }
};

// 在 attachListeners 中添加:
// window.addEventListener('blur', this.onWindowBlur);

// 2. 鼠标离开窗口时的处理
//    pointerupoutside 事件已经覆盖了这个场景

// 3. 多指触控（虽然桌宠场景不太可能）
//    只处理主指针（button === 0），忽略其他触摸点

// 4. PixiJS EventSystem 未初始化
//    在构造函数中确保 app.renderer.events 存在
```

### 15.2 IPC 超时处理

```typescript
/**
 * 带超时的 IPC 调用封装。
 * 防止主进程无响应时渲染进程永久挂起。
 */
async function invokeWithTimeout<T>(
  channel: string,
  timeoutMs: number = 3000,
  ...args: any[]
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`IPC timeout: ${channel} (${timeoutMs}ms)`));
    }, timeoutMs);

    (window.electronAPI as any)[channel](...args)
      .then((result: T) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
```

---

## 16. 模块文件清单

| 文件路径 | 职责 |
|----------|------|
| `src/shared/ipc-channels.ts` | IPC 通道名称常量定义 |
| `src/preload/index.ts` | Preload 桥接层，暴露安全 API 给渲染进程 |
| `src/renderer/types/electron.d.ts` | `window.electronAPI` 类型声明 |
| `src/renderer/engine/input.ts` | **核心模块** — InputHandler 类 |
| `src/renderer/state/machine.ts` | 状态机（输入接口部分） |
| `src/renderer/main.ts` | 渲染进程入口，集成 InputHandler |
| `src/renderer/styles/main.css` | 拖拽视觉反馈样式 |
| `src/main/ipc.ts` | 主进程 IPC 处理器注册 |
| `src/main/pet-window.ts` | 主进程透明窗口创建配置 |

---

## 17. 测试要点

| 测试场景 | 预期行为 |
|----------|----------|
| 短按桌宠（< 5px, < 300ms） | 触发 click 事件，执行动作 |
| 长按桌宠（< 5px, > 300ms） | 不触发 click，不触发 drag |
| 拖拽桌宠（>= 5px） | 窗口跟随鼠标移动，状态机进入 drag |
| 拖拽后释放 | 状态机进入 fall，重力下落 |
| 右键点击桌宠 | 弹出原生菜单，不触发状态转换 |
| 鼠标悬停在桌宠像素上 | 取消穿透，可以交互 |
| 鼠标离开桌宠像素区域 | 恢复穿透，可点击桌面 |
| 拖拽中鼠标移出桌宠区域 | 不切换穿透（保持拖拽） |
| 拖拽中切换窗口焦点 | 强制结束拖拽 |
| 快速连续点击 | 每次都触发 click 事件 |
| 桌宠窗口外右键 | 不触发（事件被 PixiJS stage 捕获） |
