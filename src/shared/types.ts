// ── 帧范围 (Sprite Sheet) ────────────────────

export interface FrameRange {
  start: number
  end: number
  loop: boolean
}

// ── Sprite Sheet 动画配置 ────────────────────

export interface SpriteAnimationConfig {
  frameWidth: number
  frameHeight: number
  fps: number
  states: {
    idle: FrameRange
    walk: FrameRange
    drag: FrameRange
    fall: FrameRange
    click: FrameRange
  }
  spritesheetPath: string
  spritesheetJsonPath: string
}

// ── Live2D 动画配置 (Phase 4) ────────────────

export interface Live2DAnimationConfig {
  modelPath: string
  motions: Record<string, string>
  expressions: Record<string, string>
  followMouse: boolean
}

// ── 静态图片动画配置 ─────────────────────────

export interface StaticImageAnimationConfig {
  imagePath: string
  animationStyle: 'gentle' | 'bouncy' | 'energetic'
  idleAmplitude: number      // 浮动幅度 (0-50)
  idleFrequency: number      // 浮动频率 (0.5-5)
  breatheScale: number       // 呼吸缩放幅度 (0-0.2)
  walkBobHeight: number      // 行走弹跳高度 (0-30)
  walkBobFrequency: number   // 行走弹跳频率 (1-10)
  swayAngle: number          // 摇晃角度 (0-30度)
  fallRotationSpeed: number  // 下落旋转速度 (0-10)
  clickScalePulse: number    // 点击缩放脉冲 (0-0.5)
}

// ── 高级模式配置 ─────────────────────────────

export interface AdvancedAnimationConfig {
  enabled: boolean
  spritesheetPath?: string
  processingStatus: 'idle' | 'processing' | 'completed' | 'error'
  errorMessage?: string
}

// ── 统一动画配置类型 ─────────────────────────

export type AnimationConfig = SpriteAnimationConfig | Live2DAnimationConfig | StaticImageAnimationConfig

// ── 动画状态 ─────────────────────────────────

export type AnimationState = 'idle' | 'walk' | 'drag' | 'fall' | 'click'

export type ModelType = 'sprite-sheet' | 'live2d' | 'static-image'

// ── 状态机事件 ───────────────────────────────

export type StateEvent =
  | 'timeout'
  | 'mousedown'
  | 'mouseup'
  | 'click'
  | 'edge'
  | 'landed'
  | 'actionDone'

// ── 自定义动作 ───────────────────────────────

export type ActionTrigger = 'left-click'

export type ActionType = 'open-url' | 'execute-cmd' | 'show-message'

export interface PetAction {
  id: string
  trigger: ActionTrigger
  type: ActionType
  payload: string
  name: string
  confirmBeforeExecute: boolean
}

export interface ActionResult {
  success: boolean
  cancelled?: boolean
  error?: string
}

// ── 行为配置 ─────────────────────────────────

export type ScreenEdgeBehavior = 'bounce' | 'wrap' | 'stop'

export interface BehaviorConfig {
  walkSpeed: number
  gravity: boolean
  gravityForce: number
  screenEdgeBehavior: ScreenEdgeBehavior
  idleTimeout: number
  randomWalk: boolean
  walkDuration: { min: number; max: number }
}

// ── 桌宠完整配置 ─────────────────────────────

export interface PetConfig {
  id: string
  name: string
  modelType: ModelType
  modelPath: string
  size: { width: number; height: number }
  position: { x: number; y: number }
  opacity: number
  zIndex: number
  animations: AnimationConfig
  actions: PetAction[]
  behavior: BehaviorConfig
  enabled: boolean
  createdAt: string
  updatedAt: string
}

// ── 全局应用配置 ─────────────────────────────

export interface GlobalSettings {
  language: string
  autoStart: boolean
  checkUpdate: boolean
  maxInstances: number
}

export interface AppConfig {
  pets: PetConfig[]
  globalSettings: GlobalSettings
}

// ── IPC 消息类型 ─────────────────────────────

export interface IPCMessage<T = unknown> {
  channel: string
  data?: T
}

export interface PetPositionUpdate {
  petId: string
  position: { x: number; y: number }
}

export interface ConfigChangeNotify {
  key: string
  value: unknown
  petId?: string
}

// ── RenderAdapter 接口 ──────────────────────

export interface RenderAdapter {
  init(container: unknown): Promise<void>
  setState(state: AnimationState): void
  update(delta: number): void
  destroy(): void
  getBounds(): { x: number; y: number; width: number; height: number }
}

// ── 托盘图标状态 ─────────────────────────────

export type TrayIconState = 'normal' | 'hidden'

// ── 配置变更事件 ─────────────────────────────

export interface ConfigChangeEvent {
  type: 'pet:added' | 'pet:updated' | 'pet:removed' | 'global:updated'
  petId?: string
  timestamp: string
}
