import React, { useLayoutEffect, useMemo, useRef } from "react";
import { Img, staticFile } from "remotion";
import { ensureFonts, GREETING_FONT } from "../diwali/fonts";
import { clamp01, easeInOutCubic, easeSine, lerp } from "./camera";
import { FPS, H, W, pad2 } from "./data";
import PLANE from "./fxdata/plane-18.json";
import POINTS from "./fxdata/points.json";
import SEARCH from "./fxdata/search-04.json";
import { rng } from "./rng";
import type { DustCfg } from "./shots";

type Pt = number[]; // [x, y, score, ...]
const points = POINTS as unknown as Record<string, { sparkles?: Pt[]; lights?: Pt[]; map?: { markers: number[][]; origin: number[]; radius: number } }>;

/* ------------------------------------------------------------------ */
/*  Floating dust motes (screen space, additive)                       */
/* ------------------------------------------------------------------ */
type Mote = { x: number; y: number; vx: number; vy: number; r: number; ph: number; hz: number; a: number };

export const Dust: React.FC<{ f: number; seed: number; cfg: DustCfg }> = ({ f, seed, cfg }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const motes = useMemo<Mote[]>(() => {
    const r = rng(seed * 977 + 13);
    const [dx, dy] = cfg.drift ?? [0, 0];
    return Array.from({ length: cfg.count }, () => {
      const big = r() < 0.14; // a few out-of-focus bokeh motes
      return {
        x: r() * W,
        y: r() * H,
        vx: dx + (r() - 0.5) * 14,
        vy: dy + (r() - 0.5) * 10,
        r: big ? cfg.size[1] * (1.6 + r() * 1.6) : cfg.size[0] + r() * (cfg.size[1] - cfg.size[0]),
        ph: r(),
        hz: 0.12 + r() * 0.4,
        a: big ? 0.28 : 0.55 + r() * 0.45,
      };
    });
  }, [seed, cfg]);
  const sprite = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const [r, gg, b] = cfg.tint;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(255,255,255,1)`);
    grad.addColorStop(0.18, `rgba(${r},${gg},${b},0.95)`);
    grad.addColorStop(0.55, `rgba(${r},${gg},${b},0.25)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  }, [cfg]);

  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const t = f / FPS;
    for (const m of motes) {
      const x = (((m.x + m.vx * t) % W) + W) % W;
      const y = (((m.y + m.vy * t) % H) + H) % H;
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (m.hz * t + m.ph)));
      ctx.globalAlpha = Math.min(1, cfg.alpha * m.a * tw * 1.6);
      const s = m.r * 2.6;
      ctx.drawImage(sprite, x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }, [f, motes, sprite, cfg.alpha]);

  return <canvas ref={ref} width={W} height={H} style={{ position: "absolute", inset: 0, width: W, height: H, pointerEvents: "none" }} />;
};

/* ------------------------------------------------------------------ */
/*  Gold glint: a moving light band revealed only on the gold          */
/* ------------------------------------------------------------------ */
export const Glint: React.FC<{ n: number; t: number; sweeps: [number, number][] }> = ({ n, t, sweeps }) => {
  const active = sweeps.find(([at, dur]) => t >= at && t <= at + dur);
  if (!active) return null;
  const [at, dur] = active;
  const q = easeInOutCubic((t - at) / dur);
  const pos = lerp(-22, 122, q);
  const mask = `url(${staticFile(`sheru/fx/gold-${pad2(n)}.png`)})`;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        mixBlendMode: "screen",
        WebkitMaskImage: mask,
        maskImage: mask,
        WebkitMaskSize: "100% 100%",
        maskSize: "100% 100%",
        background: `linear-gradient(112deg, rgba(255,246,214,0) ${pos - 13}%, rgba(255,250,228,0.97) ${pos}%, rgba(255,246,214,0) ${pos + 13}%)`,
      }}
    />
  );
};

/* ------------------------------------------------------------------ */
/*  Sparkle stars on the gold's brightest highlights                   */
/* ------------------------------------------------------------------ */
const STAR = (s: number) => {
  const k = 0.07 * s;
  return `M0,${-s} Q${k},${-k} ${s},0 Q${k},${k} 0,${s} Q${-k},${k} ${-s},0 Q${-k},${-k} 0,${-s} Z`;
};

export const Sparkles: React.FC<{ n: number; t: number; count: number }> = ({ n, t, count }) => {
  const pts = (points[pad2(n)]?.sparkles ?? []).slice(0, count);
  const seeds = useMemo(() => {
    const r = rng(n * 131 + 7);
    return pts.map(() => ({ period: 1.5 + r() * 1.9, phase: r(), tilt: (r() - 0.5) * 24 }));
  }, [n, count]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, mixBlendMode: "screen", pointerEvents: "none" }}>
      <defs>
        <radialGradient id="spkGlow">
          <stop offset="0" stopColor="#fff8e0" stopOpacity="0.9" />
          <stop offset="0.4" stopColor="#ffd98c" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffc060" stopOpacity="0" />
        </radialGradient>
      </defs>
      {pts.map(([x, y, score], i) => {
        const sd = seeds[i];
        if (!sd) return null;
        const k = Math.pow(Math.max(0, Math.sin(2 * Math.PI * (t / sd.period + sd.phase))), 12);
        if (k < 0.03) return null;
        const base = 15 + 36 * clamp01(score * 2.4);
        const s = base * (0.35 + 0.65 * k);
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${sd.tilt})`} opacity={k}>
            <circle r={s * 0.62} fill="url(#spkGlow)" />
            <path d={STAR(s)} fill="#fff9e6" />
            <path d={STAR(s * 0.55)} fill="#fff3cf" transform="rotate(45)" />
          </g>
        );
      })}
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Twinkling lights (runway, windows, city, wing highlights)          */
/* ------------------------------------------------------------------ */
export const Lights: React.FC<{ n: number; t: number; count: number }> = ({ n, t, count }) => {
  const pts = (points[pad2(n)]?.lights ?? []).slice(0, count);
  const seeds = useMemo(() => {
    const r = rng(n * 53 + 3);
    return pts.map(() => ({ hz: 0.25 + r() * 0.9, phase: r() }));
  }, [n, count]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, mixBlendMode: "screen", pointerEvents: "none" }}>
      <defs>
        <radialGradient id="lightWarm">
          <stop offset="0" stopColor="#fff4d8" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#ffd596" stopOpacity="0.42" />
          <stop offset="1" stopColor="#ffc070" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lightCool">
          <stop offset="0" stopColor="#eaf3ff" stopOpacity="0.9" />
          <stop offset="0.4" stopColor="#a9cfff" stopOpacity="0.38" />
          <stop offset="1" stopColor="#7fb0ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {pts.map(([x, y, score, hue], i) => {
        const sd = seeds[i];
        if (!sd) return null;
        const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (sd.hz * t + sd.phase)));
        const rad = 14 + 30 * clamp01(score * 2.2);
        const cool = hue > 170 && hue < 270;
        return <circle key={i} cx={x} cy={y} r={rad * (0.8 + 0.5 * tw)} fill={cool ? "url(#lightCool)" : "url(#lightWarm)"} opacity={0.35 + 0.65 * tw} />;
      })}
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Mist that clears from the terminal (frame 10)                      */
/* ------------------------------------------------------------------ */
export const Haze: React.FC<{ t: number }> = ({ t }) => {
  const o = 1 - easeSine(clamp01(t / 3.2));
  if (o < 0.01) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        mixBlendMode: "screen",
        opacity: o * 0.8,
        background:
          "radial-gradient(ellipse 80% 55% at 70% 52%, rgba(255,226,198,0.55) 0%, rgba(200,172,226,0.38) 45%, rgba(150,140,205,0) 82%), linear-gradient(180deg, rgba(190,170,215,0.0) 0%, rgba(200,180,225,0.22) 60%, rgba(190,170,215,0.0) 100%)",
      }}
    />
  );
};

/* ------------------------------------------------------------------ */
/*  Frame 04: the search bar types the guard's task                    */
/* ------------------------------------------------------------------ */
const QUERY = "best aviation college in India";
const TYPE_START = 0.55;
const TYPE_DUR = 2.1;
// human-ish pacing: a deterministic jitter per character
const typedAt = (i: number) => TYPE_START + TYPE_DUR * Math.pow(i / QUERY.length, 0.92) + 0.045 * Math.sin(i * 12.9898) ;

export const SearchTyping: React.FC<{ t: number }> = ({ t }) => {
  ensureFonts();
  const count = QUERY.split("").reduce((c, _, i) => (t >= typedAt(i) ? c + 1 : c), 0);
  const typing = count < QUERY.length;
  const cursorOn = typing || Math.floor(t * 2.4) % 2 === 0;
  const { cursor, textX, baseline, fontPx, fill, ink } = SEARCH;
  const top = baseline - 0.8585 * fontPx;
  return (
    <>
      {/* cover the cursor that is baked into the still, then draw our own */}
      <div
        style={{
          position: "absolute",
          left: cursor.x0 - 5,
          top: cursor.y0 - 4,
          width: cursor.x1 - cursor.x0 + 10,
          height: cursor.y1 - cursor.y0 + 8,
          background: fill,
          borderRadius: 8,
          filter: "blur(1.4px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: textX,
          top,
          fontFamily: `'${GREETING_FONT}', 'Liberation Sans', Arial, sans-serif`,
          fontWeight: 500,
          fontSize: fontPx,
          lineHeight: 1,
          whiteSpace: "pre",
          color: ink,
          letterSpacing: "0.005em",
        }}
      >
        {QUERY.slice(0, count)}
        <span style={{ display: "inline-block", width: 3, height: fontPx * 1.2, marginLeft: 2, verticalAlign: "-0.22em", background: ink, opacity: cursorOn ? 0.9 : 0 }} />
      </div>
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Frames 07-09: the map lights up from the monument outwards         */
/* ------------------------------------------------------------------ */
const WAVES: Record<number, [at: number, dur: number][]> = { 7: [[0.9, 1.4]], 8: [[0.4, 1.7], [2.4, 1.5]], 9: [[0.5, 1.7], [2.9, 1.5]] };

export const MapLightUp: React.FC<{ n: 7 | 8 | 9; t: number }> = ({ n, t }) => {
  const m = points[pad2(n)]?.map;
  if (!m) return null;
  const [ox, oy] = m.origin;
  const dists = m.markers.map(([x, y]) => Math.hypot(x - ox, y - oy));
  const rMax = Math.max(...dists) + 140;
  const waves = WAVES[n];
  const mask = `url(${staticFile(`sheru/fx/gold-${pad2(n)}.png`)})`;
  const active = waves.find(([at, dur]) => t >= at && t <= at + dur + 0.2);
  const wave = active ? easeSine((t - active[0]) / active[1]) : 0;
  const R = wave * rMax;
  const band = 120;
  const fade = active ? clamp01(1 - Math.max(0, (t - active[0] - active[1]) / 0.2)) : 0;
  return (
    <>
      {active && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            mixBlendMode: "screen",
            opacity: fade,
            WebkitMaskImage: mask,
            maskImage: mask,
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
            background: `radial-gradient(circle at ${ox}px ${oy}px, rgba(255,240,190,0) ${Math.max(0, R - band)}px, rgba(255,247,214,1) ${R}px, rgba(255,240,190,0) ${R + band * 0.5}px)`,
          }}
        />
      )}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, mixBlendMode: "screen", pointerEvents: "none" }}>
        <defs>
          <radialGradient id={`mk${n}`}>
            <stop offset="0" stopColor="#fffbe8" stopOpacity="1" />
            <stop offset="0.3" stopColor="#ffe19a" stopOpacity="0.7" />
            <stop offset="1" stopColor="#ffb54a" stopOpacity="0" />
          </radialGradient>
        </defs>
        {m.markers.map(([x, y], i) => {
          const first = waves[0];
          const ta = first[0] + (dists[i] / rMax) * first[1];
          const d = t - ta;
          const burst = d > -0.05 ? Math.exp(-Math.pow(Math.max(0, d) / 0.3, 2)) : 0;
          const idle = d > 0 ? 0.32 + 0.14 * Math.sin(t * 3.1 + i * 2) : 0;
          const u = clamp01(d / 1.0);
          const ring = d > 0 && d < 1.0;
          const k = Math.max(burst, idle);
          return (
            <g key={i}>
              {k > 0.01 && <circle cx={x} cy={y} r={m.radius * (1.1 + 1.5 * burst)} fill={`url(#mk${n})`} opacity={Math.min(1, k * 1.1)} />}
              {ring && <circle cx={x} cy={y} r={m.radius * (0.8 + 2.3 * easeSine(u))} fill="none" stroke="#ffe9b0" strokeWidth={3.5 * (1 - u)} opacity={0.9 * (1 - u)} />}
            </g>
          );
        })}
      </svg>
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Frame 18: the real airliner climbs away, leaving its contrail      */
/* ------------------------------------------------------------------ */
const CLIMB_DEG = -17; // heading of the climb on screen (nose up-right)
const CLIMB_PX = 84;
const TAIL0 = { x: 522, y: 440 }; // tail cone of the airliner as seen in the still

export const PlaneClimb: React.FC<{ t: number }> = ({ t }) => {
  const [bx0, by0, bx1, by1] = PLANE.box;
  const [cx, cy] = PLANE.center;
  const u = easeSine(clamp01((t + 0.15) / 2.9));
  const dist = CLIMB_PX * u;
  const a = (CLIMB_DEG * Math.PI) / 180;
  const dx = Math.cos(a) * dist;
  const dy = Math.sin(a) * dist;
  const sc = 1 - 0.05 * u;
  const rot = -1.8 * u;
  const origin = `${cx - bx0}px ${cy - by0}px`;
  // where the tail cone ends up after the same move
  const vx = TAIL0.x - cx;
  const vy = TAIL0.y - cy;
  const ra = (rot * Math.PI) / 180;
  const tailX = cx + sc * (vx * Math.cos(ra) - vy * Math.sin(ra)) + dx;
  const tailY = cy + sc * (vx * Math.sin(ra) + vy * Math.cos(ra)) + dy;
  const trailOp = clamp01(dist / 10) * 0.62;
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  return (
    <>
      <Img
        src={staticFile("sheru/fx/plane-18-patch.png")}
        style={{ position: "absolute", left: bx0, top: by0, width: bx1 - bx0, height: by1 - by0, opacity: clamp01(dist / 4) }}
      />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, pointerEvents: "none", filter: "blur(2.2px)" }}>
        <defs>
          <linearGradient id="trail" gradientUnits="userSpaceOnUse" x1={TAIL0.x} y1={TAIL0.y} x2={tailX} y2={tailY}>
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.15" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.95" />
          </linearGradient>
        </defs>
        {[-1, 1].map((side) => (
          <line
            key={side}
            x1={TAIL0.x + nx * side * 5}
            y1={TAIL0.y + ny * side * 5}
            x2={tailX + nx * side * 5}
            y2={tailY + ny * side * 5}
            stroke="url(#trail)"
            strokeWidth={5.5}
            strokeLinecap="round"
            opacity={trailOp}
          />
        ))}
      </svg>
      <Img
        src={staticFile("sheru/fx/plane-18.png")}
        style={{
          position: "absolute",
          left: bx0,
          top: by0,
          width: bx1 - bx0,
          height: by1 - by0,
          transformOrigin: origin,
          transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${rot.toFixed(3)}deg) scale(${sc.toFixed(4)})`,
        }}
      />
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Screen-space finishing                                             */
/* ------------------------------------------------------------------ */
export const Vignette: React.FC<{ amount: number }> = ({ amount }) =>
  amount <= 0 ? null : (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: `radial-gradient(ellipse 78% 72% at 50% 48%, rgba(0,0,0,0) 56%, rgba(10,5,2,${amount}) 100%)`,
      }}
    />
  );
