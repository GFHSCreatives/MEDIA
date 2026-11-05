import React from "react";
import { useCurrentFrame } from "remotion";
import { ARC_BOUNDS, ARC_CENTERLINE, ARC_PATH, ARC_STOPS, INK, LETTERS } from "../logoPaths";
import {
  arcProgressAtFrame,
  clamp01,
  easeInOutCubic,
  easeOutCubic,
  easeOutExpo,
  LOGO_CENTER_VB,
  LOGO_SCALE,
  ramp,
  sAtFrame,
  S_ARC_END,
  S_ARC_START,
} from "../flight";
import { HEIGHT, T, WIDTH } from "../timeline";

const CENTER_D = "M" + ARC_CENTERLINE.map(([x, y]) => `${x} ${y}`).join("L");
const O = LETTERS[2];
const LINE_Y = (O.y0 + O.y1) / 2 + 0.5;
const O_CX = (O.x0 + O.x1) / 2;
const HOT_STEPS = Array.from({ length: 16 }, (_, i) => (i + 1) / 16);
const LETTER_ORDER = [2, 1, 0, 1, 2, 3]; // reveal rank: O first, then outward

/** Group transform placing the 599×416 artwork on the 1920×1080 frame. */
const useLogoTransform = (frame: number) => {
  const push = 1 + 0.028 * easeOutCubic(ramp(frame, T.floodPeak, T.end));
  const s = LOGO_SCALE * push;
  const tx = WIDTH / 2 - LOGO_CENTER_VB.x * s;
  const ty = HEIGHT / 2 - LOGO_CENTER_VB.y * s;
  return `translate(${tx} ${ty}) scale(${s})`;
};

export const LogoLayers: React.FC = () => {
  const frame = useCurrentFrame();
  const transform = useLogoTransform(frame);

  // ---- arc reveal: paint trails the jet's tail ----
  const span = S_ARC_END - S_ARC_START;
  const tailP = clamp01((sAtFrame(frame) - 15 - S_ARC_START) / span);
  const p = frame >= T.arcEnd + 8 ? 1 : tailP;
  const headP = arcProgressAtFrame(frame);
  const tracing = frame >= T.arcStart - 2 && frame < T.arcEnd + 10;
  const onDark = 1 - ramp(frame, T.floodStart + 6, T.floodPeak);
  const hotLen = 0.3;
  const lockFlash = Math.exp(-Math.pow((frame - (T.arcEnd + 4)) / 6, 2));

  // ---- flight line + letters ----
  const lineGrow = easeOutExpo(ramp(frame, T.lineStart, T.lineStart + 16));
  const lineRetract = easeInOutCubic(ramp(frame, T.lineRetract, T.lineRetract + 18));
  const lineHalf = 300 * lineGrow * (1 - lineRetract);
  const lineOpacity = ramp(frame, T.lineStart, T.lineStart + 3) * (1 - ramp(frame, T.lineRetract + 10, T.lineRetract + 18));

  // ---- sheen ----
  const sheenX = -120 + 840 * easeInOutCubic(ramp(frame, T.sheenStart, T.sheenEnd));
  const sheenOn = frame >= T.sheenStart && frame <= T.sheenEnd;

  const arcVisible = frame >= T.arcStart - 2;
  if (!arcVisible) return null;

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <linearGradient id="arcGrad" x1={ARC_BOUNDS.x0} x2={ARC_BOUNDS.x1} y1={0} y2={0} gradientUnits="userSpaceOnUse">
          {ARC_STOPS.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
        <linearGradient id="hotGrad" x1={ARC_BOUNDS.x0} x2={ARC_BOUNDS.x1} y1={0} y2={0} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor="#ffe9c4" />
          <stop offset={1} stopColor="#ffd4a6" />
        </linearGradient>
        <linearGradient id="lineGrad" x1={O_CX - 300} x2={O_CX + 300} y1={0} y2={0} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor="#ef7a22" stopOpacity={0} />
          <stop offset={0.3} stopColor="#ec7420" />
          <stop offset={0.5} stopColor="#ffb070" />
          <stop offset={0.7} stopColor="#d9502a" />
          <stop offset={1} stopColor="#d24124" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="sheenGrad" x1={0} x2={1} y1={0} y2={0}>
          <stop offset={0} stopColor="#ffffff" stopOpacity={0} />
          <stop offset={0.5} stopColor="#ffffff" stopOpacity={0.85} />
          <stop offset={1} stopColor="#ffffff" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="sheenInk" x1={0} x2={1} y1={0} y2={0}>
          <stop offset={0} stopColor="#ff9b52" stopOpacity={0} />
          <stop offset={0.5} stopColor="#ff9b52" stopOpacity={0.55} />
          <stop offset={1} stopColor="#ff9b52" stopOpacity={0} />
        </linearGradient>
        <mask id="arcMask" maskUnits="userSpaceOnUse" x={0} y={0} width={600} height={420}>
          <path d={CENTER_D} pathLength={1} fill="none" stroke="#fff" strokeWidth={40} strokeLinecap="butt" strokeDasharray={`${p} 2`} />
        </mask>
        <mask id="hotMask" maskUnits="userSpaceOnUse" x={0} y={0} width={600} height={420}>
          {HOT_STEPS.map((k) => {
            const len = Math.min(p, hotLen * k);
            return (
              <path
                key={k}
                d={CENTER_D}
                pathLength={1}
                fill="none"
                stroke="#fff"
                strokeOpacity={1 / HOT_STEPS.length}
                strokeWidth={40}
                strokeDasharray={`0 ${Math.max(0, p - len)} ${len} 2`}
              />
            );
          })}
        </mask>
        <filter id="arcGlow" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation={6} />
        </filter>
        <filter id="arcGlowWide" x="-30%" y="-120%" width="160%" height="340%">
          <feGaussianBlur stdDeviation={18} />
        </filter>
        <filter id="lineGlow" x="-10%" y="-400%" width="120%" height="900%">
          <feGaussianBlur stdDeviation={2.5} />
        </filter>
        <radialGradient id="headGrad">
          <stop offset={0} stopColor="#fff" stopOpacity={1} />
          <stop offset={0.25} stopColor="#ffe2b8" stopOpacity={0.8} />
          <stop offset={1} stopColor="#ff9a4a" stopOpacity={0} />
        </radialGradient>
        <clipPath id="lettersClip">
          {LETTERS.map((l, i) => (
            <path key={i} d={l.d} />
          ))}
        </clipPath>
      </defs>

      <g transform={transform}>
        {/* ---------- ARC ---------- */}
        {onDark > 0.001 && (
          <g style={{ mixBlendMode: "screen" }} opacity={onDark}>
            <g mask="url(#arcMask)">
              {/* doubled wide bloom for a hotter, denser glow */}
              <path d={ARC_PATH} fill="#ff7a2a" filter="url(#arcGlowWide)" />
              <path d={ARC_PATH} fill="#ff7a2a" filter="url(#arcGlowWide)" opacity={0.8 + lockFlash * 0.2} />
            </g>
            <path d={ARC_PATH} fill="#ffb066" mask="url(#arcMask)" filter="url(#arcGlow)" opacity={0.95} />
          </g>
        )}
        <path d={ARC_PATH} fill="url(#arcGrad)" mask="url(#arcMask)" />
        {tracing && <path d={ARC_PATH} fill="url(#hotGrad)" mask="url(#hotMask)" opacity={0.85 * (1 - ramp(frame, T.arcEnd, T.arcEnd + 10))} />}
        {lockFlash > 0.01 && <path d={ARC_PATH} fill="#fff6e6" opacity={lockFlash * 0.6} filter="url(#arcGlow)" />}

        {/* ---------- FLIGHT LINE ---------- */}
        {lineOpacity > 0.001 && (
          <g opacity={lineOpacity}>
            <rect x={O_CX - lineHalf} y={LINE_Y - 2.4} width={lineHalf * 2} height={4.8} fill="url(#lineGrad)" filter="url(#lineGlow)" opacity={0.8} />
            <rect x={O_CX - lineHalf} y={LINE_Y - 0.9} width={lineHalf * 2} height={1.8} fill="url(#lineGrad)" />
          </g>
        )}

        {/* ---------- LETTERS: open from the flight line ---------- */}
        {LETTERS.map((l, i) => {
          const start = T.lettersStart + LETTER_ORDER[i] * 6;
          const t = ramp(frame, start, start + 20);
          if (t <= 0) return null;
          const e = easeOutCubic(t);
          const half = 46 * e;
          const cx = (l.x0 + l.x1) / 2;
          const dx = (cx - O_CX) * 0.07 * (1 - easeOutCubic(ramp(frame, start, start + 30)));
          const blur = 3.2 * (1 - e);
          return (
            <g key={i} transform={`translate(${dx} 0)`}>
              <clipPath id={`lc${i}`}>
                <rect x={l.x0 - 6} y={LINE_Y - half} width={l.x1 - l.x0 + 12} height={half * 2} />
              </clipPath>
              <path d={l.d} fill={INK} clipPath={`url(#lc${i})`} opacity={0.35 + 0.65 * e} style={blur > 0.05 ? { filter: `blur(${blur}px)` } : undefined} />
            </g>
          );
        })}

        {/* ---------- SHEEN ---------- */}
        {sheenOn && (
          <>
            <g mask="url(#arcMask)">
              <rect x={sheenX - 40} y={60} width={80} height={150} fill="url(#sheenGrad)" opacity={0.5} transform={`skewX(-22)`} style={{ mixBlendMode: "screen" }} />
            </g>
          </>
        )}
      </g>

      {/* jet's luminous wake head on the arc */}
      {tracing && headP > 0 && headP < 1 && <HeadGlow frame={frame} transform={transform} />}
    </svg>
  );
};

const HeadGlow: React.FC<{ frame: number; transform: string }> = ({ frame, transform }) => {
  const span = S_ARC_END - S_ARC_START;
  const p = clamp01((sAtFrame(frame) - 15 - S_ARC_START) / span);
  // locate point along centreline by arc length
  const pts = ARC_CENTERLINE;
  let total = 0;
  const seg: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(total);
  }
  const target = p * total;
  let k = 1;
  while (k < seg.length - 1 && seg[k] < target) k++;
  const u = (target - seg[k - 1]) / (seg[k] - seg[k - 1] || 1);
  const x = pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * u;
  const y = pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * u;
  const flicker = 0.9 + 0.1 * Math.sin(frame * 1.7);
  return (
    <g transform={transform} style={{ mixBlendMode: "screen" }}>
      <ellipse cx={x} cy={y} rx={22 * flicker} ry={9 * flicker} fill="url(#headGrad)" opacity={0.85} />
      <circle cx={x} cy={y} r={3.2} fill="#fffaf0" opacity={0.9} />
    </g>
  );
};
