// src/main/index.ts

import { app, BrowserWindow } from 'electron'
import { PetWindowManager } from './windows/pet-window'
import { ConfigWindowManager } from './windows/config-window'
import { ConfigManager } from './services/config-manager'
import { ActionExecutor } from './services/action-executor'
import { UpdaterManager } from './services/updater'
import { TrayManager } from './services/tray'
import { registerAllIpcHandlers } from './ipc/index'
import { logger } from './services/logger'
import { setLocale, t } from '../shared/i18n'

// ============================================================
// 1. 单实例锁
// ============================================================

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // 如果已有实例运行，直接退出
  app.quit()
} else {
  // ============================================================
  // 全局错误处理 + 日志初始化
  // ============================================================

  logger.init()

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error)
  })

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason)
  })
  // 当第二个实例试图启动时，聚焦到已有窗口
  app.on('second-instance', () => {
    if (petWindowManager) {
      const petIds = petWindowManager.getAllPetIds()
      if (petIds.length > 0) {
        const win = petWindowManager.getWindow(petIds[0])
        if (win && !win.isDestroyed()) {
          if (win.isMinimized()) win.restore()
          win.focus()
        }
      }
    }
    if (configWindowManager) {
      const configWin = configWindowManager.getWindow()
      if (configWin && !configWin.isDestroyed()) {
        configWin.focus()
      }
    }
  })

  // ============================================================
  // 2. 管理器实例（延迟初始化，在 app.ready 后创建）
  // ============================================================

  let configManager: ConfigManager
  let petWindowManager: PetWindowManager
  let configWindowManager: ConfigWindowManager
  let actionExecutor: ActionExecutor
  let updaterManager: UpdaterManager
  let trayManager: TrayManager

  // ============================================================
  // 3. app 生命周期事件处理
  // ============================================================

  /**
   * app.whenReady -- 应用初始化完成
   * 创建所有管理器、注册 IPC、启动默认桌宠窗口
   */
  app.whenReady().then(async () => {
    logger.info('App starting...')
    // 3.1 初始化配置管理器
    configManager = new ConfigManager()

    // 3.2 初始化动作执行器
    actionExecutor = new ActionExecutor()

    // 3.3 初始化窗口管理器
    petWindowManager = new PetWindowManager(configManager)
    configWindowManager = new ConfigWindowManager()

    // 3.3.1 初始化自动更新
    updaterManager = new UpdaterManager()
    updaterManager.init()

    trayManager = new TrayManager(configManager)
    trayManager.initialize({
      onAddPet: async () => {
        const newPet = configManager.createDefaultPet()
        configManager.addPet(newPet)
        await petWindowManager.createPetWindow(newPet)
      },
      onOpenSettings: (petId?: string) => {
        configWindowManager.show(petId)
      },
      onTogglePetVisibility: (petId: string) => {
        const petConfig = configManager.getPetConfig(petId)
        if (!petConfig) return

        const newEnabled = !petConfig.enabled
        configManager.updatePetConfig(petId, { enabled: newEnabled })

        const win = petWindowManager.getWindow(petId)
        if (win && !win.isDestroyed()) {
          if (newEnabled) {
            win.show()
          } else {
            win.hide()
          }
        }
      },
      onRemovePet: (petId: string) => {
        petWindowManager.destroyPetWindow(petId)
        configManager.removePet(petId)
      },
      onToggleAllVisibility: () => {
        const pets = configManager.getPets()
        const allHidden = pets.length > 0 && pets.every(p => !p.enabled)
        const newEnabled = allHidden // If all hidden, show all; otherwise hide all

        for (const pet of pets) {
          configManager.updatePetConfig(pet.id, { enabled: newEnabled })
        }

        if (newEnabled) {
          petWindowManager.showAll()
        } else {
          petWindowManager.hideAll()
        }
      },
      onQuit: () => {
        petWindowManager.saveAllWindowPositions()
        configWindowManager.markAppQuitting()
        app.quit()
      }
    })

    // 3.4 注册所有 IPC 处理函数
    registerAllIpcHandlers({
      petWindowManager,
      configWindowManager,
      configManager,
      actionExecutor,
      updaterManager
    })

    // 3.5 创建默认桌宠窗口（如果配置中有桌宠）
    const config = configManager.getConfig()
    const isFirstLaunch = config.pets.length === 0
    if (!isFirstLaunch) {
      for (const petConfig of config.pets) {
        await petWindowManager.createPetWindow(petConfig)
      }
    } else {
      // 首次启动，没有桌宠配置，创建一个默认桌宠
      const defaultPet = configManager.createDefaultPet()
      configManager.addPet(defaultPet)
      await petWindowManager.createPetWindow(defaultPet)

      // 首次使用引导提示
      logger.info('First launch detected, showing welcome guidance')
      const settings = configManager.getGlobalSettings()
      setLocale(settings.language === 'en' ? 'en' : 'zh-CN')
      setTimeout(() => {
        const { Notification } = require('electron')
        if (Notification.isSupported()) {
          new Notification({
            title: t('notify.welcome'),
            body: t('notify.welcomeBody')
          }).show()
        }
      }, 1500)
    }

    // 3.6 macOS 特殊处理：点击 dock 图标时重新创建窗口
    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const defaultPet = configManager.createDefaultPet()
        configManager.addPet(defaultPet)
        await petWindowManager.createPetWindow(defaultPet)
      }
    })
  })

  /**
   * window-all-closed -- 所有窗口关闭
   * Windows/Linux 上退出应用，macOS 上保持运行
   */
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  /**
   * before-quit -- 应用退出前清理
   * 保存当前所有桌宠窗口的位置到配置
   */
  app.on('before-quit', () => {
    logger.info('App quitting...')
    trayManager?.destroy()
    if (configWindowManager) {
      configWindowManager.markAppQuitting()
    }
    if (petWindowManager) {
      petWindowManager.saveAllWindowPositions()
    }
    logger.dispose()
  })

  /**
   * 阻止新窗口的默认创建行为（防止恶意链接打开新窗口）
   */
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => {
      return { action: 'deny' }
    })
  })
}
