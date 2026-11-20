import React from "react";
import { AbsoluteFill, Html5Audio, Img, Sequence, staticFile, useCurrentFrame } from "remotion";
import { BrandCard } from "./BrandCard";
import { Captions } from "./Captions";
import { cameraTransform, clamp01, easeInCubic, easeOutCubic, easeSine, sampleCam } from "./camera";
import { DURATION, FPS, H, SHOTS, W, pad2, visibleRange } from "./data";
import { Dust, Glint, Haze, Lights, MapLightUp, PlaneClimb, SearchTyping, Sparkles, Vignette } from "./fx";
import { CFG } from "./shots";

export type SheruProps = { captions: boolean; withAudio: boolean };

/** One shot: the exact still under a virtual camera, plus the additive effect layers. */
const ShotView: React.FC<{ i: number }> = ({ i }) => {
  const local = useCurrentFrame();
  const shot = SHOTS[i];
  const cfg = CFG[shot.n];
  const { from, to } = visibleRange(i);
  const f = from + local;
  const p = (f - from) / Math.max(1, to - from - 1);
  const t = (f - shot.start) / FPS; // seconds since the shot's nominal start (negative while it is still dissolving in)

  let cam = sampleCam(cfg.cam, p, cfg.firstEase === "out" ? easeOutCubic : easeSine);
  // outgoing: dive into the glow when the next shot is a push-through
  const next = SHOTS[i + 1];
  if (next?.in.type === "pushThrough") {
    const q = clamp01((f - (next.start - next.in.len / 2)) / next.in.len);
    cam = { ...cam, s: cam.s * (1 + 1.1 * easeInCubic(q)) };
  }
  // incoming push-through settles from a slightly tighter frame
  if (shot.in.type === "pushThrough") {
    const q = clamp01((f - (shot.start - shot.in.len / 2)) / (shot.in.len + 14));
    cam = { ...cam, s: cam.s * (1 + 0.32 * (1 - easeOutCubic(q))) };
  }
  const transform = cameraTransform({ f, n: shot.n, tNominal: t, cam, kicks: cfg.kicks, walk: cfg.walk });
  const opacity = shot.in.type === "cut" || shot.in.type === "fadeBlack" ? 1 : clamp01((f - (shot.start - shot.in.len / 2)) / shot.in.len);
  const hero = cfg.hero;

  return (
    <AbsoluteFill style={{ opacity }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#000" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform, willChange: "transform" }}>
          <Img src={staticFile(`sheru/frames/frame-${pad2(shot.n)}.png`)} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "block" }} />
          {cfg.haze && <Haze t={t} />}
          {hero === "search" && <SearchTyping t={t} />}
          {hero === "plane" && <PlaneClimb t={t} />}
          {(hero === "map7" || hero === "map8" || hero === "map9") && <MapLightUp n={Number(hero.slice(3)) as 7 | 8 | 9} t={t} />}
          {cfg.glint && <Glint n={shot.n} t={t} sweeps={cfg.glint} />}
          {cfg.lights ? <Lights n={shot.n} t={t} count={cfg.lights} /> : null}
          {cfg.sparkles ? <Sparkles n={shot.n} t={t} count={cfg.sparkles} /> : null}
        </div>
      </div>
      {cfg.dust && <Dust f={f} seed={shot.n} cfg={cfg.dust} />}
      <Vignette amount={cfg.vignette ?? 0.2} />
    </AbsoluteFill>
  );
};

const CardShot: React.FC<{ i: number }> = ({ i }) => {
  const local = useCurrentFrame();
  const shot = SHOTS[i];
  const { from } = visibleRange(i);
  const f = from + local;
  const opacity = clamp01((f - (shot.start - shot.in.len / 2)) / shot.in.len);
  return <BrandCard t={(f - shot.start) / FPS} opacity={opacity} />;
};

/** Flashes, the push-through glow, the dip to charcoal, and the opening fade from black. */
const TransitionFx: React.FC = () => {
  const f = useCurrentFrame();
  const layers: React.ReactNode[] = [];
  const open = 1 - clamp01(f / SHOTS[0].in.len);
  if (open > 0) layers.push(<div key="open" style={{ position: "absolute", inset: 0, background: "#000", opacity: open }} />);
  SHOTS.forEach((s, i) => {
    if (i === 0) return;
    const { type, len, color } = s.in;
    if (!(type === "flashDissolve" || type === "pushThrough" || type === "dip")) return;
    const q = (f - (s.start - len / 2)) / len;
    if (q < 0 || q > 1) return;
    const bell = Math.sin(Math.PI * q);
    const alpha = type === "flashDissolve" ? 0.85 * Math.pow(bell, 1.4) : type === "pushThrough" ? 0.6 * Math.pow(bell, 2) : Math.pow(bell, 0.7);
    layers.push(<div key={`t${i}`} style={{ position: "absolute", inset: 0, background: color ?? "#fff", opacity: alpha }} />);
  });
  return <AbsoluteFill style={{ pointerEvents: "none" }}>{layers}</AbsoluteFill>;
};

export const SheruBhaiAnimatic: React.FC<SheruProps> = ({ captions, withAudio }) => (
  <AbsoluteFill style={{ background: "#0b0908" }}>
    {SHOTS.map((s, i) => {
      const { from, to } = visibleRange(i);
      return (
        <Sequence key={s.n} from={from} durationInFrames={to - from} name={`Shot ${pad2(s.n)}`}>
          {s.n === 19 ? <CardShot i={i} /> : <ShotView i={i} />}
        </Sequence>
      );
    })}
    <TransitionFx />
    {captions && <Captions />}
    {withAudio && <Html5Audio src={staticFile("audio/sheru-bhai-score.wav")} />}
  </AbsoluteFill>
);

export const SHERU_DURATION = DURATION;
