"""
Generate depth maps from card background images using Depth Anything V2.
Uses MPS (Apple Silicon GPU) for acceleration.

Usage: python3 generate-depth.py
"""

import os
import glob
import random
import torch
from PIL import Image
from transformers import pipeline

# Paths
CARD_BG_DIR = "/Users/ken/code/brij/packages/brij-app/public/card-backgrounds"
EXTRA_IMAGES = [
    os.path.expanduser("~/Desktop/crusading-nyc-community-garden-group-turns-30-20.jpg"),
    os.path.expanduser("~/Desktop/Gemini_Generated_Image_ux31yiux31yiux31.png"),
    os.path.expanduser("~/Desktop/Mt+Narra+20190714-2.webp"),
    os.path.expanduser("~/Desktop/surf-terrain-ref-image-portrait.heic"),
]
DEPTH_DIR = "/Users/ken/code/brij/experiments/parallax-cards/depth-maps"
OUTPUT_DIR = "/Users/ken/code/brij/experiments/parallax-cards/output"

def collect_images():
    """Collect 8 random card backgrounds + extra desktop images."""
    # Get all JPG/PNG photos (skip SVG gradients)
    card_photos = sorted(glob.glob(os.path.join(CARD_BG_DIR, "*.[jJ][pP][gG]")) +
                         glob.glob(os.path.join(CARD_BG_DIR, "*.[pP][nN][gG]")) +
                         glob.glob(os.path.join(CARD_BG_DIR, "*.[wW][eE][bB][pP]")))

    # Random 8 from card backgrounds
    random.seed(42)  # Reproducible
    selected = random.sample(card_photos, min(8, len(card_photos)))

    # Add extra images (filter to ones that exist)
    for path in EXTRA_IMAGES:
        if os.path.exists(path):
            selected.append(path)
        else:
            print(f"  Skipping (not found): {path}")

    return selected


def main():
    print("=== Depth Anything V2 — Parallax Card Experiment ===\n")

    # Collect images
    images = collect_images()
    print(f"Processing {len(images)} images:")
    for img in images:
        print(f"  {os.path.basename(img)}")

    # Set up device
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"\nDevice: {device}")

    # Load Depth Anything V2 (small model — fast, good quality)
    print("Loading Depth Anything V2 (Small)...")
    depth_pipe = pipeline(
        "depth-estimation",
        model="depth-anything/Depth-Anything-V2-Small-hf",
        device=device,
    )
    print("Model loaded.\n")

    # Process each image
    results = []
    for i, img_path in enumerate(images):
        name = os.path.splitext(os.path.basename(img_path))[0]
        print(f"[{i+1}/{len(images)}] {name}...", end=" ", flush=True)

        try:
            # Load image
            img = Image.open(img_path).convert("RGB")

            # Resize if very large (keep aspect, max 1024 on long side)
            max_side = 1024
            w, h = img.size
            if max(w, h) > max_side:
                scale = max_side / max(w, h)
                img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

            # Run depth estimation
            result = depth_pipe(img)
            depth_map = result["depth"]  # PIL Image (grayscale)

            # Save depth map
            depth_path = os.path.join(DEPTH_DIR, f"{name}_depth.png")
            depth_map.save(depth_path)

            # Copy/save source image (resized) to output for the viewer
            src_path = os.path.join(OUTPUT_DIR, f"{name}.jpg")
            img.save(src_path, "JPEG", quality=90)

            results.append({
                "name": name,
                "src": f"output/{name}.jpg",
                "depth": f"depth-maps/{name}_depth.png",
                "width": img.size[0],
                "height": img.size[1],
            })

            print(f"done ({img.size[0]}x{img.size[1]})")

        except Exception as e:
            print(f"ERROR: {e}")

    # Write manifest for the viewer
    import json
    manifest_path = os.path.join(os.path.dirname(DEPTH_DIR), "manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n✓ {len(results)} depth maps generated")
    print(f"  Depth maps: {DEPTH_DIR}/")
    print(f"  Sources:    {OUTPUT_DIR}/")
    print(f"  Manifest:   {manifest_path}")
    print(f"\nOpen viewer.html to see the parallax effect.")


if __name__ == "__main__":
    main()
