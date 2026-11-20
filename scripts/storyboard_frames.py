#!/usr/bin/env python3
"""Sheru Bhai - The Aviation Mission: build the 19 full-bleed 9:16 stills (1080x1920).

Frames 01-18 are the story frames embedded in the supplied storyboard PDF (540x960 each,
stored as near-lossless JPEG). They are extracted untouched, kept under
assets/storyboard-source/sheru-bhai/, and upscaled 2x to 1080x1920 with a
fidelity-preserving pipeline. Nothing is generated or invented:

  1. Lanczos 2x resample
  2. Iterative back-projection, so the result stays consistent with the source pixels
  3. Edge-aware, halo-limited luminance sharpening (chroma untouched)
  4. A whisper of deterministic luminance grain, which keeps dusk gradients free of banding

Frame 19 (the brand card) is vector in the PDF, so it is re-rendered natively at 1080x1920.

usage:
  python3 scripts/storyboard_frames.py <storyboard.pdf>             # all 19 frames
  python3 scripts/storyboard_frames.py <storyboard.pdf> --frame 6   # only frame 06

Needs: poppler-utils (pdfimages, pdftoppm, pdfinfo), opencv-python(-headless), numpy, pillow.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "assets" / "storyboard-source" / "sheru-bhai"
OUT_DIR = ROOT / "out" / "storyboard" / "sheru-bhai"

W, H = 1080, 1920          # delivery size, 9:16
SRC_W, SRC_H = 540, 960    # size of the frames embedded in the PDF
N_STORY = 18               # frames 01-18 are story frames, 19 is the brand card
CARD_PAGE = 7              # PDF page that holds the brand card (vector)
GRAIN = 0.8                # luminance grain, in 0-255 levels


# --------------------------------------------------------------------------- extraction
def extract_story_frames(pdf: Path) -> list[Path]:
    """Pull the embedded JPEGs out of the PDF byte-for-byte (page order = frame order)."""
    tmp = Path(tempfile.mkdtemp(prefix="sheru-frames-"))
    subprocess.run(["pdfimages", "-j", str(pdf), str(tmp / "raw")], check=True)
    files = sorted(tmp.glob("raw-*.jpg"))
    if len(files) != N_STORY:
        raise SystemExit(f"expected {N_STORY} embedded frames in the PDF, found {len(files)}")
    for f in files:
        with Image.open(f) as im:
            if im.size != (SRC_W, SRC_H):
                raise SystemExit(f"{f.name}: expected {SRC_W}x{SRC_H}, got {im.size[0]}x{im.size[1]}")
    SRC_DIR.mkdir(parents=True, exist_ok=True)
    kept = []
    for i, f in enumerate(files, 1):
        dst = SRC_DIR / f"frame-{i:02d}-{SRC_W}x{SRC_H}.jpg"
        dst.write_bytes(f.read_bytes())
        kept.append(dst)
    return kept


def render_card(pdf: Path, dst: Path) -> None:
    """Re-render the vector brand card natively at 1080x1920."""
    info = subprocess.run(
        ["pdfinfo", "-f", str(CARD_PAGE), "-l", str(CARD_PAGE), str(pdf)], capture_output=True, text=True, check=True
    ).stdout
    m = re.search(rf"Page\s+{CARD_PAGE}\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts", info)
    if not m or abs(float(m.group(1)) / float(m.group(2)) - 9 / 16) > 0.002:
        raise SystemExit(f"page {CARD_PAGE} is not a 9:16 page: {m.group(0) if m else info!r}")
    tmp = Path(tempfile.mkdtemp(prefix="sheru-card-"))
    subprocess.run(
        ["pdftoppm", "-f", str(CARD_PAGE), "-l", str(CARD_PAGE), "-png", "-scale-to-x", str(W), "-scale-to-y", str(H), str(pdf), str(tmp / "card")],
        check=True,
    )
    out = next(tmp.glob("card-*.png"))
    with Image.open(out) as im:
        im.convert("RGB").save(dst, optimize=True)


# --------------------------------------------------------------------------- upscaling
def lanczos2x(rgb: np.ndarray) -> np.ndarray:
    return cv2.resize(rgb, None, fx=2, fy=2, interpolation=cv2.INTER_LANCZOS4)


def back_project(lr: np.ndarray, hr: np.ndarray, iters: int = 5, lam: float = 0.9) -> np.ndarray:
    """Iterative back-projection: pull the HR estimate back onto the LR pixels it came from."""
    h, w = lr.shape[:2]
    for _ in range(iters):
        down = cv2.resize(hr, (w, h), interpolation=cv2.INTER_AREA)
        hr = hr + lam * cv2.resize(lr - down, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
    return hr


def sharpen_luma(rgb: np.ndarray, amount: float = 0.55, sigma: float = 0.85, knee: float = 3.0, halo: float = 5.0) -> np.ndarray:
    """Edge-aware luminance sharpening. Noise-level detail gets ~0 gain, real edges ~`amount`,
    and the result is clamped to the local min/max (+/-`halo`) so no halos can form."""
    ycc = cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.float32), cv2.COLOR_RGB2YCrCb)
    y = ycc[..., 0]
    high = y - cv2.GaussianBlur(y, (0, 0), sigma)
    mag = np.abs(high)
    gain = amount * mag**2 / (mag**2 + knee**2)
    out = y + gain * np.sign(high) * mag
    k = np.ones((3, 3), np.uint8)
    out = np.clip(out, cv2.erode(y, k) - halo, cv2.dilate(y, k) + halo)
    ycc[..., 0] = out
    return cv2.cvtColor(ycc, cv2.COLOR_YCrCb2RGB)


def upscale(lr_u8: np.ndarray, seed: int, grain: float = GRAIN) -> np.ndarray:
    lr = lr_u8.astype(np.float32)
    hr = sharpen_luma(back_project(lr, lanczos2x(lr)))
    if grain > 0:
        n = np.random.default_rng(seed).standard_normal(hr.shape[:2]).astype(np.float32)
        n = cv2.GaussianBlur(n, (0, 0), 0.55)
        n /= n.std() + 1e-6
        hr = hr + grain * n[..., None]
    return np.clip(hr + 0.5, 0, 255).astype(np.uint8)


def fidelity(lr_u8: np.ndarray, hr_u8: np.ndarray) -> dict:
    """How far the 2x result drifts from the source once shrunk back to 540x960."""
    back = cv2.resize(hr_u8, (SRC_W, SRC_H), interpolation=cv2.INTER_AREA).astype(np.float32)
    d = back - lr_u8.astype(np.float32)
    mse = float(np.mean(d**2))
    return {"mean_abs_diff": round(float(np.mean(np.abs(d))), 3), "psnr_db": round(10 * np.log10(255**2 / max(mse, 1e-9)), 2)}


# --------------------------------------------------------------------------- outputs
def contact_sheet(frames: list[Path], dst: Path) -> None:
    cols, tw, th, gap = 7, 216, 384, 8
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw + (cols + 1) * gap, rows * th + (rows + 1) * gap), (24, 22, 20))
    for i, f in enumerate(frames):
        with Image.open(f) as im:
            t = im.convert("RGB").resize((tw, th), Image.LANCZOS)
        d = ImageDraw.Draw(t)
        d.rectangle([0, 0, 30, 18], fill=(0, 0, 0))
        d.text((6, 3), f"{i + 1:02d}", fill=(255, 230, 120))
        sheet.paste(t, (gap + (i % cols) * (tw + gap), gap + (i // cols) * (th + gap)))
    sheet.save(dst, quality=92)


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", type=Path, help="Sheru Bhai expanded storyboard PDF")
    ap.add_argument("--frame", type=int, default=0, help="render only this frame number (1-19); default: all (FRAME = ALL)")
    args = ap.parse_args()
    if args.frame and not 1 <= args.frame <= N_STORY + 1:
        ap.error("--frame must be 1-19")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    wanted = [args.frame] if args.frame else list(range(1, N_STORY + 2))
    sources = extract_story_frames(args.pdf)
    manifest_path = OUT_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    for n in wanted:
        dst = OUT_DIR / f"frame-{n:02d}.png"
        if n <= N_STORY:
            lr = np.array(Image.open(sources[n - 1]).convert("RGB"))
            hr = upscale(lr, seed=n)
            Image.fromarray(hr).save(dst, optimize=True)
            entry = {"source": sources[n - 1].name, "method": "2x upscale (Lanczos + back-projection + halo-limited sharpen + grain)", **fidelity(lr, hr)}
        else:
            render_card(args.pdf, dst)
            entry = {"source": f"PDF page {CARD_PAGE} (vector)", "method": "native render at 1080x1920"}
        with Image.open(dst) as im:
            if im.size != (W, H):
                raise SystemExit(f"{dst.name}: expected {W}x{H}, got {im.size}")
            entry["size"] = list(im.size)
        entry["file"] = dst.name
        entry["bytes"] = dst.stat().st_size
        entry["sha256_16"] = sha256(dst)
        manifest[f"{n:02d}"] = entry
        print(json.dumps({n: entry}), flush=True)

    manifest = dict(sorted(manifest.items()))
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    all_frames = [OUT_DIR / f"frame-{i:02d}.png" for i in range(1, N_STORY + 2)]
    if all(f.exists() for f in all_frames):
        contact_sheet(all_frames, OUT_DIR / "contact-sheet.jpg")
    return 0


if __name__ == "__main__":
    sys.exit(main())
