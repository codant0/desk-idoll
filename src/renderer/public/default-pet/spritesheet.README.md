# spritesheet.png — Default Pet Sprite Sheet

This directory requires a `spritesheet.png` file to work with the `spritesheet.json` configuration.

## Image Specifications

| Property       | Value                                      |
|----------------|--------------------------------------------|
| Total size     | 768 x 640 px (6 columns x 5 rows)         |
| Frame size     | 128 x 128 px per frame                     |
| Format         | PNG-32 (with alpha transparency)           |
| Color space    | sRGB                                       |
| Background     | Fully transparent (alpha = 0)              |

## Frame Layout

```
Row 0 (y=0):   | idle_0 | idle_1 | idle_2 | idle_3 |   (empty)  |   (empty)  |
Row 1 (y=128): | walk_0 | walk_1 | walk_2 | walk_3 | walk_4     | walk_5     |
Row 2 (y=256): | drag_0 | drag_1 |   (empty)  |   (empty)  |   (empty)  |   (empty)  |
Row 3 (y=384): | fall_0 | fall_1 |   (empty)  |   (empty)  |   (empty)  |   (empty)  |
Row 4 (y=512): | click_0| click_1| click_2| click_3|   (empty)  |   (empty)  |
```

## Animation States

| State   | Frames | Description                                                  |
|---------|--------|--------------------------------------------------------------|
| `idle`  | 4      | Character standing still with subtle breathing/sway animation|
| `walk`  | 6      | Full walking gait cycle (legs alternating, arms swinging)    |
| `drag`  | 2      | Character being dragged (arms open, surprised expression)    |
| `fall`  | 2      | Character falling (arms up, hair/ears floating upward)       |
| `click` | 4      | Click feedback animation (bounce, stars, jump and land)      |

## How to Generate

### Option 1: Using TexturePacker (Recommended)

1. Prepare individual frame PNGs (128x128 each, with transparency)
2. Open TexturePacker and import all frames
3. Set layout to grid: 6 columns, 5 rows
4. Set texture size to 768x640
5. Export format: "PixiJS" or "JSON (Hash)"
6. Output file: `spritesheet.png`

### Option 2: Using Aseprite

1. Create an Aseprite file with all animation frames
2. Use File > Export Sprite Sheet
3. Set columns to 6, check "Merge Duplicates" off
4. Output format: PNG with JSON data

### Option 3: Manual Composition with ImageMagick

```bash
# Assuming individual frames are prepared as idle_0.png, idle_1.png, etc.
# Montage them into the correct grid layout:
montage \
  idle_0.png idle_1.png idle_2.png idle_3.png - - \
  walk_0.png walk_1.png walk_2.png walk_3.png walk_4.png walk_5.png \
  drag_0.png drag_1.png - - - - \
  fall_0.png fall_1.png - - - - \
  click_0.png click_1.png click_2.png click_3.png - - \
  -tile 6x5 -geometry 128x128+0+0 -background none \
  spritesheet.png
```

### Option 4: Using the Python Script

```python
"""Generate a placeholder spritesheet.png for development."""
from PIL import Image, ImageDraw

WIDTH, HEIGHT = 768, 640
FRAME = 128
COLORS = {
    0: (100, 180, 255, 200),  # idle - light blue
    1: (100, 220, 100, 200),  # walk - green
    2: (255, 180, 100, 200),  # drag - orange
    3: (180, 100, 255, 200),  # fall - purple
    4: (255, 100, 100, 200),  # click - red
}

img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Row definitions: (row_index, frame_count, label, color_key)
rows = [
    (0, 4, "idle", 0),
    (1, 6, "walk", 1),
    (2, 2, "drag", 2),
    (3, 2, "fall", 3),
    (4, 4, "click", 4),
]

for row_idx, count, label, color_key in rows:
    color = COLORS[color_key]
    for col in range(count):
        x0 = col * FRAME + 8
        y0 = row_idx * FRAME + 8
        x1 = x0 + FRAME - 16
        y1 = y0 + FRAME - 16
        draw.rounded_rectangle([x0, y0, x1, y1], radius=12, fill=color)
        draw.text((x0 + 20, y0 + 48), f"{label}_{col}", fill=(255, 255, 255, 255))

img.save("spritesheet.png")
print("Generated spritesheet.png (768x640)")
```

## Design Guidelines

- Default pet should be a simple cartoon character (blocky person, small animal, or pixel art)
- Style reference: classic Shimeji desktop pets
- Character should be centered in each 128x128 frame with transparent padding around edges
- Ensure sufficient contrast so the character is visible on any wallpaper
