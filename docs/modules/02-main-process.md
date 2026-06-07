# 02 - 主进程 + 透明窗口模块 设计实现文档

> 项目: Desk-Idoll
> 模块: Main Process, Pet Window, IPC, Preload, Config, Action Executor, Config Window
> 技术栈: Electron + TypeScript + electron-vite
> 日期: 2026-06-07

---

## 目录

1. [src/main/index.ts -- 主进程入口](#1-srcmainindexts----主进程入口)
2. [src/main/pet-window.ts -- 桌宠窗口管理](#2-srcmainpet-windowts----桌宠窗口管理)
3. [src/main/ipc.ts -- IPC 通信注册](#3-srcmainipcts----ipc-通信注册)
4. [src/preload/index.ts -- Preload 脚本](#4-srcpreloadindexts----preload-脚本)
5. [src/main/config-manager.ts -- 配置管理](#5-srcmainconfig-managerts----配置管理)
6. [src/main/action-executor.ts -- 动作执行器](#6-srcmainaction-executorts----动作执行器)
7. [src/main/config-window.ts -- 配置窗口管理](#7-srcmainconfig-windowts----配置窗口管理)

---

## 前置依赖

文档中涉及的 npm 包:

| 包名 | 版本 | 用途 |
|------|------|------|
| `electron` | ^33.x | 桌面应用框架 |
| `electron-store` | ^8.x | 配置持久化 |
| `electron-vite` | ^2.x | Vite 集成构建 |
| `typescript` | ^5.x | 类型系统 |
| `vite` | ^6.x | 构建工具 |

共享类型定义参见 `src/shared/types.ts`:

```typescript
// src/shared/types.ts

/** 桌宠配置 */
export interface PetConfig {
  id: string;
  name: string;
  modelType: 'sprite-sheet' | 'live2d';
  modelPath: string;
  size: { width: number; height: number };
  position: { x: number; y: number };
  opacity: number;
  zIndex: number;
  animations: AnimationConfig;
  actions: PetAction[];
  behavior: BehaviorConfig;
}

/** 动画配置 (Sprite Sheet 模式) */
export interface SpriteAnimationConfig {
  type: 'sprite-sheet';
  frameWidth: number;
  frameHeight: number;
  fps: number;
  states: Record<string, FrameRange>;
}

/** 动画配置 (Live2D 模式) */
export interface Live2DAnimationConfig {
  type: 'live2d';
  modelPath: string;
  motions: Record<string, string>;
  expressions: Record<string, string>;
  followMouse: boolean;
}

/** 统一动画配置 */
export type AnimationConfig = SpriteAnimationConfig | Live2DAnimationConfig;

/** 帧范围 */
export interface FrameRange {
  start: number;
  end: number;
  loop: boolean;
}

/** 自定义动作 */
export interface PetAction {
  id: string;
  trigger: 'left-click';
  type: 'open-url' | 'execute-cmd' | 'show-message';
  payload: string;
  name: string;
  confirmBeforeExecute: boolean;
}

/** 行为配置 */
export interface BehaviorConfig {
  walkSpeed: number;
  gravity: boolean;
  screenEdgeBehavior: 'bounce' | 'wrap' | 'stop';
  idleTimeout: number;
  randomWalk: boolean;
}

/** 完整应用配置 */
export interface AppConfig {
  pets: PetConfig[];
  globalSettings: {
    language: string;
    autoStart: boolean;
    checkUpdate: boolean;
  };
}

/** 动作执行结果 */
export interface ActionResult {
  success: boolean;
  cancelled?: boolean;
  error?: string;
}
```

共享 IPC 通道定义参见 `src/shared/ipc-channels.ts`:

```typescript
// src/shared/ipc-channels.ts

/** IPC 通道名称常量 */
export const IPC_CHANNELS = {
  // 渲染进程 → 主进程 (invoke)
  SET_INTERACTIVE: 'set-interactive',
  MOVE_WINDOW: 'move-window',
  GET_CONFIG: 'get-config',
  SAVE_CONFIG: 'save-config',
  EXECUTE_ACTION: 'execute-action',
  OPEN_CONFIG_WINDOW: 'open-config-window',
  CLOSE_CONFIG_WINDOW: 'close-config-window',
  GET_ALL_PETS: 'get-all-pets',
  CREATE_PET: 'create-pet',
  DELETE_PET: 'delete-pet',
  QUIT_APP: 'quit-app',

  // 主进程 → 渲染进程 (send)
  CONFIG_CHANGED: 'config-changed',
  ACTION_RESULT: 'action-result',
} as const;
```

---

## 1. src/main/index.ts -- 主进程入口

主进程入口文件负责 Electron app 初始化、单实例锁、生命周期事件处理、以及协调各子模块的启动。

```typescript
// src/main/index.ts

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { PetWindowManager } from './pet-window';
import { ConfigWindowManager } from './config-window';
import { ConfigManager } from './config-manager';
import { ActionExecutor } from './action-executor';
import { registerAllIpcHandlers } from './ipc';

// ============================================================
// 1. 单实例锁
// ============================================================

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 如果已有实例运行，直接退出
  app.quit();
} else {
  // 当第二个实例试图启动时，聚焦到已有窗口
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    const mainWindow = PetWindowManager.getFirstWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  // ============================================================
  // 2. 管理器实例（延迟初始化，在 app.ready 后创建）
  // ============================================================

  let configManager: ConfigManager;
  let petWindowManager: PetWindowManager;
  let configWindowManager: ConfigWindowManager;
  let actionExecutor: ActionExecutor;

  // ============================================================
  // 3. app 生命周期事件处理
  // ============================================================

  /**
   * app.whenReady -- 应用初始化完成
   * 创建所有管理器、注册 IPC、启动默认桌宠窗口
   */
  app.whenReady().then(async () => {
    // 3.1 初始化配置管理器
    configManager = new ConfigManager();

    // 3.2 初始化动作执行器
    actionExecutor = new ActionExecutor();

    // 3.3 初始化窗口管理器
    petWindowManager = new PetWindowManager(configManager);
    configWindowManager = new ConfigWindowManager(configManager);

    // 3.4 注册所有 IPC 处理函数
    registerAllIpcHandlers({
      petWindowManager,
      configWindowManager,
      configManager,
      actionExecutor,
    });

    // 3.5 创建默认桌宠窗口（如果配置中有桌宠）
    const config = configManager.getConfig();
    if (config.pets.length > 0) {
      for (const petConfig of config.pets) {
        await petWindowManager.createPetWindow(petConfig);
      }
    } else {
      // 首次启动，没有桌宠配置，创建一个默认桌宠
      const defaultPet = configManager.createDefaultPet();
      await petWindowManager.createPetWindow(defaultPet);
    }

    // 3.6 macOS 特殊处理：点击 dock 图标时重新创建窗口
    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const defaultPet = configManager.createDefaultPet();
        await petWindowManager.createPetWindow(defaultPet);
      }
    });
  });

  /**
   * window-all-closed -- 所有窗口关闭
   * Windows/Linux 上退出应用，macOS 上保持运行
   */
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  /**
   * before-quit -- 应用退出前清理
   * 保存当前所有桌宠窗口的位置到配置
   */
  app.on('before-quit', () => {
    if (petWindowManager) {
      petWindowManager.saveAllWindowPositions();
    }
  });

  /**
   * 阻止新窗口的默认创建行为（防止恶意链接打开新窗口）
   */
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });
  });
}
```

### 设计要点

| 要点 | 说明 |
|------|------|
| **单实例锁** | `requestSingleInstanceLock()` 确保只有一个应用实例运行。第二个实例会立刻退出，同时触发已有实例的 `second-instance` 事件来聚焦窗口 |
| **延迟初始化** | 所有管理器在 `app.whenReady()` 内创建，确保 Electron 运行时已就绪 |
| **before-quit** | 退出前保存桌宠位置，避免用户移动桌宠后未保存位置 |
| **web-contents-created** | 安全钩子，阻止渲染进程打开任意新窗口 |

---

## 2. src/main/pet-window.ts -- 桌宠窗口管理

桌宠窗口管理器负责创建透明无边框窗口、管理多个桌宠实例、实现点击穿透、处理窗口拖拽移动。

```typescript
// src/main/pet-window.ts

import { BrowserWindow, screen, ipcMain } from 'electron';
import path from 'node:path';
import { ConfigManager } from './config-manager';
import type { PetConfig } from '../shared/types';

/**
 * 单个桌宠窗口的运行时数据
 */
interface PetWindowEntry {
  window: BrowserWindow;
  config: PetConfig;
  isDragging: boolean;
  dragOffset: { x: number; y: number };
}

export class PetWindowManager {
  /** 所有活跃的桌宠窗口 Map<petId, PetWindowEntry> */
  private windows: Map<string, PetWindowEntry> = new Map();

  /** 配置管理器引用 */
  private configManager: ConfigManager;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  // ============================================================
  // 1. 创建桌宠窗口
  // ============================================================

  /**
   * 创建一个透明无边框桌宠窗口
   * @param petConfig 桌宠配置
   * @returns 创建的 BrowserWindow 实例
   */
  async createPetWindow(petConfig: PetConfig): Promise<BrowserWindow> {
    // 如果该桌宠窗口已存在，聚焦并返回
    if (this.windows.has(petConfig.id)) {
      const entry = this.windows.get(petConfig.id)!;
      entry.window.focus();
      return entry.window;
    }

    // 获取主显示器的工作区域（用于窗口定位）
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workAreaSize;

    // 窗口大小：使用配置中的尺寸，加上少量边距确保渲染区域足够
    const windowWidth = petConfig.size.width;
    const windowHeight = petConfig.size.height;

    // 窗口初始位置：使用配置中的位置，或默认居中于屏幕底部
    const windowX = petConfig.position.x ?? Math.floor((workArea.width - windowWidth) / 2);
    const windowY = petConfig.position.y ?? workArea.height - windowHeight;

    // 创建 BrowserWindow -- 完整的透明窗口参数
    const petWindow = new BrowserWindow({
      // ---- 窗口尺寸 ----
      width: windowWidth,
      height: windowHeight,
      minWidth: 64,
      minHeight: 64,

      // ---- 位置 ----
      x: windowX,
      y: windowY,

      // ---- 透明 + 无边框（核心配置） ----
      transparent: true,       // 窗口背景完全透明
      frame: false,            // 无边框（无标题栏、无窗口控件）
      hasShadow: false,        // 去除窗口阴影

      // ---- 桌宠行为配置 ----
      alwaysOnTop: true,       // 始终在最前
      skipTaskbar: true,       // 不在任务栏显示
      resizable: false,        // 不可调整大小
      movable: false,          // 禁止系统级拖拽（我们自己处理拖拽）
      focusable: true,         // 需要可聚焦才能接收鼠标事件

      // ---- 窗口外观 ----
      type: 'toolbar',         // 工具栏窗口类型，进一步减少系统 UI 干预
      show: false,             // 先隐藏，等内容加载完成后再显示

      // ---- Web 偏好设置 ----
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,        // 开启上下文隔离
        nodeIntegration: false,        // 禁止渲染进程直接使用 Node.js
        sandbox: true,                 // 启用沙箱
        devTools: !app.isPackaged,     // 开发模式允许 DevTools
      },
    });

    // ---- 设置窗口层级 ----
    // zIndex 越大越在前面，映射到 Electron 的窗口层级
    if (petConfig.zIndex > 0) {
      petWindow.setAlwaysOnTop(true, 'screen-saver');
    }

    // ---- 设置窗口透明度 ----
    petWindow.setOpacity(petConfig.opacity);

    // ---- 默认开启点击穿透 ----
    // forward: true 让鼠标事件可以被转发（配合 forward 事件实现穿透检测）
    petWindow.setIgnoreMouseEvents(true, { forward: true });

    // ---- 加载渲染进程页面 ----
    if (process.env.ELECTRON_RENDERER_URL) {
      // electron-vite 开发模式下的 URL
      await petWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/src/renderer/index.html`);
    } else {
      // 生产模式下加载打包后的文件
      await petWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    // ---- 窗口加载完成后显示 ----
    petWindow.once('ready-to-show', () => {
      petWindow.show();
      petWindow.setOpacity(petConfig.opacity);
    });

    // ---- 注册窗口事件 ----
    this.setupWindowEvents(petWindow, petConfig);

    // ---- 存储窗口记录 ----
    const entry: PetWindowEntry = {
      window: petWindow,
      config: petConfig,
      isDragging: false,
      dragOffset: { x: 0, y: 0 },
    };
    this.windows.set(petConfig.id, entry);

    return petWindow;
  }

  // ============================================================
  // 2. 点击穿透控制
  // ============================================================

  /**
   * 设置桌宠窗口的交互状态（是否穿透鼠标事件）
   * @param petId 桌宠 ID
   * @param interactive true = 捕获鼠标（不穿透），false = 穿透鼠标
   */
  setInteractive(petId: string, interactive: boolean): void {
    const entry = this.windows.get(petId);
    if (!entry) return;

    const { window } = entry;

    if (interactive) {
      // 进入交互模式：捕获鼠标事件，不穿透
      window.setIgnoreMouseEvents(false);
    } else {
      // 退出交互模式：忽略鼠标事件，但转发以检测进入/离开
      window.setIgnoreMouseEvents(true, { forward: true });
    }
  }

  /**
   * 为指定窗口设置交互状态（通过窗口实例）
   * 供 IPC 直接使用，不依赖 petId
   */
  setInteractiveByWindow(window: BrowserWindow, interactive: boolean): void {
    if (interactive) {
      window.setIgnoreMouseEvents(false);
    } else {
      window.setIgnoreMouseEvents(true, { forward: true });
    }
  }

  // ============================================================
  // 3. 窗口位置管理
  // ============================================================

  /**
   * 移动桌宠窗口到指定位置
   * @param petId 桌宠 ID
   * @param x 目标 X 坐标（屏幕绝对坐标）
   * @param y 目标 Y 坐标（屏幕绝对坐标）
   */
  moveWindow(petId: string, x: number, y: number): void {
    const entry = this.windows.get(petId);
    if (!entry) return;

    // 获取窗口当前尺寸
    const [width, height] = entry.window.getSize();

    // 获取所有显示器的边界，限制窗口在可见范围内
    const displays = screen.getAllDisplays();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const display of displays) {
      const { x: dx, y: dy, width: dw, height: dh } = display.bounds;
      minX = Math.min(minX, dx);
      minY = Math.min(minY, dy);
      maxX = Math.max(maxX, dx + dw);
      maxY = Math.max(maxY, dy + dh);
    }

    // 限制坐标在屏幕范围内
    const clampedX = Math.max(minX, Math.min(x, maxX - width));
    const clampedY = Math.max(minY, Math.min(y, maxY - height));

    entry.window.setPosition(clampedX, clampedY);
  }

  /**
   * 保存所有桌宠窗口的当前位置到配置
   */
  saveAllWindowPositions(): void {
    for (const [petId, entry] of this.windows) {
      const [x, y] = entry.window.getPosition();
      this.configManager.updatePetConfig(petId, {
        position: { x, y },
      });
    }
  }

  // ============================================================
  // 4. 窗口生命周期管理
  // ============================================================

  /**
   * 获取指定桌宠的窗口实例
   */
  getWindow(petId: string): BrowserWindow | undefined {
    return this.windows.get(petId)?.window;
  }

  /**
   * 获取第一个桌宠窗口（用于单实例聚焦）
   */
  static getFirstWindow(): BrowserWindow | undefined {
    const allWindows = BrowserWindow.getAllWindows();
    return allWindows.length > 0 ? allWindows[0] : undefined;
  }

  /**
   * 获取所有桌宠窗口 ID 列表
   */
  getAllPetIds(): string[] {
    return Array.from(this.windows.keys());
  }

  /**
   * 销毁指定桌宠窗口
   */
  destroyPetWindow(petId: string): void {
    const entry = this.windows.get(petId);
    if (!entry) return;

    // 保存最终位置
    const [x, y] = entry.window.getPosition();
    this.configManager.updatePetConfig(petId, {
      position: { x, y },
    });

    // 关闭窗口
    if (!entry.window.isDestroyed()) {
      entry.window.destroy();
    }

    // 从 Map 中移除
    this.windows.delete(petId);
  }

  /**
   * 销毁所有桌宠窗口
   */
  destroyAll(): void {
    for (const petId of this.windows.keys()) {
      this.destroyPetWindow(petId);
    }
  }

  /**
   * 隐藏所有桌宠窗口
   */
  hideAll(): void {
    for (const entry of this.windows.values()) {
      entry.window.hide();
    }
  }

  /**
   * 显示所有桌宠窗口
   */
  showAll(): void {
    for (const entry of this.windows.values()) {
      entry.window.show();
    }
  }

  // ============================================================
  // 5. 内部：窗口事件绑定
  // ============================================================

  /**
   * 为桌宠窗口绑定拖拽、生命周期等事件
   */
  private setupWindowEvents(petWindow: BrowserWindow, petConfig: PetConfig): void {
    // ---- 窗口关闭时清理 ----
    petWindow.on('closed', () => {
      this.windows.delete(petConfig.id);
    });

    // ---- 窗口移动时同步位置到配置（节流：每 500ms 保存一次） ----
    let saveTimeout: ReturnType<typeof setTimeout> | null = null;
    petWindow.on('move', () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        const [x, y] = petWindow.getPosition();
        this.configManager.updatePetConfig(petConfig.id, {
          position: { x, y },
        });
      }, 500);
    });
  }

  // ============================================================
  // 6. 获取桌宠配置
  // ============================================================

  /**
   * 获取指定桌宠的运行时配置
   */
  getPetConfig(petId: string): PetConfig | undefined {
    return this.windows.get(petId)?.config;
  }

  /**
   * 更新指定桌宠的运行时配置引用
   */
  updatePetConfigRef(petId: string, config: PetConfig): void {
    const entry = this.windows.get(petId);
    if (entry) {
      entry.config = config;
    }
  }
}
```

### 设计要点

| 要点 | 说明 |
|------|------|
| **transparent + frame + hasShadow** | 三者配合实现完全透明的无边框窗口，是桌宠窗口的核心配置 |
| **alwaysOnTop + skipTaskbar** | 确保桌宠始终在最前且不干扰任务栏 |
| **setIgnoreMouseEvents + forward** | `forward: true` 让主进程可以收到鼠标坐标信息，配合渲染进程的 `mouseenter/mouseleave` 实现精准的点击穿透 |
| **movable: false** | 禁用系统拖拽，由应用自己处理拖拽逻辑（渲染进程鼠标事件 → IPC → moveWindow） |
| **多显示器支持** | `moveWindow` 会考虑所有显示器的边界，防止窗口拖到屏幕外 |
| **位置节流保存** | 窗口移动时不会每次 pixel 都写配置，而是 500ms 节流一次 |

---

## 3. src/main/ipc.ts -- IPC 通信注册

IPC 模块负责注册主进程所有 IPC 通道的处理函数，连接渲染进程请求与主进程各子模块。

```typescript
// src/main/ipc.ts

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import { PetWindowManager } from './pet-window';
import { ConfigWindowManager } from './config-window';
import { ConfigManager } from './config-manager';
import { ActionExecutor } from './action-executor';
import type { PetAction, PetConfig, AppConfig, ActionResult } from '../shared/types';

/**
 * IPC 处理器所需的依赖接口
 */
export interface IpcHandlerDeps {
  petWindowManager: PetWindowManager;
  configWindowManager: ConfigWindowManager;
  configManager: ConfigManager;
  actionExecutor: ActionExecutor;
}

/**
 * 注册所有 IPC 通道的处理函数
 */
export function registerAllIpcHandlers(deps: IpcHandlerDeps): void {
  const { petWindowManager, configWindowManager, configManager, actionExecutor } = deps;

  // ============================================================
  // 1. set-interactive -- 切换点击穿透状态
  // ============================================================
  // 渲染进程在鼠标进入/离开桌宠像素区域时调用
  // value: true = 捕获鼠标（不穿透），false = 穿透鼠标

  ipcMain.on(IPC_CHANNELS.SET_INTERACTIVE, (event, value: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      petWindowManager.setInteractiveByWindow(win, value);
    }
  });

  // ============================================================
  // 2. move-window -- 拖拽移动桌宠窗口
  // ============================================================
  // 渲染进程在鼠标拖拽时调用，传入鼠标屏幕坐标和偏移量

  ipcMain.on(IPC_CHANNELS.MOVE_WINDOW, (_event, args: { x: number; y: number }) => {
    // 获取发送此消息的窗口
    const win = BrowserWindow.fromWebContents(_event.sender);
    if (!win || win.isDestroyed()) return;

    // 通过窗口实例找到对应的 petId
    const petId = findPetIdByWindow(petWindowManager, win);
    if (petId) {
      petWindowManager.moveWindow(petId, args.x, args.y);
    }
  });

  // ============================================================
  // 3. get-config -- 获取完整配置
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.GET_CONFIG, async (): Promise<AppConfig> => {
    return configManager.getConfig();
  });

  // ============================================================
  // 4. save-config -- 保存完整配置
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.SAVE_CONFIG, async (_event, config: AppConfig): Promise<void> => {
    configManager.setConfig(config);
    // 通知所有桌宠窗口配置已变更
    notifyConfigChanged(petWindowManager, config);
  });

  // ============================================================
  // 5. execute-action -- 执行自定义动作
  // ============================================================

  ipcMain.handle(
    IPC_CHANNELS.EXECUTE_ACTION,
    async (_event, action: PetAction): Promise<ActionResult> => {
      return actionExecutor.execute(action);
    }
  );

  // ============================================================
  // 6. open-config-window -- 打开配置窗口
  // ============================================================

  ipcMain.handle(
    IPC_CHANNELS.OPEN_CONFIG_WINDOW,
    async (_event, petId?: string): Promise<void> => {
      await configWindowManager.show(petId);
    }
  );

  // ============================================================
  // 7. close-config-window -- 关闭配置窗口
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.CLOSE_CONFIG_WINDOW, async (): Promise<void> => {
    configWindowManager.hide();
  });

  // ============================================================
  // 8. get-all-pets -- 获取所有桌宠配置列表
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.GET_ALL_PETS, async (): Promise<PetConfig[]> => {
    return configManager.getConfig().pets;
  });

  // ============================================================
  // 9. create-pet -- 创建新桌宠
  // ============================================================

  ipcMain.handle(
    IPC_CHANNELS.CREATE_PET,
    async (_event, petConfig: PetConfig): Promise<string> => {
      // 保存配置
      configManager.addPet(petConfig);
      // 创建窗口
      await petWindowManager.createPetWindow(petConfig);
      return petConfig.id;
    }
  );

  // ============================================================
  // 10. delete-pet -- 删除桌宠
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.DELETE_PET, async (_event, petId: string): Promise<void> => {
    petWindowManager.destroyPetWindow(petId);
    configManager.removePet(petId);
  });

  // ============================================================
  // 11. quit-app -- 退出应用
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.QUIT_APP, async (): Promise<void> => {
    petWindowManager.saveAllWindowPositions();
    const { app } = require('electron');
    app.quit();
  });
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 通过 BrowserWindow 实例反查 petId
 */
function findPetIdByWindow(manager: PetWindowManager, win: BrowserWindow): string | null {
  for (const petId of manager.getAllPetIds()) {
    if (manager.getWindow(petId) === win) {
      return petId;
    }
  }
  return null;
}

/**
 * 通知所有桌宠窗口配置已变更
 */
function notifyConfigChanged(manager: PetWindowManager, config: AppConfig): void {
  for (const petId of manager.getAllPetIds()) {
    const win = manager.getWindow(petId);
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.CONFIG_CHANGED, config);
    }
  }
}
```

### 设计要点

| 要点 | 说明 |
|------|------|
| **ipcMain.on vs ipcMain.handle** | `on` 用于不需要返回值的通道（fire-and-forget，如 move-window），`handle` 用于需要返回值的通道（如 get-config，返回 Promise） |
| **BrowserWindow.fromWebContents** | 通过事件发送者的 WebContents 反查 BrowserWindow 实例，不需要渲染进程传 petId |
| **双向通信** | 主进程 → 渲染进程使用 `webContents.send`，渲染进程 → 主进程使用 `ipcRenderer.invoke` 或 `ipcRenderer.send` |
| **安全隔离** | 所有敏感操作（CMD 执行、文件读写）都在主进程完成，渲染进程无法直接访问 Node.js API |

---

## 4. src/preload/index.ts -- Preload 脚本

Preload 脚本通过 `contextBridge` 在安全的上下文中向渲染进程暴露有限的 API。它是渲染进程与主进程通信的唯一桥梁。

```typescript
// src/preload/index.ts

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { PetAction, PetConfig, AppConfig, ActionResult } from '../shared/types';

/**
 * electronAPI 接口 -- 暴露给渲染进程 window.electronAPI
 *
 * 所有方法都通过 IPC 调用主进程，渲染进程本身没有任何 Node.js 权限。
 */
const electronAPI = {
  // ============================================================
  // 桌宠交互控制
  // ============================================================

  /**
   * 切换窗口的点击穿透状态
   * @param interactive true = 捕获鼠标（鼠标可交互），false = 穿透鼠标（点击到桌面）
   */
  setInteractive: (interactive: boolean): void => {
    ipcRenderer.send(IPC_CHANNELS.SET_INTERACTIVE, interactive);
  },

  /**
   * 移动桌宠窗口到指定屏幕坐标
   * @param x 屏幕 X 坐标
   * @param y 屏幕 Y 坐标
   */
  moveWindow: (x: number, y: number): void => {
    ipcRenderer.send(IPC_CHANNELS.MOVE_WINDOW, { x, y });
  },

  // ============================================================
  // 配置读写
  // ============================================================

  /**
   * 获取完整应用配置
   */
  getConfig: (): Promise<AppConfig> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
  },

  /**
   * 保存完整应用配置
   */
  saveConfig: (config: AppConfig): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_CONFIG, config);
  },

  /**
   * 获取所有桌宠配置列表
   */
  getAllPets: (): Promise<PetConfig[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_ALL_PETS);
  },

  /**
   * 创建新桌宠
   * @param petConfig 桌宠配置
   * @returns 新桌宠的 ID
   */
  createPet: (petConfig: PetConfig): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CREATE_PET, petConfig);
  },

  /**
   * 删除指定桌宠
   * @param petId 桌宠 ID
   */
  deletePet: (petId: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.DELETE_PET, petId);
  },

  // ============================================================
  // 动作执行
  // ============================================================

  /**
   * 执行自定义动作
   * @param action 动作定义
   * @returns 执行结果
   */
  executeAction: (action: PetAction): Promise<ActionResult> => {
    return ipcRenderer.invoke(IPC_CHANNELS.EXECUTE_ACTION, action);
  },

  // ============================================================
  // 配置窗口
  // ============================================================

  /**
   * 打开配置窗口
   * @param petId 可选，指定要编辑的桌宠 ID
   */
  openConfigWindow: (petId?: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.OPEN_CONFIG_WINDOW, petId);
  },

  /**
   * 关闭配置窗口
   */
  closeConfigWindow: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CLOSE_CONFIG_WINDOW);
  },

  // ============================================================
  // 应用控制
  // ============================================================

  /**
   * 退出应用
   */
  quitApp: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.QUIT_APP);
  },

  // ============================================================
  // 事件监听（主进程 → 渲染进程）
  // ============================================================

  /**
   * 监听配置变更事件
   * @param callback 回调函数
   * @returns 取消监听的函数
   */
  onConfigChanged: (callback: (config: AppConfig) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, config: AppConfig) => {
      callback(config);
    };
    ipcRenderer.on(IPC_CHANNELS.CONFIG_CHANGED, listener);
    // 返回清理函数
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CONFIG_CHANGED, listener);
    };
  },
};

// ============================================================
// 通过 contextBridge 暴露到渲染进程的 window.electronAPI
// ============================================================

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
```

对应的类型声明文件:

```typescript
// src/preload/index.d.ts

import type { PetAction, PetConfig, AppConfig, ActionResult } from '../shared/types';

/**
 * electronAPI 接口类型声明
 * 使 TypeScript 渲染进程代码可以正确推断 window.electronAPI 的类型
 */
export interface ElectronAPI {
  // 桌宠交互控制
  setInteractive(interactive: boolean): void;
  moveWindow(x: number, y: number): void;

  // 配置读写
  getConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<void>;
  getAllPets(): Promise<PetConfig[]>;
  createPet(petConfig: PetConfig): Promise<string>;
  deletePet(petId: string): Promise<void>;

  // 动作执行
  executeAction(action: PetAction): Promise<ActionResult>;

  // 配置窗口
  openConfigWindow(petId?: string): Promise<void>;
  closeConfigWindow(): Promise<void>;

  // 应用控制
  quitApp(): Promise<void>;

  // 事件监听
  onConfigChanged(callback: (config: AppConfig) => void): () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

### 设计要点

| 要点 | 说明 |
|------|------|
| **contextBridge.exposeInMainWorld** | 唯一合法的 API 暴露方式。不允许使用 `window.xxx = ...` 的旧模式 |
| **ipcRenderer.on 清理** | `onConfigChanged` 返回清理函数，防止渲染进程重新加载时内存泄漏 |
| **只暴露必要 API** | 渲染进程无法直接访问 `fs`、`child_process`、`shell` 等 Node.js 模块，所有敏感操作必须通过 `electronAPI` 桥接到主进程 |
| **类型安全** | `index.d.ts` 为渲染进程提供完整的 TypeScript 类型提示 |

---

## 5. src/main/config-manager.ts -- 配置管理

配置管理器封装 `electron-store`，提供类型安全的配置读写接口和默认配置。

```typescript
// src/main/config-manager.ts

import Store from 'electron-store';
import { randomUUID } from 'node:crypto';
import type { AppConfig, PetConfig } from '../shared/types';

/**
 * electron-store 的 Schema 定义
 * 用于校验存储数据的结构和类型
 */
const configSchema = {
  type: 'object',
  properties: {
    pets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          modelType: { type: 'string', enum: ['sprite-sheet', 'live2d'] },
          modelPath: { type: 'string' },
          size: {
            type: 'object',
            properties: {
              width: { type: 'number' },
              height: { type: 'number' },
            },
          },
          position: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
          },
          opacity: { type: 'number', minimum: 0, maximum: 1 },
          zIndex: { type: 'number' },
          actions: {
            type: 'array',
            items: {
              type: 'object',
            },
          },
          behavior: {
            type: 'object',
          },
        },
        required: ['id', 'name', 'modelType'],
      },
    },
    globalSettings: {
      type: 'object',
      properties: {
        language: { type: 'string' },
        autoStart: { type: 'boolean' },
        checkUpdate: { type: 'boolean' },
      },
    },
  },
} as const;

export class ConfigManager {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store<AppConfig>({
      name: 'desk-idoll-config',
      schema: configSchema as any,
      // 默认配置（首次启动时使用）
      defaults: this.getDefaults(),
      // 开发模式下配置文件放在项目目录，方便调试
      cwd: undefined,
      clearInvalidConfig: true,
    });
  }

  // ============================================================
  // 1. 默认配置定义
  // ============================================================

  /**
   * 获取默认应用配置
   */
  private getDefaults(): AppConfig {
    return {
      pets: [],
      globalSettings: {
        language: 'zh-CN',
        autoStart: false,
        checkUpdate: true,
      },
    };
  }

  /**
   * 创建默认桌宠配置
   * 首次启动时使用，或用户添加新桌宠时的模板
   */
  createDefaultPet(): PetConfig {
    return {
      id: randomUUID(),
      name: '默认桌宠',
      modelType: 'sprite-sheet',
      modelPath: '',  // 首次启动时为空，后续加载默认 sprite sheet
      size: { width: 200, height: 200 },
      position: { x: 0, y: 0 },  // 由窗口管理器根据屏幕计算
      opacity: 1.0,
      zIndex: 0,
      animations: {
        type: 'sprite-sheet',
        frameWidth: 128,
        frameHeight: 128,
        fps: 12,
        states: {
          idle: { start: 0, end: 3, loop: true },
          walk: { start: 4, end: 11, loop: true },
          drag: { start: 12, end: 15, loop: true },
          fall: { start: 16, end: 19, loop: false },
          click: { start: 20, end: 23, loop: false },
        },
      },
      actions: [
        {
          id: randomUUID(),
          trigger: 'left-click',
          type: 'show-message',
          payload: 'Hello! I am your desktop pet!',
          name: '打招呼',
          confirmBeforeExecute: false,
        },
      ],
      behavior: {
        walkSpeed: 2,
        gravity: true,
        screenEdgeBehavior: 'bounce',
        idleTimeout: 3000,
        randomWalk: true,
      },
    };
  }

  // ============================================================
  // 2. 配置读写方法
  // ============================================================

  /**
   * 获取完整应用配置
   */
  getConfig(): AppConfig {
    return this.store.store;
  }

  /**
   * 设置完整应用配置
   */
  setConfig(config: AppConfig): void {
    this.store.store = config;
  }

  /**
   * 获取指定桌宠配置
   */
  getPetConfig(petId: string): PetConfig | undefined {
    return this.store.get('pets').find((p) => p.id === petId);
  }

  /**
   * 更新指定桌宠配置（部分更新，合并到现有配置）
   * @param petId 桌宠 ID
   * @param updates 要更新的字段
   */
  updatePetConfig(petId: string, updates: Partial<PetConfig>): void {
    const pets = this.store.get('pets');
    const index = pets.findIndex((p) => p.id === petId);
    if (index === -1) return;

    // 深合并更新
    pets[index] = deepMerge(pets[index], updates) as PetConfig;
    this.store.set('pets', pets);
  }

  /**
   * 添加新桌宠配置
   */
  addPet(petConfig: PetConfig): void {
    const pets = this.store.get('pets');
    pets.push(petConfig);
    this.store.set('pets', pets);
  }

  /**
   * 删除指定桌宠配置
   */
  removePet(petId: string): void {
    const pets = this.store.get('pets');
    const filtered = pets.filter((p) => p.id !== petId);
    this.store.set('pets', filtered);
  }

  /**
   * 获取全局设置
   */
  getGlobalSettings() {
    return this.store.get('globalSettings');
  }

  /**
   * 更新全局设置
   */
  updateGlobalSettings(settings: Partial<AppConfig['globalSettings']>): void {
    const current = this.store.get('globalSettings');
    this.store.set('globalSettings', { ...current, ...settings });
  }

  /**
   * 获取配置文件在磁盘上的路径（调试用）
   */
  getConfigPath(): string {
    return this.store.path;
  }
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 深合并两个对象（仅合并第一层和第二层）
 * 不会合并数组（数组整体替换）
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal as any, sourceVal as any) as T[keyof T];
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T];
    }
  }
  return result;
}
```

### 设计要点

| 要点 | 说明 |
|------|------|
| **electron-store** | 自动将配置持久化到 `%APPDATA%/desk-idoll/desk-idoll-config.json`，无需手动管理文件 |
| **Schema 校验** | 配置文件的结构在 Store 初始化时校验，损坏的配置会自动回退到默认值（`clearInvalidConfig: true`） |
| **updatePetConfig** | 支持部分更新（如只更新 `position`），通过 `deepMerge` 合并到现有配置 |
| **createDefaultPet** | 提供完整的默认桌宠配置模板，包含预设动画状态和一个示例动作 |

---

## 6. src/main/action-executor.ts -- 动作执行器

动作执行器负责在主进程中执行用户定义的桌宠动作（打开 URL、执行命令、显示消息），包含确认逻辑和安全防护。

```typescript
// src/main/action-executor.ts

import { shell, dialog, BrowserWindow } from 'electron';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { PetAction, ActionResult } from '../shared/types';

const execAsync = promisify(exec);

/**
 * 命令执行的安全限制
 */
const CMD_SECURITY = {
  /** 命令执行超时时间（毫秒） */
  TIMEOUT_MS: 30_000,
  /** 禁止执行的危险命令模式 */
  BLOCKED_PATTERNS: [
    /rm\s+-rf\s+[\/~]/i,       // rm -rf /
    /format\s+[a-z]:/i,         // format C:
    /del\s+\/[sfq]\s+[a-z]:\\/i, // del /f /s /q C:\
    /shutdown/i,                 // shutdown
    /reg\s+delete/i,            // reg delete
  ] as RegExp[],
};

export class ActionExecutor {
  /**
   * 执行自定义动作
   * @param action 动作定义
   * @returns 执行结果
   */
  async execute(action: PetAction): Promise<ActionResult> {
    try {
      // ---- 1. 执行前确认 ----
      if (action.confirmBeforeExecute) {
        const confirmed = await this.showConfirmDialog(action);
        if (!confirmed) {
          return { success: false, cancelled: true };
        }
      }

      // ---- 2. 根据动作类型分发执行 ----
      switch (action.type) {
        case 'open-url':
          return await this.executeOpenUrl(action);
        case 'execute-cmd':
          return await this.executeCmd(action);
        case 'show-message':
          return await this.executeShowMessage(action);
        default:
          return {
            success: false,
            error: `未知的动作类型: ${(action as any).type}`,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  // ============================================================
  // 1. open-url -- 打开外部 URL
  // ============================================================

  /**
   * 使用系统默认浏览器打开 URL
   * shell.openExternal 会自动处理协议验证（只允许 http/https/mailto 等安全协议）
   */
  private async executeOpenUrl(action: PetAction): Promise<ActionResult> {
    const url = action.payload.trim();

    // 基础 URL 格式校验
    if (!url) {
      return { success: false, error: 'URL 为空' };
    }

    // 只允许 http/https/ftp/mailto 协议
    const allowedProtocols = ['http:', 'https:', 'ftp:', 'mailto:'];
    try {
      const parsed = new URL(url);
      if (!allowedProtocols.includes(parsed.protocol)) {
        return {
          success: false,
          error: `不允许的协议: ${parsed.protocol}。仅支持 http/https/ftp/mailto`,
        };
      }
    } catch {
      return { success: false, error: `无效的 URL 格式: ${url}` };
    }

    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `打开 URL 失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ============================================================
  // 2. execute-cmd -- 执行系统命令
  // ============================================================

  /**
   * 执行系统命令（带安全检查和超时限制）
   *
   * 安全注意事项:
   * - 默认开启 confirmBeforeExecute
   * - 命令超时 30 秒
   * - 检查危险命令模式
   * - 捕获 stdout/stderr
   */
  private async executeCmd(action: PetAction): Promise<ActionResult> {
    const command = action.payload.trim();

    if (!command) {
      return { success: false, error: '命令为空' };
    }

    // ---- 安全检查: 检查是否匹配危险命令模式 ----
    for (const pattern of CMD_SECURITY.BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return {
          success: false,
          error: `命令被安全策略阻止: 匹配危险模式 ${pattern.source}`,
        };
      }
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: CMD_SECURITY.TIMEOUT_MS,
        windowsHide: true,  // Windows 上隐藏命令行窗口
      });

      if (stderr) {
        console.warn(`[ActionExecutor] 命令 stderr: ${stderr}`);
      }

      return {
        success: true,
        // 可选: 将 stdout 传回渲染进程显示
      };
    } catch (error: any) {
      // 区分超时和其他错误
      if (error.killed) {
        return {
          success: false,
          error: `命令执行超时（${CMD_SECURITY.TIMEOUT_MS / 1000}秒）`,
        };
      }
      return {
        success: false,
        error: `命令执行失败: ${error.message || String(error)}`,
      };
    }
  }

  // ============================================================
  // 3. show-message -- 显示消息对话框
  // ============================================================

  /**
   * 使用 Electron dialog 显示消息弹窗
   */
  private async executeShowMessage(action: PetAction): Promise<ActionResult> {
    const message = action.payload.trim();

    if (!message) {
      return { success: false, error: '消息内容为空' };
    }

    // 获取当前焦点窗口作为父窗口，如果没有则使用 null（系统级对话框）
    const parentWindow = BrowserWindow.getFocusedWindow() ?? null;

    await dialog.showMessageBox(parentWindow, {
      type: 'info',
      title: '桌宠消息',
      message: message,
      buttons: ['确定'],
      noLink: true,
    });

    return { success: true };
  }

  // ============================================================
  // 4. 确认对话框
  // ============================================================

  /**
   * 显示确认对话框，让用户确认是否执行动作
   * @returns true = 用户确认执行，false = 用户取消
   */
  private async showConfirmDialog(action: PetAction): Promise<boolean> {
    const parentWindow = BrowserWindow.getFocusedWindow() ?? null;

    // 根据动作类型构建确认消息
    let detail = '';
    switch (action.type) {
      case 'open-url':
        detail = `即将在浏览器中打开:\n${action.payload}`;
        break;
      case 'execute-cmd':
        detail = `即将执行命令:\n${action.payload}\n\n请确认命令安全后再执行。`;
        break;
      case 'show-message':
        detail = `即将显示消息:\n${action.payload}`;
        break;
    }

    const result = await dialog.showMessageBox(parentWindow, {
      type: 'question',
      title: '确认执行动作',
      message: `确认执行: ${action.name}`,
      detail: detail,
      buttons: ['执行', '取消'],
      defaultId: 1,   // 默认选中"取消"（更安全）
      cancelId: 1,
      noLink: true,
    });

    return result.response === 0;
  }
}
```

### 设计要点

| 要点 | 说明 |
|------|------|
| **CMD 安全** | 命令执行有三重保护: (1) 默认开启确认对话框, (2) 危险命令模式黑名单, (3) 30秒超时限制 |
| **confirmBeforeExecute** | 所有动作类型都支持执行前确认。CMD 类型建议强制开启。确认对话框默认选中"取消" |
| **URL 协议白名单** | `open-url` 只允许 http/https/ftp/mailto 协议，防止执行 `file:`、`javascript:` 等危险协议 |
| **windowsHide** | `exec` 的 `windowsHide: true` 防止 Windows 上弹出黑框命令行窗口 |
| **错误区分** | CMD 执行区分超时和其他错误，给用户更明确的提示 |

---

## 7. src/main/config-window.ts -- 配置窗口管理

配置窗口管理器负责创建和管理配置窗口 BrowserWindow，支持与桌宠窗口的双向通信。

```typescript
// src/main/config-window.ts

import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { ConfigManager } from './config-manager';

export class ConfigWindowManager {
  /** 配置窗口实例（单例，同一时间只允许一个配置窗口） */
  private window: BrowserWindow | null = null;

  /** 配置管理器引用 */
  private configManager: ConfigManager;

  /** 当前正在编辑的桌宠 ID */
  private currentPetId: string | null = null;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  // ============================================================
  // 1. 显示配置窗口
  // ============================================================

  /**
   * 显示配置窗口（如果已存在则聚焦并更新目标桌宠）
   * @param petId 可选，指定要编辑的桌宠 ID
   */
  async show(petId?: string): Promise<void> {
    this.currentPetId = petId ?? null;

    if (this.window && !this.window.isDestroyed()) {
      // 窗口已存在，聚焦并通知渲染进程切换到指定桌宠
      this.window.focus();
      if (petId) {
        this.window.webContents.send('switch-to-pet', petId);
      }
      return;
    }

    await this.createWindow();
  }

  /**
   * 隐藏配置窗口（不销毁，下次 show 时复用）
   */
  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
    }
  }

  /**
   * 销毁配置窗口
   */
  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }

  /**
   * 获取配置窗口实例
   */
  getWindow(): BrowserWindow | null {
    if (this.window && !this.window.isDestroyed()) {
      return this.window;
    }
    return null;
  }

  /**
   * 配置窗口是否可见
   */
  isVisible(): boolean {
    return this.window !== null && !this.window.isDestroyed() && this.window.isVisible();
  }

  // ============================================================
  // 2. 内部：创建配置窗口
  // ============================================================

  private async createWindow(): Promise<void> {
    // 计算窗口尺寸和位置（居中显示）
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    const windowWidth = Math.min(800, screenWidth - 100);
    const windowHeight = Math.min(650, screenHeight - 100);
    const windowX = Math.floor((screenWidth - windowWidth) / 2);
    const windowY = Math.floor((screenHeight - windowHeight) / 2);

    this.window = new BrowserWindow({
      // ---- 窗口尺寸 ----
      width: windowWidth,
      height: windowHeight,
      minWidth: 600,
      minHeight: 500,

      // ---- 位置 ----
      x: windowX,
      y: windowY,

      // ---- 窗口外观 ----
      title: 'Desk-Idoll 设置',
      icon: path.join(__dirname, '../../resources/icon.png'),
      show: false,  // 先隐藏，加载完成后再显示

      // ---- 配置窗口使用常规有边框样式 ----
      transparent: false,
      frame: true,
      resizable: true,
      maximizable: false,

      // ---- Web 偏好设置 ----
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    // ---- 加载配置窗口页面 ----
    if (process.env.ELECTRON_RENDERER_URL) {
      await this.window.loadURL(
        `${process.env.ELECTRON_RENDERER_URL}/src/config/index.html`
      );
    } else {
      await this.window.loadFile(path.join(__dirname, '../config/index.html'));
    }

    // ---- 窗口加载完成 ----
    this.window.once('ready-to-show', () => {
      this.window!.show();

      // 如果有指定的桌宠 ID，通知渲染进程
      if (this.currentPetId) {
        this.window!.webContents.send('switch-to-pet', this.currentPetId);
      }
    });

    // ---- 窗口关闭事件 ----
    // 使用 hide 代替 close，实现"关闭后复用"
    this.window.on('close', (event) => {
      // 不真正关闭，只是隐藏（除非应用正在退出）
      if (!this.isAppQuitting) {
        event.preventDefault();
        this.window!.hide();
      }
    });

    this.window.on('closed', () => {
      this.window = null;
      this.currentPetId = null;
    });

    // ---- 阻止配置窗口内打开新窗口 ----
    this.window.webContents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });
  }

  /** 标记是否正在退出应用（控制窗口是否真正关闭） */
  private isAppQuitting = false;

  /**
   * 标记应用正在退出，允许窗口真正关闭
   * 应在 app.before-quit 事件中调用
   */
  markAppQuitting(): void {
    this.isAppQuitting = true;
  }
}
```

### 设计要点

| 要点 | 说明 |
|------|------|
| **单例模式** | 同一时间只存在一个配置窗口，重复调用 `show()` 只会聚焦已有窗口 |
| **hide vs close** | 配置窗口关闭时执行 `hide()` 而非真正销毁，下次打开时复用，避免重复创建窗口的开销 |
| **isAppQuitting** | 应用退出时设置此标志，允许 `close` 事件正常关闭窗口，否则会被 `preventDefault` 阻止 |
| **switch-to-pet** | 主进程向配置窗口发送 `switch-to-pet` 事件，通知渲染进程切换到指定桌宠的配置页 |
| **与桌宠窗口共用 preload** | 配置窗口和桌宠窗口使用同一个 preload 脚本，通过 `window.electronAPI` 调用相同的 IPC 接口 |

---

## 附录 A: 模块依赖关系

```
src/main/index.ts (入口)
  ├── imports → PetWindowManager     (pet-window.ts)
  ├── imports → ConfigWindowManager  (config-window.ts)
  ├── imports → ConfigManager        (config-manager.ts)
  ├── imports → ActionExecutor       (action-executor.ts)
  └── imports → registerAllIpcHandlers (ipc.ts)

src/main/ipc.ts
  ├── imports → PetWindowManager
  ├── imports → ConfigWindowManager
  ├── imports → ConfigManager
  ├── imports → ActionExecutor
  └── imports → IPC_CHANNELS (shared/ipc-channels.ts)

src/main/pet-window.ts
  └── imports → ConfigManager

src/main/config-window.ts
  └── imports → ConfigManager

src/main/action-executor.ts
  └── (无模块间依赖，使用 Electron + Node.js 原生 API)

src/main/config-manager.ts
  └── imports → electron-store

src/preload/index.ts
  └── imports → IPC_CHANNELS (shared/ipc-channels.ts)
```

## 附录 B: IPC 通道一览

| 通道 | 方向 | 模式 | 说明 |
|------|------|------|------|
| `set-interactive` | 渲染 → 主 | `send` (无返回) | 切换点击穿透 |
| `move-window` | 渲染 → 主 | `send` (无返回) | 拖拽移动窗口 |
| `get-config` | 渲染 → 主 | `invoke` (有返回) | 获取完整配置 |
| `save-config` | 渲染 → 主 | `invoke` (有返回) | 保存完整配置 |
| `execute-action` | 渲染 → 主 | `invoke` (有返回) | 执行自定义动作 |
| `open-config-window` | 渲染 → 主 | `invoke` (有返回) | 打开配置窗口 |
| `close-config-window` | 渲染 → 主 | `invoke` (有返回) | 关闭配置窗口 |
| `get-all-pets` | 渲染 → 主 | `invoke` (有返回) | 获取所有桌宠列表 |
| `create-pet` | 渲染 → 主 | `invoke` (有返回) | 创建新桌宠 |
| `delete-pet` | 渲染 → 主 | `invoke` (有返回) | 删除桌宠 |
| `quit-app` | 渲染 → 主 | `invoke` (有返回) | 退出应用 |
| `config-changed` | 主 → 渲染 | `send` (单向) | 配置变更通知 |
| `switch-to-pet` | 主 → 配置窗口 | `send` (单向) | 切换编辑目标桌宠 |

## 附录 C: 点击穿透的工作原理

点击穿透是桌宠窗口的关键特性，实现原理如下:

```
渲染进程 (Renderer)                 主进程 (Main)
    │                                    │
    │  1. 鼠标进入桌宠像素区域            │
    │  (PixiJS hitTest 检测到像素)       │
    │                                    │
    │  2. canvas mouseenter 事件          │
    │     → electronAPI.setInteractive(true)
    │                                    │
    │  ───── IPC: set-interactive ────→  │  3. petWindow.setIgnoreMouseEvents(false)
    │                                    │     窗口现在捕获鼠标事件
    │                                    │
    │  4. 用户可以点击/拖拽桌宠           │
    │                                    │
    │  5. 鼠标离开桌宠像素区域            │
    │     canvas mouseleave 事件          │
    │     → electronAPI.setInteractive(false)
    │                                    │
    │  ───── IPC: set-interactive ────→  │  6. petWindow.setIgnoreMouseEvents(true, {forward:true})
    │                                    │     窗口再次穿透鼠标
    │                                    │
    │  7. 鼠标事件穿透到桌面              │
```

关键细节:
- `setIgnoreMouseEvents(true, { forward: true })` 的 `forward` 参数让主进程仍然收到鼠标坐标信息，这使得渲染进程可以检测鼠标是否进入了桌宠的像素区域
- 精确的像素级检测由 PixiJS 的 hitTest 完成，不是整个矩形窗口区域
- 透明像素区域不会触发 `mouseenter`，只有实际的桌宠图片像素区域才会触发

---

## 附录 D: 安全模型

```
┌───────────────────────────────────────────────────────┐
│                    Main Process                        │
│  (Node.js, 完整权限)                                  │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────┐  │
│  │ConfigManager│ │ActionExecutor│ │PetWindowMgr   │  │
│  │ 读写磁盘配置│ │ 执行命令/URL │ │ 管理窗口      │  │
│  └─────────────┘ └──────────────┘ └───────────────┘  │
│          ▲               ▲                ▲           │
│          │               │                │           │
│          └───────────────┼────────────────┘           │
│                          │                            │
│                   IPC (ipcMain)                       │
└──────────────────────────┬────────────────────────────┘
                           │
                    contextBridge
                    (安全过滤层)
                           │
┌──────────────────────────┴────────────────────────────┐
│                   Renderer Process                     │
│  (Chromium, 无 Node.js 权限)                          │
│  ┌──────────────────────────────────────────────────┐ │
│  │  window.electronAPI                              │ │
│  │  - 只暴露预定义的方法                             │ │
│  │  - 无法直接访问 fs, child_process, shell 等      │ │
│  │  - 所有请求都通过 IPC 由主进程执行                │ │
│  └──────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

安全原则:
1. **最小权限原则**: 渲染进程只能通过 `window.electronAPI` 调用预定义的方法
2. **contextIsolation: true**: 渲染进程的 JavaScript 全局对象与 preload 脚本隔离
3. **nodeIntegration: false**: 渲染进程无法使用 `require()` 或访问 Node.js API
4. **sandbox: true**: 渲染进程运行在 Chromium 沙箱中
5. **webContents.setWindowOpenHandler**: 阻止渲染进程打开任意新窗口
6. **CMD 执行保护**: 危险命令黑名单 + 默认确认 + 30秒超时 + windowsHide
