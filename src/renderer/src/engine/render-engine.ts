/**
 * render-engine.ts - Render engine core
 *
 * Responsibilities:
 * 1. Manage PixiJS Application lifecycle (create, destroy)
 * 2. Manage RenderAdapter loading, switching, updating
 * 3. Provide desktop coordinate to render coordinate conversion
 * 4. Drive game loop (ticker)
 *
 * Design pattern: Facade + Strategy
 * - Facade: Exposes concise init/setState/destroy API externally
 * - Strategy: Adapters can be replaced at runtime (Sprite -> Live2D)
 */

import { Application, Container, Text } from 'pixi.js'
import type { RenderAdapter, AdapterType, AdapterConfig, AnimationState } from './adapter'
import { createAdapter } from './adapter'

// ============================================================
// RenderEngineOptions - Initialization options
// ============================================================

export interface RenderEngineOptions {
  /** Target mount DOM element (default document.body) */
  mountElement?: HTMLElement

  /** Window width (pixels) */
  width: number

  /** Window height (pixels) */
  height: number

  /** Background color (0xRRGGBB format, transparent window should pass 0x000000) */
  backgroundColor?: number

  /** Background alpha (0 = fully transparent, 1 = fully opaque) */
  backgroundAlpha?: number

  /** Anti-aliasing */
  antialias?: boolean

  /** Resolution (device pixel ratio, defaults to window.devicePixelRatio) */
  resolution?: number
}

// ============================================================
// DesktopCoordinate - Coordinate info
// ============================================================

/**
 * Desktop coordinate information.
 * Passed from main process to renderer process via IPC.
 */
export interface DesktopCoordinate {
  /** Window X position on screen */
  windowX: number
  /** Window Y position on screen */
  windowY: number
  /** Mouse X position on screen */
  mouseX: number
  /** Mouse Y position on screen */
  mouseY: number
}

// ============================================================
// RenderEngine - Render engine core class
// ============================================================

/**
 * Render engine core class.
 *
 * Typical usage flow:
 * ```typescript
 * const engine = new RenderEngine();
 * await engine.init({ width: 200, height: 200 });
 * await engine.loadAdapter('sprite-sheet', {
 *   modelPath: './assets/pet.json',
 *   width: 128,
 *   height: 128,
 *   fps: 12,
 * });
 * engine.setState('walk');
 * // ... game running ...
 * engine.destroy();
 * ```
 */
export class RenderEngine {
  /** PixiJS Application instance */
  private app: Application | null = null

  /** Currently active render adapter */
  private adapter: RenderAdapter | null = null

  /** Pet character container (adapter's render objects are mounted here) */
  private petContainer: Container | null = null

  /** Initialization complete flag */
  private _initialized = false

  /** Current adapter type */
  private currentAdapterType: AdapterType | null = null

  // ============================================================
  // init - Initialize PixiJS Application
  // ============================================================

  /**
   * Initialize PixiJS Application.
   *
   * Steps:
   * 1. Create PixiJS Application
   * 2. Initialize canvas (transparent background)
   * 3. Create pet container
   * 4. Set container initial position (bottom center of window)
   * 5. Start game loop
   *
   * @param options - Initialization options
   * @throws If PixiJS initialization fails
   */
  async init(options: RenderEngineOptions): Promise<void> {
    if (this._initialized) {
      console.warn('[RenderEngine] Already initialized. Call destroy() first.')
      return
    }

    // --- 1. Create PixiJS Application (v6 constructor takes options directly) ---
    this.app = new Application({
      width: options.width,
      height: options.height,
      backgroundColor: options.backgroundColor ?? 0x000000,
      backgroundAlpha: options.backgroundAlpha ?? 0,
      antialias: options.antialias ?? true,
      resolution: options.resolution ?? window.devicePixelRatio ?? 1,
      autoDensity: true
    })

    // --- 2. Mount canvas to DOM ---
    const mountElement = options.mountElement ?? document.body
    mountElement.appendChild(this.app.view as HTMLCanvasElement)

    // --- 4. Create pet container ---
    this.petContainer = new Container()

    // Position container at bottom center of window
    // (0, 0) is canvas top-left, pet usually stands at window bottom
    this.petContainer.x = options.width / 2
    this.petContainer.y = options.height

    this.app.stage.addChild(this.petContainer)

    // --- 5. Register ticker ---
    // PixiJS ticker auto-starts after Application.init
    // We register a high-priority callback to drive adapter updates
    this.app.ticker.add(this.onTick, this)

    this._initialized = true
  }

  // ============================================================
  // loadAdapter - Load render adapter
  // ============================================================

  /**
   * Load and activate a render adapter.
   *
   * If an adapter is already running, destroys the old one first before loading the new one.
   * Supports runtime adapter type switching (e.g., from Sprite to Live2D).
   *
   * @param type - Adapter type ('sprite-sheet' | 'live2d')
   * @param config - Adapter configuration
   * @throws If engine is not initialized or adapter loading fails
   */
  async loadAdapter(type: AdapterType, config: AdapterConfig): Promise<void> {
    if (!this._initialized || !this.petContainer) {
      throw new Error('[RenderEngine] Must call init() before loadAdapter()')
    }

    // If adapter already exists, destroy first
    if (this.adapter) {
      this.unloadAdapter()
    }

    // Create and initialize new adapter
    this.adapter = await createAdapter(type)
    await this.adapter.init(this.petContainer, config)
    this.currentAdapterType = type
  }

  // ============================================================
  // unloadAdapter - Unload current adapter
  // ============================================================

  /**
   * Unload current adapter and release its resources.
   * If no active adapter, does nothing.
   */
  unloadAdapter(): void {
    if (this.adapter) {
      this.adapter.destroy()
      this.adapter = null
      this.currentAdapterType = null
    }
  }

  // ============================================================
  // setState - Switch animation state
  // ============================================================

  /**
   * Switch current adapter's animation state.
   *
   * @param state - Target animation state
   * @throws If no active adapter
   */
  setState(state: AnimationState): void {
    if (!this.adapter) {
      console.warn('[RenderEngine] No adapter loaded. Call loadAdapter() first.')
      return
    }
    this.adapter.setState(state)
  }

  // ============================================================
  // setPetPosition - Set pet position
  // ============================================================

  /**
   * Set pet container position in canvas.
   *
   * Coordinate system: canvas local coordinates (top-left as origin).
   * Since petContainer's anchor is at bottom center (set in init),
   * x controls horizontal position, y controls bottom Y coordinate.
   *
   * @param x - X coordinate (canvas local)
   * @param y - Y coordinate (canvas local, i.e., bottom edge)
   */
  setPetPosition(x: number, y: number): void {
    if (!this.petContainer) return
    this.petContainer.x = x
    this.petContainer.y = y
  }

  // ============================================================
  // getPetPosition - Get pet position
  // ============================================================

  /**
   * Get pet container's current position.
   *
   * @returns Pet position { x, y }
   */
  getPetPosition(): { x: number; y: number } {
    if (!this.petContainer) return { x: 0, y: 0 }
    return { x: this.petContainer.x, y: this.petContainer.y }
  }

  // ============================================================
  // setPetScale - Set pet scale
  // ============================================================

  /**
   * Set pet container's scale ratio.
   *
   * @param scale - Scale ratio (1.0 = original size)
   */
  setPetScale(scale: number): void {
    if (!this.petContainer) return
    this.petContainer.scale.set(scale)
  }

  // ============================================================
  // Coordinate conversion: Desktop coordinates <-> Render coordinates
  // ============================================================

  /**
   * Convert desktop screen coordinates to canvas local coordinates.
   *
   * Desktop coordinates: Absolute coordinates with screen top-left as origin.
   * Render coordinates: Local coordinates with canvas top-left as origin.
   *
   * Conversion formula:
   *   canvasX = screenX - windowX
   *   canvasY = screenY - windowY
   *
   * @param screenX - Screen X coordinate
   * @param screenY - Screen Y coordinate
   * @param windowX - Window top-left X position on screen
   * @param windowY - Window top-left Y position on screen
   * @returns Canvas local coordinates
   */
  screenToCanvas(
    screenX: number,
    screenY: number,
    windowX: number,
    windowY: number
  ): { x: number; y: number } {
    return {
      x: screenX - windowX,
      y: screenY - windowY
    }
  }

  /**
   * Convert canvas local coordinates to desktop screen coordinates.
   *
   * Conversion formula:
   *   screenX = canvasX + windowX
   *   screenY = canvasY + windowY
   *
   * @param canvasX - Canvas X coordinate
   * @param canvasY - Canvas Y coordinate
   * @param windowX - Window top-left X position on screen
   * @param windowY - Window top-left Y position on screen
   * @returns Screen coordinates
   */
  canvasToScreen(
    canvasX: number,
    canvasY: number,
    windowX: number,
    windowY: number
  ): { x: number; y: number } {
    return {
      x: canvasX + windowX,
      y: canvasY + windowY
    }
  }

  /**
   * Determine if screen coordinates are within the pet's collision area.
   *
   * First converts screen coordinates to canvas coordinates,
   * then performs rectangle containment detection against adapter's collision bounds.
   *
   * @param screenX - Screen X coordinate
   * @param screenY - Screen Y coordinate
   * @param windowX - Window X position
   * @param windowY - Window Y position
   * @returns Whether point is over the pet
   */
  isPointOverPet(
    screenX: number,
    screenY: number,
    windowX: number,
    windowY: number
  ): boolean {
    if (!this.adapter || !this.adapter.ready) return false

    const canvasPos = this.screenToCanvas(screenX, screenY, windowX, windowY)

    // Convert canvas coordinates to petContainer's local coordinates
    if (!this.petContainer) return false

    const localX = canvasPos.x - this.petContainer.x
    const localY = canvasPos.y - this.petContainer.y

    const bounds = this.adapter.getBounds()
    return bounds.contains(localX, localY)
  }

  // ============================================================
  // Feedback - Action execution feedback
  // ============================================================

  /**
   * Show a floating feedback text above the pet.
   * Text rises and fades out over ~1.5 seconds.
   */
  showFeedback(text: string, color: number = 0x50c070): void {
    if (!this.app || !this.petContainer) return

    const feedback = new Text(text, {
      fontSize: 16,
      fill: color,
      fontWeight: 'bold'
    })
    feedback.anchor.set(0.5, 1)
    feedback.x = 0
    const boundsHeight = this.adapter ? this.adapter.getBounds().height : 128
    feedback.y = -boundsHeight

    this.petContainer.addChild(feedback)

    let elapsed = 0
    const duration = 60
    const ticker = (t: { deltaTime: number }) => {
      elapsed += t.deltaTime
      feedback.y -= 0.8 * t.deltaTime
      feedback.alpha = Math.max(0, 1 - elapsed / duration)

      if (elapsed >= duration) {
        this.app!.ticker.remove(ticker)
        feedback.destroy()
      }
    }
    this.app.ticker.add(ticker)
  }

  // ============================================================
  // Game loop
  // ============================================================

  /**
   * Game loop callback (driven by PixiJS Ticker).
   *
   * Executes each frame:
   * 1. Advance adapter animation
   * 2. (Future) Advance physics engine
   * 3. (Future) Update state machine
   *
   * @param ticker - PixiJS Ticker instance
   */
  private onTick(ticker: { deltaTime: number }): void {
    if (!this.adapter || !this.adapter.ready) return

    // Advance adapter animation
    this.adapter.update(ticker.deltaTime)
  }

  // ============================================================
  // getter: app - Expose PixiJS Application (read-only)
  // ============================================================

  /**
   * Get PixiJS Application instance.
   *
   * Provides read-only access to the underlying Application,
   * for advanced scenarios requiring direct stage/ticker/renderer operations.
   *
   * @returns PixiJS Application instance, null if not initialized
   */
  get pixiApp(): Application | null {
    return this.app
  }

  get container(): Container | null {
    return this.petContainer
  }

  /**
   * Get current adapter instance.
   *
   * @returns Current adapter, null if not loaded
   */
  get activeAdapter(): RenderAdapter | null {
    return this.adapter
  }

  /**
   * Get current adapter type.
   *
   * @returns Adapter type string, null if not loaded
   */
  get adapterType(): AdapterType | null {
    return this.currentAdapterType
  }

  /**
   * Whether the engine has been initialized.
   */
  get initialized(): boolean {
    return this._initialized
  }

  // ============================================================
  // resize - Window size change
  // ============================================================

  /**
   * Handle window size change.
   *
   * When Electron window size changes, need to synchronize canvas size
   * and pet container position.
   *
   * @param newWidth - New window width
   * @param newHeight - New window height
   */
  resize(newWidth: number, newHeight: number): void {
    if (!this.app) return

    // Adjust PixiJS renderer size
    this.app.renderer.resize(newWidth, newHeight)

    // Update pet container position (keep at bottom center)
    if (this.petContainer) {
      this.petContainer.x = newWidth / 2
      this.petContainer.y = newHeight
    }
  }

  // ============================================================
  // destroy - Destroy render engine
  // ============================================================

  /**
   * Destroy render engine, release all resources.
   *
   * Cleanup order:
   * 1. Unload adapter
   * 2. Remove ticker callback
   * 3. Destroy PixiJS Application
   * 4. Remove canvas from DOM
   * 5. Clear all references
   */
  destroy(): void {
    // 1. Unload adapter
    this.unloadAdapter()

    // 2. Remove ticker callback
    if (this.app) {
      this.app.ticker.remove(this.onTick, this)
    }

    // 3. Destroy PixiJS Application
    if (this.app) {
      this.app.destroy(true, { children: true, texture: true })
      this.app = null
    }

    // 4. Clear references
    this.petContainer = null
    this._initialized = false
    this.currentAdapterType = null
  }
}
