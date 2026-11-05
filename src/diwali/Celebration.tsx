import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { fireworkLight, prng, skyOffset } from "./fireworks";
import { D_FPS, D_HEIGHT, D_WIDTH, DT, TILT_DISTANCE } from "./timeline";

/**
 * Scene 02 — five aviation professionals on the academy terrace, seen from
 * behind as they watch the display. Figures are built procedurally from
 * anatomical proportions and lit by the fireworks (rim light) and by warm
 * festoon lights behind the camera (fill).
 */

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* ------------------------------------------------------------------ */
/*  Sky backdrop (sits under the fireworks layer)                      */
/* ------------------------------------------------------------------ */
const STARS = (() => {
  const r = prng(90);
  return Array.from({ length: 160 }, () => ({ x: r() * D_WIDTH, y: r() * D_HEIGHT, r: 0.6 + r() * 1.1, a: 0.25 + r() * 0.55 }));
})();

export const NightSkyBackdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const fl = fireworkLight(frame);
  const oy = skyOffset(frame); // −1100 → 0 through the tilt
  // horizon glow sits low in scene 02 and slides off the bottom during the tilt-up
  const horizonY = 1450 + TILT_DISTANCE + oy;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, #02040e 0%, #050a1f 45%, #0a1230 70%, #141633 100%)" }} />
      <svg width={D_WIDTH} height={D_HEIGHT} style={{ position: "absolute", inset: 0 }}>
        {STARS.map((st, i) => (
          <circle key={i} cx={st.x} cy={(((st.y + oy * 0.35) % D_HEIGHT) + D_HEIGHT) % D_HEIGHT} r={st.r} fill="#dfe6ff" opacity={st.a * (0.6 + 0.4 * Math.sin(frame * 0.2 + i))} />
        ))}
      </svg>
      <div
        style={{
          position: "absolute",
          left: -200,
          right: -200,
          top: horizonY - 420,
          height: 700,
          background: "radial-gradient(ellipse at 50% 60%, rgba(255,140,60,0.28) 0%, rgba(255,120,50,0.10) 35%, rgba(0,0,0,0) 70%)",
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at ${(fl.x / D_WIDTH) * 100}% 30%, rgba(255,${190 - fl.warmth * 40},120,${0.16 * fl.intensity}) 0%, rgba(0,0,0,0) 65%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/*  Figure geometry (local units: 1 = full standing height)            */
/* ------------------------------------------------------------------ */
type Kind = "pilot" | "crew" | "pro";
type FigureSpec = { kind: Kind; x: number; y: number; h: number; phase: number; point?: boolean; laugh?: number; turn?: number };

const torsoPath = (female: boolean) => {
  const sh = female ? 0.09 : 0.124; // shoulder half-width
  const wa = female ? 0.058 : 0.086; // waist
  const hi = female ? 0.1 : 0.096; // hip
  const nk = female ? 0.021 : 0.027;
  const P = (x: number, y: number) => `${x.toFixed(4)} ${y.toFixed(4)}`;
  const side = (s: number) => [
    `C ${P(s * nk * 1.05, 0.15)} ${P(s * (sh * 0.55), 0.163)} ${P(s * (sh * 0.86), 0.172)}`,
    `C ${P(s * (sh * 1.02), 0.178)} ${P(s * (sh * 1.06), 0.2)} ${P(s * (sh * 1.02), 0.228)}`,
    `C ${P(s * (sh * 0.95), 0.27)} ${P(s * (wa * 1.08), 0.33)} ${P(s * wa, 0.41)}`,
    `C ${P(s * (wa * 1.02), 0.45)} ${P(s * hi, 0.49)} ${P(s * hi, 0.53)}`,
  ];
  if (female) {
    // pencil skirt to the knee, then slim legs
    return [
      `M ${P(-nk, 0.118)}`,
      ...side(-1),
      `C ${P(-hi * 0.98, 0.58)} ${P(-0.088, 0.63)} ${P(-0.082, 0.665)}`,
      `L ${P(-0.05, 0.665)} L ${P(-0.046, 1.0)} L ${P(-0.012, 1.0)} L ${P(-0.012, 0.67)} L ${P(0.012, 0.67)} L ${P(0.012, 1.0)} L ${P(0.046, 1.0)} L ${P(0.05, 0.665)}`,
      `L ${P(0.082, 0.665)} C ${P(0.088, 0.63)} ${P(hi * 0.98, 0.58)} ${P(hi, 0.53)}`,
      `C ${P(hi, 0.49)} ${P(wa * 1.02, 0.45)} ${P(wa, 0.41)}`,
      `C ${P(wa * 1.08, 0.33)} ${P(sh * 0.95, 0.27)} ${P(sh * 1.02, 0.228)}`,
      `C ${P(sh * 1.06, 0.2)} ${P(sh * 1.02, 0.178)} ${P(sh * 0.86, 0.172)}`,
      `C ${P(sh * 0.55, 0.163)} ${P(nk * 1.05, 0.15)} ${P(nk, 0.118)} Z`,
    ].join(" ");
  }
  return [
    `M ${P(-nk, 0.118)}`,
    ...side(-1),
    `L ${P(-hi * 0.98, 0.78)} L ${P(-0.075, 1.0)} L ${P(-0.01, 1.0)} L ${P(-0.008, 0.56)} L ${P(0.008, 0.56)} L ${P(0.01, 1.0)} L ${P(0.075, 1.0)} L ${P(hi * 0.98, 0.78)}`,
    `L ${P(hi, 0.53)} C ${P(hi, 0.49)} ${P(wa * 1.02, 0.45)} ${P(wa, 0.41)}`,
    `C ${P(wa * 1.08, 0.33)} ${P(sh * 0.95, 0.27)} ${P(sh * 1.02, 0.228)}`,
    `C ${P(sh * 1.06, 0.2)} ${P(sh * 1.02, 0.178)} ${P(sh * 0.86, 0.172)}`,
    `C ${P(sh * 0.55, 0.163)} ${P(nk * 1.05, 0.15)} ${P(nk, 0.118)} Z`,
  ].join(" ");
};

/** arm as a tapered stroke: shoulder → elbow → wrist */
const armPath = (pts: [number, number][]) => `M ${pts.map(([x, y]) => `${x} ${y}`).join(" L ")}`;

const Figure: React.FC<{ spec: FigureSpec; frame: number; rim: { i: number; x: number; warm: number } }> = ({ spec, frame, rim }) => {
  const t = (frame - DT.s2Start) / D_FPS;
  const female = spec.kind === "crew";
  const sway = Math.sin(t * 1.4 + spec.phase) * 0.004;
  // laughter: quick shoulder/head bobs inside a time window
  const laughT = spec.laugh !== undefined ? clamp01(1 - Math.abs(t - spec.laugh) / 0.6) : 0;
  const bob = Math.sin(t * 30) * 0.004 * laughT;
  const headTilt = Math.sin(t * 0.9 + spec.phase) * 2.5 + (spec.turn ?? 0) * smooth(clamp01((t - 0.9) / 0.6)) * 12 + laughT * 4;
  const sh = female ? 0.09 : 0.124;
  const id = `fig${spec.x}`;

  // arms
  const raise = spec.point ? smooth(clamp01((t - 0.55) / 0.5)) : 0;
  const armL: [number, number][] = [
    [-sh * 0.88, 0.2],
    [-sh * 1.08 - 0.004, 0.355],
    [-sh * 1.0, 0.5],
  ];
  const armRrest: [number, number][] = [
    [sh * 0.88, 0.2],
    [sh * 1.08 + 0.004, 0.355],
    [sh * 1.0, 0.5],
  ];
  const armRup: [number, number][] = [
    [sh * 0.88, 0.2],
    [sh * 1.25, 0.075],
    [sh * 1.5, -0.075],
  ];
  const armR = armRrest.map(([x, y], i) => [x + (armRup[i][0] - x) * raise, y + (armRup[i][1] - y) * raise] as [number, number]);
  const handR = armR[2];

  // palette (backs are in shadow; warm fill from festoons behind camera)
  const ink = "#0b0b10";
  const shirt = "#3d3935";
  const skin = "#2e1f19";
  const hair = "#060608";
  const orange = "#F58220";
  const torsoFill = spec.kind === "pilot" ? `url(#shirt-${id})` : ink;

  // rim light colour + direction (from the active bursts)
  const rimCol = `rgb(255,${Math.round(205 - rim.warm * 45)},${Math.round(150 - rim.warm * 70)})`;
  const dir = Math.sign(rim.x - spec.x) || 1;
  const rimA = Math.min(1, 0.25 + rim.i * 0.9);

  const body = (fill: string, hairFill: string, skinFill: string, details: boolean) => (
    <>
      {/* arms behind torso edges */}
      <path d={armPath(armL)} stroke={fill === "RIM" ? rimCol : ink} strokeWidth={0.05} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d={armPath(armR)} stroke={fill === "RIM" ? rimCol : ink} strokeWidth={0.048 - 0.012 * raise} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {spec.kind === "pilot" && fill !== "RIM" && (
        // short sleeves of the white shirt over the upper arms
        <>
          <path d={armPath(armL.slice(0, 2).map(([x, y], i) => (i === 1 ? [x * 0.97, 0.29] : [x, y]) as [number, number]))} stroke={`url(#shirt-${id})`} strokeWidth={0.056} strokeLinecap="round" fill="none" />
          <path d={armPath([armR[0], [armR[0][0] + (armR[1][0] - armR[0][0]) * 0.55, armR[0][1] + (armR[1][1] - armR[0][1]) * 0.55]])} stroke={`url(#shirt-${id})`} strokeWidth={0.054} strokeLinecap="round" fill="none" />
        </>
      )}
      {/* hands */}
      <circle cx={armL[2][0]} cy={armL[2][1] + 0.02} r={0.022} fill={fill === "RIM" ? rimCol : skinFill} />
      <circle cx={handR[0]} cy={handR[1] + (raise > 0.5 ? -0.015 : 0.02)} r={0.022} fill={fill === "RIM" ? rimCol : skinFill} />
      {/* torso + legs */}
      <path d={torsoPath(female)} fill={fill === "RIM" ? rimCol : fill} />
      {/* neck */}
      <rect x={female ? -0.019 : -0.024} y={0.1} width={female ? 0.038 : 0.048} height={0.06} rx={0.012} fill={fill === "RIM" ? rimCol : skinFill} />
      {/* head (+ hair) */}
      <g transform={`rotate(${headTilt} 0 0.14)`}>
        <ellipse cx={0} cy={0.066} rx={female ? 0.043 : 0.047} ry={0.062} fill={fill === "RIM" ? rimCol : hairFill} />
        {female && (
          <>
            {/* swept-back hair with a high chignon — reads in silhouette */}
            <ellipse cx={0} cy={0.006} rx={0.03} ry={0.026} fill={fill === "RIM" ? rimCol : hairFill} />
            <ellipse cx={0} cy={0.06} rx={0.047} ry={0.058} fill={fill === "RIM" ? rimCol : hairFill} />
          </>
        )}
        {spec.kind === "pilot" && (
          <>
            <ellipse cx={0} cy={0.012} rx={0.062} ry={0.024} fill={fill === "RIM" ? rimCol : ink} />
            <rect x={-0.05} y={0.012} width={0.1} height={0.032} rx={0.006} fill={fill === "RIM" ? rimCol : "#111"} />
            {details && <rect x={-0.05} y={0.036} width={0.1} height={0.006} fill="#b8975a" opacity={0.8} />}
          </>
        )}
        {/* ears */}
        <ellipse cx={female ? -0.043 : -0.048} cy={0.075} rx={0.009} ry={0.016} fill={fill === "RIM" ? rimCol : skinFill} />
        <ellipse cx={female ? 0.043 : 0.048} cy={0.075} rx={0.009} ry={0.016} fill={fill === "RIM" ? rimCol : skinFill} />
      </g>
      {details && (
        <>
          {/* collar / scarf */}
          {female && <path d="M -0.03 0.152 Q 0 0.166 0.03 0.152" stroke={orange} strokeWidth={0.008} fill="none" />}
          {spec.kind === "pro" && <path d="M -0.034 0.15 Q 0 0.162 0.034 0.15" stroke={orange} strokeWidth={0.004} fill="none" />}
          {spec.kind === "pilot" && <path d="M -0.032 0.148 Q 0 0.16 0.032 0.148" stroke="#e9e4dc" strokeWidth={0.006} fill="none" opacity={0.6} />}
          {/* orange piping on jacket hems / back seams */}
          {(female || spec.kind === "pro") && (
            <>
              <path d={female ? "M -0.094 0.47 Q 0 0.485 0.094 0.47" : "M -0.096 0.54 Q 0 0.552 0.096 0.54"} stroke={orange} strokeWidth={0.004} fill="none" opacity={0.85} />
              {spec.kind === "pro" && <path d="M 0 0.42 L 0 0.54" stroke={orange} strokeWidth={0.0025} opacity={0.6} />}
            </>
          )}
          {/* pilot epaulettes (gold bars) + belt */}
          {spec.kind === "pilot" && (
            <>
              {[-1, 1].map((s) => (
                <g key={s}>
                  <path d={`M ${s * 0.058} 0.168 L ${s * 0.112} 0.176`} stroke="#121318" strokeWidth={0.016} strokeLinecap="round" />
                  {[0, 1, 2, 3].map((k) => (
                    <path key={k} d={`M ${s * (0.092 - k * 0.008)} 0.169 L ${s * (0.092 - k * 0.008)} 0.18`} stroke="#d9b45a" strokeWidth={0.0026} />
                  ))}
                </g>
              ))}
              <rect x={-0.088} y={0.47} width={0.176} height={0.012} fill="#0c0c10" />
            </>
          )}
        </>
      )}
    </>
  );

  return (
    <g transform={`translate(${spec.x + sway * spec.h} ${spec.y + bob * spec.h}) scale(${spec.h})`}>
      <defs>
        <linearGradient id={`shirt-${id}`} x1="0" y1="0.15" x2="0" y2="0.55" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={shirt} />
          <stop offset="1" stopColor="#1d1b19" />
        </linearGradient>
        <linearGradient id={`rimFade-${id}`} x1="0" y1="-0.1" x2="0" y2="0.5" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.45" stopColor="#fff" stopOpacity={0.55} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <mask id={`rimMask-${id}`} maskUnits="userSpaceOnUse" x={-0.5} y={-0.3} width={1} height={1.5}>
          <rect x={-0.5} y={-0.3} width={1} height={1.5} fill={`url(#rimFade-${id})`} />
        </mask>
      </defs>
      {/* rim pass: full silhouette in rim colour, then the lit body offset away from the light */}
      <g opacity={rimA} mask={`url(#rimMask-${id})`}>{body("RIM", "", "", false)}</g>
      <g transform={`translate(${-dir * 0.0018} ${0.003})`}>{body(torsoFill, hair, skin, true)}</g>
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Terrace dressing: parapet, marigold garlands, diyas, skyline       */
/* ------------------------------------------------------------------ */
const Diya: React.FC<{ x: number; y: number; s: number; frame: number; seed: number }> = ({ x, y, s, frame, seed }) => {
  const flick = 0.85 + 0.15 * Math.sin(frame * 1.3 + seed * 7) * Math.sin(frame * 0.7 + seed * 3);
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx={0} cy={-6} rx={46 * flick} ry={40 * flick} fill="url(#diyaGlow)" />
      <path d="M -14 0 Q 0 9 14 0 L 11 -4 Q 0 -1 -11 -4 Z" fill="#6b3414" />
      <path d="M -14 0 Q 0 9 14 0" stroke="#c0662a" strokeWidth={1.2} fill="none" />
      <path d={`M 0 -4 C ${-4 * flick} -9 ${-2} -16 0 ${-20 - 3 * flick} C 2 -16 ${4 * flick} -9 0 -4 Z`} fill="url(#flame)" />
    </g>
  );
};

const Garland: React.FC<{ x0: number; x1: number; y: number; sag: number; seed: number }> = ({ x0, x1, y, sag, seed }) => {
  const r = prng(seed);
  const beads: React.ReactNode[] = [];
  const n = Math.round((x1 - x0) / 9);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const yy = y + Math.sin(t * Math.PI) * sag;
    const c = r() < 0.6 ? "#F58220" : r() < 0.7 ? "#ffb21e" : "#d9531c";
    beads.push(<circle key={i} cx={x} cy={yy} r={6 + r() * 1.5} fill={c} />);
    beads.push(<circle key={`h${i}`} cx={x - 1.5} cy={yy - 2} r={2.2} fill="#ffd27a" opacity={0.55} />);
  }
  return <g>{beads}</g>;
};

const Skyline: React.FC<{ frame: number }> = ({ frame }) => {
  const r = prng(3);
  const blocks: React.ReactNode[] = [];
  const lights: React.ReactNode[] = [];
  let x = -40;
  let k = 0;
  while (x < D_WIDTH + 40) {
    const w = 60 + r() * 120;
    const h = 40 + r() * 120;
    const top = 1250 - h;
    blocks.push(<rect key={k} x={x} y={top} width={w} height={h + 20} fill="#090a12" />);
    // windows
    for (let wy = top + 10; wy < 1240; wy += 16)
      for (let wx = x + 8; wx < x + w - 8; wx += 14)
        if (r() < 0.45) lights.push(<rect key={`w${k}-${wx}-${wy}`} x={wx} y={wy} width={6} height={8} fill={r() < 0.8 ? "#ffb35a" : "#cfe1ff"} opacity={0.5 + r() * 0.4} />);
    // Diwali string along the roof
    for (let sx = x; sx < x + w; sx += 7) {
      const tw = 0.55 + 0.45 * Math.sin(frame * 0.4 + sx * 0.3) ** 2;
      lights.push(<circle key={`s${k}-${sx}`} cx={sx} cy={top + 1} r={1.8} fill={r() < 0.8 ? "#ffc45a" : "#ff8a2a"} opacity={tw} />);
    }
    x += w + 10 + r() * 40;
    k++;
  }
  // control tower + palms
  const palms = [70, 300, 610, 880, 1010].map((px, i) => (
    <g key={`p${i}`} transform={`translate(${px} 1250) scale(${0.9 + (i % 3) * 0.15})`} fill="#06070c">
      <path d="M -3 0 C -2 -60 4 -110 10 -150 L 14 -150 C 9 -110 4 -60 5 0 Z" />
      {Array.from({ length: 9 }, (_, j) => {
        const a = (j / 9) * Math.PI * 2;
        const dx = Math.cos(a) * 52;
        const dy = Math.sin(a) * 18 - 8;
        return <path key={j} d={`M 12 -152 Q ${12 + dx * 0.6} ${-170 + dy - 14} ${12 + dx} ${-150 + dy + 20} Q ${12 + dx * 0.55} ${-160 + dy} 12 -150 Z`} />;
      })}
    </g>
  ));
  return (
    <g>
      {/* runway light line at the horizon */}
      {Array.from({ length: 50 }, (_, i) => (
        <circle key={`r${i}`} cx={i * 23} cy={1262} r={1.4} fill="#fff1c8" opacity={0.8} />
      ))}
      <g transform="translate(760 1250)" fill="#090a12">
        <rect x={-9} y={-210} width={18} height={210} />
        <path d="M -30 -230 L 30 -230 L 22 -205 L -22 -205 Z" />
        <rect x={-26} y={-228} width={52} height={18} fill="#2b4a63" opacity={0.7} />
        <circle cx={0} cy={-240} r={3} fill="#ff2a2a" opacity={frame % 24 < 12 ? 1 : 0.15} />
      </g>
      {blocks}
      {lights}
      {palms}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Scene                                                              */
/* ------------------------------------------------------------------ */
const FIGURES: FigureSpec[] = [
  { kind: "crew", x: 168, y: 1262, h: 860, phase: 0.3, point: true },
  { kind: "pro", x: 352, y: 1236, h: 920, phase: 1.7, laugh: 1.6 },
  { kind: "pilot", x: 545, y: 1218, h: 955, phase: 2.5, turn: -1 },
  { kind: "crew", x: 735, y: 1250, h: 880, phase: 3.1, laugh: 1.7 },
  { kind: "crew", x: 912, y: 1270, h: 850, phase: 4.2 },
];
// draw outer figures first so the centre group overlaps them
const DRAW_ORDER = [0, 4, 1, 3, 2];

export const Celebration: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < DT.s2Start - 2 || frame > DT.tiltEnd + 2) return null;
  const t = (frame - DT.s2Start) / (DT.tiltStart - DT.s2Start);
  const fl = fireworkLight(frame);
  const shift = TILT_DISTANCE + skyOffset(frame); // foreground slides down as the camera tilts up
  const tiltSpeed = Math.abs(skyOffset(frame + 1) - skyOffset(frame));
  // slow dolly-in with parallax
  const push = 1 + 0.06 * smooth(clamp01(t));
  const drift = -18 + 36 * smooth(clamp01(t));
  const rim = { i: fl.intensity, x: fl.x, warm: fl.warmth };
  const parallax = (k: number) => `translate(${D_WIDTH / 2 + drift * k} ${D_HEIGHT * 0.62 + shift * (0.85 + 0.15 * k)}) scale(${1 + (push - 1) * k}) translate(${-D_WIDTH / 2} ${-D_HEIGHT * 0.62})`;
  const vblur = Math.min(14, tiltSpeed * 0.35);

  return (
    <AbsoluteFill style={{ filter: vblur > 0.3 ? `url(#tiltBlur)` : undefined }}>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id="tiltBlur" x="-5%" y="-20%" width="110%" height="140%">
          <feGaussianBlur stdDeviation={`0 ${vblur}`} />
        </filter>
      </svg>
      <svg width={D_WIDTH} height={D_HEIGHT} viewBox={`0 0 ${D_WIDTH} ${D_HEIGHT}`} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="diyaGlow">
            <stop offset="0" stopColor="#ffb347" stopOpacity={0.75} />
            <stop offset="0.35" stopColor="#ff8a2a" stopOpacity={0.25} />
            <stop offset="1" stopColor="#ff7a1a" stopOpacity={0} />
          </radialGradient>
          <linearGradient id="flame" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff6d0" />
            <stop offset="0.5" stopColor="#ffc14d" />
            <stop offset="1" stopColor="#ff6a00" />
          </linearGradient>
          <linearGradient id="parapet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a2a22" />
            <stop offset="0.08" stopColor="#1a1412" />
            <stop offset="1" stopColor="#0b0909" />
          </linearGradient>
          <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a2a3a" stopOpacity={0} />
            <stop offset="0.6" stopColor="#5a3a32" stopOpacity={0.35} />
            <stop offset="1" stopColor="#2a1a16" stopOpacity={0.1} />
          </linearGradient>
          <filter id="soft">
            <feGaussianBlur stdDeviation={2.2} />
          </filter>
        </defs>
        {/* distant academy skyline — slightly defocused */}
        <g transform={parallax(0.3)} filter="url(#soft)">
          <g transform="translate(0 210)">
            <Skyline frame={frame} />
          </g>
        </g>
        {/* atmospheric haze between the group and the skyline */}
        <rect x={0} y={1180} width={D_WIDTH} height={420} fill="url(#haze)" transform={`translate(0 ${shift})`} />
        {/* terrace parapet with garlands and diyas */}
        <g transform={parallax(0.7)}>
          <rect x={-60} y={1590} width={D_WIDTH + 120} height={400} fill="url(#parapet)" />
          <rect x={-60} y={1583} width={D_WIDTH + 120} height={8} fill="#4a3426" />
          <Garland x0={-40} x1={360} y={1600} sag={26} seed={1} />
          <Garland x0={360} x1={740} y={1600} sag={22} seed={2} />
          <Garland x0={740} x1={1120} y={1600} sag={26} seed={3} />
          {Array.from({ length: 15 }, (_, i) => (
            <Diya key={i} x={10 + i * 76} y={1582} s={0.8} frame={frame} seed={i} />
          ))}
        </g>
        {/* the five */}
        <g transform={parallax(1)}>
          {DRAW_ORDER.map((i) => (
            <Figure key={i} spec={FIGURES[i]} frame={frame} rim={rim} />
          ))}
        </g>
      </svg>
      {/* foreground festoon bokeh (very shallow depth of field) */}
      <div style={{ position: "absolute", inset: 0, transform: `translate(${drift * 1.6}px, ${shift * 1.2}px)`, filter: "blur(14px)" }}>
        {Array.from({ length: 11 }, (_, i) => {
          const x = -40 + i * 115;
          const y = 120 + Math.sin((i / 10) * Math.PI) * 150;
          const tw = 0.7 + 0.3 * Math.sin(frame * 0.25 + i * 1.7);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x - 46,
                top: y - 46,
                width: 92,
                height: 92,
                borderRadius: "50%",
                background: i % 3 === 0 ? "rgba(255,138,42,0.55)" : "rgba(255,196,90,0.55)",
                opacity: tw,
              }}
            />
          );
        })}
      </div>
      {/* warm fill + grade */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(255,170,90,0.10) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(20,8,0,0.35) 100%)", opacity: 1 - clamp01(shift / 400) }} />
    </AbsoluteFill>
  );
};
