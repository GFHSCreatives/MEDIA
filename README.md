# GLOBAL — "First Light" · cinematic aviation logo intro

## Photo restoration (4K masters)

Fourteen GLOBAL operations / academy photos are restored from ~1024×576 JPEG
sources to **3840×2160 lossless PNG** via
[xinntao/Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN).

| Path | Contents |
|---|---|
| `assets/source-photos/` | Original uploads |
| `out/restored/*_restored_4k.png` | 4K PNG masters |
| `out/restored/*_restored_4k_preview.jpg` | Quality-95 previews |
| `scripts/restore_images.py` | Batch pipeline |
| `scripts/README_restore.md` | GitHub install + run notes |

```bash
python3 scripts/restore_images.py   # requires tools/Real-ESRGAN + weights (see README_restore.md)
```

---


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

---

# Diwali 2026 reel — vertical 9:16

A 15-second, 24 fps vertical film (Instagram Reels / YouTube Shorts) built in the same pipeline.

| Deliverable | File |
|---|---|
| Master video, 1080×1920 H.264 + AAC | `out/gsa-diwali-reel-1080x1920.mp4` |
| End-card still | `out/gsa-diwali-endcard.png` |
| Score, 48 kHz stereo (−14 LUFS for social, −1 dBFS peak) | `public/audio/diwali-score.wav` |

For 4K UHD (2160×3840): `npx remotion render DiwaliReel out/gsa-diwali-reel-4k.mp4 --scale=2`.
The canvases render at device pixel ratio and the logo is vector, so the 4K output is natively sharp.

| Time | Frames | Scene |
|---|---|---|
| 0–2.9 s | 0–69 | **01 Aviation world.** Night aerial glide over the academy: runway edge, threshold and approach lights with sequenced strobes, blue taxiway, floodlit apron with the trainer jet, hangar, control tower, coconut palms, Diwali light strings on every building. A jet with landing lights descends over the camera. Distant fireworks. |
| 2.9–5.6 s | 70–133 | **02 The celebration.** Five professionals on the academy terrace, watching the display: a pilot (white shirt, epaulettes, peaked cap), three cabin crew (black uniforms, orange scarves and piping), and a professional (black jacket, orange detailing). Fireworks rim-light them. Diyas and marigold garlands line the parapet, and out-of-focus festoon lights hang in front of the camera. Slow dolly-in with parallax. |
| 5.1–9.7 s | 122–232 | **03 The magical flight.** The camera tilts up after a rising golden shell. Its trail turns from gold to brand orange, ignites at the arc's tip, and the jet flies the exact logo arc. The arc paints in behind it and sheds embers. |
| 10.0–12.0 s | 240–288 | **04 Grand reveal.** A golden halo blooms. 4,520 golden particles, sampled from the official artwork, converge onto it, and the exact vector logo resolves sharp. |
| 12.4–15.0 s | 298–359 | **05 Greeting.** "WISHING YOU A / PROSPEROUS & SAFE DIWALI" in Montserrat (SIL OFL), with a gold rule. Fireworks continue behind the logo, outside a keep-clear zone, and orange motes drift. |

The firework cue sheet (`src/diwali/fireworks.json`) drives both the picture and the score, so every burst
has its boom and crackle on the same frame. The tempo is 96 BPM, so one beat is exactly 15 frames.

**About the people in Scene 02:** this pipeline renders in code and cannot generate photorealistic human faces.
The five professionals are staged from behind, as rim-lit silhouettes watching the fireworks. That avoids
uncanny faces and keeps their uniforms recognizable. To use filmed or AI-generated footage instead, replace
`<Celebration />` in `src/diwali/DiwaliReel.tsx` with an `<OffthreadVideo>` covering frames 70–170.

---

# Sheru Bhai — The Aviation Mission · storyboard stills (9:16)

Nineteen 1080 × 1920 stills in story order, built from the supplied *Expanded Storyboard* PDF:
frames 01–18 are its story frames upscaled 2× from 540 × 960 (no generative fill), and frame 19
(the brand card) is re-rendered natively from the PDF's vector page.

| Path | Contents |
|---|---|
| `out/storyboard/sheru-bhai/frame-01.png` … `frame-19.png` | The stills |
| `out/storyboard/sheru-bhai/contact-sheet.jpg` | All 19 at a glance |
| `out/storyboard/sheru-bhai/README.md` | Provenance, frame index, dialogue, check against the brief |
| `assets/storyboard-source/sheru-bhai/` | The source PDF and the 18 extracted 540 × 960 frames |
| `scripts/storyboard_frames.py` | Rebuilds everything, or one frame with `--frame N` |

```bash
python3 scripts/storyboard_frames.py assets/storyboard-source/sheru-bhai/Sheru-Bhai-Expanded-Storyboard.pdf
```

---

# Sheru Bhai — The Aviation Mission · animated storyboard (9:16)

The 19 storyboard stills, animated into an **82-second vertical film** (1080 × 1920, 24 fps, H.264 + AAC)
with an original score and sound design. Scene timings follow the storyboard PDF:
00:00 · 00:12 · 00:23 · 00:35 · 00:49 · 01:07 · 01:14, then the 8-second brand card.

| Deliverable | File |
|---|---|
| Captioned master | `out/sheru-bhai-animatic-1080x1920.mp4` |
| Clean version (no captions), for voice-over | `out/sheru-bhai-animatic-clean-1080x1920.mp4` |
| Dialogue as subtitles (SRT) | `out/sheru-bhai-dialogue.srt` |
| Score and sound design, 48 kHz stereo, −14 LUFS | `public/audio/sheru-bhai-score.wav` |

## What this is, and what it is not

Every frame is the exact still from `out/storyboard/sheru-bhai/`. Nothing is re-generated, so the faces, suits,
jewellery, the toy jet and the sign in frame 17 are exactly as delivered. The animation is **cinematic camera work plus
effects**, not character performance: the characters do not blink, speak or walk. What moves:

- a virtual camera over each still: slow push-ins, pans, a pull-back reveal, a punch-in on the shock, a walking bob
- effects built from each frame's own pixels: gold glints that sweep only across the gold (chains, embroidery, trim),
  twinkling lights, sparkle stars on specular highlights, drifting dust, and mist that clears from the terminal
- hero moments: the search bar types the guard's query, the map lights up from the monument and the three markers
  burst on, the real airliner in frame 18 climbs away and leaves a contrail, and the brand card builds line by line
- dialogue captions that spell out each line word by word (the cast has no voices); the clean version has none

## Shot by shot

| # | Time | Shot | Motion and effects |
|---|---|---|---|
| 01 | 0:00 | The toy jet | fade up from black, slow push-in; the toy jet whooshes through the foreground |
| 02 | 0:03 | The order | slow push toward Sheru's pointing hand; brass fanfare on the cut |
| 03 | 0:09 | The bodyguard listens | push-in with a small nudge as he straightens his jacket |
| 04 | 0:12 | The search | the search field types "best aviation college in India", with key clicks |
| 05 | 0:15 | The college result | drift toward the screen; search-result chime |
| 06 | 0:19 | The price | push-in; the desk tap lands with a camera punch at 0:20.75 |
| 07 | 0:23 | The wing emerges | push-in; light washes across the map's gold outline from the plinth |
| 08 | 0:26.5 | Three branches | push-through dive into the map, then a pull-out; a light wave and three marker pings |
| 09 | 0:30 | Only three? | slow push; the same light wave across the small map |
| 10 | 0:35 | The first glimpse | pan from the wing to the terminal as the dusk haze clears |
| 11 | 0:38 | The full reveal | pull-back from the monument to the full airport; orchestral chord and sub boom |
| 12 | 0:43.5 | "What?! Thirty-plus airports?" | punch-in on the cut with a shock stinger, then a held breath |
| 13 | 0:49 | Taking it in | slow push toward the window; runway lights twinkle |
| 14 | 0:55 | The verdict | slow drift; lounge murmur and a glass clink |
| 15 | 1:01 | The decision | slow push toward the cub; the score warms to D major on "join my son" |
| 16 | 1:07 | Arrival | flash-dissolve into the morning; theme returns in full |
| 17 | 1:09 | Through the doors | follow shot with a walking bob; footsteps in step with it (no effects touch the sign) |
| 18 | 1:11.5 | The dream takes flight | the airliner climbs away, leaving a contrail; crescendo into the card |
| 19 | 1:14 | Final brand card | the exact card, revealed band by band; resolves on D add9 |

## How the sync works

The picture and the score read the same data, so they cannot drift apart:

- `src/sheru/timeline.json`: shot boundaries, transitions, captions (120 BPM grid, so every cut is on a beat)
- `src/sheru/shots.ts`: per-shot camera, glints, camera punches and bumps, the walk cycle
- `scripts/make_sheru_audio.py` parses `shots.ts`, `fx.tsx` and `BrandCard.tsx` and places the typing clicks, the
  desk tap, each map marker's ping, the footsteps and the title chimes on the exact frame the picture shows them

Edit the picture's timing, re-run the audio script, and the sound follows.

## Rebuild

```bash
npm run sheru:frames    # stills (only if the storyboard PDF changes)
npm run sheru:prep      # effect masks and points from the stills (also copies the stills into public/)
npm run sheru:audio     # score and sound design
npm run sheru:srt       # dialogue subtitles
npm run sheru:studio    # live preview, composition "SheruBhaiAnimatic"
npm run sheru:render    # captioned master + clean version
```

The stills are 1080 × 1920, so a 4K render (`--scale=2`) is an up-scale of the pictures. The captions, brand-card
text and effects render natively sharp.

## Going further: real character animation

To make the characters themselves move (blinks, lip-sync, walking), run each of the 18 stills through an
image-to-video model. The timeline, captions, score and brand card here can then be reused unchanged: replace the
still in `ShotView` (`src/sheru/SheruBhai.tsx`) with the generated clip for that shot.
