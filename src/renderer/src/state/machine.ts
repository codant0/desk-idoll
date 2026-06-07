import type { AnimationState, StateEvent } from '@shared/types'
import type { InputEvent } from '../engine/input'

// ── 本地类型 ─────────────────────────────────

/**
 * 状态转换表类型。
 * 外层 Record 的 key 是当前状态，内层 Record 的 key 是触发事件，value 是目标状态。
 * 若某个状态下某事件未定义，则该事件在该状态下被忽略（不触发转换）。
 */
export type TransitionTable = Record<AnimationState, Partial<Record<StateEvent, AnimationState>>>

/**
 * 状态回调函数类型。
 */
export type StateCallback = (state: AnimationState) => void

// ── 状态机 ───────────────────────────────────

/**
 * 行为状态机。
 *
 * 职责:
 * - 维护当前动画状态
 * - 根据事件驱动状态转换
 * - 在状态进入/退出时触发回调，协调渲染、物理、输入子系统
 *
 * 用法:
 * ```typescript
 * const machine = new StateMachine();
 *
 * // 注册回调
 * machine.onEnter('idle', (state) => { // 启动 idle 动画 });
 * machine.onExit('idle', (state) => { // 清除计时器 });
 *
 * // 触发事件
 * machine.emit('timeout');  // idle -> walk
 * machine.emit('mousedown'); // walk -> drag
 * machine.emit('mouseup');   // drag -> fall
 * machine.emit('landed');    // fall -> idle
 * ```
 */
export class StateMachine {
  /** 当前状态 */
  private currentState: AnimationState = 'idle'

  /** 上一个状态（用于 click 完成后恢复） */
  private previousState: AnimationState = 'idle'

  /** 状态转换表 */
  private transitions: TransitionTable = {
    idle:  { timeout: 'walk', mousedown: 'drag', click: 'click' },
    walk:  { edge: 'idle', mousedown: 'drag', click: 'click' },
    drag:  { mouseup: 'fall' },
    fall:  { landed: 'idle' },
    click: { actionDone: 'idle' }
  }

  /** 进入状态回调列表。每个状态可注册多个回调。 */
  private enterCallbacks: Map<AnimationState, Set<StateCallback>> = new Map()

  /** 退出状态回调列表。每个状态可注册多个回调。 */
  private exitCallbacks: Map<AnimationState, Set<StateCallback>> = new Map()

  /**
   * 创建状态机实例。
   *
   * @param initialState - 初始状态，默认为 'idle'
   */
  constructor(initialState: AnimationState = 'idle') {
    this.currentState = initialState
    this.previousState = initialState

    // 初始化所有状态的回调集合
    const states: AnimationState[] = ['idle', 'walk', 'drag', 'fall', 'click']
    for (const state of states) {
      this.enterCallbacks.set(state, new Set())
      this.exitCallbacks.set(state, new Set())
    }
  }

  // ──────────────────────────────────────────────
  //  公共 API
  // ──────────────────────────────────────────────

  /**
   * 获取当前状态。
   *
   * @returns 当前动画状态
   */
  getCurrentState(): AnimationState {
    return this.currentState
  }

  /**
   * 获取上一个状态。
   * 用于 click 动作完成后恢复到之前的状态（idle 或 walk）。
   *
   * @returns 上一个动画状态
   */
  getPreviousState(): AnimationState {
    return this.previousState
  }

  /**
   * 触发事件，驱动状态转换。
   *
   * 如果当前状态下该事件有对应的目标状态，则:
   * 1. 调用当前状态的 onExit 回调
   * 2. 更新 currentState 为目标状态
   * 3. 调用目标状态的 onEnter 回调
   *
   * 如果当前状态下该事件无对应转换，则静默忽略。
   *
   * @param event - 要触发的事件
   * @returns 是否发生了状态转换
   */
  emit(event: StateEvent): boolean {
    const targetState = this.transitions[this.currentState]?.[event]

    if (!targetState) {
      // 该事件在当前状态下无对应转换，忽略
      return false
    }

    const fromState = this.currentState

    // 执行退出回调
    this.executeCallbacks(this.exitCallbacks, fromState)

    // 更新状态
    this.previousState = fromState
    this.currentState = targetState

    // 执行进入回调
    this.executeCallbacks(this.enterCallbacks, targetState)

    return true
  }

  handleInput(event: InputEvent): void {
    switch (event.type) {
      case 'drag-start':
        this.emit('mousedown') // idle/walk -> drag
        break
      case 'drag-end':
        this.emit('mouseup') // drag -> fall
        break
      case 'click':
        this.emit('click') // idle/walk -> click
        break
      // mousedown, mousemove, mouseup are handled internally by InputHandler
    }
  }

  /**
   * 注册状态进入回调。
   *
   * 当状态机进入指定状态时，回调被调用。
   * 同一个回调函数不会被重复注册。
   *
   * @param state - 目标状态
   * @param callback - 进入状态时调用的回调
   * @returns 取消注册的函数
   */
  onEnter(state: AnimationState, callback: StateCallback): () => void {
    const callbacks = this.enterCallbacks.get(state)
    if (callbacks) {
      callbacks.add(callback)
    }

    // 返回取消注册函数
    return () => {
      callbacks?.delete(callback)
    }
  }

  /**
   * 注册状态退出回调。
   *
   * 当状态机离开指定状态时，回调被调用。
   * 同一个回调函数不会被重复注册。
   *
   * @param state - 源状态
   * @param callback - 退出状态时调用的回调
   * @returns 取消注册的函数
   */
  onExit(state: AnimationState, callback: StateCallback): () => void {
    const callbacks = this.exitCallbacks.get(state)
    if (callbacks) {
      callbacks.add(callback)
    }

    // 返回取消注册函数
    return () => {
      callbacks?.delete(callback)
    }
  }

  /**
   * 检查某个事件在当前状态下是否会导致状态转换。
   *
   * @param event - 要检查的事件
   * @returns 如果事件会触发转换返回 true，否则返回 false
   */
  canEmit(event: StateEvent): boolean {
    return !!this.transitions[this.currentState]?.[event]
  }

  /**
   * 获取当前状态下所有可触发的事件。
   *
   * @returns 可触发事件数组
   */
  getAvailableEvents(): StateEvent[] {
    const transitions = this.transitions[this.currentState]
    if (!transitions) return []
    return Object.keys(transitions) as StateEvent[]
  }

  /**
   * 强制设置状态（不触发回调）。
   * 仅用于初始化或特殊情况，正常流程应使用 emit()。
   *
   * @param state - 要设置的状态
   */
  forceState(state: AnimationState): void {
    this.previousState = this.currentState
    this.currentState = state
  }

  /**
   * 重置状态机到初始状态。
   *
   * @param state - 重置到的状态，默认 'idle'
   */
  reset(state: AnimationState = 'idle'): void {
    this.currentState = state
    this.previousState = state
  }

  /**
   * 销毁状态机，清除所有回调。
   */
  destroy(): void {
    for (const [, callbacks] of this.enterCallbacks) {
      callbacks.clear()
    }
    for (const [, callbacks] of this.exitCallbacks) {
      callbacks.clear()
    }
  }

  // ──────────────────────────────────────────────
  //  内部方法
  // ──────────────────────────────────────────────

  /**
   * 执行指定状态的所有回调。
   */
  private executeCallbacks(
    callbackMap: Map<AnimationState, Set<StateCallback>>,
    state: AnimationState
  ): void {
    const callbacks = callbackMap.get(state)
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(state)
        } catch (error) {
          console.error(`[StateMachine] Error in ${state} callback:`, error)
        }
      }
    }
  }
}
