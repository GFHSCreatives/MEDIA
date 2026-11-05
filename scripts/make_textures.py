"""Procedural cloud-puff atlas for the volumetric cloud billboards.

public/textures/cloud-atlas.png : 2x2 atlas, 512px cells.
  R = baked top-down sun light (self-shadowed by cumulative density)
  G = edge/rim factor (thin density -> bright silver lining)
  A = density
Deterministic (fixed seeds) so renders are reproducible.
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, zoom

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "textures" / "cloud-atlas.png"
N = 512


def fbm(rng, n, octaves=6):
    out = np.zeros((n, n))
    amp, total = 1.0, 0.0
    for o in range(octaves):
        res = 4 * 2 ** o
        g = rng.random((res + 3, res + 3))
        up = zoom(g, (n + 3 * n / res) / (res + 3), order=3)[:n, :n]
        out += amp * up
        total += amp
        amp *= 0.5
    return out / total


def puff(seed):
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:N, 0:N] / (N - 1) * 2 - 1
    # cumulus silhouette: union of a few soft blobs, flatter base
    shape = np.zeros((N, N))
    blobs = [(0, 0.1, 0.78)] + [
        (rng.uniform(-0.5, 0.5), rng.uniform(-0.4, 0.2), rng.uniform(0.32, 0.5)) for _ in range(7)
    ]
    for bx, by, br in blobs:
        d = np.sqrt((x - bx) ** 2 + ((y - by) * 1.1) ** 2) / br
        shape = np.maximum(shape, np.clip(1 - d, 0, 1))
    base = np.clip((0.7 - y) / 0.3, 0, 1)  # flatten underside
    shape *= base
    n = fbm(rng, N)
    n2 = fbm(rng, N, 7)
    dens = np.clip(shape * 1.7 + (n - 0.5) * 1.1 + (n2 - 0.5) * 0.9 - 0.25, 0, 1)
    dens = gaussian_filter(dens, 0.8)
    edge = np.clip(1 - np.maximum(np.abs(x), np.abs(y)) * 1.0, 0, 1) ** 0.3  # keep away from cell border
    dens *= np.clip((0.98 - np.sqrt(x ** 2 + y ** 2)) / 0.15, 0, 1) * edge
    # light: sun from above-front, attenuated by density accumulated from the top
    acc = np.cumsum(dens, axis=0) / N * 9.0
    light = np.exp(-acc * 2.2) * (0.75 + 0.5 * (n2 - 0.5))
    light = gaussian_filter(light, 2.0)
    light = 0.18 + 0.82 * light
    rim = np.clip(1 - dens * 2.2, 0, 1) * (dens > 0.01)
    return light, rim, dens


atlas = np.zeros((N * 2, N * 2, 4))
for i in range(4):
    l, r, d = puff(11 + i * 7)
    cy, cx = divmod(i, 2)
    atlas[cy * N:(cy + 1) * N, cx * N:(cx + 1) * N] = np.stack([l, r, np.zeros_like(l), d], -1)
OUT.parent.mkdir(parents=True, exist_ok=True)
Image.fromarray((np.clip(atlas, 0, 1) * 255).astype(np.uint8), "RGBA").save(OUT, optimize=True)

# small radial glow sprite for nav/strobe lights
y, x = np.mgrid[0:128, 0:128] / 127 * 2 - 1
r = np.sqrt(x ** 2 + y ** 2)
g = np.clip(np.exp(-r * r * 9) + 0.35 * np.exp(-r * 3.5), 0, 1) * np.clip(1 - r, 0, 1)
Image.fromarray((np.stack([np.ones_like(g)] * 3 + [g], -1) * 255).astype(np.uint8), "RGBA").save(
    OUT.parent / "glow.png"
)
print("wrote", OUT)
