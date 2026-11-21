# Recorded dialogue (optional)

`shot-NN.wav` (or `.mp3` / `.m4a`) for the shots that have a spoken line, when the generated clip is silent.
The assembler lays it over the shot 0.3 s in (`--voice-delay`) and holds the last frame (up to 1.5 s) if the line is longer
than the clip. The lines, speakers and voice descriptions are in `out/storyboard/sheru-bhai/animation-shot-pack.json`
(`dialogue`, `speaker`, `voice`). Shots 7, 10, 11 are off-screen voice-over; 13 and 17 show Sheru from behind.
