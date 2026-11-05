"""Trace the official GLOBAL logo (assets/global-logo-original.png) into clean vector layers.

Outputs src/logoPaths.ts with:
  ARC          orange horizon arc, fitted analytically (smooth edges at any resolution)
  ARC_STOPS    gradient stops sampled from the artwork
  ARC_CENTERLINE  [x, y, thickness] samples (drives the jet's flight path + reveal)
  LETTERS      G L O B A L, one traced path each
  TAGLINE      "GHA & School of Aviation", one traced path per glyph
  REG          the ® mark
  INK          sampled charcoal ink colour
Coordinates are in the artwork's own pixel space (LOGO_VIEWBOX).
"""
import json
from pathlib import Path

import numpy as np
import potrace
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "global-logo-original.png"
OUT = ROOT / "src" / "logoPaths.ts"
UP = 3  # supersample factor before tracing

im = Image.open(SRC).convert("RGBA")
W, H = im.size
arr = np.asarray(im).astype(float)
r, g, b, a = (arr[..., i] for i in range(4))
alpha = a / 255.0

orange_cov = np.clip((r - b - 40) / 80.0, 0, 1) * alpha
lum = (r + g + b) / 3.0
dark_cov = np.clip((200 - lum) / 150.0, 0, 1) * alpha * (orange_cov < 0.2)


def row_bands(mask, min_gap=12):
    rows = mask.any(1)
    bands, start, gap = [], None, 0
    for y, c in enumerate(rows):
        if c:
            if start is None:
                start = y
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                bands.append((start, y - gap)); start = None; gap = 0
    if start is not None:
        bands.append((start, len(rows) - 1))
    return bands


def col_runs(mask, min_gap=1, min_w=3):
    cols = mask.any(0)
    runs, start, gap = [], None, 0
    for x, c in enumerate(cols):
        if c:
            if start is None:
                start = x
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                runs.append((start, x - gap)); start = None; gap = 0
    if start is not None:
        runs.append((start, len(cols) - 1))
    return [rr for rr in runs if rr[1] - rr[0] + 1 >= min_w]


def trace_region(cov, x0, x1, y0, y1, pad=4):
    m = np.zeros_like(cov)
    ys, ye = max(0, y0 - pad), min(H, y1 + pad + 1)
    xs, xe = max(0, x0 - pad), min(W, x1 + pad + 1)
    m[ys:ye, xs:xe] = cov[ys:ye, xs:xe]
    img = Image.fromarray((m * 255).astype(np.uint8))
    img = img.resize((W * UP, H * UP), Image.BICUBIC).filter(ImageFilter.GaussianBlur(UP * 0.7))
    # potracer inverts its input (treats True as background), so pass the background mask
    bm = potrace.Bitmap(np.asarray(img) <= 127)
    plist = bm.trace(turdsize=6 * UP * UP, alphamax=1.0, opticurve=True, opttolerance=0.2)
    d, s = [], 1.0 / UP
    for curve in plist:
        st = curve.start_point
        d.append(f"M{st.x*s:.1f} {st.y*s:.1f}")
        for seg in curve.segments:
            if seg.is_corner:
                d.append(f"L{seg.c.x*s:.1f} {seg.c.y*s:.1f}L{seg.end_point.x*s:.1f} {seg.end_point.y*s:.1f}")
            else:
                d.append(f"C{seg.c1.x*s:.1f} {seg.c1.y*s:.1f} {seg.c2.x*s:.1f} {seg.c2.y*s:.1f} {seg.end_point.x*s:.1f} {seg.end_point.y*s:.1f}")
        d.append("Z")
    return "".join(d)


def fit_arc(cov):
    """Per-column centroid + thickness, fitted with smooth polynomials."""
    xs, cs, ts = [], [], []
    yy = np.arange(H)
    for x in range(W):
        col = cov[:, x]
        t = col.sum()
        if t > 0.6:
            xs.append(x + 0.5); cs.append((col * yy).sum() / t + 0.5); ts.append(t)
    xs, cs, ts = map(np.array, (xs, cs, ts))
    x0, x1 = xs.min() - 1.0, xs.max() + 1.0
    u = (xs - x0) / (x1 - x0)
    pc = np.polyfit(u, cs, 4)
    base = np.sin(np.pi * u) ** 0.85
    pt = np.polyfit(u, ts / np.maximum(base, 1e-3), 3, w=base ** 2)
    uu = np.linspace(0, 1, 200)
    c = np.polyval(pc, uu)
    t = (np.sin(np.pi * uu) ** 0.85) * np.polyval(pt, uu)
    X = x0 + uu * (x1 - x0)
    top = [(X[i], c[i] - t[i] / 2) for i in range(len(uu))]
    bot = [(X[i], c[i] + t[i] / 2) for i in range(len(uu))][::-1]
    d = "M" + "L".join(f"{px:.2f} {py:.2f}" for px, py in top + bot[1:-1]) + "Z"
    center = [[round(float(X[i]), 2), round(float(c[i]), 2), round(float(t[i]), 2)] for i in range(0, len(uu), 5)]
    return d, center, (float(x0), float(x1), float((c - t / 2).min()), float((c + t / 2).max()))


arc_d, arc_center, (ax0, ax1, ay0, ay1) = fit_arc(orange_cov)

stops = []
for t in np.linspace(0, 1, 9):
    x = int(ax0 + 6 + t * (ax1 - ax0 - 12))
    c = orange_cov[:, x]
    col = np.nonzero(c >= 0.9 * c.max())[0]
    px = arr[col, x, :3].mean(0)
    stops.append({"offset": round(float(t), 3), "color": "#%02x%02x%02x" % tuple(int(v) for v in px)})
stops[0]["color"], stops[-1]["color"] = stops[1]["color"], stops[-2]["color"]

ink_mask = dark_cov > 0.5
bands = row_bands(ink_mask)
# bands: [arc-region (®), wordmark, tagline]
bands = [bb for bb in bands if bb[1] - bb[0] > 20]
assert len(bands) == 3, bands
reg_band, word_band, tag_band = bands

# ® — the dark blob in the arc band, right of the arc's peak
reg_mask = ink_mask.copy(); reg_mask[: reg_band[0]] = 0; reg_mask[reg_band[1] + 1:] = 0
reg_runs = col_runs(reg_mask, min_gap=8)
rx0, rx1 = reg_runs[-1]
rys = np.nonzero(reg_mask[:, rx0:rx1 + 1].any(1))[0]
reg = {"d": trace_region(dark_cov, rx0, rx1, int(rys.min()), int(rys.max())),
       "x0": rx0, "x1": rx1, "y0": int(rys.min()), "y1": int(rys.max())}

def glyphs(band, names=None, min_gap=1):
    m = ink_mask.copy(); m[: band[0]] = 0; m[band[1] + 1:] = 0
    out = []
    for x0, x1 in col_runs(m, min_gap=min_gap):
        ys = np.nonzero(m[:, x0:x1 + 1].any(1))[0]
        out.append({"d": trace_region(dark_cov, x0, x1, band[0], band[1]), "x0": x0, "x1": x1, "y0": int(ys.min()), "y1": int(ys.max())})
    if names:
        assert len(out) == len(names), (len(out), names)
        for o, n in zip(out, names):
            o["char"] = n
    return out

letters = glyphs(word_band, ["G", "L", "O", "B", "A", "L"], min_gap=8)
tagline = glyphs(tag_band, min_gap=2)

ink = arr[ink_mask & (alpha > 0.99)][:, :3].mean(0)
INK = "#%02x%02x%02x" % tuple(int(round(v)) for v in ink)

rm = ink_mask.copy(); rm[:, :rx0] = 0; rm[:, rx1 + 1:] = 0; rm[: reg["y0"]] = 0; rm[reg["y1"] + 1:] = 0
reg_ink = arr[rm & (alpha > 0.99) & (lum < 60)][:, :3].mean(0)
REG_INK = "#%02x%02x%02x" % tuple(int(round(v)) for v in reg_ink)

ys_all, xs_all = np.nonzero(ink_mask | (orange_cov > 0.5))
bounds = {"x0": int(xs_all.min()), "x1": int(xs_all.max()), "y0": int(ys_all.min()), "y1": int(ys_all.max())}

ts = f"""// AUTO-GENERATED by scripts/vectorize_logo.py from assets/global-logo-original.png
// Do not edit by hand. Coordinates are in the original {W}x{H} artwork space.
export const LOGO_VIEWBOX = {{ width: {W}, height: {H} }};
/** tight bounds of all artwork (arc + wordmark + tagline + ®) */
export const LOGO_BOUNDS = {json.dumps(bounds)};
export const ARC_PATH = {json.dumps(arc_d)};
export const ARC_BOUNDS = {{ x0: {ax0:.1f}, x1: {ax1:.1f}, y0: {ay0:.1f}, y1: {ay1:.1f} }};
export const ARC_STOPS: {{ offset: number; color: string }}[] = {json.dumps(stops)};
/** [x, y, thickness] samples along the arc's centre line (flight path & reveal) */
export const ARC_CENTERLINE: [number, number, number][] = {json.dumps(arc_center)};
type Glyph = {{ d: string; x0: number; x1: number; y0: number; y1: number }};
export const LETTERS: (Glyph & {{ char: string }})[] = {json.dumps(letters)};
/** "GHA & School of Aviation" — one entry per glyph, left to right */
export const TAGLINE: Glyph[] = {json.dumps(tagline)};
export const REG: Glyph = {json.dumps(reg)};
export const INK = "{INK}";
export const REG_INK = "{REG_INK}";
"""
OUT.write_text(ts)
print("bands", bands, "ink", INK, "reg ink", REG_INK, "bounds", bounds)
print("arc", ax0, ax1, ay0, ay1, "reg", (rx0, rx1, reg["y0"], reg["y1"]))
print("letters", [(l["char"], l["x0"], l["x1"], l["y0"], l["y1"]) for l in letters])
print("tagline glyphs", len(tagline), [(t["x0"], t["x1"]) for t in tagline])
print(stops)
