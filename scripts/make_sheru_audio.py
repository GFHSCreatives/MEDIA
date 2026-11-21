#!/usr/bin/env python3
"""Original score + sound design for the Sheru Bhai animatic (82 s). Everything is synthesised
here from scratch (no samples), so there are no third-party audio rights to clear.

Sync: the picture and this script read the SAME data.
  * src/sheru/timeline.json   shot boundaries, transitions (120 BPM grid: every cut is on a beat)
  * src/sheru/shots.ts        glint sweeps, camera punches/bumps, the walk cycle (parsed here)
  * src/sheru/fx.tsx          typing schedule of the search bar, map light-up waves (parsed here)
  * src/sheru/fxdata/points.json   marker positions -> the exact moment each marker lights up
  * src/sheru/BrandCard.tsx   reveal times of the end card
Edit the picture's timing and re-run this script; the sound follows.

Key D major, 120 BPM. The cast has no voices (the story is carried by captions), so the score leads:
  1 The Father's Dream  regal-playful "Sheru theme" on bansuri over a pizzicato oom-pah, tabla and shaker
  2 The Search Begins   ticking pizzicato + keyboard clicks, UI chime, the knuckle tap on the desk
  3 The First Giant     harp and bells, shimmer, the three map markers ping in time with the glow
  4 The Bigger Reveal   horn swell, big orchestral chord on the full reveal, a shock stinger, then silence
  5 Realisation         piano and strings, wind at the window, warm resolution on "join my son"
  6 The Final Decision  the theme in full, footsteps, birdsong, the airliner climbing, a crescendo
  card                  resolved D add9 with bells

usage: python3 scripts/make_sheru_audio.py [out.wav] [--stem music-stem.wav]
       (default: public/audio/sheru-bhai-score.wav; --stem also writes the music bus alone, without the picture-synced
        sound effects, as a bed for cuts that follow other footage, e.g. image-to-video clips: scripts/sheru_assemble.py)
Needs: numpy, scipy, pyloudnorm
"""
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
import pyloudnorm as pyln
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "sheru"
SR = 48000
TL = json.loads((SRC / "timeline.json").read_text())
FPS = TL["fps"]
DUR = TL["duration"] / FPS
N = int(round(SR * DUR))
BEAT = 0.5  # 120 BPM
rng = np.random.default_rng(20261120)

SHOT = {s["n"]: s["start"] / FPS for s in TL["shots"]}
END = {s["n"]: s["end"] / FPS for s in TL["shots"]}

# ------------------------------------------------------------------ read the picture's cue data
def _bracket(s: str, start: int) -> str:
    depth = 0
    for i in range(start, len(s)):
        depth += (s[i] == "[") - (s[i] == "]")
        if depth == 0:
            return s[start : i + 1]
    raise ValueError("unbalanced brackets")


def parse_shots_ts():
    txt = (SRC / "shots.ts").read_text()
    body = txt[txt.index("export const CFG") :]
    cur, out = None, {}
    for line in body.splitlines():
        m = re.match(r"^  (\d+): \{", line)
        if m:
            cur = int(m.group(1))
            out[cur] = {"glint": [], "punch": [], "bump": [], "walk": False}
        if cur is None:
            continue
        k = line.find("glint: [")
        if k >= 0:
            out[cur]["glint"] = json.loads(_bracket(line, k + len("glint: ")))
        for km in re.finditer(r'type: "(punch|bump)", at: ([\d.]+)', line):
            out[cur][km.group(1)].append(float(km.group(2)))
        if "walk: true" in line:
            out[cur]["walk"] = True
    return out


CFG = parse_shots_ts()
FXTSX = (SRC / "fx.tsx").read_text()
QUERY = re.search(r'const QUERY = "([^"]+)"', FXTSX).group(1)
TYPE_START = float(re.search(r"const TYPE_START = ([\d.]+)", FXTSX).group(1))
TYPE_DUR = float(re.search(r"const TYPE_DUR = ([\d.]+)", FXTSX).group(1))
WAVES = {int(n): (float(a), float(d)) for n, a, d in re.findall(r"(\d): \[\[([\d.]+), ([\d.]+)\]", re.search(r"const WAVES[^\n]*", FXTSX).group(0))}
CARD_T0 = [float(x) for x in re.findall(r"t0: ([\d.]+)", (SRC / "BrandCard.tsx").read_text())]
POINTS = json.loads((SRC / "fxdata" / "points.json").read_text())


def typed_at(i: int) -> float:  # mirrors typedAt() in fx.tsx
    return TYPE_START + TYPE_DUR * (i / len(QUERY)) ** 0.92 + 0.045 * math.sin(i * 12.9898)


def marker_times(n: int):  # mirrors MapLightUp in fx.tsx
    m = POINTS[f"{n:02d}"]["map"]
    ox, oy = m["origin"]
    d = [math.hypot(x - ox, y - oy) for x, y in m["markers"]]
    rmax = max(d) + 140
    at, dur = WAVES[n]
    return sorted(SHOT[n] + at + (di / rmax) * dur for di in d)


# ------------------------------------------------------------------ DSP helpers
def t_of(n):
    return np.arange(n) / SR


def lp(x, f, o=2):
    return sosfilt(butter(o, f, "low", fs=SR, output="sos"), x, axis=0)


def hp(x, f, o=2):
    return sosfilt(butter(o, f, "high", fs=SR, output="sos"), x, axis=0)


def bp(x, lo, hi, o=2):
    return sosfilt(butter(o, [lo, hi], "band", fs=SR, output="sos"), x, axis=0)


def noise(n):
    return rng.standard_normal(n)


def pink(n):
    w = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = 1
    y = np.fft.irfft(w / np.sqrt(f), n)
    return y / np.abs(y).max()


def stereo(x, pan=0.0):
    if x.ndim == 2:
        return x
    a = (pan + 1) * np.pi / 4
    return np.stack([x * math.cos(a), x * math.sin(a)], -1)


def pan_ramp(x, p0, p1):
    p = np.linspace(p0, p1, len(x))
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], -1)


def fade(x, a=0.0, r=0.0):
    n = len(x)
    e = np.ones(n)
    if a > 0:
        k = min(n, int(a * SR))
        e[:k] = np.linspace(0, 1, k) ** 1.5
    if r > 0:
        k = min(n, int(r * SR))
        e[n - k :] *= np.linspace(1, 0, k) ** 1.5
    return x * (e if x.ndim == 1 else e[:, None])


MUS = np.zeros((N, 2))  # music bus (gets ducked before big hits)
FXB = np.zeros((N, 2))  # sound-effects bus
SEND = np.zeros((N, 2))  # reverb send
SEND_M = np.zeros((N, 2))  # reverb send of the music bus only (for the --stem export)
DIP = np.ones(N)  # music-bus ducking envelope
CUES: list[tuple[float, str]] = []


def _put(bus, t0, x, gain, pan, send):
    x = stereo(x, pan) * gain
    i0 = int(round(t0 * SR))
    a, b = max(0, -i0), min(len(x), N - i0)
    if b <= a:
        return
    bus[i0 + a : i0 + b] += x[a:b]
    if send:
        SEND[i0 + a : i0 + b] += x[a:b] * send
        if bus is MUS:
            SEND_M[i0 + a : i0 + b] += x[a:b] * send


def music(t0, x, gain=1.0, pan=0.0, send=0.30):
    _put(MUS, t0, x, gain, pan, send)


def sfx(t0, x, gain=1.0, pan=0.0, send=0.10, label=None):
    _put(FXB, t0, x, gain, pan, send)
    if label:
        CUES.append((t0, label))


def duck(t, depth=0.5, pre=0.4, post=0.08):
    """Dip the music bus around a moment so a hit lands cleanly."""
    ts = t_of(N)
    w = np.clip((ts - (t - pre)) / pre, 0, 1) * np.clip(((t + post) - ts) / post, 0, 1) if post > 0 else np.clip((ts - (t - pre)) / pre, 0, 1)
    DIP[:] *= 1 - depth * np.clip(w, 0, 1)


NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def hz(name: str) -> float:
    m = re.match(r"([A-G][#b]?)(-?\d)$", name)
    n = NOTE[m.group(1)] + 12 * (int(m.group(2)) + 1)
    return 440.0 * 2 ** ((n - 69) / 12)


# ------------------------------------------------------------------ instruments
def pluck(f, dur=1.2, decay=3.2, bright=0.8):
    n = int(dur * SR)
    t = t_of(n)
    y = np.zeros(n)
    for k, a in enumerate([1.0, 0.55, 0.34, 0.2, 0.12, 0.07], 1):
        fk = f * k * (1 + 0.0003 * k * k)
        if fk > 14000:
            break
        y += a * bright ** (k - 1) * np.sin(2 * np.pi * fk * t) * np.exp(-t * decay * (1 + 0.6 * (k - 1)))
    return y * (1 - np.exp(-t * 1200)) * 0.6


def bell(f, dur=2.4, index=2.2, ratio=3.5, decay=1.5):
    t = t_of(int(dur * SR))
    mod = np.sin(2 * np.pi * f * ratio * t) * index * np.exp(-t * 3.2)
    y = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * decay) + 0.35 * np.sin(2 * np.pi * f * 2.01 * t) * np.exp(-t * decay * 1.8)
    return y * (1 - np.exp(-t * 900)) * 0.6


def epiano(f, dur=2.2, vel=0.7):
    t = t_of(int(dur * SR))
    mod = np.sin(2 * np.pi * f * t) * (1.5 * vel) * np.exp(-t * 5.5)
    y = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 1.4) + 0.22 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 3.6)
    return y * (1 - np.exp(-t * 600)) * 0.55


def flute(f, dur, gain=1.0):
    n = int(dur * SR) + int(0.2 * SR)
    t = t_of(n)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t / 0.25, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    tone = np.sin(ph) + 0.16 * np.sin(2 * ph) + 0.05 * np.sin(3 * ph)
    breath = bp(noise(n), f * 0.8, min(f * 4, 18000)) * 0.1
    e = np.clip(t / 0.07, 0, 1) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.06))
    return (tone + breath) * e * gain * 0.55


def pad(freqs, dur, a=0.9, r=1.3, cutoff=1300, trem=0.0):
    n = int((dur + r) * SR)
    t = t_of(n)
    y = np.zeros(n)
    for f in freqs:
        for d in (-1, 0, 1):
            y += 2 * (((f * (1 + 0.0035 * d)) * t + rng.random()) % 1) - 1
    y = lp(y, cutoff, 2) / (len(freqs) * 3)
    e = np.minimum(1, t / a) * np.where(t < dur, 1.0, np.exp(-(t - dur) / (r / 4)))
    y = y * e * (0.93 + 0.07 * np.sin(2 * np.pi * 0.23 * t + rng.random() * 6.28))
    if trem:
        y = y * (1 - trem + trem * np.sin(2 * np.pi * 9.5 * t) ** 2)
    return y * 1.6


def brass(f, dur, gain=1.0):
    n = int((dur + 0.25) * SR)
    t = t_of(n)
    x = sum(2 * (((f * (1 + d)) * t + rng.random()) % 1) - 1 for d in (-0.003, 0.003))
    b = np.clip(t / 0.14, 0, 1) ** 1.5
    y = (1 - b) * lp(x, 500, 2) + b * lp(x, 2400, 2)
    e = np.minimum(1, t / 0.06) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.07))
    return y * e * gain * 0.3


def bass_pluck(f, dur=0.9):
    t = t_of(int(dur * SR))
    y = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(4 * np.pi * f * t) * np.exp(-t * 8) + 0.12 * np.sin(6 * np.pi * f * t) * np.exp(-t * 12)
    return y * np.exp(-t * 3.6) * (1 - np.exp(-t * 600)) * 0.7


def timp(f, dur=1.8, gain=1.0):
    n = int(dur * SR)
    t = t_of(n)
    fr = f * (1 + 0.35 * np.exp(-t * 28))
    y = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 2.6) + 0.35 * np.sin(2 * np.pi * np.cumsum(fr * 1.5) / SR) * np.exp(-t * 4.5)
    y += lp(noise(n), 900) * np.exp(-t * 45) * 0.5
    return y * gain * 0.9


def cymbal(swell, tail):
    n = int((swell + tail) * SR)
    t = t_of(n)
    e = np.where(t < swell, (t / swell) ** 3 * 0.5, np.exp(-(t - swell) / (tail / 4.0)))
    return hp(noise(n), 5200) * e * 0.5


def dhol(dur=0.6):
    n = int(dur * SR)
    t = t_of(n)
    f = 62 + 45 * np.exp(-t * 25)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) + lp(noise(n), 300) * np.exp(-t * 40) * 0.4) * 0.9


def tabla_na(f=520, dur=0.35):
    n = int(dur * SR)
    t = t_of(n)
    y = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.03 * t) + 0.3 * np.sin(2 * np.pi * f * 3.1 * t)
    return (y * np.exp(-t * 16) + hp(noise(n), 2500) * np.exp(-t * 70) * 0.5) * 0.7


def shaker(dur=0.08):
    n = int(dur * SR)
    return hp(noise(n), 5000) * np.exp(-t_of(n) * 50)


def clap(dur=0.25):
    n = int(dur * SR)
    t = t_of(n)
    e = np.exp(-t * 30) + 0.6 * np.exp(-np.clip(t - 0.012, 0, None) * 30) * (t > 0.012)
    return bp(noise(n), 900, 4000) * e


def sweep_noise(dur, f0, f1, bands=14, q=0.55, curve=1.0):
    """Noise whose spectral centre glides from f0 to f1 (a whoosh)."""
    n = int(dur * SR)
    u = np.linspace(0, 1, n) ** curve
    base = noise(n)
    fc_t = f0 * (f1 / f0) ** u
    fcs = np.geomspace(min(f0, f1) / 1.4, max(f0, f1) * 1.4, bands)
    y = np.zeros(n)
    for fc in fcs:
        y += bp(base, fc / 1.25, min(fc * 1.25, SR / 2.2)) * np.exp(-((np.log(fc_t) - np.log(fc)) / q) ** 2)
    return y / (np.abs(y).max() + 1e-9)


def whoosh(dur, f0, f1, peak=0.5, curve=1.0):
    y = sweep_noise(dur, f0, f1, curve=curve)
    t = np.linspace(0, 1, len(y))
    e = np.where(t < peak, (t / peak) ** 1.6, ((1 - t) / (1 - peak)) ** 1.8)
    return y * e


def key_click(vel=1.0, low=False):
    n = int(0.07 * SR)
    t = t_of(n)
    return (bp(noise(n), 1800, 6500) * np.exp(-t * 420) * 0.8 + np.sin(2 * np.pi * (150 if low else 235) * t) * np.exp(-t * 140) * 0.9) * vel


def ui_ding():
    out = np.zeros(int(1.8 * SR))
    for off, f in ((0.0, 1318.5), (0.12, 1975.5)):
        b = bell(f, 1.5, index=0.6, ratio=2.0, decay=4.2)
        i = int(off * SR)
        out[i : i + len(b)] += b[: len(out) - i]
    return out * 0.55


def desk_tap():
    n = int(0.6 * SR)
    t = t_of(n)
    fr = 175 - 55 * np.minimum(t / 0.05, 1)
    thud = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 55)
    knock = bp(noise(n), 400, 2200) * np.exp(-t * 160)
    ring = (np.sin(2 * np.pi * 2750 * t) * 0.25 + np.sin(2 * np.pi * 4100 * t) * 0.12) * np.exp(-t * 14)
    return thud * 0.9 + knock * 0.7 + ring * 0.4


def rustle(dur=0.5):
    n = int(dur * SR)
    t = t_of(n)
    am = np.abs(lp(noise(n), 18)) * 6
    return bp(noise(n), 1500, 7000) * am * np.sin(np.pi * t / dur) * 0.35


def step(heavy=1.0):
    n = int(0.25 * SR)
    t = t_of(n)
    return bp(noise(n), 900, 3800) * np.exp(-t * 70) * 0.7 + np.sin(2 * np.pi * (95 / heavy) * t) * np.exp(-t * 38) * 0.7 * heavy


def chirp(f0, f1, dur=0.12):
    n = int(dur * SR)
    fr = np.linspace(f0, f1, n)
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.sin(np.pi * t_of(n) / dur) ** 2


def wind(dur, level=1.0):
    n = int(dur * SR)
    t = t_of(n)
    m = 0.62 + 0.3 * np.sin(2 * np.pi * 0.17 * t + 1.0) + 0.14 * np.sin(2 * np.pi * 0.41 * t + 2.0)
    return bp(noise(n), 140, 1100) * m * level


def babble(dur, level=1.0):
    n = int(dur * SR)
    y = np.zeros(n)
    for i in range(6):
        syl = np.clip(lp(noise(n), 5 + i), -3, 3) ** 2
        y += bp(noise(n), 250 + 110 * i, 1000 + 330 * i) * (0.25 + 0.75 * syl / (syl.max() + 1e-9))
    return y / 6 * level


def jet_pass(dur, peak, width, level=1.0):
    n = int(dur * SR)
    t = t_of(n)
    e = np.exp(-(((t - peak) / width) ** 2))
    nz = noise(n)
    body = lp(nz, 700) * 1.2 + bp(nz, 700, 3500) * 0.3 * e
    return (body * e + 0.03 * np.sin(2 * np.pi * 1900 * t) * e**2) * level


def ambience(t0, t1, make, gain, fade_s=1.0, send=0.2):
    n = int((t1 - t0) * SR)
    x = fade(make(n), fade_s, fade_s)
    sfx(t0, x, gain=gain, send=send)


def room_tone(n):
    return lp(pink(n), 500)


# ------------------------------------------------------------------ harmony
CH = {
    "D": ["D3", "A3", "D4", "F#4"], "Dmaj7": ["D3", "A3", "C#4", "F#4"], "Dadd9": ["D3", "A3", "E4", "F#4"],
    "G": ["G2", "D3", "G3", "B3"], "Gmaj7": ["G2", "D3", "F#3", "B3"], "A": ["A2", "E3", "A3", "C#4"],
    "Bm": ["B2", "F#3", "B3", "D4"], "Bm7": ["B2", "F#3", "A3", "D4"], "Em": ["E3", "B3", "E4", "G4"], "Em7": ["E3", "B3", "D4", "G4"],
}
BASS = {"D": "D2", "Dmaj7": "D2", "Dadd9": "D2", "G": "G2", "Gmaj7": "G2", "A": "A2", "Bm": "B2", "Bm7": "B2", "Em": "E2", "Em7": "E2"}


def chord_pad(name, t0, dur, gain=0.16, a=0.9, r=1.3, cutoff=1300, trem=0.0, pan=0.0, send=0.5):
    music(t0, pad([hz(n) for n in CH[name]], dur, a, r, cutoff, trem), gain, pan, send)


def stab(name, t0, gain=0.22):
    for i, n in enumerate(CH[name][1:]):
        music(t0 + 0.004 * i, pluck(hz(n), 0.45, decay=8.0, bright=0.7), gain * 0.5, pan=(-0.25, 0.0, 0.25)[i], send=0.18)


def oompah(t0, chords, gain=1.0):
    """chords: one entry per second (2 beats). bass on the beat, chord stab on the off-beat."""
    for i, c in enumerate(chords):
        t = t0 + i * 2 * BEAT
        music(t, bass_pluck(hz(BASS[c]), 0.9), 0.30 * gain, pan=-0.1, send=0.12)
        stab(c, t + BEAT, 0.22 * gain)


def groove(t0, t1, energy=1.0):
    """Light dholki/tabla/shaker groove on a 2 s bar: D . n . t n . n  (eighths of 0.25 s)."""
    pat = ["D", "", "n", "", "t", "n", "", "n"]
    t = t0
    while t < t1 - 1e-6:
        for i, s in enumerate(pat):
            tt = t + i * BEAT / 2
            if tt >= t1:
                break
            if s == "D":
                music(tt, dhol(), 0.30 * energy, pan=0.0, send=0.12)
            elif s == "n":
                music(tt, tabla_na(520), 0.12 * energy, pan=0.25, send=0.15)
            elif s == "t":
                music(tt, tabla_na(660), 0.10 * energy, pan=-0.25, send=0.15)
            music(tt, shaker(), (0.045 if i % 2 else 0.03) * energy, pan=-0.35 if i % 2 else 0.35, send=0.1)
        t += 2.0


def phrase(notes, t0, make, gain=1.0, pan=0.0, send=0.35):
    for name, b0, bd in notes:
        music(t0 + b0 * BEAT, make(hz(name), bd * BEAT * 1.04), gain, pan, send)


THEME_A = [("A4", 0, 1.5), ("B4", 1.5, 0.5), ("A4", 2, 1), ("F#4", 3, 1), ("G4", 4, 1), ("A4", 5, 1), ("D5", 6, 2)]
THEME_B = [("D5", 0, 1.5), ("E5", 1.5, 0.5), ("D5", 2, 1), ("B4", 3, 1), ("A4", 4, 1), ("F#4", 5, 1), ("D4", 6, 2)]
CHORDS_A = ["D", "D", "G", "D"]
CHORDS_B = ["D", "D", "A", "D"]


def arp(name, t0, step_s=0.25, pattern=(0, 1, 2, 3), gain=0.2, octave=0, bright=0.8):
    notes = CH[name]
    for i, k in enumerate(pattern):
        f = hz(notes[k]) * (2**octave)
        music(t0 + i * step_s, pluck(f, 1.6, decay=3.4, bright=bright), gain, pan=(-0.4 + 0.27 * (i % 4)), send=0.45)


# ================================================================== THE SCORE
S, E = SHOT, END

# ---- ambience beds -------------------------------------------------------------------------
ambience(0, S[10] + 1.0, room_tone, 0.20)  # palace
ambience(S[10] - 1.0, S[13] + 1.0, lambda n: lp(pink(n), 900) * 0.8, 0.16)  # dusk airfield
ambience(S[13] - 0.5, S[16] + 0.6, lambda n: wind(n / SR, 0.9), 0.09)  # window: wind
ambience(S[14] - 0.5, S[16] + 0.6, lambda n: babble(n / SR, 1.0), 0.07)  # lounge murmur
ambience(S[16] - 0.4, S[19] - 0.2, lambda n: lp(pink(n), 1400) * 0.7, 0.09)  # morning outside
ambience(S[16] + 0.5, S[18] + 0.4, lambda n: babble(n / SR, 1.0), 0.045)  # crowd at the school
# chandelier crystals, sparse, shots 1-9
for tt_ in np.sort(rng.uniform(0.4, S[10] - 1, 26)):
    sfx(tt_, bell(float(rng.choice([2093.0, 2349.3, 2637.0, 3136.0])), 1.6, index=0.5, ratio=2.7, decay=3.0), 0.030, pan=float(rng.uniform(-0.8, 0.8)), send=0.5)

# ---- SCENE 1 : The Father's Dream (0 - 12 s) -----------------------------------------------------
sfx(0.20, pan_ramp(whoosh(1.7, 700, 3800, peak=0.5), -0.8, 0.8), 0.20, send=0.25, label="toy jet banks through the foreground")
for i, (n_, off) in enumerate((("D4", 0.0), ("A4", 0.15), ("D5", 0.3), ("F#5", 0.45), ("A5", 0.6))):
    music(0.55 + off, pluck(hz(n_), 1.8, decay=3.0), 0.22, pan=-0.5 + 0.25 * i, send=0.5)
chord_pad("D", 0.4, 2.8, gain=0.13, a=0.9)
# the order (shot 2 at 3.0 s): fanfare
duck(S[2], 0.35, 0.25, 0.4)
for n_, off, d in (("D5", 0, 0.25), ("D5", 0.25, 0.25), ("F#5", 0.5, 0.25), ("A5", 0.75, 1.1)):
    music(S[2] + off, brass(hz(n_), d, 0.95), 0.34, pan=0.0, send=0.35)
for n_ in ("D4", "A4", "D5"):
    music(S[2] + 0.75, brass(hz(n_), 1.1, 0.5), 0.2, send=0.35)
music(S[2], timp(hz("D2"), 1.8), 0.34, send=0.3)
sfx(S[2] + 0.02, cymbal(0.01, 1.4), 0.12, send=0.3)
chord_pad("D", S[2] + 0.2, 3.4, gain=0.12)
oompah(S[2] + 1.0, ["D", "G", "D", "A"] + CHORDS_A + CHORDS_B, 0.62)
groove(S[2] + 1.0, S[4], 0.58)
phrase(THEME_A, S[2] + 1.0, flute, 0.42)
phrase(THEME_B, S[2] + 5.0, flute, 0.42)
# bodyguard (shot 3 at 9.0 s): the low nod and the straightened jacket
music(S[3] + 0.55, brass(hz("D2"), 0.9, 0.9), 0.30, pan=0.1, send=0.3)
for (at,) in [(b,) for b in CFG[3]["bump"]]:
    sfx(S[3] + at, rustle(0.5), 0.55, pan=0.15, label="bodyguard straightens his jacket")

# ---- SCENE 2 : The Search Begins (12 - 23 s) -----------------------------------------------------
sfx(S[4] - 0.35, whoosh(0.9, 900, 5200, peak=0.55), 0.20, send=0.3, label="flash dissolve -> laptop")
sfx(S[4] - 0.05, bell(1760.0, 1.8, index=0.7, ratio=2.7, decay=2.2), 0.08, send=0.5)
units = ["Bm", "Bm", "G", "D", "D", "G", "A", "D", "D", "G", "A"]  # one per second, 12 s .. 23 s
for i, c in enumerate(units):
    t = S[4] + i
    chord_pad(c, t, 1.1, gain=0.075, a=0.25, r=0.5, cutoff=1000)
    base = CH[c]
    for j, k in enumerate((1, 2, 3, 2)):
        music(t + j * 0.25, pluck(hz(base[k]), 0.5, decay=6.0, bright=0.6), 0.11, pan=-0.5 + 0.33 * j, send=0.25)
    music(t, bass_pluck(hz(BASS[c]), 0.8), 0.22, pan=-0.1, send=0.1)
for i in range(len(QUERY)):
    sfx(S[4] + typed_at(i), key_click(float(rng.uniform(0.6, 1.0)), low=QUERY[i] == " "), 0.30, pan=float(rng.uniform(-0.15, 0.15)), send=0.05, label="key" if i in (0, len(QUERY) - 1) else None)
sfx(S[4] + typed_at(len(QUERY) - 1) + 0.22, key_click(1.2, low=True), 0.34, send=0.06, label="Enter")
duck(S[5], 0.30, 0.15, 0.4)
sfx(S[5], ui_ding(), 0.34, send=0.35, label="search result chime")
for n_, off, d in (("A4", 0.05, 0.22), ("B4", 0.27, 0.22), ("D5", 0.49, 0.9)):
    music(S[5] + off, flute(hz(n_), d, 0.7), 0.55, send=0.4)
# shot 6: swagger, the knuckle tap on the desk (synchronised with the camera punch)
for i, n_ in enumerate(["D2", "F#2", "A2", "F#2"] * 2):
    music(S[6] + i * BEAT, bass_pluck(hz(n_), 0.6), 0.26, pan=-0.1, send=0.1)
for p_ in CFG[6]["punch"]:
    sfx(S[6] + p_, desk_tap(), 0.62, send=0.2, label="desk tap (camera punch)")
    duck(S[6] + p_, 0.25, 0.1, 0.3)
for i, n_ in enumerate(["D5", "E5", "F#5", "A5"]):
    music(S[6] + 2.25 + i * 0.22, flute(hz(n_), 0.25, 0.55), 0.5, send=0.4)
sfx(S[7] - 0.9, whoosh(1.0, 400, 6500, peak=0.9, curve=1.4), 0.18, send=0.3)  # riser into the next flash

# ---- SCENE 3 : The First Giant (23 - 35 s) --------------------------------------------------------
sfx(S[7] - 0.3, whoosh(1.0, 600, 4200, peak=0.5), 0.22, send=0.3, label="flash dissolve -> wing emerges")
for i, n_ in enumerate(["D4", "E4", "F#4", "A4", "B4", "D5", "E5", "F#5", "A5", "B5", "D6"]):
    music(S[7] + 0.05 + i * 0.06, pluck(hz(n_), 2.2, decay=2.4, bright=0.9), 0.20, pan=-0.6 + 0.12 * i, send=0.5)
for n_ in ("A5", "D6", "F#6"):
    music(S[7] + 0.7, bell(hz(n_), 2.8, index=1.4, decay=1.2), 0.16, send=0.6)
sfx(S[7] + 0.05, sweep_noise(1.6, 2500, 9000) * np.linspace(0.2, 1, int(1.6 * SR)) * 0.4, 0.10, send=0.4)
u3 = ["Dmaj7", "Dmaj7", "Gmaj7", "Gmaj7"]
for i, c in enumerate(u3):
    chord_pad(c, S[7] + i, 1.4, gain=0.12, a=0.7, r=1.0)
    arp(c, S[7] + 1.0 + i, 0.25, gain=0.17)
music(S[7] + 1.0, flute(hz("A5"), 2.4, 0.6), 0.34, send=0.5)
# shot 8: dive into the map
duck(S[8], 0.30, 0.25, 0.3)
sfx(S[8] - 0.55, whoosh(0.9, 250, 5200, peak=0.9, curve=1.3), 0.26, send=0.3, label="push-through dive into the map")
sfx(S[8] + 0.0, np.sin(2 * np.pi * 55 * t_of(int(1.6 * SR))) * np.exp(-t_of(int(1.6 * SR)) * 2.2), 0.34, send=0.3)
chord_pad("A", S[8], 1.6, gain=0.12, a=0.3)
for c, t in zip(["Dmaj7", "Gmaj7", "A"], (S[8] + 1.5, S[8] + 2.5, S[8] + 3.0)):
    chord_pad(c, t, 1.4, gain=0.11, a=0.6, r=1.0)
for tm, n_ in zip(marker_times(8), ("D6", "F#6", "A6")):
    sfx(tm, bell(hz(n_), 2.4, index=1.0, ratio=3.0, decay=1.6), 0.34, send=0.5, label="map marker ping (shot 8)")
# shot 9: the thinking beat
for c, t in zip(["Bm7", "Em7", "A", "D"], (S[9], S[9] + 1.2, S[9] + 2.4, S[9] + 3.6)):
    chord_pad(c, t, 1.3, gain=0.10, a=0.4, r=0.9, cutoff=1100)
music(S[9] + 0.3, brass(hz("E3"), 0.6, 0.6), 0.2, send=0.25)
music(S[9] + 0.95, brass(hz("D3"), 0.9, 0.6), 0.2, send=0.25)
for tm, n_ in zip(marker_times(9), ("D6", "F#6", "A6")):
    sfx(tm, bell(hz(n_), 2.4, index=1.0, ratio=3.0, decay=1.6), 0.26, pan=0.2, send=0.5, label="map marker ping (shot 9)")
for i, n_ in enumerate(["D4", "F#4", "A4", "F#4", "E4", "G4", "B4", "G4", "F#4", "A4", "D5", "A4"]):
    music(S[9] + 2.5 + i * 0.25, pluck(hz(n_), 0.4, decay=7.0, bright=0.6), 0.14, pan=-0.4 + 0.07 * i, send=0.25)
music(S[9] + 3.0, flute(hz("F#5"), 1.8, 0.45), 0.4, send=0.5)

# ---- SCENE 4 : The Bigger Reveal (35 - 49 s) ---------------------------------------------------------
sfx(S[10] - 0.3, whoosh(0.9, 300, 3800, peak=0.5), 0.20, send=0.3, label="flash dissolve -> first glimpse")
music(S[10], pad([hz("D2"), hz("A2"), hz("D3")], 3.2, a=1.6, r=1.0, cutoff=700, trem=0.55), 0.20, send=0.5)  # low string tremolo
swell = pad([hz("D3"), hz("A3"), hz("F#4")], 3.0, a=2.7, r=0.6, cutoff=1500)
music(S[10], swell, 0.22, send=0.5)
for i in range(7):
    sfx(S[10] + 0.6 + i * 0.35, bell(hz(["A6", "D7", "F#6", "E7", "A6", "D7", "F#7"][i]), 1.5, index=0.8, ratio=2.7, decay=2.6), 0.045 + 0.01 * i, pan=-0.6 + 0.2 * i, send=0.55)
sfx(S[10] + 0.5, jet_pass(5.5, 3.4, 1.1, 0.5) * 0.35, 0.18, pan=0.3, send=0.3, label="distant jet")
sfx(S[11] - 1.1, cymbal(1.1, 2.6), 0.30, send=0.5, label="reveal swell")
duck(S[11], 0.55, 0.45, 0.4)
for n_ in ("D3", "A3", "D4", "F#4"):
    music(S[11], brass(hz(n_), 2.4, 1.0), 0.40, send=0.45)
music(S[11], pad([hz("D4"), hz("F#4"), hz("A4"), hz("E5")], 4.0, a=0.25, r=1.8, cutoff=2200), 0.20, send=0.6)
music(S[11], timp(hz("D2"), 2.2), 0.46, send=0.3)
sfx(S[11], np.sin(2 * np.pi * 48 * t_of(int(2.4 * SR))) * np.exp(-t_of(int(2.4 * SR)) * 1.6), 0.40, send=0.3, label="REVEAL: orchestral chord + sub boom")
sfx(S[11] + 0.04, cymbal(0.0001, 2.2), 0.22, send=0.45)
music(S[11] + 0.6, flute(hz("A5"), 2.6, 0.6), 0.45, send=0.5)
for i, n_ in enumerate(["D4", "F#4", "A4", "D5", "F#5", "A5"]):
    music(S[11] + 1.0 + i * 0.4, pluck(hz(n_), 2.0, decay=2.6, bright=0.8), 0.14, pan=-0.5 + 0.2 * i, send=0.5)
sfx(S[11] + 2.55, bell(659.3, 2.4, index=0.5, ratio=2.0, decay=2.0), 0.07, pan=0.5, send=0.7, label="airport PA chime")  # E5 -> C5, distant
sfx(S[11] + 2.95, bell(523.3, 2.8, index=0.5, ratio=2.0, decay=1.8), 0.06, pan=0.5, send=0.7)
chord_pad("A", S[12] - 1.6, 1.6, gain=0.10, a=0.8)
# shot 12: the shock
for p_ in CFG[12]["punch"]:
    tm = S[12] + p_
    duck(tm, 0.72, 0.18, 2.0)
    for n_ in ("C#3", "E3", "G3", "Bb3"):
        music(tm, brass(hz(n_), 1.4, 1.0), 0.40, send=0.5)
    music(tm, timp(hz("C#2"), 2.0), 0.52, send=0.3)
    music(tm, pad([hz("C#3"), hz("E3"), hz("G3"), hz("Bb3")], 1.4, a=0.05, r=1.0, cutoff=2000), 0.18, send=0.5)
    sfx(tm, np.sin(2 * np.pi * 42 * t_of(int(1.6 * SR))) * np.exp(-t_of(int(1.6 * SR)) * 2.4), 0.36, send=0.3, label="SHOCK stinger (camera punch)")
    sfx(tm + 0.02, cymbal(0.0001, 1.2), 0.16, send=0.45)
music(S[12] + 2.2, pad([hz("D3"), hz("A3"), hz("F#4")], 3.2, a=1.2, r=1.2, cutoff=1100), 0.22, send=0.55)
sfx(S[12] + 0.6, lp(pink(int(2.8 * SR)), 700) * np.hanning(int(2.8 * SR)), 0.10, send=0.3)  # airfield air under the held breath

# ---- SCENE 5 : Sheru Bhai's Realisation (49 - 67 s) ------------------------------------------------------
prog5 = [("Dadd9", 49), ("Bm7", 51), ("Gmaj7", 53), ("Bm", 55), ("G", 57), ("A", 59), ("G", 61), ("A", 63), ("D", 64), ("A", 66)]
ends5 = [51, 53, 55, 57, 59, 61, 63, 64, 66, 67]
for (c, a_), b_ in zip(prog5, ends5):
    chord_pad(c, a_ - 0.4, (b_ - a_) + 0.4, gain=0.22 if a_ < 61 else 0.19, a=1.0, r=1.0, cutoff=1050 if a_ < 61 else 1500)
# shot 13: lonely piano
for i in range(int((S[14] - S[13]) / BEAT)):
    c = [("Dadd9", 49), ("Bm7", 51), ("Gmaj7", 53)][min(2, int(i * BEAT / 2))][0]
    k = [0, 1, 2, 3, 2, 1, 2, 1][i % 8]
    music(S[13] + i * BEAT, epiano(hz(CH[c][k]), 2.4, 0.55 + 0.08 * math.sin(i)), 0.36, pan=-0.2 + 0.4 * ((i % 4) / 3), send=0.5)
sfx(S[13] + 3.2, jet_pass(5.0, 2.5, 0.9, 0.4) * 0.30, 0.18, pan=-0.4, send=0.35, label="jet far across the glass")
# shot 14: the quiet verdict
for i, n_ in enumerate(["B2", "B2", "G2", "G2", "A2", "A2"]):
    music(S[14] + i, brass(hz(n_), 0.95, 0.5), 0.26, pan=-0.2, send=0.3)
    music(S[14] + i, epiano(hz(n_) * 2, 1.6, 0.5), 0.20, pan=0.2, send=0.5)
sfx(S[14] + 2.2, bell(2637.0, 1.6, index=0.3, ratio=2.2, decay=3.5), 0.10, pan=0.6, send=0.5, label="glass clink")
sfx(S[14] + 2.22, bell(3951.0, 1.2, index=0.3, ratio=2.2, decay=5.0), 0.05, pan=0.6, send=0.5)
# shot 15: the decision, warming up
music(S[15], flute(hz("A5"), 1.6, 0.4), 0.30, send=0.5)
for i, n_ in enumerate(["D4", "G4", "B4", "D5", "G5"]):
    music(S[15] + 1.0 + i * 0.12, pluck(hz(n_), 2.2, decay=2.4), 0.12, pan=-0.4 + 0.2 * i, send=0.5)
phrase([("D5", 0, 1), ("B4", 1, 1), ("A4", 2, 1), ("B4", 3, 1), ("D5", 4, 2), ("F#5", 6, 2)], S[15] + 1.0, flute, 0.50)
music(64.0, pad([hz("D3"), hz("A3"), hz("D4"), hz("F#4"), hz("A4")], 3.0, a=0.2, r=1.2, cutoff=2400), 0.17, send=0.55)
sfx(64.0, bell(hz("D6"), 3.0, index=1.0, decay=1.1), 0.10, send=0.6, label="'join my son' lift: D major")
# drive into the morning
for i in range(32):
    tm = 64.5 + i * 0.078
    if tm < S[16]:
        music(tm, tabla_na(560 + 6 * i), 0.07 + 0.004 * i, pan=0.2, send=0.1)
sfx(S[16] - 1.2, cymbal(1.2, 1.4), 0.22, send=0.45)

# ---- SCENE 6 : The Final Decision (67 - 74 s) ----------------------------------------------------------------
sfx(S[16] - 0.5, whoosh(1.1, 500, 7000, peak=0.5), 0.22, send=0.3, label="flash dissolve -> morning")
duck(S[16], 0.3, 0.2, 0.4)
for n_, off, d in (("D5", 0, 0.25), ("D5", 0.25, 0.25), ("F#5", 0.5, 0.25), ("A5", 0.75, 0.9)):
    music(S[16] + off, brass(hz(n_), d, 0.95), 0.34, send=0.35)
for n_ in ("D4", "A4", "D5"):
    music(S[16] + 0.75, brass(hz(n_), 0.9, 0.5), 0.2, send=0.35)
music(S[16], timp(hz("D2"), 1.6), 0.36, send=0.3)
oompah(S[16], CHORDS_A + CHORDS_A, 0.85)
groove(S[16], S[16] + 4.0, 0.85)
phrase(THEME_A, S[16] + 0.5, flute, 0.55)
chord_pad("D", S[16] + 0.2, 3.2, gain=0.15)
# morning birds
for tm, f0, f1 in ((67.4, 3100, 4200), (67.58, 3400, 4600), (67.78, 3000, 4300), (68.9, 3600, 2900), (69.1, 3800, 3000), (70.1, 3300, 4400), (70.28, 3500, 4700), (70.5, 3200, 4500)):
    sfx(tm, chirp(f0, f1, 0.11), 0.035, pan=float(rng.uniform(-0.9, 0.9)), send=0.3)
# footsteps: the walk cycle in shot 17 (1.9 steps per second, synchronised to the camera bob)
if CFG[17]["walk"]:
    k0 = math.ceil(S[17] * 1.9)
    k = k0
    while k / 1.9 < E[17] + 0.4:
        tm = k / 1.9
        sfx(tm, step(1.0), 0.20, pan=-0.2, send=0.2, label="footstep (adult)" if k == k0 else None)
        sfx(tm + 0.18, step(0.55), 0.13, pan=0.2, send=0.2)
        k += 1
# shot 18: the airliner takes off; strings and brass climb to the card
sfx(S[18] - 0.15, jet_pass(3.6, 1.7, 0.9, 1.0) * 0.5, 0.20, pan=0.35, send=0.3, label="airliner climbs away")
oompah(S[18] - 0.5, ["G", "A", "A"], 0.6)
for c, t in (("G", S[18] - 0.5), ("A", S[18] + 0.5), ("A", S[18] + 1.5)):
    chord_pad(c, t, 1.2, gain=0.17, a=0.3, r=0.8, cutoff=1800)
phrase([("A5", 0, 1), ("B5", 1, 1), ("D6", 2, 1.5), ("F#6", 3.5, 0.5)], S[18] - 0.5, flute, 0.55)
music(S[18] - 0.5, pad([hz("D4"), hz("A4"), hz("D5")], 3.0, a=2.2, r=0.4, cutoff=2600, trem=0.35), 0.18, send=0.5)
for i in range(24):
    tm = S[18] + 0.6 + i * 0.0625
    music(tm, shaker(), 0.03 + 0.003 * i, pan=0.3 if i % 2 else -0.3, send=0.1)
sfx(S[19] - 1.3, cymbal(1.3, 0.6), 0.20, send=0.45)

# ---- the end card (74 - 82 s) ------------------------------------------------------------------------------------
sfx(S[19] - 0.45, whoosh(0.9, 400, 2400, peak=0.4), 0.16, send=0.3, label="dip to charcoal")
duck(S[19], 0.4, 0.15, 0.3)
for n_ in ("D3", "A3", "D4", "F#4", "A4"):
    music(S[19], brass(hz(n_), 2.0, 0.9), 0.32, send=0.5)
music(S[19], timp(hz("D2"), 2.4), 0.42, send=0.3)
sfx(S[19], np.sin(2 * np.pi * 50 * t_of(int(2.2 * SR))) * np.exp(-t_of(int(2.2 * SR)) * 1.8), 0.34, send=0.3, label="CARD: resolve on D add9")
sfx(S[19], cymbal(0.0001, 3.0), 0.18, send=0.5)
chord_pad("Dadd9", S[19] + 0.3, 7.2, gain=0.20, a=0.5, r=1.8, cutoff=1800)
title_t, rule_t, a_t, g_t, b_t, q_t = [S[19] + t for t in CARD_T0[4:10]]
for n_, off in (("D5", 0), ("A5", 0.08), ("D6", 0.16), ("F#6", 0.24)):
    sfx(title_t + off, bell(hz(n_), 3.2, index=1.2, decay=1.0), 0.16, send=0.6, label="title rises" if off == 0 else None)
sfx(rule_t, whoosh(0.7, 1500, 6000, peak=0.5), 0.07, send=0.4)
for tm, n_ in ((a_t, "A5"), (g_t, "F#5"), (b_t, "D6"), (q_t, "A5")):
    sfx(tm + 0.1, bell(hz(n_), 2.4, index=0.7, ratio=2.7, decay=1.5), 0.10, send=0.6)
for i, n_ in enumerate(["D4", "A4", "F#4", "A4", "E4", "A4", "F#4", "A4", "D4", "A4", "F#4", "A4", "E4", "A4", "F#4", "A4"]):
    music(S[19] + 1.5 + i * 0.5, pluck(hz(n_) * 2, 2.0, decay=2.6, bright=0.8), 0.11, pan=-0.3 + 0.2 * (i % 4), send=0.55)
music(q_t, flute(hz("D6"), 2.6, 0.45), 0.30, send=0.6)

# ---- subtle shimmer on every visible gold glint ---------------------------------------------------------------------------
for n in sorted(CFG):
    for at, _d in CFG[n]["glint"]:
        f = float(rng.choice([1568.0, 1760.0, 2093.0, 2349.3]))
        sfx(S[n] + at + 0.2, bell(f, 1.4, index=0.5, ratio=2.7, decay=2.6), 0.040, pan=float(rng.uniform(-0.7, 0.7)), send=0.55)

# ---- transition sweeps from the timeline (flash/dip/push already placed by hand above; add the soft dissolves) -------------------
for s in TL["shots"]:
    if s["in"]["type"] == "dissolve":
        c = S[s["n"]]
        sfx(c - 0.25, whoosh(0.7, 250, 1800, peak=0.5) * 0.7, 0.07, send=0.3)

# ================================================================== MIX + MASTER
mus = MUS * DIP[:, None]
dry = mus + FXB
# hall reverb on the send bus
ir_len = int(3.2 * SR)
ti = t_of(ir_len)
ir = np.stack([lp(noise(ir_len), 6500), lp(noise(ir_len), 6500)], -1) * np.exp(-ti * 2.0)[:, None]
ir[: int(0.014 * SR)] = 0
ir /= np.sqrt((ir**2).sum(0))
wet = np.stack([fftconvolve(SEND[:, c], ir[:, c])[:N] for c in range(2)], -1)
out = dry * 0.85 + wet * 0.34
lows = lp(out, 120)
out = hp(out - 0.35 * lows, 28)  # tame sub build-up
out = out + 0.30 * hp(out, 3200, 1)  # gentle high shelf (~+2 dB): clarity on phone speakers
out = fade(out, 0.03, 1.6)

meter = pyln.Meter(SR)
TARGET, CEIL = -14.0, 10 ** (-1.0 / 20)  # social-platform loudness, -1 dBFS ceiling
base = out / np.abs(out).max()
lo, hi = 0.3, 9.0
for _ in range(32):
    mid = (lo + hi) / 2
    y = np.tanh(base * mid) / np.tanh(mid) * CEIL
    lo, hi = (mid, hi) if meter.integrated_loudness(y) < TARGET else (lo, mid)
out = np.tanh(base * lo) / np.tanh(lo) * CEIL
print(f"master: {meter.integrated_loudness(out):.1f} LUFS, limiter drive {lo:.2f}, peak {np.abs(out).max():.3f}")

args = sys.argv[1:]
stem_dest = None
if "--stem" in args:
    i = args.index("--stem")
    stem_dest = Path(args[i + 1])
    del args[i : i + 2]
dest = Path(args[0] if args else ROOT / "public" / "audio" / "sheru-bhai-score.wav")
dest.parent.mkdir(parents=True, exist_ok=True)
wavfile.write(dest, SR, (np.clip(out, -1, 1) * 32767).astype(np.int16))
print(f"wrote {dest}  ({DUR:.2f} s, {SR} Hz stereo)")
print("\nsynchronised cue points (s):")
for t_, label in sorted(CUES):
    print(f"  {t_:7.2f}  {label}")

if stem_dest:
    # music bus alone (same hall reverb, EQ and fades as the master, none of the picture-synced effects),
    # peak-normalised to -3 dBFS; the film assembler sets the final level.
    wet_m = np.stack([fftconvolve(SEND_M[:, c], ir[:, c])[:N] for c in range(2)], -1)
    stem = mus * 0.85 + wet_m * 0.34
    stem = hp(stem - 0.35 * lp(stem, 120), 28)
    stem = stem + 0.30 * hp(stem, 3200, 1)
    stem = fade(stem, 0.03, 1.6)
    stem = stem / np.abs(stem).max() * 10 ** (-3.0 / 20)
    stem_dest.parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(stem_dest, SR, (np.clip(stem, -1, 1) * 32767).astype(np.int16))
    print(f"wrote {stem_dest}  (music bus only, {DUR:.2f} s)")
