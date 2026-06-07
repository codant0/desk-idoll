# tray-icon.png — System Tray Icon

This file is required at `src/assets/tray-icon.png` for the system tray functionality.

## Specifications

| Property  | Value                                    |
|-----------|------------------------------------------|
| Size      | 16x16 px (Windows tray standard)         |
| Format    | PNG-24 with alpha transparency           |
| Style     | Simplified version of the app icon       |
| Purpose   | Electron `Tray` constructor icon param   |

## Design Requirements

- Windows taskbar has a dark background; the icon should use light/white colors
- Avoid excessive gradients; 16x16 pixels requires clear, high-contrast shapes
- Optionally prepare a 32x32 version for high-DPI displays (Windows auto-selects)
- The icon should be recognizable at tiny sizes

## How to Generate

### Option 1: Manual Design (Recommended)

1. Open an image editor (Photoshop, GIMP, Figma, etc.)
2. Create a 16x16 canvas with transparent background
3. Draw a simplified version of the Desk-Idoll mascot (e.g., a small face or character silhouette)
4. Export as PNG-24 with alpha channel

### Option 2: Downscale from App Icon

```bash
# Using ImageMagick to create a 16x16 tray icon from a larger source
convert icon-256.png -resize 16x16 -background none -gravity center -extent 16x16 tray-icon.png
```

### Option 3: Python Script (Placeholder)

```python
"""Generate a placeholder 16x16 tray icon."""
from PIL import Image, ImageDraw

img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Simple smiling face placeholder
draw.ellipse([1, 1, 14, 14], fill=(100, 180, 255, 220), outline=(60, 120, 200, 255))
draw.ellipse([4, 5, 6, 7], fill=(40, 40, 40, 255))    # left eye
draw.ellipse([9, 5, 11, 7], fill=(40, 40, 40, 255))   # right eye
draw.arc([5, 7, 10, 11], 0, 180, fill=(40, 40, 40, 255))  # smile

img.save("tray-icon.png")
print("Generated tray-icon.png (16x16)")
```

## Usage in Code

```typescript
import { Tray } from 'electron';
import path from 'path';

const trayIconPath = isDev
  ? path.join(__dirname, '../assets/tray-icon.png')
  : path.join(process.resourcesPath, 'tray-icon.png');

const tray = new Tray(trayIconPath);
```
