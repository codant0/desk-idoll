# Module 07 -- 系统托盘 + 配置管理

> 日期: 2026-06-07
> 状态: Draft
> 依赖模块: 01 (项目骨架), 03 (IPC 通信), 05 (桌宠窗口管理)

---

## 1. 模块概述

本模块实现 Desk-Idoll 的两个核心基础设施：

| 子模块 | 文件 | 职责 |
|--------|------|------|
| 系统托盘 | `src/main/tray.ts` | 托盘图标驻留、右键菜单、全局显示/隐藏控制 |
| 配置管理 | `src/main/config-manager.ts` | 配置持久化 (electron-store)、CRUD、schema 验证、变更通知 |
| IPC 通道 | `src/shared/ipc-channels.ts` | 统一定义所有 IPC 通道名称常量 |

**关键约束:**
- 托盘图标在 Windows 上必须使用 `.ico` 格式 (16x16)，否则在高 DPI 下可能模糊或不显示
- electron-store 的 schema 必须严格定义，防止配置文件被手动篡改后导致运行时错误
- 配置变更必须通过事件机制通知所有已打开的窗口，保证 UI 与数据同步

---

## 2. 类型定义 -- `src/shared/types.ts`

以下类型是本模块的数据基础，与主设计文档第 4.3 节一致，此处补充配置验证和托盘相关类型。

```typescript
// ============================================================
// src/shared/types.ts
// Desk-Idoll 共享类型定义
// ============================================================

// ---------- 桌宠配置 ----------

export interface PetConfig {
  /** 唯一标识，使用 crypto.randomUUID() 生成 */
  id: string;
  /** 用户自定义名称 */
  name: string;
  /** 模型类型 */
  modelType: 'sprite-sheet' | 'live2d';
  /** 模型文件路径 (绝对路径或相对于 userData 的路径) */
  modelPath: string;
  /** 桌宠渲染尺寸 */
  size: { width: number; height: number };
  /** 桌宠在屏幕上的位置 */
  position: { x: number; y: number };
  /** 透明度 0-1 */
  opacity: number;
  /** 层级 (越大越靠前) */
  zIndex: number;
  /** 动画配置 */
  animations: AnimationConfig;
  /** 自定义动作列表 */
  actions: PetAction[];
  /** 行为配置 */
  behavior: BehaviorConfig;
  /** 是否可见 (不销毁窗口，仅隐藏) */
  visible: boolean;
  /** 创建时间 ISO 字符串 */
  createdAt: string;
  /** 最后修改时间 ISO 字符串 */
  updatedAt: string;
}

// ---------- 动画配置 ----------

export interface SpriteAnimationConfig {
  type: 'sprite-sheet';
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

export interface Live2DAnimationConfig {
  type: 'live2d';
  modelPath: string;
  motions: Record<string, string>;
  expressions: Record<string, string>;
  followMouse: boolean;
}

export type AnimationConfig = SpriteAnimationConfig | Live2DAnimationConfig;

export interface FrameRange {
  start: number;
  end: number;
  loop: boolean;
}

// ---------- 自定义动作 ----------

export interface PetAction {
  id: string;
  trigger: 'left-click';
  type: 'open-url' | 'execute-cmd' | 'show-message';
  payload: string;
  name: string;
  confirmBeforeExecute: boolean;
}

// ---------- 行为配置 ----------

export interface BehaviorConfig {
  walkSpeed: number;
  gravity: boolean;
  screenEdgeBehavior: 'bounce' | 'wrap' | 'stop';
  idleTimeout: number;
  randomWalk: boolean;
}

// ---------- 全局设置 ----------

export interface GlobalSettings {
  language: string;
  autoStart: boolean;
  checkUpdate: boolean;
}

// ---------- 完整应用配置 ----------

export interface AppConfig {
  /** 配置文件版本号，用于迁移 */
  version: number;
  /** 桌宠列表 */
  pets: PetConfig[];
  /** 全局设置 */
  globalSettings: GlobalSettings;
}

// ---------- 托盘图标状态 ----------

export type TrayIconState = 'normal' | 'hidden';

// ---------- 配置变更事件 ----------

export interface ConfigChangeEvent {
  type: 'pet:added' | 'pet:updated' | 'pet:removed' | 'global:updated';
  petId?: string;
  timestamp: string;
}
```

---

## 3. IPC 通道定义 -- `src/shared/ipc-channels.ts`

集中管理所有 IPC 通道名称，避免字符串硬编码导致的拼写错误。

```typescript
// ============================================================
// src/shared/ipc-channels.ts
// 统一 IPC 通道常量定义
// ============================================================

/**
 * 所有 IPC 通道名称常量。
 * 命名规范: <domain>:<action>
 *
 * 使用示例:
 *   // Main process (ipc.ts)
 *   ipcMain.handle(IPC_CHANNELS.PET_ADD, handler);
 *
 *   // Renderer (preload.ts)
 *   contextBridge.exposeInMainWorld('electronAPI', {
 *     addPet: (config) => ipcRenderer.invoke(IPC_CHANNELS.PET_ADD, config),
 *   });
 */
export const IPC_CHANNELS = {
  // ==================== 桌宠 CRUD ====================

  /** 添加桌宠 → 返回新桌宠的 PetConfig */
  PET_ADD: 'pet:add',

  /** 删除桌宠 → 传入 petId，返回 boolean */
  PET_REMOVE: 'pet:remove',

  /** 更新桌宠 → 传入 { id, partial }，返回更新后的 PetConfig */
  PET_UPDATE: 'pet:update',

  /** 获取所有桌宠列表 → 返回 PetConfig[] */
  PET_LIST: 'pet:list',

  /** 获取单个桌宠 → 传入 petId，返回 PetConfig | undefined */
  PET_GET: 'pet:get',

  // ==================== 全局设置 ====================

  /** 获取全局设置 → 返回 GlobalSettings */
  CONFIG_GET_GLOBAL: 'config:get-global',

  /** 更新全局设置 → 传入 Partial<GlobalSettings>，返回更新后的 GlobalSettings */
  CONFIG_SET_GLOBAL: 'config:set-global',

  /** 获取完整配置 → 返回 AppConfig */
  CONFIG_GET_ALL: 'config:get-all',

  // ==================== 托盘操作 ====================

  /** 从托盘添加桌宠 → 打开配置窗口 (无参数) */
  TRAY_ADD_PET: 'tray:add-pet',

  /** 切换所有桌宠可见性 → 返回新的可见状态 boolean */
  TRAY_TOGGLE_VISIBILITY: 'tray:toggle-visibility',

  /** 切换单个桌宠可见性 → 传入 petId，返回新的可见状态 boolean */
  TRAY_TOGGLE_PET_VISIBILITY: 'tray:toggle-pet-visibility',

  // ==================== 窗口控制 ====================

  /** 打开配置窗口 → 可选传入 petId (编辑模式) 或不传 (新建模式) */
  WINDOW_OPEN_CONFIG: 'window:open-config',

  /** 关闭配置窗口 */
  WINDOW_CLOSE_CONFIG: 'window:close-config',

  // ==================== 配置变更通知 (Main → Renderer) ====================

  /** 配置变更通知 → 传入 ConfigChangeEvent */
  CONFIG_CHANGED: 'config:changed',

  /** 桌宠可见性变更 → 传入 { petId, visible } */
  PET_VISIBILITY_CHANGED: 'pet:visibility-changed',

  /** 所有桌宠可见性变更 → 传入 { visible } */
  ALL_PETS_VISIBILITY_CHANGED: 'all-pets:visibility-changed',
} as const;

/** IPC 通道名称的类型 */
export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
```

---

## 4. 配置管理 -- `src/main/config-manager.ts`

### 4.1 设计要点

- **单例模式**: 全局唯一实例，通过 `ConfigManager.getInstance()` 获取
- **electron-store**: 使用 JSON 文件持久化，路径为 `<userData>/config.json`
- **Schema 验证**: 使用 electron-store 内置的 JSON Schema 验证，拒绝不合法的配置
- **版本迁移**: 配置文件带 `version` 字段，升级时自动迁移
- **变更事件**: 通过 EventEmitter 通知所有监听者 (托盘、窗口管理器等)

### 4.2 完整实现

```typescript
// ============================================================
// src/main/config-manager.ts
// 配置管理器 — 单例，负责配置持久化、验证、变更通知
// ============================================================

import { app } from 'electron';
import Store from 'electron-store';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  AppConfig,
  PetConfig,
  GlobalSettings,
  ConfigChangeEvent,
} from '../shared/types';

// ---------- 当前配置版本 ----------

/** 配置文件版本号，每次 schema 变更时递增 */
const CONFIG_VERSION = 1;

// ---------- 默认配置 ----------

const DEFAULT_CONFIG: AppConfig = {
  version: CONFIG_VERSION,
  pets: [],
  globalSettings: {
    language: 'zh-CN',
    autoStart: false,
    checkUpdate: true,
  },
};

// ---------- JSON Schema 定义 ----------
// electron-store 使用 ajv 进行验证，必须严格声明每个字段

const petActionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    trigger: { type: 'string', enum: ['left-click'] },
    type: { type: 'string', enum: ['open-url', 'execute-cmd', 'show-message'] },
    payload: { type: 'string' },
    name: { type: 'string', minLength: 1, maxLength: 50 },
    confirmBeforeExecute: { type: 'boolean' },
  },
  required: ['id', 'trigger', 'type', 'payload', 'name', 'confirmBeforeExecute'],
  additionalProperties: false,
} as const;

const frameRangeSchema = {
  type: 'object',
  properties: {
    start: { type: 'number', minimum: 0 },
    end: { type: 'number', minimum: 0 },
    loop: { type: 'boolean' },
  },
  required: ['start', 'end', 'loop'],
  additionalProperties: false,
} as const;

const spriteAnimationSchema = {
  type: 'object',
  properties: {
    type: { const: 'sprite-sheet' },
    frameWidth: { type: 'number', minimum: 1 },
    frameHeight: { type: 'number', minimum: 1 },
    fps: { type: 'number', minimum: 1, maximum: 120 },
    states: {
      type: 'object',
      properties: {
        idle: frameRangeSchema,
        walk: frameRangeSchema,
        drag: frameRangeSchema,
        fall: frameRangeSchema,
        click: frameRangeSchema,
      },
      required: ['idle', 'walk', 'drag', 'fall', 'click'],
      additionalProperties: false,
    },
  },
  required: ['type', 'frameWidth', 'frameHeight', 'fps', 'states'],
  additionalProperties: false,
} as const;

const live2dAnimationSchema = {
  type: 'object',
  properties: {
    type: { const: 'live2d' },
    modelPath: { type: 'string' },
    motions: { type: 'object', additionalProperties: { type: 'string' } },
    expressions: { type: 'object', additionalProperties: { type: 'string' } },
    followMouse: { type: 'boolean' },
  },
  required: ['type', 'modelPath', 'motions', 'expressions', 'followMouse'],
  additionalProperties: false,
} as const;

const behaviorSchema = {
  type: 'object',
  properties: {
    walkSpeed: { type: 'number', minimum: 0.1, maximum: 20 },
    gravity: { type: 'boolean' },
    screenEdgeBehavior: { type: 'string', enum: ['bounce', 'wrap', 'stop'] },
    idleTimeout: { type: 'number', minimum: 500, maximum: 60000 },
    randomWalk: { type: 'boolean' },
  },
  required: ['walkSpeed', 'gravity', 'screenEdgeBehavior', 'idleTimeout', 'randomWalk'],
  additionalProperties: false,
} as const;

const petConfigSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1, maxLength: 30 },
    modelType: { type: 'string', enum: ['sprite-sheet', 'live2d'] },
    modelPath: { type: 'string', minLength: 1 },
    size: {
      type: 'object',
      properties: {
        width: { type: 'number', minimum: 32, maximum: 1024 },
        height: { type: 'number', minimum: 32, maximum: 1024 },
      },
      required: ['width', 'height'],
      additionalProperties: false,
    },
    position: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['x', 'y'],
      additionalProperties: false,
    },
    opacity: { type: 'number', minimum: 0, maximum: 1 },
    zIndex: { type: 'number', minimum: 0, maximum: 9999 },
    animations: {
      oneOf: [spriteAnimationSchema, live2dAnimationSchema],
    },
    actions: {
      type: 'array',
      items: petActionSchema,
      maxItems: 20,
    },
    behavior: behaviorSchema,
    visible: { type: 'boolean' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: [
    'id', 'name', 'modelType', 'modelPath', 'size', 'position',
    'opacity', 'zIndex', 'animations', 'actions', 'behavior',
    'visible', 'createdAt', 'updatedAt',
  ],
  additionalProperties: false,
} as const;

const globalSettingsSchema = {
  type: 'object',
  properties: {
    language: { type: 'string', minLength: 2, maxLength: 10 },
    autoStart: { type: 'boolean' },
    checkUpdate: { type: 'boolean' },
  },
  required: ['language', 'autoStart', 'checkUpdate'],
  additionalProperties: false,
} as const;

const appConfigSchema = {
  type: 'object',
  properties: {
    version: { type: 'number', minimum: 1 },
    pets: {
      type: 'array',
      items: petConfigSchema,
      maxItems: 50,
    },
    globalSettings: globalSettingsSchema,
  },
  required: ['version', 'pets', 'globalSettings'],
  additionalProperties: false,
} as const;

// ---------- 配置迁移函数 ----------

interface Migration {
  fromVersion: number;
  toVersion: number;
  migrate: (config: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * 迁移注册表。
 * 每次 schema 变更时在此追加一条迁移记录。
 * 迁移按 fromVersion 升序依次执行。
 */
const migrations: Migration[] = [
  // 示例: 从版本 1 迁移到版本 2
  // {
  //   fromVersion: 1,
  //   toVersion: 2,
  //   migrate: (config) => {
  //     // 将旧字段名 renamedField 改为 newFieldName
  //     const pets = (config.pets as any[]).map((pet) => {
  //       const { renamedField, ...rest } = pet;
  //       return { ...rest, newFieldName: renamedField };
  //     });
  //     return { ...config, version: 2, pets };
  //   },
  // },
];

/**
 * 对配置文件执行版本迁移。
 * 按版本号升序依次执行所有需要的迁移。
 */
function migrateConfig(rawConfig: Record<string, unknown>): AppConfig {
  let config = { ...rawConfig };
  const currentVersion = (config.version as number) ?? 0;

  // 筛选出需要执行的迁移并按版本排序
  const pendingMigrations = migrations
    .filter((m) => m.fromVersion >= currentVersion)
    .sort((a, b) => a.fromVersion - b.fromVersion);

  for (const migration of pendingMigrations) {
    try {
      config = migration.migrate(config);
      console.log(
        `[ConfigManager] Migrated config v${migration.fromVersion} -> v${migration.toVersion}`
      );
    } catch (error) {
      console.error(
        `[ConfigManager] Migration v${migration.fromVersion} -> v${migration.toVersion} failed:`,
        error
      );
      // 迁移失败时保留原配置，不丢失用户数据
      break;
    }
  }

  return config as unknown as AppConfig;
}

// ---------- ConfigManager 类 ----------

export class ConfigManager extends EventEmitter {
  private static instance: ConfigManager | null = null;
  private store: Store<AppConfig>;
  private ready: boolean = false;

  private constructor() {
    super();

    this.store = new Store<AppConfig>({
      name: 'config',
      cwd: app.getPath('userData'),
      // fileExtension: 'json',  // 默认就是 json
      schema: appConfigSchema as any,
      defaults: DEFAULT_CONFIG as any,
      // 开发模式下 pretty-print 方便调试
      // 生产模式下压缩以减小体积
      serialize: (value) => JSON.stringify(value, null, process.env.NODE_ENV === 'development' ? 2 : 0),
      // deserialize 默认使用 JSON.parse
      // 在 schema 验证失败时不清空已有数据，而是保留并打印警告
      clearInvalidConfig: false,
    });

    this.runMigrations();
    this.ready = true;

    console.log(`[ConfigManager] Initialized. Config path: ${this.store.path}`);
  }

  // ==================== 单例 ====================

  /**
   * 获取 ConfigManager 单例。
   * 必须在 app.whenReady() 之后调用 (因为 electron-store 需要 userData 路径)。
   */
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * 销毁单例 (用于测试或退出时清理)。
   */
  static destroyInstance(): void {
    if (ConfigManager.instance) {
      ConfigManager.instance.removeAllListeners();
      ConfigManager.instance = null;
    }
  }

  // ==================== 初始化 & 迁移 ====================

  /**
   * 执行配置迁移。
   * 在构造函数中自动调用。
   */
  private runMigrations(): void {
    const rawConfig = this.store.store as unknown as Record<string, unknown>;
    const currentVersion = (rawConfig?.version as number) ?? 0;

    if (currentVersion < CONFIG_VERSION) {
      const migrated = migrateConfig(rawConfig);
      this.store.store = migrated;
      console.log(`[ConfigManager] Config migrated to version ${CONFIG_VERSION}`);
    }
  }

  // ==================== 桌宠 CRUD ====================

  /**
   * 获取所有桌宠配置。
   */
  getPets(): PetConfig[] {
    return this.store.get('pets', []);
  }

  /**
   * 根据 ID 获取单个桌宠配置。
   * @returns PetConfig 或 undefined (未找到)
   */
  getPet(id: string): PetConfig | undefined {
    return this.getPets().find((pet) => pet.id === id);
  }

  /**
   * 添加桌宠。
   * 自动生成 id、createdAt、updatedAt，设置 visible 默认为 true。
   *
   * @param config 不含 id/createdAt/updatedAt/visible 的桌宠配置
   * @returns 完整的 PetConfig (含自动生成的字段)
   * @throws Error 如果桌宠数量已达上限 (50)
   */
  addPet(config: Omit<PetConfig, 'id' | 'createdAt' | 'updatedAt' | 'visible'>): PetConfig {
    const pets = this.getPets();

    if (pets.length >= 50) {
      throw new Error('桌宠数量已达上限 (50)');
    }

    const now = new Date().toISOString();
    const newPet: PetConfig = {
      ...config,
      id: randomUUID(),
      visible: true,
      createdAt: now,
      updatedAt: now,
    };

    // 验证桌宠名称唯一性
    if (pets.some((p) => p.name === newPet.name)) {
      throw new Error(`桌宠名称 "${newPet.name}" 已存在`);
    }

    pets.push(newPet);
    this.store.set('pets', pets);

    this.emitChange({ type: 'pet:added', petId: newPet.id, timestamp: now });
    console.log(`[ConfigManager] Pet added: ${newPet.name} (${newPet.id})`);

    return newPet;
  }

  /**
   * 更新桌宠的部分字段。
   *
   * @param id 桌宠 ID
   * @param partial 要更新的字段 (Partial<PetConfig>，不允许修改 id/createdAt)
   * @returns 更新后的完整 PetConfig
   * @throws Error 如果桌宠不存在
   */
  updatePet(id: string, partial: Partial<Omit<PetConfig, 'id' | 'createdAt'>>): PetConfig {
    const pets = this.getPets();
    const index = pets.findIndex((pet) => pet.id === id);

    if (index === -1) {
      throw new Error(`桌宠不存在: ${id}`);
    }

    // 如果更新了名称，检查唯一性
    if (partial.name && partial.name !== pets[index].name) {
      if (pets.some((p) => p.name === partial.name && p.id !== id)) {
        throw new Error(`桌宠名称 "${partial.name}" 已存在`);
      }
    }

    const updatedPet: PetConfig = {
      ...pets[index],
      ...partial,
      id, // 强制保持原 ID
      createdAt: pets[index].createdAt, // 强制保持原创建时间
      updatedAt: new Date().toISOString(),
    };

    pets[index] = updatedPet;
    this.store.set('pets', pets);

    this.emitChange({ type: 'pet:updated', petId: id, timestamp: updatedPet.updatedAt });
    console.log(`[ConfigManager] Pet updated: ${updatedPet.name} (${id})`);

    return updatedPet;
  }

  /**
   * 删除桌宠。
   *
   * @param id 桌宠 ID
   * @returns true 如果删除成功
   * @throws Error 如果桌宠不存在
   */
  removePet(id: string): boolean {
    const pets = this.getPets();
    const index = pets.findIndex((pet) => pet.id === id);

    if (index === -1) {
      throw new Error(`桌宠不存在: ${id}`);
    }

    const removed = pets.splice(index, 1)[0];
    this.store.set('pets', pets);

    this.emitChange({
      type: 'pet:removed',
      petId: id,
      timestamp: new Date().toISOString(),
    });
    console.log(`[ConfigManager] Pet removed: ${removed.name} (${id})`);

    return true;
  }

  // ==================== 全局设置 ====================

  /**
   * 获取全局设置。
   */
  getGlobalSettings(): GlobalSettings {
    return this.store.get('globalSettings', DEFAULT_CONFIG.globalSettings);
  }

  /**
   * 更新全局设置 (部分更新)。
   *
   * @param partial 要更新的设置字段
   * @returns 更新后的完整 GlobalSettings
   */
  updateGlobalSettings(partial: Partial<GlobalSettings>): GlobalSettings {
    const current = this.getGlobalSettings();
    const updated: GlobalSettings = { ...current, ...partial };

    this.store.set('globalSettings', updated);

    this.emitChange({
      type: 'global:updated',
      timestamp: new Date().toISOString(),
    });
    console.log('[ConfigManager] Global settings updated:', partial);

    return updated;
  }

  // ==================== 完整配置访问 ====================

  /**
   * 获取完整配置 (只读)。
   */
  getAll(): AppConfig {
    return {
      version: this.store.get('version', CONFIG_VERSION),
      pets: this.getPets(),
      globalSettings: this.getGlobalSettings(),
    };
  }

  /**
   * 获取配置文件的绝对路径。
   */
  getConfigPath(): string {
    return this.store.path;
  }

  // ==================== 变更通知 ====================

  /**
   * 发出配置变更事件。
   * 内部方法，由 CRUD 方法调用。
   */
  private emitChange(event: ConfigChangeEvent): void {
    this.emit('config-changed', event);
  }

  /**
   * 注册配置变更监听器。
   * 托盘管理器、窗口管理器等通过此方法监听配置变更。
   */
  onConfigChanged(listener: (event: ConfigChangeEvent) => void): () => void {
    this.on('config-changed', listener);
    // 返回取消监听函数
    return () => this.off('config-changed', listener);
  }
}
```

### 4.3 electron-store Schema 验证说明

electron-store 内部使用 [ajv](https://ajv.js.org/) 进行 JSON Schema 验证。上述 schema 定义了以下约束：

| 字段 | 约束 | 说明 |
|------|------|------|
| `version` | `minimum: 1` | 配置版本号，必须 >= 1 |
| `pets` | `maxItems: 50` | 最多 50 个桌宠 |
| `pets[].name` | `minLength: 1, maxLength: 30` | 名称 1-30 字符 |
| `pets[].size.width/height` | `minimum: 32, maximum: 1024` | 尺寸 32-1024px |
| `pets[].opacity` | `minimum: 0, maximum: 1` | 透明度 0-1 |
| `pets[].actions` | `maxItems: 20` | 每个桌宠最多 20 个动作 |
| `pets[].behavior.walkSpeed` | `0.1 - 20` | 行走速度合理范围 |
| `pets[].behavior.idleTimeout` | `500 - 60000` | 待机超时 0.5s - 60s |
| `animations` | `oneOf: [sprite, live2d]` | 必须是其中一种动画类型 |

当用户手动编辑 `config.json` 导致 schema 验证失败时，`clearInvalidConfig: false` 确保不会丢失已有数据。electron-store 会抛出验证错误，由上层捕获处理。

---

## 5. 系统托盘 -- `src/main/tray.ts`

### 5.1 设计要点

- Windows 托盘图标必须使用 `.ico` 格式 (16x16)，使用 `nativeImage.createFromPath()` 加载
- 右键菜单包含：全局控制、添加桌宠、设置、桌宠列表 (动态)、退出
- 桌宠列表子菜单：显示/隐藏/删除，实时反映配置变更
- 图标在所有桌宠隐藏时切换为"隐藏状态"图标
- 左键单击托盘图标：显示/隐藏所有桌宠
- 右键单击托盘图标：弹出菜单

### 5.2 完整实现

```typescript
// ============================================================
// src/main/tray.ts
// 系统托盘管理器
// ============================================================

import {
  Tray,
  Menu,
  nativeImage,
  app,
  BrowserWindow,
  dialog,
  MenuItemConstructorOptions,
} from 'electron';
import path from 'path';
import { ConfigManager } from './config-manager';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type {
  PetConfig,
  TrayIconState,
  ConfigChangeEvent,
} from '../shared/types';

// ---------- 图标路径 ----------

/**
 * 图标资源路径。
 * 开发模式下从项目根目录读取，打包后从 resources 目录读取。
 *
 * Windows: 必须使用 .ico 格式 (16x16) 以确保高 DPI 下正常显示。
 * macOS: 使用 .png 或 .icns。
 * Linux: 使用 .png。
 */
function getIconPath(state: TrayIconState): string {
  const isPackaged = app.isPackaged;

  // 打包后 resources 目录在 process.resourcesPath
  // 开发模式下从项目根目录的 resources 文件夹读取
  const baseDir = isPackaged
    ? process.resourcesPath
    : path.join(app.getAppPath(), 'resources');

  if (process.platform === 'win32') {
    // Windows 使用 .ico
    return state === 'hidden'
      ? path.join(baseDir, 'tray-icon-hidden.ico')
      : path.join(baseDir, 'tray-icon.ico');
  }

  // macOS / Linux 使用 .png
  return state === 'hidden'
    ? path.join(baseDir, 'tray-icon-hidden.png')
    : path.join(baseDir, 'tray-icon.png');
}

// ---------- TrayManager 类 ----------

export class TrayManager {
  private tray: Tray | null = null;
  private configManager: ConfigManager;
  private iconState: TrayIconState = 'normal';
  private allHidden: boolean = false;

  // 外部注入的回调，由 main/index.ts 设置
  private onAddPet: () => void = () => {};
  private onOpenSettings: (petId?: string) => void = () => {};
  private onTogglePetVisibility: (petId: string) => void = () => {};
  private onRemovePet: (petId: string) => void = () => {};
  private onToggleAllVisibility: () => void = () => {};
  private onQuit: () => void = () => {};

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  // ==================== 初始化 ====================

  /**
   * 初始化系统托盘。
   * 必须在 app.whenReady() 之后调用。
   *
   * @param callbacks 外部注入的回调函数
   */
  initialize(callbacks: {
    onAddPet?: () => void;
    onOpenSettings?: (petId?: string) => void;
    onTogglePetVisibility?: (petId: string) => void;
    onRemovePet?: (petId: string) => void;
    onToggleAllVisibility?: () => void;
    onQuit?: () => void;
  }): void {
    // 注入回调
    if (callbacks.onAddPet) this.onAddPet = callbacks.onAddPet;
    if (callbacks.onOpenSettings) this.onOpenSettings = callbacks.onOpenSettings;
    if (callbacks.onTogglePetVisibility) this.onTogglePetVisibility = callbacks.onTogglePetVisibility;
    if (callbacks.onRemovePet) this.onRemovePet = callbacks.onRemovePet;
    if (callbacks.onToggleAllVisibility) this.onToggleAllVisibility = callbacks.onToggleAllVisibility;
    if (callbacks.onQuit) this.onQuit = callbacks.onQuit;

    // 创建托盘图标
    this.createTray();

    // 监听配置变更，自动刷新菜单
    this.configManager.onConfigChanged((event) => {
      this.refreshMenu();
    });

    console.log('[TrayManager] Initialized');
  }

  // ==================== 托盘创建 ====================

  /**
   * 创建系统托盘。
   */
  private createTray(): void {
    const iconPath = getIconPath('normal');

    // nativeImage.createFromPath 会根据平台自动选择合适的格式
    // Windows 上 .ico 文件会自动选取合适尺寸
    const icon = nativeImage.createFromPath(iconPath);

    // 如果图标加载失败 (文件不存在)，使用一个 16x16 的空图标作为 fallback
    if (icon.isEmpty()) {
      console.warn(
        `[TrayManager] Tray icon not found at: ${iconPath}`,
        '\n  Falling back to empty icon. Please provide a .ico (Windows) or .png file.'
      );
      // 创建一个 16x16 的纯色 fallback 图标
      const fallbackIcon = nativeImage.createEmpty();
      this.tray = new Tray(fallbackIcon);
    } else {
      this.tray = new Tray(icon);
    }

    // 设置提示文字
    this.tray.setToolTip('Desk-Idoll 桌面桌宠');

    // 绑定事件
    this.tray.on('click', () => this.handleTrayClick());
    this.tray.on('right-click', () => this.refreshMenu());

    // 初始化菜单
    this.refreshMenu();
  }

  // ==================== 菜单构建 ====================

  /**
   * 刷新右键菜单。
   * 每次配置变更时自动调用，也支持手动调用。
   */
  refreshMenu(): void {
    if (!this.tray) return;

    const pets = this.configManager.getPets();
    const menu = this.buildMenu(pets);
    this.tray.setContextMenu(menu);
  }

  /**
   * 构建右键菜单。
   *
   * 菜单结构:
   *   显示所有桌宠 / 隐藏所有桌宠  (根据当前状态显示其中一个)
   *   ---
   *   添加桌宠
   *   ---
   *   设置
   *   ---
   *   [桌宠1] → 显示 | 隐藏 | 编辑 | 删除
   *   [桌宠2] → 显示 | 隐藏 | 编辑 | 删除
   *   ...
   *   ---
   *   退出
   */
  private buildMenu(pets: PetConfig[]): Menu {
    const template: MenuItemConstructorOptions[] = [];

    // ---------- 全局显示/隐藏 ----------

    // 计算当前是否所有桌宠都已隐藏
    this.allHidden = pets.length > 0 && pets.every((pet) => !pet.visible);

    template.push({
      label: this.allHidden ? '显示所有桌宠' : '隐藏所有桌宠',
      click: () => {
        this.onToggleAllVisibility();
        this.updateIconState(this.allHidden ? 'normal' : 'hidden');
      },
    });

    template.push({ type: 'separator' });

    // ---------- 添加桌宠 ----------

    template.push({
      label: '添加桌宠',
      click: () => this.onAddPet(),
    });

    template.push({ type: 'separator' });

    // ---------- 设置 ----------

    template.push({
      label: '设置',
      click: () => this.onOpenSettings(),
    });

    template.push({ type: 'separator' });

    // ---------- 桌宠列表 (动态) ----------

    if (pets.length === 0) {
      template.push({
        label: '(暂无桌宠)',
        enabled: false,
      });
    } else {
      for (const pet of pets) {
        template.push({
          label: pet.name,
          submenu: [
            {
              label: pet.visible ? '隐藏' : '显示',
              click: () => this.onTogglePetVisibility(pet.id),
            },
            {
              label: '编辑',
              click: () => this.onOpenSettings(pet.id),
            },
            { type: 'separator' },
            {
              label: '删除',
              click: () => this.handleRemovePet(pet),
            },
          ],
        });
      }
    }

    template.push({ type: 'separator' });

    // ---------- 退出 ----------

    template.push({
      label: '退出',
      click: () => this.onQuit(),
    });

    return Menu.buildFromTemplate(template);
  }

  // ==================== 事件处理 ====================

  /**
   * 处理托盘图标左键点击。
   * 行为: 切换所有桌宠的显示/隐藏状态。
   */
  private handleTrayClick(): void {
    this.onToggleAllVisibility();

    // 更新图标状态
    const pets = this.configManager.getPets();
    const allHidden = pets.length > 0 && pets.every((pet) => !pet.visible);
    this.updateIconState(allHidden ? 'hidden' : 'normal');
  }

  /**
   * 处理删除桌宠操作。
   * 弹出确认对话框，确认后删除。
   */
  private async handleRemovePet(pet: PetConfig): Promise<void> {
    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['删除', '取消'],
      defaultId: 1, // 默认选中"取消"，防止误删
      cancelId: 1,
      title: '删除桌宠',
      message: `确认删除桌宠 "${pet.name}"？`,
      detail: '此操作不可撤销。桌宠配置将被永久删除。',
    });

    if (result.response === 0) {
      this.onRemovePet(pet.id);
    }
  }

  // ==================== 图标状态管理 ====================

  /**
   * 更新托盘图标状态。
   *
   * @param state 'normal' = 正常状态, 'hidden' = 所有桌宠已隐藏
   */
  updateIconState(state: TrayIconState): void {
    if (!this.tray || this.iconState === state) return;

    this.iconState = state;
    const iconPath = getIconPath(state);
    const icon = nativeImage.createFromPath(iconPath);

    if (!icon.isEmpty()) {
      this.tray.setImage(icon);
    }

    // 更新提示文字
    const tooltip = state === 'hidden'
      ? 'Desk-Idoll 桌面桌宠 (已隐藏)'
      : 'Desk-Idoll 桌面桌宠';
    this.tray.setToolTip(tooltip);
  }

  /**
   * 从外部同步图标状态。
   * 当桌宠可见性通过 IPC 等其他途径变更时调用。
   */
  syncIconState(): void {
    const pets = this.configManager.getPets();
    const allHidden = pets.length > 0 && pets.every((pet) => !pet.visible);
    this.updateIconState(allHidden ? 'hidden' : 'normal');
  }

  // ==================== 生命周期 ====================

  /**
   * 销毁托盘图标。
   * 在应用退出时调用。
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
      console.log('[TrayManager] Destroyed');
    }
  }
}
```

### 5.3 图标资源说明

托盘需要以下图标文件：

| 文件名 | 格式 | 尺寸 | 用途 |
|--------|------|------|------|
| `resources/tray-icon.ico` | ICO | 16x16 (含 32x32 可选) | Windows 正常状态 |
| `resources/tray-icon-hidden.ico` | ICO | 16x16 (含 32x32 可选) | Windows 隐藏状态 |
| `resources/tray-icon.png` | PNG | 16x16 或 22x22 | macOS / Linux 正常状态 |
| `resources/tray-icon-hidden.png` | PNG | 16x16 或 22x22 | macOS / Linux 隐藏状态 |

**Windows ICO 文件制作建议：**
- 使用 [RealWorld Cursor Editor](https://www.rw-designer.com/) 或在线工具 [ICO Convert](https://icoconvert.com/) 将 PNG 转换为 ICO
- ICO 文件内建议包含 16x16 和 32x32 两个尺寸，Windows 会根据 DPI 自动选取
- 背景透明，图标内容简洁 (建议使用桌宠剪影或应用 Logo)

---

## 6. IPC 通道注册 -- `src/main/ipc.ts`

将配置管理和托盘操作的 IPC 处理器注册到主进程。

```typescript
// ============================================================
// src/main/ipc.ts
// IPC 通道注册 — 桥接 Main Process 与 Renderer Process
// ============================================================

import { ipcMain, BrowserWindow } from 'electron';
import { ConfigManager } from './config-manager';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type {
  PetConfig,
  GlobalSettings,
  ConfigChangeEvent,
} from '../shared/types';

export function registerIpcHandlers(
  configManager: ConfigManager,
  callbacks: {
    openConfigWindow: (petId?: string) => void;
    closeConfigWindow: () => void;
    toggleAllPetsVisibility: () => void;
    togglePetVisibility: (petId: string) => void;
    removePetWindow: (petId: string) => void;
  }
): void {
  // ==================== 桌宠 CRUD ====================

  ipcMain.handle(IPC_CHANNELS.PET_ADD, async (_event, config) => {
    try {
      const newPet = configManager.addPet(config);
      return { success: true, data: newPet };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PET_REMOVE, async (_event, petId: string) => {
    try {
      // 先销毁桌宠窗口
      callbacks.removePetWindow(petId);
      // 再删除配置
      const result = configManager.removePet(petId);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PET_UPDATE, async (_event, payload: { id: string; partial: Partial<PetConfig> }) => {
    try {
      const updated = configManager.updatePet(payload.id, payload.partial);
      return { success: true, data: updated };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PET_LIST, async () => {
    return { success: true, data: configManager.getPets() };
  });

  ipcMain.handle(IPC_CHANNELS.PET_GET, async (_event, petId: string) => {
    const pet = configManager.getPet(petId);
    return pet
      ? { success: true, data: pet }
      : { success: false, error: `桌宠不存在: ${petId}` };
  });

  // ==================== 全局设置 ====================

  ipcMain.handle(IPC_CHANNELS.CONFIG_GET_GLOBAL, async () => {
    return { success: true, data: configManager.getGlobalSettings() };
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_SET_GLOBAL, async (_event, partial: Partial<GlobalSettings>) => {
    try {
      const updated = configManager.updateGlobalSettings(partial);
      return { success: true, data: updated };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_GET_ALL, async () => {
    return { success: true, data: configManager.getAll() };
  });

  // ==================== 托盘操作 ====================

  ipcMain.handle(IPC_CHANNELS.TRAY_ADD_PET, async () => {
    callbacks.openConfigWindow();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.TRAY_TOGGLE_VISIBILITY, async () => {
    callbacks.toggleAllPetsVisibility();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.TRAY_TOGGLE_PET_VISIBILITY, async (_event, petId: string) => {
    callbacks.togglePetVisibility(petId);
    return { success: true };
  });

  // ==================== 窗口控制 ====================

  ipcMain.handle(IPC_CHANNELS.WINDOW_OPEN_CONFIG, async (_event, petId?: string) => {
    callbacks.openConfigWindow(petId);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE_CONFIG, async () => {
    callbacks.closeConfigWindow();
    return { success: true };
  });

  // ==================== 配置变更广播 ====================

  /**
   * 监听配置变更，向所有打开的渲染窗口广播通知。
   * 这是 Main → Renderer 的单向通知机制。
   */
  configManager.onConfigChanged((event: ConfigChangeEvent) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.CONFIG_CHANGED, event);
      }
    }
  });

  console.log('[IPC] All handlers registered');
}
```

---

## 7. Preload 脚本 -- `src/preload/index.ts`

通过 `contextBridge` 安全地暴露 IPC 接口给渲染进程。

```typescript
// ============================================================
// src/preload/index.ts
// Preload 脚本 — 安全地暴露 IPC 接口给渲染进程
// ============================================================

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type {
  PetConfig,
  GlobalSettings,
  AppConfig,
  ConfigChangeEvent,
} from '../shared/types';

// ---------- IPC 返回值包装类型 ----------

interface IpcResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ---------- API 定义 ----------

const electronAPI = {
  // ---- 桌宠 CRUD ----

  addPet: (config: Omit<PetConfig, 'id' | 'createdAt' | 'updatedAt' | 'visible'>) =>
    ipcRenderer.invoke(IPC_CHANNELS.PET_ADD, config) as Promise<IpcResult<PetConfig>>,

  removePet: (petId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PET_REMOVE, petId) as Promise<IpcResult<boolean>>,

  updatePet: (id: string, partial: Partial<PetConfig>) =>
    ipcRenderer.invoke(IPC_CHANNELS.PET_UPDATE, { id, partial }) as Promise<IpcResult<PetConfig>>,

  listPets: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PET_LIST) as Promise<IpcResult<PetConfig[]>>,

  getPet: (petId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PET_GET, petId) as Promise<IpcResult<PetConfig>>,

  // ---- 全局设置 ----

  getGlobalSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_GLOBAL) as Promise<IpcResult<GlobalSettings>>,

  setGlobalSettings: (partial: Partial<GlobalSettings>) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET_GLOBAL, partial) as Promise<IpcResult<GlobalSettings>>,

  getAllConfig: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_ALL) as Promise<IpcResult<AppConfig>>,

  // ---- 托盘操作 ----

  trayAddPet: () =>
    ipcRenderer.invoke(IPC_CHANNELS.TRAY_ADD_PET) as Promise<IpcResult>,

  trayToggleVisibility: () =>
    ipcRenderer.invoke(IPC_CHANNELS.TRAY_TOGGLE_VISIBILITY) as Promise<IpcResult>,

  trayTogglePetVisibility: (petId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.TRAY_TOGGLE_PET_VISIBILITY, petId) as Promise<IpcResult>,

  // ---- 窗口控制 ----

  openConfigWindow: (petId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_OPEN_CONFIG, petId) as Promise<IpcResult>,

  closeConfigWindow: () =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE_CONFIG) as Promise<IpcResult>,

  // ---- 事件监听 (Main → Renderer) ----

  /**
   * 监听配置变更通知。
   * @returns 取消监听函数
   */
  onConfigChanged: (callback: (event: ConfigChangeEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ConfigChangeEvent) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.CONFIG_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CONFIG_CHANGED, handler);
  },

  /**
   * 监听单个桌宠可见性变更。
   */
  onPetVisibilityChanged: (callback: (data: { petId: string; visible: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { petId: string; visible: boolean }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.PET_VISIBILITY_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PET_VISIBILITY_CHANGED, handler);
  },

  /**
   * 监听所有桌宠可见性变更。
   */
  onAllPetsVisibilityChanged: (callback: (data: { visible: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { visible: boolean }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.ALL_PETS_VISIBILITY_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ALL_PETS_VISIBILITY_CHANGED, handler);
  },
};

// ---------- 暴露到 window.electronAPI ----------

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// ---------- TypeScript 类型声明 (供渲染进程使用) ----------

export type ElectronAPI = typeof electronAPI;
```

渲染进程的类型声明文件：

```typescript
// ============================================================
// src/renderer/types/electron.d.ts
// 渲染进程的 Electron API 类型声明
// ============================================================

import type { ElectronAPI } from '../../preload/index';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

---

## 8. 主进程入口集成 -- `src/main/index.ts` (相关片段)

以下展示 ConfigManager 和 TrayManager 如何在主进程入口中集成。

```typescript
// ============================================================
// src/main/index.ts (相关片段)
// 展示 ConfigManager 和 TrayManager 的初始化与集成
// ============================================================

import { app, BrowserWindow } from 'electron';
import { ConfigManager } from './config-manager';
import { TrayManager } from './tray';
import { registerIpcHandlers } from './ipc';

// 全局引用，防止 GC 回收
let configManager: ConfigManager;
let trayManager: TrayManager;

// 简化的窗口管理引用 (实际实现在 pet-window.ts / config-window.ts)
const petWindows = new Map<string, BrowserWindow>();
let configWindow: BrowserWindow | null = null;
let allPetsVisible = true;

app.whenReady().then(() => {
  // 1. 初始化配置管理器 (必须最先初始化)
  configManager = ConfigManager.getInstance();

  // 2. 初始化托盘管理器
  trayManager = new TrayManager(configManager);
  trayManager.initialize({
    onAddPet: () => openConfigWindow(),
    onOpenSettings: (petId?: string) => openConfigWindow(petId),
    onTogglePetVisibility: (petId: string) => togglePetVisibility(petId),
    onRemovePet: (petId: string) => removePetAndWindow(petId),
    onToggleAllVisibility: () => toggleAllPetsVisibility(),
    onQuit: () => {
      trayManager.destroy();
      app.quit();
    },
  });

  // 3. 注册 IPC 处理器
  registerIpcHandlers(configManager, {
    openConfigWindow,
    closeConfigWindow,
    toggleAllPetsVisibility,
    togglePetVisibility,
    removePetWindow: (petId: string) => {
      const win = petWindows.get(petId);
      if (win && !win.isDestroyed()) {
        win.destroy();
        petWindows.delete(petId);
      }
    },
  });

  // 4. 恢复上次保存的桌宠
  restorePets();
});

// ---------- 辅助函数 ----------

function openConfigWindow(petId?: string): void {
  if (configWindow && !configWindow.isDestroyed()) {
    configWindow.focus();
    if (petId) {
      configWindow.webContents.send('edit-pet', petId);
    }
    return;
  }
  // ... 创建配置窗口的完整逻辑 (见 pet-window.ts)
}

function closeConfigWindow(): void {
  if (configWindow && !configWindow.isDestroyed()) {
    configWindow.close();
    configWindow = null;
  }
}

function togglePetVisibility(petId: string): void {
  const pet = configManager.getPet(petId);
  if (!pet) return;

  const newVisible = !pet.visible;
  configManager.updatePet(petId, { visible: newVisible });

  const win = petWindows.get(petId);
  if (win && !win.isDestroyed()) {
    newVisible ? win.show() : win.hide();
  }

  // 通知所有窗口
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send('pet:visibility-changed', { petId, visible: newVisible });
  });

  // 同步托盘图标
  trayManager.syncIconState();
}

function toggleAllPetsVisibility(): void {
  const pets = configManager.getPets();
  allPetsVisible = !allPetsVisible;

  for (const pet of pets) {
    if (pet.visible !== allPetsVisible) {
      configManager.updatePet(pet.id, { visible: allPetsVisible });
    }
    const win = petWindows.get(pet.id);
    if (win && !win.isDestroyed()) {
      allPetsVisible ? win.show() : win.hide();
    }
  }

  // 通知所有窗口
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send('all-pets:visibility-changed', { visible: allPetsVisible });
  });

  trayManager.updateIconState(allPetsVisible ? 'normal' : 'hidden');
}

function removePetAndWindow(petId: string): void {
  const win = petWindows.get(petId);
  if (win && !win.isDestroyed()) {
    win.destroy();
    petWindows.delete(petId);
  }
  configManager.removePet(petId);
  trayManager.syncIconState();
}

function restorePets(): void {
  const pets = configManager.getPets();
  console.log(`[App] Restoring ${pets.length} pets...`);
  // ... 为每个 visible 的桌宠创建窗口 (见 pet-window.ts)
}

// ---------- 应用退出 ----------

app.on('window-all-closed', () => {
  // 桌面桌宠应用在所有窗口关闭后不退出，只通过托盘退出
  // macOS 上也是如此，因为这是一个桌面驻留应用
  // 不调用 app.quit()
});

app.on('before-quit', () => {
  trayManager?.destroy();
  ConfigManager.destroyInstance();
});
```

---

## 9. 配置数据验证补充

### 9.1 运行时验证工具

除了 electron-store 的 schema 验证外，提供独立的验证工具函数，用于渲染进程侧的表单提交前校验。

```typescript
// ============================================================
// src/shared/validation.ts
// 配置数据验证工具
// ============================================================

import type { PetConfig, GlobalSettings, AppConfig } from './types';

// ---------- 验证结果 ----------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ---------- 桌宠配置验证 ----------

/**
 * 验证桌宠配置。
 * 在渲染进程的表单提交前调用，在提交到 Main Process 前做客户端校验。
 */
export function validatePetConfig(
  config: Partial<PetConfig>,
  existingPets: PetConfig[] = [],
  isUpdate: boolean = false
): ValidationResult {
  const errors: string[] = [];

  // 名称
  if (!config.name || config.name.trim().length === 0) {
    errors.push('桌宠名称不能为空');
  } else if (config.name.length > 30) {
    errors.push('桌宠名称不能超过 30 个字符');
  } else if (
    existingPets.some(
      (p) => p.name === config.name && (!isUpdate || p.id !== config.id)
    )
  ) {
    errors.push(`桌宠名称 "${config.name}" 已存在`);
  }

  // 模型类型
  if (config.modelType && !['sprite-sheet', 'live2d'].includes(config.modelType)) {
    errors.push('无效的模型类型');
  }

  // 模型路径
  if (!config.modelPath || config.modelPath.trim().length === 0) {
    errors.push('模型文件路径不能为空');
  }

  // 尺寸
  if (config.size) {
    if (config.size.width < 32 || config.size.width > 1024) {
      errors.push('宽度必须在 32-1024 之间');
    }
    if (config.size.height < 32 || config.size.height > 1024) {
      errors.push('高度必须在 32-1024 之间');
    }
  }

  // 透明度
  if (config.opacity !== undefined) {
    if (config.opacity < 0 || config.opacity > 1) {
      errors.push('透明度必须在 0-1 之间');
    }
  }

  // Sprite Sheet 动画配置
  if (config.animations && config.animations.type === 'sprite-sheet') {
    const anim = config.animations;
    if (anim.frameWidth <= 0 || anim.frameHeight <= 0) {
      errors.push('帧尺寸必须大于 0');
    }
    if (anim.fps < 1 || anim.fps > 120) {
      errors.push('帧率必须在 1-120 之间');
    }
    for (const [state, range] of Object.entries(anim.states)) {
      if (range.start < 0) {
        errors.push(`${state} 起始帧不能为负数`);
      }
      if (range.end < range.start) {
        errors.push(`${state} 结束帧不能小于起始帧`);
      }
    }
  }

  // 行为配置
  if (config.behavior) {
    const b = config.behavior;
    if (b.walkSpeed < 0.1 || b.walkSpeed > 20) {
      errors.push('行走速度必须在 0.1-20 之间');
    }
    if (b.idleTimeout < 500 || b.idleTimeout > 60000) {
      errors.push('待机超时必须在 500-60000ms 之间');
    }
  }

  // 动作列表
  if (config.actions && config.actions.length > 20) {
    errors.push('自定义动作不能超过 20 个');
  }
  if (config.actions) {
    for (const action of config.actions) {
      if (!action.name || action.name.trim().length === 0) {
        errors.push('动作名称不能为空');
      }
      if (!action.payload || action.payload.trim().length === 0) {
        errors.push(`动作 "${action.name}" 的执行内容不能为空`);
      }
      if (action.type === 'open-url') {
        try {
          new URL(action.payload);
        } catch {
          errors.push(`动作 "${action.name}" 的 URL 格式无效`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------- 全局设置验证 ----------

export function validateGlobalSettings(
  settings: Partial<GlobalSettings>
): ValidationResult {
  const errors: string[] = [];

  if (settings.language !== undefined) {
    if (settings.language.length < 2 || settings.language.length > 10) {
      errors.push('语言代码长度必须在 2-10 之间');
    }
  }

  return { valid: errors.length === 0, errors };
}
```

### 9.2 配置迁移详细说明

配置迁移在 `ConfigManager` 构造时自动执行。以下是一个完整的迁移示例：

```typescript
// ============================================================
// 配置迁移示例
// 当需要修改 schema 时，在 migrations 数组中追加记录
// ============================================================

// 假设 CONFIG_VERSION 从 1 升级到 2:
// 新增字段 globalSettings.darkMode，桌宠新增字段 pet.scripts

const migrations: Migration[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: (config) => {
      // 1. 给 globalSettings 添加 darkMode 字段
      const globalSettings = {
        ...(config.globalSettings as Record<string, unknown>),
        darkMode: false,  // 默认值
      };

      // 2. 给每个桌宠添加 scripts 字段
      const pets = ((config.pets as unknown[]) || []).map((pet) => ({
        ...(pet as Record<string, unknown>),
        scripts: [],  // 默认空数组
      }));

      return {
        ...config,
        version: 2,
        globalSettings,
        pets,
      };
    },
  },
];
```

迁移流程：

```
config.json (v1) → migrateConfig() → config.json (v2)
                   ↓
          1. 按 fromVersion 升序排列待执行迁移
          2. 依次执行每个迁移函数
          3. 任一迁移失败则停止，保留已迁移的状态
          4. 最终写入 electron-store
```

---

## 10. 模块交互时序图

### 10.1 添加桌宠流程

```
用户                  Tray               Main(ipc.ts)         ConfigManager        PetWindow
 |                     |                     |                     |                  |
 |-- 右键"添加桌宠" -->|                     |                     |                  |
 |                     |-- onAddPet() ------>|                     |                  |
 |                     |                     |-- openConfigWindow()>|                  |
 |                     |                     |                     |                  |
 |                     |                     |<--- 配置窗口打开 ---|                  |
 |<-------------------------------------------------- 显示配置窗口 -----------------|
 |                     |                     |                     |                  |
 | (用户填写配置，点击保存)                    |                     |                  |
 |-------------------- addPet(config) ----->|                     |                  |
 |                     |                     |-- pet:add handler ->|                  |
 |                     |                     |                     |-- addPet() ----->|
 |                     |                     |                     |   (验证 + 存储)  |
 |                     |                     |                     |-- emit change -->|
 |                     |<--- refreshMenu() --|<--- onConfigChanged |                  |
 |                     |                     |                     |                  |
 |                     |                     |-- 返回新 PetConfig ----------------->|
 |                     |                     |                     |         创建窗口 |
```

### 10.2 配置变更广播流程

```
ConfigManager          ipc.ts (事件监听)      BrowserWindow 1     BrowserWindow 2
    |                       |                       |                   |
    |-- emit change ------->|                       |                   |
    |                       |-- send(CONFIG_CHANGED)>|                   |
    |                       |-- send(CONFIG_CHANGED)-------------------->|
    |                       |                       |                   |
    |                       |                 更新 UI / 刷新数据         |
```

---

## 11. 错误处理策略

| 场景 | 处理方式 |
|------|----------|
| 配置文件不存在 | electron-store 自动创建，使用 `DEFAULT_CONFIG` |
| 配置文件 JSON 格式错误 | electron-store 抛出异常，由 `clearInvalidConfig: false` 保留文件，上层捕获并提示用户 |
| Schema 验证失败 | electron-store 的 ajv 验证会抛出 ValidationError，主进程捕获并通过 dialog 提示 |
| 托盘图标文件缺失 | `TrayManager.createTray()` 检测 `icon.isEmpty()`，使用 fallback 空图标并打印警告 |
| 桌宠名称重复 | `addPet()` / `updatePet()` 抛出明确错误，IPC handler 返回 `{ success: false, error }` |
| 桌宠数量超限 (50) | `addPet()` 抛出错误，渲染进程收到后显示提示 |
| 配置迁移失败 | 捕获异常并打印日志，停止后续迁移，保留当前状态 |

---

## 12. 测试要点

| 测试类别 | 测试项 |
|----------|--------|
| **ConfigManager** | 单例获取一致性 |
| | addPet 生成正确的 id/createdAt/updatedAt |
| | addPet 名称重复时抛出错误 |
| | updatePet 部分更新保留未修改字段 |
| | removePet 后 getPets 不再包含该桌宠 |
| | getGlobalSettings 返回默认值 |
| | updateGlobalSettings 部分更新 |
| | onConfigChanged 回调正确触发 |
| | 配置迁移 v1 → v2 正确执行 |
| **TrayManager** | initialize 后托盘图标存在 |
| | 菜单包含所有必要项 |
| | 桌宠列表动态更新 |
| | 图标状态切换正常 |
| | 删除桌宠时弹出确认框 |
| **验证** | validatePetConfig 正确检测各类错误 |
| | validateGlobalSettings 正确检测错误 |
| **IPC** | 所有通道返回正确格式 { success, data/error } |
| | 错误情况下返回 success: false |
