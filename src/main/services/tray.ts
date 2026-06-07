// ============================================================
// src/main/services/tray.ts
// 系统托盘管理器
// ============================================================

import {
  Tray,
  Menu,
  nativeImage,
  app,
  dialog,
  type MenuItemConstructorOptions
} from 'electron'
import path from 'path'
import { ConfigManager } from './config-manager'
import { t, setLocale } from '../../shared/i18n'
import type { PetConfig, TrayIconState } from '../../shared/types'

// ---------- 图标路径 ----------

/**
 * 获取图标资源路径。
 * 开发模式下从项目根目录读取，打包后从 resources 目录读取。
 *
 * Windows: 使用 .ico 格式 (16x16) 以确保高 DPI 下正常显示。
 * macOS / Linux: 使用 .png。
 *
 * 如果指定图标不存在，回退到默认图标。
 */
function getIconPath(state: TrayIconState): string {
  const isPackaged = app.isPackaged

  const baseDir = isPackaged
    ? process.resourcesPath
    : path.join(app.getAppPath(), 'resources')

  if (process.platform === 'win32') {
    return state === 'hidden'
      ? path.join(baseDir, 'tray-icon-hidden.ico')
      : path.join(baseDir, 'tray-icon.ico')
  }

  return state === 'hidden'
    ? path.join(baseDir, 'tray-icon-hidden.png')
    : path.join(baseDir, 'tray-icon.png')
}

/**
 * 尝试加载图标，如果指定状态的图标不存在则回退到 normal 状态图标。
 * 如果 normal 图标也不存在，返回空图标。
 */
function loadIcon(state: TrayIconState): Electron.NativeImage {
  let iconPath = getIconPath(state)
  let icon = nativeImage.createFromPath(iconPath)

  // 如果隐藏状态图标不存在，回退到正常图标
  if (icon.isEmpty() && state === 'hidden') {
    iconPath = getIconPath('normal')
    icon = nativeImage.createFromPath(iconPath)
  }

  if (icon.isEmpty()) {
    console.warn(
      `[TrayManager] Tray icon not found at: ${iconPath}`,
      '\n  Please provide tray-icon.ico (Windows) or tray-icon.png (macOS/Linux) in the resources directory.'
    )
  }

  return icon
}

// ---------- TrayManager 类 ----------

export class TrayManager {
  private tray: Tray | null = null
  private configManager: ConfigManager
  private iconState: TrayIconState = 'normal'
  private allHidden: boolean = false

  // 外部注入的回调，由 main/index.ts 设置
  private onAddPet: () => void = () => {}
  private onOpenSettings: (petId?: string) => void = () => {}
  private onTogglePetVisibility: (petId: string) => void = () => {}
  private onRemovePet: (petId: string) => void = () => {}
  private onToggleAllVisibility: () => void = () => {}
  private onQuit: () => void = () => {}

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
  }

  // ==================== 初始化 ====================

  /**
   * 初始化系统托盘。
   * 必须在 app.whenReady() 之后调用。
   *
   * @param callbacks 外部注入的回调函数
   */
  initialize(callbacks: {
    onAddPet?: () => void
    onOpenSettings?: (petId?: string) => void
    onTogglePetVisibility?: (petId: string) => void
    onRemovePet?: (petId: string) => void
    onToggleAllVisibility?: () => void
    onQuit?: () => void
  }): void {
    if (callbacks.onAddPet) this.onAddPet = callbacks.onAddPet
    if (callbacks.onOpenSettings) this.onOpenSettings = callbacks.onOpenSettings
    if (callbacks.onTogglePetVisibility)
      this.onTogglePetVisibility = callbacks.onTogglePetVisibility
    if (callbacks.onRemovePet) this.onRemovePet = callbacks.onRemovePet
    if (callbacks.onToggleAllVisibility)
      this.onToggleAllVisibility = callbacks.onToggleAllVisibility
    if (callbacks.onQuit) this.onQuit = callbacks.onQuit

    // 同步语言设置
    const settings = this.configManager.getGlobalSettings()
    setLocale(settings.language === 'en' ? 'en' : 'zh-CN')

    this.createTray()

    // 监听配置变更，自动刷新菜单
    this.configManager.onConfigChanged(() => {
      const s = this.configManager.getGlobalSettings()
      setLocale(s.language === 'en' ? 'en' : 'zh-CN')
      this.refreshMenu()
    })

    console.log('[TrayManager] Initialized')
  }

  // ==================== 托盘创建 ====================

  private createTray(): void {
    const icon = loadIcon('normal')

    // 如果图标为空，使用 nativeImage.createEmpty() 作为 fallback
    this.tray = icon.isEmpty() ? new Tray(nativeImage.createEmpty()) : new Tray(icon)

    this.tray.setToolTip('Desk-Idoll')

    // 左键点击: 切换所有桌宠显示/隐藏
    this.tray.on('click', () => this.handleTrayClick())
    // 右键点击: 刷新菜单 (菜单在 refreshMenu 中设置)
    this.tray.on('right-click', () => this.refreshMenu())

    this.refreshMenu()
  }

  // ==================== 菜单构建 ====================

  /**
   * 刷新右键菜单。
   * 每次配置变更时自动调用。
   */
  refreshMenu(): void {
    if (!this.tray) return

    const pets = this.configManager.getPets()
    const menu = this.buildMenu(pets)
    this.tray.setContextMenu(menu)
  }

  /**
   * 构建右键菜单。
   *
   * 菜单结构:
   *   显示所有桌宠 / 隐藏所有桌宠
   *   ---
   *   添加桌宠
   *   ---
   *   设置
   *   ---
   *   [桌宠1] -> 显示 | 隐藏 | 编辑 | 删除
   *   [桌宠2] -> 显示 | 隐藏 | 编辑 | 删除
   *   ...
   *   ---
   *   退出
   */
  private buildMenu(pets: PetConfig[]): Menu {
    const template: MenuItemConstructorOptions[] = []

    // ---------- 全局显示/隐藏 ----------

    this.allHidden = pets.length > 0 && pets.every((pet) => !pet.enabled)

    template.push({
      label: this.allHidden ? t('tray.show') : t('tray.hide'),
      click: () => {
        this.onToggleAllVisibility()
        this.updateIconState(this.allHidden ? 'normal' : 'hidden')
      }
    })

    template.push({ type: 'separator' })

    template.push({
      label: t('tray.add'),
      click: () => this.onAddPet()
    })

    template.push({ type: 'separator' })

    template.push({
      label: t('tray.settings'),
      click: () => this.onOpenSettings()
    })

    template.push({ type: 'separator' })

    if (pets.length === 0) {
      template.push({
        label: `(${t('config.selectPetHint')})`,
        enabled: false
      })
    } else {
      for (const pet of pets) {
        template.push({
          label: pet.name,
          submenu: [
            {
              label: pet.enabled ? t('tray.hidePet') : t('tray.showPet'),
              click: () => this.onTogglePetVisibility(pet.id)
            },
            {
              label: t('tray.editPet'),
              click: () => this.onOpenSettings(pet.id)
            },
            { type: 'separator' },
            {
              label: t('tray.deletePet'),
              click: () => this.handleRemovePet(pet)
            }
          ]
        })
      }
    }

    template.push({ type: 'separator' })

    template.push({
      label: t('tray.quit'),
      click: () => this.onQuit()
    })

    return Menu.buildFromTemplate(template)
  }

  // ==================== 事件处理 ====================

  /**
   * 处理托盘图标左键点击。
   * 切换所有桌宠的显示/隐藏状态。
   */
  private handleTrayClick(): void {
    this.onToggleAllVisibility()

    const pets = this.configManager.getPets()
    const allHidden = pets.length > 0 && pets.every((pet) => !pet.enabled)
    this.updateIconState(allHidden ? 'hidden' : 'normal')
  }

  /**
   * 处理删除桌宠操作。
   * 弹出确认对话框，确认后删除。
   */
  private async handleRemovePet(pet: PetConfig): Promise<void> {
    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: [t('config.action.delete'), t('config.action.cancel')],
      defaultId: 1,
      cancelId: 1,
      title: t('config.action.delete'),
      message: t('config.confirmDelete'),
      detail: pet.name
    })

    if (result.response === 0) {
      this.onRemovePet(pet.id)
    }
  }

  // ==================== 图标状态管理 ====================

  /**
   * 更新托盘图标状态。
   *
   * @param state 'normal' = 正常状态, 'hidden' = 所有桌宠已隐藏
   */
  updateIconState(state: TrayIconState): void {
    if (!this.tray || this.iconState === state) return

    this.iconState = state
    const icon = loadIcon(state)

    if (!icon.isEmpty()) {
      this.tray.setImage(icon)
    }

    const tooltip =
      state === 'hidden'
        ? 'Desk-Idoll (hidden)'
        : 'Desk-Idoll'
    this.tray.setToolTip(tooltip)
  }

  /**
   * 从外部同步图标状态。
   * 当桌宠可见性通过 IPC 等其他途径变更时调用。
   */
  syncIconState(): void {
    const pets = this.configManager.getPets()
    const allHidden = pets.length > 0 && pets.every((pet) => !pet.enabled)
    this.updateIconState(allHidden ? 'hidden' : 'normal')
  }

  // ==================== 生命周期 ====================

  /**
   * 销毁托盘图标。
   * 在应用退出时调用。
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
      console.log('[TrayManager] Destroyed')
    }
  }
}
