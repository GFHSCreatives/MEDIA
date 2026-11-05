"""Sample particle target points from the official logo for the Diwali particle-convergence reveal.

Writes src/diwali/logoPoints.json: {"pts": [[x, y, layer], ...]} in artwork pixel space.
layer: 0 = arc (orange), 1 = wordmark, 2 = tagline, 3 = ®.
Deterministic (fixed seed).
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
arr = np.asarray(Image.open(ROOT / "assets/global-logo-original.png").convert("RGBA")).astype(float)
r, g, b, a = (arr[..., i] for i in range(4))
ink = (a > 128) & ((r + g + b) / 3 < 140)
orange = (a > 128) & (r - b > 80)
rng = np.random.default_rng(8)
H, W = a.shape


def take(mask, n, layer):
    ys, xs = np.nonzero(mask)
    idx = rng.choice(len(xs), size=min(n, len(xs)), replace=False)
    return [[float(xs[i] + rng.random()), float(ys[i] + rng.random()), layer] for i in idx]


word = ink.copy(); word[:430] = 0; word[760:] = 0
tag = ink.copy(); tag[:760] = 0
reg = ink.copy(); reg[420:] = 0
pts = take(orange, 900, 0) + take(word, 2600, 1) + take(tag, 900, 2) + take(reg, 120, 3)
rng.shuffle(pts)
out = ROOT / "src/diwali/logoPoints.json"
out.write_text(json.dumps({"pts": [[round(x, 1), round(y, 1), l] for x, y, l in pts]}))
print("wrote", out, len(pts), "points")
