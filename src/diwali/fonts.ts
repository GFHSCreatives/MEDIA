import { continueRender, delayRender, staticFile } from "remotion";

/** Montserrat (SIL OFL) — geometric sans that sits naturally beside the logo's lettering. */
export const GREETING_FONT = "GSA Montserrat";
let loaded: Promise<void> | null = null;

export const ensureFonts = () => {
  if (loaded || typeof document === "undefined") return;
  const handle = delayRender("Loading Montserrat");
  const faces = [
    ["300", "fonts/montserrat-latin-300-normal.woff2"],
    ["500", "fonts/montserrat-latin-500-normal.woff2"],
    ["600", "fonts/montserrat-latin-600-normal.woff2"],
  ].map(([weight, file]) => new FontFace(GREETING_FONT, `url(${staticFile(file)}) format("woff2")`, { weight }));
  loaded = Promise.all(faces.map((f) => f.load().then((ff) => (document.fonts as unknown as { add: (x: FontFace) => void }).add(ff)))).then(() => continueRender(handle));
};
