import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ensureFonts, GREETING_FONT } from "../diwali/fonts";
import { clamp01, easeOutCubic } from "./camera";
import { CAPTIONS, FPS, H, type Caption } from "./data";

/**
 * Dialogue captions. The stills carry no voices, so each line is spelled out word by word
 * as it is "spoken". Text sits inside the phone-UI safe area (nothing below y=1580).
 */
const BOTTOM = 1556; // px from the top: where the text block ends
const WORD_FADE = 0.2; // seconds

type Timed = { text: string; t: number };

const timeWords = (c: Caption): Timed[] => {
  const raw = c.text.split(/\s+/);
  const weight = raw.map((w) => w.length + (/[.!?]$|\.\.\.$/.test(w) ? 3.2 : /,$/.test(w) ? 1.5 : 0));
  const total = weight.reduce((a, b) => a + b, 0);
  const spoken = Math.max(1, (c.end - c.start - 12) / FPS);
  let acc = 0;
  return raw.map((w, i) => {
    const t = spoken * (acc / total);
    acc += weight[i];
    return { text: w, t };
  });
};

export const Captions: React.FC = () => {
  ensureFonts();
  const f = useCurrentFrame();
  const words = useMemo(() => CAPTIONS.map(timeWords), []);
  const idx = CAPTIONS.findIndex((c) => f >= c.start - 4 && f < c.end + 10);
  if (idx < 0) return null;
  const c = CAPTIONS[idx];
  const vis = clamp01((f - (c.start - 4)) / 6) * (1 - clamp01((f - c.end) / 8));
  const now = (f - c.start) / FPS;
  const long = c.text.length > 90;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 820,
          opacity: vis,
          background: "linear-gradient(0deg, rgba(8,4,2,0.58) 0%, rgba(8,4,2,0.30) 42%, rgba(8,4,2,0) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 90,
          width: 900,
          bottom: H - BOTTOM,
          opacity: vis,
          textAlign: "center",
          fontFamily: `'${GREETING_FONT}', sans-serif`,
          transform: `translateY(${(1 - easeOutCubic(clamp01((f - c.start + 4) / 10))) * 14}px)`,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 25, letterSpacing: "0.3em", paddingLeft: "0.3em", color: "#e9c166", textShadow: "0 2px 10px rgba(0,0,0,0.7)" }}>{c.speaker}</div>
        <div style={{ width: 64, height: 2, margin: "12px auto 18px", background: "linear-gradient(90deg, rgba(233,193,102,0), #e9c166, rgba(233,193,102,0))" }} />
        <div style={{ fontWeight: 600, fontSize: long ? 41 : 47, lineHeight: 1.27, color: "#fff8ea", textShadow: "0 2px 14px rgba(0,0,0,0.7), 0 0 3px rgba(0,0,0,0.55)" }}>
          {words[idx].map((w, i) => {
            const k = clamp01((now - w.t) / WORD_FADE);
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  margin: "0 0.13em",
                  opacity: k,
                  transform: `translateY(${(1 - easeOutCubic(k)) * 12}px)`,
                  filter: k < 0.98 ? `blur(${(1 - k) * 3}px)` : undefined,
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
