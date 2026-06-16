# Desk-Idoll

> A lightweight desktop pet (shimeji-style) for Windows, built with Electron + PixiJS + TypeScript.

[English](README.md) | [中文](README.zh-CN.md)

---

## Features

- **Animated desktop pets** — Characters walk, fall, and interact on your desktop with physics-based movement
- **Sprite Sheet & Live2D** — Supports PixiJS sprite sheet animations and Live2D Cubism models
- **Drag & drop** — Grab pets with your mouse, toss them, and watch them fall with gravity
- **Custom actions** — Bind left-click to open URLs, execute commands, or show messages
- **Multi-pet** — Run multiple pets simultaneously, each with independent configuration
- **System tray** — Control pets from the system tray: show/hide, add/remove, settings
- **Auto-update** — Built-in update mechanism via GitHub Releases
- **i18n** — Chinese (zh-CN) and English support

## Quick Start

### Prerequisites

- Node.js 18+
- Windows 10/11 (primary platform)

### Development

```bash
# Install dependencies
npm install

# Start in development mode (hot reload)
npm run dev

# Type check
npm run typecheck

# Build for production
npm run build

# Package as Windows installer
npm run dist:win
```

### Project Structure

```
src/
├── main/                     # Electron main process
│   ├── index.ts              # App entry, lifecycle management
│   ├── ipc/index.ts          # IPC handler registration
│   ├── windows/
│   │   ├── pet-window.ts     # Transparent pet window manager
│   │   └── config-window.ts  # Settings window (singleton)
│   └── services/
│       ├── config-manager.ts # Config persistence (electron-store)
│       ├── action-executor.ts# Action execution (URL, command, message)
│       ├── tray.ts           # System tray manager
│       ├── updater.ts        # Auto-update via electron-updater
│       └── logger.ts         # Daily rotating file logger
├── preload/
│   └── index.ts              # contextBridge → window.electronAPI
├── renderer/
│   ├── index.html            # Pet window entry
│   ├── public/
│   │   └── live2dcubismcore.min.js  # Live2D Cubism SDK runtime
│   ├── styles/main.css       # Pet window CSS
│   ├── src/
│   │   ├── main.ts           # Renderer init, wires all subsystems
│   │   ├── styles/main.css   # Pet window detailed CSS
│   │   ├── engine/
│   │   │   ├── render-engine.ts  # PixiJS Application facade
│   │   │   ├── adapter.ts        # RenderAdapter interface + factory
│   │   │   ├── sprite-adapter.ts # Sprite Sheet renderer
│   │   │   ├── live2d-adapter.ts # Live2D renderer
│   │   │   ├── physics.ts        # Gravity, walking, random AI
│   │   │   └── input.ts          # Mouse interaction, drag/click detection
│   │   └── state/
│   │       └── machine.ts        # Finite state machine
│   └── config/
│       ├── index.html        # Config window entry
│       ├── main.ts           # ConfigApp: sidebar + tabs
│       ├── styles/config.css # Config window design system
│       └── components/
│           ├── PetListPanel.ts
│           ├── SettingsPanel.ts
│           └── ActionEditor.ts
├── shared/
│   ├── types.ts              # All TypeScript type definitions
│   ├── constants.ts          # Default values, physics constants
│   ├── ipc-channels.ts       # IPC channel names + ElectronAPI interface
│   ├── i18n.ts               # Internationalization
│   └── utils.ts              # Utility functions
└── assets/
    ├── default-pet/          # Default sprite sheet (128x128, 5 states)
    └── tray-icon.png         # System tray icon
```

## Architecture

### Three-Process Model

```
┌─────────────────────────────────────────┐
│           MAIN PROCESS                  │
│  ConfigManager · PetWindowManager       │
│  ActionExecutor · TrayManager           │
│  UpdaterManager · Logger                │
└──────────────┬──────────────────────────┘
               │ ipcMain.handle() / .on()
               ▼
┌─────────────────────────────────────────┐
│          PRELOAD SCRIPT                 │
│  contextBridge.exposeInMainWorld()      │
└──────────────┬──────────────────────────┘
               │ window.electronAPI.*
               ▼
┌────────────────────┐  ┌─────────────────┐
│   PET RENDERER     │  │ CONFIG RENDERER │
│  RenderEngine      │  │  ConfigApp      │
│  PhysicsEngine     │  │  PetListPanel   │
│  StateMachine      │  │  SettingsPanel  │
│  InputHandler      │  │  ActionEditor   │
└────────────────────┘  └─────────────────┘
```

### State Machine

The pet's behavior is driven by a finite state machine:

```
idle ──timeout──→ walk ──edge──→ idle
 │                 │
 ├──mousedown──→ drag ──mouseup──→ fall ──landed──→ idle
 │                 │
 └──click──→ click ──actionDone──→ idle
```

### Physics Engine

Custom lightweight physics (no Matter.js) with immutable state + reducer pattern:

1. **Gravity** — Acceleration with bounce damping on ground collision
2. **Walking** — Horizontal movement with edge behavior (bounce/wrap/stop)
3. **Random Walk AI** — Autonomous idle → walk → pause → walk cycle

Physics runs during `idle`, `walk`, and `fall` states. The random walk AI automatically triggers walking when the pet is idle on the ground. User-configured behavior settings (walk speed, gravity, edge behavior, etc.) are synchronized to the physics engine in real-time.

### Click-Through Mechanism

Pet windows are transparent and click-through by default:

1. Window starts with `setIgnoreMouseEvents(true, { forward: true })`
2. Renderer's `InputHandler` does pixel-level hit testing via PixiJS
3. Mouse over pet pixels → `setInteractive(true)` → `setIgnoreMouseEvents(false)` to capture events
4. Mouse leaves pet → `setInteractive(false)` → restore click-through

### Render Adapter Pattern

```
RenderAdapter (interface)
  ├── SpriteAdapter   — PixiJS Spritesheet + AnimatedSprite
  └── Live2DAdapter   — pixi-live2d-display + Live2DModel
```

Adapters are loaded lazily via dynamic `import()` and can be swapped at runtime.

## Custom Sprite Sheet

To create your own pet, prepare a sprite sheet PNG with this layout:

| Property | Value |
|----------|-------|
| Total size | 768 × 640 px (6 columns × 5 rows) |
| Frame size | 128 × 128 px per frame |
| Format | PNG-32 with alpha transparency |

Frame layout:

```
Row 0: idle_0  idle_1  idle_2  idle_3   (empty)   (empty)
Row 1: walk_0  walk_1  walk_2  walk_3  walk_4    walk_5
Row 2: drag_0  drag_1   —       —       —         —
Row 3: fall_0  fall_1   —       —       —         —
Row 4: click_0 click_1 click_2 click_3   —         —
```

Create a matching `spritesheet.json` following the [PixiJS Spritesheet format](https://pixijs.io/6.x/guides/components/assets).

## Custom Actions

Each pet can have multiple actions triggered by left-click:

| Type | Payload | Example |
|------|---------|---------|
| `open-url` | URL to open | `https://github.com` |
| `execute-cmd` | Shell command | `notepad.exe` |
| `show-message` | Message text | `Hello!` |

Actions can require confirmation before execution.

## Packaging

```bash
# Build distributable
npm run dist:win

# Output
release/
  ├── Desk-Idoll-Setup-0.1.0.exe    # NSIS installer
  └── Desk-Idoll-0.1.0-portable.exe  # Portable version
```

## License

MIT
