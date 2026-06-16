# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Desk-Idoll is a Windows desktop pet (shimeji-style) application built with Electron 33 + PixiJS 6 + TypeScript. Animated characters live on transparent, frameless, always-on-top windows that float over the desktop. Supports Sprite Sheet animations and Live2D Cubism models.

## Commands

```bash
npm run dev              # Start dev mode (electron-vite dev, hot reload)
npm run build            # Build all three targets (main/preload/renderer)
npm run start            # Preview production build
npm run typecheck        # Type check both node and web targets
npm run typecheck:node   # Type check main + preload + shared only
npm run typecheck:web    # Type check renderer + config only
npm run dist:win         # Package as Windows installer + portable
```

No test framework is configured.

## Architecture

Three-process Electron architecture with two renderer entry points:

```
Main Process (src/main/)
  ├── index.ts                  — App entry, lifecycle, manager orchestration
  ├── ipc/index.ts              — All IPC handler registrations
  ├── windows/pet-window.ts     — One BrowserWindow per pet (transparent, frameless, always-on-top)
  ├── windows/config-window.ts  — Singleton settings window (hide-on-close pattern)
  └── services/
      ├── config-manager.ts     — electron-store persistence, CRUD for pets/global settings
      ├── action-executor.ts    — Executes pet actions (open-url, execute-cmd, show-message)
      ├── tray.ts               — System tray icon + context menu
      ├── updater.ts            — electron-updater integration
      └── logger.ts             — Daily rotating file logger

Preload (src/preload/)
  └── index.ts                  — contextBridge exposing window.electronAPI

Renderer — Pet Window (src/renderer/)
  ├── src/main.ts               — Entry: wires RenderEngine + PhysicsEngine + StateMachine + InputHandler
  ├── src/engine/
  │   ├── render-engine.ts      — PixiJS Application lifecycle, adapter facade
  │   ├── adapter.ts            — RenderAdapter interface + createAdapter() factory (lazy import)
  │   ├── sprite-adapter.ts     — PixiJS Spritesheet + AnimatedSprite
  │   ├── live2d-adapter.ts     — pixi-live2d-display + Live2DModel
  │   ├── physics.ts            — Immutable-state physics (gravity, walking, random AI)
  │   └── input.ts              — Mouse interaction (drag vs click, pixel-level hit test, click-through)
  └── src/state/
      └── machine.ts            — FSM: idle → walk → drag → fall → click → idle

Renderer — Config Window (src/renderer/config/)
  ├── main.ts                   — ConfigApp: sidebar pet list + tabbed settings
  └── components/
      ├── PetListPanel.ts       — Pet list sidebar
      ├── SettingsPanel.ts      — Basic/Animation/Appearance tabs
      └── ActionEditor.ts       — Action CRUD with modal dialog

Shared (src/shared/)
  ├── types.ts                  — All data shapes (PetConfig, AppConfig, AnimationState, etc.)
  ├── constants.ts              — Defaults, physics constants, limits
  ├── ipc-channels.ts           — IPC channel names + ElectronAPI interface
  ├── i18n.ts                   — zh-CN / en translations (~100 keys)
  └── utils.ts                  — randomUUID()
```

## Key Patterns

**Adapter/Strategy for rendering**: `RenderEngine` delegates to a `RenderAdapter` (Sprite or Live2D). The factory `createAdapter()` uses dynamic `import()` for lazy loading. Adapters can be swapped at runtime.

**State machine drives behavior**: `StateMachine` (FSM) transitions between idle/walk/drag/fall/click. `InputHandler` detects raw input and emits events to the state machine. State machine callbacks trigger render state changes and physics actions.

**Physics during idle, walk, and fall**: `PhysicsEngine` runs during `idle`, `walk`, and `fall` states. During `fall`, gravity simulation moves the Electron window via IPC. During `idle` and `walk`, the random walk AI autonomously controls pet movement. User-configured behavior settings are synchronized to the physics engine in real-time.

**Click-through with pixel hit testing**: Pet windows start with `setIgnoreMouseEvents(true, { forward: true })`. The renderer's `InputHandler` does pixel-level hit testing via PixiJS InteractionManager. When mouse is over pet pixels → `setInteractive(false)` to capture events; when mouse leaves → restore click-through.

**IPC channel constants**: All channel names are in `src/shared/ipc-channels.ts` as `IPC_CHANNELS`. The `ElectronAPI` interface defines the full preload bridge surface.

**Config change propagation**: `ConfigManager.notifyChange()` → tray refresh. IPC `config:changed` + `pet:config-update` → all pet renderers re-load their adapter with updated config. Each pet renderer identifies itself via `currentPetId` to find its own config in the full `AppConfig`.

**Hide-on-close for config window**: `ConfigWindowManager` intercepts close events and hides instead of destroying. `markAppQuitting()` allows real close during app exit.

## Build Configuration

- **electron-vite** builds three targets: main, preload, renderer
- Renderer has two HTML entry points: `index.html` (pet) and `config/index.html` (settings)
- Path aliases: `@shared`, `@main`, `@renderer`, `@preload`
- Packaging: electron-builder targeting Windows x64 (NSIS installer + portable)
- Default pet spritesheet bundled as extraResource in `src/assets/default-pet/`

## i18n

The app supports `zh-CN` and `en`. All user-facing strings should use `t('key')` from `src/shared/i18n.ts`. Translation keys are organized by domain: `tray.*`, `config.*`, `notify.*`.
