#!/usr/bin/env python3
"""Write the animatic's dialogue as an SRT subtitle file (timing from src/sheru/timeline.json).

Use it for soft captions on YouTube / Instagram, or as the script for a voice-over:
    python3 scripts/make_sheru_srt.py [out.srt]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TL = json.loads((ROOT / "src" / "sheru" / "timeline.json").read_text())
FPS = TL["fps"]


def stamp(frame: int) -> str:
    ms = round(frame * 1000 / FPS)
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


lines = []
for i, c in enumerate(TL["captions"], 1):
    lines += [str(i), f"{stamp(c['start'])} --> {stamp(c['end'])}", f"{c['speaker'].title()}: {c['text']}", ""]
dest = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "out" / "sheru-bhai-dialogue.srt")
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text("\n".join(lines), encoding="utf-8")
print(f"wrote {dest} ({len(TL['captions'])} lines)")
