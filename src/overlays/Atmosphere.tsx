import React from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import * as THREE from "three";
import { dawnAmount, easeInCubic, easeOutCubic, makeCamera, projectToScreen, ramp, sunDirection, sunElevation } from "../flight";
import { HEIGHT, T, WIDTH } from "../timeline";

/** Screen-space position + visibility of the sun for the current frame's camera. */
const getSun = (frame: number) => {
  const cam = makeCamera(frame);
  const dir = sunDirection(frame);
  const p = projectToScreen(cam, cam.position.clone().add(dir.clone().multiplyScalar(5000)));
  // how much of the disk has cleared the distant cloud deck (deck top ≈ −0.25°)
  const elevDeg = THREE.MathUtils.radToDeg(sunElevation(frame));
  const clear = THREE.MathUtils.smoothstep(elevDeg, -0.9, 0.9);
  return { x: p.x, y: p.y, inFront: p.z < 1, clear };
};

/** Lens response to the low sun: bloom, anamorphic streak, ghosts and soft god rays. */
export const SunFlare: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame > T.floodEnd) return null;
  const sun = getSun(frame);
  if (!sun.inFront) return null;
  const dawn = dawnAmount(frame);
  const k = (0.25 + 0.75 * sun.clear) * (0.3 + 0.7 * dawn);
  const rayRot = frame * 0.05;
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen", pointerEvents: "none" }}>
      {/* god rays fanning up through the haze */}
      <div
        style={{
          position: "absolute",
          left: sun.x - 1400,
          top: sun.y - 1400,
          width: 2800,
          height: 2800,
          opacity: 0.16 * k,
          background: `repeating-conic-gradient(from ${rayRot}deg at 50% 50%, rgba(255,200,140,0.9) 0deg, rgba(255,200,140,0) 2.2deg, rgba(255,200,140,0) 5.5deg, rgba(255,190,120,0.6) 7deg, rgba(255,200,140,0) 9deg, rgba(255,200,140,0) 13deg)`,
          WebkitMaskImage: "radial-gradient(circle at 50% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 18%, rgba(0,0,0,0) 48%)",
          maskImage: "radial-gradient(circle at 50% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 18%, rgba(0,0,0,0) 48%)",
          filter: "blur(6px)",
        }}
      />
      {/* broad warm bloom */}
      <div
        style={{
          position: "absolute",
          left: sun.x - 900,
          top: sun.y - 900,
          width: 1800,
          height: 1800,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,190,120,0.55) 0%, rgba(255,140,70,0.22) 22%, rgba(255,110,60,0) 60%)",
          opacity: k,
        }}
      />
      {/* hot core */}
      <div
        style={{
          position: "absolute",
          left: sun.x - 90,
          top: sun.y - 90,
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,252,240,1) 0%, rgba(255,230,190,0.75) 18%, rgba(255,190,120,0) 70%)",
          opacity: sun.clear,
        }}
      />
      {/* anamorphic streaks */}
      <div
        style={{
          position: "absolute",
          left: sun.x - 1300,
          top: sun.y - 3,
          width: 2600,
          height: 6,
          background: "radial-gradient(ellipse at center, rgba(255,240,220,0.95) 0%, rgba(255,170,110,0.45) 30%, rgba(255,140,90,0) 70%)",
          opacity: 0.85 * k * sun.clear,
          filter: "blur(1.2px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: sun.x - 1000,
          top: sun.y - 30,
          width: 2000,
          height: 60,
          background: "radial-gradient(ellipse at center, rgba(255,180,120,0.35) 0%, rgba(255,150,90,0) 70%)",
          opacity: k,
        }}
      />
    </AbsoluteFill>
  );
};

/** Sunrise blooms until the whole frame becomes the clean white brand canvas. */
export const Flood: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < T.floodStart) return null;
  const sun = getSun(Math.min(frame, T.floodEnd));
  const grow = easeInCubic(ramp(frame, T.floodStart, T.floodPeak));
  const radius = 80 + grow * 2600;
  const white = ramp(frame, T.floodPeak - 8, T.floodPeak);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: sun.x - radius,
          top: sun.y - radius,
          width: radius * 2,
          height: radius * 2,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,250,242,0.98) 35%, rgba(255,226,196,0.6) 55%, rgba(255,200,150,0) 72%)",
          opacity: Math.min(1, grow * 1.4),
        }}
      />
      <AbsoluteFill style={{ background: BRAND_BG, opacity: white }} />
    </AbsoluteFill>
  );
};

export const BRAND_BG = "radial-gradient(ellipse at 50% 46%, #ffffff 0%, #ffffff 45%, #f7f4f1 100%)";

/** Very subtle warm haze that settles after the flood. */
export const AfterGlow: React.FC = () => {
  const frame = useCurrentFrame();
  const o = (1 - easeOutCubic(ramp(frame, T.floodPeak, T.floodPeak + 70))) * 0.55;
  if (frame < T.floodPeak || o < 0.003) return null;
  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(ellipse at 50% 48%, rgba(255,214,170,0.9) 0%, rgba(255,230,205,0.35) 30%, rgba(255,255,255,0) 65%)",
        opacity: o,
        pointerEvents: "none",
      }}
    />
  );
};

export const Vignette: React.FC = () => {
  const frame = useCurrentFrame();
  const o = 1 - ramp(frame, T.floodStart, T.floodPeak);
  if (o <= 0) return null;
  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 52%, rgba(3,5,14,0.55) 100%)",
        opacity: o,
        pointerEvents: "none",
      }}
    />
  );
};

/** Per-frame film grain (seeded, so renders are reproducible). */
export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const seed = Math.floor(random(`grain-${frame}`) * 1000);
  const dark = 1 - ramp(frame, T.floodStart, T.floodPeak);
  const opacity = 0.05 + 0.06 * dark;
  return (
    <AbsoluteFill style={{ opacity, mixBlendMode: "overlay", pointerEvents: "none" }}>
      <svg width={WIDTH} height={HEIGHT}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency={0.9} numOctaves={2} seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};
