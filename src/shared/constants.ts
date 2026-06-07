import type {
  PetConfig,
  BehaviorConfig,
  SpriteAnimationConfig,
  GlobalSettings
} from './types'

// ── 应用信息 ─────────────────────────────────

export const APP_NAME = 'Desk-Idoll'
export const APP_VERSION = '0.1.0'
export const APP_ID = 'com.codant0.desk-idoll'
export const APP_USER_MODEL_ID = 'com.codant0.desk-idoll'

// ── 窗口默认尺寸 ─────────────────────────────

export const PET_WINDOW_DEFAULTS = {
  width: 200,
  height: 200,
  transparent: true,
  frame: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  hasShadow: false
} as const

export const CONFIG_WINDOW_DEFAULTS = {
  width: 680,
  height: 520,
  minWidth: 600,
  minHeight: 480,
  title: 'Desk-Idoll 设置',
  resizable: true,
  center: true
} as const

// ── 默认行为配置 ─────────────────────────────

export const DEFAULT_BEHAVIOR: BehaviorConfig = {
  walkSpeed: 2,
  gravity: true,
  gravityForce: 0.5,
  screenEdgeBehavior: 'bounce',
  idleTimeout: 3000,
  randomWalk: true,
  walkDuration: { min: 2000, max: 5000 }
}

// ── 默认动画配置 (Sprite Sheet) ──────────────

export const DEFAULT_SPRITE_ANIMATION: SpriteAnimationConfig = {
  frameWidth: 128,
  frameHeight: 128,
  fps: 12,
  states: {
    idle: { start: 0, end: 3, loop: true },
    walk: { start: 4, end: 11, loop: true },
    drag: { start: 12, end: 15, loop: false },
    fall: { start: 16, end: 19, loop: false },
    click: { start: 20, end: 23, loop: false }
  },
  spritesheetPath: 'default-pet/spritesheet.png',
  spritesheetJsonPath: 'default-pet/spritesheet.json'
}

// ── 默认桌宠配置 ─────────────────────────────

export const DEFAULT_PET_CONFIG: Omit<PetConfig, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '新桌宠',
  modelType: 'sprite-sheet',
  modelPath: 'default-pet/spritesheet.json',
  size: { width: 128, height: 128 },
  position: { x: 200, y: 200 },
  opacity: 1.0,
  zIndex: 9999,
  animations: { ...DEFAULT_SPRITE_ANIMATION },
  actions: [],
  behavior: { ...DEFAULT_BEHAVIOR },
  enabled: true
}

// ── 默认全局设置 ─────────────────────────────

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  language: 'zh-CN',
  autoStart: false,
  checkUpdate: true,
  maxInstances: 5
}

export const DEFAULT_APP_CONFIG = {
  pets: [] as PetConfig[],
  globalSettings: { ...DEFAULT_GLOBAL_SETTINGS }
}

// ── 物理引擎常量 ─────────────────────────────

export const PHYSICS = {
  GRAVITY: 0.5,
  MAX_FALL_SPEED: 15,
  BOUNCE_FACTOR: 0.3,
  FRICTION: 0.8
} as const

// ── 状态机常量 ───────────────────────────────

export const STATE_TRANSITIONS = {
  idle: { timeout: 'walk', mousedown: 'drag', click: 'click' },
  walk: { edge: 'idle', mousedown: 'drag', click: 'click' },
  drag: { mouseup: 'fall' },
  fall: { landed: 'idle' },
  click: { actionDone: 'idle' }
} as const

// ── 右键菜单标签 ─────────────────────────────

export const CONTEXT_MENU_LABELS = {
  settings: '设置',
  hide: '隐藏',
  showAll: '显示全部',
  addPet: '添加桌宠',
  separator: '---',
  quit: '退出 Desk-Idoll'
} as const

// ── 存储常量 ─────────────────────────────────

export const STORE_KEYS = {
  PETS: 'pets',
  GLOBAL_SETTINGS: 'globalSettings',
  WINDOW_POSITIONS: 'windowPositions'
} as const

// ── 限制常量 ─────────────────────────────────

export const LIMITS = {
  MAX_PET_INSTANCES: 10,
  MIN_PET_SIZE: 32,
  MAX_PET_SIZE: 512,
  MAX_ACTIONS: 20,
  MAX_NAME_LENGTH: 32
} as const
