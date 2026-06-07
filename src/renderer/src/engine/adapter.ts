/**
 * adapter.ts - Render adapter interface definition
 *
 * RenderAdapter is the unified abstraction layer for Sprite Sheet and Live2D.
 * RenderEngine only operates animation models through this interface,
 * without directly depending on concrete implementations.
 */

import type * as PIXI from 'pixi.js'

// ============================================================
// AnimationState - Pet behavior states
// ============================================================

/**
 * Pet animation state.
 *
 * Corresponds one-to-one with StateMachine states:
 * - idle:  Standing still (occasional blink/breathing)
 * - walk:  Walking (moving left/right on desktop)
 * - drag:  Being dragged (grabbed by user mouse, following movement)
 * - fall:  Falling (gravity drop after release)
 * - click: Click feedback (animation after left-click)
 */
export type AnimationState = 'idle' | 'walk' | 'drag' | 'fall' | 'click'

// ============================================================
// RenderAdapter - Render adapter interface
// ============================================================

/**
 * Render adapter interface.
 *
 * Lifecycle:
 *   init() -> setState('idle') -> update() called each frame -> destroy()
 *
 * All adapters (SpriteAdapter, Live2DAdapter) must implement this interface.
 */
export interface RenderAdapter {
  /**
   * Initialize the adapter.
   *
   * Responsible for loading resources (spritesheet / model3.json) and creating render objects,
   * adding render objects as children of the passed container.
   *
   * @param container - PixiJS container, adapter will add render objects as its children
   * @param config - Adapter configuration (model path, frame rate, etc.)
   */
  init(container: PIXI.Container, config: AdapterConfig): Promise<void>

  /**
   * Switch animation state.
   *
   * When switching, should:
   * 1. Stop current animation
   * 2. Switch to target state's textures/motions
   * 3. Play new animation
   *
   * @param state - Target animation state
   */
  setState(state: AnimationState): void

  /**
   * Per-frame update.
   *
   * Driven by RenderEngine's ticker, receives delta time factor.
   * Adapter advances animation frames and updates internal state in this method.
   *
   * @param delta - Time factor (1.0 = normal speed, based on 60fps)
   */
  update(delta: number): void

  /**
   * Get current render object's collision bounds.
   *
   * Returned rectangle uses local coordinate system (relative to container).
   * Used by InputHandler to determine if mouse is within the pet area.
   *
   * @returns Collision bounds rectangle
   */
  getBounds(): PIXI.Rectangle

  /**
   * Destroy adapter, release all resources.
   *
   * Must:
   * 1. Remove render objects from container
   * 2. Destroy textures and Spritesheet
   * 3. Clear internal references
   */
  destroy(): void

  /**
   * Whether the adapter has been initialized.
   */
  readonly ready: boolean
}

// ============================================================
// AdapterConfig - Adapter configuration
// ============================================================

/**
 * Configuration parameters for adapter initialization.
 */
export interface AdapterConfig {
  /** Model file path (sprite sheet JSON or .model3.json) */
  modelPath: string

  /** Target render size (scale to fit) */
  width: number
  height: number

  /** Animation frame rate */
  fps: number

  /** Initial animation state */
  initialState?: AnimationState
}

// ============================================================
// AdapterFactory - Adapter factory
// ============================================================

/**
 * Adapter type enumeration.
 */
export type AdapterType = 'sprite-sheet' | 'live2d'

/**
 * Adapter factory function.
 *
 * Creates the corresponding adapter instance based on the passed type.
 * Uses dynamic import for lazy loading, preventing unused adapter code from affecting initial load.
 *
 * @param type - Adapter type
 * @returns Adapter instance
 *
 * @example
 * ```typescript
 * const adapter = await createAdapter('sprite-sheet');
 * await adapter.init(container, { modelPath: './pet.json', width: 128, height: 128, fps: 12 });
 * ```
 */
export async function createAdapter(type: AdapterType): Promise<RenderAdapter> {
  switch (type) {
    case 'sprite-sheet': {
      const { SpriteAdapter } = await import('./sprite-adapter')
      return new SpriteAdapter()
    }
    case 'live2d': {
      const { Live2DAdapter } = await import('./live2d-adapter')
      return new Live2DAdapter()
    }
    default: {
      const _exhaustive: never = type
      throw new Error(`Unknown adapter type: ${_exhaustive}`)
    }
  }
}
