"""
Render full Extol Cards (1080x1920) with depth maps and parallax videos.

Each card gets:
  - card_{name}.png         — static card (current format)
  - card_{name}_depth.png   — depth map (photo only, text layer excluded)
  - card_{name}_parallax.mp4 — 4-sec looping parallax video
"""

import os
import json
import math
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── Config ──────────────────────────────────────────────────────────────────
CARD_W, CARD_H = 1080, 1920
OUTPUT_DIR = "/Users/ken/code/brij/experiments/parallax-cards/cards"
CARD_BG_DIR = "/Users/ken/code/brij/packages/brij-app/public/card-backgrounds"

# Video settings
FPS = 24
DURATION = 4  # seconds
DISPLACEMENT = 25  # pixels max shift
TOTAL_FRAMES = FPS * DURATION

# Card data — fake activities for the experiment
CARDS = [
    {
        "bg": os.path.join(CARD_BG_DIR, "O3-sun-forest-canopy.jpg"),
        "group": "Mountain Trails Club",
        "title": "Saturday Morning Ride",
        "stats": "12 showed up · 3rd week running",
        "date": "Mar 15, 2026",
    },
    {
        "bg": os.path.expanduser("~/Desktop/crusading-nyc-community-garden-group-turns-30-20.jpg"),
        "group": "East Harlem Garden Collective",
        "title": "Spring Planting Day",
        "stats": "28 showed up · 4 new members",
        "date": "Mar 8, 2026",
    },
    {
        "bg": os.path.expanduser("~/Desktop/istockphoto-1051098428-1024x1024.jpg"),
        "group": "Sunset Run Club",
        "title": "Thursday Evening 5K",
        "stats": "9 showed up · Week 14",
        "date": "Mar 20, 2026",
    },
    {
        "bg": os.path.join(CARD_BG_DIR, "M1-warm-stage.jpg"),
        "group": "The Regulars",
        "title": "Open Mic Night",
        "stats": "15 showed up · 6 performed",
        "date": "Mar 18, 2026",
    },
    {
        "bg": os.path.expanduser("~/Desktop/Mt+Narra+20190714-2.webp"),
        "group": "Alpine Collective",
        "title": "Mt Narra Summit Push",
        "stats": "7 showed up · 4,212m",
        "date": "Jul 14, 2019",
    },
]


def load_font(size, bold=False):
    """Load a clean sans-serif font."""
    # Try common macOS fonts
    candidates = [
        "/System/Library/Fonts/SFProText-Bold.otf" if bold else "/System/Library/Fonts/SFProText-Regular.otf",
        "/System/Library/Fonts/SFProDisplay-Bold.otf" if bold else "/System/Library/Fonts/SFProDisplay-Regular.otf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def render_text_layer(card_data):
    """Render the text overlay as a transparent PNG (1080x1920)."""
    layer = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    # Bottom gradient overlay for text readability
    gradient = Image.new("RGBA", (CARD_W, 700), (0, 0, 0, 0))
    for y in range(700):
        alpha = int(200 * (y / 700) ** 1.5)
        for x in range(CARD_W):
            gradient.putpixel((x, y), (0, 0, 0, alpha))
    layer.paste(gradient, (0, CARD_H - 700), gradient)

    # Top gradient for group name
    top_gradient = Image.new("RGBA", (CARD_W, 200), (0, 0, 0, 0))
    for y in range(200):
        alpha = int(120 * (1 - y / 200) ** 1.5)
        for x in range(CARD_W):
            top_gradient.putpixel((x, y), (0, 0, 0, alpha))
    layer.paste(top_gradient, (0, 0), top_gradient)

    # Fonts
    font_group = load_font(36)
    font_title = load_font(64, bold=True)
    font_stats = load_font(32)
    font_date = load_font(28)
    font_badge = load_font(24)
    font_brij = load_font(28)

    # Group name (top)
    draw.text((60, 60), card_data["group"].upper(), fill=(255, 255, 255, 200),
              font=font_group)

    # Date (top right area)
    draw.text((60, 110), card_data["date"], fill=(255, 255, 255, 150),
              font=font_date)

    # Title (bottom area)
    y_base = CARD_H - 380
    draw.text((60, y_base), card_data["title"], fill=(255, 255, 255, 255),
              font=font_title)

    # Stats
    draw.text((60, y_base + 80), card_data["stats"],
              fill=(255, 255, 255, 200), font=font_stats)

    # Verification badge
    badge_y = CARD_H - 200
    draw.text((60, badge_y), "✓ Verified on Solana",
              fill=(255, 255, 255, 120), font=font_badge)

    # brij watermark
    draw.text((60, CARD_H - 120), "brij.extol.work",
              fill=(255, 255, 255, 80), font=font_brij)

    return layer


def prepare_background(bg_path):
    """Load and crop background to 1080x1920 (cover fit)."""
    img = Image.open(bg_path).convert("RGB")
    w, h = img.size

    # Scale to cover 1080x1920
    target_ratio = CARD_W / CARD_H
    img_ratio = w / h

    if img_ratio > target_ratio:
        # Image is wider — scale by height, crop width
        new_h = CARD_H
        new_w = int(w * (CARD_H / h))
    else:
        # Image is taller — scale by width, crop height
        new_w = CARD_W
        new_h = int(h * (CARD_W / w))

    img = img.resize((new_w, new_h), Image.LANCZOS)

    # Center crop
    left = (new_w - CARD_W) // 2
    top = (new_h - CARD_H) // 2
    img = img.crop((left, top, left + CARD_W, top + CARD_H))

    return img


def generate_depth_map(bg_image):
    """Run Depth Anything V2 on the background image."""
    from transformers import pipeline as tf_pipeline
    import torch

    device = "mps" if torch.backends.mps.is_available() else "cpu"

    # Downscale for inference (faster), then upscale depth map
    max_side = 768
    w, h = bg_image.size
    scale = max_side / max(w, h)
    small = bg_image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    depth_pipe = tf_pipeline(
        "depth-estimation",
        model="depth-anything/Depth-Anything-V2-Small-hf",
        device=device,
    )

    result = depth_pipe(small)
    depth = result["depth"].resize((w, h), Image.LANCZOS)

    return depth


def render_parallax_frame(bg_image, depth_map, text_layer, mx, my, displacement):
    """Render a single parallax frame."""
    w, h = bg_image.size
    bg_data = bg_image.load()
    depth_data = depth_map.load()

    frame = Image.new("RGB", (w, h))
    frame_data = frame.load()

    for y in range(h):
        for x in range(w):
            depth_val = depth_data[x, y]
            if isinstance(depth_val, tuple):
                depth_val = depth_val[0]
            nd = depth_val / 255.0

            dx = int(mx * displacement * nd)
            dy = int(my * displacement * nd)

            sx = min(max(x - dx, 0), w - 1)
            sy = min(max(y - dy, 0), h - 1)

            frame_data[x, y] = bg_data[sx, sy]

    # Composite text layer on top (no displacement — it floats)
    frame = frame.convert("RGBA")
    frame = Image.alpha_composite(frame, text_layer)
    return frame.convert("RGB")


def render_parallax_frame_fast(bg_image, depth_map, text_layer, mx, my, displacement):
    """Fast parallax frame using numpy."""
    import numpy as np

    bg_arr = np.array(bg_image)
    depth_arr = np.array(depth_map.convert("L")).astype(np.float32) / 255.0

    h, w = bg_arr.shape[:2]

    # Create displacement maps
    y_coords, x_coords = np.mgrid[0:h, 0:w]
    dx = (mx * displacement * depth_arr).astype(np.int32)
    dy = (my * displacement * depth_arr).astype(np.int32)

    sx = np.clip(x_coords - dx, 0, w - 1)
    sy = np.clip(y_coords - dy, 0, h - 1)

    # Sample displaced pixels
    frame_arr = bg_arr[sy, sx]

    frame = Image.fromarray(frame_arr)
    frame = frame.convert("RGBA")
    frame = Image.alpha_composite(frame, text_layer)
    return frame.convert("RGB")


def generate_video(bg_image, depth_map, text_layer, output_path, card_name):
    """Generate a looping parallax MP4."""
    print(f"    Rendering {TOTAL_FRAMES} frames...", end=" ", flush=True)

    tmpdir = tempfile.mkdtemp(prefix="parallax_")

    for i in range(TOTAL_FRAMES):
        # Smooth elliptical motion for the loop
        t = i / TOTAL_FRAMES
        angle = t * 2 * math.pi
        mx = 0.6 * math.sin(angle)       # horizontal drift
        my = 0.3 * math.cos(angle * 2)    # subtle vertical bob

        frame = render_parallax_frame_fast(
            bg_image, depth_map, text_layer, mx, my, DISPLACEMENT
        )
        frame.save(os.path.join(tmpdir, f"frame_{i:04d}.jpg"), "JPEG", quality=92)

    print("encoding...", end=" ", flush=True)

    # Encode with ffmpeg — H.264, high quality, loopable
    subprocess.run([
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", os.path.join(tmpdir, "frame_%04d.jpg"),
        "-c:v", "libx264",
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        "-crf", "20",
        "-preset", "medium",
        "-movflags", "+faststart",
        output_path,
    ], capture_output=True)

    # Cleanup frames
    for f in os.listdir(tmpdir):
        os.remove(os.path.join(tmpdir, f))
    os.rmdir(tmpdir)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"done ({size_mb:.1f} MB)")


def main():
    import numpy as np  # noqa: verify numpy available

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("=== Extol Card Parallax — Full Card Render ===\n")
    print(f"Card size: {CARD_W}x{CARD_H}")
    print(f"Video: {DURATION}s @ {FPS}fps = {TOTAL_FRAMES} frames")
    print(f"Displacement: {DISPLACEMENT}px\n")

    # Load depth model once
    print("Loading Depth Anything V2...")
    from transformers import pipeline as tf_pipeline
    import torch
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    depth_pipe = tf_pipeline(
        "depth-estimation",
        model="depth-anything/Depth-Anything-V2-Small-hf",
        device=device,
    )
    print(f"Model loaded on {device}.\n")

    manifest = []

    for i, card_data in enumerate(CARDS):
        name = card_data["title"].lower().replace(" ", "-")
        print(f"[{i+1}/{len(CARDS)}] {card_data['title']}")

        # 1. Prepare background
        print("    Background...", end=" ", flush=True)
        bg = prepare_background(card_data["bg"])
        print("done")

        # 2. Depth map
        print("    Depth estimation...", end=" ", flush=True)
        # Downscale for inference
        max_side = 768
        w, h = bg.size
        scale = max_side / max(w, h)
        small = bg.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        result = depth_pipe(small)
        depth = result["depth"].resize((w, h), Image.LANCZOS)
        print("done")

        # 3. Text overlay
        print("    Text layer...", end=" ", flush=True)
        text_layer = render_text_layer(card_data)
        print("done")

        # 4. Static card
        static = bg.convert("RGBA")
        static = Image.alpha_composite(static, text_layer).convert("RGB")
        static_path = os.path.join(OUTPUT_DIR, f"card_{name}.png")
        static.save(static_path, "PNG")

        # 5. Depth map
        depth_path = os.path.join(OUTPUT_DIR, f"card_{name}_depth.png")
        depth.save(depth_path, "PNG")

        # 6. Video
        video_path = os.path.join(OUTPUT_DIR, f"card_{name}_parallax.mp4")
        generate_video(bg, depth, text_layer, video_path, name)

        manifest.append({
            "name": name,
            "title": card_data["title"],
            "static": f"cards/card_{name}.png",
            "depth": f"cards/card_{name}_depth.png",
            "video": f"cards/card_{name}_parallax.mp4",
        })

    # Save manifest
    manifest_path = os.path.join(OUTPUT_DIR, "manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"\n✓ {len(manifest)} cards rendered")
    print(f"  Output: {OUTPUT_DIR}/")
    print(f"\nOpen card-viewer.html to compare static vs parallax.")


if __name__ == "__main__":
    main()
