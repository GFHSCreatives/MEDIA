# Image restoration pipeline

Batch restores GLOBAL aviation photos from compressed ~1024×576 sources to
**native 4K (3840×2160) lossless PNG** using [xinntao/Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN).

## What it does

1. Quick artifact diagnostics (blockiness, Laplacian sharpness, noise)
2. Mild edge-preserving denoise (JPEG mosquito reduction)
3. Real-ESRGAN `RealESRGAN_x4plus` ×4 super-resolution (RRDBNet)
4. Lanczos fit to exact 3840×2160 (sources are 16:9)
5. Conservative local-contrast polish + sky/flat-area debanding
6. Export PNG masters + high-quality JPEG previews

No generative fill, no face identity replacement, no invented logos/text.

## Setup (from GitHub)

```bash
# PyTorch CPU (or CUDA if available)
python3 -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
python3 -m pip install basicsr facexlib gfpgan opencv-python-headless pillow

git clone --depth 1 https://github.com/xinntao/Real-ESRGAN.git tools/Real-ESRGAN
cd tools/Real-ESRGAN && python3 -m pip install -e . && cd ../..

mkdir -p tools/Real-ESRGAN/weights
curl -L -o tools/Real-ESRGAN/weights/RealESRGAN_x4plus.pth \
  https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth

# Patch known basicsr ↔ modern torchvision import break if needed:
# basicsr/data/degradations.py:
#   from torchvision.transforms.functional import rgb_to_grayscale
```

Optional denoise weights (same repo releases):

- `realesr-general-x4v3.pth`
- `realesr-general-wdn-x4v3.pth`

## Run

```bash
# Place sources in assets/source-photos/
python3 scripts/restore_images.py
# → out/restored/*_restored_4k.png
# → out/restored/*_restored_4k_preview.jpg
# → out/restored/restoration_report.json
```

Options: `--tile 256` (CPU RAM), `--limit N`, `--only stem1,stem2`.

## Layout

```
assets/source-photos/     original uploads
out/restored/             4K PNG masters + previews + report
scripts/restore_images.py pipeline
tools/Real-ESRGAN/        cloned GitHub repo + weights (not committed)
```
