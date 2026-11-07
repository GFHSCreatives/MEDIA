"""Turn "DIWALI CELEBRATION" into "DIWALI CELEBRATIONS" in the Gemini Diwali video.

The title is baked into the AI-generated footage, and it contains no S. The removed
"WISHES YOU A" line was set in the same gold typeface, so its S is lifted as a
*difference layer* (original frame − cleaned frame): glyph, bevel, glow and drop
shadow, without the background. It is then:
  • scaled to the title's cap height (46 px vs 30 px → ×1.533), tone-matched to the N,
  • placed after the N with the font's own spacing, on the title's baseline,
  • tracked to the title (which slowly scales/drifts as the camera eases back),
  • revealed by the same left-to-right light-streak wipe as the rest of the title.

usage: python3 scripts/add_letter_s.py <original.mp4> <cleaned.mp4> <out.mp4> [debug_dir]
"""
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

orig_p, clean_p, dst = sys.argv[1:4]
debug = Path(sys.argv[4]) if len(sys.argv) > 4 else None
W, H, FPS = 1280, 720, 24
COLOR_IN = "scale=in_color_matrix=bt601:in_range=tv:flags=accurate_rnd+full_chroma_int,format=bgr24"
COLOR_OUT = "scale=out_color_matrix=bt601:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p"


def dec(p):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", p, "-vf", COLOR_IN, "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3).copy()


orig = dec(orig_p)
clean = dec(clean_p)
N = len(clean)

# ---------------------------------------------------------------- the S sprite (difference layer)
SRC_F = 200
sx0, sy0, sx1, sy1 = 622, 349, 653, 397          # second S of "WISHES" incl. shadow (frame 200)
P = orig[SRC_F, sy0:sy1, sx0:sx1].astype(np.float32)
B = clean[SRC_F, sy0:sy1, sx0:sx1].astype(np.float32)
delta = P - B
d = np.abs(delta).max(2)
m = np.clip((d - 5) / 18, 0, 1)
# keep only the S itself: largest blob + its shadow halo, drop neighbours' edges
blob = (d > 12).astype(np.uint8)
n_lab, lab, stats, _ = cv2.connectedComponentsWithStats(blob)
main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
keep = cv2.dilate((lab == main).astype(np.uint8), np.ones((5, 5), np.uint8))
m *= keep
m[:, :3] = 0  # never carry the neighbouring E's serif
m = cv2.GaussianBlur(m, (0, 0), 0.6)
S_TOP, S_BOTTOM = 356 - sy0, 387 - sy0          # S glyph extent (with round overshoot)

SCALE = 46 / 30                                   # title cap height / WISHES cap height
dS = cv2.resize(delta, None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_LANCZOS4)
mS = np.clip(cv2.resize(m, None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_LINEAR), 0, 1)
# the title is set in a heavier weight than the small line: embolden the gold ~1 px,
# keep the cast shadow as is, then crisp the upscale (unsharp) to match the native title
pos = np.maximum(dS, 0)
neg = np.minimum(dS, 0)
pos = cv2.dilate(pos, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
dS = pos * 1.08 + neg
mS = cv2.dilate(mS, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
dS = dS + 0.35 * (dS - cv2.GaussianBlur(dS, (0, 0), 1.2))

# ---------------------------------------------------------------- tone match to the title's N (frame 239)
REF_F = 239
def gold_pixels(img, x0, y0, x1, y1):
    c = img[y0:y1, x0:x1]
    hsv = cv2.cvtColor(c, cv2.COLOR_BGR2HSV).astype(np.float32)
    bg = cv2.medianBlur(img, 41)[y0:y1, x0:x1]
    hb = cv2.cvtColor(bg, cv2.COLOR_BGR2HSV).astype(np.float32)
    return c[(hsv[..., 1] - hb[..., 1] > 30) & (hsv[..., 0] < 35)].astype(np.float32)

nG = gold_pixels(clean[REF_F], 950, 405, 994, 470)
sG = gold_pixels(orig[SRC_F], 626, 345, 644, 398)
gain = np.clip(nG.mean(0) / (sG.mean(0) + 1e-3), 0.8, 1.25) * 1.1  # deeper gold, like the title
print("tone gain BGR", np.round(gain, 3))

# ---------------------------------------------------------------- placement in frame-239 coordinates
N_RIGHT, BASELINE = 993, 461                      # title's N: right edge, flat-letter baseline
GAP = 7
# sprite pixel (col, row) of the S's left edge / baseline after scaling
cols = np.nonzero(mS.max(0) > 0.5)[0]
s_left = cols.min()
s_base = S_BOTTOM * SCALE - 1.5 * SCALE          # round letters overshoot the baseline slightly
place_x = N_RIGHT + GAP - s_left
place_y = BASELINE - s_base

# ---------------------------------------------------------------- track the title (scale + position)
gray = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32) for f in clean]
TX0, TY0, TX1, TY1 = 560, 404, 1000, 470          # "CELEBRATION" template at frame 239
tpl = gray[REF_F][TY0:TY1, TX0:TX1]
track = {}
for n in range(146, N):
    best = (-1, 1.0, (0, 0))
    for s in np.arange(0.98, 1.16, 0.0025):
        t = cv2.resize(tpl, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        r = cv2.matchTemplate(gray[n][340:540, 450:1150], t, cv2.TM_CCOEFF_NORMED)
        _, mx, _, loc = cv2.minMaxLoc(r)
        if mx > best[0]:
            best = (mx, s, (loc[0] + 450, loc[1] + 340))
    track[n] = best
good = [n for n in track if track[n][0] > 0.8]
ns = np.array(good, float)
fit_s = np.polyfit(ns, [track[n][1] for n in good], 2)
fit_x = np.polyfit(ns, [track[n][2][0] for n in good], 2)
fit_y = np.polyfit(ns, [track[n][2][1] for n in good], 2)
print("tracked", len(good), "frames; scale at 150/200/239:", [round(float(np.polyval(fit_s, n)), 4) for n in (150, 200, 239)])

def to_frame(n, x, y):
    s = float(np.polyval(fit_s, n))
    lx, ly = float(np.polyval(fit_x, n)), float(np.polyval(fit_y, n))
    lx239, ly239 = float(np.polyval(fit_x, REF_F)), float(np.polyval(fit_y, REF_F))
    s239 = float(np.polyval(fit_s, REF_F))
    # point in frame-239 coords -> template coords -> frame n
    u, v = (x - lx239) / s239, (y - ly239) / s239
    return lx + u * s, ly + v * s, s / s239

# ---------------------------------------------------------------- reveal timing (light-streak wipe)
def streak_head(n):
    return 820 + 35 * (n - 142)                    # measured from the original reveal; the S lands just after the N

# ---------------------------------------------------------------- composite
enc = subprocess.Popen(
    ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
     "-i", clean_p, "-map", "0:v", "-map", "1:a?", "-vf", COLOR_OUT, "-c:v", "libx264", "-crf", "12", "-preset", "slow",
     "-colorspace", "smpte170m", "-color_primaries", "bt709", "-color_trc", "iec61966-2-1", "-color_range", "tv",
     "-c:a", "copy", "-movflags", "+faststart", dst],
    stdin=subprocess.PIPE,
)
hS, wS = mS.shape
for n in range(N):
    f = clean[n]
    if n < 146:
        enc.stdin.write(f.tobytes())
        continue
    x, y, k = to_frame(n, place_x, place_y)
    M = np.float32([[k, 0, x], [0, k, y]])
    dW = cv2.warpAffine(dS * gain, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=0)
    mW = cv2.warpAffine(mS, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=0)
    # left-to-right reveal behind the streak head, soft 14 px edge
    xs = np.arange(W, dtype=np.float32)[None, :]
    reveal = np.clip((streak_head(n) - 8 - xs) / 14, 0, 1)
    a = (mW * reveal)[..., None]
    out = np.clip(f.astype(np.float32) + dW * a, 0, 255).astype(np.uint8)
    if debug is not None and n in (146, 147, 148, 150, 200, 239):
        debug.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(debug / f"s{n}.png"), np.vstack([f[380:500, 760:1100], out[380:500, 760:1100]]))
    enc.stdin.write(out.tobytes())
enc.stdin.close()
enc.wait()
print("wrote", dst)
