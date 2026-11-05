"""Original score + sound design for the Global School of Aviation Diwali reel.

Synthesised from scratch (no samples). Tempo 96 BPM: one beat = 0.625 s = 15 frames @ 24 fps,
so every musical event lands exactly on a video frame. Firework launches/bursts are read
from src/diwali/fireworks.json — the same cue sheet the picture uses.

  0.0 s  tanpura drone, night air, distant pops; jet passes overhead (~1.8 s)
  2.9 s  firework flash → dhol/tabla groove + claps enter (the celebration)
  5.1 s  hero shell launch whistle, string riser, dhol roll builds
  7.3 s  ignition shimmer — the arc trace (rising glassy tones)
 10.0 s  logo reveal impact: boom, cymbal, D-major add9 brass/strings, bells
 12.4 s  greeting chime, groove resolves; drone + chord ring out to 15 s

usage: python3 scripts/make_diwali_audio.py public/audio/diwali-score.wav
"""
import json
import sys
from pathlib import Path

import numpy as np
import pyloudnorm as pyln
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
FPS = 24
DUR = 15.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(1108)
BEAT = 0.625
cues = json.loads((ROOT / "src/diwali/fireworks.json").read_text())["shells"]

S2 = 70 / FPS
SHELL = 122 / FPS
ARC0, ARC1 = 176 / FPS, 232 / FPS
IMPACT = 240 / FPS
GREET = 298 / FPS
JET_PASS = 40 / FPS  # closest approach in AcademyScene


def lp(x, f, o=2):
    return sosfilt(butter(o, f, "low", fs=SR, output="sos"), x)


def hp(x, f, o=2):
    return sosfilt(butter(o, f, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, o=2):
    return sosfilt(butter(o, [lo, hi], "band", fs=SR, output="sos"), x)


def tvlp(x, cutoff):
    """one-pole low-pass with a per-sample cutoff (Hz)"""
    a = np.exp(-2 * np.pi * np.clip(cutoff, 10, SR / 2.2) / SR)
    y = np.zeros_like(x)
    s = 0.0
    for i in range(len(x)):
        s = (1 - a[i]) * x[i] + a[i] * s
        y[i] = s
    return y


def env(points):
    xs, ys = zip(*points)
    return np.interp(t, xs, ys)


def osc(freq, ph=0.0):
    return np.sin(2 * np.pi * np.cumsum(np.broadcast_to(freq, t.shape) / SR) + ph)


def saw(freq, ph=0.0):
    p = np.cumsum(np.broadcast_to(freq, t.shape) / SR) + ph
    return 2 * (p % 1) - 1


def pan(x, p):
    a = (np.asarray(p) + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], -1)


def hit(t0, n_sec, fn):
    """place a short synthesized event (fn(local_t) -> samples) at time t0"""
    out = np.zeros(N)
    i0 = int(t0 * SR)
    if i0 >= N:
        return out
    n = min(int(n_sec * SR), N - i0)
    lt = np.arange(n) / SR
    out[i0:i0 + n] = fn(lt)
    return out


mix = np.zeros((N, 2))
D = 146.83  # D3

# ------------------------------------------------------------ tanpura drone (Pa-Sa-Sa-Sa cycle)
def tanpura_pluck(f):
    def fn(lt):
        # bright jawari buzz: many harmonics with slowly shifting emphasis
        y = np.zeros_like(lt)
        for h in range(1, 18):
            amp = (1 / h) * (0.6 + 0.4 * np.sin(2 * np.pi * (0.5 + h * 0.07) * lt + h))
            y += amp * np.sin(2 * np.pi * f * h * lt * (1 + 0.0004 * h))
        return y * np.exp(-lt * 0.55) * (1 - np.exp(-lt * 60))
    return fn


cycle = [D * 1.5 / 2, D, D, D / 2]  # A2 D3 D3 D2 (Pa Sa Sa low-Sa)
tp = np.zeros(N)
k = 0
for t0 in np.arange(0, DUR, BEAT * 1.0):
    tp += hit(t0, 4.0, tanpura_pluck(cycle[k % 4]))
    k += 1
tp = hp(lp(tp, 3200), 90)
mix += np.stack([tp, np.roll(tp, 300)], -1) * 0.05 * env([(0, 0), (0.8, 1), (IMPACT, 1), (DUR - 0.4, 0.9), (DUR, 0)])[:, None]

# ------------------------------------------------------------ night air + airport ambience
air = lp(hp(rng.standard_normal(N), 150), 900)
mix += pan(air, 0) * 0.05 * env([(0, 0), (0.6, 1), (S2, 0.7), (IMPACT, 0.3), (DUR, 0.2)])[:, None]

# ------------------------------------------------------------ jet overhead
x_rel = 260 * (t - JET_PASS)
dist = np.sqrt(60 ** 2 + x_rel ** 2)
amp = np.clip(60 / dist, 0, 1) * env([(0, 0.3), (1, 1), (S2 - 0.1, 1), (S2 + 0.3, 0), (DUR, 0)])
dop = 343 / (343 + 0.5 * 260 * x_rel / dist)
roar = tvlp(bp(rng.standard_normal(N), 60, 2500), 600 + 4000 * amp)
whine = osc(1900 * dop) * 0.3 + osc(1900 * dop * 0.5) * 0.2
mix += pan(roar * amp + whine * amp ** 1.4 * 0.25, -np.tanh(x_rel / 80) * 0.6) * 0.42

# ------------------------------------------------------------ fireworks: whistles, booms, crackle
for c in cues:
    tl, tb = c["launch"] / FPS, c["burst"] / FPS
    near = 1.0 if c["scene"] >= 2 else 0.45
    size = c["r"] / 300
    px = (c["x"] / 540 - 1) * 0.7
    # launch whistle (only some shells whistle)
    if c["type"] in ("willow", "chrysanthemum"):
        def whistle(lt, d=tb - tl):
            f = 700 + 1300 * np.clip(lt / d, 0, 1)
            return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.clip(lt / d, 0, 1) * (lt < d)
        mix += pan(hit(tl, tb - tl, whistle), px) * 0.035 * near
    # boom
    def boom(lt, s=size):
        f = 48 + 40 * np.exp(-lt * 9)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-lt * 3.2) * (1 - np.exp(-lt * 400))
    def crack(lt):
        return lp(hp(rng.standard_normal(len(lt)), 1500), 7000) * np.exp(-lt * 9)
    mix += pan(hit(tb, 1.6, boom) * (0.35 + 0.3 * size) + hit(tb, 0.4, crack) * 0.5, px) * 0.4 * near
    # crackle tail: sparse grains
    dur = 1.3 if c["type"] != "willow" else 2.2
    grains = np.zeros(N)
    gr = np.random.default_rng(c["burst"])
    for g in gr.uniform(tb + 0.15, tb + dur, int(40 * size * (2 if c["type"] == "crackle" else 1))):
        grains += hit(g, 0.02, lambda lt: np.sin(2 * np.pi * gr.uniform(2500, 7000) * lt) * np.exp(-lt * 300))
    mix += pan(grains, px) * 0.08 * near

# ------------------------------------------------------------ percussion (dhol / tabla / claps / shaker)
def dhol_bass(lt):
    f = 62 + 45 * np.exp(-lt * 25)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-lt * 7) + lp(rng.standard_normal(len(lt)), 300) * np.exp(-lt * 40) * 0.4


def tabla_na(lt, f=520):
    y = np.sin(2 * np.pi * f * lt) + 0.5 * np.sin(2 * np.pi * f * 2.03 * lt) + 0.3 * np.sin(2 * np.pi * f * 3.1 * lt)
    return y * np.exp(-lt * 16) + hp(rng.standard_normal(len(lt)), 2500) * np.exp(-lt * 70) * 0.5


def clap(lt):
    n = bp(rng.standard_normal(len(lt)), 900, 4000)
    e = np.exp(-lt * 30) + 0.6 * np.exp(-np.clip(lt - 0.012, 0, None) * 30) * (lt > 0.012)
    return n * e


def shaker(lt):
    return hp(rng.standard_normal(len(lt)), 5000) * np.exp(-lt * 50)


perc = np.zeros((N, 2))
eighth = BEAT / 2
groove = "B t t B t B t t".split()
bar0 = S2
for i in range(int((DUR - bar0) / eighth)):
    tt = bar0 + i * eighth
    if IMPACT - eighth * 0.5 < tt < IMPACT + BEAT * 0.9:  # breath before/after the reveal hit
        continue
    if tt > DUR - 0.5:
        break
    energy = 0.75 if tt < SHELL else (1.0 if tt < IMPACT else 0.55)
    sym = groove[i % 8]
    if sym == "B":
        perc += pan(hit(tt, 0.6, dhol_bass), 0) * 0.38 * energy
    else:
        perc += pan(hit(tt, 0.35, lambda lt: tabla_na(lt, 520 if i % 3 else 600)), 0.25 if i % 2 else -0.25) * 0.22 * energy
    if i % 4 == 2:
        perc += pan(hit(tt, 0.25, clap), 0.1) * 0.22 * energy
    for s in (0, 0.5):
        perc += pan(hit(tt + s * eighth, 0.08, shaker), -0.4) * 0.05 * energy
# dhol roll building into the reveal
roll_t = 8.1
while roll_t < IMPACT - 0.03:
    d = np.interp(roll_t, [8.1, IMPACT], [BEAT / 4, BEAT / 12])
    v = np.interp(roll_t, [8.1, IMPACT], [0.15, 0.55])
    perc += pan(hit(roll_t, 0.3, dhol_bass), 0) * v
    roll_t += d
mix += perc

# ------------------------------------------------------------ bansuri-style melody
def flute(f0, t0, dur, gain=1.0):
    def fn(lt):
        vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * lt) * np.clip(lt / 0.25, 0, 1)
        ph = 2 * np.pi * np.cumsum(f0 * vib) / SR
        tone = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
        breath = bp(rng.standard_normal(len(lt)), f0 * 0.8, min(f0 * 4, 18000)) * 0.12
        e = np.clip(lt / 0.06, 0, 1) * np.clip((dur - lt) / 0.12, 0, 1)
        return (tone + breath) * e * gain
    return hit(t0, dur, fn)


notes = {"D5": 587.33, "E5": 659.25, "F#5": 739.99, "A5": 880.0, "B5": 987.77, "D6": 1174.66, "C#6": 1108.73}
phrase1 = [("A5", 0, 0.5), ("B5", 0.5, 0.25), ("A5", 0.75, 0.25), ("F#5", 1.0, 0.5), ("E5", 1.5, 0.25), ("F#5", 1.75, 0.25), ("A5", 2.0, 1.0), ("D6", 3.0, 0.5), ("C#6", 3.5, 0.5)]
mel = np.zeros(N)
for n_, b, d in phrase1:
    mel += flute(notes[n_], S2 + 0.6 + b * BEAT, d * BEAT * 1.05)
phrase2 = [("F#5", 0, 0.5), ("A5", 0.5, 0.5), ("B5", 1.0, 0.5), ("D6", 1.5, 1.5), ("A5", 3.0, 2.0)]
for n_, b, d in phrase2:
    mel += flute(notes[n_], IMPACT + 1.25 + b * BEAT, d * BEAT * 1.05, 0.8)
mix += np.stack([mel, np.roll(mel, 500)], -1) * 0.06

# ------------------------------------------------------------ strings riser + arc shimmer
riser_env = env([(0, 0), (SHELL, 0), (IMPACT - 0.05, 1), (IMPACT, 0), (DUR, 0)]) ** 1.8
rf = np.interp(t, [SHELL, IMPACT], [D, D * 2])
strings = sum(saw(rf * m * (1 + d)) for m in (1, 1.5, 2) for d in (-0.004, 0.004))
y = tvlp(strings, 300 + 4500 * riser_env)
mix += np.stack([y, np.roll(y, 400)], -1) * (riser_env * 0.06)[:, None]
noise_r = hp(rng.standard_normal(N), 3000) * riser_env ** 2
mix += pan(noise_r, 0) * 0.05

arc_env = env([(0, 0), (ARC0 - 0.05, 0), (ARC0 + 0.25, 1), (ARC1, 1), (IMPACT, 0), (DUR, 0)])
prog = np.clip((t - ARC0) / (ARC1 - ARC0), 0, 1)
shim = sum(osc(f * (1 + 0.08 * prog), k) * (0.5 / (k + 1)) for k, f in enumerate([1174.66, 1760.0, 2349.3, 2959.96]))
mix += pan(shim * arc_env * 0.05, np.interp(prog, [0, 1], [-0.7, 0.7]))
ign = hit(ARC0, 1.5, lambda lt: (hp(rng.standard_normal(len(lt)), 4000) * 0.5 + np.sin(2 * np.pi * 2349 * lt)) * np.exp(-lt * 3))
mix += pan(ign, -0.6) * 0.06

# ------------------------------------------------------------ the reveal
ti = np.clip(t - IMPACT, 0, None)
on = (t >= IMPACT).astype(float)
boom = osc(np.interp(ti, [0, 2], [58, 30])) * np.exp(-ti * 1.4) * on
cym = hp(rng.standard_normal(N), 5000) * np.exp(-ti * 0.9) * on
chord_f = [D / 2, D, D * 1.5, D * 2, D * 2.5, D * 3, D * 4 * 1.125]  # D A D F# A + E (add9)
brass = tvlp(sum(saw(f) + saw(f * 1.003, 0.4) for f in chord_f), 900 + 1800 * np.exp(-ti * 1.5))
chord_env = on * (1 - np.exp(-ti * 20)) * np.interp(t, [IMPACT, IMPACT + 1.5, DUR - 1.2, DUR], [1, 0.7, 0.45, 0])
bells = sum(osc(f) * np.exp(-ti * (1.2 + 0.3 * k)) * (0.5 / (k + 1)) for k, f in enumerate([587.33, 880.0, 1174.66, 1479.98])) * on
mix += pan(boom, 0) * 0.6 + pan(cym, 0) * 0.06
mix += np.stack([brass, np.roll(brass, 350)], -1) * (chord_env * 0.035)[:, None]
mix += np.stack([bells, np.roll(bells, 200)], -1) * 0.12

# particle sparkle during convergence
sp = np.zeros(N)
gr = np.random.default_rng(5)
for g in gr.uniform(IMPACT - 0.2, IMPACT + 1.5, 70):
    f = gr.uniform(2500, 7500)
    sp += hit(g, 0.12, lambda lt, f=f: np.sin(2 * np.pi * f * lt) * np.exp(-lt * 40))
mix += np.stack([sp, np.roll(sp, 900)], -1) * 0.03

# greeting chime
tg = np.clip(t - (GREET + 0.2), 0, None)
gon = (t >= GREET + 0.2).astype(float)
mod = osc(1174.66 * 3.5) * 2.0 * np.exp(-tg * 3)
chime = np.sin(2 * np.pi * 1174.66 * tg + mod) * np.exp(-tg * 1.5) * gon
mix += pan(chime, 0.2) * 0.07

# ------------------------------------------------------------ reverb + master
ir_len = int(SR * 2.8)
ti_ir = np.arange(ir_len) / SR
ir = np.stack([lp(rng.standard_normal(ir_len), 7000), lp(rng.standard_normal(ir_len), 7000)], -1) * np.exp(-ti_ir * 2.3)[:, None]
ir[: int(SR * 0.015)] = 0
ir /= np.sqrt((ir ** 2).sum(0))
wet = np.stack([fftconvolve(mix[:, c], ir[:, c])[:N] for c in range(2)], -1)
dry = mix * 0.85 + wet * 0.32
lows = lp(dry.T, 120).T
out = hp((dry - 0.45 * lows).T, 32).T  # tame sub build-up
out[-int(SR * 0.3):] *= np.linspace(1, 0, int(SR * 0.3))[:, None]

meter = pyln.Meter(SR)
TARGET, CEIL = -14.0, 10 ** (-1.0 / 20)  # social-platform loudness
base = out / np.abs(out).max()
lo, hi = 0.3, 8.0
for _ in range(30):
    mid = (lo + hi) / 2
    y = np.tanh(base * mid) / np.tanh(mid) * CEIL
    if meter.integrated_loudness(y) < TARGET:
        lo = mid
    else:
        hi = mid
out = np.tanh(base * lo) / np.tanh(lo) * CEIL
print(f"master {meter.integrated_loudness(out):.1f} LUFS, limiter drive {lo:.2f}")
dest = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "public/audio/diwali-score.wav")
dest.parent.mkdir(parents=True, exist_ok=True)
wavfile.write(dest, SR, (out * 32767).astype(np.int16))
print("wrote", dest)
