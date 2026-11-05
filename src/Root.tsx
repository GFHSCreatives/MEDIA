import React from "react";
import { Composition, Freeze, Still } from "remotion";
import { GlobalIntro } from "./GlobalIntro";
import { LogoEndCard } from "./LogoEndCard";
import { DURATION, FPS, HEIGHT, WIDTH } from "./timeline";
import { DiwaliReel } from "./diwali/DiwaliReel";
import { D_DURATION, D_FPS, D_HEIGHT, D_WIDTH } from "./diwali/timeline";

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
    {/* Diwali 2026 vertical reel (9:16). 4K: --scale=2 → 2160×3840 */}
    <Composition
      id="DiwaliReel"
      component={DiwaliReel}
      durationInFrames={D_DURATION}
      fps={D_FPS}
      width={D_WIDTH}
      height={D_HEIGHT}
      defaultProps={{ withAudio: true }}
    />
    <Still
      id="DiwaliEndCard"
      component={() => (
        <Freeze frame={D_DURATION - 1}>
          <DiwaliReel withAudio={false} />
        </Freeze>
      )}
      width={D_WIDTH}
      height={D_HEIGHT}
    />
    <Still id="LogoEndCard" component={LogoEndCard} width={WIDTH} height={HEIGHT} />
  </>
);
