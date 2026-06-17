import type * as PIXI from 'pixi.js'
import { Point } from 'pixi.js'
import type { PetAction } from '../../../shared/types'

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

/** 二维坐标点 */
interface Point {
  x: number
  y: number
}

/** 输入事件类型 — 分发给状态机的事件 */
export type InputEvent =
  | { type: 'mousedown'; position: Point }
  | { type: 'mousemove'; position: Point }
  | { type: 'mouseup'; position: Point }
  | { type: 'click'; position: Point }
  | { type: 'contextmenu'; position: Point }
  | { type: 'drag-start'; position: Point }
  | { type: 'drag-move'; position: Point; delta: Point }
  | { type: 'drag-end'; position: Point }
  | { type: 'pointer-enter' }
  | { type: 'pointer-leave' }

/** 输入事件回调函数类型 */
export type InputEventCallback = (event: InputEvent) => void

/** 状态机接口 — InputHandler 仅依赖此最小接口 */
export interface IStateMachine {
  handleInput(event: InputEvent): void
}

/** InputHandler 配置选项 */
export interface InputHandlerOptions {
  /** 拖拽阈值（像素）。mousedown 到 mousemove 的累积距离超过此值才判定为拖拽 */
  dragThreshold?: number

  /** 点击最大持续时间（毫秒）。超过此时间的交互不判定为点击 */
  clickMaxDuration?: number

  /** 是否启用调试日志 */
  debug?: boolean
}

// ─────────────────────────────────────────────
// 默认配置
// ─────────────────────────────────────────────

const DEFAULT_OPTIONS: Required<InputHandlerOptions> = {
  dragThreshold: 5,
  clickMaxDuration: 300,
  debug: false
}

// ─────────────────────────────────────────────
// InputHandler 类
// ─────────────────────────────────────────────

/**
 * 桌宠输入处理器。
 *
 * 职责:
 * 1. 监听 PixiJS stage 上的鼠标事件
 * 2. 根据鼠标轨迹区分"拖拽"和"点击"
 * 3. 通过 IPC 通知主进程执行窗口操作（移动、穿透、菜单）
 * 4. 将交互事件分发给状态机
 * 5. 管理点击穿透的动态切换
 */
export class InputHandler {
  /** PixiJS 应用引用 */
  private app: PIXI.Application

  /** 状态机引用 */
  private stateMachine: IStateMachine

  /** 配置选项 */
  private options: Required<InputHandlerOptions>

  /** 桌宠渲染容器的引用，用于 hitTest */
  private petContainer: PIXI.Container | null = null

  // ─── 拖拽状态 ───

  /** 是否正在拖拽 */
  private isDragging = false

  /** 鼠标按下时的屏幕坐标 */
  private dragStartScreen: Point = { x: 0, y: 0 }

  /** 鼠标按下时的窗口坐标 */
  private dragStartWindow: Point = { x: 0, y: 0 }

  /** 鼠标按下时的时间戳 */
  private mouseDownTime = 0

  /** 当前鼠标是否在桌宠像素区域内（用于穿透管理） */
  private isPointerOverPet = false

  /** 是否已销毁 */
  private destroyed = false

  // ─── 事件监听器引用（用于清理） ───

  private boundOnPointerDown: (e: PIXI.interaction.InteractionEvent) => void
  private boundOnPointerMove: (e: PIXI.interaction.InteractionEvent) => void
  private boundOnPointerUp: (e: PIXI.interaction.InteractionEvent) => void
  private boundOnPointerUpOutside: (e: PIXI.interaction.InteractionEvent) => void
  private boundOnCanvasContextMenu: (e: MouseEvent) => void
  private boundOnWindowBlur: () => void

  /**
   * 底层 canvas 的 mousemove 处理器引用。
   * 用于穿透模式下检测鼠标是否进入了桌宠的像素区域。
   */
  private canvasMouseMoveHandler: ((e: MouseEvent) => void) | null = null
  private canvasMouseLeaveHandler: (() => void) | null = null
  private lastHitTestTime = 0

  /**
   * 创建 InputHandler 实例。
   *
   * @param app - PixiJS Application 实例
   * @param stateMachine - 桌宠状态机
   * @param options - 可选配置
   */
  constructor(app: PIXI.Application, stateMachine: IStateMachine, options?: InputHandlerOptions) {
    this.app = app
    this.stateMachine = stateMachine
    this.options = { ...DEFAULT_OPTIONS, ...options }

    // 绑定事件处理器，保存引用以便后续清理
    this.boundOnPointerDown = this.onPointerDown.bind(this)
    this.boundOnPointerMove = this.onPointerMove.bind(this)
    this.boundOnPointerUp = this.onPointerUp.bind(this)
    this.boundOnPointerUpOutside = this.onPointerUpOutside.bind(this)
    this.boundOnCanvasContextMenu = this.onCanvasContextMenu.bind(this)
    this.boundOnWindowBlur = this.onWindowBlur.bind(this)

    this.attachListeners()
  }

  // ─────────────────────────────────────────
  // 公共 API
  // ─────────────────────────────────────────

  /**
   * 设置桌宠渲染容器。
   * InputHandler 需要此引用来进行像素级 hitTest，
   * 判断鼠标是否悬停在桌宠的可见像素上。
   *
   * @param container - PixiJS Container（桌宠的渲染根容器）
   */
  setPetContainer(container: PIXI.Container): void {
    this.petContainer = container

    // 为容器开启事件，确保 PixiJS InteractionSystem 能对其进行 hitTest
    container.interactive = true
    container.cursor = 'pointer'
  }

  /**
   * 获取当前是否正在拖拽。
   */
  getIsDragging(): boolean {
    return this.isDragging
  }

  /**
   * 获取当前鼠标是否在桌宠区域上。
   */
  getIsPointerOverPet(): boolean {
    return this.isPointerOverPet
  }

  /**
   * 销毁 InputHandler，移除所有事件监听。
   */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true

    this.detachListeners()

    if (this.options.debug) {
      console.log('[InputHandler] Destroyed')
    }
  }

  // ─────────────────────────────────────────
  // 事件监听器注册 / 移除
  // ─────────────────────────────────────────

  /**
   * 注册所有 PixiJS stage 级别的事件监听器。
   * 使用 stage 而非 canvas 的原因是 PixiJS 的 FederatedEvent
   * 已经处理了坐标转换和事件冒泡。
   */
  private attachListeners(): void {
    const stage = this.app.stage

    // stage 级别: 捕获所有指针事件
    stage.on('pointerdown', this.boundOnPointerDown)
    stage.on('pointermove', this.boundOnPointerMove)
    stage.on('pointerup', this.boundOnPointerUp)
    stage.on('pointerupoutside', this.boundOnPointerUpOutside)

    // 右键菜单: v6 无 rightclick 事件，使用 canvas DOM contextmenu
    const canvas = this.app.view as HTMLCanvasElement
    canvas.addEventListener('contextmenu', this.boundOnCanvasContextMenu)

    // 窗口失焦时强制结束拖拽
    window.addEventListener('blur', this.boundOnWindowBlur)

    // 穿透管理: 使用底层 canvas 的 mousemove 进行 hitTest
    // 因为当窗口处于穿透模式时，PixiJS 的事件不会触发
    this.attachCanvasHitTestListener()
  }

  /**
   * 移除所有事件监听器。
   */
  private detachListeners(): void {
    const stage = this.app.stage

    stage.off('pointerdown', this.boundOnPointerDown)
    stage.off('pointermove', this.boundOnPointerMove)
    stage.off('pointerup', this.boundOnPointerUp)
    stage.off('pointerupoutside', this.boundOnPointerUpOutside)

    const canvas = this.app.view as HTMLCanvasElement
    canvas.removeEventListener('contextmenu', this.boundOnCanvasContextMenu)

    window.removeEventListener('blur', this.boundOnWindowBlur)

    this.detachCanvasHitTestListener()
  }

  // ─────────────────────────────────────────
  // Canvas 级别 hitTest（穿透管理核心）
  // ─────────────────────────────────────────

  /**
   * 注册 canvas 级别的 mousemove 监听器。
   *
   * 当窗口处于穿透模式（setIgnoreMouseEvents(true, { forward: true })）时，
   * 主进程仍然会通过 forward 机制将 mousemove 事件转发给渲染进程。
   * 我们利用这些转发的事件来做 hitTest，判断鼠标是否在桌宠像素上。
   *
   * 如果鼠标在桌宠像素上 -> IPC setInteractive(true) 取消穿透
   * 如果鼠标离开桌宠像素 -> IPC setInteractive(false) 恢复穿透
   */
  private attachCanvasHitTestListener(): void {
    // 穿透模式下 forwarded mousemove 事件发送到 document，不是 canvas
    // ponytail: throttle hitTest to ~30ms intervals (pixel hitTest is expensive)
    this.canvasMouseMoveHandler = (e: MouseEvent) => {
      if (this.destroyed) return
      const now = performance.now()
      if (now - this.lastHitTestTime < 30) return
      this.lastHitTestTime = now
      this.hitTestAtClientPosition(e.clientX, e.clientY)
    }

    this.canvasMouseLeaveHandler = () => {
      if (this.destroyed) return
      if (this.isPointerOverPet) {
        this.isPointerOverPet = false
        this.setInteractive(false)
      }
    }

    document.addEventListener('mousemove', this.canvasMouseMoveHandler)
    document.addEventListener('mouseleave', this.canvasMouseLeaveHandler)
  }

  /**
   * 移除 canvas 级别的监听器。
   */
  private detachCanvasHitTestListener(): void {
    if (this.canvasMouseMoveHandler) {
      document.removeEventListener('mousemove', this.canvasMouseMoveHandler)
      this.canvasMouseMoveHandler = null
    }
    if (this.canvasMouseLeaveHandler) {
      document.removeEventListener('mouseleave', this.canvasMouseLeaveHandler)
      this.canvasMouseLeaveHandler = null
    }
  }

  /**
   * 在指定的客户端坐标处执行 hitTest。
   * 使用 PixiJS EventSystem 的 hitTest 方法判断该坐标是否命中桌宠容器的像素。
   *
   * @param clientX - 鼠标在视口中的 X 坐标
   * @param clientY - 鼠标在视口中的 Y 坐标
   */
  private hitTestAtClientPosition(clientX: number, clientY: number): void {
    if (!this.petContainer) return

    // 将客户端坐标转换为 PixiJS 内部坐标（需要乘以 resolution）
    const rect = (this.app.view as HTMLCanvasElement).getBoundingClientRect()
    const resolution = this.app.renderer.resolution
    const localX = (clientX - rect.left) * resolution
    const localY = (clientY - rect.top) * resolution

    // v6: 使用 InteractionManager 的 hitTest
    const interactionManager = this.app.renderer.plugins.interaction as PIXI.interaction.InteractionManager
    const hitResult = interactionManager.hitTest(
      new Point(localX, localY),
      this.app.stage
    )

    // 判断命中结果是否为桌宠容器或其子节点（排除根容器自身）
    const isOverPet =
      hitResult !== this.app.stage && this.isDescendantOfPet(hitResult as PIXI.Container)

    if (isOverPet && !this.isPointerOverPet) {
      // 鼠标进入桌宠区域
      this.isPointerOverPet = true
      this.setInteractive(true)
    } else if (!isOverPet && this.isPointerOverPet && !this.isDragging) {
      // 鼠标离开桌宠区域（拖拽中不切换穿透，避免窗口丢失鼠标捕获）
      this.isPointerOverPet = false
      this.setInteractive(false)
    }
  }

  /**
   * 判断给定的显示对象是否是桌宠容器的子节点。
   */
  private isDescendantOfPet(displayObject: PIXI.Container): boolean {
    let current: PIXI.Container | null = displayObject as PIXI.Container
    while (current) {
      if (current === this.petContainer) return true
      current = current.parent
    }
    return false
  }

  // ─────────────────────────────────────────
  // IPC 辅助方法
  // ─────────────────────────────────────────

  /**
   * 通过 IPC 通知主进程切换窗口的鼠标穿透状态。
   */
  private setInteractive(flag: boolean): void {
    window.electronAPI.setInteractive(flag)
  }

  /**
   * 通过 IPC 通知主进程移动窗口。
   */
  private moveWindow(x: number, y: number): void {
    window.electronAPI.moveWindow(x, y)
  }

  /**
   * 通过 IPC 通知主进程弹出右键菜单。
   */
  private showContextMenu(): void {
    window.electronAPI.showContextMenu()
  }

  /**
   * 通过 IPC 通知主进程执行动作。
   */
  private executeAction(action: PetAction): void {
    window.electronAPI.executeAction(action).then((result) => {
      if (this.options.debug) {
        console.log(`[InputHandler] Action "${action.id}" result:`, result)
      }
    })
  }

  // ─────────────────────────────────────────
  // PixiJS 事件处理器
  // ─────────────────────────────────────────

  /**
   * pointerdown 事件处理器。
   * 记录拖拽起始位置和时间。
   */
  private onPointerDown(e: PIXI.interaction.InteractionEvent): void {
    if (this.destroyed) return

    const position = this.getStagePosition(e)

    // 记录起始状态
    const oe = e.data.originalEvent as MouseEvent
    this.dragStartScreen = { x: oe.screenX, y: oe.screenY }
    this.dragStartWindow = { ...this.getWindowPosition() }
    this.mouseDownTime = Date.now()
    this.isDragging = false

    // 通知状态机鼠标按下
    this.emitToStateMachine({ type: 'mousedown', position })

    if (this.options.debug) {
      console.log('[InputHandler] pointerdown at', position)
    }
  }

  /**
   * pointermove 事件处理器。
   * 当鼠标按下并移动超过阈值时进入拖拽模式。
   * 拖拽模式下通过 IPC 移动窗口。
   */
  private onPointerMove(e: PIXI.interaction.InteractionEvent): void {
    if (this.destroyed) return

    const position = this.getStagePosition(e)
    const oe = e.data.originalEvent as MouseEvent

    // 只有鼠标按下时才可能进入拖拽
    if (this.mouseDownTime > 0) {
      const dx = oe.screenX - this.dragStartScreen.x
      const dy = oe.screenY - this.dragStartScreen.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (!this.isDragging && distance >= this.options.dragThreshold) {
        // 超过阈值，进入拖拽模式
        this.isDragging = true

        // 切换穿透状态: 拖拽期间必须保持可交互
        this.setInteractive(true)

        // 通知状态机
        this.emitToStateMachine({ type: 'drag-start', position: this.dragStartScreen })

        if (this.options.debug) {
          console.log('[InputHandler] drag-start, distance:', distance.toFixed(1))
        }
      }

      if (this.isDragging) {
        // 计算新的窗口位置 = 拖拽起始窗口位置 + 鼠标偏移量
        const newX = this.dragStartWindow.x + dx
        const newY = this.dragStartWindow.y + dy

        // 通过 IPC 移动窗口
        this.moveWindow(newX, newY)

        // 通知状态机
        this.emitToStateMachine({
          type: 'drag-move',
          position: { x: oe.screenX, y: oe.screenY },
          delta: { x: dx, y: dy }
        })
      }
    }

    // 通知状态机鼠标移动
    this.emitToStateMachine({ type: 'mousemove', position })
  }

  /**
   * pointerup 事件处理器。
   * 结束拖拽或触发点击。
   */
  private onPointerUp(e: PIXI.interaction.InteractionEvent): void {
    if (this.destroyed) return
    this.handlePointerUp(e)
  }

  /**
   * pointerupoutside 事件处理器。
   * 当鼠标在窗口外松开时也需要结束拖拽。
   */
  private onPointerUpOutside(e: PIXI.interaction.InteractionEvent): void {
    if (this.destroyed) return
    this.handlePointerUp(e)
  }

  /**
   * pointerup 的统一处理逻辑。
   * 区分点击和拖拽结束。
   */
  private handlePointerUp(e: PIXI.interaction.InteractionEvent): void {
    if (this.mouseDownTime === 0) return // 没有对应的 mousedown

    const position = this.getStagePosition(e)
    const oe = e.data.originalEvent as MouseEvent
    const duration = Date.now() - this.mouseDownTime
    const dx = oe.screenX - this.dragStartScreen.x
    const dy = oe.screenY - this.dragStartScreen.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (this.isDragging) {
      // ─── 拖拽结束 ───
      this.isDragging = false

      // 通知状态机
      this.emitToStateMachine({ type: 'drag-end', position })

      // 拖拽结束后延迟恢复穿透检测
      // 给一小段延迟让窗口稳定下来
      setTimeout(() => {
        if (!this.destroyed) {
          this.hitTestAtClientPosition(oe.screenX, oe.screenY)
        }
      }, 100)

      if (this.options.debug) {
        console.log('[InputHandler] drag-end at', position)
      }
    } else if (distance < this.options.dragThreshold && duration < this.options.clickMaxDuration) {
      // ─── 判定为点击 ───
      this.emitToStateMachine({ type: 'click', position })

      if (this.options.debug) {
        console.log(
          '[InputHandler] click at',
          position,
          `(distance: ${distance.toFixed(1)}, duration: ${duration}ms)`
        )
      }
    }

    // 通知状态机鼠标松开
    this.emitToStateMachine({ type: 'mouseup', position })

    // 重置状态
    this.mouseDownTime = 0
    this.dragStartScreen = { x: 0, y: 0 }
  }

  /**
   * 右键点击处理器（canvas DOM contextmenu 事件）。
   * 阻止默认行为，通过 IPC 请求主进程弹出上下文菜单。
   */
  private onCanvasContextMenu(e: MouseEvent): void {
    if (this.destroyed) return

    e.preventDefault()
    e.stopPropagation()

    const rect = (this.app.view as HTMLCanvasElement).getBoundingClientRect()
    const position = { x: e.clientX - rect.left, y: e.clientY - rect.top }

    // 通知状态机
    this.emitToStateMachine({ type: 'contextmenu', position })

    // 通过 IPC 请求主进程弹出菜单
    this.showContextMenu()

    if (this.options.debug) {
      console.log('[InputHandler] contextmenu at', position)
    }
  }

  /**
   * 窗口失焦时强制结束拖拽。
   * 避免用户在拖拽过程中切换窗口焦点导致拖拽状态悬挂。
   */
  private onWindowBlur(): void {
    if (this.isDragging) {
      this.isDragging = false
      this.mouseDownTime = 0
      this.emitToStateMachine({ type: 'drag-end', position: { x: 0, y: 0 } })

      if (this.options.debug) {
        console.log('[InputHandler] Window blur during drag, force drag-end')
      }
    }
  }

  // ─────────────────────────────────────────
  // 辅助方法
  // ─────────────────────────────────────────

  /**
   * 将 InteractionEvent 的坐标转换为 stage 内的局部坐标。
   */
  private getStagePosition(e: PIXI.interaction.InteractionEvent): Point {
    const local = e.data.getLocalPosition(this.app.stage)
    return { x: local.x, y: local.y }
  }

  /**
   * 获取当前 Electron 窗口的屏幕坐标。
   */
  private getWindowPosition(): Point {
    // 使用 screenLeft/screenTop（IE/标准）或 screenX/screenY
    return {
      x: window.screenLeft ?? window.screenX ?? 0,
      y: window.screenTop ?? window.screenY ?? 0
    }
  }

  /**
   * 将输入事件分发给状态机。
   */
  private emitToStateMachine(event: InputEvent): void {
    this.stateMachine.handleInput(event)
  }

}

// ─────────────────────────────────────────────
// 像素级 hitArea 增强工具
// ─────────────────────────────────────────────

/**
 * 为桌宠 Sprite 设置像素级 hitArea。
 * 基于纹理的 alpha 通道生成碰撞区域。
 *
 * @param sprite - 桌宠的 AnimatedSprite 或 Sprite
 * @param threshold - alpha 阈值 (0-255)，低于此值的像素视为透明
 */
export function setupPixelHitArea(
  sprite: PIXI.AnimatedSprite | PIXI.Sprite,
  threshold = 128
): void {
  const texture = sprite.texture
  if (!texture || !texture.baseTexture) return

  const source = texture.baseTexture.resource as HTMLImageElement | ImageBitmap
  if (!source) return

  // 创建临时 canvas 提取像素数据
  const canvas = document.createElement('canvas')
  const width = texture.width
  const height = texture.height
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 绘制纹理到临时 canvas
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height)

  try {
    const imageData = ctx.getImageData(0, 0, width, height)
    const pixels = imageData.data

    // 使用 PixiJS 8 支持的自定义 contains 方法实现像素级碰撞
    sprite.hitArea = {
      contains(x: number, y: number): boolean {
        const px = Math.floor(x)
        const py = Math.floor(y)
        if (px < 0 || py < 0 || px >= width || py >= height) return false

        // 读取该像素的 alpha 值
        const alphaIndex = (py * width + px) * 4 + 3
        return pixels[alphaIndex] >= threshold
      }
    } as PIXI.IHitArea
  } catch {
    // 跨域限制可能导致 getImageData 失败
    console.warn(
      '[InputHandler] Cannot setup pixel hitArea (CORS?), falling back to bounds'
    )
  }
}
