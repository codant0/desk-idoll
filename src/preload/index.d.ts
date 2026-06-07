// src/preload/index.d.ts

import type {
  PetAction,
  PetConfig,
  AppConfig,
  ActionResult,
  GlobalSettings,
  ConfigChangeNotify,
  AnimationState
} from '../shared/types'

/**
 * electronAPI 接口类型声明
 * 使 TypeScript 渲染进程代码可以正确推断 window.electronAPI 的类型
 */
export interface ElectronAPI {
  // 桌宠交互控制
  setInteractive(interactive: boolean): void
  moveWindow(x: number, y: number): void
  minimizePet(): void
  closePet(): void

  // 窗口信息
  getWindowPosition(): Promise<{ x: number; y: number }>
  getWindowSize(): Promise<{ width: number; height: number }>
  showContextMenu(): void

  // 配置读写
  getAppConfig(): Promise<AppConfig>
  getPetConfig(petId: string): Promise<PetConfig | undefined>
  savePetConfig(config: PetConfig): Promise<void>
  deletePetConfig(petId: string): Promise<void>
  getGlobalSettings(): Promise<GlobalSettings>
  saveGlobalSettings(settings: GlobalSettings): Promise<void>
  createPet(config?: Partial<PetConfig>): Promise<PetConfig>

  // 动作执行
  executeAction(action: PetAction): Promise<ActionResult>
  getActions(): Promise<PetAction[]>

  // 配置窗口
  openConfig(petId?: string): Promise<void>
  closeConfig(): Promise<void>

  // 素材管理
  openFileDialog(
    filters?: { name: string; extensions: string[] }[]
  ): Promise<string | null>
  saveAsset(sourcePath: string, targetName: string): Promise<string>
  getAssetPath(assetName: string): Promise<string>

  // 系统信息与控制
  getAppVersion(): Promise<string>
  getPlatform(): Promise<string>
  quitApp(): void
  setAutoLaunch(enable: boolean): Promise<void>
  getScreenInfo(): Promise<{ width: number; height: number }>

  // 事件监听
  onPositionUpdate(callback: (position: { x: number; y: number }) => void): () => void
  onStateChange(callback: (state: AnimationState) => void): () => void
  onConfigChanged(callback: (notify: ConfigChangeNotify) => void): () => void
  onConfigUpdate(callback: (config: AppConfig) => void): () => void
  onSwitchToPet(callback: (petId: string) => void): () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
