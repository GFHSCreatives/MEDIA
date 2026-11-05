import { Config } from "@remotion/cli/config";

// Software ANGLE so Three.js/WebGL renders deterministically on GPU-less machines.
// On a workstation with a GPU you can switch to "angle" for faster renders.
Config.setChromiumOpenGlRenderer("swangle");

// Optional: point at a locally installed Chrome Headless Shell (e.g. offline CI)
if (process.env.REMOTION_BROWSER) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
}
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setConcurrency(4);
Config.setCodec("h264");
Config.setCrf(14);
Config.setPixelFormat("yuv420p");
