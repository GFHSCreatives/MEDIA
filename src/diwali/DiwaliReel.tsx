import React from "react";
import { AbsoluteFill, Html5Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { AcademyScene } from "./AcademyScene";
import { Celebration, NightSkyBackdrop } from "./Celebration";
import { FireworksLayer } from "./FireworksLayer";
import { Finale } from "./Finale";
import { DT } from "./timeline";

/** firework flash that covers the cut from the aerial to the terrace */
const CutFlash: React.FC = () => {
  const frame = useCurrentFrame();
  const k = Math.exp(-Math.pow((frame - (DT.s2Start - 1)) / 3.2, 2));
  if (k < 0.01) return null;
  return <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 30%, rgba(255,246,228,${k}) 0%, rgba(255,206,140,${0.85 * k}) 45%, rgba(255,160,80,${0.6 * k}) 100%)` }} />;
};

/**
 * Global School of Aviation — Diwali 2026 vertical reel (9:16, 24 fps, 15 s).
 * 01 aerial over the academy → 02 celebration on the terrace → 03 a golden
 * firework becomes the jet's flight path and traces the logo arc → 04 particles
 * converge into the official logo → 05 greeting.
 */
export const DiwaliReel: React.FC<{ withAudio: boolean }> = ({ withAudio }) => (
  <AbsoluteFill style={{ background: "#03050d" }}>
    <NightSkyBackdrop />
    <Sequence durationInFrames={DT.s2Start} name="01 Aviation world">
      <AcademyScene />
    </Sequence>
    <FireworksLayer />
    <Celebration />
    <Finale />
    <CutFlash />
    {withAudio && <Html5Audio src={staticFile("audio/diwali-score.wav")} />}
  </AbsoluteFill>
);
