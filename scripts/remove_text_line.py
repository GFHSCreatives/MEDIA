"""Remove the "WISHES YOU A" line from the Gemini Diwali video by clean-plate reconstruction.

1. Track the camera (affine, frame-to-frame ECC on the backdrop, text/floor masked out).
2. Build a clean plate of the mandala backdrop: align frames before the text appears to a
   reference frame and take the per-pixel median (removes passing streaks and sparkles).
3. For every frame where the line is visible, warp the plate into that frame, colour-match it,
   and replace only the pixels that differ from the plate (glyphs + shadow) inside the line's
   region, with a feathered matte. Everything else in the frame is untouched.

usage: python3 scripts/remove_text_line.py <in.mp4> <out.mp4> [debug_dir]
"""
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
debug = Path(sys.argv[3]) if len(sys.argv) > 3 else None

# Decode/encode through ffmpeg with the SAME explicit colour conversion (source is BT.601,
# limited range) so untouched pixels round-trip without any colour shift.
COLOR_IN = "scale=in_color_matrix=bt601:in_range=tv:flags=accurate_rnd+full_chroma_int,format=bgr24"
COLOR_OUT = "scale=out_color_matrix=bt601:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p"
cap = cv2.VideoCapture(src)
W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps = cap.get(cv2.CAP_PROP_FPS)
cap.release()
raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", src, "-vf", COLOR_IN, "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
frames = list(np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3).copy())
N = len(frames)
print(N, "frames", W, "x", H, fps, "fps")

TEXT_START = 123          # first frame the line can appear (it animates in from 124)
REF = 123                 # plate reference frame
PLATE_FRAMES = list(range(40, 124, 2))
# the "WISHES YOU A" line in frame 200 (generous box incl. drop shadow)
LINE_BOX = (466, 340, 822, 408)  # x0, y0, x1, y1 — screen space, incl. drop shadow

# ---------------------------------------------------------------- camera tracking
# Backdrop motion is a slow push/drift. Each frame is matched DIRECTLY to the reference
# (ORB features on the side ornaments, RANSAC similarity) — no chaining, so no drift —
# then the parameters are smoothed over time with a low-order polynomial.
gray = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in frames]
side = np.zeros((H, W), np.uint8)
side[20:520, 0:300] = 255
side[20:520, 980:W] = 255
orb = cv2.ORB_create(3000)
bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
kr, dr = orb.detectAndCompute(gray[REF], side)
raw = {}
for n in range(30, N):
    k, d = orb.detectAndCompute(gray[n], side)
    if d is None:
        continue
    m = sorted(bf.match(dr, d), key=lambda x: x.distance)[:400]
    A = np.float32([kr[x.queryIdx].pt for x in m])
    B = np.float32([k[x.trainIdx].pt for x in m])
    M, inl = cv2.estimateAffinePartial2D(A, B, method=cv2.RANSAC, ransacReprojThreshold=2.0)
    if M is None or inl.sum() < 20:
        continue
    sc = float(np.hypot(M[0, 0], M[1, 0]))
    raw[n] = (sc, float(M[0, 2]), float(M[1, 2]))
ns = np.array(sorted(raw))
P = np.array([raw[n] for n in ns])
# reject outliers against a robust polynomial fit, then refit
def fit(ns, P):
    return [np.polyfit(ns, P[:, i], 3) for i in range(3)]
# frames that get patched: smooth fit over the text section only, anchored at REF (= identity)
late = ns >= REF - 20
coef = fit(ns[late], P[late])
res = np.abs(np.stack([np.polyval(coef[i], ns[late]) for i in range(3)], 1) - P[late])
ok = (res[:, 0] < 0.008) & (res[:, 1] < 5) & (res[:, 2] < 5)
w = np.where(ns[late][ok] == REF, 50.0, 1.0)  # pin the reference frame
coef = [np.polyfit(ns[late][ok], P[late][ok][:, i], 3, w=w) for i in range(3)]
print("tracking: late fit on", ok.sum(), "frames")

def T_of(n):
    if n < REF - 20:
        sc, tx, ty = raw.get(n, (1.0, 0.0, 0.0))
    else:
        sc, tx, ty = (float(np.polyval(c, n)) for c in coef)
    return np.array([[sc, 0, tx], [0, sc, ty], [0, 0, 1.0]])

T = {n: T_of(n) for n in range(N)}
# plate frames: direct measurements only, rejecting implausible jumps
keep = np.array([abs(raw[n][2]) < 40 and abs(raw[n][1]) < 40 for n in ns])
for n in (40, 123, 160, 200, 239):
    print("T", n, np.round(T[n][:2], 4).tolist())

# ---------------------------------------------------------------- clean plate in REF coords
warped = []
kept = set(ns[keep].tolist())
for n in [p for p in PLATE_FRAMES if p in kept]:
    # sample frame n at T[n](x) for every REF pixel x
    warped.append(cv2.warpAffine(frames[n], T[n][:2], (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REFLECT))
stack = np.stack(warped).astype(np.float32)
# sparkles/streaks are brighter than the backdrop: a low percentile beats the median here
plate = np.percentile(stack, 30, axis=0).astype(np.float32)
print("plate from", len(warped), "frames")
if debug:
    debug.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(debug / "plate.png"), plate.astype(np.uint8))

# the line is locked to the screen (measured at frames 150, 200 and 239)
x0, y0, x1, y1 = LINE_BOX

# ---------------------------------------------------------------- per-frame replacement
enc = subprocess.Popen(
    ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
     "-i", src, "-map", "0:v", "-map", "1:a?", "-vf", COLOR_OUT, "-c:v", "libx264", "-crf", "12", "-preset", "slow",
     "-colorspace", "smpte170m", "-color_primaries", "bt709", "-color_trc", "iec61966-2-1", "-color_range", "tv",
     "-c:a", "copy", "-movflags", "+faststart", dst],
    stdin=subprocess.PIPE,
)
kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
for n, f in enumerate(frames):
    if n < TEXT_START:
        enc.stdin.write(f.tobytes())
        continue
    pl = cv2.warpAffine(plate, T[n][:2], (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    box = np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], np.int32)
    region = np.zeros((H, W), np.uint8)
    cv2.fillConvexPoly(region, box, 255)
    ring = cv2.dilate(region, np.ones((25, 25), np.uint8)) & ~region
    fl = f.astype(np.float32)
    # --- tight matte: gold glyphs + their drop shadow only ----------------------------
    # glyph strokes are thin, so a wide median approximates the local backdrop
    bx0, by0, bx1, by1 = x0 - 30, y0 - 30, x1 + 30, y1 + 30
    crop = f[by0:by1, bx0:bx1]
    bg = cv2.medianBlur(crop, 31).astype(np.float32)
    c = crop.astype(np.float32)
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV).astype(np.float32)
    lum_d = c.mean(2) - bg.mean(2)
    sat_d = hsv[..., 1] - cv2.cvtColor(bg.astype(np.uint8), cv2.COLOR_BGR2HSV)[..., 1].astype(np.float32)
    glyph = ((sat_d > 22) | (lum_d > 18) | (lum_d < -14)).astype(np.uint8) * 255
    gm = np.zeros((H, W), np.uint8)
    gm[by0:by1, bx0:bx1] = glyph
    gm &= region
    gm = cv2.morphologyEx(gm, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    # grow to cover anti-aliasing, glow and the shadow cast down-right
    gm = cv2.dilate(gm, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    shadow = np.zeros_like(gm)
    shadow[3:, 3:] = gm[:-3, :-3]
    gm = cv2.dilate(gm | shadow, np.ones((3, 3), np.uint8))

    # --- fill = smooth tone from THIS frame (inpainted) + mandala line detail from the plate
    # Low frequencies come from the current frame, so glow/tone always match; only the fine
    # line work is borrowed from the clean plate, scaled to how strong it is in this frame.
    cm = gm[by0:by1, bx0:bx1]
    base_c = cv2.inpaint(crop, cm, 9, cv2.INPAINT_TELEA).astype(np.float32)
    base_c = cv2.GaussianBlur(base_c, (0, 0), 3.0) * (cm[..., None] > 0) + base_c * (cm[..., None] == 0)
    plc = pl[by0:by1, bx0:bx1]
    det_p = plc - cv2.GaussianBlur(plc, (0, 0), 5)
    det_f = c - cv2.GaussianBlur(c, (0, 0), 5)
    ringc = (ring[by0:by1, bx0:bx1] > 0) | ((region[by0:by1, bx0:bx1] > 0) & (cm == 0))
    k = float(np.clip(det_f[ringc].std() / (det_p[ringc].std() + 1e-3), 0.0, 1.15))
    fill = fl.copy()
    fill[by0:by1, bx0:bx1] = base_c + k * det_p
    a = cv2.GaussianBlur(gm.astype(np.float32) / 255.0, (0, 0), 1.6)[..., None]
    out = np.clip(fl * (1 - a) + fill * a, 0, 255).astype(np.uint8)
    m = gm
    if debug and n in (126, 132, 150, 200, 239):
        cv2.imwrite(str(debug / f"m{n}.png"), m)
        cv2.imwrite(str(debug / f"cmp{n}.png"), np.vstack([f[by0:by1, bx0:bx1], out[by0:by1, bx0:bx1]]))
    enc.stdin.write(out.tobytes())
enc.stdin.close()
enc.wait()
print("wrote", dst)
