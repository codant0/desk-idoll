// src/main/windows/config-window.ts

import { BrowserWindow, screen } from 'electron'
import path from 'node:path'

export class ConfigWindowManager {
  /** 配置窗口实例（单例，同一时间只允许一个配置窗口） */
  private window: BrowserWindow | null = null

  /** 当前正在编辑的桌宠 ID */
  private currentPetId: string | null = null

  /** 标记是否正在退出应用（控制窗口是否真正关闭） */
  private isAppQuitting = false

  constructor() {}

  // ============================================================
  // 1. 显示配置窗口
  // ============================================================

  /**
   * 显示配置窗口（如果已存在则聚焦并更新目标桌宠）
   * @param petId 可选，指定要编辑的桌宠 ID
   */
  async show(petId?: string): Promise<void> {
    this.currentPetId = petId ?? null

    if (this.window && !this.window.isDestroyed()) {
      // 窗口已存在，聚焦并通知渲染进程切换到指定桌宠
      this.window.focus()
      if (petId) {
        this.window.webContents.send('switch-to-pet', petId)
      }
      return
    }

    await this.createWindow()
  }

  /**
   * 隐藏配置窗口（不销毁，下次 show 时复用）
   */
  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide()
    }
  }

  /**
   * 销毁配置窗口
   */
  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
  }

  /**
   * 获取配置窗口实例
   */
  getWindow(): BrowserWindow | null {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }
    return null
  }

  /**
   * 配置窗口是否可见
   */
  isVisible(): boolean {
    return this.window !== null && !this.window.isDestroyed() && this.window.isVisible()
  }

  // ============================================================
  // 2. 内部：创建配置窗口
  // ============================================================

  private async createWindow(): Promise<void> {
    // 计算窗口尺寸和位置（居中显示）
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

    const windowWidth = Math.min(800, screenWidth - 100)
    const windowHeight = Math.min(650, screenHeight - 100)
    const windowX = Math.floor((screenWidth - windowWidth) / 2)
    const windowY = Math.floor((screenHeight - windowHeight) / 2)

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
      show: false, // 先隐藏，加载完成后再显示

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
        sandbox: true
      }
    })

    // ---- 加载配置窗口页面 ----
    if (process.env.ELECTRON_RENDERER_URL) {
      await this.window.loadURL(
        `${process.env.ELECTRON_RENDERER_URL}/config/index.html`
      )
    } else {
      await this.window.loadFile(path.join(__dirname, '../renderer/config/index.html'))
    }

    // ---- 窗口加载完成 ----
    this.window.once('ready-to-show', () => {
      this.window!.show()

      // 如果有指定的桌宠 ID，通知渲染进程
      if (this.currentPetId) {
        this.window!.webContents.send('switch-to-pet', this.currentPetId)
      }
    })

    // ---- 窗口关闭事件 ----
    // 使用 hide 代替 close，实现"关闭后复用"
    this.window.on('close', (event) => {
      // 不真正关闭，只是隐藏（除非应用正在退出）
      if (!this.isAppQuitting) {
        event.preventDefault()
        this.window!.hide()
      }
    })

    this.window.on('closed', () => {
      this.window = null
      this.currentPetId = null
    })

    // ---- 阻止配置窗口内打开新窗口 ----
    this.window.webContents.setWindowOpenHandler(() => {
      return { action: 'deny' }
    })
  }

  /**
   * 标记应用正在退出，允许窗口真正关闭
   * 应在 app.before-quit 事件中调用
   */
  markAppQuitting(): void {
    this.isAppQuitting = true
  }
}
