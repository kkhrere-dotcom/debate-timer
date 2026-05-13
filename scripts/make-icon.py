#!/usr/bin/env python3
"""Generate Mac/Windows icon assets from `build/icon.png`.

Workflow:
  1. Put a square 1024x1024 (or any square) PNG at `build/icon.png`.
  2. Run `python3 scripts/make-icon.py`.
  3. This generates `build/icon.ico` (Windows multi-resolution) and
     `build/icon.icns` (macOS) alongside.

The source `icon.png` is the canonical truth. Replace it to change the icon.
"""
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
SOURCE = BUILD / "icon.png"
MASTER_SIZE = 1024


def main():
    if not SOURCE.exists():
        print(f"[icon] ERROR: {SOURCE} not found. Drop a square PNG there first.")
        sys.exit(1)

    src = Image.open(SOURCE)
    if src.size != (MASTER_SIZE, MASTER_SIZE):
        print(f"[icon] resizing {src.size} → {MASTER_SIZE}x{MASTER_SIZE}")
        src = src.resize((MASTER_SIZE, MASTER_SIZE), Image.LANCZOS)
        # Re-save the canonical png at 1024
        src.save(SOURCE, "PNG")
    if src.mode != "RGBA":
        src = src.convert("RGBA")

    # 1) ICO (Windows) — multi-resolution
    ico_path = BUILD / "icon.ico"
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    src.save(ico_path, format="ICO", sizes=ico_sizes)
    print(f"[icon] wrote {ico_path}")

    # 2) ICNS (macOS) — via iconset + iconutil
    iconset_dir = BUILD / "icon.iconset"
    if iconset_dir.exists():
        shutil.rmtree(iconset_dir)
    iconset_dir.mkdir()

    # Apple's required filenames + sizes
    specs = [
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
    for name, size in specs:
        resized = src.resize((size, size), Image.LANCZOS)
        resized.save(iconset_dir / name, "PNG")

    icns_path = BUILD / "icon.icns"
    subprocess.run(
        ["iconutil", "-c", "icns", str(iconset_dir), "-o", str(icns_path)],
        check=True,
    )
    print(f"[icon] wrote {icns_path}")

    shutil.rmtree(iconset_dir)


if __name__ == "__main__":
    main()
