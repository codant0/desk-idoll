// src/main/windows/pet-window.ts

import { app, BrowserWindow, screen } from 'electron'
import path from 'node:path'
import { ConfigManager } from '../services/config-manager'
import type { PetConfig } from '../../shared/types'

/**
 * 单个桌宠窗口的运行时数据
 */
interface PetWindowEntry {
  window: BrowserWindow
  config: PetConfig
}

export class PetWindowManager {
  /** 所有活跃的桌宠窗口 Map<petId, PetWindowEntry> */
  private windows: Map<string, PetWindowEntry> = new Map()

  /** 配置管理器引用 */
  private configManager: ConfigManager

  // ponytail: cached display bounds, refresh on display-change event
  private cachedDisplayBounds = { minX: 0, minY: 0, maxX: 1920, maxY: 1080 }

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
    this.refreshDisplayBounds()
    screen.on('display-metrics-changed', () => this.refreshDisplayBounds())
  }

  private refreshDisplayBounds(): void {
    const displays = screen.getAllDisplays()
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const d of displays) {
      const { x, y, width, height } = d.bounds
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x + width)
      maxY = Math.max(maxY, y + height)
    }
    this.cachedDisplayBounds = { minX, minY, maxX, maxY }
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
      const entry = this.windows.get(petConfig.id)!
      entry.window.focus()
      return entry.window
    }

    // 获取主显示器的工作区域（用于窗口定位）
    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize

    // 窗口大小：使用配置中的尺寸
    const windowWidth = petConfig.size.width
    const windowHeight = petConfig.size.height

    // 窗口初始位置：使用配置中的位置，或默认居中于屏幕底部
    const windowX = petConfig.position.x ?? Math.floor((workArea.width - windowWidth) / 2)
    const windowY = petConfig.position.y ?? workArea.height - windowHeight

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
      transparent: true, // 窗口背景完全透明
      frame: false, // 无边框（无标题栏、无窗口控件）
      hasShadow: false, // 去除窗口阴影

      // ---- 桌宠行为配置 ----
      alwaysOnTop: true, // 始终在最前
      skipTaskbar: true, // 不在任务栏显示
      resizable: false, // 不可调整大小
      movable: false, // 禁止系统级拖拽（我们自己处理拖拽）
      focusable: true, // 需要可聚焦才能接收鼠标事件

      // ---- 窗口外观 ----
      type: 'toolbar', // 工具栏窗口类型，进一步减少系统 UI 干预
      show: false, // 先隐藏，等内容加载完成后再显示

      // ---- Web 偏好设置 ----
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true, // 开启上下文隔离
        nodeIntegration: false, // 禁止渲染进程直接使用 Node.js
        sandbox: true, // 启用沙箱
        devTools: !app.isPackaged // 开发模式允许 DevTools
      }
    })

    // ---- 设置窗口层级 ----
    // zIndex 越大越在前面，映射到 Electron 的窗口层级
    if (petConfig.zIndex > 0) {
      petWindow.setAlwaysOnTop(true, 'screen-saver')
    }

    // ---- 设置窗口透明度 ----
    petWindow.setOpacity(petConfig.opacity)

    // ---- 默认开启点击穿透 ----
    // forward: true 让鼠标事件可以被转发（配合 forward 事件实现穿透检测）
    petWindow.setIgnoreMouseEvents(true, { forward: true })

    // ---- 加载渲染进程页面 ----
    if (process.env.ELECTRON_RENDERER_URL) {
      // electron-vite 开发模式下的 URL
      await petWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/src/renderer/index.html`)
    } else {
      // 生产模式下加载打包后的文件
      await petWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

    // ---- 窗口加载完成后显示 ----
    petWindow.once('ready-to-show', () => {
      petWindow.show()
      petWindow.setOpacity(petConfig.opacity)
    })

    // ---- 注册窗口事件 ----
    this.setupWindowEvents(petWindow, petConfig)

    // ---- 存储窗口记录 ----
    const entry: PetWindowEntry = {
      window: petWindow,
      config: petConfig
    }
    this.windows.set(petConfig.id, entry)

    return petWindow
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
    const entry = this.windows.get(petId)
    if (!entry) return

    const { window } = entry

    if (interactive) {
      // 进入交互模式：捕获鼠标事件，不穿透
      window.setIgnoreMouseEvents(false)
    } else {
      // 退出交互模式：忽略鼠标事件，但转发以检测进入/离开
      window.setIgnoreMouseEvents(true, { forward: true })
    }
  }

  /**
   * 为指定窗口设置交互状态（通过窗口实例）
   * 供 IPC 直接使用，不依赖 petId
   */
  setInteractiveByWindow(window: BrowserWindow, interactive: boolean): void {
    if (interactive) {
      window.setIgnoreMouseEvents(false)
    } else {
      window.setIgnoreMouseEvents(true, { forward: true })
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
    const entry = this.windows.get(petId)
    if (!entry) return

    // 丢弃无效坐标
    if (!Number.isFinite(x) || !Number.isFinite(y)) return

    // 获取窗口当前尺寸
    const [width, height] = entry.window.getSize()

    // 使用缓存的显示器边界（避免每帧调用 screen.getAllDisplays）
    const { minX, minY, maxX, maxY } = this.cachedDisplayBounds

    // 限制坐标在屏幕范围内，转为整数（setPosition 要求整数参数）
    const clampedX = Math.round(Math.max(minX, Math.min(x, maxX - width)))
    const clampedY = Math.round(Math.max(minY, Math.min(y, maxY - height)))

    entry.window.setPosition(clampedX, clampedY)
  }

  /**
   * 保存所有桌宠窗口的当前位置到配置
   */
  saveAllWindowPositions(): void {
    for (const [petId, entry] of this.windows) {
      const [x, y] = entry.window.getPosition()
      this.configManager.updatePetConfig(petId, {
        position: { x, y }
      })
    }
  }

  // ============================================================
  // 4. 窗口生命周期管理
  // ============================================================

  /**
   * 获取指定桌宠的窗口实例
   */
  getWindow(petId: string): BrowserWindow | undefined {
    return this.windows.get(petId)?.window
  }

  /**
   * 根据窗口实例反查桌宠 ID
   */
  getPetIdByWindow(win: BrowserWindow): string | undefined {
    for (const [petId, entry] of this.windows) {
      if (entry.window === win) return petId
    }
    return undefined
  }

  /**
   * 获取第一个桌宠窗口（用于单实例聚焦）
   */
  static getFirstWindow(): BrowserWindow | undefined {
    const allWindows = BrowserWindow.getAllWindows()
    return allWindows.length > 0 ? allWindows[0] : undefined
  }

  /**
   * 获取所有桌宠窗口 ID 列表
   */
  getAllPetIds(): string[] {
    return Array.from(this.windows.keys())
  }

  /**
   * 销毁指定桌宠窗口
   */
  destroyPetWindow(petId: string): void {
    const entry = this.windows.get(petId)
    if (!entry) return

    // 保存最终位置
    const [x, y] = entry.window.getPosition()
    this.configManager.updatePetConfig(petId, {
      position: { x, y }
    })

    // 关闭窗口
    if (!entry.window.isDestroyed()) {
      entry.window.destroy()
    }

    // 从 Map 中移除
    this.windows.delete(petId)
  }

  /**
   * 销毁所有桌宠窗口
   */
  destroyAll(): void {
    for (const petId of this.windows.keys()) {
      this.destroyPetWindow(petId)
    }
  }

  /**
   * 隐藏所有桌宠窗口
   */
  hideAll(): void {
    for (const entry of this.windows.values()) {
      entry.window.hide()
    }
  }

  /**
   * 显示所有桌宠窗口
   */
  showAll(): void {
    for (const entry of this.windows.values()) {
      entry.window.show()
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
      this.windows.delete(petConfig.id)
    })

    // ---- 窗口移动时同步位置到配置（节流：每 500ms 保存一次） ----
    let saveTimeout: ReturnType<typeof setTimeout> | null = null
    petWindow.on('move', () => {
      if (saveTimeout) clearTimeout(saveTimeout)
      saveTimeout = setTimeout(() => {
        const [x, y] = petWindow.getPosition()
        this.configManager.updatePetConfig(petConfig.id, {
          position: { x, y }
        })
      }, 500)
    })
  }

  // ============================================================
  // 6. 获取桌宠配置
  // ============================================================

  /**
   * 获取指定桌宠的运行时配置
   */
  getPetConfig(petId: string): PetConfig | undefined {
    return this.windows.get(petId)?.config
  }

  /**
   * 更新指定桌宠的运行时配置引用
   */
  updatePetConfigRef(petId: string, config: PetConfig): void {
    const entry = this.windows.get(petId)
    if (entry) {
      entry.config = config
    }
  }
}
