"""Original sound design + score for the GLOBAL intro, synthesised from scratch.

Every cue is locked to the video timeline (src/timeline.ts @ 30 fps):
  0.0 s   high-altitude wind bed + suspended D drone (blue hour)
  ~3.7 s  jet overtakes the camera: turbine whine with Doppler, roar, air whoosh
  6.5 s   jet traces the arc: glassy shimmer that rises with the stroke
  ~5.8 s  riser building into the sunrise
  8.93 s  impact as the sun floods to white: sub drop, air burst, shimmer tail
          pad resolves Dsus2 → D major
  9.0 s   flight-line "zip", then soft swishes as the letters open
  10.7 s  tagline sweeps in
  11.2 s  sheen chime along the arc
  12.2 s  ® glint
  14.0 s  end

usage: python3 scripts/make_audio.py public/audio/global-intro-score.wav
"""
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt, sosfiltfilt

SR = 48000
FPS = 30
DUR = 14.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(2026)

# cue times (seconds) — mirror src/timeline.ts
PASS = 112 / FPS
ARC_START = 196 / FPS
ARC_END = 256 / FPS
FLOOD_PEAK = 268 / FPS
LINE_START = 270 / FPS
LETTERS = [282 / FPS, 288 / FPS, 294 / FPS, 300 / FPS]
SHEEN = 336 / FPS
TAGLINE = 322 / FPS
REG_MARK = 362 / FPS


def env(points):
    """piecewise-linear envelope from [(time, value), ...]"""
    xs, ys = zip(*points)
    return np.interp(t, xs, ys)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


def noise(n=N):
    return rng.standard_normal(n)


def pink(n=N):
    # Voss-ish pink via spectral shaping
    w = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = 1
    w /= np.sqrt(f)
    x = np.fft.irfft(w, n)
    return x / np.abs(x).max()


def time_varying_lp(x, cutoff):
    """one-pole low-pass with per-sample cutoff (Hz)"""
    a = np.exp(-2 * np.pi * np.clip(cutoff, 10, SR / 2.2) / SR)
    y = np.zeros_like(x)
    s = 0.0
    for i in range(len(x)):
        s = (1 - a[i]) * x[i] + a[i] * s
        y[i] = s
    return y


def pan(x, p):
    """equal-power pan, p in [-1, 1] (scalar or array)"""
    p = np.asarray(p)
    ang = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(ang), x * np.sin(ang)], -1)


def saw(freq, phase0=0.0):
    ph = np.cumsum(np.broadcast_to(freq, t.shape) / SR) + phase0
    return 2 * (ph % 1.0) - 1


def osc(freq, phase0=0.0):
    ph = 2 * np.pi * np.cumsum(np.broadcast_to(freq, t.shape) / SR) + phase0
    return np.sin(ph)


mix = np.zeros((N, 2))

# ------------------------------------------------------------------ wind bed
w_l, w_r = pink(), pink()
gust = 0.75 + 0.25 * np.sin(2 * np.pi * 0.23 * t) + 0.12 * np.sin(2 * np.pi * 0.61 * t + 1.0)
wind_cut = 500 + 700 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.17 * t))
wind = np.stack([time_varying_lp(hp(w_l, 120), wind_cut), time_varying_lp(hp(w_r, 120), wind_cut * 1.1)], -1)
wind *= (gust * env([(0, 0), (1.2, 0.9), (6.0, 1.0), (FLOOD_PEAK, 0.6), (FLOOD_PEAK + 0.4, 0.05), (DUR, 0.0)]))[:, None]
mix += wind * 0.32

# ------------------------------------------------------------------ drone / pad
def pad_voice(f, detune=0.003, bright=900.0, gain=1.0):
    v = saw(f * (1 - detune)) + saw(f * (1 + detune), 0.37) + 0.6 * saw(f * 2.0005, 0.11)
    return lp(v, bright) * gain


D2, A2, D3, E3, Fs3, A3, D4 = 73.42, 110.0, 146.83, 164.81, 185.0, 220.0, 293.66
pre = env([(0, 0), (2.5, 0.55), (FLOOD_PEAK - 0.4, 1.0), (FLOOD_PEAK, 0.0), (DUR, 0)])
post = env([(0, 0), (FLOOD_PEAK - 0.05, 0), (FLOOD_PEAK + 0.6, 1.0), (DUR - 1.6, 0.8), (DUR - 0.05, 0.0), (DUR, 0)])
sus = pad_voice(D2, gain=0.8) + pad_voice(A2, gain=0.6) + pad_voice(D3, gain=0.4) + pad_voice(E3, gain=0.35)
# slowly opening filter during the ascent
sus = time_varying_lp(sus, 220 + 1400 * env([(0, 0), (FLOOD_PEAK, 1)]) ** 2)
maj = pad_voice(D2, gain=0.7, bright=1600) + pad_voice(A2, gain=0.55, bright=1800) + pad_voice(D3, gain=0.45, bright=2200) \
    + pad_voice(Fs3, gain=0.4, bright=2400) + pad_voice(A3, gain=0.32, bright=2600) + pad_voice(D4, gain=0.22, bright=3000)
sub = osc(D2 / 2) * 0.5
pad = sus * pre + maj * post + sub * np.maximum(pre * 0.7, post * 0.5)
chorus = 0.004 * np.sin(2 * np.pi * 0.3 * t)
pad_st = np.stack([pad, np.roll(pad, int(SR * 0.011))], -1)
mix += pad_st * 0.085

# ------------------------------------------------------------------ jet flyby
# kinematics: closest approach d0 at PASS, passing from behind → ahead
d0, v_eff = 24.0, 210.0
x_rel = v_eff * (t - PASS)
dist = np.sqrt(d0 ** 2 + x_rel ** 2)
radial_v = v_eff * x_rel / dist  # + receding, − approaching
c = 343.0
doppler = c / (c + radial_v * 0.55)
amp = np.clip(d0 / dist, 0, 1) ** 1.15
# fade the far tail so it hands over to the arc section
amp *= env([(0, 0), (0.6, 1), (ARC_START, 1), (ARC_END, 0.25), (FLOOD_PEAK, 0.0), (DUR, 0)])

whine_f = 1850 * doppler
whine = (osc(whine_f) * 0.5 + osc(whine_f * 1.5) * 0.18 + osc(whine_f * 0.503) * 0.25)
roar_src = noise()
roar = bp(roar_src, 60, 900) * 1.2 + bp(roar_src, 900, 4000) * 0.35 * amp
roar = time_varying_lp(roar, 400 + 5200 * amp)
rumble = lp(noise(), 110, 4) * 3.0
jet = (whine * 0.18 * amp ** 1.3 + roar * 0.9 * amp + rumble * amp)
jet_pan = np.clip(np.tanh(x_rel / 60.0) * 0.55, -0.7, 0.7)  # passes slightly right→left
mix += pan(jet, -jet_pan) * 0.3

# air whoosh at the pass
wh = bp(noise(), 250, 6000)
wh_cut = 300 + 6000 * np.exp(-((t - PASS) / 0.35) ** 2)
wh = time_varying_lp(wh, wh_cut) * np.exp(-((t - PASS) / 0.45) ** 2)
mix += pan(wh, -np.tanh((t - PASS) * 3) * 0.6) * 0.55

# pressure thump
thump = osc(np.interp(t, [PASS - 0.05, PASS + 0.5], [70, 38])) * np.exp(-np.clip(t - PASS + 0.05, 0, None) * 7) * (t > PASS - 0.05)
mix += pan(thump, 0) * 0.35

# ------------------------------------------------------------------ arc shimmer
arc_env = env([(0, 0), (ARC_START - 0.1, 0), (ARC_START + 0.3, 1), (ARC_END, 1), (FLOOD_PEAK + 0.1, 0), (DUR, 0)])
prog = np.clip((t - ARC_START) / (ARC_END - ARC_START), 0, 1)
shimmer = np.zeros(N)
for k, base in enumerate([1174.66, 1760.0, 2349.32, 2637.02]):  # D6 A6 D7 E7
    f = base * (1 + 0.06 * prog) * (1 + 0.0025 * np.sin(2 * np.pi * (5.1 + k) * t))
    shimmer += osc(f, k) * (0.5 / (k + 1)) * (0.6 + 0.4 * np.sin(2 * np.pi * (7 + 2 * k) * t + k))
stroke = time_varying_lp(bp(noise(), 1500, 9000), 2000 + 6000 * prog)
arc_l = (shimmer * 0.12 + stroke * 0.25) * arc_env
mix += pan(arc_l, np.interp(prog, [0, 1], [-0.65, 0.65]))  # follows the jet left→right

# ------------------------------------------------------------------ riser into the flood
r_env = env([(0, 0), (5.8, 0), (FLOOD_PEAK - 0.02, 1.0), (FLOOD_PEAK, 0), (DUR, 0)]) ** 2.2
r_f = np.interp(t, [5.8, FLOOD_PEAK], [180, 1400])
riser = (saw(r_f) * 0.25 + saw(r_f * 1.006, 0.3) * 0.25)
riser = time_varying_lp(riser, 300 + 5000 * r_env)
r_noise = time_varying_lp(hp(noise(), 800), 800 + 12000 * r_env)
mix += np.stack([riser + r_noise * 0.6, np.roll(riser, 240) + np.roll(r_noise, 400) * 0.6], -1) * (r_env * 0.22)[:, None]

# ------------------------------------------------------------------ impact
ti = np.clip(t - FLOOD_PEAK, 0, None)
on = (t >= FLOOD_PEAK).astype(float)
boom = osc(np.interp(ti, [0, 1.8], [62, 31])) * np.exp(-ti * 1.6) * on
burst = lp(noise(), 1800) * np.exp(-ti * 7) * on
crash = hp(noise(), 4500) * np.exp(-ti * 1.1) * on
bell_f = [587.33, 880.0, 1174.66, 1479.98]  # D5 A5 D6 F#6
bells = sum(osc(f) * np.exp(-ti * (1.3 + 0.3 * k)) * (0.5 / (k + 1)) for k, f in enumerate(bell_f)) * on
impact = boom * 0.9 + burst * 0.45 + crash * 0.12 + bells * 0.22
mix += np.stack([impact, np.roll(impact, 180)], -1) * 1.05

# ------------------------------------------------------------------ flight line + letters
def swish(t0, dur=0.22, lo=900, hi=7000, gain=1.0, p=0.0):
    seg = (t >= t0) & (t < t0 + dur)
    u = np.clip((t - t0) / dur, 0, 1)
    e = np.sin(np.pi * u) ** 2 * seg
    x = time_varying_lp(bp(noise(), lo, hi), lo + (hi - lo) * u)
    return pan(x * e * gain, p)


mix += swish(LINE_START, 0.45, 600, 9000, 0.35)
for i, lt in enumerate(LETTERS):
    for side in ([0.0] if i == 0 else [-0.25 * i, 0.25 * i]):
        mix += swish(lt, 0.3, 1200, 6000, 0.16, side)

# tagline: a gentle airy sweep as the glyphs rise left→right
mix += swish(TAGLINE, 0.75, 1500, 8000, 0.12, -0.3)
mix += swish(TAGLINE + 0.25, 0.7, 2000, 9000, 0.08, 0.3)

# soft "click" as the line retracts into the O
tc = 330 / FPS
click = osc(2350) * np.exp(-np.clip(t - tc, 0, None) * 40) * (t >= tc)
mix += pan(click, 0) * 0.08

# ------------------------------------------------------------------ sheen chime (FM bell)
ts = np.clip(t - SHEEN, 0, None)
son = (t >= SHEEN).astype(float)
def fm_bell(fc, ratio=3.5, index=2.2, decay=1.4):
    mod = osc(fc * ratio) * index * np.exp(-ts * 3.0)
    ph = 2 * np.pi * fc * ts + mod
    return np.sin(ph) * np.exp(-ts * decay) * son


chime = fm_bell(1174.66) * 0.5 + fm_bell(1760.0, decay=1.8) * 0.3 + fm_bell(2349.3, decay=2.2) * 0.15
sweep = np.interp(t, [SHEEN, SHEEN + 1.1], [-0.5, 0.6])
mix += pan(chime, sweep) * 0.16

# ® glint: tiny high bell, far right
tr = np.clip(t - (REG_MARK + 0.15), 0, None)
glint = (np.sin(2 * np.pi * 3520 * tr) + 0.4 * np.sin(2 * np.pi * 5274 * tr)) * np.exp(-tr * 6) * (t >= REG_MARK + 0.15)
mix += pan(glint, 0.7) * 0.05

# ------------------------------------------------------------------ reverb (synthetic stereo hall IR)
ir_len = int(SR * 3.2)
ti_ir = np.arange(ir_len) / SR
ir = np.stack([lp(noise(ir_len), 6000), lp(noise(ir_len), 6000)], -1) * np.exp(-ti_ir * 2.1)[:, None]
ir[: int(SR * 0.012)] = 0  # pre-delay
ir /= np.sqrt((ir ** 2).sum(0))
wet = np.stack([fftconvolve(mix[:, ch], ir[:, ch])[:N] for ch in range(2)], -1)
out = mix * 0.82 + wet * 0.38

# ------------------------------------------------------------------ master
out = hp(out.T, 28).T  # rumble guard
out[-int(SR * 0.25):] *= np.linspace(1, 0, int(SR * 0.25))[:, None]
out[: int(SR * 0.02)] *= np.linspace(0, 1, int(SR * 0.02))[:, None]
# loudness-targeted master: soft-saturating limiter, solve drive for −16 LUFS integrated
import pyloudnorm as pyln

meter = pyln.Meter(SR)
TARGET_LUFS, CEILING = -16.0, 10 ** (-1.5 / 20)
base = out / np.abs(out).max()


def master(drive):
    y = np.tanh(base * drive) / np.tanh(drive) if drive > 0 else base
    return y * CEILING


lo, hi = 0.3, 6.0
for _ in range(30):
    mid = (lo + hi) / 2
    if meter.integrated_loudness(master(mid)) < TARGET_LUFS:
        lo = mid
    else:
        hi = mid
out = master((lo + hi) / 2)
print(f"master: {meter.integrated_loudness(out):.1f} LUFS, drive {(lo + hi) / 2:.2f}")

dest = Path(sys.argv[1] if len(sys.argv) > 1 else "public/audio/global-intro-score.wav")
dest.parent.mkdir(parents=True, exist_ok=True)
wavfile.write(dest, SR, (out * 32767).astype(np.int16))
print("wrote", dest, f"{DUR}s @ {SR} Hz stereo")
