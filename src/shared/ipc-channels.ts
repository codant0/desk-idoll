export const IPC_CHANNELS = {
  // 窗口控制 (渲染进程 -> 主进程)
  SET_INTERACTIVE: 'window:set-interactive',
  MINIMIZE_PET: 'window:minimize-pet',
  CLOSE_PET: 'window:close-pet',
  OPEN_CONFIG: 'window:open-config',
  SWITCH_TO_PET: 'switch-to-pet',
  CLOSE_CONFIG: 'window:close-config',
  GET_SCREEN_INFO: 'window:get-screen-info',

  // 桌宠控制 (主进程 -> 渲染进程)
  UPDATE_PET_CONFIG: 'pet:update-config',
  SET_ANIMATION_STATE: 'pet:set-animation-state',
  SET_PET_VISIBLE: 'pet:set-visible',

  // 桌宠位置 (渲染进程 -> 主进程)
  PET_POSITION_UPDATE: 'pet:position-update',
  PET_LANDED: 'pet:landed',

  // 配置管理 (渲染进程 -> 主进程)
  GET_APP_CONFIG: 'config:get-app-config',
  GET_PET_CONFIG: 'config:get-pet-config',
  SAVE_PET_CONFIG: 'config:save-pet-config',
  DELETE_PET_CONFIG: 'config:delete-pet-config',
  GET_GLOBAL_SETTINGS: 'config:get-global-settings',
  SAVE_GLOBAL_SETTINGS: 'config:save-global-settings',
  CREATE_PET: 'config:create-pet',

  // 配置变更通知 (主进程 -> 渲染进程)
  CONFIG_CHANGED: 'config:changed',

  // 右键菜单 (渲染进程 -> 主进程)
  SHOW_CONTEXT_MENU: 'window:show-context-menu',

  // 动作执行 (渲染进程 -> 主进程)
  EXECUTE_ACTION: 'action:execute',
  GET_ACTIONS: 'action:get-all',
  ACTION_RESULT: 'action:result',

  // 素材管理 (渲染进程 -> 主进程)
  OPEN_FILE_DIALOG: 'asset:open-file-dialog',
  SAVE_ASSET: 'asset:save',
  GET_ASSET_PATH: 'asset:get-path',

  // 窗口信息 (渲染进程 -> 主进程)
  GET_WINDOW_POSITION: 'window:get-position',
  GET_WINDOW_SIZE: 'window:get-size',

  // 事件监听 (主进程 -> 渲染进程)
  STATE_CHANGE: 'pet:state-change',
  CONFIG_UPDATE: 'pet:config-update',

  // 系统 (双向)
  GET_APP_VERSION: 'system:get-app-version',
  GET_PLATFORM: 'system:get-platform',
  QUIT_APP: 'system:quit',
  SET_AUTO_LAUNCH: 'system:set-auto-launch',

  // 自动更新
  CHECK_FOR_UPDATES: 'system:check-for-updates',
  DOWNLOAD_UPDATE: 'system:download-update',
  INSTALL_UPDATE: 'system:install-update',

  // 静态图片桌宠 (渲染进程 -> 主进程)
  STATIC_VALIDATE_IMAGE: 'static:validate-image',
  STATIC_COPY_IMAGE: 'static:copy-image',

  // AnimatedDrawings AI 处理 (渲染进程 -> 主进程)
  ANIMATED_DRAWINGS_CHECK: 'animated-drawings:check-service',
  ANIMATED_DRAWINGS_START: 'animated-drawings:start-service',
  ANIMATED_DRAWINGS_PROCESS: 'animated-drawings:process',
  ANIMATED_DRAWINGS_STATUS: 'animated-drawings:status',

  // 精灵图生成 (渲染进程 -> 主进程)
  SPRITESHEET_GENERATE: 'spritesheet:generate'
} as const

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

export interface ElectronAPI {
  // 桌宠交互控制
  setInteractive: (interactive: boolean) => void
  moveWindow: (x: number, y: number) => void
  minimizePet: () => void
  closePet: () => void

  // 窗口信息
  getWindowPosition: () => Promise<{ x: number; y: number }>
  getWindowSize: () => Promise<{ width: number; height: number }>
  showContextMenu: () => void

  // 配置读写
  getAppConfig: () => Promise<import('./types').AppConfig>
  getPetConfig: (petId: string) => Promise<import('./types').PetConfig | undefined>
  savePetConfig: (config: import('./types').PetConfig) => Promise<void>
  deletePetConfig: (petId: string) => Promise<void>
  getGlobalSettings: () => Promise<import('./types').GlobalSettings>
  saveGlobalSettings: (settings: import('./types').GlobalSettings) => Promise<void>
  createPet: (config?: Partial<import('./types').PetConfig>) => Promise<import('./types').PetConfig>

  // 动作执行
  executeAction: (action: import('./types').PetAction) => Promise<import('./types').ActionResult>
  getActions: () => Promise<import('./types').PetAction[]>

  // 配置窗口
  openConfig: (petId?: string) => Promise<void>
  closeConfig: () => Promise<void>

  // 素材管理
  openFileDialog: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  saveAsset: (sourcePath: string, targetName: string) => Promise<string>
  getAssetPath: (assetName: string) => Promise<string>

  // 系统信息与控制
  getAppVersion: () => Promise<string>
  getPlatform: () => Promise<string>
  quitApp: () => void
  setAutoLaunch: (enable: boolean) => Promise<void>
  getScreenInfo: () => Promise<{ width: number; height: number }>

  // 自动更新
  checkForUpdates: () => Promise<{ hasUpdate: boolean; version?: string }>
  downloadUpdate: () => Promise<void>
  installUpdate: () => void

  // 静态图片桌宠
  validateImage: (filePath: string) => Promise<{ valid: boolean; error?: string }>
  copyImageToAssets: (filePath: string, petId: string) => Promise<string>

  // AnimatedDrawings AI 处理
  checkAnimatedDrawingsService: () => Promise<boolean>
  startAnimatedDrawingsService: () => Promise<boolean>
  processWithAnimatedDrawings: (
    imagePath: string,
    animationStyle: string,
    outputSize: { width: number; height: number }
  ) => Promise<string>
  getProcessingStatus: (taskId: string) => Promise<{
    taskId: string
    status: 'processing' | 'completed' | 'error'
    progress: number
    result?: { spritesheetPath: string; jsonPath: string }
    error?: string
  }>

  // 精灵图生成
  generateSpritesheet: (
    sourcePath: string,
    frameCount?: number,
    frameSize?: { width: number; height: number }
  ) => Promise<{ spritesheetPath: string; jsonPath: string }>

  // 事件监听
  onPositionUpdate: (callback: (position: { x: number; y: number }) => void) => () => void
  onStateChange: (callback: (state: import('./types').AnimationState) => void) => () => void
  onConfigChanged: (callback: (notify: import('./types').ConfigChangeNotify) => void) => () => void
  onConfigUpdate: (callback: (config: import('./types').AppConfig) => void) => () => void
  onSwitchToPet: (callback: (petId: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
