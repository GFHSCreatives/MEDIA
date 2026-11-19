#!/usr/bin/env python3
"""
Texture-aware batch restoration using xinntao/Real-ESRGAN (GitHub).

Pipeline per image:
  1. Mild JPEG / banding pre-clean (edge-preserving)
  2. Real-ESRGAN x4 super-resolution (RRDBNet x4plus)
  3. Lanczos fit to exact 3840×2160 (native 16:9 sources)
  4. Conservative local-contrast / microtexture polish
  5. Lossless PNG master export

Preserves composition, identities, logos, and colors — no generative fill.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import torch
from basicsr.archs.rrdbnet_arch import RRDBNet
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from realesrgan import RealESRGANer

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "assets" / "source-photos"
DEFAULT_OUTPUT = ROOT / "out" / "restored"
WEIGHTS = ROOT / "tools" / "Real-ESRGAN" / "weights" / "RealESRGAN_x4plus.pth"

TARGET_W, TARGET_H = 3840, 2160


def analyze_image(bgr: np.ndarray) -> dict:
    """Quick artifact / quality diagnostics for logging."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    # Blockiness proxy: variance of 8x8 DCT-ish block mean differences
    bh, bw = h - h % 8, w - w % 8
    blocks = gray[:bh, :bw].reshape(bh // 8, 8, bw // 8, 8).mean(axis=(1, 3))
    block_var = float(np.var(np.diff(blocks, axis=1)) + np.var(np.diff(blocks, axis=0)))
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    noise_est = float(np.median(np.abs(gray.astype(np.float32) - cv2.GaussianBlur(gray, (5, 5), 0))))
    return {
        "size": [int(w), int(h)],
        "laplacian_var": round(lap_var, 2),
        "blockiness": round(block_var, 4),
        "noise_median": round(noise_est, 3),
    }


def mild_pre_denoise(bgr: np.ndarray) -> np.ndarray:
    """Light edge-preserving denoise — prefer leaving microtexture for SR."""
    # Very mild bilateral so Real-ESRGAN still sees residual JPEG grain to model,
    # without washing fabric / skin into plastic surfaces.
    return cv2.bilateralFilter(bgr, d=3, sigmaColor=12, sigmaSpace=12)


def build_upsampler(tile: int = 400) -> RealESRGANer:
    model = RRDBNet(
        num_in_ch=3,
        num_out_ch=3,
        num_feat=64,
        num_block=23,
        num_grow_ch=32,
        scale=4,
    )
    return RealESRGANer(
        scale=4,
        model_path=str(WEIGHTS),
        model=model,
        tile=tile,
        tile_pad=10,
        pre_pad=0,
        half=False,  # CPU path
        device=torch.device("cpu"),
    )


def fit_to_4k(rgb: np.ndarray) -> np.ndarray:
    """Preserve aspect ratio; for 16:9 sources this is exact 3840×2160."""
    h, w = rgb.shape[:2]
    scale = min(TARGET_W / w, TARGET_H / h)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    if (nw, nh) != (w, h):
        pil = Image.fromarray(rgb).resize((nw, nh), Image.Resampling.LANCZOS)
        rgb = np.array(pil)
    # Center-pad if needed (shouldn't for exact 16:9)
    if rgb.shape[1] != TARGET_W or rgb.shape[0] != TARGET_H:
        canvas = np.zeros((TARGET_H, TARGET_W, 3), dtype=np.uint8)
        y0 = (TARGET_H - rgb.shape[0]) // 2
        x0 = (TARGET_W - rgb.shape[1]) // 2
        canvas[y0 : y0 + rgb.shape[0], x0 : x0 + rgb.shape[1]] = rgb
        rgb = canvas
    return rgb


def subtle_polish(rgb: np.ndarray) -> np.ndarray:
    """Conservative micro-contrast; avoid plastic skin / over-sharpen halos."""
    pil = Image.fromarray(rgb)
    # Gentle unsharp — prioritize natural edges over crunchy AI look
    pil = pil.filter(ImageFilter.UnsharpMask(radius=0.9, percent=35, threshold=4))
    pil = ImageEnhance.Contrast(pil).enhance(1.02)
    pil = ImageEnhance.Color(pil).enhance(1.01)
    # Deband skies only where gradients are flat (mask by local variance)
    arr = np.array(pil)
    lab = cv2.cvtColor(arr, cv2.COLOR_RGB2LAB)
    l, a, b = cv2.split(lab)
    blur = cv2.bilateralFilter(l, d=5, sigmaColor=8, sigmaSpace=8)
    # Local variance mask: low-variance (sky/fuselage) gets more deband
    local = cv2.blur(l.astype(np.float32), (15, 15))
    var = cv2.blur((l.astype(np.float32) - local) ** 2, (15, 15))
    mask = (var < 40).astype(np.float32)
    mask = cv2.GaussianBlur(mask, (21, 21), 0)
    l2 = (l.astype(np.float32) * (1 - mask) + blur.astype(np.float32) * mask).clip(0, 255).astype(np.uint8)
    lab = cv2.merge([l2, a, b])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)


def restore_one(path: Path, upsampler: RealESRGANer, out_dir: Path) -> dict:
    t0 = time.time()
    bgr = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if bgr is None:
        raise RuntimeError(f"Failed to read {path}")

    diagnostics = analyze_image(bgr)
    cleaned = mild_pre_denoise(bgr)

    # Real-ESRGAN expects BGR ndarray; returns BGR
    sr_bgr, _ = upsampler.enhance(cleaned, outscale=4)
    sr_rgb = cv2.cvtColor(sr_bgr, cv2.COLOR_BGR2RGB)
    fitted = fit_to_4k(sr_rgb)
    polished = subtle_polish(fitted)

    stem = path.stem
    out_png = out_dir / f"{stem}_restored_4k.png"
    # PNG master, no JPEG recompression
    Image.fromarray(polished).save(out_png, format="PNG", optimize=True)

    # Also write a review JPEG (high quality) for quick preview in UI
    out_jpg = out_dir / f"{stem}_restored_4k_preview.jpg"
    Image.fromarray(polished).save(out_jpg, format="JPEG", quality=95, subsampling=0)

    elapsed = round(time.time() - t0, 1)
    meta = {
        "source": path.name,
        "output_png": out_png.name,
        "output_preview": out_jpg.name,
        "source_analysis": diagnostics,
        "output_size": [TARGET_W, TARGET_H],
        "seconds": elapsed,
    }
    print(json.dumps(meta), flush=True)
    return meta


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    ap.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    ap.add_argument("--tile", type=int, default=400, help="Tile size for CPU memory")
    ap.add_argument("--limit", type=int, default=0, help="Process only N images (0=all)")
    ap.add_argument("--only", type=str, default="", help="Comma-separated stems to process")
    args = ap.parse_args()

    if not WEIGHTS.is_file():
        print(f"Missing weights: {WEIGHTS}", file=sys.stderr)
        return 1

    args.output.mkdir(parents=True, exist_ok=True)
    files = sorted(args.input.glob("*.jpg")) + sorted(args.input.glob("*.jpeg")) + sorted(args.input.glob("*.png"))
    if args.only:
        stems = {s.strip() for s in args.only.split(",") if s.strip()}
        files = [f for f in files if f.stem in stems]
    if args.limit:
        files = files[: args.limit]

    print(f"Loading RealESRGAN_x4plus on CPU (tile={args.tile})…", flush=True)
    upsampler = build_upsampler(tile=args.tile)
    print(f"Processing {len(files)} image(s) → {args.output}", flush=True)

    results = []
    for i, path in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {path.name}", flush=True)
        results.append(restore_one(path, upsampler, args.output))

    summary = args.output / "restoration_report.json"
    summary.write_text(json.dumps(results, indent=2))
    print(f"Wrote {summary}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
