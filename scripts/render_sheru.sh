#!/usr/bin/env bash
# Render the Sheru Bhai animatic: captioned master + clean (no captions) version, 1080x1920 @ 24 fps.
# Prereqs:  python3 scripts/sheru_fx_prep.py   &&   python3 scripts/make_sheru_audio.py
# For 4K (2160x3840) add:  --scale=2   (the stills are 1080x1920, so 4K is an up-scale; effects and captions render natively sharp)
set -euo pipefail
cd "$(dirname "$0")/.."
COMMON=(--image-format=png --color-space=bt709 --crf=18 --overwrite)
npx remotion render SheruBhaiAnimatic out/sheru-bhai-animatic-1080x1920.mp4 --props='{"captions":true,"withAudio":true}' "${COMMON[@]}"
npx remotion render SheruBhaiAnimatic out/sheru-bhai-animatic-clean-1080x1920.mp4 --props='{"captions":false,"withAudio":true}' "${COMMON[@]}"
