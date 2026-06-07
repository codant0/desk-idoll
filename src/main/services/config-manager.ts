// src/main/services/config-manager.ts

import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import type { AppConfig, PetConfig, GlobalSettings } from '../../shared/types'
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_PET_CONFIG } from '../../shared/constants'

/**
 * electron-store 的 Schema 定义
 * conf 包会自动包裹 { type: 'object', properties: schema }
 * 所以这里只需提供顶层属性的定义
 */
const configSchema = {
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
            height: { type: 'number' }
          }
        },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' }
          }
        },
        opacity: { type: 'number', minimum: 0, maximum: 1 },
        zIndex: { type: 'number' },
        actions: {
          type: 'array',
          items: {
            type: 'object'
          }
        },
        behavior: {
          type: 'object'
        }
      },
      required: ['id', 'name', 'modelType']
    }
  },
  globalSettings: {
    type: 'object',
    properties: {
      language: { type: 'string' },
      autoStart: { type: 'boolean' },
      checkUpdate: { type: 'boolean' },
      maxInstances: { type: 'number' }
    }
  }
} as const

export class ConfigManager {
  private store: Store<AppConfig>

  constructor() {
    this.store = new Store<AppConfig>({
      name: 'desk-idoll-config',
      schema: configSchema as any,
      // 默认配置（首次启动时使用）
      defaults: {
        pets: [],
        globalSettings: { ...DEFAULT_GLOBAL_SETTINGS }
      },
      // 开发模式下配置文件放在项目目录，方便调试
      cwd: undefined,
      clearInvalidConfig: true
    })
  }

  // ============================================================
  // 1. 默认配置定义
  // ============================================================

  /**
   * 创建默认桌宠配置
   * 首次启动时使用，或用户添加新桌宠时的模板
   */
  createDefaultPet(): PetConfig {
    const now = new Date().toISOString()
    return {
      id: randomUUID(),
      name: DEFAULT_PET_CONFIG.name,
      modelType: DEFAULT_PET_CONFIG.modelType,
      modelPath: DEFAULT_PET_CONFIG.modelPath,
      size: { ...DEFAULT_PET_CONFIG.size },
      position: { ...DEFAULT_PET_CONFIG.position },
      opacity: DEFAULT_PET_CONFIG.opacity,
      zIndex: DEFAULT_PET_CONFIG.zIndex,
      animations: { ...DEFAULT_PET_CONFIG.animations },
      actions: [
        {
          id: randomUUID(),
          trigger: 'left-click',
          type: 'show-message',
          payload: 'Hello! I am your desktop pet!',
          name: '打招呼',
          confirmBeforeExecute: false
        }
      ],
      behavior: { ...DEFAULT_PET_CONFIG.behavior },
      enabled: true,
      createdAt: now,
      updatedAt: now
    }
  }

  // ============================================================
  // 2. 配置读写方法
  // ============================================================

  /**
   * 获取完整应用配置
   */
  getConfig(): AppConfig {
    return this.store.store
  }

  /**
   * 设置完整应用配置
   */
  setConfig(config: AppConfig): void {
    this.store.store = config
  }

  /**
   * 获取指定桌宠配置
   */
  getPetConfig(petId: string): PetConfig | undefined {
    return this.store.get('pets').find((p) => p.id === petId)
  }

  /**
   * 更新指定桌宠配置（部分更新，合并到现有配置）
   * @param petId 桌宠 ID
   * @param updates 要更新的字段
   */
  updatePetConfig(petId: string, updates: Partial<PetConfig>): void {
    const pets = this.store.get('pets')
    const index = pets.findIndex((p) => p.id === petId)
    if (index === -1) return

    // 深合并更新
    pets[index] = deepMerge(
      pets[index] as unknown as Record<string, unknown>,
      updates as unknown as Partial<Record<string, unknown>>
    ) as unknown as PetConfig
    this.store.set('pets', pets)
    this.notifyChange()
  }

  /**
   * 添加新桌宠配置
   */
  addPet(petConfig: PetConfig): void {
    const pets = this.store.get('pets')
    pets.push(petConfig)
    this.store.set('pets', pets)
    this.notifyChange()
  }

  /**
   * 删除指定桌宠配置
   */
  removePet(petId: string): void {
    const pets = this.store.get('pets')
    const filtered = pets.filter((p) => p.id !== petId)
    this.store.set('pets', filtered)
    this.notifyChange()
  }

  /**
   * 获取全局设置
   */
  getGlobalSettings(): GlobalSettings {
    return this.store.get('globalSettings')
  }

  /**
   * 更新全局设置
   */
  updateGlobalSettings(settings: Partial<GlobalSettings>): void {
    const current = this.store.get('globalSettings')
    this.store.set('globalSettings', { ...current, ...settings })
    this.notifyChange()
  }

  /**
   * 获取所有桌宠配置列表（便捷方法）
   */
  getPets(): PetConfig[] {
    return this.store.get('pets')
  }

  /**
   * 注册配置变更监听器
   * 当配置发生变更时调用回调函数
   */
  onConfigChanged(callback: () => void): void {
    this._changeListeners.push(callback)
  }

  /**
   * 通知所有监听器配置已变更
   */
  notifyChange(): void {
    for (const listener of this._changeListeners) {
      listener()
    }
  }

  /** 配置变更监听器列表 */
  private _changeListeners: Array<() => void> = []

  /**
   * 获取配置文件在磁盘上的路径（调试用）
   */
  getConfigPath(): string {
    return this.store.path
  }
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 深合并两个对象（仅合并第一层和第二层）
 * 不会合并数组（数组整体替换）
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target }
  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key]
    const targetVal = target[key]

    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      ) as T[keyof T]
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T]
    }
  }
  return result
}
