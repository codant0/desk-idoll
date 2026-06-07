import './styles/main.css'
import { RenderEngine } from './engine/render-engine'
import { PhysicsEngine, setScreenInfo } from './engine/physics'
import { StateMachine } from './state/machine'
import { InputHandler } from './engine/input'
import type { AdapterConfig } from './engine/adapter'
import type { AppConfig, AnimationState } from '../../shared/types'

let renderEngine: RenderEngine | null = null
let physicsEngine: PhysicsEngine | null = null
let stateMachine: StateMachine | null = null
let inputHandler: InputHandler | null = null
let currentPetId: string | null = null
let petWidth = 128
let petHeight = 128

async function initialize(): Promise<void> {
  console.log('[main] Desk-Idoll renderer starting...')

  // 1. Get window and screen info
  let windowSize = { width: 200, height: 200 }
  try {
    windowSize = await window.electronAPI.getWindowSize()
    const screenInfo = await window.electronAPI.getScreenInfo()
    setScreenInfo({
      screenWidth: screenInfo.width,
      screenHeight: screenInfo.height,
      taskbarHeight: 0
    })
  } catch (e) {
    console.warn('[main] ElectronAPI not available, using defaults:', e)
  }

  // 2. Init render engine
  renderEngine = new RenderEngine()
  await renderEngine.init({
    width: windowSize.width,
    height: windowSize.height,
    backgroundColor: 0x000000,
    backgroundAlpha: 0,
    antialias: true
  })

  // 3. Init state machine
  stateMachine = new StateMachine('idle')
  setupStateMachineCallbacks()

  // 4. Init physics engine
  physicsEngine = new PhysicsEngine(petWidth, petHeight)
  physicsEngine.init(windowSize.width / 2, windowSize.height)
  physicsEngine.on({
    onLanded: () => {
      stateMachine?.emit('landed')
    },
    onEdgeReached: () => stateMachine?.emit('edge')
  })

  // 5. Init input handler
  if (renderEngine.pixiApp) {
    inputHandler = new InputHandler(renderEngine.pixiApp, stateMachine)
    // Set pet container for hit testing
    if (renderEngine.container) {
      inputHandler.setPetContainer(renderEngine.container)
    }
  }

  // 6. Load default pet
  try {
    await renderEngine.loadAdapter('sprite-sheet', {
      modelPath: './assets/default-pet/spritesheet.json',
      width: petWidth,
      height: petHeight,
      fps: 12,
      initialState: 'idle'
    })
    stateMachine.forceState('idle')
  } catch (error) {
    console.error('[main] Failed to load default pet:', error)
  }

  // 7. Physics update loop -- only runs during fall state
  if (renderEngine.pixiApp) {
    renderEngine.pixiApp.ticker.add(() => {
      if (!physicsEngine || !stateMachine) return
      if (stateMachine.getCurrentState() === 'fall') {
        physicsEngine.update(renderEngine!.pixiApp!.ticker)
        const pos = physicsEngine.getPosition()
        // Move the Electron window to follow physics
        window.electronAPI?.moveWindow(pos.x, pos.y)
      }
    })
  }

  registerIPCListeners()
  registerWindowEvents()
  document.body.style.opacity = '1'
  console.log('[main] Desk-Idoll renderer ready')
}

function setupStateMachineCallbacks(): void {
  if (!stateMachine) return

  stateMachine.onEnter('idle', () => {
    renderEngine?.setState('idle')
  })
  stateMachine.onEnter('walk', () => {
    renderEngine?.setState('walk')
  })
  stateMachine.onEnter('drag', () => {
    renderEngine?.setState('drag')
    physicsEngine?.idle()
  })
  stateMachine.onEnter('fall', () => {
    renderEngine?.setState('fall')
    // Initialize physics position from current window position
    const wx = window.screenX ?? window.screenLeft ?? 0
    const wy = window.screenY ?? window.screenTop ?? 0
    physicsEngine?.init(wx, wy)
    physicsEngine?.startFalling()
  })
  stateMachine.onEnter('click', () => {
    renderEngine?.setState('click')
    executeClickAction()
    setTimeout(() => stateMachine?.emit('actionDone'), 1000)
  })
}

function executeClickAction(): void {
  window.electronAPI
    ?.getActions()
    .then((actions) => {
      if (!actions || actions.length === 0) return
      const action = actions.find((a) => a.trigger === 'left-click') ?? actions[0]
      if (action) {
        window.electronAPI.executeAction(action).then((result) => {
          renderEngine?.showFeedback(result.success ? '✓' : '✗', result.success ? 0x50c070 : 0xe05050)
        }).catch(() => {
          renderEngine?.showFeedback('✗', 0xe05050)
        })
      }
    })
    .catch(() => {})
}

function registerIPCListeners(): void {
  if (!window.electronAPI) return

  window.electronAPI.onStateChange((state: AnimationState) => {
    switch (state) {
      case 'drag':
        stateMachine?.emit('mousedown')
        break
      case 'click':
        stateMachine?.emit('click')
        break
      case 'idle':
        stateMachine?.forceState('idle')
        break
      case 'walk':
        stateMachine?.emit('timeout')
        break
    }
  })

  window.electronAPI.onConfigUpdate(async (config: AppConfig) => {
    if (!renderEngine) return

    // Find THIS window's pet config -- not hardcoded pets[0]
    const petConfig = currentPetId
      ? config.pets.find((p) => p.id === currentPetId)
      : config.pets[0]
    if (!petConfig) return

    renderEngine.unloadAdapter()

    const fps = 'fps' in petConfig.animations ? petConfig.animations.fps : 12
    try {
      await renderEngine.loadAdapter(petConfig.modelType, {
        modelPath: petConfig.modelPath,
        width: petConfig.size.width,
        height: petConfig.size.height,
        fps,
        initialState: stateMachine?.getCurrentState() ?? 'idle'
      })
      document.body.style.opacity = String(petConfig.opacity)
      petWidth = petConfig.size.width
      petHeight = petConfig.size.height
      physicsEngine?.setPetSize(petWidth, petHeight)
      if (inputHandler && renderEngine.container) {
        inputHandler.setPetContainer(renderEngine.container)
      }
    } catch (error) {
      console.error('[main] Failed to apply config update:', error)
    }
  })

  window.electronAPI.onSwitchToPet?.((petId: string) => {
    currentPetId = petId
  })
}

function registerWindowEvents(): void {
  window.addEventListener('resize', () => {
    renderEngine?.resize(window.innerWidth, window.innerHeight)
    physicsEngine?.recalculateBounds()
  })

  window.addEventListener('beforeunload', () => {
    inputHandler?.destroy()
    physicsEngine?.destroy()
    stateMachine?.destroy()
    renderEngine?.destroy()
    renderEngine = null
    physicsEngine = null
    stateMachine = null
    inputHandler = null
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize)
} else {
  initialize()
}
