# Generated clips go here

One file per storyboard shot, named `shot-01.mp4` … `shot-18.mp4` (`.mov`, `.webm`, `.mkv` also work).
Any resolution, frame rate or length: `python3 scripts/sheru_assemble.py` conforms them to 1080 × 1920 at 24 fps.
A shot with no file here is taken from the still-image animatic, so a partial set still builds a complete film.

Each clip should start from `out/storyboard/sheru-bhai/frame-NN.png`; the acting direction for it is in
`out/storyboard/sheru-bhai/animation-shot-pack.json` (`motion_prompt`, or `prompt` for models that also make sound).
See `LOCAL_GPU_BRIEF.md` for the full procedure.
