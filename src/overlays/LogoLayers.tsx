import React from "react";
import { useCurrentFrame } from "remotion";
import {
  ARC_BOUNDS,
  ARC_CENTERLINE,
  ARC_PATH,
  ARC_STOPS,
  INK,
  LETTERS,
  LOGO_VIEWBOX,
  REG,
  REG_INK,
  TAGLINE,
} from "../logoPaths";
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
/** design unit: all sizes below are expressed relative to the wordmark cap height */
const U = (O.y1 - O.y0) / 85;
const LINE_Y = (O.y0 + O.y1) / 2 + 0.5 * U;
const O_CX = (O.x0 + O.x1) / 2;
const WORD_X0 = LETTERS[0].x0;
const WORD_X1 = LETTERS[LETTERS.length - 1].x1;
const LINE_MAX_HALF = Math.max(O_CX - WORD_X0, WORD_X1 - O_CX) + 40 * U;
const ARC_MAX_T = Math.max(...ARC_CENTERLINE.map((c) => c[2]));
const MASK_W = ARC_MAX_T * 1.6;
const HOT_STEPS = Array.from({ length: 16 }, (_, i) => (i + 1) / 16);
const LETTER_ORDER = [2, 1, 0, 1, 2, 3]; // reveal rank: O first, then outward
const LETTER_HALF = (O.y1 - O.y0) / 2 + 4 * U;
const TAG_X0 = TAGLINE[0].x0;
const TAG_X1 = TAGLINE[TAGLINE.length - 1].x1;
const TAG_CX = (TAG_X0 + TAG_X1) / 2;
const REG_CX = (REG.x0 + REG.x1) / 2;
const REG_CY = (REG.y0 + REG.y1) / 2;
const REG_R = (REG.x1 - REG.x0) / 2;

// arc-length lookup on the centre line (for the jet's luminous head)
const CL_LEN: number[] = [0];
for (let i = 1; i < ARC_CENTERLINE.length; i++) {
  const [x0, y0] = ARC_CENTERLINE[i - 1];
  const [x1, y1] = ARC_CENTERLINE[i];
  CL_LEN.push(CL_LEN[i - 1] + Math.hypot(x1 - x0, y1 - y0));
}
const pointOnArc = (p: number) => {
  const target = p * CL_LEN[CL_LEN.length - 1];
  let k = 1;
  while (k < CL_LEN.length - 1 && CL_LEN[k] < target) k++;
  const u = (target - CL_LEN[k - 1]) / (CL_LEN[k] - CL_LEN[k - 1] || 1);
  const a = ARC_CENTERLINE[k - 1];
  const b = ARC_CENTERLINE[k];
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u };
};

const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Group transform placing the artwork on the 1920×1080 frame (with a slow hero push-in). */
const logoTransform = (frame: number) => {
  const push = 1 + 0.028 * easeOutCubic(ramp(frame, T.floodPeak, T.end));
  const s = LOGO_SCALE * push;
  const tx = WIDTH / 2 - LOGO_CENTER_VB.x * s;
  const ty = HEIGHT / 2 - LOGO_CENTER_VB.y * s;
  return `translate(${tx} ${ty}) scale(${s})`;
};

export const LogoLayers: React.FC = () => {
  const frame = useCurrentFrame();
  const transform = logoTransform(frame);

  // ---- arc reveal: paint trails the jet's tail ----
  const span = S_ARC_END - S_ARC_START;
  const tailP = clamp01((sAtFrame(frame) - 15 - S_ARC_START) / span);
  const p = frame >= T.arcEnd + 8 ? 1 : tailP;
  const headP = arcProgressAtFrame(frame);
  const tracing = frame >= T.arcStart - 2 && frame < T.arcEnd + 10;
  const onDark = 1 - ramp(frame, T.floodStart + 6, T.floodPeak);
  const hotLen = 0.3;
  const lockFlash = Math.exp(-Math.pow((frame - (T.arcEnd + 4)) / 6, 2));

  // ---- flight line ----
  const lineGrow = easeOutExpo(ramp(frame, T.lineStart, T.lineStart + 16));
  const lineRetract = easeInOutCubic(ramp(frame, T.lineRetract, T.lineRetract + 18));
  const lineHalf = LINE_MAX_HALF * lineGrow * (1 - lineRetract);
  const lineOpacity = ramp(frame, T.lineStart, T.lineStart + 3) * (1 - ramp(frame, T.lineRetract + 10, T.lineRetract + 18));

  // ---- sheen along the arc, ending at the ® ----
  const sheenT = easeInOutCubic(ramp(frame, T.sheenStart, T.sheenEnd));
  const sheenX = ARC_BOUNDS.x0 - 60 * U + (ARC_BOUNDS.x1 - ARC_BOUNDS.x0 + 120 * U) * sheenT;
  const sheenOn = frame >= T.sheenStart && frame <= T.sheenEnd;
  const sheenCY = (ARC_BOUNDS.y0 + ARC_BOUNDS.y1) / 2;

  // ---- ® ----
  const regT = ramp(frame, T.regMark, T.regMark + 12);
  const regScale = 0.55 + 0.45 * easeOutBack(regT);
  const sparkle = Math.exp(-Math.pow((frame - (T.regMark + 5)) / 4.5, 2));

  if (frame < T.arcStart - 2) return null;

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
        <linearGradient id="lineGrad" x1={O_CX - LINE_MAX_HALF} x2={O_CX + LINE_MAX_HALF} y1={0} y2={0} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor={ARC_STOPS[1].color} stopOpacity={0} />
          <stop offset={0.3} stopColor={ARC_STOPS[2].color} />
          <stop offset={0.5} stopColor="#ffb070" />
          <stop offset={0.7} stopColor={ARC_STOPS[7].color} />
          <stop offset={1} stopColor={ARC_STOPS[8].color} stopOpacity={0} />
        </linearGradient>
        <linearGradient id="sheenGrad" x1={0} x2={1} y1={0} y2={0}>
          <stop offset={0} stopColor="#ffffff" stopOpacity={0} />
          <stop offset={0.5} stopColor="#ffffff" stopOpacity={0.85} />
          <stop offset={1} stopColor="#ffffff" stopOpacity={0} />
        </linearGradient>
        <mask id="arcMask" maskUnits="userSpaceOnUse" x={0} y={0} width={LOGO_VIEWBOX.width} height={LOGO_VIEWBOX.height}>
          <path d={CENTER_D} pathLength={1} fill="none" stroke="#fff" strokeWidth={MASK_W} strokeDasharray={`${p} 2`} />
        </mask>
        <mask id="hotMask" maskUnits="userSpaceOnUse" x={0} y={0} width={LOGO_VIEWBOX.width} height={LOGO_VIEWBOX.height}>
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
                strokeWidth={MASK_W}
                strokeDasharray={`0 ${Math.max(0, p - len)} ${len} 2`}
              />
            );
          })}
        </mask>
        <filter id="arcGlow" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation={6 * U} />
        </filter>
        <filter id="arcGlowWide" x="-30%" y="-120%" width="160%" height="340%">
          <feGaussianBlur stdDeviation={18 * U} />
        </filter>
        <filter id="lineGlow" x="-10%" y="-400%" width="120%" height="900%">
          <feGaussianBlur stdDeviation={2.5 * U} />
        </filter>
        <radialGradient id="headGrad">
          <stop offset={0} stopColor="#fff" stopOpacity={1} />
          <stop offset={0.25} stopColor="#ffe2b8" stopOpacity={0.8} />
          <stop offset={1} stopColor="#ff9a4a" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="sparkGrad">
          <stop offset={0} stopColor="#ffb36b" stopOpacity={0.95} />
          <stop offset={0.45} stopColor={ARC_STOPS[3].color} stopOpacity={0.45} />
          <stop offset={1} stopColor={ARC_STOPS[3].color} stopOpacity={0} />
        </radialGradient>
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
            <rect x={O_CX - lineHalf} y={LINE_Y - 2.4 * U} width={lineHalf * 2} height={4.8 * U} fill="url(#lineGrad)" filter="url(#lineGlow)" opacity={0.8} />
            <rect x={O_CX - lineHalf} y={LINE_Y - 0.9 * U} width={lineHalf * 2} height={1.8 * U} fill="url(#lineGrad)" />
          </g>
        )}

        {/* ---------- WORDMARK: letters open from the flight line ---------- */}
        {LETTERS.map((l, i) => {
          const start = T.lettersStart + LETTER_ORDER[i] * 6;
          const t = ramp(frame, start, start + 20);
          if (t <= 0) return null;
          const e = easeOutCubic(t);
          const half = LETTER_HALF * e;
          const cx = (l.x0 + l.x1) / 2;
          const dx = (cx - O_CX) * 0.07 * (1 - easeOutCubic(ramp(frame, start, start + 30)));
          const blur = 3.2 * U * (1 - e);
          return (
            <g key={i} transform={`translate(${dx} 0)`}>
              <clipPath id={`lc${i}`}>
                <rect x={l.x0 - 6 * U} y={LINE_Y - half} width={l.x1 - l.x0 + 12 * U} height={half * 2} />
              </clipPath>
              <path d={l.d} fill={INK} clipPath={`url(#lc${i})`} opacity={0.35 + 0.65 * e} style={blur > 0.05 ? { filter: `blur(${blur}px)` } : undefined} />
            </g>
          );
        })}

        {/* ---------- TAGLINE: glyphs rise and settle, tracking in ---------- */}
        {TAGLINE.map((g, i) => {
          const start = T.taglineStart + i * 0.9;
          const t = ramp(frame, start, start + 16);
          if (t <= 0) return null;
          const e = easeOutCubic(t);
          const cx = (g.x0 + g.x1) / 2;
          const dx = (cx - TAG_CX) * 0.05 * (1 - easeOutCubic(ramp(frame, T.taglineStart, T.taglineStart + 40)));
          const dy = 12 * U * (1 - e);
          const blur = 2 * U * (1 - e);
          return (
            <path
              key={i}
              d={g.d}
              fill={INK}
              opacity={e}
              transform={`translate(${dx} ${dy})`}
              style={blur > 0.05 ? { filter: `blur(${blur}px)` } : undefined}
            />
          );
        })}

        {/* ---------- ® ---------- */}
        {regT > 0 && (
          <path
            d={REG.d}
            fill={REG_INK}
            opacity={easeOutCubic(regT)}
            transform={`translate(${REG_CX} ${REG_CY}) scale(${regScale}) translate(${-REG_CX} ${-REG_CY})`}
          />
        )}
        {sparkle > 0.01 && (
          <g opacity={sparkle * 0.85}>
            <ellipse cx={REG_CX} cy={REG_CY} rx={REG_R * 2.4} ry={REG_R * 0.12} fill="url(#sparkGrad)" />
            <ellipse cx={REG_CX} cy={REG_CY} rx={REG_R * 0.12} ry={REG_R * 1.6} fill="url(#sparkGrad)" />
          </g>
        )}

        {/* ---------- SHEEN ---------- */}
        {sheenOn && (
          <g mask="url(#arcMask)">
            <rect
              x={sheenX - 40 * U}
              y={ARC_BOUNDS.y0 - 20 * U}
              width={80 * U}
              height={ARC_BOUNDS.y1 - ARC_BOUNDS.y0 + 40 * U}
              fill="url(#sheenGrad)"
              opacity={0.5}
              transform={`translate(${sheenX} ${sheenCY}) skewX(-22) translate(${-sheenX} ${-sheenCY})`}
              style={{ mixBlendMode: "screen" }}
            />
          </g>
        )}

        {/* jet's luminous wake head on the arc */}
        {tracing && headP > 0 && headP < 1 && <HeadGlow frame={frame} />}
      </g>
    </svg>
  );
};

const HeadGlow: React.FC<{ frame: number }> = ({ frame }) => {
  const p = clamp01((sAtFrame(frame) - 15 - S_ARC_START) / (S_ARC_END - S_ARC_START));
  const { x, y } = pointOnArc(p);
  const flicker = 0.9 + 0.1 * Math.sin(frame * 1.7);
  return (
    <g style={{ mixBlendMode: "screen" }}>
      <ellipse cx={x} cy={y} rx={22 * U * flicker} ry={9 * U * flicker} fill="url(#headGrad)" opacity={0.85} />
      <circle cx={x} cy={y} r={3.2 * U} fill="#fffaf0" opacity={0.9} />
    </g>
  );
};
