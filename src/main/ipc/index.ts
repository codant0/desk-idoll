// src/main/ipc/index.ts

import { app, ipcMain, BrowserWindow, dialog, Menu } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { PetWindowManager } from '../windows/pet-window'
import { ConfigWindowManager } from '../windows/config-window'
import { ConfigManager } from '../services/config-manager'
import { ActionExecutor } from '../services/action-executor'
import { UpdaterManager } from '../services/updater'
import { t } from '../../shared/i18n'
import type { PetAction, PetConfig, AppConfig, ActionResult } from '../../shared/types'

/**
 * IPC 处理器所需的依赖接口
 */
export interface IpcHandlerDeps {
  petWindowManager: PetWindowManager
  configWindowManager: ConfigWindowManager
  configManager: ConfigManager
  actionExecutor: ActionExecutor
  updaterManager: UpdaterManager
}

/**
 * 注册所有 IPC 通道的处理函数
 */
export function registerAllIpcHandlers(deps: IpcHandlerDeps): void {
  const { petWindowManager, configWindowManager, configManager, actionExecutor, updaterManager } = deps

  // ============================================================
  // 窗口控制
  // ============================================================

  // ---- set-interactive -- 切换点击穿透状态 ----
  ipcMain.on(IPC_CHANNELS.SET_INTERACTIVE, (event, value: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      petWindowManager.setInteractiveByWindow(win, value)
    }
  })

  // ---- minimize-pet -- 最小化桌宠窗口 ----
  ipcMain.on(IPC_CHANNELS.MINIMIZE_PET, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      win.minimize()
    }
  })

  // ---- close-pet -- 关闭桌宠窗口 ----
  ipcMain.on(IPC_CHANNELS.CLOSE_PET, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      const petId = petWindowManager.getPetIdByWindow(win)
      if (petId) {
        petWindowManager.destroyPetWindow(petId)
        configManager.removePet(petId)
        notifyConfigChanged(petWindowManager, configManager.getConfig())
      }
    }
  })

  // ---- open-config -- 打开配置窗口 ----
  ipcMain.handle(IPC_CHANNELS.OPEN_CONFIG, async (_event, petId?: string): Promise<void> => {
    await configWindowManager.show(petId)
  })

  // ---- close-config -- 关闭配置窗口 ----
  ipcMain.handle(IPC_CHANNELS.CLOSE_CONFIG, async (): Promise<void> => {
    configWindowManager.hide()
  })

  // ---- get-screen-info -- 获取屏幕信息 ----
  ipcMain.handle(
    IPC_CHANNELS.GET_SCREEN_INFO,
    async (): Promise<{ width: number; height: number }> => {
      const { screen } = require('electron')
      const primaryDisplay = screen.getPrimaryDisplay()
      return {
        width: primaryDisplay.workAreaSize.width,
        height: primaryDisplay.workAreaSize.height
      }
    }
  )

  // ---- pet:position-update -- 桌宠位置更新（拖拽时/物理下落时） ----
  ipcMain.on(
    IPC_CHANNELS.PET_POSITION_UPDATE,
    (event, data: { x: number; y: number } | { petId: string; position: { x: number; y: number } }) => {
      // Support both formats: simplified {x, y} from renderer and legacy {petId, position}
      if ('petId' in data) {
        petWindowManager.moveWindow(data.petId, data.position.x, data.position.y)
      } else {
        // Find petId by window sender
        const win = BrowserWindow.fromWebContents(event.sender)
        if (win && !win.isDestroyed()) {
          const petId = petWindowManager.getPetIdByWindow(win)
          if (petId) {
            petWindowManager.moveWindow(petId, data.x, data.y)
          }
        }
      }
    }
  )

  // ---- pet:landed -- 桌宠落地事件 ----
  ipcMain.on(
    IPC_CHANNELS.PET_LANDED,
    (_event, data: { petId: string; position: { x: number; y: number } }) => {
      configManager.updatePetConfig(data.petId, {
        position: data.position
      })
    }
  )

  // ---- get-window-position -- 获取窗口位置 ----
  ipcMain.handle(
    IPC_CHANNELS.GET_WINDOW_POSITION,
    async (event): Promise<{ x: number; y: number }> => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && !win.isDestroyed()) {
        const pos = win.getPosition()
        return { x: pos[0], y: pos[1] }
      }
      return { x: 0, y: 0 }
    }
  )

  // ---- get-window-size -- 获取窗口大小 ----
  ipcMain.handle(
    IPC_CHANNELS.GET_WINDOW_SIZE,
    async (event): Promise<{ width: number; height: number }> => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && !win.isDestroyed()) {
        const size = win.getSize()
        return { width: size[0], height: size[1] }
      }
      return { width: 200, height: 200 }
    }
  )

  // ---- show-context-menu -- 显示右键菜单 ----
  ipcMain.on(IPC_CHANNELS.SHOW_CONTEXT_MENU, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: t('tray.settings'),
        click: () => configWindowManager.show()
      },
      { type: 'separator' },
      {
        label: t('tray.hide'),
        click: () => petWindowManager.hideAll()
      },
      {
        label: t('tray.show'),
        click: () => petWindowManager.showAll()
      },
      { type: 'separator' },
      {
        label: t('tray.add'),
        click: async () => {
          const newPet = configManager.createDefaultPet()
          configManager.addPet(newPet)
          await petWindowManager.createPetWindow(newPet)
          notifyConfigChanged(petWindowManager, configManager.getConfig())
        }
      },
      { type: 'separator' },
      {
        label: t('tray.quit'),
        click: () => {
          petWindowManager.saveAllWindowPositions()
          configWindowManager.markAppQuitting()
          app.quit()
        }
      }
    ]

    const menu = Menu.buildFromTemplate(template)
    menu.popup({ window: win })
  })

  // ============================================================
  // 配置管理
  // ============================================================

  // ---- get-app-config -- 获取完整配置 ----
  ipcMain.handle(IPC_CHANNELS.GET_APP_CONFIG, async (): Promise<AppConfig> => {
    return configManager.getConfig()
  })

  // ---- get-pet-config -- 获取单个桌宠配置 ----
  ipcMain.handle(
    IPC_CHANNELS.GET_PET_CONFIG,
    async (_event, petId: string): Promise<PetConfig | undefined> => {
      return configManager.getPetConfig(petId)
    }
  )

  // ---- save-pet-config -- 保存桌宠配置 ----
  ipcMain.handle(
    IPC_CHANNELS.SAVE_PET_CONFIG,
    async (_event, config: PetConfig): Promise<void> => {
      configManager.updatePetConfig(config.id, config)
      // 更新窗口管理器中的运行时配置引用
      petWindowManager.updatePetConfigRef(config.id, config)
      // 通知所有桌宠窗口配置已变更
      notifyConfigChanged(petWindowManager, configManager.getConfig())
    }
  )

  // ---- delete-pet-config -- 删除桌宠配置 ----
  ipcMain.handle(
    IPC_CHANNELS.DELETE_PET_CONFIG,
    async (_event, petId: string): Promise<void> => {
      petWindowManager.destroyPetWindow(petId)
      configManager.removePet(petId)
      notifyConfigChanged(petWindowManager, configManager.getConfig())
    }
  )

  // ---- get-global-settings -- 获取全局设置 ----
  ipcMain.handle(IPC_CHANNELS.GET_GLOBAL_SETTINGS, async () => {
    return configManager.getGlobalSettings()
  })

  // ---- save-global-settings -- 保存全局设置 ----
  ipcMain.handle(
    IPC_CHANNELS.SAVE_GLOBAL_SETTINGS,
    async (_event, settings: AppConfig['globalSettings']): Promise<void> => {
      configManager.updateGlobalSettings(settings)
      notifyConfigChanged(petWindowManager, configManager.getConfig())
    }
  )

  // ---- create-pet -- 创建新桌宠 ----
  ipcMain.handle(
    IPC_CHANNELS.CREATE_PET,
    async (_event, petConfig?: Partial<PetConfig>): Promise<PetConfig> => {
      // 如果传入了完整配置则使用，否则合并到默认配置
      const fullConfig: PetConfig = petConfig?.id
        ? (petConfig as PetConfig)
        : { ...configManager.createDefaultPet(), ...petConfig }

      // 保存配置
      configManager.addPet(fullConfig)
      // 创建窗口
      await petWindowManager.createPetWindow(fullConfig)
      // 通知配置变更
      notifyConfigChanged(petWindowManager, configManager.getConfig())

      return fullConfig
    }
  )

  // ============================================================
  // 动作执行
  // ============================================================

  // ---- execute-action -- 执行自定义动作 ----
  ipcMain.handle(
    IPC_CHANNELS.EXECUTE_ACTION,
    async (_event, action: PetAction): Promise<ActionResult> => {
      return actionExecutor.execute(action)
    }
  )

  // ---- get-actions -- 获取当前窗口对应桌宠的动作列表 ----
  ipcMain.handle(
    IPC_CHANNELS.GET_ACTIONS,
    async (event): Promise<PetAction[]> => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return []

      // Find the pet associated with this window
      const petId = petWindowManager.getPetIdByWindow(win)
      if (!petId) return []

      const petConfig = configManager.getPetConfig(petId)
      return petConfig?.actions ?? []
    }
  )

  // ============================================================
  // 素材管理
  // ============================================================

  // ---- open-file-dialog -- 打开文件选择对话框 ----
  ipcMain.handle(
    IPC_CHANNELS.OPEN_FILE_DIALOG,
    async (
      _event,
      filters?: { name: string; extensions: string[] }[]
    ): Promise<string | null> => {
      const win = BrowserWindow.fromWebContents(_event.sender)
      const parentWindow = win && !win.isDestroyed() ? win : null

      const result = await dialog.showOpenDialog(parentWindow as Electron.BaseWindow, {
        properties: ['openFile'],
        filters: filters ?? [
          { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      return result.filePaths[0]
    }
  )

  // ---- save-asset -- 保存素材文件 ----
  ipcMain.handle(
    IPC_CHANNELS.SAVE_ASSET,
    async (_event, sourcePath: string, targetName: string): Promise<string> => {
      const fs = require('node:fs/promises')
      const pathMod = require('node:path')
      const { app: electronApp } = require('electron')

      const assetsDir = pathMod.join(electronApp.getPath('userData'), 'assets')
      await fs.mkdir(assetsDir, { recursive: true })

      const targetPath = pathMod.join(assetsDir, targetName)
      await fs.copyFile(sourcePath, targetPath)

      return targetPath
    }
  )

  // ---- get-asset-path -- 获取素材路径 ----
  ipcMain.handle(
    IPC_CHANNELS.GET_ASSET_PATH,
    async (_event, assetName: string): Promise<string> => {
      const pathMod = require('node:path')
      const { app: electronApp } = require('electron')
      return pathMod.join(electronApp.getPath('userData'), 'assets', assetName)
    }
  )

  // ============================================================
  // 系统
  // ============================================================

  // ---- get-app-version -- 获取应用版本 ----
  ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, async (): Promise<string> => {
    return app.getVersion()
  })

  // ---- get-platform -- 获取平台信息 ----
  ipcMain.handle(IPC_CHANNELS.GET_PLATFORM, async (): Promise<string> => {
    return process.platform
  })

  // ---- quit-app -- 退出应用 ----
  ipcMain.handle(IPC_CHANNELS.QUIT_APP, async (): Promise<void> => {
    petWindowManager.saveAllWindowPositions()
    configWindowManager.markAppQuitting()
    app.quit()
  })

  // ---- set-auto-launch -- 设置开机自启动 ----
  ipcMain.handle(
    IPC_CHANNELS.SET_AUTO_LAUNCH,
    async (_event, enable: boolean): Promise<void> => {
      app.setLoginItemSettings({
        openAtLogin: enable,
        path: app.getPath('exe')
      })
    }
  )

  // ---- check-for-updates -- 检查更新 ----
  ipcMain.handle(
    IPC_CHANNELS.CHECK_FOR_UPDATES,
    async (): Promise<{ hasUpdate: boolean; version?: string }> => {
      return updaterManager.checkForUpdates()
    }
  )

  // ---- download-update -- 下载更新 ----
  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_UPDATE, async (): Promise<void> => {
    await updaterManager.downloadUpdate()
  })

  // ---- install-update -- 安装更新 ----
  ipcMain.handle(IPC_CHANNELS.INSTALL_UPDATE, (): void => {
    updaterManager.quitAndInstall()
  })
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 通知所有桌宠窗口配置已变更
 * TODO: Optimization — send only the diff or the changed pet config instead of the full AppConfig to reduce IPC overhead
 */
function notifyConfigChanged(manager: PetWindowManager, config: AppConfig): void {
  for (const petId of manager.getAllPetIds()) {
    const win = manager.getWindow(petId)
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.CONFIG_UPDATE, config)
      win.webContents.send(IPC_CHANNELS.CONFIG_CHANGED, {
        key: 'pets',
        value: config.pets
      })
    }
  }
}
