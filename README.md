# GLOBAL — "First Light" · cinematic aviation logo intro

A 14-second, 1920×1080 / 30 fps logo intro for **GLOBAL — GHA & School of Aviation**, built from the official logo artwork
(`assets/global-logo-original.png`: arc, GLOBAL wordmark, tagline and ® mark).
It is rendered entirely in code (Remotion + Three.js) and uses an original synthesized soundtrack.

| Deliverable | File |
|---|---|
| Master video, H.264 1080p30 with stereo AAC audio | `out/global-intro-1080p.mp4` |
| End-card still (poster or thumbnail) | `out/global-endcard.png` |
| Soundtrack stem, 48 kHz stereo WAV (−16 LUFS integrated, −1.5 dBFS peak) | `public/audio/global-intro-score.wav` |
| Vectorized logo layers (arc, each letter, each tagline glyph, ®, sampled ink colors) | `src/logoPaths.ts` |

## The concept

The orange arc in the logo is used as two things at once: a sunrise breaking over the curve of the Earth, and a flight path.

| Time | Frames | Shot |
|---|---|---|
| 0.0 – 3.7 s | 0 – 111 | **Blue hour.** The camera climbs out of a cloud deck into a pre-dawn sky. Stars fade and the horizon starts to glow. |
| 3.7 – 6.5 s | 112 – 195 | **Overtake.** A twin-jet in GLOBAL livery (white body, orange tail and engine lips) passes over the camera. It trails twin contrails and banks down toward the cloud tops. The camera shakes slightly as it passes, then follows the jet. |
| 6.5 – 8.5 s | 196 – 256 | **The arc.** The jet pulls up and flies the exact curve of the logo arc across the rising sun. Its wake becomes the arc: white-hot at first, then cooling to the brand gradient. |
| 8.0 – 9.7 s | 240 – 292 | **First light.** The sun clears the horizon and its light fills the frame until it turns white. The arc stays on screen in its original colors. |
| 9.0 – 11.0 s | 270 – 334 | **The flight line.** A thin orange line draws across at the height of the gaps in the "O". The letters G-L-O-B-A-L open up and down from that line, starting at the O and moving outward. The line then shrinks back into the O. |
| 10.7 – 11.8 s | 322 – 356 | **Tagline.** "GHA & School of Aviation" rises into place glyph by glyph, left to right, with a light tracking-in. |
| 11.2 – 14.0 s | 336 – 419 | **Hero hold.** A light glint runs along the arc and finishes at the ®, which pops in with a small orange flare. The camera pushes in slightly. The final frame is the official logo on white. |

### Matching the jet to the logo

The arc's centerline is taken from the artwork and projected into 3D through the final camera at a fixed depth
(`src/flight.ts → ARC_WORLD`). The jet's flight path (a centripetal Catmull-Rom spline) runs through those points. That means the 3D jet is at the
same spot on screen as the leading edge of the 2D arc in every frame. The speed along the path is matched to arc length: a fast
pass, a cubic-Hermite slowdown into the turn, then a constant speed along the arc.

## Research notes

**YouTube.** This build environment can't reach `youtube.com`. Web search only returned titles and descriptions, so I could
not watch or frame-step the three reference tutorials in the brief. What I could find from search:
- Typical structures: fly-through reveals (moving through a logo-shaped opening), particle and cloud reveals
  (e.g. Trapcode Particular, PFlow/Krakatoa gas-cloud logo builds), "cumulus clouds logo reveal" templates, and
  2D-to-3D logo fly-ins.
- The usual pattern in these is a 2–4 s atmospheric build, one big motion beat, a light flash or bloom at the reveal, then a 2–3 s
  hold with a glint. Sound is usually a low drone, a whoosh on the motion beat, a sub-bass impact on the reveal and a shimmer tail.

This piece follows that general grammar without copying any particular template. It adds two ideas from aviation
films: a long-lens overtake with contrails, and a low sun that produces anamorphic flare and god rays.

**GitHub, reviewed and used:**
- [remotion-dev/remotion](https://github.com/remotion-dev/remotion): frame-accurate React video rendering, used for compositing, audio and encoding.
- [remotion-dev/skills](https://github.com/remotion-dev/skills): I followed its `3d.md` rules. All 3D content sits inside `<ThreeCanvas>`, nothing animates on its
  own (no `useFrame`), and everything is driven by `useCurrentFrame()`. I also looked at the `light-leaks`, `motion-blur` and `sfx` guidance.
- [mrdoob/three.js](https://github.com/mrdoob/three.js) and [pmndrs/react-three-fiber](https://github.com/pmndrs/react-three-fiber), via `@remotion/three`: sky shader, instanced volumetric cloud billboards, the
  procedural aircraft and the contrail ribbons.
- `potracer` (a pure-Python port of Potrace) was used to vectorize the wordmark, tagline and ®. The arc is fitted analytically (polynomial centerline
  plus thickness) so its edges stay clean at 4K.
- GSAP was considered but not used. Remotion's `useCurrentFrame()` with the deterministic easing in `src/flight.ts` gives the same
  control and stays frame-exact in parallel renders. A GSAP timeline would have to be scrubbed manually each frame.

## Project layout

```
assets/global-logo-original.png   original logo (source of truth)
scripts/vectorize_logo.py         PNG → src/logoPaths.ts (arc fit + traced letters + sampled gradient)
scripts/make_textures.py          procedural cloud-puff atlas + glow sprite → public/textures/
scripts/make_audio.py             sound design / score → public/audio/global-intro-score.wav
scripts/preview-stills.mjs        render a set of key frames for review
src/timeline.ts                   master cue sheet (all scenes + audio key off this)
src/flight.ts                     camera rig, flight path, sun, logo placement, projections
src/three/                        Sky, Clouds, Aircraft, Contrails, SkyScene (Three.js)
src/overlays/                     LogoLayers (arc reveal, flight line, letters, sheen), Atmosphere (flare, flood, grain…)
src/GlobalIntro.tsx               final composite
```

## Rendering

```bash
npm install
npm run studio                    # live preview in Remotion Studio
npm run render                    # → out/global-intro-1080p.mp4
npx remotion render GlobalIntro out/global-intro-4k.mp4 --scale=2       # 3840×2160 UHD (all layers are vector or procedural)
npx remotion still LogoEndCard out/global-endcard.png
```

`remotion.config.ts` uses the software ANGLE renderer (`swangle`) so WebGL renders the same way on machines without a GPU.
On a workstation with a GPU, switch it to `"angle"` for faster renders. If Remotion can't download its headless browser (for
example in an offline CI job), set `REMOTION_BROWSER=/path/to/chrome-headless-shell`.

To regenerate assets: `npm run vectorize`, `python3 scripts/make_textures.py`, `npm run audio`
(requires `numpy scipy pillow potracer pyloudnorm`).

### Customizing

- **Timing:** change the cue frames in `src/timeline.ts`. If you move any cue, update the matching times at the top of
  `scripts/make_audio.py` too.
- **Logo size and position:** `LOGO_SCREEN_WIDTH` in `src/flight.ts`. The jet's arc path follows automatically.
- **New logo artwork:** replace `assets/global-logo-original.png` and run `npm run vectorize`. The script expects three ink rows (® beside the arc, wordmark, tagline).
- **Livery colors:** `src/three/Aircraft.tsx`.
- **No audio:** render with `--props='{"withAudio":false}'`.

## Licensing and assets

- Every visual element is original and generated in code: the sky model, clouds, aircraft, flare and grain. No stock footage, templates or
  third-party models are used. The soundtrack is synthesized by `scripts/make_audio.py`, with no samples.
- The GLOBAL logo belongs to its owner.
- **Remotion license:** Remotion is free for individuals, non-profits and companies with up to 3 employees. Larger
  organizations need a [Remotion company license](https://www.remotion.pro/license) to render with it.
  Three.js and React Three Fiber are MIT-licensed.
