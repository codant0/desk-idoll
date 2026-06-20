# Changelog

## [Unreleased]

### Added
- Static image desktop pet customization
  - Simple mode: programmatic animation (instant)
  - Advanced mode: AnimatedDrawings AI processing
- Three animation style presets: gentle, bouncy, energetic
- Adjustable animation parameters: float amplitude, frequency, breathing scale, etc.
- Image validation and asset management service
- AnimatedDrawings Python service integration
- Spritesheet generator from single images
- StaticAdapter for programmatic animation rendering
- Full i18n support (Chinese/English)

### Changed
- Updated type definitions to support `static-image` model type
- Improved service lifecycle management
- Enhanced error handling and user feedback

### Fixed
- Fixed snake_case/camelCase field mapping issues
- Fixed animationMode detection errors
- Fixed preset overriding imagePath
- Fixed polling interval leaks
- Fixed ensureAssetsDir race condition

## [0.1.0] - 2024-XX-XX

### Added
- Initial release
- Sprite Sheet animation support
- Live2D model support
- Physics engine and state machine
- Configuration interface
- System tray integration
- Auto-update mechanism
- i18n support (zh-CN, en)
