import React from "react";
import { Composition, Still } from "remotion";
import { GlobalIntro } from "./GlobalIntro";
import { LogoEndCard } from "./LogoEndCard";
import { DURATION, FPS, HEIGHT, WIDTH } from "./timeline";

export const RemotionRoot: React.FC = () => (
  <>
    {/* Master 1080p. For 4K UHD render with --scale=2 (all layers are vector / resolution-independent). */}
    <Composition
      id="GlobalIntro"
      component={GlobalIntro}
      durationInFrames={DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ withAudio: true }}
    />
    <Still id="LogoEndCard" component={LogoEndCard} width={WIDTH} height={HEIGHT} />
  </>
);
