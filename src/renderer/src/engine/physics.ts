// ============================================================================
// Desk-Idoll 物理引擎 + 移动系统 (Immutable State + Reducer Pattern)
// src/renderer/src/engine/physics.ts
//
// 自研轻量物理模拟，不引入 Matter.js。
// 所有计算基于 delta time，与帧率无关。
//
// 架构特点：
//   - 不可变状态 + reducer 模式（类似 Redux）
//   - 每帧产生新状态快照，便于调试和回放
//   - 事件收集器模式，批量派发回调
//   - 系统管道（pipeline）顺序执行各物理子系统
// ============================================================================

// ── 类型定义 ────────────────────────────────────────────────────────────────

/** 二维向量 */
export interface Vec2 {
  x: number
  y: number
}

/** 物理引擎配置 */
export interface PhysicsConfig {
  /** 重力加速度，单位: px/frame^2（在 60fps 下约为 0.5） */
  gravity: number
  /** 水平行走速度，单位: px/frame（在 60fps 下约为 2） */
  walkSpeed: number
  /** 屏幕边缘行为 */
  screenEdgeBehavior: 'bounce' | 'wrap' | 'stop'
  /** 待机超时后切换到行走的等待时间，单位: ms */
  idleTimeout: number
  /** 是否启用随机行走 */
  randomWalk: boolean
  /** 地面反弹衰减系数（0 = 无反弹，1 = 完全弹性反弹） */
  bounceDamping: number
}

/** 物理引擎默认配置 */
export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  gravity: 0.5,
  walkSpeed: 2,
  screenEdgeBehavior: 'bounce',
  idleTimeout: 3000,
  randomWalk: true,
  bounceDamping: 0
}

/** 桌宠朝向 */
export type Facing = 'left' | 'right'

/** 屏幕边界信息 */
export interface ScreenBounds {
  left: number
  right: number
  groundY: number
  screenWidth: number
  screenHeight: number
}

/** 物理状态快照 — 完全可序列化，便于调试 */
export interface PhysicsState {
  position: Vec2
  velocity: Vec2
  facing: Facing
  isWalking: boolean
  isFalling: boolean
  isOnGround: boolean
  isPaused: boolean
  walkDuration: number
  pauseDuration: number
  idleTimer: number
}

/** 物理事件类型 */
export type PhysicsEvent =
  | { type: 'landed'; position: Vec2 }
  | { type: 'edge-reached'; edge: 'left' | 'right'; position: Vec2 }
  | { type: 'direction-changed'; facing: Facing }
  | { type: 'walking-changed'; isWalking: boolean }

/** 物理引擎事件回调 */
export interface PhysicsCallbacks {
  onLanded?: (position: Vec2) => void
  onEdgeReached?: (edge: 'left' | 'right', position: Vec2) => void
  onDirectionChanged?: (facing: Facing) => void
  onWalkingChanged?: (isWalking: boolean) => void
}

// ── 屏幕信息缓存 ────────────────────────────────────────────────────────────

interface ScreenInfo {
  screenWidth: number
  screenHeight: number
  taskbarHeight: number
}

let cachedScreenInfo: ScreenInfo | null = null

/**
 * 初始化屏幕信息缓存。
 * 应在应用启动时、创建 PhysicsEngine 之前调用。
 *
 * @param info - 通过 IPC 从主进程获取的屏幕信息
 */
export function setScreenInfo(info: ScreenInfo): void {
  cachedScreenInfo = info
}

/**
 * 获取缓存的屏幕信息，未初始化时返回默认值（1920x1080，无任务栏）。
 */
export function getScreenInfo(): ScreenInfo {
  if (cachedScreenInfo) return cachedScreenInfo
  return { screenWidth: 1920, screenHeight: 1080, taskbarHeight: 0 }
}

// ── 纯函数工具 ──────────────────────────────────────────────────────────────

function calculateBounds(petWidth: number, petHeight: number): ScreenBounds {
  const info = getScreenInfo()
  return {
    left: 0,
    right: info.screenWidth - petWidth,
    groundY: info.screenHeight - petHeight,
    screenWidth: info.screenWidth,
    screenHeight: info.screenHeight
  }
}

function clampX(x: number, bounds: ScreenBounds): number {
  return Math.max(bounds.left, Math.min(bounds.right, x))
}

function vec2(x: number, y: number): Vec2 {
  return { x, y }
}

function createInitialState(): PhysicsState {
  return {
    position: vec2(0, 0),
    velocity: vec2(0, 0),
    facing: 'right',
    isWalking: false,
    isFalling: false,
    isOnGround: false,
    isPaused: false,
    walkDuration: 0,
    pauseDuration: 0,
    idleTimer: 0
  }
}

// ── 物理子系统（纯函数，输入状态 + 配置 -> 输出新状态 + 事件）────────────

/**
 * 重力子系统。
 *
 * velocityY += gravity * delta
 * positionY += velocityY * delta
 *
 * 地面碰撞后根据 bounceDamping 决定反弹或停止。
 */
function applyGravity(
  state: PhysicsState,
  bounds: ScreenBounds,
  config: PhysicsConfig,
  delta: number
): { state: PhysicsState; events: PhysicsEvent[] } {
  if (!state.isFalling) return { state, events: [] }

  const events: PhysicsEvent[] = []
  let newVelocityY = state.velocity.y + config.gravity * delta
  let newPositionY = state.position.y + newVelocityY * delta
  let isFalling = true
  let isOnGround = false

  if (newPositionY >= bounds.groundY) {
    newPositionY = bounds.groundY

    if (config.bounceDamping > 0 && Math.abs(newVelocityY) > 1) {
      newVelocityY = -newVelocityY * config.bounceDamping
    } else {
      newVelocityY = 0
      isFalling = false
      isOnGround = true
    }

    events.push({ type: 'landed', position: vec2(state.position.x, newPositionY) })
  }

  return {
    state: {
      ...state,
      position: vec2(state.position.x, newPositionY),
      velocity: vec2(state.velocity.x, newVelocityY),
      isFalling,
      isOnGround
    },
    events
  }
}

/**
 * 行走子系统。
 *
 * 根据朝向更新水平位置，检测屏幕边界并按策略处理。
 */
function applyWalking(
  state: PhysicsState,
  bounds: ScreenBounds,
  config: PhysicsConfig,
  delta: number
): { state: PhysicsState; events: PhysicsEvent[] } {
  if (!state.isWalking || !state.isOnGround || state.isPaused) {
    return { state, events: [] }
  }

  const events: PhysicsEvent[] = []
  const dir = state.facing === 'right' ? 1 : -1
  const newVelocityX = config.walkSpeed * dir
  let newPositionX = state.position.x + newVelocityX * delta
  let facing: Facing = state.facing
  let isWalking: boolean = state.isWalking
  let velocityX = newVelocityX

  // 边界检测
  let hitEdge: 'left' | 'right' | null = null
  if (newPositionX <= bounds.left) {
    newPositionX = bounds.left
    hitEdge = 'left'
  } else if (newPositionX >= bounds.right) {
    newPositionX = bounds.right
    hitEdge = 'right'
  }

  if (hitEdge) {
    events.push({ type: 'edge-reached', edge: hitEdge, position: vec2(newPositionX, state.position.y) })

    switch (config.screenEdgeBehavior) {
      case 'bounce':
        facing = state.facing === 'right' ? 'left' : 'right'
        velocityX = 0
        events.push({ type: 'direction-changed', facing })
        break
      case 'wrap':
        newPositionX = hitEdge === 'left' ? bounds.right : bounds.left
        break
      case 'stop':
        velocityX = 0
        isWalking = false
        events.push({ type: 'walking-changed', isWalking: false })
        break
    }
  }

  return {
    state: {
      ...state,
      position: vec2(newPositionX, state.position.y),
      velocity: vec2(velocityX, state.velocity.y),
      facing,
      isWalking
    },
    events
  }
}

/**
 * 随机行走 AI 子系统。
 *
 * 状态机：
 *   idle (等待 idleTimeout)
 *     -> walk (随机方向，持续 2~6 秒)
 *       -> pause (停顿 1~4 秒)
 *         -> walk 或 idle (随机决定)
 */
function applyRandomWalk(
  state: PhysicsState,
  config: PhysicsConfig,
  deltaTime: number
): { state: PhysicsState; events: PhysicsEvent[] } {
  if (!config.randomWalk || !state.isOnGround) {
    return { state, events: [] }
  }

  const events: PhysicsEvent[] = []
  let s = { ...state }

  if (s.isWalking) {
    if (s.isPaused) {
      // 停顿阶段
      s.pauseDuration -= deltaTime
      if (s.pauseDuration <= 0) {
        s.isPaused = false
        if (Math.random() < 0.5) {
          // 继续行走
          s.facing = Math.random() < 0.5 ? 'left' : 'right'
          s.walkDuration = 2000 + Math.random() * 4000
          s.idleTimer = 0
          events.push({ type: 'direction-changed', facing: s.facing })
        } else {
          // 回到 idle
          s.isWalking = false
          s.velocity = vec2(0, s.velocity.y)
          s.walkDuration = 0
          s.pauseDuration = 0
          s.idleTimer = 0
          events.push({ type: 'walking-changed', isWalking: false })
        }
      }
    } else {
      // 行走阶段
      s.walkDuration -= deltaTime
      if (s.walkDuration <= 0) {
        if (Math.random() < 0.6) {
          // 停顿后继续
          s.isPaused = true
          s.pauseDuration = 1000 + Math.random() * 3000
          s.velocity = vec2(0, s.velocity.y)
        } else {
          // 直接停止
          s.isWalking = false
          s.isPaused = false
          s.velocity = vec2(0, s.velocity.y)
          s.walkDuration = 0
          s.pauseDuration = 0
          s.idleTimer = 0
          events.push({ type: 'walking-changed', isWalking: false })
        }
      }
    }
  } else {
    // idle 等待
    s.idleTimer += deltaTime
    if (s.idleTimer >= config.idleTimeout) {
      s.facing = Math.random() < 0.5 ? 'left' : 'right'
      s.walkDuration = 2000 + Math.random() * 4000
      s.isWalking = true
      s.isPaused = false
      s.idleTimer = 0
      events.push({ type: 'direction-changed', facing: s.facing })
      events.push({ type: 'walking-changed', isWalking: true })
    }
  }

  return { state: s, events }
}

// ── PhysicsEngine 主类 ──────────────────────────────────────────────────────

export class PhysicsEngine {
  private state: PhysicsState
  private config: PhysicsConfig
  private bounds: ScreenBounds
  private petWidth: number
  private petHeight: number
  private callbacks: PhysicsCallbacks = {}

  constructor(
    petWidth: number,
    petHeight: number,
    config: Partial<PhysicsConfig> = {}
  ) {
    this.config = { ...DEFAULT_PHYSICS_CONFIG, ...config }
    this.petWidth = petWidth
    this.petHeight = petHeight
    this.bounds = calculateBounds(petWidth, petHeight)
    this.state = createInitialState()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 事件派发
  // ═══════════════════════════════════════════════════════════════════════════

  private dispatchEvents(events: PhysicsEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'landed':
          this.callbacks.onLanded?.(event.position)
          break
        case 'edge-reached':
          this.callbacks.onEdgeReached?.(event.edge, event.position)
          break
        case 'direction-changed':
          this.callbacks.onDirectionChanged?.(event.facing)
          break
        case 'walking-changed':
          this.callbacks.onWalkingChanged?.(event.isWalking)
          break
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 初始化与生命周期
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 初始化桌宠位置和物理状态。
   *
   * @param x - 初始 X 坐标（默认：屏幕中央）
   * @param y - 初始 Y 坐标（默认：地面上）
   */
  public init(x?: number, y?: number): void {
    this.bounds = calculateBounds(this.petWidth, this.petHeight)

    const posX = x ?? (this.bounds.screenWidth - this.petWidth) / 2
    const posY = y ?? this.bounds.groundY

    this.state = {
      ...createInitialState(),
      position: vec2(posX, posY),
      isOnGround: posY >= this.bounds.groundY,
      isFalling: posY < this.bounds.groundY
    }
  }

  /**
   * 注册事件回调。新回调会与已有回调合并。
   */
  public on(callbacks: PhysicsCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  /**
   * 清除所有回调。
   */
  public off(): void {
    this.callbacks = {}
  }

  /**
   * 销毁引擎，清理状态。
   */
  public destroy(): void {
    this.callbacks = {}
    this.state = createInitialState()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 边界管理
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 窗口大小改变或显示器切换时重新计算边界。
   */
  public recalculateBounds(): void {
    this.bounds = calculateBounds(this.petWidth, this.petHeight)

    let s = this.state
    if (s.position.y > this.bounds.groundY) {
      s = {
        ...s,
        position: vec2(s.position.x, this.bounds.groundY),
        isOnGround: true,
        isFalling: false,
        velocity: vec2(s.velocity.x, 0)
      }
    }
    s = { ...s, position: vec2(clampX(s.position.x, this.bounds), s.position.y) }
    this.state = s
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 主更新循环
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 主更新函数 - 每帧由 PixiJS ticker 调用。
   *
   * 通过管道依次执行：
   *   1. 重力子系统
   *   2. 行走子系统
   *   3. 随机行走 AI 子系统
   *
   * 所有子系统产生的事件在管道结束后统一派发。
   *
   * @param ticker - PixiJS Ticker 对象，提供 deltaMS
   */
  public update(ticker: { deltaMS: number }): void {
    const delta = ticker.deltaMS / (1000 / 60)
    const deltaTime = ticker.deltaMS
    const allEvents: PhysicsEvent[] = []

    // 1. 重力
    const gravityResult = applyGravity(this.state, this.bounds, this.config, delta)
    this.state = gravityResult.state
    allEvents.push(...gravityResult.events)

    // 2. 行走
    const walkResult = applyWalking(this.state, this.bounds, this.config, delta)
    this.state = walkResult.state
    allEvents.push(...walkResult.events)

    // 3. 随机行走 AI
    const aiResult = applyRandomWalk(this.state, this.config, deltaTime)
    this.state = aiResult.state
    allEvents.push(...aiResult.events)

    // 统一派发事件
    this.dispatchEvents(allEvents)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 公共 API - 位置与速度
  // ═══════════════════════════════════════════════════════════════════════════

  /** 获取当前位置（只读副本） */
  public getPosition(): Readonly<Vec2> {
    return { ...this.state.position }
  }

  /**
   * 设置位置（用于拖拽结束后放置桌宠）。
   */
  public setPosition(x: number, y: number): void {
    const posX = clampX(x, this.bounds)
    if (y >= this.bounds.groundY) {
      this.state = {
        ...this.state,
        position: vec2(posX, this.bounds.groundY),
        isOnGround: true,
        isFalling: false,
        velocity: vec2(this.state.velocity.x, 0)
      }
    } else {
      this.state = {
        ...this.state,
        position: vec2(posX, y),
        isOnGround: false,
        isFalling: true
      }
    }
  }

  /** 获取当前速度（只读副本） */
  public getVelocity(): Readonly<Vec2> {
    return { ...this.state.velocity }
  }

  /**
   * 设置速度（用于拖拽抛出时的初始速度）。
   */
  public setVelocity(vx: number, vy: number): void {
    this.state = {
      ...this.state,
      velocity: vec2(vx, vy),
      isFalling: vy !== 0 ? true : this.state.isFalling,
      isOnGround: vy !== 0 ? false : this.state.isOnGround
    }
  }

  /** 获取当前朝向 */
  public getFacing(): Facing {
    return this.state.facing
  }

  /** 强制设置朝向 */
  public setFacing(facing: Facing): void {
    this.state = { ...this.state, facing }
    this.callbacks.onDirectionChanged?.(facing)
  }

  /** 是否正在行走 */
  public getIsWalking(): boolean {
    return this.state.isWalking
  }

  /** 是否在地面上 */
  public getIsOnGround(): boolean {
    return this.state.isOnGround
  }

  /** 是否正在下落 */
  public getIsFalling(): boolean {
    return this.state.isFalling
  }

  /** 获取屏幕边界信息（只读副本） */
  public getBounds(): Readonly<ScreenBounds> {
    return { ...this.bounds }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 公共 API - 外部触发
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 开始下落 - 拖拽释放后调用。
   *
   * @param vx - 释放时的水平速度（可选，模拟抛出效果）
   */
  public startFalling(vx: number = 0): void {
    this.state = {
      ...this.state,
      isFalling: true,
      isOnGround: false,
      velocity: vec2(vx, 0),
      isWalking: false,
      isPaused: false,
      walkDuration: 0,
      pauseDuration: 0,
      idleTimer: 0
    }
    this.callbacks.onWalkingChanged?.(false)
  }

  /**
   * 强制行走。
   *
   * @param direction - 行走方向
   * @param duration  - 持续时间（ms），默认无限
   */
  public walk(direction: Facing, duration?: number): void {
    this.state = { ...this.state, facing: direction }
    this.callbacks.onDirectionChanged?.(direction)

    if (!this.state.isOnGround) return

    this.state = {
      ...this.state,
      isWalking: true,
      isPaused: false,
      walkDuration: duration ?? Infinity,
      idleTimer: 0
    }
    this.callbacks.onWalkingChanged?.(true)
  }

  /** 强制进入 idle 状态 */
  public idle(): void {
    if (!this.state.isWalking) return
    this.state = {
      ...this.state,
      isWalking: false,
      isPaused: false,
      velocity: vec2(0, this.state.velocity.y),
      walkDuration: 0,
      pauseDuration: 0,
      idleTimer: 0
    }
    this.callbacks.onWalkingChanged?.(false)
  }

  /**
   * 翻转桌宠朝向。
   */
  public flipDirection(): void {
    const newFacing: Facing = this.state.facing === 'right' ? 'left' : 'right'
    this.state = { ...this.state, facing: newFacing }
    this.callbacks.onDirectionChanged?.(newFacing)
  }

  /**
   * 获取用于渲染的水平缩放值。
   * right -> 1, left -> -1
   */
  public getScaleX(): number {
    return this.state.facing === 'right' ? 1 : -1
  }

  /**
   * 更新桌宠尺寸（用户调整大小后调用）。
   */
  public setPetSize(width: number, height: number): void {
    this.petWidth = width
    this.petHeight = height
    this.recalculateBounds()
  }

  /**
   * 运行时更新配置参数。
   */
  public updateConfig(config: Partial<PhysicsConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /** 获取当前配置（只读副本） */
  public getConfig(): Readonly<PhysicsConfig> {
    return { ...this.config }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 调试工具
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 获取当前完整状态快照（可用于调试、序列化、回放）。
   */
  public getSnapshot(): Readonly<PhysicsState> {
    return { ...this.state }
  }
}
