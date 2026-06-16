/**
 * Live2D 适配器 — 基于 pixi-live2d-display
 *
 * 使用 pixi-live2d-display 加载 Live2D Cubism 模型，
 * 通过 motion group 映射 AnimationState。
 *
 * 参考: https://github.com/guansss/pixi-live2d-display
 */

import { Container, Rectangle, Graphics, Text } from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism4'
import type { RenderAdapter, AdapterConfig, AnimationState } from './adapter'
import { t } from '@shared/i18n'

export class Live2DAdapter implements RenderAdapter {
  private container: Container | null = null
  private model: Live2DModel | null = null
  private _ready = false
  private config: AdapterConfig | null = null

  get ready(): boolean {
    return this._ready
  }

  async init(container: Container, config: AdapterConfig): Promise<void> {
    this.container = container
    this.config = config

    try {
      this.model = (await Live2DModel.from(config.modelPath)) as unknown as Live2DModel
      const model = this.model as any

      // 缩放模型以适应目标尺寸
      const modelWidth = model.width ?? 200
      const modelHeight = model.height ?? 200
      const scaleX = config.width / modelWidth
      const scaleY = config.height / modelHeight
      const scale = Math.min(scaleX, scaleY)
      model.scale.set(scale)

      // 锚点居中
      model.anchor.set(0.5, 0.5)

      container.addChild(model)
      this._ready = true
    } catch (error) {
      console.error('[Live2DAdapter] Failed to load model:', error)
      // 加载失败时显示占位符
      this.showPlaceholder(container, config)
      this._ready = true
    }
  }

  setState(state: AnimationState): void {
    if (!this._ready || !this.model) return

    const model = this.model as any

    // AnimationState → Live2D motion group 映射（含 fallback）
    // 用户的 .model3.json 中应定义对应的 motion group
    // 优先尝试小写名称，其次尝试常见 Live2D 命名惯例
    const motionFallbacks: Record<AnimationState, string[]> = {
      idle: ['idle', 'Idle', 'idle_0', 'TapBody'],
      walk: ['walk', 'Walk', 'walk_0'],
      drag: ['drag', 'Drag', 'flick', 'Flick'],
      fall: ['fall', 'Fall', 'flick', 'Flick'],
      click: ['click', 'Click', 'tap', 'Tap', 'TapBody', 'TapHead']
    }

    const candidates = motionFallbacks[state] ?? [state]
    let triggered = false

    for (const group of candidates) {
      try {
        const result = model.motion(group, 0) // Priority 0 = 可中断
        if (result) {
          triggered = true
          break
        }
      } catch {
        // motion group 不存在，尝试下一个
      }
    }

    if (!triggered) {
      // 所有候选 group 都不存在，尝试播放第一个可用的 motion
      try {
        model.motion('Idle', 0)
      } catch {
        // ignore
      }
    }

    // 点击状态尝试触发表情
    if (state === 'click') {
      try {
        model.expression()
      } catch {
        // 无表情定义，忽略
      }
    }
  }

  update(_delta: number): void {
    // Live2D 模型更新由 pixi-live2d-display 内部驱动，无需手动调用
  }

  getBounds(): Rectangle {
    if (this.model) {
      const model = this.model as any
      const bounds = model.getBounds?.()
      if (bounds) {
        return new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height)
      }
      // fallback: 使用模型尺寸和缩放计算
      const w = (model.width ?? 200) * (model.scale?.x ?? 1)
      const h = (model.height ?? 200) * (model.scale?.y ?? 1)
      return new Rectangle(-w / 2, -h / 2, w, h)
    }
    const w = this.config?.width ?? 200
    const h = this.config?.height ?? 200
    return new Rectangle(0, 0, w, h)
  }

  destroy(): void {
    if (this.model) {
      try {
        ;(this.model as any).destroy()
      } catch {
        // ignore
      }
      this.model = null
    }

    if (this.container) {
      this.container.removeChildren()
      this.container = null
    }
    this._ready = false
  }

  private showPlaceholder(container: Container, config: AdapterConfig): void {
    const bg = new Graphics()
    bg.beginFill(0x333355, 0.8)
    bg.drawRect(0, 0, config.width, config.height)
    bg.endFill()

    const text = new Text(t('live2d.loadFailed'), {
      fontSize: 14,
      fill: 0xaaaacc,
      align: 'center'
    })
    text.anchor.set(0.5)
    text.position.set(config.width / 2, config.height / 2)

    container.addChild(bg)
    container.addChild(text)
  }
}
