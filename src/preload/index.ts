// src/preload/index.ts

import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  PetAction,
  PetConfig,
  AppConfig,
  ActionResult,
  GlobalSettings,
  ConfigChangeNotify
} from '../shared/types'

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
    ipcRenderer.send(IPC_CHANNELS.SET_INTERACTIVE, interactive)
  },

  /**
   * 移动桌宠窗口到指定屏幕坐标
   * @param x 屏幕 X 坐标
   * @param y 屏幕 Y 坐标
   */
  moveWindow: (x: number, y: number): void => {
    ipcRenderer.send(IPC_CHANNELS.PET_POSITION_UPDATE, { x, y })
  },

  /**
   * 最小化桌宠窗口
   */
  minimizePet: (): void => {
    ipcRenderer.send(IPC_CHANNELS.MINIMIZE_PET)
  },

  /**
   * 关闭桌宠窗口
   */
  closePet: (): void => {
    ipcRenderer.send(IPC_CHANNELS.CLOSE_PET)
  },

  // ============================================================
  // 配置读写
  // ============================================================

  /**
   * 获取完整应用配置
   */
  getAppConfig: (): Promise<AppConfig> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_APP_CONFIG)
  },

  /**
   * 获取指定桌宠配置
   */
  getPetConfig: (petId: string): Promise<PetConfig | undefined> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_PET_CONFIG, petId)
  },

  /**
   * 保存桌宠配置
   */
  savePetConfig: (config: PetConfig): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_PET_CONFIG, config)
  },

  /**
   * 删除指定桌宠
   */
  deletePetConfig: (petId: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.DELETE_PET_CONFIG, petId)
  },

  /**
   * 获取全局设置
   */
  getGlobalSettings: (): Promise<GlobalSettings> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_GLOBAL_SETTINGS)
  },

  /**
   * 保存全局设置
   */
  saveGlobalSettings: (settings: GlobalSettings): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_GLOBAL_SETTINGS, settings)
  },

  /**
   * 创建新桌宠
   * @param config 可选的桌宠配置（部分或完整）
   * @returns 新桌宠的完整配置
   */
  createPet: (config?: Partial<PetConfig>): Promise<PetConfig> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CREATE_PET, config)
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
    return ipcRenderer.invoke(IPC_CHANNELS.EXECUTE_ACTION, action)
  },

  /**
   * 获取当前桌宠的动作列表
   */
  getActions: (): Promise<PetAction[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_ACTIONS)
  },

  // ============================================================
  // 配置窗口
  // ============================================================

  /**
   * 打开配置窗口
   * @param petId 可选，指定要编辑的桌宠 ID
   */
  openConfig: (petId?: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.OPEN_CONFIG, petId)
  },

  /**
   * 关闭配置窗口
   */
  closeConfig: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CLOSE_CONFIG)
  },

  // ============================================================
  // 素材管理
  // ============================================================

  /**
   * 打开文件选择对话框
   * @param filters 文件类型过滤器
   * @returns 选中的文件路径，或 null（用户取消）
   */
  openFileDialog: (
    filters?: { name: string; extensions: string[] }[]
  ): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.OPEN_FILE_DIALOG, filters)
  },

  /**
   * 保存素材文件到应用目录
   * @param sourcePath 源文件路径
   * @param targetName 目标文件名
   * @returns 保存后的文件路径
   */
  saveAsset: (sourcePath: string, targetName: string): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_ASSET, sourcePath, targetName)
  },

  /**
   * 获取素材文件路径
   * @param assetName 素材文件名
   * @returns 素材文件的完整路径
   */
  getAssetPath: (assetName: string): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_ASSET_PATH, assetName)
  },

  // ============================================================
  // 窗口信息
  // ============================================================

  /**
   * 获取当前窗口位置
   */
  getWindowPosition: (): Promise<{ x: number; y: number }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_WINDOW_POSITION)
  },

  /**
   * 获取当前窗口大小
   */
  getWindowSize: (): Promise<{ width: number; height: number }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_WINDOW_SIZE)
  },

  /**
   * 显示右键上下文菜单
   */
  showContextMenu: (): void => {
    ipcRenderer.send(IPC_CHANNELS.SHOW_CONTEXT_MENU)
  },

  // ============================================================
  // 系统信息与控制
  // ============================================================

  /**
   * 获取应用版本号
   */
  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_APP_VERSION)
  },

  /**
   * 获取当前平台标识
   */
  getPlatform: (): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_PLATFORM)
  },

  /**
   * 退出应用
   */
  quitApp: (): void => {
    ipcRenderer.invoke(IPC_CHANNELS.QUIT_APP)
  },

  /**
   * 设置开机自启动
   * @param enable 是否启用
   */
  setAutoLaunch: (enable: boolean): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SET_AUTO_LAUNCH, enable)
  },

  /**
   * 检查更新
   */
  checkForUpdates: (): Promise<{ hasUpdate: boolean; version?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CHECK_FOR_UPDATES)
  },

  /**
   * 下载更新
   */
  downloadUpdate: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_UPDATE)
  },

  /**
   * 安装更新并重启
   */
  installUpdate: (): void => {
    ipcRenderer.invoke(IPC_CHANNELS.INSTALL_UPDATE)
  },

  /**
   * 获取屏幕信息
   */
  getScreenInfo: (): Promise<{ width: number; height: number }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_SCREEN_INFO)
  },

  // ============================================================
  // 静态图片桌宠
  // ============================================================

  /**
   * 验证图片文件是否有效
   * @param filePath 图片路径
   * @returns 验证结果，valid=false 时包含错误原因
   */
  validateImage: (filePath: string): Promise<{ valid: boolean; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STATIC_VALIDATE_IMAGE, filePath)
  },

  /**
   * 复制图片到应用资源目录
   * @param filePath 源图片路径
   * @param petId 关联的桌宠 ID
   * @returns 复制后的文件路径
   */
  copyImageToAssets: (filePath: string, petId: string): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STATIC_COPY_IMAGE, filePath, petId)
  },

  // ============================================================
  // AnimatedDrawings AI 处理
  // ============================================================

  /**
   * 检查 AnimatedDrawings Python 服务是否可用
   */
  checkAnimatedDrawingsService: (): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.ANIMATED_DRAWINGS_CHECK)
  },

  /**
   * 启动 AnimatedDrawings Python 服务
   */
  startAnimatedDrawingsService: (): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.ANIMATED_DRAWINGS_START)
  },

  /**
   * 提交图片到 AnimatedDrawings 进行动画处理
   * @param imagePath 图片路径
   * @param animationStyle 动画风格
   * @param outputSize 输出尺寸
   * @returns 任务 ID
   */
  processWithAnimatedDrawings: (
    imagePath: string,
    animationStyle: string,
    outputSize: { width: number; height: number }
  ): Promise<string> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.ANIMATED_DRAWINGS_PROCESS,
      imagePath,
      animationStyle,
      outputSize
    )
  },

  /**
   * 查询 AnimatedDrawings 处理任务状态
   * @param taskId 任务 ID
   */
  getProcessingStatus: (taskId: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.ANIMATED_DRAWINGS_STATUS, taskId)
  },

  // ============================================================
  // 精灵图生成
  // ============================================================

  /**
   * 从单张图片生成 PixiJS 兼容的精灵图
   * @param sourcePath 源图片路径
   * @param frameCount 每个动画状态的帧数，默认 4
   * @param frameSize 每帧尺寸，默认 128x128
   * @returns 精灵图路径和 JSON 配置路径
   */
  generateSpritesheet: (
    sourcePath: string,
    frameCount?: number,
    frameSize?: { width: number; height: number }
  ): Promise<{ spritesheetPath: string; jsonPath: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SPRITESHEET_GENERATE, sourcePath, frameCount, frameSize)
  },

  // ============================================================
  // 事件监听（主进程 → 渲染进程）
  // ============================================================

  /**
   * 监听桌宠位置更新
   * @param callback 回调函数
   * @returns 取消监听的函数
   */
  onPositionUpdate: (callback: (position: { x: number; y: number }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, position: { x: number; y: number }) => {
      callback(position)
    }
    ipcRenderer.on(IPC_CHANNELS.PET_POSITION_UPDATE, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.PET_POSITION_UPDATE, listener)
    }
  },

  /**
   * 监听配置变更事件
   * @param callback 回调函数
   * @returns 取消监听的函数
   */
  onConfigChanged: (callback: (notify: ConfigChangeNotify) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, notify: ConfigChangeNotify) => {
      callback(notify)
    }
    ipcRenderer.on(IPC_CHANNELS.CONFIG_CHANGED, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CONFIG_CHANGED, listener)
    }
  },

  /**
   * 监听动画状态切换事件
   * @param callback 回调函数
   * @returns 取消监听的函数
   */
  onStateChange: (callback: (state: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: string) => {
      callback(state)
    }
    ipcRenderer.on(IPC_CHANNELS.STATE_CHANGE, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.STATE_CHANGE, listener)
    }
  },

  /**
   * 监听桌宠配置更新事件
   * @param callback 回调函数
   * @returns 取消监听的函数
   */
  onConfigUpdate: (callback: (config: AppConfig) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, config: AppConfig) => {
      callback(config)
    }
    ipcRenderer.on(IPC_CHANNELS.CONFIG_UPDATE, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CONFIG_UPDATE, listener)
    }
  },

  onSwitchToPet: (callback: (petId: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, petId: string) => callback(petId)
    ipcRenderer.on('switch-to-pet', handler)
    return () => { ipcRenderer.removeListener('switch-to-pet', handler) }
  }
}

// ============================================================
// 通过 contextBridge 暴露到渲染进程的 window.electronAPI
// ============================================================

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
