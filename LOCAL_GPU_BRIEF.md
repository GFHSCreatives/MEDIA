# Brief: animate the Sheru Bhai storyboard on a local GPU

**For a Claude session running on the user's own Windows PC** (the cloud session that wrote this has no GPU).
Paste this into that session:

> Clone `https://github.com/GFHSCreatives/MEDIA` (branch `claude/aviation-logo-intro-video-0e18em`, `git clone --depth 1 --branch …`)
> into `D:\video-edits\sheru-bhai`, read `LOCAL_GPU_BRIEF.md` in it and follow it.

## The job

Turn the 18 story frames of *Sheru Bhai – The Aviation Mission* into real character animation: the lion, the cub and
the buffalo bodyguard must **act the script** (move, gesture, turn, talk), not just be panned over stills. The earlier
attempt (`out/sheru-bhai-animatic-*.mp4`) was rejected as "a slideshow"; use it only as the fallback for shots that have
no clip yet. The user asked for this to be done on their own hardware (the PC's GPU) rather than by more slideshow-style compositing.

## What is in the repo

| path | what |
|---|---|
| `out/storyboard/sheru-bhai/frame-01..18.png` | 1080x1920 first frames (identity, costume, composition must be preserved) |
| `out/storyboard/sheru-bhai/animation-shot-pack.json` | per shot: `duration_s`, `speaker`, `dialogue`, `voice` (a voice description), `lip_visible`, **`motion_prompt`** (silent-model prompt: action + camera, no speech), `prompt` (for models that also make sound), `clip_file`; top level: `cast`, `negative_prompt`, `fps` |
| `assets/sheru-clips-raw/shot-NN.mp4` | **where the generated clips go** (any size/fps/length; one file per shot) |
| `assets/sheru-voices/shot-NN.wav` | optional recorded dialogue for a shot (any of wav/mp3/m4a) |
| `scripts/sheru_assemble.py` | builds the film from whatever clips exist (see "Assemble"); needs only Python and ffmpeg |

## Rules

* Work only inside the cloned folder. Do not touch the user's other projects. No paid API or cloud service without asking.
* Before any large download (model weights are often 10 to 40 GB) or a long GPU job, tell the user what and how big, and wait for their OK.
* Keep the characters identical shot to shot: white lion Sheru Bhai (ivory three-piece suit, gold chains with lion medallion, gold aviators), the white lion cub (ivory suit, gold tie, silver toy jet), the dark water-buffalo bodyguard (black suit, earpiece). The sign in shot 17 must read exactly `GLOBAL SCHOOL OF AVIATION`; if the model garbles it, leave shot 17 to the animatic fallback.
* Frame 19 (the brand card) is never generated; the assembler takes the exact animated card from the animatic.

## Steps

1. **Probe the machine** (read-only): `nvidia-smi` (GPU, VRAM), free disk on each drive, `ffmpeg -encoders` (is `h264_nvenc` there), Python versions, `git`. Look for what is already installed under `D:\video-tools` (it has Whisper, LatentSync and Maya venvs; reuse their torch/CUDA if it fits) and for ComfyUI / Pinokio / diffusers / any `*.safetensors` or `*.gguf` video models. Report this to the user in five lines.
2. **Choose the model.** Check the current state of open-weights image-to-video models first (names and availability move quickly; verify on Hugging Face and the ComfyUI docs), then pick the best that fits the VRAM comfortably. Candidates: Wan 2.2 (TI2V-5B and I2V-A14B), LTX-Video / LTX-2 (joint audio+video, if released and it fits), HunyuanVideo 1.5 I2V, CogVideoX-5B-I2V; Stable Video Diffusion is too weak for acting. Under about 24 GB use ComfyUI with fp8 or GGUF weights. Needs: first-frame conditioning, 9:16 (for example 480x832, 576x1024 or 720x1280), at least 4 s per clip. If a model makes audio too, try it first, because then the voices come for free (use the `prompt` field); otherwise use `motion_prompt`.
3. **Test one shot before the batch.** Shot 12 (close-up, Sheru lowers his aviators, gasps, speaks) is the hardest and the most telling; shot 4 or 8 is cheap. Generate it, then look at it (write a contact sheet of frames at 0, 1, 2, 3 s and open it). Judge: faces, suit and chain unchanged; motion is purposeful and physically plausible; the mouth moves on the line; no morphing, no text. Tune steps, CFG, shift, seed (try three seeds) and the prompt until it holds. Report the time per clip and the estimate for all 18 to the user, then continue.
4. **Batch.** A resumable script: skip any `shot-NN.mp4` that exists, log model, seed, settings and seconds per clip to `assets/sheru-clips-raw/log.jsonl`. Aim for each shot's `duration_s`; if the model's longest clip is shorter, generate the longest it can (the assembler keeps each clip's own length, and holds the last frame up to 1.5 s for a voice line). Pass `negative_prompt` where the model takes one. Free the GPU between clips. Run clips in story order so the user can review early ones while the rest render.
5. **Voices** (only for shots with a `voice` field and no generated audio). Record each `dialogue` line as `assets/sheru-voices/shot-NN.wav`. No key needed: for example `pip install edge-tts` with `en-IN-PrabhatNeural` (Indian-English male), or any local TTS that is installed (Kokoro, Piper, F5-TTS, Chatterbox, or the Maya engine in `D:\video-tools`). Sheru: deep, warm, confident baritone (pitch the voice down a little). Bodyguard: lower, calm, deadpan, a clearly different voice. Shots 7, 10 and 11 are off-screen voice-over; 13 and 17 show Sheru from behind. Where `lip_visible` is true the mouth is on screen: check the clip's mouth motion against the line. A lip-sync model that works on animal faces would be a bonus; on human-only models (LatentSync) test one shot first and keep it only if it works.
6. **Assemble.** `python scripts/sheru_assemble.py --check` lists what is present; `python scripts/sheru_assemble.py` writes `out/sheru-bhai-film-1080x1920.mp4` (+ `.srt`, `.json`). Options: `--interp blend|mci` for 16 fps clips, `--clip-audio on|off|auto`, `--voice-delay 0.3`, `--music-db -9`. It conforms to 1080x1920 at 24 fps, ducks the music bed under speech, normalises to -14 LUFS, crossfades into the brand card, and uses the animatic for any shot still missing. Look at the film end to end (extract frames around every cut; check levels with ebur128) and fix what is wrong before reporting.
7. **Deliver.** Copy the film (and the clips folder) to `D:\AI Directory\Export`, and show the user the film. Ask before pushing anything to GitHub (the repo is public); if they agree, commit the clips and the film to the same branch so the cloud session can continue from them.

## Report back (short)

Model and settings used, seconds per clip, which shots are generated and which still use the animatic and why, anything off in the film (identity drift, mouth, text), and where the files are.
