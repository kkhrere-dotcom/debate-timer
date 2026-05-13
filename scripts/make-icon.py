#!/usr/bin/env python3
"""Generate app icon (icon.png + icon.icns + icon.ico) from scratch using PIL.

Design: iOS-style rounded blue square with a white stopwatch face featuring
clock hands. Recognizable at small sizes, theme-aligned with the app's
PPT mode (iOS Blue).
"""
import math
import os
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
BUILD.mkdir(exist_ok=True)

SIZE = 1024  # master size
RADIUS_CORNER = 230  # rounded square corner radius


def draw_master() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Background: solid iOS blue rounded square
    bg = (0, 122, 255, 255)
    d.rounded_rectangle([(0, 0), (SIZE, SIZE)], radius=RADIUS_CORNER, fill=bg)

    # Slight inner highlight at top-left (gives depth without gradient)
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rounded_rectangle(
        [(0, 0), (SIZE, SIZE // 2)],
        radius=RADIUS_CORNER,
        fill=(255, 255, 255, 28),
    )
    img.alpha_composite(overlay)

    # Stopwatch top "ring" + button
    btn_w, btn_h = 150, 80
    btn_x = (SIZE - btn_w) // 2
    btn_y = 158
    d.rounded_rectangle(
        [(btn_x, btn_y), (btn_x + btn_w, btn_y + btn_h)],
        radius=22,
        fill=(255, 255, 255),
    )
    top_btn_w, top_btn_h = 56, 56
    top_btn_x = (SIZE - top_btn_w) // 2
    top_btn_y = 112
    d.rounded_rectangle(
        [(top_btn_x, top_btn_y), (top_btn_x + top_btn_w, top_btn_y + top_btn_h)],
        radius=14,
        fill=(255, 255, 255),
    )

    # Main stopwatch body (white circle)
    cx, cy = SIZE // 2, 595
    r = 340
    # Soft shadow under the circle
    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse(
        [(cx - r, cy - r + 20), (cx + r, cy + r + 20)],
        fill=(0, 0, 0, 80),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=20))
    img.alpha_composite(shadow)

    d.ellipse([(cx - r, cy - r), (cx + r, cy + r)], fill=(255, 255, 255))

    # Inner tick ring (subtle gray)
    d.ellipse(
        [(cx - r + 32, cy - r + 32), (cx + r - 32, cy + r - 32)],
        outline=(229, 229, 234),
        width=8,
    )

    # Tick marks at 12/3/6/9 (small short)
    tick_color = (60, 60, 67)
    for angle_deg in (0, 90, 180, 270):
        rad = math.radians(angle_deg - 90)
        outer = (cx + (r - 36) * math.cos(rad), cy + (r - 36) * math.sin(rad))
        inner = (cx + (r - 80) * math.cos(rad), cy + (r - 80) * math.sin(rad))
        d.line([inner, outer], fill=tick_color, width=14)

    # Clock hands:
    # Minute hand pointing straight up (12 o'clock) — strong black
    minute_len = 240
    rad = math.radians(-90)
    end = (cx + minute_len * math.cos(rad), cy + minute_len * math.sin(rad))
    d.line([(cx, cy), end], fill=(26, 26, 26), width=42)
    # Hour hand pointing to 2 (60deg from top) — slightly shorter
    hour_len = 170
    rad = math.radians(60 - 90)
    end = (cx + hour_len * math.cos(rad), cy + hour_len * math.sin(rad))
    d.line([(cx, cy), end], fill=(26, 26, 26), width=42)
    # Center pivot
    pr = 36
    d.ellipse([(cx - pr, cy - pr), (cx + pr, cy + pr)], fill=(26, 26, 26))
    # Inner pivot accent
    pr2 = 12
    d.ellipse([(cx - pr2, cy - pr2), (cx + pr2, cy + pr2)], fill=(0, 122, 255))

    # Optional red accent dot at "12" — represents alert point
    accent_r = 26
    accent_y = cy - (r - 56)
    d.ellipse(
        [(cx - accent_r, accent_y - accent_r), (cx + accent_r, accent_y + accent_r)],
        fill=(255, 59, 48),
    )

    return img


def main():
    master = draw_master()

    # 1) PNG (1024x1024 master) — both for electron-builder fallback and ICO source
    png_path = BUILD / "icon.png"
    master.save(png_path, "PNG")
    print(f"[icon] wrote {png_path}")

    # 2) ICO (Windows) — multi-resolution
    ico_path = BUILD / "icon.ico"
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    master.save(ico_path, format="ICO", sizes=ico_sizes)
    print(f"[icon] wrote {ico_path}")

    # 3) ICNS (macOS) — via iconset + iconutil
    iconset_dir = BUILD / "icon.iconset"
    if iconset_dir.exists():
        shutil.rmtree(iconset_dir)
    iconset_dir.mkdir()

    # Apple's required filenames
    icns_specs = [
        ("icon_16x16.png", 16),
        ("icon_16x16@2x.png", 32),
        ("icon_32x32.png", 32),
        ("icon_32x32@2x.png", 64),
        ("icon_128x128.png", 128),
        ("icon_128x128@2x.png", 256),
        ("icon_256x256.png", 256),
        ("icon_256x256@2x.png", 512),
        ("icon_512x512.png", 512),
        ("icon_512x512@2x.png", 1024),
    ]
    for name, size in icns_specs:
        resized = master.resize((size, size), Image.LANCZOS)
        resized.save(iconset_dir / name, "PNG")

    icns_path = BUILD / "icon.icns"
    subprocess.run(
        ["iconutil", "-c", "icns", str(iconset_dir), "-o", str(icns_path)],
        check=True,
    )
    print(f"[icon] wrote {icns_path}")

    # Clean up iconset dir
    shutil.rmtree(iconset_dir)


if __name__ == "__main__":
    main()
