import React from "react";
import { AbsoluteFill, Html5Audio, Sequence, staticFile } from "remotion";
import { AfterGlow, BRAND_BG, Flood, Grain, SunFlare, Vignette } from "./overlays/Atmosphere";
import { LogoLayers } from "./overlays/LogoLayers";
import { SkyScene } from "./three/SkyScene";
import { T } from "./timeline";

export type GlobalIntroProps = { withAudio: boolean };

/**
 * GLOBAL — "First Light"
 * Blue hour above the clouds → a jet overtakes the camera → it traces the
 * GLOBAL arc across the sunrise → the sun floods the frame white → the
 * wordmark opens from the jet's flight line.
 */
export const GlobalIntro: React.FC<GlobalIntroProps> = ({ withAudio }) => {
  return (
    <AbsoluteFill style={{ background: "#05070f" }}>
      <Sequence durationInFrames={T.floodEnd + 1} name="3D sky · clouds · jet">
        <SkyScene />
      </Sequence>
      <SunFlare />
      <Vignette />
      <Flood />
      <Sequence from={T.floodEnd} name="Brand canvas">
        <AbsoluteFill style={{ background: BRAND_BG }} />
      </Sequence>
      <AfterGlow />
      <LogoLayers />
      <Grain />
      {withAudio && <Html5Audio src={staticFile("audio/global-intro-score.wav")} />}
    </AbsoluteFill>
  );
};
