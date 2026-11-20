#!/usr/bin/env python3
"""Prepare the effect assets for the Sheru Bhai animatic (Remotion composition `SheruBhaiAnimatic`).

Everything is derived from the 19 stills in out/storyboard/sheru-bhai/ -- the frames themselves are
never altered. Effects are *additive* layers that use the frames' own pixels as their guide:

  public/sheru/frames/frame-NN.png   copies of the stills (git-ignored, re-created by this script)
  public/sheru/fx/gold-NN.png        soft alpha mask of the gold highlights (chains, embroidery, trim)
                                     -> a moving light band is revealed only on gold, so it glints
  public/sheru/fx/plane-18.png       RGBA cut-out of the climbing airliner in frame 18
  public/sheru/fx/plane-18-patch.png clean-sky patch that replaces the airliner once it moves
  src/sheru/fxdata/points.json       sparkle points (gold specular highlights), twinkle lights (bright small
                                     light sources) and the map markers, per frame, in 1080x1920 pixels
  src/sheru/fxdata/search-04.json    geometry + colours of the search bar in frame 04
  src/sheru/fxdata/plane-18.json     placement + heading of the airliner and its patch

usage: python3 scripts/sheru_fx_prep.py
Needs: opencv-python(-headless), numpy.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "out" / "storyboard" / "sheru-bhai"
PUB = ROOT / "public" / "sheru"
DATA = ROOT / "src" / "sheru" / "fxdata"   # small JSON, imported directly by the composition
W, H = 1080, 1920


def smoothstep(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def load(n: int) -> np.ndarray:
    bgr = cv2.imread(str(SRC / f"frame-{n:02d}.png"), cv2.IMREAD_COLOR)
    if bgr is None or bgr.shape[:2] != (H, W):
        raise SystemExit(f"frame-{n:02d}.png missing or not {W}x{H}")
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


def hsv01(rgb: np.ndarray):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    return hsv[..., 0] / 255.0 * 360.0, hsv[..., 1] / 255.0, hsv[..., 2] / 255.0


# --------------------------------------------------------------------------- gold + sparkles + lights
def gold_mask(rgb: np.ndarray) -> np.ndarray:
    """Specular gold only: bright, saturated, fine-structured gold (chains, embroidery, trim, lettering).
    Fur highlights are smooth and less saturated, so they fall outside this mask."""
    h, s, v = hsv01(rgb)
    hue = smoothstep(16, 24, h) * (1 - smoothstep(56, 66, h))
    m = hue * smoothstep(0.46, 0.62, s) * smoothstep(0.80, 0.93, v) * smoothstep(0.05, 0.16, tophat(v, 15))
    m = cv2.dilate(m, np.ones((3, 3), np.uint8))
    return cv2.GaussianBlur(m, (0, 0), 1.1)


def nms_points(score: np.ndarray, thresh: float, radius: int, limit: int, margin: int = 14):
    """Greedy non-max suppression over a score map -> [(x, y, score)] strongest first."""
    ys, xs = np.nonzero(score > thresh)
    if len(xs) == 0:
        return []
    order = np.argsort(-score[ys, xs])
    taken: list[tuple[int, int, float]] = []
    for i in order:
        x, y = int(xs[i]), int(ys[i])
        if x < margin or y < margin or x > W - margin or y > H - margin:
            continue
        if any((x - tx) ** 2 + (y - ty) ** 2 < radius**2 for tx, ty, _ in taken):
            continue
        taken.append((x, y, float(score[y, x])))
        if len(taken) >= limit:
            break
    return taken


def tophat(v: np.ndarray, size: int) -> np.ndarray:
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))
    return cv2.morphologyEx(v, cv2.MORPH_TOPHAT, k)


def sparkle_points(rgb: np.ndarray, gold: np.ndarray, limit: int = 26):
    """Small, very bright highlights sitting on gold: the places a real glint would catch the eye."""
    _, _, v = hsv01(rgb)
    th = tophat(v, 11)
    near_gold = cv2.dilate((gold > 0.2).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(np.float32)
    score = th * near_gold * smoothstep(0.82, 0.95, v)
    pts = nms_points(score, 0.16, 62, limit)
    return [[x, y, round(sc, 3)] for x, y, sc in pts]


def light_points(rgb: np.ndarray, limit: int = 70):
    """Tiny bright light sources (runway lights, windows, bokeh) that should twinkle."""
    h, s, v = hsv01(rgb)
    th = tophat(v, 13)
    score = th * smoothstep(0.80, 0.93, v)
    pts = nms_points(score, 0.12, 26, limit)
    out = []
    for x, y, sc in pts:
        out.append([x, y, round(sc, 3), round(float(h[y, x]), 1), round(float(s[y, x]), 2)])
    return out


# --------------------------------------------------------------------------- frame 04: search bar
def search_bar(rgb: np.ndarray) -> dict:
    bar = {"x0": 250, "y0": 568, "x1": 895, "y1": 645}  # measured on the 1080x1920 frame
    inner = rgb[596:618, 420:700].reshape(-1, 3).mean(0)
    ink = rgb[585:630, 285:333].reshape(-1, 3)
    ink = ink[ink.sum(1) < ink.sum(1).min() + 120].mean(0)  # darkest pixels of the magnifier = UI ink colour
    # the cursor drawn in the frame sits at x~368; remember its box so the animatic can cover it
    return {
        "bar": bar,
        "cursor": {"x0": 360, "y0": 578, "x1": 378, "y1": 632},
        "textX": 372,
        "baseline": 617,
        "fontPx": 33,
        "fill": "#%02x%02x%02x" % tuple(int(round(c)) for c in inner),
        "ink": "#%02x%02x%02x" % tuple(int(round(c)) for c in ink),
    }


# --------------------------------------------------------------------------- frame 18: climbing airliner
PLANE_BOX = (470, 235, 1075, 520)  # x0, y0, x1, y1 around the airliner + contrail


def fit_sky(rgb: np.ndarray, sky: np.ndarray) -> np.ndarray:
    """Smooth sky model (2nd-order polynomial per channel) fitted on pixels flagged as sky."""
    x0, y0, x1, y1 = PLANE_BOX
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    u, w = (xx - x0) / (x1 - x0), (yy - y0) / (y1 - y0)
    A = np.stack([np.ones_like(u), u, w, u * u, u * w, w * w], -1)
    sel = sky.reshape(-1)
    model = np.zeros(rgb[y0:y1, x0:x1].shape, np.float32)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A.reshape(-1, 6)[sel], rgb[y0:y1, x0:x1, c].reshape(-1)[sel].astype(np.float32), rcond=None)
        model[..., c] = A @ coef
    return model


def extract_plane(rgb: np.ndarray, out_dir: Path) -> dict:
    x0, y0, x1, y1 = PLANE_BOX
    crop = rgb[y0:y1, x0:x1].astype(np.float32)
    ch, cw = crop.shape[:2]
    ring = np.zeros((ch, cw), bool)
    ring[:18, :] = ring[-18:, :] = ring[:, :18] = ring[:, -18:] = True
    sky = ring.copy()
    model = fit_sky(rgb, sky)
    for _ in range(3):  # re-fit on everything that already looks like sky
        diff = np.abs(crop - model).max(2)
        sky = diff < 9
        model = fit_sky(rgb, sky)
    diff = np.abs(crop - model).max(2)
    body = (diff > 16).astype(np.uint8)
    # the faint contrail trailing the tail stays in the scene; only the airframe is lifted out
    cx, cy = 600 - x0, 462 - y0
    yy, xx = np.mgrid[0:ch, 0:cw]
    body[(yy > cy + (cx - xx) * 0.22)] = 0
    n, lab, stats, _ = cv2.connectedComponentsWithStats(body)
    main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    body = (lab == main).astype(np.uint8)
    body = cv2.morphologyEx(body, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    # soft alpha from the difference to the sky, only around the airframe
    near = cv2.dilate(body, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))).astype(np.float32)
    alpha = np.clip((diff - 6) / 24, 0, 1) * near
    alpha = np.maximum(alpha, cv2.GaussianBlur(body.astype(np.float32), (0, 0), 1.0) * 0.98)
    alpha = np.clip(cv2.GaussianBlur(alpha, (0, 0), 0.7), 0, 1)
    # foreground colour with the sky contribution removed from the soft edge
    a3 = np.maximum(alpha, 0.2)[..., None]
    fg = np.clip(model + (crop - model) / a3, 0, 255)
    fg = np.where(alpha[..., None] > 0.2, fg, crop)
    sprite = np.dstack([fg, alpha * 255]).astype(np.uint8)
    cv2.imwrite(str(out_dir / "plane-18.png"), cv2.cvtColor(sprite, cv2.COLOR_RGBA2BGRA))

    # clean-sky patch that hides the original airframe once the sprite has moved on
    grow = cv2.dilate(body, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21))).astype(np.float32)
    patch_a = np.clip(cv2.GaussianBlur(grow, (0, 0), 3.0) * 1.15, 0, 1)
    rng = np.random.default_rng(18)
    grain = cv2.GaussianBlur(rng.standard_normal((ch, cw)).astype(np.float32), (0, 0), 0.55)
    grain = grain / (grain.std() + 1e-6) * 0.8
    patch = np.clip(model + grain[..., None], 0, 255)
    patch_rgba = np.dstack([patch, patch_a * 255]).astype(np.uint8)
    cv2.imwrite(str(out_dir / "plane-18-patch.png"), cv2.cvtColor(patch_rgba, cv2.COLOR_RGBA2BGRA))

    ys, xs = np.nonzero(body)
    nose = max(zip(xs, ys), key=lambda p: p[0] * 1.0 - p[1] * 0.2)
    tail = min(zip(xs, ys), key=lambda p: p[0] * 1.0 + p[1] * 0.2)
    ang = float(np.degrees(np.arctan2(nose[1] - tail[1], nose[0] - tail[0])))
    return {
        "box": [x0, y0, x1, y1],
        "nose": [int(nose[0] + x0), int(nose[1] + y0)],
        "tail": [int(tail[0] + x0), int(tail[1] + y0)],
        "headingDeg": round(ang, 2),
        "center": [int(xs.mean() + x0), int(ys.mean() + y0)],
        "bodyPixels": int(body.sum()),
    }


# --------------------------------------------------------------------------- map markers (frames 07-09)
# hand-placed approximations (read off the stills), each refined to the true brightness peak
MARKERS_APPROX = {
    7: {"markers": [(240, 1071), (450, 1191), (735, 1050)], "origin": (480, 1020), "radius": 38},
    8: {"markers": [(147, 1113), (423, 1353), (867, 1065)], "origin": (468, 990), "radius": 52},
    9: {"markers": [(201, 1593), (765, 1590), (435, 1761)], "origin": (201, 1593), "radius": 42},
}


def refine_markers(rgb: np.ndarray, spec: dict) -> dict:
    _, _, v = hsv01(rgb)
    soft = cv2.GaussianBlur(v, (0, 0), 6)
    out = []
    for x, y in spec["markers"]:
        x0, x1, y0, y1 = max(0, x - 45), min(W, x + 46), max(0, y - 45), min(H, y + 46)
        win = soft[y0:y1, x0:x1]
        iy, ix = np.unravel_index(int(np.argmax(win)), win.shape)
        out.append([int(x0 + ix), int(y0 + iy)])
    return {"markers": out, "origin": list(spec["origin"]), "radius": spec["radius"]}


# --------------------------------------------------------------------------- main
# Regions where no glint band or sparkle may ever appear (x0, y0, x1, y1): the school sign in frame 17
# must stay perfectly legible -- it has to read exactly GLOBAL SCHOOL OF AVIATION.
KEEP_CLEAR = {17: [(90, 30, 990, 410)]}

GOLD_FRAMES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
LIGHT_FRAMES = [10, 11, 13, 14, 15, 16]


def main() -> None:
    (PUB / "frames").mkdir(parents=True, exist_ok=True)
    (PUB / "fx").mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)
    for n in range(1, 20):
        dst = PUB / "frames" / f"frame-{n:02d}.png"
        if not dst.exists() or dst.stat().st_size != (SRC / f"frame-{n:02d}.png").stat().st_size:
            shutil.copyfile(SRC / f"frame-{n:02d}.png", dst)

    points: dict[str, dict] = {}
    for n in range(1, 19):
        rgb = load(n)
        gold = gold_mask(rgb)
        for x0, y0, x1, y1 in KEEP_CLEAR.get(n, []):
            gold[y0:y1, x0:x1] = 0
        entry: dict = {}
        if n in GOLD_FRAMES:
            small = cv2.resize(gold, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
            a = np.clip(small * 255, 0, 255).astype(np.uint8)
            rgba = np.dstack([np.full_like(a, 255), np.full_like(a, 255), np.full_like(a, 255), a])
            cv2.imwrite(str(PUB / "fx" / f"gold-{n:02d}.png"), cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
            entry["sparkles"] = [
                p for p in sparkle_points(rgb, gold, limit=40)
                if not any(x0 - 30 <= p[0] <= x1 + 30 and y0 - 30 <= p[1] <= y1 + 30 for x0, y0, x1, y1 in KEEP_CLEAR.get(n, []))
            ][:26]
        if n in LIGHT_FRAMES:
            entry["lights"] = light_points(rgb)
        points[f"{n:02d}"] = entry
        print(f"frame {n:02d}: gold-coverage {float((gold > 0.3).mean()) * 100:4.1f}%  sparkles {len(entry.get('sparkles', [])):2d}  lights {len(entry.get('lights', [])):2d}", flush=True)

    for n, spec in MARKERS_APPROX.items():
        points[f"{n:02d}"]["map"] = refine_markers(load(n), spec)
        print(f"frame {n:02d}: markers", points[f"{n:02d}"]["map"]["markers"], flush=True)

    (DATA / "search-04.json").write_text(json.dumps(search_bar(load(4)), indent=1))
    plane = extract_plane(load(18), PUB / "fx")
    (DATA / "plane-18.json").write_text(json.dumps(plane, indent=1))
    points["18"]["plane"] = plane
    (DATA / "points.json").write_text(json.dumps(points))
    print("plane:", plane)


if __name__ == "__main__":
    main()
