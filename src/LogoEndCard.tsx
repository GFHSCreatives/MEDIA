import React from "react";
import { AbsoluteFill, Freeze } from "remotion";
import { BRAND_BG } from "./overlays/Atmosphere";
import { LogoLayers } from "./overlays/LogoLayers";
import { DURATION } from "./timeline";

/** Final lockup frame as a still (thumbnail / poster / end card). */
export const LogoEndCard: React.FC = () => (
  <AbsoluteFill style={{ background: BRAND_BG }}>
    <Freeze frame={DURATION - 1}>
      <LogoLayers />
    </Freeze>
  </AbsoluteFill>
);
