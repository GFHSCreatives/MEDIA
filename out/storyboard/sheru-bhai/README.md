# Sheru Bhai — The Aviation Mission · storyboard stills

Nineteen full-bleed 9:16 portrait stills, **1080 × 1920 PNG**, in story order:
`frame-01.png` … `frame-19.png`. `contact-sheet.jpg` shows all 19 at a glance, and
`manifest.json` lists each file's source, size and fidelity numbers.

> These stills are also animated: see `out/sheru-bhai-animatic-1080x1920.mp4` (and the clean version) and the
> "animated storyboard" section of the top-level README.

## Where the frames come from

- **Frames 01–18** are the story frames embedded in the supplied *Expanded Storyboard* PDF
  (`assets/storyboard-source/sheru-bhai/`). The PDF stores them at 540 × 960, so they are
  **upscaled 2× to 1080 × 1920**: Lanczos resample, iterative back-projection so the result stays
  consistent with the source pixels, edge-aware halo-limited sharpening, and a whisper of luminance
  grain that keeps the dusk skies free of banding. Nothing is generated or invented, and each file
  shrunk back to 540 × 960 differs from its source by only 0.5–1.2 levels on average
  (`mean_abs_diff` in `manifest.json`). The result is sharper than a plain stretch but carries the
  detail of the 540 × 960 source. For more, use the original full-resolution generations if you have
  them.
- **Frame 19** (brand card) is vector in the PDF, so it is re-rendered natively at 1080 × 1920 with
  the exact copy.

Rebuild everything, or a single frame (`FRAME = 6`):

```bash
python3 scripts/storyboard_frames.py assets/storyboard-source/sheru-bhai/Sheru-Bhai-Expanded-Storyboard.pdf
python3 scripts/storyboard_frames.py assets/storyboard-source/sheru-bhai/Sheru-Bhai-Expanded-Storyboard.pdf --frame 6
```

## Check against the written brief

All 18 story frames follow their described composition, the character continuity (ivory three-piece
suit, gold chains and lion medallion, aviators; the cub's ivory suit, gold tie and silver toy jet;
the buffalo's black suit and earpiece), and the sign in frame 17 reads exactly
GLOBAL SCHOOL OF AVIATION. One difference:

- **Frame 06 — "He peers over his aviators."** Sheru wears the aviators over his eyes instead of
  peering over them. The tap on the desk, the lean forward and the amused half-smile are as briefed.

## Frame index

Shot names are from the brief. Scene timings and dialogue are from the PDF
(suggested total runtime 82 s).

| # | Shot | PDF label | Scene · time |
|---|---|---|---|
| 01 | The toy jet | Close-up | 1 · The Father's Dream · 00:00–00:12 |
| 02 | The order | Wide shot | 1 |
| 03 | The bodyguard listens | Reverse angle | 1 |
| 04 | The search | Insert | 2 · The Search Begins · 00:12–00:23 |
| 05 | The college result | Over the shoulder | 2 |
| 06 | The price | Reaction | 2 |
| 07 | The wing emerges | Transition | 3 · The First Giant · 00:23–00:35 |
| 08 | Three branches | Wide shot | 3 |
| 09 | Only three? | Reaction | 3 |
| 10 | The first glimpse | Reveal begins | 4 · The Bigger Reveal · 00:35–00:49 |
| 11 | The full reveal | Extreme wide | 4 |
| 12 | "What?! Thirty-plus airports?" | Close-up | 4 |
| 13 | Taking it in | Window view | 5 · Sheru Bhai's Realisation · 00:49–01:07 |
| 14 | The verdict | Two-shot | 5 |
| 15 | The decision | Close two-shot | 5 |
| 16 | Arrival | Establishing shot | 6 · The Final Decision · 01:07–01:14 |
| 17 | Through the doors | Following shot | 6 |
| 18 | The dream takes flight | Profile close-up | 6 |
| 19 | Final brand card | — | End card |

## Dialogue (from the PDF)

1. **Sheru Bhai:** My son wants to build a career in aviation. Find me the best aviation college in India. I am ready to buy one!
2. **Bodyguard:** Sir, we have found Global School of Aviation! — **Sheru Bhai:** Good! Find out how much it costs. I want to buy it!
3. **Bodyguard:** Sir, Global School of Aviation has three branches in India! — **Sheru Bhai:** Only three branches? Interesting! Let's investigate further.
4. **Bodyguard:** Sir! There is something much bigger behind it! Global Flight Handling Services operates across 30+ airports in India! — **Sheru Bhai:** What?! Thirty-plus airports?
5. **Sheru Bhai:** I came here to buy an aviation college... but this is much bigger than I imagined! — **Bodyguard:** Sir, I don't think we can buy this company! — **Sheru Bhai:** Then forget buying it. Let's join my son there!
6. **Sheru Bhai:** Son, this is where your aviation journey begins!

## Frame 19 copy

GLOBAL SCHOOL OF AVIATION
A Training & Talent Development Unit of
GLOBAL FLIGHT HANDLING SERVICES PVT. LTD.
3 Branches | 30+ Airports
"Don't just dream of aviation. Be part of the aviation industry!"
