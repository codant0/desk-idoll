/**
 * sprite-adapter.ts - Sprite Sheet render adapter
 *
 * Uses PixiJS's Assets system to load Spritesheet (JSON + PNG),
 * plays frame animations through AnimatedSprite.
 *
 * Supported Sprite Sheet format: PixiJS standard Spritesheet JSON
 * Reference: https://pixijs.io/6.x/guides/components/assets
 */

import {
  AnimatedSprite,
  Container,
  Loader,
  Rectangle,
  Spritesheet,
  Texture
} from 'pixi.js'
import type { RenderAdapter, AdapterConfig, AnimationState } from './adapter'

/**
 * SpriteAdapter - Sprite Sheet based render adapter.
 *
 * Workflow:
 * 1. init() -> load sprite sheet JSON + PNG -> create AnimatedSprite -> add to container
 * 2. setState() -> switch AnimatedSprite textures array -> replay
 * 3. update() -> advance AnimatedSprite current frame
 * 4. destroy() -> remove and destroy all resources
 */
export class SpriteAdapter implements RenderAdapter {
  /** PixiJS Spritesheet instance (contains all frame textures and animation definitions) */
  private spritesheet: Spritesheet | null = null

  /** Model path (used for Assets.unload on destroy) */
  private modelPath = ''

  /** PixiJS AnimatedSprite (currently rendered animation sprite) */
  private sprite: AnimatedSprite | null = null

  /** Parent container reference (used for removing children during destroy) */
  private container: Container | null = null

  /** Current animation state */
  private currentState: AnimationState = 'idle'

  /** Target render size */
  private targetWidth = 0
  private targetHeight = 0

  /** Initialization complete flag */
  private _ready = false

  /** @override */
  get ready(): boolean {
    return this._ready
  }

  // ============================================================
  // init - Load resources and create render objects
  // ============================================================

  /**
   * Initialize Sprite adapter.
   *
   * Steps:
   * 1. Use PIXI.Assets.load to load sprite sheet (JSON + PNG loaded together)
   * 2. Get initial state's texture array from spritesheet.animations
   * 3. Create AnimatedSprite and configure properties
   * 4. Calculate scale ratio to fit sprite to target size
   * 5. Add sprite to container
   *
   * @param container - PixiJS container
   * @param config - Adapter configuration
   * @throws If sprite sheet loading fails or format is incorrect
   */
  async init(container: Container, config: AdapterConfig): Promise<void> {
    this.container = container
    this.targetWidth = config.width
    this.targetHeight = config.height

    // --- 1. Load Spritesheet ---
    // PIXI.Assets.load has native support for Spritesheet JSON:
    // It automatically parses the "frames" field in JSON and loads the corresponding PNG texture atlas.
    // Return type is Spritesheet.
    try {
      this.modelPath = config.modelPath
      this.spritesheet = await this.loadSpritesheet(config.modelPath)
    } catch (error) {
      throw new Error(
        `[SpriteAdapter] Failed to load sprite sheet: ${config.modelPath}\n` +
          `  Error: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    // --- 2. Validate Spritesheet format ---
    if (!this.spritesheet.animations || Object.keys(this.spritesheet.animations).length === 0) {
      throw new Error(
        `[SpriteAdapter] Sprite sheet has no animations defined.\n` +
          `  Expected: "animations" field in JSON (e.g. { "idle": ["idle_0", "idle_1"] })\n` +
          `  Path: ${config.modelPath}`
      )
    }

    // --- 3. Get initial state textures ---
    const initialState = config.initialState ?? 'idle'
    const textures = this.getTexturesForState(initialState)

    // --- 4. Create AnimatedSprite ---
    this.sprite = new AnimatedSprite(textures)
    this.sprite.anchor.set(0.5, 0.5) // Center anchor for easier coordinate calculation

    // --- 5. Configure animation parameters ---
    this.sprite.animationSpeed = config.fps / 60
    // PixiJS animationSpeed unit is "frames / ticker frame".
    // If ticker runs at 60fps and we want 12fps animation, speed = 12/60 = 0.2
    this.sprite.loop = true
    this.sprite.play()

    // --- 6. Scale to fit ---
    // Sprite sheet frame size may differ from target size, scaling needed.
    // Frame size taken from the first frame's original pixel dimensions.
    const frameTexture = textures[0]
    if (frameTexture) {
      const frameWidth = frameTexture.width
      const frameHeight = frameTexture.height

      if (frameWidth > 0 && frameHeight > 0) {
        const scaleX = this.targetWidth / frameWidth
        const scaleY = this.targetHeight / frameHeight
        // Uniform scale, take smaller value to ensure complete display
        const scale = Math.min(scaleX, scaleY)
        this.sprite.scale.set(scale)
      }
    }

    // --- 7. Add to container ---
    container.addChild(this.sprite)

    // --- 8. Mark ready ---
    this.currentState = initialState
    this._ready = true
  }

  // ============================================================
  // setState - Switch animation state
  // ============================================================

  /**
   * Switch to target animation state.
   *
   * If target state is the same as current state, ignores (avoids animation reset from repeated switching).
   * If target state has no corresponding animation definition in spritesheet,
   * falls back to 'idle' state and prints a warning.
   *
   * @param state - Target animation state
   */
  setState(state: AnimationState): void {
    if (!this.sprite || !this.spritesheet) {
      console.warn('[SpriteAdapter] setState called before init')
      return
    }

    // Avoid repeated switching
    if (state === this.currentState) {
      return
    }

    // Get target state's texture array
    let textures: Texture[]
    try {
      textures = this.getTexturesForState(state)
    } catch {
      // Target state doesn't exist, fallback to idle
      console.warn(
        `[SpriteAdapter] Animation state "${state}" not found in spritesheet. ` +
          `Available: ${Object.keys(this.spritesheet.animations).join(', ')}. ` +
          `Falling back to "idle".`
      )
      if (state !== 'idle') {
        textures = this.getTexturesForState('idle')
        state = 'idle'
      } else {
        // idle also doesn't exist, keep current state
        return
      }
    }

    // Switch textures and replay
    this.sprite.textures = textures
    this.sprite.gotoAndPlay(0)

    this.currentState = state
  }

  // ============================================================
  // update - Frame update
  // ============================================================

  /**
   * Per-frame animation update.
   *
   * Called by RenderEngine's ticker.
   * AnimatedSprite internally advances frames based on animationSpeed,
   * but needs explicit update() call to trigger.
   *
   * @param delta - Time factor (from PIXI.Ticker)
   */
  update(_delta: number): void {
    if (!this.sprite) return

    // PixiJS v6 AnimatedSprite auto-updates via the global ticker when autoUpdate is true (default).
    // No manual update call needed. The _delta parameter satisfies the RenderAdapter interface.
  }

  // ============================================================
  // getBounds - Collision bounds
  // ============================================================

  /**
   * Get current sprite's collision bounds.
   *
   * Returned rectangle uses local coordinate system (relative to container).
   * Bounds account for sprite's scale and anchor offset.
   *
   * Note: Returns the sprite's actual rendered bounds (including scale),
   * not the original frame pixel size.
   *
   * @returns Collision bounds rectangle
   */
  getBounds(): Rectangle {
    if (!this.sprite) {
      return new Rectangle(0, 0, 0, 0)
    }

    // getBounds() returns world coordinates, we need local coordinates.
    // Use sprite's width/height (already includes scale) and position to calculate.
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
   * 3. Unload spritesheet resource (remove from Assets cache)
   * 4. Clear all internal references
   */
  destroy(): void {
    // 1. Remove from container
    if (this.sprite && this.container) {
      this.container.removeChild(this.sprite)
    }

    // 2. Destroy AnimatedSprite
    //    destroy({ children: true }) also destroys held texture references
    if (this.sprite) {
      this.sprite.destroy({ children: true })
      this.sprite = null
    }

    // 3. Unload Spritesheet resource
    if (this.spritesheet) {
      try {
        const resource = Loader.shared.resources[this.modelPath]
        if (resource) {
          resource.unload()
        }
      } catch (e) {
        console.warn('[SpriteAdapter] Error unloading spritesheet:', e)
      }
      this.spritesheet = null
    }

    // 4. Clear references
    this.container = null
    this._ready = false
  }

  // ============================================================
  // Internal helper methods
  // ============================================================

  /**
   * Load spritesheet using PixiJS v6 Loader API.
   */
  private loadSpritesheet(path: string): Promise<Spritesheet> {
    return new Promise((resolve, reject) => {
      const existing = Loader.shared.resources[path]
      if (existing && existing.spritesheet) {
        resolve(existing.spritesheet)
        return
      }

      const errorHandler = (err: unknown) => {
        Loader.shared.onError.remove(errorHandler)
        reject(err)
      }
      Loader.shared.onError.add(errorHandler)

      Loader.shared.add(path).load((_loader, resources) => {
        Loader.shared.onError.remove(errorHandler)
        const resource = resources[path]
        if (!resource) {
          reject(new Error(`Resource not found: ${path}`))
          return
        }
        if (!resource.spritesheet) {
          reject(new Error(`Not a spritesheet: ${path}`))
          return
        }
        resolve(resource.spritesheet)
      })
    })
  }

  /**
   * Get texture array for specified animation state from Spritesheet.
   *
   * Spritesheet.animations structure:
   * {
   *   "idle": [Texture, Texture, ...],
   *   "walk": [Texture, Texture, ...],
   *   ...
   * }
   *
   * @param state - Animation state name
   * @returns Texture array
   * @throws If the state doesn't exist in spritesheet
   */
  private getTexturesForState(state: AnimationState): Texture[] {
    if (!this.spritesheet) {
      throw new Error('[SpriteAdapter] Spritesheet not loaded')
    }

    const textures = this.spritesheet.animations[state]

    if (!textures || textures.length === 0) {
      throw new Error(
        `[SpriteAdapter] No textures found for animation state "${state}". ` +
          `Available states: ${Object.keys(this.spritesheet.animations).join(', ')}`
      )
    }

    return textures
  }
}
