# icon.ico — Windows Application Icon

This file is required at `resources/icon.ico` for the Windows application icon embedded in the executable, installer, and shortcuts.

## Specifications

The ICO format supports multiple icon sizes in a single file. Windows automatically selects the appropriate size for each display context.

### Required Sizes

| Size (px) | Usage                                                         |
|-----------|---------------------------------------------------------------|
| 16x16     | Window title bar, taskbar small icon, system tray             |
| 32x32     | Desktop shortcut (small icon), Alt+Tab thumbnail              |
| 48x48     | Desktop shortcut (medium icon), File Explorer detail view     |
| 64x64     | File Explorer tile view                                       |
| 128x128   | File Explorer extra large icon view                           |
| 256x256   | Installer title bar, Windows Vista+ large icon view, thumbnails|

### Design Requirements

- Start from a 256x256 (or larger) square PNG with alpha transparency
- Ensure the design is legible at 16x16; avoid fine details that disappear at small sizes
- Prioritize small-size recognizability when designing
- Use PNG-24 with alpha channel as the source format

## How to Generate

### Option 1: Using ImageMagick (Command Line)

```bash
# From a 256x256 source PNG, generate ICO with all required sizes
convert icon-256.png \
  \( -clone 0 -resize 128x128 \) \
  \( -clone 0 -resize 64x64 \) \
  \( -clone 0 -resize 48x48 \) \
  \( -clone 0 -resize 32x32 \) \
  \( -clone 0 -resize 16x16 \) \
  icon.ico
```

### Option 2: Using IcoFX (GUI Tool)

1. Open IcoFX
2. File > New > Import from image (select your 256x256 PNG)
3. Check all required sizes: 16, 32, 48, 64, 128, 256
4. Adjust each size if needed (especially 16x16 for clarity)
5. File > Save As > `icon.ico`

### Option 3: Online Tools

- [RealFaviconGenerator](https://realfavicongenerator.net/) — upload PNG, download ICO
- [ICOConvert](https://icoconvert.com/) — simple drag-and-drop converter
- [ConvertICO](https://convertico.com/) — batch conversion support

### Option 4: Greenfish Icon Editor (Free)

1. Download Greenfish Icon Editor Pro (free)
2. Open your 256x256 PNG
3. Create additional layers for each size, manually adjusting details
4. Export as ICO

## Additional Files

### icon.png — Development Mode Icon

A 512x512 PNG version of the icon is also needed at `resources/icon.png` for development mode (when electron-builder is not involved).

```bash
# Generate from the same source
convert icon-256.png -resize 512x512 icon.png
```

## Usage in Code

```typescript
// Development mode uses PNG, production uses ICO
const iconPath = isDev
  ? path.join(__dirname, '../../resources/icon.png')
  : path.join(process.resourcesPath, 'icon.ico');

const mainWindow = new BrowserWindow({
  icon: iconPath,
  // ...
});
```

## Preparing the Source Image

If you do not have a 256x256 source image yet, create one using any of these methods:

1. **Design tools**: Figma, Photoshop, Illustrator — export as PNG-24 with transparency
2. **Pixel art**: Aseprite, Piskel — create at 256x256 or upscale from smaller pixel art
3. **AI generation**: Use an AI image generator with a prompt like "cute chibi mascot icon, simple, flat design, transparent background, 256x256"
4. **Placeholder**: Use the Python script below for development

### Python Placeholder Script

```python
"""Generate a placeholder 256x256 icon PNG."""
from PIL import Image, ImageDraw, ImageFont

img = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Rounded rectangle background
draw.rounded_rectangle([8, 8, 248, 248], radius=32, fill=(100, 180, 255, 220))

# Simple character face
draw.ellipse([80, 70, 176, 166], fill=(255, 220, 180, 255))  # face
draw.ellipse([100, 100, 116, 116], fill=(40, 40, 40, 255))   # left eye
draw.ellipse([140, 100, 156, 116], fill=(40, 40, 40, 255))   # right eye
draw.arc([110, 120, 146, 150], 0, 180, fill=(40, 40, 40, 255))  # smile

# Label
draw.text((88, 190), "Desk", fill=(255, 255, 255, 255))
draw.text((92, 210), "Idoll", fill=(255, 255, 255, 255))

img.save("icon-256.png")
print("Generated icon-256.png (256x256) — use as source for icon.ico")
```
