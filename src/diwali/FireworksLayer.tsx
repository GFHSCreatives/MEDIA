import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { drawFireworks, drawSmoke, DrawOpts } from "./fireworks";
import { D_HEIGHT, D_WIDTH } from "./timeline";

/**
 * Fireworks compositing: lit smoke (normal) → sparks (additive) → bloom
 * (blurred copy, screen). Redrawn synchronously for every frame.
 */
export const FireworksLayer: React.FC<{ clearZone?: DrawOpts["clearZone"]; smoke?: boolean; opacity?: number }> = ({
  clearZone,
  smoke = true,
  opacity = 1,
}) => {
  const frame = useCurrentFrame();
  const smokeRef = useRef<HTMLCanvasElement>(null);
  const sparkRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLCanvasElement>(null);

  // render canvases at device pixel ratio so `--scale=2` (4K) stays crisp
  const dpr = typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1;

  useLayoutEffect(() => {
    const prep = (cv: HTMLCanvasElement | null, scale: number) => {
      const ctx = cv?.getContext("2d");
      if (!ctx) return null;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, D_WIDTH, D_HEIGHT);
      return ctx;
    };
    const opts = { frame, width: D_WIDTH, height: D_HEIGHT, clearZone };
    const sc = prep(smokeRef.current, dpr);
    if (sc && smoke) drawSmoke(sc, frame);
    const c = prep(sparkRef.current, dpr);
    if (!c) return;
    drawFireworks(c, opts);
    const g = glowRef.current?.getContext("2d");
    if (g) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, D_WIDTH / 4, D_HEIGHT / 4);
      g.drawImage(sparkRef.current!, 0, 0, D_WIDTH / 4, D_HEIGHT / 4);
    }
  }, [frame, clearZone, smoke, dpr]);

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      <canvas ref={smokeRef} width={D_WIDTH * dpr} height={D_HEIGHT * dpr} style={{ position: "absolute", inset: 0, width: D_WIDTH, height: D_HEIGHT }} />
      {/* bloom: quarter-res copy, blurred and scaled up */}
      <canvas
        ref={glowRef}
        width={D_WIDTH / 4}
        height={D_HEIGHT / 4}
        style={{ position: "absolute", inset: 0, width: D_WIDTH, height: D_HEIGHT, filter: "blur(10px) brightness(1.8)", mixBlendMode: "screen" }}
      />
      <canvas ref={sparkRef} width={D_WIDTH * dpr} height={D_HEIGHT * dpr} style={{ position: "absolute", inset: 0, width: D_WIDTH, height: D_HEIGHT, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};
