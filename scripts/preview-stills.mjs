// Render a contact sheet of key frames for quick review.
// usage: node scripts/preview-stills.mjs <outDir> [frames comma-separated] [scale]
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs";

const outDir = process.argv[2] ?? "out/stills";
const frames = (process.argv[3] ?? "0,45,90,105,116,130,160,190,210,230,250,262,276,292,310,340,365,419").split(",").map(Number);
const scale = Number(process.argv[4] ?? 0.5);
fs.mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const chromiumOptions = { gl: "swangle" };
const browserExecutable = process.env.REMOTION_BROWSER ?? null;
const inputProps = { withAudio: false };
const composition = await selectComposition({ serveUrl, id: "GlobalIntro", inputProps, chromiumOptions, browserExecutable });
for (const frame of frames) {
  const t = Date.now();
  await renderStill({ onBrowserLog: (l) => { if (process.env.LOGS) console.log("[browser]", l.type, l.text.slice(0, 400)); }, serveUrl, composition, frame, output: path.join(outDir, `f${String(frame).padStart(3, "0")}.jpg`), imageFormat: "jpeg", jpegQuality: 85, scale, inputProps, chromiumOptions, browserExecutable });
  console.log("frame", frame, Date.now() - t, "ms");
}
