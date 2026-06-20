/**
 * static-adapter.ts - Static image procedural animation adapter
 *
 * Loads a single image as a PixiJS Sprite and applies programmatic
 * animations (floating, bouncing, swaying, etc.) via math functions
 * in the update() loop. No sprite sheet or Live2D model needed.
 *
 * Supported animation states:
 * - idle:  Vertical float + breathing scale
 * - walk:  Horizontal sway + vertical bob
 * - drag:  Slight rotation sway
 * - fall:  Continuous rotation
 * - click: Scale pulse feedback
 */

import { Sprite, Container, Texture, Rectangle, Loader } from 'pixi.js'
import type { RenderAdapter, AdapterConfig, AnimationState } from './adapter'
import type { StaticImageAnimationConfig } from '@shared/types'
import { DEFAULT_STATIC_ANIMATION } from '@shared/constants'

/**
 * StaticAdapter - Static image with procedural animations.
 *
 * Workflow:
 * 1. init() -> load image via PIXI Loader -> create Sprite -> add to container
 * 2. setState() -> reset animation time counters
 * 3. update() -> apply per-frame procedural transforms based on current state
 * 4. destroy() -> remove and destroy all resources
 */
export class StaticAdapter implements RenderAdapter {
  /** PixiJS Sprite (the rendered static image) */
  private sprite: Sprite | null = null

  /** Parent container reference (used for removing children on destroy) */
  private container: Container | null = null

  /** Static image animation configuration */
  private config: StaticImageAnimationConfig = DEFAULT_STATIC_ANIMATION

  /** Current animation state */
  private currentState: AnimationState = 'idle'

  /** Accumulated time in seconds (resets on state change) */
  private time = 0

  /** Target render size */
  private targetWidth = 0
  private targetHeight = 0

  /** Base scale factor (before animation transforms) */
  private baseScale = 1

  /** Initialization complete flag */
  private _ready = false

  /** Base anchor position within container (set by RenderEngine) */
  private baseX = 0
  private baseY = 0

  /** Click pulse animation progress (0-1) */
  private clickPulseTime = 0

  /** Accumulated fall rotation (radians) */
  private fallRotation = 0

  /** @override */
  get ready(): boolean {
    return this._ready
  }

  // ============================================================
  // init - Load resources and create render objects
  // ============================================================

  /**
   * Initialize static image adapter.
   *
   * Steps:
   * 1. Store configuration and merge with defaults
   * 2. Load image texture via PIXI Loader
   * 3. Create Sprite and set anchor to center
   * 4. Calculate uniform scale to fit target size
   * 5. Add sprite to container
   *
   * @param container - PixiJS container
   * @param config - Adapter configuration
   * @throws If image loading fails
   */
  async init(container: Container, config: AdapterConfig): Promise<void> {
    this.container = container
    this.targetWidth = config.width
    this.targetHeight = config.height

    // Merge user animation config with defaults
    if (config.animationConfig) {
      this.config = { ...DEFAULT_STATIC_ANIMATION, ...config.animationConfig }
    }

    // --- 1. Load image texture ---
    let texture: Texture
    try {
      texture = await this.loadTexture(config.modelPath)
    } catch (error) {
      throw new Error(
        `[StaticAdapter] Failed to load image: ${config.modelPath}\n` +
          `  Error: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    // --- 2. Create Sprite ---
    this.sprite = new Sprite(texture)
    this.sprite.anchor.set(0.5, 0.5)

    // --- 3. Scale to fit ---
    const texW = texture.width
    const texH = texture.height
    if (texW > 0 && texH > 0) {
      const scaleX = this.targetWidth / texW
      const scaleY = this.targetHeight / texH
      this.baseScale = Math.min(scaleX, scaleY)
      this.sprite.scale.set(this.baseScale)
    }

    // --- 4. Record base position ---
    this.baseX = this.sprite.x
    this.baseY = this.sprite.y

    // --- 5. Add to container ---
    container.addChild(this.sprite)

    // --- 6. Mark ready ---
    this.currentState = config.initialState ?? 'idle'
    this._ready = true
  }

  // ============================================================
  // setState - Switch animation state
  // ============================================================

  /**
   * Switch to target animation state.
   *
   * Resets internal time accumulators so animations start fresh.
   * If target state equals current state, does nothing.
   *
   * @param state - Target animation state
   */
  setState(state: AnimationState): void {
    if (state === this.currentState) return

    this.currentState = state
    this.time = 0
    this.clickPulseTime = 0
    this.fallRotation = 0

    // Reset sprite transforms to base when switching states
    if (this.sprite) {
      this.sprite.x = this.baseX
      this.sprite.y = this.baseY
      this.sprite.rotation = 0
      this.sprite.scale.set(this.baseScale)
    }
  }

  // ============================================================
  // update - Per-frame procedural animation
  // ============================================================

  /**
   * Per-frame animation update.
   *
   * Applies procedural transforms based on current state.
   * Time accumulates in seconds (delta is a ~1.0 factor at 60fps).
   *
   * @param delta - Time factor from PIXI Ticker
   */
  update(delta: number): void {
    if (!this.sprite) return

    // Accumulate time in seconds (delta ~= 1.0 at 60fps)
    this.time += delta / 60

    switch (this.currentState) {
      case 'idle':
        this.applyIdleAnimation()
        break
      case 'walk':
        this.applyWalkAnimation()
        break
      case 'drag':
        this.applyDragAnimation()
        break
      case 'fall':
        this.applyFallAnimation()
        break
      case 'click':
        this.applyClickAnimation()
        break
    }
  }

  // ============================================================
  // getBounds - Collision bounds
  // ============================================================

  /**
   * Get current sprite's collision bounds.
   *
   * Returns rectangle in local container coordinates.
   * Accounts for sprite scale and anchor offset.
   *
   * @returns Collision bounds rectangle
   */
  getBounds(): Rectangle {
    if (!this.sprite) return new Rectangle(0, 0, 0, 0)

    const w = this.sprite.width
    const h = this.sprite.height
    const x = this.sprite.x - w * this.sprite.anchor.x
    const y = this.sprite.y - h * this.sprite.anchor.y

    return new Rectangle(x, y, w, h)
  }

  // ============================================================
  // destroy - Destroy and cleanup
  // ============================================================

  /**
   * Destroy adapter, release all resources.
   *
   * Cleanup order:
   * 1. Remove sprite from container
   * 2. Destroy sprite (release GPU textures)
   * 3. Unload image resource from Loader cache
   * 4. Clear all internal references
   */
  destroy(): void {
    // 1. Remove from container
    if (this.sprite && this.container) {
      this.container.removeChild(this.sprite)
    }

    // 2. Destroy Sprite
    if (this.sprite) {
      this.sprite.destroy({ children: true })
      this.sprite = null
    }

    // 3. Clear references
    this.container = null
    this._ready = false
  }

  // ============================================================
  // Internal: Resource loading
  // ============================================================

  /**
   * Load image texture using PixiJS v6 Loader.
   *
   * Handles relative paths by setting baseUrl for dev mode consistency.
   * Caches loaded textures to avoid duplicate loads.
   *
   * @param path - Image file path
   * @returns Loaded Texture
   */
  private loadTexture(path: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      const existing = Loader.shared.resources[path]
      if (existing && existing.texture) {
        resolve(existing.texture)
        return
      }

      // Handle relative paths in dev mode (consistent with SpriteAdapter)
      if (!path.match(/^[A-Z]:\\/i) && !path.startsWith('/')) {
        Loader.shared.baseUrl = location.origin + '/'
      }

      let errorBinding: ReturnType<typeof Loader.shared.onError.add> | null = null
      const errorHandler = (err: unknown): void => {
        reject(err)
      }
      errorBinding = Loader.shared.onError.add(errorHandler)

      Loader.shared.add(path).load((_loader, resources) => {
        if (errorBinding) {
          Loader.shared.onError.detach(errorBinding)
        }
        const resource = resources[path]
        if (!resource) {
          reject(new Error(`Resource not found: ${path}`))
          return
        }
        if (!resource.texture) {
          reject(new Error(`Not a valid image: ${path}`))
          return
        }
        resolve(resource.texture)
      })
    })
  }

  // ============================================================
  // Internal: Procedural animations
  // ============================================================

  /**
   * Idle animation: vertical float + breathing scale.
   *
   * The sprite gently floats up and down using a sine wave,
   * and subtly scales to simulate a breathing effect.
   */
  private applyIdleAnimation(): void {
    const { idleAmplitude, idleFrequency, breatheScale } = this.config
    const sprite = this.sprite!
    const period = idleFrequency * Math.PI * 2

    // Vertical float (sine wave)
    const yOffset = Math.sin(this.time * period) * idleAmplitude
    sprite.y = this.baseY + yOffset

    // Breathing scale (slower sine, half frequency)
    const breathFactor = 1 + Math.sin(this.time * period * 0.5) * breatheScale
    sprite.scale.set(this.baseScale * breathFactor)

    // Reset rotation
    sprite.rotation = 0
    sprite.x = this.baseX
  }

  /**
   * Walk animation: vertical bob + slight horizontal sway.
   *
   * Simulates a bouncing walk cycle with a subtle side-to-side sway.
   */
  private applyWalkAnimation(): void {
    const { walkBobHeight, walkBobFrequency } = this.config
    const sprite = this.sprite!
    const period = walkBobFrequency * Math.PI

    // Vertical bob (absolute sine for upward bounce only)
    const bobOffset = Math.abs(Math.sin(this.time * period)) * walkBobHeight
    sprite.y = this.baseY - bobOffset

    // Subtle horizontal sway
    const sway = Math.sin(this.time * period * 0.5) * 3
    sprite.x = this.baseX + sway

    // Reset rotation and scale
    sprite.rotation = 0
    sprite.scale.set(this.baseScale)
  }

  /**
   * Drag animation: gentle rotation sway.
   *
   * While being dragged, the sprite sways slightly side-to-side
   * as if dangling from the user's cursor.
   */
  private applyDragAnimation(): void {
    const { swayAngle } = this.config
    const sprite = this.sprite!

    // Sway rotation (radians)
    const maxAngle = swayAngle * (Math.PI / 180)
    sprite.rotation = Math.sin(this.time * 5) * maxAngle

    // Keep centered position
    sprite.x = this.baseX
    sprite.y = this.baseY
    sprite.scale.set(this.baseScale)
  }

  /**
   * Fall animation: continuous rotation.
   *
   * The sprite rotates while falling. Actual positional movement
   * is handled by the PhysicsEngine via window IPC.
   */
  private applyFallAnimation(): void {
    const { fallRotationSpeed } = this.config
    const sprite = this.sprite!

    // Accumulate rotation (speed is in radians per frame-step)
    this.fallRotation += fallRotationSpeed * 0.05
    sprite.rotation = this.fallRotation

    // Position is managed by physics engine
    sprite.x = this.baseX
    sprite.y = this.baseY
    sprite.scale.set(this.baseScale)
  }

  /**
   * Click animation: scale pulse feedback.
   *
   * A quick scale-up then back to normal, providing visual
   * feedback that the pet was clicked.
   */
  private applyClickAnimation(): void {
    const { clickScalePulse } = this.config
    const sprite = this.sprite!

    this.clickPulseTime += 0.08

    // Pulse: scale up then back down (half-sine envelope)
    const pulse = 1 + Math.sin(this.clickPulseTime * Math.PI) * clickScalePulse
    sprite.scale.set(this.baseScale * pulse)

    // Keep position and rotation stable
    sprite.x = this.baseX
    sprite.y = this.baseY
    sprite.rotation = 0

    // Auto-reset after one pulse cycle
    if (this.clickPulseTime >= 1) {
      this.clickPulseTime = 0
      sprite.scale.set(this.baseScale)
    }
  }
}
